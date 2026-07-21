/**
 * Pure helpers for the Source Media wait in generate-full-video.mjs.
 * Combines localStorage snapshots with live DOM progress (snapshot is empty mid-LLM).
 */

/**
 * @typedef {object} ProjectSnapshot
 * @property {number} scriptLen
 * @property {number} [mediaLen]
 * @property {string} scriptStep
 * @property {string} [mediaStep]
 * @property {string} [projectStatus]
 */

/**
 * @typedef {object} ScriptProgress
 * @property {boolean} generating
 * @property {string} rotating
 * @property {number|null} pct
 * @property {boolean} onTopicStep
 */

export function isScriptComplete(snap = {}) {
  return (
    snap.scriptStep === 'complete'
    || (Number(snap.scriptLen) > 0 && /complete/i.test(snap.projectStatus || ''))
  );
}

export function detectScriptActivity(snap = {}, prog = {}) {
  return Boolean(
    prog.generating
    || snap.scriptStep === 'processing'
    || Number(snap.scriptLen) > 0,
  );
}

export function sawFreshActivity(snap = {}, prog = {}, prev = {}) {
  if (Number(snap.scriptLen) > 0 && Number(snap.scriptLen) !== Number(prev.scriptLen)) return true;
  if (prog.pct != null && prog.pct !== prev.pct) return true;
  if (prog.rotating && prog.rotating !== prev.rotating) return true;
  return false;
}

/**
 * @param {{
 *   everSawGenerating?: boolean,
 *   active?: boolean,
 *   idleMs?: number,
 *   bodyText?: string,
 *   scriptLen?: number,
 * }} state
 */
export function isDeadScriptGeneration(state = {}) {
  if (!state.everSawGenerating) return false;
  if (state.active) return false;
  if (Number(state.scriptLen) > 0) return false;
  const body = String(state.bodyText || '');
  if (/Script generation cancelled/i.test(body)) return true;
  if (/No script generated yet/i.test(body) && (state.idleMs ?? 0) >= 90_000) return true;
  if ((state.idleMs ?? 0) >= 90_000) return true;
  return false;
}

/**
 * @param {{
 *   active: boolean,
 *   onTopicStep: boolean,
 *   recentlyGenerating?: boolean,
 *   everSawGenerating?: boolean,
 *   idleMs?: number,
 *   bodyText?: string,
 *   scriptLen?: number,
 * }} state
 * @returns {'grace'|'reclick'|'reload'}
 */
export function chooseRecoveryAction(state = {}) {
  if (state.active) return 'grace';
  if (isDeadScriptGeneration(state)) return 'reclick';
  if (state.recentlyGenerating && (state.idleMs ?? 0) < 90_000) return 'grace';
  if (state.everSawGenerating && (state.idleMs ?? 0) < 90_000) return 'grace';
  if (state.onTopicStep) return 'reclick';
  return 'reload';
}
