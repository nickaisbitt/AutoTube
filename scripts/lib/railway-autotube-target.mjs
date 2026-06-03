/**
 * AutoTube production Railway IDs (AutoTube-Deploy).
 *
 * Cloud Agent workers inject cursor-self-hosted-worker IDs — ignore those for deploy.
 */
export const AUTOTUBE_PROJECT_ID = '7dea09b5-106d-4706-bd61-afe29e7b7284';

/** Override via env if service/environment IDs are known */
export function getAutotubeRailwayTarget() {
  const ignoreWorkerRailwayEnv = process.env.RAILWAY_SERVICE_NAME?.trim() === 'cursor-worker';

  const projectId =
    process.env.AUTOTUBE_RAILWAY_PROJECT_ID?.trim() ||
    process.env.RAILWAY_AUTOTUBE_PROJECT_ID?.trim() ||
    (ignoreWorkerRailwayEnv
      ? AUTOTUBE_PROJECT_ID
      : process.env.RAILWAY_PROJECT_ID?.trim() || AUTOTUBE_PROJECT_ID);

  return {
    projectId,
    environment: process.env.RAILWAY_ENVIRONMENT?.trim() || 'production',
    service: process.env.RAILWAY_SERVICE?.trim() || 'autotube',
    ignoreWorkerRailwayEnv,
  };
}
