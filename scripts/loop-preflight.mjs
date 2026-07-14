#!/usr/bin/env node
/**
 * Preflight before video improvement loop (never prints secrets).
 */
import { spawnSync } from 'node:child_process';
import { statSync, unlinkSync } from 'node:fs';
import { applyEnvLocalToProcess } from './lib/railway-prod-env.mjs';
import { ensureRailwayApiTokenEnv } from './lib/railway-token.mjs';
import { checkDevServer, resolveOpenRouterKey } from './lib/generate-full-video.mjs';
import { assertTtsAvailable } from '../deploy/server-render/narration.mjs';

function have(cmd) {
  return spawnSync('which', [cmd], { encoding: 'utf8' }).status === 0;
}

function probeEdgeTts() {
  const out = '/tmp/autotube-preflight-tts.mp3';
  try {
    unlinkSync(out);
  } catch {
    /* ignore */
  }
  const r = spawnSync('edge-tts', ['--text', 'preflight', '--write-media', out], {
    encoding: 'utf8',
    timeout: 30_000,
  });
  try {
    const st = statSync(out);
    if (st.size > 500) return true;
  } catch {
    /* fall through */
  }
  const detail = (r.stderr || r.stdout || '').split('\n').find((l) => l.trim()) || 'no output file';
  throw new Error(`edge-tts synthesis failed — upgrade: pip install --break-system-packages 'edge-tts>=7.2.7' (${detail.slice(0, 120)})`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Wait for dev server between loop iterations (worker may OOM-kill Vite). */
export async function waitForDevServer(devServer, { maxWaitMs = 120_000, pollMs = 5000 } = {}) {
  const url = devServer || process.env.DEV_SERVER_URL || 'http://localhost:5173';
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    if (await checkDevServer(url)) return true;
    console.log(`[preflight] Waiting for dev server at ${url}...`);
    await sleep(pollMs);
  }
  return false;
}

export async function runLoopPreflight({ devServer, requireOpenRouter = true } = {}) {
  applyEnvLocalToProcess();
  ensureRailwayApiTokenEnv();

  const errors = [];
  const url = devServer || process.env.DEV_SERVER_URL || 'http://localhost:5173';

  if (!(await checkDevServer(url))) {
    console.log(`[preflight] Dev server down — waiting up to 90s (restart: npm run loop:serve)`);
    if (!(await waitForDevServer(url, { maxWaitMs: 90_000, pollMs: 5000 }))) {
      errors.push(`Dev server not reachable at ${url} — run: npm run loop:serve (vite preview lacks /api routes)`);
    }
  }

  if (requireOpenRouter && !resolveOpenRouterKey()) {
    errors.push('OPENROUTER_API_KEY missing — run: npm run env:sync-worker');
  }

  for (const bin of ['ffmpeg', 'ffprobe']) {
    if (!have(bin)) errors.push(`${bin} not found on PATH`);
  }

  const pipOpt = 'pip install --break-system-packages';
  const scenedetect = spawnSync('python3', ['-c', 'import scenedetect'], { encoding: 'utf8' });
  if (scenedetect.status !== 0) {
    console.log(`[preflight] scenedetect optional — scene QA skipped (${pipOpt} scenedetect)`);
  } else {
    console.log('[preflight] scenedetect OK');
  }

  const whisper = spawnSync('python3', ['-c', 'import faster_whisper'], { encoding: 'utf8' });
  if (whisper.status !== 0) {
    console.log(`[preflight] faster-whisper optional — whisper align skipped; estimated VTT used (${pipOpt} faster-whisper)`);
  } else {
    console.log('[preflight] faster-whisper OK');
  }

  try {
    const providers = assertTtsAvailable();
    if (providers.edgeTts) {
      probeEdgeTts();
      console.log('[preflight] TTS: edge-tts OK (synthesis probe passed)');
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
