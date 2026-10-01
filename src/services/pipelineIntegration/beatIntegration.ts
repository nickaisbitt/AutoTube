export interface BeatEffect {
  type: string;
  visualEffect: string;
  audioEffect: string;
  intensity: number;
}

export const BEAT_EFFECT_MAP: Record<string, BeatEffect> = {
  text_slam: {
    type: 'text_slam',
    visualEffect: 'kinetic_overlay',
    audioEffect: 'bass_accent',
    intensity: 0.85,
  },
  zoom: {
    type: 'zoom',
    visualEffect: 'tension_zoom',
    audioEffect: 'pitch_ramp',
    intensity: 0.7,
  },
  graphic_switch: {
    type: 'graphic_switch',
    visualEffect: 'flash_frame',
    audioEffect: 'whoosh',
    intensity: 0.75,
  },
  sudden_silence: {
    type: 'sudden_silence',
    visualEffect: 'contrast_inversion',
    audioEffect: 'audio_cut',
    intensity: 0.9,
  },
  rhetorical_question: {
    type: 'rhetorical_question',
    visualEffect: 'text_grid',
    audioEffect: 'reverb',
    intensity: 0.6,
  },
  visual_break: {
    type: 'visual_break',
    visualEffect: 'chromatic_aberration',
    audioEffect: 'riser',
    intensity: 0.65,
  },
  stat_callout: {
    type: 'stat_callout',
    visualEffect: 'rule_of_three',
    audioEffect: 'sub_bass_rumble',
    intensity: 0.8,
  },
  rehook_line: {
    type: 'rehook_line',
    visualEffect: 'cold_open_interrupt',
    audioEffect: 'impact',
    intensity: 0.95,
  },
};

const DEFAULT_EFFECT: BeatEffect = {
  type: 'default',
  visualEffect: 'fade',
  audioEffect: 'crossfade',
  intensity: 0.5,
};

export function getEffectsForBeat(beatType: string, pacingScore: number): BeatEffect {
  const baseEffect = BEAT_EFFECT_MAP[beatType] || DEFAULT_EFFECT;

  const pacingMultiplier = pacingScore >= 4 ? 1.2 : pacingScore <= 2 ? 0.8 : 1.0;
  const modulatedIntensity = Math.min(1.0, baseEffect.intensity * pacingMultiplier);

  return {
    ...baseEffect,
    intensity: modulatedIntensity,
  };
}

interface RetentionBeatInput {
  type: string;
  time: number;
}

export function scheduleEffectsForSegment(
  retentionBeats: RetentionBeatInput[],
  segmentDuration: number,
): BeatEffect[] {
  if (retentionBeats.length === 0 || segmentDuration <= 0) return [];

  const effects: BeatEffect[] = [];

  for (const beat of retentionBeats) {
    if (beat.time < 0 || beat.time > segmentDuration) continue;

    const progressInSegment = beat.time / segmentDuration;
    const pacingScore = progressInSegment < 0.3 ? 5 : progressInSegment < 0.7 ? 3 : 4;

    const effect = getEffectsForBeat(beat.type, pacingScore);
    effects.push(effect);
  }

  return effects;
}
