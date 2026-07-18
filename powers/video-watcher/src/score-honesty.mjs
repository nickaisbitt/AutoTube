/**
 * Honest scoring helpers for Video Watcher brutal reviews.
 * Scene/OCR floors may nudge dims by at most +1 over the model raw score.
 * Critical topIssues block fake upload-ready / stretch-to-8 floors.
 */

export const SCORE_DIMS = ['hook', 'visualVariety', 'captionReadability', 'pacing', 'youtubeReadiness'];

const CRITICAL_ISSUE_RE =
  /\b(beetle|dung|insect|puppet|muppet|cartoon|anime|off-?brand|scam[\s-]?bait|unrelated|wrong topic|off[\s-]?topic|low-budget|unprofessional|untrustworthy)\b/i;

/** Hook-fail scroll signals — not soft "would likely make me scroll past" boilerplate. */
const SCROLL_PAST_CRITICAL_RE =
  /\b(?:would|will)\s+scroll\s*past\b|\bscroll[- ]past:\s*yes\b|\b(?:viewers?|audience)\s+(?:would|will)\s+scroll\s*past\b|\bscrolls?\s+past\s+(?:in|within)\s+(?:[0-3](?:\.\d+)?\s*s(?:ec(?:onds?)?)?|0\s*[-–]\s*3)/i;

/** Soft retention hedges — not critical (hook vision already reports scroll-past yes/no). */
const SOFT_SCROLL_HEDGE_RE =
  /\bi\s+would\s+scroll\s*past\s+this\b|\b(?:would|will|might|may|could)\s+(?:likely|probably|quickly)\s+(?:make\s+(?:me|viewers?|someone)\s+)?scroll\s*past\b|\b(?:would|will|might|may|could)\s+make\s+(?:me|viewers?|someone)\s+scroll\s*past\b/gi;

/** On-screen overlay glitches that read as broken UI, not intentional copy. */
const OVERLAY_GLITCH_RE = /\bauto\s+skipped\b/i;

/**
 * @param {string[]} [topIssues]
 * @param {string} [verdict]
 */
export function hasCriticalQualityIssues(topIssues = [], verdict = '') {
  const blob = [...(topIssues || []), verdict || ''].join(' ');
  if (CRITICAL_ISSUE_RE.test(blob)) return true;
  if (OVERLAY_GLITCH_RE.test(blob)) return true;
  // Strip negations + soft hedges so "would likely make me scroll past within 3s"
  // is not treated as critical when hook vision already said scroll-past: no.
  const scrollBlob = blob
    .replace(/\b(?:would|will|do|does|did)\s+not\s+scroll\s*past\b/gi, ' ')
    .replace(SOFT_SCROLL_HEDGE_RE, ' ');
  return SCROLL_PAST_CRITICAL_RE.test(scrollBlob);
}

/**
 * @param {Record<string, number>} scores
 */
export function averageScore(scores = {}) {
  const vals = Object.values(scores).filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (!vals.length) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
}

/**
 * Raise a dim toward `target` but never more than raw+1.
 * @returns {boolean} whether the score changed
 */
export function applyCappedFloor(scores, feedback, key, target, note) {
  const raw = scores[key];
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return false;
  const capped = Math.min(target, raw + 1);
  if (raw >= capped) return false;
  scores[key] = capped;
  feedback[key] = `${feedback[key] || ''} [floor ${capped}: ${note}]`.trim();
  return true;
}

/**
 * Apply scene/hook-anchored floors with honesty caps.
 * Mutates brutal.report.scores / feedback and sets rawOverall / flooredOverall / overall / uploadReady.
 *
 * @param {object} brutal
 * @param {{
 *   sceneQa?: object,
 *   repetition?: object,
 *   hookVision?: object,
 *   objectiveGate?: object,
 * }} ctx
 */
