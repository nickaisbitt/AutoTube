#!/usr/bin/env node
/**
 * Aggregate EVAL_SUMMARY.json files from test-recordings/eval-* directories.
 * Usage: node scripts/aggregate-eval-summaries.mjs [glob-prefix]
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const prefix = process.argv[2] || 'eval-';

const dirs = readdirSync(join(ROOT, 'test-recordings'))
  .filter((d) => d.startsWith(prefix))
  .map((d) => join(ROOT, 'test-recordings', d))
  .filter((p) => {
    try {
      return statSync(p).isDirectory();
    } catch {
      return false;
    }
  })
  .sort();

const rows = [];
for (const dir of dirs) {
  const summaryPath = join(dir, 'EVAL_SUMMARY.json');
  try {
    const s = JSON.parse(readFileSync(summaryPath, 'utf8'));
    rows.push({ dir, ...s });
  } catch {
    /* skip incomplete runs */
  }
}

if (!rows.length) {
  console.error('No EVAL_SUMMARY.json files found');
  process.exit(1);
}

const n = rows.reduce((sum, r) => sum + (r.n || 0), 0);
const genOk = rows.reduce((sum, r) => sum + (r.generateSuccessRate || 0) * (r.n || 0), 0);
const upload = rows.reduce((sum, r) => sum + (r.uploadReadyRate || 0) * (r.watched || 0), 0);
const critical = rows.reduce((sum, r) => sum + (r.criticalRate || 0) * (r.watched || 0), 0);
const watched = rows.reduce((sum, r) => sum + (r.watched || 0), 0);
const raws = rows.flatMap((r) => {
  const jsonl = join(r.dir, 'EVAL_REPORT.jsonl');
  try {
    return readFileSync(jsonl, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
      .filter((row) => row.watch && typeof row.watch.rawOverall === 'number')
      .map((row) => row.watch.rawOverall);
  } catch {
    return r.raw?.median != null ? [r.raw.median] : [];
  }
}).sort((a, b) => a - b);

function pctile(sorted, p) {
  if (!sorted.length) return null;
  const pos = p * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] * (1 - (pos - lo)) + sorted[hi] * (pos - lo);
}

const agg = {
  runs: rows.length,
  topics: n,
  watched,
  generateSuccessRate: n ? genOk / n : null,
  uploadReadyRate: watched ? upload / watched : null,
  criticalRate: watched ? critical / watched : null,
  raw: {
    median: pctile(raws, 0.5),
    p25: pctile(raws, 0.25),
    p75: pctile(raws, 0.75),
    min: raws[0] ?? null,
    max: raws[raws.length - 1] ?? null,
  },
  slices: rows.map((r) => ({
    dir: r.dir.split('/').pop(),
    set: r.set,
    n: r.n,
    generateSuccessRate: r.generateSuccessRate,
    uploadReadyRate: r.uploadReadyRate,
    criticalRate: r.criticalRate,
    rawMedian: r.raw?.median,
  })),
};

console.log(JSON.stringify(agg, null, 2));
