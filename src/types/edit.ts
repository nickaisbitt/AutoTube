export type TransitionType = 'crossfade' | 'cut' | 'dissolve' | 'wipe' | 'slide' | 'zoom' | 'glitch' | 'flash' | 'push' | 'spin' | 'cross-dissolve';

export interface KenBurnsParams {
  zoomStart: number;
  zoomEnd: number;
  panDirectionX: number;
  panDirectionY: number;
}

export interface MediaReplacementSuggestion {
  assetId: string;
  reason: string;
  alternativeQueries: string[];
}

export interface CaptionSettings {
  wordsPerWindow: number;
  displayDurationMs: number;
  isFastPaced: boolean;
}

export interface SegmentEditEntry {
  segmentId: string;
  shotOrder: string[];
  adjustedDuration: number | null;
  originalDuration: number;
  transition: { type: TransitionType; durationMs: number } | null;
  kenBurns: Record<string, KenBurnsParams>;
  captionSettings: CaptionSettings;
  replacementSuggestions: MediaReplacementSuggestion[];
  rationale: string;
}

export interface EditPlan {
  segments: SegmentEditEntry[];
  summary: string;
  isDefault: boolean;
}

export interface AIEditOptions {
  signal?: AbortSignal;
  onProgress?: (pct: number, message: string) => void;
  model?: string;
  relevanceThreshold?: number;
  timingPadding?: number;
}
