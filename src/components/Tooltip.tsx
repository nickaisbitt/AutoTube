import { useState, useRef, useEffect, type ReactNode } from 'react';

type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';

interface TooltipProps {
  content: string;
  position?: TooltipPosition;
  delay?: number;
  maxWidth?: number;
  children: ReactNode;
}

export default function Tooltip({
  content,
  position = 'top',
  delay = 300,
  maxWidth = 250,
  children,
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);

  const showTooltip = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setIsVisible(true), delay);
  };

  const hideTooltip = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setIsVisible(false);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const show = isVisible || isFocused;

  const positionClasses: Record<TooltipPosition, string> = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  const arrowClasses: Record<TooltipPosition, string> = {
    top: 'top-full left-1/2 -translate-x-1/2 -mt-1',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 -mb-1',
    left: 'left-full top-1/2 -translate-y-1/2 -mr-1',
    right: 'right-full top-1/2 -translate-y-1/2 -ml-1',
  };

  return (
    <span
      ref={triggerRef}
      className="relative inline-flex"
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      tabIndex={0}
      role="tooltip"
      aria-describedby={show ? 'tooltip-content' : undefined}
    >
      {children}
      {show && (
        <div
          id="tooltip-content"
          className={`absolute z-[300] ${positionClasses[position]}`}
          style={{ maxWidth: `${maxWidth}px`, whiteSpace: 'normal' }}
        >
          <div className="border-2 border-surface-600 bg-surface-800 px-3 py-2 text-xs font-mono text-surface-200 shadow-hard">
            {content}
          </div>
          <div
            className={`absolute h-2 w-2 rotate-45 border-2 border-surface-600 bg-surface-800 ${arrowClasses[position]}`}
            style={{ clipPath: position === 'top' ? 'polygon(0 0, 100% 0, 50% 100%)' : position === 'bottom' ? 'polygon(50% 0, 0 100%, 100% 100%)' : position === 'left' ? 'polygon(0 50%, 100% 0, 100% 100%)' : 'polygon(100% 50%, 0 0, 0 100%)' }}
          />
        </div>
      )}
    </span>
  );
}
