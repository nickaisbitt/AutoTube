#!/usr/bin/env node
/**
 * R7 Real Pass — shared config from env vars and CLI flags.
 */
import { existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { DURATION_TOLERANCE } from './duration-check.mjs';

export const ROOT = process.cwd();

/** @typedef {{
 *   mp4: string|null,
 *   project: string|null,
 *   log: string|null,
 *   manifest: string|null,
 *   minSeconds: number,
 *   minSizeBytes: number,
 *   tolerance: number,
 *   minMediaLoadRate: number,
 *   silentMeanDb: number,
 *   fixtureMode: boolean,
 *   skipGateTest: boolean,
 *   jsonOutput: boolean,
 *   help: boolean,
 * }} RealPassConfig */

function envBool(name, defaultValue = false) {
  const raw = process.env[name];
  if (raw == null || raw === '') return defaultValue;
  return raw === '1' || raw.toLowerCase() === 'true' || raw.toLowerCase() === 'yes';
}

function envNumber(name, defaultValue) {
  const raw = process.env[name];
  if (raw == null || raw === '') return defaultValue;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

/**
 * @param {string[]} argv
 * @returns {RealPassConfig}
 */
export function parseRealPassConfig(argv = process.argv) {
  const fixtureMode = envBool('REAL_PASS_FIXTURE') || envBool('FIXTURE_MODE');
  const defaultMinSeconds = fixtureMode ? 30 : envNumber('MIN_DURATION_SEC', 180);

  /** @type {RealPassConfig} */
  const config = {
    mp4: process.env.MP4_PATH || process.env.REAL_PASS_MP4 || null,
    project: process.env.PROJECT_PATH || process.env.REAL_PASS_PROJECT || null,
    log: process.env.RENDER_LOG || process.env.REAL_PASS_LOG || null,
    manifest: process.env.REAL_PASS_MANIFEST || null,
    minSeconds: envNumber('MIN_DURATION_SEC', defaultMinSeconds),
    minSizeBytes: envNumber('MIN_SIZE_BYTES', 1_048_576),
    tolerance: envNumber('DURATION_TOLERANCE', DURATION_TOLERANCE),
    minMediaLoadRate: envNumber('MIN_MEDIA_LOAD_RATE', 90),
    silentMeanDb: envNumber('SILENT_MEAN_DB', -45),
    fixtureMode,
    skipGateTest: envBool('SKIP_GATE_TEST'),
    jsonOutput: false,
    help: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const key = argv[i];
    const val = argv[i + 1];
    if (key === '--help' || key === '-h') config.help = true;
    if (key === '--json') config.jsonOutput = true;
    if (key === '--fixture-mode') config.fixtureMode = true;
    if (key === '--skip-gate-test') config.skipGateTest = true;
    if (key === '--mp4' && val) { config.mp4 = val; i++; }
    if (key === '--project' && val) { config.project = val; i++; }
    if (key === '--log' && val) { config.log = val; i++; }
    if (key === '--manifest' && val) { config.manifest = val; i++; }
    if (key === '--min-seconds' && val) { config.minSeconds = parseFloat(val); i++; }
    if (key === '--min-size-bytes' && val) { config.minSizeBytes = parseInt(val, 10); i++; }
    if (key === '--tolerance' && val) { config.tolerance = parseFloat(val); i++; }
    if (key === '--min-media-load-rate' && val) { config.minMediaLoadRate = parseFloat(val); i++; }
  }

  if (config.fixtureMode && process.env.MIN_DURATION_SEC == null) {
    config.minSeconds = Math.min(config.minSeconds, 30);
  }

  return config;
}

/**
 * @param {string|null|undefined} pathArg
 * @returns {string|null}
 */
export function resolvePath(pathArg) {
  if (!pathArg) return null;
  if (existsSync(pathArg)) return pathArg;
  const fromRoot = join(ROOT, pathArg);
  return existsSync(fromRoot) ? fromRoot : null;
}

export function defaultMp4Candidates() {
  return [
    join(ROOT, 'test-recordings', 'FINAL-VIDEO-final.mp4'),
    join(ROOT, 'test-recordings', 'FINAL-OUTPUT-final.mp4'),
    join(ROOT, 'test-recordings', 'FINAL-OUTPUT.mp4'),
  ];
}

/**
 * @returns {string|null}
 */
export function resolveMp4Path(explicitPath) {
  const resolved = resolvePath(explicitPath);
  if (resolved) return resolved;
  for (const candidate of defaultMp4Candidates()) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * @returns {string|null}
 */
export function resolveProjectPath(explicitPath) {
  const resolved = resolvePath(explicitPath);
  if (resolved) return resolved;
  const tmpDefault = '/tmp/autotube-project.json';
  if (existsSync(tmpDefault)) return tmpDefault;

  try {
    const tmpDir = '/tmp';
    const candidates = readdirSync(tmpDir)
      .filter((name) => name.startsWith('autotube-project') && name.endsWith('.json'))
      .map((name) => join(tmpDir, name))
      .filter((path) => existsSync(path))
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
    return candidates[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * @returns {string|null}
 */
export function resolveRenderLogPath(explicitPath) {
  const resolved = resolvePath(explicitPath);
  if (resolved) return resolved;

  const candidates = [
    join(ROOT, 'test-recordings', 'latest-render.log'),
    join(ROOT, 'test-recordings', 'render.log'),
  ];

  try {
    const recordingsDir = join(ROOT, 'test-recordings');
    if (existsSync(recordingsDir)) {
      for (const entry of readdirSync(recordingsDir)) {
        if (entry.startsWith('full-')) {
          candidates.push(join(recordingsDir, entry, 'render.log'));
        }
      }
    }
  } catch { /* ignore */ }

  try {
    const deployLogs = join(ROOT, 'deploy', 'logs');
    if (existsSync(deployLogs)) {
      for (const entry of readdirSync(deployLogs).filter((f) => f.endsWith('.log'))) {
        candidates.push(join(deployLogs, entry));
      }
    }
  } catch { /* ignore */ }

  const existing = candidates
    .filter((path) => existsSync(path))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return existing[0] ?? null;
}

/**
 * @returns {string|null}
 */
export function resolveManifestPath(explicitPath) {
  const resolved = resolvePath(explicitPath);
  if (resolved) return resolved;
  const candidates = [
    join(ROOT, 'test-recordings', 'real-pass-manifest.json'),
    join(ROOT, 'test-recordings', 'latest-real-pass-manifest.json'),
  ];
  const existing = candidates.find((path) => existsSync(path));
  return existing ?? null;
}

export const ENV_DOCS = [
  { name: 'MIN_DURATION_SEC', default: '180 (30 in fixture mode)', desc: 'Minimum final MP4 duration in seconds (Real Pass #1, #6).' },
  { name: 'MIN_SIZE_BYTES', default: '1048576', desc: 'Minimum output file size — 1 MB default (Real Pass #6).' },
  { name: 'MIN_MEDIA_LOAD_RATE', default: '90', desc: 'Minimum image preload success rate % from render log (Real Pass #4).' },
  { name: 'DURATION_TOLERANCE', default: '0.1', desc: 'Allowed ± fraction vs script-derived expected duration (A2 sub-check).' },
  { name: 'SILENT_MEAN_DB', default: '-45', desc: 'Fail TTS check if mean audio volume is below this dB (Real Pass #2).' },
  { name: 'FORCE_CPU / AUTOTUBE_FORCE_CPU', default: 'unset', desc: 'When 1/true, render must use libx264 CPU path (Real Pass #3).' },
  { name: 'SKIP_GATE_TEST', default: 'unset', desc: 'When 1/true, skip vitest quality-gate suite (Real Pass #7).' },
  { name: 'REAL_PASS_FIXTURE / FIXTURE_MODE', default: 'unset', desc: 'Fixture/short-run mode: 30s min duration, allows fixture project id.' },
  { name: 'MP4_PATH / REAL_PASS_MP4', default: 'auto', desc: 'Explicit path to -final.mp4 artifact.' },
  { name: 'PROJECT_PATH / REAL_PASS_PROJECT', default: 'auto', desc: 'Project JSON for duration/music/gate context.' },
  { name: 'RENDER_LOG / REAL_PASS_LOG', default: 'auto', desc: 'Server-render stdout/stderr log for preload/encode/music lines.' },
  { name: 'REAL_PASS_MANIFEST', default: 'auto', desc: 'Optional JSON manifest with render metrics (preload %, encode path).' },
];

export function printHelp() {
  console.log(`R7 — Seven-point Real Pass verification

Usage:
  npm run verify:real-pass
  node scripts/verify-real-pass.mjs --mp4 path/to-final.mp4 --project path/to-project.json
  REAL_PASS_FIXTURE=1 MIN_DURATION_SEC=30 npm run verify:real-pass

Flags:
  --mp4 <path>              Final MP4 (default: test-recordings/FINAL-OUTPUT-final.mp4)
  --project <path>          Project JSON for duration ±10% and music settings
  --log <path>              Render log (default: test-recordings/latest-render.log)
  --manifest <path>         Optional real-pass-manifest.json from render
  --min-seconds <n>         Override MIN_DURATION_SEC
  --min-size-bytes <n>      Override MIN_SIZE_BYTES
  --min-media-load-rate <n> Override MIN_MEDIA_LOAD_RATE (default 90)
  --tolerance <frac>        Duration tolerance (default 0.1)
  --fixture-mode            Short/fixture thresholds (30s min)
  --skip-gate-test          Skip vitest quality gate suite (Real Pass #7)
  --json                    Machine-readable JSON summary on stdout
  --help                    Show this help

Environment variables:
${ENV_DOCS.map((e) => `  ${e.name.padEnd(28)} default: ${e.default}\n${''.padEnd(30)}${e.desc}`).join('\n')}
`);
}
