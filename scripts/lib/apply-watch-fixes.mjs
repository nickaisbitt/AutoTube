/**
 * Map Video Watcher results → pipeline fixes (applied before next loop iteration).
 * Maps brutal dimensions / topIssues to harvest+overlay levers — not just cut-interval thrashing.
 */
import { buildShockHookLine } from '../../e2e/openRouterMock.mjs';
import { buildShortHookOverlay, extractOverlayFromVisionFix } from './patch-project-for-loop.mjs';
import { buildImpactBeatsForTopic } from './impactBeatsByTopic.mjs';

/** Keep hook/overlay aligned to the current topic (prevents bank→landlord leakage). */
function syncTopicHook(s, topic, visionFix) {
  if (!topic) return;
  s.hookLine = buildShockHookLine(topic, s.hookLine);
  s.hookOverlay = buildShortHookOverlay(topic, s.hookLine, {
    preferredOverlay: s.hookOverlay,
    visionFix,
  });
  s.impactBeats = buildImpactBeatsForTopic(topic);
}

const CUT_FLOOR = 0.85;

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
      s.harvestVideoFirst = true;
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
  s.harvestVideoFirst = true;
  s.faceSeekBroll = true;
  applied.push(
    `${reason} → strategy reharvest faces/motion (next nonce ${(s.harvestNonce || 0) + 1}, offset ${s.mediaOffset})`,
  );
}

function parseTopIssueBias(watch) {
  const issues = [
    ...(watch.brutal?.report?.topIssues || []),
    ...Object.values(watch.brutal?.report?.feedback || {}),
  ]
    .map((s) => String(s || '').toLowerCase())
    .join(' ');
  return {
    wantFaces: /face|human|people|person|reaction|emotion/.test(issues),
    wantBright: /dark|muddy|low.?light|underexposed/.test(issues),
    wantLessCorporate: /corporate|generic|stock|office|tech b-?roll/.test(issues),
  };
}

/**
 * @param {object} watch — watchVideo() result
 * @param {object} fixState — mutable loop fix state
 * @param {string} [topic] — current video topic (for topic-aware hook lines)
 * @returns {{ applied: string[], fixState: object, blockNextTopic: boolean }}
 */
