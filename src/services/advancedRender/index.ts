export {
  type LowerThirdConfig,
  drawLowerThird,
  createLowerThirdFromSource,
} from './lowerThirds';

export {
  type TextGridConfig,
  createTextGrid,
  drawTextGrid,
} from './textGrid';

export {
  type AspectRatio,
  ASPECT_RATIO_DIMENSIONS,
  computeCropForAspect,
  generateMultiAspectRenderCommands,
} from './aspectRatio';

export {
  type VoiceEmotion,
  EMOTION_VOICE_MAP,
  getVoiceForSegment,
  applyVoiceSettingsToKokoro,
} from './voiceEmotion';

export {
  type TransitionType,
  drawTransition,
  getTransitionDuration,
  selectTransitionForSegment,
} from './transitions';

export {
  type RevealStyle,
  drawProgressiveReveal,
  isChartAsset,
} from './chartReveal';

export {
  type NameCardConfig,
  extractNamesFromText,
  drawNameCard,
} from './nameCard';

export {
  type CitationConfig,
  drawCitationBadge,
  extractCitationsFromSegments,
} from './sourceCitation';

export {
  type TimelineConfig,
  drawEnhancedTimeline,
  computeNotchPositions,
} from './progressTimeline';
