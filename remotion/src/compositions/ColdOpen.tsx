import { AbsoluteFill, useCurrentFrame, interpolate, Easing } from 'remotion';
import { ProjectProps } from '../types';
import { getTopicPalette, hexToRgba } from '../utils/colors';

export const ColdOpen: React.FC<ProjectProps> = (props) => {
  const frame = useCurrentFrame();
  const fps = props.fps;
  const palette = getTopicPalette(props.topic);
  const hookText = props.segments[0]?.narration?.slice(0, 80) || props.title;

  // Glitch effect: random horizontal displacement on frames 0-2
  const isGlitch = frame < 3;
  const glitchOffset = isGlitch ? Math.sin(frame * 17) * 30 : 0;

  // White flash on frame 1
  const flashOpacity = frame === 1 ? 0.6 : 0;

  // Hook text fade-in
  const textOpacity = interpolate(frame, [10, 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const textY = interpolate(frame, [10, 20], [20, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });

  // "COMING UP..." badge
  const badgeOpacity = interpolate(frame, [30, 40], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // Fade to black at end
  const fadeOut = interpolate(frame, [60, 72], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill>
      {/* Background gradient */}
      <AbsoluteFill style={{
        background: `linear-gradient(135deg, ${palette.bg[0]}, ${palette.bg[1]}, ${palette.bg[2]})`,
        transform: `translateX(${glitchOffset}px)`,
      }} />

      {/* Particles */}
      <AbsoluteFill style={{ opacity: 0.3 }}>
        {Array.from({ length: 40 }, (_, i) => {
          const x = ((i * 47 + frame * 0.3) % 1920);
          const y = ((i * 31 + frame * 0.2) % 1080);
          const size = 2 + (i % 3);
          return (
            <div key={i} style={{
              position: 'absolute', left: x, top: y,
              width: size, height: size,
              borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.4)',
            }} />
          );
        })}
      </AbsoluteFill>

      {/* Hook text */}
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div style={{
          opacity: textOpacity,
          transform: `translateY(${textY}px)`,
          color: 'white',
          fontSize: 48,
          fontWeight: 700,
          fontFamily: props.brand.fontFamily,
          textAlign: 'center',
          maxWidth: '70%',
          lineHeight: 1.3,
          textShadow: '0 2px 20px rgba(0,0,0,0.5)',
        }}>
          {hookText}
        </div>
      </AbsoluteFill>

      {/* COMING UP badge */}
      <div style={{
        position: 'absolute', top: 40, right: 40,
        opacity: badgeOpacity,
        backgroundColor: hexToRgba(props.brand.accentColor, 0.9),
        color: 'white',
        padding: '8px 16px',
        borderRadius: 4,
        fontSize: 14,
        fontWeight: 700,
        fontFamily: props.brand.fontFamily,
        letterSpacing: 2,
      }}>
        COMING UP...
      </div>

      {/* White flash */}
      <AbsoluteFill style={{ backgroundColor: 'white', opacity: flashOpacity }} />

      {/* Fade to black */}
      <AbsoluteFill style={{ backgroundColor: 'black', opacity: fadeOut }} />
    </AbsoluteFill>
  );
};
