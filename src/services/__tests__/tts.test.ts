import { describe, it, expect } from 'vitest';
import { GROK_VOICES, TTS_ENGINES, generateNarration } from '../tts';

describe('TTS module', () => {
  it('exports GROK_VOICES array with expected voice entries', () => {
    expect(Array.isArray(GROK_VOICES)).toBe(true);
    expect(GROK_VOICES.length).toBeGreaterThan(0);
    expect(GROK_VOICES.find((v) => v.id === 'Sal')).toBeDefined();
    expect(GROK_VOICES.find((v) => v.id === 'Leo')).toBeDefined();
  });

  it('exports TTS_ENGINES array with all engine implementations', () => {
    expect(TTS_ENGINES).toHaveLength(3);
    const names = TTS_ENGINES.map((e) => e.name);
    expect(names).toContain('kokoro');
    expect(names).toContain('grok');
    expect(names).toContain('browser');
  });

  it('each engine has required interface properties', () => {
    for (const engine of TTS_ENGINES) {
      expect(typeof engine.name).toBe('string');
      expect(Array.isArray(engine.voices)).toBe(true);
      expect(typeof engine.generate).toBe('function');
      expect(typeof engine.isAvailable).toBe('function');
    }
  });

  it('generateNarration is exported as a function', () => {
    expect(typeof generateNarration).toBe('function');
  });
});
