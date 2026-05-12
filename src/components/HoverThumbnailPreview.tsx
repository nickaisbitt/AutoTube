import { useState, type ReactNode } from 'react';

interface HoverThumbnailPreviewProps {
  src: string;
  alt: string;
  children: ReactNode;
  width?: number;
  height?: number;
}

export default function HoverThumbnailPreview({
  src,
  alt,
  children,
  width = 320,
  height = 180,
}: HoverThumbnailPreviewProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setImageLoaded(false);
      }}
      onFocus={() => setIsHovered(true)}
      onBlur={() => {
        setIsHovered(false);
        setImageLoaded(false);
      }}
      tabIndex={0}
    >
      {children}
      {isHovered && (
        <div
          className="fixed z-[300] border-2 border-surface-600 bg-surface-900 shadow-hard"
          style={{
            width,
            height,
            pointerEvents: 'none',
            // Position near cursor but keep within viewport via CSS
            top: 'var(--hover-top, 50%)',
            left: 'var(--hover-left, 50%)',
          }}
        >
          {!imageLoaded && (
            <div className="flex h-full w-full items-center justify-center bg-surface-800">
              <div className="skeleton h-full w-full" />
            </div>
          )}
          <img
            src={src}
            alt={alt}
            className={`h-full w-full object-cover ${imageLoaded ? 'block' : 'hidden'}`}
            onLoad={() => setImageLoaded(true)}
          />
        </div>
      )}
    </span>
  );
}
