import React from 'react';
import { Img, AbsoluteFill, useCurrentFrame, interpolate, Easing } from 'remotion';
import { KenBurnsParams } from '../types';
import { getKenBurnsTransform } from '../utils/kenBurns';

interface ImageBackgroundProps {
  src: string;
  kenBurns: KenBurnsParams;
  width: number;
  height: number;
  brightness?: number;
  overlay?: boolean;
}

export const ImageBackground: React.FC<ImageBackgroundProps> = ({
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

  const transform = getKenBurnsTransform(kenBurns, progress, width, height);

  return (
    <AbsoluteFill>
      <AbsoluteFill style={{
        transform,
        transformOrigin: 'center center',
        filter: `brightness(${brightness}) saturate(1.1) contrast(1.05)`,
      }}>
        <Img
          src={src}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
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
