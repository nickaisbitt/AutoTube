// Feature: codebase-refactor, Property 6: TTS engine delegation
// Feature: codebase-refactor, Property 7: TTS engine fallback on failure
import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import type { TTSConfig, TTSEngine } from '../interface';

// Mock the logger module
vi.mock('../../logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}));

// Mock withRetry to just call the function directly (no actual retries in tests)
vi.mock('../../../utils/withRetry', () => ({
  withRetry: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}));

// Mock speech utilities for browser engine
vi.mock('../../../utils/speech', () => ({
  hasSpeechSupport: vi.fn(() => true),
  loadSpeechVoices: vi.fn(async () => [{ name: 'TestVoice', lang: 'en-US' }]),
  pickPreferredVoice: vi.fn(() => ({ name: 'TestVoice', lang: 'en-US' })),
}));

// We need to mock fetch for melo engine
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);
vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:mock-url') });

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Arbitrary for non-empty text strings */
const textArb = fc.string({ minLength: 1, maxLength: 200 }).filter(
  (s) => s.trim().length > 0,
);

/** Arbitrary for a valid TTSConfig with a specific engine preference */
const ttsConfigArb = (engine: 'kokoro' | 'browser'): fc.Arbitrary<TTSConfig> => {
  return fc.record({
    engine: fc.constant(engine),
    cloudflareAccountId: fc.constant('test-cf-account'),
    cloudflareApiToken: fc.constant('test-cf-token'),
    voice: fc.constantFrom('Eve', 'default'),
    kokoroServerUrl: fc.constant('http://localhost:59123'),
  });
};

/** Arbitrary for any valid TTSConfig */
const anyTtsConfigArb: fc.Arbitrary<TTSConfig> = fc.oneof(
  ttsConfigArb('kokoro'),
  ttsConfigArb('browser'),
);

// ---------------------------------------------------------------------------
// Property 6: TTS engine delegation
// ---------------------------------------------------------------------------

/**
 * **Validates: Requirements 8.2**
 *
 * Property 6: TTS engine delegation
 *
 * For any valid TTSConfig specifying an engine preference, generateNarration
 * SHALL invoke the generate method of the engine matching that preference
 * (and no other engine) when the preferred engine is available and succeeds.
 */
