import { useState, useEffect, useMemo } from 'react';
import { 
  FileText, Clock, Type, Image as ImageIcon, ChevronDown, ChevronUp,
  Edit3, ChevronRight, RefreshCw
} from 'lucide-react';
import type { VideoProject, StepStatus } from '../types';
import { validateHook, type HookValidationResult, type HookPattern } from '../services/hookValidator';

export const SCRIPT_STATUS_MESSAGES = [
  'Analyzing topic structure...',
  'Identifying key narratives...',
  'Crafting segment transitions...',
  'Optimizing pacing...',
  'Building narrative arc...',
  'Refining script flow...',
  'Polishing segment hooks...',
  'Finalizing content structure...',
];

/** Maps hook pattern IDs to human-readable labels */
const HOOK_PATTERN_LABELS: Record<HookPattern, string> = {
  surprising_statistic: 'Surprising Statistic',
  provocative_question: 'Provocative Question',
  personal_stakes: 'Personal Stakes',
  counterintuitive_claim: 'Counterintuitive Claim',
};

interface ScriptStepProps {
  project: VideoProject | null;
  status: StepStatus;
  progress: number;
  message: string;
  onNext: () => void;
  onUpdateNarration?: (segmentId: string, text: string) => void;
  onRegenerate?: () => void;
}

