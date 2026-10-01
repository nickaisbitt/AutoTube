import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, spring, Easing } from 'remotion';
import { SegmentProps, ProjectProps } from '../types';
import { hexToRgba, getTopicPalette } from '../utils/colors';

interface SegmentTitleCardProps {
  segment: SegmentProps;
  index: number;
  totalSegments: number;
  brand: ProjectProps['brand'];
  topic: string;
}

export const SegmentTitleCard: React.FC<SegmentTitleCardProps> = ({
  segment,
  index,
  totalSegments,
  brand,
  topic,
}) => {
  const frame = useCurrentFrame();
  const fps = 24;
  const palette = getTopicPalette(topic);

  const scale = spring({ frame, fps, config: { damping: 15, stiffness: 80 } });
  const opacity = interpolate(frame, [0, 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const lineWidth = interpolate(frame, [5, 25], [0, 120], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div style={{
        transform: `scale(${scale})`,
        opacity,
        textAlign: 'center',
      }}>
        {/* "UP NEXT" label */}
        <div style={{
          fontSize: 16,
          fontWeight: 700,
          color: brand.accentColor,
          fontFamily: brand.fontFamily,
          letterSpacing: 4,
          textTransform: 'uppercase',
          marginBottom: 16,
        }}>
          UP NEXT
        </div>

        {/* Chapter counter */}
        <div style={{
          fontSize: 14,
          color: 'rgba(255,255,255,0.5)',
          fontFamily: brand.fontFamily,
          letterSpacing: 3,
          textTransform: 'uppercase',
          marginBottom: 24,
        }}>
          CHAPTER {index + 1} OF {totalSegments}
        </div>

        {/* Accent line */}
        <div style={{
          width: lineWidth,
          height: 2,
          backgroundColor: brand.accentColor,
          margin: '0 auto 24px',
          borderRadius: 1,
        }} />

        {/* Segment title */}
        <div style={{
          fontSize: 48,
          fontWeight: 800,
          color: 'white',
          fontFamily: brand.fontFamily,
          textShadow: '0 2px 20px rgba(0,0,0,0.5)',
        }}>
          {segment.title}
        </div>
      </div>
    </AbsoluteFill>
  );
};
