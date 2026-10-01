/**
 * Kokoro TTS engine implementation.
 *
 * Uses a local or remote Kokoro TTS server to generate high-quality narration audio.
 * Supports multiple voices with distinct characteristics and implements a 10-second
 * timeout to trigger fallback when the server is unreachable.
 */

import { logger } from '../logger';
import type { TTSConfig, TTSEngine } from './interface';

const KOKORO_TIMEOUT_MS = 10_000;
const DEFAULT_VOICE = 'af_heart';

export const KOKORO_VOICES = [
  { id: 'af_heart', description: 'Female conversational' },
  { id: 'am_adam', description: 'Male authoritative' },
  { id: 'af_sarah', description: 'Female professional' },
  { id: 'am_michael', description: 'Male dramatic' },
] as const;

export type KokoroVoiceId = (typeof KOKORO_VOICES)[number]['id'];

export const kokoroEngine: TTSEngine = {
  name: 'kokoro',
  voices: KOKORO_VOICES,

  isAvailable(config: TTSConfig): boolean {
    return !!config.kokoroServerUrl;
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
    const serverUrl = options?.serverUrl || _currentServerUrl;
    if (!serverUrl) {
      logger.error('KokoroTTS', 'No server URL configured');
      return null;
    }

    const selectedVoice = voice || DEFAULT_VOICE;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), KOKORO_TIMEOUT_MS);

      // Link external signal
      if (options?.signal) {
        if (options.signal.aborted) {
          clearTimeout(timeoutId);
          throw new DOMException('Aborted', 'AbortError');
        }
        options.signal.addEventListener('abort', () => controller.abort(), { once: true });
      }

      try {
        const endpoint = serverUrl.replace(/\/$/, '') + '/generate';

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text,
            voice: selectedVoice,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errText = await response.text().catch(() => '');
          throw new Error(`Kokoro API returned ${response.status}: ${errText.substring(0, 200)}`);
        }

        const audioBlob = await response.blob();
        if (audioBlob.size === 0) {
          throw new Error('Kokoro API returned empty audio response');
        }

        const blobUrl = URL.createObjectURL(audioBlob);
        logger.success(
          'KokoroTTS',
          `Generated audio for "${text.substring(0, 40)}..." (${selectedVoice}, ${(audioBlob.size / 1024).toFixed(1)} KB)`,
        );
        return blobUrl;
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        // Check if it was the external signal or our timeout
        if (options?.signal?.aborted) {
          throw err;
        }
        // Our timeout fired — server unreachable, return null for fallback
        logger.warn('KokoroTTS', 'Server request timed out after 10 seconds');
        return null;
      }
      logger.error('KokoroTTS', `TTS generation failed: ${(err as Error).message}`);
      return null;
    }
  },
};

/**
 * @deprecated Use the `serverUrl` option in generate() instead.
 * Internal: Server URL set by the registry before calling generate.
 */
let _currentServerUrl = '';

/** @deprecated Use the `serverUrl` option in generate() instead. */
export function setKokoroServerUrl(url: string): void {
  _currentServerUrl = url;
}
