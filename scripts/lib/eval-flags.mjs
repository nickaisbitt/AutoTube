/**
 * Cold-evaluation / generator-quality flags + shared cold-eval helpers.
 * When AUTOTUBE_EVAL_COLD=1, benchmark packs and keep-best must not influence results.
 *
 * Production defaults (generator honesty):
 * - curated packs OFF unless AUTOTUBE_CURATED_PACKS=1
 * - topic-family templates OFF unless AUTOTUBE_TOPIC_FAMILY_TEMPLATES=1
 * - keep-best ON unless cold or AUTOTUBE_KEEP_BEST=0 (polish path, never first-pass proof)
 *
 * HONESTY — what does NOT count as cold proof:
 * - keep-best / frozen-media polish runs (second-pass by definition)
 * - floored/clamped watcher scores (release bars use rawOverall only)
 * - stretches of known/benchmark/previously-seen topics (must be validated unseen sets)
 * Only first-pass, blind-watched runs on unseen topic sets qualify as cold evidence.
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

/**
 * Flatten a watchVideo() result into the canonical EVAL_REPORT.jsonl `watch`
 * shape. All eval scripts (first-pass and retry) must store this shape so
 * aggregate scripts can read `watch.rawOverall` / `watch.uploadReady` /
 * `watch.hasCriticalIssues` without knowing watcher internals.
 * `rawOverall` is unfloored; `flooredOverall` is stored for reference only and
 * must never feed release bars.
 */
export function summarizeWatch(watch) {
  if (!watch) return null;
  return {
    uploadReady: watch.uploadReady === true,
    rawOverall: watch.brutal?.rawOverall ?? null,
    flooredOverall: watch.brutal?.flooredOverall ?? watch.brutal?.overall ?? null,
    hasCriticalIssues: watch.brutal?.hasCriticalIssues === true,
    scores: watch.brutal?.report?.scores || null,
    topIssues: (watch.brutal?.report?.topIssues || []).slice(0, 5),
    hookScriptPass: watch.hookScript?.pass ?? null,
    hookVisionPass: watch.hookVision?.hookPass ?? null,
    objectivePass: watch.objectiveGate?.pass === true,
    objectiveScore: watch.objectiveQa?.score ?? null,
    scenePass: watch.sceneQa?.pass === true,
    longestSceneSec: watch.sceneQa?.longestSceneSec ?? null,
  };
}

/**
 * Release bars from calibration (see eval/COLD-EVAL-WAVE4.md).
 * Env-overridable so a wave can tighten (or explicitly document loosening) bars.
 */
export function evalReleaseBars(env = process.env) {
  const num = (name, dflt) => {
    const v = parseFloat(env[name] ?? '');
    return Number.isFinite(v) ? v : dflt;
  };
  return {
    minGenerateSuccessRate: num('AUTOTUBE_EVAL_MIN_GENERATE_RATE', 0.95),
    minUploadReadyRate: num('AUTOTUBE_EVAL_MIN_UPLOAD_READY_RATE', 0.5),
    maxCriticalRate: num('AUTOTUBE_EVAL_MAX_CRITICAL_RATE', 0.25),
    minRawMedian: num('AUTOTUBE_EVAL_MIN_RAW_MEDIAN', 7.2),
  };
}

/**
 * Compare an aggregate (from aggregate-eval-summaries) against release bars.
 * Fails CLOSED: a missing/null metric is a failure — "no evidence" never passes.
 * Returns { ok, failures: string[] }.
 */
export function checkReleaseBars(agg, bars = evalReleaseBars()) {
  const failures = [];
  const fmt = (v) => (typeof v === 'number' ? v.toFixed(3) : String(v));
  const gen = agg?.generateSuccessRate;
  if (typeof gen !== 'number' || gen < bars.minGenerateSuccessRate) {
    failures.push(`generateSuccessRate ${fmt(gen)} < ${bars.minGenerateSuccessRate}`);
  }
  const upload = agg?.uploadReadyRate;
  if (typeof upload !== 'number' || upload < bars.minUploadReadyRate) {
    failures.push(`uploadReadyRate ${fmt(upload)} < ${bars.minUploadReadyRate}`);
  }
  const critical = agg?.criticalRate;
  if (typeof critical !== 'number' || critical > bars.maxCriticalRate) {
    failures.push(`criticalRate ${fmt(critical)} > ${bars.maxCriticalRate}`);
  }
  const median = agg?.raw?.median;
  if (typeof median !== 'number' || median < bars.minRawMedian) {
    failures.push(`raw.median ${fmt(median)} < ${bars.minRawMedian}`);
  }
  return { ok: failures.length === 0, failures };
}

/** Linear-interpolated percentile over an ascending-sorted array. */
export function percentile(sorted, p) {
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0];
  const pos = p * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  const w = pos - lo;
  return sorted[lo] * (1 - w) + sorted[hi] * w;
}

/**
 * Build an EVAL_SUMMARY.json object from EVAL_REPORT.jsonl-shaped rows
 * (rows carry `generateOk` and a summarizeWatch-shaped `watch`).
 */
export function buildEvalSummary(rows, { set, outDir, note }) {
  const ok = rows.filter((r) => r.generateOk);
  const watched = rows.filter((r) => r.watch && typeof r.watch.rawOverall === 'number');
  const raws = watched.map((r) => r.watch.rawOverall).sort((a, b) => a - b);
  const uploadReady = watched.filter((r) => r.watch.uploadReady).length;
  const critical = watched.filter((r) => r.watch.hasCriticalIssues).length;
  return {
    set,
    outDir,
    n: rows.length,
    generateSuccessRate: rows.length ? ok.length / rows.length : 0,
    watched: watched.length,
    uploadReadyRate: watched.length ? uploadReady / watched.length : null,
    criticalRate: watched.length ? critical / watched.length : null,
    raw: {
      median: percentile(raws, 0.5),
      p25: percentile(raws, 0.25),
      p75: percentile(raws, 0.75),
      mean: raws.length ? raws.reduce((a, b) => a + b, 0) / raws.length : null,
      min: raws[0] ?? null,
      max: raws[raws.length - 1] ?? null,
    },
    note,
  };
}
