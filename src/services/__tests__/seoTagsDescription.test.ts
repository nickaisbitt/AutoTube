/**
 * Unit tests for tag generation and video description generator
 *
 * Validates: Requirements 5.2, 5.3, 5.4, 5.5, 5.8
 */

import { describe, it, expect } from 'vitest';
import { sanitizeTag, generateTags, generateVideoDescription } from '../seoTitles';
import type { TopicContext, ScriptSegment } from '../../types';

// ---------------------------------------------------------------------------
// Helper: build a minimal TopicContext
// ---------------------------------------------------------------------------
function makeTopicContext(overrides: Partial<TopicContext> = {}): TopicContext {
  return {
    topic: 'The Rise of Nvidia',
    coreSubject: 'Nvidia',
    subjectCandidates: ['Nvidia'],
    kind: 'company',
    description: 'Nvidia is a leading GPU manufacturer.',
    extract: 'Nvidia Corporation designs GPUs for gaming and AI.',
    entities: ['Nvidia', 'Jensen Huang', 'CUDA', 'GeForce'],
    parseReasoning: 'Parsed from topic string.',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helper: build minimal ScriptSegments
// ---------------------------------------------------------------------------
function makeSegments(): ScriptSegment[] {
  return [
    {
      id: 'seg-1',
      type: 'intro',
      title: 'Introduction',
      narration: 'Nvidia has become the most valuable chip company in the world. Their GPUs power everything from gaming to AI.',
      visualNote: 'Show Nvidia HQ',
      duration: 25,
    },
    {
      id: 'seg-2',
      type: 'section',
      title: 'The GPU Revolution',
      narration: 'The GPU revolution started in the gaming industry but quickly expanded to data centers.',
      visualNote: 'Show GPU chips',
      duration: 30,
    },
    {
      id: 'seg-3',
      type: 'section',
      title: 'AI Dominance',
      narration: 'Nvidia controls over 80% of the AI training chip market.',
      visualNote: 'Show data center',
      duration: 35,
    },
    {
      id: 'seg-4',
      type: 'outro',
      title: 'Conclusion',
      narration: 'From gaming to AI, Nvidia has transformed the tech landscape. The question remains: can anyone catch up?',
      visualNote: 'Show Nvidia logo',
      duration: 20,
    },
  ];
}

// ---------------------------------------------------------------------------
// sanitizeTag
// ---------------------------------------------------------------------------

describe('sanitizeTag', () => {
  it('returns a valid tag when input is clean', () => {
    expect(sanitizeTag('Nvidia')).toBe('Nvidia');
  });

  it('trims whitespace', () => {
    expect(sanitizeTag('  Nvidia  ')).toBe('Nvidia');
  });

  it('removes invalid characters', () => {
    expect(sanitizeTag('Nvidia!@#$%')).toBe('Nvidia');
  });

  it('allows hyphens', () => {
    expect(sanitizeTag('AI-chips')).toBe('AI-chips');
  });

  it('allows spaces', () => {
    expect(sanitizeTag('big tech')).toBe('big tech');
  });

  it('returns null for tags shorter than 2 chars', () => {
    expect(sanitizeTag('a')).toBeNull();
  });

  it('returns null for tags longer than 30 chars', () => {
    expect(sanitizeTag('a'.repeat(31))).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(sanitizeTag('')).toBeNull();
  });

  it('returns null when only invalid chars remain', () => {
    expect(sanitizeTag('!@#')).toBeNull();
  });

  it('collapses multiple spaces', () => {
    expect(sanitizeTag('big   tech')).toBe('big tech');
  });

  it('accepts tags at exactly 2 chars', () => {
    expect(sanitizeTag('AI')).toBe('AI');
  });

  it('accepts tags at exactly 30 chars', () => {
    const tag = 'a'.repeat(30);
    expect(sanitizeTag(tag)).toBe(tag);
  });
});

// ---------------------------------------------------------------------------
// generateTags
// ---------------------------------------------------------------------------

describe('generateTags', () => {
  it('returns between 5 and 15 tags (Requirement 5.4)', () => {
    const ctx = makeTopicContext();
    const tags = generateTags(ctx, 'business_insider');
    expect(tags.length).toBeGreaterThanOrEqual(5);
    expect(tags.length).toBeLessThanOrEqual(15);
  });

  it('each tag is between 2 and 30 characters (Requirement 5.5)', () => {
    const ctx = makeTopicContext();
    const tags = generateTags(ctx, 'business_insider');
    for (const tag of tags) {
      expect(tag.length).toBeGreaterThanOrEqual(2);
      expect(tag.length).toBeLessThanOrEqual(30);
    }
  });

  it('each tag contains only alphanumeric, spaces, and hyphens (Requirement 5.5)', () => {
    const ctx = makeTopicContext();
    const tags = generateTags(ctx, 'business_insider');
    for (const tag of tags) {
      expect(tag).toMatch(/^[a-zA-Z0-9 -]+$/);
    }
  });

  it('includes the core subject as a tag', () => {
    const ctx = makeTopicContext();
    const tags = generateTags(ctx, 'business_insider');
    expect(tags.some(t => t.toLowerCase().includes('nvidia'))).toBe(true);
  });

  it('includes entities when available', () => {
    const ctx = makeTopicContext();
    const tags = generateTags(ctx, 'business_insider');
    expect(tags.some(t => t === 'Jensen Huang')).toBe(true);
  });

  it('generates tags from topic name and style keywords when entities are empty (Requirement 5.8)', () => {
    const ctx = makeTopicContext({ entities: [] });
    const tags = generateTags(ctx, 'business_insider');
    expect(tags.length).toBeGreaterThanOrEqual(5);
    // Should include style keywords
    expect(tags.some(t => ['business', 'finance', 'economy', 'market', 'industry'].includes(t))).toBe(true);
  });

  it('does not produce duplicate tags', () => {
    const ctx = makeTopicContext();
    const tags = generateTags(ctx, 'business_insider');
    const lowerTags = tags.map(t => t.toLowerCase());
    const unique = new Set(lowerTags);
    expect(unique.size).toBe(lowerTags.length);
  });

  it('works with different styles', () => {
    const ctx = makeTopicContext();
    const warTags = generateTags(ctx, 'warfront');
    expect(warTags.length).toBeGreaterThanOrEqual(5);
    expect(warTags.some(t => ['conflict', 'military', 'geopolitics', 'defense', 'strategy'].includes(t))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// generateVideoDescription
// ---------------------------------------------------------------------------

describe('generateVideoDescription', () => {
  it('returns an object with summary, chapters, tags, and fullDescription (Requirement 5.2)', () => {
    const segments = makeSegments();
    const ctx = makeTopicContext();
    const result = generateVideoDescription(segments, 'Nvidia', ctx, 'business_insider');

    expect(result).toHaveProperty('summary');
    expect(result).toHaveProperty('chapters');
    expect(result).toHaveProperty('tags');
    expect(result).toHaveProperty('fullDescription');
  });

  it('summary is derived from intro and conclusion segments', () => {
    const segments = makeSegments();
    const ctx = makeTopicContext();
    const result = generateVideoDescription(segments, 'Nvidia', ctx, 'business_insider');

    // Should contain content from intro
    expect(result.summary).toContain('Nvidia');
    // Should be non-empty
    expect(result.summary.length).toBeGreaterThan(0);
  });

  it('chapters contain YouTube chapter markers with timestamps (Requirement 5.3)', () => {
    const segments = makeSegments();
    const ctx = makeTopicContext();
    const result = generateVideoDescription(segments, 'Nvidia', ctx, 'business_insider');

    // First chapter should start at 00:00
    expect(result.chapters).toContain('00:00');
    // Should contain segment titles
    expect(result.chapters).toContain('Introduction');
    expect(result.chapters).toContain('The GPU Revolution');
  });

  it('chapters timestamps match cumulative segment durations', () => {
    const segments = makeSegments();
    const ctx = makeTopicContext();
    const result = generateVideoDescription(segments, 'Nvidia', ctx, 'business_insider');

    const lines = result.chapters.split('\n');
    // seg-1 starts at 0:00, seg-2 at 0:25, seg-3 at 0:55, seg-4 at 1:30
    expect(lines[0]).toMatch(/^00:00/);
    expect(lines[1]).toMatch(/^00:25/);
    expect(lines[2]).toMatch(/^00:55/);
    expect(lines[3]).toMatch(/^01:30/);
  });

  it('tags are from generateTags (Requirement 5.4)', () => {
    const segments = makeSegments();
    const ctx = makeTopicContext();
    const result = generateVideoDescription(segments, 'Nvidia', ctx, 'business_insider');

    expect(result.tags.length).toBeGreaterThanOrEqual(5);
    expect(result.tags.length).toBeLessThanOrEqual(15);
  });

  it('fullDescription combines summary, chapters, and tags', () => {
    const segments = makeSegments();
    const ctx = makeTopicContext();
    const result = generateVideoDescription(segments, 'Nvidia', ctx, 'business_insider');

    expect(result.fullDescription).toContain(result.summary);
    expect(result.fullDescription).toContain(result.chapters);
    expect(result.fullDescription).toContain('Tags:');
  });

  it('works with empty segments array', () => {
    const ctx = makeTopicContext();
    const result = generateVideoDescription([], 'Nvidia', ctx, 'business_insider');

    expect(result.summary).toContain('Nvidia');
    expect(result.chapters).toBe('');
    expect(result.tags.length).toBeGreaterThanOrEqual(5);
  });

  it('works with segments that have no intro or outro', () => {
    const segments: ScriptSegment[] = [
      {
        id: 'seg-1',
        type: 'section',
        title: 'Main Content',
        narration: 'This is the main content about Nvidia.',
        visualNote: 'Show content',
        duration: 60,
      },
    ];
    const ctx = makeTopicContext();
    const result = generateVideoDescription(segments, 'Nvidia', ctx, 'business_insider');

    expect(result.summary.length).toBeGreaterThan(0);
    expect(result.chapters).toContain('Main Content');
  });
});
