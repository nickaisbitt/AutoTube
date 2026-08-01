/**
 * Browser SpeechSynthesis TTS engine implementation.
 *
 * Uses the Web Speech API to generate narration. Unlike Grok/Melo which
 * produce audio files, the browser engine returns a special marker URL
 * indicating that narration should be played live via SpeechSynthesis
 * at render time.
 *
 * The actual speech playback is handled by src/utils/speech.ts (speakText).
 * This engine's role is to validate availability and signal that browser
 * TTS should be used for a given segment.
 *
 * Headless/automated browsers expose the API without any voices, so this
 * engine reports itself unavailable there rather than handing the pipeline a
 * marker for audio that will never be produced.
 */

import {
  describeSpeechUnavailability,
  isSpeechSynthesisUsable,
  loadSpeechVoices,
  pickPreferredVoice,
} from '../../utils/speech';
import { logger } from '../logger';
import type { TTSConfig, TTSEngine } from './interface';

/** Marker URL prefix indicating browser TTS should be used at playback time */
export const BROWSER_TTS_MARKER = 'browser-tts://';

const BROWSER_VOICES = [
  { id: 'default', description: 'System default voice' },
] as const;

export const browserEngine: TTSEngine = {
  name: 'browser',
  voices: BROWSER_VOICES,

  isAvailable(_config: TTSConfig): boolean {
    return isSpeechSynthesisUsable();
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
    if (options?.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    const unavailable = describeSpeechUnavailability();
    if (unavailable) {
      logger.warn('BrowserTTS', `Browser TTS unusable: ${unavailable}`);
      return null;
    }

    // Bounded by loadSpeechVoices' own timeout, and memoised after the first
    // failed probe, so this cannot stall once per segment.
    const voices = await loadSpeechVoices();
    const selectedVoice = pickPreferredVoice(voices, voice || undefined);

    if (!selectedVoice) {
      logger.warn(
        'BrowserTTS',
        `No speech synthesis voices available: ${describeSpeechUnavailability() ?? 'voice list empty'}`,
      );
      return null;
    }

    // Return a marker URL — actual playback happens at render time via speakText
    const voiceName = selectedVoice.name;
    logger.info('BrowserTTS', `Browser TTS ready: "${text.substring(0, 40)}..." (voice: ${voiceName})`);
    return `${BROWSER_TTS_MARKER}${encodeURIComponent(voiceName)}`;
  },
};
