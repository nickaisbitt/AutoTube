import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';

interface ChromaticAberrationProps {
  intensity?: number; // pixels of offset, default 3
  duration?: number; // frames to show, default 4
}

export const ChromaticAberration: React.FC<ChromaticAberrationProps> = ({
  intensity = 3,
  duration = 4,
}) => {
  const frame = useCurrentFrame();

  const progress = interpolate(frame, [0, duration], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const offset = intensity * progress;

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {/* Red channel offset */}
      <AbsoluteFill style={{
        mixBlendMode: 'screen',
        opacity: 0.3 * progress,
        transform: `translateX(${offset}px)`,
        backgroundColor: 'rgba(255,0,0,0.1)',
      }} />
      {/* Blue channel offset */}
      <AbsoluteFill style={{
        mixBlendMode: 'screen',
        opacity: 0.3 * progress,
        transform: `translateX(${-offset}px)`,
        backgroundColor: 'rgba(0,0,255,0.1)',
      }} />
    </AbsoluteFill>
  );
};
