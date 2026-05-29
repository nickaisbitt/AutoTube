import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVideoProject } from '../../store';
import type { TopicConfig, ScriptSegment } from '../../types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock service modules so we can control their behavior and inspect abort signals
vi.mock('../../services/llm', () => ({
  generateAIScript: vi.fn(),
  reviewAndImproveScript: vi.fn((segs: unknown) => Promise.resolve(segs)),
  refineScriptMultiPass: vi.fn((segs: unknown) => Promise.resolve(segs)),
  generateVideoTitle: vi.fn(() => Promise.resolve('Test Title')),
  generateSeriesMetadata: vi.fn(),
  generatePinnedComments: vi.fn(),
  generateHashtags: vi.fn(),
  mapEmotionalArc: vi.fn(() => [{ emotion: 'curiosity', segmentIndex: 0, intensity: 0.5 }]),
  validateStoryArc: vi.fn(() => ({ passed: true, score: 100, issues: [] })),
}));

vi.mock('../../services/llm/titleGenerator', () => ({
  generateTitleVariants: vi.fn(() => Promise.resolve({
    direct: 'Direct Title',
    curiosityGap: 'Curiosity Gap Title',
    emotionalUrgent: 'Emotional Urgent Title',
  })),
}));

vi.mock('../../services/renderingShared', () => ({
  assignSceneLayouts: vi.fn((segs: unknown[]) => (segs as unknown[]).map(() => 'centered-text')),
  scheduleRetentionBeats: vi.fn(() => []),
}));

vi.mock('../../services/tts', () => ({
}));

vi.mock('../../services/media', () => ({
  sourceSegmentMedia: vi.fn(),
  replaceMediaAsset: vi.fn(),
  resetUsedUrlsMap: vi.fn(),
}));

vi.mock('../../services/visualPlanner', () => ({
  resolveTopicContext: vi.fn(),
  planSegmentVisuals: vi.fn(),
}));

vi.mock('../../services/renderer', () => ({
  QUALITY_PRESETS: {
    draft: { width: 854, height: 480, fps: 24 },
    standard: { width: 1280, height: 720, fps: 30 },
    high: { width: 1920, height: 1080, fps: 30 },
  },
  renderVideoToBlob: vi.fn(),
}));

vi.mock('../../services/analytics', () => ({
  trackVideoGeneration: vi.fn(),
}));

vi.mock('../../services/segmentReorderer', () => ({
  reorderForHook: vi.fn((p: unknown) => p),
}));

vi.mock('../../services/captionUtils', () => ({
  CHART_KEYWORDS: [],
}));

