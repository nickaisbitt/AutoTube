export type { ThumbnailVariant } from './thumbnailHeatmap'
export { computeContrastScore, computeSaliencyScore, predictCTR, generateABVariants } from './thumbnailHeatmap'

export type { CommentBaitConfig } from './commentBait'
export { COMMENT_BAIT_TEMPLATES, selectCommentBait, computeMidpointTime, createCommentBaitOverlay } from './commentBait'

export type { ChapterMarker } from './mp4Chapters'
export { generateFFmpegChapterMetadata, embedChapters, chaptersFromSegments } from './mp4Chapters'

export type { EasterEgg } from './easterEggs'
export { EASTER_EGG_MESSAGES, generateEasterEggs, drawEasterEgg } from './easterEggs'

export type { SpeedRampConfig } from './speedRamp'
export { computeSpeedRamp, computeSpeedRampFilter, shouldLoopClip } from './speedRamp'

export type { ReviewFeedback } from './feedbackLoop'
export { parseAIReviewFeedback, applyFeedbackCorrections, computeRetryConfig } from './feedbackLoop'

export type { StyleParticleConfig } from './styleParticlesConfig'
export { STYLE_PARTICLE_PRESETS, getParticleConfigForStyle } from './styleParticlesConfig'

export type { EmotionalTone } from './emotionalTransitions'
export { EMOTIONAL_KEYWORDS, detectEmotionalTone, computeTransitionCurve } from './emotionalTransitions'

export type { CutdownConfig } from './cliffhangerCutdowns'
export { detectIncompleteEnding, computeCutdowns, applyCutdowns } from './cliffhangerCutdowns'
