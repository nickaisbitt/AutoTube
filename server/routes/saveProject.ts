import type { IncomingMessage, ServerResponse } from "http";
import { writeFileSync } from "fs";
import { projectPathFromId, sanitizeProjectId } from "../utils/projectPaths.js";

/**
 * POST /api/save-project
 * Save project JSON to a temp file (called from the store).
 */
export async function handleSaveProject(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(req.url!, `http://${req.headers.host}`);
  const rawProjectId = url.searchParams.get("id");
  
  if (rawProjectId && rawProjectId.length > 100) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Project ID too long (maximum 100 characters)" }));
    return;
  }

  const projectId = rawProjectId ? sanitizeProjectId(rawProjectId) : "";
  if (rawProjectId !== null && (!projectId || projectId !== rawProjectId)) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({
      error: "Invalid project id; use only letters, numbers, hyphens, and underscores",
    }));
    return;
  }
  const projectPath = projectPathFromId(projectId);

  const chunks: Buffer[] = [];

  await new Promise<void>((resolve, reject) => {
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const body = Buffer.concat(chunks).toString();
        writeFileSync(projectPath, body, "utf8");
        res.setHeader("Content-Type", "application/json");

        res.end(JSON.stringify({ ok: true, path: projectPath }));
        resolve();
      } catch (err) {
        console.error("[Save Project] Error:", err);
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({
          error: process.env.NODE_ENV === "production"
            ? "Project save failed"
            : String(err),
        }));
        resolve();
      }
    });
    req.on("error", (err: Error) => {
      console.error("[Save Project] Request error:", err);
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({
        error: process.env.NODE_ENV === "production"
          ? "Project save failed"
          : `Request error: ${err.message}`,
      }));
      reject(err);
    });
    req.on("close", () => {
      if (!res.writableEnded) {
        res.statusCode = 499;
        res.end();
        reject(new Error("Client disconnected"));
      }
    });
  });
}
