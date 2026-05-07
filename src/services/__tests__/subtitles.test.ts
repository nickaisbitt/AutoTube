import { describe, it, expect } from 'vitest';
import {
  preventTextCompetition,
  generateHeadlineCard,
  enforceInstantProcessing,
  extractKeyNouns,
  scoreMobileReadability,
} from '../subtitles';

describe('preventTextCompetition', () => {
  it('returns no_conflict when subtitle is empty', () => {
    const result = preventTextCompetition('', 'Breaking News');
    expect(result.hasConflict).toBe(false);
    expect(result.resolution).toBe('no_conflict');
  });

  it('returns no_conflict when kinetic text is empty', () => {
    const result = preventTextCompetition('Your data is at risk', '');
    expect(result.hasConflict).toBe(false);
    expect(result.resolution).toBe('no_conflict');
  });

  it('returns no_conflict when both are empty', () => {
    const result = preventTextCompetition('', '');
    expect(result.hasConflict).toBe(false);
    expect(result.resolution).toBe('no_conflict');
  });

  it('detects overlapping text and prefers kinetic', () => {
    const result = preventTextCompetition(
      'Your business data could be stolen tomorrow',
      'Your data stolen tomorrow',
    );
    expect(result.hasConflict).toBe(true);
    expect(result.resolution).toBe('show_kinetic');
    expect(result.subtitleText).toBe('');
  });

  it('staggers display when texts are unrelated', () => {
    const result = preventTextCompetition(
      'Meanwhile in Washington DC',
      '$4.5 Million Lost',
    );
    expect(result.hasConflict).toBe(true);
    expect(result.resolution).toBe('stagger');
    expect(result.subtitleText).not.toBe('');
    expect(result.kineticText).not.toBe('');
  });

  it('trims whitespace from inputs', () => {
    const result = preventTextCompetition('  hello  ', '  ');
    expect(result.hasConflict).toBe(false);
    expect(result.subtitleText).toBe('hello');
  });
});

describe('generateHeadlineCard', () => {
  it('generates a reveal card with slam animation', () => {
    const card = generateHeadlineCard('They Got In', 'reveal');
    expect(card.type).toBe('reveal');
    expect(card.style.animation).toBe('slam');
    expect(card.style.fontSize).toBe('large');
    expect(card.style.alignment).toBe('center');
  });

  it('generates a statistic card with scale_in animation', () => {
    const card = generateHeadlineCard('$4.5 Billion Lost', 'statistic');
    expect(card.type).toBe('statistic');
    expect(card.style.animation).toBe('scale_in');
    expect(card.style.fontSize).toBe('xlarge');
  });

  it('generates a warning card with black font weight', () => {
    const card = generateHeadlineCard('Your Files Are Gone', 'warning');
    expect(card.style.fontWeight).toBe('black');
    expect(card.style.animation).toBe('slam');
  });

  it('generates a quote card with fade_up animation', () => {
    const card = generateHeadlineCard('We never saw it coming', 'quote');
    expect(card.style.animation).toBe('fade_up');
    expect(card.style.durationMs).toBe(3000);
  });

  it('truncates text longer than 8 words', () => {
    const card = generateHeadlineCard(
      'This is a very long headline that should be truncated to fit',
      'reveal',
    );
    const wordCount = card.text.replace('…', '').split(/\s+/).length;
    expect(wordCount).toBeLessThanOrEqual(8);
    expect(card.text).toContain('…');
  });

  it('does not truncate text with 8 or fewer words', () => {
    const card = generateHeadlineCard('Short headline here', 'reveal');
    expect(card.text).toBe('Short headline here');
    expect(card.text).not.toContain('…');
  });
});

