import type { IncomingMessage, ServerResponse } from "http";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_SERVER_MODEL = "xiaomi/mimo-v2.5";
const MAX_LLM_BODY_BYTES = 1024 * 1024;
const MAX_SERVER_TOKENS = 8192;

class RequestBodyTooLargeError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function allowedServerModels(): Set<string> {
  const extra = (process.env.AUTOTUBE_ALLOWED_LLM_MODELS || "")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
  return new Set([
    DEFAULT_SERVER_MODEL,
    (process.env.OPENROUTER_MODEL || "").trim(),
    ...extra,
  ].filter(Boolean));
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const declaredLength = req.headers["content-length"];
  if (
    typeof declaredLength === "string" &&
    /^\d+$/.test(declaredLength) &&
    Number(declaredLength) > MAX_LLM_BODY_BYTES
  ) {
    throw new RequestBodyTooLargeError();
  }
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > MAX_LLM_BODY_BYTES) {
      throw new RequestBodyTooLargeError();
    }
    chunks.push(buffer);
  }
  const raw = Buffer.concat(chunks, totalBytes).toString("utf8");
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
  } catch (err) {
    res.statusCode = err instanceof RequestBodyTooLargeError ? 413 : 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({
      error: err instanceof RequestBodyTooLargeError
        ? "Payload too large"
        : "Invalid JSON body",
    }));
    return;
  }

  if (!isRecord(body)) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "JSON body must be an object" }));
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

  let upstreamBody: Record<string, unknown> = body;
  if (serverKey) {
    const requestedModel = body.model;
    if (
      requestedModel !== undefined &&
      (typeof requestedModel !== "string" || !requestedModel.trim())
    ) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "model must be a non-empty string" }));
      return;
    }
    const defaultModel =
      (process.env.OPENROUTER_MODEL || "").trim() || DEFAULT_SERVER_MODEL;
    const model =
      typeof requestedModel === "string" ? requestedModel.trim() : defaultModel;
    if (!allowedServerModels().has(model)) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({
        error: "Requested model is not allowed with the server key",
      }));
      return;
    }
    const requestedMaxTokens = body.max_tokens;
    const maxTokens =
      typeof requestedMaxTokens === "number" &&
      Number.isFinite(requestedMaxTokens) &&
      requestedMaxTokens > 0
        ? Math.min(Math.floor(requestedMaxTokens), MAX_SERVER_TOKENS)
        : MAX_SERVER_TOKENS;
    upstreamBody = { ...body, model, max_tokens: maxTokens };
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
      body: JSON.stringify(upstreamBody),
      signal: AbortSignal.timeout(120_000),
    });

    const text = await upstream.text();
    res.statusCode = upstream.status;
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
    res.end(text);
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || /aborted|timeout/i.test(err.message));
    res.statusCode = timedOut ? 504 : 502;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        error: timedOut ? "OpenRouter proxy timed out" : "OpenRouter proxy failed",
        details: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}
