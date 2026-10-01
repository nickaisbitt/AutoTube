import { useState } from 'react';
import { Plus, Play, Trash2, Loader2, CheckCircle2, AlertCircle, Download } from 'lucide-react';
import type { TopicConfig } from '../types';
import type { BatchJob as StoreBatchJob } from '../services/batchProcessor';
import { VIDEO_TEMPLATES } from '../services/templates';

interface LocalBatchJob {
  id: string;
  topic: string;
  template: string;
  status: 'pending' | 'running' | 'complete' | 'error';
  error?: string;
}

interface BatchProcessorProps {
  onGenerate: (jobs: { topic: string; config: Omit<TopicConfig, 'topic'> }[]) => void;
  isProcessing: boolean;
  batchJobs?: StoreBatchJob[];
}

export default function BatchProcessor({ onGenerate, isProcessing, batchJobs = [] }: BatchProcessorProps) {
  const [localJobs, setLocalJobs] = useState<LocalBatchJob[]>([]);
  const [newTopic, setNewTopic] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('explainer');

  // Use store batch jobs when processing, local jobs otherwise
  const displayJobs: (LocalBatchJob | StoreBatchJob)[] = isProcessing || batchJobs.length > 0 ? batchJobs : localJobs;

  const addJob = () => {
    if (!newTopic.trim()) return;
    setLocalJobs([...localJobs, {
      id: `job-${Date.now()}`,
      topic: newTopic.trim(),
      template: selectedTemplate,
      status: 'pending',
    }]);
    setNewTopic('');
  };

  const removeJob = (id: string) => {
    setLocalJobs(localJobs.filter(j => j.id !== id));
  };

  const handleGenerate = () => {
    if (localJobs.length === 0) return;
    const jobConfigs = localJobs.map(job => {
      const template = VIDEO_TEMPLATES.find(t => t.id === job.template);
      return {
        topic: job.topic,
        config: template?.config || VIDEO_TEMPLATES[0].config,
      };
    });
    onGenerate(jobConfigs);
  };

  const handleDownload = (job: StoreBatchJob) => {
    if (!job.project?.thumbnail) return;
    try {
      const a = document.createElement('a');
      a.href = job.project.thumbnail;
      a.download = `${job.topic.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.webm`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      // Blob URL may have been revoked
    }
  };

  // Compute summary stats
  const completedCount = batchJobs.filter(j => j.status === 'complete').length;
  const errorCount = batchJobs.filter(j => j.status === 'error').length;
  const totalCount = batchJobs.length;
  const allDone = totalCount > 0 && (completedCount + errorCount) === totalCount;
  const overallPct = totalCount > 0 ? Math.round(((completedCount + errorCount) / totalCount) * 100) : 0;

  if (displayJobs.length === 0 && !isProcessing) {
    return (
      <div className="border-2 border-surface-700 bg-surface-900 p-6">
        <h3 className="mb-4 text-lg font-bold uppercase tracking-wider text-white">Batch Video Generator</h3>
        <p className="mb-4 text-sm text-surface-400">Generate multiple videos at once. Add topics below and we'll process them sequentially.</p>
        
        <div className="flex gap-2">
          <input
            type="text"
            value={newTopic}
            onChange={(e) => setNewTopic(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addJob()}
            placeholder="Enter a video topic..."
            className="flex-1 border-2 border-surface-700 bg-surface-800 px-3 py-2 text-sm text-white placeholder-surface-500 focus:border-brand-500 focus:outline-none"
            aria-label="Video topic"
          />
          <select
            value={selectedTemplate}
            onChange={(e) => setSelectedTemplate(e.target.value)}
            className="border-2 border-surface-700 bg-surface-800 px-3 py-2 text-sm text-white focus:border-brand-500 focus:outline-none"
            aria-label="Video template"
          >
            {VIDEO_TEMPLATES.map(t => (
              <option key={t.id} value={t.id}>{t.icon} {t.name}</option>
            ))}
          </select>
          <button
            onClick={addJob}
            className="inline-flex items-center gap-2 bg-brand-500 px-4 py-2 text-sm font-bold uppercase text-black hover:bg-brand-400"
            aria-label="Add video topic"
            title="Add video topic"
          >
            <Plus className="h-4 w-4" />
            <span className="sr-only">Add video topic</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="border-2 border-surface-700 bg-surface-900 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-bold uppercase tracking-wider text-white">Batch Queue ({displayJobs.length})</h3>
        <div className="flex gap-2">
          {!isProcessing && !allDone && (
            <button
              onClick={handleGenerate}
              disabled={isProcessing || localJobs.length === 0}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-bold uppercase ${
                isProcessing || localJobs.length === 0
                  ? 'cursor-not-allowed bg-surface-700 text-surface-500'
                  : 'bg-brand-500 text-black hover:bg-brand-400'
              }`}
            >
              <Play className="h-4 w-4" />
              Generate All
            </button>
          )}
          {isProcessing && (
            <span className="flex items-center gap-2 text-sm text-brand-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Processing...
            </span>
          )}
        </div>
      </div>

      {/* Summary line and overall progress bar */}
      {totalCount > 0 && (
        <div className="mb-4 space-y-2">
          <p className="text-sm text-surface-300">
            {allDone
              ? `Batch complete — ${completedCount} succeeded, ${errorCount} failed`
              : `${completedCount}/${totalCount} videos complete`}
          </p>
          <div className="h-2 overflow-hidden bg-surface-800">
            <div
              className="h-full bg-brand-500"
              style={{ width: `${overallPct}%` }}
            />
          </div>
        </div>
      )}

      {!isProcessing && !allDone && (
        <div className="mb-4 flex gap-2">
          <input
            type="text"
            value={newTopic}
            onChange={(e) => setNewTopic(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addJob()}
            placeholder="Add another topic..."
            className="flex-1 border-2 border-surface-700 bg-surface-800 px-3 py-2 text-sm text-white placeholder-surface-500 focus:border-brand-500 focus:outline-none"
            aria-label="Add another topic"
          />
          <select
            value={selectedTemplate}
            onChange={(e) => setSelectedTemplate(e.target.value)}
            className="border-2 border-surface-700 bg-surface-800 px-3 py-2 text-sm text-white focus:border-brand-500 focus:outline-none"
            aria-label="Video template for new topic"
          >
            {VIDEO_TEMPLATES.map(t => (
              <option key={t.id} value={t.id}>{t.icon} {t.name}</option>
            ))}
          </select>
          <button
            onClick={addJob}
            className="inline-flex items-center gap-2 bg-brand-500 px-4 py-2 text-sm font-bold uppercase text-black hover:bg-brand-400"
            aria-label="Add another video topic"
            title="Add another video topic"
          >
            <Plus className="h-4 w-4" />
            <span className="sr-only">Add another video topic</span>
          </button>
        </div>
      )}

      <div className="space-y-2">
        {displayJobs.map((job, index) => {
          const isStoreJob = 'project' in job;
          const storeJob = isStoreJob ? (job as StoreBatchJob) : null;
          const canDownload = storeJob?.status === 'complete' && storeJob?.project?.thumbnail;

          return (
            <div
              key={job.id}
              className="flex items-center gap-3 border-2 border-surface-700 bg-surface-800 p-3"
            >
              <span className="flex h-6 w-6 items-center justify-center bg-surface-700 text-xs font-bold font-mono text-surface-400">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">{job.topic}</p>
              </div>
              <div className="flex items-center gap-2">
                {job.status === 'pending' && <span className="text-xs font-mono text-surface-500">Waiting</span>}
                {job.status === 'running' && (
                  <span className="flex items-center gap-1 text-xs font-mono text-brand-400">
                    <Loader2 className="h-3 w-3 animate-spin" /> Running
                  </span>
                )}
                {job.status === 'complete' && (
                  <span className="flex items-center gap-1 text-xs font-mono text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" /> Done
                  </span>
                )}
                {job.status === 'error' && (
                  <span className="flex items-center gap-1 text-xs font-mono text-red-400" title={job.error}>
                    <AlertCircle className="h-3 w-3" /> Failed
                  </span>
                )}
                {canDownload && (
                  <button
                    onClick={() => handleDownload(storeJob!)}
                    className="p-1 text-emerald-400 transition-colors duration-200 hover:bg-brand-500 hover:text-black"
                    aria-label={`Download ${job.topic}`}
                    title={`Download ${job.topic}`}
                  >
                    <Download className="h-3.5 w-3.5" />
                  </button>
                )}
                {!isProcessing && !allDone && !isStoreJob && (
                  <button
                    onClick={() => removeJob(job.id)}
                    className="p-1 text-surface-500 transition-colors duration-200 hover:bg-brand-500 hover:text-black"
                    aria-label={`Remove ${job.topic}`}
                    title={`Remove ${job.topic}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
