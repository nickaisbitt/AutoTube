import { describe, it, expect, vi, afterEach } from 'vitest';
import { sourceSegmentMedia, resetUsedUrlsMap } from '../media';
import type { ScriptSegment, SegmentVisualPlan, TopicContext, AppConfig } from '../../types';

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const segment: ScriptSegment = {
  id: 'seg-1',
  type: 'section',
  title: 'Test Segment',
  narration: 'Some narration text',
  visualNote: 'visual note',
  duration: 10,
};

const plan: SegmentVisualPlan = {
  segmentId: 'seg-1',
  beat: 'context',
  entities: [],
  concepts: [],
  shots: [{ concept: 'test shot', queries: ['test query'], vibe: 'neutral' }],
  reasoning: 'test',
  visualAction: 'show test',
  queries: ['test query'],
  visualConcept: 'test concept',
};

const topicContext: TopicContext = {
  topic: 'Test Topic',
  coreSubject: 'Test',
  subjectCandidates: ['Test'],
  kind: 'concept',
  description: 'A test topic',
  entities: [],
  parseReasoning: 'Test reasoning',
};

// Config with API keys set — so fallbacks would normally fire
const configWithPaidKeys: AppConfig = {
  openRouterKey: 'test-openrouter-key',
  sourceType: 'stock',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('harvestMediaWithSafetyNet abort before paid fallbacks', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetUsedUrlsMap();
  });

  it('does not call Firecrawl or Serper when signal is aborted before fallback path', async () => {
    const controller = new AbortController();
    const calledUrls: string[] = [];

    // Mock fetch: free-tier sources return sparse results (< 5 candidates),
    // and we abort the signal when the free-tier calls resolve.
    // Paid sources (Firecrawl, Serper) should NOT be reached.
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
      calledUrls.push(urlStr);

      // DDG local search — return 1 result (sparse, < 5 total)
      if (urlStr.includes('/api/search?q=')) {
        // Abort the signal after free-tier calls start resolving
        // This simulates cancellation between free-tier resolution and fallback check
        controller.abort();
        return {
          ok: true,
          status: 200,
          json: async () => ({
            results: [{
              image: 'https://example.com/img1.jpg',
              title: 'Test Image',
              url: 'https://example.com',
              width: 1280,
              height: 720,
            }],
          }),
        };
      }

      // DDG video search — return empty
      if (urlStr.includes('/api/search-videos')) {
        return { ok: true, status: 200, json: async () => ({ results: [] }) };
      }

      // Wikimedia — return empty
      if (urlStr.includes('commons.wikimedia.org')) {
        return { ok: true, status: 200, json: async () => ({}) };
      }

      // Firecrawl — should NOT be reached
      if (urlStr.includes('firecrawl.dev')) {
        return { ok: true, status: 200, json: async () => ({ success: true, data: { images: [] } }) };
      }

      // Serper — should NOT be reached
      if (urlStr.includes('serper.dev')) {
        return { ok: true, status: 200, json: async () => ({ images: [] }) };
      }

      // Default: 404
      return { ok: false, status: 404, json: async () => ({}) };
    }));

    await sourceSegmentMedia(
      segment,
      plan,
      topicContext,
      new Set(),
      0,
      configWithPaidKeys,
      controller.signal,
    );

    // Verify paid APIs were never called
    const firecrawlCalls = calledUrls.filter(u => u.includes('firecrawl.dev'));
    const serperCalls = calledUrls.filter(u => u.includes('serper.dev'));

    expect(firecrawlCalls).toHaveLength(0);
    expect(serperCalls).toHaveLength(0);
  });
});
