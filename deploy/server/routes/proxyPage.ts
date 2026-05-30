import type { IncomingMessage, ServerResponse } from "http";
import { validateURL } from "../utils/security.js";

const MAX_PAGE_SIZE = 10 * 1024 * 1024; // 10 MB maximum
const MIN_PAGE_SIZE = 100; // 100 bytes minimum

export async function handleProxyPage(
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
    
    let currentUrl = decodedUrl;
    let redirectsCount = 0;
    const maxRedirects = 5;
    let pageRes: Response | null = null;

    while (redirectsCount < maxRedirects) {
      const urlSafety = await validateURL(currentUrl);
      if (!urlSafety.valid) {
        console.warn(`[Proxy Page] Blocked unsafe URL: ${urlSafety.error}`);
        res.statusCode = 403;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: `URL blocked for security: ${urlSafety.error}` }));
        return;
      }

      pageRes = await fetch(currentUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept-Encoding": "gzip, deflate, br",
          "Connection": "keep-alive",
          "Upgrade-Insecure-Requests": "1"
        },
        redirect: "manual",
        signal: AbortSignal.timeout(20000),
      });

      if ([301, 302, 303, 307, 308].includes(pageRes.status)) {
        const redirectLocation = pageRes.headers.get("location");
        if (!redirectLocation) {
          break;
        }
        currentUrl = new URL(redirectLocation, currentUrl).toString();
        redirectsCount++;
      } else {
        break;
      }
    }

    if (redirectsCount >= maxRedirects) {
      res.statusCode = 502;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Too many redirects" }));
      return;
    }

    if (!pageRes) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Failed to fetch page" }));
      return;
    }

    if (!pageRes.ok) {
      res.statusCode = 502;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ 
        error: `Failed to fetch page: ${pageRes.status} ${pageRes.statusText}`,
        status: pageRes.status,
        url: decodedUrl.substring(0, 100) + (decodedUrl.length > 100 ? "..." : "")
      }));
      return;
    }

    const contentType = pageRes.headers.get("Content-Type") || "text/html";
    
    res.setHeader("Content-Type", contentType);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Cache-Control", "public, max-age=3600");
    
    const buffer = Buffer.from(await pageRes.arrayBuffer());
    
    if (buffer.length < MIN_PAGE_SIZE) {
      res.statusCode = 415;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ 
        error: `Page too small: ${buffer.length} bytes (minimum ${MIN_PAGE_SIZE} bytes)`,
        size: buffer.length
      }));
      return;
    }
    
    if (buffer.length > MAX_PAGE_SIZE) {
      res.statusCode = 413;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ 
        error: `Page too large: ${(buffer.length / (1024 * 1024)).toFixed(2)}MB (maximum ${MAX_PAGE_SIZE / (1024 * 1024)}MB)`,
        size: buffer.length
      }));
      return;
    }
    
    res.end(buffer);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    const isDev = process.env.NODE_ENV !== 'production';
    console.error("[Proxy Page] Error:", err);
    if (res.headersSent) {
      res.end();
      return;
    }
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ 
      error: "Internal server error",
      code: "PROXY_ERROR",
      ...(isDev && { details: message })
    }));
  }
}
