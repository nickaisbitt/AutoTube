import { useState, useEffect } from 'react';
import { Film, ChevronRight, X, Music, Monitor } from 'lucide-react';
import type { VideoProject, StepStatus } from '../types';
import { MUSIC_PRESETS } from '../services/audioMixer';

const QUALITY_OPTIONS = [
  { id: 'draft', label: 'Draft', desc: '480p / 4 Mbps' },
  { id: 'standard', label: 'Standard', desc: '1080p / 12 Mbps' },
  { id: 'high', label: 'High', desc: '1080p / 16 Mbps' },
] as const;

interface AssemblyStepProps {
  project: VideoProject | null;
  status: StepStatus;
  progress: number;
  message: string;
  onAssemble: (options?: { backgroundMusic?: boolean; musicPreset?: string; quality?: 'draft' | 'standard' | 'high' }) => void;
  onNext: () => void;
  onCancel: () => void;
  /** Called when the user clicks "Try Again" after a render failure. */
  onRetry: () => void;
}

export default function AssemblyStep({ project, status, progress, message, onAssemble, onNext, onCancel, onRetry }: AssemblyStepProps) {
  const segmentMatch = message.match(/Rendering segment (\d+)\/(\d+)/);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [backgroundMusic, setBackgroundMusic] = useState(true);
  const [musicPreset, setMusicPreset] = useState('neutral');
  const [quality, setQuality] = useState<'draft' | 'standard' | 'high'>('high');

  useEffect(() => {
    if (status === 'processing' && startTime === null) {
      setStartTime(Date.now());
    }
    if (status !== 'processing' && startTime !== null) {
      setStartTime(null);
    }
  }, [status, startTime]);

  // Compute ETA from segment progress
  const currentSeg = segmentMatch ? parseInt(segmentMatch[1], 10) : 0;
  const totalSegs = segmentMatch ? parseInt(segmentMatch[2], 10) : 0;
  let etaDisplay = 'Calculating...';
  if (currentSeg > 0 && totalSegs > 0 && startTime !== null) {
    const elapsedSeconds = (Date.now() - startTime) / 1000;
    const etaSeconds = Math.round((elapsedSeconds / currentSeg) * (totalSegs - currentSeg));
    if (etaSeconds >= 60) {
      const m = Math.floor(etaSeconds / 60);
      const s = etaSeconds % 60;
      etaDisplay = `~${m}m ${s}s remaining`;
    } else {
      etaDisplay = `~${etaSeconds}s remaining`;
    }
  }

  if (status === 'processing') {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="w-full max-w-2xl space-y-8 text-center">
          <div className="relative mx-auto h-20 w-20">
            <div className="absolute inset-0 bg-brand-500/20 animate-ping" />
            <div className="relative flex h-20 w-20 items-center justify-center bg-brand-500 text-black shadow-hard">
              <Film className="h-8 w-8" />
            </div>
          </div>
          <div>
            <h3 className="text-xl font-bold text-white uppercase tracking-wider">Rendering Video</h3>
            <p className="mt-2 text-sm font-mono text-surface-400 min-h-[1.25rem]">{message || 'Initializing renderer...'}</p>
          </div>

          <div className="space-y-2">
            <div className="h-3 bg-surface-800 overflow-hidden">
              <div
                className="h-full bg-brand-500"
                style={{ width: `${Math.max(0, Math.min(progress, 100))}%` }}
              />
            </div>
            <p className="text-xs font-mono text-surface-500">{progress}% complete</p>
            {segmentMatch && (
              <p className="text-xs font-mono text-surface-400">
                Segment {segmentMatch[1]} of {segmentMatch[2]}
              </p>
            )}
            <p className="text-xs font-mono text-surface-400">{etaDisplay}</p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Compositing', threshold: 0, icon: '🎨' },
              { label: 'Rendering', threshold: 30, icon: '🎬' },
              { label: 'Encoding', threshold: 80, icon: '📦' },
            ].map((stage) => (
              <div
                key={stage.label}
                className={`border-2 p-4 ${
                  progress >= stage.threshold
                    ? 'border-brand-500 bg-surface-800'
                    : 'border-surface-700 bg-surface-900'
                }`}
              >
                <div className="text-2xl mb-2">{stage.icon}</div>
                <p className={`text-sm font-bold font-mono ${
                  progress >= stage.threshold ? 'text-brand-500' : 'text-surface-500'
                }`}>
                  {stage.label}
                </p>
                <p className="text-[10px] font-mono text-surface-500 mt-0.5">
                  {progress >= stage.threshold + 20
                    ? '✓ Complete'
                    : progress >= stage.threshold
                    ? 'In Progress...'
                    : 'Waiting...'}
                </p>
              </div>
            ))}
          </div>

          <div className="border-2 border-surface-700 bg-surface-900 p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-2 w-2 bg-brand-500 animate-pulse" />
              <span className="text-xs font-bold font-mono uppercase tracking-wider text-surface-300">Render Progress</span>
            </div>
            <div className="space-y-1.5">
              {(() => {
                const videoTrackPct = Math.max(0, Math.min(progress / 80 * 100, 100));
                const audioTrackPct = project
                  ? (project.narration.filter(n => n.status === 'ready').length / Math.max(1, project.narration.length)) * 100
                  : 0;
                const textOverlayPct = videoTrackPct;
                const effectsPct = progress >= 80 ? ((progress - 80) / 20) * 100 : 0;

                const tracks = [
                  { label: 'Video Track', pct: videoTrackPct },
                  { label: 'Audio Track', pct: audioTrackPct },
                  { label: 'Text Overlay', pct: textOverlayPct },
                  { label: 'Effects', pct: effectsPct },
                ];

                return tracks.map(({ label, pct }) => (
                  <div key={label} className="flex items-center gap-2">
                    <span className="w-20 text-[10px] font-mono text-surface-500 text-right">{label}</span>
                    <div className="h-4 flex-1 bg-surface-800">
                      <div
                        className="h-full bg-brand-500"
                        style={{ width: `${Math.max(0, Math.min(pct, 100))}%`, opacity: 0.7 }}
                      />
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>

          <button
            onClick={onCancel}
            className="inline-flex items-center gap-2 border-2 border-red-500 bg-surface-800 px-6 py-3 text-sm font-bold font-mono text-red-400 hover:bg-red-500 hover:text-black"
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
          <h3 className="text-xl font-bold text-white uppercase tracking-wider">Render Failed</h3>
          <p className="text-sm font-mono text-surface-400">{message || 'An error occurred during rendering.'}</p>
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-2 border-2 border-brand-500 bg-surface-800 px-6 py-3 text-sm font-bold font-mono text-brand-400 transition-colors duration-200 hover:bg-brand-500 hover:text-black"
            data-testid="assembly-retry-button"
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
        <div className="text-4xl">{project.thumbnail ? '✅' : '🎞️'}</div>
        <h3 className="text-xl font-bold text-white uppercase tracking-wider">
          {project.thumbnail ? 'Video Rendered Successfully' : 'Ready to Render'}
        </h3>
        <p className="text-sm text-surface-400">
          {project.thumbnail
            ? 'Your video is ready for preview and export.'
            : 'All narration is prepared. Start the render to produce the final video.'}
        </p>
        {!project.thumbnail && (
          <div className="flex flex-col items-center gap-3 mt-2">
            <div className="flex items-center gap-2" data-testid="quality-selector">
              <Monitor className="h-4 w-4 text-surface-400" />
              <span className="text-xs font-mono text-surface-400 uppercase tracking-wider">Quality:</span>
              {QUALITY_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setQuality(opt.id)}
                  className={`border-2 px-3 py-1.5 text-xs font-bold font-mono uppercase tracking-wider ${
                    quality === opt.id
                      ? 'border-brand-500 bg-brand-500/10 text-brand-400'
                      : 'border-surface-600 bg-surface-900 text-surface-500 hover:border-surface-400'
                  }`}
                  data-testid={`quality-${opt.id}`}
                  aria-pressed={quality === opt.id}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setBackgroundMusic(!backgroundMusic)}
              className={`flex items-center gap-2 border-2 px-4 py-2 text-sm font-bold font-mono uppercase tracking-wider ${
                backgroundMusic
                  ? 'border-brand-500 bg-surface-800 text-brand-400'
                  : 'border-surface-600 bg-surface-900 text-surface-500'
              }`}
              data-testid="bg-music-toggle"
              aria-pressed={backgroundMusic}
            >
              <Music className="h-4 w-4" />
              Background Music {backgroundMusic ? 'ON' : 'OFF'}
            </button>
            {backgroundMusic && (
              <div className="flex items-center gap-2" data-testid="music-preset-selector">
                <span className="text-xs font-mono text-surface-400 uppercase tracking-wider">Mood:</span>
                {MUSIC_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setMusicPreset(preset.id)}
                    className={`border-2 px-3 py-1.5 text-xs font-bold font-mono uppercase tracking-wider ${
                      musicPreset === preset.id
                        ? 'border-brand-500 bg-brand-500/10 text-brand-400'
                        : 'border-surface-600 bg-surface-900 text-surface-500 hover:border-surface-400'
                    }`}
                    data-testid={`music-preset-${preset.id}`}
                    aria-pressed={musicPreset === preset.id}
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {project.thumbnail ? (
          <button
            onClick={onNext}
            className="flex items-center justify-center gap-2 bg-brand-500 px-8 py-3 text-sm font-bold uppercase text-black shadow-hard hover:bg-brand-400 mx-auto"
            data-testid="preview-video-button"
          >
            Preview Video
            <ChevronRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            onClick={() => onAssemble({ quality, backgroundMusic, musicPreset: backgroundMusic ? musicPreset : undefined })}
            className="flex items-center justify-center gap-2 bg-brand-500 px-8 py-3 text-sm font-bold uppercase text-black shadow-hard hover:bg-brand-400 mx-auto"
            data-testid="assemble-video-button"
          >
            Assemble Video
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
