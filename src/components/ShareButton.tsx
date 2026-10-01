import { Share2, Check } from 'lucide-react';
import { useState } from 'react';
import { shareProject } from '../services/collaboration';
import { useCopyToClipboard } from '../hooks/useCopyToClipboard';
import type { VideoProject } from '../types';

interface ShareButtonProps {
  project: VideoProject | null;
}

export default function ShareButton({ project }: ShareButtonProps) {
  const { copy, isCopying } = useCopyToClipboard();
  const [copied, setCopied] = useState(false);

  const handleShare = () => {
    if (!project) return;
    const url = shareProject(project.id, project);
    if (!url) return;
    copy(url, 'Share URL');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleShare}
      disabled={isCopying}
      className="flex items-center gap-2 border-2 border-surface-700 bg-surface-900 px-3 py-2 text-xs font-mono text-surface-300 transition-colors duration-200 hover:bg-brand-500 hover:text-black disabled:opacity-50"
      aria-label="Share project"
      title="Copy shareable project URL"
      data-testid="share-project-button"
    >
      {copied ? (
        <>
          <Check className="h-4 w-4" />
          Copied!
        </>
      ) : (
        <>
          <Share2 className="h-4 w-4" />
          Share
        </>
      )}
    </button>
  );
}
