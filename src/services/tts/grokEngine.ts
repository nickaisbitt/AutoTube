/**
 * Grok TTS engine implementation.
 *
 * Uses the xAI TTS API (https://api.x.ai/v1/tts) to generate narration audio.
 * Returns blob URLs to MP3 audio for use in the browser narration pipeline.
 */

import { withRetry } from '../../utils/withRetry';
import { logger } from '../logger';
import type { TTSConfig, TTSEngine } from './interface';

const XAI_TTS_ENDPOINT = 'https://api.x.ai/v1/tts';
const DEFAULT_VOICE = 'Sal';
const TTS_TIMEOUT_MS = 30_000;

export const GROK_VOICES = [
  { id: 'Eve', description: 'Energetic & upbeat' },
  { id: 'Ara', description: 'Warm & friendly' },
  { id: 'Leo', description: 'Authoritative & strong' },
  { id: 'Rex', description: 'Confident & clear' },
  { id: 'Sal', description: 'Smooth & balanced' },
] as const;

export type GrokVoiceId = (typeof GROK_VOICES)[number]['id'];

export const grokEngine: TTSEngine = {
  name: 'grok',
  voices: GROK_VOICES,

  isAvailable(config: TTSConfig): boolean {
    return !!config.xaiApiKey;
  },

  async generate(
    text: string,
    voice: string,
    options?: {
      signal?: AbortSignal;
      apiKey?: string;
      serverUrl?: string;
      cloudflareAccountId?: string;
      cloudflareApiToken?: string;
    },
  ): Promise<string | null> {
    const selectedVoice = voice || DEFAULT_VOICE;
    const apiKey = options?.apiKey || _currentApiKey;
    if (!apiKey) {
      logger.error('GrokTTS', 'No API key available');
      return null;
    }

    try {
      const result = await withRetry(
        async () => {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), TTS_TIMEOUT_MS);

          // Link external signal
          if (options?.signal) {
            if (options.signal.aborted) {
              clearTimeout(timeoutId);
              throw new DOMException('Aborted', 'AbortError');
            }
            options.signal.addEventListener('abort', () => controller.abort(), { once: true });
          }

          try {
            const response = await fetch(XAI_TTS_ENDPOINT, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                text,
                voice_id: selectedVoice,
                output_format: {
                  codec: 'mp3',
                  sample_rate: 44100,
                  bit_rate: 128000,
                },
                language: 'en',
              }),
              signal: controller.signal,
            });

            if (!response.ok) {
              const errText = await response.text().catch(() => '');
              throw new Error(`API returned ${response.status}: ${errText.substring(0, 200)}`);
            }

            const audioBlob = await response.blob();
            if (audioBlob.size === 0) {
              throw new Error('API returned empty audio response');
            }

            return audioBlob;
          } finally {
            clearTimeout(timeoutId);
          }
        },
        {
          maxRetries: 2,
          backoff: 'exponential',
          baseDelayMs: 1000,
          signal: options?.signal,
          onRetry: (attempt, error) => {
            logger.warn('GrokTTS', `Retry attempt ${attempt}: ${(error as Error).message}`);
          },
        },
      );

      const blobUrl = URL.createObjectURL(result);
      logger.success(
        'GrokTTS',
        `Generated audio for "${text.substring(0, 40)}..." (${selectedVoice}, ${(result.size / 1024).toFixed(1)} KB)`,
      );
      return blobUrl;
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        throw err;
      }
      logger.error('GrokTTS', `TTS generation failed: ${(err as Error).message}`);
      return null;
    }
  },
};

/**
 * @deprecated Use the `apiKey` option in generate() instead.
 * Internal: API key set by the registry before calling generate.
 */
let _currentApiKey = '';

/** @deprecated Use the `apiKey` option in generate() instead. */
export function setGrokApiKey(key: string): void {
  _currentApiKey = key;
}

export async function generateGrokTts(
  text: string,
  apiKey: string,
  options?: { voice?: string; signal?: AbortSignal },
): Promise<string | null> {
  return grokEngine.generate(text, options?.voice || DEFAULT_VOICE, {
    signal: options?.signal,
    apiKey,
  });
}
