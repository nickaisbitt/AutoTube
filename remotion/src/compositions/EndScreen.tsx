import { AbsoluteFill, useCurrentFrame, interpolate, Easing } from 'remotion';
import { ProjectProps } from '../types';
import { getTopicPalette, hexToRgba } from '../utils/colors';

export const EndScreen: React.FC<ProjectProps> = (props) => {
  const frame = useCurrentFrame();
  const fps = props.fps;
  const palette = getTopicPalette(props.topic);

  const titleOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const titleY = interpolate(frame, [0, 20], [30, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const subscribeOpacity = interpolate(frame, [30, 50], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const lineWidth = interpolate(frame, [15, 40], [0, 200], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });

  return (
    <AbsoluteFill>
      <AbsoluteFill style={{
        background: `linear-gradient(135deg, ${palette.bg[0]}, ${palette.bg[1]}, ${palette.bg[2]})`,
      }} />

      {/* Particles */}
      <AbsoluteFill style={{ opacity: 0.2 }}>
        {Array.from({ length: 60 }, (_, i) => {
          const x = ((i * 37 + frame * 0.15) % 1920);
          const y = ((i * 23 + frame * 0.1) % 1080);
          const size = 1 + (i % 3);
          return (
            <div key={i} style={{
              position: 'absolute', left: x, top: y,
              width: size, height: size,
              borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.3)',
            }} />
          );
        })}
      </AbsoluteFill>

      {/* Thanks text */}
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div style={{
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`,
          color: 'white',
          fontSize: 64,
          fontWeight: 800,
          fontFamily: props.brand.fontFamily,
          textAlign: 'center',
        }}>
          Thanks for watching
        </div>

        {/* Accent line */}
        <div style={{
          width: lineWidth,
          height: 3,
          backgroundColor: props.brand.accentColor,
          marginTop: 20,
          borderRadius: 2,
        }} />

        {/* Title */}
        <div style={{
          opacity: titleOpacity,
          color: 'rgba(255,255,255,0.7)',
          fontSize: 24,
          fontFamily: props.brand.fontFamily,
          marginTop: 16,
          textAlign: 'center',
        }}>
          {props.title}
        </div>

        {/* Subscribe button */}
        <div style={{
          opacity: subscribeOpacity,
          marginTop: 40,
          backgroundColor: hexToRgba(props.brand.accentColor, 0.9),
          color: 'white',
          padding: '12px 32px',
          borderRadius: 24,
          fontSize: 18,
          fontWeight: 700,
          fontFamily: props.brand.fontFamily,
          letterSpacing: 1,
        }}>
          SUBSCRIBE
        </div>

        {/* Channel name */}
        <div style={{
          opacity: subscribeOpacity,
          color: 'rgba(255,255,255,0.5)',
          fontSize: 14,
          fontFamily: props.brand.fontFamily,
          marginTop: 20,
          letterSpacing: 3,
          textTransform: 'uppercase',
        }}>
          {props.brand.channelName}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
