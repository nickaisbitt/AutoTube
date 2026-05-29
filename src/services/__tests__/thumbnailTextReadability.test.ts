/**
 * Unit tests for thumbnail text and readability validation functions.
 *
 * Validates: Requirements 2.5, 2.6, 2.7, 2.13, 2.14, 2.15, 2.16, 2.17, 2.18, 2.23, 2.24, 2.25
 */

import { describe, it, expect } from 'vitest';
import {
  validateThumbnailText,
  checkConceptMobileReadability,
  scoreVisualHierarchy,
  generateStrongerWordingVariants,
  ThumbnailConcept,
} from '../thumbnail';

// ─── Helper ─────────────────────────────────────────────────────────────────

function makeConcept(overrides: Partial<ThumbnailConcept> = {}): ThumbnailConcept {
  return {
    variant: 'fear',
    signifier: 'hacked laptop screen',
    emotionalAngle: 'personal vulnerability and immediate risk',
    textOverlay: 'You Could Be Next',
    colorAccent: '#ef4444',
    dominantSubject: 'Close-up of hacked laptop screen — single focal point, no competing elements',
    searchQueries: ['cyber threat close up', 'hacked screen dramatic'],
    ...overrides,
  };
}

// ─── validateThumbnailText ──────────────────────────────────────────────────

describe('validateThumbnailText', () => {
  it('returns text unchanged when 2-4 words (Requirement 2.5)', () => {
    expect(validateThumbnailText('You Are Next')).toBe('You Are Next');
    expect(validateThumbnailText('Check This Now')).toBe('Check This Now');
    expect(validateThumbnailText('Your Business Could End')).toBe('Your Business Could End');
    expect(validateThumbnailText('Act Before Too Late')).toBe('Act Before Too Late');
  });

  it('truncates text longer than 4 words (Requirement 2.7)', () => {
    const result = validateThumbnailText('This Is Way Too Long For A Thumbnail');
    const words = result.split(/\s+/);
    expect(words.length).toBe(4);
    expect(result).toBe('This Is Way Too');
  });

  it('pads single-word text to 2 words', () => {
    expect(validateThumbnailText('Danger')).toBe('Danger Now');
  });

  it('handles empty string with fallback', () => {
    expect(validateThumbnailText('')).toBe('Watch Now');
    expect(validateThumbnailText('   ')).toBe('Watch Now');
  });

  it('trims whitespace from valid text', () => {
    expect(validateThumbnailText('  You Are Next  ')).toBe('You Are Next');
  });

  it('returns exactly 2 words for minimum valid input', () => {
    const result = validateThumbnailText('Act Now');
    expect(result.split(/\s+/).length).toBe(2);
  });

  it('returns exactly 4 words for maximum valid input', () => {
    const result = validateThumbnailText('Your Business Could End');
    expect(result.split(/\s+/).length).toBe(4);
  });
});

// ─── checkMobileReadability ─────────────────────────────────────────────────

describe('checkConceptMobileReadability', () => {
  it('returns readable for well-formed concept (Requirement 2.6)', () => {
    const concept = makeConcept({ textOverlay: 'You Are Next' });
    const result = checkConceptMobileReadability(concept);
    expect(result.readable).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0.6);
  });

  it('flags text with more than 4 words as unreadable (Requirement 2.13)', () => {
    const concept = makeConcept({ textOverlay: 'This Is Way Too Long For Mobile' });
    const result = checkConceptMobileReadability(concept);
    expect(result.readable).toBe(false);
    expect(result.issues.some(i => i.includes('exceeds 4 words'))).toBe(true);
  });

  it('flags text exceeding character limit for mobile (Requirement 2.14)', () => {
    const concept = makeConcept({ textOverlay: 'Your Business Could Be Destroyed' });
    const result = checkConceptMobileReadability(concept);
    expect(result.issues.some(i => i.includes('char mobile limit'))).toBe(true);
  });

  it('detects low contrast between text and accent color (Requirement 2.18)', () => {
    // Yellow accent (#f5f500) has high luminance — low contrast with white text
    const concept = makeConcept({ colorAccent: '#f5f500', textOverlay: 'Act Now' });
    const result = checkConceptMobileReadability(concept);
    expect(result.issues.some(i => i.includes('contrast'))).toBe(true);
  });

  it('passes contrast check for dark accent colors', () => {
    // Dark red has good contrast with white text
    const concept = makeConcept({ colorAccent: '#7f1d1d', textOverlay: 'Act Now' });
    const result = checkConceptMobileReadability(concept);
    expect(result.issues.some(i => i.includes('contrast'))).toBe(false);
  });

  it('returns score between 0 and 1', () => {
    const concept = makeConcept();
    const result = checkConceptMobileReadability(concept);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });

  it('flags complex signifiers that may clutter mobile view (Requirement 2.16)', () => {
    const concept = makeConcept({
      signifier: 'very complex multi element detailed visual scene with many parts',
      textOverlay: 'Act Now',
    });
    const result = checkConceptMobileReadability(concept);
    expect(result.issues.some(i => i.includes('clutter'))).toBe(true);
  });

  it('returns issues array even when readable', () => {
    const concept = makeConcept({ textOverlay: 'Act Now' });
    const result = checkConceptMobileReadability(concept);
    expect(Array.isArray(result.issues)).toBe(true);
  });
});

