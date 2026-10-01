import { Eye, ThumbsUp, Clock } from 'lucide-react';
import type { VideoProject } from '../../types';

export interface QualitySettingsProps {
  project: VideoProject;
  totalDuration: number;
  formatTime: (seconds: number) => string;
}

export default function QualitySettings({
  project,
  totalDuration,
  formatTime,
}: QualitySettingsProps) {
  return (
    <div className="col-span-2 space-y-4">
      <h3 className="text-lg font-bold text-white">{project.title}</h3>
      <div className="flex items-center gap-4 text-sm text-surface-400">
        <span className="flex items-center gap-1"><Eye className="h-4 w-4" /> 0 views</span>
        <span className="flex items-center gap-1"><ThumbsUp className="h-4 w-4" /> 0 likes</span>
        <span className="flex items-center gap-1"><Clock className="h-4 w-4" /> {formatTime(totalDuration)}</span>
        <span>Just now</span>
      </div>

      <div className="border-2 border-surface-700 bg-surface-900 p-4">
        <p className="mb-2 text-xs font-mono font-semibold uppercase tracking-wider text-surface-400">Auto-generated Description</p>
        <p className="text-sm leading-relaxed text-surface-300">
          {project.script[0]?.narration.substring(0, 220)}...
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {project.topic.split(' ').filter((word) => word.length > 3).slice(0, 5).map((tag) => (
            <span key={tag} className="bg-surface-800 px-2 py-0.5 text-[11px] font-mono text-surface-400">
              #{tag.toLowerCase().replace(/[^a-z]/g, '')}
            </span>
          ))}
        </div>
      </div>

      {/* Export settings summary */}
      <div className="space-y-3 border-2 border-surface-700 bg-surface-900 p-4">
        <p className="text-xs font-mono font-semibold uppercase tracking-wider text-surface-400">Export Settings</p>
        <div className="space-y-2 text-xs font-mono">
          <div className="flex justify-between"><span className="text-surface-500">Resolution</span><span className="text-surface-300">{project.exportSettings ? `${project.exportSettings.width}×${project.exportSettings.height}` : '1280×720'}</span></div>
          <div className="flex justify-between"><span className="text-surface-500">Format</span><span className="text-surface-300">{project.exportSettings ? `${project.exportSettings.format.toUpperCase()} (${project.exportSettings.mimeType})` : 'WebM (VP9)'}</span></div>
          <div className="flex justify-between"><span className="text-surface-500">Audio</span><span className="text-surface-300">Browser TTS</span></div>
          <div className="flex justify-between"><span className="text-surface-500">Duration</span><span className="text-surface-300">{formatTime(totalDuration)}</span></div>
          <div className="flex justify-between"><span className="text-surface-500">File Size</span><span className="text-surface-300">{project.thumbnail ? '~' + Math.round(totalDuration * 0.6) + 'MB' : 'N/A'}</span></div>
        </div>
      </div>
    </div>
  );
}
