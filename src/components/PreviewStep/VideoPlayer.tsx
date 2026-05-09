import React, { useState } from 'react';
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
  // @ts-ignore - unused variable
  isPlaying,
  // @ts-ignore - unused variable
  currentTime,
  // @ts-ignore - unused variable
  currentSegmentIndex,
  // @ts-ignore - unused variable
  totalDuration,
  // @ts-ignore - unused variable
  isMuted,
  // @ts-ignore - unused variable
  isNarrating,
  previewMode,
  // @ts-ignore - unused variable
  onPlayPause,
  // @ts-ignore - unused variable
  onResetPlayback,
  // @ts-ignore - unused variable
  onJumpToTime,
  // @ts-ignore - unused variable
  onMuteToggle,
  // @ts-ignore - unused variable
  formatTime,
  videoRef,
  onTimeUpdate,
  onVideoEnded,
}: VideoPlayerProps) {
  const isStoryboardMode = previewMode === 'storyboard';
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  return (
    <div className="overflow-hidden border-2 border-surface-700 bg-black">
      {isStoryboardMode ? (
        <div className="max-h-[76vh] overflow-y-auto bg-surface-950">
          <StoryboardView project={project} />
        </div>
      ) : (
        <div className="relative aspect-video bg-surface-950">
          {project.thumbnail ? (
            <>
              {/* Loading overlay */}
              {isLoading && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-surface-950">
                  <div className="mb-3 h-8 w-8 animate-spin rounded-full border-2 border-surface-600 border-t-brand-500" />
                  <p className="text-sm font-mono text-surface-400">Loading video...</p>
                </div>
              )}

              {/* Error overlay */}
              {hasError && !isLoading && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-surface-950">
                  <p className="mb-3 text-2xl">⚠️</p>
                  <p className="text-sm font-mono text-surface-400">Failed to load video. Try re-rendering.</p>
                </div>
              )}

              <video
                ref={videoRef}
                src={project.thumbnail}
                className="h-full w-full"
                controls
                playsInline
                preload="metadata"
                onTimeUpdate={(e) => onTimeUpdate(e.currentTarget.currentTime)}
                onEnded={onVideoEnded}
                onCanPlay={() => { setIsLoading(false); setHasError(false); }}
                onError={() => { setIsLoading(false); setHasError(true); }}
                onLoadStart={() => { setIsLoading(true); setHasError(false); }}
              />
            </>
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
