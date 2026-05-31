/**
 * Shared Rendering Logic — Environment-Agnostic Drawing Helpers
 *
 * This module contains drawing logic used by both the browser renderer
 * (src/services/videoRenderer.ts) and the server renderer (server-render/).
 * All functions accept a generic RenderContext2D interface that is compatible
 * with both browser CanvasRenderingContext2D and node-canvas's Context2d.
 */

import type { VideoProject, SegmentPurposeTag, SceneLayoutType, AudioDirection, ScriptSegment } from '../types';

// ---------------------------------------------------------------------------
// Generic 2D rendering context interface
// ---------------------------------------------------------------------------

/**
 * Subset of CanvasRenderingContext2D used by both renderers.
 * Compatible with browser Canvas and node-canvas.
 */
export interface RenderContext2D {
  fillStyle: string | CanvasGradient | CanvasPattern;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  globalAlpha: number;
  filter: string;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;

  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number, maxWidth?: number): void;
  measureText(text: string): TextMetrics;
  beginPath(): void;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  fill(): void;
  stroke(): void;
  rect(x: number, y: number, w: number, h: number): void;
  clip(): void;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  scale(sx: number, sy: number): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  drawImage(image: any, dx: number, dy: number, dw?: number, dh?: number): void;
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): CanvasGradient;
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): CanvasGradient;
  arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void;
}

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------

/** Segment-type → accent colour mapping used across both renderers. */
export const ACCENT_COLORS: Record<string, string> = {
  intro: '#60a5fa',
  section: '#3b82f6',
  transition: '#8b5cf6',
  outro: '#60a5fa',
};

/**
 * Convert a hex colour string to an rgba() CSS string.
 * Supports 3-char (#abc) and 6-char (#aabbcc) hex formats.
 */
export function hexToRgba(hex: string, alpha: number): string {
  let r = 0, g = 0, b = 0;
  const h = hex.replace('#', '');
  if (h.length === 3) {
    r = parseInt(h[0] + h[0], 16);
    g = parseInt(h[1] + h[1], 16);
    b = parseInt(h[2] + h[2], 16);
  } else if (h.length >= 6) {
    r = parseInt(h.substring(0, 2), 16);
    g = parseInt(h.substring(2, 4), 16);
    b = parseInt(h.substring(4, 6), 16);
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ---------------------------------------------------------------------------
// Ken Burns transform
// ---------------------------------------------------------------------------

export interface KenBurnsResult {
  zoom: number;
  panX: number;
  panY: number;
  scale: number;
  dw: number;
  dh: number;
}

/**
 * Compute Ken Burns zoom, pan, and scale values for a given progress point.
 *
 * @param progress       Frame progress within the segment [0, 1].
 * @param imgW           Source image width.
 * @param imgH           Source image height.
 * @param canvasW        Canvas width.
 * @param canvasH        Canvas height.
 * @param kenBurns       Optional per-asset Ken Burns params from the edit plan.
 * @param assetSeed      Numeric seed derived from the asset URL for variety.
 * @returns              Computed transform values.
 */
export function computeKenBurnsTransform(
  progress: number,
  imgW: number,
  imgH: number,
  canvasW: number,
  canvasH: number,
  kenBurns?: { zoomStart: number; zoomEnd: number; panDirectionX: number; panDirectionY: number },
  assetSeed = 0,
): KenBurnsResult {
  const scale = Math.max(canvasW / imgW, canvasH / imgH) * 1.4;
  const dw = imgW * scale;
  const dh = imgH * scale;

  const kbZoomStart = kenBurns?.zoomStart ?? 1.0;
  const kbZoomEnd = (kenBurns?.zoomEnd ?? 1.06) - kbZoomStart;
  const kbPanDirX = kenBurns?.panDirectionX ?? 1.0;
  const kbPanDirY = kenBurns?.panDirectionY ?? 1.0;

  const zoom = kbZoomStart + progress * kbZoomEnd;

  // Vary pan direction per asset for visual variety
  const panMultX = (assetSeed % 3 === 0) ? -1 : (assetSeed % 3 === 1) ? 0.5 : 1;
  const panMultY = (assetSeed % 5 === 0) ? -1 : (assetSeed % 5 === 1) ? 0.3 : 1;
  const panX = Math.sin(progress * Math.PI * 0.7) * 40 * kbPanDirX * panMultX;
  const panY = Math.cos(progress * Math.PI * 0.4) * 20 * kbPanDirY * panMultY;

  return { zoom, panX, panY, scale, dw, dh };
}

// ---------------------------------------------------------------------------
// Letterbox bars
// ---------------------------------------------------------------------------

/**
 * Draw top and bottom letterbox bars. Returns the bar height.
 */
export function drawLetterboxBars(
  ctx: RenderContext2D,
  w: number,
  h: number,
  segType: string,
  accentColors: Record<string, string> = ACCENT_COLORS,
): number {
  const barH = Math.round(h * 0.04);
  const accent = Object.hasOwn(accentColors, segType) ? accentColors[segType] : undefined;
  const fillColor = accent ? hexToRgba(accent, 0.85) : 'rgba(0,0,0,0.85)';
  ctx.fillStyle = fillColor;
  ctx.fillRect(0, 0, w, barH);
  ctx.fillRect(0, h - barH, w, barH);
  return barH;
}

// ---------------------------------------------------------------------------
// Vignette overlay
// ---------------------------------------------------------------------------

/**
 * Draw a radial vignette overlay.
 */
export function drawVignette(ctx: RenderContext2D, w: number, h: number): void {
  const vig = ctx.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, w * 0.8);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(0.75, 'rgba(0,0,0,0.08)');
  vig.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);
}

