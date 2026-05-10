import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Image as ImageIcon,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ChevronRight,
} from 'lucide-react';
import type { VideoProject, StepStatus } from '../../types';
import { MEDIA_STATUS_MESSAGES } from './constants';
import ProcessingView from './ProcessingView';
import TopicResearchPanel from './TopicResearchPanel';
import MediaCard from './MediaCard';

export { MEDIA_STATUS_MESSAGES, parseMediaMessage } from './constants';

interface MediaStepProps {
  project: VideoProject | null;
  status: StepStatus;
  progress: number;
  message: string;
  onNext: () => void;
  onReplace: (assetId: string) => Promise<void> | void;
  onRetry: () => Promise<void> | void;
}

export default function MediaStep({
  project,
  status,
  progress,
  message,
  onNext,
  onReplace,
  onRetry,
}: MediaStepProps) {
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [statusMessageIndex, setStatusMessageIndex] = useState(0);

  useEffect(() => {
    if (status !== 'processing') {
      setStatusMessageIndex(0);
      return;
    }

    const interval = setInterval(() => {
      setStatusMessageIndex((prev) => (prev + 1) % MEDIA_STATUS_MESSAGES.length);
    }, 3000);

    return () => clearInterval(interval);
  }, [status]);

  const handleReplace = useCallback(async (assetId: string) => {
    await onReplace(assetId);
  }, [onReplace]);

  const fallbackCount = useMemo(() => (project?.media ?? []).filter((asset) => asset.isFallback).length, [project?.media]);
  const matchedCount = (project?.media?.length ?? 0) - fallbackCount;

  if (status === 'processing') {
    return (
      <ProcessingView
        progress={progress}
        message={message}
        statusMessageIndex={statusMessageIndex}
      />
    );
  }

  if (!project || !project.media.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
        <AlertCircle className="h-12 w-12 text-amber-500" />
        <div>
          <p className="text-surface-300">No visuals were sourced yet.</p>
          <p className="mt-1 text-sm text-surface-500">
            Retry the search and the app will pull topic-specific images again, then fall back to smart visuals if needed.
          </p>
        </div>
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2 border-2 border-brand-500 bg-surface-900 px-4 py-2 text-sm font-mono font-bold uppercase text-brand-400 transition-colors duration-200 hover:bg-brand-500 hover:text-black"
        >
          <RefreshCw className="h-4 w-4" />
          Retry Media Search
        </button>
      </div>
    );
  }
  const ctx = project.topicContext;

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      {previewImage && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Image preview"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setPreviewImage(null)}
          onKeyDown={(e) => e.key === 'Escape' && setPreviewImage(null)}
          tabIndex={-1}
        >
          <div className="max-h-[90vh] max-w-5xl p-4">
            <img
              src={previewImage}
              alt="Preview"
              className="max-h-full max-w-full rounded-lg shadow-2xl"
            />
          </div>
        </div>
      )}

      <div>
        <div className="mb-2 flex items-center gap-2 text-emerald-400">
          <CheckCircle2 className="h-4 w-4" />
          <span className="text-xs font-semibold uppercase tracking-wider">Step 3 — Complete</span>
        </div>
        <h2 className="text-2xl font-bold text-white">Visual Director Output</h2>
        <p className="mt-1 text-sm text-surface-400">
          {project.media.length} visuals planned and harvested. Expand any card to see the reasoning behind that choice.
        </p>
      </div>

      {ctx && <TopicResearchPanel ctx={ctx} />}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="border-2 border-surface-700 bg-surface-900 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-surface-300">
            <ImageIcon className="h-4 w-4 text-blue-400" />
            <span className="font-bold font-mono text-white">{project.media.length}</span> visuals
          </div>
        </div>
        <div className="border-2 border-surface-700 bg-surface-900 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-surface-300">
            <Sparkles className="h-4 w-4 text-emerald-400" />
            <span className="font-bold font-mono text-white">{matchedCount}</span> live matches
          </div>
        </div>
        <div className="border-2 border-surface-700 bg-surface-900 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-surface-300">
            <AlertCircle className="h-4 w-4 text-amber-400" />
            <span className="font-bold font-mono text-white">{fallbackCount}</span> fallbacks
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {project.media.map((asset, index) => (
          <MediaCard
            key={asset.id}
            asset={asset}
            index={index}
            project={project}
            onReplace={handleReplace}
            onPreview={setPreviewImage}
          />
        ))}
      </div>

      {status === 'complete' && (
        <button
          onClick={onNext}
          className="group flex w-full items-center justify-center gap-2 bg-brand-500 px-6 py-4 text-sm font-bold uppercase tracking-wider text-black shadow-[4px_4px_0px_#ff5500] hover:bg-brand-400"
        >
          Prepare Narration
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
