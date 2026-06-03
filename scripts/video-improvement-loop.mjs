#!/usr/bin/env node
/**
 * Generate → Video Watcher review → repeat with a random topic each iteration.
 *
 * Prerequisites:
 *   npm run dev -- --port 5173 --host 0.0.0.0
 *   OPENROUTER_API_KEY (optional but recommended for vision review)
 *
 * Usage:
 *   npm run loop:video
 *   npm run loop:video -- --max 3
 *   npm run loop:video -- --until-pass --delay 60
 *   npm run loop:video -- --review-only   # skip generate, only review latest MP4
 */
import { mkdirSync, writeFileSync, appendFileSync, existsSync, copyFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { generateFullVideo, checkDevServer } from './lib/generate-full-video.mjs';
import { pickRandomTopic } from './lib/random-topics.mjs';
import { watchVideo, resolveVideoPath } from '../powers/video-watcher/src/analyze.mjs';

const ROOT = process.cwd();
const LOOP_DIR = join(ROOT, 'test-recordings', 'improvement-loop');
const JOURNAL_JSONL = join(LOOP_DIR, 'JOURNAL.jsonl');
const JOURNAL_MD = join(LOOP_DIR, 'JOURNAL.md');

function parseArgs(argv) {
  const cfg = {
    max: 0,
    untilPass: false,
    delaySec: 10,
    reviewOnly: false,
    skipVision: false,
    watchMode: 'quick',
    exportReview: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--max' && argv[i + 1]) cfg.max = parseInt(argv[++i], 10);
    else if (a === '--until-pass') cfg.untilPass = true;
    else if (a === '--delay' && argv[i + 1]) cfg.delaySec = parseInt(argv[++i], 10);
    else if (a === '--review-only') cfg.reviewOnly = true;
    else if (a === '--skip-vision') cfg.skipVision = true;
    else if (a === '--watch-full') cfg.watchMode = 'full';
    else if (a === '--no-export') cfg.exportReview = false;
  }
  return cfg;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function appendJournal(entry) {
  appendFileSync(JOURNAL_JSONL, `${JSON.stringify(entry)}\n`);
  const lines = [
    `### Loop ${entry.iteration} — ${entry.topic}`,
    ``,
    `1. **Time:** ${entry.at}`,
    `2. **Generate:** ${entry.generateOk ? 'OK' : 'FAIL'}${entry.generateError ? ` — ${entry.generateError}` : ''}`,
    `3. **Video:** \`${entry.videoPath || '—'}\``,
    `4. **Upload-ready:** ${entry.uploadReady ? 'YES' : 'NO'}`,
    `5. **Brutal score:** ${entry.brutalScore ?? '—'}/10`,
    `6. **Hook pass:** ${entry.hookPass === true ? 'YES' : entry.hookPass === false ? 'NO' : '—'}`,
    `7. **Watch report:** \`${entry.reportPath || '—'}\``,
    `8. **Run folder:** \`${entry.runDir || '—'}\``,
    ``,
  ];
  appendFileSync(JOURNAL_MD, `${lines.join('\n')}\n`);
}

async function main() {
  const cfg = parseArgs(process.argv.slice(2));
  mkdirSync(LOOP_DIR, { recursive: true });

  if (!cfg.reviewOnly) {
    const devServer = process.env.DEV_SERVER_URL || 'http://localhost:5173';
    if (!(await checkDevServer(devServer))) {
      console.error(`❌ Dev server not reachable at ${devServer}`);
      console.error('   Start: npm run dev -- --port 5173 --host 0.0.0.0');
      process.exit(1);
    }
  }

  if (!existsSync(JOURNAL_MD)) {
    writeFileSync(
      JOURNAL_MD,
      '# Video improvement loop journal\n\nRandom topic each iteration → generate → watch → repeat.\n\n',
    );
  }

  console.log('\n🔁 Video improvement loop');
  console.log(`   Max iterations: ${cfg.max > 0 ? cfg.max : '∞ (Ctrl+C to stop)'}`);
  console.log(`   Until pass: ${cfg.untilPass}`);
  console.log(`   Journal: ${JOURNAL_JSONL}\n`);

  let iteration = 0;

  while (true) {
    iteration += 1;
    if (cfg.max > 0 && iteration > cfg.max) {
      console.log(`\n✅ Reached --max ${cfg.max}`);
      break;
    }

    const topic = cfg.reviewOnly ? '(review-only)' : pickRandomTopic();
    const runDir = join(LOOP_DIR, `run-${String(iteration).padStart(4, '0')}-${Date.now()}`);
    mkdirSync(runDir, { recursive: true });

    console.log(`\n${'═'.repeat(64)}`);
    console.log(` LOOP ${iteration}${cfg.reviewOnly ? '' : ` — ${topic}`}`);
    console.log(`${'═'.repeat(64)}\n`);

    let generateOk = false;
    let generateError = null;
    let videoPath = null;
    let scriptText = '';

    if (!cfg.reviewOnly) {
      writeFileSync(join(runDir, 'topic.txt'), topic);
      const gen = await generateFullVideo({ topic, youtubeMode: true, runId: Date.now() });
      generateOk = gen.ok;
      generateError = gen.error ?? null;
      videoPath = gen.canonicalPath || gen.videoPath;
      scriptText = gen.scriptText || '';

      if (gen.ok && existsSync(gen.canonicalPath)) {
        copyFileSync(gen.canonicalPath, join(runDir, 'FINAL-VIDEO-final.mp4'));
        if (gen.projectPath && existsSync(gen.projectPath)) {
          copyFileSync(gen.projectPath, join(runDir, 'project.json'));
        }
      } else {
        console.error(`\n❌ Generate failed: ${generateError}`);
        appendJournal({
          iteration,
          topic,
          at: new Date().toISOString(),
          generateOk: false,
          generateError,
          runDir,
        });
        if (cfg.delaySec > 0) await sleep(cfg.delaySec * 1000);
        continue;
      }
    } else {
      try {
        videoPath = resolveVideoPath();
        generateOk = true;
        const proj = join(ROOT, 'test-recordings', 'last-project.json');
        if (existsSync(proj)) scriptText = JSON.parse(readFileSync(proj, 'utf8')).script?.map((s) => s.narration).join('\n\n') || '';
      } catch (e) {
        console.error(`❌ ${e.message}`);
        process.exit(1);
      }
    }

    console.log('\n👁 Video Watcher review...\n');
    let watch;
    try {
      watch = await watchVideo({
        video_path: videoPath,
        mode: cfg.watchMode,
        skip_vision: cfg.skipVision,
        script_text: scriptText,
      });
    } catch (e) {
      console.error(`❌ Watch failed: ${e.message}`);
      appendJournal({
        iteration,
        topic,
        at: new Date().toISOString(),
        generateOk,
        generateError: e.message,
        videoPath,
        runDir,
      });
      if (cfg.delaySec > 0) await sleep(cfg.delaySec * 1000);
      continue;
    }

    if (existsSync(watch.reportPath)) {
      copyFileSync(watch.reportPath, join(runDir, 'WATCH_REPORT.md'));
    }
    if (watch.contactSheet && existsSync(watch.contactSheet)) {
      copyFileSync(watch.contactSheet, join(runDir, 'contact-sheet.jpg'));
    }

    if (cfg.exportReview && videoPath && existsSync(videoPath)) {
      const reviewOut = join(runDir, 'review-export-90s.mp4');
      spawnSync(
        'node',
        ['scripts/export-youtube-review.mjs', videoPath, reviewOut, '90'],
        { cwd: ROOT, stdio: 'pipe' },
      );
    }

    const uploadReady = watch.uploadReady === true;
    const brutalScore = watch.brutal?.overall;
    const hookPass = watch.hookVision?.hookPass;

    console.log(watch.reportText);
    console.log(`\n📄 Report: ${watch.reportPath}`);
    console.log(`📁 Run: ${runDir}`);

    appendJournal({
      iteration,
      topic,
      at: new Date().toISOString(),
      generateOk,
      generateError,
      videoPath,
      uploadReady,
      brutalScore,
      hookPass,
      reportPath: watch.reportPath,
      runDir,
      verdict: watch.brutal?.report?.verdict,
    });

    if (cfg.untilPass && uploadReady) {
      console.log('\n🎉 Upload-ready bar met — stopping loop.');
      break;
    }

    if (cfg.delaySec > 0) {
      console.log(`\n⏳ Next random topic in ${cfg.delaySec}s...`);
      await sleep(cfg.delaySec * 1000);
    }
  }

  console.log(`\n📋 Journal: ${JOURNAL_MD}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