// ---------------------------------------------------------------------------
// Progress bar
// ---------------------------------------------------------------------------

/**
 * Draw a thin progress bar at the bottom of the frame.
 */
export function drawProgressBar(
  ctx: RenderContext2D,
  w: number,
  h: number,
  progress: number,
  accentColor = '#e74c3c',
): void {
  ctx.save();
  ctx.fillStyle = accentColor;
  ctx.fillRect(0, h - 3, progress * w, 3);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

/**
 * Wrap text to fit within maxW, drawing each line at lineH intervals.
 */
export function wrapText(
  ctx: RenderContext2D,
  text: string,
  x: number,
  y: number,
  maxW: number,
  lineH: number,
): void {
  const words = text.split(' ');
  let line = '';
  let currentY = y;

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxW && line) {
      ctx.fillText(line, x, currentY);
      line = word;
      currentY += lineH;
    } else {
      line = testLine;
    }
  }
  if (line) {
    ctx.fillText(line, x, currentY);
  }
}

/**
 * Draw a rounded rectangle path (does not fill or stroke — caller must do that).
 */
export function roundRect(
  ctx: RenderContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}


// ---------------------------------------------------------------------------
// Background music helpers
// ---------------------------------------------------------------------------

/** Style-to-filename mapping for background music tracks. */
const BG_MUSIC_MAP: Record<VideoProject['style'], string> = {
  business_insider: '/audio/bg-business-insider.aac',
  warfront: '/audio/bg-warfront.aac',
  documentary: '/audio/bg-documentary.aac',
  explainer: '/audio/bg-explainer.aac',
};

/**
 * Maps a video style to the expected background music file path.
 * Returns `null` for unknown styles (i.e. styles not in the map).
 */
export function getBackgroundMusicPath(style: string): string | null {
  return BG_MUSIC_MAP[style as VideoProject['style']] ?? null;
}

/**
 * Computes the background music volume level.
 *
 * - During narration: duck by 8dB (factor 0.158) for clear speech
 * - During transitions (no narration): boost by 3dB (factor 1.413)
 * - Base volume when no narration: 0.60
 *
 * dB conversion: 10^(dB/20) → -8dB = 0.158, +3dB = 1.413
 */
export function computeBgMusicVolume(
  hasNarration: boolean,
  isTransition?: boolean,
): number {
  if (hasNarration) {
    // Duck music during narration for clear speech
    return 0.15;
  }
  // No narration — music is primary
  if (isTransition) {
    // Boost by 3dB for more impactful transitions
    return 0.60 * 1.413; // ≈ 0.848
  }
  return 0.60;
}

// ---------------------------------------------------------------------------
// Ken Burns deterministic parameter computation
// ---------------------------------------------------------------------------

export interface KenBurnsConfig {
  zoomStart: number;    // [1.0, 1.40]
  zoomEnd: number;      // [1.0, 1.40]
  panDirectionX: number; // [-1, 1]
  panDirectionY: number; // [-1, 1]
}

/**
 * Simple seeded hash: produces a deterministic number in [0, 1) from a string.
 * Uses a basic FNV-1a-inspired hash for speed and simplicity.
 */
function seededHash(seed: string): number {
  let h = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193); // FNV prime
  }
  // Convert to unsigned 32-bit, then normalise to [0, 1)
  return ((h >>> 0) % 10000) / 10000;
}

/**
 * Deterministic Ken Burns params from segment index + asset ID.
 *
 * Same inputs always produce the same output (seeded hash).
 * When `prevPanX` / `prevPanY` are provided, the new pan direction is
 * guaranteed to differ from the previous one in at least one axis.
 *
 * - zoomStart and zoomEnd are in [1.0, 1.25]
 * - panDirectionX and panDirectionY are in [-1, 1]
 */
