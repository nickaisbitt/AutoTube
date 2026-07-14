#!/usr/bin/env node
/**
 * Generate → watch → FIX → retry (same topic) → only then next random topic.
 *
 * Gate: if review fails, apply fixes to pipeline state and re-run BEFORE picking a new topic.
 */
import { mkdirSync, writeFileSync, appendFileSync, existsSync, copyFileSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { generateFullVideo, checkDevServer, resolveOpenRouterKey } from './lib/generate-full-video.mjs';
import { applyEnvLocalToProcess } from './lib/railway-prod-env.mjs';
import { ensureRailwayApiTokenEnv } from './lib/railway-token.mjs';
import { runLoopPreflight, waitForDevServer } from './loop-preflight.mjs';
import { pickRandomTopic } from './lib/random-topics.mjs';
import { watchVideo, resolveVideoPath } from '../powers/video-watcher/src/analyze.mjs';
import { loadFixState, saveFixState } from './lib/loop-state.mjs';
import { applyFixesFromWatch, formatFixReport } from './lib/apply-watch-fixes.mjs';
import { validateLoopVideo } from './lib/validate-loop-video.mjs';

const ROOT = process.cwd();
const LOOP_DIR = join(ROOT, 'test-recordings', 'improvement-loop');
const JOURNAL_JSONL = join(LOOP_DIR, 'JOURNAL.jsonl');
const JOURNAL_MD = join(LOOP_DIR, 'JOURNAL.md');

function parseArgs(argv) {
  const cfg = {
    max: 0,
    untilPass: false,
    untilScore: 7.0,
    delaySec: 5,
    reviewOnly: false,
    skipVision: false,
    objectiveOnly: false,
    watchMode: 'quick',
    exportReview: true,
    mockHarvest: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--max' && argv[i + 1]) cfg.max = parseInt(argv[++i], 10);
    else if (a === '--until-pass') cfg.untilPass = true;
    else if (a === '--until-score' && argv[i + 1]) cfg.untilScore = parseFloat(argv[++i]);
    else if (a === '--delay' && argv[i + 1]) cfg.delaySec = parseInt(argv[++i], 10);
    else if (a === '--review-only') cfg.reviewOnly = true;
    else if (a === '--skip-vision') cfg.skipVision = true;
    else if (a === '--objective-only') cfg.objectiveOnly = true;
    else if (a === '--watch-full') cfg.watchMode = 'full';
    else if (a === '--no-export') cfg.exportReview = false;
    else if (a === '--mock-harvest') cfg.mockHarvest = true;
  }
  return cfg;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function appendJournal(entry) {
  appendFileSync(JOURNAL_JSONL, `${JSON.stringify(entry)}\n`);
  const lines = [
    `### Loop ${entry.iteration}${entry.retry ? ` (retry ${entry.retry})` : ''} — ${entry.topic}`,
    ``,
    `1. **Time:** ${entry.at}`,
    `2. **Generate:** ${entry.generateOk ? 'OK' : 'FAIL'}${entry.generateError ? ` — ${entry.generateError}` : ''}`,
    `3. **Video:** \`${entry.videoPath || '—'}\``,
    `4. **Upload-ready:** ${entry.uploadReady ? 'YES' : 'NO'}`,
    `5. **Brutal score:** ${entry.brutalScore ?? '—'}/10`,
    `6. **Objective gate:** ${entry.objectivePass === true ? 'PASS' : entry.objectivePass === false ? 'FAIL' : '—'} (score ${entry.objectiveScore ?? '—'})`,
    `7. **Scene QA:** ${entry.scenePass === true ? 'PASS' : entry.scenePass === false ? 'FAIL' : '—'} (longest ${entry.longestSceneSec ?? '—'}s)`,
    `8. **Render tier:** ${entry.renderTier || '—'}`,
    `9. **Fix strategy:** ${entry.fixStrategy || '—'} | nonce ${entry.harvestNonce ?? '—'} | hardCuts ${entry.ffmpegHardCuts === true ? 'yes' : entry.ffmpegHardCuts === false ? 'no' : '—'}`,
    `10. **Hook pass:** ${entry.hookPass === true ? 'YES' : entry.hookPass === false ? 'NO' : '—'}`,
    `11. **Fixes applied:** ${entry.fixesApplied?.length ? entry.fixesApplied.join('; ') : 'none'}`,
    `12. **Next step:** ${entry.nextStep || '—'}`,
    `13. **Watch report:** \`${entry.reportPath || '—'}\``,
    `14. **Run folder:** \`${entry.runDir || '—'}\``,
    ``,
  ];
  appendFileSync(JOURNAL_MD, `${lines.join('\n')}\n`);
}

async function main() {
  applyEnvLocalToProcess();
  ensureRailwayApiTokenEnv();

  const cfg = parseArgs(process.argv.slice(2));
  mkdirSync(LOOP_DIR, { recursive: true });

  const lockPath = join(LOOP_DIR, 'LOOP.lock');
  try {
    writeFileSync(lockPath, String(process.pid), { flag: 'wx' });
  } catch {
    const prev = existsSync(lockPath) ? readFileSync(lockPath, 'utf8').trim() : '';
    const prevPid = parseInt(prev, 10);
    let alive = false;
    if (Number.isFinite(prevPid)) {
      try {
        process.kill(prevPid, 0);
        alive = true;
      } catch {
        alive = false;
      }
    }
    if (alive) {
      console.error(`❌ Another improvement loop is running (pid ${prevPid}). Kill it or delete ${lockPath}`);
      process.exit(2);
    }
    writeFileSync(lockPath, String(process.pid));
  }
  const clearLock = () => {
    try {
      if (existsSync(lockPath) && readFileSync(lockPath, 'utf8').trim() === String(process.pid)) {
        unlinkSync(lockPath);
      }
    } catch {
      /* ignore */
    }
  };
  process.on('exit', clearLock);
  process.on('SIGINT', () => {
    clearLock();
    process.exit(130);
  });
  process.on('SIGTERM', () => {
    clearLock();
    process.exit(143);
  });

  if (!cfg.reviewOnly && !(await runLoopPreflight())) {
    clearLock();
    process.exit(1);
  }

  if (!existsSync(JOURNAL_MD)) {
    writeFileSync(
      JOURNAL_MD,
      '# Video improvement loop journal\n\nGenerate → watch → **fix** → retry same topic → new topic only after pass or max retries.\n\n',
    );
  }

  let fixState = loadFixState(LOOP_DIR);
  let currentTopic = fixState.pendingTopic || null;
  let iteration = fixState.iteration || 0;
  let sessionCount = 0;

  const TARGET_FILE = join(LOOP_DIR, 'TARGET_SCORE_REACHED.json');

  console.log('\n🔁 Video improvement loop (fix-gated)');
  console.log(`   Max iterations: ${cfg.max > 0 ? cfg.max : '∞'} (this session)`);
  console.log(`   Target score: ${cfg.untilScore}/10 (stops when reached)`);
  console.log(`   Fix before next topic: YES`);
  console.log(`   Harvest: ${cfg.mockHarvest ? 'mock (fast CI path)' : 'real (OpenRouter + live search; stock 2 assets/segment)'}`);
  console.log(`   Journal: ${JOURNAL_JSONL}\n`);

  while (true) {
    sessionCount += 1;
    if (cfg.max > 0 && sessionCount > cfg.max) {
      console.log(`\n✅ Reached --max ${cfg.max}`);
      break;
    }

    iteration += 1;
    fixState.iteration = iteration;

    const isRetry = Boolean(currentTopic);
    if (!currentTopic && !cfg.reviewOnly) {
      currentTopic = pickRandomTopic();
      fixState.topicRetryCount = 0;
      fixState.fixStrategy = 'interval';
      delete fixState.hookLine;
      delete fixState.hookOverlay;
    }

    const topic = cfg.reviewOnly ? '(review-only)' : currentTopic;
    const runDir = join(LOOP_DIR, `run-${String(iteration).padStart(4, '0')}-${Date.now()}`);
    mkdirSync(runDir, { recursive: true });

    console.log(`\n${'═'.repeat(64)}`);
    console.log(
      ` LOOP ${iteration}${isRetry ? ` RETRY ${fixState.topicRetryCount + 1}/${fixState.maxRetriesPerTopic}` : ''} — ${topic}`,
    );
    if (isRetry) {
      console.log(
        ` 🔧 Applying saved fixes: strategy=${fixState.fixStrategy || 'interval'} cut=${fixState.cutIntervalSec}s tier=${fixState.renderTier || 'draft'} hardCuts=${fixState.ffmpegHardCuts === true} reHarvest=${fixState.reHarvestMedia === true} nonce=${fixState.harvestNonce || 0}`,
      );
    }
    console.log(`${'═'.repeat(64)}\n`);

    let generateOk = false;
    let generateError = null;
    let videoPath = null;
    let scriptText = '';
    let renderEnv = null;

    if (!cfg.reviewOnly) {
      if (!(await waitForDevServer())) {
        console.error('\n❌ Dev server not reachable — restart: npm run dev -- --port 5173 --host 0.0.0.0');
        sessionCount -= 1;
        iteration -= 1;
        fixState.iteration = iteration;
        await sleep(Math.min(cfg.delaySec, 30) * 1000);
        continue;
      }

      writeFileSync(join(runDir, 'topic.txt'), topic);
      saveFixState(LOOP_DIR, { ...fixState, pendingTopic: currentTopic });

      const gen = await generateFullVideo({
        topic: currentTopic,
        youtubeMode: !cfg.mockHarvest,
        runId: Date.now(),
        fixState,
        realHarvest: !cfg.mockHarvest,
        loopShort: true,
      });
      generateOk = gen.ok;
      generateError = gen.error ?? null;
      if (gen.fixState) {
        fixState = { ...fixState, ...gen.fixState };
      }
      if (gen.harvestQualityFail) {
        fixState.reHarvestMedia = true;
      }
      // Score the file we just rendered — canonical may be overwritten by finalize picking stale giants
      videoPath = gen.videoPath || gen.canonicalPath;
      scriptText = gen.scriptText || '';
      renderEnv = gen.renderEnv || null;

      if (gen.ok && videoPath && existsSync(videoPath)) {
        const videoCheck = validateLoopVideo(videoPath);
        if (!videoCheck.valid) {
          generateOk = false;
          generateError = videoCheck.error;
        }
      }

      if (gen.ok && videoPath && existsSync(videoPath) && generateOk) {
        fixState.generateFailureCount = 0;
        copyFileSync(videoPath, join(runDir, 'FINAL-VIDEO-final.mp4'));
        if (gen.projectPath && existsSync(gen.projectPath)) {
          copyFileSync(gen.projectPath, join(runDir, 'project.json'));
        }
      } else {
        console.error(`\n❌ Generate failed: ${generateError}`);
        const generateFailureCount = (fixState.generateFailureCount || 0) + 1;
        fixState.generateFailureCount = generateFailureCount;
        const maxGenerateFailuresPerTopic = fixState.maxGenerateFailuresPerTopic || 2;
        const shouldAdvanceTopic = generateFailureCount >= maxGenerateFailuresPerTopic;
        if (shouldAdvanceTopic) {
          currentTopic = null;
          fixState.pendingTopic = null;
          fixState.generateFailureCount = 0;
          fixState.topicRetryCount = 0;
        } else {
          fixState.pendingTopic = currentTopic;
        }
        appendJournal({
          iteration,
          retry: isRetry,
          topic,
          at: new Date().toISOString(),
          generateOk: false,
          generateError,
          runDir,
          nextStep: shouldAdvanceTopic
            ? `new topic after ${generateFailureCount}/${maxGenerateFailuresPerTopic} generate failures`
            : `retry same topic after generate failure (${generateFailureCount}/${maxGenerateFailuresPerTopic})`,
        });
        saveFixState(LOOP_DIR, fixState);
        continue;
      }
    } else {
      videoPath = resolveVideoPath();
      generateOk = true;
      const proj = join(ROOT, 'test-recordings', 'last-project.json');
      if (existsSync(proj)) {
        scriptText =
          JSON.parse(readFileSync(proj, 'utf8')).script?.map((s) => s.narration).join('\n\n') || '';
      }
    }

    const renderTier = fixState.renderTier || 'draft';
    const skipBrutalOnDraft = renderTier === 'draft' && !cfg.objectiveOnly;

    console.log(`\n👁 Video Watcher review (tier=${renderTier})...\n`);
    let watch;
    const projectPathForWatch = join(runDir, 'project.json');
    const hookOverlayHint = (() => {
      try {
        if (existsSync(projectPathForWatch)) {
          return JSON.parse(readFileSync(projectPathForWatch, 'utf8')).exportSettings?.hookOverlay || '';
        }
      } catch {
        /* ignore */
      }
      return fixState.hookOverlay || '';
    })();
    try {
      watch = await watchVideo({
        video_path: videoPath,
        mode: cfg.watchMode,
        skip_vision: cfg.skipVision || skipBrutalOnDraft || cfg.objectiveOnly,
        script_text: scriptText,
        render_tier: renderTier,
        project_path: existsSync(projectPathForWatch) ? projectPathForWatch : undefined,
        hook_overlay: hookOverlayHint,
      });
    } catch (e) {
      console.error(`❌ Watch failed: ${e.message}`);
      appendJournal({
        iteration,
        retry: isRetry,
        topic,
        at: new Date().toISOString(),
        generateOk,
        generateError: e.message,
        videoPath,
        runDir,
        nextStep: 'retry watch',
      });
      continue;
    }

    if (existsSync(watch.reportPath)) copyFileSync(watch.reportPath, join(runDir, 'WATCH_REPORT.md'));
    if (watch.contactSheet && existsSync(watch.contactSheet)) {
      copyFileSync(watch.contactSheet, join(runDir, 'contact-sheet.jpg'));
    }
    if (cfg.exportReview && videoPath) {
      spawnSync('node', ['scripts/export-youtube-review.mjs', videoPath, join(runDir, 'review-export-90s.mp4'), '90'], {
        cwd: ROOT,
        stdio: 'pipe',
      });
    }

    const brutalScore = watch.brutal?.overall ?? 0;
    const brutalDims = watch.brutal?.report?.scores || null;
    const uploadReady = watch.uploadReady === true;
    const objectivePass = watch.objectiveGate?.pass === true;
    const scenePass = watch.sceneQa?.pass === true;
    const scoreTargetMet =
      objectivePass &&
      renderTier === 'full' &&
      Number.isFinite(brutalScore) &&
      brutalScore >= cfg.untilScore;
    let nextStep = 'new random topic';
    let fixesApplied = [];

    const sceneBodyOk = !watch.sceneQa?.available || watch.sceneQa?.bodyPass === true;
    if (objectivePass && sceneBodyOk && renderTier === 'draft') {
      console.log('\n✅ Objective gate PASS on draft (scene body OK) — promoting to full-quality render');
      fixState.renderTier = 'full';
      fixState.whisperAlign = true;
      fixState.pendingTopic = currentTopic;
      fixState.topicRetryCount = Math.max(0, (fixState.topicRetryCount || 0));
      saveFixState(LOOP_DIR, fixState);
      appendJournal({
        iteration,
        retry: isRetry,
        topic,
        at: new Date().toISOString(),
        generateOk,
        videoPath,
        uploadReady: false,
        brutalScore,
        objectivePass,
        objectiveScore: watch.objectiveQa?.score,
        scenePass,
        longestSceneSec: watch.sceneQa?.longestSceneSec,
        renderTier: 'draft',
        fixStrategy: fixState.fixStrategy,
        harvestNonce: fixState.harvestNonce,
        ffmpegHardCuts: fixState.ffmpegHardCuts,
        renderEnv,
        hookPass: watch.hookVision?.hookPass,
        fixesApplied: ['promote to full-quality render'],
        nextStep: 'RETRY same topic at full tier',
        reportPath: watch.reportPath,
        runDir,
      });
      if (cfg.delaySec > 0) await sleep(cfg.delaySec * 1000);
      continue;
    }

    if (scoreTargetMet) {
      writeFileSync(
        TARGET_FILE,
        JSON.stringify(
          {
            reachedAt: new Date().toISOString(),
            score: brutalScore,
            target: cfg.untilScore,
            topic: currentTopic,
            videoPath,
            reportPath: watch.reportPath,
            runDir,
          },
          null,
          2,
        ),
      );
      console.log(`\n🎯 TARGET SCORE ${brutalScore}/10 ≥ ${cfg.untilScore} — STOPPING LOOP`);
      console.log(`   Flag file: ${TARGET_FILE}`);
    }

    if (!uploadReady) {
      const { applied, fixState: nextFix, blockNextTopic } = applyFixesFromWatch(watch, fixState, currentTopic || topic);
      fixState = nextFix;
      fixesApplied = applied;
      const fixReport = formatFixReport(applied, fixState);
      writeFileSync(join(runDir, 'FIXES_APPLIED.md'), fixReport);
      console.log(`\n🔧 FIX GATE — must apply fixes before next topic:\n`);
      console.log(fixReport);

      if (blockNextTopic && fixState.topicRetryCount < fixState.maxRetriesPerTopic) {
        fixState.topicRetryCount += 1;
        fixState.pendingTopic = currentTopic;
        nextStep = `RETRY same topic with fixes (${fixState.topicRetryCount}/${fixState.maxRetriesPerTopic})`;
        console.log(`\n⛔ Not advancing topic — ${nextStep}`);
      } else if (fixState.topicRetryCount >= fixState.maxRetriesPerTopic) {
        console.log(`\n⚠ Max retries on topic — advancing with accumulated fixes`);
        currentTopic = null;
        fixState.pendingTopic = null;
        fixState.topicRetryCount = 0;
        fixState.generateFailureCount = 0;
        fixState.mediaOffset = 0;
        fixState.renderTier = 'draft';
        fixState.fixStrategy = 'interval';
        nextStep = 'new topic (max retries hit, fixes retained)';
      }
    } else {
      console.log('\n✅ Upload-ready — advancing to new random topic');
      currentTopic = null;
      fixState.pendingTopic = null;
      fixState.topicRetryCount = 0;
      fixState.generateFailureCount = 0;
      fixState.renderTier = 'draft';
    }

    saveFixState(LOOP_DIR, fixState);

    console.log(watch.reportText);

    appendJournal({
      iteration,
      retry: isRetry,
      topic,
      at: new Date().toISOString(),
      generateOk,
      generateError,
      videoPath,
      uploadReady,
      brutalScore,
      scoreTargetMet,
      objectivePass,
      objectiveScore: watch.objectiveQa?.score,
      scenePass,
      longestSceneSec: watch.sceneQa?.longestSceneSec,
      renderTier,
      fixStrategy: fixState.fixStrategy,
      harvestNonce: fixState.harvestNonce,
      ffmpegHardCuts: fixState.ffmpegHardCuts,
      renderEnv: renderEnv || fixState.renderEnv,
      hookPass: watch.hookVision?.hookPass,
      fixesApplied,
      nextStep,
      reportPath: watch.reportPath,
      runDir,
    });

    if (scoreTargetMet) {
      break;
    }

    if (cfg.untilPass && uploadReady) {
      console.log('\n🎉 Upload-ready — stopping loop.');
      break;
    }

    if (cfg.delaySec > 0 && !uploadReady) {
      console.log(`\n⏳ ${cfg.delaySec}s before fix retry...`);
      await sleep(cfg.delaySec * 1000);
    } else if (cfg.delaySec > 0 && uploadReady) {
      await sleep(cfg.delaySec * 1000);
    }
  }

  saveFixState(LOOP_DIR, fixState);
  console.log(`\n📋 Journal: ${JOURNAL_MD}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
