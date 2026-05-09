import { useState, useCallback } from 'react';
import { Scissors, Play, Trash2, RotateCcw, X } from 'lucide-react';
import type { VideoProject } from '../types';

export interface TrimEditorProps {
  project: VideoProject;
  isOpen: boolean;
  onClose: () => void;
  onApplyTrim: (trimmedSegments: Record<string, { start: number; end: number }>) => void;
}

const SEGMENT_COLORS: Record<string, string> = {
  intro: 'bg-red-500',
  section: 'bg-blue-500',
  transition: 'bg-amber-500',
  outro: 'bg-emerald-500',
};

export default function TrimEditor({ project, isOpen, onClose, onApplyTrim }: TrimEditorProps) {
  const [trimmedSegments, setTrimmedSegments] = useState<Record<string, { start: number; end: number }>>(
    () => {
      const initial: Record<string, { start: number; end: number }> = {};
      for (const seg of project.script) {
        initial[seg.id] = { start: 0, end: seg.duration };
      }
      return initial;
    }
  );
  const [dragging, setDragging] = useState<{ segmentId: string; handle: 'start' | 'end' } | null>(null);

  const totalDuration = project.script.reduce((sum, seg) => sum + seg.duration, 0);

  const handleMouseDown = useCallback((segmentId: string, handle: 'start' | 'end') => {
    setDragging({ segmentId, handle });
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const timeline = e.currentTarget;
    const rect = timeline.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const timeAtX = x * totalDuration;

    setTrimmedSegments((prev) => {
      const current = { ...prev[dragging.segmentId] };
      if (dragging.handle === 'start') {
        current.start = Math.min(timeAtX, current.end - 0.5);
      } else {
        current.end = Math.max(timeAtX, current.start + 0.5);
      }
      return { ...prev, [dragging.segmentId]: current };
    });
  }, [dragging, totalDuration]);

  const handleMouseUp = useCallback(() => {
    setDragging(null);
  }, []);

  const removeSegment = useCallback((segmentId: string) => {
    setTrimmedSegments((prev) => ({
      ...prev,
      [segmentId]: { start: 0, end: 0 },
    }));
  }, []);

  const resetSegment = useCallback((segmentId: string) => {
    const seg = project.script.find((s) => s.id === segmentId);
    if (!seg) return;
    setTrimmedSegments((prev) => ({
      ...prev,
      [segmentId]: { start: 0, end: seg.duration },
    }));
  }, [project.script]);

  const applyTrim = useCallback(() => {
    onApplyTrim(trimmedSegments);
    onClose();
  }, [trimmedSegments, onApplyTrim, onClose]);

  const resetAll = useCallback(() => {
    const initial: Record<string, { start: number; end: number }> = {};
    for (const seg of project.script) {
      initial[seg.id] = { start: 0, end: seg.duration };
    }
    setTrimmedSegments(initial);
  }, [project.script]);

  if (!isOpen) return null;

  const trimmedDuration = Object.values(trimmedSegments).reduce(
    (sum, t) => sum + Math.max(0, t.end - t.start),
    0
  );
  const removedCount = Object.values(trimmedSegments).filter((t) => t.start === 0 && t.end === 0).length;

  let cumulativeTime = 0;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" data-testid="trim-editor">
      <div className="absolute inset-0 bg-black/90" onClick={onClose} />
      <div className="relative w-full max-w-3xl border-2 border-surface-700 bg-surface-900 p-6 shadow-hard">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center bg-brand-500">
              <Scissors className="h-5 w-5 text-black" />
            </div>
            <div>
              <h3 className="text-lg font-bold uppercase tracking-wider text-white">Trim Video</h3>
              <p className="text-xs font-mono text-surface-400">
                {removedCount} segment{removedCount !== 1 ? 's' : ''} removed • {trimmedDuration.toFixed(1)}s total
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="border-2 border-surface-700 p-2 text-surface-400 hover:bg-brand-500 hover:text-black"
            aria-label="Close trim editor"
            data-testid="trim-editor-close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Timeline */}
        <div
          className="relative mb-6 h-24 cursor-crosshair select-none rounded border-2 border-surface-700 bg-surface-800"
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          data-testid="trim-timeline"
        >
          {project.script.map((seg) => {
            const trim = trimmedSegments[seg.id] || { start: 0, end: seg.duration };
            const isRemoved = trim.start === 0 && trim.end === 0;
            const segStart = cumulativeTime;
            cumulativeTime += seg.duration;

            const leftPct = (segStart / totalDuration) * 100;
            const widthPct = (seg.duration / totalDuration) * 100;
            const trimStartPct = ((trim.start - segStart) / seg.duration) * 100;
            const trimEndPct = ((trim.end - segStart) / seg.duration) * 100;

            return (
              <div
                key={seg.id}
                className="absolute top-0 h-full"
                style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
              >
                {/* Segment background */}
                <div className={`absolute inset-0 ${SEGMENT_COLORS[seg.type] || 'bg-surface-700'} ${isRemoved ? 'opacity-20' : 'opacity-40'}`} />

                {/* Trimmed region */}
                {!isRemoved && (
                  <div
                    className={`absolute top-1 bottom-1 ${SEGMENT_COLORS[seg.type] || 'bg-surface-600'} opacity-80`}
                    style={{ left: `${Math.max(0, trimStartPct)}%`, width: `${Math.min(100, trimEndPct) - Math.max(0, trimStartPct)}%` }}
                  >
                    {/* Start handle */}
                    <div
                      className="absolute top-0 bottom-0 w-2 cursor-ew-resize bg-white/60 hover:bg-white"
                      style={{ left: '-4px' }}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        handleMouseDown(seg.id, 'start');
                      }}
                      data-testid={`trim-handle-start-${seg.id}`}
                    />
                    {/* End handle */}
                    <div
                      className="absolute top-0 bottom-0 w-2 cursor-ew-resize bg-white/60 hover:bg-white"
                      style={{ right: '-4px' }}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        handleMouseDown(seg.id, 'end');
                      }}
                      data-testid={`trim-handle-end-${seg.id}`}
                    />
                  </div>
                )}

                {/* Segment label */}
                <div className="absolute bottom-1 left-1 right-1 truncate text-[9px] font-mono text-white/80">
                  {seg.title}
                </div>
              </div>
            );
          })}

          {/* Time markers */}
          <div className="absolute top-0 left-0 right-0 flex justify-between px-1 pt-0.5 text-[8px] font-mono text-surface-500">
            <span>0:00</span>
            <span>{Math.floor(totalDuration / 60)}:{String(Math.floor(totalDuration % 60)).padStart(2, '0')}</span>
          </div>
        </div>

        {/* Segment list */}
        <div className="mb-6 max-h-64 space-y-2 overflow-y-auto">
          {project.script.map((seg) => {
            const trim = trimmedSegments[seg.id] || { start: 0, end: seg.duration };
            const isRemoved = trim.start === 0 && trim.end === 0;
            const trimmedDuration = Math.max(0, trim.end - trim.start);

            return (
              <div
                key={seg.id}
                className={`flex items-center gap-3 border-2 p-3 ${
                  isRemoved ? 'border-surface-800 bg-surface-900 opacity-50' : 'border-surface-700 bg-surface-800'
                }`}
              >
                <div className={`h-3 w-3 rounded-sm ${SEGMENT_COLORS[seg.type] || 'bg-surface-600'}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-mono font-medium text-white">{seg.title}</p>
                  <p className="text-[10px] font-mono text-surface-500">
                    {isRemoved
                      ? 'Removed'
                      : `${trimmedDuration.toFixed(1)}s (trimmed from ${seg.duration}s)`}
                  </p>
                </div>
                <div className="flex gap-1">
                  {!isRemoved && (
                    <button
                      className="rounded border border-surface-600 px-2 py-1 text-[10px] font-mono text-surface-400 hover:bg-brand-500 hover:text-black"
                      data-testid={`preview-segment-${seg.id}`}
                    >
                      <Play className="inline h-3 w-3" />
                    </button>
                  )}
                  <button
                    onClick={() => resetSegment(seg.id)}
                    className="rounded border border-surface-600 px-2 py-1 text-[10px] font-mono text-surface-400 hover:bg-brand-500 hover:text-black"
                    data-testid={`reset-segment-${seg.id}`}
                  >
                    <RotateCcw className="inline h-3 w-3" />
                  </button>
                  <button
                    onClick={() => removeSegment(seg.id)}
                    className={`rounded border px-2 py-1 text-[10px] font-mono ${
                      isRemoved
                        ? 'border-surface-700 text-surface-600'
                        : 'border-red-900 text-red-400 hover:bg-red-500 hover:text-black'
                    }`}
                    data-testid={`remove-segment-${seg.id}`}
                  >
                    <Trash2 className="inline h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={resetAll}
            className="flex flex-1 items-center justify-center gap-2 border-2 border-surface-700 bg-surface-800 px-4 py-2 text-sm font-mono text-surface-300 hover:bg-surface-700"
            data-testid="trim-reset-all"
          >
            <RotateCcw className="h-4 w-4" />
            Reset All
          </button>
          <button
            onClick={applyTrim}
            className="flex flex-1 items-center justify-center gap-2 bg-brand-500 px-4 py-2 text-sm font-bold uppercase text-black shadow-hard-sm hover:bg-brand-400"
            data-testid="trim-apply"
          >
            <Scissors className="h-4 w-4" />
            Apply Trim
          </button>
        </div>
      </div>
    </div>
  );
}
