import { existsSync, readdirSync, statSync } from "fs";

const PROJECT_PATH_RE = /^\/tmp\/autotube-project(-[a-zA-Z0-9-_]+)?\.json$/;

export function sanitizeProjectId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9-_]/g, "");
}

export function isAllowedProjectPath(path: string): boolean {
  return PROJECT_PATH_RE.test(path);
}

export function projectPathFromId(projectId: string): string {
  const sanitizedId = sanitizeProjectId(projectId);
  return sanitizedId
    ? `/tmp/autotube-project-${sanitizedId}.json`
    : "/tmp/autotube-project.json";
}

/**
 * Resolve the on-disk project JSON path for server-render.
 * Prefers an explicit path from save-project, then projectId, then legacy fallbacks.
 */
export function resolveSavedProjectPath(body: Record<string, unknown>): string | null {
  const projectPath =
    typeof body.projectPath === "string" ? body.projectPath.trim() : "";
  if (projectPath && isAllowedProjectPath(projectPath) && existsSync(projectPath)) {
    return projectPath;
  }

  const rawId = typeof body.projectId === "string" ? body.projectId : "";
  if (rawId) {
    const idPath = projectPathFromId(rawId);
    if (existsSync(idPath)) return idPath;
  }

  if (existsSync("/tmp/autotube-project.json")) {
    return "/tmp/autotube-project.json";
  }

  const tmpFiles = readdirSync("/tmp")
    .filter((f) => f.startsWith("autotube-project") && f.endsWith(".json"))
    .map((f) => `/tmp/${f}`);
  if (tmpFiles.length === 0) return null;

  tmpFiles.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return tmpFiles[0];
}
