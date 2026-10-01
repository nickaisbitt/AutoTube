import { type HTMLAttributes, type CSSProperties } from 'react';

interface SkeletonBaseProps {
  className?: string;
  style?: CSSProperties;
}

function SkeletonBase({
  className = '',
  style = {},
  children,
}: {
  className?: string;
  style?: CSSProperties;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={`skeleton ${className}`}
      style={style}
      aria-busy="true"
      aria-label="Loading"
    >
      {children}
    </div>
  );
}

function Line({ className = '', style = {} }: SkeletonBaseProps & HTMLAttributes<HTMLDivElement>) {
  return (
    <SkeletonBase
      className={`skeleton-line ${className}`}
      style={{ height: '12px', width: '100%', ...style }}
    />
  );
}

function Circle({ className = '', style = {} }: SkeletonBaseProps & HTMLAttributes<HTMLDivElement>) {
  const size = (style.width as string) || '40px';
  return (
    <SkeletonBase
      className={`skeleton-circle ${className}`}
      style={{ width: size, height: typeof size === 'string' ? size : `${size}px`, ...style }}
    />
  );
}

function Block({ className = '', style = {} }: SkeletonBaseProps & HTMLAttributes<HTMLDivElement>) {
  return (
    <SkeletonBase
      className={`skeleton-block ${className}`}
      style={{ width: '100%', height: '120px', ...style }}
    />
  );
}

export const Skeleton = {
  Line,
  Circle,
  Block,
};
