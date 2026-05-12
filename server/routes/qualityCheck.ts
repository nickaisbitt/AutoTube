import type { IncomingMessage, ServerResponse } from "http";
import { spawn } from "child_process";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, "..", "..");
const CHECK_SCRIPT = join(PROJECT_ROOT, "server", "quality-check", "check_quality.py");

/**
 * POST /api/quality-check
 * Runs video quality analysis on a rendered video file.
 *
 * Body (JSON):
 *   { "videoPath": "/path/to/video.mp4" }
 *
 * Returns:
 *   Quality report JSON with score, issues, and detailed metrics.
 */
export async function handleQualityCheck(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  // Parse body
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const body = Buffer.concat(chunks).toString("utf8");

  let videoPath: string;
  try {
    const parsed = JSON.parse(body);
    // Accept either videoPath (absolute) or videoUrl (relative URL)
    if (parsed.videoPath) {
      videoPath = parsed.videoPath;
    } else if (parsed.videoUrl) {
      // Convert URL like /api/render-output/mp4/test-recordings/file.mp4
      // to absolute path like /path/to/project/test-recordings/file.mp4
      const urlPath = parsed.videoUrl.replace(/^\/api\/render-output\/mp4\//, '');
      videoPath = join(PROJECT_ROOT, urlPath);
    } else {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Expected videoPath or videoUrl in body" }));
      return;
    }
  } catch {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Invalid JSON body. Expected { videoUrl: string }" }));
    return;
  }

  if (!videoPath || !existsSync(videoPath)) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: `Video file not found: ${videoPath}` }));
    return;
  }

  // Resolve API key from .env.local
  let apiKey = "";
  try {
    const envPath = join(PROJECT_ROOT, ".env.local");
    const { readFileSync } = await import("fs");
    const envContent = readFileSync(envPath, "utf8");
    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("VITE_OPENROUTER_KEY=")) {
        apiKey = trimmed.split("=")[1].trim();
        break;
      }
    }
  } catch {
    /* .env.local may not exist */
  }

  // Stream SSE for progress
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");

  const sendEvent = (data: Record<string, unknown>) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  sendEvent({ type: "progress", message: "Starting quality check...", pct: 0 });

  // Spawn Python quality check script
  const args = [CHECK_SCRIPT, videoPath, "--json"];
  if (apiKey) {
    args.push("--api-key", apiKey);
    args.push("--model", "google/gemini-2.0-flash-001");
  } else {
    args.push("--skip-vision");
  }

  const child = spawn("python3", args, {
    cwd: PROJECT_ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
  });

  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (data: Buffer) => {
    stdout += data.toString();
  });

  child.stderr.on("data", (data: Buffer) => {
    stderr += data.toString();
    // Parse progress from stderr (the Python script prints status messages)
    const line = data.toString().trim();
    if (line.includes("metadata")) {
      sendEvent({ type: "progress", message: line, pct: 20 });
    } else if (line.includes("loudness")) {
      sendEvent({ type: "progress", message: line, pct: 40 });
    } else if (line.includes("silence")) {
      sendEvent({ type: "progress", message: line, pct: 55 });
    } else if (line.includes("brightness")) {
      sendEvent({ type: "progress", message: line, pct: 70 });
    } else if (line.includes("vision")) {
      sendEvent({ type: "progress", message: line, pct: 85 });
    }
  });

  // Heartbeat to keep SSE alive
  const heartbeat = setInterval(() => {
    try {
      sendEvent({ type: "heartbeat" });
    } catch {
      clearInterval(heartbeat);
    }
  }, 15000);

  child.on("close", (code: number) => {
    clearInterval(heartbeat);

    if (code !== 0) {
      sendEvent({
        type: "error",
        message: `Quality check failed (exit ${code})`,
        details: stderr.slice(-500),
      });
      res.end();
      return;
    }

    try {
      const report = JSON.parse(stdout);
      sendEvent({
        type: "complete",
        message: `Quality check complete — Score: ${report.score}/100`,
        pct: 100,
        report,
      });
    } catch (err) {
      sendEvent({
        type: "error",
        message: "Failed to parse quality report",
        details: stdout.slice(-500),
      });
    }
    res.end();
  });

  req.on("close", () => {
    clearInterval(heartbeat);
    if (!child.killed) child.kill("SIGTERM");
  });
}
