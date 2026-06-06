import fs from 'node:fs';
import path from 'node:path';

const PROD_URL =
  process.env.AUTOTUBE_HEALTH_URL?.replace(/\/api\/health$/, '') ||
  'https://autotube-production.up.railway.app';

export function readEnvLocal(cwd = process.cwd()) {
  const file = path.join(cwd, '.env.local');
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

/** Load gitignored .env.local into process.env (does not override existing vars). */
export function applyEnvLocalToProcess(cwd = process.cwd()) {
  for (const [key, value] of Object.entries(readEnvLocal(cwd))) {
    if (value && !process.env[key]?.trim()) {
      process.env[key] = value;
    }
  }
}

/** Production service variables for Railway environment patch (single commit, no per-var storms). */
export function buildProdRailwayVars(local = readEnvLocal()) {
  const openRouter =
    local.OPENROUTER_API_KEY?.trim() ||
    local.VITE_OPENROUTER_KEY?.trim() ||
    '';
  const vars = {
    TRUST_PROXY: 'true',
    ALLOWED_ORIGINS: PROD_URL,
    AUTOTUBE_FORCE_CPU: '1',
    NODE_ENV: 'production',
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1',
    AUTOTUBE_DISABLE_BROWSER_SEARCH: '1',
    NODE_OPTIONS: '--max-old-space-size=3072',
    RAILPACK_BUILD_APT_PACKAGES: 'pkg-config libcairo2-dev libjpeg-dev python3-pip',
    RAILPACK_DEPLOY_APT_PACKAGES: 'ffmpeg python3 python3-pip',
  };
  if (openRouter) {
    vars.OPENROUTER_API_KEY = openRouter;
    vars.VITE_OPENROUTER_KEY = openRouter;
  }
  if (local.VITE_SERPER_KEY?.trim()) vars.VITE_SERPER_KEY = local.VITE_SERPER_KEY.trim();
  if (local.KOKORO_SERVER_URL?.trim()) vars.KOKORO_SERVER_URL = local.KOKORO_SERVER_URL.trim();
  return vars;
}

/** Railway environment.config.services[id].variables shape */
export function varsForEnvironmentPatch(vars) {
  return Object.fromEntries(
    Object.entries(vars).map(([name, value]) => [name, { value, generator: null }]),
  );
}