export function computeKenBurnsParams(
  segmentIndex: number,
  assetId: string,
  prevPanX?: number,
  prevPanY?: number,
): KenBurnsConfig {
  const seed = `${segmentIndex}:${assetId}`;
  const h1 = seededHash(seed + ':z1');
  const h2 = seededHash(seed + ':z2');
  const h3 = seededHash(seed + ':px');
  const h4 = seededHash(seed + ':py');

  // Zoom values in [1.0, 1.40] — matches server-render.mjs for cinematic movement
  const zoomStart = 1.0 + h1 * 0.40;
  const zoomEnd = 1.0 + h2 * 0.40;

  // Pan directions in [-1, 1]
  let panDirectionX = h3 * 2 - 1;
  let panDirectionY = h4 * 2 - 1;

  // Ensure consecutive segments differ in at least one axis
  if (prevPanX !== undefined && prevPanY !== undefined) {
    // Quantise to sign buckets for comparison: -1, 0, or 1
    const signOf = (v: number): number => (v > 0.33 ? 1 : v < -0.33 ? -1 : 0);

    if (signOf(panDirectionX) === signOf(prevPanX) && signOf(panDirectionY) === signOf(prevPanY)) {
      // Flip the axis with the larger absolute value to guarantee a change
      if (Math.abs(panDirectionX) >= Math.abs(panDirectionY)) {
        panDirectionX = -panDirectionX;
      } else {
        panDirectionY = -panDirectionY;
      }
    }
  }

  // Clamp to [-1, 1] (should already be in range, but be safe)
  panDirectionX = Math.max(-1, Math.min(1, panDirectionX));
  panDirectionY = Math.max(-1, Math.min(1, panDirectionY));

  return { zoomStart, zoomEnd, panDirectionX, panDirectionY };
}

// ---------------------------------------------------------------------------
// Crossfade alpha computation
// ---------------------------------------------------------------------------

/**
 * Compute crossfade alpha for a given frame within the transition window.
 *
 * Returns a value monotonically increasing from 0.0 to 1.0 using linear
 * interpolation. When frameInTransition = 0 → 0.0, when frameInTransition =
 * totalTransitionFrames → 1.0.
 */
export function computeCrossfadeAlpha(
  frameInTransition: number,
  totalTransitionFrames: number,
): number {
  if (totalTransitionFrames <= 0) return 1.0;
  const t = frameInTransition / totalTransitionFrames;
  // Ease-in-out cubic for smoother, more cinematic crossfades
  const eased = t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
  return Math.max(0, Math.min(1, eased));
}

// ---------------------------------------------------------------------------
// Multi-asset alternation
// ---------------------------------------------------------------------------

/**
 * Returns which asset index (0-based) to show at a given time within a segment.
 *
 * Alternates between assets at the given interval (default 4 seconds).
 * Returns 0 if assetCount <= 1.
 */
export function computeActiveAssetIndex(
  timeInSegment: number,
  assetCount: number,
  intervalSec = 4,
): number {
  if (assetCount <= 1) return 0;
  if (intervalSec <= 0) return 0;
  const idx = Math.floor(timeInSegment / intervalSec) % assetCount;
  return idx;
}

// ---------------------------------------------------------------------------
// Resolution presets
// ---------------------------------------------------------------------------

/**
 * Resolution presets for 720p, 1080p, and 4K rendering.
 * Each preset defines canvas dimensions, frame rate, and video bitrate.
 *
 * Requirements 6.1, 6.6
 */
export const RESOLUTION_PRESETS = {
  '720p':  { width: 1280, height: 720,  fps: 24, videoBitsPerSecond: 6_000_000 },
  '1080p': { width: 1920, height: 1080, fps: 24, videoBitsPerSecond: 10_000_000 },
  '4K':    { width: 3840, height: 2160, fps: 24, videoBitsPerSecond: 20_000_000 },
  '2.39:1': { width: 1920, height: 803, fps: 24, videoBitsPerSecond: 12_000_000 },
} as const;

export type ResolutionKey = keyof typeof RESOLUTION_PRESETS;

// ---------------------------------------------------------------------------
// Safe zone computation
// ---------------------------------------------------------------------------

/**
 * Margins defining the safe zone within a video frame.
 * Elements placed within these margins avoid overlap with YouTube's UI
 * (progress bar, title overlay, channel info, end screen elements).
 */
