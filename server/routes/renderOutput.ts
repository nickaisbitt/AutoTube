import type { IncomingMessage, ServerResponse } from "http";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Project root is two levels up from server/routes/
const PROJECT_ROOT = join(__dirname, "..", "..");

/**
 * GET /api/render-output/:format/*
 * Serve rendered output files from test-recordings/.
 */
export async function handleRenderOutput(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  // URL format: /api/render-output/{format}/{relative-path}
  const urlPath = decodeURIComponent(
    req.url!.replace("/api/render-output/", ""),
  );
  const format = urlPath.split("/")[0]; // "mp4" or "webm"
  const relativePath = urlPath.split("/").slice(1).join("/");
  const filePath = join(PROJECT_ROOT, relativePath);

  // Security: ensure the path stays within the project directory
  if (!filePath.startsWith(PROJECT_ROOT) || !existsSync(filePath)) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "File not found" }));
    return;
  }

  const mimeType = format === "mp4" ? "video/mp4" : "video/webm";
  const videoBuffer = readFileSync(filePath);
  res.setHeader("Content-Type", mimeType);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Length", videoBuffer.length);
  res.end(videoBuffer);
}
