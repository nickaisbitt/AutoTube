import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, spring, Easing } from 'remotion';
import { SegmentProps, ProjectProps } from '../types';

interface CenteredTextLayoutProps {
  segment: SegmentProps;
  brand: ProjectProps['brand'];
}

export const CenteredTextLayout: React.FC<CenteredTextLayoutProps> = ({
  segment,
  brand,
}) => {
  const frame = useCurrentFrame();
  const fps = 24;

  const scale = spring({ frame, fps, config: { damping: 15, stiffness: 100 } });
  const opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div style={{
        transform: `scale(${scale})`,
        opacity,
        textAlign: 'center',
        padding: '40px 80px',
      }}>
        {/* Accent line */}
        <div style={{
          width: interpolate(scale, [0, 1], [0, 80]),
          height: 3,
          backgroundColor: brand.accentColor,
          margin: '0 auto 24px',
          borderRadius: 2,
        }} />

        {/* Title */}
        <div style={{
          fontSize: 48,
          fontWeight: 800,
          color: 'white',
          fontFamily: brand.fontFamily,
          marginBottom: 16,
          textShadow: '0 2px 20px rgba(0,0,0,0.5)',
        }}>
          {segment.title}
        </div>

        {/* Narration */}
        <div style={{
          fontSize: 22,
          color: 'rgba(255,255,255,0.7)',
          fontFamily: brand.fontFamily,
          maxWidth: 700,
          lineHeight: 1.5,
        }}>
          {segment.narration}
        </div>
      </div>
    </AbsoluteFill>
  );
};
