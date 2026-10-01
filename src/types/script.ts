import { EntityKind } from './core';

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
  soundBed: 'calm' | 'tense' | 'neutral' | 'building' | 'release';
  impactCues: string[];
  sonicSpace: boolean;
  intensity: number;
}

export interface ScriptSegment {
  id: string;
  type: 'intro' | 'section' | 'transition' | 'outro';
  title: string;
  narration: string;
  visualNote: string;
  duration: number;
  chapterLabel?: string;
  purposeTag?: SegmentPurposeTag;
  pacingScore?: number;
  sceneLayout?: SceneLayoutType;
  audioDirection?: AudioDirection;
  /** Task 93: Describes chart/graph visualization for stat segments */
  dataVisualization?: string;
  /** Task 89: Timestamp (in seconds) where CTA overlay should appear */
  ctaTimestamp?: number;
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

export interface TopicContext {
  topic: string;
  coreSubject: string;
  subjectCandidates: string[];
  resolvedTitle?: string;
  kind: EntityKind;
  description: string;
  extract?: string;
  entities: string[];
  heroImageUrl?: string;
  parseReasoning: string;
  thumbnailUrl?: string;
  /** Live web research results — press releases and recent news scraped during topic resolution */
  recentNews?: { source: string; headline: string; snippet: string; url: string; date?: string }[];
}

export interface TopicConfig {
  topic: string;
  style: 'business_insider' | 'warfront' | 'documentary' | 'explainer';
  targetDuration: number;
  tone: 'informative' | 'dramatic' | 'casual' | 'urgent';
  audience: string;
  /** User-provided corrections / known facts that override LLM training data */
  corrections?: string;
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