export interface SafeZone {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * Compute safe zone margins scaled proportionally from a 1080p reference.
 *
 * Reference values at 1080p (1920×1080):
 * - top:    40 px  (avoids YouTube title overlay)
 * - bottom: 60 px  (avoids YouTube progress bar and controls)
 * - left:   5% of width
 * - right:  5% of width
 *
 * Vertical margins scale linearly with height relative to 1080.
 * Horizontal margins are always 5% of the given width.
 *
 * Requirements 5.1, 5.2, 5.3
 */
export function computeSafeZone(width: number, height: number): SafeZone {
  const scale = height / 1080;
  return {
    top: Math.round(40 * scale),
    bottom: Math.round(60 * scale),
    left: Math.round(width * 0.05),
    right: Math.round(width * 0.05),
  };
}

// ---------------------------------------------------------------------------
// Title text wrapping
// ---------------------------------------------------------------------------

/**
 * Result of wrapping a title string into lines that fit within the safe zone.
 */
export interface WrappedTitleResult {
  lines: string[];
  fontSize: number;
}

/**
 * Wrap a title string into lines that fit within the canvas safe zone.
 *
 * Computes a 10% horizontal margin on each side, then splits the title at
 * word boundaries so no line exceeds the available width. If the result
 * exceeds 3 lines, the font size is reduced by 20% and the text is re-wrapped
 * (one retry only).
 *
 * Requirements 2.1, 2.2, 2.3
 */
export function wrapTitleText(
  ctx: RenderContext2D,
  title: string,
  canvasWidth: number,
  baseFontSize: number,
): WrappedTitleResult {
  const safeMargin = canvasWidth * 0.1; // 10% each side
  const maxWidth = canvasWidth - safeMargin * 2;
  let fontSize = baseFontSize;

  for (let pass = 0; pass < 2; pass++) {
    ctx.font = `bold ${fontSize}px sans-serif`;
    const words = title.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      if (ctx.measureText(testLine).width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);

    if (lines.length <= 3 || pass === 1) {
      return { lines, fontSize };
    }

    // Reduce font size by 20% and retry
    fontSize = Math.round(baseFontSize * 0.8);
  }

  // Fallback (should not reach here due to loop logic)
  return { lines: [title], fontSize };
}

// ---------------------------------------------------------------------------
// Pacing score computation
// ---------------------------------------------------------------------------

/**
 * Compute a pacing/energy score for a narration string.
 *
 * Returns an integer from 1 (calm/reflective) to 5 (urgent/high-energy)
 * based on:
 * - Average sentence word count (shorter = higher energy)
 * - Punctuation density of `!` and `?` characters
 * - Count of intensity words (urgent, critical, breaking, etc.)
 *
 * Returns 3 (neutral baseline) for empty or null input.
 *
 * Requirements 13.1
 */
export function computePacingScore(narration: string): number {
  if (!narration || narration.trim().length === 0) return 3;

  const sentences = narration.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const avgWordCount =
    sentences.reduce((sum, s) => sum + s.trim().split(/\s+/).length, 0) /
    Math.max(1, sentences.length);

  // Punctuation density: count of ! and ? per 100 characters
  const punctDensity =
    ((narration.match(/[!?]/g) || []).length / narration.length) * 100;

  // Intensity words
  const intensityWords =
    /\b(urgent|critical|breaking|shocking|devastating|explosive|catastrophic|terrifying|alarming|unprecedented)\b/gi;
  const intensityCount = (narration.match(intensityWords) || []).length;

  let score = 3; // baseline
  if (avgWordCount < 8) score += 1; // short sentences = higher energy
  if (avgWordCount > 15) score -= 1; // long sentences = lower energy
  if (punctDensity > 2) score += 1; // lots of ! and ?
  if (intensityCount >= 2) score += 1; // intense language

  return Math.max(1, Math.min(5, score));
}

// ---------------------------------------------------------------------------
// Purpose tag assignment
// ---------------------------------------------------------------------------

/**
 * Classify a script segment into a semantic purpose tag based on content
 * heuristics.
 *
 * Transition and outro segments are tagged structurally. For other segment
 * types the function inspects the combined title + narration text for
 * statistical patterns, risk keywords, prediction keywords, history keywords,
 * competitive-analysis keywords, moat keywords, and proper-name patterns
 * (human story). Falls back to `'stat_hook'` when no heuristic matches.
 *
 * Requirements 11.1
 */
export function assignPurposeTag(
  segment: { type: string; narration: string; title: string },
): SegmentPurposeTag {
  const text = `${segment.title} ${segment.narration}`.toLowerCase();

  if (segment.type === 'transition') return 'transition_bridge';
  if (segment.type === 'outro') return 'conclusion';

  // Content heuristics (order matters — first match wins)
  if (/\$[\d,.]+|\d+%|\d+\s*(billion|million|trillion)/i.test(text)) return 'stat_hook';
  if (/\b(risk|threat|danger|warning|concern|vulnerability)\b/i.test(text)) return 'risk';
  if (/\b(predict|forecast|future|will\s+be|by\s+20\d{2})\b/i.test(text)) return 'prediction';
  if (/\b(history|founded|began|started|origin|early\s+days)\b/i.test(text)) return 'history';
  if (/\b(compet|rival|versus|vs\.|alternative|challenger)\b/i.test(text)) return 'competitive_analysis';
  if (/\b(moat|advantage|dominan|monopol|barrier)\b/i.test(text)) return 'moat';
  if (/[A-Z][a-z]+ [A-Z][a-z]+/.test(segment.narration)) return 'human_story';

  return 'stat_hook';
}

// ---------------------------------------------------------------------------
// Statistical content detection
// ---------------------------------------------------------------------------

/**
 * Detect whether a text string contains statistical content such as
 * dollar amounts, percentages, 4-digit numbers (years / large figures),
 * or magnitude words (billion, million, trillion).
 *
 * Requirements 3.3
 */
export function hasStatisticalContent(text: string): boolean {
  return /\$[\d,.]+|\d+%|\d{4}|\d+\s*(billion|million|trillion)/i.test(text);
}

// ---------------------------------------------------------------------------
// Scene layout assignment
// ---------------------------------------------------------------------------

/**
 * Assign a `SceneLayoutType` to each segment based on its purpose tag,
 * segment type, and narration content.
 *
 * Layout preference order:
 * - `stat-card`              → stat_hook purpose tag or statistical narration content
 * - `lower-third-overlay`    → transition segments or transition_bridge purpose tag
 * - `quote-card`             → human_story purpose tag
 * - `left-text-right-image`  → section segments
 * - `centered-text`          → default fallback
 *
 * Enforces a no-consecutive-duplicate constraint: when the preferred layout
 * matches the previous segment's layout, the function rotates to an
 * alternative layout from the remaining options.
 *
 * Requirements 3.1, 3.2, 3.3, 3.4
 */
export function assignSceneLayouts(
  segments: Array<{ type: string; purposeTag?: string; narration?: string }>,
): SceneLayoutType[] {
  const layouts: SceneLayoutType[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const prevLayout = i > 0 ? layouts[i - 1] : null;

    // Content-aware preference
    let preferred: SceneLayoutType = 'centered-text';
    if (seg.purposeTag === 'stat_hook' || hasStatisticalContent(seg.narration || '')) {
      preferred = 'stat-card';
    } else if (seg.type === 'transition' || seg.purposeTag === 'transition_bridge') {
      preferred = 'lower-third-overlay';
    } else if (seg.purposeTag === 'human_story') {
      preferred = 'quote-card';
    } else if (seg.type === 'section') {
      preferred = 'left-text-right-image';
    }

    // No-consecutive-duplicate constraint
    if (preferred === prevLayout) {
      const alternatives: SceneLayoutType[] = ([
        'centered-text', 'left-text-right-image', 'lower-third-overlay',
        'stat-card', 'quote-card',
      ] as SceneLayoutType[]).filter(l => l !== prevLayout);
      preferred = alternatives[i % alternatives.length];
    }

    layouts.push(preferred);
  }

  return layouts;
}

// ---------------------------------------------------------------------------
// Retention beat scheduling
// ---------------------------------------------------------------------------

/**
 * Pattern interrupt types used for retention beats.
 * These provide visual/narrative variety to maintain viewer engagement.
 *
 * - text_slam: Bold on-screen text emphasizing a key point
 * - zoom: Quick zoom effect on current visual
 * - graphic_switch: Switch to a different graphic/overlay style
 * - sudden_silence: Brief audio drop for dramatic effect
 * - rhetorical_question: On-screen question to engage viewer
 * - visual_break: Standard visual transition/break
 * - stat_callout: Highlight a statistic on screen
 * - rehook_line: Re-engage viewer with a hook line
 *
 * Requirements 2.61-2.80
 */
export type RetentionBeatType =
  | 'text_slam'
  | 'zoom'
  | 'graphic_switch'
  | 'sudden_silence'
  | 'rhetorical_question'
  | 'visual_break'
  | 'stat_callout'
  | 'rehook_line';

/**
 * A retention beat marks a point in the video timeline where a visual or
 * narrative hook should appear to maintain viewer engagement.
 *
 * Requirements 14.1, 14.2, 14.3, 2.61-2.80
 */
export interface RetentionBeat {
  segmentIndex: number;
  timeOffsetSec: number;
  type: RetentionBeatType;
}

/**
 * Wave pacing phases that cycle through the video to create rhythm.
 * Each phase has different energy levels and preferred beat types.
 *
 * - impact: High energy, fast cuts, text slams
 * - explanation: Slower pacing, graphic switches for clarity
 * - escalation: Building tension, zooms and stat callouts
 * - relief: Brief respite, sudden silence or rhetorical questions
 *
 * Requirements 2.72
 */
type WavePacingPhase = 'impact' | 'explanation' | 'escalation' | 'relief';

/**
 * Determine the wave pacing phase based on position within the video.
 * Task 99: Tuned pacing intervals.
 * The wave cycles: impact → explanation → escalation → relief → impact...
 *
 * The opener (first 15%) is always in 'impact' phase for faster cuts.
 */
function getWavePhase(progress: number): WavePacingPhase {
  // Opener always gets impact phase for faster cuts
  if (progress < 0.15) return 'impact';

  // Cycle through phases for the rest of the video
  const cycleProgress = ((progress - 0.15) / 0.85) % 1.0;
  if (cycleProgress < 0.30) return 'impact';
  if (cycleProgress < 0.55) return 'explanation';
  if (cycleProgress < 0.80) return 'escalation';
  return 'relief';
}

/**
 * Select a pattern interrupt beat type based on the current wave phase
 * and narration content (meaning-based cuts).
 *
 * Meaning-based logic:
 * - Questions in narration → rhetorical_question
 * - Statistics in narration → stat_callout or text_slam
 * - Dramatic phrases → zoom or sudden_silence
 * - Default varies by wave phase
 */
function selectBeatType(
  phase: WavePacingPhase,
  narration: string | undefined,
  beatIndex: number,
): RetentionBeatType {
  const text = narration || '';

  // Meaning-based selection: analyze narration content
  const hasQuestion = /\?/.test(text);
  const hasStat = /\$[\d,.]+|\d+%|\d+\s*(billion|million|trillion)/i.test(text);
  const hasDramatic = /but (here's|that's not|wait)|and it gets worse|nobody saw|could be/i.test(text);

  // Content-driven beat type selection
  if (hasQuestion) return 'rhetorical_question';
  if (hasStat) return beatIndex % 2 === 0 ? 'text_slam' : 'stat_callout';
  if (hasDramatic) return beatIndex % 2 === 0 ? 'zoom' : 'sudden_silence';

  // Phase-driven fallback for pattern variety
  switch (phase) {
    case 'impact':
      return beatIndex % 3 === 0 ? 'text_slam' : beatIndex % 3 === 1 ? 'zoom' : 'graphic_switch';
    case 'explanation':
      return beatIndex % 2 === 0 ? 'graphic_switch' : 'text_slam';
    case 'escalation':
      return beatIndex % 3 === 0 ? 'zoom' : beatIndex % 3 === 1 ? 'stat_callout' : 'text_slam';
    case 'relief':
      return beatIndex % 2 === 0 ? 'sudden_silence' : 'rhetorical_question';
  }
}

/**
 * Compute the maximum gap between beats based on the wave phase.
 * Task 99: Tuned pacing — fast-paced (15s), normal (25s), slow (35s).
 *
 * Requirements 2.62, 2.65
 */
function getMaxGapForPhase(phase: WavePacingPhase): number {
  switch (phase) {
    case 'impact': return 15;       // Fast-paced: rapid pattern interrupts
    case 'explanation': return 35;  // Slow: let explanations breathe
    case 'escalation': return 20;   // Normal: building tension at moderate pace
    case 'relief': return 25;       // Normal: brief respite
  }
}

/**
 * Schedule retention beats across a sequence of segments using meaning-based
 * cuts and wave-based pacing.
 *
 * Instead of cutting on fixed time intervals, this function:
 * 1. Analyzes narration content to determine appropriate beat types
 * 2. Uses wave-based pacing (impact → explanation → escalation → relief)
 * 3. Schedules pattern interrupts every 20-30 seconds
 * 4. Uses faster cuts in the opener, slower in explanation sections
 * 5. Ensures every segment either escalates, clarifies, or rewards the viewer
 *
 * Natural hooks are detected in narration text:
 * - Questions (contains `?`) → rhetorical_question beat
 * - Statistics (dollar amounts, percentages) → stat_callout or text_slam
 * - Dramatic phrases → zoom or sudden_silence
 *
 * Pattern interrupts are guaranteed at <= 30 second intervals, with the
 * specific interval varying by wave phase (20s for impact, 28s for explanation).
 *
 * Requirements 2.61-2.80, 14.1, 14.2, 14.3
 */
export function scheduleRetentionBeats(
  segments: Array<{ duration: number; narration?: string }>,
): RetentionBeat[] {
  const beats: RetentionBeat[] = [];
  const totalDuration = segments.reduce((sum, s) => sum + s.duration, 0);

  if (totalDuration === 0 || segments.length === 0) return beats;

  let cumulativeTime = 0;
  let lastBeatTime = 0;
  let beatIndex = 0;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const segMidpoint = cumulativeTime + seg.duration / 2;
    const segEnd = cumulativeTime + seg.duration;

    // Determine position in video for wave pacing
    const progress = segMidpoint / totalDuration;
    const phase = getWavePhase(progress);
    const maxGap = getMaxGapForPhase(phase);

    // Check if this segment contains a natural hook (meaning-based detection)
    const hasNaturalHook = seg.narration && (
      /\?/.test(seg.narration) ||
      /\$[\d,.]+|\d+%/.test(seg.narration) ||
      /but (here's|that's not|wait)|and it gets worse/i.test(seg.narration)
    );

    if (hasNaturalHook) {
      // Natural hook found — schedule a meaning-based beat at this point
      const beatType = selectBeatType(phase, seg.narration, beatIndex);
      beats.push({
        segmentIndex: i,
        timeOffsetSec: segMidpoint,
        type: beatType,
      });
      lastBeatTime = segMidpoint;
      beatIndex++;
    }

    // Pattern interrupt guarantee: if gap exceeds phase-appropriate max, insert beat
    if (segEnd - lastBeatTime > maxGap) {
      const beatType = selectBeatType(phase, seg.narration, beatIndex);
      beats.push({
        segmentIndex: i,
        timeOffsetSec: segMidpoint,
        type: beatType,
      });
      lastBeatTime = segMidpoint;
      beatIndex++;
    }

    cumulativeTime = segEnd;
  }

