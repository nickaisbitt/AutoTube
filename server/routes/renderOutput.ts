import type { IncomingMessage, ServerResponse } from "http";
import { createReadStream, existsSync, lstatSync, realpathSync, statSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, "..", "..");
const RECORDINGS_DIR = resolve(join(PROJECT_ROOT, "test-recordings"));

/**
 * GET /api/render-output/:format/*
 * Serve rendered output files from test-recordings/ only.
 */
export async function handleRenderOutput(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const urlPath = decodeURIComponent(
    req.url!.replace("/api/render-output/", ""),
  );

  if (urlPath.includes("\0") || urlPath.includes("..")) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Invalid path format" }));
    return;
  }

  const format = urlPath.split("/")[0];

  if (!["mp4", "webm"].includes(format)) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Invalid format type" }));
    return;
  }

  const relativePath = urlPath.split("/").slice(1).join("/");
  // Allow paths that already include test-recordings/ or are bare filenames under it
  const underRecordings = relativePath.startsWith("test-recordings/")
    ? relativePath.slice("test-recordings/".length)
    : relativePath;

  if (!underRecordings || underRecordings.includes("..")) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Invalid path format" }));
    return;
  }

  const filePath = join(RECORDINGS_DIR, underRecordings);
  const resolvedPath = resolve(filePath);

  if (!resolvedPath.startsWith(RECORDINGS_DIR + "/") || !existsSync(resolvedPath)) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "File not found" }));
    return;
  }

  try {
    const st = lstatSync(resolvedPath);
    if (st.isSymbolicLink()) {
      const real = realpathSync(resolvedPath);
      if (!real.startsWith(RECORDINGS_DIR + "/")) {
        res.statusCode = 403;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Symlink escape denied" }));
        return;
      }
    }
  } catch {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "File not found" }));
    return;
  }

  const mimeType = format === "mp4" ? "video/mp4" : "video/webm";
  const stat = statSync(resolvedPath);

  res.setHeader("Content-Type", mimeType);
  res.setHeader("Content-Length", stat.size);
  res.setHeader("Cache-Control", "public, max-age=86400");

  const stream = createReadStream(resolvedPath);
  stream.pipe(res);
}
