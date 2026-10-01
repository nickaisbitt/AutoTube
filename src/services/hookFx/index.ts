export {
  type InterruptType,
  drawGlitchEffect,
  drawStaticNoise,
  drawColorBurst,
  selectInterruptType,
} from './coldOpenInterrupt';

export {
  drawContrastInversion,
  drawSplitContrast,
  computeContrastScore,
} from './contrastHook';

export {
  generateRiserFilter,
  generateBassDropFilter,
  generateImpactSequence,
} from './bassDropRiser';

export {
  drawMultiLayerTitle,
  computeTypewriterProgress,
} from './cinematicTitleDepth';

export {
  type TensionProfile,
  createTensionProfile,
  getSegmentZoom,
  computeTensionScore,
} from './tensionRamp';

export {
  type KineticOverlay,
  drawKineticOverlay,
  generateRetentionOverlays,
} from './kineticOverlays';

export {
  type MetricGroup,
  extractMetricsFromText,
  groupMetricsByThree,
  drawMetricGroup,
} from './ruleOfThree';

export {
  type CliffhangerType,
  CLIFFHANGER_TEMPLATES,
  generateCliffhangerPrompt,
  detectCliffhangerOpportunity,
  injectCliffhanger,
} from './cliffhangerScripting';

export {
  type PacingPattern,
  analyzePacingPattern,
  rewriteForAlternatingPacing,
  computePacingVarietyScore,
  injectPausesForEmphasis,
} from './pacingLoops';
