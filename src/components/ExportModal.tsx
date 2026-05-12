import { useState } from 'react';
import { X, Download, Film, Settings, Check, Monitor } from 'lucide-react';
import type { VideoProject } from '../types';
import { QUALITY_PRESETS } from '../services/renderer';
import { RESOLUTION_PRESETS, type ResolutionKey } from '../services/renderingShared';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: VideoProject | null;
  onExport: (quality: keyof typeof QUALITY_PRESETS, format: 'webm' | 'mp4', resolution?: ResolutionKey) => void;
}

const RESOLUTION_LABELS: Record<ResolutionKey, string> = {
  '720p': 'HD',
  '1080p': 'Full HD',
  '4K': 'Ultra HD',
};

export default function ExportModal({ isOpen, onClose, project, onExport }: ExportModalProps) {
  const [quality, setQuality] = useState<keyof typeof QUALITY_PRESETS>('high');
  const [format, setFormat] = useState<'webm' | 'mp4'>('mp4');
  const [resolution, setResolution] = useState<ResolutionKey>(
    (project?.exportSettings?.resolution as ResolutionKey) || '1080p'
  );

  if (!isOpen || !project) return null;

  const resPreset = RESOLUTION_PRESETS[resolution];
  const estimatedSize = Math.round(project.script.reduce((s, seg) => s + seg.duration, 0) * resPreset.videoBitsPerSecond / 8 / 1024 / 1024);

  const handleExport = () => {
    onExport(quality, format, resolution);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" data-testid="export-modal">
      <div className="absolute inset-0 bg-black/90" onClick={onClose} />
      <div className="relative w-full max-w-md border-2 border-surface-700 bg-surface-900 p-6 shadow-hard">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center bg-brand-500">
              <Film className="h-5 w-5 text-black" />
            </div>
            <div>
              <h3 className="text-lg font-bold uppercase tracking-wider text-white">Export Video</h3>
              <p className="text-xs font-mono text-surface-400">Choose your export settings</p>
            </div>
          </div>
          <button onClick={onClose} className="border-2 border-surface-700 p-2 text-surface-400 transition-colors duration-200 hover:bg-brand-500 hover:text-black" aria-label="Close export modal" title="Close export modal" data-testid="export-modal-close">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Resolution Selection */}
        <div className="mb-6 space-y-3">
          <label className="flex items-center gap-2 text-sm font-mono font-medium uppercase tracking-wider text-surface-300">
            <Monitor className="h-4 w-4" />
            Resolution
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(RESOLUTION_PRESETS) as ResolutionKey[]).map((key) => {
              const p = RESOLUTION_PRESETS[key];
              const isSelected = resolution === key;
              return (
                <button
                  key={key}
                  onClick={() => setResolution(key)}
                  className={`border-2 p-3 text-center ${
                    isSelected
                      ? 'border-brand-500 bg-brand-500 text-black'
                      : 'border-surface-700 bg-surface-800 transition-colors duration-200 hover:bg-brand-500 hover:text-black'
                  }`}
                  data-testid={`export-resolution-${key}`}
                >
                  <div className={`text-sm font-bold font-mono ${isSelected ? 'text-black' : 'text-white'}`}>
                    {key}
                  </div>
                  <div className={`text-[10px] font-mono ${isSelected ? 'text-black/70' : 'text-surface-500'}`}>
                    {p.width}×{p.height}
                  </div>
                  <div className={`text-[10px] font-mono ${isSelected ? 'text-black/70' : 'text-surface-500'}`}>
                    {RESOLUTION_LABELS[key]}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Quality Selection */}
        <div className="mb-6 space-y-3">
          <label className="flex items-center gap-2 text-sm font-mono font-medium uppercase tracking-wider text-surface-300">
            <Settings className="h-4 w-4" />
            Quality
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(QUALITY_PRESETS) as Array<keyof typeof QUALITY_PRESETS>).map((key) => {
              const isSelected = quality === key;
              return (
                <button
                  key={key}
                  onClick={() => setQuality(key)}
                  className={`border-2 p-3 text-center ${
                    isSelected
                      ? 'border-brand-500 bg-brand-500 text-black'
                      : 'border-surface-700 bg-surface-800 transition-colors duration-200 hover:bg-brand-500 hover:text-black'
                  }`}
                  data-testid={`export-quality-${key}`}
                >
                  <div className={`text-sm font-bold font-mono capitalize ${isSelected ? 'text-black' : 'text-white'}`}>
                    {key}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Format Selection */}
        <div className="mb-6 space-y-3">
          <label className="flex items-center gap-2 text-sm font-mono font-medium uppercase tracking-wider text-surface-300">
            <Film className="h-4 w-4" />
            Format
          </label>
          <div className="grid grid-cols-2 gap-2">
            {(['webm', 'mp4'] as const).map((fmt) => (
              <button
                key={fmt}
                onClick={() => setFormat(fmt)}
                className={`border-2 p-3 text-center ${
                  format === fmt
                    ? 'border-brand-500 bg-brand-500 text-black'
                    : 'border-surface-700 bg-surface-800 transition-colors duration-200 hover:bg-brand-500 hover:text-black'
                }`}
                data-testid={`export-format-${fmt}`}
              >
                <div className={`text-sm font-bold font-mono ${format === fmt ? 'text-black' : 'text-white'}`}>
                  {fmt.toUpperCase()}
                </div>
                <div className={`text-[10px] font-mono ${format === fmt ? 'text-black/70' : 'text-surface-500'}`}>
                  {fmt === 'webm' ? 'Best for web' : 'Best compatibility'}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Export Info */}
        <div className="mb-6 border-2 border-surface-700 bg-surface-800 p-4">
          <div className="grid grid-cols-2 gap-3 text-xs font-mono">
            <div>
              <span className="text-surface-500">Resolution</span>
              <p className="font-medium text-white">{resPreset.width} × {resPreset.height}</p>
            </div>
            <div>
              <span className="text-surface-500">Frame Rate</span>
              <p className="font-medium text-white">{resPreset.fps} fps</p>
            </div>
            <div>
              <span className="text-surface-500">Bitrate</span>
              <p className="font-medium text-white">{(resPreset.videoBitsPerSecond / 1_000_000).toFixed(1)} Mbps</p>
            </div>
            <div>
              <span className="text-surface-500">Est. Size</span>
              <p className="font-medium text-white">~{estimatedSize} MB</p>
            </div>
          </div>
        </div>

        {/* Export Button */}
        <button
          onClick={handleExport}
          className="flex w-full items-center justify-center gap-2 bg-brand-500 px-6 py-3 text-sm font-bold uppercase text-black shadow-hard"
          data-testid="export-submit-button"
        >
          <Download className="h-4 w-4" />
          Export Video
          <Check className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
