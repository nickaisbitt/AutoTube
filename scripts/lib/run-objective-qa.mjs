/**
 * Bridge to server/quality-check/check_quality.py for objective loop gates.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveOpenRouterKey } from './generate-full-video.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');
const CHECK_SCRIPT = join(ROOT, 'server/quality-check/check_quality.py');

const MIN_OBJECTIVE_SCORE = 75;
const MAX_SILENCE_FIRST_60S = 1.0;
const MAX_PLACEHOLDER_PCT = 10;

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
 * @param {string} videoPath
 * @param {number} [durationSec]
 */
export function evaluateClipCountGate(videoPath, durationSec = 0) {
  const manifestPath = join(dirname(videoPath), 'ffmpeg-assembly', 'render-manifest.json');
  if (!existsSync(manifestPath)) {
    return { available: false };
  }
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const dur = durationSec || manifest.muxDurationSec || manifest.videoSec || 0;
    const minClips = Math.max(1, Math.floor(dur / 5));
    const clipCount = manifest.clipCount || 0;
    return {
      available: true,
      pass: clipCount >= minClips,
      clipCount,
      minClips,
      tpadSec: manifest.tpadSec ?? 0,
    };
  } catch {
    return { available: false };
  }
}

/**
 * @param {string} videoPath
 */
export function evaluatePlaceholderGate(videoPath) {
  const assemblyDir = join(dirname(videoPath), 'ffmpeg-assembly');
  const manifestPath = join(assemblyDir, 'render-manifest.json');
  if (!existsSync(manifestPath)) {
    if (existsSync(assemblyDir)) {
      return {
        available: true,
        pass: false,
        error: 'ffmpeg render-manifest.json missing — cannot verify placeholder_pct',
        placeholderClipCount: -1,
        placeholderPct: 100,
        clipCount: 0,
        maxPlaceholderPct: MAX_PLACEHOLDER_PCT,
      };
    }
    return { available: false };
  }
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const clipCount = manifest.clipCount || 0;
    const placeholderClipCount = manifest.placeholderClipCount ?? 0;
    const placeholderPct = manifest.placeholderPct ?? (clipCount > 0 ? (placeholderClipCount / clipCount) * 100 : 0);
    return {
      available: true,
      pass: placeholderPct <= MAX_PLACEHOLDER_PCT,
      placeholderClipCount,
      placeholderPct: Math.round(placeholderPct * 10) / 10,
      clipCount,
      maxPlaceholderPct: MAX_PLACEHOLDER_PCT,
    };
  } catch {
    return { available: false };
  }
}

/**
 * Composite objective gate from scene QA + technical QA.
 * Draft tier: scene + clip-count + silence + placeholder (tech score deferred to full tier).
 * Full tier: all checks including tech_score.
 * @param {{ sceneQa?: object, objectiveQa?: object, clipCountGate?: object, placeholderGate?: object, renderTier?: string }} parts
 */
export function evaluateObjectiveGate(parts) {
  const scene = parts.sceneQa;
  const tech = parts.objectiveQa;
  const clipGate = parts.clipCountGate;
  const placeholderGate = parts.placeholderGate;
  const tier = parts.renderTier === 'full' ? 'full' : 'draft';
  const checks = [];

  if (scene?.available) {
    checks.push({ name: 'scene_hook', pass: scene.hookPass === true, detail: `longest hook shot ${scene.longestHookSec?.toFixed(1)}s` });
    checks.push({ name: 'scene_body', pass: scene.bodyPass === true, detail: `longest shot ${scene.longestSceneSec?.toFixed(1)}s` });
  }
  if (clipGate?.available) {
    checks.push({
      name: 'clip_count',
      pass: clipGate.pass === true,
      detail: `${clipGate.clipCount} clips (min ${clipGate.minClips})`,
    });
  }
  if (placeholderGate?.available) {
    checks.push({
      name: 'placeholder_pct',
      pass: placeholderGate.pass === true,
      detail: `${placeholderGate.placeholderPct}% placeholders (max ${placeholderGate.maxPlaceholderPct}%)`,
    });
  }
  if (tech) {
    checks.push({ name: 'silence', pass: tech.silencePass === true, detail: `${tech.silenceFirst60Sec}s silence in first 60s` });
    if (tier === 'full') {
      checks.push({ name: 'tech_score', pass: tech.scorePass === true, detail: `score ${tech.score}/100` });
    }
  }

  const available = checks.length > 0;
  const draftChecks = checks.filter(
    (c) =>
      c.name.startsWith('scene_')
      || c.name === 'silence'
      || c.name === 'clip_count'
      || c.name === 'placeholder_pct',
  );
  const pass =
    tier === 'draft'
      ? draftChecks.length > 0 && draftChecks.every((c) => c.pass)
      : available && checks.every((c) => c.pass);

  return { pass, checks, available, tier };
}
