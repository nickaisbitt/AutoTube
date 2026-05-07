/**
 * Unit tests for the Narration Pacing Controller.
 *
 * Tests core functionality: WPM computation, data point pause insertion,
 * emphasis markers, and full pacing application.
 */

import { describe, it, expect } from 'vitest';
import {
  applyPacing,
  computeSegmentWpm,
  insertDataPointPauses,
  getWpmRange,
} from '../pacingController';
import type { PacingConfig } from '../pacingController';

describe('computeSegmentWpm', () => {
  it('returns WPM in 170–180 range for intro segments', () => {
    const wpm = computeSegmentWpm('intro');
    expect(wpm).toBeGreaterThanOrEqual(170);
    expect(wpm).toBeLessThanOrEqual(180);
  });

  it('returns WPM in 140–155 range for outro segments', () => {
    const wpm = computeSegmentWpm('outro');
    expect(wpm).toBeGreaterThanOrEqual(140);
    expect(wpm).toBeLessThanOrEqual(155);
  });

  it('returns WPM in 140–155 range for advice segments', () => {
    const wpm = computeSegmentWpm('advice');
    expect(wpm).toBeGreaterThanOrEqual(140);
    expect(wpm).toBeLessThanOrEqual(155);
  });

  it('returns WPM in 120–200 range for section segments', () => {
    const wpm = computeSegmentWpm('section');
    expect(wpm).toBeGreaterThanOrEqual(120);
    expect(wpm).toBeLessThanOrEqual(200);
  });

  it('returns WPM in 120–200 range for transition segments', () => {
    const wpm = computeSegmentWpm('transition');
    expect(wpm).toBeGreaterThanOrEqual(120);
    expect(wpm).toBeLessThanOrEqual(200);
  });

  it('returns WPM in 120–200 range for unknown segment types', () => {
    const wpm = computeSegmentWpm('unknown');
    expect(wpm).toBeGreaterThanOrEqual(120);
    expect(wpm).toBeLessThanOrEqual(200);
  });
});

describe('getWpmRange', () => {
  it('returns correct range for intro', () => {
    expect(getWpmRange('intro')).toEqual({ min: 170, max: 180 });
  });

  it('returns correct range for outro', () => {
    expect(getWpmRange('outro')).toEqual({ min: 140, max: 155 });
  });

  it('returns correct range for advice', () => {
    expect(getWpmRange('advice')).toEqual({ min: 140, max: 155 });
  });

  it('returns default range for section', () => {
    expect(getWpmRange('section')).toEqual({ min: 120, max: 200 });
  });
});

describe('insertDataPointPauses', () => {
  it('inserts pause before dollar amounts', () => {
    const result = insertDataPointPauses('The company earned $5,000,000 last year.');
    expect(result).toContain('[pause:400ms]$5,000,000');
  });

  it('inserts pause before percentages', () => {
    const result = insertDataPointPauses('Revenue grew by 45% this quarter.');
    expect(result).toContain('[pause:400ms]45%');
  });

  it('inserts pause before large numbers with commas', () => {
    const result = insertDataPointPauses('Over 1,000,000 users signed up.');
    expect(result).toContain('[pause:400ms]1,000,000');
  });

  it('inserts pause before numbers with million/billion', () => {
    const result = insertDataPointPauses('They raised 2.5 billion in funding.');
    expect(result).toContain('[pause:400ms]2.5 billion');
  });

  it('handles multiple data points in one text', () => {
    const text = 'Revenue hit $10 billion, up 25% from last year.';
    const result = insertDataPointPauses(text);
    expect(result).toContain('[pause:400ms]$10 billion');
    expect(result).toContain('[pause:400ms]25%');
  });

  it('returns text unchanged when no data points present', () => {
    const text = 'This is a simple sentence with no numbers.';
    expect(insertDataPointPauses(text)).toBe(text);
  });

  it('handles empty string', () => {
    expect(insertDataPointPauses('')).toBe('');
  });

  it('handles whitespace-only string', () => {
    expect(insertDataPointPauses('   ')).toBe('   ');
  });
});

describe('applyPacing', () => {
  it('wraps text in prosody rate tag', () => {
    const config: PacingConfig = {
      targetWpm: 160,
      segmentType: 'section',
    };
    const result = applyPacing('Hello world', config);
    expect(result.processedText).toMatch(/^<prosody rate="\d+%">/);
    expect(result.processedText).toMatch(/<\/prosody>$/);
  });

  it('clamps WPM to intro range for intro segments', () => {
    const config: PacingConfig = {
      targetWpm: 120, // below intro range
      segmentType: 'intro',
    };
    const result = applyPacing('Hello world test sentence here', config);
    expect(result.estimatedWpm).toBeGreaterThanOrEqual(170);
    expect(result.estimatedWpm).toBeLessThanOrEqual(180);
  });

  it('clamps WPM to outro range for outro segments', () => {
    const config: PacingConfig = {
      targetWpm: 200, // above outro range
      segmentType: 'outro',
    };
    const result = applyPacing('Hello world test sentence here', config);
    expect(result.estimatedWpm).toBeGreaterThanOrEqual(140);
    expect(result.estimatedWpm).toBeLessThanOrEqual(155);
  });

  it('calculates estimated duration based on word count and WPM', () => {
    const config: PacingConfig = {
      targetWpm: 160,
      segmentType: 'section',
    };
    // 160 words at 160 WPM = 60 seconds
    const words = Array(160).fill('word').join(' ');
    const result = applyPacing(words, config);
    expect(result.estimatedDuration).toBeCloseTo(60, 0);
  });

  it('adds pause duration to estimated duration', () => {
    const config: PacingConfig = {
      targetWpm: 160,
      segmentType: 'section',
    };
    const text = 'The stock rose 45% to $1,000 per share.';
    const result = applyPacing(text, config);
    // Should have pauses that add to duration
    expect(result.pausePoints.length).toBeGreaterThan(0);
    expect(result.estimatedDuration).toBeGreaterThan(0);
  });

  it('applies emphasis markers to key phrases', () => {
    const config: PacingConfig = {
      targetWpm: 160,
      segmentType: 'section',
      emphasisMarkers: ['critical point'],
    };
    const result = applyPacing('This is a critical point in the story.', config);
    expect(result.processedText).toContain('<emphasis>critical point</emphasis>');
  });

  it('handles empty text gracefully', () => {
    const config: PacingConfig = {
      targetWpm: 160,
      segmentType: 'section',
    };
    const result = applyPacing('', config);
    expect(result.processedText).toBe('');
    expect(result.estimatedWpm).toBe(0);
    expect(result.estimatedDuration).toBe(0);
    expect(result.pausePoints).toEqual([]);
  });

  it('returns pause points as character offsets', () => {
    const config: PacingConfig = {
      targetWpm: 160,
      segmentType: 'section',
    };
    const result = applyPacing('Revenue grew 50% last year.', config);
    expect(result.pausePoints.length).toBeGreaterThan(0);
    // Each pause point should be a valid index in the processed text
    for (const point of result.pausePoints) {
      expect(point).toBeGreaterThanOrEqual(0);
      expect(point).toBeLessThan(result.processedText.length);
    }
  });
});
