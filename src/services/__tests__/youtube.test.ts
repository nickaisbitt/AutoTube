import { describe, it, expect } from 'vitest';
import { generateYouTubeMetadata } from '../youtube';
import type { ScriptSegment, VideoProject, MediaAsset } from '../../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSegment(overrides: Partial<ScriptSegment> = {}): ScriptSegment {
  return {
    id: 'seg-1',
    type: 'section',
    title: 'Introduction',
    narration: 'This is the narration text for the segment.',
    visualNote: '',
    duration: 30,
    ...overrides,
  };
}

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

function makeProject(overrides: Partial<VideoProject> = {}): VideoProject {
  return {
    id: 'proj-1',
    title: 'Test Video',
    topic: 'The Rise of Nvidia',
    style: 'business_insider',
    targetDuration: 60,
    script: [
      makeSegment({ id: 'seg-1', title: 'Introduction', narration: 'Nvidia has grown dramatically.' }),
      makeSegment({ id: 'seg-2', title: 'The GPU Revolution', narration: 'GPUs changed everything.' }),
      makeSegment({ id: 'seg-3', title: 'Conclusion', narration: 'The future looks bright.' }),
    ],
    media: [],
    narration: [],
    status: 'complete',
    createdAt: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Requirement 6.1 — Description starts with first segment narration (≤ 300 chars)
// ---------------------------------------------------------------------------

describe('generateYouTubeMetadata — description hook paragraph', () => {
  it('description starts with the first segment narration text', () => {
    const script = [
      makeSegment({ narration: 'Nvidia has grown dramatically over the past decade.' }),
      makeSegment({ id: 'seg-2', title: 'Chapter 2', narration: 'Second segment narration.' }),
    ];
    const result = generateYouTubeMetadata('Test Title', 'Nvidia', script);
    expect(result.description.startsWith('Nvidia has grown dramatically over the past decade.')).toBe(true);
  });

  it('truncates the hook to 300 characters when narration is longer', () => {
    const longNarration = 'A'.repeat(400);
    const script = [makeSegment({ narration: longNarration })];
    const result = generateYouTubeMetadata('Test Title', 'Nvidia', script);
    // The description should start with the first 300 chars of the narration
    expect(result.description.startsWith('A'.repeat(300))).toBe(true);
    // The hook portion should not exceed 300 chars (check the first paragraph)
    const firstParagraph = result.description.split('\n\n')[0];
    expect(firstParagraph.length).toBeLessThanOrEqual(300);
  });

  it('uses the full narration when it is exactly 300 characters', () => {
    const exactNarration = 'B'.repeat(300);
    const script = [makeSegment({ narration: exactNarration })];
    const result = generateYouTubeMetadata('Test Title', 'Nvidia', script);
    expect(result.description.startsWith(exactNarration)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Requirement 6.2 — "What you'll learn:" section with one bullet per segment
// ---------------------------------------------------------------------------

describe('generateYouTubeMetadata — "What you\'ll learn:" section', () => {
  it('contains a "What you\'ll learn:" section', () => {
    const script = [
      makeSegment({ id: 'seg-1', title: 'Introduction' }),
      makeSegment({ id: 'seg-2', title: 'The GPU Revolution' }),
    ];
    const result = generateYouTubeMetadata('Test Title', 'Nvidia', script);
    expect(result.description).toContain("What you'll learn:");
  });

  it('has one bullet per segment title', () => {
    const script = [
      makeSegment({ id: 'seg-1', title: 'Introduction' }),
      makeSegment({ id: 'seg-2', title: 'The GPU Revolution' }),
      makeSegment({ id: 'seg-3', title: 'Conclusion' }),
    ];
    const result = generateYouTubeMetadata('Test Title', 'Nvidia', script);
    expect(result.description).toContain('• Introduction');
    expect(result.description).toContain('• The GPU Revolution');
    expect(result.description).toContain('• Conclusion');
  });

  it('uses the • character as the bullet marker', () => {
    const script = [makeSegment({ title: 'My Segment' })];
    const result = generateYouTubeMetadata('Test Title', 'Nvidia', script);
    expect(result.description).toContain('• My Segment');
  });
});

// ---------------------------------------------------------------------------
// Requirement 6.3 / 8.2 / 8.3 — "Key Numbers:" section present/absent
// ---------------------------------------------------------------------------

describe('generateYouTubeMetadata — "Key Numbers:" section', () => {
  it('includes "Key Numbers:" when media assets contain numeric data points', () => {
    const project = makeProject({
      media: [
        makeAsset('Nvidia revenue reached $40B in 2024'),
        makeAsset('+200% growth year over year'),
      ],
    });
    const result = generateYouTubeMetadata(project.title, project.topic, project.script, project);
    expect(result.description).toContain('Key Numbers:');
  });

  it('lists each data point on its own line in the "Key Numbers:" section', () => {
    const project = makeProject({
      media: [
        makeAsset('$40B revenue'),
        makeAsset('+200% growth'),
      ],
    });
    const result = generateYouTubeMetadata(project.title, project.topic, project.script, project);
    const keyNumbersIndex = result.description.indexOf('Key Numbers:');
    expect(keyNumbersIndex).toBeGreaterThan(-1);
    const afterKeyNumbers = result.description.substring(keyNumbersIndex);
    expect(afterKeyNumbers).toContain('$40B');
    expect(afterKeyNumbers).toContain('+200%');
  });

  it('omits "Key Numbers:" entirely when media has no numeric data points', () => {
    const project = makeProject({
      media: [makeAsset('A generic image of a building')],
    });
    const result = generateYouTubeMetadata(project.title, project.topic, project.script, project);
    expect(result.description).not.toContain('Key Numbers:');
  });

  it('omits "Key Numbers:" when project has no media assets', () => {
    const project = makeProject({ media: [] });
    const result = generateYouTubeMetadata(project.title, project.topic, project.script, project);
    expect(result.description).not.toContain('Key Numbers:');
  });

  it('"Key Numbers:" appears after "What you\'ll learn:" and before "Chapters:"', () => {
    const project = makeProject({
      media: [makeAsset('$1.2T market cap')],
    });
    const result = generateYouTubeMetadata(project.title, project.topic, project.script, project);
    const learnIdx = result.description.indexOf("What you'll learn:");
    const keyNumIdx = result.description.indexOf('Key Numbers:');
    const chaptersIdx = result.description.indexOf('Chapters:');
    expect(learnIdx).toBeGreaterThan(-1);
    expect(keyNumIdx).toBeGreaterThan(learnIdx);
    expect(chaptersIdx).toBeGreaterThan(keyNumIdx);
  });
});

// ---------------------------------------------------------------------------
// Requirement 6.6 — Description ≤ 5000 characters
// ---------------------------------------------------------------------------

describe('generateYouTubeMetadata — description length limit', () => {
  it('description is ≤ 5000 characters for a normal project', () => {
    const project = makeProject();
    const result = generateYouTubeMetadata(project.title, project.topic, project.script, project);
    expect(result.description.length).toBeLessThanOrEqual(5000);
  });

  it('description is ≤ 5000 characters even with very long narration texts', () => {
    const longNarration = 'This is a very long narration sentence. '.repeat(200);
    const script = Array.from({ length: 20 }, (_, i) =>
      makeSegment({ id: `seg-${i}`, title: `Segment ${i}`, narration: longNarration }),
    );
    const result = generateYouTubeMetadata('Long Video', 'Artificial Intelligence', script);
    expect(result.description.length).toBeLessThanOrEqual(5000);
  });
});

// ---------------------------------------------------------------------------
// Requirement 23.2 — Three-parameter call (no project) produces valid output
// ---------------------------------------------------------------------------

describe('generateYouTubeMetadata — backward-compatible three-parameter call', () => {
  it('does not throw when called without the project parameter', () => {
    const script = [makeSegment()];
    expect(() => generateYouTubeMetadata('My Title', 'Nvidia', script)).not.toThrow();
  });

  it('returns a valid YouTubeUploadConfig with title, description, and tags', () => {
    const script = [makeSegment({ title: 'Intro', narration: 'Welcome to the video.' })];
    const result = generateYouTubeMetadata('My Title', 'Nvidia', script);
    expect(result).toHaveProperty('title');
    expect(result).toHaveProperty('description');
    expect(result).toHaveProperty('tags');
    expect(typeof result.title).toBe('string');
    expect(typeof result.description).toBe('string');
    expect(Array.isArray(result.tags)).toBe(true);
  });

  it('description still contains "What you\'ll learn:" without project', () => {
    const script = [
      makeSegment({ id: 'seg-1', title: 'Introduction' }),
      makeSegment({ id: 'seg-2', title: 'Main Content' }),
    ];
    const result = generateYouTubeMetadata('My Title', 'Nvidia', script);
    expect(result.description).toContain("What you'll learn:");
    expect(result.description).toContain('• Introduction');
    expect(result.description).toContain('• Main Content');
  });

  it('does not include "Key Numbers:" when called without project', () => {
    const script = [makeSegment()];
    const result = generateYouTubeMetadata('My Title', 'Nvidia', script);
    expect(result.description).not.toContain('Key Numbers:');
  });
});

// ---------------------------------------------------------------------------
// Requirement 7.5 / 7.6 — Tags are deduplicated and capped at 15
// ---------------------------------------------------------------------------

describe('generateYouTubeMetadata — tag deduplication and cap', () => {
  it('returns no more than 15 tags', () => {
    // Use a topic with many words to generate many potential tags
    const topic = 'Artificial Intelligence Machine Learning Deep Neural Networks Technology';
    const script = [makeSegment()];
    const result = generateYouTubeMetadata('Test', topic, script);
    expect(result.tags.length).toBeLessThanOrEqual(15);
  });

  it('tags are deduplicated (no two tags are the same case-insensitively)', () => {
    const script = [makeSegment()];
    const result = generateYouTubeMetadata('Test', 'Nvidia', script);
    const lowerTags = result.tags.map(t => t.toLowerCase());
    const uniqueLower = new Set(lowerTags);
    expect(uniqueLower.size).toBe(result.tags.length);
  });

  it('tags array is non-empty', () => {
    const script = [makeSegment()];
    const result = generateYouTubeMetadata('Test', 'Nvidia', script);
    expect(result.tags.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Requirement 7.7 — Topics with < 2 long words produce ≥ 5 tags
// ---------------------------------------------------------------------------

describe('generateYouTubeMetadata — tag supplementation for short topics', () => {
  it('produces ≥ 5 tags when topic has no words longer than 3 characters', () => {
    // All words are ≤ 3 chars → 0 base words → supplement with generic tags
    const script = [makeSegment()];
    const result = generateYouTubeMetadata('Test', 'AI', script);
    expect(result.tags.length).toBeGreaterThanOrEqual(5);
  });

  it('produces ≥ 5 tags when topic has exactly one word longer than 3 characters', () => {
    // "War" is 3 chars (not > 3), "Nvidia" is > 3 → 1 base word → supplement
    const script = [makeSegment()];
    const result = generateYouTubeMetadata('Test', 'Nvidia War', script);
    expect(result.tags.length).toBeGreaterThanOrEqual(5);
  });

  it('includes generic supplemental tags like "documentary" or "explained" for short topics', () => {
    const script = [makeSegment()];
    const result = generateYouTubeMetadata('Test', 'AI', script);
    const lowerTags = result.tags.map(t => t.toLowerCase());
    const hasGeneric =
      lowerTags.includes('documentary') ||
      lowerTags.includes('explained') ||
      lowerTags.includes('ai generated');
    expect(hasGeneric).toBe(true);
  });
});
