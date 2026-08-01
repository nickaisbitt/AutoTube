import '../../store/__tests__/storeHookMocks';
import { makeHookSafeSegments } from '../../store/__tests__/storeHookTestHelpers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVideoProject } from '../../store';
import type { TopicConfig } from '../../types';

const TOPIC_CONFIG: TopicConfig = {
  topic: 'Test Topic',
  style: 'business_insider',
  targetDuration: 3,
  tone: 'informative',
  audience: 'General audience',
};

describe('sourceMedia store merge persists gate fields', () => {
  let generateAIScript: ReturnType<typeof vi.fn>;
  let sourceSegmentMedia: ReturnType<typeof vi.fn>;
  let resolveTopicContext: ReturnType<typeof vi.fn>;
  let planSegmentVisuals: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });

    // Force visual beats ON via sessionStorage (checked before env — avoids parallel-test env races)
    process.env.AUTOTUBE_VISUAL_BEATS = '1';
    process.env.VITE_AUTOTUBE_VISUAL_BEATS = '1';

    vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key: string) => {
      if (key === 'autotube_loop_fast_mode') return 'true';
      if (key === 'autotube_visual_beats') return 'true';
      return null;
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {});

    const llm = await import('../../services/llm');
    const media = await import('../../services/media');
    const vp = await import('../../services/visualPlanner');

    generateAIScript = llm.generateAIScript as ReturnType<typeof vi.fn>;
    sourceSegmentMedia = media.sourceSegmentMedia as ReturnType<typeof vi.fn>;
    resolveTopicContext = vp.resolveTopicContext as ReturnType<typeof vi.fn>;
    planSegmentVisuals = vp.planSegmentVisuals as ReturnType<typeof vi.fn>;

    resolveTopicContext.mockResolvedValue({
      topic: 'Test',
      coreSubject: 'Test',
      subjectCandidates: ['Test'],
      kind: 'concept',
      description: 'A test topic',
      entities: [],
      parseReasoning: 'test',
    });

    planSegmentVisuals.mockImplementation(async (seg: { id: string }) => ({
      segmentId: seg.id,
      beat: 'hook',
      entities: [],
      concepts: [{ description: 'test', queries: ['test'], priority: 1, visualType: 'concept' }],
      reasoning: 'test',
      visualAction: 'test',
      queries: ['test'],
      visualConcept: 'test',
    }));

    sourceSegmentMedia.mockResolvedValue({
      assets: [
        {
          url: 'https://example.com/img.jpg',
          alt: 'test',
          source: 'test',
          concept: 'test',
          score: 80,
        },
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete process.env.AUTOTUBE_VISUAL_BEATS;
    delete process.env.VITE_AUTOTUBE_VISUAL_BEATS;
  });

  it('persists visualBeatSheet from orchestrator onto project state', async () => {
    const segments = makeHookSafeSegments(2);
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

    await act(async () => {
      await result.current.sourceMedia();
    });

    expect(result.current.stepStatuses.media).toBe('complete');
    // Critical: gate field must not be dropped by the store merge
    expect(result.current.project?.visualBeatSheet).toBeTruthy();
    expect(result.current.project?.visualBeatSheet?.beats?.length).toBeGreaterThan(0);
    expect(result.current.project?.visualBeatSheet?.topic).toBeTruthy();
  });
});
