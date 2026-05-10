import { type ReactNode } from 'react';

type EmptyVariant = 'no-projects' | 'no-media' | 'no-renders' | 'no-analytics';

interface EmptyStateProps {
  variant: EmptyVariant;
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

const VARIANTS: Record<EmptyVariant, { icon: ReactNode; title: string; description: string }> = {
  'no-projects': {
    icon: (
      <svg viewBox="0 0 64 64" fill="none" className="h-16 w-16" aria-hidden="true">
        <rect x="8" y="12" width="48" height="40" stroke="currentColor" strokeWidth="3" className="text-surface-600" />
        <rect x="14" y="18" width="36" height="4" fill="currentColor" className="text-surface-700" />
        <rect x="14" y="26" width="24" height="3" fill="currentColor" className="text-surface-700" />
        <rect x="14" y="33" width="30" height="3" fill="currentColor" className="text-surface-700" />
        <circle cx="48" cy="44" r="10" fill="currentColor" className="text-surface-700" />
        <line x1="48" y1="38" x2="48" y2="50" stroke="currentColor" strokeWidth="2" className="text-surface-500" />
        <line x1="42" y1="44" x2="54" y2="44" stroke="currentColor" strokeWidth="2" className="text-surface-500" />
      </svg>
    ),
    title: 'No projects yet',
    description: 'Start by entering a topic to generate your first video.',
  },
  'no-media': {
    icon: (
      <svg viewBox="0 0 64 64" fill="none" className="h-16 w-16" aria-hidden="true">
        <rect x="6" y="10" width="52" height="44" rx="0" stroke="currentColor" strokeWidth="3" className="text-surface-600" />
        <circle cx="22" cy="26" r="6" stroke="currentColor" strokeWidth="2" className="text-surface-500" />
        <polygon points="6,46 24,30 42,54" fill="currentColor" className="text-surface-700" />
        <polygon points="34,54 50,34 58,44 58,54" fill="currentColor" className="text-surface-700" />
        <line x1="48" y1="16" x2="54" y2="22" stroke="currentColor" strokeWidth="2" className="text-red-400" />
        <line x1="54" y1="16" x2="48" y2="22" stroke="currentColor" strokeWidth="2" className="text-red-400" />
      </svg>
    ),
    title: 'No media assets',
    description: 'Retry the media search or upload your own files to continue.',
  },
  'no-renders': {
    icon: (
      <svg viewBox="0 0 64 64" fill="none" className="h-16 w-16" aria-hidden="true">
        <rect x="10" y="8" width="44" height="32" stroke="currentColor" strokeWidth="3" className="text-surface-600" />
        <polygon points="28,20 28,32 40,26" fill="currentColor" className="text-surface-500" />
        <rect x="16" y="44" width="32" height="4" fill="currentColor" className="text-surface-700" />
        <rect x="22" y="50" width="20" height="4" fill="currentColor" className="text-surface-700" />
        <circle cx="32" cy="52" r="2" fill="currentColor" className="text-surface-500" />
      </svg>
    ),
    title: 'No renders yet',
    description: 'Export a video to start tracking render analytics.',
  },
  'no-analytics': {
    icon: (
      <svg viewBox="0 0 64 64" fill="none" className="h-16 w-16" aria-hidden="true">
        <rect x="8" y="8" width="48" height="48" stroke="currentColor" strokeWidth="3" className="text-surface-600" />
        <line x1="16" y1="48" x2="16" y2="36" stroke="currentColor" strokeWidth="3" className="text-surface-500" />
        <line x1="26" y1="48" x2="26" y2="28" stroke="currentColor" strokeWidth="3" className="text-surface-500" />
        <line x1="36" y1="48" x2="36" y2="20" stroke="currentColor" strokeWidth="3" className="text-surface-500" />
        <line x1="46" y1="48" x2="46" y2="32" stroke="currentColor" strokeWidth="3" className="text-surface-500" />
        <line x1="14" y1="18" x2="50" y2="18" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" className="text-surface-600" />
      </svg>
    ),
    title: 'No analytics data',
    description: 'Complete a render to see performance metrics here.',
  },
};

export default function EmptyState({ variant, title, description, actionLabel, onAction }: EmptyStateProps) {
  const config = VARIANTS[variant];

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
      {config.icon}
      <div>
        <h3 className="text-lg font-bold text-white">{title ?? config.title}</h3>
        <p className="mt-1 text-sm text-surface-400">{description ?? config.description}</p>
      </div>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-2 border-2 border-brand-500 bg-surface-900 px-4 py-2 text-sm font-mono font-bold uppercase text-brand-400 transition-colors duration-200 hover:bg-brand-500 hover:text-black"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
