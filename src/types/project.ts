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
}
