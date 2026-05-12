import { Loader2, CheckCircle, AlertTriangle } from 'lucide-react';

interface RenderProgressBarProps {
  progress: number;
  message: string;
  etaDisplay?: string;
  segmentInfo?: { current: number; total: number } | null;
  renderTrackStatus?: 'on_track' | 'running_slow' | null;
}

export default function RenderProgressBar({ progress, message, etaDisplay, segmentInfo, renderTrackStatus }: RenderProgressBarProps) {
  const clampedProgress = Math.max(0, Math.min(progress, 100));

  const getPhase = (pct: number): string => {
    if (pct < 5) return 'Connecting';
    if (pct < 15) return 'Preloading';
    if (pct < 90) return 'Rendering';
    if (pct < 98) return 'Encoding';
    return 'Finalizing';
  };

  const currentPhase = getPhase(clampedProgress);

  const phases = ['Connecting', 'Preloading', 'Rendering', 'Encoding', 'Finalizing'];
  const phaseThresholds = [0, 5, 15, 90, 98];

  return (
    <div className="w-full max-w-2xl space-y-6">
      {/* Spinner and title */}
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <div className="absolute inset-0 bg-brand-500/20 animate-ping" />
          <div className="relative flex h-16 w-16 items-center justify-center bg-brand-500 text-black shadow-hard">
            <Loader2 className="h-7 w-7 animate-spin" />
          </div>
        </div>
        <div className="text-center">
          <h3 className="text-lg font-bold text-white uppercase tracking-wider">Rendering Video</h3>
          <p className="mt-1 text-sm font-mono text-surface-400 min-h-[1.25rem]">{message || 'Initializing renderer...'}</p>
        </div>
      </div>

      {/* Main progress bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-mono">
          <span className="text-surface-500 uppercase tracking-wider">{currentPhase}</span>
          <span className="text-brand-400 font-bold">{clampedProgress}%</span>
        </div>
        <div className="h-5 bg-surface-800 overflow-hidden border-2 border-surface-700 relative" role="progressbar" aria-valuenow={clampedProgress} aria-valuemin={0} aria-valuemax={100} aria-label={`Render progress: ${clampedProgress}%`}>
          <div
            className="h-full bg-brand-500 relative"
            style={{ width: `${clampedProgress}%` }}
          >
            <div className="absolute inset-0 shimmer" />
          </div>
          {/* Percentage marker at edge of fill */}
          {clampedProgress > 15 && clampedProgress < 95 && (
            <div
              className="absolute top-0 h-full flex items-center px-1.5 text-[10px] font-bold font-mono text-black"
              style={{ left: `calc(${clampedProgress}% - 2px)` }}
            >
              {clampedProgress}%
            </div>
          )}
        </div>
      </div>

      {/* Phase indicators */}
      <div className="flex items-center gap-1">
        {phases.map((phase, idx) => {
          const isActive = currentPhase === phase;
          const isComplete = clampedProgress >= (phaseThresholds[idx + 1] ?? 100);
          return (
            <div key={phase} className="flex-1 flex flex-col items-center gap-1">
              <div
                className={`h-1.5 w-full ${
                  isComplete
                    ? 'bg-brand-500'
                    : isActive
                    ? 'bg-brand-500/60'
                    : 'bg-surface-700'
                }`}
              />
              <span
                className={`text-[9px] font-mono uppercase tracking-wider ${
                  isActive || isComplete ? 'text-surface-300' : 'text-surface-600'
                }`}
              >
                {phase}
              </span>
            </div>
          );
        })}
      </div>

      {/* Segment info and ETA */}
      <div className="flex items-center justify-between text-xs font-mono text-surface-500">
        {segmentInfo ? (
          <span>Segment {segmentInfo.current} of {segmentInfo.total}</span>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          {renderTrackStatus && (
            <span className={`flex items-center gap-1 ${renderTrackStatus === 'on_track' ? 'text-green-400' : 'text-amber-400'}`}>
              {renderTrackStatus === 'on_track' ? (
                <><CheckCircle className="h-3 w-3" /> On track</>
              ) : (
                <><AlertTriangle className="h-3 w-3" /> Running slow</>
              )}
            </span>
          )}
          {etaDisplay && <span>{etaDisplay}</span>}
        </div>
      </div>
    </div>
  );
}
