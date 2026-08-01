/**
 * Headless-safe TTS behaviour.
 *
 * Headless Chromium (Playwright, `npm run generate:video`) exposes the
 * SpeechSynthesis API with no voices behind it: `getVoices()` stays empty,
 * `voiceschanged` never fires and `speak()` reports neither `end` nor `error`.
 * These tests pin the fail-fast contract so the narration step can never stall
 * the pipeline waiting on browser speech, and so a hung engine still hits a
 * hard deadline.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  describeSpeechUnavailability,
  hasSpeechSupport,
  isHeadlessBrowser,
  isSpeechSynthesisUsable,
  loadSpeechVoices,
  resetSpeechProbeCache,
  speakText,
} from '../../../utils/speech';
import { browserEngine } from '../browserEngine';
import { generateNarration } from '../index';
import { generateWithFallback } from '../registry';
import { createTimeoutSignal, isCallerAbort } from '../timeout';

vi.mock('../../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

interface FakeUtterance {
  text: string;
  voice: unknown;
  rate: number;
  pitch: number;
  volume: number;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

const spoken: FakeUtterance[] = [];

/** Minimal SpeechSynthesis stub — jsdom implements neither half of the API. */
function installSpeechStub(voices: Array<{ name: string; lang: string }>) {
  const listeners = new Set<() => void>();

  const synth = {
    getVoices: () => voices,
    speak: vi.fn((utterance: FakeUtterance) => {
      spoken.push(utterance);
    }),
    cancel: vi.fn(),
    resume: vi.fn(),
    addEventListener: vi.fn((_type: string, handler: () => void) => {
      listeners.add(handler);
    }),
    removeEventListener: vi.fn((_type: string, handler: () => void) => {
      listeners.delete(handler);
    }),
  };

  class FakeSpeechSynthesisUtterance implements FakeUtterance {
    text: string;
    voice: unknown = null;
    rate = 1;
    pitch = 1;
    volume = 1;
    onstart: (() => void) | null = null;
    onend: (() => void) | null = null;
    onerror: (() => void) | null = null;

    constructor(text: string) {
      this.text = text;
    }
  }

  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  Object.defineProperty(window, 'SpeechSynthesisUtterance', {
    value: FakeSpeechSynthesisUtterance,
    configurable: true,
  });

  return synth;
}

function setWebdriver(value: boolean) {
  Object.defineProperty(navigator, 'webdriver', { value, configurable: true });
}

beforeEach(() => {
  spoken.length = 0;
  resetSpeechProbeCache();
  setWebdriver(false);
});

afterEach(() => {
  vi.useRealTimers();
  resetSpeechProbeCache();
  setWebdriver(false);
  Reflect.deleteProperty(window, 'speechSynthesis');
  Reflect.deleteProperty(window, 'SpeechSynthesisUtterance');
});

describe('headless detection', () => {
  it('treats a WebDriver-controlled browser as headless', () => {
    setWebdriver(true);
    expect(isHeadlessBrowser()).toBe(true);
  });

  it('reports SpeechSynthesis unusable in headless even when the API exists', () => {
    installSpeechStub([{ name: 'TestVoice', lang: 'en-US' }]);
    setWebdriver(true);

    expect(hasSpeechSupport()).toBe(true);
    expect(isSpeechSynthesisUsable()).toBe(false);
    expect(describeSpeechUnavailability()).toMatch(/headless/i);
  });
});

describe('loadSpeechVoices', () => {
  it('gives up quickly in headless and memoises the empty verdict', async () => {
    installSpeechStub([]);
    setWebdriver(true);

    const firstStart = Date.now();
    expect(await loadSpeechVoices()).toEqual([]);
    const firstElapsed = Date.now() - firstStart;

    // Headless probe budget is a fraction of the 2s interactive default.
    expect(firstElapsed).toBeLessThan(1000);

    const secondStart = Date.now();
    expect(await loadSpeechVoices()).toEqual([]);
    expect(Date.now() - secondStart).toBeLessThan(50);
  });

  it('returns voices and clears the dead-end verdict when they exist', async () => {
    installSpeechStub([{ name: 'TestVoice', lang: 'en-US' }]);

    const voices = await loadSpeechVoices();
    expect(voices).toHaveLength(1);
    expect(describeSpeechUnavailability()).toBeNull();
  });
});

