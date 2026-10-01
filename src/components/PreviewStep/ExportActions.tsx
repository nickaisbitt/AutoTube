import { Download, Upload, FileText } from 'lucide-react';
import type { VideoProject } from '../../types';
import { generateSRTSubtitles, generateVTTSubtitles, downloadSubtitles } from '../../services/subtitles';
import { openYouTubeUpload, generateYouTubeMetadata } from '../../services/youtube';
import {
  generateThumbnail,
  generateSplitScreenThumbnail,
  downloadThumbnail,
  getBestThumbnailOverlay,
} from '../../services/thumbnail';
import { extractHookLine } from '../../services/seoTitles';
import { getExportBlockStatus } from '../../store/pipeline/orchestrator';
import { toast } from '../../hooks/useToast';

export interface ExportActionsProps {
  project: VideoProject;
  thumbnailPreviewUrl: string | null;
  thumbnailPreviewFailed: boolean;
}

export default function ExportActions({
  project,
  thumbnailPreviewUrl,
  thumbnailPreviewFailed,
}: ExportActionsProps) {
  const exportBlock = getExportBlockStatus(project);

  return (
    <div className="space-y-3">
      <button
        onClick={async () => {
          if (!project?.thumbnail) return;
          const sanitizedTitle = project.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
          const videoBlob = await fetch(project.thumbnail).then(r => r.blob());
          const metadata = generateYouTubeMetadata(project.title, project.topic, project.script, project);

          // Try to generate split-screen thumbnail for upload
          try {
            const hookLine = extractHookLine(project.script);
            const overlayText = getBestThumbnailOverlay(project, hookLine);
            const thumbBlob = await generateSplitScreenThumbnail(project, project.title, overlayText);
            const thumbFile = new File([thumbBlob], `${sanitizedTitle}_thumbnail.png`, { type: 'image/png' });
            openYouTubeUpload(videoBlob, { ...metadata, thumbnail: thumbFile });
          } catch {
            try {
              const thumbBlob = await generateThumbnail(project.title, project.topic);
              const thumbFile = new File([thumbBlob], `${sanitizedTitle}_thumbnail.png`, { type: 'image/png' });
              openYouTubeUpload(videoBlob, { ...metadata, thumbnail: thumbFile });
            } catch {
              // On total failure, upload without thumbnail
              openYouTubeUpload(videoBlob, metadata);
            }
          }
        }}
        className="flex w-full items-center gap-3 border-2 border-red-500 bg-red-900 px-4 py-3 text-sm font-bold uppercase text-red-400 hover:bg-red-500 hover:text-black"
        data-testid="upload-youtube-button"
      >
        <Upload className="h-5 w-5" />
        Upload to YouTube
      </button>
      <button
        onClick={() => {
          if (exportBlock.blocked) {
            toast(exportBlock.reason ?? 'Export blocked by quality gate', 'error');
            return;
          }
          if (!project?.thumbnail) return;
          const a = document.createElement('a');
          a.href = project.thumbnail;
          const format = project.exportSettings?.format || 'webm';
          a.download = project.exportSettings?.fileName || `${project.title.replace(/[^a-z0-9]/gi, '_')}.${format}`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }}
        disabled={exportBlock.blocked}
        className={`flex w-full items-center gap-3 border-2 px-4 py-3 text-sm font-medium ${
          exportBlock.blocked
            ? 'cursor-not-allowed border-surface-800 bg-surface-950 text-surface-600'
            : 'border-surface-700 bg-surface-900 text-surface-300 transition-colors duration-200 hover:bg-brand-500 hover:text-black'
        }`}
        data-testid="download-video-button"
        title={exportBlock.blocked ? exportBlock.reason : undefined}
      >
        <Download className="h-5 w-5" />
        Download Video
      </button>
      <button
        onClick={() => {
          if (!project) return;
          const srtContent = generateSRTSubtitles(project.script.map(s => ({ narration: s.narration, duration: s.duration })));
          downloadSubtitles(srtContent, `${project.title.replace(/[^a-z0-9]/gi, '_')}.srt`, 'srt');
        }}
        className="flex w-full items-center gap-3 border-2 border-surface-700 bg-surface-900 px-4 py-3 text-sm font-medium text-surface-300 transition-colors duration-200 hover:bg-brand-500 hover:text-black"
        data-testid="download-srt-button"
      >
        <FileText className="h-5 w-5" />
        Download Subtitles (SRT)
      </button>
      <button
        onClick={() => {
          if (!project) return;
          const vttContent = generateVTTSubtitles(project.script.map(s => ({ narration: s.narration, duration: s.duration })));
          downloadSubtitles(vttContent, `${project.title.replace(/[^a-z0-9]/gi, '_')}.vtt`, 'vtt');
        }}
        className="flex w-full items-center gap-3 border-2 border-surface-700 bg-surface-900 px-4 py-3 text-sm font-medium text-surface-300 transition-colors duration-200 hover:bg-brand-500 hover:text-black"
        data-testid="download-vtt-button"
      >
        <FileText className="h-5 w-5" />
        Download Subtitles (VTT)
      </button>
      {/* Thumbnail preview card */}
      {thumbnailPreviewUrl ? (
        <img
          src={thumbnailPreviewUrl}
          alt="Thumbnail preview"
          className="w-full rounded-lg"
          style={{ width: 160, height: 90, objectFit: 'cover' }}
        />
      ) : thumbnailPreviewUrl === null && thumbnailPreviewFailed ? (
        <div className="flex h-[90px] w-[160px] items-center justify-center border-2 border-surface-700 bg-surface-900 text-xs font-mono text-surface-500">
          Thumbnail preview unavailable
        </div>
      ) : null}
      <button
        onClick={async () => {
          if (!project) return;
          const sanitizedTitle = project.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
          let thumbBlob: Blob;
          try {
            const hookLine = extractHookLine(project.script);
            const overlayText = getBestThumbnailOverlay(project, hookLine);
            thumbBlob = await generateSplitScreenThumbnail(project, project.title, overlayText);
          } catch {
            thumbBlob = await generateThumbnail(project.title, project.topic);
          }
          downloadThumbnail(thumbBlob, `${sanitizedTitle}_thumbnail.png`);
        }}
        className="flex w-full items-center gap-3 border-2 border-surface-700 bg-surface-900 px-4 py-3 text-sm font-medium text-surface-300 transition-colors duration-200 hover:bg-brand-500 hover:text-black"
        data-testid="download-thumbnail-button"
      >
        <Download className="h-5 w-5" />
        Download Thumbnail
      </button>
    </div>
  );
}
