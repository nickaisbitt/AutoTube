import { describe, it, expect } from 'vitest';
import {
  planSegmentShots,
  alternateFraming,
  planTextCards,
  planPatternInterrupts,
  shouldInsertContrastingTransition,
  synchronizeTextCards,
} from '../renderer/editingRhythm';
import type { ScriptSegment, MediaAsset, NarrativeBeat } from '../../types';
import type { TextCardEntry } from '../renderer/editingRhythm';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSegment(overrides: Partial<ScriptSegment> = {}): ScriptSegment {
  return {
    id: 'seg-1',
    type: 'section',
    title: 'Test Segment',
    narration: 'This is a test narration with some words to fill the space.',
    visualNote: 'Show chart',
    duration: 6,
    ...overrides,
  };
}

function makeAsset(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: 'asset-1',
    segmentId: 'seg-1',
    type: 'image',
    url: 'https://example.com/img.jpg',
    alt: 'Test image',
    source: 'test',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// planSegmentShots
// ---------------------------------------------------------------------------

describe('planSegmentShots', () => {
  it('returns empty array for zero-duration segment', () => {
    const segment = makeSegment({ duration: 0 });
    const result = planSegmentShots(segment, [makeAsset()]);
    expect(result).toEqual([]);
  });

  it('returns empty array when no assets provided', () => {
    const segment = makeSegment({ duration: 5 });
    const result = planSegmentShots(segment, []);
    expect(result).toEqual([]);
  });

  it('enforces max 4s hold time per static image', () => {
    const segment = makeSegment({ duration: 12, narration: 'Short.' });
    const assets = [makeAsset()];
    const result = planSegmentShots(segment, assets);

    for (const shot of result) {
      const shotDuration = shot.endTime - shot.startTime;
      expect(shotDuration).toBeLessThanOrEqual(4 + 0.001);
    }
  });

  it('splits into ≥2 shots when segment exceeds 6 seconds', () => {
    // Long narration: ~40 words at 2.5 words/sec = 16 seconds
    const longNarration = 'The company reported massive losses this quarter with revenue declining significantly across all major business segments and geographic regions leading to widespread concern among investors and analysts who had previously been optimistic about the outlook.';
    const segment = makeSegment({ duration: 10, narration: longNarration });
    const assets = [makeAsset(), makeAsset({ id: 'asset-2' })];
    const result = planSegmentShots(segment, assets);

    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it('enforces max 7s per asset without motion/overlay change', () => {
    const segment = makeSegment({ duration: 15, narration: 'Short.' });
    const assets = [makeAsset()];
    const result = planSegmentShots(segment, assets);

    for (const shot of result) {
      const shotDuration = shot.endTime - shot.startTime;
      expect(shotDuration).toBeLessThanOrEqual(7 + 0.001);
    }
  });

  it('covers the full segment duration', () => {
    const segment = makeSegment({ duration: 10 });
    const assets = [makeAsset(), makeAsset({ id: 'asset-2' })];
    const result = planSegmentShots(segment, assets);

    expect(result[0].startTime).toBe(0);
    expect(result[result.length - 1].endTime).toBeCloseTo(10, 5);
  });

  it('assigns framing to all shots', () => {
    const segment = makeSegment({ duration: 12 });
    const assets = [makeAsset()];
    const result = planSegmentShots(segment, assets);

    for (const shot of result) {
      expect(['close_up', 'wide_angle', 'medium']).toContain(shot.framing);
    }
  });

  it('assigns motion types to all shots', () => {
    const segment = makeSegment({ duration: 12 });
    const assets = [makeAsset()];
    const result = planSegmentShots(segment, assets);

    for (const shot of result) {
      expect(['ken_burns', 'zoom', 'cut', 'overlay']).toContain(shot.motionType);
    }
  });

  it('handles single short segment with one asset', () => {
    const segment = makeSegment({ duration: 3, narration: 'Brief.' });
    const assets = [makeAsset()];
    const result = planSegmentShots(segment, assets);

    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].startTime).toBe(0);
    expect(result[result.length - 1].endTime).toBeCloseTo(3, 5);
  });
});

// ---------------------------------------------------------------------------
// alternateFraming
// ---------------------------------------------------------------------------

describe('alternateFraming', () => {
  it('returns close_up for even indices', () => {
    expect(alternateFraming(0)).toBe('close_up');
    expect(alternateFraming(2)).toBe('close_up');
    expect(alternateFraming(4)).toBe('close_up');
  });

  it('returns wide_angle for odd indices', () => {
    expect(alternateFraming(1)).toBe('wide_angle');
    expect(alternateFraming(3)).toBe('wide_angle');
    expect(alternateFraming(5)).toBe('wide_angle');
  });

  it('alternates between consecutive indices', () => {
    for (let i = 0; i < 10; i++) {
      expect(alternateFraming(i)).not.toBe(alternateFraming(i + 1));
    }
  });
});

// ---------------------------------------------------------------------------
// planTextCards
// ---------------------------------------------------------------------------

describe('planTextCards', () => {
  it('returns empty array for ≤5 segments', () => {
    const segments = Array.from({ length: 5 }, (_, i) =>
      makeSegment({ id: `seg-${i}`, duration: 5 })
    );
    expect(planTextCards(segments)).toEqual([]);
  });

  it('returns ≥2 text cards for >5 segments', () => {
    const segments = Array.from({ length: 8 }, (_, i) =>
      makeSegment({
        id: `seg-${i}`,
        duration: 5,
        title: `Section ${i}`,
        narration: i % 2 === 0
          ? 'The company lost $5 billion in revenue this quarter.'
          : 'This is a regular narration without statistics.',
      })
    );
    const cards = planTextCards(segments);
    expect(cards.length).toBeGreaterThanOrEqual(2);
  });

  it('returns ≥2 text cards even without statistical content', () => {
    const segments = Array.from({ length: 7 }, (_, i) =>
      makeSegment({
        id: `seg-${i}`,
        duration: 5,
        title: `Section ${i}`,
        narration: 'This is a regular narration without any numbers or statistics.',
      })
    );
    const cards = planTextCards(segments);
    expect(cards.length).toBeGreaterThanOrEqual(2);
  });

  it('text cards have valid duration', () => {
    const segments = Array.from({ length: 8 }, (_, i) =>
      makeSegment({
        id: `seg-${i}`,
        duration: 5,
        narration: 'Revenue grew by 45% this quarter.',
      })
    );
    const cards = planTextCards(segments);
    for (const card of cards) {
      expect(card.durationSec).toBeGreaterThan(0);
      expect(card.durationSec).toBeLessThanOrEqual(3);
    }
  });

  it('text cards have non-empty text', () => {
    const segments = Array.from({ length: 8 }, (_, i) =>
      makeSegment({
        id: `seg-${i}`,
        duration: 5,
        title: `Section ${i}`,
        narration: 'The market cap reached $2 trillion.',
      })
    );
    const cards = planTextCards(segments);
    for (const card of cards) {
      expect(card.text.length).toBeGreaterThan(0);
    }
  });

  it('distributes cards across different segments', () => {
    const segments = Array.from({ length: 10 }, (_, i) =>
      makeSegment({
        id: `seg-${i}`,
        duration: 5,
        title: `Section ${i}`,
        narration: `Revenue grew by ${(i + 1) * 10}% this quarter.`,
      })
    );
    const cards = planTextCards(segments);
    const indices = cards.map(c => c.segmentIndex);
    const uniqueIndices = new Set(indices);
    expect(uniqueIndices.size).toBe(cards.length);
  });
});

// ---------------------------------------------------------------------------
// planPatternInterrupts
// ---------------------------------------------------------------------------

describe('planPatternInterrupts', () => {
  function makeSegment(overrides: Partial<ScriptSegment> = {}): ScriptSegment {
    return {
      id: 'seg-1',
      type: 'section',
      title: 'Test Segment',
      narration: 'This is a test narration with some words.',
      visualNote: 'Show chart',
      duration: 6,
      ...overrides,
    };
  }

  it('returns empty array when total duration <= 20s', () => {
    const segments = [makeSegment({ duration: 10 }), makeSegment({ duration: 10 })];
    const result = planPatternInterrupts(20, segments);
    expect(result).toEqual([]);
  });

  it('returns empty array for empty segments', () => {
    const result = planPatternInterrupts(60, []);
    expect(result).toEqual([]);
  });

  it('inserts pattern interrupts for segments longer than 20s', () => {
    const segments = [makeSegment({ id: 'seg-long', duration: 45 })];
    const result = planPatternInterrupts(45, segments);
    expect(result.length).toBeGreaterThan(0);
  });

  it('ensures no gap > 20s between interrupts for a long segment', () => {
    const segments = [makeSegment({ id: 'seg-long', duration: 60 })];
    const result = planPatternInterrupts(60, segments);
    // With a 60s segment, we need at least 2 interrupts to keep gaps <= 20s
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it('does not insert interrupts when segments are short enough', () => {
    // 4 segments of 5s each = 20s total, no gap > 20s
    const segments = Array.from({ length: 4 }, (_, i) =>
      makeSegment({ id: `seg-${i}`, duration: 5 })
    );
    const result = planPatternInterrupts(20, segments);
    expect(result).toEqual([]);
  });

  it('text cards have non-empty text', () => {
    const segments = [makeSegment({ id: 'seg-long', duration: 45, narration: 'Revenue grew by 25% this quarter.' })];
    const result = planPatternInterrupts(45, segments);
    for (const card of result) {
      expect(card.text.length).toBeGreaterThan(0);
    }
  });

  it('text cards have valid segment indices', () => {
    const segments = [
      makeSegment({ id: 'seg-0', duration: 30 }),
      makeSegment({ id: 'seg-1', duration: 30 }),
    ];
    const result = planPatternInterrupts(60, segments);
    for (const card of result) {
      expect(card.segmentIndex).toBeGreaterThanOrEqual(0);
      expect(card.segmentIndex).toBeLessThan(segments.length);
    }
  });

  it('extracts statistical text when available', () => {
    const segments = [makeSegment({ id: 'seg-long', duration: 45, narration: 'The company earned $5 billion in revenue this quarter.' })];
    const result = planPatternInterrupts(45, segments);
    const hasStatText = result.some(card => card.text.includes('$'));
    expect(hasStatText).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// shouldInsertContrastingTransition
// ---------------------------------------------------------------------------

describe('shouldInsertContrastingTransition', () => {
  it('returns true when both beats are the same', () => {
    const beats: NarrativeBeat[] = ['hook', 'context', 'data', 'quote', 'event', 'analysis', 'conclusion', 'transition'];
    for (const beat of beats) {
      expect(shouldInsertContrastingTransition(beat, beat)).toBe(true);
    }
  });

  it('returns false when beats are different', () => {
    expect(shouldInsertContrastingTransition('hook', 'data')).toBe(false);
    expect(shouldInsertContrastingTransition('context', 'quote')).toBe(false);
    expect(shouldInsertContrastingTransition('analysis', 'conclusion')).toBe(false);
    expect(shouldInsertContrastingTransition('event', 'transition')).toBe(false);
  });

  it('returns true for data-data pair', () => {
    expect(shouldInsertContrastingTransition('data', 'data')).toBe(true);
  });

  it('returns true for analysis-analysis pair', () => {
    expect(shouldInsertContrastingTransition('analysis', 'analysis')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// synchronizeTextCards
// ---------------------------------------------------------------------------

describe('synchronizeTextCards', () => {
  it('adjusts card startTime to match narration timestamp when outside tolerance', () => {
    const cards: TextCardEntry[] = [
      { segmentIndex: 0, startTime: 2.0, durationSec: 2.5, text: '$5 billion' },
    ];
    const timestamps = new Map([['$5 billion', 4.0]]);

    const result = synchronizeTextCards(cards, timestamps, 0.5);

    expect(result[0].startTime).toBe(4.0);
  });

  it('leaves card unchanged when already within tolerance', () => {
    const cards: TextCardEntry[] = [
      { segmentIndex: 0, startTime: 3.8, durationSec: 2.5, text: '$5 billion' },
    ];
    const timestamps = new Map([['$5 billion', 4.0]]);

    const result = synchronizeTextCards(cards, timestamps, 0.5);

    expect(result[0].startTime).toBe(3.8);
  });

  it('leaves card unchanged when no matching timestamp exists', () => {
    const cards: TextCardEntry[] = [
      { segmentIndex: 0, startTime: 2.0, durationSec: 2.5, text: 'Some text' },
    ];
    const timestamps = new Map([['Other text', 4.0]]);

    const result = synchronizeTextCards(cards, timestamps, 0.5);

    expect(result[0].startTime).toBe(2.0);
  });

  it('handles empty cards array', () => {
    const timestamps = new Map([['$5 billion', 4.0]]);
    const result = synchronizeTextCards([], timestamps, 0.5);
    expect(result).toEqual([]);
  });

  it('handles empty timestamps map', () => {
    const cards: TextCardEntry[] = [
      { segmentIndex: 0, startTime: 2.0, durationSec: 2.5, text: '$5 billion' },
    ];
    const result = synchronizeTextCards(cards, new Map(), 0.5);
    expect(result[0].startTime).toBe(2.0);
  });

  it('synchronizes multiple cards independently', () => {
    const cards: TextCardEntry[] = [
      { segmentIndex: 0, startTime: 1.0, durationSec: 2.5, text: '$5 billion' },
      { segmentIndex: 1, startTime: 5.0, durationSec: 2.5, text: '45%' },
      { segmentIndex: 2, startTime: 8.0, durationSec: 2.5, text: 'No match' },
    ];
    const timestamps = new Map([
      ['$5 billion', 3.0],
      ['45%', 5.3],
    ]);

    const result = synchronizeTextCards(cards, timestamps, 0.5);

    // First card: outside tolerance (|1.0 - 3.0| = 2.0 > 0.5), adjusted
    expect(result[0].startTime).toBe(3.0);
    // Second card: within tolerance (|5.0 - 5.3| = 0.3 ≤ 0.5), unchanged
    expect(result[1].startTime).toBe(5.0);
    // Third card: no match, unchanged
    expect(result[2].startTime).toBe(8.0);
  });

  it('uses default tolerance of 0.5 when not specified', () => {
    const cards: TextCardEntry[] = [
      { segmentIndex: 0, startTime: 3.6, durationSec: 2.5, text: '$5 billion' },
    ];
    const timestamps = new Map([['$5 billion', 4.0]]);

    const result = synchronizeTextCards(cards, timestamps);

    // |3.6 - 4.0| = 0.4 ≤ 0.5, so unchanged
    expect(result[0].startTime).toBe(3.6);
  });

  it('respects custom tolerance value', () => {
    const cards: TextCardEntry[] = [
      { segmentIndex: 0, startTime: 3.0, durationSec: 2.5, text: '$5 billion' },
    ];
    const timestamps = new Map([['$5 billion', 4.0]]);

    // With tolerance 1.0, |3.0 - 4.0| = 1.0 ≤ 1.0, so unchanged
    const result = synchronizeTextCards(cards, timestamps, 1.0);
    expect(result[0].startTime).toBe(3.0);

    // With tolerance 0.5, |3.0 - 4.0| = 1.0 > 0.5, so adjusted
    const result2 = synchronizeTextCards(cards, timestamps, 0.5);
    expect(result2[0].startTime).toBe(4.0);
  });

  it('does not mutate the original cards array', () => {
    const cards: TextCardEntry[] = [
      { segmentIndex: 0, startTime: 2.0, durationSec: 2.5, text: '$5 billion' },
    ];
    const timestamps = new Map([['$5 billion', 4.0]]);

    synchronizeTextCards(cards, timestamps, 0.5);

    expect(cards[0].startTime).toBe(2.0);
  });
});
