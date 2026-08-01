import { describe, expect, it } from 'vitest';
import {
  summarizeWatch,
  evalReleaseBars,
  checkReleaseBars,
  percentile,
  buildEvalSummary,
} from '../eval-flags.mjs';

describe('summarizeWatch', () => {
  it('flattens a watchVideo result into the aggregate-readable shape', () => {
    const watch = {
      uploadReady: true,
      brutal: {
        rawOverall: 7.4,
        flooredOverall: 8.0,
        hasCriticalIssues: false,
        report: { scores: { hook: 8 }, topIssues: ['a', 'b', 'c', 'd', 'e', 'f'] },
      },
      hookScript: { pass: true },
      hookVision: { hookPass: false },
      objectiveGate: { pass: true },
      objectiveQa: { score: 0.9 },
      sceneQa: { pass: true, longestSceneSec: 2.5 },
    };
    expect(summarizeWatch(watch)).toEqual({
      uploadReady: true,
      rawOverall: 7.4,
      flooredOverall: 8.0,
      hasCriticalIssues: false,
      scores: { hook: 8 },
      topIssues: ['a', 'b', 'c', 'd', 'e'],
      hookScriptPass: true,
      hookVisionPass: false,
      objectivePass: true,
      objectiveScore: 0.9,
      scenePass: true,
      longestSceneSec: 2.5,
    });
  });

  it('keeps rawOverall null when the watcher only produced floored scores', () => {
    const s = summarizeWatch({ uploadReady: false, brutal: { overall: 7.0 } });
    expect(s.rawOverall).toBeNull();
    expect(s.flooredOverall).toBe(7.0);
  });

  it('returns null for a missing watch result', () => {
    expect(summarizeWatch(null)).toBeNull();
  });
});

describe('evalReleaseBars', () => {
  it('defaults to the calibrated wave-4 bars', () => {
    expect(evalReleaseBars({})).toEqual({
      minGenerateSuccessRate: 0.95,
      minUploadReadyRate: 0.5,
      maxCriticalRate: 0.25,
      minRawMedian: 7.2,
    });
  });

  it('accepts env overrides', () => {
    const bars = evalReleaseBars({
      AUTOTUBE_EVAL_MIN_GENERATE_RATE: '0.9',
      AUTOTUBE_EVAL_MIN_UPLOAD_READY_RATE: '0.6',
      AUTOTUBE_EVAL_MAX_CRITICAL_RATE: '0.1',
      AUTOTUBE_EVAL_MIN_RAW_MEDIAN: '7.5',
    });
    expect(bars).toEqual({
      minGenerateSuccessRate: 0.9,
      minUploadReadyRate: 0.6,
      maxCriticalRate: 0.1,
      minRawMedian: 7.5,
    });
  });

  it('ignores non-numeric overrides', () => {
    expect(evalReleaseBars({ AUTOTUBE_EVAL_MIN_RAW_MEDIAN: 'nope' }).minRawMedian).toBe(7.2);
  });
});

describe('checkReleaseBars', () => {
  const bars = evalReleaseBars({});
  const passing = {
    generateSuccessRate: 1,
    uploadReadyRate: 0.6,
    criticalRate: 0.2,
    raw: { median: 7.5 },
  };

  it('passes an aggregate that clears every bar', () => {
    expect(checkReleaseBars(passing, bars)).toEqual({ ok: true, failures: [] });
  });

  it('fails when upload-ready or generate rates miss the bar', () => {
    const r = checkReleaseBars(
      { ...passing, uploadReadyRate: 0.4, generateSuccessRate: 0.9 },
      bars,
    );
    expect(r.ok).toBe(false);
    expect(r.failures.join('\n')).toMatch(/uploadReadyRate/);
    expect(r.failures.join('\n')).toMatch(/generateSuccessRate/);
  });

  it('fails on high critical rate and low raw median', () => {
    const r = checkReleaseBars(
      { ...passing, criticalRate: 0.3, raw: { median: 7.0 } },
      bars,
    );
    expect(r.ok).toBe(false);
    expect(r.failures.join('\n')).toMatch(/criticalRate/);
    expect(r.failures.join('\n')).toMatch(/raw\.median/);
  });

  it('fails closed when metrics are missing (no evidence never passes)', () => {
    const r = checkReleaseBars({}, bars);
    expect(r.ok).toBe(false);
    expect(r.failures).toHaveLength(4);
    expect(checkReleaseBars(null, bars).ok).toBe(false);
  });
});

describe('buildEvalSummary', () => {
  it('summarizes rows using rawOverall only', () => {
    const rows = [
      { generateOk: true, watch: { rawOverall: 7.0, uploadReady: true, hasCriticalIssues: false } },
      { generateOk: true, watch: { rawOverall: 8.0, uploadReady: false, hasCriticalIssues: true } },
      { generateOk: false, watch: null },
      // floored-only rows must not count as watched evidence
      { generateOk: true, watch: { rawOverall: null, flooredOverall: 9.0, uploadReady: true } },
    ];
    const s = buildEvalSummary(rows, { set: 'dev', outDir: '/tmp/x', note: 'n' });
    expect(s.n).toBe(4);
    expect(s.generateSuccessRate).toBe(0.75);
    expect(s.watched).toBe(2);
    expect(s.uploadReadyRate).toBe(0.5);
    expect(s.criticalRate).toBe(0.5);
    expect(s.raw.median).toBe(7.5);
    expect(s.raw.min).toBe(7.0);
    expect(s.raw.max).toBe(8.0);
  });

  it('reports null rates when nothing was watched', () => {
    const s = buildEvalSummary([{ generateOk: false, watch: null }], { set: 'dev', outDir: 'd' });
    expect(s.uploadReadyRate).toBeNull();
    expect(s.criticalRate).toBeNull();
    expect(s.raw.median).toBeNull();
  });
});

describe('percentile', () => {
  it('interpolates linearly', () => {
    expect(percentile([], 0.5)).toBeNull();
    expect(percentile([5], 0.5)).toBe(5);
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(percentile([1, 2, 3], 0.25)).toBe(1.5);
  });
});
