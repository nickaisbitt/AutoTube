import { Film, ChevronRight, X } from 'lucide-react';
import type { VideoProject, StepStatus } from '../types';

interface AssemblyStepProps {
  project: VideoProject | null;
  status: StepStatus;
  progress: number;
  message: string;
  onNext: () => void;
  onCancel: () => void;
}

export default function AssemblyStep({ project, status, progress, message, onNext, onCancel }: AssemblyStepProps) {
  if (status === 'processing') {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="w-full max-w-2xl space-y-8 text-center">
          <div className="relative mx-auto h-20 w-20">
            <div className="absolute inset-0 rounded-2xl bg-amber-500/20 animate-ping" />
            <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-600 to-amber-400 shadow-xl shadow-amber-500/30">
              <Film className="h-8 w-8 text-white" />
            </div>
          </div>
          <div>
            <h3 className="text-xl font-bold text-white">Rendering Video</h3>
            <p className="mt-2 text-sm text-surface-400 min-h-[1.25rem]">{message || 'Initializing renderer...'}</p>
          </div>

          <div className="space-y-2">
            <div className="h-3 rounded-full bg-surface-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-600 via-amber-400 to-amber-300 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-surface-500">{progress}% complete</p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Compositing', threshold: 0, icon: '🎨' },
              { label: 'Rendering', threshold: 30, icon: '🎬' },
              { label: 'Encoding', threshold: 80, icon: '📦' },
            ].map((stage) => (
              <div
                key={stage.label}
                className={`rounded-xl border p-4 transition-all ${
                  progress >= stage.threshold
                    ? 'border-amber-500/30 bg-amber-500/5'
                    : 'border-surface-700/50 bg-surface-900/40'
                }`}
              >
                <div className="text-2xl mb-2">{stage.icon}</div>
                <p className={`text-sm font-medium ${
                  progress >= stage.threshold ? 'text-amber-400' : 'text-surface-500'
                }`}>
                  {stage.label}
                </p>
                <p className="text-[10px] text-surface-500 mt-0.5">
                  {progress >= stage.threshold + 20
                    ? '✓ Complete'
                    : progress >= stage.threshold
                    ? 'In Progress...'
                    : 'Waiting...'}
                </p>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-surface-700/50 bg-surface-900/60 p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-xs font-medium text-surface-300">Render Progress</span>
            </div>
            <div className="space-y-1.5">
              {['Video Track', 'Audio Track', 'Text Overlay', 'Effects'].map((track, i) => (
                <div key={track} className="flex items-center gap-2">
                  <span className="w-20 text-[10px] text-surface-500 text-right">{track}</span>
                  <div className="flex-1 h-4 rounded bg-surface-800 overflow-hidden">
                    <div
                      className={`h-full rounded transition-all duration-700 ${
                        ['bg-blue-500/40', 'bg-emerald-500/40', 'bg-purple-500/40', 'bg-amber-500/40'][i]
                      }`}
                      style={{ width: `${Math.min(progress * 1.2, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={onCancel}
            className="inline-flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-6 py-3 text-sm font-semibold text-red-400 transition-all hover:bg-red-500/20"
          >
            <X className="h-4 w-4" />
            Cancel Render
          </button>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="text-center space-y-4">
          <div className="text-4xl">❌</div>
          <h3 className="text-xl font-bold text-white">Render Failed</h3>
          <p className="text-sm text-surface-400">{message || 'An error occurred during rendering.'}</p>
          <button
            onClick={onNext}
            className="inline-flex items-center gap-2 rounded-xl border border-brand-500/30 bg-brand-500/10 px-6 py-3 text-sm font-semibold text-brand-400 transition-all hover:bg-brand-500/20"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-surface-500">No video assembled yet.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center px-6">
      <div className="text-center space-y-4">
        <div className="text-4xl">✅</div>
        <h3 className="text-xl font-bold text-white">Video Rendered Successfully</h3>
        <p className="text-sm text-surface-400">Your video is ready for preview and export.</p>
        {status === 'complete' && (
          <button
            onClick={onNext}
            className="group flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-500/25 transition-all hover:shadow-brand-500/40 mx-auto"
          >
            Preview Video
            <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </button>
        )}
      </div>
    </div>
  );
}
