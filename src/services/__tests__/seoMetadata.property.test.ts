/**
 * Property-Based Tests — SEO Metadata
 *
 * Feature: video-quality-max, Properties 14, 15, 16, 17, 18
 *
 * Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.6
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  generateTitleOptions,
  generateTags,
  generateVideoDescription,
  generateChapterMarkersAligned,
  generateFullMetadata,
} from '../seoTitles';
import type { TopicContext, ScriptSegment, VideoProject, MediaAsset } from '../../types';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Arbitrary for video styles */
const styleArb = fc.constantFrom('business_insider', 'warfront', 'documentary', 'explainer');

/** Arbitrary for topic strings that are short enough to produce titles in range */
const topicArb = fc.string({ minLength: 3, maxLength: 25 }).filter(
  (s) => s.trim().length >= 3 && /[a-zA-Z]/.test(s),
);

/** Arbitrary for data point strings (currency, percentages, years) */
const dataPointArb = fc.oneof(
  fc.nat({ max: 999 }).map((n) => `$${n}B`),
  fc.nat({ max: 999 }).map((n) => `$${n}M`),
  fc.nat({ max: 99 }).map((n) => `+${n}%`),
  fc.nat({ max: 99 }).map((n) => `${n}%`),
  fc.integer({ min: 2000, max: 2030 }).map((y) => `${y}`),
);

/** Arbitrary for non-empty data points arrays */
const dataPointsArb = fc.array(dataPointArb, { minLength: 1, maxLength: 5 });

/** Arbitrary for entity names */
const entityArb = fc.constantFrom(
  'Nvidia', 'Tesla', 'Apple', 'Google', 'Microsoft', 'Amazon',
  'Meta', 'OpenAI', 'SpaceX', 'Netflix',
);

/** Arbitrary for TopicContext */
const topicContextArb: fc.Arbitrary<TopicContext> = fc.record({
  topic: topicArb,
  coreSubject: fc.string({ minLength: 2, maxLength: 20 }).filter((s) => s.trim().length >= 2),
  subjectCandidates: fc.array(fc.string({ minLength: 2, maxLength: 20 }), { minLength: 1, maxLength: 3 }),
  kind: fc.constantFrom('company', 'person', 'technology', 'event', 'concept') as fc.Arbitrary<TopicContext['kind']>,
  description: fc.string({ minLength: 10, maxLength: 100 }),
  extract: fc.string({ minLength: 10, maxLength: 200 }),
  entities: fc.array(entityArb, { minLength: 1, maxLength: 6 }),
  parseReasoning: fc.constant('Parsed from topic string.'),
});

/** Arbitrary for segment types */
const segmentTypeArb = fc.constantFrom('intro', 'section', 'transition', 'outro') as fc.Arbitrary<ScriptSegment['type']>;

/** Arbitrary for a single ScriptSegment with positive duration */
const scriptSegmentArb: fc.Arbitrary<ScriptSegment> = fc.record({
  id: fc.uuid(),
  type: segmentTypeArb,
  title: fc.string({ minLength: 3, maxLength: 40 }).filter((s) => s.trim().length >= 3),
  narration: fc.string({ minLength: 20, maxLength: 200 }).filter((s) => s.trim().length >= 20),
  visualNote: fc.string({ minLength: 1, maxLength: 50 }),
  duration: fc.integer({ min: 5, max: 120 }),
});

