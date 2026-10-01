import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, spring, Easing } from 'remotion';
import { SegmentProps, ProjectProps } from '../types';
import { hexToRgba, getTopicPalette } from '../utils/colors';

interface StatCardLayoutProps {
  segment: SegmentProps;
  brand: ProjectProps['brand'];
  topic: string;
  mediaSrc?: string;
}

export const StatCardLayout: React.FC<StatCardLayoutProps> = ({
  segment,
  brand,
  topic,
  mediaSrc,
}) => {
  const frame = useCurrentFrame();
  const fps = 24;
  const palette = getTopicPalette(topic);

  // Extract stat from narration (first number found)
  const statMatch = segment.narration.match(/(\d[\d,.]*\s*%|\$[\d,.]+|\d[\d,.]*\s*(?:billion|million|trillion|percent|reactors|countries))/i);
  const statText = statMatch ? statMatch[0] : '';

  // Animation
  const cardScale = spring({ frame, fps, config: { damping: 15, stiffness: 100 } });
  const numberOpacity = interpolate(frame, [10, 25], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const numberY = interpolate(frame, [10, 25], [20, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      {/* Dark card background */}
      <div style={{
        transform: `scale(${cardScale})`,
        backgroundColor: 'rgba(0,0,0,0.6)',
        borderRadius: 16,
        padding: '60px 80px',
        border: `1px solid ${hexToRgba(brand.accentColor, 0.3)}`,
        backdropFilter: 'blur(10px)',
        maxWidth: '70%',
        textAlign: 'center',
      }}>
        {/* Accent bar */}
        <div style={{
          width: 60,
          height: 4,
          backgroundColor: brand.accentColor,
          borderRadius: 2,
          margin: '0 auto 30px',
        }} />

        {/* Large stat number */}
        {statText && (
          <div style={{
            opacity: numberOpacity,
            transform: `translateY(${numberY}px)`,
            fontSize: 72,
            fontWeight: 800,
            color: brand.accentColor,
            fontFamily: brand.fontFamily,
            marginBottom: 16,
            textShadow: `0 0 30px ${hexToRgba(brand.accentColor, 0.3)}`,
          }}>
            {statText}
          </div>
        )}

        {/* Segment title */}
        <div style={{
          fontSize: 36,
          fontWeight: 700,
          color: 'white',
          fontFamily: brand.fontFamily,
          marginBottom: 16,
        }}>
          {segment.title}
        </div>

        {/* Narration excerpt */}
        <div style={{
          fontSize: 20,
          color: 'rgba(255,255,255,0.7)',
          fontFamily: brand.fontFamily,
          lineHeight: 1.5,
          maxWidth: 600,
        }}>
          {segment.narration.slice(0, 120)}
          {segment.narration.length > 120 ? '...' : ''}
        </div>
      </div>
    </AbsoluteFill>
  );
};
