import type { IncomingMessage, ServerResponse } from "http";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

/**
 * POST /api/llm
 * Proxies OpenRouter chat completions using the server-side key when set.
 * Client may send Authorization: Bearer <user-key> for BYOK; that is used
 * only when OPENROUTER_API_KEY is not configured on the server.
 */
export async function handleLlmProxy(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Invalid JSON body" }));
    return;
  }

  const serverKey = (
    process.env.OPENROUTER_API_KEY ||
    process.env.VITE_OPENROUTER_KEY ||
    ""
  ).trim();

  let clientKey = "";
  const auth = req.headers.authorization;
  if (typeof auth === "string") {
    const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
    if (m?.[1]) clientKey = m[1].trim();
  }

  // Prefer server secret; fall back to BYOK user key from the browser.
  const apiKey = serverKey || clientKey;
  if (!apiKey) {
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        error:
          "No OpenRouter key configured. Set OPENROUTER_API_KEY on the server or enter a key in Settings.",
      }),
    );
    return;
  }

  try {
    const upstream = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://autotube.video",
        "X-Title": "AutoTube AI Generator",
      },
      body: JSON.stringify(body),
    });

    const text = await upstream.text();
    res.statusCode = upstream.status;
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
    res.end(text);
  } catch (err) {
    res.statusCode = 502;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        error: "OpenRouter proxy failed",
        details: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}
