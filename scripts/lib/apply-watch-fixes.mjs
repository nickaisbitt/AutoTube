/**
 * Map Video Watcher results → pipeline fixes (applied before next loop iteration).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildShockHookLine } from '../../e2e/openRouterMock.mjs';
import { buildShortHookOverlay } from './patch-project-for-loop.mjs';
import {
  detectGiphyDominance,
  countRealSegmentVideos,
  LOOP_MAX_MIN_ASSETS_PER_SEGMENT,
} from './harvest-quality.mjs';
import {
  normalizeUrlKey,
  isOverBroadExcludeUrl,
  sanitizeExcludedUrls,
  pruneExcludedUrlsForReharvest,
  accumulateVisionRejectedUrls,
  isEditorialHarvestKeep,
} from './harvest-loop-context.mjs';
import { collectAssemblyExcludeUrls } from './harvest-quality.mjs';
import {
  loadRenderManifest,
  formatPlaceholderSegmentDetail,
  placeholderSegmentsFromManifest,
} from './run-objective-qa.mjs';

const CUT_FLOOR = 0.5;
const LOOP_SCENE_CUT_FLOOR = 1.0;
export const IMAGE_FIRST_CUT_FLOOR = 1.15;
const VISUAL_COHESION_MIN_CUT = 1.4;
const VISUAL_COHESION_MAX_CUT = 1.8;

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

function failedObjectiveChecks(watch) {
  return (watch.objectiveGate?.checks || [])
    .filter((check) => check && check.pass === false)
    .map((check) => check.name)
    .filter(Boolean);
}

function hasPlaceholderFailure(watch) {
  return failedObjectiveChecks(watch).includes('placeholder_pct') || watch.placeholderGate?.pass === false;
}

function hasSceneFailure(watch) {
  return (
    (watch.sceneQa?.available && watch.sceneQa.pass === false)
    || failedObjectiveChecks(watch).some((name) => name.startsWith('scene_'))
  );
}

function hasHookFailure(watch) {
  return watch.hookScript?.pass === false || watch.hookVision?.hookPass === false;
}

function hasPacingFailure(watch) {
  const pacing = retentionScore(watch, 'pacing', 100);
  const longestHold = watch.sceneQa?.longestSceneSec ?? watch.repetition?.longestRun?.approxHoldSec ?? 0;
  return pacing <= 80 || longestHold >= 4 || watch.objectiveQa?.silencePass === false;
}

function clampCutIntervalFloor(s, floor, fallback = 1.25) {
  const current = typeof s.cutIntervalSec === 'number' ? s.cutIntervalSec : fallback;
  s.cutIntervalSec = Math.max(floor, current);
  return s.cutIntervalSec;
}

function tightenCutInterval(s, { step = 0.15, floor = CUT_FLOOR, fallback = 1.25 } = {}) {
  const prev = typeof s.cutIntervalSec === 'number' ? s.cutIntervalSec : fallback;
  const next = Math.max(floor, prev - step);
  s.cutIntervalSec = next;
  return { prev, next };
}

function activateImageFirstReharvest(
  s,
  { bumpNonce = false, resetOffset = false, mediaOffsetDelta = 0, suppressGiphy = true } = {},
) {
  s.reHarvestMedia = true;
  if (bumpNonce) s.harvestNonce = (s.harvestNonce || 0) + 1;
  if (resetOffset) s.mediaOffset = 0;
  else if (mediaOffsetDelta !== 0) s.mediaOffset = (s.mediaOffset || 0) + mediaOffsetDelta;
  s.harvestVideoFirst = false;
  s.preferImageAssembly = true;
  s.useCuratedPool = true;
  s.fixStrategy = 'reharvest';
  s.minVideosPerSegment = 0;
  clampCutIntervalFloor(s, IMAGE_FIRST_CUT_FLOOR);
  if (suppressGiphy) s.suppressGiphy = true;
}

function mergeExcludedUrlKeys(existingUrls = [], keys = [], { prune = false } = {}) {
  const merged = new Set(
    sanitizeExcludedUrls(existingUrls)
      .map((u) => normalizeUrlKey(u) || (u || '').split('?')[0].toLowerCase())
      .filter(Boolean),
  );
  for (const entry of keys) {
    const key = normalizeUrlKey(entry) || (entry || '').split('?')[0].toLowerCase();
    if (!key || isOverBroadExcludeUrl(key) || isEditorialHarvestKeep(key)) continue;
    merged.add(key);
  }
  const next = [...merged];
  return prune ? pruneExcludedUrlsForReharvest(next) : next.slice(-400);
}

function isAssemblyRepeatIssue(watch, repeatPct, dupRuns) {
  return (
    (watch.assemblyAudit?.issues || []).some((i) => /repeat|identical|same\s+(shot|location|footage)|redundan/i.test(i))
    || repeatPct >= 15
    || dupRuns >= 1
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
    if (isEditorialHarvestKeep(m)) continue;
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

export function pickPrimaryFailure(watch = {}) {
  if (hasPlaceholderFailure(watch)) return 'placeholder';
  if ((watch.assemblyAudit?.assemblyScore ?? 100) < 80) return 'assembly';
  if (hasSceneFailure(watch)) return 'scene';
  if (hasHookFailure(watch)) return 'hook';
  if (hasPacingFailure(watch)) return 'pacing';
  if (watch.thinHarvest) return 'harvest';
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

  const pacing = retentionScore(watch, 'pacing', 100);
  const overall = watch.finalScore ?? watchYoutubeScore(watch);
  const assemblyScore = watch.assemblyAudit?.assemblyScore ?? 100;
  const target100 = targetScore100(untilScore);
  const renderTier = s.renderTier || 'draft';
  const pacingPlateau = overall >= 72 && overall <= 84 && pacing <= 55;
  const visualVariety = retentionScore(watch, 'visualVariety', 100);
  const repeatPct = watch.repetition?.repeatPct ?? 0;
  const dupRuns = watch.repetition?.duplicateRunCount ?? 0;
  const longestHold = watch.sceneQa?.longestSceneSec ?? watch.repetition?.longestRun?.approxHoldSec ?? 0;
  const objectiveFailed = failedObjectiveChecks(watch);
  const primaryFailure = pickPrimaryFailure(watch);
  const harvestProject = project || loadLastProject();

  switch (primaryFailure) {
    case 'placeholder': {
      activateImageFirstReharvest(s, { mediaOffsetDelta: 2, suppressGiphy: true });
      s.minAssetsPerSegment = Math.min(
        LOOP_MAX_MIN_ASSETS_PER_SEGMENT,
        s.minAssetsPerSegment || LOOP_MAX_MIN_ASSETS_PER_SEGMENT,
      );
      const manifest = resolveRenderManifest(process.cwd(), options.videoPath || watch.videoPath || '');
      const placeholderKeys = (manifest?.placeholderUrls || [])
        .map((u) => normalizeUrlKey(u) || (u || '').split('?')[0].toLowerCase())
        .filter((k) => k && !isOverBroadExcludeUrl(k) && !isEditorialHarvestKeep(k));
      const badSegments = placeholderSegmentsFromManifest(manifest?.perSegment || []);
      const deadSegmentIds = new Set(badSegments.map((seg) => seg.segmentId));
      const segDetail = badSegments.length ? formatPlaceholderSegmentDetail(badSegments) : '';
      const excludeKeys = [];
      if (placeholderKeys.length) {
        excludeKeys.push(...placeholderKeys);
      } else if (harvestProject?.media?.length) {
        const deadUrls = collectDeadAssetUrls(harvestProject, deadSegmentIds);
        if (deadUrls.length) {
          excludeKeys.push(...deadUrls);
        } else {
          for (const m of harvestProject.media) {
            if (m.type !== 'video' && !/\/api\/download-clip/i.test(m.url || '')) continue;
            if (isEditorialHarvestKeep(m)) continue;
            const key = normalizeUrlKey(m.url, m.sourceUrl);
            if (key) excludeKeys.push(key);
          }
        }
      }
      if (excludeKeys.length) {
        s.excludedUrls = mergeExcludedUrlKeys(s.excludedUrls || [], excludeKeys);
      }
      const pct = watch.placeholderGate?.placeholderPct ?? manifest?.placeholderPct;
      const pctNote = typeof pct === 'number' ? `${pct}%` : 'high';
      const excludeNote = placeholderKeys.length
        ? `${placeholderKeys.length} placeholder URL(s) from render-manifest`
        : `${(s.excludedUrls || []).length} excluded URLs`;
      applied.push(
        `0a. Placeholder gate FAIL (${pctNote}${segDetail ? `; dead segs: ${segDetail}` : ''}) → reharvest next nonce ${(s.harvestNonce || 0) + 1}, image-first curated pool (${excludeNote}, cuts ≥${IMAGE_FIRST_CUT_FLOOR}s)`,
      );
      break;
    }
    case 'assembly': {
      const { weakest, scores } = weakestAssemblySubScore(watch.assemblyAudit);
      const repeatMontage = isAssemblyRepeatIssue(watch, repeatPct, dupRuns);

      if (weakest === 'captionCoherence') {
        s.fixStrategy = 'captions';
        s.reHarvestMedia = false;
        applied.push(`0d. Assembly captionCoherence ${scores.captionCoherence}/100 → caption policy fix (no reharvest)`);
        break;
      }

      if (weakest === 'visualCohesion') {
        s.fixStrategy = 'hard_cuts';
        s.ffmpegHardCuts = true;
        s.useFfmpegAssembly = true;
        s.patternInterrupts = true;
        activateImageFirstReharvest(s, { bumpNonce: true, resetOffset: false, suppressGiphy: true });
        s.fixStrategy = 'hard_cuts';
        s.cutIntervalSec = Math.min(
          VISUAL_COHESION_MAX_CUT,
          Math.max(VISUAL_COHESION_MIN_CUT, s.cutIntervalSec ?? VISUAL_COHESION_MIN_CUT),
        );
        applied.push(
          `0d. Assembly visualCohesion ${scores.visualCohesion}/100 → curated reharvest + hard_cuts ${s.cutIntervalSec}s`,
        );
        break;
      }

      activateImageFirstReharvest(s, { bumpNonce: true, resetOffset: true, suppressGiphy: true });
      if (harvestProject?.media?.length) {
        const excluded = [...collectAssemblyExcludeUrls(harvestProject)];
        if (weakest === 'topicRelevance') {
          accumulateVisionRejectedUrls(s, excluded);
        }
        s.excludedUrls = mergeExcludedUrlKeys(s.excludedUrls || [], excluded, { prune: true });
      }

      if (weakest === 'topicRelevance') {
        const rejectedCount = (s.visionRejectedUrls || []).length;
        applied.push(
          `0d. Assembly topicRelevance ${scores.topicRelevance}/100 → vision-targeted exclude ${rejectedCount} URL(s), curated image-first reharvest nonce ${s.harvestNonce}`,
        );
      } else if (weakest === 'repeatPenalty' || repeatMontage) {
        applied.push(
          `0d. Assembly repeatPenalty ${scores.repeatPenalty}/100 → curated image-first reharvest (cuts held at ${s.cutIntervalSec}s, no video-first harvest)`,
        );
      } else {
        applied.push(
          `0d. Assembly FAIL (${assemblyScore}/100) → curated image-first reharvest nonce ${s.harvestNonce}`,
        );
      }
      break;
    }
    case 'scene': {
      s.fixStrategy = 'interval';
      s.reHarvestMedia = false;
      s.useFastPacing = true;
      s.patternInterrupts = true;
      s.useFfmpegAssembly = true;
      const sceneChecks = objectiveFailed.filter((name) => name.startsWith('scene_'));
      const reason = sceneChecks.length
        ? `Objective scene FAIL (${sceneChecks.join(', ')})`
        : `Scene hold FAIL (longest ${longestHold.toFixed(1)}s)`;
      const step = longestHold >= 6 ? 0.35 : 0.25;
      const { prev, next } = tightenCutInterval(s, {
        step,
        floor: LOOP_SCENE_CUT_FLOOR,
        fallback: Math.max(1.25, s.cutIntervalSec ?? 1.25),
      });
      applied.push(`0b. ${reason} → cut interval ${prev}s → ${next}s + patternInterrupts`);
      if (watch.objectiveQa && !watch.objectiveQa.silencePass) {
        applied.push(`0c. Silence gaps ${watch.objectiveQa.silenceFirst60Sec}s in first 60s → keep tighter scene pacing`);
      }
      if (watch.thinHarvest) {
        const beforePrune = (s.excludedUrls || []).length;
        s.excludedUrls = pruneExcludedUrlsForReharvest(s.excludedUrls || []);
        activateImageFirstReharvest(s, { bumpNonce: true, resetOffset: true, suppressGiphy: true });
        applied.push(
          `0e. Thin harvest with scene fail → pruned ${beforePrune} exclusions → ${s.excludedUrls.length} lifestyle-only, image-first reharvest nonce ${s.harvestNonce}`,
        );
      }
      break;
    }
    case 'hook': {
      s.fixStrategy = 'hook';
      s.reHarvestMedia = false;
      s.shockHook = true;
      const visionFix = watch.hookVision?.fix?.trim();
      s.hookLine = buildShockHookLine(topic);
      s.hookOverlay = buildShortHookOverlay(topic, s.hookLine, { visionFix });
      applied.push(`1. Hook FAIL → shock hook "${s.hookLine.slice(0, 60)}…", overlay: "${s.hookOverlay}"`);
      break;
    }
    case 'pacing': {
      s.fixStrategy = 'interval';
      s.reHarvestMedia = false;
      s.useFastPacing = true;
      s.patternInterrupts = true;
      const step = pacing <= 55 ? 0.35 : 0.15;
      const { prev, next } = tightenCutInterval(s, { step, floor: CUT_FLOOR });
      applied.push(`2. Pacing/hold FAIL → cut interval ${prev}s → ${next}s`);
      if (pacing <= 80) {
        applied.push(`2a. Pacing ${pacing}/100 ≤80 → patternInterrupts ON`);
      }
      if (watch.objectiveQa && !watch.objectiveQa.silencePass) {
        applied.push(`2a2. Silence gaps ${watch.objectiveQa.silenceFirst60Sec}s in first 60s → tighten pacing`);
      }
      if (pacing <= 55) {
        s.cutIntervalSec = CUT_FLOOR;
        applied.push(`2c. Pacing ${pacing}/100 ≤55 → cut floor ${CUT_FLOOR}s + strong interrupts`);
      }
      if (renderTier === 'full' && overall < target100) {
        s.brollPlacement = true;
        applied.push(
          `2b. Full-tier score ${overall}/${target100} with pacing ${pacing}/100 → retention-first pacing pass`,
        );
      }
      break;
    }
    case 'harvest': {
      const beforePrune = (s.excludedUrls || []).length;
      s.excludedUrls = pruneExcludedUrlsForReharvest(s.excludedUrls || []);
      activateImageFirstReharvest(s, { bumpNonce: true, resetOffset: true, suppressGiphy: true });
      applied.push(
        `0e. Thin harvest (empty browser) → pruned ${beforePrune} exclusions → ${s.excludedUrls.length} lifestyle-only, reharvest nonce ${s.harvestNonce}, offset reset`,
      );
      break;
    }
    default:
      break;
  }

  if (primaryFailure === null && renderTier === 'full' && overall < target100) {
    s.brollPlacement = true;
    s.useFastPacing = true;
    s.patternInterrupts = true;
    s.cutIntervalSec = Math.max(CUT_FLOOR, s.cutIntervalSec ?? CUT_FLOOR);
    applied.push(`2b. Full-tier score below ${target100}/100 → retention-first pacing pass`);
  }

  const repetitionFail = repeatPct >= 25 || dupRuns >= 2;
  const varietyFail = visualVariety <= 55 || (visualVariety <= 65 && !pacingPlateau);
  if (primaryFailure === null && !s.preferImageAssembly && (repetitionFail || varietyFail) && !pacingPlateau) {
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

  if (primaryFailure === null && !s.preferImageAssembly && visualVariety <= 55) {
    s.harvestVideoFirst = true;
    s.suppressGiphy = true;
    s.minVideosPerSegment = 2;
    s.cutIntervalSec = Math.max(CUT_FLOOR, s.cutIntervalSec ?? CUT_FLOOR);
    applied.push(`3a. Visual variety ${visualVariety}/100 → harvestVideoFirst + suppressGiphy + ≥${s.minVideosPerSegment} video/seg`);
  } else if (primaryFailure === null && visualVariety <= 65) {
    s.suppressGiphy = true;
    applied.push(`3a. Visual variety ${visualVariety}/100 → suppressGiphy=true for next harvest`);
  }

  if (harvestProject?.media?.length) {
    const segIds = (harvestProject.script || []).map((seg) => seg.id);
    const videoQuotaMet = segIds.length > 0 && segIds.every((id) => countRealSegmentVideos(harvestProject.media, id) >= 2);
    if (videoQuotaMet && s.suppressGiphy === true) {
      s.suppressGiphy = false;
      applied.push('3c. Real video quota met (≥2 non-Giphy clips/seg) → suppressGiphy cleared');
    }

    const { giphyOnlySegments, giphyDominantSegments, giphyTotal } = detectGiphyDominance(harvestProject);
    const giphyHeavy = giphyOnlySegments.length > 0 || giphyDominantSegments.length > 0;
    if (primaryFailure === null && !s.preferImageAssembly && giphyHeavy) {
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

  if ((primaryFailure === null || primaryFailure === 'scene' || primaryFailure === 'pacing') && renderTier === 'full' && overall <= 50) {
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
