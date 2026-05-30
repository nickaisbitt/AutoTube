import type { IncomingMessage, ServerResponse } from "http";
import { createReadStream, existsSync, statSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Project root is two levels up from server/routes/
const PROJECT_ROOT = join(__dirname, "..", "..");
const RESOLVED_PROJECT_ROOT = resolve(PROJECT_ROOT);

/**
 * GET /api/render-output/:format/*
 * Serve rendered output files from test-recordings/ securely and efficiently.
 */
export async function handleRenderOutput(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  // URL format: /api/render-output/{format}/{relative-path}
  const urlPath = decodeURIComponent(
    req.url!.replace("/api/render-output/", ""),
  );

  // Security: check null byte injection and traversal attempts
  if (urlPath.includes("\0") || urlPath.includes("..")) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Invalid path format" }));
    return;
  }

  const format = urlPath.split("/")[0]; // "mp4" or "webm"
  
  // Whitelist allowed formats
  if (!["mp4", "webm"].includes(format)) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Invalid format type" }));
    return;
  }

  const relativePath = urlPath.split("/").slice(1).join("/");
  const filePath = join(PROJECT_ROOT, relativePath);
  const resolvedPath = resolve(filePath);

  // Security: ensure the resolved path stays within the project directory
  if (!resolvedPath.startsWith(RESOLVED_PROJECT_ROOT) || !existsSync(resolvedPath)) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "File not found" }));
    return;
  }

  const mimeType = format === "mp4" ? "video/mp4" : "video/webm";
  const stat = statSync(resolvedPath);

  res.setHeader("Content-Type", mimeType);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Length", stat.size);
  res.setHeader("Cache-Control", "public, max-age=86400");

  const stream = createReadStream(resolvedPath);
  stream.pipe(res);
}
