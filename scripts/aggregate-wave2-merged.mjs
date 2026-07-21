#!/usr/bin/env node
/** Merge wave-2 chain + retry pass into one aggregate. */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const WAVE2_DIRS = [
  'eval-dev-2026-07-16T12-19-47-651Z',
  'eval-release-2026-07-16T12-35-01-109Z',
  'eval-release-2026-07-16T13-20-44-286Z',
  'eval-release-2026-07-16T14-28-14-216Z',
  'eval-release-2026-07-16T15-52-59-278Z',
];
const RETRY_DIR = 'eval-retry-2026-07-16T17-10-02-195Z';

function watchSummary(r) {
  const w = r.watch?.brutal || r.watch;
  if (!w) return null;
  return {
    rawOverall: w.rawOverall ?? w.flooredOverall ?? null,
    uploadReady: w.uploadReady === true,
    hasCriticalIssues: w.hasCriticalIssues === true,
  };
}

const byId = new Map();
for (const dirName of WAVE2_DIRS) {
  const jsonl = join(ROOT, 'test-recordings', dirName, 'EVAL_REPORT.jsonl');
  if (!existsSync(jsonl)) continue;
  for (const line of readFileSync(jsonl, 'utf8').trim().split('\n')) {
    const r = JSON.parse(line);
    byId.set(r.topicId, { ...r, watch: watchSummary(r) || r.watch, source: 'wave2' });
  }
}
const retryJsonl = join(ROOT, 'test-recordings', RETRY_DIR, 'EVAL_REPORT.jsonl');
if (existsSync(retryJsonl)) {
  for (const line of readFileSync(retryJsonl, 'utf8').trim().split('\n')) {
    const r = JSON.parse(line);
    if (r.generateOk) {
      byId.set(r.topicId, { ...r, watch: watchSummary(r) || r.watch, source: 'retry' });
    }
  }
}

const rows = [...byId.values()].sort((a, b) => a.topicId.localeCompare(b.topicId));
const raws = [];
let gen = 0;
let watched = 0;
let upload = 0;
let critical = 0;
for (const r of rows) {
  if (r.generateOk) gen += 1;
  if (r.watch && typeof r.watch.rawOverall === 'number') {
    watched += 1;
    raws.push(r.watch.rawOverall);
    if (r.watch.uploadReady) upload += 1;
    if (r.watch.hasCriticalIssues) critical += 1;
  }
}
raws.sort((a, b) => a - b);
const pctile = (p) => {
  if (!raws.length) return null;
  const pos = p * (raws.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? raws[lo] : raws[lo] * (1 - (pos - lo)) + raws[hi] * (pos - lo);
};

const agg = {
  wave: 'wave2-merged',
  topics: rows.length,
  generateSuccessRate: rows.length ? gen / rows.length : null,
  watched,
  uploadReadyRate: watched ? upload / watched : null,
  criticalRate: watched ? critical / watched : null,
  raw: { median: pctile(0.5), p25: pctile(0.25), p75: pctile(0.75), min: raws[0], max: raws[raws.length - 1] },
  stillFail: rows.filter((r) => !r.generateOk).map((r) => r.topicId),
  uploadPass: rows.filter((r) => r.watch?.uploadReady).map((r) => r.topicId),
  criticalPass: rows.filter((r) => r.watch?.hasCriticalIssues).map((r) => r.topicId),
};
console.log(JSON.stringify(agg, null, 2));
