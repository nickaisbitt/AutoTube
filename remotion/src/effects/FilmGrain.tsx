import React, { useMemo } from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';

interface FilmGrainProps {
  opacity?: number; // 0-1, default 0.04
}

export const FilmGrain: React.FC<FilmGrainProps> = ({ opacity = 0.04 }) => {
  const frame = useCurrentFrame();

  // Generate deterministic random grain pattern per frame
  const grainId = `grain-${frame}`;

  return (
    <AbsoluteFill style={{ pointerEvents: 'none', mixBlendMode: 'overlay' }}>
      <svg width="100%" height="100%" style={{ position: 'absolute', top: 0, left: 0 }}>
        <defs>
          <filter id={grainId}>
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.65"
              numOctaves="3"
              seed={frame}
              stitchTiles="stitch"
            />
            <feColorMatrix type="saturate" values="0" />
          </filter>
        </defs>
        <rect width="100%" height="100%" filter={`url(#${grainId})`} opacity={opacity} />
      </svg>
    </AbsoluteFill>
  );
};
