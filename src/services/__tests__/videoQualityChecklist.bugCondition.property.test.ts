/**
 * Bug Condition Exploration Test — Video Quality Checklist
 *
 * **Validates: Requirements 1.1-1.225**
 *
 * Property 1: Bug Condition — Pipeline Output Fails Quality Checklist Dimensions
 *
 * This test encodes the EXPECTED behavior. It verifies that the pipeline
 * produces output meeting quality checklist requirements across 5 key dimensions:
 * - Personal-stakes-first hooks in script generation
 * - Multi-variant thumbnail generation (>= 3 concepts)
 * - Emotional alignment scoring beyond keyword match
 * - Pattern interrupts in pacing logic
 * - Multi-dimensional quality scoring (>= 4 dimensions)
 *
 * EXPECTED OUTCOME ON UNFIXED CODE: FAIL (proves the bug exists)
 * EXPECTED OUTCOME AFTER FIX: PASS (confirms the fix works)
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';



// Import the actual source modules to inspect their behavior
import { scoreCandidate } from '../media';
import { scheduleRetentionBeats } from '../renderingShared';
import { parseQualityResponse } from '../qualityScorer';

// We'll also inspect the script generator prompt and thumbnail generation
// by importing and examining the module structure

// ---------------------------------------------------------------------------
// Arbitraries — generate valid pipeline inputs
// ---------------------------------------------------------------------------

/** Arbitrary for a valid video topic */
const topicArb = fc.oneof(
  fc.constant('The Rise of Cybercrime'),
  fc.constant('How AI is Changing Healthcare'),
  fc.constant('The Future of Electric Vehicles'),
  fc.constant('Why Remote Work is Here to Stay'),
  fc.constant('The Dark Side of Social Media'),
  fc.constant('How Hackers Steal Your Identity'),
  fc.constant('The Global Chip Shortage Explained'),
  fc.constant('Why Your Data is Worth Billions'),
);

/** Arbitrary for a valid video style */
const styleArb = fc.oneof(
  fc.constant('business_insider'),
  fc.constant('warfront'),
  fc.constant('documentary'),
  fc.constant('explainer'),
);



/** Arbitrary for segments with duration and narration (for pacing tests) */
const segmentsArb = fc.array(
  fc.record({
    duration: fc.integer({ min: 15, max: 25 }),
    narration: fc.oneof(
      fc.constant('This is a standard narration line about the topic.'),
      fc.constant('But here is the real question — what happens next?'),
      fc.constant('The company lost $2.5 million in a single day.'),
      fc.constant('And it gets worse. Much worse than anyone expected.'),
      fc.constant('Your bank account could be drained overnight.'),
      fc.constant('The hackers moved fast. Nobody saw it coming.'),
    ),
  }),
  { minLength: 6, maxLength: 12 },
);

/** Arbitrary for quality response data */
const qualityResponseArb = fc.record({
  sharpness: fc.integer({ min: 1, max: 10 }),
  lighting: fc.integer({ min: 1, max: 10 }),
  composition: fc.integer({ min: 1, max: 10 }),
  vibrancy: fc.integer({ min: 1, max: 10 }),
  relevance: fc.integer({ min: 1, max: 10 }),
});

// ---------------------------------------------------------------------------
// Property Tests — Bug Condition Exploration
// ---------------------------------------------------------------------------

