import React, { useState, useMemo, useCallback } from 'react';
import {
  Image as ImageIcon,
  ExternalLink,
  RefreshCw,
  AlertCircle,
  Target,
  ChevronDown,
  Play,
  Film,
  Brain,
} from 'lucide-react';
import type { VideoProject, NarrativeBeat } from '../../types';

const BEAT_COLORS: Record<NarrativeBeat, string> = {
  hook: 'bg-surface-800 text-fuchsia-300 border-fuchsia-500',
  context: 'bg-surface-800 text-sky-300 border-sky-500',
  data: 'bg-surface-800 text-emerald-300 border-emerald-500',
  quote: 'bg-surface-800 text-amber-300 border-amber-500',
  event: 'bg-surface-800 text-rose-300 border-rose-500',
  analysis: 'bg-surface-800 text-violet-300 border-violet-500',
  conclusion: 'bg-surface-800 text-blue-300 border-blue-500',
  transition: 'bg-surface-800 text-slate-300 border-slate-500',
};

interface MediaCardProps {
  asset: VideoProject['media'][number];
  index: number;
  project: VideoProject;
  onReplace: (assetId: string) => Promise<void>;
  onPreview: (url: string) => void;
}

export default React.memo(function MediaCard({ asset, index, project, onReplace, onPreview }: MediaCardProps) {
  const [isReplacing, setIsReplacing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [replaceError, setReplaceError] = useState<string | null>(null);

  const segment = useMemo(() => project.script.find((item) => item.id === asset.segmentId), [project.script, asset.segmentId]);
  const plan = useMemo(() => project.visualPlans?.[asset.segmentId], [project.visualPlans, asset.segmentId]);

  const handleReplace = useCallback(async () => {
    setIsReplacing(true);
    setReplaceError(null);
    try {
      await onReplace(asset.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to replace media';
      setReplaceError(message);
    } finally {
      setIsReplacing(false);
    }
  }, [onReplace, asset.id]);

  return (
    <div className="group overflow-hidden border-2 border-surface-700 bg-surface-900 hover:border-brand-500">
      <div className="relative aspect-video overflow-hidden bg-surface-800">
        {isReplacing ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface-900/85">
            <RefreshCw className="h-8 w-8 animate-spin text-violet-400" />
            <p className="text-xs text-surface-400">Re-harvesting…</p>
          </div>
        ) : asset.type === 'video' ? (
          <div className="relative h-full w-full">
            <img
              src={asset.thumbnailUrl || asset.url}
              alt={asset.alt}
              className="h-full w-full object-cover"
              loading="lazy"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
              <div className="flex h-10 w-10 items-center justify-center bg-brand-500">
                <Play className="ml-0.5 h-5 w-5 text-black fill-current" />
              </div>
            </div>
          </div>
        ) : (
          <img
            src={asset.url}
            alt={asset.alt}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
        <div className="absolute left-2 top-2 flex h-6 min-w-6 items-center justify-center bg-black px-2 text-[10px] font-mono font-bold text-white">
          {index + 1}
        </div>
        <div className="absolute bottom-2 left-2 flex flex-wrap items-center gap-2">
          {plan && (
            <span
              className={`border-2 px-2 py-0.5 text-[10px] font-mono font-bold uppercase ${BEAT_COLORS[plan.beat]}`}
            >
              {plan.beat}
            </span>
          )}
          <span
            className={`px-2 py-0.5 text-[10px] font-mono font-bold ${
              asset.isFallback
                ? 'bg-amber-500 text-black'
                : 'bg-emerald-500 text-black'
            }`}
          >
            {asset.isFallback ? 'fallback' : `score ${asset.score ?? 0}`}
          </span>
          <span className="bg-black px-2 py-0.5 text-[10px] font-mono text-white flex items-center gap-1">
            {asset.type === 'video' ? <Film className="h-2.5 w-2.5" /> : <ImageIcon className="h-2.5 w-2.5" />}
            {asset.source}
          </span>
        </div>
        <div className="absolute right-2 top-2 flex gap-1 opacity-0 group-hover:opacity-100">
          <button
            onClick={handleReplace}
            disabled={isReplacing}
            className="bg-black p-1.5 text-white transition-colors duration-200 hover:bg-brand-500 hover:text-black disabled:opacity-50"
            title="Re-harvest a different visual"
            aria-label={`Replace visual for ${segment?.title ?? 'this segment'}`}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isReplacing ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => onPreview(asset.url)}
            className="bg-black p-1.5 text-white transition-colors duration-200 hover:bg-brand-500 hover:text-black"
            title="Preview"
            aria-label={`Preview image for ${segment?.title ?? 'this segment'}`}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="space-y-3 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-white">{segment?.title || 'Unknown segment'}</p>
          <p className="mt-1 text-xs text-surface-400 line-clamp-2">{asset.alt}</p>
        </div>

        {asset.concept && (
          <div className="border-2 border-violet-500 bg-surface-900 px-3 py-2">
            <div className="flex items-center gap-1.5">
              <Target className="h-3 w-3 text-violet-300" />
              <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-violet-300">
                Visual concept
              </p>
            </div>
            <p className="mt-1 text-xs text-surface-200">{asset.concept}</p>
            <p className="mt-1 text-[11px] text-surface-500">
              Search query: <span className="text-surface-300">{asset.query || project.topic}</span>
            </p>
          </div>
        )}

        {replaceError && (
          <div className="flex items-center gap-2 border-2 border-red-500 bg-surface-900 px-3 py-2 text-xs font-mono text-red-300">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-400" />
            <span>{replaceError}</span>
          </div>
        )}

        {/* Reasoning panel — collapsible */}
        {(asset.reasoning || plan) && (
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex w-full items-center justify-between border-2 border-surface-700 bg-surface-950 px-3 py-2 text-left hover:border-brand-500"
          >
            <div className="flex items-center gap-1.5">
              <Brain className="h-3 w-3 text-sky-300" />
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-sky-300">
                Director's reasoning
              </span>
            </div>
            <ChevronDown
              className={`h-3.5 w-3.5 text-surface-400 ${isExpanded ? 'rotate-180' : ''}`}
            />
          </button>
        )}

        {isExpanded && asset.reasoning && (
          <pre className="overflow-x-auto whitespace-pre-wrap border-2 border-surface-700 bg-surface-950 px-3 py-2 font-mono text-[11px] leading-relaxed text-surface-300">
            {asset.reasoning}
          </pre>
        )}

        <div className="flex flex-wrap items-center gap-3 text-xs text-surface-400">
          <button
            onClick={handleReplace}
            disabled={isReplacing}
            className="inline-flex items-center gap-1.5 border-2 border-brand-500 bg-surface-900 px-2.5 py-1.5 font-mono text-brand-400 transition-colors duration-200 hover:bg-brand-500 hover:text-black disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label={`Replace visual for ${segment?.title ?? 'this segment'}`}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isReplacing ? 'animate-spin' : ''}`} />
            Replace
          </button>

          {asset.sourceUrl && (
            <a
              href={asset.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-surface-300 hover:text-brand-500"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Source page
            </a>
          )}
        </div>
      </div>
    </div>
  );
});
