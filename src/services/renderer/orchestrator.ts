import type { VideoProject, MediaAsset, KenBurnsParams, SegmentEditEntry, TransitionType } from '../../types';
import { logger } from '../logger';
import { getBackgroundMusicPath, computeBgMusicVolume, computeKenBurnsParams, computeCrossfadeAlpha, computeActiveAssetIndex, RESOLUTION_PRESETS, type ResolutionKey } from '../renderingShared';
import { getMusicPresetUrl } from '../audioMixer';
import { computeVisualStyle, getFrameSampleRate } from './animation';
import { draw, drawProceduralBackground, saturationCache } from './canvas/draw';
import { drawKineticTextOverlay, drawDiagramOverlay } from './canvas/overlays';
import { renderTransition, getTransitionConfigForSectionChange } from './canvas/transitions';
import { planSegmentShots, alternateFraming, planPatternInterrupts, shouldInsertContrastingTransition, DEFAULT_EDITING_RHYTHM_CONFIG } from './editingRhythm';
import type { ShotPlan, TextCardEntry } from './editingRhythm';
import { preload } from './preload';
import { cleanupRenderResources, getSupportedMimeType, tryServerRender } from './encoding';
import type { RenderResult } from './encoding';

export interface RenderOptions {
  width?: number;
  height?: number;
  quality?: 'draft' | 'standard' | 'high';
  format?: 'webm' | 'mp4';
  watermark?: { text: string; position: 'top-right' | 'bottom-right' | 'bottom-left' };
  backgroundMusic?: { url: string; volume?: number };
  onProgress?: (pct: number, message: string) => void;
  signal?: AbortSignal;
}

export const QUALITY_PRESETS = {
  draft:    { width: 854,  height: 480,  fps: 24, videoBitsPerSecond: 4_000_000  }, // Increased from 2.5M to 4M for usable quality
  standard: { width: 1920, height: 1080, fps: 24, videoBitsPerSecond: 12_000_000 },
  high:     { width: 1920, height: 1080, fps: 24, videoBitsPerSecond: 16_000_000 },
};

export interface ImgCache { [k: string]: HTMLImageElement; }
export type RenderableImage = HTMLImageElement & { safeForCanvas?: boolean; naturalW?: number; naturalH?: number };

// Maximum number of images to keep in the preload cache at once.
export const IMG_CACHE_MAX = 60;

// Maximum number of frames the renderer will capture to prevent OOM.
export const MAX_FRAMES = 2000;

