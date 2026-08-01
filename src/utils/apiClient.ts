/**
 * Same-origin API helper — attaches the AutoTube API key to privileged
 * /api/* requests.
 *
 * The key comes from two places:
 *  - `VITE_AUTOTUBE_API_KEY` (local dev / E2E convenience, baked at build time)
 *  - the Settings modal / session config, which overrides the build-time value
 *
 * An empty override falls back to the build-time key so that a stored config
 * without `autotubeApiKey` cannot silently lock the browser out of /api/*.
 */

const ENV_API_KEY = ((import.meta.env?.VITE_AUTOTUBE_API_KEY as string | undefined) || "").trim();

let overrideApiKey = "";

export function setAutotubeApiKey(key: string): void {
  overrideApiKey = (key || "").trim();
}

export function getAutotubeApiKey(): string {
  return overrideApiKey || ENV_API_KEY;
}

/** True for same-origin /api/* URLs — the only place the key may be sent. */
export function isPrivilegedApiUrl(url: string): boolean {
  if (typeof url !== "string" || !url) return false;
  if (url.startsWith("/api/")) return true;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) {
    const origin = typeof location !== "undefined" ? location.origin : undefined;
    if (!origin) return false;
    try {
      const parsed = new URL(url, origin);
      return parsed.origin === origin && parsed.pathname.startsWith("/api/");
    } catch {
      return false;
    }
  }
  return false;
}

export function apiHeaders(init?: HeadersInit): Headers {
  const headers = new Headers(init);
  const key = getAutotubeApiKey();
  // Authorization may carry an unrelated bearer token (e.g. OpenRouter BYOK
  // forwarded to /api/llm), so the key always travels in X-API-Key.
  if (key && !headers.has("X-API-Key")) {
    headers.set("X-API-Key", key);
  }
  return headers;
}

/**
 * fetch() that attaches X-API-Key to same-origin /api/* requests.
 *
 * Non-privileged URLs (image proxies, third-party APIs) pass through
 * untouched so the key never leaves this origin.
 */
export async function apiFetch(
  input: string,
  init?: RequestInit,
): Promise<Response> {
  if (!isPrivilegedApiUrl(input)) return fetch(input, init);
  const headers = apiHeaders(init?.headers);
  return fetch(input, { ...init, headers });
}
