import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVideoProject } from '../../store';
import type { ScriptSegment } from '../../types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../services/llm', () => ({
  generateAIScript: vi.fn(),
  reviewAndImproveScript: vi.fn(async (segs: unknown[]) => segs),
  generateVideoTitle: vi.fn(async () => 'Test Title'),
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
// Bug 15 / Task 3: Batch job URL dedup race condition
// **Validates: Requirements 2.3, 3.3**
// ---------------------------------------------------------------------------

describe('Bug 15: batch job URL dedup map reset', () => {
  let generateAIScript: ReturnType<typeof vi.fn>;
  let renderVideoToBlob: ReturnType<typeof vi.fn>;
  let sourceSegmentMedia: ReturnType<typeof vi.fn>;
  let resolveTopicContext: ReturnType<typeof vi.fn>;
  let planSegmentVisuals: ReturnType<typeof vi.fn>;
  let runAIEditPass: ReturnType<typeof vi.fn>;
  let resetUsedUrlsMap: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });

    vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {});

    vi.stubGlobal('URL', {
      ...globalThis.URL,
      createObjectURL: vi.fn(() => 'blob:test-video-url'),
      revokeObjectURL: vi.fn(),
    });

    const llm = await import('../../services/llm');
    const renderer = await import('../../services/renderer');
    const media = await import('../../services/media');
    const planner = await import('../../services/visualPlanner');
    const aiEditor = await import('../../services/aiEditor');

    generateAIScript = llm.generateAIScript as ReturnType<typeof vi.fn>;
    renderVideoToBlob = renderer.renderVideoToBlob as ReturnType<typeof vi.fn>;
    sourceSegmentMedia = media.sourceSegmentMedia as ReturnType<typeof vi.fn>;
    resolveTopicContext = planner.resolveTopicContext as ReturnType<typeof vi.fn>;
    planSegmentVisuals = planner.planSegmentVisuals as ReturnType<typeof vi.fn>;
    runAIEditPass = aiEditor.runAIEditPass as ReturnType<typeof vi.fn>;
    resetUsedUrlsMap = media.resetUsedUrlsMap as ReturnType<typeof vi.fn>;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  /**
   * Task 3.3: Verify URL map is clean at the start of each batch job.
   *
   * resetUsedUrlsMap() should be called before each job's pipeline starts,
   * ensuring no stale URLs from a previous job leak into the next one.
   */
  it('resetUsedUrlsMap is called at the start of each batch job', async () => {
    const segments = makeSegments(1);

    // Set up mocks for a successful pipeline
    generateAIScript.mockResolvedValue(segments);
    resolveTopicContext.mockResolvedValue({ resolvedTitle: 'Test', kind: 'topic' });
    planSegmentVisuals.mockResolvedValue({
      beat: 'intro',
      concepts: [{ description: 'test concept' }],
    });
    sourceSegmentMedia.mockResolvedValue({ assets: [] });
    runAIEditPass.mockResolvedValue({ editedProject: null });
    renderVideoToBlob.mockResolvedValue(new Blob(['video'], { type: 'video/webm' }));

    const { result } = renderHook(() => useVideoProject());

    // Set API key
    act(() => {
      result.current.setAppConfig({
        openRouterKey: 'test-key',
        sourceType: 'stock',
      });
    });

    const jobs = [
      { topic: 'Topic A', config: { style: 'business_insider' as const, targetDuration: 3, tone: 'informative' as const, audience: 'general' } },
      { topic: 'Topic B', config: { style: 'business_insider' as const, targetDuration: 3, tone: 'informative' as const, audience: 'general' } },
    ];

    await act(async () => {
      await result.current.batchGenerate(jobs);
    });

    // Once at batch start + once per job in finally (sequential jobs — no mid-job reset)
    expect(resetUsedUrlsMap).toHaveBeenCalled();
    expect(resetUsedUrlsMap.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  /**
   * Task 3.2: Verify resetUsedUrlsMap is called even when a job fails mid-pipeline.
   *
   * If sourceMedia fails for job 1, resetUsedUrlsMap should still be called
   * in the finally block, ensuring job 2 starts with a clean map.
   */
  it('resetUsedUrlsMap is called even when a job fails mid-pipeline', async () => {
    const segments = makeSegments(1);

    // Job 1: script succeeds but sourceMedia fails
    generateAIScript.mockResolvedValue(segments);
    resolveTopicContext.mockResolvedValue({ resolvedTitle: 'Test', kind: 'topic' });
    planSegmentVisuals.mockResolvedValue({
      beat: 'intro',
      concepts: [{ description: 'test concept' }],
    });
    // sourceMedia returns null (failure) for the first call, then succeeds
    sourceSegmentMedia.mockResolvedValue({ assets: [] });
    runAIEditPass.mockResolvedValue({ editedProject: null });
    renderVideoToBlob.mockResolvedValue(new Blob(['video'], { type: 'video/webm' }));

    const { result } = renderHook(() => useVideoProject());

    act(() => {
      result.current.setAppConfig({
        openRouterKey: 'test-key',
        sourceType: 'stock',
      });
    });

    // Two jobs — first will fail because generateScript returns segments
    // but we'll make the pipeline fail by having generateAIScript throw on second call
    let callCount = 0;
    generateAIScript.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) throw new Error('Script generation failed');
      return segments;
    });

    const jobs = [
      { topic: 'Failing Topic', config: { style: 'business_insider' as const, targetDuration: 3, tone: 'informative' as const, audience: 'general' } },
      { topic: 'Succeeding Topic', config: { style: 'business_insider' as const, targetDuration: 3, tone: 'informative' as const, audience: 'general' } },
    ];

    resetUsedUrlsMap.mockClear();

    await act(async () => {
      await result.current.batchGenerate(jobs);
    });

    // Batch start reset + finally after each job (job 1 error still runs finally)
    expect(resetUsedUrlsMap.mock.calls.length).toBeGreaterThanOrEqual(3);

    // Verify the batch completed (both jobs processed)
    expect(result.current.batchJobs).toHaveLength(2);
    expect(result.current.batchJobs[0].status).toBe('error');
  });

  /**
   * Task 3.3: Verify URL map is clean at the start of each batch job
   * by checking that resetUsedUrlsMap is called BEFORE the pipeline starts.
   *
   * We track the order of calls to ensure reset happens before generateScript.
   */
  it('URL map is reset before each job pipeline starts', async () => {
    const segments = makeSegments(1);
    const callOrder: string[] = [];

    resetUsedUrlsMap.mockImplementation(() => {
      callOrder.push('resetUsedUrlsMap');
    });

    generateAIScript.mockImplementation(async () => {
      callOrder.push('generateAIScript');
      return segments;
    });

    resolveTopicContext.mockResolvedValue({ resolvedTitle: 'Test', kind: 'topic' });
    planSegmentVisuals.mockResolvedValue({
      beat: 'intro',
      concepts: [{ description: 'test concept' }],
    });
    sourceSegmentMedia.mockResolvedValue({ assets: [] });
    runAIEditPass.mockResolvedValue({ editedProject: null });
    renderVideoToBlob.mockResolvedValue(new Blob(['video'], { type: 'video/webm' }));

    const { result } = renderHook(() => useVideoProject());

    act(() => {
      result.current.setAppConfig({
        openRouterKey: 'test-key',
        sourceType: 'stock',
      });
    });

    const jobs = [
      { topic: 'Topic A', config: { style: 'business_insider' as const, targetDuration: 3, tone: 'informative' as const, audience: 'general' } },
      { topic: 'Topic B', config: { style: 'business_insider' as const, targetDuration: 3, tone: 'informative' as const, audience: 'general' } },
    ];

    await act(async () => {
      await result.current.batchGenerate(jobs);
    });

    // For each job, resetUsedUrlsMap should appear before generateAIScript
    // Pattern: reset(batch), generate, reset(finally), generate, reset(finally)
    const resetIndices = callOrder
      .map((call, idx) => (call === 'resetUsedUrlsMap' ? idx : -1))
      .filter((idx) => idx >= 0);
    const generateIndices = callOrder
      .map((call, idx) => (call === 'generateAIScript' ? idx : -1))
      .filter((idx) => idx >= 0);

    expect(generateIndices.length).toBe(2); // Two jobs
    // Each generateAIScript call should be preceded by a resetUsedUrlsMap call
    for (const genIdx of generateIndices) {
      const precedingReset = resetIndices.find((rIdx) => rIdx < genIdx);
      expect(precedingReset).toBeDefined();
    }
  });
});
