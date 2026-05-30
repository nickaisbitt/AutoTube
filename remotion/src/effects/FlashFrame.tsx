import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';

interface FlashFrameProps {
  color?: string;
  peakOpacity?: number; // 0-1, default 0.6
  duration?: number; // frames, default 3
}

export const FlashFrame: React.FC<FlashFrameProps> = ({
  color = 'white',
  peakOpacity = 0.6,
  duration = 3,
}) => {
  const frame = useCurrentFrame();

  const opacity = interpolate(frame, [0, 1, duration], [0, peakOpacity, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{
      backgroundColor: color,
      opacity,
      pointerEvents: 'none',
    }} />
  );
};
