/**
 * Unit tests for assembly-system diversity metrics and gate.
 * Runs via vitest (included via e2e/**\/*.test.mjs in vitest.config.ts).
 */
import { describe, it, expect } from 'vitest';
import {
  computeTimelineDiversityMetrics,
  diversityProxyGate,
  MAX_URL_SHARE_PCT,
  URL_SPACING_SEC,
} from '../scripts/lib/assembly-system.mjs';
import { repairTimelineVisualRepeats } from '../scripts/lib/build-edit-timeline.mjs';

const SCRIPT = [{ id: 's1', duration: 60 }];

function makeMedia(entries) {
  return entries.map(([id, url]) => ({ id, url, type: 'image' }));
}

function makeTimeline(entries, segmentId = 's1') {
  let t = 0;
  return entries.map((id) => {
    const start = t;
    t += 1.25;
    return { segmentId, assetId: id, startSec: start, endSec: t };
  });
}

describe('computeTimelineDiversityMetrics', () => {
  it('returns zero metrics for empty timeline', () => {
    const m = computeTimelineDiversityMetrics([], []);
    expect(m.uniqueUrlsUsed).toBe(0);
    expect(m.maxUrlSharePct).toBe(0);
    expect(m.adjacentRepeatCount).toBe(0);
    expect(m.spacingViolations).toBe(0);
  });

  it('counts unique URLs used', () => {
    const media = makeMedia([['a', 'https://example.com/a.jpg'], ['b', 'https://example.com/b.jpg']]);
    const timeline = makeTimeline(['a', 'b', 'a', 'b']);
    const m = computeTimelineDiversityMetrics(timeline, media, SCRIPT);
    expect(m.uniqueUrlsUsed).toBe(2);
  });

  it('detects adjacent same-URL clips', () => {
    const media = makeMedia([['a', 'https://example.com/a.jpg'], ['b', 'https://example.com/b.jpg']]);
    const timeline = makeTimeline(['a', 'a', 'b']);
    const m = computeTimelineDiversityMetrics(timeline, media, SCRIPT);
    expect(m.adjacentRepeatCount).toBe(1);
  });

  it('detects no adjacent repeats for a well-alternated timeline', () => {
    const media = makeMedia([
      ['a', 'https://example.com/a.jpg'],
      ['b', 'https://example.com/b.jpg'],
      ['c', 'https://example.com/c.jpg'],
    ]);
    const timeline = makeTimeline(['a', 'b', 'c', 'a', 'b', 'c']);
    const m = computeTimelineDiversityMetrics(timeline, media, SCRIPT);
    expect(m.adjacentRepeatCount).toBe(0);
  });

  it('detects URL spacing violations', () => {
    // Two 'a' clips just 1.25 s apart → well within URL_SPACING_SEC (12 s)
    const media = makeMedia([['a', 'https://example.com/a.jpg'], ['b', 'https://example.com/b.jpg']]);
    const timeline = makeTimeline(['a', 'b', 'a']); // a at t=0, b at t=1.25, a at t=2.5
    const m = computeTimelineDiversityMetrics(timeline, media, SCRIPT);
    expect(m.spacingViolations).toBe(1);
  });

  it('does not flag spacing violation when URL repeats after URL_SPACING_SEC', () => {
    const media = makeMedia([
      ['a', 'https://example.com/a.jpg'],
      ['b', 'https://example.com/b.jpg'],
    ]);
    // Build a timeline where 'a' appears at t=0 and again at t >= URL_SPACING_SEC
    const clipDur = URL_SPACING_SEC / 2;
    const timeline = [
      { segmentId: 's1', assetId: 'a', startSec: 0, endSec: clipDur },
      { segmentId: 's1', assetId: 'b', startSec: clipDur, endSec: clipDur * 2 },
      { segmentId: 's1', assetId: 'a', startSec: URL_SPACING_SEC, endSec: URL_SPACING_SEC + clipDur },
    ];
    const m = computeTimelineDiversityMetrics(timeline, media, [{ id: 's1', duration: 30 }]);
    expect(m.spacingViolations).toBe(0);
  });

  it('computes maxUrlSharePct correctly', () => {
    const media = makeMedia([['a', 'https://example.com/a.jpg'], ['b', 'https://example.com/b.jpg']]);
    // a appears 3/4 times = 75%
    const timeline = makeTimeline(['a', 'b', 'a', 'a']);
    const m = computeTimelineDiversityMetrics(timeline, media, SCRIPT);
    expect(m.maxUrlSharePct).toBe(75);
  });

  it('computes requiredUniqueUrls based on total duration', () => {
    const media = makeMedia([['a', 'https://example.com/a.jpg']]);
    const dur = URL_SPACING_SEC * 3; // 36 s → ceil(36/12) = 3, max(3,3) = 3
    const timeline = [
      { segmentId: 's1', assetId: 'a', startSec: 0, endSec: dur },
    ];
    const m = computeTimelineDiversityMetrics(timeline, media, [{ id: 's1', duration: dur }]);
    expect(m.requiredUniqueUrls).toBe(Math.max(3, Math.ceil(dur / URL_SPACING_SEC)));
  });
});

