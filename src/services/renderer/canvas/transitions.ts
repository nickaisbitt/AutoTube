import type { ScriptSegment, MediaAsset, KenBurnsParams, TransitionType } from '../../../types';
import type { ImgCache, RenderOptions } from '../orchestrator';
import { draw } from './draw';
import { getSectionDesignTemplate } from '../../templates';
import { hasStatisticalContent } from '../../renderingShared';

// ---------------------------------------------------------------------------
// Section-Aware Transition Types
// Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
// ---------------------------------------------------------------------------

/**
 * Configuration for section-aware transitions derived from SECTION_DESIGN_TEMPLATES.
 */
export interface TransitionConfig {
  /** Transition type from SectionDesignTemplate.transitionOut (e.g., 'motif-swipe', 'gentle-dissolve', 'fade-out') */
  type: string;
  /** Duration of the transition in milliseconds */
  durationMs: number;
  /** Optional accent color used during the transition */
  accentColor?: string;
  /** Section type of the outgoing segment */
  fromSectionType?: string;
  /** Section type of the incoming segment */
  toSectionType?: string;
}

/**
 * Configuration for a Ken Burns effect applied to static images.
 * Requirements: 6.3
 */
export interface KenBurnsEffectConfig {
  /** Zoom start factor (1.0 = no zoom) */
  zoomStart: number;
  /** Zoom end factor */
  zoomEnd: number;
  /** Horizontal pan direction: -1 (left) to 1 (right) */
  panX: number;
  /** Vertical pan direction: -1 (up) to 1 (down) */
  panY: number;
}

/**
 * Configuration for an animated text card overlay.
 * Requirements: 6.4
 */
export interface TextCardConfig {
  /** The text/number to display */
  text: string;
  /** Display duration in seconds (2–3) */
  durationSec: number;
  /** Font size in pixels */
  fontSize: number;
  /** Accent color for the card */
  accentColor: string;
}

/**
 * Configuration for a section title card.
 * Requirements: 6.5
 */
export interface SectionTitleCardConfig {
  /** Title text to display */
  title: string;
  /** Section type for styling */
  sectionType: string;
  /** Display duration in milliseconds (1200 ±50) */
  durationMs: number;
}

/**
 * Renders a section-aware transition between two frames using the
 * SECTION_DESIGN_TEMPLATES transitionOut field.
 *
 * Supports transition types:
 * - 'motif-swipe': Horizontal swipe with accent color bar
 * - 'gentle-dissolve': Slow ease-in-out alpha blend
 * - 'fade-out': Fade to black then reveal incoming
 * - Falls back to crossfade for unknown types
 *
 * Requirements: 6.1, 6.2
 */
