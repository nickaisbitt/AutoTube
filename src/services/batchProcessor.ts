import type { TopicConfig, VideoProject } from '../types';
import { logger } from './logger';

export interface BatchJob {
  id: string;
  topic: string;
  config: TopicConfig;
  status: 'pending' | 'running' | 'complete' | 'error';
  error?: string;
  project?: VideoProject;
  startedAt?: Date;
  completedAt?: Date;
}

export interface BatchConfig {
  topics: string[];
  baseConfig: Omit<TopicConfig, 'topic'>;
  concurrency?: number;
  delayBetweenJobs?: number; // ms
}

/**
 * Manages batch video generation.
 * Processes multiple topics sequentially or with limited concurrency.
 */
export class BatchProcessor {
  private jobs: BatchJob[] = [];
  private isRunning = false;
  private abortController: AbortController | null = null;
  private onProgress?: (jobs: BatchJob[]) => void;

  constructor(onProgress?: (jobs: BatchJob[]) => void) {
    this.onProgress = onProgress;
  }

  /**
   * Creates batch jobs from a list of topics.
   */
  createJobs(config: BatchConfig): BatchJob[] {
    this.jobs = config.topics.map((topic, index) => ({
      id: `batch-${Date.now()}-${index}`,
      topic,
      config: { ...config.baseConfig, topic },
      status: 'pending',
    }));
    return this.jobs;
  }

  /**
   * Processes all jobs with optional concurrency limit.
   */
  async process(
    generateVideo: (config: TopicConfig, signal: AbortSignal) => Promise<VideoProject>,
    concurrency = 1,
    delayMs = 2000,
  ): Promise<BatchJob[]> {
    if (this.isRunning) {
      throw new Error('Batch processing already in progress');
    }

    this.isRunning = true;
    this.abortController = new AbortController();

    const processJob = async (job: BatchJob) => {
      if (this.abortController?.signal.aborted) return;

      job.status = 'running';
      job.startedAt = new Date();
      this.onProgress?.([...this.jobs]);

      try {
        job.project = await generateVideo(job.config, this.abortController.signal);
        job.status = 'complete';
        job.completedAt = new Date();
        logger.success('Batch', `Completed: ${job.topic}`);
      } catch (err) {
        job.status = 'error';
        job.error = (err as Error).message;
        job.completedAt = new Date();
        logger.error('Batch', `Failed: ${job.topic}`, err);
      }

      this.onProgress?.([...this.jobs]);
    };

    // Process jobs with concurrency limit
    for (let i = 0; i < this.jobs.length; i += concurrency) {
      if (this.abortController?.signal.aborted) break;

      const batch = this.jobs.slice(i, i + concurrency);
      await Promise.all(batch.map(processJob));

      // Delay between batches to avoid rate limiting
      if (i + concurrency < this.jobs.length && delayMs > 0) {
        await new Promise(r => setTimeout(r, delayMs));
      }
    }

    this.isRunning = false;
    return this.jobs;
  }

  /**
   * Aborts the current batch processing.
   */
  abort(): void {
    this.abortController?.abort();
    this.isRunning = false;
  }

  /**
   * Gets the current job status.
   */
  getJobs(): BatchJob[] {
    return [...this.jobs];
  }

  /**
   * Gets completed jobs.
   */
  getCompletedJobs(): BatchJob[] {
    return this.jobs.filter(j => j.status === 'complete');
  }

  /**
   * Gets failed jobs.
   */
  getFailedJobs(): BatchJob[] {
    return this.jobs.filter(j => j.status === 'error');
  }

  /**
   * Exports completed videos as a zip-like download list.
   */
  exportCompleted(): { name: string; url: string }[] {
    return this.getCompletedJobs()
      .filter(j => j.project?.thumbnail)
      .map(j => ({
        name: `${j.topic.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.webm`,
        url: j.project!.thumbnail!,
      }));
  }
}