/** Arbitrary for an array of segments with at least one intro and one outro */
const segmentsWithIntroOutroArb: fc.Arbitrary<ScriptSegment[]> = fc.tuple(
  fc.record({
    id: fc.uuid(),
    type: fc.constant('intro' as const),
    title: fc.constant('Introduction'),
    narration: fc.constantFrom(
      'This is the story of how everything changed. The world was never the same after this moment.',
      'Something incredible happened last year. Nobody saw it coming but the impact was massive.',
      'The numbers tell a shocking story. Over fifty percent of companies failed within months.',
    ),
    visualNote: fc.constant('Opening shot'),
    duration: fc.integer({ min: 10, max: 30 }),
  }),
  fc.array(
    fc.record({
      id: fc.uuid(),
      type: fc.constant('section' as const),
      title: fc.string({ minLength: 3, maxLength: 30 }).filter((s) => s.trim().length >= 3),
      narration: fc.string({ minLength: 20, maxLength: 150 }),
      visualNote: fc.string({ minLength: 1, maxLength: 50 }),
      duration: fc.integer({ min: 10, max: 60 }),
    }),
    { minLength: 1, maxLength: 5 },
  ),
  fc.record({
    id: fc.uuid(),
    type: fc.constant('outro' as const),
    title: fc.constant('Conclusion'),
    narration: fc.constantFrom(
      'And that is how the story ends. The future remains uncertain.',
      'The implications are clear. We must act now before it is too late.',
      'From start to finish this journey has been remarkable. What comes next is up to us.',
    ),
    visualNote: fc.constant('Closing shot'),
    duration: fc.integer({ min: 10, max: 25 }),
  }),
).map(([intro, sections, outro]) => [intro, ...sections, outro]);

/** Arbitrary for a VideoProject */
const videoProjectArb: fc.Arbitrary<VideoProject> = fc.tuple(
  segmentsWithIntroOutroArb,
  styleArb,
  topicArb,
).map(([segments, style, topic]) => ({
  version: 1,
  id: 'proj-test',
  title: topic,
  topic,
  style: style as VideoProject['style'],
  targetDuration: 120,
  script: segments,
  media: [],
  narration: [],
  status: 'complete' as const,
  createdAt: new Date(),
}));

/** Arbitrary for a VideoProject with media containing data points */
const videoProjectWithDataPointsArb: fc.Arbitrary<VideoProject> = fc.tuple(
  segmentsWithIntroOutroArb,
  styleArb,
  topicArb,
  dataPointsArb,
).map(([segments, style, topic, dataPoints]) => {
  const media: MediaAsset[] = dataPoints.map((dp, i) => ({
    id: `asset-${i}`,
    segmentId: segments[0].id,
    type: 'image' as const,
    url: `https://example.com/img${i}.jpg`,
    alt: `Image showing ${dp} growth`,
    source: 'test',
    concept: `Data shows ${dp} increase`,
  }));
  return {
    version: 1,
    id: 'proj-test',
    title: topic,
    topic,
    style: style as VideoProject['style'],
    targetDuration: 120,
    script: segments,
    media,
    narration: [],
    status: 'complete' as const,
    createdAt: new Date(),
  };
});

// ---------------------------------------------------------------------------
// Property 14: Title Length Enforcement
// ---------------------------------------------------------------------------

