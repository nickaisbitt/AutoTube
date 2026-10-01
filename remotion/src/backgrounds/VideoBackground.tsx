import React from 'react';
import { OffthreadVideo, AbsoluteFill, useCurrentFrame } from 'remotion';
import { KenBurnsParams } from '../types';
import { getKenBurnsTransform } from '../utils/kenBurns';

interface VideoBackgroundProps {
  src: string;
  kenBurns: KenBurnsParams;
  width: number;
  height: number;
  brightness?: number;
  overlay?: boolean;
}

export const VideoBackground: React.FC<VideoBackgroundProps> = ({
  src,
  kenBurns,
  width,
  height,
  brightness = 0.6,
  overlay = true,
}) => {
  const frame = useCurrentFrame();
  const totalFrames = 300;
  const progress = frame / Math.max(totalFrames, 1);

  // Video backgrounds already have motion, but standardising with a subtle Ken Burns motion
  // provides premium feel and continuity.
  const transform = getKenBurnsTransform(kenBurns, progress, width, height);

  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <AbsoluteFill style={{
        transform,
        transformOrigin: 'center center',
        filter: `brightness(${brightness}) saturate(1.1) contrast(1.05)`,
      }}>
        <OffthreadVideo
          src={src}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
          muted
        />
      </AbsoluteFill>

      {overlay && (
        <AbsoluteFill style={{
          background: 'linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.5) 50%, rgba(0,0,0,0.7) 100%)',
        }} />
      )}
    </AbsoluteFill>
  );
};
