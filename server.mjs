import { createServer } from "http";
import { readFileSync, existsSync, statSync } from "fs";
import { join, extname, resolve } from "path";
import { fileURLToPath } from "url";
import { apiMiddleware } from "./server/index.ts";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PORT = parseInt(process.env.PORT || "5173", 10);
const DIST_DIR = join(__dirname, "dist");

const MIME_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
};

function serveStatic(req, res) {
  let filePath = join(DIST_DIR, req.url === "/" ? "index.html" : req.url);

  const resolved = resolve(filePath);
  if (!resolved.startsWith(resolve(DIST_DIR) + "/")) {
    res.statusCode = 403;
    res.setHeader("Content-Type", "text/plain");
    res.end("Forbidden");
    return;
  }

  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(DIST_DIR, "index.html");
  }

  const ext = extname(filePath);
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  try {
    const data = readFileSync(filePath);
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
    return true;
  } catch {
    return false;
  }
}

const server = createServer((req, res) => {
  apiMiddleware(req, res, () => {
    if (!res.writableEnded) {
      serveStatic(req, res);
    }
  });
});

server.listen(PORT, () => {
  console.log(`AutoTube production server running on port ${PORT}`);
  console.log(`Static files from: ${DIST_DIR}`);
});