export function renderSectionTransition(
  ctx: CanvasRenderingContext2D,
  fromFrame: ImageData,
  toFrame: ImageData,
  progress: number,
  config: TransitionConfig,
): void {
  const w = fromFrame.width;
  const h = fromFrame.height;

  switch (config.type) {
    case 'motif-swipe': {
      // Horizontal swipe with accent color bar + light streak at the boundary
      const boundary = Math.round(progress * w);
      const barWidth = Math.max(6, Math.round(w * 0.025));

      // Draw outgoing frame first
      ctx.putImageData(fromFrame, 0, 0);

      // Flash frame at the cut point (quick white flash at 50% progress)
      if (progress > 0.45 && progress < 0.55) {
        const flashAlpha = 1 - Math.abs(progress - 0.5) * 20;
        ctx.save();
        ctx.fillStyle = `rgba(255,255,255,${Math.max(0, flashAlpha * 0.5)})`;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }

      // Clip and draw incoming frame from left
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, boundary, h);
      ctx.clip();
      ctx.putImageData(toFrame, 0, 0);
      ctx.restore();

      // Draw accent bar at boundary
      if (config.accentColor && boundary > 0 && boundary < w) {
        // Main accent bar
        ctx.fillStyle = config.accentColor;
        ctx.fillRect(Math.max(0, boundary - barWidth / 2), 0, barWidth, h);
        // Light streak — wider, semi-transparent glow around the bar
        const streakW = barWidth * 4;
        const streakGrad = ctx.createLinearGradient(boundary - streakW, 0, boundary + streakW, 0);
        streakGrad.addColorStop(0, 'rgba(255,255,255,0)');
        streakGrad.addColorStop(0.5, 'rgba(255,255,255,0.35)');
        streakGrad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = streakGrad;
        ctx.fillRect(boundary - streakW, 0, streakW * 2, h);
      }
      break;
    }

    case 'gentle-dissolve': {
      // Ease-in-out cubic alpha blend
      const easeProgress = progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      ctx.putImageData(fromFrame, 0, 0);
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = w;
      tempCanvas.height = h;
      const tempCtx = tempCanvas.getContext('2d');
      if (tempCtx) {
        tempCtx.putImageData(toFrame, 0, 0);
        ctx.save();
        ctx.globalAlpha = easeProgress;
        ctx.drawImage(tempCanvas, 0, 0);
        ctx.restore();
      }
      break;
    }

    case 'fade-out': {
      // Fade to black then reveal incoming
      if (progress < 0.5) {
        const fadeOut = progress * 2;
        ctx.putImageData(fromFrame, 0, 0);
        ctx.fillStyle = `rgba(0, 0, 0, ${fadeOut})`;
        ctx.fillRect(0, 0, w, h);
      } else {
        const fadeIn = (progress - 0.5) * 2;
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, w, h);
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = w;
        tempCanvas.height = h;
        const tempCtx = tempCanvas.getContext('2d');
        if (tempCtx) {
          tempCtx.putImageData(toFrame, 0, 0);
          ctx.save();
          ctx.globalAlpha = fadeIn;
          ctx.drawImage(tempCanvas, 0, 0);
          ctx.restore();
        }
      }
      break;
    }

    default: {
      // Fallback: ease-in-out crossfade (snappier than linear)
      const ease = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      ctx.putImageData(fromFrame, 0, 0);
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = w;
      tempCanvas.height = h;
      const tempCtx = tempCanvas.getContext('2d');
      if (tempCtx) {
        tempCtx.putImageData(toFrame, 0, 0);
        ctx.save();
        ctx.globalAlpha = ease;
        ctx.drawImage(tempCanvas, 0, 0);
        ctx.restore();
      }
      break;
    }
  }
}

/**
 * Applies a Ken Burns effect (slow zoom/pan) to a static image.
 * Returns the transform parameters for the given progress point.
 *
 * Requirements: 6.3
 */
export function applyKenBurnsEffect(
  progress: number,
  config?: KenBurnsEffectConfig,
): { zoom: number; offsetX: number; offsetY: number } {
  const defaults: KenBurnsEffectConfig = {
    zoomStart: 1.0,
    zoomEnd: 1.08,
    panX: 0.3,
    panY: -0.2,
  };
  const cfg = config ?? defaults;

  const zoom = cfg.zoomStart + progress * (cfg.zoomEnd - cfg.zoomStart);

  // Sinusoidal pan for smooth motion
  const panAmplitudeX = 12;
  const panAmplitudeY = 6;
  const offsetX = Math.sin(progress * Math.PI) * cfg.panX * panAmplitudeX;
  const offsetY = Math.cos(progress * Math.PI) * cfg.panY * panAmplitudeY;

  return { zoom, offsetX, offsetY };
}

/**
 * Renders an animated text card overlay for segments with statistical content.
 * The card displays a number/statistic prominently for 2–3 seconds.
 *
 * Requirements: 6.4
 *
 * @param ctx - Canvas rendering context
 * @param width - Canvas width
 * @param height - Canvas height
 * @param narration - Segment narration text
 * @param progress - Animation progress (0–1) within the text card duration
 * @param accentColor - Accent color for the card styling
 */
