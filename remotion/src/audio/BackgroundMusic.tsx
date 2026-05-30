import React from 'react';
import { Audio, useCurrentFrame, interpolate } from 'remotion';
import { ProjectProps } from '../types';

interface BackgroundMusicProps {
  musicUrl: string;
  segments: ProjectProps['segments'];
  fps: number;
  duckDuringNarration?: boolean; // default true
}

export const BackgroundMusic: React.FC<BackgroundMusicProps> = ({
  musicUrl,
  segments,
  fps,
  duckDuringNarration = true,
}) => {
  const frame = useCurrentFrame();

  // Calculate narration presence per frame
  let currentFrame = 0;
  let isNarrationActive = false;

  for (const seg of segments) {
    const segDuration = Math.round(seg.duration * fps);
    if (frame >= currentFrame && frame < currentFrame + segDuration) {
      isNarrationActive = true;
      break;
    }
    currentFrame += segDuration;
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
