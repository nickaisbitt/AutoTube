import { describe, it, expect } from 'vitest';
import { extractDataPoints, generateTitleOptions } from '../seoTitles';
import type { MediaAsset } from '../../types';

// ---------------------------------------------------------------------------
// Helper: build a minimal MediaAsset for testing extractDataPoints
// ---------------------------------------------------------------------------
function makeAsset(alt: string, concept: string = ''): MediaAsset {
  return {
    id: 'asset-1',
    segmentId: 'seg-1',
    type: 'image',
    url: 'https://example.com/image.jpg',
    alt,
    source: 'test',
    concept,
  };
}

// ---------------------------------------------------------------------------
// extractDataPoints
// ---------------------------------------------------------------------------

describe('extractDataPoints', () => {
  // Requirement 7.8 — currency amounts
  it('extracts a currency amount like "$1.2T" from asset alt text', () => {
    const assets: MediaAsset[] = [makeAsset('$1.2T revenue reported this quarter')];
    const result = extractDataPoints(assets);
    expect(result).toContain('$1.2T');
  });

  // Requirement 7.8 — percentages
  it('extracts a percentage like "+200%" from asset alt text', () => {
    const assets: MediaAsset[] = [makeAsset('+200% growth year over year')];
    const result = extractDataPoints(assets);
    expect(result).toContain('+200%');
  });

  // Requirement 7.8 — year references
  it('extracts a year like "2024" from asset alt text', () => {
    const assets: MediaAsset[] = [makeAsset('2024 earnings report')];
    const result = extractDataPoints(assets);
    expect(result).toContain('2024');
  });

  // Requirement 7.8 — no numeric patterns → empty array
  it('returns an empty array when no numeric patterns are present', () => {
    const assets: MediaAsset[] = [makeAsset('A generic image of a building')];
    const result = extractDataPoints(assets);
    expect(result).toEqual([]);
  });

  // Requirement 7.8 — scans concept field as well
  it('extracts data points from the concept field', () => {
    const assets: MediaAsset[] = [makeAsset('', '$40B market cap chart')];
    const result = extractDataPoints(assets);
    expect(result).toContain('$40B');
  });

  // Requirement 8.4 — deduplication
  it('deduplicates identical data points across multiple assets', () => {
    const assets: MediaAsset[] = [
      makeAsset('$1.2T revenue'),
      makeAsset('$1.2T revenue again'),
    ];
    const result = extractDataPoints(assets);
    const count = result.filter((dp) => dp === '$1.2T').length;
    expect(count).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// generateTitleOptions — with data points (Requirement 7.1, 7.3)
// ---------------------------------------------------------------------------

describe('generateTitleOptions with data points', () => {
  const topic = 'Nvidia';
  const style = 'business_insider';

  it('returns exactly 3 titles when data points are provided', () => {
    const titles = generateTitleOptions(topic, style, ['$40B']);
    expect(titles).toHaveLength(3);
  });

  it('each title contains the data point "$40B"', () => {
    const titles = generateTitleOptions(topic, style, ['$40B']);
    for (const option of titles) {
      expect(option.title).toContain('$40B');
    }
  });

  it('each title is between 40 and 70 characters (inclusive)', () => {
    const titles = generateTitleOptions(topic, style, ['$40B']);
    for (const option of titles) {
      expect(option.title.length).toBeGreaterThanOrEqual(40);
      expect(option.title.length).toBeLessThanOrEqual(70);
    }
  });
});

// ---------------------------------------------------------------------------
// generateTitleOptions — without data points (Requirement 7.2, 7.3)
// ---------------------------------------------------------------------------

describe('generateTitleOptions without data points', () => {
  const topic = 'Nvidia';
  const style = 'business_insider';

  it('returns titles sorted by estimatedCTR descending', () => {
    const titles = generateTitleOptions(topic, style, []);
    for (let i = 0; i < titles.length - 1; i++) {
      expect(titles[i].estimatedCTR).toBeGreaterThanOrEqual(titles[i + 1].estimatedCTR);
    }
  });

  it('titles do not contain fabricated numbers (no $, %, or year patterns)', () => {
    const titles = generateTitleOptions(topic, style, []);
    const fabricatedPattern = /\$[\d.]+[TBM]|[+-]?\d+(?:\.\d+)?%|\b(?:19|20)\d{2}\b/;
    for (const option of titles) {
      expect(option.title).not.toMatch(fabricatedPattern);
    }
  });
});

// ---------------------------------------------------------------------------
// generateTitleOptions — backward-compatible two-parameter call (Requirement 10.6)
// ---------------------------------------------------------------------------

describe('generateTitleOptions two-parameter backward compatibility', () => {
  it('returns a TitleOption[] sorted by estimatedCTR descending when called with two parameters', () => {
    const titles = generateTitleOptions('Tesla', 'business_insider');

    // Must return an array
    expect(Array.isArray(titles)).toBe(true);
    expect(titles.length).toBeGreaterThan(0);

    // Each element must have the expected shape
    for (const option of titles) {
      expect(option).toHaveProperty('title');
      expect(option).toHaveProperty('style');
      expect(option).toHaveProperty('estimatedCTR');
      expect(typeof option.title).toBe('string');
      expect(typeof option.estimatedCTR).toBe('number');
    }

    // Must be sorted by estimatedCTR descending
    for (let i = 0; i < titles.length - 1; i++) {
      expect(titles[i].estimatedCTR).toBeGreaterThanOrEqual(titles[i + 1].estimatedCTR);
    }
  });
});

// ---------------------------------------------------------------------------
// generateTitleOptions — with hookLine (Requirement 11.3)
// ---------------------------------------------------------------------------

describe('generateTitleOptions with hookLine', () => {
  const topic = 'EU vs Big Tech';
  const style = 'business_insider';

  it('generates at least one title referencing the hook key phrase when hookLine is provided', () => {
    const hookLine = 'Meta just got fined $1.3 billion.';
    const titles = generateTitleOptions(topic, style, [], hookLine);

    const hookAligned = titles.filter(t => t.title.includes('$1.3 billion'));
    expect(hookAligned.length).toBeGreaterThanOrEqual(1);
  });

  it('hook-aligned title has style "shocking" or "clickbait"', () => {
    const hookLine = 'Meta just got fined $1.3 billion.';
    const titles = generateTitleOptions(topic, style, [], hookLine);

    const hookAligned = titles.filter(t => t.title.includes('$1.3 billion'));
    for (const t of hookAligned) {
      expect(['shocking', 'clickbait']).toContain(t.style);
    }
  });

  it('hook-aligned title has a high estimated CTR', () => {
    const hookLine = 'Meta just got fined $1.3 billion.';
    const titles = generateTitleOptions(topic, style, [], hookLine);

    const hookAligned = titles.filter(t => t.title.includes('$1.3 billion'));
    for (const t of hookAligned) {
      expect(t.estimatedCTR).toBeGreaterThanOrEqual(9.0);
    }
  });

  it('returns more titles than the standard set when hookLine is provided', () => {
    const withoutHook = generateTitleOptions(topic, style, []);
    const withHook = generateTitleOptions(topic, style, [], 'Meta just got fined $1.3 billion.');
    expect(withHook.length).toBeGreaterThan(withoutHook.length);
  });

  it('extracts a named entity when no numbers are present in the hook', () => {
    const hookLine = 'Apple is secretly building a new AI chip.';
    const titles = generateTitleOptions(topic, style, [], hookLine);

    // The key phrase extractor finds "AI" as the first capitalized non-starter word
    const hookAligned = titles.filter(t => t.title.includes('AI'));
    expect(hookAligned.length).toBeGreaterThanOrEqual(1);
  });

  it('does not add a hook-aligned title when hookLine is empty', () => {
    const withoutHook = generateTitleOptions(topic, style, []);
    const withEmptyHook = generateTitleOptions(topic, style, [], '');
    expect(withEmptyHook.length).toBe(withoutHook.length);
  });

  it('does not add a hook-aligned title when hookLine is whitespace-only', () => {
    const withoutHook = generateTitleOptions(topic, style, []);
    const withWhitespace = generateTitleOptions(topic, style, [], '   ');
    expect(withWhitespace.length).toBe(withoutHook.length);
  });

  it('works with data points and hookLine together', () => {
    const hookLine = 'Revenue surged 42% in Q3.';
    const titles = generateTitleOptions(topic, style, ['$40B'], hookLine);

    // Should have the 3 data-point titles + at least 1 hook-aligned title
    expect(titles.length).toBeGreaterThan(3);

    const hookAligned = titles.filter(t => t.title.includes('42%'));
    expect(hookAligned.length).toBeGreaterThanOrEqual(1);
  });
});