export function applyFixesFromWatch(watch, fixState, topic = '') {
  const applied = [];
  const s = { ...fixState };

  const hookFail = watch.hookScript?.pass === false || watch.hookVision?.hookPass === false;
  const pacing = watch.brutal?.report?.scores?.pacing ?? null;
  const visualVariety = watch.brutal?.report?.scores?.visualVariety ?? null;
  const captionReadability = watch.brutal?.report?.scores?.captionReadability ?? null;
  const repeatPct = watch.repetition?.repeatPct ?? 0;
  const dupRuns = watch.repetition?.duplicateRunCount ?? 0;
  const longestHold = watch.sceneQa?.longestSceneSec ?? watch.repetition?.longestRun?.approxHoldSec ?? 0;
  const sceneFail = watch.sceneQa?.available && watch.sceneQa.pass === false;
  const scenePass = watch.sceneQa?.available && watch.sceneQa.pass === true;
  const objectiveFail = watch.objectiveGate?.available && watch.objectiveGate.pass === false;
  const bias = parseTopIssueBias(watch);

  // Dimension snapshot for journal / debugging
  s.lastBrutalScores = {
    overall: watch.brutal?.overall ?? null,
    hook: watch.brutal?.report?.scores?.hook ?? null,
    visualVariety,
    captionReadability,
    pacing,
    youtubeReadiness: watch.brutal?.report?.scores?.youtubeReadiness ?? null,
  };

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
      s.faceSeekBroll = true;
      s.fixStrategy = 'reharvest';
      applied.push(`0a. Placeholder gate FAIL → reharvest faces/motion next nonce ${(s.harvestNonce || 0) + 1}`);
    } else if (failed.some((n) => n.startsWith('scene_'))) {
      escalateFixStrategy(s, applied, `0b. Objective scene FAIL (${failed.join(', ')})`, { sceneFirst: true });
    } else {
      s.reHarvestMedia = true;
      s.mediaOffset = (s.mediaOffset || 0) + 2;
      s.harvestVideoFirst = true;
      s.fixStrategy = 'reharvest';
      applied.push(`0b. Objective gate FAIL (${failed.join(', ')}) → reharvest next nonce ${(s.harvestNonce || 0) + 1}`);
    }
  }

  if (watch.objectiveQa && !watch.objectiveQa.silencePass) {
    s.useFastPacing = true;
    applied.push(`0c. Silence gaps ${watch.objectiveQa.silenceFirst60Sec}s in first 60s → tighten pacing`);
  }

  // Always re-sync topic hook (even on PASS) so bank openers never stick on landlord videos
  {
    const visionFix = watch.hookVision?.fix?.trim();
    const before = s.hookLine;
    syncTopicHook(s, topic, visionFix);
    if (hookFail) {
      s.shockHook = true;
      const extracted = extractOverlayFromVisionFix(visionFix);
      const topicHint = (topic || '').toLowerCase().slice(0, 24);
      const fixMatchesTopic =
        topicHint.length > 0 && visionFix && visionFix.toLowerCase().includes(topicHint.split(/\s+/)[0]);
      s.hookLine = buildShockHookLine(topic, fixMatchesTopic ? extracted || visionFix : undefined);
      s.hookOverlay = buildShortHookOverlay(topic, s.hookLine, { visionFix });
      s.faceSeekBroll = true;
      applied.push(`1. Hook FAIL → overlay: "${s.hookOverlay}" + face-seek intro`);
    } else if (before && before !== s.hookLine) {
      applied.push(`1b. Topic-mismatched hook rewritten → "${s.hookLine}"`);
    }
  }

  // Pacing: only shorten cuts when scene QA fails; if scenes already pass, diversify + interrupts
  if (pacing != null && pacing <= 5) {
    s.patternInterrupts = true;
    s.impactBeatIntervalSec = 5;
    if (sceneFail || longestHold >= 3) {
      if ((s.cutIntervalSec ?? 1.25) > CUT_FLOOR) {
        const prev = s.cutIntervalSec ?? 1.25;
        s.cutIntervalSec = Math.max(CUT_FLOOR, prev - 0.15);
        applied.push(`2. Pacing+scene FAIL → cut interval ${prev}s → ${s.cutIntervalSec}s + zoom-punch`);
      } else {
        applied.push('2. Pacing+scene FAIL → zoom-punch interrupts ON');
      }
    } else if (scenePass) {
      s.faceSeekBroll = true;
      s.reHarvestMedia = true;
      s.mediaOffset = (s.mediaOffset || 0) + 4;
      s.fixStrategy = 'reharvest';
      applied.push('2. Pacing low but scene PASS → diversify B-roll + denser topic impact beats');
    } else {
      s.patternInterrupts = true;
      applied.push('2. Pacing low → zoom-punch pattern interrupts ON');
    }
  }

  const renderTier = s.renderTier || 'draft';
  if (renderTier === 'full' && (watch.brutal?.overall ?? 10) < 7.0) {
    s.reHarvestMedia = true;
    s.brollPlacement = true;
    s.faceSeekBroll = true;
    s.harvestVideoFirst = true;
    s.mediaOffset = (s.mediaOffset || 0) + 4;
    s.fixStrategy = 'reharvest';
    applied.push(
      `2b. Full-tier score ${(watch.brutal?.overall ?? 0)}/10 < 7 → face-seek reharvest (nonce ${(s.harvestNonce || 0) + 1})`,
    );
  }

  // Real repetition only — do NOT treat visualVariety alone as "Repetition FAIL"
  if (repeatPct >= 25 || dupRuns >= 2) {
    s.harvestVideoFirst = true;
    s.faceSeekBroll = true;
    s.reHarvestMedia = true;
    s.mediaOffset = (s.mediaOffset || 0) + 4;
    s.fixStrategy = 'reharvest';
    applied.push(
      `3. Real repetition (${repeatPct}% dup, ${dupRuns} runs) → reharvest next nonce ${(s.harvestNonce || 0) + 1}`,
    );
  } else if (visualVariety != null && visualVariety <= 6) {
    s.harvestVideoFirst = true;
    s.faceSeekBroll = true;
    s.reHarvestMedia = true;
    s.mediaOffset = (s.mediaOffset || 0) + 6;
    s.fixStrategy = 'reharvest';
    // Do not raise minAssets (that pads images and hurts variety further)
    applied.push(
      `3. visualVariety ${visualVariety}/10 → face/human B-roll reharvest (offset ${s.mediaOffset}, no image pad)`,
    );
  }

  if (captionReadability != null && captionReadability <= 5) {
    s.karaokeCaptions = false;
    applied.push('3b. captionReadability ≤5 → hook-only / impact-beat captions (karaoke OFF)');
  } else if (captionReadability != null && captionReadability >= 7 && s.karaokeCaptions === false) {
    // keep hook-only if it was working
  }

  if (bias.wantFaces || bias.wantLessCorporate) {
    s.faceSeekBroll = true;
    applied.push(
      `4. topIssues bias → faceSeek=${bias.wantFaces} lessCorporate=${bias.wantLessCorporate}`,
    );
  }
  if (bias.wantBright) {
    s.preferBrightBroll = true;
    applied.push('4b. topIssues → prefer bright B-roll');
  }

  if (renderTier === 'full' && (watch.brutal?.overall ?? 10) <= 5) {
    s.useFastPacing = true;
    s.patternInterrupts = true;
    s.faceSeekBroll = true;
    // Kinetic text is canvas-only on ffmpeg loop path — do not pretend it helps
    s.showKineticText = false;
    applied.push('5. Overall ≤5/10 → face-seek + zoom-punch (kinetic skipped on ffmpeg path)');
  }

  if (watch.legacyVision?.technical?.issues?.some((i) => /loudness/i.test(i))) {
    applied.push('6. Loudness off target → YouTube voice-first mix (AUTOTUBE_YOUTUBE_MODE=1)');
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
  lines.push(`18. renderTier: ${fixState.renderTier || 'draft'}`);
  lines.push(`19. useFfmpegAssembly: ${fixState.useFfmpegAssembly !== false}`);
  lines.push(`20. harvestVideoFirst: ${fixState.harvestVideoFirst !== false}`);
  lines.push(`21. whisperAlign: ${fixState.whisperAlign === true}`);
  lines.push(`22. brollPlacement: ${fixState.brollPlacement !== false}`);
  lines.push(`23. faceSeekBroll: ${fixState.faceSeekBroll === true}`);
  lines.push(`24. karaokeCaptions: ${fixState.karaokeCaptions !== false}`);
  if (fixState.lastBrutalScores) {
    lines.push(`25. lastBrutal: ${JSON.stringify(fixState.lastBrutalScores)}`);
  }
  return lines.join('\n');
}
