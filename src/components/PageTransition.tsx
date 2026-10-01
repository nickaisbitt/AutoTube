import { useEffect, useRef, useState, type ReactNode } from 'react';

interface PageTransitionProps {
  children: ReactNode;
  stepKey: string;
}

export default function PageTransition({ children, stepKey }: PageTransitionProps) {
  const [displayKey, setDisplayKey] = useState(stepKey);
  const [phase, setPhase] = useState<'enter' | 'exit'>('enter');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (stepKey === displayKey) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      setDisplayKey(stepKey);
      return;
    }

    setPhase('exit');
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setDisplayKey(stepKey);
      setPhase('enter');
    }, 200);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [stepKey, displayKey]);

  return (
    <div
      className={`page-transition ${phase === 'enter' ? 'page-transition-enter' : 'page-transition-exit'}`}
      key={displayKey}
    >
      {children}
    </div>
  );
}
