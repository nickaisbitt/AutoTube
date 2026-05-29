import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVideoProject } from '../../store';
import type { TopicConfig, ScriptSegment } from '../../types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../services/llm', () => ({
  generateAIScript: vi.fn(),
  reviewAndImproveScript: vi.fn(async (segs: unknown[]) => segs),
  refineScriptMultiPass: vi.fn(async (segs: unknown[]) => segs),
  generateVideoTitle: vi.fn(async () => 'Test Title'),
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

vi.mock('../../services/seoTitles', () => ({
  extractHookLine: vi.fn(() => 'Hook line'),
}));

vi.mock('../../services/blindReview', () => ({
  runBlindReview: vi.fn(),
}));

vi.mock('../../services/projectMigrations', () => ({
  CURRENT_PROJECT_VERSION: 1,
  migrateProject: vi.fn((p: unknown) => p),
}));

vi.mock('../../services/tts', () => ({
  generateGrokTts: vi.fn(),
  generateMeloTts: vi.fn(),
}));

vi.mock('../../services/tts', () => ({}));

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
// Bug 1: sourcingRef not reset on abort (store.ts)
// **Validates: Requirements 2.1**
// ---------------------------------------------------------------------------

describe('Bug 1: sourcingRef reset on abort', () => {
  let generateAIScript: ReturnType<typeof vi.fn>;
  let sourceSegmentMedia: ReturnType<typeof vi.fn>;
  let resolveTopicContext: ReturnType<typeof vi.fn>;
  let planSegmentVisuals: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });

    vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {});

    const llm = await import('../../services/llm');
    const media = await import('../../services/media');
    const vp = await import('../../services/visualPlanner');

    generateAIScript = llm.generateAIScript as ReturnType<typeof vi.fn>;
    sourceSegmentMedia = media.sourceSegmentMedia as ReturnType<typeof vi.fn>;
    resolveTopicContext = vp.resolveTopicContext as ReturnType<typeof vi.fn>;
    planSegmentVisuals = vp.planSegmentVisuals as ReturnType<typeof vi.fn>;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * Task 1.3: abort sourceMedia → verify sourcingRef.current is false
   *
   * After aborting media sourcing, the user should be able to call sourceMedia
   * again (i.e., sourcingRef.current must be false). We verify this by:
   * 1. Starting sourceMedia
   * 2. Aborting it
   * 3. Calling sourceMedia again — if sourcingRef were stuck at true, the
   *    second call would return null immediately without entering processing.
   */
  it('abort during sourceMedia resets sourcingRef so subsequent calls succeed', async () => {
    const segments = makeSegments(2);

    // resolveTopicContext hangs until abort
    resolveTopicContext.mockImplementation(
      (_topic: string, signal?: AbortSignal) =>
        new Promise((_resolve, reject) => {
          if (signal?.aborted) {
            reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
            return;
          }
          signal?.addEventListener('abort', () => {
            reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
          });
        }),
    );

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

    sourceSegmentMedia.mockResolvedValue({ assets: [] });

    const { result } = renderHook(() => useVideoProject());

    // Set API key
    act(() => {
      result.current.setAppConfig({
        openRouterKey: 'test-key',
        sourceType: 'stock',
      });
    });

    // Generate a script to get a project
    generateAIScript.mockResolvedValue(segments);
    await act(async () => {
      await result.current.generateScript(TOPIC_CONFIG);
    });

    expect(result.current.project).not.toBeNull();

    // Start media sourcing (will hang on resolveTopicContext)
    let mediaPromise: Promise<unknown>;
    act(() => {
      mediaPromise = result.current.sourceMedia();
    });

    // Wait a tick for the async function to enter
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    expect(result.current.stepStatuses.media).toBe('processing');

    // Cancel the operation
    act(() => {
      result.current.cancelCurrentOperation();
    });

    // Wait for the promise to settle
    await act(async () => {
      await mediaPromise!;
    });

    // Step status should be reset
    expect(result.current.stepStatuses.media).toBe('active');

    // Now verify sourcingRef is false by calling sourceMedia again.
    // If sourcingRef were stuck at true, this would return null immediately
    // and media status would stay 'active' (not 'processing').
    resolveTopicContext.mockResolvedValue({
      topic: 'Test',
      coreSubject: 'Test',
      subjectCandidates: ['Test'],
      kind: 'concept',
      description: 'A test topic',
      entities: [],
      parseReasoning: 'test',
    });

    sourceSegmentMedia.mockResolvedValue({
      assets: [{ url: 'https://example.com/img.jpg', alt: 'test', source: 'test', concept: 'test' }],
    });

    let secondMediaPromise: Promise<unknown>;
    act(() => {
      secondMediaPromise = result.current.sourceMedia();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    // The second call should have entered processing — proving sourcingRef was reset
    // (If sourcingRef were stuck, it would have returned null and status would remain 'active')
    await act(async () => {
      await secondMediaPromise!;
    });

    // Media step should have completed successfully
    expect(result.current.stepStatuses.media).toBe('complete');
  });

  /**
   * Task 1.1: safety timeout resets sourcingRef after 60s
   *
   * If sourceMedia gets stuck (e.g., a promise never resolves and never rejects),
   * the safety timeout should reset sourcingRef.current after 60 seconds.
   */
  it('safety timeout resets sourcingRef after 60s if stuck', async () => {
    const segments = makeSegments(1);

    // resolveTopicContext never resolves or rejects (simulates stuck state)
    resolveTopicContext.mockImplementation(
      () => new Promise(() => {}), // never settles
    );

    const { result } = renderHook(() => useVideoProject());

    act(() => {
      result.current.setAppConfig({
        openRouterKey: 'test-key',
        sourceType: 'stock',
      });
    });

    generateAIScript.mockResolvedValue(segments);
    await act(async () => {
      await result.current.generateScript(TOPIC_CONFIG);
    });

    // Start media sourcing (will hang forever on resolveTopicContext)
    act(() => {
      result.current.sourceMedia();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });

    expect(result.current.stepStatuses.media).toBe('processing');

    // A second call should be blocked because sourcingRef is true
    let secondResult: unknown;
    act(() => {
      secondResult = result.current.sourceMedia();
    });

    // The second call returns null immediately (guard check)
    await act(async () => {
      const resolved = await (secondResult as Promise<unknown>);
      expect(resolved).toBeNull();
    });

    // Advance time past the 60s safety timeout
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    // Now a third call should succeed because the safety timeout reset sourcingRef
    // We make resolveTopicContext resolve this time
    resolveTopicContext.mockResolvedValue({
      topic: 'Test',
      coreSubject: 'Test',
      subjectCandidates: ['Test'],
      kind: 'concept',
      description: 'A test topic',
      entities: [],
      parseReasoning: 'test',
    });

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

    sourceSegmentMedia.mockResolvedValue({
      assets: [{ url: 'https://example.com/img.jpg', alt: 'test', source: 'test', concept: 'test' }],
    });

    let thirdPromise: Promise<unknown>;
    act(() => {
      thirdPromise = result.current.sourceMedia();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    await act(async () => {
      await thirdPromise!;
    });

    // The third call should have completed — proving the safety timeout worked
    expect(result.current.stepStatuses.media).toBe('complete');
  });
});
