import React from 'react';
import { Audio, Sequence, useCurrentFrame } from 'remotion';
import { SegmentProps, ProjectProps } from '../types';

interface NarrationAudioProps {
  segments: ProjectProps['segments'];
  fps: number;
}

export const NarrationAudio: React.FC<NarrationAudioProps> = ({ segments, fps }) => {
  let currentFrame = 0;

  return (
    <>
      {segments.map((seg) => {
        const durationFrames = Math.round(seg.duration * fps);
        const from = currentFrame;
        currentFrame += durationFrames;

        if (!seg.narrationAudioUrl) return null;

        return (
          <Sequence key={seg.id} from={from} durationInFrames={durationFrames}>
            <Audio
              src={seg.narrationAudioUrl}
              volume={1}
            />
          </Sequence>
        );
      })}
    </>
  );
};
