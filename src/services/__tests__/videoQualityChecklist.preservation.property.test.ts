/**
 * Preservation Property Tests — Video Quality Checklist
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10**
 *
 * Property 2: Preservation — Existing Pipeline Functionality Unchanged
 *
 * These tests verify that existing pipeline functions continue to produce
 * correct results on the UNFIXED code. They establish the baseline behavior
 * that must be preserved throughout the fix implementation.
 *
 * EXPECTED OUTCOME: Tests PASS (confirms baseline behavior to preserve)
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { scoreCandidate, type MediaCandidate } from '../media';
import { buildStoryboard, type StoryboardQualityLabel } from '../storyboard';
import { parseQualityResponse } from '../qualityScorer';
import { generateTitleOptions } from '../seoTitles';
import { validateVisualPlan } from '../llmVisualDirector';
import type { TopicContext, VideoProject, ScriptSegment } from '../../types';

// ---------------------------------------------------------------------------
// Arbitraries — generate valid pipeline inputs
// ---------------------------------------------------------------------------

/** Arbitrary for valid video topics */
const topicArb = fc.oneof(
  fc.constant('The Rise of Nvidia'),
  fc.constant('How AI is Changing Healthcare'),
  fc.constant('The Future of Electric Vehicles'),
  fc.constant('Why Remote Work is Here to Stay'),
  fc.constant('The Dark Side of Social Media'),
  fc.constant('Bitcoin and the Future of Money'),
  fc.constant('The Global Chip Shortage Explained'),
  fc.constant('SpaceX and the Race to Mars'),
);

/** Arbitrary for valid video styles */
const styleArb = fc.constantFrom(
  'business_insider',
  'warfront',
  'documentary',
  'explainer',
);

/** Arbitrary for a valid TopicContext */
const topicContextArb = fc.record({
  topic: topicArb,
  coreSubject: fc.oneof(
    fc.constant('Nvidia'),
    fc.constant('AI Healthcare'),
    fc.constant('Electric Vehicles'),
    fc.constant('Remote Work'),
    fc.constant('Social Media'),
  ),
  subjectCandidates: fc.constant(['Nvidia', 'AI']),
  kind: fc.constantFrom('company', 'technology', 'concept') as fc.Arbitrary<TopicContext['kind']>,
  description: fc.constant('A deep dive into the topic'),
  entities: fc.array(fc.constant('entity'), { minLength: 0, maxLength: 3 }),
  parseReasoning: fc.constant('generated for test'),
}) as fc.Arbitrary<TopicContext>;

/** Arbitrary for a valid MediaCandidate with realistic properties */
const mediaCandidateArb = fc.record({
  url: fc.constantFrom(
    'https://example.com/image1.jpg',
    'https://upload.wikimedia.org/test.png',
    'https://images.unsplash.com/photo.jpg',
  ),
  alt: fc.stringMatching(/^[a-z ]{5,40}$/),
  source: fc.constantFrom(
    'DuckDuckGo · example.com',
    'Wikimedia Commons',
    'Unsplash',
    'Picsum Photos',
  ),
  sourceUrl: fc.constantFrom(
    'https://example.com/article',
    'https://commons.wikimedia.org/wiki/File:test.png',
    'https://unsplash.com/photos/abc',
  ),
  width: fc.integer({ min: 640, max: 3840 }),
  height: fc.integer({ min: 480, max: 2160 }),
  baseScore: fc.integer({ min: 50, max: 200 }),
  query: fc.stringMatching(/^[a-z]{3,8}( [a-z]{3,8}){1,3}$/),
  finalScore: fc.constant(0),
  type: fc.constant('image' as const),
}).map((rec) => rec as MediaCandidate);

/** Arbitrary for sourceType config */
const sourceTypeArb = fc.constantFrom('stock' as const, 'raw' as const);

