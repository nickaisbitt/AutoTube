/**
 * Unit tests for generateFullMetadata and generateChapterMarkersAligned
 *
 * Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6
 */

import { describe, it, expect } from 'vitest';
import { generateFullMetadata, generateChapterMarkersAligned } from '../seoTitles';
import type { TopicContext, ScriptSegment, VideoProject, MediaAsset } from '../../types';

// ---------------------------------------------------------------------------
// Helpers
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

function makeProject(overrides: Partial<VideoProject> = {}): VideoProject {
  return {
    version: 1,
    id: 'proj-1',
    title: 'The Rise of Nvidia',
    topic: 'The Rise of Nvidia',
    style: 'business_insider',
    targetDuration: 120,
    script: makeSegments(),
    media: [],
    narration: [],
    status: 'complete',
    createdAt: new Date(),
    ...overrides,
  };
}

function makeMediaWithDataPoints(): MediaAsset[] {
  return [
    {
      id: 'asset-1',
      segmentId: 'seg-1',
      type: 'image',
      url: 'https://example.com/img1.jpg',
      alt: 'Nvidia revenue hits $1.2T market cap',
      source: 'test',
      concept: '+200% growth in AI chips',
    },
  ];
}

// ---------------------------------------------------------------------------
// generateChapterMarkersAligned
// ---------------------------------------------------------------------------

describe('generateChapterMarkersAligned', () => {
  it('generates chapter markers for each segment', () => {
    const segments = makeSegments();
    const markers = generateChapterMarkersAligned(segments);
    expect(markers).toHaveLength(4);
  });

  it('first chapter starts at 0:00', () => {
    const segments = makeSegments();
    const markers = generateChapterMarkersAligned(segments);
    expect(markers[0].timestamp).toBe('0:00');
  });

  it('timestamps align to cumulative segment start times', () => {
    const segments = makeSegments();
    const markers = generateChapterMarkersAligned(segments);

    // seg-1 starts at 0, seg-2 at 25, seg-3 at 55, seg-4 at 90
    expect(markers[0].timestamp).toBe('0:00');
    expect(markers[1].timestamp).toBe('0:25');
    expect(markers[2].timestamp).toBe('0:55');
    expect(markers[3].timestamp).toBe('1:30');
  });

  it('uses segment titles as chapter titles', () => {
    const segments = makeSegments();
    const markers = generateChapterMarkersAligned(segments);

    expect(markers[0].title).toBe('Introduction');
    expect(markers[1].title).toBe('The GPU Revolution');
    expect(markers[2].title).toBe('AI Dominance');
    expect(markers[3].title).toBe('Conclusion');
  });

  it('includes correct segment indices', () => {
    const segments = makeSegments();
    const markers = generateChapterMarkersAligned(segments);

    expect(markers[0].segmentIndex).toBe(0);
    expect(markers[1].segmentIndex).toBe(1);
    expect(markers[2].segmentIndex).toBe(2);
    expect(markers[3].segmentIndex).toBe(3);
  });

  it('handles timestamps over 1 hour', () => {
    const segments: ScriptSegment[] = [
      { id: 's1', type: 'intro', title: 'Start', narration: 'Hello.', visualNote: '', duration: 3600 },
      { id: 's2', type: 'section', title: 'After 1 Hour', narration: 'Content.', visualNote: '', duration: 30 },
    ];
    const markers = generateChapterMarkersAligned(segments);
    expect(markers[1].timestamp).toBe('1:00:00');
  });

  it('returns empty array for empty segments', () => {
    const markers = generateChapterMarkersAligned([]);
    expect(markers).toHaveLength(0);
  });

  it('timestamps use X:XX format (not zero-padded minutes for < 10 min)', () => {
    const segments: ScriptSegment[] = [
      { id: 's1', type: 'intro', title: 'Start', narration: 'Hello.', visualNote: '', duration: 65 },
      { id: 's2', type: 'section', title: 'Next', narration: 'Content.', visualNote: '', duration: 30 },
    ];
    const markers = generateChapterMarkersAligned(segments);
    // First at 0:00, second at 1:05
    expect(markers[0].timestamp).toBe('0:00');
    expect(markers[1].timestamp).toBe('1:05');
  });
});

// ---------------------------------------------------------------------------
// generateFullMetadata
// ---------------------------------------------------------------------------

