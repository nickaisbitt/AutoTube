import type { IncomingMessage, ServerResponse } from "http";
import { spawn } from "child_process";
import { join, dirname } from "path";
import { readFileSync, existsSync, readdirSync } from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Project root is two levels up from server/routes/
const PROJECT_ROOT = join(__dirname, "..", "..");
const QUALITY_CHECK_SCRIPT = join(PROJECT_ROOT, "server", "quality-check", "check_quality.py");

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
  const outputMp4 = join(
    PROJECT_ROOT,
    "test-recordings",
    `server-render-${Date.now()}.mp4`,
  );

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
        if (key.startsWith("VITE_")) envVars[key] = val;
      }
    }
  } catch {
    /* .env.local may not exist */
  }

  // Determine the dev server URL from the incoming request
  const host = req.headers.host || 'localhost:5173';
  const protocol = (req.headers['x-forwarded-proto'] as string) || 'http';
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
    } else if (line.includes("Final video")) {
      sendEvent({ type: "progress", message: line, pct: 98 });
    }
  });
  child.stderr.on("data", (data: Buffer) => {
    stderr += data.toString();
  });

  child.on("close", async (code: number) => {
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
    const relPath = join(
      "test-recordings",
      fileToReturn.split("test-recordings/")[1] || "",
    );

    // Run quick quality check (ffmpeg-only, no vision) in background
    let qualityReport: Record<string, unknown> | null = null;
    try {
      sendEvent({ type: "progress", message: "Running quality check...", pct: 95 });
      const { spawnSync } = await import("child_process");
      const qcResult = spawnSync("python3", [
        QUALITY_CHECK_SCRIPT,
        fileToReturn,
        "--json",
        "--skip-vision",
      ], { timeout: 60000, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });

      if (qcResult.status === 0 && qcResult.stdout) {
        try {
          qualityReport = JSON.parse(qcResult.stdout);
        } catch {}
      }
    } catch {
      // Quality check is non-blocking — don't fail the render
    }

    sendEvent({
      type: "complete",
      message: `Server render complete${hasAudio ? ' with audio' : ' (video only)'}!${qualityReport ? ` Quality: ${qualityReport.score}/100` : ''}`,
      pct: 100,
      filePath: `/api/render-output/mp4/${relPath}`,
      hasAudio,
      quality: qualityReport,
    });
    res.end();
  });

  // Handle client disconnect
  req.on("close", () => {
    clearInterval(heartbeat);
    if (!child.killed) child.kill("SIGTERM");
  });
}
