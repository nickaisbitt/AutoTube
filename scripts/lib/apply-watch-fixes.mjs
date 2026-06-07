/**
 * Map Video Watcher results → pipeline fixes (applied before next loop iteration).
 */
import { buildShockHookLine } from '../../e2e/openRouterMock.mjs';
import { buildShortHookOverlay, extractOverlayFromVisionFix } from './patch-project-for-loop.mjs';

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
  const pacing = watch.brutal?.report?.scores?.pacing ?? 10;
  const visualVariety = watch.brutal?.report?.scores?.visualVariety ?? 10;
  const repeatPct = watch.repetition?.repeatPct ?? 0;
  const dupRuns = watch.repetition?.duplicateRunCount ?? 0;
  const longestHold = watch.sceneQa?.longestSceneSec ?? watch.repetition?.longestRun?.approxHoldSec ?? 0;
  const sceneFail = watch.sceneQa?.available && watch.sceneQa.pass === false;
  const objectiveFail = watch.objectiveGate?.available && watch.objectiveGate.pass === false;

  if (sceneFail) {
    s.useFastPacing = true;
    s.patternInterrupts = true;
    s.useFfmpegAssembly = true;
    s.harvestVideoFirst = true;
    const prev = s.cutIntervalSec ?? 1.25;
    s.cutIntervalSec = Math.max(0.5, prev - 0.25);
    applied.push(`0. Scene hold FAIL (longest ${longestHold.toFixed(1)}s) → cuts ${prev}s→${s.cutIntervalSec}s, ffmpeg assembly ON`);
  }

  if (objectiveFail) {
    const failed = (watch.objectiveGate?.checks || []).filter((c) => !c.pass).map((c) => c.name);
    s.reHarvestMedia = true;
    s.harvestVideoFirst = true;
    applied.push(`0b. Objective gate FAIL (${failed.join(', ')}) → video-first re-harvest`);
  }

  if (watch.objectiveQa && !watch.objectiveQa.silencePass) {
    s.useFastPacing = true;
    applied.push(`0c. Silence gaps ${watch.objectiveQa.silenceFirst60Sec}s in first 60s → tighten pacing`);
  }

  if (hookFail) {
    s.shockHook = true;
    const visionFix = watch.hookVision?.fix?.trim();
    const extracted = extractOverlayFromVisionFix(visionFix);
    const topicHint = (topic || '').toLowerCase().slice(0, 24);
    const fixMatchesTopic =
      topicHint.length > 0 && visionFix && visionFix.toLowerCase().includes(topicHint.split(/\s+/)[0]);
    s.hookLine = buildShockHookLine(topic, fixMatchesTopic ? extracted || visionFix : undefined);
    s.hookOverlay = buildShortHookOverlay(topic, s.hookLine, { visionFix });
    applied.push(`1. Hook FAIL → overlay: "${s.hookOverlay}"`);
  }

  if (pacing <= 8 || longestHold >= 4) {
    s.useFastPacing = true;
    const prev = s.cutIntervalSec ?? 1.25;
    s.cutIntervalSec = Math.max(0.5, prev - 0.15);
    applied.push(`2. Pacing/hold FAIL → cut interval ${prev}s → ${s.cutIntervalSec}s, fast pacing ON`);
  }

  const renderTier = s.renderTier || 'draft';
  if (renderTier === 'full' && (watch.brutal?.overall ?? 10) < 9.1) {
    s.useFastPacing = true;
    s.cutIntervalSec = Math.max(0.5, (s.cutIntervalSec ?? 1.25) - 0.1);
    s.shockHook = true;
    s.reHarvestMedia = true;
    s.brollPlacement = true;
    s.minAssetsPerSegment = Math.min(8, Math.max(6, s.minAssetsPerSegment || 4));
    applied.push(`2b. Full-tier score below 9.1 → escalate (cuts=${s.cutIntervalSec}s, assets≥${s.minAssetsPerSegment}/seg)`);
  }

  if (repeatPct >= 25 || dupRuns >= 2 || visualVariety <= 6 || sceneFail) {
    s.reHarvestMedia = true;
    s.forceRealStock = false;
    s.harvestVideoFirst = true;
    s.minAssetsPerSegment = Math.min(8, Math.max(6, (s.minAssetsPerSegment || 4) + (repeatPct >= 40 ? 2 : 0)));
    s.mediaOffset = (s.mediaOffset || 0) + 4;
    const cutsAtFloor = (s.cutIntervalSec ?? 1.25) <= 0.5;
    if (cutsAtFloor && (repeatPct >= 35 || sceneFail)) {
      s.showKineticText = false;
      s.patternInterrupts = true;
      applied.push(`3. Repetition FAIL (${repeatPct}% dup, ${dupRuns} runs) → kinetic OFF, flash cuts ON, re-harvest ≥${s.minAssetsPerSegment}/seg`);
    } else {
      s.showKineticText = false;
      applied.push(`3. Repetition/visual FAIL (${repeatPct}% dup, ${dupRuns} runs) → live harvest ≥${s.minAssetsPerSegment} assets/segment`);
    }
  }

  if (renderTier === 'full' && (watch.brutal?.overall ?? 10) <= 5) {
    s.useFastPacing = true;
    s.showKineticText = false;
    applied.push('4. Overall ≤5/10 on full tier → fast pacing ON, kinetic OFF');
  }

  if (watch.legacyVision?.technical?.issues?.some((i) => /loudness/i.test(i))) {
    applied.push('5. Loudness off target → YouTube voice-first mix (AUTOTUBE_YOUTUBE_MODE=1)');
  }

  s.appliedFixes = [...(s.appliedFixes || []), ...applied.map((a) => `[${new Date().toISOString()}] ${a}`)];

  const objectivePass = watch.objectiveGate?.pass === true;
  const uploadReady = watch.uploadReady === true;

  return {
    applied,
    fixState: s,
    blockNextTopic: applied.length > 0 && !(uploadReady || (objectivePass && renderTier === 'draft')),
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
  lines.push(`1. cutIntervalSec: ${fixState.cutIntervalSec}`);
  lines.push(`2. showKineticText: ${fixState.showKineticText}`);
  lines.push(`3. useFastPacing: ${fixState.useFastPacing}`);
  lines.push(`4. shockHook: ${fixState.shockHook}`);
  lines.push(`5. hookLine: ${fixState.hookLine || '(auto)'}`);
  lines.push(`6. hookOverlay: ${fixState.hookOverlay || '(auto)'}`);
  lines.push(`7. reHarvestMedia: ${fixState.reHarvestMedia}`);
  lines.push(`8. minAssetsPerSegment: ${fixState.minAssetsPerSegment || 4}`);
  lines.push(`9. mediaOffset: ${fixState.mediaOffset}`);
  lines.push(`10. topicRetryCount: ${fixState.topicRetryCount}/${fixState.maxRetriesPerTopic}`);
  lines.push(`11. generateFailureCount: ${fixState.generateFailureCount || 0}/${fixState.maxGenerateFailuresPerTopic || 2}`);
  lines.push(`12. patternInterrupts: ${fixState.patternInterrupts === true}`);
  lines.push(`13. forceRealStock: ${fixState.forceRealStock === true}`);
  lines.push(`14. renderTier: ${fixState.renderTier || 'draft'}`);
  lines.push(`15. useFfmpegAssembly: ${fixState.useFfmpegAssembly !== false}`);
  lines.push(`16. harvestVideoFirst: ${fixState.harvestVideoFirst !== false}`);
  lines.push(`17. whisperAlign: ${fixState.whisperAlign === true}`);
  lines.push(`18. brollPlacement: ${fixState.brollPlacement !== false}`);
  return lines.join('\n');
}
