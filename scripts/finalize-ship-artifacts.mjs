#!/usr/bin/env node
/**
 * Pick the best -final.mp4, copy to canonical ship paths, write manifest.
 */
import { existsSync, readdirSync, statSync, copyFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';

const ROOT = process.cwd();
const RECORDINGS = join(ROOT, 'test-recordings');
const CANONICAL = join(RECORDINGS, 'FINAL-VIDEO-final.mp4');
const CANONICAL_ALIAS = join(RECORDINGS, 'FINAL-OUTPUT-final.mp4');

function probeDuration(filePath) {
  const r = spawnSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath],
    { encoding: 'utf8', timeout: 30_000 },
  );
  if (r.status !== 0 || !r.stdout) return null;
  const d = parseFloat(r.stdout.trim());
  return Number.isFinite(d) ? d : null;
}

function findCandidates() {
  if (!existsSync(RECORDINGS)) return [];
  const files = readdirSync(RECORDINGS)
    .filter((n) => n.endsWith('-final.mp4'))
    .map((n) => join(RECORDINGS, n))
    .filter((p) => existsSync(p));
  const fullDirs = readdirSync(RECORDINGS)
    .filter((n) => n.startsWith('full-'))
    .map((n) => join(RECORDINGS, n, 'final-video-final.mp4'))
    .filter((p) => existsSync(p));
  return [...files, ...fullDirs];
}

function score(path) {
  const size = statSync(path).size;
  const duration = probeDuration(path) ?? 0;
  const mtime = statSync(path).mtimeMs;
  // Prefer newest render with long duration — avoid overwriting fresh mux with stale copies
  return mtime * 1_000 + duration * 10_000 + size;
}

mkdirSync(RECORDINGS, { recursive: true });
const candidates = findCandidates();
if (candidates.length === 0) {
  console.error('❌ No -final.mp4 artifacts in test-recordings/');
  process.exit(1);
}

candidates.sort((a, b) => score(b) - score(a));
const best = candidates[0];
const durationSec = probeDuration(best);
const sizeBytes = statSync(best).size;

copyFileSync(best, CANONICAL);
copyFileSync(best, CANONICAL_ALIAS);

const manifest = {
  finalizedAt: new Date().toISOString(),
  canonicalMp4: CANONICAL,
  aliasMp4: CANONICAL_ALIAS,
  sourceMp4: best,
  durationSec,
  sizeBytes,
  sizeMb: Number((sizeBytes / 1024 / 1024).toFixed(2)),
  allCandidates: candidates.map((p) => ({
    path: p,
    durationSec: probeDuration(p),
    sizeBytes: statSync(p).size,
  })),
};

const manifestPath = join(RECORDINGS, 'SHIP_MANIFEST.json');
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log('\n✅ Ship artifacts finalized');
console.log(`   Source:   ${best}`);
console.log(`   Canonical: ${CANONICAL}`);
console.log(`   Duration: ${durationSec?.toFixed(1) ?? '?'}s`);
console.log(`   Size:     ${manifest.sizeMb} MB`);
console.log(`   Manifest: ${manifestPath}\n`);

const minDurationSec = (() => {
  const raw = process.env.MIN_DURATION_SEC;
  if (raw != null && raw !== '') {
    const n = parseFloat(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  if (process.env.REAL_PASS_FIXTURE === '1' || process.env.AUTOTUBE_LOOP_MODE === '1') return 30;
  return 180;
})();

if (durationSec != null && durationSec < minDurationSec) {
  console.error(
    `❌ Duration ${durationSec.toFixed(1)}s < ${minDurationSec}s — run npm run render:fixture:full or set MIN_DURATION_SEC for loop/fixture runs`,
  );
  process.exit(1);
}

process.exit(0);