describe('diversityProxyGate', () => {
  const goodMetrics = {
    maxUrlSharePct: 20,
    adjacentRepeatCount: 0,
    uniqueUrlsUsed: 10,
    requiredUniqueUrls: 5,
    spacingViolations: 0,
  };

  it('passes for metrics that meet all requirements', () => {
    const gate = diversityProxyGate(goodMetrics);
    expect(gate.pass).toBe(true);
  });

  it('returns { pass: false } for null input', () => {
    const gate = diversityProxyGate(null);
    expect(gate.pass).toBe(false);
  });

  it('fails when maxUrlSharePct exceeds cap', () => {
    const gate = diversityProxyGate({ ...goodMetrics, maxUrlSharePct: MAX_URL_SHARE_PCT + 1 });
    expect(gate.pass).toBe(false);
    expect(gate.reason).toMatch(/maxUrlSharePct/);
  });

  it('passes exactly at the share cap', () => {
    const gate = diversityProxyGate({ ...goodMetrics, maxUrlSharePct: MAX_URL_SHARE_PCT });
    expect(gate.pass).toBe(true);
  });

  it('fails when adjacent repeats are present', () => {
    const gate = diversityProxyGate({ ...goodMetrics, adjacentRepeatCount: 2 });
    expect(gate.pass).toBe(false);
    expect(gate.reason).toMatch(/adjacent/);
  });

  it('fails when too few unique URLs', () => {
    const gate = diversityProxyGate({ ...goodMetrics, uniqueUrlsUsed: 2, requiredUniqueUrls: 5 });
    expect(gate.pass).toBe(false);
    expect(gate.reason).toMatch(/unique URL/i);
  });

  it('fails when URL spacing violations are present', () => {
    const gate = diversityProxyGate({ ...goodMetrics, spacingViolations: 3 });
    expect(gate.pass).toBe(false);
    expect(gate.reason).toMatch(/spacing/i);
  });
});

describe('repairTimelineVisualRepeats', () => {
  it('returns a timeline of the same length without throwing', () => {
    const media = [
      { id: 'a1', url: 'https://example.com/a.jpg', type: 'image', segmentId: 's1' },
      { id: 'a2', url: 'https://example.com/b.jpg', type: 'image', segmentId: 's1' },
    ];
    const project = { script: [{ id: 's1', duration: 10 }], media };
    const timeline = [
      { segmentId: 's1', assetId: 'a1', startSec: 0, endSec: 1.5 },
      { segmentId: 's1', assetId: 'a1', startSec: 1.5, endSec: 3 },
    ];
    const repaired = repairTimelineVisualRepeats(timeline, project);
    expect(repaired).toHaveLength(2);
    expect(repaired.every((e) => e.assetId)).toBe(true);
  });
});