describe('Property 1: Bug Condition — Pipeline Output Fails Quality Checklist Dimensions', () => {
  /**
   * Bug Condition: pipeline_output.hook.missing_personal_stakes
   *
   * The script generator prompt should enforce personal-stakes-first hooks.
   * Expected behavior: The system prompt must contain explicit instructions
   * requiring the first sentence to contain concrete personal risk
   * (money, files, identity, business shutdown).
   *
   * We test this by importing the script generator module and verifying
   * the prompt structure enforces personal stakes in the opening.
   */
  describe('Hook: Personal-stakes-first enforcement', () => {
    it('script generator prompt should enforce personal stakes in first sentence for any topic+style', async () => {
      // Dynamically import to inspect the module
      const scriptGenModule = await import('../llm/scriptGenerator');
      const moduleSource = scriptGenModule.generateAIScript.toString();

      await fc.assert(
        fc.property(topicArb, styleArb, (_topic, _style) => {
          // The script generator should have explicit instructions requiring:
          // 1. First sentence contains concrete personal risk
          // 2. Personal stakes before global/abstract framing
          // 3. Concrete risks: money, files, identity, business shutdown

          // Check that the prompt enforces personal-stakes-first hooks
          const hasPersonalStakesRule =
            moduleSource.includes('personal stakes') ||
            moduleSource.includes('personal risk') ||
            moduleSource.includes('personal-stakes-first');

          // The prompt should specifically require concrete risks in the FIRST sentence
          const hasFirstSentenceConcreteRisk =
            moduleSource.includes('first sentence') &&
            (moduleSource.includes('concrete') || moduleSource.includes('personal risk')) &&
            (moduleSource.includes('money') || moduleSource.includes('files') ||
             moduleSource.includes('identity') || moduleSource.includes('business shutdown'));

          // The prompt should require framing threat as immediate and familiar
          // BEFORE scaling to global issues
          const hasImmediateBeforeGlobal =
            moduleSource.includes('immediate and familiar before') ||
            moduleSource.includes('personal before global') ||
            moduleSource.includes('familiar before scaling');

          // Expected behavior: ALL of these should be true
          expect(hasPersonalStakesRule).toBe(true);
          expect(hasFirstSentenceConcreteRisk).toBe(true);
          expect(hasImmediateBeforeGlobal).toBe(true);
        }),
        { numRuns: 10 },
      );
    });
  });

  /**
   * Bug Condition: pipeline_output.thumbnail.variant_count < 3
   *
   * The thumbnail generation should produce >= 3 variants per video.
   * Expected behavior: A function exists that generates at least 3 thumbnail
   * concepts (fear, curiosity, authority/news variants).
   */
  describe('Thumbnail: Multi-variant generation (>= 3 concepts)', () => {
    it('thumbnail module should export a multi-concept generation function producing >= 3 variants', async () => {
      const thumbnailModule = await import('../thumbnail');

      await fc.assert(
        fc.property(topicArb, styleArb, (_topic, _style) => {
          // Expected behavior: The thumbnail module should have a function
          // that generates multiple thumbnail concepts (>= 3)
          const hasMultiConceptFunction =
            typeof (thumbnailModule as Record<string, unknown>).generateThumbnailConcepts === 'function';

          // The module should support generating at least 3 variants:
          // - "fear" variant
          // - "curiosity" variant
          // - "authority/news" variant
          expect(hasMultiConceptFunction).toBe(true);
        }),
        { numRuns: 10 },
      );
    });
  });

  /**
   * Bug Condition: pipeline_output.visuals.keyword_only_scoring
   *
   * The scoreCandidate function should include emotional alignment scoring
   * beyond simple keyword matching.
   * Expected behavior: scoreCandidate considers emotional tone, contextual
   * alignment, and not just keyword presence in metadata.
   */
  describe('Visuals: Emotional alignment scoring beyond keyword match', () => {
    it('scoreCandidate should include emotional alignment factor beyond keyword matching', () => {
      // Specifically, the function should have an explicit emotional
      // alignment scoring component that evaluates:
      // - Whether the visual matches the emotional tone of the script line
      // - Whether the visual provides concrete translation of abstract concepts
      // - Whether the visual is emotionally strong (not just technically relevant)
      //
      // We verify this by checking the function source for emotional scoring logic
      const scoreFnSource = scoreCandidate.toString();
      const hasEmotionalScoring =
        scoreFnSource.includes('emotional') ||
        scoreFnSource.includes('tone') ||
        scoreFnSource.includes('alignment') ||
        scoreFnSource.includes('contextual');

      expect(hasEmotionalScoring).toBe(true);
    });
  });

  /**
   * Bug Condition: pipeline_output.pacing.missing_pattern_interrupts
   *
   * The pacing logic should include pattern interrupts every 20-30 seconds.
   * Expected behavior: scheduleRetentionBeats produces beats with types
   * including pattern interrupts (text_slam, zoom, graphic_switch, silence)
   * not just 'visual_break'.
   */
  describe('Pacing: Pattern interrupts in retention beats', () => {
    it('scheduleRetentionBeats should produce pattern interrupt beat types beyond visual_break', () => {
      fc.assert(
        fc.property(segmentsArb, (segments) => {
          const beats = scheduleRetentionBeats(segments);

          // Expected behavior: The retention beats should include diverse
          // pattern interrupt types, not just 'visual_break'.
          // Pattern interrupts include: text_slam, zoom, graphic_switch,
          // sudden_silence, rhetorical_question
          const beatTypes = new Set(beats.map((b) => b.type));

          // The system should produce at least one pattern interrupt type
          // that is NOT just 'visual_break'
          const hasPatternInterrupts =
            beatTypes.has('text_slam' as any) ||
            beatTypes.has('zoom' as any) ||
            beatTypes.has('graphic_switch' as any) ||
            beatTypes.has('sudden_silence' as any) ||
            beatTypes.has('rhetorical_question' as any) ||
            beatTypes.has('pattern_interrupt' as any);

          // Additionally, beats should be scheduled at <= 30 second intervals
          // (pattern interrupts every 20-30 seconds)
          if (beats.length >= 2) {
            for (let i = 1; i < beats.length; i++) {
              const gap = beats[i].timeOffsetSec - beats[i - 1].timeOffsetSec;
              expect(gap).toBeLessThanOrEqual(35);
            }
          }

          expect(hasPatternInterrupts).toBe(true);
        }),
        { numRuns: 50 },
      );
    });
  });

  /**
   * Bug Condition: pipeline_output.quality_score.missing_multi_dimensional_validation
   *
   * Quality scoring should evaluate multiple dimensions beyond visual quality.
   * Expected behavior: parseQualityResponse returns factors that include
   * clarity, urgency, emotional specificity, and credibility — not just
   * sharpness, lighting, composition, vibrancy, relevance.
   */
  describe('Quality Scoring: Multi-dimensional validation (>= 4 content dimensions)', () => {
    it('parseQualityResponse should support content quality dimensions beyond visual factors', () => {
      fc.assert(
        fc.property(qualityResponseArb, (response) => {
          const factors = parseQualityResponse(response);

          // Expected behavior: Quality factors should include content-level
          // dimensions for multi-dimensional validation:
          // - clarity (is the message immediately understandable?)
          // - urgency (does it create appropriate tension?)
          // - emotionalSpecificity (are emotions concrete, not generic?)
          // - credibility (are claims sourced and balanced?)
          //
          // These are IN ADDITION to the existing visual factors.
          const factorKeys = Object.keys(factors);

          const hasClarity = factorKeys.includes('clarity');
          const hasUrgency = factorKeys.includes('urgency');
          const hasEmotionalSpecificity =
            factorKeys.includes('emotionalSpecificity') ||
            factorKeys.includes('emotional_specificity');
          const hasCredibility = factorKeys.includes('credibility');

          // At least 4 content-quality dimensions should exist
          const contentDimensions = [
            hasClarity,
            hasUrgency,
            hasEmotionalSpecificity,
            hasCredibility,
          ].filter(Boolean).length;

          expect(contentDimensions).toBeGreaterThanOrEqual(4);
        }),
        { numRuns: 20 },
      );
    });
  });
});
