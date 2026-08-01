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
import { apiFetch } from '../../utils/apiClient';
import { kokoroEngine } from './kokoroEngine';
import type { TTSConfig } from './interface';
import { browserEngine } from './browserEngine';
import { grokEngine } from './grokEngine';
import { describeTtsUnavailability, generateWithFallback } from './registry';
import { abortRejection, createTimeoutSignal, isCallerAbort } from './timeout';

/** Capability probe is a cheap GET — a slow one means the dev server is wedged. */
const CAPABILITIES_TIMEOUT_MS = 12_000;
/** Server TTS proxies synthesise a whole segment; generous but always bounded. */
const PROXY_TIMEOUT_MS = 90_000;
/**
 * Direct Cloudflare Melo BYOK call. Tighter than the server proxy: invalid or
 * unreachable credentials must fail fast to the next engine rather than tie up
 * the (per-segment) narration step for a minute-and-a-half each.
 */
const MELO_DIRECT_TIMEOUT_MS = 30_000;

/**
 * Whether a value looks like a Cloudflare account id. Cloudflare account ids are
 * 32 lowercase hex characters; some dashboards surface the UUID form (36 chars
 * with dashes). Anything else — e.g. a truncated 31-char paste — is not a usable
 * Melo BYOK credential, so callers should skip the per-segment Cloudflare call
 * entirely and fail fast to browser/unavailable clips.
 */
export function isPlausibleCloudflareAccountId(accountId: string | undefined | null): boolean {
  const id = (accountId ?? '').trim();
  if (/^[0-9a-fA-F]{32}$/.test(id)) return true;
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id);
}

/**
 * Whether a value looks like a Cloudflare API token. Cloudflare tokens are ~40
 * URL-safe characters; reject obviously-too-short pastes so an invalid BYOK
 * token cannot trigger a doomed request per segment.
 */
export function isPlausibleCloudflareApiToken(token: string | undefined | null): boolean {
  return (token ?? '').trim().length >= 30;
}

/** All available TTS engines (in priority order) — mirrors registry ENGINE_PRIORITY. */
export const TTS_ENGINES = [kokoroEngine, grokEngine, browserEngine] as const;

/**
 * Run `work` under a hard deadline and guarantee the promise settles.
 *
 * These proxy / BYOK helpers are called directly from the narration step, so —
 * unlike engines routed through the registry — they have no outer fallback
 * deadline. `work` gets the combined abort signal (our timeout OR caller
 * cancellation), but even a socket that ignores that signal cannot hang the
 * pipeline: the race against `abortRejection` resolves as soon as the deadline
 * fires. Returns null on our own timeout; re-throws genuine caller cancellation.
 */
async function withHardDeadline(
  timeoutMs: number,
  external: AbortSignal | undefined,
  label: string,
  work: (signal: AbortSignal) => Promise<string | null>,
): Promise<string | null> {
  const timeout = createTimeoutSignal(timeoutMs, external);
  const guard = abortRejection(timeout.signal);
  try {
    return await Promise.race([work(timeout.signal), guard.promise]);
  } catch (err) {
    if (timeout.timedOut()) {
      logger.warn(label, `Timed out after ${timeoutMs / 1000}s — falling back`);
      return null;
    }
    if (isCallerAbort(err, external)) throw err;
    logger.warn(label, `Request failed: ${(err as Error).message}`);
    return null;
  } finally {
    guard.dispose();
    timeout.cleanup();
  }
}

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
    const reason = describeTtsUnavailability(config);
    logger.error('TTS', `All TTS engines failed for text: "${text.substring(0, 50)}..." — ${reason}`);
    throw new Error(`All TTS engines failed to generate narration (${reason})`);
  }

  return result;
}

export { generateGrokTts } from './grokEngine';

/**
 * Fetches which TTS engines are available server-side (boolean only — no key values).
 * Returns null on network error (e.g. running without the dev server / offline).
 */
export async function fetchServerTtsCapabilities(): Promise<{ grok: boolean; melo: boolean } | null> {
  // Headless / flaky Vite must not hang the narration step forever — the
  // generate harness waits on continue/skip CTAs that only appear after this.
  const timeout = createTimeoutSignal(CAPABILITIES_TIMEOUT_MS);
  try {
    const res = await apiFetch('/api/tts/capabilities', { signal: timeout.signal });
    if (!res.ok) return null;
    return (await res.json()) as { grok: boolean; melo: boolean };
  } catch {
    if (timeout.timedOut()) {
      logger.warn(
        'TTS',
        `Server capability probe timed out after ${CAPABILITIES_TIMEOUT_MS / 1000}s — assuming no server TTS keys`,
      );
    }
    return null;
  } finally {
    timeout.cleanup();
  }
}

/**
 * Calls the server-side Grok TTS proxy (/api/tts/grok).
 * Returns a blob URL on success, null when the server has no XAI_API_KEY or the call fails.
 * Prefer this over a direct xAI call in production; BYOK VITE_XAI_KEY is the local fallback.
 */
export async function generateGrokTtsViaProxy(
  text: string,
  options?: { voice?: string; signal?: AbortSignal; timeoutMs?: number },
): Promise<string | null> {
  const timeoutMs = options?.timeoutMs ?? PROXY_TIMEOUT_MS;
  return withHardDeadline(timeoutMs, options?.signal, 'GrokTTS', async (signal) => {
    const res = await apiFetch('/api/tts/grok', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice: options?.voice || 'Sal' }),
      signal,
    });
    if (!res.ok) return null; // 503 = not configured; other = upstream error
    const blob = await res.blob();
    if (blob.size === 0) return null;
    return URL.createObjectURL(blob);
  });
}

/**
 * Calls the server-side MeloTTS proxy (/api/tts/melo).
 * Returns a blob URL on success, null when the server has no CF credentials or the call fails.
 * Prefer this over direct Cloudflare calls in production; BYOK VITE_CF_* is the local fallback.
 */
export async function generateMeloTtsViaProxy(
  text: string,
  options?: { signal?: AbortSignal; timeoutMs?: number },
): Promise<string | null> {
  const timeoutMs = options?.timeoutMs ?? PROXY_TIMEOUT_MS;
  return withHardDeadline(timeoutMs, options?.signal, 'MeloTTS', async (signal) => {
    const res = await apiFetch('/api/tts/melo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal,
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (blob.size === 0) return null;
    return URL.createObjectURL(blob);
  });
}

export async function generateMeloTts(
  text: string,
  accountId: string,
  apiToken: string,
  options?: { signal?: AbortSignal; timeoutMs?: number }
): Promise<string | null> {
  const timeoutMs = options?.timeoutMs ?? MELO_DIRECT_TIMEOUT_MS;
  return withHardDeadline(timeoutMs, options?.signal, 'MeloTTS', async (signal) => {
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
      signal
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
  });
}

