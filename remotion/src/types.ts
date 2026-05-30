// Brand configuration
export interface BrandConfig {
  accentColor: string;
  channelName: string;
  fontFamily: string;
  particleStyle: 'warfront' | 'cyber' | 'documentary' | 'business_insider' | 'explainer';
}

// Serializable segment
export interface SegmentProps {
  id: string;
  title: string;
  narration: string;
  type: 'intro' | 'section' | 'transition' | 'outro';
  duration: number; // seconds
  pacingScore: number;
  purposeTag?: string;
  sceneLayout?: string;
  visualNote?: string;
  media?: MediaAssetProps;
  narrationAudioUrl?: string; // URL to pre-generated narration audio
  narrationWordTimings?: WordTiming[];
}

export interface MediaAssetProps {
  id: string;
  url: string;
  type: 'image' | 'video';
  alt: string;
  source: string;
  thumbnailUrl?: string;
  duration?: number;
}

export interface WordTiming {
  word: string;
  startMs: number;
  endMs: number;
}

// Ken Burns parameters
export interface KenBurnsParams {
  zoomStart: number;
  zoomEnd: number;
  panDirectionX: number;
  panDirectionY: number;
}

// Transition type
export type TransitionType = 'crossfade' | 'wipe-left' | 'wipe-right' | 'slide-left' | 'slide-right' | 'flash';

// Edit plan segment
export interface EditPlanSegment {
  segmentId: string;
  kenBurns?: Record<string, KenBurnsParams>;
  transition?: { type: TransitionType; duration: number };
}

// Retention beat
export interface RetentionBeat {
  type: string;
  time: number; // seconds into segment
  text?: string;
  segmentIndex: number;
}

// Top-level project props
export interface ProjectProps {
  title: string;
  topic: string;
  style: string;
  segments: SegmentProps[];
  brand: BrandConfig;
  editPlan: EditPlanSegment[];
  retentionBeats: RetentionBeat[];
  totalDurationFrames: number;
  fps: number;
  width: number;
  height: number;
}
