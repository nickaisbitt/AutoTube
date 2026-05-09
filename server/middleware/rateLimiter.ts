import type { IncomingMessage, ServerResponse } from "http";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

const RENDER_LIMIT = 10;
const RENDER_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const TTS_LIMIT = 50;
const TTS_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_SIZE = 10000;

const RENDER_PATHS = ["/api/render-video", "/api/server-render"];
const TTS_PATH = "/api/tts";

function getClientIp(req: IncomingMessage): string {
  return (
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    "127.0.0.1"
  );
}

function evictOldestIfNeeded(): void {
  while (rateLimitMap.size >= MAX_SIZE) {
    const oldestKey = rateLimitMap.keys().next().value;
    if (oldestKey !== undefined) {
      rateLimitMap.delete(oldestKey);
    }
  }
}

function checkLimit(
  ip: string,
  limit: number,
  windowMs: number,
): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  let entry = rateLimitMap.get(ip);

  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
    evictOldestIfNeeded();
    rateLimitMap.set(ip, entry);
  }

  entry.count += 1;

  if (entry.count > limit) {
    const retryAfterMs = entry.resetAt - now;
    return { allowed: false, retryAfterMs: Math.max(0, retryAfterMs) };
  }

  return { allowed: true, retryAfterMs: 0 };
}

function cleanupExpiredEntries(): void {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now >= entry.resetAt) {
      rateLimitMap.delete(ip);
    }
  }
}

// Cleanup every 5 minutes
const cleanupInterval = setInterval(cleanupExpiredEntries, 5 * 60 * 1000);

export function stopRateLimiterCleanup(): void {
  clearInterval(cleanupInterval);
}

export function rateLimitMiddleware(
  req: IncomingMessage,
  res: ServerResponse,
  _next: () => void,
): boolean {
  const ip = getClientIp(req);

  // Check render rate limit
  if (RENDER_PATHS.some((p) => req.url?.startsWith(p))) {
    const result = checkLimit(ip, RENDER_LIMIT, RENDER_WINDOW_MS);
    if (!result.allowed) {
      const retryAfterSec = Math.ceil(result.retryAfterMs / 1000);
      res.statusCode = 429;
      res.setHeader("Retry-After", String(retryAfterSec));
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "Rate limit exceeded — too many render requests",
          retryAfter: retryAfterSec,
        }),
      );
      return true; // handled
    }
  }

  // Check TTS rate limit
  if (req.url?.startsWith(TTS_PATH)) {
    const result = checkLimit(ip, TTS_LIMIT, TTS_WINDOW_MS);
    if (!result.allowed) {
      const retryAfterSec = Math.ceil(result.retryAfterMs / 1000);
      res.statusCode = 429;
      res.setHeader("Retry-After", String(retryAfterSec));
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "Rate limit exceeded — too many TTS requests",
          retryAfter: retryAfterSec,
        }),
      );
      return true; // handled
    }
  }

  return false; // not handled, continue
}
