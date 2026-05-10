import { NarrativeBeat } from './script';

export interface VisualConcept {
  description: string;
  queries: string[];
  priority: number;
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
  entity?: string;
}

export interface SegmentVisualPlan {
  segmentId: string;
  beat: NarrativeBeat;
  entities: string[];
  concepts: VisualConcept[];
  shots?: {
    concept: string;
    queries: string[];
    vibe: string;
  }[];
  reasoning: string;
  visualAction: string;
  queries: string[];
  visualConcept: string;
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
  shotType?: 'primary' | 'secondary';
  concept?: string;
  reasoning?: string;
  score?: number;
  trace?: string[];
  cropMetadata?: { x: number; y: number; width: number; height: number };
  qualityFactors?: {
    sharpness: number;
    lighting: number;
    composition: number;
    vibrancy: number;
    relevance: number;
  };
  resolvedWidth?: number;
  resolvedHeight?: number;
  resolvedUrl?: string;
}