/** Arbitrary for a valid ScriptSegment */
const scriptSegmentArb = fc.record({
  id: fc.uuid(),
  type: fc.constantFrom('intro', 'section', 'transition', 'outro') as fc.Arbitrary<ScriptSegment['type']>,
  title: fc.stringMatching(/^[A-Z][a-z]+ [A-Z][a-z]+$/),
  narration: fc.stringMatching(/^[A-Za-z .,!?]{20,100}$/),
  visualNote: fc.constant('Documentary style footage'),
  duration: fc.integer({ min: 5, max: 30 }),
}) as fc.Arbitrary<ScriptSegment>;

/** Arbitrary for quality response (raw JSON-like object) */
const qualityResponseObjectArb = fc.record({
  sharpness: fc.oneof(fc.integer({ min: 0, max: 10 }), fc.double({ min: -5, max: 15 })),
  lighting: fc.oneof(fc.integer({ min: 0, max: 10 }), fc.double({ min: -5, max: 15 })),
  composition: fc.oneof(fc.integer({ min: 0, max: 10 }), fc.double({ min: -5, max: 15 })),
  vibrancy: fc.oneof(fc.integer({ min: 0, max: 10 }), fc.double({ min: -5, max: 15 })),
  relevance: fc.oneof(fc.integer({ min: 0, max: 10 }), fc.double({ min: -5, max: 15 })),
});

/** Arbitrary for quality response as a JSON string (simulating LLM output) */
const qualityResponseStringArb = qualityResponseObjectArb.map((obj) => JSON.stringify(obj));

/** Arbitrary for quality response with markdown fences */
const qualityResponseFencedArb = qualityResponseObjectArb.map(
  (obj) => '```json\n' + JSON.stringify(obj) + '\n```',
);

/** Arbitrary for visual plan raw input (simulating LLM JSON output) */
const visualPlanRawArb = fc.record({
  intent: fc.oneof(fc.constant('Show the impact of technology'), fc.stringMatching(/^[A-Za-z ]{10,50}$/)),
  primaryShot: fc.record({
    concept: fc.oneof(fc.constant('Close-up of server rack'), fc.stringMatching(/^[A-Za-z ]{5,30}$/)),
    queries: fc.array(fc.stringMatching(/^[a-z ]{5,20}$/), { minLength: 1, maxLength: 3 }),
    vibe: fc.constantFrom('dramatic', 'documentary', 'urgent', 'calm'),
  }),
  secondaryShot: fc.record({
    concept: fc.oneof(fc.constant('Wide shot of data center'), fc.stringMatching(/^[A-Za-z ]{5,30}$/)),
    queries: fc.array(fc.stringMatching(/^[a-z ]{5,20}$/), { minLength: 1, maxLength: 3 }),
    vibe: fc.constantFrom('dramatic', 'documentary', 'urgent', 'calm'),
  }),
  visualConcept: fc.constantFrom('High-quality documentary style', 'Urgent news footage', 'Cinematic wide shots'),
});

// ---------------------------------------------------------------------------
// Property Tests — Preservation
// ---------------------------------------------------------------------------