  // Final pass: ensure no gap exceeds 35 seconds (absolute maximum — Task 99 tuned)
  // This handles edge cases where segments are very long
  if (beats.length >= 2) {
    const additionalBeats: RetentionBeat[] = [];
    for (let i = 1; i < beats.length; i++) {
      const gap = beats[i].timeOffsetSec - beats[i - 1].timeOffsetSec;
      if (gap > 35) {
        // Insert an intermediate beat
        const midTime = (beats[i - 1].timeOffsetSec + beats[i].timeOffsetSec) / 2;
        const progress = midTime / totalDuration;
        const phase = getWavePhase(progress);
        additionalBeats.push({
          segmentIndex: beats[i].segmentIndex,
          timeOffsetSec: midTime,
          type: selectBeatType(phase, undefined, beatIndex++),
        });
      }
    }
    if (additionalBeats.length > 0) {
      beats.push(...additionalBeats);
      beats.sort((a, b) => a.timeOffsetSec - b.timeOffsetSec);
    }
  }

  return beats;
}

// ---------------------------------------------------------------------------
// Audio direction — section-appropriate sound bed selection
// ---------------------------------------------------------------------------

/**
 * Sound bed selection result for a single segment.
 */
export interface SoundBedSelection {
  segmentIndex: number;
  soundBed: AudioDirection['soundBed'];
  impactCues: string[];
  sonicSpace: boolean;
  intensity: number;
}

