import { AbsoluteFill, useCurrentFrame, interpolate, Easing } from 'remotion';
import { SegmentProps, ProjectProps } from '../types';
import { getTopicPalette, hexToRgba } from '../utils/colors';

interface SegmentSequenceProps extends ProjectProps {
  segment: SegmentProps;
  index: number;
  totalSegments: number;
}

export const SegmentSequence: React.FC<SegmentSequenceProps> = (props) => {
  const { segment, index, totalSegments, fps, brand, topic } = props;
  const frame = useCurrentFrame();
  const totalFrames = Math.round(segment.duration * fps);
  const progress = frame / totalFrames;
  const palette = getTopicPalette(topic);

  // Title slide-in animation (first 15 frames)
  const titleOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const titleX = interpolate(frame, [0, 15], [-50, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });

  // Narration text fade in
  const narrationOpacity = interpolate(frame, [15, 30], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // Split narration into words for karaoke
  const words = segment.narration.split(/\s+/);
  const msPerWord = (segment.duration * 1000) / words.length;
  const currentTimeMs = (frame / fps) * 1000;
  const currentWordIndex = Math.min(Math.floor(currentTimeMs / msPerWord), words.length - 1);

  // Progress bar
  const barWidth = interpolate(progress, [0, 1], [0, 100], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill>
      {/* Background gradient */}
      <AbsoluteFill style={{
        background: `linear-gradient(135deg, ${palette.bg[0]}, ${palette.bg[1]}, ${palette.bg[2]})`,
      }} />

      {/* Animated background glow */}
      <AbsoluteFill style={{
        background: `radial-gradient(circle at ${50 + Math.sin(frame * 0.02) * 10}% ${50 + Math.cos(frame * 0.015) * 10}%, ${hexToRgba(palette.accent, 0.08)}, transparent 60%)`,
      }} />

      {/* Particles */}
      <AbsoluteFill style={{ opacity: 0.15 }}>
        {Array.from({ length: 30 }, (_, i) => {
          const x = ((i * 67 + frame * 0.2) % 1920);
          const y = ((i * 43 + frame * 0.15) % 1080);
          const size = 1 + (i % 2);
          return (
            <div key={i} style={{
              position: 'absolute', left: x, top: y,
              width: size, height: size,
              borderRadius: '50%', backgroundColor: `rgba(255,255,255,0.3)`,
            }} />
          );
        })}
      </AbsoluteFill>

      {/* Main content area */}
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: 80 }}>
        {/* Segment title */}
        <div style={{
          opacity: titleOpacity,
          transform: `translateX(${titleX}px)`,
          color: 'white',
          fontSize: 56,
          fontWeight: 800,
          fontFamily: brand.fontFamily,
          textAlign: 'center',
          marginBottom: 30,
          textShadow: '0 2px 20px rgba(0,0,0,0.5)',
        }}>
          {segment.title}
        </div>

        {/* Accent line */}
        <div style={{
          width: interpolate(titleOpacity, [0, 1], [0, 120]),
          height: 3,
          backgroundColor: brand.accentColor,
          borderRadius: 2,
          marginBottom: 30,
        }} />

        {/* Karaoke narration */}
        <div style={{
          opacity: narrationOpacity,
          maxWidth: '80%',
          textAlign: 'center',
          lineHeight: 1.6,
        }}>
          {words.map((word, i) => {
            const isActive = i === currentWordIndex;
            const isPast = i < currentWordIndex;
            return (
              <span key={i} style={{
                fontSize: 28,
                fontFamily: brand.fontFamily,
                fontWeight: isActive ? 700 : 400,
                color: isActive ? brand.accentColor : isPast ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.8)',
                textShadow: isActive ? `0 0 20px ${hexToRgba(brand.accentColor, 0.5)}` : 'none',
                transition: 'none',
                margin: '0 4px',
              }}>
                {word}{' '}
              </span>
            );
          })}
        </div>
      </AbsoluteFill>

      {/* Chapter indicator */}
      <div style={{
        position: 'absolute', top: 40, left: 40,
        color: 'rgba(255,255,255,0.5)',
        fontSize: 14,
        fontFamily: brand.fontFamily,
        letterSpacing: 2,
        textTransform: 'uppercase',
      }}>
        CHAPTER {index + 1} OF {totalSegments}
      </div>

      {/* Letterbox bars */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 40,
        backgroundColor: 'rgba(0,0,0,0.92)',
      }} />
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 40,
        backgroundColor: 'rgba(0,0,0,0.92)',
      }} />
      {/* Accent glow on inner edges */}
      <div style={{
        position: 'absolute', top: 38, left: 0, right: 0, height: 2,
        backgroundColor: hexToRgba(brand.accentColor, 0.4),
      }} />
      <div style={{
        position: 'absolute', bottom: 38, left: 0, right: 0, height: 2,
        backgroundColor: hexToRgba(brand.accentColor, 0.4),
      }} />

      {/* Vignette */}
      <AbsoluteFill style={{
        background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.45) 100%)',
        pointerEvents: 'none',
      }} />

      {/* Progress bar */}
      <div style={{
        position: 'absolute', bottom: 50, left: '10%', right: '10%', height: 2,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 1,
      }}>
        <div style={{
          width: `${barWidth}%`,
          height: '100%',
          backgroundColor: brand.accentColor,
          borderRadius: 1,
          boxShadow: `0 0 8px ${hexToRgba(brand.accentColor, 0.5)}`,
        }} />
      </div>

      {/* Watermark */}
      <div style={{
        position: 'absolute', bottom: 50, right: 40,
        color: 'rgba(255,255,255,0.4)',
        fontSize: 12,
        fontFamily: brand.fontFamily,
        letterSpacing: 2,
        textTransform: 'uppercase',
      }}>
        {brand.channelName}
      </div>
    </AbsoluteFill>
  );
};
