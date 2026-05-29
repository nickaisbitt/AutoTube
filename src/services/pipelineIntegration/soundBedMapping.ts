export interface SoundBedPreset {
  name: string;
  audioFile: string;
  volume: number;
  fadeIn: number;
  fadeOut: number;
  loop: boolean;
}

export const SOUND_BED_PRESETS: Record<string, SoundBedPreset> = {
  building: {
    name: 'building',
    audioFile: 'bg-uplifting.aac',
    volume: 0.15,
    fadeIn: 2.0,
    fadeOut: 1.5,
    loop: true,
  },
  tense: {
    name: 'tense',
    audioFile: 'bg-tense.aac',
    volume: 0.18,
    fadeIn: 0.5,
    fadeOut: 1.0,
    loop: true,
  },
  neutral: {
    name: 'neutral',
    audioFile: 'bg-neutral.aac',
    volume: 0.12,
    fadeIn: 1.5,
    fadeOut: 1.5,
    loop: true,
  },
  calm: {
    name: 'calm',
    audioFile: 'bg-neutral.aac',
    volume: 0.10,
    fadeIn: 2.5,
    fadeOut: 2.0,
    loop: true,
  },
  release: {
    name: 'release',
    audioFile: 'bg-uplifting.aac',
    volume: 0.20,
    fadeIn: 1.0,
    fadeOut: 3.0,
    loop: false,
  },
};

const PURPOSE_TAG_TO_BED: Record<string, string> = {
  stat_hook: 'neutral',
  history: 'neutral',
  moat: 'building',
  risk: 'tense',
  prediction: 'building',
  human_story: 'calm',
  competitive_analysis: 'tense',
  transition_bridge: 'calm',
  conclusion: 'release',
};

export function selectSoundBedForSegment(
  purposeTag: string,
  pacingScore: number,
  intensity: number,
): string {
  if (intensity >= 8) return 'tense';
  if (intensity <= 2) return 'calm';

  if (pacingScore >= 4) {
    if (purposeTag === 'risk' || purposeTag === 'competitive_analysis') return 'tense';
    return 'building';
  }

  if (pacingScore <= 2) {
    return 'calm';
  }

  return PURPOSE_TAG_TO_BED[purposeTag] || 'neutral';
}

export function computeSoundBedTransition(
  fromBed: string,
  toBed: string,
): { crossfadeDuration: number; volumeCurve: string } {
  if (fromBed === toBed) {
    return { crossfadeDuration: 0, volumeCurve: 'linear' };
  }

  const fromPreset = SOUND_BED_PRESETS[fromBed];
  const toPreset = SOUND_BED_PRESETS[toBed];

  if (!fromPreset || !toPreset) {
    return { crossfadeDuration: 1.0, volumeCurve: 'linear' };
  }

  const avgFadeOut = fromPreset.fadeOut;
  const avgFadeIn = toPreset.fadeIn;
  const crossfadeDuration = Math.max(0.5, (avgFadeOut + avgFadeIn) / 2);

  let volumeCurve = 'linear';
  if (fromBed === 'tense' && toBed === 'calm') {
    volumeCurve = 'ease_out';
  } else if (fromBed === 'calm' && toBed === 'tense') {
    volumeCurve = 'ease_in';
  } else if (fromBed === 'building' || toBed === 'building') {
    volumeCurve = 'ease_in_out';
  }

  return { crossfadeDuration, volumeCurve };
}
