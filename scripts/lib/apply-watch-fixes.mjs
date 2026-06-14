/**
 * Map Video Watcher results → pipeline fixes (applied before next loop iteration).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildShockHookLine } from '../../e2e/openRouterMock.mjs';
import { buildShortHookOverlay } from './patch-project-for-loop.mjs';
import {
  detectGiphyDominance,
  countSegmentVideos,
  countRealSegmentVideos,
  LOOP_MAX_MIN_ASSETS_PER_SEGMENT,
} from './harvest-quality.mjs';
import { normalizeUrlKey, isOverBroadExcludeUrl, sanitizeExcludedUrls, pruneExcludedUrlsForReharvest, accumulateVisionRejectedUrls } from './harvest-loop-context.mjs';
import { collectAssemblyExcludeUrls } from './harvest-quality.mjs';
import {
  loadRenderManifest,
  formatPlaceholderSegmentDetail,
  placeholderSegmentsFromManifest,
} from './run-objective-qa.mjs';

const CUT_FLOOR = 0.5;

function weakestAssemblySubScore(audit) {
  const scores = {
    repeatPenalty: typeof audit?.repeatPenalty === 'number' ? audit.repeatPenalty : 100,
    topicRelevance: typeof audit?.topicRelevance === 'number' ? audit.topicRelevance : 100,
    captionCoherence: typeof audit?.captionCoherence === 'number' ? audit.captionCoherence : 100,
    visualCohesion: typeof audit?.visualCohesion === 'number' ? audit.visualCohesion : 100,
  };
  let weakest = 'repeatPenalty';
  for (const [key, val] of Object.entries(scores)) {
    if (val < scores[weakest]) weakest = key;
  }
  return { weakest, scores };
}

function targetScore100(untilScore = 91) {
  return untilScore > 10 ? untilScore : Math.round(untilScore * 10);
}

function watchYoutubeScore(watch) {
  if (typeof watch.youtubeScore === 'number') return watch.youtubeScore;
  const legacy = watch.brutal?.overall;
  return typeof legacy === 'number' ? legacy * 10 : 100;
}

function retentionScore(watch, key, fallback = 100) {
  const s100 = watch.brutal?.report?.scores100?.[key];
  if (typeof s100 === 'number') return s100;
  const s10 = watch.brutal?.report?.scores?.[key];
  if (typeof s10 === 'number') return s10 * 10;
  return fallback;
}

/**
 * Escalate fix strategy when interval cuts alone are not working.
 * @param {object} s — fix state (mutated)
 * @param {string[]} applied
 * @param {string} reason
 */
function escalateFixStrategy(s, applied, reason, { sceneFirst = false } = {}) {
  const cuts = s.cutIntervalSec ?? 1.25;

  const tryHardCuts = () => {
    if (!s.ffmpegHardCuts) {
      s.fixStrategy = 'hard_cuts';
      s.ffmpegHardCuts = true;
      s.useFfmpegAssembly = true;
      applied.push(`${reason} → strategy hard_cuts (per-clip fade, no zoompan)`);
      return true;
    }
    return false;
  };

  const tryInterval = () => {
    if (cuts > CUT_FLOOR) {
      s.fixStrategy = 'interval';
      s.cutIntervalSec = Math.max(CUT_FLOOR, cuts - 0.25);
      s.useFfmpegAssembly = true;
      if (!s.preferImageAssembly) s.harvestVideoFirst = true;
      applied.push(`${reason} → strategy interval (cuts ${cuts}s→${s.cutIntervalSec}s)`);
      return true;
    }
    return false;
  };

  if (sceneFirst) {
    if (tryHardCuts()) return;
    if (tryInterval()) return;
  } else {
    if (tryInterval()) return;
    if (tryHardCuts()) return;
  }

  s.fixStrategy = 'reharvest';
  s.reHarvestMedia = true;
  s.mediaOffset = (s.mediaOffset || 0) + 4;
  s.harvestVideoFirst = false;
  s.preferImageAssembly = true;
  s.useCuratedPool = true;
  s.minAssetsPerSegment = Math.min(
    LOOP_MAX_MIN_ASSETS_PER_SEGMENT,
    Math.max(2, (s.minAssetsPerSegment || 4) + 1),
  );
  applied.push(
    `${reason} → strategy reharvest (next nonce ${(s.harvestNonce || 0) + 1}, offset ${s.mediaOffset}, ≥${s.minAssetsPerSegment}/seg)`,
  );
}