export function applyHonestSceneFloors(brutal, ctx = {}) {
  if (!brutal?.report?.scores) return brutal;

  // Preserve model-raw overall if already set (pre-hook-floor); else snapshot now
  const rawScores = brutal.rawScores || { ...brutal.report.scores };
  if (!brutal.rawScores) brutal.rawScores = { ...rawScores };
  const rawOverall =
    typeof brutal.rawOverall === 'number' && Number.isFinite(brutal.rawOverall)
      ? brutal.rawOverall
      : averageScore(rawScores);
  brutal.rawOverall = rawOverall;

  const scores = brutal.report.scores;
  const feedback = { ...(brutal.report.feedback || {}) };
  brutal.report.feedback = feedback;

  const sceneQa = ctx.sceneQa;
  const repetition = ctx.repetition;
  const hookVision = ctx.hookVision;
  const objectiveGate = ctx.objectiveGate;
  const critical = hasCriticalQualityIssues(brutal.report.topIssues, brutal.report.verdict);

  if (sceneQa?.available && sceneQa?.pass === true) {
    const longest = sceneQa.longestSceneSec ?? 99;
    const sceneCount = sceneQa.sceneCount ?? 0;
    const lowRepeat =
      (repetition?.repeatPct ?? 0) < 10 && (repetition?.duplicateRunCount ?? 0) === 0;
    const hookTextOk =
      hookVision?.hookPass === true
      || (typeof hookVision?.onScreenText === 'string' && hookVision.onScreenText.trim().length >= 8);

    if (longest <= 2.0 && sceneCount >= 40) {
      applyCappedFloor(scores, feedback, 'pacing', 7, `${sceneCount} scenes, longest ${Number(longest).toFixed(1)}s`);
    } else if (longest <= 2.5 && sceneCount >= 25) {
      applyCappedFloor(scores, feedback, 'pacing', 6, `${sceneCount} scenes, longest ${Number(longest).toFixed(1)}s`);
    } else if (longest <= 2.5) {
      applyCappedFloor(scores, feedback, 'pacing', 5, `scene QA PASS, longest ${Number(longest).toFixed(1)}s`);
    }

    if (lowRepeat && longest <= 1.85 && sceneCount >= 55) {
      applyCappedFloor(scores, feedback, 'visualVariety', 8, `0 aHash dups, ${sceneCount} scenes ≤1.85s`);
    } else if (lowRepeat && longest <= 2.5 && sceneCount >= 40) {
      applyCappedFloor(scores, feedback, 'visualVariety', 7, `0 aHash dups, ${sceneCount} scenes`);
    } else if (lowRepeat && longest <= 2.5 && sceneCount >= 25) {
      applyCappedFloor(scores, feedback, 'visualVariety', 6, `0 aHash dups, ${sceneCount} scenes`);
    }

    if (hookTextOk && longest <= 1.85 && sceneCount >= 55) {
      applyCappedFloor(scores, feedback, 'captionReadability', 8, 'dense cuts + large yellow cards');
    } else if (hookTextOk) {
      applyCappedFloor(scores, feedback, 'captionReadability', 7, 'large yellow hook/impact cards');
    }

    if (longest <= 1.85 && sceneCount >= 55) {
      applyCappedFloor(scores, feedback, 'pacing', 8, `${sceneCount} scenes, longest ${Number(longest).toFixed(1)}s`);
    }

    const dimsOk =
      (scores.hook ?? 0) >= 7 &&
      (scores.visualVariety ?? 0) >= 6 &&
      (scores.captionReadability ?? 0) >= 6 &&
      (scores.pacing ?? 0) >= 6;
    const dimsStrong =
      (scores.hook ?? 0) >= 7 &&
      (scores.visualVariety ?? 0) >= 7 &&
      (scores.captionReadability ?? 0) >= 7 &&
      (scores.pacing ?? 0) >= 7;
    const hookOk =
      hookVision?.hookPass === true
      || (typeof hookVision?.onScreenText === 'string' && hookVision.onScreenText.trim().length >= 8);

    // Never mint youtubeReadiness 8 when critical issues remain
    if (
      !critical &&
      dimsStrong &&
      hookOk &&
      objectiveGate?.pass === true &&
      longest <= 1.85 &&
      sceneCount >= 55
    ) {
      applyCappedFloor(scores, feedback, 'youtubeReadiness', 8, 'strong dims + dense scenes');
    } else if (!critical && dimsOk && hookOk && objectiveGate?.pass === true) {
      applyCappedFloor(scores, feedback, 'youtubeReadiness', 7, 'hook+scene+objective PASS');
    }
  }

  const flooredOverall = averageScore(scores);
  brutal.flooredOverall = flooredOverall;
  // Display overall stays floored for continuity; gates use rawOverall
  brutal.overall = flooredOverall ?? rawOverall ?? 0;
  brutal.hasCriticalIssues = critical;
  const rawOk = typeof rawOverall === 'number' && rawOverall >= 7;
  brutal.uploadReady = rawOk && !critical;

  return brutal;
}

/**
 * Score used for --until-score / stretch gates (honesty-first).
 * Prefer raw; allow floored only if raw is within 0.5 of target.
 */
export function scoreForTargetGate(brutal, untilScore) {
  if (brutal?.success === false) return null;
  const raw = brutal?.rawOverall;
  const floored = brutal?.flooredOverall ?? brutal?.overall;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return typeof floored === 'number' && Number.isFinite(floored) ? floored : null;
  }
  if (brutal?.hasCriticalIssues) return raw;
  if (typeof untilScore === 'number' && Number.isFinite(untilScore) && raw >= untilScore - 0.5) {
    return typeof floored === 'number' ? Math.max(raw, floored) : raw;
  }
  return raw;
}
