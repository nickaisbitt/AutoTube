export { TOPIC_SEED_MAP, getTopicRelevantPicsumUrl, computeFallbackScore } from './picsumFallback';

export type { WikipediaHeroResult } from './wikipediaHero';
export { resolveWikipediaHeroImage, resolveWikipediaHeroFromEntity } from './wikipediaHero';

export type { ReorderStrategy } from './segmentReorder';
export { computeDramaScore, reorderSegments, selectColdOpenSegment } from './segmentReorder';

export type { BeatEffect } from './beatIntegration';
export { BEAT_EFFECT_MAP, getEffectsForBeat, scheduleEffectsForSegment } from './beatIntegration';

export type { SoundBedPreset } from './soundBedMapping';
export { SOUND_BED_PRESETS, selectSoundBedForSegment, computeSoundBedTransition } from './soundBedMapping';

export type { TransitionPlan } from './transitionRendering';
export { createTransitionPlan, renderTransitionFrame, computeTransitionFrameCount } from './transitionRendering';

export type { RetryAction } from './qualityRetry';
export { analyzeReviewFailure, applyRetryActions, computeRetryBudget } from './qualityRetry';

export type { DraftFxConfig } from './draftModeFx';
export { DRAFT_FX_PRESETS, shouldRenderEffect, getDraftConfig } from './draftModeFx';

export type { PipelineTestResult } from './integrationTest';
export { runPipelineIntegrationTest } from './integrationTest';