/**
 * Analyze segments and select section-appropriate sound beds, impact cues,
 * sonic space markers, and intensity levels.
 *
 * Design goals (Requirements 2.151-2.160):
 * - Varies intensity to prevent "wall of tension" (no 3+ consecutive high-intensity segments)
 * - Aligns SFX moments (impact cues) to retention-critical lines (stats, dramatic phrases)
 * - Leaves sonic space before major statements (questions, dramatic reveals)
 * - Selects sound bed type based on segment content and position:
 *   - intro → 'building' (draw viewer in)
 *   - threat/risk content → 'tense'
 *   - explanation/context → 'neutral'
 *   - advice/practical → 'calm'
 *   - outro → 'release'
 *   - transitions → varies based on what follows
 */
export function selectSoundBed(
  segments: Array<{
    type: string;
    narration?: string;
    title?: string;
    purposeTag?: string;
  }>,
): SoundBedSelection[] {
  if (segments.length === 0) return [];

  const selections: SoundBedSelection[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const text = `${seg.title || ''} ${seg.narration || ''}`.toLowerCase();
    const progress = segments.length > 1 ? i / (segments.length - 1) : 0;

    // --- Sound bed selection based on content and position ---
    let soundBed: AudioDirection['soundBed'] = 'neutral';

    if (seg.type === 'intro') {
      soundBed = 'building';
    } else if (seg.type === 'outro') {
      soundBed = 'release';
    } else if (seg.type === 'transition') {
      // Transitions use calm to give a breather before next section
      soundBed = 'calm';
    } else if (seg.purposeTag === 'risk' || /\b(risk|threat|danger|warning|attack|breach|hack|stolen|exploit)\b/.test(text)) {
      soundBed = 'tense';
    } else if (seg.purposeTag === 'prediction' || /\b(predict|future|will\s+be|by\s+20\d{2}|coming)\b/.test(text)) {
      soundBed = 'building';
    } else if (/\b(protect|safe|step|action|enable|update|check|advice|tip)\b/.test(text)) {
      soundBed = 'calm';
    } else if (progress > 0.7) {
      // Late segments tend toward release/calm
      soundBed = 'release';
    }

    // --- Intensity calculation (0-10 scale) ---
    let intensity = 5; // baseline

    // Content-driven intensity adjustments
    if (/\b(catastroph|devastat|terrif|alarm|shocking|unprecedented|emergency)\b/.test(text)) {
      intensity = 9;
    } else if (/\b(risk|threat|danger|attack|breach|hack)\b/.test(text)) {
      intensity = 7;
    } else if (/\b(protect|safe|calm|step|action|tip|advice)\b/.test(text)) {
      intensity = 3;
    } else if (seg.type === 'intro') {
      intensity = 6;
    } else if (seg.type === 'outro') {
      intensity = 4;
    } else if (seg.type === 'transition') {
      intensity = 3;
    }

    // --- Prevent "wall of tension": if previous 2 segments were high intensity, reduce ---
    if (i >= 2) {
      const prev1 = selections[i - 1].intensity;
      const prev2 = selections[i - 2].intensity;
      if (prev1 >= 7 && prev2 >= 7 && intensity >= 7) {
        // Force a dip to prevent fatigue
        intensity = Math.min(intensity, 5);
        soundBed = soundBed === 'tense' ? 'neutral' : soundBed;
      }
    }

    // --- Impact cues: align SFX to retention-critical content ---
    const impactCues: string[] = [];
    if (/\$[\d,.]+|\d+%|\d+\s*(billion|million|trillion)/i.test(text)) {
      impactCues.push('impact_hit'); // stat reveal deserves a hit
    }
    if (/\b(breaking|shocking|revealed|exposed|leaked)\b/.test(text)) {
      impactCues.push('alert_ping');
    }
    if (/\b(but (here's|that's not|wait)|and it gets worse|nobody saw)\b/i.test(text)) {
      impactCues.push('whoosh'); // dramatic pivot
    }
    if (seg.type === 'intro') {
      impactCues.push('whoosh'); // opening energy
    }

    // --- Sonic space: leave brief silence before major statements ---
    const sonicSpace =
      /\?/.test(seg.narration || '') || // questions deserve a beat
      /\b(but (here's|that's not)|the real (question|problem|story))\b/i.test(text) || // dramatic reveals
      (i > 0 && seg.type === 'section' && segments[i - 1]?.type === 'transition'); // after transitions

    selections.push({
      segmentIndex: i,
      soundBed,
      impactCues,
      sonicSpace,
      intensity,
    });
  }

  return selections;
}

