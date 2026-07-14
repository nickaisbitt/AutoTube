import type { IncomingMessage, ServerResponse } from "http";
import { spawn } from "child_process";
import { existsSync } from "fs";
import { join, dirname, resolve } from "path";
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
  let includeVision = false;
  try {
    const parsed = JSON.parse(body);
    includeVision = !!parsed.includeVision;
    // Accept either videoPath (absolute) or videoUrl (relative URL)
    if (parsed.videoPath) {
      videoPath = parsed.videoPath;
    } else if (parsed.videoUrl) {
      // Convert URL like /api/render-output/mp4/test-recordings/file.mp4
      // to absolute path like /path/to/project/test-recordings/file.mp4
      const urlPath = parsed.videoUrl.replace(/^\/api\/render-output\/mp4\//, '').replace(/[^a-zA-Z0-9-_.\/]/g, '');
      
      // SECURITY: Path traversal check
      if (urlPath.includes("..") || urlPath.startsWith("/")) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Invalid videoUrl path format" }));
        return;
      }
      
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

  // SECURITY: Only allow files under test-recordings/
  const resolvedPath = resolve(videoPath);
  const recordingsRoot = resolve(join(PROJECT_ROOT, "test-recordings"));
  if (!resolvedPath.startsWith(recordingsRoot + "/")) {
    res.statusCode = 403;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Access denied: file must reside inside test-recordings/" }));
    return;
  }

  if (!existsSync(resolvedPath)) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: `Video file not found: ${videoPath}` }));
    return;
  }

  // Prioritize environment variable first (standard production pattern)
  let apiKey = process.env.OPENROUTER_API_KEY || process.env.VITE_OPENROUTER_KEY || "";
  
  if (process.env.VITE_OPENROUTER_KEY && !process.env.OPENROUTER_API_KEY) {
    console.warn("WARNING: Using VITE_OPENROUTER_KEY which is exposed to clients. Set OPENROUTER_API_KEY instead.");
  }

  if (!apiKey) {
    // Resolve API key from .env.local
    try {
      const envPath = join(PROJECT_ROOT, ".env.local");
      const { readFileSync } = await import("fs");
      const envContent = readFileSync(envPath, "utf8");
      for (const line of envContent.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("OPENROUTER_API_KEY=")) {
          apiKey = trimmed.split("=").slice(1).join("=").trim();
          break;
        }
        if (trimmed.startsWith("VITE_OPENROUTER_KEY=")) {
          apiKey = trimmed.split("=").slice(1).join("=").trim();
        }
      }
    } catch {
      /* .env.local may not exist */
    }
  }

  // Stream SSE for progress
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");


  const sendEvent = (data: Record<string, unknown>) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  sendEvent({ type: "progress", message: "Starting quality check...", pct: 0 });

  // Spawn Python quality check script — pass key via env only (not argv)
  const args = [CHECK_SCRIPT, resolvedPath, "--json"];
  if (includeVision && apiKey) {
    // 3-judge panel: mimo + DeepSeek (text) + Gemma 4 — see check_quality.py DEFAULT_JUDGES
    args.push(
      "--model",
      "xiaomi/mimo-v2.5,deepseek/deepseek-v4-flash,google/gemma-4-31b-it",
    );
  } else {
    args.push("--skip-vision");
  }

  const child = spawn("python3", args, {
    cwd: PROJECT_ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      OPENROUTER_API_KEY: apiKey || "",
      OPENROUTER_KEY: apiKey || "",
    },
  });

  const QC_TIMEOUT_MS = Number(process.env.AUTOTUBE_QC_TIMEOUT_MS || 600_000);
  const killTimer = setTimeout(() => {
    if (!child.killed) {
      try {
        sendEvent({
          type: "error",
          message: `Quality check timed out after ${Math.round(QC_TIMEOUT_MS / 1000)}s`,
        });
      } catch {
        /* stream may be closed */
      }
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!child.killed) child.kill("SIGKILL");
      }, 5000).unref?.();
    }
  }, QC_TIMEOUT_MS);

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
    clearTimeout(killTimer);

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
    clearTimeout(killTimer);
    if (!child.killed) child.kill("SIGTERM");
  });
}
