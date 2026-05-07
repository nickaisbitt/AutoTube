import { useRef } from 'react';

export interface NarrationSliceState {
  /** Ref to track if media sourcing is in progress (prevents double-invocation) */
  sourcingRef: React.MutableRefObject<boolean>;
}

export interface NarrationSliceActions {
  // Narration generation is handled by the pipeline orchestrator.
  // This slice provides the shared ref state needed during narration.
}

/**
 * Narration slice — holds TTS-related refs and state.
 *
 * The actual narration generation logic lives in the pipeline orchestrator.
 * This slice provides the mutable ref state that the orchestrator needs.
 */
export function useNarrationSlice(): NarrationSliceState & NarrationSliceActions {
  const sourcingRef = useRef(false);

  return {
    sourcingRef,
  };
}
