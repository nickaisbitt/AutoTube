import type { IncomingMessage, ServerResponse } from "http";
import { spawn } from "child_process";
import { join, dirname } from "path";
import { readFileSync, existsSync, statSync } from "fs";
import { fileURLToPath } from "url";
import { resolveSavedProjectPath } from "../utils/projectPaths.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Project root is two levels up from server/routes/
const PROJECT_ROOT = join(__dirname, "..", "..");

/** Must match MIN_RENDER_OUTPUT_BYTES in deploy/server-render/pipelineReliability.mjs */
const MIN_RENDER_OUTPUT_BYTES = 100_000;

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString();
        resolve(raw ? (JSON.parse(raw) as Record<string, unknown>) : {});
      } catch {
        resolve({});
      }
    });
    req.on("error", reject);
  });
}

/**
 * POST /api/server-render
 * Full server-side render (node-canvas + edge-tts + ffmpeg).
 * Spawns server-render.mjs as a child process. The project must
 * already be saved via /api/save-project; pass the returned `path`
 * in the request body as `projectPath`.
 * Returns SSE progress events and the final file path on success.
 */
export async function handleServerRender(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = await readJsonBody(req);
  const projectPath = resolveSavedProjectPath(body);

  if (!projectPath) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        error: "No project saved. Call /api/save-project first.",
      }),
    );
    return;
  }

  const outputMp4 = join(
    PROJECT_ROOT,
    "test-recordings",
    `server-render-${Date.now()}.mp4`,
  );

  // Set SSE headers for progress streaming
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");


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

  // Determine the dev server URL from the incoming request
  const host = req.headers.host || 'localhost:5173';
  const protocol = 'http';
  const devServerUrl = `${protocol}://${host}`;

  // Prefer the full server-render pipeline (node-canvas + effects + AI review).
  // Remotion is opt-in via USE_REMOTION_RENDER=true — it lacks many quality features.
  const remotionPath = join(PROJECT_ROOT, "remotion", "render.mjs");
  const useRemotion =
    process.env.USE_REMOTION_RENDER === "true" && existsSync(remotionPath);

  if (useRemotion) {
    sendEvent({ type: "progress", message: "Using Remotion renderer...", pct: 1 });
  } else {
    sendEvent({ type: "progress", message: "Using server-render pipeline...", pct: 1 });
  }

  const renderScript = useRemotion
    ? join("remotion", "render.mjs")
    : join("server-render", "index.mjs");

  const child = spawn("node", [renderScript, projectPath, outputMp4], {
    cwd: PROJECT_ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...envVars, DEV_SERVER_URL: devServerUrl, REMOTION_SERVE_URL: useRemotion ? devServerUrl : undefined },
  });

  // Wall-clock timeout for hung TTS/ffmpeg (default 20 minutes)
  const RENDER_TIMEOUT_MS = Number(process.env.AUTOTUBE_SERVER_RENDER_TIMEOUT_MS || 1_200_000);
  const renderTimeout = setTimeout(() => {
    if (!child.killed) {
      try {
        sendEvent({
          type: "error",
          message: `server-render timed out after ${Math.round(RENDER_TIMEOUT_MS / 1000)}s`,
        });
      } catch {
        /* connection may be closed */
      }
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!child.killed) child.kill("SIGKILL");
      }, 10_000);
      try {
        res.end();
      } catch {
        /* ignore */
      }
    }
  }, RENDER_TIMEOUT_MS);

  let stderr = "";
  child.stdout.on("data", (data: Buffer) => {
    const line = data.toString().trim();
    if (!line) return;
    // Parse progress from renderer stdout
    if (line.includes("Bundle:") || line.includes("Render:")) {
      const pctMatch = line.match(/(\d+)%/);
      if (pctMatch) sendEvent({ type: "progress", message: line, pct: parseInt(pctMatch[1]) });
    } else if (line.includes("Done!") || line.includes("Final video")) {
      sendEvent({ type: "progress", message: line, pct: 98 });
    } else {
      sendEvent({ type: "progress", message: line, pct: undefined });
    }
  });
  child.stderr.on("data", (data: Buffer) => {
    stderr += data.toString();
  });

  child.on("close", (code: number) => {
    clearInterval(heartbeat);
    clearTimeout(renderTimeout);
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

    let outputSize: number;
    try {
      outputSize = statSync(fileToReturn).size;
    } catch (err) {
      sendEvent({
        type: "error",
        message: `Render completed but output file is unreadable: ${err instanceof Error ? err.message : String(err)}`,
      });
      res.end();
      return;
    }

    if (outputSize === 0) {
      sendEvent({
        type: "error",
        message: "Render completed but output file is empty (0 bytes)",
      });
      res.end();
      return;
    }

    if (outputSize < MIN_RENDER_OUTPUT_BYTES) {
      sendEvent({
        type: "error",
        message: `Render output too small (${outputSize} bytes, minimum ${MIN_RENDER_OUTPUT_BYTES})`,
      });
      res.end();
      return;
    }

    // Send the file path so the client can fetch it.
    const relPath = join(
      "test-recordings",
      fileToReturn.split("test-recordings/")[1] || "",
    );
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
    clearTimeout(renderTimeout);
    if (!child.killed) child.kill("SIGTERM");
  });
}
