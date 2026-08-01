import { useState } from 'react';
import { Download, Upload, FileText, AlertTriangle } from 'lucide-react';
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

function downloadProjectVideo(project: VideoProject) {
  if (!project?.thumbnail) return;
  const a = document.createElement('a');
  a.href = project.thumbnail;
  const format = project.exportSettings?.format || 'webm';
  a.download = project.exportSettings?.fileName || `${project.title.replace(/[^a-z0-9]/gi, '_')}.${format}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export default function ExportActions({
  project,
  thumbnailPreviewUrl,
  thumbnailPreviewFailed,
}: ExportActionsProps) {
  const exportBlock = getExportBlockStatus(project);
  const [overrideConfirmed, setOverrideConfirmed] = useState(false);
  const hardBlocked = exportBlock.blocked && !exportBlock.allowDownloadAnyway;
  const softBlocked = exportBlock.blocked && !!exportBlock.allowDownloadAnyway && !overrideConfirmed;

  return (
    <div className="space-y-3">
      {(exportBlock.warning || softBlocked) && (
        <div
          className="flex gap-3 border-2 border-amber-500/60 bg-amber-950/30 p-3 text-xs font-mono text-amber-200"
          data-testid="export-quality-warning"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <div className="space-y-2">
            <p>{exportBlock.warning ?? exportBlock.reason}</p>
            {softBlocked && (
              <button
                type="button"
                data-testid="download-anyway-button"
                onClick={() => setOverrideConfirmed(true)}
                className="border-2 border-amber-500 px-3 py-1.5 text-[10px] font-bold uppercase text-amber-200 hover:bg-amber-500 hover:text-black"
              >
                Download anyway
              </button>
            )}
          </div>
        </div>
      )}
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
          if (hardBlocked) {
            toast(exportBlock.reason ?? 'Export blocked by quality gate', 'error');
            return;
          }
          if (softBlocked) {
            toast(exportBlock.warning ?? exportBlock.reason ?? 'Confirm Download anyway first', 'warning');
            return;
          }
          if (exportBlock.warning && overrideConfirmed) {
            toast(exportBlock.warning, 'warning');
          }
          downloadProjectVideo(project);
        }}
        disabled={hardBlocked || softBlocked}
        className={`flex w-full items-center gap-3 border-2 px-4 py-3 text-sm font-medium ${
          hardBlocked || softBlocked
            ? 'cursor-not-allowed border-surface-800 bg-surface-950 text-surface-600'
            : 'border-surface-700 bg-surface-900 text-surface-300 transition-colors duration-200 hover:bg-brand-500 hover:text-black'
        }`}
        data-testid="download-video-button"
        title={hardBlocked || softBlocked ? (exportBlock.reason ?? exportBlock.warning) : undefined}
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
