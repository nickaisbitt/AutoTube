/**
 * TTS Service — Unified text-to-speech interface.
 *
 * Provides a single `generateNarration` function that delegates to
 * engine-specific implementations (Kokoro, browser SpeechSynthesis)
 * with automatic fallback on failure.
 *
 * Usage:
 *   import { generateNarration, KOKORO_VOICES, TTS_ENGINES } from '@/services/tts';
 */

export type { TTSConfig, TTSEngine } from './interface';
export { KOKORO_VOICES, type KokoroVoiceId, kokoroEngine } from './kokoroEngine';
export { generateWithFallback } from './registry';
export { applyPacing, computeSegmentWpm, insertDataPointPauses, getWpmRange } from './pacingController';
export type { PacingConfig, PacingResult } from './pacingController';
export {
  exportNarrationClip,
  validateNarrationTiming,
  calculateCumulativeOffsets,
  resetExportedClips,
  getExportedClips,
} from './audioExport';
export type { AudioExportResult, NarrationTimingValidation } from './audioExport';

import { logger } from '../logger';
import { kokoroEngine } from './kokoroEngine';
import type { TTSConfig } from './interface';
import { browserEngine } from './browserEngine';
import { grokEngine } from './grokEngine';
import { generateWithFallback } from './registry';

/** All available TTS engines (in priority order) — mirrors registry ENGINE_PRIORITY. */
export const TTS_ENGINES = [kokoroEngine, grokEngine, browserEngine] as const;

/**
 * Generate narration audio for the given text.
 *
 * Tries the preferred engine from config, then falls back through
 * available engines. Returns a blob URL to the audio, or throws
 * if all engines fail and no fallback is available.
 */
export async function generateNarration(
  text: string,
  config: TTSConfig,
  options?: { signal?: AbortSignal },
): Promise<string> {
  const result = await generateWithFallback(text, config, options);

  if (result === null) {
    logger.error('TTS', `All TTS engines failed for text: "${text.substring(0, 50)}..."`);
    throw new Error('All TTS engines failed to generate narration');
  }

  return result;
}

export { generateGrokTts } from './grokEngine';

export async function generateMeloTts(
  text: string,
  accountId: string,
  apiToken: string,
  options?: { signal?: AbortSignal }
): Promise<string | null> {
  try {
    // Model slug + request/response shape must match the server renderer
    // (deploy/server-render/narration.mjs): @cf/myshell-ai/melotts expects
    // `{ prompt, lang }` and returns base64 audio in a JSON envelope.
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/myshell-ai/melotts`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ prompt: text, lang: 'en' }),
      signal: options?.signal
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const contentType = res.headers.get('content-type') || '';
    let blob: Blob;
    if (contentType.includes('application/json')) {
      const data = await res.json();
      const base64Audio = data?.result?.audio;
      if (!base64Audio) throw new Error('No audio in MeloTTS response');
      const binary = atob(base64Audio);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      blob = new Blob([bytes], { type: 'audio/mpeg' });
    } else {
      blob = await res.blob();
    }
    return URL.createObjectURL(blob);
  } catch (err) {
    logger.error('MeloTTS', `MeloTTS failed for text: "${text.substring(0, 40)}..."`, err);
    return null;
  }
}

