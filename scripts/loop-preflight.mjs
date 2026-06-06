#!/usr/bin/env node
/**
 * Preflight before video improvement loop (never prints secrets).
 */
import { spawnSync } from 'node:child_process';
import { applyEnvLocalToProcess } from './lib/railway-prod-env.mjs';
import { ensureRailwayApiTokenEnv } from './lib/railway-token.mjs';
import { checkDevServer, resolveOpenRouterKey } from './lib/generate-full-video.mjs';
import { assertTtsAvailable } from '../deploy/server-render/narration.mjs';

function have(cmd) {
  return spawnSync('which', [cmd], { encoding: 'utf8' }).status === 0;
}

export async function runLoopPreflight({ devServer, requireOpenRouter = true } = {}) {
  applyEnvLocalToProcess();
  ensureRailwayApiTokenEnv();

  const errors = [];
  const url = devServer || process.env.DEV_SERVER_URL || 'http://localhost:5173';

  if (!(await checkDevServer(url))) {
    errors.push(`Dev server not reachable at ${url} — run: npm run dev -- --port 5173 --host 0.0.0.0`);
  }

  if (requireOpenRouter && !resolveOpenRouterKey()) {
    errors.push('OPENROUTER_API_KEY missing — run: npm run env:sync-worker');
  }

  for (const bin of ['ffmpeg', 'ffprobe']) {
    if (!have(bin)) errors.push(`${bin} not found on PATH`);
  }

  try {
    const providers = assertTtsAvailable();
    if (providers.edgeTts) {
      console.log('[preflight] TTS: edge-tts OK');
    } else if (providers.kokoro) {
      console.log('[preflight] TTS: kokoro OK');
    } else if (providers.melo) {
      console.log('[preflight] TTS: melo OK');
    }
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
  }

  if (errors.length) {
    console.error('\n❌ Loop preflight failed:\n');
    for (const err of errors) console.error(`  - ${err.split('\n')[0]}`);
    return false;
  }

  console.log('[preflight] OK — dev server, OpenRouter, ffmpeg, TTS');
  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ok = await runLoopPreflight();
  process.exit(ok ? 0 : 1);
}
