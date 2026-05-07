export type PipelineStep = 
  | 'topic'
  | 'script'
  | 'media'
  | 'narration'
  | 'ai_edit'
  | 'assembly'
  | 'preview';

export type StepStatus = 'idle' | 'active' | 'processing' | 'complete' | 'error';

export type SegmentPurposeTag =
  | 'stat_hook'
  | 'history'
  | 'moat'
  | 'risk'
  | 'prediction'
  | 'human_story'
  | 'competitive_analysis'
  | 'transition_bridge'
  | 'conclusion';

export type SceneLayoutType =
  | 'centered-text'
  | 'left-text-right-image'
  | 'lower-third-overlay'
  | 'stat-card'
  | 'quote-card';

export interface AudioDirection {
  /** Sound bed mood for this segment. */
  soundBed: 'calm' | 'tense' | 'neutral' | 'building' | 'release';
  /** Impact sound cues aligned to retention-critical lines. */
  impactCues: string[];
  /** Whether to leave brief sonic space (silence) before a major statement. */
  sonicSpace: boolean;
  /** Audio intensity on a 0-10 scale; varied across segments to prevent "wall of tension". */
  intensity: number;
}

export interface ScriptSegment {
  id: string;
  type: 'intro' | 'section' | 'transition' | 'outro';
  title: string;
  narration: string;
  visualNote: string;
  duration: number;
  /** Optional on-screen chapter label (not spoken). Max 50 characters. */
  chapterLabel?: string;
  /** Semantic label indicating this segment's narrative role. */
  purposeTag?: SegmentPurposeTag;
  /** Energy level score from 1 (calm) to 5 (urgent). */
  pacingScore?: number;
  /** Visual composition template assigned by the layout planner. */
  sceneLayout?: SceneLayoutType;
  /** Audio direction metadata for section-appropriate sound design. */
  audioDirection?: AudioDirection;
}

export type NarrativeBeat =
  | 'hook'
  | 'context'
  | 'data'
  | 'quote'
  | 'event'
  | 'analysis'
  | 'conclusion'
  | 'transition';

export type EntityKind =
  | 'person'
  | 'company'
  | 'country'
  | 'place'
  | 'event'
  | 'conflict'
  | 'product'
  | 'technology'
  | 'organization'
  | 'concept';

export interface VisualConcept {
  /** Human-readable description of what should be on screen. */
  description: string;
  /** Concrete search queries derived from the description. */
  queries: string[];
  /** Higher = more important to satisfy this concept. */
  priority: number;
  /** What kind of visual we're after (controls scoring & sources). */
  visualType:
    | 'portrait'
    | 'product'
    | 'logo'
    | 'location'
    | 'event'
    | 'chart'
    | 'document'
    | 'concept'
    | 'crowd'
    | 'historical';
  /** Named entity this concept centers on, if any. */
  entity?: string;
}

export interface SegmentVisualPlan {
  segmentId: string;
  beat: NarrativeBeat;
  entities: string[];
  concepts: VisualConcept[];
  /** NEW: Specific shots for high-velocity cuts. */
  shots?: {
    concept: string;
    queries: string[];
    vibe: string;
  }[];
  /** Multi-line, human-readable rationale shown in the UI. */
  reasoning: string;
  /** Action-oriented description for the harvester. */
  visualAction: string;
  /** Search queries derived from the plan. */
  queries: string[];
  /** Overall visual concept description. */
  visualConcept: string;
}

export interface TopicContext {
  /** Original raw topic / video title as typed by the user. */
  topic: string;
  /** Cleaned, parsed core subject we actually research (e.g. "BlackRock"). */
  coreSubject: string;
  /** All candidate subjects considered during parsing, in priority order. */
  subjectCandidates: string[];
  /** Wikipedia canonical title if a match was found. */
  resolvedTitle?: string;
  kind: EntityKind;
  description: string;
  extract?: string;
  entities: string[];
  heroImageUrl?: string;
  /** Multi-line explanation of how we parsed the title and what we found. */
  parseReasoning: string;
  /** Wikipedia thumbnail image URL, if available. */
  thumbnailUrl?: string;
}

export interface MediaAsset {
  id: string;
  segmentId: string;
  type: 'image' | 'video';
  url: string;
  thumbnailUrl?: string;
  alt: string;
  source: string;
  duration?: number;
  query?: string;
  sourceUrl?: string;
  isFallback?: boolean;
  /** Primary vs Secondary shot for high-velocity cuts. */
  shotType?: 'primary' | 'secondary';
  /** The visual concept this asset was selected for (e.g. "Tesla stock chart"). */
  concept?: string;
  /** Human-readable explanation of why this image was chosen. */
  reasoning?: string;
  /** Final relevance score from the harvester. */
  score?: number;
  /** NEW: Detailed trace of the acquisition journey (Stage 1 -> 3, etc.) */
  trace?: string[];
  /** 16:9 crop rectangle in pixels, applied by the renderer */
  cropMetadata?: { x: number; y: number; width: number; height: number };
  /** Multi-factor quality scores from Reka Edge (each 0-10) */
  qualityFactors?: {
    sharpness: number;
    lighting: number;
    composition: number;
    vibrancy: number;
    relevance: number;
  };
  /** Full-resolution width after URL resolution */
  resolvedWidth?: number;
  /** Full-resolution height after URL resolution */
  resolvedHeight?: number;
  /** Full-resolution URL if different from original url */
  resolvedUrl?: string;
}