describe('Feature: video-quality-max, Property 14: Title Length Enforcement', () => {
  /**
   * **Validates: Requirements 7.1**
   *
   * For any topic string, all titles produced by `generateTitleOptions` SHALL
   * have a length between 40 and 70 characters inclusive.
   */

  it('all titles from generateTitleOptions are 40–70 characters (no data points)', () => {
    fc.assert(
      fc.property(topicArb, styleArb, (topic, style) => {
        const titles = generateTitleOptions(topic, style, []);

        expect(titles.length).toBeGreaterThan(0);
        for (const option of titles) {
          expect(option.title.length).toBeGreaterThanOrEqual(40);
          expect(option.title.length).toBeLessThanOrEqual(70);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('all titles from generateTitleOptions are 40–70 characters (with data points)', () => {
    fc.assert(
      fc.property(topicArb, styleArb, dataPointsArb, (topic, style, dataPoints) => {
        const titles = generateTitleOptions(topic, style, dataPoints);

        expect(titles.length).toBeGreaterThan(0);
        for (const option of titles) {
          expect(option.title.length).toBeGreaterThanOrEqual(40);
          expect(option.title.length).toBeLessThanOrEqual(70);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('generateFullMetadata title is 40–70 characters', () => {
    fc.assert(
      fc.property(videoProjectArb, topicContextArb, (project, ctx) => {
        const metadata = generateFullMetadata(project, ctx);

        expect(metadata.title.length).toBeGreaterThanOrEqual(40);
        expect(metadata.title.length).toBeLessThanOrEqual(70);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 15: Description Structure Completeness
// ---------------------------------------------------------------------------

describe('Feature: video-quality-max, Property 15: Description Structure Completeness', () => {
  /**
   * **Validates: Requirements 7.2**
   *
   * For any valid project with at least one segment, `generateVideoDescription`
   * SHALL produce a fullDescription containing: (a) a non-empty summary,
   * (b) chapter markers with timestamp format "X:XX", and (c) a "Tags:" line
   * with comma-separated values.
   */

  it('description contains summary, chapter markers with X:XX format, and Tags: line', () => {
    fc.assert(
      fc.property(
        segmentsWithIntroOutroArb,
        topicArb,
        topicContextArb,
        styleArb,
        (segments, topic, ctx, style) => {
          const result = generateVideoDescription(segments, topic, ctx, style);

          // (a) Non-empty summary
          expect(result.summary.length).toBeGreaterThan(0);

          // (b) Chapter markers with X:XX format in fullDescription
          expect(result.fullDescription).toMatch(/\d+:\d{2}/);

          // (c) Tags: line with comma-separated values
          expect(result.fullDescription).toContain('Tags:');
          const tagsLine = result.fullDescription.split('Tags:')[1];
          expect(tagsLine).toBeDefined();
          expect(tagsLine!.trim().length).toBeGreaterThan(0);
          // Should contain at least one comma (multiple tags)
          expect(tagsLine).toContain(',');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('generateFullMetadata description has the same structure', () => {
    fc.assert(
      fc.property(videoProjectArb, topicContextArb, (project, ctx) => {
        const metadata = generateFullMetadata(project, ctx);

        // Contains timestamp format X:XX
        expect(metadata.description).toMatch(/\d+:\d{2}/);

        // Contains Tags: line
        expect(metadata.description).toContain('Tags:');

        // Description is non-empty
        expect(metadata.description.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 16: Tag Count and Length Constraints
// ---------------------------------------------------------------------------

describe('Feature: video-quality-max, Property 16: Tag Count and Length Constraints', () => {
  /**
   * **Validates: Requirements 7.3**
   *
   * For any valid TopicContext and style, `generateTags` SHALL return between
   * 8 and 15 tags where each tag has a length between 2 and 30 characters.
   */

  it('generateTags returns 8–15 tags, each 2–30 characters', () => {
    fc.assert(
      fc.property(topicContextArb, styleArb, (ctx, style) => {
        const tags = generateTags(ctx, style);

        // Count constraint: 8–15
        expect(tags.length).toBeGreaterThanOrEqual(8);
        expect(tags.length).toBeLessThanOrEqual(15);

        // Length constraint: each tag 2–30 characters
        for (const tag of tags) {
          expect(tag.length).toBeGreaterThanOrEqual(2);
          expect(tag.length).toBeLessThanOrEqual(30);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('generateFullMetadata tags satisfy count and length constraints', () => {
    fc.assert(
      fc.property(videoProjectArb, topicContextArb, (project, ctx) => {
        const metadata = generateFullMetadata(project, ctx);

        expect(metadata.tags.length).toBeGreaterThanOrEqual(8);
        expect(metadata.tags.length).toBeLessThanOrEqual(15);

        for (const tag of metadata.tags) {
          expect(tag.length).toBeGreaterThanOrEqual(2);
          expect(tag.length).toBeLessThanOrEqual(30);
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 17: Data Point Embedding in Titles
// ---------------------------------------------------------------------------

describe('Feature: video-quality-max, Property 17: Data Point Embedding in Titles', () => {
  /**
   * **Validates: Requirements 7.4**
   *
   * For any non-empty dataPoints array, `generateTitleOptions` SHALL produce
   * at least one title that contains at least one of the provided data point
   * strings as a substring.
   */

  it('at least one title contains a data point when dataPoints is non-empty', () => {
    fc.assert(
      fc.property(topicArb, styleArb, dataPointsArb, (topic, style, dataPoints) => {
        const titles = generateTitleOptions(topic, style, dataPoints);

        // At least one title must contain at least one data point
        const hasDataPointTitle = titles.some((option) =>
          dataPoints.some((dp) => option.title.includes(dp)),
        );
        expect(hasDataPointTitle).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('generateFullMetadata embeds data point in title when media has data points', () => {
    fc.assert(
      fc.property(videoProjectWithDataPointsArb, topicContextArb, (project, ctx) => {
        const metadata = generateFullMetadata(project, ctx);

        // Extract data points the same way the function does
        const dataPointPatterns = [
          /\$[\d.]+[TBM]/g,
          /[+-]?\d+(?:\.\d+)?%/g,
          /\b(?:19|20)\d{2}\b/g,
        ];

        const allDataPoints: string[] = [];
        for (const asset of project.media) {
          const text = `${asset.alt ?? ''} ${asset.concept ?? ''}`;
          for (const pattern of dataPointPatterns) {
            const matches = text.match(pattern) ?? [];
            allDataPoints.push(...matches);
          }
        }

        // If data points were extracted, at least one should appear in the title
        if (allDataPoints.length > 0) {
          const titleContainsDataPoint = allDataPoints.some((dp) =>
            metadata.title.includes(dp),
          );
          expect(titleContainsDataPoint).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 18: Chapter Marker Timing Alignment
// ---------------------------------------------------------------------------

describe('Feature: video-quality-max, Property 18: Chapter Marker Timing Alignment', () => {
  /**
   * **Validates: Requirements 7.6**
   *
   * For any array of segments with positive durations, the generated chapter
   * markers SHALL have timestamps that correspond to the cumulative start time
   * of each segment (within ±1 second tolerance for rounding).
   */

  /** Parse a timestamp string like "M:SS" or "H:MM:SS" back to seconds */
  function parseTimestamp(ts: string): number {
    const parts = ts.split(':').map(Number);
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return parts[0] * 60 + parts[1];
  }

  it('chapter marker timestamps match cumulative segment start times (±1s)', () => {
    const segmentsArb = fc.array(scriptSegmentArb, { minLength: 1, maxLength: 10 });

    fc.assert(
      fc.property(segmentsArb, (segments) => {
        const markers = generateChapterMarkersAligned(segments);

        expect(markers.length).toBe(segments.length);

        let cumulativeTime = 0;
        for (let i = 0; i < segments.length; i++) {
          const markerSeconds = parseTimestamp(markers[i].timestamp);
          // Within ±1 second tolerance
          expect(Math.abs(markerSeconds - cumulativeTime)).toBeLessThanOrEqual(1);
          // Segment index matches
          expect(markers[i].segmentIndex).toBe(i);
          cumulativeTime += segments[i].duration;
        }
      }),
      { numRuns: 100 },
    );
  });

  it('first chapter always starts at 0:00', () => {
    const segmentsArb = fc.array(scriptSegmentArb, { minLength: 1, maxLength: 8 });

    fc.assert(
      fc.property(segmentsArb, (segments) => {
        const markers = generateChapterMarkersAligned(segments);

        expect(markers[0].timestamp).toBe('0:00');
      }),
      { numRuns: 100 },
    );
  });

  it('chapter titles match segment titles', () => {
    const segmentsArb = fc.array(scriptSegmentArb, { minLength: 1, maxLength: 8 });

    fc.assert(
      fc.property(segmentsArb, (segments) => {
        const markers = generateChapterMarkersAligned(segments);

        for (let i = 0; i < segments.length; i++) {
          expect(markers[i].title).toBe(segments[i].title);
        }
      }),
      { numRuns: 100 },
    );
  });
});
