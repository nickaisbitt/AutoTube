export type PipelineStep = 
  | 'topic'
  | 'script'
  | 'media'
  | 'narration'
  | 'ai_edit'
  | 'assembly'
  | 'preview';

export type StepStatus = 'idle' | 'active' | 'processing' | 'complete' | 'error';

export interface SystemLog {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  source: string;
  message: string;
  details?: Record<string, unknown> | string | Error | unknown;
}

export interface AppConfig {
  openRouterKey: string;
  /** Shared key for privileged /api/* calls (matches server AUTOTUBE_API_KEY). */
  autotubeApiKey?: string;
  sourceType: 'stock' | 'raw';
  flickrKey?: string;
  pexelsKey?: string;
  pixabayKey?: string;
  ttsVoice?: string;
}

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
