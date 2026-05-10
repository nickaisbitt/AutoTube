/**
 * TTS Service — Unified text-to-speech interface.
 *
 * Provides a single `generateNarration` function that delegates to
 * engine-specific implementations (Grok, Melo, browser SpeechSynthesis)
 * with automatic fallback on failure.
 *
 * Usage:
 *   import { generateNarration, GROK_VOICES, TTS_ENGINES } from '@/services/tts';
 */

export type { TTSConfig, TTSEngine } from './interface';
export { GROK_VOICES, type GrokVoiceId, generateGrokTts } from './grokEngine';
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
import { grokEngine } from './grokEngine';
import { kokoroEngine } from './kokoroEngine';
import type { TTSConfig } from './interface';
import { browserEngine } from './browserEngine';
import { generateWithFallback } from './registry';

/** All available TTS engines (in priority order) */
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
