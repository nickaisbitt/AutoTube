import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { validateStoredProject, DEFAULT_APP_CONFIG } from '../../store';
import type { PipelineStep, StepStatus, TopicConfig } from '../../types';

// ---------------------------------------------------------------------------
// Shared generators
// ---------------------------------------------------------------------------

const PIPELINE_STEPS: PipelineStep[] = ['topic', 'script', 'media', 'narration', 'assembly', 'preview'];
const VALID_STATUSES: StepStatus[] = ['idle', 'active', 'processing', 'complete', 'error'];
const VALID_STYLES = ['business_insider', 'warfront', 'documentary', 'explainer'] as const;
const VALID_TONES = ['informative', 'dramatic', 'casual', 'urgent'] as const;

/** Generates a minimal valid project object that validateStoredProject will accept. */
const validProjectArb = fc.record({
  id: fc.string({ minLength: 1, maxLength: 20 }),
  title: fc.string({ minLength: 1, maxLength: 100 }),
  topic: fc.string({ minLength: 1, maxLength: 100 }),
  style: fc.constantFrom(...VALID_STYLES),
  targetDuration: fc.integer({ min: 1, max: 60 }),
  script: fc.array(
    fc.record({
      id: fc.string({ minLength: 1, maxLength: 10 }),
      type: fc.constantFrom('intro', 'section', 'transition', 'outro'),
      title: fc.string({ minLength: 1, maxLength: 50 }),
      narration: fc.string({ minLength: 1, maxLength: 200 }),
      visualNote: fc.string({ minLength: 1, maxLength: 200 }),
      duration: fc.integer({ min: 5, max: 120 }),
    }),
    { minLength: 0, maxLength: 5 },
  ),
  media: fc.constant([]),
  narration: fc.constant([]),
  status: fc.constantFrom('draft', 'processing', 'complete'),
  createdAt: fc.constant(new Date().toISOString()),
});

/** Generates a step statuses record where at least one step is 'processing'. */
const stepStatusesWithProcessingArb = fc.tuple(
  // Pick at least one step to be 'processing'
  fc.subarray(PIPELINE_STEPS, { minLength: 1 }),
  // Assign random statuses to the rest
  fc.dictionary(
    fc.constantFrom(...PIPELINE_STEPS),
    fc.constantFrom(...VALID_STATUSES),
  ),
).map(([processingSteps, baseStatuses]) => {
  const result: Record<string, string> = {};
  for (const step of PIPELINE_STEPS) {
    result[step] = baseStatuses[step] || 'idle';
  }
  // Force at least the chosen steps to 'processing'
  for (const step of processingSteps) {
    result[step] = 'processing';
  }
  return result;
});

/** Generates a valid stored project blob with step statuses that include 'processing'. */
const storedProjectWithProcessingArb = fc.tuple(validProjectArb, stepStatusesWithProcessingArb).map(
  ([project, stepStatuses]) => ({
    project,
    stepStatuses,
    currentStep: 'topic' as PipelineStep,
    topicConfig: {
      topic: project.topic,
      style: project.style,
      targetDuration: project.targetDuration,
      tone: 'informative' as const,
      audience: 'General audience',
    },
  }),
);

// ---------------------------------------------------------------------------
// Property 7: Processing steps reset on page reload
// Feature: codebase-robustness-audit, Property 7: Processing steps reset on page reload
// **Validates: Requirements 7.4, 8.4**
// ---------------------------------------------------------------------------

