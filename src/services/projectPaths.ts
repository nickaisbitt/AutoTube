/**
 * Project-ID-scoped temp file path helper.
 *
 * Replaces the fixed `/tmp/autotube-project.json` path with per-project
 * paths to support multiple concurrent projects without file conflicts.
 */

/**
 * Returns the temp file path for a given project ID.
 * Format: `/tmp/autotube-project-{projectId}.json`
 */
export function getProjectTempPath(projectId: string): string {
  return `/tmp/autotube-project-${projectId}.json`;
}
