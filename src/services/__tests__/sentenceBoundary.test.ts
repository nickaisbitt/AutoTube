import { describe, it, expect } from 'vitest';
import {
  detectSentenceBoundaries,
  detectEmphasisPoints,
  alignCutsToSentences,
} from '../renderer/editingRhythm';
import type { ShotPlan } from '../renderer/editingRhythm';

// ---------------------------------------------------------------------------
// detectSentenceBoundaries
// ---------------------------------------------------------------------------

describe('detectSentenceBoundaries', () => {
  it('returns empty array for empty narration', () => {
    expect(detectSentenceBoundaries('', 10)).toEqual([]);
    expect(detectSentenceBoundaries('   ', 10)).toEqual([]);
  });

  it('returns empty array for zero duration', () => {
    expect(detectSentenceBoundaries('Hello world.', 0)).toEqual([]);
  });

  it('detects single sentence', () => {
    const result = detectSentenceBoundaries('This is a single sentence.', 5);
    expect(result).toHaveLength(1);
    expect(result[0].charOffset).toBe(0);
    expect(result[0].wordIndex).toBe(0);
    expect(result[0].estimatedTimestamp).toBe(0);
    expect(result[0].text).toBe('This is a single sentence.');
  });

  it('detects multiple sentences separated by periods', () => {
    const narration = 'First sentence. Second sentence. Third sentence.';
    const result = detectSentenceBoundaries(narration, 6);
    expect(result.length).toBe(3);
    expect(result[0].text).toContain('First sentence');
    expect(result[1].text).toContain('Second sentence');
    expect(result[2].text).toContain('Third sentence');
  });

  it('detects sentences with exclamation and question marks', () => {
    const narration = 'What happened? It was incredible! The end.';
    const result = detectSentenceBoundaries(narration, 6);
    expect(result.length).toBe(3);
  });

  it('estimates timestamps based on word rate', () => {
    // 6 words total, 6 seconds duration = 1 second per word
    const narration = 'First sentence here. Second sentence here.';
    const result = detectSentenceBoundaries(narration, 6);
    expect(result.length).toBe(2);
    // First sentence starts at word 0 → timestamp 0
    expect(result[0].estimatedTimestamp).toBe(0);
    // Second sentence starts at word 3 → timestamp 3
    expect(result[1].estimatedTimestamp).toBe(3);
  });

  it('handles narration without punctuation as single sentence', () => {
    const narration = 'This has no punctuation at all';
    const result = detectSentenceBoundaries(narration, 5);
    expect(result.length).toBe(1);
    expect(result[0].text).toBe('This has no punctuation at all');
  });

  it('timestamps do not exceed segment duration', () => {
    const narration = 'Short. Very short.';
    const result = detectSentenceBoundaries(narration, 2);
    for (const boundary of result) {
      expect(boundary.estimatedTimestamp).toBeLessThanOrEqual(2);
    }
  });
});

// ---------------------------------------------------------------------------
// detectEmphasisPoints
// ---------------------------------------------------------------------------

describe('detectEmphasisPoints', () => {
  it('returns empty array for empty narration', () => {
    expect(detectEmphasisPoints('', 10)).toEqual([]);
    expect(detectEmphasisPoints('   ', 10)).toEqual([]);
  });

  it('returns empty array for zero duration', () => {
    expect(detectEmphasisPoints('The company earned $5 billion.', 0)).toEqual([]);
  });

  it('detects dollar amounts', () => {
    const narration = 'The company earned $5 billion in revenue last year.';
    const result = detectEmphasisPoints(narration, 10);
    expect(result.length).toBeGreaterThan(0);
  });

  it('detects percentages', () => {
    const narration = 'Revenue grew by 45% this quarter compared to last year.';
    const result = detectEmphasisPoints(narration, 10);
    expect(result.length).toBeGreaterThan(0);
  });

  it('detects numbers with units', () => {
    const narration = 'Over 100 million people were affected by the change.';
    const result = detectEmphasisPoints(narration, 10);
    expect(result.length).toBeGreaterThan(0);
  });

  it('detects quoted text', () => {
    const narration = 'The CEO said "this is unprecedented" during the call.';
    const result = detectEmphasisPoints(narration, 10);
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns sorted timestamps', () => {
    const narration = 'Revenue hit $5 billion. Growth was 45%. Over 100 million users joined.';
    const result = detectEmphasisPoints(narration, 10);
    for (let i = 1; i < result.length; i++) {
      expect(result[i]).toBeGreaterThanOrEqual(result[i - 1]);
    }
  });

  it('timestamps do not exceed segment duration', () => {
    const narration = 'The $5 billion deal affected 100 million people with 45% growth.';
    const result = detectEmphasisPoints(narration, 5);
    for (const ts of result) {
      expect(ts).toBeLessThanOrEqual(5);
    }
  });
});

