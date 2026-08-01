import type { IncomingMessage, ServerResponse } from "http";

/** Paths that remain public without an API key. */
const PUBLIC_PATHS = new Set(["/api/health"]);

function pathnameOf(req: IncomingMessage): string {
  try {
    return new URL(req.url || "/", "http://localhost").pathname;
  } catch {
    return (req.url || "/").split("?")[0];
  }
}

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.has(pathname);
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
 * - AUTOTUBE_API_KEY is required by default in every environment.
 * - Development may explicitly opt out with AUTOTUBE_DISABLE_AUTH=1.
 * - Production always requires a key and ignores the opt-out.
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
  const authDisabled =
    !isProd &&
    ["1", "true"].includes(
      (process.env.AUTOTUBE_DISABLE_AUTH || "").trim().toLowerCase(),
    );

  if (authDisabled) return false;

  if (!expected) {
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        error:
          "Server misconfigured: AUTOTUBE_API_KEY is required (AUTOTUBE_DISABLE_AUTH=1 is for local development only)",
      }),
    );
    return true;
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
