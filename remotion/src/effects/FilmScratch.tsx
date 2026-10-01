import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

interface FilmScratchProps {
  count?: number; // number of scratches, default 2
}

export const FilmScratch: React.FC<FilmScratchProps> = ({ count = 2 }) => {
  const frame = useCurrentFrame();

  // Deterministic random positions based on frame
  const scratches = Array.from({ length: count }, (_, i) => {
    const seed = frame * 13 + i * 37;
    const x = (seed * 7) % 1920;
    const height = 200 + (seed * 3) % 600;
    const y = (seed * 11) % (1080 - height);
    const opacity = 0.03 + ((seed * 5) % 50) / 1000;
    const visible = (frame + i * 7) % 4 < 2; // flicker every 4 frames
    return { x, y, height, opacity: visible ? opacity : 0 };
  });

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {scratches.map((s, i) => (
        <div key={i} style={{
          position: 'absolute',
          left: s.x,
          top: s.y,
          width: 1,
          height: s.height,
          backgroundColor: `rgba(255,255,255,${s.opacity})`,
        }} />
      ))}
    </AbsoluteFill>
  );
};
