import type { IncomingMessage, ServerResponse } from "http";
import { pipeline } from "node:stream/promises";

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
    const decodedUrl = decodeURIComponent(targetUrl);
    
    // Validate URL format
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(decodedUrl);
    } catch (urlErr) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: `Invalid URL: ${urlErr.message}` }));
      return;
    }

    // Only allow http/https protocols for security
    if (!parsedUrl.protocol.startsWith('http')) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Only HTTP/HTTPS URLs are allowed" }));
      return;
    }

    const imgRes = await fetch(decodedUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1"
      },
      // Follow redirects
      redirect: "follow",
      // Timeout after 10 seconds
      // Note: fetch timeout is not universally supported, so we'll rely on AbortController if needed
    });

    if (!imgRes.ok) {
      res.statusCode = 502; // Bad Gateway
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ 
        error: `Failed to fetch image: ${imgRes.status} ${imgRes.statusText}`,
        status: imgRes.status,
        url: decodedUrl.substring(0, 100) + (decodedUrl.length > 100 ? "..." : "")
      }));
      return;
    }

    // Get content-type from response or default
    const contentType = imgRes.headers.get("Content-Type") || "image/jpeg";
    
    // Set headers
    res.setHeader("Content-Type", contentType);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Cache-Control", "public, max-age=86400, immutable");
    
    // Handle response based on content type
    if (imgRes.body) {
      await pipeline(imgRes.body, res);
    } else {
      const buffer = Buffer.from(await imgRes.arrayBuffer());
      res.end(buffer);
    }
  } catch (err: any) {
    console.error("[Proxy Image] Error:", err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ 
      error: `Image proxy failed: ${err.message || 'Unknown error'}`,
      type: err.name || 'Error'
    }));
  }
}