/**
 * Collect normalized URLs for media in segments that rendered placeholder clips.
 * @param {object|null} project
 * @param {Set<string>} deadSegmentIds
 */
function collectDeadAssetUrls(project, deadSegmentIds) {
  const urls = [];
  if (!project?.media?.length || deadSegmentIds.size === 0) return urls;
  for (const m of project.media) {
    if (!deadSegmentIds.has(m.segmentId)) continue;
    const key = normalizeUrlKey(m.url, m.sourceUrl);
    if (key) urls.push(key);
  }
  return urls;
}

/**
 * @param {string} root
 * @returns {object|null}
 */
function loadLastProject(root = process.cwd()) {
  const path = join(root, 'test-recordings', 'last-project.json');
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Resolve render-manifest from explicit video path or canonical last render.
 * @param {string} root
 * @param {string} [videoPath]
 * @returns {object|null}
 */
function resolveRenderManifest(root = process.cwd(), videoPath = '') {
  const candidates = [
    videoPath,
    join(root, 'test-recordings', 'FINAL-VIDEO-final.mp4'),
  ].filter(Boolean);
  for (const vp of candidates) {
    const manifest = loadRenderManifest(vp);
    if (manifest) return manifest;
  }
  return null;
}

/**
 * @param {object} watch — watchVideo() result
 * @param {object} fixState — mutable loop fix state
 * @param {string} [topic] — current video topic (for topic-aware hook lines)
 * @param {object|null} [project] — harvested project (defaults to last-project.json)
 * @returns {{ applied: string[], fixState: object, blockNextTopic: boolean }}
 */
export function applyFixesFromWatch(watch, fixState, topic = '', project = null, options = {}) {
  const untilScore = options.untilScore ?? 9.1;
  const applied = [];
  const s = { ...fixState };
  let assemblyWidenedCuts = false;
  let assemblyFixApplied = false;

  const hookFail = watch.hookScript?.pass === false || watch.hookVision?.hookPass === false;
  const pacing = retentionScore(watch, 'pacing', 100);
  const overall = watch.finalScore ?? watchYoutubeScore(watch);
  const assemblyScore = watch.assemblyAudit?.assemblyScore ?? 100;
  const assemblyFail = assemblyScore < 80;
  const target100 = targetScore100(untilScore);
  // Mid-band with weak pacing: fix render-side first, avoid reharvest starvation.
  const pacingPlateau = overall >= 72 && overall <= 84 && pacing <= 55;
  const visualVariety = retentionScore(watch, 'visualVariety', 100);
  const repeatPct = watch.repetition?.repeatPct ?? 0;
  const dupRuns = watch.repetition?.duplicateRunCount ?? 0;
  const longestHold = watch.sceneQa?.longestSceneSec ?? watch.repetition?.longestRun?.approxHoldSec ?? 0;
  const sceneFail = watch.sceneQa?.available && watch.sceneQa.pass === false;
  const objectiveFail = watch.objectiveGate?.available && watch.objectiveGate.pass === false;

  if (sceneFail) {
    s.useFastPacing = true;
    s.patternInterrupts = true;
    escalateFixStrategy(s, applied, `0. Scene hold FAIL (longest ${longestHold.toFixed(1)}s)`, { sceneFirst: true });
  }

  if (objectiveFail) {
    const failed = (watch.objectiveGate?.checks || []).filter((c) => !c.pass).map((c) => c.name);
    if (failed.includes('placeholder_pct')) {
      s.reHarvestMedia = true;
      s.mediaOffset = (s.mediaOffset || 0) + 2;
      s.harvestVideoFirst = true;
      s.suppressGiphy = true;
      s.minVideosPerSegment = Math.max(2, s.minVideosPerSegment || 2);
      s.fixStrategy = 'reharvest';
      // Do not raise minAssets — top-up satisfies volume; higher mins starve browser harvest.
      s.minAssetsPerSegment = Math.min(
        LOOP_MAX_MIN_ASSETS_PER_SEGMENT,
        s.minAssetsPerSegment || LOOP_MAX_MIN_ASSETS_PER_SEGMENT,
      );
      const harvestProject = project || loadLastProject();
      const manifest = resolveRenderManifest(process.cwd(), options.videoPath || watch.videoPath || '');
      const placeholderKeys = (manifest?.placeholderUrls || [])
        .map((u) => normalizeUrlKey(u) || (u || '').split('?')[0].toLowerCase())
        .filter((k) => k && !isOverBroadExcludeUrl(k));
      const badSegments = placeholderSegmentsFromManifest(manifest?.perSegment || []);
      const deadSegmentIds = new Set(badSegments.map((seg) => seg.segmentId));
      const segDetail = badSegments.length ? formatPlaceholderSegmentDetail(badSegments) : '';
      if (harvestProject?.media?.length || placeholderKeys.length) {
      const prev = new Set(sanitizeExcludedUrls(s.excludedUrls || []).map((u) => normalizeUrlKey(u)));
      if (placeholderKeys.length) {
        for (const key of placeholderKeys) {
          if (!isOverBroadExcludeUrl(key)) prev.add(key);
        }
      } else {
          const deadUrls = collectDeadAssetUrls(harvestProject, deadSegmentIds);
          if (deadUrls.length) {
            for (const key of deadUrls) prev.add(key);
          } else if (harvestProject?.media?.length) {
            for (const m of harvestProject.media) {
              if (m.type !== 'video' && !/\/api\/download-clip/i.test(m.url || '')) continue;
              const key = normalizeUrlKey(m.url, m.sourceUrl);
              if (key) prev.add(key);
            }
          }
        }
        s.excludedUrls = [...prev].slice(-400);
      }
      const pct = watch.placeholderGate?.placeholderPct ?? manifest?.placeholderPct;
      const pctNote = typeof pct === 'number' ? `${pct}%` : 'high';
      const excludeNote = placeholderKeys.length
        ? `${placeholderKeys.length} placeholder URL(s) from render-manifest`
        : `${(s.excludedUrls || []).length} excluded URLs`;
      applied.push(
        `0a. Placeholder gate FAIL (${pctNote}${segDetail ? `; dead segs: ${segDetail}` : ''}) → reharvest next nonce ${(s.harvestNonce || 0) + 1}, exclude dead URLs, video-first (${excludeNote})`,
      );
    } else if (failed.some((n) => n.startsWith('scene_'))) {
      escalateFixStrategy(s, applied, `0b. Objective scene FAIL (${failed.join(', ')})`, { sceneFirst: true });
    } else {
      s.reHarvestMedia = true;
      s.mediaOffset = (s.mediaOffset || 0) + 2;
      s.harvestVideoFirst = false;
      s.preferImageAssembly = true;
      s.useCuratedPool = true;
      s.fixStrategy = 'reharvest';
      applied.push(`0b. Objective gate FAIL (${failed.join(', ')}) → reharvest next nonce ${(s.harvestNonce || 0) + 1}`);
    }
  }

  if (watch.objectiveQa && !watch.objectiveQa.silencePass) {
    s.useFastPacing = true;
    applied.push(`0c. Silence gaps ${watch.objectiveQa.silenceFirst60Sec}s in first 60s → tighten pacing`);
  }

  if (watch.thinHarvest) {
    s.reHarvestMedia = true;
    s.harvestNonce = (s.harvestNonce || 0) + 1;
    s.mediaOffset = 0;
    s.harvestVideoFirst = false;
    s.preferImageAssembly = true;
    s.useCuratedPool = true;
    s.fixStrategy = 'reharvest';
    const beforePrune = (s.excludedUrls || []).length;
    s.excludedUrls = pruneExcludedUrlsForReharvest(s.excludedUrls || []);
    applied.push(
      `0e. Thin harvest (empty browser) → pruned ${beforePrune} exclusions → ${s.excludedUrls.length} lifestyle-only, reharvest nonce ${s.harvestNonce}, offset reset`,
    );
  }

  if (assemblyFail) {
    const { weakest, scores } = weakestAssemblySubScore(watch.assemblyAudit);
    assemblyFixApplied = true;
    const harvestProject = project || loadLastProject();

    if (weakest === 'captionCoherence') {
      s.fixStrategy = 'captions';
      applied.push(`0d. Assembly captionCoherence ${scores.captionCoherence}/100 → caption policy fix (no reharvest)`);
    } else if (weakest === 'repeatPenalty') {
      s.reHarvestMedia = true;
      s.harvestNonce = (s.harvestNonce || 0) + 1;
      s.mediaOffset = 0;
      s.harvestVideoFirst = true;
      s.suppressGiphy = true;
      s.fixStrategy = 'reharvest';
      s.useCuratedPool = true;
      applied.push(`0d. Assembly repeatPenalty ${scores.repeatPenalty}/100 → curated pool + reharvest (cuts unchanged)`);
    } else if (weakest === 'topicRelevance') {
      s.reHarvestMedia = true;
      s.harvestNonce = (s.harvestNonce || 0) + 1;
      s.mediaOffset = 0;
      s.harvestVideoFirst = true;
      s.suppressGiphy = true;
      s.fixStrategy = 'reharvest';
      if (harvestProject?.media?.length) {
        const rejected = [...collectAssemblyExcludeUrls(harvestProject)];
        accumulateVisionRejectedUrls(s, rejected);
        s.excludedUrls = pruneExcludedUrlsForReharvest(s.excludedUrls || []);
        applied.push(`0d. Assembly topicRelevance ${scores.topicRelevance}/100 → vision-targeted exclude ${rejected.length} URL(s), reharvest nonce ${s.harvestNonce}`);
      } else {
        applied.push(`0d. Assembly topicRelevance ${scores.topicRelevance}/100 → reharvest nonce ${s.harvestNonce}`);
      }
    } else if (weakest === 'visualCohesion') {
      s.fixStrategy = 'hard_cuts';
      s.ffmpegHardCuts = true;
      s.useFfmpegAssembly = true;
      s.patternInterrupts = true;
      s.cutIntervalSec = Math.min(1.8, Math.max(1.2, s.cutIntervalSec ?? 1.4));
      applied.push(`0d. Assembly visualCohesion ${scores.visualCohesion}/100 → hard_cuts + interval ${s.cutIntervalSec}s`);
    } else {
      s.reHarvestMedia = true;
      s.harvestNonce = (s.harvestNonce || 0) + 1;
      s.mediaOffset = 0;
      s.harvestVideoFirst = true;
      s.suppressGiphy = true;
      s.fixStrategy = 'reharvest';
      applied.push(`0d. Assembly FAIL (${assemblyScore}/100) → reharvest nonce ${s.harvestNonce}, offset reset`);
    }

    const repeatMontage = (watch.assemblyAudit?.issues || []).some((i) => /repeat|identical|same\s+(shot|location|footage)|redundan/i.test(i));
    if (weakest === 'repeatPenalty' && repeatMontage) {
      applied.push('0d2. Repeat montage — widen cuts skipped (pool growth strategy active)');
    } else if (repeatMontage && weakest !== 'captionCoherence' && weakest !== 'visualCohesion') {
      s.cutIntervalSec = Math.min(2.5, Math.max(1.8, (s.cutIntervalSec ?? 0.5) + 0.6));
      s.useFastPacing = false;
      assemblyWidenedCuts = true;
      applied.push(`0c. Assembly repeat montage → widen cuts to ${s.cutIntervalSec}s`);
    }

    if (weakest !== 'topicRelevance' && weakest !== 'captionCoherence' && harvestProject?.media?.length) {
      const prev = new Set(sanitizeExcludedUrls(s.excludedUrls || []).map((u) => normalizeUrlKey(u)));
      for (const key of collectAssemblyExcludeUrls(harvestProject)) {
        if (key && !isOverBroadExcludeUrl(key)) prev.add(key);
      }
      s.excludedUrls = pruneExcludedUrlsForReharvest([...prev]);
    }
  }

  if (hookFail) {
    s.shockHook = true;
    s.patternInterrupts = true;
    const visionFix = watch.hookVision?.fix?.trim();
    s.hookLine = buildShockHookLine(topic);
    s.hookOverlay = buildShortHookOverlay(topic, s.hookLine, { visionFix });
    applied.push(`1. Hook FAIL → shock hook "${s.hookLine.slice(0, 60)}…", overlay: "${s.hookOverlay}"`);
  }

  const assemblyRepeatIssue = assemblyFail && (
    (watch.assemblyAudit?.issues || []).some((i) => /repeat|identical|same\s+(shot|location|footage)|redundan/i.test(i))
    || repeatPct >= 15
    || dupRuns >= 1
  );

  if ((pacing <= 80 || longestHold >= 4) && !sceneFail && !assemblyRepeatIssue && !assemblyWidenedCuts) {
    s.useFastPacing = true;
    if ((s.cutIntervalSec ?? 1.25) > CUT_FLOOR) {
      const prev = s.cutIntervalSec ?? 1.25;
      const step = pacing <= 55 ? 0.35 : 0.15;
      s.cutIntervalSec = Math.max(CUT_FLOOR, prev - step);
      applied.push(`2. Pacing/hold FAIL → cut interval ${prev}s → ${s.cutIntervalSec}s`);
    }
    if (pacing <= 80) {
      s.patternInterrupts = true;
      applied.push(`2a. Pacing ${pacing}/100 ≤80 → patternInterrupts ON`);
    }
    if (pacing <= 55) {
      s.cutIntervalSec = CUT_FLOOR;
      s.patternInterrupts = true;
      s.useFastPacing = true;
      applied.push(`2c. Pacing ${pacing}/100 ≤55 → cut floor ${CUT_FLOOR}s + strong interrupts`);
    }
  }

  const renderTier = s.renderTier || 'draft';
  if (renderTier === 'full' && overall < target100) {
    s.brollPlacement = true;
    if (pacingPlateau) {
      s.patternInterrupts = true;
      s.useFastPacing = true;
      s.cutIntervalSec = Math.max(CUT_FLOOR, s.cutIntervalSec ?? CUT_FLOOR);
      applied.push(
        `2b. Full-tier pacing plateau (${overall}/100, pacing ${pacing}/100) → strong interrupts, skip reharvest`,
      );
    } else if (assemblyRepeatIssue) {
      // Repeat-montage (step 0c/0d) already widened cuts + scheduled reharvest.
      // Calling escalateFixStrategy here would undo that wider-cut fix via tryInterval().
      applied.push(
        `2b. Full-tier score ${overall}/${target100} — interval escalation skipped (repeat-montage active, reharvest already queued)`,
      );
    } else {
      s.reHarvestMedia = true;
      s.minAssetsPerSegment = Math.min(
        LOOP_MAX_MIN_ASSETS_PER_SEGMENT,
        Math.max(2, s.minAssetsPerSegment || LOOP_MAX_MIN_ASSETS_PER_SEGMENT),
      );
      escalateFixStrategy(s, applied, `2b. Full-tier score below ${target100}/100`);
    }
  }

  const repetitionFail = repeatPct >= 25 || dupRuns >= 2;
  const varietyFail = visualVariety <= 55 || (visualVariety <= 65 && !pacingPlateau);
  if ((repetitionFail || varietyFail) && !pacingPlateau) {
    s.forceRealStock = false;
    s.harvestVideoFirst = true;
    s.showKineticText = false;
    s.reHarvestMedia = true;
    s.mediaOffset = (s.mediaOffset || 0) + 4;
    s.minAssetsPerSegment = Math.min(
      LOOP_MAX_MIN_ASSETS_PER_SEGMENT,
      Math.max(2, (s.minAssetsPerSegment || 4) + (repeatPct >= 40 ? 1 : 0)),
    );
    s.fixStrategy = 'reharvest';
    const reason = repetitionFail
      ? `Repetition FAIL (${repeatPct}% dup, ${dupRuns} runs)`
      : `Visual variety FAIL (${visualVariety}/100)`;
    applied.push(
      `3. ${reason} → reharvest next nonce ${(s.harvestNonce || 0) + 1}, ≥${s.minAssetsPerSegment}/seg`,
    );
  }

  if (visualVariety <= 55) {
    s.harvestVideoFirst = true;
    s.suppressGiphy = true;
    // suppressGiphy removes main GIF source — cap video quota so harvest isn't starved
    s.minVideosPerSegment = 2;
    s.cutIntervalSec = Math.max(CUT_FLOOR, s.cutIntervalSec ?? CUT_FLOOR);
    applied.push(`3a. Visual variety ${visualVariety}/100 → harvestVideoFirst + suppressGiphy + ≥${s.minVideosPerSegment} video/seg`);
  } else if (visualVariety <= 65) {
    s.suppressGiphy = true;
    applied.push(`3a. Visual variety ${visualVariety}/100 → suppressGiphy=true for next harvest`);
  }

  const harvestProject = project || loadLastProject();
  if (harvestProject?.media?.length) {
    const segIds = (harvestProject.script || []).map((seg) => seg.id);
    // Use real-video count (non-Giphy) so that Giphy loops don't satisfy the quota
    // and cause suppressGiphy to be prematurely cleared — Giphy dominance is the failure mode.
    const videoQuotaMet = segIds.length > 0 && segIds.every((id) => countRealSegmentVideos(harvestProject.media, id) >= 2);
    if (videoQuotaMet && s.suppressGiphy === true) {
      s.suppressGiphy = false;
      applied.push('3c. Real video quota met (≥2 non-Giphy clips/seg) → suppressGiphy cleared');
    }

    const { giphyOnlySegments, giphyDominantSegments, giphyTotal } = detectGiphyDominance(harvestProject);
    const giphyHeavy = giphyOnlySegments.length > 0 || giphyDominantSegments.length > 0;
    if (giphyHeavy) {
      s.forceRealStock = true;
      s.suppressGiphy = true;
      s.reHarvestMedia = true;
      s.harvestVideoFirst = true;
      s.fixStrategy = 'reharvest';
      s.mediaOffset = (s.mediaOffset || 0) + 2;
      applied.push(
        `3b. Giphy-heavy harvest (${giphyTotal} giphy, ${giphyOnlySegments.length} giphy-only segs) → forceRealStock=true, suppressGiphy=true`,
      );
    }
  }

  if (renderTier === 'full' && overall <= 50) {
    s.useFastPacing = true;
    s.showKineticText = false;
    applied.push('4. Overall ≤50/100 on full tier → fast pacing ON, kinetic OFF');
  }

  if (watch.legacyVision?.technical?.issues?.some((i) => /loudness/i.test(i))) {
    applied.push('5. Loudness off target → YouTube voice-first mix (AUTOTUBE_YOUTUBE_MODE=1)');
  }

  s.appliedFixes = [...(s.appliedFixes || []), ...applied.map((a) => `[${new Date().toISOString()}] ${a}`)];

  const objectivePass = watch.objectiveGate?.pass === true;
  const sceneBodyOk = !watch.sceneQa?.available || watch.sceneQa?.bodyPass === true;
  const uploadReady = watch.uploadReady === true;
  const forceNewTopic = s.fixStrategy === 'new_topic';

  return {
    applied,
    fixState: s,
    blockNextTopic:
      applied.length > 0 &&
      !(uploadReady || (objectivePass && sceneBodyOk && renderTier === 'draft')) &&
      !forceNewTopic,
  };
}

/**
 * @param {string[]} applied
 * @param {object} fixState
 */
export function formatFixReport(applied, fixState) {
  const lines = ['# Fixes applied before next loop', ''];
  if (applied.length === 0) {
    lines.push('1. No fixes needed — upload-ready or clean pass.');
  } else {
    applied.forEach((a) => lines.push(a.startsWith('1.') ? a : `${lines.length}. ${a}`));
  }
  lines.push('');
  lines.push('## Active pipeline state');
  lines.push(`1. fixStrategy: ${fixState.fixStrategy || 'interval'}`);
  lines.push(`2. cutIntervalSec: ${fixState.cutIntervalSec}`);
  lines.push(`3. ffmpegHardCuts: ${fixState.ffmpegHardCuts === true}`);
  lines.push(`4. showKineticText: ${fixState.showKineticText}`);
  lines.push(`5. useFastPacing: ${fixState.useFastPacing}`);
  lines.push(`6. shockHook: ${fixState.shockHook}`);
  lines.push(`7. hookLine: ${fixState.hookLine || '(auto)'}`);
  lines.push(`8. hookOverlay: ${fixState.hookOverlay || '(auto)'}`);
  lines.push(`9. reHarvestMedia: ${fixState.reHarvestMedia}`);
  lines.push(`10. harvestNonce: ${fixState.harvestNonce || 0}`);
  lines.push(`11. minAssetsPerSegment: ${fixState.minAssetsPerSegment || 4}`);
  lines.push(`12. mediaOffset: ${fixState.mediaOffset}`);
  lines.push(`13. excludedUrls: ${(fixState.excludedUrls || []).length} tracked`);
  lines.push(`14. topicRetryCount: ${fixState.topicRetryCount}/${fixState.maxRetriesPerTopic}`);
  lines.push(`15. generateFailureCount: ${fixState.generateFailureCount || 0}/${fixState.maxGenerateFailuresPerTopic || 2}`);
  lines.push(`16. patternInterrupts: ${fixState.patternInterrupts === true}`);
  lines.push(`17. forceRealStock: ${fixState.forceRealStock === true}`);
  lines.push(`17a. suppressGiphy: ${fixState.suppressGiphy === true}`);
  lines.push(`18. renderTier: ${fixState.renderTier || 'draft'}`);
  lines.push(`19. useFfmpegAssembly: ${fixState.useFfmpegAssembly !== false}`);
  lines.push(`20. harvestVideoFirst: ${fixState.harvestVideoFirst !== false}`);
  lines.push(`21. whisperAlign: ${fixState.whisperAlign === true}`);
  lines.push(`22. brollPlacement: ${fixState.brollPlacement !== false}`);
  return lines.join('\n');
}
