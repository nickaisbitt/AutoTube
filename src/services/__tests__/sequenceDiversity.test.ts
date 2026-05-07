import { describe, it, expect } from 'vitest';
import { scoreSequenceDiversity, type MediaCandidate, type SequenceDiversityScore } from '../media';

function makeCandidate(overrides: Partial<MediaCandidate> = {}): MediaCandidate {
  return {
    url: `https://example.com/${Math.random().toString(36).slice(2)}.jpg`,
    alt: 'test image',
    source: 'DuckDuckGo · example.com',
    baseScore: 100,
    query: 'test',
    finalScore: 200,
    type: 'image',
    ...overrides,
  };
}

describe('scoreSequenceDiversity', () => {
  it('returns perfect score for empty array', () => {
    const result = scoreSequenceDiversity([]);
    expect(result.overallScore).toBe(100);
    expect(result.repetitionPenalties).toHaveLength(0);
    expect(result.stockFatigueRisk).toBe(0);
    expect(result.freshShotInterval).toBe(0);
  });

  it('returns perfect score for single item', () => {
    const result = scoreSequenceDiversity([makeCandidate()]);
    expect(result.overallScore).toBe(100);
    expect(result.repetitionPenalties).toHaveLength(0);
  });

  it('returns high score for diverse sequence', () => {
    const media: MediaCandidate[] = [
      makeCandidate({ alt: 'person working at desk in office', source: 'DuckDuckGo · reuters.com', type: 'image' }),
      makeCandidate({ alt: 'server room with blinking lights', source: 'Wikimedia Commons', type: 'video' }),
      makeCandidate({ alt: 'chart showing data breach statistics', source: 'DuckDuckGo · bloomberg.com', type: 'image' }),
      makeCandidate({ alt: 'locked phone screen with alert warning', source: 'Unsplash', type: 'image' }),
      makeCandidate({ alt: 'city skyline at night landscape', source: 'DuckDuckGo · bbc.com', type: 'video' }),
    ];
    const result = scoreSequenceDiversity(media);
    expect(result.overallScore).toBeGreaterThan(60);
    expect(result.stockFatigueRisk).toBeLessThan(0.7);
  });

  it('penalizes consecutive same shot-type repetition', () => {
    const media: MediaCandidate[] = [
      makeCandidate({ alt: 'person smiling at camera portrait' }),
      makeCandidate({ alt: 'person talking in interview face' }),
      makeCandidate({ alt: 'people gathered in group portrait' }),
      makeCandidate({ alt: 'person presenting at conference face' }),
    ];
    const result = scoreSequenceDiversity(media);
    // Should have repetition penalty
    expect(result.repetitionPenalties.some(p => p.reason.includes('Consecutive'))).toBe(true);
    expect(result.overallScore).toBeLessThan(100);
  });

  it('detects stock-footage fatigue when same source dominates', () => {
    const media: MediaCandidate[] = [
      makeCandidate({ alt: 'image one', source: 'Picsum' }),
      makeCandidate({ alt: 'image two', source: 'Picsum' }),
      makeCandidate({ alt: 'image three', source: 'Picsum' }),
      makeCandidate({ alt: 'image four', source: 'Picsum' }),
      makeCandidate({ alt: 'image five', source: 'DuckDuckGo · example.com' }),
    ];
    const result = scoreSequenceDiversity(media);
    expect(result.stockFatigueRisk).toBeGreaterThan(0.5);
    expect(result.repetitionPenalties.some(p => p.reason.includes('fatigue'))).toBe(true);
  });

  it('penalizes similar alt-text patterns', () => {
    const media: MediaCandidate[] = [
      makeCandidate({ alt: 'cybersecurity breach hacking attack network', source: 'Source A' }),
      makeCandidate({ alt: 'cybersecurity breach hacking defense network', source: 'Source B' }),
      makeCandidate({ alt: 'cybersecurity breach hacking threat network', source: 'Source C' }),
      makeCandidate({ alt: 'cybersecurity breach hacking malware network', source: 'Source D' }),
    ];
    const result = scoreSequenceDiversity(media);
    expect(result.repetitionPenalties.some(p => p.reason.includes('alt-text'))).toBe(true);
    expect(result.overallScore).toBeLessThan(90);
  });

  it('penalizes long fresh shot intervals', () => {
    // All same alt and source = no fresh shots
    const media: MediaCandidate[] = Array.from({ length: 8 }, (_, i) =>
      makeCandidate({ alt: 'same image repeated', source: 'Same Source' })
    );
    const result = scoreSequenceDiversity(media);
    // With 8 items at 5s each = 40s total, no fresh shots → interval = 40s > 20s target
    expect(result.freshShotInterval).toBeGreaterThan(20);
    expect(result.repetitionPenalties.some(p => p.reason.includes('Fresh shot interval'))).toBe(true);
  });

  it('rewards type diversity (mix of image and video)', () => {
    const allImages: MediaCandidate[] = Array.from({ length: 5 }, (_, i) =>
      makeCandidate({ alt: `unique image ${i} with different content ${i * 100}`, source: `Source ${i}`, type: 'image' })
    );
    const mixed: MediaCandidate[] = [
      makeCandidate({ alt: 'unique image one with person portrait', source: 'Source A', type: 'image' }),
      makeCandidate({ alt: 'unique video two with server technology', source: 'Source B', type: 'video' }),
      makeCandidate({ alt: 'unique image three with chart data', source: 'Source C', type: 'image' }),
      makeCandidate({ alt: 'unique video four with city environment', source: 'Source D', type: 'video' }),
      makeCandidate({ alt: 'unique image five with alert consequence', source: 'Source E', type: 'image' }),
    ];

    const allImagesResult = scoreSequenceDiversity(allImages);
    const mixedResult = scoreSequenceDiversity(mixed);

    // Mixed should score equal or better than all-same-type
    expect(mixedResult.overallScore).toBeGreaterThanOrEqual(allImagesResult.overallScore);
  });

  it('returns valid SequenceDiversityScore shape', () => {
    const media: MediaCandidate[] = [
      makeCandidate({ alt: 'test one' }),
      makeCandidate({ alt: 'test two' }),
    ];
    const result: SequenceDiversityScore = scoreSequenceDiversity(media);
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(100);
    expect(Array.isArray(result.repetitionPenalties)).toBe(true);
    expect(typeof result.stockFatigueRisk).toBe('number');
    expect(result.stockFatigueRisk).toBeGreaterThanOrEqual(0);
    expect(result.stockFatigueRisk).toBeLessThanOrEqual(1);
    expect(typeof result.freshShotInterval).toBe('number');
    expect(result.freshShotInterval).toBeGreaterThanOrEqual(0);
  });

  it('score is always clamped between 0 and 100', () => {
    // Worst case: all identical
    const media: MediaCandidate[] = Array.from({ length: 10 }, () =>
      makeCandidate({ alt: 'identical abstract pattern background', source: 'Picsum' })
    );
    const result = scoreSequenceDiversity(media);
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(100);
  });
});
