import type { IncomingMessage, ServerResponse } from "http";
import { spawn } from "child_process";
import { tmpdir } from "os";
import { join } from "path";
import { validateURL } from "../utils/security.js";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  unlinkSync,
  createReadStream,
  statSync,
} from "fs";
import crypto from "crypto";

const MAX_CACHE_SIZE = 100;

/** Hosts that fail proxy download and become render placeholders. */
const UNRELIABLE_HOST_RE =
  /(?:tiktok\.com|vm\.tiktok|instagram\.com|x\.com|twitter\.com|facebook\.com|fb\.watch)/i;

interface ClipCacheEntry {
  path: string;
  lastAccessed: number;
}

const clipCache = new Map<string, ClipCacheEntry>();

function isUnreliableVideoHost(url: string): boolean {
  return UNRELIABLE_HOST_RE.test(url);
}

/** Direct file URLs — fetch over HTTP instead of yt-dlp. */
function isDirectVideoUrl(url: string): boolean {
  return (
    /\.(?:mp4|webm|mov)(?:[?#]|$)/i.test(url) ||
    /videos\.pexels\.com\/video-files\//i.test(url)
  );
}

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

function streamCachedClip(res: ServerResponse, cachedPath: string): void {
  const stat = statSync(cachedPath);
  res.setHeader("Content-Type", "video/mp4");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.setHeader("Content-Length", stat.size);
  createReadStream(cachedPath).pipe(res);
}

function runFfmpeg(args: string[], timeoutMs = 120_000): Promise<void> {
  const proc = spawn("ffmpeg", args);
  const timer = setTimeout(() => proc.kill("SIGTERM"), timeoutMs);
  return new Promise<void>((resolve, reject) => {
    proc.on("close", (code: number | null) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}`));
    });
    proc.on("error", (err: Error) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function trimFileReencode(rawFile: string, outputPath: string, duration: number): Promise<void> {
  return runFfmpeg([
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
}

/** Stream-trim remote mp4 without downloading the full UHD file. */
async function trimDirectUrl(decodedUrl: string, outputPath: string, duration: number): Promise<void> {
  try {
    await runFfmpeg(
      [
        "-y",
        "-ss",
        "0",
        "-i",
        decodedUrl,
        "-t",
        String(duration),
        "-c",
        "copy",
        "-movflags",
        "+faststart",
        outputPath,
      ],
      90_000,
    );
    if (existsSync(outputPath) && statSync(outputPath).size > 2048) return;
    throw new Error("copy trim produced empty output");
  } catch {
    await runFfmpeg(
      [
        "-y",
        "-ss",
        "0",
        "-i",
        decodedUrl,
        "-t",
        String(duration),
        "-vf",
        "scale=-2:720",
        "-c:v",
        "libx264",
        "-an",
        "-preset",
        "fast",
        "-pix_fmt",
        "yuv420p",
        outputPath,
      ],
      180_000,
    );
  }
}


async function downloadWithYtdlp(
  videoUrl: string,
  cacheDir: string,
  hash: string,
  outputPath: string,
  duration: number,
): Promise<void> {
  const rawPath = join(cacheDir, `${hash}-${Date.now()}-raw.%(ext)s`);

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
      try {
        const partialFiles = readdirSync(cacheDir).filter(
          (f) => f.startsWith(`${hash}-`) && f.includes("-raw."),
        );
        for (const f of partialFiles) {
          unlinkSync(join(cacheDir, f));
        }
      } catch {
        /* ignore */
      }
    }
  }, 120_000);

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

  const files = readdirSync(cacheDir).filter(
    (f) => f.startsWith(`${hash}-`) && f.includes("-raw."),
  );
  if (files.length === 0) throw new Error("yt-dlp produced no output file");
  const rawFile = join(cacheDir, files[0]);

  try {
    await trimFileReencode(rawFile, outputPath, duration);
  } finally {
    try {
      unlinkSync(rawFile);
    } catch {
      /* ignore */
    }
  }
}

async function downloadDirectClip(
  decodedUrl: string,
  _cacheDir: string,
  _hash: string,
  outputPath: string,
  duration: number,
): Promise<void> {
  console.log(`[Clip Download] Direct stream trim: ${decodedUrl.substring(0, 80)}...`);
  await trimDirectUrl(decodedUrl, outputPath, duration);
}

function cleanupPartialRaw(cacheDir: string, hash: string): void {
  try {
    const partialFiles = readdirSync(cacheDir).filter(
      (f) => f.startsWith(`${hash}-`) && f.includes("-raw."),
    );
    for (const f of partialFiles) {
      unlinkSync(join(cacheDir, f));
    }
  } catch {
    /* ignore */
  }
}

/**
 * GET /api/download-clip?url=...&duration=...
 * Video clip proxy: direct HTTP for mp4/Pexels; yt-dlp for YouTube/Vimeo pages.
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

  const decodedUrl = decodeURIComponent(videoUrl);

  if (isUnreliableVideoHost(decodedUrl)) {
    res.statusCode = 403;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        error: "Unreliable video host blocked",
        details: "tiktok/instagram/social hosts are not proxied in loop harvest",
      }),
    );
    return;
  }

  const urlSafety = await validateURL(decodedUrl);
  if (!urlSafety.valid) {
    console.warn(`[Clip Download] Blocked unsafe URL: ${urlSafety.error}`);
    res.statusCode = 403;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: `URL blocked for security: ${urlSafety.error}` }));
    return;
  }

  const hash = crypto
    .createHash("md5")
    .update(`${decodedUrl}:${duration}`)
    .digest("hex");
  const cacheDir = join(tmpdir(), "autotube-clips");
  mkdirSync(cacheDir, { recursive: true, mode: 0o700 });
  const outputPath = join(cacheDir, `${hash}.mp4`);

  try {
    const cachedPath = getCachedPath(hash);
    if (cachedPath && existsSync(cachedPath)) {
      streamCachedClip(res, cachedPath);
      return;
    }

    if (isDirectVideoUrl(decodedUrl)) {
      await downloadDirectClip(decodedUrl, cacheDir, hash, outputPath, duration);
    } else {
      console.log(`[Clip Download] yt-dlp: ${videoUrl.substring(0, 80)}...`);
      await downloadWithYtdlp(videoUrl, cacheDir, hash, outputPath, duration);
    }

    if (!existsSync(outputPath)) {
      throw new Error("Trimmed clip not found");
    }

    setCachedPath(hash, outputPath);
    streamCachedClip(res, outputPath);
  } catch (error) {
    cleanupPartialRaw(cacheDir, hash);
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