describe('enforceInstantProcessing', () => {
  it('returns empty string for empty input', () => {
    expect(enforceInstantProcessing('')).toBe('');
    expect(enforceInstantProcessing('   ')).toBe('');
  });

  it('returns text unchanged if within limits', () => {
    expect(enforceInstantProcessing('Short text')).toBe('Short text');
  });

  it('truncates text with more than 7 words', () => {
    const result = enforceInstantProcessing(
      'This is a sentence with way too many words in it',
    );
    const wordCount = result.split(/\s+/).length;
    expect(wordCount).toBeLessThanOrEqual(7);
  });

  it('enforces 35 character limit', () => {
    const result = enforceInstantProcessing(
      'Superlongword anotherlongword morelongwords extralongword',
    );
    expect(result.length).toBeLessThanOrEqual(35);
  });

  it('handles text exactly at the boundary', () => {
    const sevenWords = 'one two three four five six seven';
    const result = enforceInstantProcessing(sevenWords);
    expect(result.split(/\s+/).length).toBeLessThanOrEqual(7);
  });
});

describe('extractKeyNouns', () => {
  it('returns empty array for empty text', () => {
    expect(extractKeyNouns('')).toEqual([]);
    expect(extractKeyNouns('   ')).toEqual([]);
  });

  it('filters out stop words', () => {
    const result = extractKeyNouns('the quick brown fox jumps over the lazy dog');
    // Should not include 'the', 'over'
    for (const word of result) {
      expect(['the', 'over', 'the'].includes(word.toLowerCase())).toBe(false);
    }
  });

  it('returns at most 3 key nouns', () => {
    const result = extractKeyNouns(
      'Ransomware attack compromised the entire corporate network infrastructure and payroll system',
    );
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it('prioritizes domain-specific impact terms', () => {
    const result = extractKeyNouns('The ransomware attack stole all business data');
    const lower = result.map((w) => w.toLowerCase());
    // Should include high-impact terms like ransomware, attack, business, data
    expect(
      lower.some((w) => ['ransomware', 'attack', 'business', 'data'].includes(w)),
    ).toBe(true);
  });

  it('prioritizes capitalized words (proper nouns)', () => {
    const result = extractKeyNouns('Microsoft reported a major breach in Azure systems');
    const hasCapitalized = result.some((w) => w[0] === w[0].toUpperCase());
    expect(hasCapitalized).toBe(true);
  });

  it('prioritizes words with numbers', () => {
    const result = extractKeyNouns('Over 500million accounts were compromised in 2023');
    // Should include the number-containing word
    const hasNumber = result.some((w) => /\d/.test(w));
    expect(hasNumber).toBe(true);
  });
});

describe('scoreMobileReadability', () => {
  it('returns perfect score for empty text', () => {
    const result = scoreMobileReadability('', 24);
    expect(result.score).toBe(100);
    expect(result.pass).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('passes for short text with adequate font size', () => {
    const result = scoreMobileReadability('Data Breach', 24);
    expect(result.pass).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(70);
  });

  it('penalizes small font sizes', () => {
    const result = scoreMobileReadability('Warning', 12);
    expect(result.score).toBeLessThan(100);
    expect(result.issues.some((i) => i.includes('too small'))).toBe(true);
  });

  it('penalizes very long text', () => {
    const longText = 'This is a very long text overlay that would be extremely difficult to read on a mobile device screen';
    const result = scoreMobileReadability(longText, 24);
    expect(result.score).toBeLessThan(70);
    expect(result.pass).toBe(false);
  });

  it('penalizes too many words', () => {
    const result = scoreMobileReadability(
      'one two three four five six seven eight nine ten eleven twelve',
      24,
    );
    expect(result.issues.some((i) => i.includes('words'))).toBe(true);
  });

  it('score is always between 0 and 100', () => {
    // Worst case: tiny font, very long text
    const result = scoreMobileReadability(
      'This is an extremely long piece of text that no one could possibly read on a tiny mobile screen at this font size ever',
      8,
    );
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('provides recommendations when issues found', () => {
    const result = scoreMobileReadability('Some text here for testing', 14);
    expect(result.recommendations.length).toBeGreaterThan(0);
  });
});
