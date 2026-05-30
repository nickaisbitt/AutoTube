import type { IncomingMessage, ServerResponse } from "http";
import { spawn } from "child_process";
import { join, dirname } from "path";
import { readFileSync, existsSync, readdirSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Project root is two levels up from server/routes/
const PROJECT_ROOT = join(__dirname, "..", "..");

/**
 * POST /api/server-render
 * Full server-side render (node-canvas + edge-tts + ffmpeg).
 * Spawns server-render.mjs as a child process. The project must
 * already be saved to /tmp/autotube-project.json (via /api/save-project).
 * Returns SSE progress events and the final file path on success.
 */
export async function handleServerRender(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const outputDir = process.env.RAILWAY_VOLUME_MOUNT_PATH || "/app/data/autotube-output";
  mkdirSync(outputDir, { recursive: true });
  const outputMp4 = join(outputDir, `server-render-${Date.now()}.mp4`);

  // Ensure the project is saved before spawning
  if (!existsSync("/tmp/autotube-project.json")) {
    const tmpFiles = readdirSync("/tmp").filter(
      (f: string) => f.startsWith("autotube-project") && f.endsWith(".json"),
    );
    if (tmpFiles.length === 0) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "No project saved. Call /api/save-project first.",
        }),
      );
      return;
    }
  }

  // Set SSE headers for progress streaming
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");

  const sendEvent = (data: Record<string, unknown>) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  sendEvent({ type: "progress", message: "Starting server-side render...", pct: 0 });

  // Send heartbeat every 30s to keep the SSE connection alive
  const heartbeat = setInterval(() => {
    try {
      sendEvent({ type: "heartbeat" });
    } catch {
      clearInterval(heartbeat);
    }
  }, 30000);

  // Load VITE_* env vars from .env.local for the child process
  const envVars: Record<string, string> = {};
  try {
    const envContent = readFileSync(join(PROJECT_ROOT, ".env.local"), "utf8");
    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        if (key.startsWith("VITE_")) {
          envVars[key] = val;
          if (key === "VITE_OPENROUTER_KEY") {
            envVars["OPENROUTER_API_KEY"] = val;
          }
        }
      }
    }
  } catch {
    /* .env.local may not exist */
  }

  // Fallback to process.env for production (Railway sets env vars, not .env.local)
  if (!envVars["VITE_OPENROUTER_KEY"]) {
    const key = process.env.VITE_OPENROUTER_KEY || process.env.OPENROUTER_API_KEY || "";
    if (key) {
      envVars["VITE_OPENROUTER_KEY"] = key;
      envVars["OPENROUTER_API_KEY"] = key;
    }
  }

  // Determine the dev server URL from the incoming request
  const host = req.headers.host || 'localhost:5173';
  const protocol = 'http';
  const devServerUrl = `${protocol}://${host}`;

  const child = spawn("node", ["server-render/index.mjs", outputMp4], {
    cwd: PROJECT_ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...envVars, DEV_SERVER_URL: devServerUrl },
  });

  let stderr = "";
  child.stdout.on("data", (data: Buffer) => {
    const line = data.toString().trim();
    if (!line) return;
    // Parse progress from server-render.mjs stdout
    const segMatch = line.match(/Segment (\d+)\/(\d+)/);
    if (segMatch) {
      const pct = Math.round(
        (parseInt(segMatch[1]) / parseInt(segMatch[2])) * 80,
      );
      sendEvent({ type: "progress", message: line, pct });
    } else if (line.includes("Generating narration")) {
      sendEvent({ type: "progress", message: line, pct: 82 });
    } else if (line.includes("Muxing")) {
      sendEvent({ type: "progress", message: line, pct: 90 });
    } else if (line.includes("Autonomous AI Video Quality Review")) {
      sendEvent({ type: "progress", message: line, pct: 94 });
    } else if (line.includes("Final video")) {
      sendEvent({ type: "progress", message: line, pct: 98 });
    }
  });
  child.stderr.on("data", (data: Buffer) => {
    stderr += data.toString();
  });

  child.on("close", (code: number) => {
    clearInterval(heartbeat);
    if (code !== 0) {
      sendEvent({
        type: "error",
        message: `server-render.mjs exited with code ${code}`,
        details: stderr.slice(-500),
      });
      res.end();
      return;
    }

    const finalMp4 = outputMp4.replace('.mp4', '-final.mp4');
    const fileToReturn = existsSync(finalMp4) ? finalMp4 : outputMp4;
    const hasAudio = fileToReturn === finalMp4; // -final.mp4 includes audio muxing

    if (!existsSync(fileToReturn)) {
      sendEvent({
        type: "error",
        message: "Render completed but output file not found",
      });
      res.end();
      return;
    }

    // Send the file path so the client can fetch it.
    const relPath = fileToReturn.replace(outputDir + "/", "");
    sendEvent({
      type: "complete",
      message: `Server render complete${hasAudio ? ' with audio' : ' (video only)'}!`,
      pct: 100,
      filePath: `/api/render-output/mp4/${relPath}`,
      hasAudio,
    });
    res.end();
  });

  // Handle client disconnect
  req.on("close", () => {
    clearInterval(heartbeat);
    if (!child.killed) child.kill("SIGTERM");
  });
}
