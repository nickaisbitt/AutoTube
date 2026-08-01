import React from 'react';
import { Audio, useCurrentFrame } from 'remotion';
import { ProjectProps } from '../types';

interface BackgroundMusicProps {
  musicUrl: string;
  segments: ProjectProps['segments'];
  fps: number;
  duckDuringNarration?: boolean; // default true
  /** Frames the narration timeline is delayed by (cold open + title card). */
  offsetFrames?: number;
}

export const BackgroundMusic: React.FC<BackgroundMusicProps> = ({
  musicUrl,
  segments,
  fps,
  duckDuringNarration = true,
  offsetFrames = 0,
}) => {
  const frame = useCurrentFrame();

  // Narration segments start `offsetFrames` into the composition, so measure
  // narration presence relative to that offset to keep ducking aligned.
  const narrationFrame = frame - offsetFrames;
  let currentFrame = 0;
  let isNarrationActive = false;

  if (narrationFrame >= 0) {
    for (const seg of segments) {
      const segDuration = Math.round(seg.duration * fps);
      if (narrationFrame >= currentFrame && narrationFrame < currentFrame + segDuration) {
        isNarrationActive = true;
        break;
      }
      currentFrame += segDuration;
    }
  }

  // Volume: duck during narration, normal otherwise
  const volume = duckDuringNarration
    ? isNarrationActive ? 0.15 : 0.6
    : 0.6;

  return (
    <Audio
      src={musicUrl}
      volume={volume}
      loop
    />
  );
};
