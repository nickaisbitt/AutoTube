import { useMemo } from 'react';
import {
  Sparkles,
  SkipForward,
  ArrowRight,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Shuffle,
  Clock,
  Film,
  Type,
  ImageOff,
} from 'lucide-react';
import type { VideoProject, StepStatus } from '../types';
import { summarizeEditPlan } from '../services/aiEditor';

interface AIEditStepProps {
  project: VideoProject | null;
  status: StepStatus;
  progress: number;
  message: string;
  onRunAIEdit: () => void;
  onSkipAIEdit: () => void;
  onNext: () => void;
}

export default function AIEditStep({
  project,
  status,
  progress,
  message,
  onRunAIEdit,
  onSkipAIEdit,
  onNext,
}: AIEditStepProps) {
  const editPlan = project?.editPlan ?? null;

  const summary = useMemo(() => {
    if (!editPlan || !project) return '';
    return summarizeEditPlan(editPlan, project);
  }, [editPlan, project]);

  // Count segments that were actually modified (non-default rationale)
  const modifiedSegmentIds = useMemo(() => {
    if (!editPlan || editPlan.isDefault) return new Set<string>();
    const ids = new Set<string>();
    for (const entry of editPlan.segments) {
      const hasReorder = (() => {
        const originalOrder = project?.media
          .filter((a) => a.segmentId === entry.segmentId)
          .map((a) => a.id) ?? [];
        return (
          originalOrder.length > 0 &&
          entry.shotOrder.length === originalOrder.length &&
          !entry.shotOrder.every((id, i) => id === originalOrder[i])
        );
      })();
      const hasTiming = entry.adjustedDuration !== null;
      const hasReplacements = entry.replacementSuggestions.length > 0;
      const segIndex = project?.script.findIndex((s) => s.id === entry.segmentId) ?? -1;
      const hasTransitionChange =
        segIndex === 0
          ? entry.transition !== null
          : entry.transition === null || entry.transition.type !== 'crossfade';

      if (hasReorder || hasTiming || hasReplacements || hasTransitionChange) {
        ids.add(entry.segmentId);
      }
    }
    return ids;
  }, [editPlan, project]);

  // ── Processing state ──
  if (status === 'processing') {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="w-full max-w-lg space-y-6 text-center">
          <div className="relative mx-auto h-20 w-20">
            <div className="absolute inset-0 bg-brand-500/20 animate-ping" />
            <div className="relative flex h-20 w-20 items-center justify-center bg-brand-500 text-black shadow-[4px_4px_0px_#ff5500]">
              <Sparkles className="h-8 w-8" />
            </div>
          </div>
          <div>
            <h3 className="text-xl font-bold text-white uppercase tracking-wider">AI Editing in Progress</h3>
            <p className="mt-2 text-sm font-mono text-surface-400">
              {message || 'Initializing AI editor...'}
            </p>
          </div>
          <div className="space-y-2">
            <div className="h-2 overflow-hidden bg-surface-800">
              <div
                className="h-full bg-brand-500"
                style={{ width: `${Math.max(0, Math.min(progress, 100))}%` }}
              />
            </div>
            <p className="text-xs font-mono text-surface-500">{progress}% complete</p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Analyzing', threshold: 0, icon: '🔍' },
              { label: 'Optimizing', threshold: 30, icon: '✨' },
              { label: 'Applying', threshold: 80, icon: '🎬' },
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
                <p
                  className={`text-sm font-bold font-mono ${
                    progress >= stage.threshold ? 'text-brand-500' : 'text-surface-500'
                  }`}
                >
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
        </div>
      </div>
    );
  }

  // ── Error state ──
  if (status === 'error') {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="text-center space-y-4">
          <div className="mx-auto flex h-16 w-16 items-center justify-center bg-surface-800 border-2 border-red-500 text-red-400">
            <AlertCircle className="h-8 w-8" />
          </div>
          <h3 className="text-xl font-bold text-white uppercase tracking-wider">AI Edit Failed</h3>
          <p className="text-sm font-mono text-surface-400">
            {message || 'An error occurred during AI editing. You can skip this step and proceed to assembly.'}
          </p>
          <button
            onClick={onSkipAIEdit}
            className="inline-flex items-center gap-2 border-2 border-amber-500 bg-surface-800 px-6 py-3 text-sm font-bold font-mono text-amber-400 hover:bg-amber-500 hover:text-black"
            data-testid="skip-to-assembly-button"
          >
            <SkipForward className="h-4 w-4" />
            Skip to Assembly
          </button>
        </div>
      </div>
    );
  }

  // ── Complete state: show edit summary and per-segment rationale ──
  if (status === 'complete' && editPlan && project) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 px-6 py-8">
        <div>
          <div className="mb-2 flex items-center gap-2 text-brand-500">
            <Sparkles className="h-4 w-4" />
            <span className="text-xs font-mono font-semibold uppercase tracking-widest">
              AI Edit — Complete
            </span>
          </div>
          <h2 className="text-2xl font-bold text-white uppercase tracking-wider">AI Editing Summary</h2>
          <p className="mt-1 text-sm text-surface-400">{summary}</p>
        </div>

        {/* Global summary card */}
        <div className="border-2 border-brand-500 bg-surface-800 p-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 text-brand-500 flex-shrink-0" />
            <div className="text-sm text-surface-300">
              <p className="font-semibold text-white">Edit Plan Applied</p>
              <p className="mt-1 text-surface-400">{editPlan.summary}</p>
            </div>
          </div>
        </div>

        {/* Per-segment rationale */}
        <div className="space-y-2">
          {editPlan.segments.map((entry) => {
            const segment = project.script.find((s) => s.id === entry.segmentId);
            if (!segment) return null;

            const isModified = modifiedSegmentIds.has(entry.segmentId);
            const hasReplacements = entry.replacementSuggestions.length > 0;
            const hasTiming = entry.adjustedDuration !== null;

            return (
              <div
                key={entry.segmentId}
                className={`border-2 ${
                  isModified
                    ? 'border-brand-500 bg-surface-800'
                    : 'border-surface-700 bg-surface-900'
                }`}
                data-testid={`segment-edit-entry-${entry.segmentId}`}
              >
                <div className="px-4 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`inline-flex items-center gap-1 border-2 px-2 py-0.5 text-[10px] font-bold font-mono ${
                        isModified
                          ? 'border-brand-500 bg-brand-500 text-black'
                          : 'border-surface-600 bg-surface-800 text-surface-400'
                      }`}
                    >
                      {isModified ? (
                        <>
                          <Sparkles className="h-2.5 w-2.5" />
                          AI Edited
                        </>
                      ) : (
                        'Unchanged'
                      )}
                    </span>
                    <span className="text-[10px] font-bold text-surface-500">
                      {segment.type.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-white">{segment.title}</p>
                  <p className="mt-1 text-xs text-surface-400">{entry.rationale}</p>

                  {/* Change details for modified segments */}
                  {isModified && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {hasTiming && (
                        <span className="inline-flex items-center gap-1 bg-surface-800 border border-surface-600 px-2 py-0.5 text-[10px] font-mono text-surface-300">
                          <Clock className="h-2.5 w-2.5" />
                          {entry.originalDuration}s → {entry.adjustedDuration}s
                        </span>
                      )}
                      {entry.transition && (
                        <span className="inline-flex items-center gap-1 bg-surface-800 border border-surface-600 px-2 py-0.5 text-[10px] font-mono text-surface-300">
                          <Film className="h-2.5 w-2.5" />
                          {entry.transition.type}
                        </span>
                      )}
                      {entry.shotOrder.length > 1 && (
                        <span className="inline-flex items-center gap-1 bg-surface-800 border border-surface-600 px-2 py-0.5 text-[10px] font-mono text-surface-300">
                          <Shuffle className="h-2.5 w-2.5" />
                          {entry.shotOrder.length} shots
                        </span>
                      )}
                      {entry.captionSettings.isFastPaced && (
                        <span className="inline-flex items-center gap-1 bg-surface-800 border-2 border-amber-500 px-2 py-0.5 text-[10px] font-mono text-amber-300">
                          <Type className="h-2.5 w-2.5" />
                          Fast-paced
                        </span>
                      )}
                      {hasReplacements && (
                        <span className="inline-flex items-center gap-1 bg-surface-800 border-2 border-red-500 px-2 py-0.5 text-[10px] font-mono text-red-300">
                          <ImageOff className="h-2.5 w-2.5" />
                          {entry.replacementSuggestions.length} replacement{entry.replacementSuggestions.length !== 1 ? 's' : ''} suggested
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Next button */}
        <button
          onClick={onNext}
          className="flex w-full items-center justify-center gap-2 bg-brand-500 px-6 py-4 text-sm font-bold uppercase text-black shadow-[4px_4px_0px_#ff5500] hover:bg-brand-400"
          data-testid="proceed-to-assembly-button"
        >
          Proceed to Assembly
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    );
  }

  // ── Active / idle state: show description and action buttons ──
  return (
    <div className="flex h-full items-center justify-center px-6">
      <div className="max-w-lg space-y-4 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center bg-surface-800 border-2 border-brand-500 text-brand-500">
          <Sparkles className="h-8 w-8" />
        </div>
        <div>
          <p className="text-lg font-semibold text-white">AI Video Editor</p>
          <p className="mt-1 text-sm text-surface-400">
            The AI editor analyzes your script, media, and narration to optimize shot ordering,
            transitions, timing, Ken Burns effects, and caption placement for a more polished result.
          </p>
        </div>
        <div className="flex flex-col items-center gap-3">
          <button
            onClick={onRunAIEdit}
            className="inline-flex items-center justify-center gap-2 bg-brand-500 px-6 py-3 text-sm font-bold uppercase text-black shadow-[4px_4px_0px_#ff5500] hover:bg-brand-400"
            data-testid="run-ai-edit-button"
          >
            <Sparkles className="h-4 w-4" />
            Run AI Edit
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            onClick={onSkipAIEdit}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-mono text-surface-400 border-2 border-surface-700 bg-surface-900 transition-colors duration-200 hover:bg-brand-500 hover:text-black hover:border-brand-500"
            data-testid="skip-ai-edit-button"
          >
            <SkipForward className="h-4 w-4" />
            Skip AI Edit
          </button>
        </div>
      </div>
    </div>
  );
}
