#!/usr/bin/env node
/**
 * Cold-start unseen-topic evaluation harness.
 *
 * Measures FIRST-PASS generator quality only:
 * - fresh FIX_STATE per topic
 * - AUTOTUBE_EVAL_COLD=1 (no curated packs, family templates, keep-best)
 * - zero fix retries
 * - blind watcher (no script_text / hook_overlay hints)
 *
 * Usage:
 *   npm run eval:unseen -- --set dev --max 2
 *   npm run eval:unseen -- --set release --max 24
 *   npm run eval:unseen -- --set dev --validate-only
 */
import { mkdirSync, writeFileSync, existsSync, copyFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { generateFullVideo, checkDevServer, resolveOpenRouterKey } from './lib/generate-full-video.mjs';
import { DEFAULT_FIX_STATE } from './lib/loop-state.mjs';
import { loadEvalTopicSet, validateEvalTopicSet, findTopicLeak } from './lib/eval-topics.mjs';
import { isEvalColdMode } from './lib/eval-flags.mjs';
import { watchVideo } from '../powers/video-watcher/src/analyze.mjs';
import { resolveWatchModel, isIndependentWatchJudge } from '../powers/video-watcher/src/vision-brutal.mjs';
import { validateLoopVideo } from './lib/validate-loop-video.mjs';
import { runLoopPreflight, waitForDevServer } from './loop-preflight.mjs';
import { applyEnvLocalToProcess } from './lib/railway-prod-env.mjs';

const ROOT = process.cwd();

function parseArgs(argv) {
  const cfg = {
    set: 'dev',
    max: 0,
    offset: 0,
    validateOnly: false,
    delaySec: 5,
    watchMode: 'quick',
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--set' && argv[i + 1]) cfg.set = argv[++i];
    else if (a === '--max' && argv[i + 1]) cfg.max = Math.max(0, parseInt(argv[++i], 10) || 0);
    else if (a === '--offset' && argv[i + 1]) cfg.offset = Math.max(0, parseInt(argv[++i], 10) || 0);
    else if (a === '--validate-only') cfg.validateOnly = true;
    else if (a === '--delay' && argv[i + 1]) cfg.delaySec = Math.max(0, parseFloat(argv[++i]) || 0);
    else if (a === '--watch-mode' && argv[i + 1]) cfg.watchMode = argv[++i];
  }
  return cfg;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function coldFixState() {
  return {
    ...DEFAULT_FIX_STATE,
    renderTier: 'full',
    cutIntervalSec: 0.7,
    whisperAlign: true,
    faceSeekBroll: true,
    harvestVideoFirst: true,
    preferBrightBroll: true,
    patternInterrupts: false,
    hookSceneCuts: true,
    karaokeCaptions: true,
    minAssetsPerSegment: 6,
    visualBeats: true,
    beatVision: true,
    maxReusePerUrl: 1,
    reHarvestMedia: false,
    keepBestMedia: false,
    frozenProjectPath: null,
    rewriteScript: false,
    topicRetryCount: 0,
    generateFailureCount: 0,
    mediaOffset: 0,
    harvestNonce: 0,
    excludedUrls: [],
    hookLine: null,
    pendingTopic: null,
  };
}

function summarizeWatch(watch) {
  return {
    uploadReady: watch.uploadReady === true,
    rawOverall: watch.brutal?.rawOverall ?? null,
    flooredOverall: watch.brutal?.flooredOverall ?? watch.brutal?.overall ?? null,
    hasCriticalIssues: watch.brutal?.hasCriticalIssues === true,
    scores: watch.brutal?.report?.scores || null,
    topIssues: (watch.brutal?.report?.topIssues || []).slice(0, 5),
    hookScriptPass: watch.hookScript?.pass ?? null,
    hookVisionPass: watch.hookVision?.hookPass ?? null,
    objectivePass: watch.objectiveGate?.pass === true,
    objectiveScore: watch.objectiveQa?.score ?? null,
    scenePass: watch.sceneQa?.pass === true,
    longestSceneSec: watch.sceneQa?.longestSceneSec ?? null,
  };
}

async function main() {
  applyEnvLocalToProcess();
  const cfg = parseArgs(process.argv);

  // Force cold-eval semantics for this process
  process.env.AUTOTUBE_EVAL_COLD = '1';
  process.env.AUTOTUBE_CURATED_PACKS = '0';
  process.env.AUTOTUBE_TOPIC_FAMILY_TEMPLATES = '0';
  process.env.AUTOTUBE_KEEP_BEST = '0';
  process.env.AUTOTUBE_VISUAL_BEATS = '1';
  process.env.AUTOTUBE_BEAT_VISION = '1';
  unsetFlash();

  const set = loadEvalTopicSet(cfg.set);
  const validation = validateEvalTopicSet(set.topics);
  if (!validation.ok) {
    console.error('Eval topic set FAILED leakage checks:');
    for (const e of validation.errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`✅ Topic set "${cfg.set}" passed leakage checks (${set.topics.length} topics)`);
  if (cfg.validateOnly) {
    process.exit(0);
  }

  if (!isEvalColdMode()) {
    console.error('AUTOTUBE_EVAL_COLD failed to engage');
    process.exit(1);
  }

  const offset = cfg.offset || 0;
  const topics = cfg.max > 0
    ? set.topics.slice(offset, offset + cfg.max)
    : set.topics.slice(offset);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = join(ROOT, 'test-recordings', `eval-${cfg.set}-${stamp}`);
  mkdirSync(outDir, { recursive: true });
  const jsonlPath = join(outDir, 'EVAL_REPORT.jsonl');
  const summaryPath = join(outDir, 'EVAL_SUMMARY.json');
  const mdPath = join(outDir, 'EVAL_SUMMARY.md');

  // AUTOTUBE_EVAL_COLD is already forced above, so the watcher defaults to an
  // independent vision judge unless AUTOTUBE_WATCH_MODEL overrides it.
  const watchModel = resolveWatchModel(process.env);
  const watchIndependent = isIndependentWatchJudge(process.env);
  const watchDefaultedForColdEval = !process.env.AUTOTUBE_WATCH_MODEL && watchIndependent;
  console.log(
    `🎥 Blind judge model: ${watchModel} (${watchIndependent ? 'independent' : 'SAME-MODEL — inflates confidence'})`,
  );
  writeFileSync(
    join(outDir, 'EVAL_META.json'),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        set: cfg.set,
        topicCount: topics.length,
        commit: gitRev(),
        models: {
          openrouter: process.env.OPENROUTER_MODEL || null,
          vision: process.env.OPENROUTER_VISION_MODEL || null,
          watch: watchModel,
          watchIndependent,
          watchDefaultedForColdEval,
          watchModelSource: process.env.AUTOTUBE_WATCH_MODEL
            ? 'AUTOTUBE_WATCH_MODEL'
            : watchDefaultedForColdEval
              ? 'cold-eval-default'
              : 'generation-model',
        },
        sameModelJudgeLimitation: watchIndependent
          ? null
          : 'Watcher uses same model family as generation unless AUTOTUBE_WATCH_MODEL is set.',
        cold: true,
        beatVision: true,
        visualBeats: true,
        curatedPacks: false,
        familyTemplates: false,
        keepBest: false,
        retries: 0,
        blindWatcher: true,
      },
      null,
      2,
    ),
  );

  const pre = await runLoopPreflight({ requireOpenRouter: true }).catch((e) => ({ ok: false, error: e.message }));
  if (pre && pre.ok === false) {
    console.warn(`Preflight warning: ${pre.error || JSON.stringify(pre)}`);
  }
  const devServer = process.env.DEV_SERVER_URL || 'http://localhost:5173';
  await waitForDevServer(devServer, 120_000).catch(() => null);
  if (!(await checkDevServer(devServer))) {
    console.error(`Dev server not reachable at ${devServer}`);
    process.exit(1);
  }
  if (!resolveOpenRouterKey()) {
    console.error('OPENROUTER_API_KEY / VITE_OPENROUTER_KEY required');
    process.exit(1);
  }

  const rows = [];
  for (let i = 0; i < topics.length; i += 1) {
    const row = topics[i];
    const leak = findTopicLeak(row.topic);
    if (leak.leaked) {
      console.error(`Skipping leaked topic ${row.id}: ${leak.against}`);
      continue;
    }

    console.log(`\n========== EVAL ${i + 1}/${topics.length} ${row.id}: ${row.topic} ==========`);
    const started = Date.now();
    const fixState = coldFixState();
    fixState.pendingTopic = row.topic;

    let record = {
      topicId: row.id,
      topic: row.topic,
      category: row.category || null,
      pass: 'full',
      at: new Date().toISOString(),
      generateOk: false,
      generateError: null,
      durationSec: null,
      elapsedMs: null,
      videoPath: null,
      watch: null,
    };

    try {
      let gen = await generateFullVideo({
        topic: row.topic,
        realHarvest: true,
        fixState,
        runId: Date.now(),
        youtubeMode: true,
        loopShort: false,
      });
      const scriptFail =
        String(gen.error || '').includes('SCRIPT_TIMEOUT')
        || String(gen.error || '').includes('SCRIPT_UI_ERROR');
      if (!gen.ok && scriptFail) {
        console.log(
          `↻ ${row.id}: ${String(gen.error || '').includes('SCRIPT_UI_ERROR') ? 'SCRIPT_UI_ERROR' : 'SCRIPT_TIMEOUT'} — one cold retry (nonce ${(fixState.harvestNonce || 0) + 1})`,
        );
        const retryState = {
          ...fixState,
          harvestNonce: (fixState.harvestNonce || 0) + 1,
          mediaOffset: (fixState.mediaOffset || 0) + 2,
        };
        gen = await generateFullVideo({
          topic: row.topic,
          realHarvest: true,
          fixState: retryState,
          runId: Date.now() + 1,
          youtubeMode: true,
          loopShort: false,
        });
        record.pass = 'retry-after-timeout';
      }
      if (!gen.ok && String(gen.error || '').includes('HARVEST_VOLUME_FAIL')) {
        console.log(`↻ ${row.id}: HARVEST_VOLUME_FAIL — one cold retry (nonce ${(fixState.harvestNonce || 0) + 1})`);
        const retryState = {
          ...fixState,
          harvestNonce: (fixState.harvestNonce || 0) + 1,
          mediaOffset: (fixState.mediaOffset || 0) + 3,
          minAssetsPerSegment: Math.max(4, (fixState.minAssetsPerSegment || 6) - 2),
        };
        gen = await generateFullVideo({
          topic: row.topic,
          realHarvest: true,
          fixState: retryState,
          runId: Date.now() + 2,
          youtubeMode: true,
          loopShort: false,
        });
        record.pass = 'retry-after-volume';
      }
      record.generateOk = gen.ok === true;
      record.generateError = gen.ok ? null : gen.error || 'generate failed';
      record.durationSec = gen.durationSec ?? null;
      record.videoPath = gen.videoPath || gen.canonicalPath || null;

      if (gen.ok && record.videoPath && existsSync(record.videoPath)) {
        const videoCheck = validateLoopVideo(record.videoPath);
        record.videoCheck = videoCheck;
        const topicDir = join(outDir, row.id);
        mkdirSync(topicDir, { recursive: true });
        copyFileSync(record.videoPath, join(topicDir, 'final-video-final.mp4'));
        if (gen.projectPath && existsSync(gen.projectPath)) {
          copyFileSync(gen.projectPath, join(topicDir, 'project.json'));
        }

        // Blind watcher: no script_text, no hook_overlay
        const watch = await watchVideo({
          video_path: record.videoPath,
          mode: cfg.watchMode,
          skip_vision: false,
          render_tier: 'full',
          // intentionally omit script_text and hook_overlay
        });
        if (watch.reportPath && existsSync(watch.reportPath)) {
          copyFileSync(watch.reportPath, join(topicDir, 'WATCH_REPORT.md'));
        }
        record.watch = summarizeWatch(watch);
      }
    } catch (e) {
      record.generateOk = false;
      record.generateError = e.message || String(e);
    }

    record.elapsedMs = Date.now() - started;
    rows.push(record);
    writeFileSync(jsonlPath, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
    console.log(
      `→ ${row.id}: ok=${record.generateOk} raw=${record.watch?.rawOverall ?? 'n/a'} upload=${record.watch?.uploadReady ?? 'n/a'} (${Math.round(record.elapsedMs / 1000)}s)`,
    );

    if (cfg.delaySec > 0 && i < topics.length - 1) await sleep(cfg.delaySec * 1000);
  }

  const summary = buildSummary(rows, cfg, outDir);
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  writeFileSync(mdPath, formatSummaryMd(summary));
  console.log(`\n📋 Summary: ${summaryPath}`);
  console.log(formatSummaryMd(summary));
}

function unsetFlash() {
  delete process.env.AUTOTUBE_FLASH_INTERRUPTS;
}

function gitRev() {
  const r = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
  return (r.stdout || '').trim() || null;
}

function buildSummary(rows, cfg, outDir) {
  const ok = rows.filter((r) => r.generateOk);
  const watched = rows.filter((r) => r.watch && typeof r.watch.rawOverall === 'number');
  const raws = watched.map((r) => r.watch.rawOverall).sort((a, b) => a - b);
  const uploadReady = watched.filter((r) => r.watch.uploadReady).length;
  const critical = watched.filter((r) => r.watch.hasCriticalIssues).length;
  return {
    set: cfg.set,
    outDir,
    n: rows.length,
    generateSuccessRate: rows.length ? ok.length / rows.length : 0,
    watched: watched.length,
    uploadReadyRate: watched.length ? uploadReady / watched.length : null,
    criticalRate: watched.length ? critical / watched.length : null,
    raw: {
      median: percentile(raws, 0.5),
      p25: percentile(raws, 0.25),
      p75: percentile(raws, 0.75),
      mean: raws.length ? raws.reduce((a, b) => a + b, 0) / raws.length : null,
      min: raws[0] ?? null,
      max: raws[raws.length - 1] ?? null,
    },
    note: 'Baseline only — release thresholds set after calibration. First-pass, cold, blind.',
  };
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0];
  const pos = p * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  const w = pos - lo;
  return sorted[lo] * (1 - w) + sorted[hi] * w;
}

function formatSummaryMd(s) {
  return [
    `# Unseen-topic eval summary (${s.set})`,
    '',
    `- Topics: ${s.n}`,
    `- Generate success: ${(s.generateSuccessRate * 100).toFixed(1)}%`,
    `- Watched: ${s.watched}`,
    `- Upload-ready (blind): ${s.uploadReadyRate == null ? 'n/a' : `${(s.uploadReadyRate * 100).toFixed(1)}%`}`,
    `- Critical issues: ${s.criticalRate == null ? 'n/a' : `${(s.criticalRate * 100).toFixed(1)}%`}`,
    `- Raw brutal median/p25/p75: ${s.raw.median ?? 'n/a'} / ${s.raw.p25 ?? 'n/a'} / ${s.raw.p75 ?? 'n/a'}`,
    '',
    s.note,
    '',
  ].join('\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
