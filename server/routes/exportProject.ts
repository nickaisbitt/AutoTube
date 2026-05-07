import type { IncomingMessage, ServerResponse } from "http";
import { readFileSync, existsSync, readdirSync, statSync } from "fs";

/**
 * GET /api/export-project
 * Export project from temp file (called from server-render.mjs).
 */
export async function handleExportProject(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const projectId = url.searchParams.get("id");

    let projectPath: string;
    if (projectId) {
      projectPath = `/tmp/autotube-project-${projectId}.json`;
    } else {
      // Backward compat: try fixed path first, then find the most recent project file
      projectPath = "/tmp/autotube-project.json";
      if (!existsSync(projectPath)) {
        // Find the most recently modified autotube project file
        const tmpFiles = readdirSync("/tmp")
          .filter(
            (f: string) =>
              f.startsWith("autotube-project-") && f.endsWith(".json"),
          )
          .map((f: string) => `/tmp/${f}`);
        if (tmpFiles.length > 0) {
          tmpFiles.sort(
            (a: string, b: string) => statSync(b).mtimeMs - statSync(a).mtimeMs,
          );
          projectPath = tmpFiles[0];
        }
      }
    }

    if (!existsSync(projectPath)) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "No project saved yet." }));
      return;
    }

    const data = readFileSync(projectPath, "utf8");
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.end(data);
  } catch (err) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: String(err) }));
  }
}
