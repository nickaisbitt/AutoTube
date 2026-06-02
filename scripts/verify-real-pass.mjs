#!/usr/bin/env node
/**
 * R7 — Seven-point Real Pass verification (merge gate).
 *
 * Enforces all 7 acceptance criteria from scripts/squad/ROSTER.md.
 * Exits 0 only when every check passes.
 *
 * Usage:
 *   npm run verify:real-pass
 *   node scripts/verify-real-pass.mjs --mp4 test-recordings/FINAL-OUTPUT-final.mp4 --project /tmp/autotube-project.json
 *   REAL_PASS_FIXTURE=1 MIN_DURATION_SEC=30 npm run verify:real-pass
 *
 * See scripts/squad/R7-real-pass.md for the full checklist and env var reference.
 */
import { existsSync, statSync } from 'fs';
import { loadProject } from './lib/duration-check.mjs';
import {
  parseRealPassConfig,
  printHelp,
  resolveMp4Path,
  resolveProjectPath,
  resolveRenderLogPath,
  resolveManifestPath,
} from './lib/real-pass-config.mjs';
import {
  readManifest,
  readRenderLog,
  check1PipelineDuration,
  check2NoSilentTts,
  check3CpuSafeEncode,
  check4MediaPreload,
  check5BackgroundMusic,
  check6SizeDuration,
  check7QualityGates,
} from './lib/real-pass-checks.mjs';

const ICON = { pass: '✅', fail: '❌', skip: '⏭' };

/**
 * @param {import('./lib/real-pass-checks.mjs').CheckResult} check
 */
function formatCheckLine(check) {
  const icon = check.skipped ? ICON.skip : check.ok ? ICON.pass : ICON.fail;
  const status = check.skipped ? 'SKIP' : check.ok ? 'PASS' : 'FAIL';
  return `${icon} [${check.id}/7] ${check.title}: ${status}\n    ${check.message}`;
}

/**
 * @param {import('./lib/real-pass-checks.mjs').CheckResult[]} checks
 */
function printSummary(config, mp4Path, projectPath, logPath, checks) {
  const passed = checks.filter((c) => c.ok && !c.skipped).length;
  const skipped = checks.filter((c) => c.skipped).length;
  const failed = checks.filter((c) => !c.ok).length;
  const allOk = failed === 0;

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(' R7 Real Pass — Seven-point verification');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(` MP4:     ${mp4Path}`);
  console.log(` Project: ${projectPath ?? '(none — duration ±10% may be skipped)'}`);
  console.log(` Log:     ${logPath ?? '(none — preload/encode hints from MP4 only)'}`);
  console.log(` Mode:    ${config.fixtureMode ? 'fixture/short' : 'full merge gate'} (min ${config.minSeconds}s, min ${(config.minSizeBytes / 1024 / 1024).toFixed(2)} MB)`);
  console.log('───────────────────────────────────────────────────────────\n');

  for (const check of checks) {
    console.log(formatCheckLine(check));
  }

  console.log('\n───────────────────────────────────────────────────────────');
  console.log(` Result: ${allOk ? `${ICON.pass} REAL PASS` : `${ICON.fail} REAL PASS BLOCKED`}`);
  console.log(` Checks: ${passed} passed, ${failed} failed, ${skipped} skipped (of 7)`);
  console.log('═══════════════════════════════════════════════════════════\n');

  return allOk;
}

function main() {
  const config = parseRealPassConfig(process.argv);

  if (config.help) {
    printHelp();
    process.exit(0);
  }

  const mp4Path = resolveMp4Path(config.mp4);
  if (!mp4Path) {
    console.error(`${ICON.fail} R7: No MP4 found. Pass --mp4 <path> or run npm run generate:video / npm run render:fixture first.`);
    process.exit(1);
  }

  if (!existsSync(mp4Path)) {
    console.error(`${ICON.fail} R7: MP4 not found: ${mp4Path}`);
    process.exit(1);
  }

  const size = statSync(mp4Path).size;
  if (size < 1024) {
    console.error(`${ICON.fail} R7: MP4 too small (${size} bytes) — likely failed render`);
    process.exit(1);
  }

  const projectPath = resolveProjectPath(config.project);
  let project = null;
  if (projectPath && existsSync(projectPath)) {
    try {
      project = loadProject(projectPath);
    } catch (err) {
      console.error(`${ICON.fail} R7: Invalid project JSON at ${projectPath}: ${err.message}`);
      process.exit(1);
    }
  }

  const logPath = resolveRenderLogPath(config.log);
  const manifestPath = resolveManifestPath(config.manifest);
  const renderLog = readRenderLog(logPath);
  const manifest = readManifest(manifestPath);

  const checks = [
    check1PipelineDuration(config, mp4Path, project),
    check2NoSilentTts(config, mp4Path, project, renderLog),
    check3CpuSafeEncode(config, mp4Path, renderLog, manifest),
    check4MediaPreload(config, renderLog, manifest),
    check5BackgroundMusic(mp4Path, project, renderLog, manifest),
    check6SizeDuration(config, mp4Path),
    check7QualityGates(config),
  ];

  if (config.jsonOutput) {
    const payload = {
      ok: checks.every((c) => c.ok),
      mp4Path,
      projectPath,
      logPath,
      manifestPath,
      config: {
        minSeconds: config.minSeconds,
        minSizeBytes: config.minSizeBytes,
        fixtureMode: config.fixtureMode,
        skipGateTest: config.skipGateTest,
      },
      checks,
    };
    console.log(JSON.stringify(payload, null, 2));
    process.exit(payload.ok ? 0 : 1);
  }

  const allOk = printSummary(config, mp4Path, projectPath, logPath, checks);
  process.exit(allOk ? 0 : 1);
}

main();
