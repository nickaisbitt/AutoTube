import type { IncomingMessage, ServerResponse } from "http";
import { spawn } from "child_process";
import { tmpdir } from "os";
import { join } from "path";
import {
  existsSync,
  readFileSync,
  mkdirSync,
  readdirSync,
  unlinkSync,
} from "fs";
import crypto from "crypto";

const MAX_CACHE_SIZE = 100;

interface ClipCacheEntry {
  path: string;
  lastAccessed: number;
}

/**
 * In-memory clip cache (keyed by URL hash).
 * Persists for the lifetime of the dev server process.
 */
const clipCache = new Map<string, ClipCacheEntry>();

function evictOldestClip(): void {
  let oldestKey: string | undefined;
  let oldestTime = Infinity;
  for (const [key, entry] of clipCache) {
    if (entry.lastAccessed < oldestTime) {
      oldestTime = entry.lastAccessed;
      oldestKey = key;
    }
  }
  if (oldestKey !== undefined) {
    const entry = clipCache.get(oldestKey);
    if (entry && existsSync(entry.path)) {
      try {
        unlinkSync(entry.path);
      } catch (err) {
        console.warn("[Clip Cache] Failed to delete old clip:", (err as Error).message);
      }
    }
    clipCache.delete(oldestKey);
  }
}

function getCachedPath(hash: string): string | undefined {
  const entry = clipCache.get(hash);
  if (!entry) return undefined;
  entry.lastAccessed = Date.now();
  return entry.path;
}

function setCachedPath(hash: string, path: string): void {
  while (clipCache.size >= MAX_CACHE_SIZE) {
    evictOldestClip();
  }
  clipCache.set(hash, { path, lastAccessed: Date.now() });
}

/**
 * GET /api/download-clip?url=...&duration=...
 * Video clip download proxy (yt-dlp + ffmpeg).
 */
export async function handleDownloadClip(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(req.url!, `http://${req.headers.host}`);
  const videoUrl = url.searchParams.get("url");
  const duration = parseInt(url.searchParams.get("duration") || "10", 10);

  if (!videoUrl) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Missing url parameter" }));
    return;
  }

  try {
    // Cache key based on URL + duration
    const hash = crypto
      .createHash("md5")
      .update(`${videoUrl}:${duration}`)
      .digest("hex");
    const cacheDir = join(tmpdir(), "autotube-clips");
    mkdirSync(cacheDir, { recursive: true });
    const outputPath = join(cacheDir, `${hash}.mp4`);

    // Return cached clip if available
    const cachedPath = getCachedPath(hash);
    if (cachedPath && existsSync(cachedPath)) {
      const cached = readFileSync(cachedPath);
      res.setHeader("Content-Type", "video/mp4");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.setHeader("Content-Length", cached.length);
      res.end(cached);
      return;
    }

    console.log(
      `[Clip Download] Downloading: ${videoUrl.substring(0, 80)}...`,
    );

    const rawPath = join(cacheDir, `${hash}-raw.%(ext)s`);

    // Step 1: Download with yt-dlp
    const ytdlp = spawn("yt-dlp", [
      "--no-playlist",
      "-f",
      "best[height<=720]",
      "--max-filesize",
      "50M",
      "-o",
      rawPath,
      decodeURIComponent(videoUrl),
    ]);

    let ytdlpDone = false;
    const ytdlpTimeout = setTimeout(() => {
      if (!ytdlpDone) {
        ytdlp.kill("SIGTERM");
      }
    }, 30000);

    await new Promise<void>((resolve, reject) => {
      ytdlp.on("close", (code: number) => {
        ytdlpDone = true;
        clearTimeout(ytdlpTimeout);
        if (code === 0) resolve();
        else reject(new Error(`yt-dlp exited with code ${code}`));
      });
      ytdlp.on("error", (err: Error) => {
        ytdlpDone = true;
        clearTimeout(ytdlpTimeout);
        reject(err);
      });
    });

    // Find the downloaded file (yt-dlp fills in the extension)
    const files = readdirSync(cacheDir).filter((f) =>
      f.startsWith(`${hash}-raw.`),
    );
    if (files.length === 0) throw new Error("yt-dlp produced no output file");
    const rawFile = join(cacheDir, files[0]);

    // Step 2: Trim with ffmpeg
    const ffmpegTrim = spawn("ffmpeg", [
      "-y",
      "-i",
      rawFile,
      "-t",
      String(duration),
      "-c:v",
      "libx264",
      "-c:a",
      "aac",
      "-preset",
      "fast",
      "-pix_fmt",
      "yuv420p",
      outputPath,
    ]);

    await new Promise<void>((resolve, reject) => {
      ffmpegTrim.on("close", (code: number) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg trim exited with code ${code}`));
      });
      ffmpegTrim.on("error", reject);
    });

    // Clean up raw file
    try {
      unlinkSync(rawFile);
    } catch (err) {
      console.warn("[Clip Download] Failed to remove raw file:", (err as Error).message);
    }

    if (!existsSync(outputPath))
      throw new Error("Trimmed clip not found");

    setCachedPath(hash, outputPath);
    const clipBuffer = readFileSync(outputPath);
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.setHeader("Content-Length", clipBuffer.length);
    res.end(clipBuffer);
  } catch (error) {
    console.error("[Clip Download] Error:", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        error: "Clip download failed",
        details: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}
