import type { IncomingMessage, ServerResponse } from "http";

/** Paths that remain public without an API key (exact prefix match on pathname). */
const PUBLIC_PREFIXES = ["/api/health"];

function pathnameOf(req: IncomingMessage): string {
  try {
    return new URL(req.url || "/", `http://${req.headers.host || "localhost"}`).pathname;
  } catch {
    return (req.url || "/").split("?")[0];
  }
}

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

function extractApiKey(req: IncomingMessage): string {
  const xKey = req.headers["x-api-key"];
  if (typeof xKey === "string" && xKey.trim()) return xKey.trim();
  if (Array.isArray(xKey) && xKey[0]?.trim()) return xKey[0].trim();

  const auth = req.headers.authorization;
  if (typeof auth === "string") {
    const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
    if (m?.[1]) return m[1].trim();
  }
  return "";
}

/**
 * Shared API key gate for privileged /api/* routes.
 *
 * - Production (`NODE_ENV=production`): AUTOTUBE_API_KEY is required; missing
 *   env → 503. Wrong/missing client key → 401.
 * - Development: if AUTOTUBE_API_KEY is unset, auth is skipped (local DX).
 * - GET /api/health is always public.
 *
 * Returns true when the request was rejected (caller must return).
 */
export function apiAuthMiddleware(
  req: IncomingMessage,
  res: ServerResponse,
): boolean {
  const pathname = pathnameOf(req);
  if (isPublicPath(pathname)) {
    return false;
  }

  const expected = (process.env.AUTOTUBE_API_KEY || "").trim();
  const isProd = process.env.NODE_ENV === "production";

  if (!expected) {
    if (isProd) {
      res.statusCode = 503;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "Server misconfigured: AUTOTUBE_API_KEY is required in production",
        }),
      );
      return true;
    }
    return false;
  }

  const provided = extractApiKey(req);
  if (!provided || provided !== expected) {
    res.statusCode = 401;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("WWW-Authenticate", "Bearer");
    res.end(JSON.stringify({ error: "Unauthorized: valid API key required" }));
    return true;
  }

  return false;
}
