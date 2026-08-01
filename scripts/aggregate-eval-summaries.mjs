#!/usr/bin/env node
/**
 * Aggregate EVAL_SUMMARY.json files from test-recordings/eval-* directories.
 *
 * Usage: node scripts/aggregate-eval-summaries.mjs [prefix] [options]
 *   prefix / --prefix=P    dir-name prefix under test-recordings (default: eval-)
 *   --dirs=a,b,c           aggregate exactly these dir names (fails if any is
 *                          missing or has no EVAL_SUMMARY.json)
 *   --commit=SHA           only dirs whose EVAL_META.json commit starts with SHA
 *   --all                  aggregate every matching dir (legacy behavior)
 *   --include-retries      include eval-retry-* dirs (excluded by default)
 *
 * Default (no --dirs/--commit/--all): LATEST WAVE ONLY — dirs sharing the
 * EVAL_META.json commit of the newest matching dir. Blindly mixing all
 * historical eval-* dirs blends results from different code versions and
 * misstates rates; use --all only when that is explicitly intended.
 *
 * HONESTY: keep-best polish runs, floored watcher scores, and known-topic
 * stretches are NOT cold proof — this script aggregates rawOverall from
 * first-pass cold dirs; retry dirs are salvage and excluded unless asked for.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

const flags = { prefix: 'eval-', dirs: null, commit: null, all: false, includeRetries: false };
for (const a of process.argv.slice(2)) {
  if (a.startsWith('--dirs=')) {
    flags.dirs = a.slice('--dirs='.length).split(',').map((s) => s.trim()).filter(Boolean);
  } else if (a.startsWith('--commit=')) flags.commit = a.slice('--commit='.length);
  else if (a.startsWith('--prefix=')) flags.prefix = a.slice('--prefix='.length);
  else if (a === '--all') flags.all = true;
  else if (a === '--include-retries') flags.includeRetries = true;
  else if (!a.startsWith('--')) flags.prefix = a;
  else {
    console.error(`Unknown option: ${a}`);
    process.exit(1);
  }
}

const recordingsRoot = join(ROOT, 'test-recordings');

function readMeta(dir) {
  try {
    return JSON.parse(readFileSync(join(dir, 'EVAL_META.json'), 'utf8'));
  } catch {
    return null;
  }
}

function dirTime(dir, meta) {
  const t = meta?.at ? Date.parse(meta.at) : NaN;
  if (Number.isFinite(t)) return t;
  try {
    return statSync(dir).mtimeMs;
  } catch {
    return 0;
  }
}

let dirs;
let filterMode;
if (flags.dirs) {
  filterMode = 'dirs';
  dirs = flags.dirs.map((d) => join(recordingsRoot, d));
  for (const dir of dirs) {
    if (!existsSync(join(dir, 'EVAL_SUMMARY.json'))) {
      console.error(`--dirs: ${dir} is missing EVAL_SUMMARY.json (incomplete or wrong name)`);
      process.exit(1);
    }
  }
} else {
  const candidates = readdirSync(recordingsRoot)
    .filter((d) => d.startsWith(flags.prefix))
    .filter((d) => flags.includeRetries || !d.startsWith('eval-retry-'))
    .map((d) => join(recordingsRoot, d))
    .filter((p) => {
      try {
        return statSync(p).isDirectory() && existsSync(join(p, 'EVAL_SUMMARY.json'));
      } catch {
        return false;
      }
    })
    .map((p) => ({ dir: p, meta: readMeta(p) }))
    .map((c) => ({ ...c, time: dirTime(c.dir, c.meta) }))
    .sort((a, b) => a.time - b.time);

  if (flags.commit) {
    filterMode = 'commit';
    dirs = candidates
      .filter((c) => (c.meta?.commit || '').startsWith(flags.commit))
      .map((c) => c.dir);
  } else if (flags.all) {
    filterMode = 'all';
    dirs = candidates.map((c) => c.dir);
  } else {
    filterMode = 'latest-wave';
    const newest = candidates[candidates.length - 1];
    if (!newest) {
      dirs = [];
    } else if (newest.meta?.commit) {
      dirs = candidates.filter((c) => c.meta?.commit === newest.meta.commit).map((c) => c.dir);
      console.error(
        `Aggregating latest wave only: commit ${newest.meta.commit.slice(0, 8)} (${dirs.length} dir(s)). Use --all for full history.`,
      );
    } else {
      dirs = [newest.dir];
      console.error(
        `Newest dir has no EVAL_META.json commit — aggregating that dir only. Use --all for full history.`,
      );
    }
  }
  dirs.sort();
}

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
  filter: {
    mode: filterMode,
    prefix: flags.prefix,
    commit: flags.commit,
    dirs: dirs.map((d) => d.split('/').pop()),
    includeRetries: flags.includeRetries,
  },
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
