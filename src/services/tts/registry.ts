/**
 * TTS engine registry with ordered fallback logic.
 *
 * Maintains a priority-ordered list of engines. When generating narration,
 * tries the preferred engine first, then falls back through the list.
 * Each failure is logged via the logger utility.
 *
 * Every attempt runs under a hard deadline. Engines already carry their own
 * request timeouts, but the deadline here is the backstop that guarantees
 * `generateNarration` returns even when an engine hangs without ever
 * resolving — the case that stalls headless `generate:video` runs.
 */

import { describeSpeechUnavailability } from '../../utils/speech';
import { logger } from '../logger';
import { browserEngine } from './browserEngine';
import { grokEngine } from './grokEngine';
import type { TTSConfig, TTSEngine } from './interface';
import { kokoroEngine } from './kokoroEngine';
import { abortRejection, createTimeoutSignal, isCallerAbort } from './timeout';

/**
 * Default engine priority order: Kokoro (local) → Grok (cloud) → Browser.
 * Grok is only attempted when `xaiApiKey` is present (see grokEngine.isAvailable),
 * so unconfigured setups fall back cleanly to Kokoro/Browser.
 */
const ENGINE_PRIORITY: TTSEngine[] = [kokoroEngine, grokEngine, browserEngine];

/**
 * Per-engine hard deadline. Generous enough to cover each engine's own
 * timeouts and retries (Grok retries twice over a 30s request timeout), tight
 * for the browser engine because it only inspects the local voice list.
 */
const ENGINE_DEADLINE_MS: Record<string, number> = {
  kokoro: 20_000,
  grok: 120_000,
  browser: 5_000,
};
const DEFAULT_ENGINE_DEADLINE_MS = 60_000;

/**
 * Get the ordered list of engines to try, starting with the preferred engine.
 * Engines that are not available (missing credentials) are excluded.
 */
function getOrderedEngines(config: TTSConfig): TTSEngine[] {
  const available = ENGINE_PRIORITY.filter((engine) => engine.isAvailable(config));

  // Move preferred engine to front if it's available
  const preferredIndex = available.findIndex((e) => e.name === config.engine);
  if (preferredIndex > 0) {
    const [preferred] = available.splice(preferredIndex, 1);
    available.unshift(preferred);
  }

  return available;
}

function buildEngineOptions(config: TTSConfig, signal?: AbortSignal) {
  return {
    signal,
    serverUrl: config.kokoroServerUrl,
    apiKey: config.xaiApiKey,
  };
}

/** Explain why no engine could produce audio, for actionable error messages. */
export function describeTtsUnavailability(config: TTSConfig): string {
  const reasons: string[] = [];

  if (!config.kokoroServerUrl) reasons.push('no Kokoro server URL');
  if (!config.xaiApiKey) reasons.push('no xAI key');

  const speechReason = describeSpeechUnavailability();
  if (speechReason) reasons.push(`browser TTS: ${speechReason}`);

  return reasons.length ? reasons.join('; ') : 'all configured engines failed';
}

/** Run one engine attempt under a hard deadline, cancelling it on expiry. */
async function generateWithDeadline(
  engine: TTSEngine,
  text: string,
  voice: string,
  config: TTSConfig,
  signal?: AbortSignal,
): Promise<string | null> {
  const deadlineMs = ENGINE_DEADLINE_MS[engine.name] ?? DEFAULT_ENGINE_DEADLINE_MS;
  const timeout = createTimeoutSignal(deadlineMs, signal);
  const guard = abortRejection(timeout.signal);

  try {
    return await Promise.race([
      engine.generate(text, voice, buildEngineOptions(config, timeout.signal)),
      guard.promise,
    ]);
  } catch (err) {
    if (timeout.timedOut()) {
      throw new Error(`Engine "${engine.name}" exceeded its ${deadlineMs}ms hard timeout`);
    }
    throw err;
  } finally {
    guard.dispose();
    timeout.cleanup();
  }
}

/**
 * Generate narration audio by trying engines in priority order with fallback.
 *
 * 1. Tries the preferred engine first
 * 2. On failure, falls back to next available engine
 * 3. Logs each fallback event
 * 4. Returns the audio URL from the first successful engine, or null if all fail
 */
export async function generateWithFallback(
  text: string,
  config: TTSConfig,
  options?: { signal?: AbortSignal },
): Promise<string | null> {
  const engines = getOrderedEngines(config);

  if (engines.length === 0) {
    logger.error(
      'TTS',
      `No TTS engines available — ${describeTtsUnavailability(config)}`,
    );
    return null;
  }

  const voice = config.voice || '';

  for (let i = 0; i < engines.length; i++) {
    const engine = engines[i];

    try {
      const result = await generateWithDeadline(engine, text, voice, config, options?.signal);

      if (result !== null) {
        return result;
      }

      // Engine returned null (soft failure) — try next
      if (i < engines.length - 1) {
        const nextEngine = engines[i + 1];
        logger.warn(
          'TTS',
          `Engine "${engine.name}" returned null, falling back to "${nextEngine.name}"`,
        );
      }
    } catch (err) {
      // Caller cancellation should propagate — don't fall back on user cancel
      if (isCallerAbort(err, options?.signal)) {
        throw err;
      }

      // Engine threw an error (or blew its deadline) — log and try next
      if (i < engines.length - 1) {
        const nextEngine = engines[i + 1];
        logger.warn(
          'TTS',
          `Engine "${engine.name}" failed: ${(err as Error).message}. Falling back to "${nextEngine.name}"`,
        );
      } else {
        logger.error(
          'TTS',
          `All engines exhausted. Last failure (${engine.name}): ${(err as Error).message}`,
        );
      }
    }
  }

  return null;
}

/** Get the list of all registered engines */
export function getRegisteredEngines(): readonly TTSEngine[] {
  return ENGINE_PRIORITY;
}
