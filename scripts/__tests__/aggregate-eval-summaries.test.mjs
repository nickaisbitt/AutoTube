import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../aggregate-eval-summaries.mjs',
);

const COMMIT_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const COMMIT_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

let root;

function writeEvalDir(name, { commit, at, raws, summaryOverrides = {} }) {
  const dir = join(root, 'test-recordings', name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'EVAL_META.json'), JSON.stringify({ at, commit }));
  writeFileSync(
    join(dir, 'EVAL_SUMMARY.json'),
    JSON.stringify({
      set: 'release',
      n: raws.length,
      generateSuccessRate: 1,
      watched: raws.length,
      uploadReadyRate: 1,
      criticalRate: 0,
      raw: { median: raws[0] ?? null },
      ...summaryOverrides,
    }),
  );
  writeFileSync(
    join(dir, 'EVAL_REPORT.jsonl'),
    raws
      .map((raw, i) =>
        JSON.stringify({
          topicId: `${name}-t${i}`,
          generateOk: true,
          watch: { rawOverall: raw, uploadReady: true, hasCriticalIssues: false },
        }),
      )
      .join('\n') + '\n',
  );
  return dir;
}

function runAggregate(args) {
  const r = spawnSync('node', [SCRIPT, ...args], { cwd: root, encoding: 'utf8' });
  let json = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    /* leave null for error cases */
  }
  return { status: r.status, json, stderr: r.stderr };
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'agg-eval-'));
  writeEvalDir('eval-release-2026-01-01T00-00-00-000Z', {
    commit: COMMIT_A,
    at: '2026-01-01T00:00:00.000Z',
    raws: [6.0, 6.2],
  });
  writeEvalDir('eval-release-2026-02-01T00-00-00-000Z', {
    commit: COMMIT_B,
    at: '2026-02-01T00:00:00.000Z',
    raws: [7.4],
  });
  writeEvalDir('eval-release-2026-02-01T06-00-00-000Z', {
    commit: COMMIT_B,
    at: '2026-02-01T06:00:00.000Z',
    raws: [7.6],
  });
  writeEvalDir('eval-retry-2026-02-02T00-00-00-000Z', {
    commit: COMMIT_B,
    at: '2026-02-02T00:00:00.000Z',
    raws: [9.9],
    summaryOverrides: { set: 'retry' },
  });
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('aggregate-eval-summaries filtering', () => {
  it('defaults to the latest wave (newest commit) and excludes retry dirs', () => {
    const { status, json, stderr } = runAggregate([]);
    expect(status).toBe(0);
    expect(json.filter.mode).toBe('latest-wave');
    expect(json.filter.dirs).toEqual([
      'eval-release-2026-02-01T00-00-00-000Z',
      'eval-release-2026-02-01T06-00-00-000Z',
    ]);
    expect(json.topics).toBe(2);
    expect(json.raw.median).toBe(7.5);
    expect(stderr).toMatch(/latest wave/i);
  });

  it('mixes all history only with --all (still excluding retries)', () => {
    const { status, json } = runAggregate(['--all']);
    expect(status).toBe(0);
    expect(json.filter.mode).toBe('all');
    expect(json.filter.dirs).toHaveLength(3);
    expect(json.topics).toBe(4);
  });

  it('filters by commit prefix', () => {
    const { status, json } = runAggregate([`--commit=${COMMIT_A.slice(0, 8)}`]);
    expect(status).toBe(0);
    expect(json.filter.mode).toBe('commit');
    expect(json.filter.dirs).toEqual(['eval-release-2026-01-01T00-00-00-000Z']);
    expect(json.raw.median).toBe(6.1);
  });

  it('includes retry dirs only when explicitly asked', () => {
    const { json } = runAggregate(['--all', '--include-retries']);
    expect(json.filter.dirs).toContain('eval-retry-2026-02-02T00-00-00-000Z');
    expect(json.topics).toBe(5);
  });

  it('aggregates exactly the dirs passed via --dirs', () => {
    const { status, json } = runAggregate(['--dirs=eval-release-2026-01-01T00-00-00-000Z']);
    expect(status).toBe(0);
    expect(json.filter.mode).toBe('dirs');
    expect(json.topics).toBe(2);
  });

  it('fails closed when a --dirs entry is missing its summary', () => {
    const { status } = runAggregate(['--dirs=eval-release-does-not-exist']);
    expect(status).toBe(1);
  });

  it('rejects unknown options instead of silently ignoring them', () => {
    const { status } = runAggregate(['--bogus']);
    expect(status).toBe(1);
  });
});
