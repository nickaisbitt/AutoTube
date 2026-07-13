/**
 * Same-origin API helper — attaches Autotube API key when configured.
 */

let autotubeApiKey = "";

export function setAutotubeApiKey(key: string): void {
  autotubeApiKey = (key || "").trim();
}

export function getAutotubeApiKey(): string {
  return autotubeApiKey;
}

export function apiHeaders(init?: HeadersInit): Headers {
  const headers = new Headers(init);
  if (autotubeApiKey && !headers.has("X-API-Key") && !headers.has("Authorization")) {
    headers.set("X-API-Key", autotubeApiKey);
  } else if (autotubeApiKey && !headers.has("X-API-Key")) {
    // Keep Authorization (e.g. OpenRouter BYOK) but still send API key
    headers.set("X-API-Key", autotubeApiKey);
  }
  return headers;
}

/** fetch() for /api/* routes with X-API-Key when set. */
export async function apiFetch(
  input: string,
  init?: RequestInit,
): Promise<Response> {
  const headers = apiHeaders(init?.headers);
  return fetch(input, { ...init, headers });
}
