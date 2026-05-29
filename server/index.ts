import type { IncomingMessage, ServerResponse } from "http";
import { cors } from "./middleware/cors.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { rateLimitMiddleware } from "./middleware/rateLimiter.js";
import { handleProxyImage } from "./routes/proxyImage.js";
import { handleRenderVideo } from "./routes/renderVideo.js";
import { handleServerRender } from "./routes/serverRender.js";
import { handleRenderOutput } from "./routes/renderOutput.js";
import { handleRenderProgress } from "./routes/renderProgress.js";
import { handleSaveProject } from "./routes/saveProject.js";
import { handleExportProject } from "./routes/exportProject.js";
import { handleSearchVideos } from "./routes/searchVideos.js";
import { handleDownloadClip } from "./routes/downloadClip.js";
import { handleSearch } from "./routes/search.js";
import { handleSearchBingImages, handleSearchGoogleImages, handleSearchDuckDuckGoImages, handleSearchBingVideos, handleSearchGoogleVideos, handleSearchBingNews, handleSearchFlickr, handleSearchArchive, handleSearchUnsplash, handleSearchDailymotion, handleSearchVimeo, handleSearchGiphy, handleSearchNASA, handleSearchGovPress, handleSearchHybrid, handleSearchYandexImages } from "./routes/searchImages.js";
import { handleStaticMap } from "./routes/staticMap.js";
import { handlePressRelease } from "./routes/pressRelease.js";
import { handleNotify } from "./routes/notify.js";
import { handleQualityCheck } from "./routes/qualityCheck.js";
import { handleHealth } from "./routes/health.js";
import { handleDocs } from "./routes/docs.js";
import { handleErrors } from "./routes/errors.js";
import { handleProxyPage } from "./routes/proxyPage.js";
import { handleDeepHarvest } from "./routes/deepHarvest.js";

/**
 * Connect-compatible middleware that handles all /api/* routes.
 * Designed to be mounted via Vite's `server.middlewares.use()`.
 *
 * This is NOT an Express app — it's a single Connect middleware function
 * that dispatches to individual route handlers based on URL matching.
 */
