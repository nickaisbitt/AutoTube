export type PipelineStep = 
  | 'topic'
  | 'script'
  | 'media'
  | 'narration'
  | 'assembly'
  | 'preview';

export type StepStatus = 'idle' | 'active' | 'processing' | 'complete' | 'error';

export interface ScriptSegment {
  id: string;
  type: 'intro' | 'section' | 'transition' | 'outro';
  title: string;
  narration: string;
  visualNote: string;
  duration: number;
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

export interface VideoProject {
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
  /** Topic-level research that drove the visual plan. */
  topicContext?: TopicContext;
  /** Per-segment visual plan + reasoning, keyed by segmentId. */
  visualPlans?: Record<string, SegmentVisualPlan>;
  /** NEW: System-wide logs for this project session. */
  logs?: SystemLog[];
}

export interface SystemLog {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  source: string;
  message: string;
  details?: any;
}

export interface TopicConfig {
  topic: string;
  style: VideoProject['style'];
  targetDuration: number;
  tone: 'informative' | 'dramatic' | 'casual' | 'urgent';
  audience: string;
}

export interface AppConfig {
  pexelsKey: string;
  openAIKey: string;
  serperKey: string;
  openRouterKey: string;
  firecrawlKey: string;
  sourceType: 'stock' | 'raw';
}