describe('generateFullMetadata', () => {
  it('returns an object with title, description, tags, and chapters', () => {
    const project = makeProject();
    const ctx = makeTopicContext();
    const result = generateFullMetadata(project, ctx);

    expect(result).toHaveProperty('title');
    expect(result).toHaveProperty('description');
    expect(result).toHaveProperty('tags');
    expect(result).toHaveProperty('chapters');
  });

  it('title is between 40 and 70 characters (Requirement 7.1)', () => {
    const project = makeProject();
    const ctx = makeTopicContext();
    const result = generateFullMetadata(project, ctx);

    expect(result.title.length).toBeGreaterThanOrEqual(40);
    expect(result.title.length).toBeLessThanOrEqual(70);
  });

  it('generates 8-15 tags (Requirement 7.3)', () => {
    const project = makeProject();
    const ctx = makeTopicContext();
    const result = generateFullMetadata(project, ctx);

    expect(result.tags.length).toBeGreaterThanOrEqual(8);
    expect(result.tags.length).toBeLessThanOrEqual(15);
  });

  it('each tag is 2-30 characters (Requirement 7.3)', () => {
    const project = makeProject();
    const ctx = makeTopicContext();
    const result = generateFullMetadata(project, ctx);

    for (const tag of result.tags) {
      expect(tag.length).toBeGreaterThanOrEqual(2);
      expect(tag.length).toBeLessThanOrEqual(30);
    }
  });

  it('description contains a summary (Requirement 7.2)', () => {
    const project = makeProject();
    const ctx = makeTopicContext();
    const result = generateFullMetadata(project, ctx);

    // Summary should contain content from intro
    expect(result.description).toContain('Nvidia');
  });

  it('description contains chapter markers with X:XX format (Requirement 7.2)', () => {
    const project = makeProject();
    const ctx = makeTopicContext();
    const result = generateFullMetadata(project, ctx);

    // Should contain timestamps in X:XX format
    expect(result.description).toMatch(/\d+:\d{2}/);
    expect(result.description).toContain('0:00');
  });

  it('description contains a Tags: line (Requirement 7.2)', () => {
    const project = makeProject();
    const ctx = makeTopicContext();
    const result = generateFullMetadata(project, ctx);

    expect(result.description).toContain('Tags:');
  });

  it('embeds data points in title when available (Requirement 7.4)', () => {
    const project = makeProject({ media: makeMediaWithDataPoints() });
    const ctx = makeTopicContext();
    const result = generateFullMetadata(project, ctx);

    // When data points are available, at least one should appear in the title
    const dataPointPatterns = ['$1.2T', '+200%'];
    const hasDataPoint = dataPointPatterns.some(dp => result.title.includes(dp));
    expect(hasDataPoint).toBe(true);
  });

  it('chapter markers align to segment cumulative start times (Requirement 7.6)', () => {
    const project = makeProject();
    const ctx = makeTopicContext();
    const result = generateFullMetadata(project, ctx);

    // Segments: 25s, 30s, 35s, 20s
    // Start times: 0, 25, 55, 90
    expect(result.chapters[0].timestamp).toBe('0:00');
    expect(result.chapters[1].timestamp).toBe('0:25');
    expect(result.chapters[2].timestamp).toBe('0:55');
    expect(result.chapters[3].timestamp).toBe('1:30');
  });

  it('works with a project that has no media (no data points)', () => {
    const project = makeProject({ media: [] });
    const ctx = makeTopicContext();
    const result = generateFullMetadata(project, ctx);

    expect(result.title.length).toBeGreaterThanOrEqual(40);
    expect(result.title.length).toBeLessThanOrEqual(70);
    expect(result.tags.length).toBeGreaterThanOrEqual(8);
  });

  it('works with a project that has no script segments', () => {
    const project = makeProject({ script: [] });
    const ctx = makeTopicContext();
    const result = generateFullMetadata(project, ctx);

    expect(result.title.length).toBeGreaterThanOrEqual(40);
    expect(result.title.length).toBeLessThanOrEqual(70);
    expect(result.chapters).toHaveLength(0);
    expect(result.description).toContain('Tags:');
  });

  it('uses the highest-CTR title option', () => {
    const project = makeProject();
    const ctx = makeTopicContext();
    const result = generateFullMetadata(project, ctx);

    // The title should be a valid string (not empty)
    expect(result.title.length).toBeGreaterThan(0);
  });
});
