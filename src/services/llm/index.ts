/**
 * LLM Service — barrel export for the modular LLM service directory.
 *
 * Re-exports the public API that consumers (store.ts, llmVisualDirector.ts, tests)
 * previously imported from the monolithic src/services/llm.ts.
 */

export {
  DEFAULT_LLM_MODEL,
  DEFAULT_VISION_MODEL,
  QUALITY_CHECK_JUDGES,
} from './defaultModels';

// Script generation
export { generateAIScript, generateHookVariants, DEFAULT_SCRIPT_MODEL, validateScriptSpecificity, buildSpecificityFixPrompt } from './scriptGenerator';
export type { HookVariant } from './scriptGenerator';

// Script review
export { reviewAndImproveScript, refineScriptMultiPass } from './scriptReviewer';

// Series metadata
export { generateSeriesMetadata } from './seriesGenerator';

// Pinned comment generation
export { generatePinnedComments } from './pinnedComments';

// Hashtag generation
export { generateHashtags } from './hashtagGenerator';

// Emotional arc mapping
export { mapEmotionalArc } from './emotionalArc';

// Story arc validation
export { validateStoryArc } from './storyArcValidator';

// Title generation
export { generateVideoTitle } from './titleGenerator';

// Parsing utilities
export {
  sanitiseTopic,
  stripPartLabels,
  injectTransitionIfMissing,
  validateSegment,
  parseSegmentsFromContent,
} from './parsing';

// Topic context helpers
export { fetchWikiContext, fetchTopicContext } from './topicContext';

// Shared LLM call wrapper and types
export { callLLM } from './callLLM';
export type { LLMConfig, LLMResponse } from './callLLM';