export interface NarrationClip {
  id: string;
  segmentId: string;
  text: string;
  voice: string;
  duration: number;
  status: 'pending' | 'generating' | 'ready' | 'unavailable';
  audioUrl?: string;
  mode?: 'live_browser' | 'exported_file';
}

export type TransitionType = 'crossfade' | 'cut' | 'dissolve' | 'wipe';

export interface KenBurnsParams {
  zoomStart: number;    // [1.0, 1.25]
  zoomEnd: number;      // [1.0, 1.25]
  panDirectionX: number; // [-1, 1] where -1=left, 0=center, 1=right
  panDirectionY: number; // [-1, 1] where -1=up, 0=center, 1=down
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
  /** Reordered asset IDs (same set, different order). */
  shotOrder: string[];
  /** Adjusted duration in seconds (null = no change). */
  adjustedDuration: number | null;
  /** Original duration for audit trail. */
  originalDuration: number;
  /** Transition to use BEFORE this segment (null for first segment). */
  transition: { type: TransitionType; durationMs: number } | null;
  /** Ken Burns params keyed by asset ID. */
  kenBurns: Record<string, KenBurnsParams>;
  /** Caption optimization for this segment. */
  captionSettings: CaptionSettings;
  /** Media assets flagged for replacement. */
  replacementSuggestions: MediaReplacementSuggestion[];
  /** Human-readable rationale for changes. */
  rationale: string;
}

export interface EditPlan {
  /** Per-segment editing decisions. */
  segments: SegmentEditEntry[];
  /** Global summary of changes. */
  summary: string;
  /** Whether this is a default no-op plan. */
  isDefault: boolean;
}

export interface AIEditOptions {
  /** External AbortSignal for cancellation. */
  signal?: AbortSignal;
  /** Progress callback: phase description + percentage. */
  onProgress?: (pct: number, message: string) => void;
  /** LLM model override. Default: google/gemini-2.0-flash-001 */
  model?: string;
  /** Relevance threshold for media replacement flagging (0-100). Default: 40 */
  relevanceThreshold?: number;
  /** Padding seconds added to narration-matched durations. Default: 0.5 */
  timingPadding?: number;
}

export interface QualityReport {
  /** Scores per category, each an integer 1–10. */
  scores: {
    visualQuality: number;
    pacing: number;
    narrativeClarity: number;
    thumbnailEffectiveness: number;
    overallProductionValue: number;
  };
  /** Written feedback per category, 1–3 sentences each (max 500 chars). */
  feedback: {
    visualQuality: string;
    pacing: string;
    narrativeClarity: string;
    thumbnailEffectiveness: string;
    overallProductionValue: string;
  };
  /** Overall letter grade: A, B, C, D, or F. */
  letterGrade: string;
  /** Overall summary, 2–4 sentences (max 1000 chars). */
  summary: string;
  /** ISO timestamp of when the review was completed. */
  reviewedAt: string;
}

export interface VideoProject {
  /** Schema version for migration support. */
  version: number;
  id: string;
  title: string;
  topic: string;
  style: 'business_insider' | 'warfront' | 'documentary' | 'explainer';
  targetDuration: number;
  script: ScriptSegment[];
  media: MediaAsset[];
  narration: NarrationClip[];
  thumbnail?: string;
  status: 'draft' | 'processing' | 'complete';
  createdAt: Date;
  exportSettings?: {
    quality: 'draft' | 'standard' | 'high';
    format: 'webm' | 'mp4';
    resolution?: '720p' | '1080p' | '4K';
    width: number;
    height: number;
    mimeType: string;
    fileName: string;
    /** Whether to include background music in the rendered video. Defaults to true. */
    backgroundMusic?: boolean;
    /** Music mood preset ID (tense, uplifting, neutral). When set, overrides style-based music selection. */
    musicPreset?: string;
  };
  /** Topic-level research that drove the visual plan. */
  topicContext?: TopicContext;
  /** Per-segment visual plan + reasoning, keyed by segmentId. */
  visualPlans?: Record<string, SegmentVisualPlan>;
  /** The AI-generated edit plan (stored for UI display). */
  editPlan?: EditPlan;
  /** NEW: System-wide logs for this project session. */
  logs?: SystemLog[];
  /** Blind review quality report, if available. */
  blindReview?: QualityReport;
}

export interface SystemLog {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  source: string;
  message: string;
  /** MR-7: narrowed from `any` to prevent accidental circular-ref / function serialisation into localStorage. */
  details?: Record<string, unknown> | string | Error | unknown;
}

export interface TopicConfig {
  topic: string;
  style: VideoProject['style'];
  targetDuration: number;
  tone: 'informative' | 'dramatic' | 'casual' | 'urgent';
  audience: string;
}

export interface AppConfig {
  openRouterKey: string;
  sourceType: 'stock' | 'raw';
  flickrKey?: string;
  /** Grok voice ID. Default: 'Sal'. */
  ttsVoice?: string;
}