// ---------------------------------------------------------------------------
// alignCutsToSentences
// ---------------------------------------------------------------------------

describe('alignCutsToSentences', () => {
  function makeShot(overrides: Partial<ShotPlan> = {}): ShotPlan {
    return {
      assetIndex: 0,
      startTime: 0,
      endTime: 5,
      motionType: 'ken_burns',
      framing: 'close_up',
      ...overrides,
    };
  }

  it('returns shots unchanged when only one boundary', () => {
    const shots = [makeShot({ startTime: 0, endTime: 5 }), makeShot({ startTime: 5, endTime: 10 })];
    const boundaries = [{ charOffset: 0, wordIndex: 0, estimatedTimestamp: 0, text: 'Only one sentence.' }];
    const result = alignCutsToSentences(shots, boundaries, [], 10);
    expect(result).toEqual(shots);
  });

  it('returns shots unchanged when only one shot', () => {
    const shots = [makeShot({ startTime: 0, endTime: 10 })];
    const boundaries = [
      { charOffset: 0, wordIndex: 0, estimatedTimestamp: 0, text: 'First.' },
      { charOffset: 7, wordIndex: 1, estimatedTimestamp: 5, text: 'Second.' },
    ];
    const result = alignCutsToSentences(shots, boundaries, [], 10);
    expect(result).toEqual(shots);
  });

  it('snaps cut points to sentence boundaries', () => {
    const shots = [
      makeShot({ startTime: 0, endTime: 4 }),
      makeShot({ assetIndex: 1, startTime: 4, endTime: 8 }),
      makeShot({ assetIndex: 2, startTime: 8, endTime: 12 }),
    ];
    const boundaries = [
      { charOffset: 0, wordIndex: 0, estimatedTimestamp: 0, text: 'First sentence.' },
      { charOffset: 16, wordIndex: 3, estimatedTimestamp: 3.5, text: 'Second sentence.' },
      { charOffset: 33, wordIndex: 6, estimatedTimestamp: 7.5, text: 'Third sentence.' },
    ];
    const result = alignCutsToSentences(shots, boundaries, [], 12);

    // Cut points should be near sentence boundaries (3.5 and 7.5)
    expect(result.length).toBe(3);
    expect(result[0].endTime).toBeCloseTo(3.5, 0);
    expect(result[1].startTime).toBeCloseTo(3.5, 0);
    expect(result[1].endTime).toBeCloseTo(7.5, 0);
    expect(result[2].startTime).toBeCloseTo(7.5, 0);
  });

  it('avoids cuts within 0.5s of emphasis points', () => {
    const shots = [
      makeShot({ startTime: 0, endTime: 5 }),
      makeShot({ assetIndex: 1, startTime: 5, endTime: 10 }),
    ];
    // Sentence boundary at 5.0, emphasis point at 5.1
    const boundaries = [
      { charOffset: 0, wordIndex: 0, estimatedTimestamp: 0, text: 'First.' },
      { charOffset: 7, wordIndex: 2, estimatedTimestamp: 5.0, text: 'Second.' },
    ];
    const emphasisPoints = [5.1];
    const result = alignCutsToSentences(shots, boundaries, emphasisPoints, 10);

    // The cut should NOT be within 0.5s of the emphasis point at 5.1
    for (let i = 1; i < result.length; i++) {
      const cutTime = result[i].startTime;
      for (const ep of emphasisPoints) {
        expect(Math.abs(cutTime - ep)).toBeGreaterThanOrEqual(0.49);
      }
    }
  });

  it('preserves total segment duration', () => {
    const shots = [
      makeShot({ startTime: 0, endTime: 4 }),
      makeShot({ assetIndex: 1, startTime: 4, endTime: 8 }),
    ];
    const boundaries = [
      { charOffset: 0, wordIndex: 0, estimatedTimestamp: 0, text: 'First.' },
      { charOffset: 7, wordIndex: 2, estimatedTimestamp: 3.5, text: 'Second.' },
    ];
    const result = alignCutsToSentences(shots, boundaries, [], 8);

    expect(result[0].startTime).toBe(0);
    expect(result[result.length - 1].endTime).toBe(8);
  });

  it('handles empty emphasis points array', () => {
    const shots = [
      makeShot({ startTime: 0, endTime: 5 }),
      makeShot({ assetIndex: 1, startTime: 5, endTime: 10 }),
    ];
    const boundaries = [
      { charOffset: 0, wordIndex: 0, estimatedTimestamp: 0, text: 'First.' },
      { charOffset: 7, wordIndex: 2, estimatedTimestamp: 4.5, text: 'Second.' },
    ];
    const result = alignCutsToSentences(shots, boundaries, [], 10);
    expect(result.length).toBe(2);
    expect(result[0].startTime).toBe(0);
    expect(result[result.length - 1].endTime).toBe(10);
  });
});
