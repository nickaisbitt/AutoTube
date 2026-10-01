export interface RetryAction {
  type: 'brightness_boost' | 'asset_replacement' | 'pacing_adjustment' | 'audio_fix';
  params: Record<string, unknown>;
}

const LOW_VISUAL_QUALITY_PATTERNS = /\b(dark|dim|underexposed|low.?quality|blurry|grainy|pixelated)\b/i;
const POOR_PACING_PATTERNS = /\b(slow|boring|dragging|monotonous|repetitive|dull)\b/i;
const AUDIO_ISSUE_PATTERNS = /\b(audio|sound|volume|quiet|loud|muffled|distorted|ducking)\b/i;
const NARRATIVE_ISSUE_PATTERNS = /\b(confusing|unclear|narrative|story|structure|incoherent|rambling)\b/i;

export function analyzeReviewFailure(
  reviewScore: number,
  reviewComments: string,
): RetryAction[] {
  const actions: RetryAction[] = [];
  const comments = reviewComments || '';

  if (LOW_VISUAL_QUALITY_PATTERNS.test(comments) || reviewScore < 4) {
    actions.push({
      type: 'brightness_boost',
      params: {
        brightnessIncrease: 0.1,
        contrastIncrease: 0.05,
        saturationIncrease: 0.05,
      },
    });

    actions.push({
      type: 'asset_replacement',
      params: {
        minScoreThreshold: 100,
        replaceLowScoreAssets: true,
        maxReplacements: 3,
      },
    });
  }

  if (POOR_PACING_PATTERNS.test(comments)) {
    actions.push({
      type: 'pacing_adjustment',
      params: {
        increaseBeatFrequency: true,
        beatIntervalReduction: 5,
        addMoreRetentionBeats: true,
        shortenLongSegments: true,
        maxSegmentDuration: 30,
      },
    });
  }

  if (AUDIO_ISSUE_PATTERNS.test(comments)) {
    actions.push({
      type: 'audio_fix',
      params: {
        adjustDuckingLevels: true,
        duckingDepth: -18,
        narrationVolumeBoost: 0.1,
        musicVolumeReduction: 0.05,
        normalizeLevels: true,
      },
    });
  }

  if (NARRATIVE_ISSUE_PATTERNS.test(comments)) {
    actions.push({
      type: 'pacing_adjustment',
      params: {
        flagForRescripting: true,
        simplifyLanguage: true,
        addTransitions: true,
        maxSentenceLength: 20,
      },
    });
  }

  if (actions.length === 0 && reviewScore < 5) {
    actions.push({
      type: 'brightness_boost',
      params: {
        brightnessIncrease: 0.05,
        generalImprovement: true,
      },
    });
  }

  return actions;
}

export function applyRetryActions(
  project: Record<string, unknown>,
  actions: RetryAction[],
): Record<string, unknown> {
  const result = { ...project };

  for (const action of actions) {
    switch (action.type) {
      case 'brightness_boost': {
        const existingAdjustments = (result.visualAdjustments as Record<string, unknown>) || {};
        result.visualAdjustments = {
          ...existingAdjustments,
          brightness: ((existingAdjustments.brightness as number) || 0) + (action.params.brightnessIncrease as number || 0),
          contrast: ((existingAdjustments.contrast as number) || 0) + (action.params.contrastIncrease as number || 0),
          saturation: ((existingAdjustments.saturation as number) || 0) + (action.params.saturationIncrease as number || 0),
        };
        break;
      }

      case 'asset_replacement': {
        result.assetReplacementFlags = {
          minScoreThreshold: action.params.minScoreThreshold,
          maxReplacements: action.params.maxReplacements,
          pending: true,
        };
        break;
      }

      case 'pacing_adjustment': {
        const existingPacing = (result.pacingOverrides as Record<string, unknown>) || {};
        result.pacingOverrides = {
          ...existingPacing,
          beatIntervalReduction: action.params.beatIntervalReduction,
          addMoreRetentionBeats: action.params.addMoreRetentionBeats,
          shortenLongSegments: action.params.shortenLongSegments,
          maxSegmentDuration: action.params.maxSegmentDuration,
          flagForRescripting: action.params.flagForRescripting,
        };
        break;
      }

      case 'audio_fix': {
        const existingAudio = (result.audioOverrides as Record<string, unknown>) || {};
        result.audioOverrides = {
          ...existingAudio,
          duckingDepth: action.params.duckingDepth,
          narrationVolumeBoost: action.params.narrationVolumeBoost,
          musicVolumeReduction: action.params.musicVolumeReduction,
          normalizeLevels: action.params.normalizeLevels,
        };
        break;
      }
    }
  }

  result.retryAttempt = ((result.retryAttempt as number) || 0) + 1;
  result.lastRetryActions = actions;

  return result;
}

export function computeRetryBudget(attemptNumber: number): { maxCorrections: number; minScoreThreshold: number } {
  const maxCorrections = Math.max(1, 5 - attemptNumber);
  const minScoreThreshold = Math.min(8, 4 + attemptNumber * 0.5);

  return {
    maxCorrections,
    minScoreThreshold,
  };
}