// ─── scoreVisualHierarchy ───────────────────────────────────────────────────

describe('scoreVisualHierarchy', () => {
  it('scores well-formed concept with proper hierarchy (Requirement 2.14)', () => {
    const concept = makeConcept();
    const result = scoreVisualHierarchy(concept);
    expect(result.score).toBeGreaterThan(0.5);
    expect(result.subjectFirst).toBe(true);
  });

  it('identifies subject-first hierarchy (Requirement 2.15)', () => {
    const concept = makeConcept({
      dominantSubject: 'Single dominant hacked laptop — focal point with no competing elements',
    });
    const result = scoreVisualHierarchy(concept);
    expect(result.subjectFirst).toBe(true);
    expect(result.breakdown.subjectScore).toBeGreaterThanOrEqual(0.5);
  });

  it('scores text as secondary when short and impactful (Requirement 2.24)', () => {
    const concept = makeConcept({ textOverlay: 'You Are Next' });
    const result = scoreVisualHierarchy(concept);
    expect(result.breakdown.textScore).toBeGreaterThan(0.4);
  });

  it('penalizes overly long text overlays', () => {
    const concept = makeConcept({ textOverlay: 'This Is A Very Long Text That Competes With Subject' });
    const result = scoreVisualHierarchy(concept);
    expect(result.breakdown.textScore).toBeLessThan(0.5);
  });

  it('scores branding restraint (Requirement 2.25)', () => {
    const concept = makeConcept({ colorAccent: '#ef4444' });
    const result = scoreVisualHierarchy(concept);
    expect(result.breakdown.brandingScore).toBeGreaterThan(0.3);
    expect(result.brandingThird).toBe(true);
  });

  it('returns score between 0 and 1', () => {
    const concept = makeConcept();
    const result = scoreVisualHierarchy(concept);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });

  it('provides breakdown with all three components', () => {
    const concept = makeConcept();
    const result = scoreVisualHierarchy(concept);
    expect(result.breakdown).toHaveProperty('subjectScore');
    expect(result.breakdown).toHaveProperty('textScore');
    expect(result.breakdown).toHaveProperty('brandingScore');
  });
});

// ─── generateStrongerWordingVariants ────────────────────────────────────────

describe('generateStrongerWordingVariants', () => {
  it('generates multiple variants (Requirement 2.23)', () => {
    const variants = generateStrongerWordingVariants('Generic Text', 'cybercrime hacking');
    expect(variants.length).toBeGreaterThanOrEqual(5);
  });

  it('all variants are 2-4 words (Requirement 2.5)', () => {
    const variants = generateStrongerWordingVariants('Some Text', 'bank fraud');
    for (const v of variants) {
      const wordCount = v.split(/\s+/).length;
      expect(wordCount).toBeGreaterThanOrEqual(2);
      expect(wordCount).toBeLessThanOrEqual(4);
    }
  });

  it('produces topic-specific variants for cyber topics (Requirement 2.24)', () => {
    const variants = generateStrongerWordingVariants('Generic', 'cybercrime hacking breach');
    const joined = variants.join(' ').toLowerCase();
    expect(
      joined.includes('hack') || joined.includes('data') || joined.includes('click')
    ).toBe(true);
  });

  it('produces topic-specific variants for finance topics', () => {
    const variants = generateStrongerWordingVariants('Generic', 'bank fraud money');
    const joined = variants.join(' ').toLowerCase();
    expect(
      joined.includes('money') || joined.includes('bank') || joined.includes('drained')
    ).toBe(true);
  });

  it('produces topic-specific variants for business topics', () => {
    const variants = generateStrongerWordingVariants('Generic', 'business company shutdown');
    const joined = variants.join(' ').toLowerCase();
    expect(
      joined.includes('business') || joined.includes('shutdown')
    ).toBe(true);
  });

  it('excludes the original text from variants', () => {
    const original = 'You Could Be Next';
    const variants = generateStrongerWordingVariants(original, 'cybercrime');
    expect(variants.map(v => v.toLowerCase())).not.toContain(original.toLowerCase());
  });

  it('returns unique variants (no duplicates)', () => {
    const variants = generateStrongerWordingVariants('Test', 'hacking');
    const unique = new Set(variants);
    expect(unique.size).toBe(variants.length);
  });

  it('produces fallback variants for unknown topics', () => {
    const variants = generateStrongerWordingVariants('Test', 'underwater basket weaving');
    expect(variants.length).toBeGreaterThanOrEqual(5);
    for (const v of variants) {
      const wordCount = v.split(/\s+/).length;
      expect(wordCount).toBeGreaterThanOrEqual(2);
      expect(wordCount).toBeLessThanOrEqual(4);
    }
  });
});
