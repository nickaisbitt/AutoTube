import React from 'react';
import type { VideoProject } from '../../types';
import StoryboardView from '../StoryboardView';

export type PreviewMode = 'rendered' | 'storyboard';

export interface VideoPlayerProps {
  project: VideoProject;
  isPlaying: boolean;
  currentTime: number;
  currentSegmentIndex: number;
  totalDuration: number;
  isMuted: boolean;
  isNarrating: boolean;
  previewMode: PreviewMode;
  onPlayPause: () => void;
  onResetPlayback: () => void;
  onJumpToTime: (time: number) => void;
  onMuteToggle: () => void;
  formatTime: (seconds: number) => string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onTimeUpdate: (time: number) => void;
  onVideoEnded: () => void;
}

export default function VideoPlayer({
  project,
  isPlaying,
  currentTime,
  currentSegmentIndex,
  totalDuration,
  isMuted,
  isNarrating,
  previewMode,
  onPlayPause,
  onResetPlayback,
  onJumpToTime,
  onMuteToggle,
  formatTime,
  videoRef,
  onTimeUpdate,
  onVideoEnded,
}: VideoPlayerProps) {
  const isStoryboardMode = previewMode === 'storyboard';

  return (
    <div className="overflow-hidden border-2 border-surface-700 bg-black">
      {isStoryboardMode ? (
        <div className="max-h-[76vh] overflow-y-auto bg-surface-950">
          <StoryboardView project={project} />
        </div>
      ) : (
        <div className="relative aspect-video bg-surface-950">
          {project.thumbnail ? (
            <video
              ref={videoRef}
              src={project.thumbnail}
              className="h-full w-full"
              controls
              playsInline
              onTimeUpdate={(e) => onTimeUpdate(e.currentTarget.currentTime)}
              onEnded={onVideoEnded}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-surface-950">
              <p className="text-sm font-mono text-surface-500">No rendered video available. Run Video Assembly first.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
