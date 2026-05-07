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
  const projectId = url.searchParams.get("id");
  const projectPath = projectId
    ? `/tmp/autotube-project-${projectId}.json`
    : "/tmp/autotube-project.json";

  const chunks: Buffer[] = [];
  req.on("data", (chunk: Buffer) => chunks.push(chunk));
  req.on("end", () => {
    try {
      const body = Buffer.concat(chunks).toString();
      writeFileSync(projectPath, body, "utf8");
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.end(JSON.stringify({ ok: true, path: projectPath }));
    } catch (err) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: String(err) }));
    }
  });
}