// ---------------------------------------------------------------------------
// Resolution scaling
// ---------------------------------------------------------------------------

/**
 * Scale a base dimension proportionally to a target resolution.
 *
 * Returns `baseDimension * (targetWidth / baseWidth)`.
 * Used for scaling overlay elements (captions, labels, etc.) across resolutions.
 */
export function scaleToResolution(
  baseDimension: number,
  baseWidth: number,
  targetWidth: number,
): number {
  if (baseWidth === 0) return 0;
  return baseDimension * (targetWidth / baseWidth);
}

// ---------------------------------------------------------------------------
// Dynamic segment pacing
// ---------------------------------------------------------------------------

/**
 * Pacing category ranges in seconds.
 * These control how long each type of segment should feel natural.
 */
const PACING_RANGES: Record<string, { min: number; max: number }> = {
  intro: { min: 4, max: 6 },         // Hook fast
  stat: { min: 6, max: 8 },          // Let viewers absorb data
  emotional: { min: 5, max: 7 },     // Let emotion land
  tension: { min: 3, max: 4 },       // Build urgency
  transition: { min: 2, max: 4 },    // Brief bridges
  outro: { min: 4, max: 6 },         // Standard wrap-up
  section: { min: 5, max: 8 },       // Default content
};

/**
 * Classify a segment into a pacing category based on its type,
 * purpose tag, and narration content.
 */
