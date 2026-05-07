import type { IncomingMessage, ServerResponse } from "http";

/**
 * GET /api/proxy-image?url=...
 * Image proxy — eliminates CORS / canvas-taint issues.
 */
export async function handleProxyImage(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(req.url!, `http://${req.headers.host}`);
  const targetUrl = url.searchParams.get("url");

  if (!targetUrl) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Missing url parameter" }));
    return;
  }

  try {
    const imgRes = await fetch(decodeURIComponent(targetUrl), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });
    res.setHeader(
      "Content-Type",
      imgRes.headers.get("Content-Type") || "image/jpeg",
    );
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "public, max-age=86400");
    const buffer = Buffer.from(await imgRes.arrayBuffer());
    res.end(buffer);
  } catch {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Image proxy failed" }));
  }
}
