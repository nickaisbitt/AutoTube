export interface DraftFxConfig {
  enabledEffects: string[];
  disabledEffects: string[];
  qualityLevel: 'minimal' | 'standard' | 'full';
}

export const DRAFT_FX_PRESETS: Record<string, DraftFxConfig> = {
  minimal: {
    enabledEffects: ['subtitles', 'progress_bar'],
    disabledEffects: ['particles', 'grain', 'vignette', 'light_leaks', 'chromatic_aberration', 'parallax', 'flash_frames', 'kinetic_overlays'],
    qualityLevel: 'minimal',
  },
  standard: {
    enabledEffects: ['subtitles', 'progress_bar', 'vignette', 'basic_particles'],
    disabledEffects: ['grain', 'light_leaks', 'chromatic_aberration', 'parallax', 'flash_frames'],
    qualityLevel: 'standard',
  },
  full: {
    enabledEffects: ['subtitles', 'progress_bar', 'vignette', 'particles', 'grain', 'light_leaks', 'chromatic_aberration', 'parallax', 'flash_frames', 'kinetic_overlays'],
    disabledEffects: [],
    qualityLevel: 'full',
  },
};

export function shouldRenderEffect(
  effectName: string,
  isDraftMode: boolean,
  config?: DraftFxConfig,
): boolean {
  if (!isDraftMode) return true;

  const activeConfig = config || DRAFT_FX_PRESETS['standard'];

  if (activeConfig.disabledEffects.includes(effectName)) {
    return false;
  }

  if (activeConfig.enabledEffects.length > 0) {
    return activeConfig.enabledEffects.includes(effectName);
  }

  return true;
}

export function getDraftConfig(level: 'minimal' | 'standard' | 'full'): DraftFxConfig {
  return DRAFT_FX_PRESETS[level] || DRAFT_FX_PRESETS['standard'];
}
