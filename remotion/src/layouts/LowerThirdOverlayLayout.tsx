import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, Easing } from 'remotion';
import { SegmentProps, ProjectProps } from '../types';
import { hexToRgba } from '../utils/colors';

interface LowerThirdOverlayLayoutProps {
  segment: SegmentProps;
  brand: ProjectProps['brand'];
}

export const LowerThirdOverlayLayout: React.FC<LowerThirdOverlayLayoutProps> = ({
  segment,
  brand,
}) => {
  const frame = useCurrentFrame();

  const slideIn = interpolate(frame, [5, 20], [-100, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  const opacity = interpolate(frame, [5, 15], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill>
      {/* Lower third bar */}
      <div style={{
        position: 'absolute',
        bottom: 120,
        left: 0,
        right: 0,
        padding: '24px 80px',
        background: 'linear-gradient(90deg, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.6) 70%, transparent 100%)',
        opacity,
        transform: `translateX(${slideIn}%)`,
      }}>
        {/* Accent line */}
        <div style={{
          width: 40,
          height: 3,
          backgroundColor: brand.accentColor,
          marginBottom: 12,
        }} />

        {/* Title */}
        <div style={{
          fontSize: 32,
          fontWeight: 700,
          color: 'white',
          fontFamily: brand.fontFamily,
        }}>
          {segment.title}
        </div>

        {/* Subtitle */}
        <div style={{
          fontSize: 18,
          color: 'rgba(255,255,255,0.6)',
          fontFamily: brand.fontFamily,
          marginTop: 8,
        }}>
          {segment.narration.split('.')[0]}.
        </div>
      </div>
    </AbsoluteFill>
  );
};
