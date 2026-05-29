import { describe, it, expect } from 'vitest';
import { validateStoredProject } from '../../store';
import type { PipelineStep, StepStatus } from '../../types';

// ---------------------------------------------------------------------------
// Task 6.2: Unit tests for store AI edit integration
// Feature: ai-editor-layer
// **Validates: Requirements 1.1, 1.4, 1.5, 11.4, 11.5**
// ---------------------------------------------------------------------------

/**
 * The full pipeline step list including ai_edit between narration and assembly.
 */
const PIPELINE_STEPS: PipelineStep[] = [
  'topic',
  'script',
  'media',
  'narration',
  'ai_edit',
  'assembly',
  'preview',
];

/** Builds a minimal valid stored project blob that validateStoredProject accepts. */
function makeStoredProject(overrides?: {
  stepStatuses?: Partial<Record<PipelineStep, StepStatus>>;
  currentStep?: PipelineStep;
  projectStatus?: string;
}) {
  const stepStatuses: Record<string, StepStatus> = {
    topic: 'complete',
    script: 'complete',
    media: 'complete',
    narration: 'complete',
    ai_edit: 'idle',
    assembly: 'idle',
    preview: 'idle',
    ...overrides?.stepStatuses,
  };

  return {
    project: {
      id: 'test-proj-1',
      title: 'Test Video',
      topic: 'Test Topic',
      style: 'business_insider',
      targetDuration: 8,
      script: [
        {
          id: 'seg-1',
          type: 'intro',
          title: 'The Hook',
          narration: 'Some narration text',
          visualNote: 'Visual note',
          duration: 15,
        },
      ],
      media: [],
      narration: [],
      status: overrides?.projectStatus ?? 'draft',
      createdAt: new Date().toISOString(),
    },
    stepStatuses,
    currentStep: overrides?.currentStep ?? 'narration',
    topicConfig: {
      topic: 'Test Topic',
      style: 'business_insider',
      targetDuration: 8,
      tone: 'informative',
      audience: 'General audience',
    },
  };
}

// ---------------------------------------------------------------------------
// validateStoredProject includes ai_edit in fallback stepStatuses
// ---------------------------------------------------------------------------

describe('validateStoredProject ai_edit fallback stepStatuses', () => {
  it('includes ai_edit in the fallback stepStatuses when no stepStatuses are stored', () => {
    const stored = {
      project: {
        id: 'proj-1',
        title: 'Fallback Test',
        topic: 'Fallback Topic',
        style: 'business_insider',
        targetDuration: 5,
        script: [],
        media: [],
        narration: [],
        status: 'draft',
        createdAt: new Date().toISOString(),
      },
      // No stepStatuses field — triggers the fallback branch
      currentStep: 'topic',
      topicConfig: {
        topic: 'Fallback Topic',
        style: 'business_insider',
        targetDuration: 5,
        tone: 'informative',
        audience: 'General audience',
      },
    };

    const result = validateStoredProject(stored);
    expect(result).not.toBeNull();
    expect(result!.stepStatuses).toHaveProperty('ai_edit');
    // Fallback sets all steps to complete except preview which is active
    expect(result!.stepStatuses.ai_edit).toBe('complete');
  });

  it('fills ai_edit as idle when stepStatuses object exists but lacks ai_edit key', () => {
    const stored = makeStoredProject();
    // Remove ai_edit from the stepStatuses to simulate an older stored format
    const { ai_edit, ...withoutAiEdit } = stored.stepStatuses as Record<string, StepStatus>;

    const result = validateStoredProject({
      ...stored,
      stepStatuses: withoutAiEdit,
    });

    expect(result).not.toBeNull();
    expect(result!.stepStatuses).toHaveProperty('ai_edit');
    // Missing keys default to 'idle'
    expect(result!.stepStatuses.ai_edit).toBe('idle');
  });

  it('all PIPELINE_STEPS are present in the returned stepStatuses', () => {
    const stored = makeStoredProject();
    const result = validateStoredProject(stored);

    expect(result).not.toBeNull();
    for (const step of PIPELINE_STEPS) {
      expect(result!.stepStatuses).toHaveProperty(step);
    }
  });
});

// ---------------------------------------------------------------------------
// validateStoredProject resets ai_edit: 'processing' to 'active' on reload
// ---------------------------------------------------------------------------

