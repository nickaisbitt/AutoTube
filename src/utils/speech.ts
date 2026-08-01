/**
 * Browser SpeechSynthesis helpers.
 *
 * Headless Chromium (Playwright, `npm run generate:video`) exposes the whole
 * SpeechSynthesis API but ships no voices: `getVoices()` stays empty, the
 * `voiceschanged` event never fires, and `speak()` reports neither `end` nor
 * `error`. Every entry point here is therefore bounded and remembers a proven
 * dead end, so the narration step fails fast with a clear reason instead of
 * stalling the pipeline once per segment.
 */

const VOICE_LOAD_TIMEOUT_MS = 2000;
/** Automated browsers never populate voices — probe briefly, then give up. */
const HEADLESS_VOICE_LOAD_TIMEOUT_MS = 250;
/** speak() must report `start` within this window or synthesis is a dead end. */
const SPEAK_START_TIMEOUT_MS = 2000;
/** Absolute cap on one utterance before we synthesise the missing `end`. */
const SPEAK_MAX_DURATION_MS = 120_000;
const WORDS_PER_MINUTE = 150;

/** Set once a voice probe came back empty; cleared if voices show up later. */
let noVoicesReason: string | null = null;
/** Set once speak() proved it produces no audio — not recoverable in-session. */
let synthesisFailedReason: string | null = null;
const watchdogTimers = new Set<number>();

/** True for Playwright/WebDriver-controlled browsers, headless or headed. */
export function isHeadlessBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (navigator.webdriver === true) return true;
  return /headless/i.test(navigator.userAgent || '');
}

export function hasSpeechSupport(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

/**
 * Whether browser speech can actually produce audio, as opposed to merely
 * exposing the API. Callers that would otherwise wait on speech events should
 * check this first.
 */
export function isSpeechSynthesisUsable(): boolean {
  return describeSpeechUnavailability() === null;
}

/** Human-readable reason browser speech is unusable, or null when it works. */
export function describeSpeechUnavailability(): string | null {
  if (!hasSpeechSupport()) return 'SpeechSynthesis API unavailable in this environment';
  if (isHeadlessBrowser()) return 'automated/headless browser has no speech voices';
  if (synthesisFailedReason) return synthesisFailedReason;
  // Voices can arrive after a slow first load — let a late list heal the verdict.
  if (noVoicesReason && window.speechSynthesis.getVoices().length > 0) {
    noVoicesReason = null;
  }
  return noVoicesReason;
}

/** Test hook: forget the probed dead-end verdicts. */
export function resetSpeechProbeCache(): void {
  noVoicesReason = null;
  synthesisFailedReason = null;
}

function clearWatchdogs(): void {
  if (typeof window === 'undefined') return;
  for (const id of watchdogTimers) window.clearTimeout(id);
  watchdogTimers.clear();
}

function addWatchdog(handler: () => void, delayMs: number): number {
  const id = window.setTimeout(() => {
    watchdogTimers.delete(id);
    handler();
  }, delayMs);
  watchdogTimers.add(id);
  return id;
}

export async function loadSpeechVoices(timeout = VOICE_LOAD_TIMEOUT_MS): Promise<SpeechSynthesisVoice[]> {
  if (!hasSpeechSupport()) return [];

  const existingVoices = window.speechSynthesis.getVoices();
  if (existingVoices.length > 0) {
    noVoicesReason = null;
    return existingVoices;
  }

  // A previous probe already proved there are no voices — narration calls this
  // once per segment, so never pay the wait twice.
  if (noVoicesReason || synthesisFailedReason) return [];

  const budget = isHeadlessBrowser() ? Math.min(timeout, HEADLESS_VOICE_LOAD_TIMEOUT_MS) : timeout;

  const voices = await new Promise<SpeechSynthesisVoice[]>((resolve) => {
    let resolved = false;

    const finish = () => {
      if (resolved) return;
      resolved = true;
      window.clearTimeout(timer);
      window.speechSynthesis.removeEventListener('voiceschanged', finish);
      resolve(window.speechSynthesis.getVoices());
    };

    const timer = window.setTimeout(finish, budget);
    window.speechSynthesis.addEventListener('voiceschanged', finish, { once: true });
  });

  if (voices.length === 0) {
    noVoicesReason = `no speech synthesis voices after ${budget}ms`;
  }

  return voices;
}

export function pickPreferredVoice(
  voices: SpeechSynthesisVoice[],
  preferredName?: string,
): SpeechSynthesisVoice | null {
  if (!voices.length) return null;

  if (preferredName) {
    const exactMatch = voices.find((voice) => voice.name === preferredName);
    if (exactMatch) return exactMatch;
  }

  const englishVoices = voices.filter((voice) => voice.lang.toLowerCase().startsWith('en'));
  const candidates = englishVoices.length ? englishVoices : voices;

  const priorityPatterns = [
    /google/i,
    /microsoft/i,
    /samantha/i,
    /daniel/i,
    /alex/i,
    /serena/i,
    /allison/i,
    /narrator/i,
  ];

  for (const pattern of priorityPatterns) {
    const match = candidates.find((voice) => pattern.test(voice.name));
    if (match) return match;
  }

  return candidates[0] ?? voices[0] ?? null;
}

interface SpeakTextOptions {
  preferredVoiceName?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: () => void;
}

/** Upper bound for an utterance, used to synthesise a missing `end` event. */
function estimateUtteranceMs(text: string, rate: number): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const effectiveWpm = WORDS_PER_MINUTE * Math.max(rate, 0.5);
  const spokenMs = (words / effectiveWpm) * 60_000;
  return Math.min(SPEAK_MAX_DURATION_MS, Math.ceil(spokenMs * 1.5) + 4000);
}

