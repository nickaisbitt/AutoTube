/**
 * Kokoro TTS engine implementation.
 *
 * Uses a local or remote Kokoro TTS server to generate high-quality narration audio.
 * Supports multiple voices with distinct characteristics and implements a 10-second
 * timeout to trigger fallback when the server is unreachable.
 */

import { logger } from '../logger';
import type { TTSConfig, TTSEngine } from './interface';
import { createTimeoutSignal, isCallerAbort } from './timeout';

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

    if (options?.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    const timeout = createTimeoutSignal(KOKORO_TIMEOUT_MS, options?.signal);

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
        signal: timeout.signal,
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
    } catch (err) {
      if (timeout.timedOut()) {
        // Server unreachable within the deadline — return null for fallback
        logger.warn('KokoroTTS', `Server request timed out after ${KOKORO_TIMEOUT_MS / 1000} seconds`);
        return null;
      }
      if (isCallerAbort(err, options?.signal)) {
        throw err;
      }
      logger.error('KokoroTTS', `TTS generation failed: ${(err as Error).message}`);
      return null;
    } finally {
      timeout.cleanup();
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
