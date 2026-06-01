import type { IncomingMessage, ServerResponse } from "http";
import { validateURL } from "../utils/security.js";

// Image proxy security constants
const MAX_IMAGE_SIZE = 50 * 1024 * 1024; // 50 MB maximum
const MIN_IMAGE_SIZE = 1024; // 1 KB minimum

/**
 * GET /api/proxy-image?url=...
 * Image proxy — eliminates CORS / canvas-taint issues with SSRF & redirect safety.
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
    
    // Follow redirects manually to inspect each URL for SSRF safety
    let currentUrl = decodedUrl;
    let redirectsCount = 0;
    const maxRedirects = 5;
    let imgRes: Response | null = null;

    while (redirectsCount < maxRedirects) {
      // SECURITY: Validate URL safety (SSRF protection)
      const urlSafety = await validateURL(currentUrl);
      if (!urlSafety.valid) {
        console.warn(`[Proxy Image] Blocked unsafe URL: ${urlSafety.error}`);
        res.statusCode = 403;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: `URL blocked for security: ${urlSafety.error}` }));
        return;
      }

      imgRes = await fetch(currentUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
          "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept-Encoding": "gzip, deflate, br",
          "Connection": "keep-alive",
          "Upgrade-Insecure-Requests": "1"
        },
        redirect: "manual", // Prevent automatic redirect following
        signal: AbortSignal.timeout(15000),
      });

      // Handle redirect manually
      if ([301, 302, 303, 307, 308].includes(imgRes.status)) {
        const redirectLocation = imgRes.headers.get("location");
        if (!redirectLocation) {
          break;
        }
        // Resolve relative redirects against current URL
        currentUrl = new URL(redirectLocation, currentUrl).toString();
        redirectsCount++;
      } else {
        break;
      }
    }

    if (redirectsCount >= maxRedirects) {
      res.statusCode = 502; // Bad Gateway
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Too many redirects" }));
      return;
    }

    if (!imgRes) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Failed to fetch image" }));
      return;
    }

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
    
    // Validate Content-Type is an image
    const lowerType = contentType.toLowerCase();
    if (lowerType.includes('html') || lowerType.includes('text/html')) {
      res.statusCode = 415; // Unsupported Media Type
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ 
        error: "Response is HTML, not an image. URL may be invalid or blocked.",
        detectedType: contentType
      }));
      return;
    }
    
    // Set headers
    res.setHeader("Content-Type", contentType);

    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Cache-Control", "public, max-age=86400");
    
    const buffer = Buffer.from(await imgRes.arrayBuffer());
    
    // Validate file size
    if (buffer.length < MIN_IMAGE_SIZE) {
      res.statusCode = 415;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ 
        error: `Image too small: ${(buffer.length / 1024).toFixed(2)}KB (minimum ${MIN_IMAGE_SIZE / 1024}KB)`,
        size: buffer.length
      }));
      return;
    }
    
    if (buffer.length > MAX_IMAGE_SIZE) {
      res.statusCode = 413; // Payload Too Large
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ 
        error: `Image too large: ${(buffer.length / (1024 * 1024)).toFixed(2)}MB (maximum ${MAX_IMAGE_SIZE / (1024 * 1024)}MB)`,
        size: buffer.length
      }));
      return;
    }
    
    // Simple magic-byte validation for common image formats
    const magic = buffer.slice(0, 4);
    const isJpeg = magic[0] === 0xFF && magic[1] === 0xD8;
    const isPng = magic[0] === 0x89 && magic[1] === 0x50 && magic[2] === 0x4E && magic[3] === 0x47;
    const isGif = magic[0] === 0x47 && magic[1] === 0x49 && magic[2] === 0x46;
    if (!isJpeg && !isPng && !isGif) {
      res.statusCode = 415;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        error: 'Invalid image content: magic bytes do not match JPEG/PNG/GIF',
        detectedType: contentType,
      }));
      return;
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    const isDev = process.env.NODE_ENV !== 'production';
    console.error("[Proxy Image] Error:", err);
    if (res.headersSent) {
      // Client disconnected or headers already sent — cannot send error response
      res.end();
      return;
    }
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ 
      error: "Internal server error",
      code: "PROXY_ERROR",
      ...(isDev && { details: message }) // Only leak details in development
    }));
  }
}
