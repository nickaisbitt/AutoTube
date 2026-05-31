import React from 'react';
import { AbsoluteFill, Img, OffthreadVideo, useCurrentFrame, interpolate, Easing } from 'remotion';
import { SegmentProps, ProjectProps } from '../types';
import { getKenBurnsTransform } from '../utils/kenBurns';

interface LeftTextRightImageLayoutProps {
  segment: SegmentProps;
  brand: ProjectProps['brand'];
  mediaSrc?: string;
  mediaType?: 'image' | 'video';
}

export const LeftTextRightImageLayout: React.FC<LeftTextRightImageLayoutProps> = ({
  segment,
  brand,
  mediaSrc,
  mediaType = 'image',
}) => {
  const frame = useCurrentFrame();

  const textOpacity = interpolate(frame, [5, 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const textX = interpolate(frame, [5, 20], [-30, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });

  return (
    <AbsoluteFill>
      {/* Left side: text */}
      <div style={{
        position: 'absolute',
        left: 80,
        top: '50%',
        transform: `translateY(-50%) translateX(${textX}px)`,
        opacity: textOpacity,
        width: '45%',
      }}>
        {/* Accent bar */}
        <div style={{
          width: 40,
          height: 3,
          backgroundColor: brand.accentColor,
          marginBottom: 20,
        }} />

        {/* Title */}
        <div style={{
          fontSize: 42,
          fontWeight: 800,
          color: 'white',
          fontFamily: brand.fontFamily,
          marginBottom: 16,
          lineHeight: 1.2,
        }}>
          {segment.title}
        </div>

        {/* Narration */}
        <div style={{
          fontSize: 20,
          color: 'rgba(255,255,255,0.7)',
          fontFamily: brand.fontFamily,
          lineHeight: 1.6,
        }}>
          {segment.narration}
        </div>
      </div>

      {/* Right side: image */}
      {mediaSrc && (
        <div style={{
          position: 'absolute',
          right: 80,
          top: '50%',
          transform: 'translateY(-50%)',
          width: '40%',
          height: '60%',
          borderRadius: 12,
          overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.1)',
        }}>
          {mediaType === 'video' ? (
            <OffthreadVideo
              src={mediaSrc}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
              muted
            />
          ) : (
            <Img
              src={mediaSrc}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
            />
          )}
        </div>
      )}
    </AbsoluteFill>
  );
};
