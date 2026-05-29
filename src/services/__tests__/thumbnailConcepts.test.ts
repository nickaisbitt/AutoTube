/**
 * Unit tests for generateThumbnailConcepts
 *
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.8, 2.11, 2.19, 2.20, 2.21, 2.22
 */

import { describe, it, expect } from 'vitest';
import { generateThumbnailConcepts } from '../thumbnail';

describe('generateThumbnailConcepts', () => {
  // ─── Core: At least 3 variants (Requirement 2.20) ──────────────────────────

  it('generates at least 3 thumbnail concepts', () => {
    const concepts = generateThumbnailConcepts('cybercrime hacking', 'business_insider', 'general consumers');
    expect(concepts.length).toBeGreaterThanOrEqual(3);
  });

  // ─── Variant types: fear, curiosity, authority (Requirement 2.21) ──────────

  it('includes fear, curiosity, and authority variants', () => {
    const concepts = generateThumbnailConcepts('ransomware attacks', 'warfront', 'small business owners');
    const variants = concepts.map(c => c.variant);
    expect(variants).toContain('fear');
    expect(variants).toContain('curiosity');
    expect(variants).toContain('authority');
  });

  // ─── Topic-specific signifier (Requirement 2.19) ──────────────────────────

  it('includes topic-specific signifiers for cybercrime topics', () => {
    const concepts = generateThumbnailConcepts('cybercrime hacking breach', 'business_insider', 'consumers');
    // Each concept should have a non-empty signifier
    for (const concept of concepts) {
      expect(concept.signifier).toBeTruthy();
      expect(concept.signifier.length).toBeGreaterThan(0);
    }
    // At least one signifier should be cyber-related
    const allSignifiers = concepts.map(c => c.signifier.toLowerCase()).join(' ');
    expect(
      allSignifiers.includes('hack') ||
      allSignifiers.includes('ransom') ||
      allSignifiers.includes('phishing') ||
      allSignifiers.includes('laptop') ||
      allSignifiers.includes('screen') ||
      allSignifiers.includes('lock')
    ).toBe(true);
  });

  it('includes topic-specific signifiers for finance topics', () => {
    const concepts = generateThumbnailConcepts('bank fraud money theft', 'business_insider', 'consumers');
    const allSignifiers = concepts.map(c => c.signifier.toLowerCase()).join(' ');
    expect(
      allSignifiers.includes('bank') ||
      allSignifiers.includes('wallet') ||
      allSignifiers.includes('transaction') ||
      allSignifiers.includes('frozen')
    ).toBe(true);
  });

  // ─── Text overlay 2-5 words (Requirement 2.4) ─────────────────────────────

  it('enforces 2-5 word text overlays on all concepts', () => {
    const concepts = generateThumbnailConcepts('cybercrime hacking', 'business_insider', 'general consumers');
    for (const concept of concepts) {
      const wordCount = concept.textOverlay.trim().split(/\s+/).length;
      expect(wordCount).toBeGreaterThanOrEqual(2);
      expect(wordCount).toBeLessThanOrEqual(5);
    }
  });

  // ─── Color accent present (Requirement 2.8) ───────────────────────────────

  it('includes a color accent hex code for each concept', () => {
    const concepts = generateThumbnailConcepts('AI deepfake threats', 'documentary', 'freelancers');
    for (const concept of concepts) {
      expect(concept.colorAccent).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  // ─── Single dominant subject (Requirement 2.3) ────────────────────────────

  it('specifies a single dominant subject with no competing focal points', () => {
    const concepts = generateThumbnailConcepts('ransomware attacks', 'warfront', 'small business owners');
    for (const concept of concepts) {
      expect(concept.dominantSubject).toBeTruthy();
      expect(concept.dominantSubject.length).toBeGreaterThan(10);
      // Should mention single/focal/no competing
      const lower = concept.dominantSubject.toLowerCase();
      expect(
        lower.includes('single') || lower.includes('focal') || lower.includes('no competing')
      ).toBe(true);
    }
  });

  // ─── Emotional angle present (Requirement 2.11) ───────────────────────────

  it('includes an emotional angle for each concept', () => {
    const concepts = generateThumbnailConcepts('identity theft', 'explainer', 'consumers');
    for (const concept of concepts) {
      expect(concept.emotionalAngle).toBeTruthy();
      expect(concept.emotionalAngle.length).toBeGreaterThan(5);
    }
  });

  // ─── Search queries present ───────────────────────────────────────────────

  it('includes search queries for each concept', () => {
    const concepts = generateThumbnailConcepts('crypto wallet hack', 'business_insider', 'consumers');
    for (const concept of concepts) {
      expect(concept.searchQueries).toBeDefined();
      expect(concept.searchQueries.length).toBeGreaterThan(0);
    }
  });

  // ─── Different styles produce different color accents ─────────────────────

  it('produces different color accents for different styles', () => {
    const biConcepts = generateThumbnailConcepts('hacking', 'business_insider', 'consumers');
    const warConcepts = generateThumbnailConcepts('hacking', 'warfront', 'consumers');

    // At least one color should differ between styles
    const biColors = biConcepts.map(c => c.colorAccent);
    const warColors = warConcepts.map(c => c.colorAccent);
    const allSame = biColors.every((c, i) => c === warColors[i]);
    expect(allSame).toBe(false);
  });

  // ─── Audience adaptation (Requirement 2.22) ───────────────────────────────

  it('adapts emotional angles for business audience', () => {
    const concepts = generateThumbnailConcepts('cybercrime', 'business_insider', 'small business owners');
    const fearConcept = concepts.find(c => c.variant === 'fear');
    expect(fearConcept).toBeDefined();
    expect(fearConcept!.emotionalAngle.toLowerCase()).toContain('business');
  });

  it('adapts emotional angles for freelancer audience', () => {
    const concepts = generateThumbnailConcepts('cybercrime', 'business_insider', 'freelancers');
    const fearConcept = concepts.find(c => c.variant === 'fear');
    expect(fearConcept).toBeDefined();
    expect(fearConcept!.emotionalAngle.toLowerCase()).toContain('account');
  });

  // ─── Fallback for unknown topics ─────────────────────────────────────────

  it('produces valid concepts even for unknown/generic topics', () => {
    const concepts = generateThumbnailConcepts('underwater basket weaving dangers', 'explainer', 'consumers');
    expect(concepts.length).toBeGreaterThanOrEqual(3);
    for (const concept of concepts) {
      expect(concept.signifier).toBeTruthy();
      expect(concept.textOverlay.trim().split(/\s+/).length).toBeGreaterThanOrEqual(2);
      expect(concept.textOverlay.trim().split(/\s+/).length).toBeLessThanOrEqual(5);
      expect(concept.colorAccent).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});
