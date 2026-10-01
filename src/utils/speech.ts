export function hasSpeechSupport(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

export async function loadSpeechVoices(timeout = 2000): Promise<SpeechSynthesisVoice[]> {
  if (!hasSpeechSupport()) return [];

  const existingVoices = window.speechSynthesis.getVoices();
  if (existingVoices.length > 0) {
    return existingVoices;
  }

  return new Promise((resolve) => {
    let resolved = false;

    const finish = () => {
      if (resolved) return;
      resolved = true;
      window.clearTimeout(timer);
      window.speechSynthesis.removeEventListener('voiceschanged', finish);
      resolve(window.speechSynthesis.getVoices());
    };

    const timer = window.setTimeout(finish, timeout);
    window.speechSynthesis.addEventListener('voiceschanged', finish, { once: true });
  });
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

export async function speakText(text: string, options: SpeakTextOptions = {}) {
  if (!hasSpeechSupport()) return null;

  const voices = await loadSpeechVoices();
  const voice = pickPreferredVoice(voices, options.preferredVoiceName);

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  if (voice) {
    utterance.voice = voice;
  }

  utterance.rate = options.rate ?? 0.94;
  utterance.pitch = options.pitch ?? 1;
  utterance.volume = options.volume ?? 1;

  utterance.onstart = () => {
    options.onStart?.();
  };

  const handleFinish = () => {
    options.onEnd?.();
  };

  utterance.onend = handleFinish;
  utterance.onerror = () => {
    options.onError?.();
  };

  window.speechSynthesis.speak(utterance);
  window.setTimeout(() => window.speechSynthesis.resume(), 50);

  return utterance;
}

export function stopSpeaking() {
  if (!hasSpeechSupport()) return;
  window.speechSynthesis.cancel();
}