function classifyPacingCategory(seg: ScriptSegment): string {
  if (seg.type === 'intro') return 'intro';
  if (seg.type === 'outro') return 'outro';
  if (seg.type === 'transition') return 'transition';

  const text = `${seg.title || ''} ${seg.narration || ''}`.toLowerCase();

  // Stat/data segments: let viewers absorb
  if (/\$[\d,.]+|\d+%|\d+\s*(billion|million|trillion)/i.test(text)) {
    return 'stat';
  }

  // Emotional segments: let emotion land
  if (/\b(emotion|feel|heart|soul|passion|love|hate|fear|hope|dream|inspire|sad|happy|angry)\b/.test(text)) {
    return 'emotional';
  }

  // Tension segments: build urgency
  if (/\b(risk|threat|danger|warning|urgent|critical|breaking|shocking|now|immediate|alert|emergency)\b/.test(text)) {
    return 'tension';
  }

  // Check purpose tag for additional context
  if (seg.purposeTag === 'risk') return 'tension';
  if (seg.purposeTag === 'stat_hook') return 'stat';
  if (seg.purposeTag === 'human_story') return 'emotional';

  return 'section';
}

/**
 * Compute a dynamically-paced duration for a segment based on its content type.
 *
 * Different content types feel natural at different durations:
 * - Intro segments: 4-6 seconds (hook fast)
 * - Stat/data segments: 6-8 seconds (let viewers absorb)
 * - Emotional segments: 5-7 seconds (let emotion land)
 * - Tension segments: 3-4 seconds (build urgency)
 * - Transitions: 2-4 seconds (brief bridges)
 * - Outro: 4-6 seconds (standard wrap-up)
 *
 * The function clamps the original duration within the appropriate range,
 * making the video feel more natural and less robotic.
 *
 * @param segment - The script segment to compute duration for
 * @returns Adjusted duration in seconds
 */
export function computeDynamicSegmentDuration(segment: ScriptSegment): number {
  const category = classifyPacingCategory(segment);
  const range = PACING_RANGES[category] || PACING_RANGES.section;
  return Math.max(range.min, Math.min(range.max, segment.duration));
}

/**
 * Apply dynamic pacing to all segments in a script.
 * Returns a new array with adjusted durations (does not mutate input).
 *
 * @param segments - Array of script segments
 * @returns New array with dynamically-paced durations
 */
export function applyDynamicPacing(segments: ScriptSegment[]): ScriptSegment[] {
  return segments.map(seg => ({
    ...seg,
    duration: computeDynamicSegmentDuration(seg),
  }));
}
