export interface VoiceEmotion {
  voice: string;
  speed: number;
  pitch: number;
  emotion: string;
}

export const EMOTION_VOICE_MAP: Record<string, VoiceEmotion> = {
  stat_hook: { voice: 'authoritative', speed: 1.0, pitch: 1.0, emotion: 'confident' },
  risk: { voice: 'serious', speed: 0.95, pitch: 0.95, emotion: 'concerned' },
  prediction: { voice: 'excited', speed: 1.1, pitch: 1.1, emotion: 'enthusiastic' },
  history: { voice: 'calm', speed: 0.9, pitch: 0.95, emotion: 'reflective' },
  competitive_analysis: { voice: 'neutral', speed: 1.0, pitch: 1.0, emotion: 'analytical' },
  human_story: { voice: 'warm', speed: 0.85, pitch: 1.0, emotion: 'empathetic' },
  conclusion: { voice: 'confident', speed: 0.95, pitch: 1.05, emotion: 'assured' },
};

const SPEED_VARIATION = 0.03;
const PITCH_VARIATION = 0.02;

export function getVoiceForSegment(
  purposeTag: string,
  segmentIndex: number,
): VoiceEmotion {
  const base = EMOTION_VOICE_MAP[purposeTag] ?? EMOTION_VOICE_MAP['stat_hook'];

  const seed = segmentIndex * 7 + purposeTag.length;
  const speedOffset = ((seed % 5) - 2) * SPEED_VARIATION;
  const pitchOffset = ((seed % 3) - 1) * PITCH_VARIATION;

  return {
    voice: base.voice,
    speed: Math.round((base.speed + speedOffset) * 100) / 100,
    pitch: Math.round((base.pitch + pitchOffset) * 100) / 100,
    emotion: base.emotion,
  };
}

export function applyVoiceSettingsToKokoro(
  voice: VoiceEmotion,
): { voice: string; speed: number } {
  return {
    voice: voice.voice,
    speed: Math.max(0.5, Math.min(2.0, voice.speed)),
  };
}
