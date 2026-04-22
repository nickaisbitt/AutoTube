import { useState } from 'react';
import {
  Image as ImageIcon,
  ExternalLink,
  ChevronRight,
  RefreshCw,
  CheckCircle2,
  Search,
  AlertCircle,
  Sparkles,
  Brain,
  Target,
  ChevronDown,
  Play,
  Film,
} from 'lucide-react';
import type { VideoProject, StepStatus, NarrativeBeat } from '../types';

const BEAT_COLORS: Record<NarrativeBeat, string> = {
  hook: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30',
  context: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  data: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  quote: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  event: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  analysis: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  conclusion: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  transition: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
};

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
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleReplace = async (assetId: string) => {
    setReplacingId(assetId);
    try {
      await onReplace(assetId);
    } finally {
      setReplacingId(null);
    }
  };

  if (status === 'processing') {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="w-full max-w-xl space-y-6 text-center">
          <div className="relative mx-auto h-20 w-20">
            <div className="absolute inset-0 rounded-2xl bg-violet-500/20 animate-ping" />
            <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-violet-400 shadow-xl shadow-violet-500/30">
              <Brain className="h-8 w-8 text-white" />
            </div>
          </div>
          <div>
            <h3 className="text-xl font-bold text-white">AI Visual Director at Work</h3>
            <p className="mt-2 text-sm text-surface-400 min-h-[2.5rem]">
              {message || 'Planning visual concepts and harvesting matching imagery...'}
            </p>
          </div>
          <div className="space-y-2">
            <div className="h-2 overflow-hidden rounded-full bg-surface-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-600 to-violet-400 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-surface-500">{progress}% complete</p>
          </div>

          <div className="grid gap-3 pt-2 text-left text-xs">
            <div className="flex items-start gap-3 rounded-xl border border-surface-700/40 bg-surface-900/60 p-3">
              <Search className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />
              <div>
                <p className="font-semibold text-white">1. Research</p>
                <p className="text-surface-400">Resolve topic on Wikipedia → identify entity kind & related entities.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-surface-700/40 bg-surface-900/60 p-3">
              <Brain className="mt-0.5 h-4 w-4 shrink-0 text-violet-400" />
              <div>
                <p className="font-semibold text-white">2. Plan</p>
                <p className="text-surface-400">For each segment, detect the narrative beat and generate concrete visual concepts.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-surface-700/40 bg-surface-900/60 p-3">
              <Target className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
              <div>
                <p className="font-semibold text-white">3. Harvest &amp; score</p>
                <p className="text-surface-400">Pull from Wikipedia, Wikidata, Openverse &amp; Commons; rank against the plan.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
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
          className="inline-flex items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-2 text-sm font-medium text-violet-300 transition-colors hover:bg-violet-500/20"
        >
          <RefreshCw className="h-4 w-4" />
          Retry Media Search
        </button>
      </div>
    );
  }

  const fallbackCount = project.media.filter((asset) => asset.isFallback).length;
  const matchedCount = project.media.length - fallbackCount;
  const ctx = project.topicContext;

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setPreviewImage(null)}
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

      {/* Topic-context research panel */}
      {ctx && (
        <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Brain className="h-4 w-4 text-sky-400" />
            <span className="text-xs font-semibold uppercase tracking-wider text-sky-300">
              Topic research
            </span>
            {ctx.kind && (
              <span className="rounded-md bg-sky-500/20 px-2 py-0.5 text-[10px] font-bold uppercase text-sky-200">
                {ctx.kind}
              </span>
            )}
          </div>

          {/* The parser's interpretation of the title */}
          <div className="space-y-1.5 text-sm text-white">
            <div>
              <span className="text-surface-400">You entered:</span>{' '}
              <span className="font-semibold">"{ctx.topic}"</span>
            </div>
            <div>
              <span className="text-surface-400">Parsed subject:</span>{' '}
              <span className="rounded-md bg-sky-500/20 px-2 py-0.5 font-semibold text-sky-100">
                {ctx.coreSubject}
              </span>
              {ctx.coreSubject.toLowerCase() !== ctx.topic.toLowerCase() && (
                <span className="ml-2 text-[11px] text-surface-500">
                  (stripped clickbait wrapper to find the core entity)
                </span>
              )}
            </div>
            <div>
              {ctx.resolvedTitle ? (
                <>
                  <span className="text-surface-400">Wikipedia match:</span>{' '}
                  <a
                    href={`https://en.wikipedia.org/wiki/${encodeURIComponent(ctx.resolvedTitle)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-emerald-300 underline-offset-2 hover:underline"
                  >
                    ✓ {ctx.resolvedTitle}
                  </a>
                </>
              ) : (
                <>
                  <span className="text-surface-400">Wikipedia match:</span>{' '}
                  <span className="text-amber-300">
                    ✗ none found — using parsed subject as the research target
                  </span>
                </>
              )}
            </div>
          </div>

          {ctx.description && (
            <p className="mt-2 text-xs text-surface-400">{ctx.description}</p>
          )}

          {ctx.subjectCandidates && ctx.subjectCandidates.length > 1 && (
            <details className="mt-3 text-xs">
              <summary className="cursor-pointer text-surface-400 hover:text-surface-300">
                Show parser candidates ({ctx.subjectCandidates.length})
              </summary>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {ctx.subjectCandidates.map((c, i) => (
                  <span
                    key={`${c}-${i}`}
                    className={`rounded-md border px-2 py-0.5 text-[11px] ${
                      c === ctx.coreSubject || c === ctx.resolvedTitle
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                        : 'border-surface-700 bg-surface-900/60 text-surface-400'
                    }`}
                  >
                    {i + 1}. {c}
                  </span>
                ))}
              </div>
            </details>
          )}

          {ctx.entities.length > 0 && (
            <div className="mt-3">
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-surface-500">
                Related entities
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ctx.entities.slice(0, 10).map((e) => (
                  <span
                    key={e}
                    className="rounded-md border border-sky-500/20 bg-sky-500/10 px-2 py-0.5 text-[11px] text-sky-200"
                  >
                    {e}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-surface-700/50 bg-surface-900/60 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-surface-300">
            <ImageIcon className="h-4 w-4 text-blue-400" />
            <span className="font-semibold text-white">{project.media.length}</span> visuals
          </div>
        </div>
        <div className="rounded-xl border border-surface-700/50 bg-surface-900/60 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-surface-300">
            <Sparkles className="h-4 w-4 text-emerald-400" />
            <span className="font-semibold text-white">{matchedCount}</span> live matches
          </div>
        </div>
        <div className="rounded-xl border border-surface-700/50 bg-surface-900/60 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-surface-300">
            <AlertCircle className="h-4 w-4 text-amber-400" />
            <span className="font-semibold text-white">{fallbackCount}</span> fallbacks
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {project.media.map((asset, index) => {
          const segment = project.script.find((item) => item.id === asset.segmentId);
          const plan = project.visualPlans?.[asset.segmentId];
          const isReplacing = replacingId === asset.id;
          const isExpanded = expandedId === asset.id;

          return (
            <div
              key={asset.id}
              className="group overflow-hidden rounded-xl border border-surface-700/50 bg-surface-900/60 transition-all hover:border-surface-600"
            >
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
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 backdrop-blur-md">
                        <Play className="ml-0.5 h-5 w-5 text-white fill-current" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <img
                    src={asset.url}
                    alt={asset.alt}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                <div className="absolute left-2 top-2 flex h-6 min-w-6 items-center justify-center rounded-md bg-black/50 px-2 text-[10px] font-bold text-white backdrop-blur-sm">
                  {index + 1}
                </div>
                <div className="absolute bottom-2 left-2 flex flex-wrap items-center gap-2">
                  {plan && (
                    <span
                      className={`rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase backdrop-blur-sm ${BEAT_COLORS[plan.beat]}`}
                    >
                      {plan.beat}
                    </span>
                  )}
                  <span
                    className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                      asset.isFallback
                        ? 'bg-amber-500/80 text-white'
                        : 'bg-emerald-500/80 text-white'
                    }`}
                  >
                    {asset.isFallback ? 'fallback' : `score ${asset.score ?? 0}`}
                  </span>
                  <span className="rounded-md bg-black/50 px-2 py-0.5 text-[10px] text-white backdrop-blur-sm flex items-center gap-1">
                    {asset.type === 'video' ? <Film className="h-2.5 w-2.5" /> : <ImageIcon className="h-2.5 w-2.5" />}
                    {asset.source}
                  </span>
                </div>
                <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={() => handleReplace(asset.id)}
                    disabled={isReplacing}
                    className="rounded-md bg-black/50 p-1.5 text-white backdrop-blur-sm hover:bg-black/70 disabled:opacity-50"
                    title="Re-harvest a different visual"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isReplacing ? 'animate-spin' : ''}`} />
                  </button>
                  <button
                    onClick={() => setPreviewImage(asset.url)}
                    className="rounded-md bg-black/50 p-1.5 text-white backdrop-blur-sm hover:bg-black/70"
                    title="Preview"
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
                  <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <Target className="h-3 w-3 text-violet-300" />
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-300">
                        Visual concept
                      </p>
                    </div>
                    <p className="mt-1 text-xs text-surface-200">{asset.concept}</p>
                    <p className="mt-1 text-[11px] text-surface-500">
                      Search query: <span className="text-surface-300">{asset.query || project.topic}</span>
                    </p>
                  </div>
                )}

                {/* Reasoning panel — collapsible */}
                {(asset.reasoning || plan) && (
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : asset.id)}
                    className="flex w-full items-center justify-between rounded-lg border border-surface-700/40 bg-surface-950/70 px-3 py-2 text-left transition-colors hover:border-surface-600"
                  >
                    <div className="flex items-center gap-1.5">
                      <Brain className="h-3 w-3 text-sky-300" />
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-sky-300">
                        Director's reasoning
                      </span>
                    </div>
                    <ChevronDown
                      className={`h-3.5 w-3.5 text-surface-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    />
                  </button>
                )}

                {isExpanded && asset.reasoning && (
                  <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg border border-surface-700/40 bg-surface-950/70 px-3 py-2 font-mono text-[11px] leading-relaxed text-surface-300">
                    {asset.reasoning}
                  </pre>
                )}

                <div className="flex flex-wrap items-center gap-3 text-xs text-surface-400">
                  <button
                    onClick={() => handleReplace(asset.id)}
                    className="inline-flex items-center gap-1.5 text-violet-300 transition-colors hover:text-violet-200"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Re-harvest
                  </button>

                  {asset.sourceUrl && (
                    <a
                      href={asset.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-surface-300 transition-colors hover:text-white"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Source page
                    </a>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {status === 'complete' && (
        <button
          onClick={onNext}
          className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 px-6 py-4 text-sm font-semibold text-white shadow-lg shadow-brand-500/25 transition-all hover:shadow-brand-500/40"
        >
          Prepare Narration
          <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </button>
      )}
    </div>
  );
}
