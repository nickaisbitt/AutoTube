import React from 'react';
import { AbsoluteFill } from 'remotion';

interface VignetteProps {
  intensity?: number; // 0-1, default 0.45
}

export const Vignette: React.FC<VignetteProps> = ({ intensity = 0.45 }) => {
  return (
    <AbsoluteFill style={{
      background: `radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,${intensity}) 100%)`,
      pointerEvents: 'none',
    }} />
  );
};
