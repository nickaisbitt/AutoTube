/**
 * DuckDuckGo search utilities — used by the image and video search routes.
 * Runs only in the Vite dev-server process (Node.js).
 */

const DDG_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** Extract a VQD token from DuckDuckGo for a given query. */
export async function fetchDDGVQD(query: string): Promise<string> {
  const initialRes = await fetch(
    `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
    {
      headers: { "User-Agent": DDG_USER_AGENT },
      signal: AbortSignal.timeout(10_000),
    },
  );
  const text = await initialRes.text();
  const patterns = [
    /vqd=([^&'"]+)/,
    /vqd=["']?([^&'"]+)["']/,
    /"vqd":"([^"]+)"/,
    /vqd['"]?\s*:\s*['"]([^'"]+)/,
  ];
  let vqdMatch: RegExpMatchArray | null = null;
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) { vqdMatch = match; break; }
  }
  if (!vqdMatch) throw new Error("Could not extract VQD token from DuckDuckGo");
  return vqdMatch[1];
}

/** Fetch image results from DuckDuckGo. */
export async function fetchDDGImages(query: string) {
  const vqd = await fetchDDGVQD(query);
  const searchUrl = `https://duckduckgo.com/i.js?q=${encodeURIComponent(query)}&o=json&vqd=${vqd}&f=,,,l`;
  const apiRes = await fetch(searchUrl, {
    headers: { "User-Agent": DDG_USER_AGENT, Referer: "https://duckduckgo.com/" },
  });
  if (!apiRes.ok) throw new Error(`DDG Image API failed: ${apiRes.status}`);
  try {
    return await apiRes.json();
  } catch {
    return [];
  }
}

/** Fetch video results from DuckDuckGo. */
export async function fetchDDGVideos(query: string) {
  const vqd = await fetchDDGVQD(query);
  const searchUrl = `https://duckduckgo.com/v.js?q=${encodeURIComponent(query)}&o=json&vqd=${vqd}`;
  const apiRes = await fetch(searchUrl, {
    headers: { "User-Agent": DDG_USER_AGENT, Referer: "https://duckduckgo.com/" },
  });
  if (!apiRes.ok) throw new Error(`DDG Video API failed: ${apiRes.status}`);
  try {
    return await apiRes.json();
  } catch {
    return [];
  }
}