vi.mock('../../services/logger', () => ({
  subscribeToLogs: vi.fn(() => () => {}),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('../../utils/speech', () => ({
  hasSpeechSupport: vi.fn(() => false),
  loadSpeechVoices: vi.fn(async () => []),
  pickPreferredVoice: vi.fn(() => null),
  stopSpeaking: vi.fn(),
}));

vi.mock('../../services/aiEditor', () => ({
  runAIEditPass: vi.fn(),
}));

vi.mock('../../services/projectMigrations', () => ({
  CURRENT_PROJECT_VERSION: 1,
  migrateProject: vi.fn((p: unknown) => p),
}));

vi.mock('../../services/tts/grokEngine', () => ({
  generateGrokTts: vi.fn(),
}));

vi.mock('../../services/tts', () => ({
  generateGrokTts: vi.fn(),
  generateMeloTts: vi.fn(),
}));

vi.mock('../../services/blindReview', () => ({
  runBlindReview: vi.fn(),
}));

vi.mock('../../services/seoTitles', () => ({
  extractHookLine: vi.fn(),
}));

vi.mock('../../utils/secureStorage', () => ({
  hasEncryptedConfig: vi.fn(() => false),
  loadEncryptedBlob: vi.fn(() => null),
  loadConfigFromSession: vi.fn(() => null),
  saveConfigToSession: vi.fn(),
  clearEncryptedConfig: vi.fn(),
  clearSessionConfig: vi.fn(),
  persistEncryptedConfig: vi.fn(),
  decryptConfig: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TOPIC_CONFIG: TopicConfig = {
  topic: 'Test Topic',
  style: 'business_insider',
  targetDuration: 3,
  tone: 'informative',
  audience: 'General audience',
};

function makeSegments(count = 2): ScriptSegment[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `seg-${i}`,
    type: 'section' as const,
    title: `Segment ${i}`,
    narration: `Narration text for segment ${i}`,
    visualNote: 'Some visual note',
    duration: 10,
  }));
}

// ---------------------------------------------------------------------------
// Task 10.7: Abort signal propagation through the store
// Feature: codebase-robustness-audit
// **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6**
// ---------------------------------------------------------------------------

describe('Abort signal propagation through the store', () => {
  let generateAIScript: ReturnType<typeof vi.fn>;
  let sourceSegmentMedia: ReturnType<typeof vi.fn>;
  let resolveTopicContext: ReturnType<typeof vi.fn>;
  let planSegmentVisuals: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Stub localStorage to avoid side effects
    vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {});

    // Import mocked modules
    const llm = await import('../../services/llm');
    const media = await import('../../services/media');
    const vp = await import('../../services/visualPlanner');

    generateAIScript = llm.generateAIScript as ReturnType<typeof vi.fn>;
    sourceSegmentMedia = media.sourceSegmentMedia as ReturnType<typeof vi.fn>;
    resolveTopicContext = vp.resolveTopicContext as ReturnType<typeof vi.fn>;
    planSegmentVisuals = vp.planSegmentVisuals as ReturnType<typeof vi.fn>;
  });

  // ── Requirement 2.4: Cancelling during script generation aborts the fetch ──

  it('cancelling during script generation aborts the fetch via AbortSignal', async () => {
    // Make generateAIScript hang until the signal is aborted
    generateAIScript.mockImplementation(
      (_config: TopicConfig, _key: string, _model: unknown, signal?: AbortSignal) => {
        return new Promise((_, reject) => {
          if (signal?.aborted) {
            reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
            return;
          }
          signal?.addEventListener('abort', () => {
            reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
          });
        });
      },
    );

    const { result } = renderHook(() => useVideoProject());

    // Set an openRouterKey so the store calls generateAIScript
    act(() => {
      result.current.setAppConfig({
        openRouterKey: 'test-key',
        sourceType: 'stock',
      });
    });

    // Start script generation (don't await — it will hang)
    let scriptPromise: Promise<unknown>;
    act(() => {
      scriptPromise = result.current.generateScript(TOPIC_CONFIG);
    });

    // The script step should be processing
    expect(result.current.stepStatuses.script).toBe('processing');

    // Verify the signal was passed to generateAIScript
    expect(generateAIScript).toHaveBeenCalledTimes(1);
    const passedSignal = generateAIScript.mock.calls[0][3];
    expect(passedSignal).toBeInstanceOf(AbortSignal);
    expect(passedSignal.aborted).toBe(false);

    // Cancel the current operation
    act(() => {
      result.current.cancelCurrentOperation();
    });

    // The signal should now be aborted
    expect(passedSignal.aborted).toBe(true);

    // Wait for the promise to settle
    await act(async () => {
      await scriptPromise;
    });

    // Step status should be reset to 'active'
    expect(result.current.stepStatuses.script).toBe('active');
  });

  // ── Requirement 2.2: Cancelling during media sourcing stops new requests ──

  it('cancelling during media sourcing aborts via AbortSignal', async () => {
    const segments = makeSegments(3);

    // Set up resolveTopicContext to return a basic context
    resolveTopicContext.mockResolvedValue({
      topic: 'Test',
      coreSubject: 'Test',
      subjectCandidates: ['Test'],
      kind: 'concept',
      description: 'A test topic',
      entities: [],
      parseReasoning: 'test',
    });

    // planSegmentVisuals returns a basic plan
    planSegmentVisuals.mockResolvedValue({
      segmentId: 'seg-0',
      beat: 'hook',
      entities: [],
      concepts: [{ description: 'test', queries: ['test'], priority: 1, visualType: 'concept' }],
      reasoning: 'test',
      visualAction: 'test',
      queries: ['test'],
      visualConcept: 'test',
    });

    // sourceSegmentMedia hangs until signal is aborted
    let capturedSignal: AbortSignal | undefined;
    sourceSegmentMedia.mockImplementation(
      (...args: unknown[]) => {
        const signal = args[6] as AbortSignal | undefined;
        capturedSignal = signal;
        return new Promise((_resolve, reject) => {
          if (signal?.aborted) {
            reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
            return;
          }
          signal?.addEventListener('abort', () => {
            reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
          });
        });
      },
    );

    const { result } = renderHook(() => useVideoProject());

    // First, generate a script to get a project
    generateAIScript.mockResolvedValue(segments);
    act(() => {
      result.current.setAppConfig({
        openRouterKey: 'test-key',
        sourceType: 'stock',
      });
    });

    await act(async () => {
      await result.current.generateScript(TOPIC_CONFIG);
    });

    // Now start media sourcing (will hang on first sourceSegmentMedia call)
    let mediaPromise: Promise<unknown>;
    act(() => {
      mediaPromise = result.current.sourceMedia();
    });

    // Wait for resolveTopicContext and planSegmentVisuals to complete
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(result.current.stepStatuses.media).toBe('processing');

    // Cancel the current operation
    act(() => {
      result.current.cancelCurrentOperation();
    });

    // The captured signal should be aborted
    expect(capturedSignal?.aborted).toBe(true);

    // Wait for the promise to settle
    await act(async () => {
      await mediaPromise;
    });

    // Step status should be reset to 'active'
    expect(result.current.stepStatuses.media).toBe('active');
  });

  // ── Requirement 2.3: Cancelling during narration stops processing ──

  it('cancelling during narration generation resets step status', async () => {
    const segments = makeSegments(3);

    // Override the speech mocks for this test so loadSpeechVoices hangs,
    // keeping generateNarration paused at the voice-loading step.
    const speech = await import('../../utils/speech');
    const hasSpeechSupportMock = speech.hasSpeechSupport as ReturnType<typeof vi.fn>;
    const loadSpeechVoicesMock = speech.loadSpeechVoices as ReturnType<typeof vi.fn>;

    hasSpeechSupportMock.mockReturnValue(true);

    // Make loadSpeechVoices hang until we resolve it — this keeps
    // generateNarration paused so we can cancel mid-flight.
    let resolveVoices!: (v: unknown[]) => void;
    loadSpeechVoicesMock.mockImplementation(
      () => new Promise<unknown[]>((resolve) => { resolveVoices = resolve; }),
    );

    const { result } = renderHook(() => useVideoProject());

    act(() => {
      result.current.setAppConfig({
        openRouterKey: 'test-key',
        sourceType: 'stock',
      });
    });

    // Generate a script first
    generateAIScript.mockResolvedValue(segments);
    await act(async () => {
      await result.current.generateScript(TOPIC_CONFIG);
    });

    // Start narration generation — it will hang on loadSpeechVoices
    let narrationPromise: Promise<unknown>;
    act(() => {
      narrationPromise = result.current.generateNarration();
    });

    // Allow microtasks to flush so generateNarration reaches loadSpeechVoices
    await act(async () => {
      await new Promise<void>((r) => setTimeout(r, 10));
    });

    // The narration step should be processing
    expect(result.current.stepStatuses.narration).toBe('processing');

    // Cancel the current operation while loadSpeechVoices is pending
    act(() => {
      result.current.cancelCurrentOperation();
    });

    // Resolve loadSpeechVoices so generateNarration can continue and
    // detect the abort signal
    await act(async () => {
      resolveVoices([]);
    });

    // Wait for the promise to settle
    await act(async () => {
      await narrationPromise;
    });

    // Step status should be reset to 'active'
    expect(result.current.stepStatuses.narration).toBe('active');
  });

  // ── Requirement 2.6: Step status resets to 'active' after cancel ──

  it('cancelCurrentOperation resets step status to active and clears progress', async () => {
    // Make generateAIScript hang
    generateAIScript.mockImplementation(
      (_config: TopicConfig, _key: string, _model: unknown, signal?: AbortSignal) => {
        return new Promise((_, reject) => {
          signal?.addEventListener('abort', () => {
            reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
          });
        });
      },
    );

    const { result } = renderHook(() => useVideoProject());

    act(() => {
      result.current.setAppConfig({
        openRouterKey: 'test-key',
        sourceType: 'stock',
      });
    });

    // Start script generation
    let scriptPromise: Promise<unknown>;
    act(() => {
      scriptPromise = result.current.generateScript(TOPIC_CONFIG);
    });

    expect(result.current.stepStatuses.script).toBe('processing');

    // Cancel
    act(() => {
      result.current.cancelCurrentOperation();
    });

    await act(async () => {
      await scriptPromise;
    });

    // Verify status is 'active' and progress is cleared
    expect(result.current.stepStatuses.script).toBe('active');
    expect(result.current.processingProgress).toBe(0);
    expect(result.current.processingMessage).toBe('');
  });

  // ── Requirement 2.5: Cancel mechanism exists for all async steps ──

  it('cancelCurrentOperation is a no-op when nothing is processing', () => {
    const { result } = renderHook(() => useVideoProject());

    // Should not throw
    act(() => {
      result.current.cancelCurrentOperation();
    });

    // All statuses should remain unchanged
    expect(result.current.stepStatuses.topic).toBe('active');
    expect(result.current.stepStatuses.script).toBe('idle');
  });
});
