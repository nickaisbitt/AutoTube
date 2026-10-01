import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';
import { hexToRgba, getTopicPalette } from '../utils/colors';

interface ProceduralBackgroundProps {
  topic: string;
  accentColor?: string;
}

export const ProceduralBackground: React.FC<ProceduralBackgroundProps> = ({
  topic,
  accentColor,
}) => {
  const frame = useCurrentFrame();
  const palette = getTopicPalette(topic);
  const accent = accentColor || palette.accent;

  const gradX = 50 + Math.sin(frame * 0.008) * 15;
  const gradY = 50 + Math.cos(frame * 0.006) * 10;

  const glowOpacity = 0.05 + Math.sin(frame * 0.03) * 0.03;

  return (
    <AbsoluteFill>
      <AbsoluteFill style={{
        background: `linear-gradient(135deg, ${palette.bg[0]}, ${palette.bg[1]}, ${palette.bg[2]})`,
      }} />

      <AbsoluteFill style={{
        background: `radial-gradient(circle at ${gradX}% ${gradY}%, ${hexToRgba(accent, glowOpacity)}, transparent 50%)`,
      }} />

      <AbsoluteFill style={{ opacity: 0.2 }}>
        {Array.from({ length: 40 }, (_, i) => {
          const seed = i * 73 + 17;
          const x = ((seed * 37 + frame * 0.15) % 1920);
          const y = ((seed * 23 + frame * 0.1) % 1080);
          const size = 1 + (i % 3);
          const particleOpacity = 0.2 + Math.sin(frame * 0.02 + i) * 0.15;
          return (
            <div key={i} style={{
              position: 'absolute', left: x, top: y,
              width: size, height: size,
              borderRadius: '50%',
              backgroundColor: `rgba(255,255,255,${particleOpacity})`,
            }} />
          );
        })}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
