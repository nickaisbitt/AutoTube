/**
 * Shared LLM call wrapper — handles retry, timeout, JSON parsing.
 */

import { fetchWithTimeout } from '../../utils/fetchWithTimeout';
import { withRetry } from '../../utils/withRetry';
import { logger } from '../logger';
import { trackOpenRouterCost } from '../costTracker';
import { DEFAULT_LLM_MODEL } from './defaultModels';

const DEFAULT_ENDPOINT = '/api/llm';
const DEFAULT_MODEL = DEFAULT_LLM_MODEL;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 3;

export interface LLMConfig {
  apiKey: string;
  model?: string;
  endpoint?: string;
  timeoutMs?: number;
  maxRetries?: number;
  signal?: AbortSignal;
}

export interface LLMResponse<T> {
  data: T;
  usage?: { promptTokens: number; completionTokens: number };
}

/**
 * Shared LLM call function with retry, timeout, and JSON parsing.
 *
 * Sends messages to the configured LLM endpoint and returns the raw
 * content string. Uses `fetchWithTimeout` for per-attempt timeout and
 * `withRetry` for retry logic with exponential backoff.
 *
 * @param messages - Array of chat messages to send
 * @param config - LLM configuration (API key, model, endpoint, etc.)
 * @param parser - Optional parser function to transform the raw content string
 * @returns Parsed response data
 */
export async function callLLM<T = string>(
  messages: Array<{ role: string; content: string }>,
  config: LLMConfig,
  parser?: (content: string) => T,
): Promise<LLMResponse<T>> {
  const endpoint = config.endpoint ?? DEFAULT_ENDPOINT;
  const model = config.model ?? DEFAULT_MODEL;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
  const signal = config.signal;

  // Bail immediately if already aborted
  if (signal?.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError');
  }

  const result = await withRetry(
    async () => {
      const response = await fetchWithTimeout(
        endpoint,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://autotube.video',
            'X-Title': 'AutoTube AI Generator',
          },
          body: JSON.stringify({
            model,
            messages,
            response_format: { type: 'json_object' },
          }),
        },
        {
          timeoutMs,
          maxRetries: 1, // fetchWithTimeout handles per-attempt timeout; withRetry handles retries
          signal,
        },
      );

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`LLM API Error (${response.status}): ${err}`);
      }

      const data = await response.json();
      const rawContent: unknown = data?.choices?.[0]?.message?.content;

      if (typeof rawContent !== 'string' || !rawContent.trim()) {
        throw new Error('LLM returned empty response');
      }

      const content = rawContent.trim();
      const parsed: T = parser ? parser(content) : (content as unknown as T);

      const usage = data?.usage
        ? {
            promptTokens: data.usage.prompt_tokens ?? 0,
            completionTokens: data.usage.completion_tokens ?? 0,
          }
        : undefined;

      if (usage) {
        try {
          trackOpenRouterCost(model, usage.promptTokens, usage.completionTokens, `LLM call: ${messages[0]?.content?.substring(0, 50) || 'unnamed'}`);
        } catch {
          // cost tracking is best-effort
        }
      }

      return { data: parsed, usage };
    },
    {
      maxRetries: maxRetries - 1, // withRetry counts retries after initial attempt
      backoff: 'exponential',
      baseDelayMs: 1000,
      signal,
      onRetry: (attempt, error) => {
        logger.warn('LLM', `Retry attempt ${attempt}: ${(error as Error).message}`);
      },
    },
  );

  return result;
}
