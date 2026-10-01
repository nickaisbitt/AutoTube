import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, Easing } from 'remotion';
import { SegmentProps, ProjectProps } from '../types';
import { hexToRgba } from '../utils/colors';

interface QuoteCardLayoutProps {
  segment: SegmentProps;
  brand: ProjectProps['brand'];
}

export const QuoteCardLayout: React.FC<QuoteCardLayoutProps> = ({
  segment,
  brand,
}) => {
  const frame = useCurrentFrame();

  const quoteOpacity = interpolate(frame, [5, 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const quoteX = interpolate(frame, [5, 20], [-30, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });

  // Extract quote from narration (text in quotes or first sentence)
  const quoteMatch = segment.narration.match(/\u201c([^\u201d]+)\u201d/) || segment.narration.match(/"([^"]+)"/);
  const quoteText = quoteMatch ? quoteMatch[1] : segment.narration.split('.')[0] + '.';

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: 120 }}>
      <div style={{
        opacity: quoteOpacity,
        transform: `translateX(${quoteX}px)`,
        borderLeft: `4px solid ${brand.accentColor}`,
        paddingLeft: 40,
        maxWidth: '70%',
      }}>
        {/* Large quote mark */}
        <div style={{
          fontSize: 120,
          color: hexToRgba(brand.accentColor, 0.3),
          fontFamily: 'Georgia, serif',
          lineHeight: 0.8,
          marginBottom: -20,
        }}>
          &ldquo;
        </div>

        {/* Quote text */}
        <div style={{
          fontSize: 36,
          fontStyle: 'italic',
          color: 'white',
          fontFamily: 'Georgia, serif',
          lineHeight: 1.5,
          marginBottom: 20,
        }}>
          {quoteText}
        </div>

        {/* Attribution */}
        <div style={{
          fontSize: 16,
          color: hexToRgba(brand.accentColor, 0.7),
          fontFamily: brand.fontFamily,
          letterSpacing: 2,
          textTransform: 'uppercase',
        }}>
          {segment.title}
        </div>
      </div>
    </AbsoluteFill>
  );
};
