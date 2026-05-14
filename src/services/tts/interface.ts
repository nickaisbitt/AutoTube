/**
 * Unified TTS engine interface and configuration types.
 *
 * All TTS engines (Kokoro, browser SpeechSynthesis) implement the
 * TTSEngine interface. The registry uses TTSConfig to determine which
 * engine to invoke and what credentials to pass.
 */

export interface TTSEngine {
  /** Human-readable engine name (e.g. 'kokoro', 'browser') */
  readonly name: string;

  /** Available voices for this engine */
  readonly voices: ReadonlyArray<{ id: string; description: string }>;

  /**
   * Generate audio for the given text using the specified voice.
   * Returns a blob URL to the audio, or null on failure.
   */
  generate(
    text: string,
    voice: string,
    options?: {
      signal?: AbortSignal;
      serverUrl?: string;
      cloudflareAccountId?: string;
      cloudflareApiToken?: string;
    },
  ): Promise<string | null>;

  /** Check whether this engine is available given the current config */
  isAvailable(config: TTSConfig): boolean;
}

export interface TTSConfig {
  /** Preferred engine to use */
  engine: 'kokoro' | 'browser';

  /** Cloudflare account ID for MeloTTS */
  cloudflareAccountId?: string;

  /** Cloudflare API token for MeloTTS */
  cloudflareApiToken?: string;

  /** Voice ID to use (engine-specific) */
  voice?: string;

  /** Kokoro TTS server URL (local or remote endpoint) */
  kokoroServerUrl?: string;
}
