/**
 * Cold-evaluation / generator-quality flags.
 * When AUTOTUBE_EVAL_COLD=1, benchmark packs and keep-best must not influence results.
 */

export function isEvalColdMode() {
  return process.env.AUTOTUBE_EVAL_COLD === '1' || process.env.AUTOTUBE_EVAL_COLD === 'true';
}

/** Curated URL packs (e.g. STOCK_HOUSING_VIDEOS) — off in cold eval, on by default otherwise. */
export function curatedPacksEnabled() {
  if (isEvalColdMode()) return false;
  if (process.env.AUTOTUBE_CURATED_PACKS === '0' || process.env.AUTOTUBE_CURATED_PACKS === 'false') {
    return false;
  }
  return true;
}

/** Topic-family query/beat templates — emergency fallback only when cold. */
export function topicFamilyTemplatesEnabled() {
  if (isEvalColdMode()) return false;
  if (process.env.AUTOTUBE_TOPIC_FAMILY_TEMPLATES === '0'
    || process.env.AUTOTUBE_TOPIC_FAMILY_TEMPLATES === 'false') {
    return false;
  }
  return true;
}

/** Keep-best polish — never counts as first-pass evidence. */
export function keepBestEnabled() {
  if (isEvalColdMode()) return false;
  if (process.env.AUTOTUBE_KEEP_BEST === '0' || process.env.AUTOTUBE_KEEP_BEST === 'false') {
    return false;
  }
  return true;
}
