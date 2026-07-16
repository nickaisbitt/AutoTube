#!/usr/bin/env node
/** Aggregate wave-2 chain (2026-07-16 afternoon, commits 3d7d7de–d494882). */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const WAVE2_DIRS = [
  'eval-dev-2026-07-16T12-19-47-651Z',
  'eval-release-2026-07-16T12-35-01-109Z',
  'eval-release-2026-07-16T13-20-44-286Z',
  'eval-release-2026-07-16T14-28-14-216Z',
  'eval-release-2026-07-16T15-52-59-278Z',
];

const rows = [];
const raws = [];
let n = 0;
let gen = 0;
let watched = 0;
let upload = 0;
let critical = 0;
const topics = [];

for (const dirName of WAVE2_DIRS) {
  const dir = join(ROOT, 'test-recordings', dirName);
  const jsonl = join(dir, 'EVAL_REPORT.jsonl');
  if (!existsSync(jsonl)) continue;
  for (const line of readFileSync(jsonl, 'utf8').trim().split('\n')) {
    const r = JSON.parse(line);
    n += 1;
    if (r.generateOk) gen += 1;
    topics.push({
      id: r.topicId,
      generateOk: r.generateOk,
      pass: r.pass,
      raw: r.watch?.rawOverall ?? r.watch?.brutal?.rawOverall ?? null,
      upload: r.watch?.uploadReady ?? null,
      critical: r.watch?.hasCriticalIssues ?? r.watch?.brutal?.hasCriticalIssues ?? null,
    });
    if (r.watch) {
      watched += 1;
      if (r.watch.uploadReady) upload += 1;
      if (r.watch.hasCriticalIssues || r.watch.brutal?.hasCriticalIssues) critical += 1;
      const raw = r.watch.rawOverall ?? r.watch.brutal?.rawOverall;
      if (typeof raw === 'number') raws.push(raw);
    }
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
  commit: 'd494882',
  wave: 'wave2-chain-2026-07-16',
  topics: n,
  generateSuccessRate: n ? gen / n : null,
  watched,
  uploadReadyRate: watched ? upload / watched : null,
  criticalRate: watched ? critical / watched : null,
  raw: { median: pctile(0.5), p25: pctile(0.25), p75: pctile(0.75), min: raws[0], max: raws[raws.length - 1] },
  bars: {
    generate95: (n ? gen / n : 0) >= 0.95,
    critical25: watched ? critical / watched <= 0.25 : null,
    upload50: watched ? upload / watched >= 0.5 : null,
    raw72: pctile(0.5) >= 7.2,
  },
  topicRows: topics,
};

console.log(JSON.stringify(agg, null, 2));
