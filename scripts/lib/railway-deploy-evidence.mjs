/** Shared prod/deploy freshness checks (Railpack git + GHCR image). */
import { spawnSync } from 'node:child_process';

export function gitHead(cwd = process.cwd()) {
  const r = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', cwd });
  return r.status === 0 ? r.stdout.trim() : null;
}

export function imageTagFromDeploy(deploy) {
  const img = deploy?.meta?.image ?? '';
  if (!img.includes(':')) return '';
  return img.split(':').pop() ?? '';
}

export function shaMatches(a, b) {
  if (!a || !b) return false;
  const A = a.toLowerCase();
  const B = b.toLowerCase();
  return A.startsWith(B) || B.startsWith(A) || A.slice(0, 7) === B.slice(0, 7);
}

export function deployMatchesLocal(deploy, localSha) {
  if (!localSha || !deploy) return false;
  if (shaMatches(deploy.meta?.commitHash, localSha)) return true;
  return shaMatches(imageTagFromDeploy(deploy), localSha);
}

/** Health container looks newly rolled (startUptime=0 means old pod already gone). */
export function isFreshUptime(uptime, startUptime) {
  if (uptime < 900) return true;
  if (startUptime > 60 && uptime < startUptime * 0.5) return true;
  if (startUptime <= 60 && uptime < 86_400) return true;
  return false;
}

export function prodLooksLive({ health, latestDeploy, localSha }) {
  if (health?.error || health?.status !== 'ok') return false;
  if (latestDeploy?.status !== 'SUCCESS') return false;

  // Prefer explicit deploy provenance over uptime heuristics (long-lived
  // healthy GHCR pods can exceed 24h and still be on the correct SHA).
  if (health.deploy?.gitCommit && localSha) {
    return shaMatches(health.deploy.gitCommit, localSha);
  }
  if (health.deploy?.deployImage && localSha) {
    return shaMatches(String(health.deploy.deployImage).split(':').pop() || '', localSha);
  }
  if (latestDeploy?.meta?.image && localSha) {
    return deployMatchesLocal(latestDeploy, localSha);
  }

  // No provenance available — only then treat >24h uptime as stale.
  if ((health.uptime ?? 0) > 86_400) return false;
  return (health.uptime ?? 0) < 86_400;
}
