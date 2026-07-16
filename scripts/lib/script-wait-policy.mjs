/**
 * Pure decision helpers for the "wait for Source Media" phase of the full-video
 * pipeline (scripts/lib/generate-full-video.mjs).
 *
 * Why this exists: the generator's project (and its stepStatuses) is only
 * persisted to localStorage AFTER the whole script pipeline completes. While the
 * live OpenRouter script generation is still running, a localStorage snapshot
 * reads empty (scriptLen=0, scriptStep=''), which is indistinguishable from
 * "nothing ever started". A slow-but-healthy cold generation therefore used to
 * trip a false SCRIPT_TIMEOUT, and the reload-based recovery aborted the
 * in-flight work. These helpers fold in the live DOM signals that the Script
 * step exposes while generating so callers can distinguish "actively
 * generating" from "genuinely stuck", and pick a non-destructive recovery.
 *
 * Kept pure (no Playwright) so the logic is unit-testable.
 */

/**
 * @typedef {object} ProjectSnapshot
 * @property {number} scriptLen
 * @property {number} [mediaLen]
 * @property {string} scriptStep      localStorage stepStatuses.script ('' when no project)
 * @property {string} [mediaStep]
 * @property {string} [projectStatus]
 */

/**
 * @typedef {object} ScriptProgress
 * @property {boolean} generating     "Generating Script" UI / rotating-status present
 * @property {string} rotating        rotating status text (cosmetic, cycles ~3s)
 * @property {number|null} pct        progress percentage parsed from the DOM
 * @property {boolean} onTopicStep    generate-script-only button still present
 */

/** The script (and Source Media button) is ready/complete. */
export function isScriptComplete(snap = {}) {
  return (
    snap.scriptStep === 'complete'
    || (Number(snap.scriptLen) > 0 && /complete/i.test(snap.projectStatus || ''))
  );
}

/**
 * True when script generation is genuinely making progress (so a reload would
 * throw away healthy in-flight work). Combines the persisted snapshot with live
 * DOM signals because the snapshot is blind mid-generation.
 */
export function detectScriptActivity(snap = {}, prog = {}) {
  return Boolean(
    prog.generating
    || snap.scriptStep === 'processing'
    || Number(snap.scriptLen) > 0,
  );
}

/**
 * Returns true when the current poll shows fresh activity vs the previous poll.
 * Used to keep a "last activity" timestamp so we only extend the deadline while
 * work is actually advancing (not merely while the cosmetic status text cycles
 * with a hung network call — though a cycling status still counts as the page
 * being alive, progress % / script length are the stronger signals).
 */
export function sawFreshActivity(snap = {}, prog = {}, prev = {}) {
  if (Number(snap.scriptLen) > 0 && Number(snap.scriptLen) !== Number(prev.scriptLen)) return true;
  if (prog.pct != null && prog.pct !== prev.pct) return true;
  if (prog.rotating && prog.rotating !== prev.rotating) return true;
  return false;
}

/**
 * Chooses a recovery action when the soft deadline elapses without the Source
 * Media button appearing.
 *
 * - 'grace'   : still actively generating — grant more time, do NOT reload
 *               (reloading aborts the live OpenRouter call).
 * - 'reclick' : still on the topic step — the generate click never registered;
 *               re-fill + re-click instead of a full reload.
 * - 'reload'  : genuinely stuck (blank/errored, not generating, not on topic
 *               step) — reload once and retry from scratch.
 *
 * @param {{active: boolean, onTopicStep: boolean, recentlyGenerating?: boolean, everSawGenerating?: boolean}} state
 * @returns {'grace'|'reclick'|'reload'}
 */
export function chooseRecoveryAction(state = {}) {
  if (state.active) return 'grace';
  if (state.everSawGenerating) return 'grace';
  // Reload aborts the live OpenRouter call — prefer grace if generation was live recently.
  if (state.recentlyGenerating) return 'grace';
  if (state.onTopicStep) return 'reclick';
  return 'reload';
}
