import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../utils/fetchWithTimeout', () => ({
  fetchWithTimeout: vi.fn(),
}));

vi.mock('../../logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('../../costTracker', () => ({
  trackOpenRouterCost: vi.fn(),
}));

import { fetchWithTimeout } from '../../../utils/fetchWithTimeout';
import { logger } from '../../logger';
import { callLLM } from '../callLLM';
import { DEFAULT_LLM_MODEL, EMPTY_CONTENT_FALLBACK_MODEL } from '../defaultModels';

const mockFetch = vi.mocked(fetchWithTimeout);

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

function chatBody(content: string, model = DEFAULT_LLM_MODEL) {
  return {
    model,
    choices: [{ message: { content, role: 'assistant' } }],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  };
}

describe('callLLM empty-content fallback', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.mocked(logger.warn).mockClear();
    vi.mocked(logger.info).mockClear();
  });

  it('retries once with gpt-4o-mini when primary returns empty content', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(chatBody('', DEFAULT_LLM_MODEL)))
      .mockResolvedValueOnce(
        jsonResponse(chatBody('{"ok":true}', EMPTY_CONTENT_FALLBACK_MODEL)),
      );

    const result = await callLLM(
      [{ role: 'user', content: 'ping' }],
      { apiKey: 'test-key', maxRetries: 1 },
      (content) => JSON.parse(content) as { ok: boolean },
    );

    expect(result.data).toEqual({ ok: true });
    expect(mockFetch).toHaveBeenCalledTimes(2);

    const primaryBody = JSON.parse(String(mockFetch.mock.calls[0][1]?.body));
    const fallbackBody = JSON.parse(String(mockFetch.mock.calls[1][1]?.body));
    expect(primaryBody.model).toBe(DEFAULT_LLM_MODEL);
    expect(fallbackBody.model).toBe(EMPTY_CONTENT_FALLBACK_MODEL);

    expect(logger.warn).toHaveBeenCalledWith(
      'LLM',
      expect.stringContaining(`Empty content from ${DEFAULT_LLM_MODEL}`),
    );
    expect(logger.info).toHaveBeenCalledWith(
      'LLM',
      expect.stringContaining(`fallback succeeded with ${EMPTY_CONTENT_FALLBACK_MODEL}`),
    );
  });

  it('does not fallback-loop when primary model is already the fallback', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(chatBody('', EMPTY_CONTENT_FALLBACK_MODEL)),
    );

    await expect(
      callLLM([{ role: 'user', content: 'ping' }], {
        apiKey: 'test-key',
        model: EMPTY_CONTENT_FALLBACK_MODEL,
        maxRetries: 1,
      }),
    ).rejects.toMatchObject({ code: 'RETRY_EXHAUSTED' });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(logger.warn).not.toHaveBeenCalledWith(
      'LLM',
      expect.stringContaining('Empty content from'),
    );
  });
});
