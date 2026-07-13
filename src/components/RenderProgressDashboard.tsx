import { useState, useEffect } from 'react';
import { apiFetch } from '../utils/apiClient';

interface RenderProgress {
  currentFrame: number;
  totalFrames: number;
  fps: string;
  etaSeconds: number;
  memoryMB: string;
  status: 'idle' | 'rendering' | 'encoding' | 'complete' | 'failed';
  segmentIndex?: number;
  segmentTitle?: string;
  errorMessage?: string;
}

export default function RenderProgressDashboard() {
  const [progress, setProgress] = useState<RenderProgress | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Poll render progress every second
    const interval = setInterval(async () => {
      try {
        const res = await apiFetch('/api/render-progress');
        if (res.ok) {
          const data = await res.json();
          setProgress(data);
          
          // Auto-show when rendering starts
          if (data.status === 'rendering' || data.status === 'encoding') {
            setIsVisible(true);
          }
        }
      } catch (err) {
        // Silently fail - endpoint may not be available
      }
    }, 1000);

    return () => clearInterval(interval);
  }, []);

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
      case 'failed': return 'text-red-400';
      default: return 'text-surface-400';
    }
  };

  const getStatusIcon = () => {
    switch (progress.status) {
      case 'rendering': return '🎬';
      case 'encoding': return '⚙️';
      case 'complete': return '✅';
      case 'failed': return '❌';
      default: return '⏸️';
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 w-96 bg-surface-900 border-2 border-brand-500 shadow-hard">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-surface-800 border-b border-surface-700">
        <div className="flex items-center gap-2">
          <span className="text-lg">{getStatusIcon()}</span>
          <h3 className="font-bold text-surface-100">Render Progress</h3>
        </div>
        <button
          onClick={() => setIsVisible(false)}
          className="text-surface-400 hover:text-surface-200 transition-colors"
          aria-label="Close dashboard"
        >
          ✕
        </button>
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        {/* Status */}
        <div className="flex items-center justify-between">
          <span className="text-surface-400 text-sm">Status:</span>
          <span className={`font-semibold ${getStatusColor()}`}>
            {progress.status.toUpperCase()}
          </span>
        </div>

        {/* Current Segment */}
        {progress.segmentTitle && (
          <div className="space-y-1">
            <span className="text-surface-400 text-sm">Current Segment:</span>
            <p className="text-surface-200 text-sm truncate" title={progress.segmentTitle}>
              {progress.segmentIndex !== undefined && `#${progress.segmentIndex + 1}: `}
              {progress.segmentTitle}
            </p>
          </div>
        )}

        {/* Progress Bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-surface-400">Progress</span>
            <span className="text-surface-200 font-mono">
              {progress.currentFrame.toLocaleString()} / {progress.totalFrames.toLocaleString()} frames
            </span>
          </div>
          <div className="relative h-3 bg-surface-700 overflow-hidden">
            <div
              className="absolute left-0 top-0 h-full bg-gradient-to-r from-brand-500 to-accent-500 transition-all duration-300"
              style={{ width: `${percentComplete}%` }}
            />
          </div>
          <div className="text-right text-xs text-surface-400 font-mono">
            {percentComplete}%
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-surface-800 p-2 rounded">
            <div className="text-xs text-surface-400">FPS</div>
            <div className="text-lg font-mono text-surface-200">{progress.fps}</div>
          </div>
          <div className="bg-surface-800 p-2 rounded">
            <div className="text-xs text-surface-400">ETA</div>
            <div className="text-lg font-mono text-surface-200">
              {formatTime(progress.etaSeconds)}
            </div>
          </div>
          <div className="bg-surface-800 p-2 rounded col-span-2">
            <div className="text-xs text-surface-400">Memory Usage</div>
            <div className="text-lg font-mono text-surface-200">{progress.memoryMB} MB</div>
          </div>
        </div>

        {/* Error Message */}
        {progress.errorMessage && (
          <div className="bg-red-900/20 border border-red-500 p-2 rounded">
            <p className="text-red-400 text-sm">{progress.errorMessage}</p>
          </div>
        )}
      </div>
    </div>
  );
}
