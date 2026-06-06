/**
 * Map Video Watcher results → pipeline fixes (applied before next loop iteration).
 */

/**
 * @param {object} watch — watchVideo() result
 * @param {object} fixState — mutable loop fix state
 * @returns {{ applied: string[], fixState: object, blockNextTopic: boolean }}
 */
export function applyFixesFromWatch(watch, fixState) {
  const applied = [];
  const s = { ...fixState };

  const hookFail = watch.hookScript?.pass === false || watch.hookVision?.hookPass === false;
  const pacing = watch.brutal?.report?.scores?.pacing ?? 10;
  const visualVariety = watch.brutal?.report?.scores?.visualVariety ?? 10;
  const repeatPct = watch.repetition?.repeatPct ?? 0;
  const dupRuns = watch.repetition?.duplicateRunCount ?? 0;
  const longestHold = watch.repetition?.longestRun?.approxHoldSec ?? 0;

  if (hookFail) {
    s.shockHook = true;
    if (watch.hookVision?.fix) s.hookLine = watch.hookVision.fix;
    else if (!s.hookLine) {
      s.hookLine = 'Billions lost overnight — and your data could be next.';
    }
    applied.push(`1. Hook FAIL → shock opener: "${s.hookLine.slice(0, 70)}…"`);
  }

  if (pacing <= 8 || longestHold >= 4) {
    s.useFastPacing = true;
    const prev = s.cutIntervalSec ?? 1.25;
    s.cutIntervalSec = Math.max(0.75, prev - 0.2);
    applied.push(`2. Pacing/hold FAIL → cut interval ${prev}s → ${s.cutIntervalSec}s, fast pacing ON`);
  }

  if ((watch.brutal?.overall ?? 10) < 9.1) {
    s.showKineticText = true;
    s.useFastPacing = true;
    s.cutIntervalSec = Math.max(0.75, (s.cutIntervalSec ?? 1.25) - 0.1);
    s.shockHook = true;
    s.reHarvestMedia = true;
    s.minAssetsPerSegment = Math.max(4, s.minAssetsPerSegment || 0);
    applied.push(`2b. Score below 9.1 → escalate all render fixes (cuts=${s.cutIntervalSec}s)`);
  }

  if (repeatPct >= 25 || dupRuns >= 2 || visualVariety <= 6) {
    s.reHarvestMedia = true;
    s.minAssetsPerSegment = Math.max(4, s.minAssetsPerSegment || 0);
    s.showKineticText = true;
    s.mediaOffset = (s.mediaOffset || 0) + 4;
    applied.push(`3. Repetition/visual FAIL (${repeatPct}% dup, ${dupRuns} runs) → live harvest ≥${s.minAssetsPerSegment} assets/segment + kinetic text`);
  }

  if ((watch.brutal?.overall ?? 10) <= 5) {
    s.showKineticText = true;
    s.useFastPacing = true;
    applied.push('4. Overall ≤5/10 → enable kinetic text + fast pacing');
  }

  if (watch.legacyVision?.technical?.issues?.some((i) => /loudness/i.test(i))) {
    applied.push('5. Loudness off target → YouTube voice-first mix (AUTOTUBE_YOUTUBE_MODE=1)');
  }

  s.appliedFixes = [...(s.appliedFixes || []), ...applied.map((a) => `[${new Date().toISOString()}] ${a}`)];

  return {
    applied,
    fixState: s,
    blockNextTopic: applied.length > 0 && !watch.uploadReady,
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
  lines.push(`6. reHarvestMedia: ${fixState.reHarvestMedia}`);
  lines.push(`7. minAssetsPerSegment: ${fixState.minAssetsPerSegment || 4}`);
  lines.push(`8. mediaOffset: ${fixState.mediaOffset}`);
  lines.push(`9. topicRetryCount: ${fixState.topicRetryCount}/${fixState.maxRetriesPerTopic}`);
  lines.push(`10. generateFailureCount: ${fixState.generateFailureCount || 0}/${fixState.maxGenerateFailuresPerTopic || 2}`);
  return lines.join('\n');
}
