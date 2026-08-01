import type { IncomingMessage, ServerResponse } from "http";

const XAI_TTS_ENDPOINT = "https://api.x.ai/v1/tts";
const CF_MELO_MODEL = "@cf/myshell-ai/melotts";
const MAX_TTS_BODY_BYTES = 64 * 1024; // 64 KB — short narration text only
const MAX_TEXT_LENGTH = 5_000;

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > MAX_TTS_BODY_BYTES) throw new Error("Payload too large");
    chunks.push(buffer);
  }
  const raw = Buffer.concat(chunks, totalBytes).toString("utf8");
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

/**
 * GET /api/tts/capabilities
 * Returns which server-side TTS engines are configured (boolean only — no key values).
 * Safe to call without authentication; exposes no secrets.
 */
export async function handleTtsCapabilities(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const grok = !!process.env.XAI_API_KEY;
  const melo = !!(process.env.CF_ACCOUNT_ID && process.env.CF_API_TOKEN);
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ grok, melo }));
}

/**
 * POST /api/tts/grok
 * Body: { text: string, voice?: string }
 *
 * Proxies to xAI TTS using server-side XAI_API_KEY. Returns audio/mpeg binary.
 * Returns 503 when XAI_API_KEY is not set (client falls back to BYOK VITE_XAI_KEY).
 */
export async function handleTtsGrok(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Grok TTS not configured on server — set XAI_API_KEY" }));
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

  const record = body as Record<string, unknown>;
  if (typeof record?.text !== "string" || !record.text) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: 'Missing required field "text"' }));
    return;
  }

  const text = record.text as string;
  if (text.length > MAX_TEXT_LENGTH) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: `Text exceeds maximum length of ${MAX_TEXT_LENGTH} characters` }));
    return;
  }
  const voice = typeof record.voice === "string" ? record.voice : "Sal";

  try {
    const upstream = await fetch(XAI_TTS_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        voice_id: voice,
        output_format: { codec: "mp3", sample_rate: 44100, bit_rate: 128000 },
        language: "en",
      }),
    });

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => "");
      console.error(`[TTS/Grok] xAI error ${upstream.status}: ${errText.substring(0, 200)}`);
      res.statusCode = upstream.status >= 500 ? 502 : upstream.status;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "xAI TTS request failed" }));
      return;
    }

    const contentType = upstream.headers.get("content-type") || "audio/mpeg";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "no-store");
    const audioBuffer = Buffer.from(await upstream.arrayBuffer());
    res.end(audioBuffer);
  } catch (err) {
    console.error("[TTS/Grok] Proxy error:", err);
    res.statusCode = 502;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Grok TTS proxy failed" }));
  }
}

/**
 * POST /api/tts/melo
 * Body: { text: string }
 *
 * Proxies to Cloudflare Workers AI MeloTTS using server-side CF_ACCOUNT_ID / CF_API_TOKEN.
 * Returns audio/mpeg binary.
 * Returns 503 when CF credentials are not set (client falls back to BYOK VITE_CF_*).
 */
export async function handleTtsMelo(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }

  const accountId = process.env.CF_ACCOUNT_ID;
  const apiToken = process.env.CF_API_TOKEN;
  if (!accountId || !apiToken) {
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "MeloTTS not configured on server — set CF_ACCOUNT_ID and CF_API_TOKEN" }));
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

  const record = body as Record<string, unknown>;
  if (typeof record?.text !== "string" || !record.text) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: 'Missing required field "text"' }));
    return;
  }

  const text = record.text as string;
  if (text.length > MAX_TEXT_LENGTH) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: `Text exceeds maximum length of ${MAX_TEXT_LENGTH} characters` }));
    return;
  }

  const cfUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${CF_MELO_MODEL}`;

  try {
    const upstream = await fetch(cfUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt: text, lang: "en" }),
    });

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => "");
      console.error(`[TTS/Melo] CF error ${upstream.status}: ${errText.substring(0, 200)}`);
      res.statusCode = upstream.status >= 500 ? 502 : upstream.status;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "MeloTTS request failed" }));
      return;
    }

    const contentType = upstream.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      // CF returns base64-encoded audio in a JSON envelope
      const data = (await upstream.json()) as { result?: { audio?: string } };
      const base64Audio = data?.result?.audio;
      if (!base64Audio) {
        res.statusCode = 502;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "No audio in MeloTTS response" }));
        return;
      }
      const audioBuffer = Buffer.from(base64Audio, "base64");
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Cache-Control", "no-store");
      res.end(audioBuffer);
    } else {
      res.setHeader("Content-Type", contentType || "audio/mpeg");
      res.setHeader("Cache-Control", "no-store");
      const audioBuffer = Buffer.from(await upstream.arrayBuffer());
      res.end(audioBuffer);
    }
  } catch (err) {
    console.error("[TTS/Melo] Proxy error:", err);
    res.statusCode = 502;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "MeloTTS proxy failed" }));
  }
}