export function apiMiddleware(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
): void {
  // Only handle /api/ routes
  if (!req.url?.startsWith("/api/")) {
    next();
    return;
  }

  // SECURITY: Content-Security-Policy
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; media-src 'self' blob:;"
  );

  // SECURITY: POST Request Body Size Limits (max 10MB)
  if (req.method === "POST") {
    const contentLength = parseInt(req.headers["content-length"] || "0", 10);
    const MAX_BODY_SIZE = 10 * 1024 * 1024; // 10MB
    if (contentLength > MAX_BODY_SIZE) {
      res.statusCode = 413;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Payload Too Large: maximum body size is 10MB" }));
      return;
    }

    let totalSize = 0;
    const sizeTracker = (chunk: Buffer) => {
      totalSize += chunk.length;
      if (totalSize > MAX_BODY_SIZE) {
        res.statusCode = 413;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Payload Too Large: maximum body size is 10MB" }));
        req.destroy();
        return;
      }
    };
    req.on("data", sizeTracker);
    res.on("close", () => {
      req.off("data", sizeTracker);
    });
  }

  // Apply CORS headers for all API routes
  cors(req, res, () => {});

  // Rate limiting applied to all API routes — check return value and return early if handled
  if (rateLimitMiddleware(req, res, () => {})) {
    return;
  }

  // Debug: log all /api/ requests (only in dev or when DEBUG_API is set)
  if (process.env.NODE_ENV !== 'production' || process.env.DEBUG_API) {
    console.log(`[API] ${req.method} ${req.url}`);
  }

  // Dispatch to route handlers
  const dispatch = async () => {
    try {
      if (req.url!.startsWith("/api/health")) {
        await handleHealth(req, res);
      } else if (req.url!.startsWith("/api/docs")) {
        await handleDocs(req, res);
      } else if (req.url!.startsWith("/api/errors")) {
        await handleErrors(req, res);
      } else if (req.url!.startsWith("/api/proxy-image")) {
        await handleProxyImage(req, res);
      } else if (req.url!.startsWith("/api/proxy-page")) {
        await handleProxyPage(req, res);
      } else if (req.url!.startsWith("/api/deep-harvest")) {
        await handleDeepHarvest(req, res);
      } else if (req.url!.startsWith("/api/render-progress")) {
        await handleRenderProgress(req, res);
      } else if (
        req.url!.startsWith("/api/render-video")
      ) {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }
        await handleRenderVideo(req, res);
      } else if (
        req.url!.startsWith("/api/server-render")
      ) {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }
        await handleServerRender(req, res);
      } else if (req.url!.startsWith("/api/render-output/")) {
        await handleRenderOutput(req, res);
      } else if (
        req.url!.startsWith("/api/save-project")
      ) {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }
        await handleSaveProject(req, res);
      } else if (req.url!.startsWith("/api/export-project")) {
        await handleExportProject(req, res);
      } else if (req.url!.startsWith("/api/search-videos")) {
        await handleSearchVideos(req, res);
      } else if (req.url!.startsWith("/api/download-clip")) {
        await handleDownloadClip(req, res);
      } else if (req.url!.startsWith("/api/search-flickr")) {
        await handleSearchFlickr(req, res);
      } else if (req.url!.startsWith("/api/search-archive")) {
        await handleSearchArchive(req, res);
      } else if (req.url!.startsWith("/api/search-nasa")) {
        await handleSearchNASA(req, res);
      } else if (req.url!.startsWith("/api/search-govpress")) {
        await handleSearchGovPress(req, res);
      } else if (req.url!.startsWith("/api/search-bing-images")) {
        await handleSearchBingImages(req, res);
      } else if (req.url!.startsWith("/api/search-google-images")) {
        await handleSearchGoogleImages(req, res);
      } else if (req.url!.startsWith("/api/search-yandex-images")) {
        await handleSearchYandexImages(req, res);
      } else if (req.url!.startsWith("/api/search-duckduckgo-images")) {
        await handleSearchDuckDuckGoImages(req, res);
      } else if (req.url!.startsWith("/api/search-bing-videos")) {
        await handleSearchBingVideos(req, res);
      } else if (req.url!.startsWith("/api/search-google-videos")) {
        await handleSearchGoogleVideos(req, res);
      } else if (req.url!.startsWith("/api/search-unsplash")) {
        await handleSearchUnsplash(req, res);
      } else if (req.url!.startsWith("/api/search-dailymotion")) {
        await handleSearchDailymotion(req, res);
      } else if (req.url!.startsWith("/api/search-vimeo")) {
        await handleSearchVimeo(req, res);
      } else if (req.url!.startsWith("/api/search-giphy")) {
        await handleSearchGiphy(req, res);
      } else if (req.url!.startsWith("/api/search-bing-news")) {
        await handleSearchBingNews(req, res);
      } else if (req.url!.startsWith("/api/search-hybrid")) {
        await handleSearchHybrid(req, res);
      } else if (req.url!.startsWith("/api/static-map")) {
        await handleStaticMap(req, res);
      } else if (req.url!.startsWith("/api/press-release")) {
        await handlePressRelease(req, res);
      } else if (req.url!.startsWith("/api/search")) {
        await handleSearch(req, res);
      } else if (
        req.url!.startsWith("/api/notify")
      ) {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }
        await handleNotify(req, res);
      } else if (
        req.url!.startsWith("/api/quality-check")
      ) {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }
        await handleQualityCheck(req, res);
      } else {
        // No matching route — pass to next middleware
        next();
      }
    } catch (err) {
      errorHandler(
        err instanceof Error ? err : new Error(String(err)),
        req,
        res,
        next,
      );
    }
  };

  dispatch().catch((err) => {
    if (res.writableEnded || res.destroyed) return;
    errorHandler(
      err instanceof Error ? err : new Error(String(err)),
      req,
      res,
      next,
    );
  });
}
