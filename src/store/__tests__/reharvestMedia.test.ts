import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { VideoProject, AppConfig } from '../../types';
import { applyQualityRecommendations } from '../pipeline/orchestrator';

vi.mock('../../services/media', () => ({
  sourceSegmentMedia: vi.fn(async () => ({
    assets: [
      {
        url: 'https://cdn.example.com/reharvested.jpg',
        alt: 'reharvested',
        source: 'wikimedia',
        concept: 'reharvested',
        score: 90,
      },
    ],
  })),
  replaceMediaAsset: vi.fn(),
  resetUsedUrlsMap: vi.fn(),
}));

vi.mock('../../services/visualPlanner', () => ({
  resolveTopicContext: vi.fn(async () => ({
    topic: 'Test',
    coreSubject: 'Test',
    subjectCandidates: ['Test'],
    kind: 'concept',
    description: 'A test topic',
    entities: [],
    parseReasoning: 'test',
  })),
  planSegmentVisuals: vi.fn(async (seg: { id: string }) => ({
    segmentId: seg.id,
    beat: 'hook',
    entities: [],
    concepts: [{ description: 'test', queries: ['test'], priority: 1, visualType: 'concept' }],
    reasoning: 'test',
    visualAction: 'test',
    queries: ['test'],
    visualConcept: 'test',
  })),
}));

vi.mock('../../services/llm', () => ({
  refineScriptMultiPass: vi.fn(async (segs: unknown) => segs),
}));

function makeProject(): VideoProject {
  return {
    version: 1,
    id: 'p1',
    title: 'T',
    topic: 'Cybersecurity',
    style: 'business_insider',
    targetDuration: 30,
    script: [
      {
        id: 'seg-1',
        type: 'intro',
        title: 'A',
        narration: 'Your bank account is at risk from hackers.',
        visualNote: 'v',
        duration: 10,
      },
    ],
    media: [
      {
        id: 'a1',
        segmentId: 'seg-1',
        url: 'https://placeholder.com/x.jpg',
        alt: 'x',
        source: 'placeholder',
        concept: 'x',
        isFallback: true,
      },
    ],
    narration: [],
    status: 'draft',
    createdAt: new Date(),
  };
}

describe('applyQualityRecommendations reharvest_media', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('re-sources media via executeSourceMedia for reharvest_media', async () => {
    sessionStorage.setItem('autotube_loop_fast_mode', 'true');

    const appConfig: AppConfig = { openRouterKey: 'k', sourceType: 'stock' };
    const callbacks = {
      setProcessingProgress: vi.fn(),
      setProcessingMessage: vi.fn(),
    };
    const signal = new AbortController().signal;

    const result = await applyQualityRecommendations(
      makeProject(),
      [{ action: 'reharvest_media', reason: 'too many placeholders' }],
      appConfig,
      signal,
      callbacks,
    );

    expect(callbacks.setProcessingMessage).toHaveBeenCalledWith(
      expect.stringMatching(/re-harvest/i),
    );
    expect(result.media.some((a) => a.url.includes('cdn.example.com'))).toBe(true);
  });
});
