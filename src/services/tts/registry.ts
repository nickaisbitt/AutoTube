/**
 * TTS engine registry with ordered fallback logic.
 *
 * Maintains a priority-ordered list of engines. When generating narration,
 * tries the preferred engine first, then falls back through the list.
 * Each failure is logged via the logger utility.
 */

import { logger } from '../logger';
import { browserEngine } from './browserEngine';
import type { TTSConfig, TTSEngine } from './interface';
import { kokoroEngine } from './kokoroEngine';

/** Default engine priority order: Kokoro → Browser */
const ENGINE_PRIORITY: TTSEngine[] = [kokoroEngine, browserEngine];

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
  };
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
  const engineOptions = buildEngineOptions(config, options?.signal);

  if (engines.length === 0) {
    logger.error('TTS', 'No TTS engines available — check credentials and browser support');
    return null;
  }

  const voice = config.voice || '';

  for (let i = 0; i < engines.length; i++) {
    const engine = engines[i];

    try {
      const result = await engine.generate(text, voice, engineOptions);

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
      // AbortError should propagate — don't fall back on user cancellation
      if ((err as Error).name === 'AbortError') {
        throw err;
      }

      // Engine threw an error — log and try next
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