export async function speakText(text: string, options: SpeakTextOptions = {}) {
  const unavailable = describeSpeechUnavailability();
  if (unavailable) {
    // Never hand the caller a promise that resolves and then goes silent — the
    // UI keeps a "narrating" flag until one of these callbacks fires.
    options.onError?.();
    return null;
  }

  const voices = await loadSpeechVoices();
  const voice = pickPreferredVoice(voices, options.preferredVoiceName);

  if (!voice) {
    options.onError?.();
    return null;
  }

  window.speechSynthesis.cancel();
  clearWatchdogs();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = voice;

  const rate = options.rate ?? 0.94;
  utterance.rate = rate;
  utterance.pitch = options.pitch ?? 1;
  utterance.volume = options.volume ?? 1;

  let settled = false;
  let started = false;

  const settle = (callback?: () => void) => {
    if (settled) return;
    settled = true;
    clearWatchdogs();
    callback?.();
  };

  utterance.onstart = () => {
    started = true;
    options.onStart?.();
  };
  utterance.onend = () => settle(options.onEnd);
  utterance.onerror = () => settle(options.onError);

  window.speechSynthesis.speak(utterance);
  window.setTimeout(() => window.speechSynthesis.resume(), 50);

  // No `start` means the engine silently swallowed the utterance (typical for
  // automated browsers with no installed voices): report the failure once and
  // stop routing later segments through browser TTS.
  addWatchdog(() => {
    if (started || settled) return;
    synthesisFailedReason = `speech synthesis produced no audio within ${SPEAK_START_TIMEOUT_MS}ms`;
    settle(options.onError);
    window.speechSynthesis.cancel();
  }, SPEAK_START_TIMEOUT_MS);

  // Some engines drop the `end` event on long utterances; treat the estimated
  // duration as the hard end so playback state cannot stick forever.
  addWatchdog(
    () => settle(options.onEnd),
    estimateUtteranceMs(text, rate) + SPEAK_START_TIMEOUT_MS,
  );

  return utterance;
}

export function stopSpeaking() {
  clearWatchdogs();
  if (!hasSpeechSupport()) return;
  window.speechSynthesis.cancel();
}
