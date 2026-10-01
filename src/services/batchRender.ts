import type { VideoProject, TopicConfig, AppConfig } from '../types';
import { logger } from './logger';
import {
  executeGenerateScript,
  executeSourceMedia,
  executeGenerateNarration,
  executeRunAIEdit,
  executeAssembleVideo,
} from '../store/pipeline/orchestrator';
import { MediaCache } from './mediaCache';

export interface BatchRenderResult {
  topic: string;
  status: 'success' | 'failed';
  blob?: Blob;
  project?: VideoProject;
  error?: string;
}

export interface BatchRenderOptions {
  quality?: 'draft' | 'standard' | 'high';
  format?: 'webm' | 'mp4';
  narrationEnabled?: boolean;
  signal?: AbortSignal;
  onProgress?: (topic: string, pct: number, message: string) => void;
}

function makeProgressCallbacks(
  topic: string,
  onProgress?: (topic: string, pct: number, message: string) => void,
) {
  return {
    setProcessingProgress: (pct: number) => onProgress?.(topic, pct, ''),
    setProcessingMessage: (message: string) => onProgress?.(topic, 0, message),
  };
}

export async function batchRender(
  topics: string[],
  options: BatchRenderOptions & { topicConfig: Omit<TopicConfig, 'topic'>; appConfig: AppConfig },
): Promise<BatchRenderResult[]> {
  const results: BatchRenderResult[] = [];
  const { topicConfig, appConfig, signal, onProgress, narrationEnabled } = options;

  logger.info('BatchRender', `Starting batch render for ${topics.length} topics`);

  // Task 158: Shared media cache across batch renders for similar topics
  const sharedCache = new MediaCache();
  sharedCache.pruneExpired();

  for (let i = 0; i < topics.length; i++) {
    const topic = topics[i];
    if (signal?.aborted) {
      logger.warn('BatchRender', 'Batch render aborted');
      break;
    }

    logger.info('BatchRender', `[${i + 1}/${topics.length}] Processing: ${topic}`);
    onProgress?.(topic, 0, 'Starting...');

    try {
      const config: TopicConfig = { ...topicConfig, topic };

      onProgress?.(topic, 5, 'Generating script...');
      let project = await executeGenerateScript(config, appConfig, signal!, makeProgressCallbacks(topic, onProgress));
      if (!project || signal?.aborted) {
        throw new Error('Script generation failed or was cancelled');
      }

      onProgress?.(topic, 25, 'Sourcing media...');
      project = await executeSourceMedia(project, appConfig, signal!, makeProgressCallbacks(topic, onProgress));
      if (!project || signal?.aborted) {
        throw new Error('Media sourcing failed or was cancelled');
      }

      if (narrationEnabled !== false) {
        onProgress?.(topic, 50, 'Generating narration...');
        const narrationProject = await executeGenerateNarration(project, appConfig, signal!, makeProgressCallbacks(topic, onProgress));
        if (narrationProject) {
          project = narrationProject;
        }
      }

      if (signal?.aborted) {
        throw new Error('Cancelled');
      }

      onProgress?.(topic, 65, 'Running AI edit...');
      const editedProject = await executeRunAIEdit(project, appConfig.openRouterKey, signal!, makeProgressCallbacks(topic, onProgress));
      if (editedProject) {
        project = editedProject;
      }

      onProgress?.(topic, 80, 'Rendering video...');
      const assembled = await executeAssembleVideo(
        project,
        appConfig,
        signal!,
        makeProgressCallbacks(topic, onProgress),
        { quality: options.quality, format: options.format },
      );

      if (!assembled) {
        throw new Error('Video assembly failed');
      }

      results.push({
        topic,
        status: 'success',
        project: assembled,
      });
      logger.success('BatchRender', `Completed: ${topic}`);
      onProgress?.(topic, 100, 'Complete!');
    } catch (err) {
      results.push({
        topic,
        status: 'failed',
        error: (err as Error).message,
      });
      logger.error('BatchRender', `Failed: ${topic} — ${(err as Error).message}`);
    }
  }

  logger.info('BatchRender', `Batch render complete: ${results.filter(r => r.status === 'success').length}/${results.length} succeeded`);
  return results;
}
