/**
 * Mux A/V timeline policy — freeze-pad short video to keep narration,
 * fail closed on large overshoots unless audio trim is explicitly allowed.
 *
 * Healthcare/housing espeak runs often land ~2.5–5s short after segment encode;
 * freeze-pad ≤ MAX_FREEZE_PAD_SEC is the default-safe path (no AUTOTUBE_ALLOW_AUDIO_TRIM).
 */

/** Max seconds of last-frame freeze-pad before treating the gap as a timeline bug. */
export const MAX_FREEZE_PAD_SEC = 12;

/** Default max audio trim without AUTOTUBE_ALLOW_AUDIO_TRIM=1 (after pad failed / overshoot too large). */
export const DEFAULT_MAX_AUDIO_TRIM_SEC = 2;

/** Ignore sub-frame probe noise between audio and video durations. */
export const AV_OVERSHOOT_EPSILON_SEC = 0.15;

/**
 * Decide how to reconcile audio longer than merged video at mux time.
 *
 * @param {number} overshootSec audioSec - videoSec
 * @param {{
 *   allowAudioTrim?: boolean,
 *   maxTrimSec?: number,
 *   maxFreezePadSec?: number,
 * }} [opts]
 * @returns {{
 *   action: 'none' | 'freeze-pad' | 'trim-audio' | 'fail',
 *   padSec?: number,
 *   trimSec?: number,
 *   maxTrimSec?: number,
 *   maxFreezePadSec?: number,
 * }}
 */
export function resolveMuxAvGap(overshootSec, opts = {}) {
  const gap = Number(overshootSec);
  if (!Number.isFinite(gap) || gap <= AV_OVERSHOOT_EPSILON_SEC) {
    return { action: 'none' };
  }

  const maxFreezePadSec = Math.max(
    0,
    Number(opts.maxFreezePadSec ?? MAX_FREEZE_PAD_SEC),
  );
  if (gap <= maxFreezePadSec) {
    return { action: 'freeze-pad', padSec: gap, maxFreezePadSec };
  }

  const maxTrimSec = Math.max(
    0,
    Number(opts.maxTrimSec ?? DEFAULT_MAX_AUDIO_TRIM_SEC),
  );
  const allowAudioTrim = opts.allowAudioTrim === true;
  if (allowAudioTrim || gap <= maxTrimSec) {
    return { action: 'trim-audio', trimSec: gap, maxTrimSec, maxFreezePadSec };
  }

  return { action: 'fail', trimSec: gap, maxTrimSec, maxFreezePadSec };
}
