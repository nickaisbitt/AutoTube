import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PROD_URL =
  process.env.AUTOTUBE_HEALTH_URL?.replace(/\/api\/health$/, '') ||
  'https://autotube-production.up.railway.app';

const EXTRA_ENV_LOCAL_PATHS = [
  '/home/node/autotube.env.local',
  path.join(os.homedir(), 'autotube.env.local'),
];

export function readEnvLocal(cwd = process.cwd()) {
  const merged = {};
  const candidates = [
    path.join(cwd, '.env.local'),
    ...EXTRA_ENV_LOCAL_PATHS,
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    Object.assign(merged, parseEnvLocalFile(file));
  }
  return merged;
}

function parseEnvLocalFile(file) {
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
    // Do not mirror into VITE_* — secrets stay server-side; UI uses /api/llm.
  }
  const apiKey = local.AUTOTUBE_API_KEY?.trim();
  if (apiKey) vars.AUTOTUBE_API_KEY = apiKey;
  if (local.VITE_SERPER_KEY?.trim()) vars.SERPER_API_KEY = local.VITE_SERPER_KEY.trim();
  if (local.SERPER_API_KEY?.trim()) vars.SERPER_API_KEY = local.SERPER_API_KEY.trim();
  if (local.KOKORO_SERVER_URL?.trim()) vars.KOKORO_SERVER_URL = local.KOKORO_SERVER_URL.trim();
  const pexels = local.PEXELS_API_KEY?.trim() || local.VITE_PEXELS_KEY?.trim();
  const pixabay = local.PIXABAY_API_KEY?.trim() || local.VITE_PIXABAY_KEY?.trim();
  if (pexels) {
    vars.PEXELS_API_KEY = pexels;
  }
  if (pixabay) {
    vars.PIXABAY_API_KEY = pixabay;
  }
  return vars;
}

/** Railway environment.config.services[id].variables shape */
export function varsForEnvironmentPatch(vars) {
  return Object.fromEntries(
    Object.entries(vars).map(([name, value]) => [name, { value, generator: null }]),
  );
}