export async function renderVideoToBlob(
  project: VideoProject,
  options: RenderOptions = {},
): Promise<Blob | RenderResult> {
  const quality = options.quality || 'standard';
  const requestedFormat = options.format || 'webm';

  // Resolution presets: use project.exportSettings.resolution if set, default to 1080p
  const resolutionKey: ResolutionKey = project.exportSettings?.resolution || '1080p';
  const resPreset = RESOLUTION_PRESETS[resolutionKey];

  let width = options.width || resPreset.width;
  let height = options.height || resPreset.height;
  let fps = resPreset.fps;
  let videoBitsPerSecond = resPreset.videoBitsPerSecond;
  const frameSampleRate = getFrameSampleRate(quality);
  const onProgress = options.onProgress;
  const signal = options.signal;
  
  logger.info('Renderer', `Start: ${width}x${height} @ ${fps}fps (${quality}, ${requestedFormat})`);

  let lastProgress = 0;
  let lastProgressMsg = '';
  const reportProgress = (pct: number, msg: string) => {
    lastProgress = pct;
    lastProgressMsg = msg;
    onProgress?.(pct, msg);
  };

  // ── Try full server-side render first ──
  logger.info('Renderer', 'Attempting server-side render via /api/server-render...');
  reportProgress(0, 'Trying server-side render...');
  reportProgress(1, 'Connecting to render server...');
  let serverRenderFailed = false;
  try {
    const serverResult = await tryServerRender(project, onProgress, signal);
    if (serverResult && serverResult.size > 0) {
      logger.success('Renderer', 'Server-side render succeeded, skipping browser render');
      return serverResult;
    }
    serverRenderFailed = true;
  } catch (err) {
    if ((err as Error).message === 'Cancelled' || (err as Error).name === 'AbortError') {
      throw err;
    }
    logger.warn('Renderer', `Server render failed, falling back to browser render: ${(err as Error).message}`);
    serverRenderFailed = true;
  }

  if (serverRenderFailed) {
    reportProgress(2, 'Server unavailable, preparing browser render...');
  }

  // ── Fallback: browser-side frame capture + ffmpeg/MediaRecorder ──
  logger.info('Renderer', 'Falling back to browser-side rendering...');
  reportProgress(3, 'Rendering in browser...');

  let canvas: HTMLCanvasElement | null = null;
  let offscreen: HTMLCanvasElement | null = null;
  let bgCacheCanvas: HTMLCanvasElement | null = null;
  let recCanvas: HTMLCanvasElement | null = null;
  const blobUrls: string[] = [];
  const capturedFrames: string[] = [];
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;

  try {

  canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  let ctx = canvas.getContext('2d');
  if (!ctx && resolutionKey === '4K') {
    logger.warn('Renderer', '4K canvas allocation failed — falling back to 1080p');
    const fallback = RESOLUTION_PRESETS['1080p'];
    width = fallback.width;
    height = fallback.height;
    fps = fallback.fps;
    videoBitsPerSecond = fallback.videoBitsPerSecond;
    canvas.width = width;
    canvas.height = height;
    ctx = canvas.getContext('2d');
  }
  if (!ctx) {
    logger.error('Renderer', 'Could not get 2D context');
    throw new Error('Canvas 2D context unavailable — browser may have run out of GPU memory or canvas is not supported');
  }

  offscreen = document.createElement('canvas');
  offscreen.width = width;
  offscreen.height = height;
  const offCtx = offscreen.getContext('2d');
  if (!offCtx) throw new Error('Offscreen canvas 2D context unavailable');

  bgCacheCanvas = document.createElement('canvas');
  bgCacheCanvas.width = width;
  bgCacheCanvas.height = height;
  const bgCacheCtx = bgCacheCanvas.getContext('2d');

  reportProgress(1, 'Preloading images...');

  const cache: ImgCache = {};
  await preload(project, cache, blobUrls, signal, onProgress);
  if (signal?.aborted) throw new Error('Cancelled');
  logger.info('Renderer', `Preloaded ${Object.keys(cache).length} images`);

  const totalSec = project.script.reduce((s, seg) => s + seg.duration, 0);
  logger.info('Renderer', `Total duration: ${totalSec}s, ${project.script.length} segments`);

  // --- Pattern Interrupt Planning (Requirement 5.4) ---
  const patternInterrupts: TextCardEntry[] = planPatternInterrupts(totalSec, project.script);
  if (patternInterrupts.length > 0) {
    logger.info('Renderer', `Planned ${patternInterrupts.length} pattern interrupts`);
  }

  // --- Contrasting Transition Planning (Requirement 5.5) ---
  // Pre-compute which segment boundaries need contrasting transitions
  const contrastingTransitionIndices = new Set<number>();
  if (project.visualPlans) {
    for (let i = 1; i < project.script.length; i++) {
      const prevPlan = project.visualPlans[project.script[i - 1].id];
      const currPlan = project.visualPlans[project.script[i].id];
      if (prevPlan && currPlan && shouldInsertContrastingTransition(prevPlan.beat, currPlan.beat)) {
        contrastingTransitionIndices.add(i);
      }
    }
    if (contrastingTransitionIndices.size > 0) {
      logger.info('Renderer', `Contrasting transitions needed at ${contrastingTransitionIndices.size} segment boundaries`);
    }
  }

  const frameInterval = Math.max(1, Math.round(fps / frameSampleRate));
  const MAX_CAPTURED_FRAMES = MAX_FRAMES;
  const RENDER_DEADLINE = Date.now() + 12 * 60 * 1000;
  const isRenderingFlag = true;

  heartbeatTimer = setInterval(() => {
    reportProgress(lastProgress, lastProgressMsg);
  }, 2000);

  let elapsed = 0;
  let prevSegmentMedia: MediaAsset[] = [];
  for (let i = 0; i < project.script.length; i++) {
    if (signal?.aborted) throw new Error('Cancelled');
    const seg = project.script[i];
    const segMedia = project.media.filter(a => a.segmentId === seg.id);
    const segStart = elapsed / totalSec;

    const editEntry: SegmentEditEntry | undefined = project.editPlan?.segments.find(
      e => e.segmentId === seg.id
    );

    logger.info('Renderer', `Rendering segment ${i + 1}/${project.script.length}: "${seg.title}" (${seg.duration}s, ${segMedia.length} media)`);

    // --- Editing Rhythm: plan shots for this segment (Requirements 10.1, 10.2, 8.1, 8.3) ---
    // Pass elapsed time as segmentStartTime so opening pacing (3s max hold) applies correctly,
    // and narration-to-cut sync aligns visual cuts at sentence boundaries when narration is available.
    const shotPlan: ShotPlan[] = planSegmentShots(seg, segMedia, DEFAULT_EDITING_RHYTHM_CONFIG, elapsed);
    const segFraming = alternateFraming(i);
    logger.info('Renderer', `Shot plan: ${shotPlan.length} shots, framing: ${segFraming}`);

    // --- Section-aware transitions (Requirements 6.1, 6.2) ---
    const prevSeg = i > 0 ? project.script[i - 1] : undefined;
    const sectionTransitionConfig = prevSeg && prevSeg.type !== seg.type
      ? getTransitionConfigForSectionChange(prevSeg.type, seg.type)
      : undefined;

    const totalFrames = Math.max(1, Math.round(seg.duration * fps));
    const mc = Math.max(1, segMedia.length);
    const per = Math.max(1, Math.floor(totalFrames / mc));

    // Use contrasting transition (wipe) when consecutive segments share the same beat (Requirement 5.5)
    const needsContrastingTransition = contrastingTransitionIndices.has(i);
    const transitionType: TransitionType = needsContrastingTransition
      ? 'wipe'
      : (editEntry?.transition?.type ?? 'crossfade');
    const transitionDurationMs: number = sectionTransitionConfig?.durationMs ?? editEntry?.transition?.durationMs ?? 500;
    const transitionFrames = editEntry?.transition || sectionTransitionConfig
      ? Math.min(Math.round(transitionDurationMs / 1000 * fps), Math.floor(totalFrames * 0.3))
      : Math.min(15, Math.floor(totalFrames * 0.15));

    for (let f = 0; f < totalFrames; f++) {
      if (signal?.aborted) throw new Error('Cancelled');
      if (Date.now() > RENDER_DEADLINE) {
        logger.warn('Renderer', 'Render timeout reached (5 min) — stopping early');
        break;
      }

      if (f === 0 && bgCacheCtx) {
        drawProceduralBackground(bgCacheCtx, width, height, seg, 0, true);
      }

      const frameTimeSec_asset = f / fps;
      // Use shot plan to determine active asset index (Requirements 10.1, 10.2)
      let mi: number;
      if (shotPlan.length > 0) {
        // Find the shot that covers this frame time
        const activeShotIdx = shotPlan.findIndex(
          shot => frameTimeSec_asset >= shot.startTime && frameTimeSec_asset < shot.endTime
        );
        const activeShot = activeShotIdx >= 0 ? shotPlan[activeShotIdx] : shotPlan[shotPlan.length - 1];
        mi = Math.min(activeShot.assetIndex, segMedia.length - 1);
      } else if (segMedia.length > 1) {
        mi = computeActiveAssetIndex(frameTimeSec_asset, segMedia.length, 4);
      } else {
        mi = Math.min(Math.floor(f / per), mc - 1);
      }
      const currentAsset = segMedia[mi];

      const editPlanKenBurns: KenBurnsParams | undefined = currentAsset && editEntry
        ? editEntry.kenBurns[currentAsset.id]
        : undefined;
      const currentKenBurns: KenBurnsParams | undefined = editPlanKenBurns
        ?? (currentAsset ? computeKenBurnsParams(i, currentAsset.id) : undefined);

      const bgCache = bgCacheCtx ? bgCacheCanvas : null;

      if (prevSegmentMedia.length > 0 && f < transitionFrames) {
        const fadeProgress = computeCrossfadeAlpha(f, transitionFrames);
        const prevAsset = prevSegmentMedia[0];
        const prevEditEntry: SegmentEditEntry | undefined = i > 0
          ? project.editPlan?.segments.find(e => e.segmentId === project.script[i - 1].id)
          : undefined;
        const editPlanPrevKB: KenBurnsParams | undefined = prevAsset && prevEditEntry
          ? prevEditEntry.kenBurns[prevAsset.id]
          : undefined;
        const prevKenBurns: KenBurnsParams | undefined = editPlanPrevKB
          ?? (prevAsset ? computeKenBurnsParams(i - 1, prevAsset.id) : undefined);

        renderTransition(offCtx, offscreen, seg, prevAsset, currentAsset, cache, fadeProgress,
          transitionType, options.watermark, isRenderingFlag, bgCache, prevKenBurns, currentKenBurns);
      } else {
        draw(offCtx, offscreen, seg, currentAsset, cache, f / totalFrames, options.watermark, true, bgCache, currentKenBurns);
      }

      // Requirement 10.6: Apply visual pattern break overlays
      const frameTimeSec = f / fps;
      const segmentDurationSec = seg.duration;
      const visualStyle = computeVisualStyle(frameTimeSec, segmentDurationSec, seg.type);
      const ROTATION_INTERVAL = 7;
      const styleProgress = (frameTimeSec % ROTATION_INTERVAL) / ROTATION_INTERVAL;

      if (visualStyle === 'kinetic-text') {
        drawKineticTextOverlay(offCtx, width, height, seg.title, styleProgress);
      } else if (visualStyle === 'diagram') {
        drawDiagramOverlay(offCtx, width, height, seg.title, styleProgress);
      }

      // Requirement 5.4: Render pattern interrupt text cards when active
      for (const interrupt of patternInterrupts) {
        if (interrupt.segmentIndex === i &&
            frameTimeSec >= interrupt.startTime &&
            frameTimeSec < interrupt.startTime + interrupt.durationSec &&
            interrupt.text.length > 0) {
          const cardProgress = (frameTimeSec - interrupt.startTime) / interrupt.durationSec;
          drawKineticTextOverlay(offCtx, width, height, interrupt.text, cardProgress);
          break; // Only render one pattern interrupt at a time
        }
      }

      // Copy offscreen → capture canvas
      ctx.drawImage(offscreen, 0, 0);

      if (f % frameInterval === 0 && capturedFrames.length < MAX_CAPTURED_FRAMES) {
        capturedFrames.push(canvas.toDataURL('image/jpeg', 0.92)); // JPEG 92% quality = 5x faster than PNG
      }

      const segMsg = `Rendering segment ${i + 1}/${project.script.length}: ${seg.title}`;
      if (f === 0) {
        const overall = segStart;
        reportProgress(Math.min(Math.round(overall * 100), 99), segMsg);
      }
      if (f % Math.max(1, Math.floor(totalFrames / 10)) === 0) {
        const overall = segStart + (f / totalFrames * seg.duration / totalSec);
        reportProgress(Math.min(Math.round(overall * 100), 99), segMsg);
      }

      if (f % 60 === 0 || f === totalFrames - 1) await new Promise<void>(r => setTimeout(r, 0));
    }

    prevSegmentMedia = segMedia;
    elapsed += seg.duration;

    if (Date.now() > RENDER_DEADLINE) {
      logger.warn('Renderer', 'Render timeout — skipping remaining segments');
      break;
    }
  }

  reportProgress(95, 'Assembling video with ffmpeg...');
  logger.info('Renderer', `Captured ${capturedFrames.length} frames, sending to ffmpeg...`);

  // Try server-side ffmpeg assembly first (dev mode)
  try {
    const blobParts = capturedFrames.map(f => f + '\n');
    const bodyBlob = new Blob(blobParts, { type: 'text/plain' });
    const res = await fetch(`/api/render-video?fps=${frameSampleRate}&format=${requestedFormat}`, {
      method: 'POST',
      body: bodyBlob,
    });
    if (res.ok) {
      const videoBlob = await res.blob();
      reportProgress(100, 'Done!');
      logger.success('Renderer', `Done (ffmpeg): ${(videoBlob.size / 1024 / 1024).toFixed(2)}MB`);
      return videoBlob;
    }
  } catch {
    logger.warn('Renderer', 'ffmpeg endpoint unavailable, falling back to MediaRecorder');
  }

  // Fallback: use MediaRecorder on a fresh untainted canvas
  recCanvas = document.createElement('canvas');
  recCanvas.width = width;
  recCanvas.height = height;
  const recCtx = recCanvas.getContext('2d')!;
  const mimeType = getSupportedMimeType(requestedFormat);
  const stream = recCanvas.captureStream(frameSampleRate);

  // ── Audio mixing via Web Audio API (narration + background music) ──
  let bgAudioCtx: AudioContext | null = null;
  let bgSourceNode: AudioBufferSourceNode | null = null;
  let bgGainNode: GainNode | null = null; // Store gain node for fade-out
  const narrationSourceNodes: AudioBufferSourceNode[] = [];
  try {
    bgAudioCtx = new AudioContext();
    const audioDest = bgAudioCtx.createMediaStreamDestination();

    // ── Narration audio: schedule each clip at its segment start time ──
    const readyClips = project.narration.filter(n => n.status === 'ready' && n.audioUrl);
    if (readyClips.length > 0) {
      let cumulativeTime = 0;
      for (const seg of project.script) {
        const clip = readyClips.find(c => c.segmentId === seg.id);
        if (clip && clip.audioUrl) {
          try {
            const narrationRes = await fetch(clip.audioUrl);
            if (narrationRes.ok) {
              const narrationBuffer = await bgAudioCtx.decodeAudioData(await narrationRes.arrayBuffer());
              const narrationSource = bgAudioCtx.createBufferSource();
              narrationSource.buffer = narrationBuffer;
              narrationSource.connect(audioDest);
              narrationSource.start(cumulativeTime);
              narrationSourceNodes.push(narrationSource);
            }
          } catch (narErr) {
            logger.warn('Renderer', `Failed to load narration for segment ${seg.id}: ${(narErr as Error).message}`);
          }
        }
        cumulativeTime += seg.duration;
      }
      logger.info('Renderer', `Scheduled ${narrationSourceNodes.length} narration clips`);
    }

    // ── Background music ──
    const musicEnabled = project.exportSettings?.backgroundMusic !== false;
    const musicPresetId = project.exportSettings?.musicPreset;
    const musicPath = musicEnabled
      ? (musicPresetId ? getMusicPresetUrl(musicPresetId) : getBackgroundMusicPath(project.style))
      : null;
    if (musicPath) {
      const musicRes = await fetch(musicPath);
      if (musicRes.ok) {
        const arrayBuffer = await musicRes.arrayBuffer();
        const audioBuffer = await bgAudioCtx.decodeAudioData(arrayBuffer);

        const hasNarration = readyClips.length > 0;
        const bgVolume = computeBgMusicVolume(hasNarration);

        const gainNode = bgAudioCtx.createGain();
        bgGainNode = gainNode; // Store reference for fade-out
        gainNode.gain.value = bgVolume;

        bgSourceNode = bgAudioCtx.createBufferSource();
        bgSourceNode.buffer = audioBuffer;
        bgSourceNode.loop = true;
        bgSourceNode.connect(gainNode);
        gainNode.connect(audioDest);

        bgSourceNode.start();
        logger.info('Renderer', `Background music loaded: ${musicPath} (volume: ${bgVolume})`);
      } else {
        logger.warn('Renderer', `Background music file not found: ${musicPath} (${musicRes.status})`);
      }
    }

    // Add the combined audio destination to the stream
    for (const track of audioDest.stream.getAudioTracks()) {
      stream.addTrack(track);
    }
  } catch (bgErr) {
    logger.warn('Renderer', `Audio setup failed, continuing without: ${(bgErr as Error).message}`);
  }

  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond });
  const chunks: Blob[] = [];
  recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
  const done = new Promise<void>(resolve => { recorder.onstop = () => setTimeout(resolve, 250); });
  recorder.start(1000);

  const frameDurationMs = Math.max(1, Math.round(1000 / frameSampleRate));
  for (const dataUrl of capturedFrames) {
    await new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.onload = () => { recCtx.drawImage(img, 0, 0); resolve(); };
      img.onerror = reject;
      img.src = dataUrl;
    });
    await new Promise<void>(r => setTimeout(r, frameDurationMs));
  }

  // Fade out background music before stopping (prevent abrupt cut)
  if (bgGainNode && bgAudioCtx) {
    try {
      bgGainNode.gain.setTargetAtTime(0, bgAudioCtx.currentTime, 0.5);
      await new Promise<void>(r => setTimeout(r, 1500));
    } catch { /* ignore fade errors */ }
  }
  if (bgSourceNode) {
    try { bgSourceNode.stop(); } catch { /* already stopped */ }
  }
  for (const node of narrationSourceNodes) {
    try { node.stop(); } catch { /* already stopped */ }
  }

  recorder.stop();
  await done;

  if (bgAudioCtx) {
    try { await bgAudioCtx.close(); } catch { /* ignore */ }
  }

  const videoBlob = new Blob(chunks, { type: mimeType });
  reportProgress(100, 'Done!');
  logger.success('Renderer', `Done (MediaRecorder fallback): ${(videoBlob.size / 1024 / 1024).toFixed(2)}MB`);
  return videoBlob;

  } finally {
    if (heartbeatTimer !== undefined) clearInterval(heartbeatTimer);
    cleanupRenderResources(canvas, offscreen, bgCacheCanvas, recCanvas, blobUrls, capturedFrames, saturationCache);
  }
}
