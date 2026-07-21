/**
 * Cold-evaluation / generator-quality flags.
 * When AUTOTUBE_EVAL_COLD=1, benchmark packs and keep-best must not influence results.
 *
 * Production defaults (generator honesty):
 * - curated packs OFF unless AUTOTUBE_CURATED_PACKS=1
 * - topic-family templates OFF unless AUTOTUBE_TOPIC_FAMILY_TEMPLATES=1
 * - keep-best ON unless cold or AUTOTUBE_KEEP_BEST=0 (polish path, never first-pass proof)
 */

export function isEvalColdMode() {
  return process.env.AUTOTUBE_EVAL_COLD === '1' || process.env.AUTOTUBE_EVAL_COLD === 'true';
}

/** Curated URL packs — opt-in only. */
export function curatedPacksEnabled() {
  if (isEvalColdMode()) return false;
  return process.env.AUTOTUBE_CURATED_PACKS === '1' || process.env.AUTOTUBE_CURATED_PACKS === 'true';
}

/** Topic-family query/beat templates — opt-in only. */
export function topicFamilyTemplatesEnabled() {
  if (isEvalColdMode()) return false;
  return process.env.AUTOTUBE_TOPIC_FAMILY_TEMPLATES === '1'
    || process.env.AUTOTUBE_TOPIC_FAMILY_TEMPLATES === 'true';
}

/** Keep-best polish — never counts as first-pass evidence. */
export function keepBestEnabled() {
  if (isEvalColdMode()) return false;
  if (process.env.AUTOTUBE_KEEP_BEST === '0' || process.env.AUTOTUBE_KEEP_BEST === 'false') {
    return false;
  }
  return true;
}
