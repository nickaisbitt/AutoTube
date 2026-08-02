/**
 * Shared LLM call wrapper — handles retry, timeout, JSON parsing.
 */

import { fetchWithTimeout } from '../../utils/fetchWithTimeout';
import { withRetry } from '../../utils/withRetry';
import { openRouterMessageText } from '../../utils/openRouterMessageText';
import { logger } from '../logger';
import { trackOpenRouterCost } from '../costTracker';
import { DEFAULT_LLM_MODEL, EMPTY_CONTENT_FALLBACK_MODEL } from './defaultModels';

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

type ChatMessage = { role: string; content: string };

async function postChatCompletion(
  endpoint: string,
  model: string,
  messages: ChatMessage[],
  apiKey: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<{ content: string; usage?: LLMResponse<unknown>['usage']; rawModel: string }> {
  const response = await fetchWithTimeout(
    endpoint,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
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
  const content = openRouterMessageText(data?.choices?.[0]?.message);
  const usage = data?.usage
    ? {
        promptTokens: data.usage.prompt_tokens ?? 0,
        completionTokens: data.usage.completion_tokens ?? 0,
      }
    : undefined;

  return { content, usage, rawModel: model };
}

/**
 * Shared LLM call function with retry, timeout, and JSON parsing.
 *
 * Sends messages to the configured LLM endpoint and returns the raw
 * content string. Uses `fetchWithTimeout` for per-attempt timeout and
 * `withRetry` for retry logic with exponential backoff.
 *
 * When the primary model returns HTTP 200 with empty `content` (typical of
 * reasoning models that only emit `reasoning`), retries once with
 * {@link EMPTY_CONTENT_FALLBACK_MODEL} before surfacing the empty-response error.
 *
 * @param messages - Array of chat messages to send
 * @param config - LLM configuration (API key, model, endpoint, etc.)
 * @param parser - Optional parser function to transform the raw content string
 * @returns Parsed response data
 */
export async function callLLM<T = string>(
  messages: ChatMessage[],
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
      let usedModel = model;
      let { content, usage } = await postChatCompletion(
        endpoint,
        model,
        messages,
        config.apiKey,
        timeoutMs,
        signal,
      );

      if (!content && model !== EMPTY_CONTENT_FALLBACK_MODEL) {
        logger.warn(
          'LLM',
          `Empty content from ${model} (HTTP 200); retrying once with fallback ${EMPTY_CONTENT_FALLBACK_MODEL}`,
        );
        const fallback = await postChatCompletion(
          endpoint,
          EMPTY_CONTENT_FALLBACK_MODEL,
          messages,
          config.apiKey,
          timeoutMs,
          signal,
        );
        content = fallback.content;
        usage = fallback.usage;
        usedModel = EMPTY_CONTENT_FALLBACK_MODEL;
        if (content) {
          logger.info(
            'LLM',
            `Empty-content fallback succeeded with ${EMPTY_CONTENT_FALLBACK_MODEL}`,
          );
        }
      }

      if (!content) {
        throw new Error('LLM returned empty response');
      }

      const parsed: T = parser ? parser(content) : (content as unknown as T);

      if (usage) {
        try {
          trackOpenRouterCost(
            usedModel,
            usage.promptTokens,
            usage.completionTokens,
            `LLM call: ${messages[0]?.content?.substring(0, 50) || 'unnamed'}`,
          );
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
