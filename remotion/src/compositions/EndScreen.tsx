import { AbsoluteFill, useCurrentFrame, interpolate, spring, Easing } from 'remotion';
import { ProjectProps } from '../types';
import { getTopicPalette, hexToRgba } from '../utils/colors';

export const EndScreen: React.FC<ProjectProps> = (props) => {
  const frame = useCurrentFrame();
  const fps = props.fps;
  const palette = getTopicPalette(props.topic);

  const totalFrames = 180;
  const fadeOutStart = totalFrames - 30;

  // Animated gradient
  const gradX = 50 + Math.sin(frame * 0.012) * 20;
  const gradY = 50 + Math.cos(frame * 0.009) * 15;

  // "Thanks for watching" spring scale-in
  const thanksScale = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 80, mass: 0.8 },
  });
  const thanksOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // Accent line grows
  const lineWidth = interpolate(frame, [20, 50], [0, 200], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  // Title fade-in
  const titleOpacity = interpolate(frame, [35, 55], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const titleY = interpolate(frame, [35, 55], [20, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  // Subscribe pill with gradient
  const subscribeScale = spring({
    frame: frame - 50,
    fps,
    config: { damping: 10, stiffness: 100, mass: 0.6 },
  });
  const subscribeOpacity = interpolate(frame, [50, 65], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // Channel name
  const channelOpacity = interpolate(frame, [65, 85], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // "Watch next" placeholder
  const watchNextOpacity = interpolate(frame, [80, 100], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const watchNextY = interpolate(frame, [80, 100], [15, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  // Fade to black at end
  const fadeToBlack = interpolate(frame, [fadeOutStart, totalFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill>
      {/* Animated gradient background */}
      <AbsoluteFill style={{
        background: `linear-gradient(135deg, ${palette.bg[0]}, ${palette.bg[1]}, ${palette.bg[2]})`,
      }} />
      <AbsoluteFill style={{
        background: `radial-gradient(circle at ${gradX}% ${gradY}%, ${hexToRgba(palette.accent, 0.08)}, transparent 50%)`,
      }} />

      {/* Particles */}
      <AbsoluteFill style={{ opacity: 0.25 }}>
        {Array.from({ length: 70 }, (_, i) => {
          const seed = i * 53 + 11;
          const x = ((seed * 41 + frame * (0.12 + (i % 4) * 0.02)) % 1920);
          const y = ((seed * 29 + frame * (0.06 + (i % 3) * 0.015)) % 1080);
          const size = 1 + (i % 3);
          const particleOpacity = 0.15 + Math.sin(frame * 0.012 + i * 0.4) * 0.1;
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

      {/* Content */}
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
        {/* Thanks for watching */}
        <div style={{
          opacity: thanksOpacity,
          transform: `scale(${thanksScale})`,
          color: 'white',
          fontSize: 64,
          fontWeight: 800,
          fontFamily: props.brand.fontFamily,
          textAlign: 'center',
          textShadow: '0 2px 30px rgba(0,0,0,0.5)',
        }}>
          Thanks for watching
        </div>

        {/* Accent line */}
        <div style={{
          width: lineWidth,
          height: 3,
          backgroundColor: palette.accent,
          marginTop: 20,
          borderRadius: 2,
        }} />

        {/* Video title */}
        <div style={{
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`,
          color: 'rgba(255,255,255,0.7)',
          fontSize: 24,
          fontFamily: props.brand.fontFamily,
          marginTop: 16,
          textAlign: 'center',
          maxWidth: '70%',
        }}>
          {props.title}
        </div>

        {/* Subscribe pill button */}
        <div style={{
          opacity: subscribeOpacity,
          transform: `scale(${Math.max(0, subscribeScale)})`,
          marginTop: 40,
          background: `linear-gradient(135deg, ${hexToRgba(props.brand.accentColor, 0.9)}, ${hexToRgba(palette.accent, 0.9)})`,
          color: 'white',
          padding: '14px 40px',
          borderRadius: 30,
          fontSize: 18,
          fontWeight: 700,
          fontFamily: props.brand.fontFamily,
          letterSpacing: 2,
          boxShadow: `0 4px 20px ${hexToRgba(props.brand.accentColor, 0.4)}`,
        }}>
          SUBSCRIBE
        </div>

        {/* Channel name */}
        <div style={{
          opacity: channelOpacity,
          color: 'rgba(255,255,255,0.5)',
          fontSize: 14,
          fontFamily: props.brand.fontFamily,
          marginTop: 20,
          letterSpacing: 3,
          textTransform: 'uppercase',
        }}>
          {props.brand.channelName}
        </div>

        {/* Watch next placeholder */}
        <div style={{
          opacity: watchNextOpacity,
          transform: `translateY(${watchNextY}px)`,
          marginTop: 50,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}>
          <div style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: palette.accent,
          }} />
          <span style={{
            color: 'rgba(255,255,255,0.4)',
            fontSize: 14,
            fontFamily: props.brand.fontFamily,
            letterSpacing: 2,
            textTransform: 'uppercase',
          }}>
            Watch next
          </span>
          <div style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: palette.accent,
          }} />
        </div>
      </AbsoluteFill>

      {/* Fade to black */}
      <AbsoluteFill style={{
        backgroundColor: 'black',
        opacity: fadeToBlack,
      }} />
    </AbsoluteFill>
  );
};
