import type { VideoProject } from '../../types';
import { logger } from '../logger';
import { apiFetch } from '../../utils/apiClient';

export interface RenderResult {
  url: string;
  isServerRender: boolean;
}

/**
 * Releases GPU memory and cleans up resources allocated during rendering.
 *
 * - Sets canvas dimensions to 0×0 to release GPU-backed buffers.
 * - Revokes all tracked blob URLs created during image loading.
 * - Clears the module-level saturationCache map.
 * - Clears the capturedFrames array.
 *
 * Safe to call multiple times (idempotent).
 *
 * Requirements: 5.4, 5.5, 6.4, 6.5, 6.6
 */
export function cleanupRenderResources(
  canvas: HTMLCanvasElement | null,
  offscreen: HTMLCanvasElement | null,
  bgCacheCanvas: HTMLCanvasElement | null,
  recCanvas: HTMLCanvasElement | null,
  blobUrls: string[],
  capturedFrames: string[],
  saturationCache?: Map<string, number>,
): void {
  // Release GPU memory by zeroing canvas dimensions
  if (canvas) { canvas.width = 0; canvas.height = 0; }
  if (offscreen) { offscreen.width = 0; offscreen.height = 0; }
  if (bgCacheCanvas) { bgCacheCanvas.width = 0; bgCacheCanvas.height = 0; }
  if (recCanvas) { recCanvas.width = 0; recCanvas.height = 0; }

  // Revoke all tracked blob URLs to free memory
  for (const url of blobUrls) {
    try { URL.revokeObjectURL(url); } catch { /* ignore */ }
  }
  blobUrls.length = 0;

  // Clear the saturation score cache (Requirement 6.5)
  if (saturationCache) saturationCache.clear();

  // Clear captured frames to free data URL strings (Requirement 6.6)
  capturedFrames.length = 0;
}

export function getSupportedMimeType(format: 'webm' | 'mp4' = 'webm'): string {
  const candidates = format === 'mp4'
    ? ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4']
    : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];

  for (const t of candidates) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return 'video/webm';
}

/**
 * Attempts a full server-side render via the /api/server-render SSE endpoint.
 * The server spawns server-render.mjs which uses node-canvas + edge-tts + ffmpeg
 * to produce a final MP4 with narration — no browser MediaRecorder needed.
 *
 * Returns the video Blob on success, or null if the server endpoint is unavailable.
 */
export async function tryServerRender(
  project: VideoProject,
  onProgress?: (pct: number, message: string) => void,
  signal?: AbortSignal,
): Promise<Blob | RenderResult | null> {
  let serverTimeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    // Ensure the project is saved for the server-side renderer to read (10s timeout)
    const saveTimeout = new AbortController();
    const saveTimer = setTimeout(() => saveTimeout.abort(), 10_000);
    const saveSignal = signal ? AbortSignal.any([signal, saveTimeout.signal]) : saveTimeout.signal;
    const saveRes = await apiFetch(
      `/api/save-project?id=${encodeURIComponent(project.id)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(project),
        signal: saveSignal,
      },
    );
    clearTimeout(saveTimer);
    if (!saveRes.ok) {
      logger.error('Renderer', `Failed to save project for server render: ${saveRes.status}`);
      return null;
    }

    const saveData = (await saveRes.json()) as { path?: string };
    const projectPath = saveData.path;
    if (!projectPath) {
      logger.error('Renderer', 'Save-project response missing path');
      return null;
    }

    // Timeout server-render after 10 min (high-quality 8-min videos need headroom)
    const serverTimeout = new AbortController();
    serverTimeoutId = setTimeout(() => serverTimeout.abort(), 600_000);
    if (signal) {
      signal.addEventListener('abort', () => serverTimeout.abort(), { once: true });
    }
    const combinedSignal = serverTimeout.signal;

    // Start the server-side render via SSE — send project data in request body
    const res = await apiFetch('/api/server-render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectPath }),
      signal: combinedSignal,
    });
    if (!res.ok || !res.body) {
      clearTimeout(serverTimeoutId);
      logger.warn('Renderer', `Server render endpoint returned ${res.status}`);
      return null;
    }

    // Read SSE stream for progress updates
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let filePath: string | null = null;

    while (true) {
      if (signal?.aborted) { clearTimeout(serverTimeoutId); throw new Error('Cancelled'); }
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const event = JSON.parse(line.slice(6));
          if (event.type === 'heartbeat') continue; // Keep-alive, ignore
          if (event.type === 'progress') {
            onProgress?.(Math.min(event.pct ?? 0, 99), event.message || 'Server rendering...');
          } else if (event.type === 'complete') {
            filePath = event.filePath;
            onProgress?.(100, 'Server render complete!');
          } else if (event.type === 'error') {
            logger.error('Renderer', `Server render error: ${event.message}`);
            return null;
          }
        } catch {
          // Ignore malformed SSE lines
        }
      }
    }

    if (!filePath) {
      logger.warn('Renderer', 'Server render completed but no file path received');
      return null;
    }

    const streamUrl =
      filePath.startsWith('http') || filePath.startsWith('/api/')
        ? filePath
        : filePath.startsWith('/')
          ? filePath
          : `/api/render-output/mp4/${filePath.replace(/^\/+/, '')}`;

    logger.success('Renderer', `Server render complete — stream URL: ${streamUrl}`);
    return { url: streamUrl, isServerRender: true };
  } catch (err) {
    if ((err as Error).message === 'Cancelled' || ((err as Error).name === 'AbortError' && signal?.aborted)) {
      throw err; // Re-throw only user cancellation
    }
    clearTimeout(serverTimeoutId);
    logger.warn('Renderer', `Server render unavailable: ${(err as Error).message}`);
    return null;
  }
}
