import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseSegmentsFromContent, validateSegment, generateAIScript } from '../llm/index';

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

// ---------------------------------------------------------------------------
// parseSegmentsFromContent
// ---------------------------------------------------------------------------

describe('parseSegmentsFromContent', () => {
  const validSegmentJson = '{"type":"intro","title":"T","narration":"N","visualNote":"V","duration":10}';

  it('3.2 parses a bare JSON array', () => {
    const input = `[${validSegmentJson}]`;
    const result = parseSegmentsFromContent(input);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('intro');
    expect(result[0].title).toBe('T');
    expect(result[0].narration).toBe('N');
    expect(result[0].visualNote).toBe('V');
    expect(result[0].duration).toBe(10);
  });

  it('3.3 parses markdown-fenced JSON', () => {
    const input = '```json\n[' + validSegmentJson + ']\n```';
    const result = parseSegmentsFromContent(input);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('intro');
  });

  it('3.4 unwraps {"segments":[...]} wrapper', () => {
    const input = `{"segments":[${validSegmentJson}]}`;
    const result = parseSegmentsFromContent(input);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('intro');
  });

  it('3.5 extracts JSON array embedded in prose text', () => {
    const input = `Here is the script: [${validSegmentJson}] That is all.`;
    const result = parseSegmentsFromContent(input);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('intro');
  });

  it('3.6 throws on empty array', () => {
    expect(() => parseSegmentsFromContent('[]')).toThrow(/empty/i);
  });

  it('3.7 throws on non-JSON string', () => {
    expect(() => parseSegmentsFromContent('Sorry, I cannot help.')).toThrow(
      /parseable JSON/i,
    );
  });
});

// ---------------------------------------------------------------------------
// validateSegment
// ---------------------------------------------------------------------------

describe('validateSegment', () => {
  const base = {
    type: 'intro',
    title: 'My Title',
    narration: 'Some narration text.',
    visualNote: 'Some visual note.',
    duration: 15,
  };

  it('3.8 defaults type to "section" for unknown type', () => {
    const result = validateSegment({ ...base, type: 'unknown' }, 0);
    expect(result.type).toBe('section');
  });

  it('3.9 defaults duration to 10 for negative duration', () => {
    const result = validateSegment({ ...base, duration: -5 }, 0);
    expect(result.duration).toBe(10);
  });

  it('3.10 defaults duration to 10 for zero duration', () => {
    const result = validateSegment({ ...base, duration: 0 }, 0);
    expect(result.duration).toBe(10);
  });

  it('3.11 defaults narration to "${title}." for empty narration', () => {
    const result = validateSegment({ ...base, narration: '' }, 0);
    expect(result.narration).toBe(`${base.title}.`);
  });

  it('3.12 defaults title to "Segment 1" for empty title at index 0', () => {
    const result = validateSegment({ ...base, title: '' }, 0);
    expect(result.title).toBe('Segment 1');
  });

  it('3.13 preserves all fields when input is fully valid', () => {
    const result = validateSegment(base, 0);
    expect(result.type).toBe('intro');
    expect(result.title).toBe('My Title');
    expect(result.narration).toBe('Some narration text.');
    expect(result.visualNote).toBe('Some visual note.');
    expect(result.duration).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// generateAIScript — retry logic (via mocked fetch)
// ---------------------------------------------------------------------------

describe('generateAIScript', () => {
  const validContent = JSON.stringify([
    { type: 'intro', title: 'T', narration: 'N', visualNote: 'V', duration: 10 },
  ]);

  const okResponse = {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: validContent } }],
    }),
    text: async () => '',
  };

  const config = {
    topic: 'Test topic',
    style: 'business_insider' as const,
    targetDuration: 5,
    tone: 'informative' as const,
    audience: 'general',
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('10.2 throws AbortError with pre-aborted signal without making a network call', async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    const controller = new AbortController();
    controller.abort(); // pre-abort

    await expect(
      generateAIScript(config, 'test-api-key', undefined, controller.signal),
    ).rejects.toThrow('The operation was aborted.');

    // fetchTopicContext may still fire (it runs before the guard), but the
    // OpenRouter call must NOT happen.  fetchTopicContext uses plain `fetch`,
    // while the OpenRouter call goes through `fetchWithTimeout` which posts to
    // the OPENROUTER_ENDPOINT.  Verify no call was made to that endpoint.
    const openRouterCalls = mockFetch.mock.calls.filter(
      (args: unknown[]) => typeof args[0] === 'string' && (args[0] as string).includes('openrouter'),
    );
    expect(openRouterCalls).toHaveLength(0);
  });

  it('3.14 retries on 429 and succeeds on second attempt', async () => {
    const mockFetch = vi
      .fn()
      // First call: fetchWikiContext opensearch (returns non-ok, silently ignored)
      .mockResolvedValueOnce({ ok: false, status: 404, text: async () => '' })
      // Second call: fetchTopicContext (returns non-ok, silently ignored)
      .mockResolvedValueOnce({ ok: false, status: 404, text: async () => '' })
      // Third call: YouTube SEO search (returns non-ok, silently ignored)
      .mockResolvedValueOnce({ ok: false, status: 404, text: async () => '' })
      // Fourth call: OpenRouter attempt 1 → 429
      .mockResolvedValueOnce({ ok: false, status: 429, text: async () => 'rate limited' })
      // Fifth call: OpenRouter attempt 2 → success
      .mockResolvedValueOnce(okResponse);

    vi.stubGlobal('fetch', mockFetch);

    const promise = generateAIScript(config, 'test-api-key');

    // Advance timers to skip the retry delay (1000ms for attempt 1)
    await vi.runAllTimersAsync();

    const segments = await promise;
    expect(segments).toHaveLength(1);
    expect(segments[0].type).toBe('intro');
    expect(mockFetch).toHaveBeenCalledTimes(5);
  });

  it('3.15 throws after exhausting all retries on 500', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'internal server error',
    });

    vi.stubGlobal('fetch', mockFetch);

    // Attach rejection handler immediately before advancing timers
    const promise = generateAIScript(config, 'test-api-key');
    const rejection = expect(promise).rejects.toThrow();

    // Advance timers to skip all retry delays
    await vi.runAllTimersAsync();

    await rejection;
    // 1 call for fetchWikiContext opensearch + 1 call for fetchTopicContext + 1 call for YouTube SEO + maxRetries = 3 for OpenRouter = 6 total
    expect(mockFetch).toHaveBeenCalledTimes(6);
  });
});
