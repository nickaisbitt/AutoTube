import type { IncomingMessage, ServerResponse } from "http";
import { writeFileSync } from "fs";

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

  const projectId = rawProjectId ? rawProjectId.replace(/[^a-zA-Z0-9-_]/g, "") : "";
  const projectPath = projectId
    ? `/tmp/autotube-project-${projectId}.json`
    : "/tmp/autotube-project.json";

  const chunks: Buffer[] = [];

  await new Promise<void>((resolve, reject) => {
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const body = Buffer.concat(chunks).toString();
        writeFileSync(projectPath, body, "utf8");
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.end(JSON.stringify({ ok: true, path: projectPath }));
        resolve();
      } catch (err) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: String(err) }));
        resolve();
      }
    });
    req.on("error", (err: Error) => {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: `Request error: ${err.message}` }));
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