describe('Property 2: Preservation — Existing Pipeline Functionality Unchanged', () => {
  /**
   * Preservation Requirement 3.5: scoreCandidate returns numeric scores
   * with keyword/resolution/source factors on unfixed code.
   *
   * For all valid media candidates, scoreCandidate returns deterministic
   * scores based on same inputs.
   */
  describe('scoreCandidate: Consistent numeric results for valid inputs', () => {
    it('returns a finite number for any valid candidate and topic context', () => {
      fc.assert(
        fc.property(
          mediaCandidateArb,
          topicContextArb,
          sourceTypeArb,
          (candidate, topicContext, sourceType) => {
            const score = scoreCandidate(candidate, topicContext, undefined, sourceType);

            // Score must be a finite number
            expect(typeof score).toBe('number');
            expect(Number.isFinite(score)).toBe(true);
            expect(Number.isNaN(score)).toBe(false);
          },
        ),
        { numRuns: 200 },
      );
    });

    it('produces deterministic scores for identical inputs', () => {
      fc.assert(
        fc.property(
          mediaCandidateArb,
          topicContextArb,
          fc.constantFrom(undefined, 'dramatic footage', 'close-up portrait'),
          sourceTypeArb,
          (candidate, topicContext, visualConcept, sourceType) => {
            const score1 = scoreCandidate(candidate, topicContext, visualConcept, sourceType);
            const score2 = scoreCandidate(candidate, topicContext, visualConcept, sourceType);

            // Same inputs must produce same output (deterministic)
            expect(score1).toBe(score2);
          },
        ),
        { numRuns: 200 },
      );
    });

    it('applies keyword relevance bonus when query words match alt text', () => {
      fc.assert(
        fc.property(
          topicContextArb,
          sourceTypeArb,
          (topicContext, sourceType) => {
            // Create a candidate where alt text contains the query words
            const matchingCandidate: MediaCandidate = {
              url: 'https://example.com/test.jpg',
              alt: 'nvidia graphics card technology',
              source: 'DuckDuckGo · example.com',
              sourceUrl: 'https://example.com/article',
              width: 1920,
              height: 1080,
              baseScore: 100,
              query: 'nvidia graphics card',
              finalScore: 0,
              type: 'image',
            };

            // Create a candidate where alt text does NOT contain query words
            const nonMatchingCandidate: MediaCandidate = {
              url: 'https://example.com/test2.jpg',
              alt: 'sunset over ocean waves',
              source: 'DuckDuckGo · example.com',
              sourceUrl: 'https://example.com/article2',
              width: 1920,
              height: 1080,
              baseScore: 100,
              query: 'nvidia graphics card',
              finalScore: 0,
              type: 'image',
            };

            const matchScore = scoreCandidate(matchingCandidate, topicContext, undefined, sourceType);
            const nonMatchScore = scoreCandidate(nonMatchingCandidate, topicContext, undefined, sourceType);

            // Keyword matching should produce a higher score
            expect(matchScore).toBeGreaterThan(nonMatchScore);
          },
        ),
        { numRuns: 50 },
      );
    });

    it('applies resolution bonus for higher resolution images', () => {
      fc.assert(
        fc.property(topicContextArb, sourceTypeArb, (topicContext, sourceType) => {
          const baseCandidate: Omit<MediaCandidate, 'width' | 'height'> = {
            url: 'https://example.com/test.jpg',
            alt: 'technology image',
            source: 'DuckDuckGo · example.com',
            sourceUrl: 'https://example.com',
            baseScore: 100,
            query: 'technology',
            finalScore: 0,
            type: 'image',
          };

          const hdCandidate: MediaCandidate = { ...baseCandidate, width: 1920, height: 1080 };
          const fourKCandidate: MediaCandidate = { ...baseCandidate, width: 3840, height: 2160 };

          const hdScore = scoreCandidate(hdCandidate, topicContext, undefined, sourceType);
          const fourKScore = scoreCandidate(fourKCandidate, topicContext, undefined, sourceType);

          // 4K should score higher than HD due to resolution bonus
          expect(fourKScore).toBeGreaterThan(hdScore);
        }),
        { numRuns: 50 },
      );
    });
  });

  /**
   * Preservation Requirement 3.7: buildStoryboard produces frames with
   * quality labels (strong/okay/weak) on unfixed code.
   *
   * For all valid segments, storyboard builder produces frames with quality labels.
   */
  describe('buildStoryboard: Produces frames with quality labels', () => {
    it('produces frames with valid quality labels for any valid project', () => {
      fc.assert(
        fc.property(
          fc.array(scriptSegmentArb, { minLength: 2, maxLength: 8 }),
          (segments) => {
            // Build a minimal VideoProject
            const project: VideoProject = {
              version: 1,
              id: 'test-project',
              title: 'Test Video',
              topic: 'Technology',
              style: 'business_insider',
              targetDuration: segments.reduce((sum, s) => sum + s.duration, 0),
              script: segments,
              media: [],
              narration: [],
              status: 'draft',
              createdAt: new Date(),
            };

            const result = buildStoryboard(project);

            // Must produce blocks for each segment
            expect(result.blocks.length).toBe(segments.length);

            // Each block must have frames
            for (const block of result.blocks) {
              expect(block.frames.length).toBeGreaterThan(0);

              // Each frame must have a valid quality label
              for (const frame of block.frames) {
                expect(['strong', 'okay', 'weak']).toContain(frame.qualityLabel);
                expect(typeof frame.qualityScore).toBe('number');
                expect(frame.qualityScore).toBeGreaterThanOrEqual(0);
                expect(frame.qualityScore).toBeLessThanOrEqual(100);
              }
            }

            // Totals must be consistent
            const validLabels: StoryboardQualityLabel[] = ['strong', 'okay', 'weak'];
            expect(validLabels).toContain('strong');
            expect(result.totals.totalFrames).toBe(
              result.totals.strongFrames + result.totals.okayFrames + result.totals.weakFrames,
            );
            expect(result.totals.segmentCount).toBe(segments.length);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('produces frames with increasing global seconds (monotonic timecodes)', () => {
      fc.assert(
        fc.property(
          fc.array(scriptSegmentArb, { minLength: 2, maxLength: 6 }),
          (segments) => {
            const project: VideoProject = {
              version: 1,
              id: 'test-project',
              title: 'Test Video',
              topic: 'Technology',
              style: 'business_insider',
              targetDuration: segments.reduce((sum, s) => sum + s.duration, 0),
              script: segments,
              media: [],
              narration: [],
              status: 'draft',
              createdAt: new Date(),
            };

            const result = buildStoryboard(project);
            const allFrames = result.blocks.flatMap((b) => b.frames);

            // Global seconds should be monotonically non-decreasing
            for (let i = 1; i < allFrames.length; i++) {
              expect(allFrames[i].globalSecond).toBeGreaterThanOrEqual(allFrames[i - 1].globalSecond);
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Preservation Requirement 3.5: parseQualityResponse returns QualityFactors
   * with 5 factors clamped to [0,10] on unfixed code.
   */
  describe('parseQualityResponse: Returns 5 factors clamped to [0,10]', () => {
    it('returns exactly 5 quality factors clamped to [0,10] for any valid object input', () => {
      fc.assert(
        fc.property(qualityResponseObjectArb, (response) => {
          const factors = parseQualityResponse(response);

          // Must have exactly 5 factors
          const keys = Object.keys(factors);
          expect(keys).toContain('sharpness');
          expect(keys).toContain('lighting');
          expect(keys).toContain('composition');
          expect(keys).toContain('vibrancy');
          expect(keys).toContain('relevance');

          // Each factor must be clamped to [0, 10]
          expect(factors.sharpness).toBeGreaterThanOrEqual(0);
          expect(factors.sharpness).toBeLessThanOrEqual(10);
          expect(factors.lighting).toBeGreaterThanOrEqual(0);
          expect(factors.lighting).toBeLessThanOrEqual(10);
          expect(factors.composition).toBeGreaterThanOrEqual(0);
          expect(factors.composition).toBeLessThanOrEqual(10);
          expect(factors.vibrancy).toBeGreaterThanOrEqual(0);
          expect(factors.vibrancy).toBeLessThanOrEqual(10);
          expect(factors.relevance).toBeGreaterThanOrEqual(0);
          expect(factors.relevance).toBeLessThanOrEqual(10);

          // Each factor must be an integer
          expect(Number.isInteger(factors.sharpness)).toBe(true);
          expect(Number.isInteger(factors.lighting)).toBe(true);
          expect(Number.isInteger(factors.composition)).toBe(true);
          expect(Number.isInteger(factors.vibrancy)).toBe(true);
          expect(Number.isInteger(factors.relevance)).toBe(true);
        }),
        { numRuns: 200 },
      );
    });

    it('returns 5 factors clamped to [0,10] for JSON string input', () => {
      fc.assert(
        fc.property(qualityResponseStringArb, (responseStr) => {
          const factors = parseQualityResponse(responseStr);

          expect(factors.sharpness).toBeGreaterThanOrEqual(0);
          expect(factors.sharpness).toBeLessThanOrEqual(10);
          expect(factors.lighting).toBeGreaterThanOrEqual(0);
          expect(factors.lighting).toBeLessThanOrEqual(10);
          expect(factors.composition).toBeGreaterThanOrEqual(0);
          expect(factors.composition).toBeLessThanOrEqual(10);
          expect(factors.vibrancy).toBeGreaterThanOrEqual(0);
          expect(factors.vibrancy).toBeLessThanOrEqual(10);
          expect(factors.relevance).toBeGreaterThanOrEqual(0);
          expect(factors.relevance).toBeLessThanOrEqual(10);
        }),
        { numRuns: 200 },
      );
    });

    it('returns 5 factors clamped to [0,10] for markdown-fenced JSON input', () => {
      fc.assert(
        fc.property(qualityResponseFencedArb, (responseStr) => {
          const factors = parseQualityResponse(responseStr);

          expect(factors.sharpness).toBeGreaterThanOrEqual(0);
          expect(factors.sharpness).toBeLessThanOrEqual(10);
          expect(factors.lighting).toBeGreaterThanOrEqual(0);
          expect(factors.lighting).toBeLessThanOrEqual(10);
          expect(factors.composition).toBeGreaterThanOrEqual(0);
          expect(factors.composition).toBeLessThanOrEqual(10);
          expect(factors.vibrancy).toBeGreaterThanOrEqual(0);
          expect(factors.vibrancy).toBeLessThanOrEqual(10);
          expect(factors.relevance).toBeGreaterThanOrEqual(0);
          expect(factors.relevance).toBeLessThanOrEqual(10);
        }),
        { numRuns: 100 },
      );
    });

    it('returns default factors (all 5) for invalid/garbage input', () => {
      fc.assert(
        fc.property(
          fc.oneof(fc.constant(null), fc.constant(undefined), fc.constant(42), fc.constant([1, 2, 3]), fc.constant('not json at all')),
          (garbage) => {
            const factors = parseQualityResponse(garbage);

            // Should return defaults, still clamped to [0,10]
            expect(factors.sharpness).toBeGreaterThanOrEqual(0);
            expect(factors.sharpness).toBeLessThanOrEqual(10);
            expect(factors.lighting).toBeGreaterThanOrEqual(0);
            expect(factors.lighting).toBeLessThanOrEqual(10);
            expect(factors.composition).toBeGreaterThanOrEqual(0);
            expect(factors.composition).toBeLessThanOrEqual(10);
            expect(factors.vibrancy).toBeGreaterThanOrEqual(0);
            expect(factors.vibrancy).toBeLessThanOrEqual(10);
            expect(factors.relevance).toBeGreaterThanOrEqual(0);
            expect(factors.relevance).toBeLessThanOrEqual(10);
          },
        ),
        { numRuns: 20 },
      );
    });
  });

  /**
   * Preservation Requirement 3.6: generateTitleOptions returns titles
   * within 40-70 char range on unfixed code.
   *
   * Title generation respects 40-70 character bounds when enforceTitleLength
   * is applied (data-point path). The standard path produces titles that are
   * non-empty strings. The enforceTitleLength function itself guarantees bounds.
   */
  describe('generateTitleOptions: Title length within 40-70 characters', () => {
    it('data-point titles are enforced to 40-70 character bounds', () => {
      fc.assert(
        fc.property(topicArb, styleArb, (topic, style) => {
          // When dataPoints are provided, enforceTitleLength is applied
          const titles = generateTitleOptions(topic, style, ['$1.2B', '+200%', '2024']);

          // Must return at least one title
          expect(titles.length).toBeGreaterThan(0);

          // Each data-point title must be within 40-70 character bounds
          for (const titleOption of titles) {
            expect(titleOption.title.length).toBeGreaterThanOrEqual(40);
            expect(titleOption.title.length).toBeLessThanOrEqual(70);
          }
        }),
        { numRuns: 100 },
      );
    });

    it('standard titles are non-empty strings for any valid topic', () => {
      fc.assert(
        fc.property(topicArb, styleArb, (topic, style) => {
          const titles = generateTitleOptions(topic, style);

          // Must return at least one title
          expect(titles.length).toBeGreaterThan(0);

          // Each title must be a non-empty string
          for (const titleOption of titles) {
            expect(typeof titleOption.title).toBe('string');
            expect(titleOption.title.length).toBeGreaterThan(0);
          }
        }),
        { numRuns: 100 },
      );
    });

    it('titles have valid style and estimatedCTR properties', () => {
      fc.assert(
        fc.property(topicArb, styleArb, (topic, style) => {
          const titles = generateTitleOptions(topic, style);

          const validStyles = ['clickbait', 'professional', 'question', 'listicle', 'shocking'];

          for (const titleOption of titles) {
            expect(validStyles).toContain(titleOption.style);
            expect(typeof titleOption.estimatedCTR).toBe('number');
            expect(titleOption.estimatedCTR).toBeGreaterThan(0);
          }
        }),
        { numRuns: 100 },
      );
    });

    it('titles are sorted by estimatedCTR descending', () => {
      fc.assert(
        fc.property(topicArb, styleArb, (topic, style) => {
          const titles = generateTitleOptions(topic, style);

          for (let i = 1; i < titles.length; i++) {
            expect(titles[i - 1].estimatedCTR).toBeGreaterThanOrEqual(titles[i].estimatedCTR);
          }
        }),
        { numRuns: 100 },
      );
    });
  });

  /**
   * Preservation Requirement 3.4: validateVisualPlan produces valid
   * LlmVisualPlan with shots on unfixed code.
   */
  describe('validateVisualPlan: Produces valid plans with shots', () => {
    it('returns a valid LlmVisualPlan with intent, queries, and visualConcept for any raw input', () => {
      fc.assert(
        fc.property(visualPlanRawArb, (raw) => {
          const plan = validateVisualPlan(raw, 'fallback topic');

          // Must have required fields
          expect(typeof plan.intent).toBe('string');
          expect(plan.intent.length).toBeGreaterThan(0);
          expect(Array.isArray(plan.queries)).toBe(true);
          expect(plan.queries.length).toBeGreaterThan(0);
          expect(typeof plan.visualConcept).toBe('string');
          expect(plan.visualConcept.length).toBeGreaterThan(0);

          // Shots should be an array (may be empty for some inputs)
          if (plan.shots) {
            expect(Array.isArray(plan.shots)).toBe(true);
            for (const shot of plan.shots) {
              expect(typeof shot.concept).toBe('string');
              expect(shot.concept.length).toBeGreaterThan(0);
              expect(Array.isArray(shot.queries)).toBe(true);
              expect(typeof shot.vibe).toBe('string');
            }
          }
        }),
        { numRuns: 100 },
      );
    });

    it('uses fallback topic when raw input is null/undefined/invalid', () => {
      fc.assert(
        fc.property(
          fc.oneof(fc.constant(null), fc.constant(undefined), fc.constant(42), fc.constant('string')),
          fc.stringMatching(/^[A-Za-z ]{5,30}$/),
          (invalidRaw, fallbackTopic) => {
            const plan = validateVisualPlan(invalidRaw, fallbackTopic);

            // Should use fallback topic in queries
            expect(plan.queries).toContain(fallbackTopic);
            expect(plan.intent).toBe('Establish visual context');
          },
        ),
        { numRuns: 50 },
      );
    });

    it('extracts shots from primaryShot and secondaryShot fields', () => {
      fc.assert(
        fc.property(visualPlanRawArb, (raw) => {
          const plan = validateVisualPlan(raw, 'fallback');

          // When raw has primaryShot and secondaryShot, plan should have shots
          if (raw.primaryShot && raw.secondaryShot) {
            expect(plan.shots).toBeDefined();
            expect(plan.shots!.length).toBeGreaterThanOrEqual(1);
          }
        }),
        { numRuns: 100 },
      );
    });
  });
});
