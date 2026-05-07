import type { VideoProject } from '../../types';

export interface TimelineProps {
  project: VideoProject;
  currentSegmentIndex: number;
  onJumpToTime: (time: number) => void;
}

export default function Timeline({
  project,
  currentSegmentIndex,
  onJumpToTime,
}: TimelineProps) {
  return (
    <div className="border-2 border-surface-700 bg-surface-900 p-4">
      <p className="mb-3 text-xs font-mono font-semibold uppercase tracking-wider text-surface-400">Segment Timeline</p>
      <div className="flex gap-1">
        {project.script.map((segment, index) => {
          const isActive = index === currentSegmentIndex;
          const typeColors: Record<string, string> = {
            intro: 'bg-red-500/70',
            section: 'bg-blue-500/70',
            transition: 'bg-amber-500/70',
            outro: 'bg-emerald-500/70',
          };

          return (
            <button
              key={segment.id}
              onClick={() => {
                const elapsed = project.script.slice(0, index).reduce((sum, item) => sum + item.duration, 0);
                onJumpToTime(elapsed);
              }}
              className={`relative h-12 min-w-[70px] flex-1 overflow-hidden border-2 text-left ${
                isActive ? 'border-brand-500' : 'border-surface-700 hover:border-surface-500'
              }`}
            >
              <div className={`absolute inset-0 ${typeColors[segment.type] || 'bg-surface-700'}`} />
              <div className="absolute inset-0 bg-black/20" />
              <div className="relative flex h-full items-end p-2">
                <span className="truncate text-[10px] font-mono font-medium text-white">{segment.title}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
