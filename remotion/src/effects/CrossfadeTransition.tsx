import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, Easing } from 'remotion';

interface CrossfadeTransitionProps {
  durationInFrames?: number;
  children: [React.ReactNode, React.ReactNode];
}

export const CrossfadeTransition: React.FC<CrossfadeTransitionProps> = ({
  durationInFrames = 12,
  children,
}) => {
  const frame = useCurrentFrame();
  const [from, to] = children;

  const toOpacity = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.cubic),
  });

  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ opacity: 1 - toOpacity }}>{from}</AbsoluteFill>
      <AbsoluteFill style={{ opacity: toOpacity }}>{to}</AbsoluteFill>
    </AbsoluteFill>
  );
};
