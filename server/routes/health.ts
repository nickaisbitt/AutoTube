import type { IncomingMessage, ServerResponse } from "http";

export async function handleHealth(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  let mem: NodeJS.MemoryUsage;
  try {
    mem = process.memoryUsage();
  } catch {
    mem = { rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 };
  }

  const gitCommit =
    process.env.RAILWAY_GIT_COMMIT_SHA?.trim() ||
    process.env.GIT_COMMIT?.trim() ||
    null;
  const gitBranch =
    process.env.RAILWAY_GIT_BRANCH?.trim() ||
    process.env.GIT_BRANCH?.trim() ||
    null;
  const gitRepo = process.env.RAILWAY_GIT_REPO_OWNER?.trim()
    ? `${process.env.RAILWAY_GIT_REPO_OWNER}/${process.env.RAILWAY_GIT_REPO_NAME ?? ""}`.replace(
        /\/$/,
        "",
      )
    : null;
  const deployImage = process.env.DEPLOY_IMAGE?.trim() || null;

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      status: "ok",
      uptime: process.uptime(),
      deploy: {
        gitCommit,
        gitBranch,
        gitRepo,
        deployImage,
        sourceConnected: Boolean(gitRepo && gitCommit),
      },
      memoryUsage: {
        rss: mem.rss,
        heapTotal: mem.heapTotal,
        heapUsed: mem.heapUsed,
        external: mem.external,
      },
    }),
  );
}
