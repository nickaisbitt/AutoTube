import { describe, it, expect, vi } from 'vitest';
import { BatchProcessor } from '../batchProcessor';
import type { TopicConfig, VideoProject } from '../../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProject(topic: string): VideoProject {
  return {
    id: `proj-${topic}`,
    version: 1,
    title: topic,
    topic,
    style: 'explainer',
    targetDuration: 60,
    script: [],
    media: [],
    narration: [],
    status: 'complete',
    createdAt: new Date(),
    thumbnail: 'blob:test',
  };
}

// ---------------------------------------------------------------------------
// Requirement 19.1 — batchJobs transitions from pending → running → complete
// ---------------------------------------------------------------------------

describe('BatchProcessor — job status transitions', () => {
  it('transitions jobs from pending → running → complete for a successful job (Requirement 19.1)', async () => {
    const statusLog: string[] = [];
    const processor = new BatchProcessor((jobs) => {
      for (const j of jobs) {
        statusLog.push(`${j.topic}:${j.status}`);
      }
    });

    processor.createJobs({
      topics: ['Topic A'],
      baseConfig: { style: 'explainer', targetDuration: 3, tone: 'informative', audience: 'general' },
    });

    const generateVideo = vi.fn().mockImplementation(async (config: TopicConfig) => {
      return makeProject(config.topic);
    });

    await processor.process(generateVideo, 1, 0);

    const jobs = processor.getJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe('complete');
    expect(jobs[0].project).toBeDefined();

    // Verify the status log includes running and complete transitions
    expect(statusLog).toContain('Topic A:running');
    expect(statusLog).toContain('Topic A:complete');
  });

  // Requirement 19.3 — failing job transitions to 'error' with error message
  it('transitions a failing job to error with error message (Requirement 19.3)', async () => {
    const processor = new BatchProcessor();

    processor.createJobs({
      topics: ['Bad Topic'],
      baseConfig: { style: 'explainer', targetDuration: 3, tone: 'informative', audience: 'general' },
    });

    const generateVideo = vi.fn().mockRejectedValue(new Error('API failure'));

    await processor.process(generateVideo, 1, 0);

    const jobs = processor.getJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe('error');
    expect(jobs[0].error).toBe('API failure');
  });

  // Requirement 18.2 — jobs are processed sequentially (concurrency = 1)
  it('processes jobs sequentially with concurrency = 1 (Requirement 18.2)', async () => {
    const callOrder: string[] = [];
    const processor = new BatchProcessor();

    processor.createJobs({
      topics: ['First', 'Second', 'Third'],
      baseConfig: { style: 'explainer', targetDuration: 3, tone: 'informative', audience: 'general' },
    });

    const generateVideo = vi.fn().mockImplementation(async (config: TopicConfig) => {
      callOrder.push(config.topic);
      return makeProject(config.topic);
    });

    await processor.process(generateVideo, 1, 0);

    expect(callOrder).toEqual(['First', 'Second', 'Third']);
    const jobs = processor.getJobs();
    expect(jobs.every(j => j.status === 'complete')).toBe(true);
  });

  // Mixed success and failure
  it('handles mixed success and failure in a batch', async () => {
    const processor = new BatchProcessor();

    processor.createJobs({
      topics: ['Good', 'Bad', 'Good2'],
      baseConfig: { style: 'explainer', targetDuration: 3, tone: 'informative', audience: 'general' },
    });

    const generateVideo = vi.fn().mockImplementation(async (config: TopicConfig) => {
      if (config.topic === 'Bad') throw new Error('Intentional failure');
      return makeProject(config.topic);
    });

    await processor.process(generateVideo, 1, 0);

    const jobs = processor.getJobs();
    expect(jobs[0].status).toBe('complete');
    expect(jobs[1].status).toBe('error');
    expect(jobs[1].error).toBe('Intentional failure');
    expect(jobs[2].status).toBe('complete');
  });

  // getCompletedJobs and getFailedJobs
  it('getCompletedJobs returns only complete jobs', async () => {
    const processor = new BatchProcessor();

    processor.createJobs({
      topics: ['A', 'B'],
      baseConfig: { style: 'explainer', targetDuration: 3, tone: 'informative', audience: 'general' },
    });

    const generateVideo = vi.fn()
      .mockResolvedValueOnce(makeProject('A'))
      .mockRejectedValueOnce(new Error('fail'));

    await processor.process(generateVideo, 1, 0);

    expect(processor.getCompletedJobs()).toHaveLength(1);
    expect(processor.getFailedJobs()).toHaveLength(1);
  });

  // exportCompleted returns download info
  it('exportCompleted returns download info for completed jobs with thumbnails', async () => {
    const processor = new BatchProcessor();

    processor.createJobs({
      topics: ['Export Test'],
      baseConfig: { style: 'explainer', targetDuration: 3, tone: 'informative', audience: 'general' },
    });

    const generateVideo = vi.fn().mockResolvedValue(makeProject('Export Test'));

    await processor.process(generateVideo, 1, 0);

    const exports = processor.exportCompleted();
    expect(exports).toHaveLength(1);
    expect(exports[0].name).toContain('export_test');
    expect(exports[0].url).toBe('blob:test');
  });
});