export function renderStatisticalTextCard(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  narration: string,
  progress: number,
  accentColor: string = '#e74c3c',
): void {
  // Extract the statistical value from narration
  const statMatch = narration.match(/(\$[\d,.]+|\d+%|\d{4}|\d+\s*(billion|million|trillion))/i);
  if (!statMatch) return;

  const statText = statMatch[1];

  // Animate: fade in (0–0.2), hold (0.2–0.8), fade out (0.8–1.0)
  let alpha = 1;
  if (progress < 0.2) {
    alpha = progress / 0.2;
  } else if (progress > 0.8) {
    alpha = (1 - progress) / 0.2;
  }

  // Scale animation: slight grow on entry
  const scale = progress < 0.2 ? 0.8 + (progress / 0.2) * 0.2 : 1.0;

  ctx.save();
  ctx.globalAlpha = alpha * 0.85;

  // Semi-transparent background card
  const cardW = Math.min(width * 0.6, 600);
  const cardH = 160;
  const cardX = (width - cardW) / 2;
  const cardY = (height - cardH) / 2;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardW, cardH, 12);
  ctx.fill();

  // Accent bar at top of card
  ctx.fillStyle = accentColor;
  ctx.fillRect(cardX, cardY, cardW, 4);

  // Statistical text
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${Math.round(64 * scale)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
  ctx.shadowBlur = 12;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(statText, width / 2, height / 2);

  ctx.restore();
}

/**
 * Renders a section title card when the section type changes between segments.
 * Displays for 1200ms (±50ms) with animation.
 *
 * Requirements: 6.5
 *
 * @param ctx - Canvas rendering context
 * @param width - Canvas width
 * @param height - Canvas height
 * @param config - Title card configuration
 * @param progress - Animation progress (0–1) within the title card duration
 */
export function renderSectionTitleCard(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  config: SectionTitleCardConfig,
  progress: number,
): void {
  const template = getSectionDesignTemplate(config.sectionType);

  // Animate: slide up + fade in (0–0.25), hold (0.25–0.75), fade out (0.75–1.0)
  let alpha = 1;
  let slideOffset = 0;
  if (progress < 0.25) {
    alpha = progress / 0.25;
    slideOffset = (1 - progress / 0.25) * 30;
  } else if (progress > 0.75) {
    alpha = (1 - progress) / 0.25;
  }

  ctx.save();
  ctx.globalAlpha = alpha;

  // Background overlay
  const cardW = Math.min(width * 0.7, 800);
  const cardH = 120;
  const cardX = (width - cardW) / 2;
  const cardY = (height - cardH) / 2 + slideOffset;

  ctx.fillStyle = template.colorBalance.primary + 'CC';
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardW, cardH, 8);
  ctx.fill();

  // Secondary accent border
  ctx.strokeStyle = template.colorBalance.secondary;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(cardX, cardY, cardW, cardH, 8);
  ctx.stroke();

  // Title text
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 42px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
  ctx.shadowBlur = 16;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(config.title, width / 2, cardY + cardH / 2);

  ctx.restore();
}

/**
 * Computes the minimum number of visual changes needed for a segment
 * to maintain ≥2 changes per 10-second window.
 *
 * Requirements: 6.6
 *
 * @param segmentDuration - Duration of the segment in seconds
 * @param assetCount - Number of available assets for the segment
 * @returns Minimum number of visual changes required
 */
export function computeVisualChangeCount(segmentDuration: number, _assetCount: number): number {
  if (segmentDuration <= 0) return 0;

  // Minimum 2 changes per 10-second window
  const minChangesPerWindow = 2;
  const windowSize = 10;

  // Calculate number of full 10-second windows (ceiling to cover partial windows)
  const windows = Math.ceil(segmentDuration / windowSize);

  // Total minimum changes needed
  const minChanges = windows * minChangesPerWindow;

  // Cannot exceed asset count - 1 (each change requires a different asset)
  // But we can reuse assets with different effects (zoom, pan, etc.)
  // So the minimum is at least minChanges regardless of asset count,
  // but we ensure at least 1 change if duration > 0
  return Math.max(1, minChanges);
}

/**
 * Determines the transition config for a section change based on
 * the outgoing segment's SECTION_DESIGN_TEMPLATES entry.
 *
 * Requirements: 6.1, 6.2
 *
 * @param fromSectionType - Section type of the outgoing segment
 * @param toSectionType - Section type of the incoming segment
 * @returns TransitionConfig derived from the template
 */
export function getTransitionConfigForSectionChange(
  fromSectionType: string,
  toSectionType: string,
): TransitionConfig {
  const template = getSectionDesignTemplate(fromSectionType);

  return {
    type: template.transitionOut,
    durationMs: 600,
    accentColor: template.colorBalance.primary,
    fromSectionType,
    toSectionType,
  };
}

