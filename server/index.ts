import type { IncomingMessage, ServerResponse } from "http";
import { cors } from "./middleware/cors.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { handleProxyImage } from "./routes/proxyImage.js";
import { handleRenderVideo } from "./routes/renderVideo.js";
import { handleServerRender } from "./routes/serverRender.js";
import { handleRenderOutput } from "./routes/renderOutput.js";
import { handleSaveProject } from "./routes/saveProject.js";
import { handleExportProject } from "./routes/exportProject.js";
import { handleSearchVideos } from "./routes/searchVideos.js";
import { handleDownloadClip } from "./routes/downloadClip.js";
import { handleSearch } from "./routes/search.js";
import { handleNotify } from "./routes/notify.js";

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

  // Apply CORS headers for all API routes
  cors(req, res, () => {});

  // Debug: log all /api/ requests (only in dev or when DEBUG_API is set)
  if (process.env.NODE_ENV !== 'production' || process.env.DEBUG_API) {
    console.log(`[API] ${req.method} ${req.url}`);
  }

  // Dispatch to route handlers
  const dispatch = async () => {
    try {
      if (req.url!.startsWith("/api/proxy-image")) {
        await handleProxyImage(req, res);
      } else if (
        req.url!.startsWith("/api/render-video") &&
        req.method === "POST"
      ) {
        await handleRenderVideo(req, res);
      } else if (
        req.url!.startsWith("/api/server-render") &&
        req.method === "POST"
      ) {
        await handleServerRender(req, res);
      } else if (req.url!.startsWith("/api/render-output/")) {
        await handleRenderOutput(req, res);
      } else if (
        req.url!.startsWith("/api/save-project") &&
        req.method === "POST"
      ) {
        await handleSaveProject(req, res);
      } else if (req.url!.startsWith("/api/export-project")) {
        await handleExportProject(req, res);
      } else if (req.url!.startsWith("/api/search-videos")) {
        await handleSearchVideos(req, res);
      } else if (req.url!.startsWith("/api/download-clip")) {
        await handleDownloadClip(req, res);
      } else if (req.url!.startsWith("/api/search")) {
        await handleSearch(req, res);
      } else if (
        req.url!.startsWith("/api/notify") &&
        req.method === "POST"
      ) {
        await handleNotify(req, res);
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

  dispatch();
}
