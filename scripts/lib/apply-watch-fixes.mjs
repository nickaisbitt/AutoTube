/**
 * Map Video Watcher results → pipeline fixes (applied before next loop iteration).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildShockHookLine } from '../../e2e/openRouterMock.mjs';
import { buildShortHookOverlay, extractOverlayFromVisionFix } from './patch-project-for-loop.mjs';
import { detectGiphyDominance } from './harvest-quality.mjs';

const CUT_FLOOR = 0.5;

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
  s.minAssetsPerSegment = Math.min(8, Math.max(6, (s.minAssetsPerSegment || 4) + 1));
  applied.push(
    `${reason} → strategy reharvest (next nonce ${(s.harvestNonce || 0) + 1}, offset ${s.mediaOffset}, ≥${s.minAssetsPerSegment}/seg)`,
  );
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
 * @param {object} watch — watchVideo() result
 * @param {object} fixState — mutable loop fix state
 * @param {string} [topic] — current video topic (for topic-aware hook lines)
 * @param {object|null} [project] — harvested project (defaults to last-project.json)
 * @returns {{ applied: string[], fixState: object, blockNextTopic: boolean }}
 */
export function applyFixesFromWatch(watch, fixState, topic = '', project = null) {
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
    escalateFixStrategy(s, applied, `0. Scene hold FAIL (longest ${longestHold.toFixed(1)}s)`, { sceneFirst: true });
  }

  if (objectiveFail) {
    const failed = (watch.objectiveGate?.checks || []).filter((c) => !c.pass).map((c) => c.name);
    if (failed.includes('placeholder_pct')) {
      s.reHarvestMedia = true;
      s.mediaOffset = (s.mediaOffset || 0) + 2;
      s.harvestVideoFirst = true;
      s.fixStrategy = 'reharvest';
      s.minAssetsPerSegment = Math.min(10, Math.max(6, (s.minAssetsPerSegment || 6) + 1));
      applied.push(`0a. Placeholder gate FAIL → reharvest next nonce ${(s.harvestNonce || 0) + 1}, ≥${s.minAssetsPerSegment}/seg`);
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

  if (hookFail) {
    s.shockHook = true;
    s.patternInterrupts = true;
    const visionFix = watch.hookVision?.fix?.trim();
    const extracted = extractOverlayFromVisionFix(visionFix);
    const topicHint = (topic || '').toLowerCase().slice(0, 24);
    const fixMatchesTopic =
      topicHint.length > 0 && visionFix && visionFix.toLowerCase().includes(topicHint.split(/\s+/)[0]);
    s.hookLine = buildShockHookLine(topic, fixMatchesTopic ? extracted || visionFix : undefined);
    s.hookOverlay = buildShortHookOverlay(topic, s.hookLine, { visionFix });
    applied.push(`1. Hook FAIL → patternInterrupts ON, overlay: "${s.hookOverlay}"`);
  }

  if ((pacing <= 8 || longestHold >= 4) && !sceneFail) {
    s.useFastPacing = true;
    if ((s.cutIntervalSec ?? 1.25) > CUT_FLOOR) {
      const prev = s.cutIntervalSec ?? 1.25;
      const step = pacing <= 5 ? 0.35 : 0.15;
      s.cutIntervalSec = Math.max(CUT_FLOOR, prev - step);
      applied.push(`2. Pacing/hold FAIL → cut interval ${prev}s → ${s.cutIntervalSec}s`);
    }
    if (pacing <= 8) {
      s.patternInterrupts = true;
      applied.push(`2a. Pacing ${pacing}/10 ≤8 → patternInterrupts ON`);
    }
    if (pacing <= 5) {
      s.cutIntervalSec = CUT_FLOOR;
      s.patternInterrupts = true;
      s.useFastPacing = true;
      applied.push(`2c. Pacing ${pacing}/10 ≤5 → cut floor ${CUT_FLOOR}s + strong interrupts`);
    }
  }

  const renderTier = s.renderTier || 'draft';
  if (renderTier === 'full' && (watch.brutal?.overall ?? 10) < 9.1) {
    s.reHarvestMedia = true;
    s.brollPlacement = true;
    s.minAssetsPerSegment = Math.min(8, Math.max(6, s.minAssetsPerSegment || 4));
    escalateFixStrategy(s, applied, `2b. Full-tier score below 9.1`);
  }

  if (repeatPct >= 25 || dupRuns >= 2 || visualVariety <= 6) {
    s.forceRealStock = false;
    s.harvestVideoFirst = true;
    s.showKineticText = false;
    s.reHarvestMedia = true;
    s.mediaOffset = (s.mediaOffset || 0) + 4;
    s.minAssetsPerSegment = Math.min(8, Math.max(6, (s.minAssetsPerSegment || 4) + (repeatPct >= 40 ? 2 : 0)));
    s.fixStrategy = 'reharvest';
    applied.push(
      `3. Repetition FAIL (${repeatPct}% dup, ${dupRuns} runs) → reharvest next nonce ${(s.harvestNonce || 0) + 1}, ≥${s.minAssetsPerSegment}/seg`,
    );
  }

  if (visualVariety <= 6) {
    s.suppressGiphy = true;
    applied.push(`3a. Visual variety ${visualVariety}/10 → suppressGiphy=true for next harvest`);
  }

  const harvestProject = project || loadLastProject();
  if (harvestProject?.media?.length) {
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