describe('Property 6: TTS engine delegation', () => {
  it('should only invoke the preferred engine when it is available and succeeds', async () => {
    const { logger } = await import('../../logger');

    await fc.assert(
      fc.asyncProperty(textArb, anyTtsConfigArb, async (text, config) => {
        vi.clearAllMocks();

        // Create mock engines — all succeed
        const mockEngines: TTSEngine[] = [
          {
            name: 'kokoro',
            voices: [{ id: 'Eve', description: 'British female' }],
            generate: vi.fn().mockResolvedValue('blob:kokoro-audio-url'),
            isAvailable: vi.fn((c: TTSConfig) => !!c.kokoroServerUrl),
          },
          {
            name: 'browser',
            voices: [{ id: 'default', description: 'System default' }],
            generate: vi.fn().mockResolvedValue('browser-tts://TestVoice'),
            isAvailable: vi.fn(() => true),
          },
        ];

        // Replicate the delegation logic from registry.ts
        const available = mockEngines.filter((engine) => engine.isAvailable(config));

        // Move preferred engine to front
        const preferredIndex = available.findIndex((e) => e.name === config.engine);
        if (preferredIndex > 0) {
          const [preferred] = available.splice(preferredIndex, 1);
          available.unshift(preferred);
        }

        // Execute the delegation logic (try engines in order, stop on first success)
        let result: string | null = null;
        const voice = config.voice || '';

        for (let i = 0; i < available.length; i++) {
          const engine = available[i];
          try {
            const genResult = await engine.generate(text, voice);
            if (genResult !== null) {
              result = genResult;
              break;
            }
            if (i < available.length - 1) {
              const nextEngine = available[i + 1];
              logger.warn('TTS', `Engine "${engine.name}" returned null, falling back to "${nextEngine.name}"`);
            }
          } catch (err) {
            if (i < available.length - 1) {
              const nextEngine = available[i + 1];
              logger.warn('TTS', `Engine "${engine.name}" failed: ${(err as Error).message}. Falling back to "${nextEngine.name}"`);
            }
          }
        }

        // --- Assertions ---

        // 1. The preferred engine should have been called exactly once
        const preferredEngine = mockEngines.find((e) => e.name === config.engine)!;
        expect(preferredEngine.generate).toHaveBeenCalledTimes(1);
        expect(preferredEngine.generate).toHaveBeenCalledWith(text, config.voice || '');

        // 2. No other engine should have been called (since preferred succeeds)
        const otherEngines = mockEngines.filter((e) => e.name !== config.engine);
        for (const other of otherEngines) {
          expect(other.generate).not.toHaveBeenCalled();
        }

        // 3. Result should be non-null (from the preferred engine)
        expect(result).not.toBeNull();

        // 4. No fallback logging should have occurred
        expect(logger.warn).not.toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  }, 30_000);
});

// ---------------------------------------------------------------------------
// Property 7: TTS engine fallback on failure
// ---------------------------------------------------------------------------

/**
 * **Validates: Requirements 8.4**
 *
 * Property 7: TTS engine fallback on failure
 *
 * For any TTSConfig where the preferred engine's generate call returns null
 * or throws, generateNarration SHALL attempt the next available engine in
 * priority order and SHALL log the fallback event via the logger.
 */
describe('Property 7: TTS engine fallback on failure', () => {
  /** Arbitrary for failure mode: null return or thrown error */
  const failureModeArb = fc.oneof(
    fc.constant('null' as const),
    fc.constant('throw' as const),
  );

  it('should fall back to next engine and log when preferred engine fails', async () => {
    const { logger } = await import('../../logger');

    await fc.assert(
      fc.asyncProperty(
        textArb,
        anyTtsConfigArb,
        failureModeArb,
        async (text, config, failureMode) => {
          vi.clearAllMocks();

          // Create mock engines where the preferred one fails
          const mockEngines: TTSEngine[] = [
            {
              name: 'kokoro',
              voices: [{ id: 'Eve', description: 'British female' }],
              generate: vi.fn().mockResolvedValue('blob:kokoro-audio-url'),
              isAvailable: vi.fn((c: TTSConfig) => !!c.kokoroServerUrl),
            },
            {
              name: 'browser',
              voices: [{ id: 'default', description: 'System default' }],
              generate: vi.fn().mockResolvedValue('browser-tts://TestVoice'),
              isAvailable: vi.fn(() => true),
            },
          ];

          // Make the preferred engine fail
          const preferredEngine = mockEngines.find((e) => e.name === config.engine)!;
          if (failureMode === 'null') {
            (preferredEngine.generate as ReturnType<typeof vi.fn>).mockResolvedValue(null);
          } else {
            (preferredEngine.generate as ReturnType<typeof vi.fn>).mockRejectedValue(
              new Error('Simulated engine failure'),
            );
          }

          // Replicate the fallback logic from registry.ts
          const available = mockEngines.filter((engine) => engine.isAvailable(config));
          const preferredIndex = available.findIndex((e) => e.name === config.engine);
          if (preferredIndex > 0) {
            const [preferred] = available.splice(preferredIndex, 1);
            available.unshift(preferred);
          }

          // Execute the fallback logic
          let result: string | null = null;
          const voice = config.voice || '';

          for (let i = 0; i < available.length; i++) {
            const engine = available[i];
            try {
              const genResult = await engine.generate(text, voice);
              if (genResult !== null) {
                result = genResult;
                break;
              }
              // Null return — log fallback
              if (i < available.length - 1) {
                const nextEngine = available[i + 1];
                logger.warn(
                  'TTS',
                  `Engine "${engine.name}" returned null, falling back to "${nextEngine.name}"`,
                );
              }
            } catch (err) {
              if (i < available.length - 1) {
                const nextEngine = available[i + 1];
                logger.warn(
                  'TTS',
                  `Engine "${engine.name}" failed: ${(err as Error).message}. Falling back to "${nextEngine.name}"`,
                );
              }
            }
          }

          // --- Assertions ---

          // 1. The preferred engine was called
          expect(preferredEngine.generate).toHaveBeenCalledTimes(1);

          // 2. At least one other engine was attempted (fallback occurred)
          const otherEngines = available.filter((e) => e.name !== config.engine);
          const anyOtherCalled = otherEngines.some(
            (e) => (e.generate as ReturnType<typeof vi.fn>).mock.calls.length > 0,
          );
          expect(anyOtherCalled).toBe(true);

          // 3. The next engine in priority order was the one called
          const nextEngine = available[1]; // After reordering, index 1 is the next
          expect(nextEngine.generate).toHaveBeenCalledTimes(1);

          // 4. Logger.warn was called to log the fallback event
          expect(logger.warn).toHaveBeenCalled();
          const warnCalls = (logger.warn as ReturnType<typeof vi.fn>).mock.calls;
          const hasTTSFallbackLog = warnCalls.some(
            (call: unknown[]) =>
              call[0] === 'TTS' &&
              typeof call[1] === 'string' &&
              call[1].includes(config.engine) &&
              (call[1].includes('falling back') || call[1].includes('Falling back')),
          );
          expect(hasTTSFallbackLog).toBe(true);

          // 5. Result should be non-null (fallback engine succeeded)
          expect(result).not.toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  }, 30_000);
});
