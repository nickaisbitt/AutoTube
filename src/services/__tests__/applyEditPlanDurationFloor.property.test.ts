/**
 * Property-based test: applyEditPlan minimum duration floor
 *
 * **Validates: Requirements 2.12**
 *
 * For any valid VideoProject and EditPlan where scaling is triggered,
 * no segment duration in the output should fall below 1 second.
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { applyEditPlan } from '../aiEditor';
import type {
  VideoProject,
  ScriptSegment,
  MediaAsset,
  NarrationClip,
  EditPlan,
  SegmentEditEntry,
} from '../../types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeSegment(id: string, duration: number): ScriptSegment {
  return {
    id,
    type: 'section',
    title: `Segment ${id}`,
    narration: `Narration for ${id}.`,
    visualNote: `Visual note for ${id}.`,
    duration,
  };
}

function makeProject(segments: ScriptSegment[]): VideoProject {
  return {
    id: 'proj-1',
    title: 'Test Project',
    topic: 'Test Topic',
    style: 'business_insider',
    targetDuration: 60,
    script: segments,
    media: [],
    narration: [],
    status: 'draft',
    createdAt: new Date('2024-01-01'),
  };
}

function makeSegmentEntry(
  segmentId: string,
  adjustedDuration: number | null,
  originalDuration: number,
): SegmentEditEntry {
  return {
    segmentId,
    shotOrder: [],
    adjustedDuration,
    originalDuration,
    transition: null,
    kenBurns: {},
    captionSettings: {
      wordsPerWindow: 8,
      displayDurationMs: 2667,
      isFastPaced: false,
    },
    replacementSuggestions: [],
    rationale: 'Test rationale.',
  };
}

// ── Property Test ────────────────────────────────────────────────────────────

describe('applyEditPlan duration floor property', () => {
  /**
   * **Validates: Requirements 2.12**
   *
   * Property: For any set of random segment durations and adjusted durations,
   * after applyEditPlan processes the edit plan (including any scaling to
   * enforce the 10% total duration constraint), no segment duration in the
   * output should be below 1 second.
   */
  it('no segment duration falls below 1s after applying edit plan with random durations and scale factors', () => {
    // Generate 2-8 segments with random original durations and random adjusted durations
    const arbSegmentCount = fc.integer({ min: 2, max: 8 });

    const arbProjectAndPlan = arbSegmentCount.chain((count) => {
      // Generate original durations (1-60s each)
      const arbOriginalDurations = fc.array(
        fc.double({ min: 1, max: 60, noNaN: true, noDefaultInfinity: true }),
        { minLength: count, maxLength: count },
      );

      // Generate adjusted durations: either null or a positive value (0.5-200s)
      // We use a wide range to ensure scaling can produce very small values
      const arbAdjustedDurations = fc.array(
        fc.oneof(
          fc.constant(null as null),
          fc.double({ min: 0.5, max: 200, noNaN: true, noDefaultInfinity: true }),
        ),
        { minLength: count, maxLength: count },
      );

      return fc.tuple(arbOriginalDurations, arbAdjustedDurations).map(
        ([origDurations, adjDurations]) => {
          const segments = origDurations.map((dur, i) =>
            makeSegment(`seg-${i}`, dur),
          );
          const project = makeProject(segments);

          const plan: EditPlan = {
            segments: segments.map((seg, i) =>
              makeSegmentEntry(seg.id, adjDurations[i], origDurations[i]),
            ),
            summary: 'Random test plan',
            isDefault: false,
          };

          return { project, plan };
        },
      );
    });

    fc.assert(
      fc.property(arbProjectAndPlan, ({ project, plan }) => {
        const result = applyEditPlan(project, plan);

        // Every segment duration in the output must be >= 1s
        for (const seg of result.script) {
          expect(seg.duration).toBeGreaterThanOrEqual(1);
        }
      }),
      { numRuns: 200 },
    );
  });
});