describe('Property 7: Processing steps reset on page reload', () => {
  /**
   * For any saved project state where one or more steps have 'processing' status,
   * loading that state SHALL reset those steps to 'active' (not leave them in
   * 'processing'), preventing stuck UI on reload.
   */
  it('validateStoredProject resets all processing steps to active', () => {
    fc.assert(
      fc.property(storedProjectWithProcessingArb, (storedData) => {
        const result = validateStoredProject(storedData);

        // The data is valid, so we should get a result
        expect(result).not.toBeNull();
        if (!result) return;

        // No step should remain in 'processing' status
        for (const step of PIPELINE_STEPS) {
          expect(result.stepStatuses[step]).not.toBe('processing');
        }
      }),
      { numRuns: 100 },
    );
  });

  it('steps that were processing become active specifically', () => {
    fc.assert(
      fc.property(storedProjectWithProcessingArb, (storedData) => {
        const result = validateStoredProject(storedData);
        expect(result).not.toBeNull();
        if (!result) return;

        // Every step that was 'processing' in the input should now be 'active'
        const inputStatuses = storedData.stepStatuses as Record<string, string>;
        for (const step of PIPELINE_STEPS) {
          if (inputStatuses[step] === 'processing') {
            expect(result.stepStatuses[step]).toBe('active');
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it('non-processing steps are preserved as-is (when project is not complete)', () => {
    // When project.status === 'complete', validateStoredProject forces
    // currentStep to 'preview' and stepStatuses.preview to 'active',
    // so we restrict to non-complete projects for this preservation check.
    const nonCompleteProjectArb = fc.tuple(
      validProjectArb.map((p) => ({ ...p, status: 'draft' as const })),
      stepStatusesWithProcessingArb,
    ).map(([project, stepStatuses]) => ({
      project,
      stepStatuses,
      currentStep: 'topic' as PipelineStep,
      topicConfig: {
        topic: project.topic,
        style: project.style,
        targetDuration: project.targetDuration,
        tone: 'informative' as const,
        audience: 'General audience',
      },
    }));

    fc.assert(
      fc.property(nonCompleteProjectArb, (storedData) => {
        const result = validateStoredProject(storedData);
        expect(result).not.toBeNull();
        if (!result) return;

        const inputStatuses = storedData.stepStatuses as Record<string, string>;
        for (const step of PIPELINE_STEPS) {
          if (inputStatuses[step] !== 'processing') {
            // Non-processing statuses should be preserved (if they were valid)
            if (VALID_STATUSES.includes(inputStatuses[step] as StepStatus)) {
              expect(result.stepStatuses[step]).toBe(inputStatuses[step]);
            }
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 8: Corrupted localStorage handled gracefully
// Feature: codebase-robustness-audit, Property 8: Corrupted localStorage handled gracefully
// **Validates: Requirements 8.5, 17.4**
// ---------------------------------------------------------------------------

describe('Property 8: Corrupted localStorage handled gracefully', () => {
  /**
   * For any string stored in localStorage (including invalid JSON, truncated data,
   * random bytes), the store SHALL fall back to fresh/default state without throwing.
   *
   * validateStoredProject accepts `unknown` — we feed it arbitrary corrupted inputs
   * and verify it either returns null or a valid result, but never throws.
   */
  it('never throws for arbitrary unknown inputs', () => {
    fc.assert(
      fc.property(fc.anything(), (input) => {
        // Must not throw
        const result = validateStoredProject(input);

        // Result is either null or a valid object
        expect(result === null || typeof result === 'object').toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('returns null for non-object inputs', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string(),
          fc.integer(),
          fc.double(),
          fc.boolean(),
          fc.constant(null),
          fc.constant(undefined),
        ),
        (input) => {
          const result = validateStoredProject(input);
          expect(result).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns null for objects missing the project field', () => {
    fc.assert(
      fc.property(
        fc.record({
          stepStatuses: fc.anything(),
          currentStep: fc.anything(),
          topicConfig: fc.anything(),
        }),
        (input) => {
          const result = validateStoredProject(input);
          expect(result).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns null for objects with a non-object project field', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null), fc.array(fc.anything())),
        (projectValue) => {
          const result = validateStoredProject({ project: projectValue });
          expect(result).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns null for project objects missing required fields', () => {
    fc.assert(
      fc.property(
        // Generate a project-like object with random subset of fields
        fc.record({
          id: fc.oneof(fc.string(), fc.constant(undefined)),
          title: fc.oneof(fc.string(), fc.constant(undefined)),
          topic: fc.oneof(fc.string(), fc.constant(undefined)),
        }),
        (partialProject) => {
          // Remove at least one required field to ensure invalidity
          const proj = { ...partialProject } as Record<string, unknown>;
          delete proj.script;
          delete proj.media;
          delete proj.narration;
          delete proj.status;

          const result = validateStoredProject({ project: proj });
          expect(result).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 19: Config merge with defaults
// Feature: codebase-robustness-audit, Property 19: Config merge with defaults
// **Validates: Requirements 21.2, 21.3**
// ---------------------------------------------------------------------------

describe('Property 19: Config merge with defaults', () => {
  /**
   * For any partial or corrupted config object, the store SHALL produce a complete
   * config with all required fields populated using defaults for missing fields.
   *
   * We test validateStoredProject's topicConfig merge behavior: when given a valid
   * project blob with a partial/corrupted topicConfig, the returned topicConfig
   * should always have all required fields.
   */

  const REQUIRED_TOPIC_CONFIG_FIELDS: (keyof TopicConfig)[] = [
    'topic',
    'style',
    'targetDuration',
    'tone',
    'audience',
  ];

  /** Generates a partial topicConfig with some fields missing or wrong types. */
  const partialTopicConfigArb = fc.record(
    {
      topic: fc.oneof(fc.string(), fc.integer(), fc.constant(undefined)),
      style: fc.oneof(fc.constantFrom(...VALID_STYLES), fc.string(), fc.constant(undefined)),
      targetDuration: fc.oneof(fc.integer({ min: 1, max: 60 }), fc.string(), fc.constant(undefined)),
      tone: fc.oneof(fc.constantFrom(...VALID_TONES), fc.string(), fc.constant(undefined)),
      audience: fc.oneof(fc.string(), fc.integer(), fc.constant(undefined)),
    },
    { requiredKeys: [] },
  );

  it('returned topicConfig always has all required fields', () => {
    fc.assert(
      fc.property(
        validProjectArb,
        fc.oneof(partialTopicConfigArb, fc.anything()),
        (project, topicConfig) => {
          const storedData = {
            project,
            stepStatuses: {
              topic: 'complete',
              script: 'complete',
              media: 'active',
              narration: 'idle',
              assembly: 'idle',
              preview: 'idle',
            },
            currentStep: 'media',
            topicConfig,
          };

          const result = validateStoredProject(storedData);
          expect(result).not.toBeNull();
          if (!result) return;

          // Every required field must be present and have the correct type
          for (const field of REQUIRED_TOPIC_CONFIG_FIELDS) {
            expect(result.topicConfig[field]).toBeDefined();
            expect(result.topicConfig[field]).not.toBeNull();
          }

          // Type checks
          expect(typeof result.topicConfig.topic).toBe('string');
          expect(typeof result.topicConfig.style).toBe('string');
          expect(typeof result.topicConfig.targetDuration).toBe('number');
          expect(typeof result.topicConfig.tone).toBe('string');
          expect(typeof result.topicConfig.audience).toBe('string');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('missing topicConfig falls back to defaults derived from project', () => {
    fc.assert(
      fc.property(validProjectArb, (project) => {
        const storedData = {
          project,
          stepStatuses: {
            topic: 'complete',
            script: 'complete',
            media: 'active',
            narration: 'idle',
            assembly: 'idle',
            preview: 'idle',
          },
          currentStep: 'media',
          // No topicConfig at all
        };

        const result = validateStoredProject(storedData);
        expect(result).not.toBeNull();
        if (!result) return;

        // Should use project.topic as the topic default
        expect(result.topicConfig.topic).toBe(project.topic);
        // Should use project.style as the style default
        expect(result.topicConfig.style).toBe(project.style);
        // Should have a numeric targetDuration
        expect(typeof result.topicConfig.targetDuration).toBe('number');
        expect(result.topicConfig.targetDuration).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  it('DEFAULT_APP_CONFIG has all required AppConfig fields', () => {
    const requiredFields = ['openRouterKey', 'sourceType'];

    for (const field of requiredFields) {
      expect(DEFAULT_APP_CONFIG).toHaveProperty(field);
      expect((DEFAULT_APP_CONFIG as Record<string, unknown>)[field]).toBeDefined();
    }
  });

  it('DEFAULT_APP_CONFIG fields are all strings', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...Object.keys(DEFAULT_APP_CONFIG)),
        (field) => {
          expect(typeof (DEFAULT_APP_CONFIG as Record<string, unknown>)[field]).toBe('string');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('partial topicConfig preserves valid fields and fills defaults for invalid ones', () => {
    fc.assert(
      fc.property(
        validProjectArb,
        fc.record({
          topic: fc.string({ minLength: 1, maxLength: 50 }),
          audience: fc.string({ minLength: 1, maxLength: 100 }),
        }),
        (project, partialConfig) => {
          const storedData = {
            project,
            stepStatuses: {
              topic: 'complete',
              script: 'complete',
              media: 'active',
              narration: 'idle',
              assembly: 'idle',
              preview: 'idle',
            },
            currentStep: 'media',
            topicConfig: partialConfig, // Only has topic and audience
          };

          const result = validateStoredProject(storedData);
          expect(result).not.toBeNull();
          if (!result) return;

          // Provided string fields should be preserved
          expect(result.topicConfig.topic).toBe(partialConfig.topic);
          expect(result.topicConfig.audience).toBe(partialConfig.audience);

          // Missing fields should get defaults
          expect(typeof result.topicConfig.style).toBe('string');
          expect(typeof result.topicConfig.targetDuration).toBe('number');
          expect(typeof result.topicConfig.tone).toBe('string');
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// blindReview field persistence through localStorage save/load
// Feature: blind-video-review, Task 6.2
// **Validates: Requirements 6.1, 6.2, 6.3**
// ---------------------------------------------------------------------------

describe('blindReview field persists in localStorage save/load', () => {
  it('validateStoredProject preserves the blindReview field when present on the project', () => {
    const blindReview = {
      scores: {
        visualQuality: 8,
        pacing: 7,
        narrativeClarity: 9,
        thumbnailEffectiveness: 6,
        overallProductionValue: 8,
      },
      feedback: {
        visualQuality: 'Great visuals.',
        pacing: 'Good pacing.',
        narrativeClarity: 'Clear narrative.',
        thumbnailEffectiveness: 'Decent thumbnail.',
        overallProductionValue: 'Well produced.',
      },
      letterGrade: 'B',
      summary: 'A solid video.',
      reviewedAt: new Date().toISOString(),
    };

    const storedData = {
      project: {
        id: 'test-id',
        title: 'Test Title',
        topic: 'Test Topic',
        style: 'business_insider',
        targetDuration: 8,
        script: [],
        media: [],
        narration: [],
        status: 'complete',
        createdAt: new Date().toISOString(),
        version: 1,
        blindReview,
      },
      stepStatuses: {
        topic: 'complete',
        script: 'complete',
        media: 'complete',
        narration: 'complete',
        ai_edit: 'complete',
        assembly: 'complete',
        preview: 'active',
      },
      currentStep: 'preview',
      topicConfig: {
        topic: 'Test Topic',
        style: 'business_insider',
        targetDuration: 8,
        tone: 'informative',
        audience: 'General audience',
      },
    };

    const result = validateStoredProject(storedData);
    expect(result).not.toBeNull();
    expect(result!.project.blindReview).toBeDefined();
    expect(result!.project.blindReview).toEqual(blindReview);
  });

  it('validateStoredProject returns undefined blindReview when field is absent (older projects)', () => {
    const storedData = {
      project: {
        id: 'old-project',
        title: 'Old Project',
        topic: 'Old Topic',
        style: 'documentary',
        targetDuration: 5,
        script: [],
        media: [],
        narration: [],
        status: 'draft',
        createdAt: new Date().toISOString(),
        version: 1,
        // No blindReview field — simulates an older project
      },
      stepStatuses: {
        topic: 'complete',
        script: 'complete',
        media: 'active',
        narration: 'idle',
        ai_edit: 'idle',
        assembly: 'idle',
        preview: 'idle',
      },
      currentStep: 'media',
      topicConfig: {
        topic: 'Old Topic',
        style: 'documentary',
        targetDuration: 5,
        tone: 'informative',
        audience: 'General audience',
      },
    };

    const result = validateStoredProject(storedData);
    expect(result).not.toBeNull();
    expect(result!.project.blindReview).toBeUndefined();
  });

  it('blindReview field survives JSON.stringify/JSON.parse round-trip through validateStoredProject', () => {
    const blindReview = {
      scores: {
        visualQuality: 3,
        pacing: 5,
        narrativeClarity: 7,
        thumbnailEffectiveness: 9,
        overallProductionValue: 4,
      },
      feedback: {
        visualQuality: 'Needs improvement.',
        pacing: 'Average pacing.',
        narrativeClarity: 'Good clarity.',
        thumbnailEffectiveness: 'Excellent thumbnail.',
        overallProductionValue: 'Below average.',
      },
      letterGrade: 'C',
      summary: 'Mixed results across categories.',
      reviewedAt: '2024-01-15T10:30:00.000Z',
    };

    const storedData = {
      project: {
        id: 'roundtrip-test',
        title: 'Round Trip Test',
        topic: 'Round Trip',
        style: 'explainer',
        targetDuration: 3,
        script: [],
        media: [],
        narration: [],
        status: 'complete',
        createdAt: new Date().toISOString(),
        version: 1,
        blindReview,
      },
      stepStatuses: {
        topic: 'complete',
        script: 'complete',
        media: 'complete',
        narration: 'complete',
        ai_edit: 'complete',
        assembly: 'complete',
        preview: 'active',
      },
      currentStep: 'preview',
    };

    // Simulate the full localStorage round-trip: serialize → deserialize → validate
    const serialized = JSON.stringify(storedData);
    const deserialized = JSON.parse(serialized);
    const result = validateStoredProject(deserialized);

    expect(result).not.toBeNull();
    expect(result!.project.blindReview).toEqual(blindReview);
    expect(result!.project.blindReview!.scores.visualQuality).toBe(3);
    expect(result!.project.blindReview!.scores.thumbnailEffectiveness).toBe(9);
    expect(result!.project.blindReview!.letterGrade).toBe('C');
    expect(result!.project.blindReview!.reviewedAt).toBe('2024-01-15T10:30:00.000Z');
  });
});