describe('validateStoredProject resets ai_edit processing to active', () => {
  it('resets ai_edit from processing to active on reload', () => {
    const stored = makeStoredProject({
      stepStatuses: { ai_edit: 'processing' },
    });

    const result = validateStoredProject(stored);

    expect(result).not.toBeNull();
    expect(result!.stepStatuses.ai_edit).toBe('active');
  });

  it('resets ai_edit processing even when other steps are also processing', () => {
    const stored = makeStoredProject({
      stepStatuses: {
        narration: 'processing',
        ai_edit: 'processing',
        assembly: 'processing',
      },
    });

    const result = validateStoredProject(stored);

    expect(result).not.toBeNull();
    expect(result!.stepStatuses.narration).toBe('active');
    expect(result!.stepStatuses.ai_edit).toBe('active');
    expect(result!.stepStatuses.assembly).toBe('active');
  });

  it('no step remains in processing status after validation', () => {
    const stored = makeStoredProject({
      stepStatuses: {
        topic: 'processing',
        script: 'processing',
        media: 'processing',
        narration: 'processing',
        ai_edit: 'processing',
        assembly: 'processing',
        preview: 'processing',
      },
    });

    const result = validateStoredProject(stored);

    expect(result).not.toBeNull();
    for (const step of PIPELINE_STEPS) {
      expect(result!.stepStatuses[step]).not.toBe('processing');
      expect(result!.stepStatuses[step]).toBe('active');
    }
  });
});

// ---------------------------------------------------------------------------
// validateStoredProject preserves valid ai_edit statuses
// ---------------------------------------------------------------------------

describe('validateStoredProject preserves valid ai_edit statuses', () => {
  it.each(['idle', 'active', 'complete'] as StepStatus[])(
    'preserves ai_edit status "%s"',
    (status) => {
      const stored = makeStoredProject({
        stepStatuses: { ai_edit: status },
      });

      const result = validateStoredProject(stored);

      expect(result).not.toBeNull();
      expect(result!.stepStatuses.ai_edit).toBe(status);
    },
  );

  it('preserves ai_edit error status', () => {
    const stored = makeStoredProject({
      stepStatuses: { ai_edit: 'error' },
    });

    const result = validateStoredProject(stored);

    expect(result).not.toBeNull();
    expect(result!.stepStatuses.ai_edit).toBe('error');
  });

  it('replaces invalid ai_edit status string with idle', () => {
    const stored = makeStoredProject();
    // Force an invalid status value
    (stored.stepStatuses as Record<string, string>).ai_edit = 'bogus_status';

    const result = validateStoredProject(stored);

    expect(result).not.toBeNull();
    expect(result!.stepStatuses.ai_edit).toBe('idle');
  });
});

// ---------------------------------------------------------------------------
// PIPELINE_STEPS ordering: ai_edit sits between narration and assembly
// ---------------------------------------------------------------------------

describe('validateStoredProject handles ai_edit step ordering correctly', () => {
  it('ai_edit step is recognized as a valid currentStep', () => {
    const stored = makeStoredProject({
      currentStep: 'ai_edit',
      stepStatuses: { ai_edit: 'active' },
    });

    const result = validateStoredProject(stored);

    expect(result).not.toBeNull();
    expect(result!.currentStep).toBe('ai_edit');
  });

  it('narration completion with ai_edit active reflects correct pipeline state', () => {
    const stored = makeStoredProject({
      currentStep: 'ai_edit',
      stepStatuses: {
        topic: 'complete',
        script: 'complete',
        media: 'complete',
        narration: 'complete',
        ai_edit: 'active',
        assembly: 'idle',
        preview: 'idle',
      },
    });

    const result = validateStoredProject(stored);

    expect(result).not.toBeNull();
    expect(result!.stepStatuses.narration).toBe('complete');
    expect(result!.stepStatuses.ai_edit).toBe('active');
    expect(result!.stepStatuses.assembly).toBe('idle');
    expect(result!.currentStep).toBe('ai_edit');
  });

  it('ai_edit complete with assembly active reflects correct pipeline state', () => {
    const stored = makeStoredProject({
      currentStep: 'assembly',
      stepStatuses: {
        topic: 'complete',
        script: 'complete',
        media: 'complete',
        narration: 'complete',
        ai_edit: 'complete',
        assembly: 'active',
        preview: 'idle',
      },
    });

    const result = validateStoredProject(stored);

    expect(result).not.toBeNull();
    expect(result!.stepStatuses.ai_edit).toBe('complete');
    expect(result!.stepStatuses.assembly).toBe('active');
    expect(result!.currentStep).toBe('assembly');
  });

  it('complete project navigates to preview regardless of ai_edit status', () => {
    const stored = makeStoredProject({
      projectStatus: 'complete',
      stepStatuses: {
        topic: 'complete',
        script: 'complete',
        media: 'complete',
        narration: 'complete',
        ai_edit: 'complete',
        assembly: 'complete',
        preview: 'idle',
      },
    });

    const result = validateStoredProject(stored);

    expect(result).not.toBeNull();
    expect(result!.currentStep).toBe('preview');
    expect(result!.stepStatuses.preview).toBe('active');
  });
});
