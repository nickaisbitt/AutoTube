import React from 'react';
import { useCurrentFrame, interpolate, Easing } from 'remotion';

interface TypewriterTextProps {
  text: string;
  fontSize?: number;
  color?: string;
  fontFamily?: string;
  fontWeight?: number;
  typingSpeed?: number; // frames per character, default 2
  cursorBlink?: boolean;
  style?: React.CSSProperties;
}

export const TypewriterText: React.FC<TypewriterTextProps> = ({
  text,
  fontSize = 48,
  color = 'white',
  fontFamily = 'Inter, system-ui, sans-serif',
  fontWeight = 700,
  typingSpeed = 2,
  cursorBlink = true,
  style,
}) => {
  const frame = useCurrentFrame();

  const charsToShow = Math.min(
    Math.floor(frame / typingSpeed),
    text.length
  );

  const displayText = text.slice(0, charsToShow);
  const isTyping = charsToShow < text.length;

  // Cursor blink
  const cursorVisible = cursorBlink && (
    isTyping || Math.floor(frame / 15) % 2 === 0
  );

  return (
    <div style={{
      fontSize,
      color,
      fontFamily,
      fontWeight,
      ...style,
    }}>
      {displayText}
      {cursorVisible && (
        <span style={{
          borderRight: `2px solid ${color}`,
          marginLeft: 2,
          animation: 'none', // no CSS animations in Remotion
        }} />
      )}
    </div>
  );
};
