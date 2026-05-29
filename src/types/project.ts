import { ScriptSegment, NarrationClip, TopicContext } from './script';
import { MediaAsset, SegmentVisualPlan } from './media';
import { EditPlan } from './edit';
import { SystemLog } from './core';

export interface QualityReport {
  scores: {
    visualQuality: number;
    pacing: number;
    narrativeClarity: number;
    thumbnailEffectiveness: number;
    overallProductionValue: number;
  };
  feedback: {
    visualQuality: string;
    pacing: string;
    narrativeClarity: string;
    thumbnailEffectiveness: string;
    overallProductionValue: string;
  };
  letterGrade: string;
  summary: string;
  reviewedAt: string;
}

export interface TitleVariants {
  direct: string;
  curiosityGap: string;
  emotionalUrgent: string;
}

export interface PinnedComment {
  text: string;
  type: 'question_prompt' | 'controversial_take' | 'what_did_i_miss';
}

export interface SeriesMetadata {
  seriesName: string;
  episodeNumber: number;
  playlistDescription: string;
  episodeTitle: string;
}

export interface EmotionalArcPoint {
  segmentIndex: number;
  segmentTitle: string;
  emotion: string;
  intensity: number;
  rationale: string;
}

export interface VideoProject {
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
    backgroundMusic?: boolean;
    musicPreset?: string;
    isStreaming?: boolean;
  };
  topicContext?: TopicContext;
  visualPlans?: Record<string, SegmentVisualPlan>;
  editPlan?: EditPlan;
  logs?: SystemLog[];
  blindReview?: QualityReport;
  /** Task 97: Title A/B/C variants */
  titleVariants?: TitleVariants;
  /** Task 102: Series/playlist metadata */
  seriesMetadata?: SeriesMetadata;
  /** Task 91: Pinned comment options */
  pinnedComments?: PinnedComment[];
  /** Task 96: Generated hashtags */
  hashtags?: string[];
  /** Task 98: Emotional arc mapping */
  emotionalArc?: EmotionalArcPoint[];
  /** Task 86: Story arc validation result */
  storyArcValidation?: {
    passed: boolean;
    score: number;
    issues: string[];
  };
}
