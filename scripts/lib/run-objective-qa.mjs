/**
 * Bridge to server/quality-check/check_quality.py for objective loop gates.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveOpenRouterKey } from './generate-full-video.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');
const CHECK_SCRIPT = join(ROOT, 'server/quality-check/check_quality.py');

const MIN_OBJECTIVE_SCORE = 75;
const MAX_SILENCE_FIRST_60S = 1.0;

/**
 * @param {string} videoPath
 * @param {{ skipVision?: boolean }} [options]
 */
export function runObjectiveQa(videoPath, options = {}) {
  if (!existsSync(videoPath)) {
    return { pass: false, error: `Video not found: ${videoPath}` };
  }
  if (!existsSync(CHECK_SCRIPT)) {
    return { pass: false, error: 'check_quality.py missing' };
  }

  const args = [CHECK_SCRIPT, videoPath, '--json', '--skip-vision'];
  if (!options.skipVision) {
    const key = resolveOpenRouterKey();
    if (key) {
      args.push('--api-key', key);
    } else {
      args.push('--skip-vision');
    }
  }

  const r = spawnSync('python3', args, {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 300_000,
    env: { ...process.env },
  });

  if (r.status !== 0) {
    return {
      pass: false,
      error: (r.stderr || r.stdout || 'check_quality failed').slice(-500),
    };
  }

  let report;
  try {
    const sanitized = (r.stdout || '')
      .replace(/\b-Infinity\b/g, 'null')
      .replace(/\bInfinity\b/g, 'null')
      .replace(/\bNaN\b/g, 'null');
    report = JSON.parse(sanitized);
  } catch {
    return { pass: false, error: 'check_quality JSON parse failed' };
  }

  const score = report.score ?? 0;
  const silence = report.metrics?.silence;
  const silenceFirst60 = (silence?.gaps || [])
    .filter((g) => g.start < 60)
    .reduce((sum, g) => sum + (g.duration || 0), 0);

  const scorePass = score >= MIN_OBJECTIVE_SCORE;
  const silencePass = silenceFirst60 <= MAX_SILENCE_FIRST_60S;
  const pass = scorePass && silencePass;

  return {
    pass,
    score,
    scorePass,
    silencePass,
    silenceFirst60Sec: Math.round(silenceFirst60 * 100) / 100,
    metrics: report.metrics,
    issues: report.issues || [],
    thresholds: {
      minScore: MIN_OBJECTIVE_SCORE,
      maxSilenceFirst60Sec: MAX_SILENCE_FIRST_60S,
    },
  };
}

/**
 * Composite objective gate from scene QA + technical QA.
 * @param {{ sceneQa?: object, objectiveQa?: object, renderTier?: string }} parts
 */
export function evaluateObjectiveGate(parts) {
  const scene = parts.sceneQa;
  const tech = parts.objectiveQa;
  const checks = [];

  if (scene?.available) {
    checks.push({ name: 'scene_hook', pass: scene.hookPass === true, detail: `longest hook shot ${scene.longestHookSec?.toFixed(1)}s` });
    checks.push({ name: 'scene_body', pass: scene.bodyPass === true, detail: `longest shot ${scene.longestSceneSec?.toFixed(1)}s` });
  }
  if (tech) {
    checks.push({ name: 'tech_score', pass: tech.scorePass === true, detail: `score ${tech.score}/100` });
    checks.push({ name: 'silence', pass: tech.silencePass === true, detail: `${tech.silenceFirst60Sec}s silence in first 60s` });
  }

  const available = checks.length > 0;
  const pass = available && checks.every((c) => c.pass);

  return { pass, checks, available };
}
