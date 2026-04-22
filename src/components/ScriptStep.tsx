import { useState } from 'react';
import { 
  FileText, Clock, Type, Image as ImageIcon, ChevronDown, ChevronUp,
  Edit3, ChevronRight
} from 'lucide-react';
import type { VideoProject, StepStatus } from '../types';

interface ScriptStepProps {
  project: VideoProject | null;
  status: StepStatus;
  progress: number;
  message: string;
  onNext: () => void;
  onUpdateNarration?: (segmentId: string, text: string) => void;
}

export default function ScriptStep({ project, status, progress, message, onNext, onUpdateNarration }: ScriptStepProps) {
  const [expandedSegment, setExpandedSegment] = useState<string | null>(null);
  const [editingSegment, setEditingSegment] = useState<string | null>(null);
  const [editTexts, setEditTexts] = useState<Record<string, string>>({});

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
            <div className="absolute inset-0 rounded-2xl bg-brand-500/20 animate-ping" />
            <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-600 to-brand-400 shadow-xl shadow-brand-500/30">
              <FileText className="h-8 w-8 text-white" />
            </div>
          </div>
          <div>
            <h3 className="text-xl font-bold text-white">Generating Script</h3>
            <p className="mt-2 text-sm text-surface-400">{message || 'Initializing...'}</p>
          </div>
          <div className="space-y-2">
            <div className="h-2 rounded-full bg-surface-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand-600 to-brand-400 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-surface-500">{progress}% complete</p>
          </div>
          <div className="grid grid-cols-3 gap-3 pt-4">
            {['Researching', 'Structuring', 'Writing'].map((step, i) => (
              <div
                key={step}
                className={`rounded-lg border px-3 py-2 text-xs font-medium transition-all ${
                  progress > (i + 1) * 30
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                    : progress > i * 30
                    ? 'border-brand-500/30 bg-brand-500/10 text-brand-400'
                    : 'border-surface-700/50 bg-surface-900/50 text-surface-500'
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
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Segments', value: project.script.length, icon: '📑' },
          { label: 'Total Duration', value: `${Math.floor(totalDuration / 60)}:${(totalDuration % 60).toString().padStart(2, '0')}`, icon: '⏱️' },
          { label: 'Word Count', value: totalWords.toLocaleString(), icon: '📝' },
          { label: 'Style', value: project.style.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()), icon: '🎬' },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg border border-surface-700/50 bg-surface-900/60 p-3 text-center">
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
          const typeColors: Record<string, string> = {
            intro: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
            section: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
            transition: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
            outro: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
          };

          return (
            <div
              key={segment.id}
              className={`rounded-xl border transition-all ${
                isExpanded
                  ? 'border-surface-600 bg-surface-900/80'
                  : 'border-surface-700/50 bg-surface-900/40 hover:border-surface-600'
              }`}
            >
              <button
                onClick={() => setExpandedSegment(isExpanded ? null : segment.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-surface-800 text-[11px] font-bold text-surface-400">
                  {index + 1}
                </span>
                <span className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${typeColors[segment.type]}`}>
                  {segment.type}
                </span>
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
                <div className="border-t border-surface-700/50 px-4 py-4 space-y-3">
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
                        className="w-full rounded-lg border border-surface-600 bg-surface-800 px-3 py-2 text-sm text-surface-200 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/30"
                        rows={4}
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
          className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 px-6 py-4 text-sm font-semibold text-white shadow-lg shadow-brand-500/25 transition-all hover:shadow-brand-500/40"
        >
          Source Media Assets
          <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </button>
      )}
    </div>
  );
}
