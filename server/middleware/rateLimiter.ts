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
const PROXY_LIMIT = 100;
const PROXY_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const SEARCH_LIMIT = 50;
const SEARCH_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_SIZE = 10000;

const RENDER_PATHS = ["/api/render-video", "/api/server-render"];
const PROXY_PATHS = ["/api/proxy-image", "/api/proxy-page", "/api/download-clip"];
const SEARCH_PATHS = ["/api/search-", "/api/search?", "/api/static-map", "/api/press-release", "/api/deep-harvest"];

function getClientIp(req: IncomingMessage): string {
  if (process.env.TRUST_PROXY === 'true' || process.env.TRUST_PROXY === '1') {
    // Prefer the last hop (appended by the trusted edge) to reduce client spoofing.
    const forwarded = (req.headers["x-forwarded-for"] as string)
      ?.split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (forwarded && forwarded.length > 0) {
      return forwarded[forwarded.length - 1];
    }
  }
  return req.socket?.remoteAddress || 'unknown';
}

function evictOldestIfNeeded(): void {
  while (rateLimitMap.size >= MAX_SIZE) {
    // Evict the entry with the earliest resetAt (expiry time), not insertion order
    let oldestKey: string | undefined;
    let oldestResetAt = Infinity;
    for (const [key, entry] of rateLimitMap) {
      if (entry.resetAt < oldestResetAt) {
        oldestResetAt = entry.resetAt;
        oldestKey = key;
      }
    }
    if (oldestKey !== undefined) {
      rateLimitMap.delete(oldestKey);
    }
  }
}

function checkLimit(
  key: string,
  limit: number,
  windowMs: number,
): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  let entry = rateLimitMap.get(key);

  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
    evictOldestIfNeeded();
    rateLimitMap.set(key, entry);
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
  for (const [key, entry] of rateLimitMap) {
    if (now >= entry.resetAt) {
      rateLimitMap.delete(key);
    }
  }
}

// Cleanup every 5 minutes
const cleanupInterval = setInterval(cleanupExpiredEntries, 5 * 60 * 1000);

export function stopRateLimiterCleanup(): void {
  clearInterval(cleanupInterval);
}

function isLocalhost(ip: string): boolean {
  return ip === "127.0.0.1" || ip === "::1" || ip === "localhost" || ip.startsWith("::ffff:127.0.0.1");
}

export function rateLimitMiddleware(
  req: IncomingMessage,
  res: ServerResponse,
  _next: () => void,
): boolean {
  const ip = getClientIp(req);

  // Bypass rate limiting for local development
  if (isLocalhost(ip)) {
    return false;
  }

  // Check render rate limit
  if (RENDER_PATHS.some((p) => req.url?.startsWith(p))) {
    const result = checkLimit(`${ip}:render`, RENDER_LIMIT, RENDER_WINDOW_MS);
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

  // Check TTS rate limit (legacy path — /api/tts is unimplemented)
  if (req.url?.startsWith("/api/llm")) {
    const result = checkLimit(`${ip}:llm`, TTS_LIMIT, TTS_WINDOW_MS);
    if (!result.allowed) {
      const retryAfterSec = Math.ceil(result.retryAfterMs / 1000);
      res.statusCode = 429;
      res.setHeader("Retry-After", String(retryAfterSec));
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "Rate limit exceeded — too many LLM requests",
          retryAfter: retryAfterSec,
        }),
      );
      return true; // handled
    }
  }

  // Check proxy rate limit
  if (PROXY_PATHS.some((p) => req.url?.startsWith(p))) {
    const result = checkLimit(`${ip}:proxy`, PROXY_LIMIT, PROXY_WINDOW_MS);
    if (!result.allowed) {
      const retryAfterSec = Math.ceil(result.retryAfterMs / 1000);
      res.statusCode = 429;
      res.setHeader("Retry-After", String(retryAfterSec));
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "Rate limit exceeded — too many proxy requests",
          retryAfter: retryAfterSec,
        }),
      );
      return true; // handled
    }
  }

  // Check search rate limit
  if (SEARCH_PATHS.some((p) => req.url?.startsWith(p))) {
    const result = checkLimit(`${ip}:search`, SEARCH_LIMIT, SEARCH_WINDOW_MS);
    if (!result.allowed) {
      const retryAfterSec = Math.ceil(result.retryAfterMs / 1000);
      res.statusCode = 429;
      res.setHeader("Retry-After", String(retryAfterSec));
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "Rate limit exceeded — too many search requests",
          retryAfter: retryAfterSec,
        }),
      );
      return true; // handled
    }
  }

  return false; // not handled, continue
}
