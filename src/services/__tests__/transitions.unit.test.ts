import { describe, it, expect } from 'vitest';
import {
  computeVisualChangeCount,
  getTransitionConfigForSectionChange,
  getStatisticalCardDuration,
  getSectionTitleCardDuration,
  applyKenBurnsEffect,
} from '../renderer/canvas/transitions';

describe('computeVisualChangeCount', () => {
  it('returns 0 for zero or negative duration', () => {
    expect(computeVisualChangeCount(0, 3)).toBe(0);
    expect(computeVisualChangeCount(-5, 3)).toBe(0);
  });

  it('returns at least 2 for a 10-second segment', () => {
    const result = computeVisualChangeCount(10, 5);
    expect(result).toBeGreaterThanOrEqual(2);
  });

  it('returns at least 4 for a 20-second segment (2 windows)', () => {
    const result = computeVisualChangeCount(20, 5);
    expect(result).toBeGreaterThanOrEqual(4);
  });

  it('returns at least 2 for segments shorter than 10 seconds', () => {
    const result = computeVisualChangeCount(5, 3);
    expect(result).toBeGreaterThanOrEqual(2);
  });

  it('returns at least 1 for any positive duration', () => {
    expect(computeVisualChangeCount(1, 1)).toBeGreaterThanOrEqual(1);
    expect(computeVisualChangeCount(0.5, 1)).toBeGreaterThanOrEqual(1);
  });

  it('scales with segment duration', () => {
    const short = computeVisualChangeCount(10, 5);
    const long = computeVisualChangeCount(30, 5);
    expect(long).toBeGreaterThan(short);
  });
});

describe('getTransitionConfigForSectionChange', () => {
  it('returns motif-swipe for personal-risk section', () => {
    const config = getTransitionConfigForSectionChange('personal-risk', 'advice');
    expect(config.type).toBe('motif-swipe');
    expect(config.fromSectionType).toBe('personal-risk');
    expect(config.toSectionType).toBe('advice');
  });

  it('returns gentle-dissolve for advice section', () => {
    const config = getTransitionConfigForSectionChange('advice', 'cta');
    expect(config.type).toBe('gentle-dissolve');
  });

  it('returns fade-out for cta section', () => {
    const config = getTransitionConfigForSectionChange('cta', 'personal-risk');
    expect(config.type).toBe('fade-out');
  });

  it('returns gentle-dissolve for practical-tips section', () => {
    const config = getTransitionConfigForSectionChange('practical-tips', 'advice');
    expect(config.type).toBe('gentle-dissolve');
  });

  it('falls back to advice template for unknown section type', () => {
    const config = getTransitionConfigForSectionChange('unknown-type', 'advice');
    expect(config.type).toBe('gentle-dissolve'); // advice template's transitionOut
  });

  it('includes accent color from template', () => {
    const config = getTransitionConfigForSectionChange('personal-risk', 'advice');
    expect(config.accentColor).toBeDefined();
    expect(config.accentColor).toBe('#ef4444'); // SEMANTIC_COLORS.threat
  });

  it('includes durationMs', () => {
    const config = getTransitionConfigForSectionChange('advice', 'cta');
    expect(config.durationMs).toBe(600);
  });
});

describe('getStatisticalCardDuration', () => {
  it('returns 0 for text without statistical content', () => {
    expect(getStatisticalCardDuration('This is a simple sentence without numbers.')).toBe(0);
  });

  it('returns a duration between 2 and 3 for text with dollar amounts', () => {
    const duration = getStatisticalCardDuration('The company lost $5.2 billion in revenue.');
    expect(duration).toBeGreaterThanOrEqual(2);
    expect(duration).toBeLessThanOrEqual(3);
  });

  it('returns a duration between 2 and 3 for text with percentages', () => {
    const duration = getStatisticalCardDuration('Revenue grew by 45% this quarter.');
    expect(duration).toBeGreaterThanOrEqual(2);
    expect(duration).toBeLessThanOrEqual(3);
  });

  it('returns a duration between 2 and 3 for text with large numbers', () => {
    const duration = getStatisticalCardDuration('Over 500 million users were affected by the breach.');
    expect(duration).toBeGreaterThanOrEqual(2);
    expect(duration).toBeLessThanOrEqual(3);
  });

  it('returns longer duration for longer narration text', () => {
    const shortText = 'Lost $5 billion.';
    const longText = 'The company reported that it had lost approximately $5 billion in total revenue over the course of the fiscal year, representing a significant decline from previous performance metrics and expectations.';
    const shortDuration = getStatisticalCardDuration(shortText);
    const longDuration = getStatisticalCardDuration(longText);
    expect(longDuration).toBeGreaterThanOrEqual(shortDuration);
  });
});

describe('getSectionTitleCardDuration', () => {
  it('returns 0 when fromSectionType is undefined', () => {
    expect(getSectionTitleCardDuration(undefined, 'advice')).toBe(0);
  });

  it('returns 0 when toSectionType is undefined', () => {
    expect(getSectionTitleCardDuration('advice', undefined)).toBe(0);
  });

  it('returns 0 when section types are the same', () => {
    expect(getSectionTitleCardDuration('advice', 'advice')).toBe(0);
  });

  it('returns 1200ms when section types differ', () => {
    expect(getSectionTitleCardDuration('personal-risk', 'advice')).toBe(1200);
  });

  it('returns 1200ms for any different section type pair', () => {
    expect(getSectionTitleCardDuration('cta', 'corporate-risk')).toBe(1200);
    expect(getSectionTitleCardDuration('story-example', 'practical-tips')).toBe(1200);
  });
});

describe('applyKenBurnsEffect', () => {
  it('returns zoom=1.0 at progress=0 with default config', () => {
    const result = applyKenBurnsEffect(0);
    expect(result.zoom).toBeCloseTo(1.0, 5);
  });

  it('returns zoom=1.08 at progress=1 with default config', () => {
    const result = applyKenBurnsEffect(1);
    expect(result.zoom).toBeCloseTo(1.08, 5);
  });

  it('returns intermediate zoom at progress=0.5', () => {
    const result = applyKenBurnsEffect(0.5);
    expect(result.zoom).toBeGreaterThan(1.0);
    expect(result.zoom).toBeLessThan(1.08);
  });

  it('returns offsetX=0 at progress=0 and progress=1', () => {
    const atStart = applyKenBurnsEffect(0);
    const atEnd = applyKenBurnsEffect(1);
    expect(atStart.offsetX).toBeCloseTo(0, 1);
    expect(atEnd.offsetX).toBeCloseTo(0, 1);
  });

  it('returns non-zero offsetX at progress=0.5 (peak of sine)', () => {
    const result = applyKenBurnsEffect(0.5);
    expect(Math.abs(result.offsetX)).toBeGreaterThan(0);
  });

  it('respects custom config', () => {
    const result = applyKenBurnsEffect(1, {
      zoomStart: 1.0,
      zoomEnd: 1.2,
      panX: 1.0,
      panY: 0,
    });
    expect(result.zoom).toBeCloseTo(1.2, 5);
  });

  it('zoom interpolates linearly', () => {
    const config = { zoomStart: 1.0, zoomEnd: 1.1, panX: 0, panY: 0 };
    const at25 = applyKenBurnsEffect(0.25, config);
    const at75 = applyKenBurnsEffect(0.75, config);
    expect(at25.zoom).toBeCloseTo(1.025, 5);
    expect(at75.zoom).toBeCloseTo(1.075, 5);
  });
});
