/**
 * AutoTube production Railway target (AutoTube-Deploy).
 *
 * Cloud Agent workers inject cursor-self-hosted-worker IDs — ignore those for deploy.
 * Use project **name** for CLI link unless AUTOTUBE_RAILWAY_PROJECT_ID is set explicitly.
 */
export const AUTOTUBE_PROJECT_NAME = 'AutoTube-Deploy';
/** From Railway GraphQL (AutoTube-Deploy) — not the API token */
export const AUTOTUBE_PROJECT_ID = '283b075f-eb25-4a60-8468-a45d77e068bc';

export function getAutotubeRailwayTarget() {
  const ignoreWorkerRailwayEnv = process.env.RAILWAY_SERVICE_NAME?.trim() === 'cursor-worker';

  const projectId =
    process.env.AUTOTUBE_RAILWAY_PROJECT_ID?.trim() ||
    (process.env.RAILWAY_SERVICE_NAME?.trim() === 'cursor-worker'
      ? AUTOTUBE_PROJECT_ID
      : process.env.RAILWAY_PROJECT_ID?.trim() || AUTOTUBE_PROJECT_ID);
  const projectName =
    process.env.RAILWAY_PROJECT?.trim() ||
    process.env.AUTOTUBE_RAILWAY_PROJECT_NAME?.trim() ||
    AUTOTUBE_PROJECT_NAME;

  return {
    projectId,
    projectName,
    environment: process.env.RAILWAY_ENVIRONMENT?.trim() || 'production',
    service: process.env.RAILWAY_SERVICE?.trim() || 'autotube',
    ignoreWorkerRailwayEnv,
  };
}
