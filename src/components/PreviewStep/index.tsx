import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Download,
  RotateCcw,
  MonitorPlay,
} from 'lucide-react';
import type { VideoProject } from '../../types';
import { extractHookLine } from '../../services/seoTitles';
import {
  generateThumbnail,
  generateSplitScreenThumbnail,
  getBestThumbnailOverlay,
} from '../../services/thumbnail';
import { getExportBlockStatus } from '../../store/pipeline/orchestrator';
import VideoPlayer from './VideoPlayer';
import type { PreviewMode } from './VideoPlayer';
import Timeline from './Timeline';
import QualitySettings from './QualitySettings';
import ExportActions from './ExportActions';
import QualityCheck from './QualityCheck';
import BlindReviewCard from './BlindReviewCard';
import YouTubeSEOSection from './YouTubeSEOSection';
import { usePlayback } from './usePlayback';
import { useConfirmDialog } from '../ConfirmDialog';

interface PreviewStepProps {
  project: VideoProject | null;
  onReset: () => void;
  onOpenExport?: () => void;
}

export default function PreviewStep({ project, onReset, onOpenExport }: PreviewStepProps) {
  const [previewMode, setPreviewMode] = useState<PreviewMode>('rendered');
  const [thumbnailPreviewUrl, setThumbnailPreviewUrl] = useState<string | null>(null);
  const [thumbnailPreviewFailed, setThumbnailPreviewFailed] = useState(false);
  const [isRegeneratingThumbnail, setIsRegeneratingThumbnail] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirmDialog('new-video-reset');

  const {
    isPlaying,
    currentTime,
    currentSegmentIndex,
    isMuted,
    isNarrating,
    totalDuration,
    handlePlayPause,
    handleResetPlayback,
    jumpToTime,
    setIsMuted,
    setCurrentTime,
    setIsPlaying,
    formatTime,
  } = usePlayback(project, previewMode, videoRef);

  // Generate thumbnail preview once on mount
  useEffect(() => {
    if (!project) return;

    let cancelled = false;
    let localObjectUrl: string | null = null;

    const generate = async () => {
      try {
        const hookLine = extractHookLine(project.script);
        const overlayText = getBestThumbnailOverlay(project, hookLine);
        const blob = await generateSplitScreenThumbnail(project, project.title, overlayText);
        localObjectUrl = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(localObjectUrl);
          return;
        }
        objectUrlRef.current = localObjectUrl;
        setThumbnailPreviewUrl(localObjectUrl);
      } catch {
        if (cancelled) return;
        try {
          const blob = await generateThumbnail(project.title, project.topic);
          localObjectUrl = URL.createObjectURL(blob);
          if (cancelled) {
            URL.revokeObjectURL(localObjectUrl);
            return;
          }
          objectUrlRef.current = localObjectUrl;
          setThumbnailPreviewUrl(localObjectUrl);
        } catch {
          if (!cancelled) setThumbnailPreviewFailed(true);
        }
      }
    };

    generate().catch(() => {
      if (!cancelled) setThumbnailPreviewFailed(true);
    });

    return () => {
      cancelled = true;
      if (localObjectUrl) URL.revokeObjectURL(localObjectUrl);
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRegenerateThumbnail = useCallback(async () => {
    if (!project) return;
    setIsRegeneratingThumbnail(true);
    setThumbnailPreviewFailed(false);
    try {
      const hookLine = extractHookLine(project.script);
      const overlayText = getBestThumbnailOverlay(project, hookLine);
      const blob = await generateSplitScreenThumbnail(project, project.title, overlayText);
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = URL.createObjectURL(blob);
      setThumbnailPreviewUrl(objectUrlRef.current);
    } catch {
      try {
        const blob = await generateThumbnail(project.title, project.topic);
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = URL.createObjectURL(blob);
        setThumbnailPreviewUrl(objectUrlRef.current);
      } catch {
        setThumbnailPreviewFailed(true);
      }
    } finally {
      setIsRegeneratingThumbnail(false);
    }
  }, [project]);

  const handleNewVideo = useCallback(async () => {
    const confirmed = await confirm({
      title: 'Create New Video',
      description: 'This will reset your current project and start over. Any unsaved progress will be lost.',
      confirmLabel: 'New Video',
      cancelLabel: 'Cancel',
      variant: 'danger',
    });
    if (confirmed) onReset();
  }, [confirm, onReset]);

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-surface-500">No video to preview.</p>
      </div>
    );
  }

  const exportBlock = getExportBlockStatus(project);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-8" data-testid="preview-step">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-brand-400">
            <MonitorPlay className="h-4 w-4" />
            <span className="text-xs font-mono font-semibold uppercase tracking-wider">Final Preview</span>
          </div>
          <h2 className="text-2xl font-bold text-white">{project.title}</h2>
        </div>
        <div className="flex items-center gap-3">
          {onOpenExport && (
            <button
              onClick={onOpenExport}
              disabled={exportBlock.blocked}
              className={`flex items-center gap-2 px-3 py-2 text-xs font-bold uppercase shadow-hard-sm ${
                exportBlock.blocked
                  ? 'cursor-not-allowed bg-surface-700 text-surface-500'
                  : 'bg-brand-500 text-black hover:bg-brand-400'
              }`}
              aria-label={exportBlock.blocked ? 'Export blocked by quality gate' : 'Open export settings'}
              title={exportBlock.blocked ? exportBlock.reason : 'Open export settings'}
              data-testid="preview-export-button"
            >
              <Download className="h-4 w-4" />
              Export Video
            </button>
          )}
          <div className="flex items-center gap-1 border-2 border-surface-700 bg-surface-900 p-1">
            <button
              onClick={() => setPreviewMode('rendered')}
              className={`px-3 py-2 text-xs font-mono font-medium ${
                previewMode === 'rendered'
                  ? 'bg-brand-500 text-black'
                  : 'text-surface-400 transition-colors duration-200 hover:bg-brand-500 hover:text-black'
              }`}
              aria-label="Switch to MP4 preview"
              title="MP4 preview"
              data-testid="preview-toggle-rendered-video"
            >
              🎬 MP4
            </button>
            <button
              onClick={() => setPreviewMode('storyboard')}
              className={`px-3 py-2 text-xs font-mono font-medium ${
                previewMode === 'storyboard'
                  ? 'bg-brand-500 text-black'
                  : 'text-surface-400 transition-colors duration-200 hover:bg-brand-500 hover:text-black'
              }`}
              aria-label="Switch to storyboard mode"
              title="Storyboard mode"
              data-testid="preview-toggle-storyboard"
            >
              🧩 Storyboard
            </button>
          </div>
          <button
            onClick={handleNewVideo}
            className="flex items-center gap-2 border-2 border-surface-700 bg-surface-900 px-4 py-2 text-sm font-mono text-surface-300 transition-colors duration-200 hover:bg-brand-500 hover:text-black"
            aria-label="Create new video"
            title="Create new video"
            data-testid="new-video-button"
          >
            <RotateCcw className="h-4 w-4" />
            New Video
          </button>
        </div>
      </div>

      {/* Video Player */}
      <VideoPlayer
        project={project}
        isPlaying={isPlaying}
        currentTime={currentTime}
        currentSegmentIndex={currentSegmentIndex}
        totalDuration={totalDuration}
        isMuted={isMuted}
        isNarrating={isNarrating}
        previewMode={previewMode}
        onPlayPause={handlePlayPause}
        onResetPlayback={handleResetPlayback}
        onJumpToTime={jumpToTime}
        onMuteToggle={() => setIsMuted(prev => !prev)}
        formatTime={formatTime}
        videoRef={videoRef}
        onTimeUpdate={setCurrentTime}
        onVideoEnded={() => setIsPlaying(false)}
      />

      {/* Video Quality Check */}
      <QualityCheck videoUrl={project.thumbnail ?? null} />

      {/* Blind Review Card */}
      <BlindReviewCard report={project.blindReview ?? null} />

      {/* YouTube SEO Metadata Section */}
      <YouTubeSEOSection
        project={project}
        thumbnailUrl={thumbnailPreviewUrl}
        thumbnailError={thumbnailPreviewFailed}
        onRegenerateThumbnail={handleRegenerateThumbnail}
        isRegeneratingThumbnail={isRegeneratingThumbnail}
      />

      {/* Quality settings and export actions grid */}
      <div className="grid grid-cols-3 gap-6">
        <QualitySettings
          project={project}
          totalDuration={totalDuration}
          formatTime={formatTime}
        />
        <ExportActions
          project={project}
          thumbnailPreviewUrl={thumbnailPreviewUrl}
          thumbnailPreviewFailed={thumbnailPreviewFailed}
        />
      </div>

      {/* Segment Timeline */}
      <Timeline
        project={project}
        currentSegmentIndex={currentSegmentIndex}
        onJumpToTime={jumpToTime}
      />

      {confirmDialog}
    </div>
  );
}
