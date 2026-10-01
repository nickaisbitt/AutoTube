import { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../utils/apiClient';
import { useVideoProject } from '../store/StoreContext';

interface RenderProgress {
  currentFrame: number;
  totalFrames: number;
  fps: string;
  etaSeconds: number;
  memoryMB: string;
  status: 'idle' | 'rendering' | 'encoding' | 'complete' | 'error' | 'failed';
  segmentIndex?: number;
  segmentTitle?: string;
  errorMessage?: string;
}

export default function RenderProgressDashboard() {
  const { stepStatuses } = useVideoProject();
  const assemblyBusy = stepStatuses.assembly === 'processing';
  const [progress, setProgress] = useState<RenderProgress | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const activeRef = useRef(false);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;

    const poll = async () => {
      try {
        const res = await apiFetch('/api/render-progress');
        if (!res.ok) return;
        const data = (await res.json()) as RenderProgress;
        setProgress(data);
        const busy =
          data.status === 'rendering' ||
          data.status === 'encoding' ||
          assemblyBusy;
        activeRef.current = busy;
        if (busy) setIsVisible(true);
      } catch {
        /* endpoint may be unavailable */
      }
    };

    // Only poll while assembly is processing or after we have seen an active render
    if (assemblyBusy || activeRef.current || isVisible) {
      void poll();
      interval = setInterval(poll, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [assemblyBusy, isVisible]);

  if (!progress || !isVisible) return null;

  const percentComplete = progress.totalFrames > 0
    ? Math.round((progress.currentFrame / progress.totalFrames) * 100)
    : 0;

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s`;
  };

  const getStatusColor = () => {
    switch (progress.status) {
      case 'rendering': return 'text-brand-400';
      case 'encoding': return 'text-accent-400';
      case 'complete': return 'text-emerald-400';
      case 'failed':
      case 'error': return 'text-red-400';
      default: return 'text-surface-400';
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 w-96 bg-surface-900 border-2 border-brand-500 shadow-hard">
      <div className="flex items-center justify-between px-4 py-2 bg-surface-800 border-b border-surface-700">
        <h3 className="font-bold text-surface-100 font-mono text-sm">Render Progress</h3>
        <button
          type="button"
          onClick={() => setIsVisible(false)}
          className="text-surface-400 hover:text-surface-200"
          aria-label="Close dashboard"
        >
          ✕
        </button>
      </div>

      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-surface-400 text-sm">Status:</span>
          <span className={`font-semibold ${getStatusColor()}`}>
            {progress.status.toUpperCase()}
          </span>
        </div>

        {progress.segmentTitle && (
          <div className="space-y-1">
            <span className="text-surface-400 text-sm">Current Segment:</span>
            <p className="text-surface-200 text-sm truncate" title={progress.segmentTitle}>
              {progress.segmentIndex !== undefined && `#${progress.segmentIndex + 1}: `}
              {progress.segmentTitle}
            </p>
          </div>
        )}

        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-surface-400">Progress</span>
            <span className="text-surface-200 font-mono">
              {progress.currentFrame.toLocaleString()} / {progress.totalFrames.toLocaleString()} frames
            </span>
          </div>
          <div className="relative h-3 bg-surface-700 overflow-hidden">
            <div
              className="absolute left-0 top-0 h-full bg-brand-500"
              style={{ width: `${percentComplete}%` }}
            />
          </div>
          <div className="text-right text-xs text-surface-400 font-mono">
            {percentComplete}%
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="bg-surface-800 p-2">
            <div className="text-xs text-surface-400">FPS</div>
            <div className="text-lg font-mono text-surface-200">{progress.fps}</div>
          </div>
          <div className="bg-surface-800 p-2">
            <div className="text-xs text-surface-400">ETA</div>
            <div className="text-lg font-mono text-surface-200">
              {formatTime(progress.etaSeconds)}
            </div>
          </div>
        </div>

        {progress.errorMessage && (
          <div className="bg-red-900/20 border border-red-500 p-2">
            <p className="text-red-400 text-sm">{progress.errorMessage}</p>
          </div>
        )}
      </div>
    </div>
  );
}
