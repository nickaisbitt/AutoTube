#!/usr/bin/env node
/**
 * R7 — Seven-point Real Pass verification (partial implementation).
 * A2: output duration matches script narration sum within ±10%.
 *
 * Usage:
 *   node scripts/verify-real-pass.mjs --mp4 path/to-final.mp4 --project path/to-project.json
 *   node scripts/verify-real-pass.mjs --mp4 test-recordings/FINAL-OUTPUT-final.mp4 --min-seconds 30
 */
import { existsSync, statSync } from 'fs';
import { join } from 'path';
import {
  DURATION_TOLERANCE,
  expectedRenderDuration,
  loadProject,
  probeMediaDuration,
  verifyOutputDuration,
} from './lib/duration-check.mjs';

const ROOT = process.cwd();

function parseArgs(argv) {
  const args = {
    mp4: null,
    project: null,
    minSeconds: null,
    tolerance: DURATION_TOLERANCE,
  };
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i];
    const val = argv[i + 1];
    if (key === '--mp4' && val) args.mp4 = val;
    if (key === '--project' && val) args.project = val;
    if (key === '--min-seconds' && val) args.minSeconds = parseFloat(val);
    if (key === '--tolerance' && val) args.tolerance = parseFloat(val);
  }
  return args;
}

function resolveMp4(pathArg) {
  if (!pathArg) return null;
  if (existsSync(pathArg)) return pathArg;
  const fromRoot = join(ROOT, pathArg);
  return existsSync(fromRoot) ? fromRoot : null;
}

function defaultMp4Candidates() {
  return [
    join(ROOT, 'test-recordings', 'FINAL-OUTPUT-final.mp4'),
    join(ROOT, 'test-recordings', 'FINAL-OUTPUT.mp4'),
  ];
}

function checkFileSize(mp4Path, minBytes = 100_000) {
  if (!existsSync(mp4Path)) return { ok: false, message: `Missing MP4: ${mp4Path}` };
  const size = statSync(mp4Path).size;
  if (size < minBytes) {
    return { ok: false, message: `MP4 too small (${size} bytes)` };
  }
  return { ok: true, size };
}

function main() {
  const args = parseArgs(process.argv);
  let mp4Path = resolveMp4(args.mp4);
  if (!mp4Path) {
    for (const candidate of defaultMp4Candidates()) {
      if (existsSync(candidate)) {
        mp4Path = candidate;
        break;
      }
    }
  }

  if (!mp4Path) {
    console.error('❌ R7: No MP4 found. Pass --mp4 <path> or render test-recordings/FINAL-OUTPUT-final.mp4 first.');
    process.exit(1);
  }

  const sizeCheck = checkFileSize(mp4Path);
  if (!sizeCheck.ok) {
    console.error(`❌ R7 size gate: ${sizeCheck.message}`);
    process.exit(1);
  }

  const actualSec = probeMediaDuration(mp4Path);
  if (actualSec == null) {
    console.error(`❌ R7: ffprobe could not read duration for ${mp4Path}`);
    process.exit(1);
  }

  console.log(`📹 MP4: ${mp4Path}`);
  console.log(`   Size: ${(sizeCheck.size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   ffprobe duration: ${actualSec.toFixed(2)}s`);

  if (args.minSeconds != null && actualSec < args.minSeconds) {
    console.error(`❌ R7 min duration: ${actualSec.toFixed(1)}s < ${args.minSeconds}s`);
    process.exit(1);
  }

  let project = null;
  if (args.project) {
    const projectPath = resolveMp4(args.project) ?? args.project;
    if (!existsSync(projectPath)) {
      console.error(`❌ R7: project file not found: ${args.project}`);
      process.exit(1);
    }
    project = loadProject(projectPath);
  } else if (existsSync('/tmp/autotube-project.json')) {
    project = loadProject('/tmp/autotube-project.json');
  }

  if (project?.script?.length) {
    const durationCheck = verifyOutputDuration(mp4Path, project, { tolerance: args.tolerance });
    const expectedSec = durationCheck.expectedSec;
    console.log(`   Expected (script sum + end screen): ${expectedSec.toFixed(2)}s`);
    console.log(`   ${durationCheck.message}`);
    if (!durationCheck.ok) {
      process.exit(1);
    }
  } else {
    console.log('   ℹ No project JSON — skipped ±10% script duration check (use --project)');
  }

  console.log('✅ R7 duration gate passed');
}

main();