/**
 * Randomly selects a transition type based on segment type and position.
 * 
 * - Intro segments: always use cold open / flash
 * - Section transitions: cross-dissolve (60%) or wipe (40%)
 * - Tension moments (outro/high pacing): flash cut
 * - Final segment: cross-dissolve to black
 * 
 * @param seg - Current segment
 * @param index - Segment index
 * @param totalSegments - Total number of segments
 * @returns TransitionType - The selected transition type
 */
export function selectTransitionForSegment(
  seg: ScriptSegment,
  index: number,
  totalSegments: number,
): TransitionType {
  // Intro segment: cold open flash
  if (seg.type === 'intro' || index === 0) {
    return 'flash';
  }
  
  // Final segment: cross-dissolve to black
  if (index === totalSegments - 1 || seg.type === 'outro') {
    return 'cross-dissolve';
  }
  
  // Tension moments: flash cut (high pacing or transition type)
  if (seg.type === 'transition' || (seg.pacingScore && seg.pacingScore >= 4)) {
    return 'flash';
  }
  
  // Section transitions: 60% cross-dissolve, 40% wipe
  if (seg.type === 'section') {
    return Math.random() < 0.6 ? 'cross-dissolve' : 'wipe';
  }
  
  // Default: cross-dissolve
  return 'cross-dissolve';
}

/**
 * Determines whether a segment should display a statistical text card.
 * Returns the recommended duration (2–3 seconds) or 0 if no card needed.
 *
 * Requirements: 6.4
 */
export function getStatisticalCardDuration(narration: string): number {
  if (!hasStatisticalContent(narration)) return 0;

  // Longer text gets slightly longer display (2–3 seconds)
  const wordCount = narration.split(/\s+/).length;
  if (wordCount > 30) return 3;
  if (wordCount > 15) return 2.5;
  return 2;
}

/**
 * Determines whether a section title card should be displayed between
 * two consecutive segments and returns the display duration.
 *
 * Requirements: 6.5
 *
 * @returns Duration in milliseconds (1200 ±50ms) or 0 if no title card needed
 */
export function getSectionTitleCardDuration(
  fromSectionType: string | undefined,
  toSectionType: string | undefined,
): number {
  if (!fromSectionType || !toSectionType) return 0;
  if (fromSectionType === toSectionType) return 0;

  // Display for 1200ms when section type changes
  return 1200;
}

/**
 * Renders a transition between an outgoing and incoming frame.
 *
 * Supports four transition types from the EditPlan:
 * - `crossfade`: Alpha blend between outgoing and incoming (existing behavior)
 * - `cut`: Instant switch — no blending
 * - `dissolve`: Gradual alpha blend with ease-in-out curve
 * - `wipe`: Horizontal left-to-right wipe
 *
 * Falls back to crossfade for unknown transition types.
 *
 * Requirements: 4.1, 4.2, 4.3, 6.1, 6.5
 */
