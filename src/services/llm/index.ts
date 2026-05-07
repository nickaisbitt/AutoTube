/**
 * LLM Service — barrel export for the modular LLM service directory.
 *
 * Re-exports the public API that consumers (store.ts, llmVisualDirector.ts, tests)
 * previously imported from the monolithic src/services/llm.ts.
 */

// Script generation
export { generateAIScript, generateHookVariants, DEFAULT_SCRIPT_MODEL } from './scriptGenerator';
export type { HookVariant } from './scriptGenerator';

// Script review
export { reviewAndImproveScript } from './scriptReviewer';

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
