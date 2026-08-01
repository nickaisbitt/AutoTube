import type { IncomingMessage, ServerResponse } from "http";
import { readFileSync, existsSync } from "fs";
import { projectPathFromId, sanitizeProjectId } from "../utils/projectPaths.js";

/**
 * GET /api/export-project?id=...
 * Export a saved project from /tmp. Requires explicit id (no newest-file fallback).
 */
export async function handleExportProject(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const projectId = url.searchParams.get("id");

    if (!projectId || !projectId.trim()) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "Missing required query parameter: id",
        }),
      );
      return;
    }

    if (projectId.length > 100) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Project ID too long (maximum 100 characters)" }));
      return;
    }

    const sanitizedId = sanitizeProjectId(projectId);
    if (!sanitizedId || sanitizedId !== projectId) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({
        error: "Invalid project id; use only letters, numbers, hyphens, and underscores",
      }));
      return;
    }

    const projectPath = projectPathFromId(sanitizedId);

    if (!existsSync(projectPath)) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "No project saved yet." }));
      return;
    }

    const data = readFileSync(projectPath, "utf8");
    res.setHeader("Content-Type", "application/json");

    res.end(data);
  } catch (err) {
    console.error("[Export Project] Error:", err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({
      error: process.env.NODE_ENV === "production"
        ? "Project export failed"
        : String(err),
    }));
  }
}