export function renderTransition(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  seg: ScriptSegment,
  outgoingAsset: MediaAsset | undefined,
  incomingAsset: MediaAsset | undefined,
  cache: ImgCache,
  progress: number,
  transitionType: TransitionType,
  watermark?: RenderOptions['watermark'],
  isRendering?: boolean,
  bgCache?: HTMLCanvasElement | null,
  outgoingKenBurns?: KenBurnsParams,
  incomingKenBurns?: KenBurnsParams,
): void {
  const w = canvas.width;

  switch (transitionType) {
    case 'cut':
      // Instant switch with brief white flash (2 frames) at cut point for impact
      draw(ctx, canvas, seg, incomingAsset, cache, progress, watermark, isRendering, bgCache, incomingKenBurns);
      // 2-frame white flash at the cut point (progress 0.4-0.6 approximately)
      if (progress > 0.4 && progress < 0.6) {
        const flashIntensity = 1 - Math.abs(progress - 0.5) * 10;
        if (flashIntensity > 0) {
          ctx.save();
          ctx.fillStyle = `rgba(255,255,255,${flashIntensity * 0.8})`;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.restore();
        }
      }
      break;

    case 'dissolve': {
      // Dissolve: ease-in-out alpha curve for a smoother, more gradual blend
      const easeProgress = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      draw(ctx, canvas, seg, outgoingAsset, cache, 1, watermark, isRendering, bgCache, outgoingKenBurns);
      ctx.save();
      ctx.globalAlpha = easeProgress;
      draw(ctx, canvas, seg, incomingAsset, cache, progress, watermark, isRendering, bgCache, incomingKenBurns);
      ctx.restore();
      break;
    }

    case 'wipe': {
      // Horizontal wipe: left-to-right boundary sweep with soft 20px feather
      const boundary = Math.round(progress * w);
      const feather = 20;
      // Draw outgoing frame fully
      draw(ctx, canvas, seg, outgoingAsset, cache, 1, watermark, isRendering, bgCache, outgoingKenBurns);
      // Clip to the left portion (0 to boundary) and draw incoming frame over it
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, boundary, canvas.height);
      ctx.clip();
      draw(ctx, canvas, seg, incomingAsset, cache, progress, watermark, isRendering, bgCache, incomingKenBurns);
      ctx.restore();
      // Apply soft feathered edge at the split point
      if (boundary > 0 && boundary < w) {
        const featherGrad = ctx.createLinearGradient(
          Math.max(0, boundary - feather), 0,
          Math.min(w, boundary + feather), 0
        );
        featherGrad.addColorStop(0, 'rgba(0,0,0,0)');
        featherGrad.addColorStop(0.5, 'rgba(0,0,0,0.15)');
        featherGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = featherGrad;
        ctx.fillRect(Math.max(0, boundary - feather), 0, feather * 2, canvas.height);
      }
      break;
    }

    case 'crossfade':
    default: {
      // Crossfade: ease-in-out alpha blend (snappier than linear)
      const ease = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      draw(ctx, canvas, seg, outgoingAsset, cache, 1, watermark, isRendering, bgCache, outgoingKenBurns);
      ctx.save();
      ctx.globalAlpha = ease;
      draw(ctx, canvas, seg, incomingAsset, cache, progress, watermark, isRendering, bgCache, incomingKenBurns);
      ctx.restore();
      break;
    }

    case 'slide': {
      // Slide: incoming frame slides in from right, pushing outgoing to left
      const offset = progress * w;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, w, canvas.height);
      ctx.clip();
      // Draw outgoing moving left
      ctx.save();
      ctx.translate(-offset, 0);
      draw(ctx, canvas, seg, outgoingAsset, cache, 1, watermark, isRendering, bgCache, outgoingKenBurns);
      ctx.restore();
      // Draw incoming moving in from right
      ctx.save();
      ctx.translate(w - offset, 0);
      draw(ctx, canvas, seg, incomingAsset, cache, progress, watermark, isRendering, bgCache, incomingKenBurns);
      ctx.restore();
      ctx.restore();
      break;
    }

    case 'push': {
      // Push: incoming pushes outgoing off screen (similar to slide but with depth)
      const offset = progress * w;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, w, canvas.height);
      ctx.clip();
      // Outgoing slides left with slight scale down
      ctx.save();
      ctx.translate(-offset * 0.5, 0);
      ctx.scale(1 - progress * 0.1, 1 - progress * 0.1);
      draw(ctx, canvas, seg, outgoingAsset, cache, 1, watermark, isRendering, bgCache, outgoingKenBurns);
      ctx.restore();
      // Incoming pushes from right
      ctx.save();
      ctx.translate(w - offset, 0);
      draw(ctx, canvas, seg, incomingAsset, cache, progress, watermark, isRendering, bgCache, incomingKenBurns);
      ctx.restore();
      ctx.restore();
      break;
    }

    case 'zoom': {
      // Zoom: outgoing zooms out and fades, incoming zooms in from center
      const easeProgress = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      const outgoingScale = 1 + easeProgress * 0.5;
      const incomingScale = 2 - easeProgress;
      // Draw outgoing with zoom-out and fade
      ctx.save();
      ctx.globalAlpha = 1 - easeProgress * 0.7;
      ctx.translate(w / 2, canvas.height / 2);
      ctx.scale(outgoingScale, outgoingScale);
      ctx.translate(-w / 2, -canvas.height / 2);
      draw(ctx, canvas, seg, outgoingAsset, cache, 1, watermark, isRendering, bgCache, outgoingKenBurns);
      ctx.restore();
      // Draw incoming with zoom-in
      ctx.save();
      ctx.globalAlpha = easeProgress;
      ctx.translate(w / 2, canvas.height / 2);
      ctx.scale(incomingScale, incomingScale);
      ctx.translate(-w / 2, -canvas.height / 2);
      draw(ctx, canvas, seg, incomingAsset, cache, progress, watermark, isRendering, bgCache, incomingKenBurns);
      ctx.restore();
      break;
    }

    case 'flash': {
      // Flash: quick white flash between outgoing and incoming
      draw(ctx, canvas, seg, outgoingAsset, cache, 1, watermark, isRendering, bgCache, outgoingKenBurns);
      // White flash overlay peaking at 50%
      const flashIntensity = Math.sin(progress * Math.PI) * 0.8;
      if (flashIntensity > 0.01) {
        ctx.save();
        ctx.fillStyle = `rgba(255,255,255,${flashIntensity})`;
        ctx.fillRect(0, 0, w, canvas.height);
        ctx.restore();
      }
      if (progress > 0.3) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, (progress - 0.3) / 0.7);
        draw(ctx, canvas, seg, incomingAsset, cache, progress, watermark, isRendering, bgCache, incomingKenBurns);
        ctx.restore();
      }
      break;
    }

    case 'glitch': {
      // Glitch: RGB split + horizontal displacement effect
      const ease = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      const glitchAmount = Math.sin(progress * Math.PI * 4) * ease * 15;
      // Draw outgoing with slight RGB offset
      draw(ctx, canvas, seg, outgoingAsset, cache, 1, watermark, isRendering, bgCache, outgoingKenBurns);
      if (progress > 0.2 && progress < 0.8) {
        // Red channel offset
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = ease * 0.5;
        ctx.translate(glitchAmount, 0);
        draw(ctx, canvas, seg, incomingAsset, cache, progress, watermark, isRendering, bgCache, incomingKenBurns);
        ctx.restore();
        // Blue channel offset
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = ease * 0.5;
        ctx.translate(-glitchAmount, 0);
        draw(ctx, canvas, seg, incomingAsset, cache, progress, watermark, isRendering, bgCache, incomingKenBurns);
        ctx.restore();
      }
      if (progress > 0.5) {
        ctx.save();
        ctx.globalAlpha = (progress - 0.5) * 2;
        draw(ctx, canvas, seg, incomingAsset, cache, progress, watermark, isRendering, bgCache, incomingKenBurns);
        ctx.restore();
      }
      break;
    }

    case 'spin': {
      // Spin: outgoing spins out clockwise, incoming spins in
      const ease = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      const rotation = ease * Math.PI * 0.5;
      draw(ctx, canvas, seg, outgoingAsset, cache, 1, watermark, isRendering, bgCache, outgoingKenBurns);
      ctx.save();
      ctx.globalAlpha = 1 - ease * 0.8;
      ctx.translate(w / 2, canvas.height / 2);
      ctx.rotate(rotation);
      ctx.translate(-w / 2, -canvas.height / 2);
      draw(ctx, canvas, seg, outgoingAsset, cache, 1, watermark, isRendering, bgCache, outgoingKenBurns);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = ease;
      ctx.translate(w / 2, canvas.height / 2);
      ctx.rotate(-rotation);
      ctx.translate(-w / 2, -canvas.height / 2);
      draw(ctx, canvas, seg, incomingAsset, cache, progress, watermark, isRendering, bgCache, incomingKenBurns);
      ctx.restore();
      break;
    }

    case 'cross-dissolve': {
      // Professional cross-dissolve: smooth fade with 1.02x zoom for dynamism
      const easeProgress = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      
      // Draw outgoing frame with slight zoom out (1.02x)
      const zoomScale = 1.02;
      const centerX = w / 2;
      const centerY = canvas.height / 2;
      
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.scale(zoomScale - easeProgress * 0.02, zoomScale - easeProgress * 0.02);
      ctx.translate(-centerX, -centerY);
      draw(ctx, canvas, seg, outgoingAsset, cache, 1, watermark, isRendering, bgCache, outgoingKenBurns);
      ctx.restore();
      
      // Draw incoming frame with alpha blend
      ctx.save();
      ctx.globalAlpha = easeProgress;
      draw(ctx, canvas, seg, incomingAsset, cache, progress, watermark, isRendering, bgCache, incomingKenBurns);
      ctx.restore();
      break;
    }
  }
}