describe('speakText', () => {
  it('fails fast with onError instead of speaking in headless', async () => {
    const synth = installSpeechStub([{ name: 'TestVoice', lang: 'en-US' }]);
    setWebdriver(true);

    const onError = vi.fn();
    const onEnd = vi.fn();

    const utterance = await speakText('Hello there.', { onError, onEnd });

    expect(utterance).toBeNull();
    expect(synth.speak).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('reports an error and records a dead end when speak() never starts', async () => {
    vi.useFakeTimers();
    installSpeechStub([{ name: 'TestVoice', lang: 'en-US' }]);

    const onError = vi.fn();
    const utterance = await speakText('Hello there.', { onError });

    expect(utterance).not.toBeNull();
    expect(spoken).toHaveLength(1);
    expect(onError).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2500);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(describeSpeechUnavailability()).toMatch(/no audio/i);
    expect(isSpeechSynthesisUsable()).toBe(false);
  });

  it('synthesises the missing end event when the engine drops it', async () => {
    vi.useFakeTimers();
    installSpeechStub([{ name: 'TestVoice', lang: 'en-US' }]);

    const onEnd = vi.fn();
    const onError = vi.fn();
    await speakText('One two three four five.', { onEnd, onError });

    // Fire `start` so the dead-end watchdog stands down, then go silent.
    spoken[0].onstart?.();
    await vi.advanceTimersByTimeAsync(2500);
    expect(onEnd).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(120_000);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });
});

describe('browserEngine', () => {
  it('is unavailable in headless so the registry skips it', () => {
    installSpeechStub([{ name: 'TestVoice', lang: 'en-US' }]);
    setWebdriver(true);

    expect(browserEngine.isAvailable({ engine: 'browser' })).toBe(false);
  });

  it('returns null instead of a playback marker in headless', async () => {
    installSpeechStub([]);
    setWebdriver(true);

    await expect(browserEngine.generate('Hello there.', '')).resolves.toBeNull();
  });

  it('still returns a marker in a browser with voices', async () => {
    installSpeechStub([{ name: 'TestVoice', lang: 'en-US' }]);

    await expect(browserEngine.generate('Hello there.', '')).resolves.toBe(
      'browser-tts://TestVoice',
    );
  });
});

describe('generateNarration in headless', () => {
  it('rejects quickly with an actionable reason when nothing else is configured', async () => {
    installSpeechStub([]);
    setWebdriver(true);

    const start = Date.now();
    await expect(generateNarration('Hello there.', { engine: 'browser' })).rejects.toThrow(
      /browser TTS: automated\/headless browser has no speech voices/,
    );
    expect(Date.now() - start).toBeLessThan(1000);
  });
});

describe('per-engine hard deadline', () => {
  it('abandons an engine whose request never settles', async () => {
    vi.useFakeTimers();
    installSpeechStub([]);
    setWebdriver(true);

    // A socket that ignores abort — the engine's own timeout cannot rescue it,
    // so only the registry deadline keeps narration moving.
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));

    const pending = generateWithFallback('Hello there.', {
      engine: 'kokoro',
      kokoroServerUrl: 'http://127.0.0.1:59123',
    });

    await vi.advanceTimersByTimeAsync(25_000);

    await expect(pending).resolves.toBeNull();
    vi.unstubAllGlobals();
  });

  it('propagates caller cancellation rather than falling back', () => {
    const controller = new AbortController();
    controller.abort();

    const timeout = createTimeoutSignal(1000, controller.signal);
    expect(timeout.signal.aborted).toBe(true);
    expect(timeout.timedOut()).toBe(false);
    expect(isCallerAbort(new DOMException('Aborted', 'AbortError'), controller.signal)).toBe(true);
    timeout.cleanup();
  });
});
