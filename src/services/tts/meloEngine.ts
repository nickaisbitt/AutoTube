/**
 * MeloTTS engine implementation (Cloudflare Workers AI).
 *
 * Uses the Cloudflare Workers AI MeloTTS model to generate narration audio.
 * Handles both JSON (base64) and binary MP3 response formats.
 */

import { withRetry } from '../../utils/withRetry';
import { logger } from '../logger';
import type { TTSConfig, TTSEngine } from './interface';

const MELO_VOICES = [
  { id: 'default', description: 'MeloTTS default voice' },
] as const;

export const meloEngine: TTSEngine = {
  name: 'melo',
  voices: MELO_VOICES,

  isAvailable(config: TTSConfig): boolean {
    return !!config.cloudflareAccountId && !!config.cloudflareApiToken;
  },

  async generate(
    text: string,
    _voice: string,
    options?: { signal?: AbortSignal },
  ): Promise<string | null> {
    const accountId = _currentAccountId;
    const apiToken = _currentApiToken;

    if (!accountId || !apiToken) {
      logger.error('MeloTTS', 'Missing Cloudflare credentials');
      return null;
    }

    try {
      const result = await withRetry(
        async () => {
          const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/myshell-ai/melotts`;

          const response = await fetch(url, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ prompt: text, lang: 'en' }),
            signal: options?.signal,
          });

          if (!response.ok) {
            const errText = await response.text().catch(() => '');
            throw new Error(`API returned ${response.status}: ${errText.substring(0, 200)}`);
          }

          // The API can return JSON with base64 audio or binary MP3
          const contentType = response.headers.get('content-type') || '';

          let audioBlob: Blob;
          if (contentType.includes('application/json')) {
            const data = await response.json();
            const base64Audio = data?.result?.audio;
            if (!base64Audio) {
              throw new Error('No audio in JSON response');
            }
            // Decode base64 to blob
            const binaryString = atob(base64Audio);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            audioBlob = new Blob([bytes], { type: 'audio/mpeg' });
          } else {
            audioBlob = await response.blob();
          }

          if (audioBlob.size === 0) {
            throw new Error('Empty audio response');
          }

          return audioBlob;
        },
        {
          maxRetries: 2,
          backoff: 'linear',
          baseDelayMs: 1000,
          signal: options?.signal,
          onRetry: (attempt, error) => {
            logger.warn('MeloTTS', `Retry attempt ${attempt}: ${(error as Error).message}`);
          },
        },
      );

      const blobUrl = URL.createObjectURL(result);
      logger.success('MeloTTS', `Generated audio (${(result.size / 1024).toFixed(1)} KB)`);
      return blobUrl;
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        throw err;
      }
      logger.error('MeloTTS', `TTS generation failed: ${(err as Error).message}`);
      return null;
    }
  },
};

/**
 * Internal: Cloudflare credentials set by the registry before calling generate.
 */
let _currentAccountId = '';
let _currentApiToken = '';

/** Set Cloudflare credentials for the Melo engine. Called by the registry. */
export function setMeloCredentials(accountId: string, apiToken: string): void {
  _currentAccountId = accountId;
  _currentApiToken = apiToken;
}

/**
 * Standalone function matching the legacy `generateMeloTts` signature.
 * Used by store.ts during the transition period.
 */
export async function generateMeloTts(
  text: string,
  accountId: string,
  apiToken: string,
  options?: { signal?: AbortSignal },
): Promise<string | null> {
  _currentAccountId = accountId;
  _currentApiToken = apiToken;
  return meloEngine.generate(text, 'default', { signal: options?.signal });
}
