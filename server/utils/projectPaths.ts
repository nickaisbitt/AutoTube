import { existsSync } from "fs";

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
 * Requires an explicit projectPath (allowlisted) or projectId — never
 * auto-picks the newest /tmp file (cross-session leak / race).
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

  return null;
}
