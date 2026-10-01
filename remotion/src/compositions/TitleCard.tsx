import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, spring, Easing } from 'remotion';
import { ProjectProps } from '../types';
import { getTopicPalette, hexToRgba } from '../utils/colors';

export const TitleCard: React.FC<ProjectProps> = (props) => {
  const frame = useCurrentFrame();
  const fps = props.fps;
  const palette = getTopicPalette(props.topic);

  const gradX = 50 + Math.sin(frame * 0.01) * 20;
  const gradY = 50 + Math.cos(frame * 0.008) * 15;

  const channelOpacity = interpolate(frame, [10, 25], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const channelY = interpolate(frame, [10, 25], [15, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });

  const titleText = props.title;
  const typingSpeed = 3;
  const charsToShow = Math.min(Math.floor((frame - 30) / typingSpeed), titleText.length);
  const titleDisplay = charsToShow > 0 ? titleText.slice(0, charsToShow) : '';
  const isTyping = charsToShow < titleText.length && charsToShow > 0;
  const cursorVisible = isTyping || (charsToShow >= titleText.length && Math.floor(frame / 12) % 2 === 0);

  const lineWidth = interpolate(frame, [25, 50], [0, 200], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });

  const topicOpacity = interpolate(frame, [60, 80], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const barWidth = interpolate(frame, [40, 70], [0, 400], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });

  return (
    <AbsoluteFill>
      <AbsoluteFill style={{
        background: `linear-gradient(135deg, ${palette.bg[0]}, ${palette.bg[1]}, ${palette.bg[2]})`,
      }} />
      <AbsoluteFill style={{
        background: `radial-gradient(circle at ${gradX}% ${gradY}%, ${hexToRgba(palette.accent, 0.06)}, transparent 50%)`,
      }} />

      <AbsoluteFill style={{ opacity: 0.25 }}>
        {Array.from({ length: 80 }, (_, i) => {
          const seed = i * 73 + 17;
          const x = ((seed * 37 + frame * (0.1 + (i % 5) * 0.02)) % 1920);
          const y = ((seed * 23 + frame * (0.05 + (i % 3) * 0.01)) % 1080);
          const size = 1 + (i % 3);
          const particleOpacity = 0.15 + Math.sin(frame * 0.015 + i * 0.5) * 0.1;
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

      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div style={{
          opacity: channelOpacity,
          transform: `translateY(${channelY}px)`,
          color: hexToRgba(palette.accent, 0.6),
          fontSize: 16,
          fontWeight: 700,
          fontFamily: props.brand.fontFamily,
          letterSpacing: 6,
          textTransform: 'uppercase',
          marginBottom: 40,
        }}>
          {props.brand.channelName}
        </div>

        <div style={{
          color: 'white',
          fontSize: 64,
          fontWeight: 800,
          fontFamily: props.brand.fontFamily,
          textAlign: 'center',
          maxWidth: '80%',
          minHeight: 80,
          textShadow: '0 2px 30px rgba(0,0,0,0.5)',
        }}>
          {titleDisplay}
          {cursorVisible && (
            <span style={{
              borderRight: '3px solid white',
              marginLeft: 2,
            }} />
          )}
        </div>

        <div style={{
          width: lineWidth,
          height: 3,
          backgroundColor: palette.accent,
          marginTop: 24,
          borderRadius: 2,
        }} />

        <div style={{
          opacity: topicOpacity,
          color: 'rgba(255,255,255,0.5)',
          fontSize: 20,
          fontFamily: props.brand.fontFamily,
          marginTop: 20,
          letterSpacing: 1,
        }}>
          {props.topic}
        </div>
      </AbsoluteFill>

      <div style={{
        position: 'absolute',
        bottom: 60,
        left: '50%',
        transform: 'translateX(-50%)',
        width: barWidth,
        height: 2,
        backgroundColor: hexToRgba(palette.accent, 0.3),
        borderRadius: 1,
      }} />
    </AbsoluteFill>
  );
};