export default function ScriptStep({ project, status, progress, message, onNext, onUpdateNarration, onRegenerate }: ScriptStepProps) {
  const [expandedSegment, setExpandedSegment] = useState<string | null>(null);
  const [editingSegment, setEditingSegment] = useState<string | null>(null);
  const [editTexts, setEditTexts] = useState<Record<string, string>>({});
  const [statusMessageIndex, setStatusMessageIndex] = useState(0);

  // Compute hook validation results for intro segments
  const hookResults = useMemo<Record<string, HookValidationResult>>(() => {
    if (!project || !project.script.length) return {};
    const results: Record<string, HookValidationResult> = {};
    for (const segment of project.script) {
      if (segment.type === 'intro') {
        results[segment.id] = validateHook(segment);
      }
    }
    return results;
  }, [project]);

  useEffect(() => {
    if (status !== 'processing') {
      setStatusMessageIndex(0);
      return;
    }

    const interval = setInterval(() => {
      setStatusMessageIndex((prev) => (prev + 1) % SCRIPT_STATUS_MESSAGES.length);
    }, 3000);

    return () => clearInterval(interval);
  }, [status]);

  const handleEditStart = (segmentId: string, narration: string) => {
    setEditTexts((prev) => ({ ...prev, [segmentId]: narration }));
    setEditingSegment(segmentId);
  };

  const handleEditDone = (segmentId: string) => {
    const text = editTexts[segmentId];
    if (text !== undefined && onUpdateNarration) {
      onUpdateNarration(segmentId, text);
    }
    setEditingSegment(null);
  };

  if (status === 'processing') {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="w-full max-w-lg space-y-6 text-center">
          <div className="relative mx-auto h-20 w-20">
            <div className="absolute inset-0 bg-brand-500/20 animate-ping" />
            <div className="relative flex h-20 w-20 items-center justify-center bg-brand-500 text-black shadow-hard">
              <FileText className="h-8 w-8" />
            </div>
          </div>
          <div>
            <h3 className="text-xl font-bold text-white">Generating Script</h3>
            <p className="mt-2 text-sm text-surface-400">{message || 'Initializing...'}</p>
          </div>
          <div className="space-y-2">
            <div className="h-2 bg-surface-800 overflow-hidden">
              <div className="h-full bg-brand-500" style={{ width: `${Math.max(0, Math.min(progress, 100))}%` }} />
            </div>
            <p className="text-xs font-mono text-surface-500">{progress}% complete</p>
          </div>
          <p
            data-testid="rotating-status"
            className="text-sm font-mono italic text-brand-400"
          >
            {SCRIPT_STATUS_MESSAGES[statusMessageIndex]}
          </p>
          <div className="grid grid-cols-3 gap-3 pt-4">
            {['Researching', 'Structuring', 'Writing'].map((step, i) => (
              <div
                key={step}
                className={`border-2 px-3 py-2 text-xs font-mono font-bold uppercase tracking-wider ${
                  progress > (i + 1) * 30
                    ? 'border-emerald-500 bg-emerald-500 text-black'
                    : progress > i * 30
                    ? 'border-brand-500 bg-brand-500 text-black'
                    : 'border-surface-700 bg-surface-900 text-surface-500'
                }`}
              >
                {step}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!project || !project.script.length) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-surface-500">No script generated yet.</p>
      </div>
    );
  }

  const totalDuration = project.script.reduce((sum, s) => sum + s.duration, 0);
  const totalWords = project.script.reduce((sum, s) => sum + s.narration.split(' ').length, 0);

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-emerald-400 mb-2">
            <FileText className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wider">Step 2 — Complete</span>
          </div>
          <h2 className="text-2xl font-bold text-white">{project.title}</h2>
          <p className="mt-1 text-sm text-surface-400">Review and edit your auto-generated script below.</p>
        </div>
        {status === 'complete' && onRegenerate && (
          <button
            onClick={onRegenerate}
            disabled={false}
            className="flex items-center gap-2 border-2 border-surface-700 bg-surface-900 px-3 py-2 text-sm font-mono font-bold text-surface-300 transition-colors duration-200 hover:bg-brand-500 hover:text-black hover:border-brand-500 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Regenerate script"
          >
            <RefreshCw className="h-4 w-4" />
            Regenerate
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Segments', value: project.script.length, icon: '📑' },
          { label: 'Total Duration', value: `${Math.floor(totalDuration / 60)}:${(totalDuration % 60).toString().padStart(2, '0')}`, icon: '⏱️' },
          { label: 'Word Count', value: totalWords.toLocaleString(), icon: '📝' },
          { label: 'Style', value: project.style.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()), icon: '🎬' },
        ].map((stat) => (
          <div key={stat.label} className="border-2 border-surface-700 bg-surface-900 p-3 text-center">
            <div className="text-lg">{stat.icon}</div>
            <div className="mt-1 text-base font-bold text-white">{stat.value}</div>
            <div className="text-[10px] text-surface-500 uppercase tracking-wider">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Script Segments */}
      <div className="space-y-2">
        {project.script.map((segment, index) => {
          const isExpanded = expandedSegment === segment.id;
          const isEditing = editingSegment === segment.id;
          const hookResult = hookResults[segment.id];
          const isHookSegment = segment.type === 'intro' && hookResult;
          const typeColors: Record<string, string> = {
            intro: 'bg-blue-500 text-black border-blue-500',
            section: 'bg-purple-500 text-black border-purple-500',
            transition: 'bg-amber-500 text-black border-amber-500',
            outro: 'bg-emerald-500 text-black border-emerald-500',
          };

          return (
            <div
              key={segment.id}
              data-testid={isHookSegment ? 'hook-segment' : undefined}
              className={`border-2 ${
                isHookSegment
                  ? isExpanded
                    ? 'border-amber-400 bg-amber-950/30'
                    : 'border-amber-500/60 bg-amber-950/20 hover:border-amber-400'
                  : isExpanded
                  ? 'border-surface-600 bg-surface-900'
                  : 'border-surface-700 bg-surface-900 hover:border-brand-500'
              }`}
            >
              <button
                onClick={() => setExpandedSegment(isExpanded ? null : segment.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
              >
                <span className="flex h-6 w-6 items-center justify-center bg-surface-800 text-[11px] font-mono font-bold text-surface-400">
                  {index + 1}
                </span>
                <span className={`border-2 px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider ${typeColors[segment.type]}`}>
                  {segment.type}
                </span>
                {/* Hook pattern badge */}
                {isHookSegment && hookResult.hasHook && hookResult.pattern && (
                  <span
                    data-testid="hook-badge"
                    className="border-2 border-amber-400 bg-amber-500/20 px-2 py-0.5 text-[10px] font-mono font-bold text-amber-300"
                  >
                    🎯 Hook: {HOOK_PATTERN_LABELS[hookResult.pattern]}
                  </span>
                )}
                <span className="flex-1 text-sm font-medium text-white truncate">
                  {segment.title}
                </span>
                <div className="flex items-center gap-3 text-surface-500">
                  <span className="flex items-center gap-1 text-xs">
                    <Clock className="h-3 w-3" />
                    {segment.duration}s
                  </span>
                  <span className="flex items-center gap-1 text-xs">
                    <Type className="h-3 w-3" />
                    {segment.narration.split(' ').length}w
                  </span>
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </button>

              {isExpanded && (
                <div className="border-t-2 border-surface-700 px-4 py-4 space-y-3">
                  {/* Hook validation feedback */}
                  {isHookSegment && (
                    <div data-testid="hook-feedback" className="border-2 border-amber-500/40 bg-amber-950/30 px-3 py-2 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-amber-400 text-xs font-bold uppercase tracking-wider">Hook Analysis</span>
                        {hookResult.hasHook ? (
                          <span className="text-emerald-400 text-[10px] font-mono">✓ Pattern detected</span>
                        ) : (
                          <span className="text-red-400 text-[10px] font-mono">✗ No hook pattern found</span>
                        )}
                      </div>
                      {/* Word count feedback */}
                      {!hookResult.isWithinTarget && (
                        <p data-testid="hook-word-count-warning" className="text-xs text-amber-300">
                          ⚠️ Word count: {hookResult.wordCount} words (target: 40–60).
                          {hookResult.wordCount < 40
                            ? ' Consider expanding the intro for more impact.'
                            : ' Consider trimming for a tighter hook.'}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Narration */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[11px] font-semibold uppercase tracking-wider text-surface-400">
                        Narration Text
                      </label>
                      <button
                        onClick={() => isEditing ? handleEditDone(segment.id) : handleEditStart(segment.id, segment.narration)}
                        className="flex items-center gap-1 text-[11px] text-brand-400 hover:text-brand-300"
                      >
                        <Edit3 className="h-3 w-3" />
                        {isEditing ? 'Done' : 'Edit'}
                      </button>
                    </div>
                    {isEditing ? (
                      <textarea
                        value={editTexts[segment.id] ?? segment.narration}
                        onChange={(e) => setEditTexts((prev) => ({ ...prev, [segment.id]: e.target.value }))}
                        className="w-full border-2 border-surface-600 bg-surface-800 px-3 py-2 text-sm text-surface-200 focus:border-brand-500 focus:outline-none"
                        rows={4}
                        placeholder="Edit narration text"
                        title="Edit narration text"
                      />
                    ) : (
                      <p className="text-sm leading-relaxed text-surface-300">
                        {segment.narration}
                      </p>
                    )}
                  </div>

                  {/* Visual Note */}
                  <div>
                    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-surface-400">
                      <span className="flex items-center gap-1"><ImageIcon className="h-3 w-3" /> Visual Direction</span>
                    </label>
                    <p className="text-xs text-surface-400 italic">{segment.visualNote}</p>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Next Button */}
      {status === 'complete' && (
        <button
          onClick={onNext}
          className="group flex w-full items-center justify-center gap-2 bg-brand-500 px-6 py-4 text-sm font-bold uppercase tracking-wider text-black shadow-hard hover:bg-brand-400"
        >
          Source Media Assets
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
