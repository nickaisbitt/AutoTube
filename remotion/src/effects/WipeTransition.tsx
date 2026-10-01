import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, Easing } from 'remotion';

interface WipeTransitionProps {
  durationInFrames?: number;
  direction?: 'left' | 'right';
  children: [React.ReactNode, React.ReactNode];
}

export const WipeTransition: React.FC<WipeTransitionProps> = ({
  durationInFrames = 12,
  direction = 'left',
  children,
}) => {
  const frame = useCurrentFrame();
  const [from, to] = children;

  const progress = interpolate(frame, [0, durationInFrames], [0, 100], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.cubic),
  });

  const clipPath = direction === 'left'
    ? `inset(0 ${100 - progress}% 0 0)`
    : `inset(0 0 0 ${progress}%)`;

  return (
    <AbsoluteFill>
      <AbsoluteFill>{from}</AbsoluteFill>
      <AbsoluteFill style={{ clipPath }}>{to}</AbsoluteFill>
    </AbsoluteFill>
  );
};
