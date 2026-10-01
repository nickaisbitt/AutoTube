import React from 'react';
import { useCurrentFrame, spring, interpolate } from 'remotion';

interface SlamTextProps {
  text: string;
  fontSize?: number;
  color?: string;
  fontFamily?: string;
  fontWeight?: number;
  delay?: number; // frames before animation starts
  style?: React.CSSProperties;
}

export const SlamText: React.FC<SlamTextProps> = ({
  text,
  fontSize = 64,
  color = 'white',
  fontFamily = 'Inter, system-ui, sans-serif',
  fontWeight = 800,
  delay = 0,
  style,
}) => {
  const frame = useCurrentFrame();
  const fps = 24;

  const scale = spring({
    frame: frame - delay,
    fps,
    config: { damping: 12, stiffness: 200, mass: 0.8 },
  });

  const opacity = interpolate(frame, [delay, delay + 5], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div style={{
      fontSize,
      color,
      fontFamily,
      fontWeight,
      transform: `scale(${scale})`,
      opacity,
      textAlign: 'center',
      ...style,
    }}>
      {text}
    </div>
  );
};
