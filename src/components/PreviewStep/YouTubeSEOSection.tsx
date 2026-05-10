import { useMemo, useState } from 'react';
import { Copy, FileText, Image, RefreshCw, Tag, Type, X } from 'lucide-react';
import type { VideoProject } from '../../types';
import {
  extractHookLine,
  generateTitleOptions,
  extractDataPoints,
  generateFullMetadata,
} from '../../services/seoTitles';
import type { ThumbnailVariant } from '../../services/thumbnail';

interface YouTubeSEOSectionProps {
  project: VideoProject;
  thumbnailUrl?: string | null;
  thumbnailError?: boolean;
  onRegenerateThumbnail?: () => void;
  isRegeneratingThumbnail?: boolean;
}

/**
 * YouTube SEO metadata section — shows editable title, description, tags,
 * and thumbnail with variant selection and regeneration.
 * Requirements: 7.5, 8.7
 */
export default function YouTubeSEOSection({
  project,
  thumbnailUrl: externalThumbnailUrl,
  thumbnailError: externalThumbnailError,
  onRegenerateThumbnail,
  isRegeneratingThumbnail,
}: YouTubeSEOSectionProps) {
  const [copiedItem, setCopiedItem] = useState<string | null>(null);

  const seoData = useMemo(() => {
    const topicContext = project.topicContext ?? {
      topic: project.topic,
      coreSubject: project.topic,
      subjectCandidates: [project.topic],
      kind: 'concept' as const,
      description: '',
      entities: [],
      parseReasoning: '',
    };

    const metadata = generateFullMetadata(project, topicContext);

    const hookLine = extractHookLine(project.script);
    const dataPoints = extractDataPoints(project.media);
    const titleOptions = generateTitleOptions(project.topic, project.style, dataPoints, hookLine);

    return { metadata, titleOptions: titleOptions.slice(0, 3), topicContext };
  }, [project]);

  // Editable state for title, description, and tags
  const [editedTitle, setEditedTitle] = useState<string>(seoData.metadata.title);
  const [editedDescription, setEditedDescription] = useState<string>(seoData.metadata.description);
  const [editedTags, setEditedTags] = useState<string[]>(seoData.metadata.tags);

  // Thumbnail variant selection
  const [selectedVariant, setSelectedVariant] = useState<ThumbnailVariant>('fear');

  const handleCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedItem(label);
      setTimeout(() => setCopiedItem(null), 2000);
    } catch {
      // Clipboard API may fail in some contexts
    }
  };

  const handleCopyDescription = async () => {
    try {
      await navigator.clipboard.writeText(editedDescription);
      setCopiedItem('description');
      setTimeout(() => setCopiedItem(null), 2000);
    } catch {
      // Clipboard API may fail in some contexts
    }
  };

  const handleSelectTitle = (title: string) => {
    setEditedTitle(title);
  };

  const handleRemoveTag = (index: number) => {
    setEditedTags(prev => prev.filter((_, i) => i !== index));
  };

  const handleVariantSelect = (variant: ThumbnailVariant) => {
    setSelectedVariant(variant);
    if (onRegenerateThumbnail) onRegenerateThumbnail();
  };

  const variants: ThumbnailVariant[] = ['fear', 'curiosity', 'authority'];

  return (
    <div className="border-2 border-surface-700 bg-surface-900 p-4 space-y-4" data-testid="youtube-seo-section">
      <div className="flex items-center gap-2">
        <Tag className="h-4 w-4 text-brand-400" />
        <p className="text-xs font-mono font-semibold uppercase tracking-wider text-surface-400">YouTube SEO &amp; Metadata</p>
      </div>

      {/* Editable Title */}
      <div className="space-y-2">
        <p className="text-xs font-mono font-medium text-surface-400 flex items-center gap-1.5">
          <Type className="h-3.5 w-3.5" />
          Title (editable)
        </p>
        <input
          type="text"
          value={editedTitle}
          onChange={(e) => setEditedTitle(e.target.value)}
          className="w-full border-2 border-surface-700 bg-surface-800 px-3 py-2 font-mono text-sm text-surface-200 focus:border-brand-500 focus:outline-none"
          data-testid="seo-title-input"
          maxLength={70}
          aria-label="Video title"
        />
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono text-surface-500">
            {editedTitle.length}/70 characters
          </span>
          <button
            onClick={() => handleCopy(editedTitle, 'title')}
            className="flex items-center gap-1.5 border-2 border-surface-700 bg-surface-800 px-2 py-1 text-[10px] font-mono font-semibold uppercase tracking-wider text-surface-400 transition-colors duration-200 hover:bg-brand-500 hover:text-black"
            data-testid="copy-title-button"
          >
            <Copy className="h-3 w-3" />
            {copiedItem === 'title' ? 'Copied!' : 'Copy'}
          </button>
        </div>
        {/* Title suggestions */}
        <div className="space-y-1">
          <p className="text-[10px] font-mono text-surface-500 uppercase tracking-wider">Suggestions (click to use)</p>
          <div className="space-y-1">
            {seoData.titleOptions.map((option, idx) => (
              <button
                key={idx}
                onClick={() => handleSelectTitle(option.title)}
                className="flex w-full items-center justify-between gap-2 border border-surface-700 bg-surface-800/50 px-3 py-1.5 text-left text-xs font-mono text-surface-300 hover:border-brand-500 hover:bg-surface-700"
                data-testid={`seo-title-option-${idx}`}
                title="Click to use this title"
              >
                <span className="truncate">{option.title}</span>
                <span className="shrink-0 text-[10px] font-mono text-surface-500">
                  {option.title.length} chars
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Editable Description */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-mono font-medium text-surface-400 flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            Description (editable)
          </p>
          <button
            onClick={handleCopyDescription}
            className="flex items-center gap-1.5 border-2 border-surface-700 bg-surface-800 px-2 py-1 text-[10px] font-mono font-semibold uppercase tracking-wider text-surface-400 transition-colors duration-200 hover:bg-brand-500 hover:text-black"
            data-testid="copy-description-button"
          >
            <Copy className="h-3 w-3" />
            {copiedItem === 'description' ? 'Copied!' : 'Copy Description'}
          </button>
        </div>
        <textarea
          value={editedDescription}
          onChange={(e) => setEditedDescription(e.target.value)}
          className="w-full resize-y border-2 border-surface-700 bg-surface-800 p-3 font-mono text-xs leading-relaxed text-surface-300 focus:border-brand-500 focus:outline-none"
          rows={8}
          data-testid="seo-description-textarea"
          aria-label="Video description"
        />
      </div>

      {/* Tags as editable chips */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-mono font-medium text-surface-400 flex items-center gap-1.5">
            <Tag className="h-3.5 w-3.5" />
            Tags
          </p>
          <button
            onClick={() => handleCopy(editedTags.join(', '), 'tags')}
            className="flex items-center gap-1.5 border-2 border-surface-700 bg-surface-800 px-2 py-1 text-[10px] font-mono font-semibold uppercase tracking-wider text-surface-400 transition-colors duration-200 hover:bg-brand-500 hover:text-black"
            data-testid="copy-tags-button"
          >
            <Copy className="h-3 w-3" />
            {copiedItem === 'tags' ? 'Copied!' : 'Copy Tags'}
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5" data-testid="seo-tags-list">
          {editedTags.map((tag, idx) => (
            <span
              key={idx}
              className="inline-flex items-center gap-1 border border-surface-600 bg-surface-800 px-2 py-1 text-xs font-mono text-surface-300"
              data-testid={`seo-tag-${idx}`}
            >
              {tag}
              <button
                onClick={() => handleRemoveTag(idx)}
                className="ml-0.5 text-surface-500 hover:text-red-400"
                aria-label={`Remove tag ${tag}`}
                data-testid={`remove-tag-${idx}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* Thumbnail with variant selection and regenerate */}
      <div className="space-y-2">
        <p className="text-xs font-mono font-medium text-surface-400 flex items-center gap-1.5">
          <Image className="h-3.5 w-3.5" aria-label="Thumbnail Image Icon" />
          Thumbnail
        </p>
        <div className="flex gap-4">
          {/* Thumbnail preview */}
          <div className="shrink-0">
            {externalThumbnailUrl ? (
              <img
                src={externalThumbnailUrl}
                alt="Generated thumbnail preview"
                className="border-2 border-surface-700"
                style={{ width: 320, height: 180, objectFit: 'cover' }}
                data-testid="seo-thumbnail-preview"
              />
            ) : externalThumbnailError ? (
              <div
                className="flex items-center justify-center border-2 border-surface-700 bg-surface-800 text-xs font-mono text-surface-500"
                style={{ width: 320, height: 180 }}
                data-testid="seo-thumbnail-error"
              >
                Thumbnail unavailable
              </div>
            ) : (
              <div
                className="flex items-center justify-center border-2 border-surface-700 bg-surface-800 text-xs font-mono text-surface-500 animate-pulse"
                style={{ width: 320, height: 180 }}
              >
                Generating...
              </div>
            )}
          </div>

          {/* Variant selection and regenerate */}
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-mono text-surface-500 uppercase tracking-wider">Variant</p>
            <div className="flex flex-col gap-1">
              {variants.map((variant) => (
                <button
                  key={variant}
                  onClick={() => handleVariantSelect(variant)}
                  className={`px-3 py-1.5 text-xs font-mono capitalize ${
                    selectedVariant === variant
                      ? 'border-2 border-brand-500 bg-brand-500/10 text-brand-400'
                      : 'border border-surface-700 bg-surface-800 text-surface-400 hover:border-brand-500'
                  }`}
                  data-testid={`thumbnail-variant-${variant}`}
                  aria-label={`Select ${variant} thumbnail variant`}
                >
                  {variant}
                </button>
              ))}
            </div>
            <button
              onClick={onRegenerateThumbnail}
              disabled={isRegeneratingThumbnail}
              className="mt-2 flex items-center gap-1.5 border-2 border-surface-700 bg-surface-800 px-3 py-1.5 text-xs font-mono font-semibold uppercase text-surface-400 transition-colors duration-200 hover:bg-brand-500 hover:text-black disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="regenerate-thumbnail-button"
              aria-label="Regenerate thumbnail"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRegeneratingThumbnail ? 'animate-spin' : ''}`} />
              {isRegeneratingThumbnail ? 'Generating...' : 'Regenerate'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
