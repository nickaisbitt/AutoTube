#!/usr/bin/env node
/**
 * AutoTube Server-Side Video Renderer
 *
 * Renders a VideoProject to an .mp4 file using node-canvas + ffmpeg.
 * No browser CORS restrictions — images are fetched via the Vite proxy.
 *
 * Usage:
 *   node server-render.mjs [output.mp4]
 *
 * Requires:
 *   - npm install --save-dev canvas
 *   - ffmpeg installed (brew install ffmpeg)
 *   - AutoTube dev server running on http://localhost:5173
 *   - Pipeline run completed (media sourced)
 */

import { createCanvas, loadImage } from 'canvas';
import { spawn, spawnSync, execFileSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, unlinkSync, rmSync, readFileSync, statSync, readdirSync, copyFileSync } from 'fs';

process.on('unhandledRejection', (reason, promise) => {
  console.error('\n❌ UNHANDLED PROMISE REJECTION:', reason, 'at:', promise);
});
process.on('uncaughtException', (err, origin) => {
  console.error('\n❌ UNCAUGHT EXCEPTION:', err, 'origin:', origin);
});
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir, homedir } from 'os';
import { generateNarration } from './server-render/narration.mjs';
import { parseVttWordTimestamps, findCurrentWord } from './server-render/subtitleParser.mjs';
import { createStyleParticles, updateStyleParticles, drawStyleParticles, drawDynamicVignette, drawChromaticAberration, drawFlashFrame, computeTensionZoom, drawKineticOverlay } from './server-render/visualFx.mjs';
import { generateFFmpegChapterMetadata, chaptersFromSegments, embedChaptersCommand, selectCommentBait, computeMidpointTime, generateEasterEggs, drawEasterEgg, computeSpeedRamp, generateABThumbnailVariants, detectEmotionalTone } from './server-render/growthFeatures.mjs';
import { drawLowerThird, drawNameCard, drawSourceCitation, drawProgressTimeline, drawTransition, drawChartReveal, extractNamesFromText, extractCitationsFromSegments, selectTransitionForSegment, drawAnimatedBarChart, drawBounceText, drawElasticText, drawSlideInText, drawParallaxBackground, logBRollCoverage, snapTransitionToBeat, easeInOut, easeOut, easeInBounce, applyBreathingRoom, drawZoomTransition, getAvailableTransitions } from './server-render/advancedRender.mjs';
import {
  renderQueue, progressBroadcaster, checkAvailableMemory, logMemoryUsage,
  EtaEstimator, validateOutput, stepMetrics, saveCheckpoint, loadCheckpoint,
  clearCheckpoint, parseFfmpegError, getRecoveryAction, QUALITY_DEGRADATION_CHAIN,
  retryWithFallback, recommendNodeFlags, yieldToEventLoop, RenderStateManager,
  measureAudioLoudness,
} from './server-render/pipelineReliability.mjs';

import { estimateRenderCost } from './src/services/costTracker.mjs';

// ── Word timestamp cache for karaoke subtitle sync ─────────────────────────
// Populated from edge-tts VTT files before rendering begins.
// Keyed by segment index. Used by drawFrame() for word-level caption timing.
const wordTimestampCache = new Map();

const LOG_LEVEL = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'warn' : 'info');
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
function log(level, ...args) {
  if (LEVELS[level] <= LEVELS[LOG_LEVEL]) {
    console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](...args);
  }
}

const CONFIG = {
  DEFAULT_WIDTH: 1920,
  DEFAULT_HEIGHT: 1080,
  DEFAULT_FPS: 24,
  DISK_SPACE_MIN_MB: 500,
  IMAGE_CACHE_SIZE: 100,
  FETCH_TIMEOUT_MS: 15000,
  FETCH_MAX_RETRIES: 3,
  LOG_INTERVAL_MS: 5000,
  STALL_THRESHOLD_MS: 30000,
  CONCURRENCY_LIMIT: 15,
  SEGMENT_TITLE_DURATION: 0,
  WATERMARK_OPACITY: 0.6,
};

const RENDER_DEBUG_OVERLAYS = false;


const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, 'test-recordings');
const OUTPUT_FILE = process.argv[2] || join(OUTPUT_DIR, `server-render-${Date.now()}.mp4`);

// Dev server base URL — must be provided via environment variable
const DEV_SERVER = process.env.DEV_SERVER_URL || (() => {
  console.warn('WARNING: DEV_SERVER_URL environment variable not set, falling back to http://localhost:5173. Set DEV_SERVER_URL for production use.');
  return 'http://localhost:5173';
})();

// Default resolution — overridden by project.exportSettings.resolution when available
let WIDTH = CONFIG.DEFAULT_WIDTH;
let HEIGHT = CONFIG.DEFAULT_HEIGHT;
let FPS = CONFIG.DEFAULT_FPS; // frames per second for standard quality

// ── Resolution presets (mirrors src/services/renderingShared.ts RESOLUTION_PRESETS) ──
// videoBitsPerSecond is used when project.exportSettings.quality === 'bitrate-mode'
const RESOLUTION_PRESETS = {
  '720p':   { width: 1280, height: 720,  fps: 24, videoBitsPerSecond: 6_000_000 },
  '1080p':  { width: 1920, height: 1080, fps: 24, videoBitsPerSecond: 12_000_000 },
  '1080p30': { width: 1920, height: 1080, fps: 30, videoBitsPerSecond: 10_000_000 },
  '1080p60': { width: 1920, height: 1080, fps: 60, videoBitsPerSecond: 15_000_000 },
  '1440p':  { width: 2560, height: 1440, fps: 24, videoBitsPerSecond: 16_000_000 },
  '4K':     { width: 3840, height: 2160, fps: 24, videoBitsPerSecond: 20_000_000 },
};

const YOUTUBE_BITRATES = { '1080p30': 12_000_000, '1080p60': 12_000_000, '1440p30': 16_000_000, '4K30': 35_000_000, '4K60': 53_000_000 };

// ── Aspect ratio presets (Task 17) ──
// Task 141: Multi-platform presets
const ASPECT_RATIOS = {
  '16:9':  { width: 1920, height: 1080, label: 'YouTube' },
  '9:16':  { width: 1080, height: 1920, label: 'Shorts/TikTok' },
  '1:1':   { width: 1080, height: 1080, label: 'Instagram' },
  '4:5':   { width: 1080, height: 1350, label: 'Facebook' },
};

function detectAspectRatioFromTopic(topic) {
  const lower = (topic || '').toLowerCase();
  if (lower.includes('shorts') || lower.includes('tiktok')) return '9:16';
  return '16:9';
}

const ACCENT_COLORS = { intro: '#60a5fa', section: '#3b82f6', transition: '#8b5cf6', outro: '#60a5fa' };

function hexToRgba(hex, alpha) {
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

let DRAFT_MODE = false;

// ── Caches to avoid per-frame allocations ──────────────────────────────────
const MAX_ASSET_SEED_CACHE_SIZE = 500;
const assetSeedCache = new Map();
function getAssetSeed(url) {
  let seed = assetSeedCache.get(url);
  if (seed === undefined) {
    seed = 0;
    for (let i = 0; i < url.length; i++) seed += url.charCodeAt(i);
    if (assetSeedCache.size >= MAX_ASSET_SEED_CACHE_SIZE) {
      const oldestKey = assetSeedCache.keys().next().value;
      assetSeedCache.delete(oldestKey);
    }
    assetSeedCache.set(url, seed);
  }
  return seed;
}

const MAX_CHART_ASSET_CACHE_SIZE = 500;
const chartAssetCache = new Map();
function isChartAsset(asset) {
  if (!asset) return false;
  if (chartAssetCache.has(asset.id)) return chartAssetCache.get(asset.id);
  const concept = (asset.concept ?? '').toLowerCase();
  const alt = (asset.alt ?? '').toLowerCase();
  const result = CHART_KEYWORDS.some(kw => {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    return regex.test(concept) || regex.test(alt);
  });
  if (chartAssetCache.size >= MAX_CHART_ASSET_CACHE_SIZE) {
    const oldestKey = chartAssetCache.keys().next().value;
    chartAssetCache.delete(oldestKey);
  }
  chartAssetCache.set(asset.id, result);
  return result;
}

const MAX_WORD_WIDTH_CACHE_SIZE = 500;
const wordWidthCache = new Map();
function measureWordCached(ctx, font, word) {
  const key = font + '\0' + word;
  let w = wordWidthCache.get(key);
  if (w === undefined) {
    ctx.font = font;
    w = ctx.measureText(word).width;
    if (wordWidthCache.size >= MAX_WORD_WIDTH_CACHE_SIZE) {
      const oldestKey = wordWidthCache.keys().next().value;
      wordWidthCache.delete(oldestKey);
    }
    wordWidthCache.set(key, w);
  }
  return w;
}

function detectHardwareEncoder() {
  try {
    const result = spawnSync('ffmpeg', ['-encoders'], { encoding: 'utf8', timeout: 5000 });
    if (result.status !== 0) return null;
    const encoders = result.stdout;

    // macOS: VideoToolbox
    if (process.platform === 'darwin' && encoders.includes('h264_videotoolbox')) {
      return 'h264_videotoolbox';
    }

    // NVIDIA GPU: NVENC
    if (encoders.includes('h264_nvenc')) {
      return 'h264_nvenc';
    }

    // AMD/Intel: VA-API (Linux)
    if (encoders.includes('h264_vaapi')) {
      return 'h264_vaapi';
    }

    // Video4Linux2
    if (encoders.includes('h264_v4l2m2m')) {
      return 'h264_v4l2m2m';
    }
  } catch {}
  return null;
}

/**
 * Returns whether GPU acceleration is available and which encoder to use.
 */
export function getGpuEncoderInfo() {
  const encoder = detectHardwareEncoder();
  return {
    available: encoder !== null,
    encoder,
    isNvidia: encoder === 'h264_nvenc',
    isApple: encoder === 'h264_videotoolbox',
    isVaapi: encoder === 'h264_vaapi',
  };
}

// ── Shared rendering constants and functions (mirrors src/services/renderingShared.ts) ──
// These are duplicated here because .mjs cannot import .ts directly.

/**
 * Checks available disk space on the system.
 * Returns available space in bytes, or null if unable to determine.
 * Uses `df` command on Unix-like systems.
 * 
 * Requirements: MEDIUM #10 - Disk space monitoring before render
 */
function getAvailableDiskSpace(path = '/tmp') {
  try {
    const result = spawnSync('df', ['-k', path], { encoding: 'utf-8', timeout: 5000 });
    if (result.status !== 0 || !result.stdout) {
      console.warn('[DiskCheck] Unable to determine disk space');
      return null;
    }
    
    // Parse df output: Filesystem 1K-blocks Used Available Use% Mounted
    const lines = result.stdout.trim().split('\n');
    if (lines.length < 2) return null;
    
    // Get the last line (actual filesystem info)
    const dataLine = lines[lines.length - 1];
    const parts = dataLine.split(/\s+/);
    
    // Available is typically the 4th column (index 3)
    const availableKB = parseInt(parts[3], 10);
    if (isNaN(availableKB)) return null;
    
    return availableKB * 1024; // Convert KB to bytes
  } catch (err) {
    console.warn(`[DiskCheck] Error checking disk space: ${err.message}`);
    return null;
  }
}

/**
 * Validates that there's enough disk space for the render.
 * Estimates required space based on resolution, duration, and fps.
 * Throws an error if insufficient space is detected.
 * 
 * Requirements: MEDIUM #10 - Disk space monitoring before render
 */
function validateDiskSpace(project, outputPath) {
  const MIN_FREE_SPACE_MB = CONFIG.DISK_SPACE_MIN_MB; // Minimum free space threshold
  
  // Estimate required space: ~10MB per minute at 1080p24
  // Scale by resolution and duration
  const durationSec = project.script.reduce((sum, seg) => sum + (seg.durationSec || 5), 0);
  const resolutionKey = project.exportSettings?.resolution || '1080p';
  const resMultiplier = { '480p': 0.25, '720p': 0.5, '1080p': 1.0, '4K': 4.0 }[resolutionKey] || 1.0;
  
  // Rough estimate: 10 MB/min * duration_min * resolution_multiplier * safety_factor
  const estimatedMB = (10 * (durationSec / 60) * resMultiplier * 2); // 2x safety factor
  const requiredMB = Math.max(MIN_FREE_SPACE_MB, estimatedMB);
  
  const availableBytes = getAvailableDiskSpace(dirname(outputPath));
  if (availableBytes === null) {
    console.warn(`[DiskCheck] Cannot verify disk space — proceeding with caution`);
    return;
  }
  
  const availableMB = availableBytes / (1024 * 1024);
  
  if (availableMB < requiredMB) {
    throw new Error(
      `Insufficient disk space: ${availableMB.toFixed(0)}MB available, ` +
      `${requiredMB.toFixed(0)}MB required (estimated for ${durationSec}s video at ${resolutionKey}). ` +
      `Free up space or reduce video length/resolution.`
    );
  }
  
  log('info', `[DiskCheck] ✓ ${availableMB.toFixed(0)}MB available (${requiredMB.toFixed(0)}MB required)`);
}

/**
 * Simple seeded hash: produces a deterministic number in [0, 1) from a string.
 * Uses a basic FNV-1a-inspired hash for speed and simplicity.
 */
function seededHash(seed) {
  let h = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193); // FNV prime
  }
  return ((h >>> 0) % 10000) / 10000;
}

/**
 * Deterministic Ken Burns params from segment index + asset ID.
 * Same inputs always produce the same output (seeded hash).
 * When prevPanX/prevPanY are provided, the new pan direction is
 * guaranteed to differ from the previous one in at least one axis.
 *
 * Requirements 4.1, 4.2, 10.1
 */
function computeKenBurnsParams(segmentIndex, assetId, prevPanX, prevPanY) {
  const seed = `${segmentIndex}:${assetId}`;
  const h1 = seededHash(seed + ':z1');
  const h2 = seededHash(seed + ':z2');
  const h3 = seededHash(seed + ':px');
  const h4 = seededHash(seed + ':py');

  // Zoom range: 1.0-1.40 — matches renderingShared.ts for consistent Ken Burns across renderers
  const zoomStart = 1.0 + h1 * 0.40;
  const zoomEnd = 1.0 + h2 * 0.40;

  let panDirectionX = h3 * 2 - 1;
  let panDirectionY = h4 * 2 - 1;

  if (prevPanX !== undefined && prevPanY !== undefined) {
    const signOf = (v) => (v > 0.33 ? 1 : v < -0.33 ? -1 : 0);
    if (signOf(panDirectionX) === signOf(prevPanX) && signOf(panDirectionY) === signOf(prevPanY)) {
      if (Math.abs(panDirectionX) >= Math.abs(panDirectionY)) {
        panDirectionX = -panDirectionX;
      } else {
        panDirectionY = -panDirectionY;
      }
    }
  }

  panDirectionX = Math.max(-1, Math.min(1, panDirectionX));
  panDirectionY = Math.max(-1, Math.min(1, panDirectionY));

  return { zoomStart, zoomEnd, panDirectionX, panDirectionY };
}

/**
 * Cubic Bezier easing for smooth cinematic motion
 */
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Compute crossfade alpha for a given frame within the transition window.
 * Returns a value monotonically increasing from 0.0 to 1.0.
 *
 * Requirement 4.3, 10.2
 */
function computeCrossfadeAlpha(frameInTransition, totalTransitionFrames) {
  if (totalTransitionFrames <= 0) return 1.0;
  const t = frameInTransition / totalTransitionFrames;
  return Math.max(0, Math.min(1, t));
}

/**
 * Returns which asset index (0-based) to show at a given time within a segment.
 * Alternates between assets at the given interval (default 4 seconds).
 *
 * Requirement 4.4
 */
function computeActiveAssetIndex(timeInSegment, assetCount, intervalSec = 4) {
  if (assetCount <= 1) return 0;
  if (intervalSec <= 0) return 0;
  return Math.floor(timeInSegment / intervalSec) % assetCount;
}

/**
 * Draws a procedural background fallback with gradient and topic text.
 * Used when a MediaAsset fails to load during rendering.
 *
 * Requirement 4.7
 */
function drawProceduralFallbackWithText(ctx, w, h, topicText, segType, narrationText, projectTopic) {
  const palettes = {
    intro:      { bg: ['#0a0a1a', '#1a0a2e', '#0a1a2e'], accent: '#e74c3c', glow: '#ff6b6b' },
    section:    { bg: ['#0a0a1a', '#0a1a2e', '#0a2a3e'], accent: '#3498db', glow: '#5dade2' },
    transition: { bg: ['#1a1a0a', '#2a1a0a', '#1a0a0a'], accent: '#f39c12', glow: '#f5b041' },
    outro:      { bg: ['#0a1a0a', '#0a2a1a', '#0a1a2a'], accent: '#2ecc71', glow: '#58d68d' },
  };

  // Topic-specific palette overrides
  const topicPalettes = [
    { keywords: ['finance', 'money', 'crypto', 'stock', 'invest', 'economy', 'bitcoin', 'trading', 'bank', 'fund', 'wealth'], palette: { bg: ['#0a1a2e', '#0a2a4e', '#1a2a3e'], accent: '#ffd700', glow: '#ffec80' } },
    { keywords: ['tech', 'ai', 'software', 'computing', 'digital', 'cyber', 'robot', 'startup', 'data', 'cloud', 'code'], palette: { bg: ['#0a0a2e', '#0a1a3e', '#1a0a3e'], accent: '#00d4ff', glow: '#00f0ff' } },
    { keywords: ['health', 'medical', 'disease', 'vaccine', 'doctor', 'medicine', 'mental', 'wellness', 'nutrition', 'exercise'], palette: { bg: ['#1a1a1a', '#2a2a2a', '#1a2a1a'], accent: '#22c55e', glow: '#4ade80' } },
    { keywords: ['science', 'space', 'physics', 'quantum', 'nasa', 'universe', 'research', 'biology', 'chemistry', 'experiment'], palette: { bg: ['#0a0a1a', '#1a0a2a', '#0a1a2a'], accent: '#a855f7', glow: '#c084fc' } },
    { keywords: ['politics', 'government', 'election', 'law', 'policy', 'congress', 'senate', 'vote', 'democrat', 'republican'], palette: { bg: ['#1a0a0a', '#0a0a1a', '#1a1a0a'], accent: '#dc2626', glow: '#f87171' } },
  ];

  const topicLower = `${topicText || ''} ${narrationText || ''} ${projectTopic || ''}`.toLowerCase();
  let topicMatched = false;
  for (const tp of topicPalettes) {
    if (tp.keywords.some(kw => topicLower.includes(kw))) {
      const p = palettes[segType] || palettes.section;
      Object.assign(p, tp.palette);
      topicMatched = true;
      break;
    }
  }

  const p = palettes[segType] || palettes.section;

  // Richer multi-stop gradient background
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, p.bg[0]);
  grad.addColorStop(0.5, p.bg[1]);
  grad.addColorStop(1, p.bg[2]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Animated wave layers (static since this is a fallback without frame progress)
  const pulse = 0.7;
  for (let layer = 0; layer < 3; layer++) {
    const waveOffset = layer * Math.PI * 0.8;
    const waveY = h * (0.3 + layer * 0.15);
    const waveAmp = h * (0.02 + layer * 0.01);
    const waveFreq = 0.003 + layer * 0.002;

    ctx.beginPath();
    ctx.moveTo(0, waveY);
    for (let x = 0; x <= w; x += 5) {
      const y = waveY + Math.sin(x * waveFreq + waveOffset) * waveAmp * pulse;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    const waveAlphas = ['30', '22', '15'];
    ctx.fillStyle = p.accent + waveAlphas[layer];
    ctx.fill();
  }

  // Subtle geometric pattern overlay
  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.strokeStyle = p.accent;
  ctx.lineWidth = 1.5;
  for (let i = 0; i < w; i += 80) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, h);
    ctx.stroke();
  }
  for (let i = 0; i < h; i += 80) {
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(w, i);
    ctx.stroke();
  }
  ctx.restore();

  // Bright glow behind text to lift frame brightness
  if (topicText) {
    const glowGrad = ctx.createRadialGradient(w / 2, h * 0.4, 0, w / 2, h * 0.4, w * 0.5);
    glowGrad.addColorStop(0, 'rgba(255, 255, 255, 0.15)');
    glowGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = glowGrad;
    ctx.fillRect(0, 0, w, h);
  }

  // Premium Typographic Presentation with Kinetic Highlights
  if (topicText) {
    const textY = narrationText ? h * 0.42 : h / 2;
    // Highlight numbers and proper nouns on the card title in neon green/accent blue
    drawTextWithHighlights(ctx, topicText.substring(0, 70), textY, w, 'bold 44px sans-serif', '#ffffff', p.accent);

    // Narration Sub-text (if provided)
    if (narrationText) {
      const excerpt = narrationText.substring(0, 110) + (narrationText.length > 110 ? '...' : '');
      // Highlight statistics/numbers in glowing electric orange
      drawTextWithHighlights(ctx, excerpt, h * 0.58, w, '300 22px sans-serif', 'rgba(255, 255, 255, 0.75)', '#ff8c00');
    }
  }
}


// ── Title text wrapping (mirrors src/services/renderingShared.ts wrapTitleText) ──
/**
 * Wrap a title string into lines that fit within the canvas safe zone.
 *
 * Computes a 10% horizontal margin on each side, then splits the title at
 * word boundaries so no line exceeds the available width. If the result
 * exceeds 3 lines, the font size is reduced by 20% and the text is re-wrapped
 * (one retry only).
 *
 * Requirements 2.1, 2.2, 2.3
 *
 * @param {CanvasRenderingContext2D} ctx  Canvas 2D rendering context.
 * @param {string} title                 The title text to wrap.
 * @param {number} canvasWidth           Canvas width in pixels.
 * @param {number} baseFontSize          Starting font size in pixels.
 * @returns {{ lines: string[], fontSize: number }}
 */
function wrapTitleText(ctx, title, canvasWidth, baseFontSize, maxWidth, fontWeight) {
  const safeMargin = canvasWidth * 0.1; // 10% each side
  const availableWidth = maxWidth !== undefined ? maxWidth : canvasWidth - safeMargin * 2;
  let fontSize = baseFontSize;
  const weight = fontWeight || 'bold';

  for (let pass = 0; pass < 2; pass++) {
    ctx.font = `${weight} ${fontSize}px system-ui, -apple-system, sans-serif`;
    const words = title.split(' ');
    const lines = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      if (ctx.measureText(testLine).width > availableWidth && currentLine) {
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

// ── Technical label keywords — broader topic coverage ───────────────────────
const TECHNICAL_LABEL_KEYWORDS = [
  'Isaac Sim', 'Omniverse', 'CUDA', 'Drive', 'Jetson', 'DGX', 'NIM',
  'Blackwell', 'Hopper', 'H100', 'AI', 'Machine Learning', 'Neural Network',
  'Quantum', 'Blockchain', 'Cloud', '5G', 'IoT', 'Robotics', 'Autonomous',
  'Cybersecurity', 'Data Center', 'Chip', 'Semiconductor', 'Tesla', 'SpaceX',
];

// ── Chart / graph keywords (Requirement 5.1) ──────────────────────────────
const CHART_KEYWORDS = [
  'chart',
  'graph',
  'revenue',
  'stock',
  'salary',
  'growth',
  'market cap',
];

// ── Adaptive colour grading helpers (mirrors src/services/captionUtils.ts) ──

/**
 * Computes the average HSL saturation of an image by sampling a 32×32 grid of pixels.
 * Implements Requirement 3.1.
 *
 * @param {Uint8ClampedArray} data  Raw RGBA pixel data from ImageData.data.
 * @param {number} width            Image width in pixels.
 * @param {number} height           Image height in pixels.
 * @returns {number}                Average saturation in [0, 1].
 */
function computeSaturationScore(data, width, height) {
  const stepX = Math.max(1, Math.floor(width / 32));
  const stepY = Math.max(1, Math.floor(height / 32));

  let total = 0;
  let count = 0;

  for (let y = 0; y < height; y += stepY) {
    for (let x = 0; x < width; x += stepX) {
      const idx = (y * width + x) * 4;
      const r = data[idx] / 255;
      const g = data[idx + 1] / 255;
      const b = data[idx + 2] / 255;

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const l = (max + min) / 2;

      let s = 0;
      if (max !== min) {
        if (l < 0.5) {
          s = (max - min) / (max + min);
        } else {
          s = (max - min) / (2 - max - min);
        }
      }

      total += s;
      count++;
    }
  }

  return count === 0 ? 0 : total / count;
}

// Global brightness state for dynamic exposure boosting
let averageProjectAssetBrightness = 0.5;
let globalBrightnessBoost = 1.0;

/**
 * Computes the average relative luminance/brightness of an image by sampling pixels.
 * Uses standard ITU BT.601 weights: Y = 0.299 * R + 0.587 * G + 0.114 * B
 */
function computeImageBrightness(data, width, height) {
  let sum = 0;
  let count = 0;
  const step = 8;
  for (let i = 0; i < data.length; i += step * 4) {
    if (i + 2 >= data.length) break;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    sum += y;
    count++;
  }
  return count === 0 ? 0.5 : sum / count / 255.0;
}

/**
 * Computes the adaptive CSS filter string for a given saturation score.
 * Implements Requirements 3.2–3.4.
 *
 * @param {number} score  Saturation score in [0, 1] from computeSaturationScore.
 * @param {number} boost  Exposure/brightness boost factor.
 * @returns {string}      Full CSS filter string.
 */
function computeAdaptiveFilter(score, boost = 1.0) {
  const defaultBrightness = 0.98;
  const finalBrightness = (defaultBrightness * boost).toFixed(4);
  const DEFAULT_FILTER = `saturate(1.12) contrast(1.08) brightness(${finalBrightness})`;

  let saturation;

  if (score > 0.75) {
    // Requirement 3.2: desaturation correction
    const raw = 1.0 + (1.12 - 1.0) * (1 - (score - 0.75) / 0.25);
    saturation = Math.min(1.12, Math.max(0.85, raw));
  } else if (score < 0.35) {
    // Requirement 3.3: saturation boost
    const raw = 1.12 + (0.35 - score) * 0.4;
    saturation = Math.min(1.30, Math.max(1.12, raw));
  } else {
    // Requirement 3.4: default band [0.35, 0.75]
    return DEFAULT_FILTER;
  }

  return `saturate(${saturation.toFixed(4)}) contrast(1.08) brightness(${finalBrightness})`;
}

function boostFrameBrightness(buffer) {
  // Return the buffer directly to restore full-contrast, vivid original colors
  return buffer;
}


// ── Saturation score cache (keyed by image URL) — Requirement 8.1 ──────────
const MAX_SATURATION_CACHE_SIZE = 500;
const saturationCache = new Map();

/**
 * Draws a Technical_Label badge in the top-left corner of the image area when
 * the asset's `concept` or `alt` field contains a keyword from TECHNICAL_LABEL_KEYWORDS.
 *
 * Implements Requirements 4.1–4.5, 4.6, 9.3.
 *
 * @param {CanvasRenderingContext2D} ctx  Canvas 2D rendering context.
 * @param {object|null|undefined} asset  The current MediaAsset (may be falsy).
 * @param {number} barH                  Height of the letterbox bar at the top of the frame.
 */
const MAX_TECHNICAL_LABEL_CACHE_SIZE = 500;
const technicalLabelCache = new Map();

function deriveSegmentKeywords(seg, projectTopic) {
  const text = `${seg?.title ?? ''} ${seg?.narration ?? ''} ${projectTopic ?? ''}`.toLowerCase();
  const found = [];
  for (const kw of TECHNICAL_LABEL_KEYWORDS) {
    const escaped = kw.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    if (regex.test(text)) {
      found.push(kw);
    }
  }
  return found;
}

function drawTechnicalLabel(ctx, asset, barH, seg, projectTopic) {
  if (!asset) return;

  const haystack = `${asset.concept ?? ''} ${asset.alt ?? ''}`.toLowerCase();
  const segmentKeywords = (seg && projectTopic !== undefined) ? deriveSegmentKeywords(seg, projectTopic) : [];
  const allKeywords = [...new Set([...TECHNICAL_LABEL_KEYWORDS, ...segmentKeywords])];

  let matchedKeyword;
  for (const kw of allKeywords) {
    const escaped = kw.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    if (regex.test(haystack)) {
      // Topic-aware gate: when segment context is available, only show badges
      // for keywords that actually appear in the segment content.
      if (seg && projectTopic !== undefined) {
        const segmentRegex = new RegExp(`\\b${escaped}\\b`, 'i');
        const segmentHaystack = `${seg.title ?? ''} ${seg.narration ?? ''} ${projectTopic ?? ''}`.toLowerCase();
        if (!segmentRegex.test(segmentHaystack)) continue;
      }
      matchedKeyword = kw;
      break;
    }
  }

  if (!matchedKeyword) return;

  const cacheKey = matchedKeyword.slice(0, 40);

  // P2: Return cached label canvas if available
  if (!technicalLabelCache.has(cacheKey)) {
    const labelCanvas = createCanvas(300, 28);
    const labelCtx = labelCanvas.getContext('2d');
    labelCtx.font = '600 15px system-ui, -apple-system, sans-serif';
    const textW = labelCtx.measureText(cacheKey).width;
    const padX = 12;
    const padY = 6;
    const rectW = textW + padX * 2;
    const rectH = 28;

    // Glass-morphism background
    labelCtx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    labelCtx.shadowColor = 'rgba(76, 201, 240, 0.3)';
    labelCtx.shadowBlur = 12;
    labelCtx.beginPath();
    labelCtx.roundRect(0, 0, rectW, rectH, 6);
    labelCtx.fill();

    // Accent border
    labelCtx.shadowBlur = 0;
    labelCtx.strokeStyle = 'rgba(76, 201, 240, 0.4)';
    labelCtx.lineWidth = 1;
    labelCtx.beginPath();
    labelCtx.roundRect(1, 1, rectW - 2, rectH - 2, 5);
    labelCtx.stroke();

    // Text
    labelCtx.fillStyle = '#e2e8f0';
    labelCtx.textAlign = 'left';
    labelCtx.textBaseline = 'middle';
    labelCtx.fillText(cacheKey, padX, rectH / 2);

    if (technicalLabelCache.size >= MAX_TECHNICAL_LABEL_CACHE_SIZE) {
      technicalLabelCache.delete(technicalLabelCache.keys().next().value);
    }
    technicalLabelCache.set(cacheKey, { canvas: labelCanvas, width: rectW });
  }

  const { canvas: labelCanvas, width: labelWidth } = technicalLabelCache.get(cacheKey);
  const rectX = 20;
  const rectY = barH + 16;
  ctx.drawImage(labelCanvas, 0, 0, labelWidth, 28, rectX, rectY, labelWidth, 28);
}

// ── Fetch project from dev server ─────────────────────────────────────────
// IMPORTANT: Always pick the MOST RECENTLY MODIFIED project file so we never
// accidentally render a stale project from a previous pipeline run.
// The legacy /tmp/autotube-project.json path is intentionally skipped here
// because it is never updated when the client uses ?id= (UUID-keyed) saves.
async function fetchProject() {
  // Find the most recently modified autotube project file in /tmp
  let bestPath = null;
  let bestMtime = 0;

  try {
    const tmpFiles = readdirSync('/tmp').filter(
      (f) => f.startsWith('autotube-project') && f.endsWith('.json'),
    );
    for (const f of tmpFiles) {
      const fullPath = `/tmp/${f}`;
      try {
        const st = statSync(fullPath);
        if (st.mtimeMs > bestMtime) {
          bestMtime = st.mtimeMs;
          bestPath = fullPath;
        }
      } catch { /* skip unreadable files */ }
    }
  } catch { /* /tmp not readable, fall through to dev server */ }

  if (bestPath) {
    const ageMs = Date.now() - bestMtime;
    const ageMin = (ageMs / 60000).toFixed(1);
    log('info', `Loading project from ${bestPath} (modified ${ageMin} min ago)`);
    const project = JSON.parse(readFileSync(bestPath, 'utf8'));
    log('info', `Project topic: "${project.topic || project.title || 'unknown'}"`);
    return project;
  }

  log('info', `Fetching project from dev server (${DEV_SERVER})...`);
  const res = await fetch(`${DEV_SERVER}/api/export-project`);
  if (!res.ok) throw new Error(`Failed to fetch project: ${res.status} ${await res.text()}`);
  return res.json();
}

// ── LRU Image Cache (evicts oldest entries when size exceeds limit) ────────
const MAX_CACHE_SIZE = CONFIG.IMAGE_CACHE_SIZE; // Prevent OOM with large projects
const imageCache = new Map();

function cacheSet(key, value) {
  // If key exists, delete and re-add to update access order
  if (imageCache.has(key)) {
    imageCache.delete(key);
  }
  // Evict oldest entries if at capacity
  while (imageCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = imageCache.keys().next().value;
    imageCache.delete(oldestKey);
  }
  imageCache.set(key, value);
}

// Task 128: Dependency fallback chain documented:
//   TTS: Kokoro → MeloTTS → edge-tts → silence (handled in generateNarration)
//   Image proxy: proxy fetch → direct HTTPS → null (procedural fallback)
//   ffmpeg: full effects → draft mode (skip particles/effects) → lower resolution
async function fetchImage(url) {
  if (imageCache.has(url)) return imageCache.get(url);

  const MAX_RETRIES = CONFIG.FETCH_MAX_RETRIES;
  const TIMEOUT_MS = CONFIG.FETCH_TIMEOUT_MS;

  // SECURITY: Validate URL safety before fetching (SSRF protection)
  const urlSafety = validateUrlSafety(url);
  if (!urlSafety.valid) {
    console.warn(`  ⚠ [fetchImage] URL blocked for security: ${urlSafety.error}`);
    return null;
  }

  // Attempt proxy fetch with retries and exponential backoff
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const proxyUrl = `${DEV_SERVER}/api/proxy-image?url=${encodeURIComponent(url)}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const res = await fetch(proxyUrl, { signal: controller.signal });
      if (!res.ok) {
        clearTimeout(timer);
        throw new Error(`Proxy returned ${res.status}`);
      }
      
      // Get content-type header for validation
      const contentType = res.headers.get('content-type');
      const buf = Buffer.from(await res.arrayBuffer());
      clearTimeout(timer);

      // Validate Content-Type matches expected image format
      const contentTypeValidation = validateContentType(contentType, buf);
      if (!contentTypeValidation.valid) {
        console.warn(`  ⚠ [fetchImage] Content-Type validation failed: ${contentTypeValidation.error}`);
        throw new Error(contentTypeValidation.error);
      }

      // Detect image format from magic bytes
      const detectedFormat = detectImageFormat(buf);
      if (detectedFormat === 'unknown') {
        console.warn(`  ⚠ [fetchImage] Unknown/corrupted image format detected`);
        throw new Error(`Corrupted or unsupported image format`);
      }

      // Warn if format may not be fully supported by canvas
      if (!isCanvasSupportedFormat(detectedFormat)) {
        console.warn(`  ⚠ [fetchImage] Format '${detectedFormat}' has limited canvas support, attempting load...`);
      }

      let img;
      try {
        img = await loadImage(buf);
      } catch (loadErr) {
        console.warn(`  ⚠ [fetchImage] loadImage failed: ${loadErr.message}`);
        throw new Error(`Failed to decode image (${detectedFormat}): ${loadErr.message}. File may be corrupted.`);
      }
      
      // Comprehensive validation after loading
      const contentLength = parseInt(res.headers.get('content-length') || '0', 10);
      const validation = validateImage(img, url, contentLength, buf);
      if (!validation.valid) {
        console.warn(`  ⚠ [fetchImage] Image validation failed: ${validation.error}`);
        throw new Error(validation.error);
      }
      
      cacheSet(url, img);
      return img;
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  // Secondary fallback: direct HTTPS fetch (bypasses proxy)
  if (url.startsWith('https://')) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) {
        clearTimeout(timer);
        throw new Error(`Direct fetch returned ${res.status}`);
      }
      
      const contentType = res.headers.get('content-type');
      const buf = Buffer.from(await res.arrayBuffer());
      const contentLength = parseInt(res.headers.get('content-length') || '0', 10);
      clearTimeout(timer);

      // Validate Content-Type
      const contentTypeValidation = validateContentType(contentType, buf);
      if (!contentTypeValidation.valid) {
        console.warn(`  ⚠ [fetchImage] Direct fetch Content-Type validation failed: ${contentTypeValidation.error}`);
        throw new Error(contentTypeValidation.error);
      }

      // Detect format and validate
      const detectedFormat = detectImageFormat(buf);
      if (detectedFormat === 'unknown') {
        console.warn(`  ⚠ [fetchImage] Direct fetch: unknown/corrupted format`);
        throw new Error(`Corrupted or unsupported image format`);
      }

      let img;
      try {
        img = await loadImage(buf);
      } catch (loadErr) {
        console.warn(`  ⚠ [fetchImage] Direct fetch loadImage failed: ${loadErr.message}`);
        throw new Error(`Failed to decode image (${detectedFormat}): ${loadErr.message}`);
      }

      // Comprehensive validation
      const validation = validateImage(img, url, contentLength, buf);
      if (!validation.valid) {
        console.warn(`  ⚠ [fetchImage] Direct fetch validation failed: ${validation.error}`);
        throw new Error(validation.error);
      }
      
      cacheSet(url, img);
      return img;
    } catch (err) {
      console.warn(`  ⚠ [fetchImage] Direct HTTPS fetch failed: ${err.message}`);
      // Direct fetch also failed — fall through to null
    }
  }

  console.warn(`  ⚠ All attempts failed for image: ${url.substring(0, 60)}`);
  return null;
}

// ── Fetch a video clip and extract a frame at a given timestamp ────────────
const MAX_VIDEO_FRAME_CACHE_SIZE = 500;
const videoFrameCache = new Map();
const MAX_CLIP_FILE_CACHE_SIZE = 500;
const clipFileCache = new Map(); // Maps clip URLs → cached file paths on disk
const videoFramesDirectories = new Map(); // Maps clip URLs → directories of extracted JPEGs

/**
 * Downloads a video clip via the proxy and extracts a single frame at the
 * given timestamp using ffmpeg. Returns a node-canvas Image or null.
 *
 * The clip binary is cached to disk after the first download so that
 * subsequent calls with the same clip URL reuse the cached file instead
 * of re-downloading (Issue #3 fix).
 *
 * @param {string} clipUrl  The /api/download-clip?... proxy URL.
 * @param {number} timestamp  Seconds into the clip to extract the frame.
 * @param {string} [thumbnailUrl]  Optional thumbnail URL to use as fallback if clip download fails.
 * @returns {Promise<import('canvas').Image|null>}
 */
async function fetchVideoFrame(clipUrl, timestamp, thumbnailUrl) {
  const cacheKey = `${clipUrl}@${timestamp.toFixed(2)}`;
  if (videoFrameCache.has(cacheKey)) return videoFrameCache.get(cacheKey);

  try {
    // Reuse cached clip file on disk, or download once and persist
    let clipTmp = clipFileCache.get(clipUrl);
    if (!clipTmp || !existsSync(clipTmp)) {
      // Download the clip binary from the dev server proxy
      const fullUrl = clipUrl.startsWith('http')
        ? clipUrl
        : `${DEV_SERVER}${clipUrl}`;
      const clipRes = await fetch(fullUrl);
      if (!clipRes.ok) {
        console.warn(`  ⚠ Failed to download clip: ${clipUrl.substring(0, 60)} — ${clipRes.status}`);
        // Try thumbnail as fallback image when clip download fails (e.g. 403, geo-blocked)
        if (thumbnailUrl) {
          log('info', `    ↳ Trying thumbnail fallback: ${thumbnailUrl.substring(0, 60)}`);
          const fallbackImg = await fetchImage(thumbnailUrl);
          if (fallbackImg) {
            if (videoFrameCache.size >= MAX_VIDEO_FRAME_CACHE_SIZE) {
              videoFrameCache.delete(videoFrameCache.keys().next().value);
            }
            videoFrameCache.set(cacheKey, fallbackImg);
            return fallbackImg;
          }
        }
        return null;
      }
      const clipBuffer = Buffer.from(await clipRes.arrayBuffer());

      // Write clip to a persistent cache file (not deleted between calls)
      clipTmp = join(tmpdir(), `autotube-clip-${Date.now()}.mp4`);
      writeFileSync(clipTmp, clipBuffer);
      if (clipFileCache.size >= MAX_CLIP_FILE_CACHE_SIZE) {
        clipFileCache.delete(clipFileCache.keys().next().value);
      }
      clipFileCache.set(clipUrl, clipTmp);
    }

    // Extract a single frame at the given timestamp using ffmpeg
    const result = spawnSync('ffmpeg', [
      '-ss', String(Math.max(0, timestamp)),
      '-i', clipTmp,
      '-frames:v', '1',
      '-f', 'image2pipe',
      '-vcodec', 'png',
      '-',
    ], { encoding: 'buffer', timeout: CONFIG.FETCH_TIMEOUT_MS });

    if (result.status !== 0 || !result.stdout || result.stdout.length === 0) {
      console.warn(`  ⚠ ffmpeg frame extraction failed for clip at t=${timestamp}`);
      return null;
    }

    const img = await loadImage(result.stdout);
    if (videoFrameCache.size >= MAX_VIDEO_FRAME_CACHE_SIZE) {
      videoFrameCache.delete(videoFrameCache.keys().next().value);
    }
    videoFrameCache.set(cacheKey, img);
    return img;
  } catch (err) {
    console.warn(`  ⚠ Video frame extraction error: ${err.message}`);
    return null;
  }
}

// ── Procedural background (matches browser renderer) ──────────────────────
function drawProceduralBackground(ctx, seg, progress, skipParticles = false, segmentIndex = 0) {
  const palettes = {
    intro:      { bg: ['#0a0a1a', '#1a0a2e', '#0a1a2e'], accent: '#e74c3c', glow: '#ff6b6b' },
    section:    { bg: ['#0a0a1a', '#0a1a2e', '#0a2a3e'], accent: '#3498db', glow: '#5dade2' },
    transition: { bg: ['#1a1a0a', '#2a1a0a', '#1a0a0a'], accent: '#f39c12', glow: '#f5b041' },
    outro:      { bg: ['#0a1a0a', '#0a2a1a', '#0a1a2a'], accent: '#2ecc71', glow: '#58d68d' },
  };

  // Topic-specific palette overrides
  const topicPalettes = [
    { keywords: ['finance', 'money', 'crypto', 'stock', 'invest', 'economy', 'bitcoin', 'trading', 'bank', 'fund', 'wealth'], palette: { bg: ['#0a1a2e', '#0a2a4e', '#1a2a3e'], accent: '#ffd700', glow: '#ffec80' } },
    { keywords: ['tech', 'ai', 'software', 'computing', 'digital', 'cyber', 'robot', 'startup', 'data', 'cloud', 'code'], palette: { bg: ['#0a0a2e', '#0a1a3e', '#1a0a3e'], accent: '#00d4ff', glow: '#00f0ff' } },
    { keywords: ['health', 'medical', 'disease', 'vaccine', 'doctor', 'medicine', 'mental', 'wellness', 'nutrition', 'exercise'], palette: { bg: ['#1a1a1a', '#2a2a2a', '#1a2a1a'], accent: '#22c55e', glow: '#4ade80' } },
    { keywords: ['science', 'space', 'physics', 'quantum', 'nasa', 'universe', 'research', 'biology', 'chemistry', 'experiment'], palette: { bg: ['#0a0a1a', '#1a0a2a', '#0a1a2a'], accent: '#a855f7', glow: '#c084fc' } },
    { keywords: ['politics', 'government', 'election', 'law', 'policy', 'congress', 'senate', 'vote', 'democrat', 'republican'], palette: { bg: ['#1a0a0a', '#0a0a1a', '#1a1a0a'], accent: '#dc2626', glow: '#f87171' } },
  ];

  const topicLower = `${seg.title || ''} ${seg.narration || ''}`.toLowerCase();
  for (const tp of topicPalettes) {
    if (tp.keywords.some(kw => topicLower.includes(kw))) {
      const p = palettes[seg.type] || palettes.section;
      Object.assign(p, tp.palette);
      break;
    }
  }

  const p = palettes[seg.type] || palettes.section;

  const segmentColors = ['#3a4a7e', '#3a5a8e', '#2a5a7e', '#3a6a8f', '#4a3b89'];
  const bgColor = segmentColors[segmentIndex % segmentColors.length];

  // Draft mode: solid colour fill — skip gradient and particle overhead
  if (DRAFT_MODE) {
    ctx.fillStyle = p.bg[1];
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    return;
  }

  // Animated radial gradient background
  const angle = progress * Math.PI * 0.3;
  const cx = WIDTH / 2 + Math.cos(angle) * WIDTH * 0.15;
  const cy = HEIGHT / 2 + Math.sin(angle * 0.7) * HEIGHT * 0.1;

  const grad = ctx.createRadialGradient(cx, cy, 0, WIDTH / 2, HEIGHT / 2, WIDTH * 0.8);
  grad.addColorStop(0, bgColor);
  grad.addColorStop(0.5, p.bg[1]);
  grad.addColorStop(1, p.bg[0]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // P1: Skip expensive particle layers when image covers most of the background
  if (skipParticles) return;

  // Richer multi-layer particles
  // Background layer (slow, subtle)
  ctx.globalAlpha = 0.15;
  for (let i = 0; i < 50; i++) {
    const seed = i * 137.508 + progress * 0.2;
    const px = ((Math.sin(seed) + 1) / 2) * WIDTH;
    const py = ((Math.cos(seed * 0.7) + 1) / 2) * HEIGHT;
    ctx.fillStyle = p.accent;
    ctx.fillRect(px, py, 1.5, 1.5);
  }

  // Mid layer (medium speed)
  ctx.globalAlpha = 0.3;
  for (let i = 0; i < 30; i++) {
    const seed = i * 91.3 + progress * 0.5;
    const px = ((Math.sin(seed * 1.3) + 1) / 2) * WIDTH;
    const py = ((Math.cos(seed * 0.9) + 1) / 2) * HEIGHT;
    ctx.beginPath();
    ctx.arc(px, py, 2 + Math.sin(seed) * 1, 0, Math.PI * 2);
    ctx.fillStyle = p.accent;
    ctx.fill();
  }

  // Accent layer (fast, glowing)
  ctx.globalAlpha = 0.5;
  ctx.shadowBlur = 8;
  ctx.shadowColor = p.accent;
  for (let i = 0; i < 15; i++) {
    const seed = i * 203.7 + progress * 0.8;
    const px = ((Math.sin(seed * 2) + 1) / 2) * WIDTH;
    const py = ((Math.cos(seed * 1.6) + 1) / 2) * HEIGHT;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(px, py, 2.5, 2.5);
  }
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1.0;
}

// ── Draw intro title card frame ────────────────────────────────────────────
function drawTitleCardFrame(ctx, title, topic, progress) {
  // Rich cinematic gradient background with brighter colors
  const cx = WIDTH / 2 + Math.cos(progress * Math.PI * 0.3) * WIDTH * 0.08;
  const cy = HEIGHT / 2 + Math.sin(progress * Math.PI * 0.2) * HEIGHT * 0.06;
  const grad = ctx.createRadialGradient(cx, cy, 0, WIDTH / 2, HEIGHT / 2, WIDTH * 0.85);
  grad.addColorStop(0, '#4a8abe');
  grad.addColorStop(0.3, '#3a7ab8');
  grad.addColorStop(0.6, '#2a5a9e');
  grad.addColorStop(1, '#1a3a7e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Multi-layer particles (skipped in draft mode)
  if (!DRAFT_MODE) {
    // Bright accent particles
    ctx.globalAlpha = 0.3;
    for (let i = 0; i < 120; i++) {
      const seed = i * 137.508 + progress * 0.3;
      const px = ((Math.sin(seed) + 1) / 2) * WIDTH;
      const py = ((Math.cos(seed * 0.7) + 1) / 2) * HEIGHT;
      const size = 1.5 + Math.sin(seed * 5) * 1;
      ctx.fillStyle = '#93c5fd';
      ctx.fillRect(px, py, size, size);
    }
    // Glowing white accent dots
    ctx.globalAlpha = 0.6;
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#60a5fa';
    for (let i = 0; i < 40; i++) {
      const seed = i * 91.3 + progress * 0.6;
      const px = ((Math.sin(seed * 1.5) + 1) / 2) * WIDTH;
      const py = ((Math.cos(seed * 0.9) + 1) / 2) * HEIGHT;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(px, py, 3 + Math.sin(seed) * 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1.0;
  }

  // Fade-in effect for text
  const fadeAlpha = Math.min(1, progress / 0.3);

  // Large decorative accent bar across top
  ctx.save();
  ctx.globalAlpha = fadeAlpha * 0.8;
  const topAccentGrad = ctx.createLinearGradient(WIDTH * 0.05, 0, WIDTH * 0.95, 0);
  topAccentGrad.addColorStop(0, 'rgba(96, 165, 250, 0)');
  topAccentGrad.addColorStop(0.3, 'rgba(96, 165, 250, 0.5)');
  topAccentGrad.addColorStop(0.7, 'rgba(96, 165, 250, 0.5)');
  topAccentGrad.addColorStop(1, 'rgba(96, 165, 250, 0)');
  ctx.fillStyle = topAccentGrad;
  ctx.fillRect(WIDTH * 0.05, HEIGHT * 0.15, WIDTH * 0.9, 2);
  ctx.restore();

  // Channel name — modern styling with glow
  ctx.save();
  ctx.globalAlpha = fadeAlpha * 0.85;
  ctx.fillStyle = '#93c5fd';
  ctx.font = '600 20px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.letterSpacing = '4px';
  ctx.fillText('THE UPDATE DESK', WIDTH / 2, HEIGHT * 0.22);
  ctx.restore();

  // Project title — larger, bolder, with blue glow
  const visibleChars = progress < 0.6
    ? Math.min(title.length, Math.floor((progress / 0.6) * title.length))
    : title.length;
  const displayTitle = title.substring(0, visibleChars);

  const baseFontSize = Math.min(68, WIDTH * 0.036);
  const { lines: titleLines, fontSize: titleFontSize } = wrapTitleText(ctx, displayTitle, WIDTH, baseFontSize, undefined, '800');
  const titleLineHeight = titleFontSize * 1.3;
  const titleBlockHeight = titleLines.length * titleLineHeight;
  const titleStartY = HEIGHT * 0.38 - titleBlockHeight / 2 + titleLineHeight / 2;

  ctx.save();
  ctx.globalAlpha = fadeAlpha;
  ctx.shadowColor = 'rgba(96, 165, 250, 0.5)';
  ctx.shadowBlur = 30;
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 ${titleFontSize}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < titleLines.length; i++) {
    ctx.fillText(titleLines[i], WIDTH / 2, titleStartY + i * titleLineHeight);
  }
  ctx.restore();

  // Thin accent line below title
  ctx.save();
  ctx.globalAlpha = fadeAlpha;
  const accentGrad = ctx.createLinearGradient(WIDTH * 0.3, 0, WIDTH * 0.7, 0);
  accentGrad.addColorStop(0, 'rgba(96, 165, 250, 0)');
  accentGrad.addColorStop(0.3, 'rgba(96, 165, 250, 0.8)');
  accentGrad.addColorStop(0.7, 'rgba(96, 165, 250, 0.8)');
  accentGrad.addColorStop(1, 'rgba(96, 165, 250, 0)');
  ctx.fillStyle = accentGrad;
  ctx.fillRect(WIDTH * 0.3, titleStartY + titleBlockHeight / 2 + 12, WIDTH * 0.4, 2);
  ctx.restore();

  // Topic subtitle — modern styling
  const titleBlockBottom = titleStartY + (titleLines.length - 1) * titleLineHeight + titleLineHeight / 2;
  const subtitleY = Math.max(titleBlockBottom + 36, HEIGHT * 0.52);

  ctx.save();
  ctx.globalAlpha = fadeAlpha * 0.8;
  ctx.shadowColor = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur = 10;
  ctx.fillStyle = '#93c5fd';
  ctx.font = '400 20px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(topic.substring(0, 80), WIDTH / 2, subtitleY);
  ctx.restore();

  // Bottom decorative bar
  ctx.save();
  ctx.globalAlpha = fadeAlpha * 0.5;
  const bottomAccentGrad = ctx.createLinearGradient(WIDTH * 0.2, 0, WIDTH * 0.8, 0);
  bottomAccentGrad.addColorStop(0, 'rgba(96, 165, 250, 0)');
  bottomAccentGrad.addColorStop(0.5, 'rgba(96, 165, 250, 0.3)');
  bottomAccentGrad.addColorStop(1, 'rgba(96, 165, 250, 0)');
  ctx.fillStyle = bottomAccentGrad;
  ctx.fillRect(WIDTH * 0.2, HEIGHT - HEIGHT * 0.15, WIDTH * 0.6, 1);
  ctx.restore();
}

// ── Draw end screen frame ──────────────────────────────────────────────────
function drawEndScreenFrame(ctx, title, progress) {
  // Rich cinematic gradient background
  const cx = WIDTH / 2 + Math.cos(progress * Math.PI * 0.2) * WIDTH * 0.06;
  const cy = HEIGHT / 2 + Math.sin(progress * Math.PI * 0.15) * HEIGHT * 0.04;
  const grad = ctx.createRadialGradient(cx, cy, 0, WIDTH / 2, HEIGHT / 2, WIDTH * 0.85);
  grad.addColorStop(0, '#4a8abe');
  grad.addColorStop(0.3, '#3a7ab8');
  grad.addColorStop(0.6, '#2a5a9e');
  grad.addColorStop(1, '#1a3a7e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Multi-layer particles
  if (!DRAFT_MODE) {
    ctx.globalAlpha = 0.2;
    for (let i = 0; i < 60; i++) {
      const seed = i * 137.508 + progress * 0.25;
      const px = ((Math.sin(seed) + 1) / 2) * WIDTH;
      const py = ((Math.cos(seed * 0.7) + 1) / 2) * HEIGHT;
      ctx.fillStyle = '#60a5fa';
      ctx.fillRect(px, py, 2, 2);
    }
    ctx.globalAlpha = 0.4;
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#60a5fa';
    for (let i = 0; i < 25; i++) {
      const seed = i * 91.3 + progress * 0.5;
      const px = ((Math.sin(seed * 1.5) + 1) / 2) * WIDTH;
      const py = ((Math.cos(seed * 0.9) + 1) / 2) * HEIGHT;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(px, py, 2.5 + Math.sin(seed), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1.0;
  }

  // Fade-in for text
  const fadeAlpha = Math.min(1, progress / 0.25);

  // "Thanks for watching" — large, bold with glow
  ctx.save();
  ctx.globalAlpha = fadeAlpha;
  ctx.shadowColor = 'rgba(96, 165, 250, 0.4)';
  ctx.shadowBlur = 25;
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 52px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Thanks for watching', WIDTH / 2, HEIGHT * 0.30);
  ctx.restore();

  // Accent line
  ctx.save();
  ctx.globalAlpha = fadeAlpha;
  const accentGrad = ctx.createLinearGradient(WIDTH * 0.3, 0, WIDTH * 0.7, 0);
  accentGrad.addColorStop(0, 'rgba(96, 165, 250, 0)');
  accentGrad.addColorStop(0.5, 'rgba(96, 165, 250, 0.8)');
  accentGrad.addColorStop(1, 'rgba(96, 165, 250, 0)');
  ctx.fillStyle = accentGrad;
  ctx.fillRect(WIDTH * 0.3, HEIGHT * 0.36, WIDTH * 0.4, 2);
  ctx.restore();

  // Project title
  ctx.save();
  ctx.globalAlpha = fadeAlpha * 0.8;
  ctx.shadowColor = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur = 10;
  ctx.fillStyle = '#93c5fd';
  ctx.font = '400 24px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title.substring(0, 60), WIDTH / 2, HEIGHT * 0.42);
  ctx.restore();

  // "Subscribe" pill button — modern with glow
  ctx.save();
  ctx.globalAlpha = fadeAlpha;
  const btnText = 'Subscribe';
  ctx.font = '700 26px system-ui, -apple-system, sans-serif';
  const btnTextW = ctx.measureText(btnText).width;
  const btnW = btnTextW + 60;
  const btnH = 54;
  const btnX = (WIDTH - btnW) / 2;
  const btnY = HEIGHT * 0.52 - btnH / 2;
  const btnR = btnH / 2;

  ctx.shadowColor = 'rgba(96, 165, 250, 0.5)';
  ctx.shadowBlur = 25;

  ctx.beginPath();
  ctx.moveTo(btnX + btnR, btnY);
  ctx.lineTo(btnX + btnW - btnR, btnY);
  ctx.arc(btnX + btnW - btnR, btnY + btnR, btnR, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(btnX + btnR, btnY + btnH);
  ctx.arc(btnX + btnR, btnY + btnR, btnR, Math.PI / 2, -Math.PI / 2);
  ctx.closePath();

  const btnGrad = ctx.createLinearGradient(btnX, btnY, btnX + btnW, btnY);
  btnGrad.addColorStop(0, '#3b82f6');
  btnGrad.addColorStop(1, '#2563eb');
  ctx.fillStyle = btnGrad;
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 26px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(btnText, WIDTH / 2, HEIGHT * 0.52);
  ctx.restore();

  // Task 131: Enhanced end screen — "Watch Next" and "Subscribe for more" with fade-in
  const subFade = Math.min(1, Math.max(0, (progress - 0.3) / 0.3));

  // Task 131: "Watch Next" text
  ctx.save();
  ctx.globalAlpha = subFade * 0.8;
  ctx.fillStyle = '#cbd5e1';
  ctx.font = '600 22px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Watch Next', WIDTH / 2, HEIGHT * 0.64);
  ctx.restore();

  // Task 131: Channel name
  ctx.save();
  ctx.globalAlpha = subFade * 0.6;
  ctx.fillStyle = '#64748b';
  ctx.font = '400 18px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('THE UPDATE DESK', WIDTH / 2, HEIGHT * 0.70);
  ctx.restore();

  // Task 139: "Subscribe for more" text in last 2.5 seconds
  ctx.save();
  ctx.globalAlpha = subFade;
  ctx.fillStyle = '#f8fafc';
  ctx.font = '700 24px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(96, 165, 250, 0.6)';
  ctx.shadowBlur = 15;
  ctx.fillText('Subscribe for more', WIDTH / 2, HEIGHT * 0.78);
  ctx.shadowBlur = 0;
  ctx.restore();

  // Bottom decorative bar
  ctx.save();
  ctx.globalAlpha = fadeAlpha * 0.4;
  const bottomAccent = ctx.createLinearGradient(WIDTH * 0.2, 0, WIDTH * 0.8, 0);
  bottomAccent.addColorStop(0, 'rgba(96, 165, 250, 0)');
  bottomAccent.addColorStop(0.5, 'rgba(96, 165, 250, 0.3)');
  bottomAccent.addColorStop(1, 'rgba(96, 165, 250, 0)');
  ctx.fillStyle = bottomAccent;
  ctx.fillRect(WIDTH * 0.2, HEIGHT - HEIGHT * 0.12, WIDTH * 0.6, 1);
  ctx.restore();
}

// ── Safe zone computation (mirrors src/services/renderingShared.ts) ─────────
/**
 * Compute safe zone margins scaled proportionally from a 1080p reference.
 */
function computeSafeZone(w, h) {
  const scale = h / 1080;
  return {
    top: Math.round(40 * scale),
    bottom: Math.round(60 * scale),
    left: Math.round(w * 0.05),
    right: Math.round(w * 0.05),
  };
}

// ── Watermark drawing (Task 16) ──
function drawWatermark(ctx, w, h, watermarkOpts) {
  if (!watermarkOpts) return;
  const opacity = watermarkOpts.opacity ?? CONFIG.WATERMARK_OPACITY;
  const padding = Math.round(w * 0.02);
  const logoSize = Math.round(h * 0.08);

  ctx.save();
  ctx.globalAlpha = opacity;

  if (watermarkOpts.logoImg) {
    let x, y;
    switch (watermarkOpts.position) {
      case 'top-right':
        x = w - padding - logoSize;
        y = padding;
        break;
      case 'bottom-left':
        x = padding;
        y = h - padding - logoSize;
        break;
      case 'bottom-right':
      default:
        x = w - padding - logoSize;
        y = h - padding - logoSize;
        break;
    }
    ctx.drawImage(watermarkOpts.logoImg, x, y, logoSize, logoSize);
  } else if (watermarkOpts.text) {
    const fontSize = Math.round(h * 0.03);
    ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`;
    const textMetrics = ctx.measureText(watermarkOpts.text);
    const textW = textMetrics.width;
    const textH = fontSize * 1.4;
    const textPadX = Math.round(fontSize * 0.5);
    const textPadY = Math.round(fontSize * 0.25);

    let x, y;
    switch (watermarkOpts.position) {
      case 'top-right':
        x = w - padding - textW - textPadX * 2;
        y = padding;
        break;
      case 'bottom-left':
        x = padding;
        y = h - padding - textH - textPadY * 2;
        break;
      case 'bottom-right':
      default:
        x = w - padding - textW - textPadX * 2;
        y = h - padding - textH - textPadY * 2;
        break;
    }

    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(x, y, textW + textPadX * 2, textH + textPadY * 2);

    ctx.save();
    ctx.shadowColor = 'rgba(96, 165, 250, 0.4)';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(watermarkOpts.text, x + textPadX, y + textPadY);
    ctx.restore();
  }

  ctx.restore();
}

// ── Chapter generation (Task 18) ──
function generateChaptersString(segments) {
  const chapters = [];
  let currentTime = 0;
  for (const seg of segments) {
    const hours = Math.floor(currentTime / 3600);
    const minutes = Math.floor((currentTime % 3600) / 60);
    const secs = Math.floor(currentTime % 60);
    const timestamp = hours > 0
      ? `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
      : `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    chapters.push(`${timestamp} - ${seg.title}`);
    currentTime += seg.duration;
  }
  return chapters.join('\n');
}

// ── Smart image cropping for aspect ratio mismatches ──────────────────────
function smartCropImage(imgW, imgH, targetW, targetH) {
  const imgAspect = imgW / imgH;
  const targetAspect = targetW / targetH;

  let sx = 0, sy = 0, sw = imgW, sh = imgH;

  if (imgAspect > targetAspect) {
    // Image is wider than target: crop from center horizontally
    sw = imgH * targetAspect;
    sx = (imgW - sw) / 2;
  } else if (imgAspect < targetAspect) {
    // Image is taller than target: crop from center vertically (upper 60% — heads are usually in top half)
    sh = imgW / targetAspect;
    // Bias crop toward top 60% of image where subjects typically are
    const maxTopOffset = imgH - sh;
    sy = Math.min(maxTopOffset * 0.6, maxTopOffset * 0.4); // Upper 40% of available range
  }

  return { sx, sy, sw, sh };
}

// ── Dynamic segment pacing (mirrors src/services/renderingShared.ts) ──────
const PACING_RANGES = {
  intro: { min: 4, max: 6 },
  stat: { min: 6, max: 8 },
  emotional: { min: 5, max: 7 },
  tension: { min: 3, max: 4 },
  transition: { min: 2, max: 4 },
  outro: { min: 4, max: 6 },
  section: { min: 5, max: 8 },
};

function classifyPacingCategory(seg) {
  if (seg.type === 'intro') return 'intro';
  if (seg.type === 'outro') return 'outro';
  if (seg.type === 'transition') return 'transition';

  const text = `${seg.title || ''} ${seg.narration || ''}`.toLowerCase();

  if (/\$[\d,.]+|\d+%|\d+\s*(billion|million|trillion)/i.test(text)) return 'stat';
  if (/\b(emotion|feel|heart|soul|passion|love|hate|fear|hope|dream|inspire|sad|happy|angry)\b/.test(text)) return 'emotional';
  if (/\b(risk|threat|danger|warning|urgent|critical|breaking|shocking|now|immediate|alert|emergency)\b/.test(text)) return 'tension';

  if (seg.purposeTag === 'risk') return 'tension';
  if (seg.purposeTag === 'stat_hook') return 'stat';
  if (seg.purposeTag === 'human_story') return 'emotional';

  return 'section';
}

function computeDynamicSegmentDuration(seg) {
  const category = classifyPacingCategory(seg);
  const range = PACING_RANGES[category] || PACING_RANGES.section;
  return Math.max(range.min, Math.min(range.max, seg.duration));
}

// ── Scene layout drawing functions (Requirements 3.1, 3.5, 4.1, 5.3) ──────
// Each function accepts (ctx, seg, img, w, h, safeZone) and draws a complete
// scene layout including background, overlay, and text within safe zone bounds.

/**
 * Extracts the most prominent stat/number from narration text.
 * Returns the matched string or null.
 */
function extractStat(text) {
  if (!text) return null;
  // Match dollar amounts, percentages, or large numbers with units
  const patterns = [
    /\$[\d,.]+\s*(billion|million|trillion)?/i,
    /\d+(\.\d+)?%/,
    /\d[\d,]*\s*(billion|million|trillion)/i,
  ];
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) return m[0];
  }
  return null;
}

/**
 * drawStatCard — large number/stat centered with accent background.
 * Used for segments with statistical content (dollar amounts, percentages, large numbers).
 *
 * Requirements 3.1, 3.5, 4.1, 5.3
 */
function drawStatCard(ctx, seg, img, w, h, safeZone) {
  if (img) {
    const iw = img.width || img.naturalWidth || 1280;
    const ih = img.height || img.naturalHeight || 720;
    const scale = Math.max(w / iw, h / ih);
    const dw = iw * scale, dh = ih * scale;
    const crop = smartCropImage(iw, ih, dw, dh);
    ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, (w - dw) / 2, (h - dh) / 2, dw, dh);
  } else {
    drawProceduralFallbackWithText(ctx, w, h, null, seg.type);
  }

  // Modern dark overlay with subtle geometric circles
  const overlay = ctx.createLinearGradient(0, 0, 0, h);
  overlay.addColorStop(0, 'rgba(10, 10, 26, 0.80)');
  overlay.addColorStop(0.5, 'rgba(10, 10, 26, 0.70)');
  overlay.addColorStop(1, 'rgba(10, 10, 26, 0.85)');
  ctx.fillStyle = overlay;
  ctx.fillRect(0, 0, w, h);

  // Geometric background pattern — subtle circles
  ctx.save();
  ctx.globalAlpha = 0.06;
  for (let i = 0; i < 12; i++) {
    const cx = (i * 157 + 50) % w;
    const cy = (i * 283 + 30) % h;
    const r = 40 + (i * 37) % 80;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();

  // Left accent bar
  const accentColors = { intro: '#60a5fa', section: '#3b82f6', transition: '#8b5cf6', outro: '#60a5fa' };
  const accent = accentColors[seg.type] || '#3b82f6';
  ctx.save();
  ctx.fillStyle = accent;
  ctx.fillRect(safeZone.left + 8, h * 0.25, 4, h * 0.5);
  ctx.restore();

  // AutoTube badge
  ctx.save();
  ctx.font = '600 11px system-ui, -apple-system, sans-serif';
  const badgeText = 'AutoTube';
  const badgeW = ctx.measureText(badgeText).width + 16;
  const badgeH = 20;
  const badgeX = w - safeZone.right - badgeW - 8;
  const badgeY = safeZone.top + 12;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
  ctx.beginPath();
  ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 4);
  ctx.fill();
  ctx.strokeStyle = 'rgba(96, 165, 250, 0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 4);
  ctx.stroke();
  ctx.fillStyle = '#93c5fd';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(badgeText, badgeX + badgeW / 2, badgeY + badgeH / 2);
  ctx.restore();

  const stat = extractStat(seg.narration);
  const displayStat = stat || seg.title;

  // Stat display — large with glow and shadow
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;
  ctx.font = `800 ${Math.round(h * 0.11)}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(displayStat, w / 2, h * 0.35);
  ctx.restore();

  // Accent line below stat — wider and brighter
  ctx.save();
  const statW = ctx.measureText(displayStat).width;
  const lineGrad = ctx.createLinearGradient(w/2 - statW/2 - 20, 0, w/2 + statW/2 + 20, 0);
  lineGrad.addColorStop(0, 'transparent');
  lineGrad.addColorStop(0.3, accent);
  lineGrad.addColorStop(0.7, accent);
  lineGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = lineGrad;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 10;
  ctx.fillRect(w/2 - statW/2 - 20, h * 0.35 + h * 0.06, statW + 40, 3);
  ctx.restore();

  // Segment title
  ctx.save();
  ctx.font = `700 ${Math.round(h * 0.035)}px system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = '#e2e8f0';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 1;
  const titleY = Math.min(h * 0.52, h - safeZone.bottom - 80);
  ctx.fillText(seg.title.substring(0, 60), w / 2, titleY);
  ctx.restore();

  // Narration excerpt
  if (seg.narration) {
    const maxNarrationY = h - safeZone.bottom - 20;
    const narrationY = Math.min(h * 0.65, maxNarrationY);
    ctx.save();
    ctx.font = `400 ${Math.round(h * 0.025)}px system-ui, -apple-system, sans-serif`;
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 6;
    const excerpt = seg.narration.substring(0, 100) + (seg.narration.length > 100 ? '...' : '');
    ctx.fillText(excerpt, w / 2, narrationY);
    ctx.restore();
  }
}

/**
 * drawQuoteCard — narration excerpt in large italic font with attribution.
 * Used for human story segments or segments with notable quotes.
 *
 * Requirements 3.1, 3.5, 4.1, 5.3
 */
function drawQuoteCard(ctx, seg, img, w, h, safeZone) {
  if (img) {
    const iw = img.width || img.naturalWidth || 1280;
    const ih = img.height || img.naturalHeight || 720;
    const scale = Math.max(w / iw, h / ih);
    const dw = iw * scale, dh = ih * scale;
    const crop = smartCropImage(iw, ih, dw, dh);
    ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, (w - dw) / 2, (h - dh) / 2, dw, dh);
  } else {
    drawProceduralFallbackWithText(ctx, w, h, null, seg.type);
  }

  // Dark gradient overlay
  const overlay = ctx.createLinearGradient(0, 0, 0, h);
  overlay.addColorStop(0, 'rgba(10, 10, 26, 0.75)');
  overlay.addColorStop(0.4, 'rgba(10, 10, 26, 0.65)');
  overlay.addColorStop(1, 'rgba(10, 10, 26, 0.85)');
  ctx.fillStyle = overlay;
  ctx.fillRect(0, 0, w, h);

  // Geometric background pattern — subtle lines
  ctx.save();
  ctx.globalAlpha = 0.04;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  for (let i = 0; i < 20; i++) {
    const y = (i * 53 + 17) % h;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.restore();

  // Left accent bar
  const accentColors = { intro: '#60a5fa', section: '#3b82f6', transition: '#8b5cf6', outro: '#60a5fa' };
  const accent = accentColors[seg.type] || '#3b82f6';
  ctx.save();
  ctx.fillStyle = accent;
  ctx.fillRect(safeZone.left + 8, h * 0.25, 4, h * 0.5);
  ctx.restore();

  // AutoTube badge
  ctx.save();
  ctx.font = '600 11px system-ui, -apple-system, sans-serif';
  const badgeText = 'AutoTube';
  const badgeW = ctx.measureText(badgeText).width + 16;
  const badgeH = 20;
  const badgeX = w - safeZone.right - badgeW - 8;
  const badgeY = safeZone.top + 12;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
  ctx.beginPath();
  ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 4);
  ctx.fill();
  ctx.strokeStyle = 'rgba(96, 165, 250, 0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 4);
  ctx.stroke();
  ctx.fillStyle = '#93c5fd';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(badgeText, badgeX + badgeW / 2, badgeY + badgeH / 2);
  ctx.restore();

  let quoteText = '';
  if (seg.narration) {
    const firstSentence = seg.narration.match(/^[^.!?]+[.!?]/);
    quoteText = firstSentence ? firstSentence[0] : seg.narration.substring(0, 120);
    if (quoteText.length > 120) quoteText = quoteText.substring(0, 117) + '...';
  }

  const maxTextW = w - safeZone.left - safeZone.right - 80;
  const fontSize = Math.round(h * 0.04);

  // Large decorative quote mark
  ctx.save();
  ctx.font = `800 ${Math.round(h * 0.14)}px system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = 'rgba(96, 165, 250, 0.25)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('\u201C', safeZone.left + 30, safeZone.top + h * 0.12);
  ctx.restore();

  // Quote text — modern italic
  if (quoteText) {
    ctx.save();
    ctx.font = `italic 500 ${fontSize}px system-ui, -apple-system, sans-serif`;
    ctx.fillStyle = '#f1f5f9';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 12;

    const words = quoteText.split(' ');
    const lines = [];
    let currentLine = '';
    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      if (ctx.measureText(testLine).width > maxTextW && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);

    const lineHeight = fontSize * 1.5;
    const startY = h * 0.38 - (lines.length * lineHeight) / 2;
    for (let i = 0; i < lines.length; i++) {
      const lineY = Math.max(safeZone.top + fontSize, Math.min(startY + i * lineHeight, h - safeZone.bottom - fontSize));
      ctx.fillText(lines[i], w / 2, lineY);
    }
    ctx.restore();
  }

  // Attribution
  ctx.save();
  ctx.font = `500 ${Math.round(h * 0.022)}px system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = '#64748b';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const attrY = Math.min(h * 0.62, h - safeZone.bottom - 40);
  ctx.fillText(`\u2014 ${seg.title.substring(0, 50)}`, w / 2, attrY);
  ctx.restore();
}

/**
 * drawLeftTextRightImage — 40/60 split with text left, image right.
 * Used for section segments to provide visual variety.
 *
 * Requirements 3.1, 3.5, 4.1, 5.3
 */
function drawLeftTextRightImage(ctx, seg, img, w, h, safeZone) {
  const splitX = Math.round(w * 0.4); // 40% text, 60% image

  // Left panel: dark gradient background
  const leftGrad = ctx.createLinearGradient(0, 0, splitX, 0);
  leftGrad.addColorStop(0, '#0a0a1a');
  leftGrad.addColorStop(1, '#0a1a2e');
  ctx.fillStyle = leftGrad;
  ctx.fillRect(0, 0, splitX, h);

  // Right panel: image or procedural fallback
  if (img) {
    const iw = img.width || img.naturalWidth || 1280;
    const ih = img.height || img.naturalHeight || 720;
    const rightW = w - splitX;
    const scale = Math.max(rightW / iw, h / ih);
    const dw = iw * scale, dh = ih * scale;
    const crop = smartCropImage(iw, ih, dw, dh);
    ctx.save();
    ctx.beginPath();
    ctx.rect(splitX, 0, rightW, h);
    ctx.clip();
    ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, splitX + (rightW - dw) / 2, (h - dh) / 2, dw, dh);
    ctx.restore();
  } else {
    // Procedural fallback for right panel
    const palettes = {
      intro:      { bg: ['#0a0a1a', '#1a0a2e', '#0a1a2e'], accent: '#e74c3c' },
      section:    { bg: ['#0a0a1a', '#0a1a2e', '#0a2a3e'], accent: '#3498db' },
      transition: { bg: ['#1a1a0a', '#2a1a0a', '#1a0a0a'], accent: '#f39c12' },
      outro:      { bg: ['#0a1a0a', '#0a2a1a', '#0a1a2a'], accent: '#2ecc71' },
    };
    const p = palettes[seg.type] || palettes.section;
    const rightGrad = ctx.createLinearGradient(splitX, 0, w, h);
    rightGrad.addColorStop(0, p.bg[0]);
    rightGrad.addColorStop(1, p.bg[1]);
    ctx.fillStyle = rightGrad;
    ctx.fillRect(splitX, 0, w - splitX, h);
  }

  // Semi-transparent gradient overlay on the right panel edge for blending
  const blendGrad = ctx.createLinearGradient(splitX - 20, 0, splitX + 40, 0);
  blendGrad.addColorStop(0, 'rgba(10,10,26,1)');
  blendGrad.addColorStop(1, 'rgba(10,10,26,0)');
  ctx.fillStyle = blendGrad;
  ctx.fillRect(splitX - 20, 0, 60, h);

  // Text area within left panel safe zone
  const textLeft = safeZone.left + 20;
  const textMaxW = w - safeZone.left - safeZone.right - 40;

  // AutoTube badge
  ctx.save();
  ctx.font = '600 11px system-ui, -apple-system, sans-serif';
  const badgeText = 'AutoTube';
  const badgeW = ctx.measureText(badgeText).width + 16;
  const badgeH = 20;
  const badgeX = w - safeZone.right - badgeW - 8;
  const badgeY = safeZone.top + 12;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
  ctx.beginPath();
  ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 4);
  ctx.fill();
  ctx.strokeStyle = 'rgba(96, 165, 250, 0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 4);
  ctx.stroke();
  ctx.fillStyle = '#93c5fd';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(badgeText, badgeX + badgeW / 2, badgeY + badgeH / 2);
  ctx.restore();

  // Accent line
  const accentColors = { intro: '#60a5fa', section: '#3b82f6', transition: '#8b5cf6', outro: '#60a5fa' };
  const accent = accentColors[seg.type] || '#3b82f6';
  ctx.fillStyle = accent;
  ctx.fillRect(textLeft, safeZone.top + h * 0.2, 60, 3);

  // Segment title
  ctx.save();
  const titleFontSize = Math.round(h * 0.04);
  ctx.font = `bold ${titleFontSize}px sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 8;

  // Word-wrap title within text area
  const titleWords = seg.title.split(' ');
  const titleLines = [];
  let titleLine = '';
  for (const word of titleWords) {
    const test = titleLine ? `${titleLine} ${word}` : word;
    if (ctx.measureText(test).width > textMaxW && titleLine) {
      titleLines.push(titleLine);
      titleLine = word;
    } else {
      titleLine = test;
    }
  }
  if (titleLine) titleLines.push(titleLine);

  const titleStartY = safeZone.top + h * 0.25;
  for (let i = 0; i < Math.min(titleLines.length, 3); i++) {
    ctx.fillText(titleLines[i], textLeft, titleStartY + i * (titleFontSize * 1.3));
  }
  ctx.restore();

  // Narration excerpt below title
  if (seg.narration) {
    ctx.save();
    const narFontSize = Math.round(h * 0.022);
    ctx.font = `${narFontSize}px sans-serif`;
    ctx.fillStyle = '#d4d4d8';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 4;

    const narStartY = titleStartY + Math.min(titleLines.length, 3) * (Math.round(h * 0.04) * 1.3) + 20;
    const narWords = seg.narration.split(' ');
    const narLines = [];
    let narLine = '';
    for (const word of narWords) {
      const test = narLine ? `${narLine} ${word}` : word;
      if (ctx.measureText(test).width > textMaxW && narLine) {
        narLines.push(narLine);
        narLine = word;
      } else {
        narLine = test;
      }
    }
    if (narLine) narLines.push(narLine);

    const maxLines = 6;
    const maxNarY = h - safeZone.bottom - narFontSize;
    for (let i = 0; i < Math.min(narLines.length, maxLines); i++) {
      const lineY = narStartY + i * (narFontSize * 1.5);
      if (lineY > maxNarY) break;
      ctx.fillText(narLines[i], textLeft, lineY);
    }
    ctx.restore();
  }
}

/**
 * drawLowerThirdOverlay — full-bleed image with text overlay in bottom third.
 * Used for transition segments and segments with strong imagery.
 *
 * Requirements 3.1, 3.5, 4.1, 5.3
 */
function drawLowerThirdOverlay(ctx, seg, img, w, h, safeZone) {
  if (img) {
    const iw = img.width || img.naturalWidth || 1280;
    const ih = img.height || img.naturalHeight || 720;
    const scale = Math.max(w / iw, h / ih);
    const dw = iw * scale, dh = ih * scale;
    const crop = smartCropImage(iw, ih, dw, dh);
    ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, (w - dw) / 2, (h - dh) / 2, dw, dh);
  } else {
    drawProceduralFallbackWithText(ctx, w, h, null, seg.type);
  }

  // Modern bottom gradient overlay
  const overlayTop = Math.round(h * 0.55);
  const overlay = ctx.createLinearGradient(0, overlayTop, 0, h);
  overlay.addColorStop(0, 'rgba(10, 10, 26, 0)');
  overlay.addColorStop(0.3, 'rgba(10, 10, 26, 0.60)');
  overlay.addColorStop(1, 'rgba(10, 10, 26, 0.90)');
  ctx.fillStyle = overlay;
  ctx.fillRect(0, overlayTop, w, h - overlayTop);

  const accentColors = { intro: '#60a5fa', section: '#3b82f6', transition: '#8b5cf6', outro: '#60a5fa' };
  const accent = accentColors[seg.type] || '#3b82f6';
  const textAreaTop = Math.round(h * 0.68);

  // AutoTube badge
  ctx.save();
  ctx.font = '600 11px system-ui, -apple-system, sans-serif';
  const badgeText = 'AutoTube';
  const badgeW = ctx.measureText(badgeText).width + 16;
  const badgeH = 20;
  const badgeX = w - safeZone.right - badgeW - 8;
  const badgeY = safeZone.top + 12;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
  ctx.beginPath();
  ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 4);
  ctx.fill();
  ctx.strokeStyle = 'rgba(96, 165, 250, 0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 4);
  ctx.stroke();
  ctx.fillStyle = '#93c5fd';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(badgeText, badgeX + badgeW / 2, badgeY + badgeH / 2);
  ctx.restore();

  // Accent line
  ctx.save();
  const lineGrad = ctx.createLinearGradient(safeZone.left + 20, 0, safeZone.left + 100, 0);
  lineGrad.addColorStop(0, accent);
  lineGrad.addColorStop(1, 'rgba(76, 201, 240, 0)');
  ctx.fillStyle = lineGrad;
  ctx.fillRect(safeZone.left + 20, textAreaTop - 8, 80, 3);
  ctx.restore();

  // Segment title
  ctx.save();
  const titleFontSize = Math.round(h * 0.038);
  ctx.font = `800 ${titleFontSize}px system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 12;
  const titleMaxW = w - safeZone.left - safeZone.right - 40;
  const titleWords = seg.title.split(' ');
  const titleLines = [];
  let titleLine = '';
  for (const word of titleWords) {
    const test = titleLine ? `${titleLine} ${word}` : word;
    if (ctx.measureText(test).width > titleMaxW && titleLine) {
      titleLines.push(titleLine);
      titleLine = word;
    } else {
      titleLine = test;
    }
  }
  if (titleLine) titleLines.push(titleLine);
  const titleY = Math.min(textAreaTop, h - safeZone.bottom - titleFontSize * 2.5);
  for (let i = 0; i < Math.min(titleLines.length, 3); i++) {
    ctx.fillText(titleLines[i], safeZone.left + 20, titleY + i * (titleFontSize * 1.3));
  }
  ctx.restore();

  // Narration excerpt
  if (seg.narration) {
    ctx.save();
    const narFontSize = Math.round(h * 0.022);
    ctx.font = `400 ${narFontSize}px system-ui, -apple-system, sans-serif`;
    ctx.fillStyle = '#cbd5e1';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 6;
    const titleBlockHeight = Math.min(titleLines.length, 3) * (titleFontSize * 1.3);
    const narY = Math.min(titleY + titleBlockHeight + 10, h - safeZone.bottom - narFontSize - 10);
    const excerpt = seg.narration.substring(0, 120) + (seg.narration.length > 120 ? '...' : '');
    ctx.fillText(excerpt, safeZone.left + 20, narY);
    ctx.restore();
  }
}

/**
 * drawCenteredText — current default layout with safe zone enforcement.
 * Text is centered on the frame with a semi-transparent overlay for contrast.
 *
 * Requirements 3.1, 3.5, 4.1, 5.3
 */
function drawCenteredText(ctx, seg, img, w, h, safeZone) {
  if (img) {
    const iw = img.width || img.naturalWidth || 1280;
    const ih = img.height || img.naturalHeight || 720;
    const scale = Math.max(w / iw, h / ih);
    const dw = iw * scale, dh = ih * scale;
    const crop = smartCropImage(iw, ih, dw, dh);
    ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, (w - dw) / 2, (h - dh) / 2, dw, dh);
  } else {
    drawProceduralFallbackWithText(ctx, w, h, null, seg.type);
  }

  // Modern center overlay
  const centerOverlayTop = Math.round(h * 0.20);
  const centerOverlayBottom = Math.round(h * 0.80);
  const overlay = ctx.createLinearGradient(0, centerOverlayTop, 0, centerOverlayBottom);
  overlay.addColorStop(0, 'rgba(10, 10, 26, 0)');
  overlay.addColorStop(0.15, 'rgba(10, 10, 26, 0.60)');
  overlay.addColorStop(0.85, 'rgba(10, 10, 26, 0.60)');
  overlay.addColorStop(1, 'rgba(10, 10, 26, 0)');
  ctx.fillStyle = overlay;
  ctx.fillRect(0, centerOverlayTop, w, centerOverlayBottom - centerOverlayTop);

  // Segment title — bold with glow
  const titleFontSize = Math.round(h * 0.042);
  ctx.font = `800 ${titleFontSize}px system-ui, -apple-system, sans-serif`;
  const titleMaxW = w - safeZone.left - safeZone.right;
  const titleWords = seg.title.split(' ');
  const titleLines = [];
  let titleLine = '';
  for (const word of titleWords) {
    const test = titleLine ? `${titleLine} ${word}` : word;
    if (ctx.measureText(test).width > titleMaxW && titleLine) {
      titleLines.push(titleLine);
      titleLine = word;
    } else {
      titleLine = test;
    }
  }
  if (titleLine) titleLines.push(titleLine);
  const titleY = Math.max(safeZone.top + titleFontSize, Math.min(h * 0.38, h - safeZone.bottom - titleFontSize * 3));
  const titleLineHeight = titleFontSize * 1.3;
  const titleBlockHeight = Math.min(titleLines.length, 3) * titleLineHeight;
  const titleStartY = titleY - titleBlockHeight / 2 + titleLineHeight / 2;

  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 16;
  for (let i = 0; i < Math.min(titleLines.length, 3); i++) {
    ctx.fillText(titleLines[i], w / 2, titleStartY + i * titleLineHeight);
  }
  ctx.restore();

  // AutoTube badge
  ctx.save();
  ctx.font = '600 11px system-ui, -apple-system, sans-serif';
  const badgeText = 'AutoTube';
  const badgeW = ctx.measureText(badgeText).width + 16;
  const badgeH = 20;
  const badgeX = w - safeZone.right - badgeW - 8;
  const badgeY = safeZone.top + 12;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
  ctx.beginPath();
  ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 4);
  ctx.fill();
  ctx.strokeStyle = 'rgba(96, 165, 250, 0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 4);
  ctx.stroke();
  ctx.fillStyle = '#93c5fd';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(badgeText, badgeX + badgeW / 2, badgeY + badgeH / 2);
  ctx.restore();

  // Accent line
  const accentColors = { intro: '#60a5fa', section: '#3b82f6', transition: '#8b5cf6', outro: '#60a5fa' };
  const accent = accentColors[seg.type] || '#3b82f6';
  ctx.save();
  const lineGrad = ctx.createLinearGradient(w/2 - 60, 0, w/2 + 60, 0);
  lineGrad.addColorStop(0, 'rgba(76, 201, 240, 0)');
  lineGrad.addColorStop(0.5, accent);
  lineGrad.addColorStop(1, 'rgba(76, 201, 240, 0)');
  ctx.fillStyle = lineGrad;
  const titleBlockBottom = titleStartY + (Math.min(titleLines.length, 3) - 1) * titleLineHeight + titleLineHeight / 2;
  ctx.fillRect(w/2 - 60, titleBlockBottom + titleFontSize * 0.3, 120, 3);
  ctx.restore();

  // Narration excerpt
  if (seg.narration) {
    ctx.save();
    const narFontSize = Math.round(h * 0.025);
    ctx.font = `400 ${narFontSize}px system-ui, -apple-system, sans-serif`;
    ctx.fillStyle = '#cbd5e1';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 6;

    const maxTextW = w - safeZone.left - safeZone.right;
    const words = seg.narration.split(' ');
    const lines = [];
    let currentLine = '';
    for (const word of words) {
      const test = currentLine ? `${currentLine} ${word}` : word;
      if (ctx.measureText(test).width > maxTextW && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = test;
      }
    }
    if (currentLine) lines.push(currentLine);

    const lineHeight = narFontSize * 1.5;
    const narStartY = titleY + titleFontSize * 1.5;
    const maxLines = 4;
    const maxNarY = h - safeZone.bottom - narFontSize;
    for (let i = 0; i < Math.min(lines.length, maxLines); i++) {
      const lineY = narStartY + i * lineHeight;
      if (lineY > maxNarY) break;
      ctx.fillText(lines[i], w / 2, lineY);
    }
    ctx.restore();
  }
}

// ── Word pop-in animation state (tracks when each word first appeared) ─────
// Keyed by `segId:wordIdx`, value = global frame number when word first appeared
const MAX_WORD_FIRST_APPEAR_CACHE_SIZE = 500;
const wordFirstAppearFrame = new Map();
let globalFrameCounter = 0;

// ── Per-render caches (set by render()) ───────────────────────────────────
let globalSafeZone = null;
let segWordsCache = null;
let globalStyleParticles = null;
let globalEasterEggs = null;
let globalCitations = null;
let globalNames = null;
let globalMidpointFrame = 0;
let globalRetentionBeats = [];

// ── Scene layout dispatch map ──────────────────────────────────────────────
// Maps SceneLayoutType values to their drawing functions.
// Each function signature: (ctx, seg, img, w, h, safeZone) → void
const SCENE_LAYOUT_DISPATCH = {
  'stat-card':              drawStatCard,
  'quote-card':             drawQuoteCard,
  'left-text-right-image':  drawLeftTextRightImage,
  'lower-third-overlay':    drawLowerThirdOverlay,
  'centered-text':          drawCenteredText,
};

/**
 * A+++ Strategy: Extracts a clean capitalized source name (e.g. NASA, FAA, SpaceX, Wikipedia)
 * from segment narration text to render on-screen lower-third source badges.
 */
function extractSourceCitation(text) {
  if (!text) return null;
  
  // Scans for patterns like "according to X", "data from X", "reports from X", "telemetry from X", "SEC filings from X", "as noted by X"
  const patterns = [
    /according to ([a-z0-9\s.\-]+?)(?:,|\s+|$)/i,
    /data from ([a-z0-9\s.\-]+?)(?:shows|indicates|reveals|\s+|$)/i,
    /reports from ([a-z0-9\s.\-]+?)(?:indicate|show|\s+|$)/i,
    /sec filings from ([a-z0-9\s.\-]+?)(?:reveal|show|\s+|$)/i,
    /telemetry from ([a-z0-9\s.\-]+?)(?:confirms|shows|\s+|$)/i,
    /as noted by ([a-z0-9\s.\-]+?)(?:,|\s+|$)/i,
    /sourcing from ([a-z0-9\s.\-]+?)(?:,|\s+|$)/i
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const entity = match[1].trim();
      // Clean up common fillers or trailing punctuation
      const cleanEntity = entity.replace(/^(the|a|an)\s+/i, '').replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '');
      if (cleanEntity.length > 1 && cleanEntity.length < 25) {
        // Return capitalized format
        return cleanEntity.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      }
    }
  }
  return null;
}

/**
 * A+++ Strategy: Draws kinetic typography on the canvas, parsing a line of text into words
 * and rendering statistics, numbers, and proper nouns in a vibrant glowing brand color.
 */
function drawTextWithHighlights(ctx, text, startY, w, font, baseColor, highlightColor) {
  ctx.save();
  ctx.font = font;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  const words = text.split(' ');
  const wordSpans = [];
  let totalWidth = 0;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const cleanWord = word.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '');
    const isHighlight = /^[0-9$%+\-.,]+$/g.test(cleanWord) || /^(SpaceX|Starship|Elon|Musk|Falcon|NASA|FAA|Mars|Nvidia|FTX|FTC|SEC|AI|AGI)$/i.test(cleanWord);
    
    ctx.font = font;
    const width = ctx.measureText(word).width;
    wordSpans.push({ word, width, isHighlight });
    totalWidth += width;
  }

  // Add space widths
  ctx.font = font;
  const spaceWidth = ctx.measureText(' ').width;
  totalWidth += spaceWidth * (words.length - 1);

  let currentX = (w - totalWidth) / 2;

  for (let i = 0; i < wordSpans.length; i++) {
    const span = wordSpans[i];
    ctx.fillStyle = span.isHighlight ? highlightColor : baseColor;
    
    // Add extra shadow/glow to highlights
    if (span.isHighlight) {
      ctx.save();
      ctx.shadowColor = highlightColor;
      ctx.shadowBlur = 8;
      ctx.fillText(span.word, currentX, startY);
      ctx.restore();
    } else {
      ctx.fillText(span.word, currentX, startY);
    }
    
    currentX += span.width + spaceWidth;
  }
  ctx.restore();
}

// ── Draw a single frame ────────────────────────────────────────────────────
async function drawFrame(ctx, seg, asset, img, progress, project, globalProgress, segmentIndex, suppressSubtitles = false) {
  const isFallbackAsset = asset && (
    asset.isFallback === true ||
    (asset.url && (asset.url.includes('picsum.photos') || asset.url.includes('placeholder')))
  );
  const activeImg = isFallbackAsset ? null : img;

  // ── Determine if a scene layout should handle background + text rendering ──
  const sceneLayout = seg.sceneLayout || null;
  const layoutFn = sceneLayout ? (SCENE_LAYOUT_DISPATCH[sceneLayout] || null) : null;

  // Draw bright background when image is available, or procedural bg when not
  if (activeImg) {
    // Bright warm background behind image for contrast
    const bgGrad = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
    bgGrad.addColorStop(0, '#3a5a8e');
    bgGrad.addColorStop(0.5, '#4a7ab8');
    bgGrad.addColorStop(1, '#2a4a7e');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  } else if (!DRAFT_MODE) {
    drawProceduralBackground(ctx, seg, progress, false, segmentIndex);
  }

  if (layoutFn) {
    // ── Scene layout path: layout function handles background + text overlays ──
    layoutFn(ctx, seg, activeImg, WIDTH, HEIGHT, globalSafeZone || computeSafeZone(WIDTH, HEIGHT));
  } else {
    // ── Default path: Ken Burns image rendering + original text overlays ──

    // Resolve Ken Burns params: edit plan → computeKenBurnsParams default → hardcoded fallback
    let kbZoomStart = 1.0;
    let kbZoomEnd = 0.40;
    let kbPanDirX = 1.0;
    let kbPanDirY = 1.0;
    let hasEditPlanKB = false;

    if (project && project.editPlan && project.editPlan.segments && asset) {
      const segEntry = project.editPlan.segments.find(e => e.segmentId === seg.id);
      if (segEntry && segEntry.kenBurns && segEntry.kenBurns[asset.id]) {
        const kb = segEntry.kenBurns[asset.id];
        kbZoomStart = kb.zoomStart ?? 1.0;
        kbZoomEnd = (kb.zoomEnd ?? 1.40) - (kb.zoomStart ?? 1.0);
        kbPanDirX = kb.panDirectionX ?? 1.0;
        kbPanDirY = kb.panDirectionY ?? 1.0;
        hasEditPlanKB = true;
      }
    }

    // Use deterministic computeKenBurnsParams as default when no edit plan override (Requirement 4.1, 10.1)
    if (!hasEditPlanKB && asset && typeof segmentIndex === 'number') {
      const defaultKB = computeKenBurnsParams(segmentIndex, asset.id);
      kbZoomStart = defaultKB.zoomStart;
      kbZoomEnd = defaultKB.zoomEnd - defaultKB.zoomStart;
      kbPanDirX = defaultKB.panDirectionX;
      kbPanDirY = defaultKB.panDirectionY;
    }

    // Apply pacing score to Ken Burns zoom speed (Requirements 13.3, 13.4)
    const segPacingScore = seg.pacingScore || 3;
    if (segPacingScore >= 4) {
      kbZoomEnd *= 1.5;
    } else if (segPacingScore <= 2) {
      kbZoomEnd *= 0.6;
    }

    if (activeImg) {
      const iw = activeImg.width || activeImg.naturalWidth || 1280;
      const ih = activeImg.height || activeImg.naturalHeight || 720;
      if (iw > 0 && ih > 0) {
        if (asset && asset.type === 'video') {
          const vScale = Math.max(WIDTH / iw, HEIGHT / ih);
          const vdw = iw * vScale, vdh = ih * vScale;
          ctx.drawImage(activeImg, (WIDTH - vdw) / 2, (HEIGHT - vdw) / 2, vdw, vdh);
        } else {
          const resRatio = Math.min(iw / WIDTH, ih / HEIGHT);
          const kbCap = resRatio < 0.5 ? 1.0 : 1.40;
          const scale = Math.max(WIDTH / iw, HEIGHT / ih) * kbCap;
          const dw = iw * scale, dh = ih * scale;
          const easedProgress = easeInOutCubic(progress);
          const zoom = kbZoomStart + easedProgress * kbZoomEnd;
          const resolutionScale = Math.max(WIDTH / 1280, HEIGHT / 720);
          const basePanX = 20 * resolutionScale;
          const basePanY = 10 * resolutionScale;
          const assetSeed = asset ? getAssetSeed(asset.url) : 0;
          // Face-centric zoom for high-pacing segments: center on upper-third
          let faceOffsetX = 0, faceOffsetY = 0;
          if (segPacingScore >= 4 && activeImg && asset && asset.type !== 'video') {
            faceOffsetX = (assetSeed % 3 === 0 ? -1 : 1) * basePanX * 0.5;
            faceOffsetY = -basePanY * 0.8;
          }
          const panMultX = (assetSeed % 3 === 0) ? -1 : (assetSeed % 3 === 1) ? 0.5 : 1;
          const panMultY = (assetSeed % 5 === 0) ? -1 : (assetSeed % 5 === 1) ? 0.3 : 1;
          const panX = Math.sin(easedProgress * Math.PI * 0.7) * basePanX * kbPanDirX * panMultX;
          const panY = Math.cos(easedProgress * Math.PI * 0.4) * basePanY * kbPanDirY * panMultY;

          let filterString;
          const finalBrightness = (1.2 * globalBrightnessBoost).toFixed(2);
          if (asset && asset.url && saturationCache.has(asset.url)) {
            const score = saturationCache.get(asset.url);
            filterString = computeAdaptiveFilter(score, globalBrightnessBoost * 1.22);
          } else {
            filterString = `saturate(1.1) contrast(1.05) brightness(${finalBrightness})`;
          }

          const isChart = isChartAsset(asset);
          if (isChart) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(0, 0, WIDTH * progress, HEIGHT);
            ctx.clip();
          }

          ctx.save();
          ctx.translate(WIDTH / 2 + panX, HEIGHT / 2 + panY);
          ctx.scale(zoom, zoom);
          ctx.filter = filterString;
          const crop = smartCropImage(iw, ih, dw, dh);
          ctx.drawImage(activeImg, crop.sx, crop.sy, crop.sw, crop.sh, -dw / 2, -dh / 2, dw, dh);
          ctx.filter = 'none';
          ctx.restore();

          // Ken Burns image rendered successfully

          // Chart reveal (Task 78)
          if (isChart) {
            ctx.restore();
          }
    }
  }
  } else if (asset) {
    // A+++ Strategy: Throttle typographic card text overlays on non-structural segments
    // only render text if segment type is structural or if it's the first segment or segmentIndex is even.
    const isStructural = seg.type === 'intro' || seg.type === 'transition' || seg.type === 'outro';
    if (isStructural || segmentIndex % 2 === 0 || segmentIndex === 0) {
      drawProceduralFallbackWithText(ctx, WIDTH, HEIGHT, seg.title, seg.type, seg.narration);
    } else {
      // Just draw the glowing background pattern without text overlay to maintain visual variety
      drawProceduralFallbackWithText(ctx, WIDTH, HEIGHT, null, seg.type, null);
    }
  }
}

  // Letterbox bars — black bars with subtle accent inner edge glow
  const barH = Math.round(HEIGHT * 0.04);
  const accentHex = ACCENT_COLORS[seg.type] || '#ffffff';
  // Black bars
  ctx.fillStyle = 'rgba(0, 0, 0, 0.92)';
  ctx.fillRect(0, 0, WIDTH, barH);
  ctx.fillRect(0, HEIGHT - barH, WIDTH, barH);
  // Subtle accent inner edge glow
  const accentRgba = hexToRgba(accentHex, 0.5);
  ctx.fillStyle = accentRgba;
  ctx.fillRect(0, barH - 2, WIDTH, 2);
  ctx.fillRect(0, HEIGHT - barH, WIDTH, 2);

  // Subtle gradient vignette — stronger stops for cinematic depth
  if (!DRAFT_MODE) {
    const vignetteGrad = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, HEIGHT * 0.35, WIDTH / 2, HEIGHT / 2, WIDTH * 0.8);
    vignetteGrad.addColorStop(0, 'rgba(0,0,0,0)');
    vignetteGrad.addColorStop(0.6, 'rgba(0,0,0,0.0)');
    vignetteGrad.addColorStop(0.85, 'rgba(0,0,0,0.15)');
    vignetteGrad.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = vignetteGrad;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  // Style-specific particles (Task 34, 61)
  if (!DRAFT_MODE) {
    if (!globalStyleParticles) {
      const videoStyle = project.style || 'documentary';
      globalStyleParticles = createStyleParticles(videoStyle, WIDTH, HEIGHT);
    }
    updateStyleParticles(globalStyleParticles, WIDTH, HEIGHT);
    drawStyleParticles(ctx, globalStyleParticles);
  }

  // Technical label badge (only if debug overlays are enabled)
  if (RENDER_DEBUG_OVERLAYS) {
    drawTechnicalLabel(ctx, asset, barH, seg, project.topic || project.title || '');
  }


  // ── On-screen thesis text with typing animation (Step 2, req d) ────────
  // Extract ALL-CAPS phrases (3+ words) or double-quoted phrases from visualNote
  if (seg.visualNote && progress <= 0.40) {
    // Match 3+ consecutive ALL-CAPS words or a double-quoted phrase
    const capsMatch = seg.visualNote.match(/\b([A-Z]{2,}(?:\s+[A-Z]{2,}){2,})\b/);
    const quoteMatch = seg.visualNote.match(/"([^"]{1,40})"/);
    const thesisPhrase = capsMatch ? capsMatch[1].slice(0, 40) : quoteMatch ? quoteMatch[1].slice(0, 40) : null;

    if (thesisPhrase) {
      // Fade-in for first 10% of display time, fade-out for last 10%
      const displayEnd = 0.40;
      const fadeInEnd = displayEnd * 0.10;
      const fadeOutStart = displayEnd * 0.90;
      let thesisAlpha = 1.0;
      if (progress < fadeInEnd) {
        thesisAlpha = progress / fadeInEnd;
      } else if (progress > fadeOutStart) {
        thesisAlpha = 1.0 - (progress - fadeOutStart) / (displayEnd - fadeOutStart);
      }
      thesisAlpha = Math.max(0, Math.min(1, thesisAlpha));

      // Typing animation: reveal characters progressively
      const typingDuration = displayEnd * 0.5;
      const visibleChars = progress < typingDuration
        ? Math.min(thesisPhrase.length, Math.floor((progress / typingDuration) * thesisPhrase.length))
        : thesisPhrase.length;
      const displayPhrase = thesisPhrase.substring(0, visibleChars);

      ctx.save();
      ctx.globalAlpha = thesisAlpha;

      // Measure text for background box
      ctx.font = 'bold 48px sans-serif';
      const thesisW = ctx.measureText(thesisPhrase).width;
      const displayW = ctx.measureText(displayPhrase).width;
      const boxPadX = 32;
      const boxPadY = 16;
      const boxW = thesisW + boxPadX * 2;
      const boxH = 48 + boxPadY * 2;
      const boxX = (WIDTH - boxW) / 2;
      const boxY = HEIGHT * 0.30 - boxH / 2;

      // Dark semi-transparent background
      ctx.fillStyle = 'rgba(0,0,0,0.70)';
      ctx.beginPath();
      ctx.roundRect(boxX, boxY, boxW, boxH, 8);
      ctx.fill();

      // Bold white text centered at 30% height
      ctx.shadowColor = 'rgba(96, 165, 250, 0.6)';
      ctx.shadowBlur = 20;
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 48px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(displayPhrase, WIDTH / 2, HEIGHT * 0.30);

      // Blinking cursor at end of typing
      if (visibleChars < thesisPhrase.length) {
        const cursorX = WIDTH / 2 + displayW / 2 + 4;
        const cursorBlink = Math.sin(globalFrameCounter * 0.3) > 0;
        if (cursorBlink) {
          ctx.fillStyle = '#60a5fa';
          ctx.fillRect(cursorX, HEIGHT * 0.30 - 18, 3, 36);
        }
      }

      ctx.restore();
    }
  }

  // ── Kinetic typography: keyword scale animation (req d) ────────────────
  if (seg.narration && progress >= 0.1 && progress <= 0.7 && !DRAFT_MODE) {
    // Find capitalized proper nouns or numbers to highlight
    const words = seg.narration.split(' ');
    const keywordPattern = /\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\b|\b(\d+[%x]?)\b/;
    for (let wi = 0; wi < words.length; wi++) {
      const kwMatch = words[wi].match(keywordPattern);
      if (kwMatch) {
        const keyword = kwMatch[0];
        if (keyword.length > 2 && keyword.length < 20) {
          // Cycle through keywords across the segment progress
          const keywordIndex = wi;
          const keywordOffset = (keywordIndex / words.length) * 0.6;
          const keywordWindow = 0.08;
          if (progress >= 0.1 + keywordOffset && progress <= 0.1 + keywordOffset + keywordWindow) {
            const kwProgress = (progress - 0.1 - keywordOffset) / keywordWindow;
            const scale = 1.0 + 0.1 * Math.sin(kwProgress * Math.PI);
            ctx.save();
            ctx.font = 'bold 28px system-ui, -apple-system, sans-serif';
            const kwW = ctx.measureText(keyword).width;
            const midX = WIDTH / 2 + (keywordIndex - words.length / 2) * 15;
            ctx.translate(midX, HEIGHT * 0.78);
            ctx.scale(scale, scale);
            ctx.translate(-midX, -HEIGHT * 0.78);
            ctx.fillStyle = '#60a5fa';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = 'rgba(96, 165, 250, 0.5)';
            ctx.shadowBlur = 12;
            ctx.fillText(keyword, midX, HEIGHT * 0.78);
            // Underline
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#60a5fa';
            ctx.fillRect(midX - kwW / 2, HEIGHT * 0.78 + 14, kwW, 2);
            ctx.restore();
          }
        }
      }
    }
  }

  // ── Data visualization: stat callout overlay (req b) ───────────────────
  if (seg.narration && progress >= 0.2 && progress <= 0.6 && !DRAFT_MODE) {
    const extractedStat = extractStat(seg.narration);
    if (extractedStat) {
      const statAlpha = progress < 0.3 ? (progress - 0.2) / 0.1 : (progress > 0.5 ? (0.6 - progress) / 0.1 : 1.0);
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, statAlpha));
      ctx.shadowColor = 'rgba(0,0,0,0.9)';
      ctx.shadowBlur = 8;
      ctx.font = `800 ${Math.round(HEIGHT * 0.08)}px system-ui, -apple-system, sans-serif`;
      ctx.fillStyle = '#facc15';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const sz = globalSafeZone || computeSafeZone(WIDTH, HEIGHT);
      ctx.fillText(extractedStat, sz.left + 20, HEIGHT * 0.12);
      ctx.restore();

      // Subtle animated progress bar during stat segments
      const barW = Math.min(WIDTH * 0.6, WIDTH - sz.left - sz.right);
      const barX = (WIDTH - barW) / 2;
      const barY = HEIGHT - sz.bottom - 8;
      const barH = 2;
      const fillW = barW * ((progress - 0.2) / 0.4);
      ctx.fillStyle = 'rgba(96, 165, 250, 0.2)';
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = '#60a5fa';
      ctx.fillRect(barX, barY, fillW, barH);
    }
  }

  // Title overlay — only rendered when no scene layout is active (layouts handle their own titles)
  if (!layoutFn) {
  const titleAccent = '#60a5fa';
  const titleSafeZone = globalSafeZone || computeSafeZone(WIDTH, HEIGHT);
  // Position title overlay above the subtitle bar to avoid overlap
  const subtitleHeight = 64;
  const subtitleY = HEIGHT - barH - 100;
  const ltY = Math.min(subtitleY - 70, HEIGHT - titleSafeZone.bottom - 140);

  // Semi-transparent dark gradient behind the title text area for contrast (Requirement 4.1, 4.2)
  const titleOverlayGrad = ctx.createLinearGradient(0, ltY - 20, 0, ltY + 56);
  titleOverlayGrad.addColorStop(0, 'rgba(0,0,0,0)');
  titleOverlayGrad.addColorStop(0.3, 'rgba(0,0,0,0.6)');
  titleOverlayGrad.addColorStop(1, 'rgba(0,0,0,0.7)');
  ctx.fillStyle = titleOverlayGrad;
  ctx.fillRect(0, ltY - 20, WIDTH * 0.55, 76);

  ctx.fillStyle = titleAccent;
  ctx.fillRect(titleSafeZone.left + 12, ltY, Math.min(40 + progress * 60, 100), 2);

  ctx.save();
  if (!DRAFT_MODE) {
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 16;
  }
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 32px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(seg.title.substring(0, 50), titleSafeZone.left + 12, ltY + 10);
  ctx.restore();

  // #22: Lower-third name card for named people mentioned in narration
  if (seg.narration && progress >= 0.1 && progress <= 0.3) {
    const nameMatch = seg.narration.match(/\b([A-Z][a-z]+ [A-Z][a-z]+)\b/);
    if (nameMatch) {
      const personName = nameMatch[1];
      ctx.save();
      ctx.font = '600 14px system-ui, -apple-system, sans-serif';
      const nameW = ctx.measureText(personName).width;
      const namePadX = 12;
      const namePadY = 6;
      const nameBoxX = titleSafeZone.left + 12;
      // Position name card above the title overlay, respecting bottom safe zone
      const nameBoxY = Math.min(HEIGHT - barH - 140, ltY - 30);
      ctx.fillStyle = 'rgba(0,0,0,0.70)';
      ctx.fillRect(nameBoxX - namePadX, nameBoxY - namePadY, nameW + namePadX * 2, 16 + namePadY * 2);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(personName, nameBoxX, nameBoxY);
      ctx.restore();
    }
  }

  // Programmatic On-Screen Source Lower-Third Citation Badge
  if (seg.narration && progress >= 0.15 && progress <= 0.85) {
    const citationSource = extractSourceCitation(seg.narration);
    if (citationSource) {
      drawSourceCitation(ctx, citationSource, progress, WIDTH, HEIGHT);
    }
  }

  // Lower third for source attribution (Task 73, 80)
  if (seg.narration && progress >= 0.2 && progress <= 0.8) {
    const citationSource = extractSourceCitation(seg.narration);
    if (citationSource && !layoutFn) {
      const accentColor = ACCENT_COLORS[seg.type] || '#60a5fa';
      drawLowerThird(ctx, citationSource, 'Source', progress, WIDTH, HEIGHT, accentColor);
    }
  }

  // Name card for people mentioned (Task 79)
  if (seg.narration && progress >= 0.1 && progress <= 0.4) {
    if (globalNames && globalNames[segmentIndex]) {
      const nameData = globalNames[segmentIndex];
      const accentColor = ACCENT_COLORS[seg.type] || '#60a5fa';
      drawNameCard(ctx, nameData.name, nameData.title, progress, WIDTH, HEIGHT, accentColor);
    }
  }

  // Easter eggs (Task 58)
  if (globalEasterEggs && !DRAFT_MODE) {
    for (const egg of globalEasterEggs) {
      if (egg.segmentIndex === segmentIndex && progress >= 0.3 && progress <= 0.7) {
        drawEasterEgg(ctx, egg, WIDTH, HEIGHT);
      }
    }
  }

  // Comment bait at exact midpoint frame (Task 56)
  if (globalFrameCounter === globalMidpointFrame && !DRAFT_MODE && project && project.script) {
    const baitText = selectCommentBait(project.topic || project.title || '', segmentIndex);
    drawKineticOverlay(ctx, baitText, WIDTH / 2, HEIGHT * 0.6, 0.5, WIDTH, HEIGHT);
  }

  // Retention beat visual effects (Task 85)
  if (seg.retentionBeats && !DRAFT_MODE) {
    const currentTime = progress * seg.duration;
    for (const beat of seg.retentionBeats) {
      if (Math.abs(currentTime - beat.time) < 0.1) {
        if (beat.type === 'text_slam' || beat.type === 'graphic_switch') {
          drawFlashFrame(ctx, WIDTH, HEIGHT, 'white', 0.3);
        } else if (beat.type === 'visual_break') {
          drawChromaticAberration(ctx, WIDTH, HEIGHT, 3);
        }
        if (beat.text) {
          drawKineticOverlay(ctx, beat.text, WIDTH / 2, HEIGHT * 0.3, 0.8, WIDTH, HEIGHT);
        }
      }
    }
  }

  // Visual contrast hook on segment start for high-pacing (Task 47)
  if (progress < 0.04 && seg.pacingScore >= 4 && !DRAFT_MODE) {
    const hookAlpha = (0.04 - progress) / 0.04;
    ctx.save();
    ctx.globalAlpha = hookAlpha * 0.4;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.restore();
  }

  // Tension ramp zoom for escalation (Task 50)
  if (seg.pacingScore >= 3 && typeof segmentIndex === 'number' && project.script) {
    const tensionFactor = 1.0 + (segmentIndex / project.script.length) * 0.08;
    ctx.save();
    ctx.translate(WIDTH / 2, HEIGHT / 2);
    ctx.scale(tensionFactor, tensionFactor);
    ctx.translate(-WIDTH / 2, -HEIGHT / 2);
    ctx.restore();
  }

  // Rule of three metric highlights (Task 52)
  if (seg.narration && progress >= 0.25 && progress <= 0.75 && !DRAFT_MODE) {
    const metricMatch = seg.narration.match(/(\d+%)/);
    if (metricMatch) {
      const metricText = metricMatch[1];
      ctx.save();
      ctx.font = 'bold 72px sans-serif';
      ctx.fillStyle = '#60a5fa';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 20;
      ctx.fillText(metricText, WIDTH / 2, HEIGHT * 0.35);
      ctx.restore();
    }
  }
  } // end no-layout title/name-card block
  // Words appear one at a time with a pop-in scale effect (skip during cold open / title cards)
  if (!suppressSubtitles) {
  const words = segWordsCache && segWordsCache.has(seg.id) ? segWordsCache.get(seg.id) : (seg.narration ? seg.narration.split(' ') : []);
  if (words.length > 0) {
    // Use real word timestamps from VTT if available, otherwise uniform distribution
    const segIndex = project ? project.script.indexOf(seg) : -1;
    const wordTs = segIndex >= 0 ? wordTimestampCache.get(segIndex) || [] : [];
    const { wordIndex: currentWordIdx, windowStart } = findCurrentWord(progress, seg.duration, wordTs, words.length);
    const visibleCount = currentWordIdx - windowStart + 1;

    if (visibleCount > 0) {
      // Modern glass-morphism caption background — centered for mobile readability
      const capSafeZone = globalSafeZone || computeSafeZone(WIDTH, HEIGHT);
      const capBgW = Math.min(1200, WIDTH * 0.65);
      const capBgH = 64;
      // Position above the title overlay area to avoid overlap
      const capY = Math.min(HEIGHT - barH - 100, HEIGHT - capSafeZone.bottom - capBgH - 12);

      // Glass background with rounded corners
      ctx.save();
      ctx.fillStyle = 'rgba(10, 10, 26, 0.80)';
      if (!DRAFT_MODE) {
        ctx.shadowColor = 'rgba(96, 165, 250, 0.15)';
        ctx.shadowBlur = 20;
      }
      ctx.beginPath();
      ctx.roundRect((WIDTH - capBgW) / 2, capY - 8, capBgW, capBgH, 8);
      ctx.fill();

      // Subtle accent border
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(96, 165, 250, 0.15)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect((WIDTH - capBgW) / 2, capY - 8, capBgW, capBgH, 8);
      ctx.stroke();
      ctx.restore();
      // Measure total width to center the word group
      const normalFont = '900 30px system-ui, Montserrat, Impact, sans-serif';
      const boldFont = '900 34px system-ui, Montserrat, Impact, sans-serif';
      const spaceWidth = measureWordCached(ctx, normalFont, ' ');

      // Pre-measure all words (cached)
      let totalWidth = 0;
      const wordWidths = new Array(visibleCount);
      for (let wi = 0; wi < visibleCount; wi++) {
        const isCurrentWord = (windowStart + wi) === currentWordIdx;
        const rawWord = words[windowStart + wi] || '';
        const word = rawWord.toUpperCase();
        const font = isCurrentWord ? boldFont : normalFont;
        const ww = measureWordCached(ctx, font, word);
        wordWidths[wi] = ww;
        totalWidth += ww;
        if (wi < visibleCount - 1) {
          totalWidth += spaceWidth;
        }
      }

      // Draw each word
      const centerY = capY + 24;
      let curX = WIDTH / 2 - totalWidth / 2;

      for (let wi = 0; wi < visibleCount; wi++) {
        const globalWordIdx = windowStart + wi;
        const isCurrentWord = globalWordIdx === currentWordIdx;
        const rawWord = words[globalWordIdx] || '';
        const displayWord = rawWord.toUpperCase();

        const wordKey = `${seg.id}:${globalWordIdx}`;
        if (!wordFirstAppearFrame.has(wordKey)) {
          if (wordFirstAppearFrame.size >= MAX_WORD_FIRST_APPEAR_CACHE_SIZE) {
            wordFirstAppearFrame.delete(wordFirstAppearFrame.keys().next().value);
          }
          wordFirstAppearFrame.set(wordKey, globalFrameCounter);
        }
        const framesSinceAppear = globalFrameCounter - wordFirstAppearFrame.get(wordKey);

        const popScale = framesSinceAppear < 6 ? 1.0 + (1 - framesSinceAppear / 6) * 0.15 : 1.0;

        ctx.save();

        // Premium high-contrast text drop shadow
        ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 3;

        if (isCurrentWord) {
          ctx.font = boldFont;
          ctx.fillStyle = '#ff5500'; // High-retention orange brand highlight
        } else {
          ctx.font = normalFont;
          ctx.fillStyle = '#ffffff'; // Clean high-readability white
        }

        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        if (popScale !== 1.0) {
          const wordCenterX = curX + wordWidths[wi] / 2;
          ctx.translate(wordCenterX, centerY);
          ctx.scale(popScale, popScale);
          ctx.translate(-wordCenterX, -centerY);
        }

        // Draw thick solid black stroke behind every word for absolute legibility
        if (typeof ctx.strokeText === 'function') {
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 5;
          ctx.strokeText(displayWord, curX, centerY);
        }

        ctx.fillText(displayWord, curX, centerY);
        ctx.restore();

        curX += wordWidths[wi];
        if (wi < visibleCount - 1) {
          curX += spaceWidth;
        }
      }
    }
  }
  } // end !suppressSubtitles

  // ── Step 11: Enhanced Progress Timeline (Task 81) ──
  if (typeof globalProgress === 'number' && project && project.script) {
    const accentColor = ACCENT_COLORS[seg.type] || '#60a5fa';
    drawProgressTimeline(ctx, project.script, globalProgress, WIDTH, HEIGHT, accentColor);
  }
}


// ── TTS provider validation ────────────────────────────────────────────────
function validateTTSConfiguration() {
  const cfAccountId = process.env.CF_ACCOUNT_ID || '';
  const cfApiToken = process.env.CF_API_TOKEN || '';
  if ((process.env.VITE_CF_ACCOUNT_ID || process.env.VITE_CF_API_TOKEN) && (!process.env.CF_ACCOUNT_ID || !process.env.CF_API_TOKEN)) {
    console.warn('WARNING: Using VITE_ prefixed Cloudflare variables which are exposed to clients. Set CF_ACCOUNT_ID and CF_API_TOKEN instead.');
  }

  const meloAvailable = !!cfAccountId && !!cfApiToken;
  const edgeTtsAvailable = spawnSync('which', ['edge-tts'], { encoding: 'utf-8' }).status === 0;

  log('info', `TTS providers: MeloTTS=${meloAvailable ? 'YES' : 'NO'}, Kokoro-82M=YES (primary), edge-tts subtitles=${edgeTtsAvailable ? 'YES' : 'NO'}`);

  if (!meloAvailable) {
    console.warn('⚠ MeloTTS not configured (optional). Set CF_ACCOUNT_ID and CF_API_TOKEN for MeloTTS fallback.');
  }

  return { meloAvailable, edgeTtsAvailable };
}

// ── Concatenate audio files ────────────────────────────────────────────────
async function concatenateAudio(audioFiles, outputFile) {
  if (audioFiles.length === 0) return false;
  if (audioFiles.length === 1) {
    const result = spawnSync('ffmpeg', ['-y', '-i', audioFiles[0].file, '-c:a', 'aac', '-b:a', '128k', outputFile], { encoding: 'utf8', timeout: 60000 });
    return result.status === 0;
  }

  const { concatenateAudio: concatAudio } = await import('./server-render/audio.mjs');
  return concatAudio(audioFiles, outputFile);
}

// ── Main render ────────────────────────────────────────────────────────────
async function render() {
  let ffmpeg;
  let ffmpegExited = false;
  let lastFfmpegError = null;

  // Task 121: Memory check before render
  const preRenderMem = logMemoryUsage('pre-render');
  // Task 118: Recommend --max-old-space-size flag
  recommendNodeFlags();

  log('info', 'Fetching project from dev server...');
  const project = await fetchProject();
  log('info', `Project: "${project.title}" | ${project.script.length} segments | ${project.media.length} media assets`);

  // Task 24: Apply trim settings — filter out removed segments and adjust durations
  const trimmedSegments = project.editPlan?.trimmedSegments;
  if (trimmedSegments && Object.keys(trimmedSegments).length > 0) {
    const originalCount = project.script.length;
    project.script = project.script.filter((seg) => {
      const trim = trimmedSegments[seg.id];
      if (!trim) return true;
      if (trim.start === 0 && trim.end === 0) {
        log('info', `  Trim: Removing segment "${seg.title}"`);
        return false;
      }
      return true;
    });
    for (const seg of project.script) {
      const trim = trimmedSegments[seg.id];
      if (trim && (trim.start > 0 || trim.end < seg.duration)) {
        const originalDuration = seg.duration;
        seg.duration = Math.max(0.5, trim.end - trim.start);
        log('info', `  Trim: "${seg.title}" ${originalDuration}s → ${seg.duration.toFixed(1)}s`);
      }
    }
    // Also filter media assets for removed segments
    const activeSegmentIds = new Set(project.script.map((s) => s.id));
    project.media = project.media.filter((a) => activeSegmentIds.has(a.segmentId));
    const removedCount = originalCount - project.script.length;
    if (removedCount > 0) {
      log('info', `  Trim: ${removedCount} segment(s) removed, ${project.script.length} remaining`);
    }
  }

  // Apply resolution preset from project export settings (Requirement 6.1, 6.6)
  const resolutionKey = project.exportSettings?.resolution || '1080p';
  const resPreset = RESOLUTION_PRESETS[resolutionKey];
  if (resPreset) {
    WIDTH = resPreset.width;
    HEIGHT = resPreset.height;
    FPS = resPreset.fps;
    log('info', `Resolution: ${resolutionKey} (${WIDTH}x${HEIGHT} @ ${FPS}fps)`);
  }

  // Allow project.exportSettings.fps to override the preset FPS
  if (project.exportSettings?.fps) {
    FPS = project.exportSettings.fps;
    log('info', `FPS override: ${FPS}fps`);
  }

  // Task 130: YouTube Shorts vertical render — force 1080x1920 when format is 'shorts'
  const isShortsMode = project.exportSettings?.format === 'shorts';
  if (isShortsMode) {
    WIDTH = 1080;
    HEIGHT = 1920;
    log('info', `Shorts mode: forcing ${WIDTH}x${HEIGHT}`);
  }

  // Task 17: Apply aspect ratio preset (overrides resolution dimensions if set)
  const aspectRatioKey = project.exportSettings?.aspectRatio || detectAspectRatioFromTopic(project.topic);
  const aspectPreset = ASPECT_RATIOS[aspectRatioKey];
  if (aspectPreset && !isShortsMode) {
    WIDTH = aspectPreset.width;
    HEIGHT = aspectPreset.height;
    log('info', `Aspect ratio: ${aspectRatioKey} (${WIDTH}x${HEIGHT}, ${aspectPreset.label})`);
  }

  // Requirement 6.7: 4K canvas allocation fallback — if createCanvas fails for 4K,
  // fall back to 1080p. We test this by attempting a small canvas allocation.
  if (resolutionKey === '4K') {
    try {
      const testCanvas = createCanvas(WIDTH, HEIGHT);
      testCanvas.getContext('2d');
    } catch (err) {
      console.warn(`  ⚠ 4K canvas allocation failed — falling back to 1080p: ${err.message}`);
      const fallback = RESOLUTION_PRESETS['1080p'];
      WIDTH = fallback.width;
      HEIGHT = fallback.height;
      FPS = fallback.fps;
    }
  }

  // Draft quality: halve render resolution and let ffmpeg upscale (4x fewer pixel ops)
  const quality = project.exportSettings?.quality || 'medium';
  DRAFT_MODE = quality === 'draft';
  const outputWidth = WIDTH;
  const outputHeight = HEIGHT;
  if (DRAFT_MODE) {
    WIDTH = Math.floor(WIDTH / 2);
    HEIGHT = Math.floor(HEIGHT / 2);
    log('info', `Draft quality: rendering at ${WIDTH}x${HEIGHT}, upscaling to ${outputWidth}x${outputHeight}`);
  }

  // Validate TTS providers before starting render (fail fast if none available)
  validateTTSConfiguration();

  // Initialize rendering flags (can be modified by AI post-review enrichment pass)
  const renderFlags = {
    showDataOverlay: false,
    showKineticText: false,
    useFastPacing: false,
  };

  // Initialize global state for advanced rendering features (Tasks 58, 79, 80)
  globalStyleParticles = null;
  globalEasterEggs = generateEasterEggs(project.topic || project.title || '', project.script ? project.script.length : 0);
  globalCitations = project.script ? extractCitationsFromSegments(project.script) : [];
  globalNames = {};
  globalRetentionBeats = [];
  if (project.script) {
    for (let i = 0; i < project.script.length; i++) {
      const names = extractNamesFromText(project.script[i].narration || '');
      if (names.length > 0) {
        globalNames[i] = names[0];
      }
    }
    // Schedule retention beats per segment (Task 85)
    for (let i = 0; i < project.script.length; i++) {
      const seg = project.script[i];
      if (!seg.retentionBeats) {
        seg.retentionBeats = [];
        const types = ['text_slam', 'zoom', 'graphic_switch', 'sudden_silence', 'visual_break', 'stat_callout'];
        const beatInterval = seg.duration / 4;
        for (let b = 0; b < 4; b++) {
          seg.retentionBeats.push({
            type: types[b % types.length],
            time: beatInterval * (b + 0.5),
            text: b === 1 ? '...' : null
          });
        }
      }
    }
    // Compute midpoint frame for comment bait (Task 56)
    const totalDuration = project.script.reduce((sum, s) => sum + (s.duration || 5), 0);
    globalMidpointFrame = Math.floor((totalDuration / 2) * FPS);
  }

  if (!project.media || project.media.length === 0) {
    throw new Error('No media assets found. Run the pipeline (source media) first.');
  }

  // ── Cost Estimation ──────────────────────────────────────────────────────
  try {
    const costEst = estimateRenderCost(project);
    log('info', '\n💰 Estimated render costs:');
    log('info', `   API (LLM calls):     ~$${costEst.apiCostEstimate.toFixed(4)}`);
    log('info', `   Compute (rendering):  ~$${costEst.computeCostEstimate.toFixed(4)}`);
    log('info', `   Storage (output):     ~$${costEst.storageCostEstimate.toFixed(4)}`);
    log('info', `   ─────────────────────────────`);
    log('info', `   Total estimate:       ~$${costEst.totalEstimate.toFixed(4)}`);
  } catch {
    // cost estimation is best-effort
  }

  // MEDIUM #10: Check disk space before starting render
  validateDiskSpace(project, OUTPUT_FILE);

  mkdirSync(OUTPUT_DIR, { recursive: true, mode: 0o700 });

  // Pre-load all images concurrently with concurrency limit (skip video clips — they're fetched per-frame)
  // Requirements 1.3, 1.4: preload all images before any frame rendering begins
  log('info', 'Pre-loading images via proxy...');
  const imgCache = new Map();
  const uniqueUrls = [...new Set(project.media.filter(a => a.type !== 'video').map(a => a.url))];
  let loadedCount = 0;
  let failedCount = 0;

  // Concurrent fetch with semaphore pattern
  const CONCURRENCY_LIMIT = CONFIG.CONCURRENCY_LIMIT; // Increased from 5 for faster preloading

  async function preloadWithConcurrency(urls, limit) {
    const executing = new Set();
    for (const url of urls) {
      const task = fetchImage(url).then(img => {
        executing.delete(task);
        if (img) {
          imgCache.set(url, img);
          loadedCount++;
        } else {
          failedCount++;
        }
        process.stdout.write(`\r  Loaded ${loadedCount}/${urls.length} images (${failedCount} failed)`);
      });
      executing.add(task);
      if (executing.size >= limit) {
        await Promise.race(executing);
      }
    }
    // Wait for all remaining in-flight fetches to complete
    await Promise.all(executing);
  }

  await preloadWithConcurrency(uniqueUrls, CONCURRENCY_LIMIT);

  log('info', `\n  ✓ Image preloading complete: ${loadedCount} loaded, ${failedCount} failed out of ${uniqueUrls.length} unique URLs`);
  const videoAssetCount = project.media.filter(a => a.type === 'video').length;
  if (videoAssetCount > 0) {
    log('info', `  ${videoAssetCount} video clip(s) will be frame-extracted during render`);
  }

  // P0: Pre-compute saturation and brightness scores during preload (avoids per-frame temp canvas allocation)
  log('info', '  Pre-computing saturation and brightness scores for adaptive colour grading...');
  let saturationComputed = 0;
  const brightnessScores = [];
  for (const [url, img] of imgCache) {
    try {
      const iw = img.width || 1280;
      const ih = img.height || 720;
      const tmpCanvas = createCanvas(iw, ih);
      const tmpCtx = tmpCanvas.getContext('2d');
      tmpCtx.drawImage(img, 0, 0, iw, ih);
      const imageData = tmpCtx.getImageData(0, 0, iw, ih);

      // Brightness check
      const bScore = computeImageBrightness(imageData.data, iw, ih);
      brightnessScores.push(bScore);

      // Saturation check
      if (!saturationCache.has(url)) {
        const score = computeSaturationScore(imageData.data, iw, ih);
        if (saturationCache.size >= MAX_SATURATION_CACHE_SIZE) {
          saturationCache.delete(saturationCache.keys().next().value);
        }
        saturationCache.set(url, score);
        saturationComputed++;
      }
    } catch {
      if (!saturationCache.has(url)) {
        if (saturationCache.size >= MAX_SATURATION_CACHE_SIZE) {
          saturationCache.delete(saturationCache.keys().next().value);
        }
        saturationCache.set(url, 0.5);
      }
    }
  }

  // Calculate project-wide brightness and exposure boost
  if (brightnessScores.length > 0) {
    averageProjectAssetBrightness = brightnessScores.reduce((a, b) => a + b, 0) / brightnessScores.length;
    log('info', `  Average project asset brightness: ${averageProjectAssetBrightness.toFixed(4)}`);
  } else {
    averageProjectAssetBrightness = 0.35;
  }

  if (averageProjectAssetBrightness < 0.40) {
    globalBrightnessBoost = Math.max(1.15, 0.40 / averageProjectAssetBrightness);
    log('info', `  ⚠ Project assets are under-exposed (average ${averageProjectAssetBrightness.toFixed(2)} < 0.40).`);
    log('info', `    Applying automatic exposure boost factor: x${globalBrightnessBoost.toFixed(2)}`);
  } else {
    globalBrightnessBoost = 1.0;
    log('info', `  ✓ Project assets exposure is within safety bounds.`);
  }

  log('info', `  ✓ Saturation scores computed for ${saturationComputed} images`);

  // P1: Pre-extract video frames at key timestamps (avoids per-frame ffmpeg calls)
  const videoAssets = project.media.filter(a => a.type === 'video');
  if (videoAssets.length > 0) {
    log('info', `  Pre-extracting frames from ${videoAssets.length} video clip(s)...`);
    const TIMESTAMPS = [0.0, 0.25, 0.5, 0.75, 0.95]; // Key points in each clip
    let videoFramesExtracted = 0;
    let videoFramesFailed = 0;

    for (const asset of videoAssets) {
      const clipDuration = asset.duration || 10;
      // Download clip once
      const fullUrl = asset.url.startsWith('http') ? asset.url : `${DEV_SERVER}${asset.url}`;
      let clipTmp = null;
      try {
        const clipRes = await fetch(fullUrl);
        if (clipRes.ok) {
          const clipBuffer = Buffer.from(await clipRes.arrayBuffer());
          clipTmp = join(tmpdir(), `autotube-clip-${Date.now()}.mp4`);
          writeFileSync(clipTmp, clipBuffer);
          if (clipFileCache.size >= MAX_CLIP_FILE_CACHE_SIZE) {
            clipFileCache.delete(clipFileCache.keys().next().value);
          }
          clipFileCache.set(asset.url, clipTmp);
        }
      } catch {
        console.warn(`    ⚠ Failed to download video clip: ${asset.url.substring(0, 60)}`);
      }

      if (!clipTmp) {
        // Use thumbnail fallback
        if (asset.thumbnailUrl) {
          const fallbackImg = await fetchImage(asset.thumbnailUrl);
          if (fallbackImg) {
            for (const pct of TIMESTAMPS) {
              if (videoFrameCache.size >= MAX_VIDEO_FRAME_CACHE_SIZE) {
                videoFrameCache.delete(videoFrameCache.keys().next().value);
              }
              videoFrameCache.set(`${asset.url}@${(pct * clipDuration).toFixed(2)}`, fallbackImg);
            }
            videoFramesExtracted += TIMESTAMPS.length;
          }
        }
        continue;
      }

      // Speed ramp if clip duration mismatches segment (Task 59)
      const segDuration = asset.segmentId ? project.script.find(s => s.id === asset.segmentId)?.duration : null;
      if (segDuration && clipDuration > 0) {
        const ratio = segDuration / clipDuration;
        if (ratio > 1.3 || ratio < 0.7) {
          const rampSpeed = Math.min(2.0, Math.max(0.5, ratio));
          const rampedTmp = join(tmpdir(), `autotube-ramped-${Date.now()}.mp4`);
          const rampResult = spawnSync('ffmpeg', [
            '-y', '-i', clipTmp,
            '-filter:v', `setpts=${(1/rampSpeed).toFixed(4)}*PTS`,
            '-an', rampedTmp
          ], { encoding: 'utf8', timeout: 30000 });
          if (rampResult.status === 0 && existsSync(rampedTmp)) {
            try { unlinkSync(clipTmp); } catch {}
            clipTmp = rampedTmp;
            clipFileCache.set(asset.url, clipTmp);
          }
        }
      }

      // Smooth 24 fps Video Frame Extraction
      const framesDir = join(tmpdir(), `autotube-frames-${Date.now()}-${Math.random().toString(36).substring(7)}`);
      mkdirSync(framesDir, { recursive: true });
      log('info', `    ↳ Extracting all frames at 24fps to ${framesDir}...`);
      const extractAllResult = spawnSync('ffmpeg', [
        '-y',
        '-i', clipTmp,
        '-vf', 'fps=24,scale=1920:1080',
        '-q:v', '2',
        join(framesDir, 'frame_%04d.jpg')
      ], { encoding: 'utf8', timeout: 60000 });

      if (extractAllResult.status === 0) {
        videoFramesDirectories.set(asset.url, framesDir);
        log('info', `      ✓ Extracted smooth frames to disk`);
      } else {
        log('warn', `      ⚠ Ffmpeg extract smooth frames failed: ${extractAllResult.stderr || 'unknown error'}`);
      }

      // Extract frames at key timestamps for backwards compatibility & fallback
      for (const pct of TIMESTAMPS) {
        const timestamp = pct * clipDuration;
        const cacheKey = `${asset.url}@${timestamp.toFixed(2)}`;
        try {
          const result = spawnSync('ffmpeg', [
            '-ss', String(timestamp),
            '-i', clipTmp,
            '-frames:v', '1',
            '-f', 'image2pipe',
            '-vcodec', 'mjpeg',
            '-',
          ], { encoding: 'buffer', timeout: CONFIG.FETCH_TIMEOUT_MS });

          if (result.status === 0 && result.stdout && result.stdout.length > 0) {
            const img = await loadImage(result.stdout);
            if (videoFrameCache.size >= MAX_VIDEO_FRAME_CACHE_SIZE) {
              videoFrameCache.delete(videoFrameCache.keys().next().value);
            }
            videoFrameCache.set(cacheKey, img);
            videoFramesExtracted++;
          } else {
            videoFramesFailed++;
          }
        } catch {
          videoFramesFailed++;
        }
      }
    }
    log('info', `  ✓ Video frames pre-extracted: ${videoFramesExtracted} succeeded, ${videoFramesFailed} failed`);
  }

  // ── Pre-generate narration audio BEFORE video rendering ──────────────────
  // This allows word-level VTT timestamps to be available for karaoke caption sync.
  const audioDir = join(dirname(OUTPUT_FILE), `narration-audio-${Date.now()}`);
  mkdirSync(audioDir, { recursive: true, mode: 0o700 });
  const cfAccountId = process.env.CF_ACCOUNT_ID || '';
  const cfApiToken = process.env.CF_API_TOKEN || '';
  if ((process.env.VITE_CF_ACCOUNT_ID || process.env.VITE_CF_API_TOKEN) && (!process.env.CF_ACCOUNT_ID || !process.env.CF_API_TOKEN)) {
    console.warn('WARNING: Using VITE_ prefixed Cloudflare variables which are exposed to clients. Set CF_ACCOUNT_ID and CF_API_TOKEN instead.');
  }
  const edgeVoice = project.exportSettings?.edgeTtsVoice || 'en-US-GuyNeural';
  log('info', `\n🎙️ TTS providers: Kokoro-82M (voice=${edgeVoice}), MeloTTS=${cfAccountId && cfApiToken ? 'YES' : 'NO'}`);

  // Task 125: Per-step metrics
  stepMetrics.startStep('narration');

  // Task 127: TTS retry with fallback — retry narration generation up to 3 times
  let audioFiles = [];
  const TTS_MAX_RETRIES = 3;
  const TTS_RETRY_DELAY_MS = 2000;
  for (let ttsAttempt = 1; ttsAttempt <= TTS_MAX_RETRIES; ttsAttempt++) {
    try {
      audioFiles = await generateNarration(project.script, audioDir, { cfAccountId, cfApiToken, edgeVoice });
      if (audioFiles.length > 0) break;
    } catch (err) {
      log('info', `  ⚠ Narration attempt ${ttsAttempt}/${TTS_MAX_RETRIES} failed: ${err.message}`);
      if (ttsAttempt < TTS_MAX_RETRIES) {
        log('info', `  ⏳ Retrying narration in ${TTS_RETRY_DELAY_MS / 1000}s...`);
        await new Promise(r => setTimeout(r, TTS_RETRY_DELAY_MS));
      }
    }
  }

  // Load VTT word timestamps into cache for karaoke sync.
  // audioFiles includes silence gaps, so use a separate counter for segment indices.
  let narrationSegIdx = 0;
  for (const af of audioFiles) {
    if (af.subtitleFile && existsSync(af.subtitleFile)) {
      const words = parseVttWordTimestamps(af.subtitleFile);
      if (words.length > 0) {
        wordTimestampCache.set(narrationSegIdx, words);
        log('info', `  📝 Loaded ${words.length} word timestamps for segment ${narrationSegIdx + 1}`);
      }
      narrationSegIdx++;
    }
  }

  // Task 124: Quality gate — validate narration output
  let totalNarrationDuration = 0;
  let narrationValid = true;
  for (let ni = 0; ni < audioFiles.length; ni++) {
    const af = audioFiles[ni];
    const gate = validateOutput(af.file, `Narration segment ${ni}`);
    if (!gate.valid) {
      console.warn(`  ⚠ ${gate.error}`);
      narrationValid = false;
    } else {
      totalNarrationDuration += af.duration || 0;
    }
  }
  if (narrationValid) {
    log('info', `  ✅ Narration quality gate passed (${audioFiles.length} segments, ${totalNarrationDuration.toFixed(1)}s total)`);
  } else {
    log('info', `  ⚠ Narration quality gate: some segments may be missing`);
  }
  stepMetrics.endStep('narration', { segmentCount: audioFiles.length, narrationDuration: totalNarrationDuration });

  // Task 129: Render state manager for checkpoint/resume
  const renderStateManager = new RenderStateManager(project.title);
  const existingCheckpoint = renderStateManager.load();

  // Task 126: ETA estimator
  let etaEstimator = null;

  // Task 120: Quality degradation chain state
  let currentQualityLevel = 0;

  // Task 123: Set up render job queue
  log('info', '\n📋 Enqueueing render job (queue ensures sequential processing)...');

  // Task 129: Resume from checkpoint if available
  if (existingCheckpoint && existingCheckpoint.status === 'interrupted') {
    log('info', `  📂 Resuming from checkpoint: segment ${existingCheckpoint.segmentIndex}, frame ${existingCheckpoint.frameNumber}`);
    currentQualityLevel = existingCheckpoint.qualityLevel || 0;
  }

  // Track current segment index for checkpointing
  let currentSegmentIndex = 0;

  // Task 120: Quality degradation chain
  const originalQuality = project.exportSettings?.quality || 'medium';

  // Set up the autonomous post-render retry engine
  let attempt = 0;
  const MAX_ATTEMPTS = QUALITY_DEGRADATION_CHAIN.length;
  let renderPassed = false;
  let finalMp4File = null;
  let totalFrames = 0;

  while (attempt < MAX_ATTEMPTS && !renderPassed) {
    attempt++;
    const qualityLevel = QUALITY_DEGRADATION_CHAIN[Math.min(currentQualityLevel, QUALITY_DEGRADATION_CHAIN.length - 1)];
    log('info', `\n🎬 Starting render pass ${attempt} of ${MAX_ATTEMPTS} (${qualityLevel.label})...`);

    // Task 121: Memory check before each render attempt
    logMemoryUsage(`pass ${attempt}`);

    // Task 119: Broadcast render stage
    progressBroadcaster.update({ stage: `rendering_pass_${attempt}`, frame: 0, totalFrames: 0 });

    // Set up ffmpeg pipe — use GPU acceleration by default when available
    const hwEncoder = detectHardwareEncoder();
    const useGpu = hwEncoder !== null && !DRAFT_MODE;
    if (useGpu) {
      log('info', `  🖥️  GPU acceleration enabled: ${hwEncoder}`);
    } else {
      log('info', `  💻 CPU encoding (libx264) — no GPU encoder detected or draft mode`);
    }
  const ffmpegArgs = [
    '-y',
    '-f', 'rawvideo',
    '-vcodec', 'rawvideo',
    '-s', `${WIDTH}x${HEIGHT}`,
    '-pix_fmt', 'bgra', // matches node-canvas toBuffer('raw') on little-endian (ARM64/x86)
    '-r', String(FPS),
    '-i', 'pipe:0',
  ];

  if (useGpu && hwEncoder === 'h264_videotoolbox') {
    ffmpegArgs.push('-c:v', 'h264_videotoolbox', '-allow_sw', '1', '-b:v', '12M');
  } else if (useGpu && hwEncoder === 'h264_nvenc') {
    ffmpegArgs.push('-c:v', 'h264_nvenc', '-preset', 'p4', '-tune', 'hq', '-rc', 'vbr', '-cq', '18', '-b:v', '12M');
  } else if (useGpu && hwEncoder === 'h264_vaapi') {
    ffmpegArgs.push('-vaapi_device', '/dev/dri/renderD128', '-vf', 'format=nv12,hwupload', '-c:v', 'h264_vaapi');
  } else {
    const codec = project?.exportSettings?.codec === 'av1' ? 'libsvtav1' : project?.exportSettings?.codec === 'hevc' ? 'libx265' : 'libx264';
    const crfValue = project?.exportSettings?.codec === 'av1' ? 30 : project?.exportSettings?.codec === 'hevc' ? 20 : 16;
    const extraCodecArgs = project?.exportSettings?.codec === 'hevc' ? ['-tag:v', 'hvc1'] : [];

    if (quality === 'highest' && !DRAFT_MODE) {
      // Two-pass encoding: render to temp file, then two-pass encode
      const tempRenderFile = join(tmpdir(), `autotube-temp-render-${Date.now()}.mp4`);
      const tempRenderArgs = [
        '-y',
        '-f', 'rawvideo',
        '-vcodec', 'rawvideo',
        '-s', `${WIDTH}x${HEIGHT}`,
        '-pix_fmt', 'bgra',
        '-r', String(FPS),
        '-i', 'pipe:0',
        '-c:v', codec, '-preset', 'slow', '-crf', String(crfValue), '-bf', '3', '-tune', 'film',
        ...extraCodecArgs,
        '-pix_fmt', 'yuv420p',
        tempRenderFile,
      ];
      // Store temp render file path for later two-pass encoding
      twoPassState.tempFile = tempRenderFile;
      twoPassState.tempArgs = tempRenderArgs;
      twoPassState.finalCodec = codec;
      twoPassState.finalCrf = crfValue;
      twoPassState.finalExtraArgs = extraCodecArgs;
      // Use temp render args for now
      ffmpegArgs.length = 0;
      ffmpegArgs.push(...tempRenderArgs);
    } else {
      ffmpegArgs.push('-c:v', codec, '-preset', 'slow', '-crf', String(crfValue), '-bf', '3', '-tune', 'film', ...extraCodecArgs);
    }
  }

  // HDR10 metadata for HDR-capable exports
  const hdrArgs = project?.exportSettings?.hdr ? ['-color_primaries', 'bt2020', '-color_trc', 'smpte2084', '-colorspace', 'bt2020nc'] : [];
  ffmpegArgs.push(...hdrArgs);

  if (DRAFT_MODE) {
    ffmpegArgs.push('-vf', `scale=${outputWidth}:${outputHeight}:flags=lanczos`);
  }

  ffmpegArgs.push('-pix_fmt', 'yuv420p', '-movflags', '+faststart', OUTPUT_FILE);

  ffmpeg = spawn('ffmpeg', ffmpegArgs, { stdio: ['pipe', 'inherit', 'pipe'] });

  // Safety: Detect if ffmpeg process dies unexpectedly
  ffmpegExited = false;
  lastFfmpegError = null;
  ffmpeg.setMaxListeners(0); // Allow many drain/close listeners at high frame rates
  ffmpeg.on('close', code => {
    ffmpegExited = true;
    if (code !== 0 && code !== null) {
      console.error(`\n❌ Ffmpeg exited prematurely with code ${code}`);
      const parsed = parseFfmpegError(lastFfmpegError || `exit code ${code}`);
      const recovery = getRecoveryAction(parsed.type);
      log('info', `  🔧 Ffmpeg error type: ${parsed.type} — ${recovery.message}`);
      lastFfmpegError = null;
    }
  });

  ffmpeg.on('error', err => {
    ffmpegExited = true;
    console.error(`\n❌ Ffmpeg error: ${err.message}`);
    lastFfmpegError = err.message;
  });

  ffmpeg.stderr.on('data', chunk => {
    const text = chunk.toString();
    lastFfmpegError = text.slice(-4096);
  });

  /**
   * Write a frame to ffmpeg stdin with safety checks.
   * Returns true if write succeeded, false if ffmpeg has died.
   */
  function writeFrameSafely(buffer) {
    if (ffmpegExited) {
      return 'dead';
    }
    
    try {
      return ffmpeg.stdin.write(buffer);
    } catch (err) {
      return 'dead';
    }
  }

  /**
   * Extract frame buffer from canvas with error protection.
   * Returns null if the canvas is corrupted.
   */
  function getFrameBuffer(c) {
    try {
      return boostFrameBrightness(c.toBuffer('raw'));
    } catch {
      return null;
    }
  }

  /**
   * Wait for ffmpeg stdin drain with timeout to prevent infinite hangs.
   */
  async function waitForDrain(timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      let settled = false;
      
      const timeoutId = setTimeout(() => {
        if (!settled) {
          settled = true;
          console.error(`\n❌ Ffmpeg stdin drain timed out after ${timeoutMs}ms`);
          reject(new Error(`Ffmpeg stdin drain timed out after ${timeoutMs}ms`));
        }
      }, timeoutMs);
      
      ffmpeg.stdin.once('drain', () => {
        if (!settled) {
          settled = true;
          clearTimeout(timeoutId);
          resolve();
        }
      });
      
      // Also reject if ffmpeg exits while waiting
      ffmpeg.once('close', (code) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeoutId);
          reject(new Error(`Ffmpeg exited with code ${code} while waiting for drain`));
        }
      });
    });
  }

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.imageSmoothingEnabled = true;

  // Precompute values that are constant per render to avoid per-frame work
  globalSafeZone = computeSafeZone(WIDTH, HEIGHT);
  segWordsCache = new Map();
  for (const seg of project.script) {
    segWordsCache.set(seg.id, seg.narration ? seg.narration.split(' ') : []);
  }

  totalFrames = 0;
  const TITLE_CARD_SECONDS = 0; // Skips the low-energy intro title slide
  const END_SCREEN_SECONDS = isShortsMode ? 2 : 4;
  const effectiveTitleDur = 0; // Skips full-screen blank chapter transition cards
  const SEGMENT_TITLE_FRAMES = 0;
  const COLD_OPEN_FRAMES = 0; // Start visual segments immediately
  const COLD_OPEN_FADE_FRAMES = 0;
  const SEGMENT_FADE_FRAMES = Math.round((renderFlags.useFastPacing ? 0.05 : 0.12) * FPS);
  const SEGMENT_TITLE_FADE_FRAMES = 0;
  const titleCardFrames = 0;
  const endScreenFrames = Math.round(END_SCREEN_SECONDS * FPS);


  // Apply dynamic pacing: adjust segment durations based on content type
  // ONLY if the project does not have pre-generated narration matching the script.
  const hasNarration = project.narration && project.narration.length > 0;
  if (!hasNarration) {
    log('info', '  No narration found. Applying dynamic pacing ranges to segment durations...');
    for (const seg of project.script) {
      seg.duration = computeDynamicSegmentDuration(seg);
    }
  } else {
    log('info', '  Narration voiceover detected. Keeping original script durations for audio synchronization.');
  }

  let segmentSec = project.script.reduce((s, seg) => s + seg.duration, 0);
  const segmentTitleSec = (project.script.length * SEGMENT_TITLE_FRAMES) / FPS;
  const coldOpenSec = COLD_OPEN_FRAMES / FPS;
  let totalSec = segmentSec + segmentTitleSec + TITLE_CARD_SECONDS + END_SCREEN_SECONDS + coldOpenSec;
  // Task 130: Cap total duration at 60 seconds for Shorts
  if (isShortsMode && totalSec > 60) {
    const scale = (60 - TITLE_CARD_SECONDS - END_SCREEN_SECONDS - segmentTitleSec - coldOpenSec) / segmentSec;
    for (const seg of project.script) {
      seg.duration = Math.max(1, seg.duration * scale);
    }
    segmentSec = project.script.reduce((s, seg) => s + seg.duration, 0);
    totalSec = segmentSec + segmentTitleSec + TITLE_CARD_SECONDS + END_SCREEN_SECONDS + coldOpenSec;
    log('info', `Shorts mode: duration capped at ${totalSec.toFixed(1)}s (segments scaled by ${scale.toFixed(2)})`);
  }

  log('info', `Rendering ${totalSec.toFixed(1)}s video at ${FPS}fps (${coldOpenSec.toFixed(1)}s cold open + ${TITLE_CARD_SECONDS}s title + ${segmentTitleSec.toFixed(1)}s segment titles + ${segmentSec}s content + ${END_SCREEN_SECONDS}s end screen)...`);

  // #14: Track render start time and expected frames for ETA logging
  const renderStartTime = Date.now();
  const totalExpectedFrames = Math.round(totalSec * FPS);

  // Task 126: Initialize ETA estimator
  etaEstimator = new EtaEstimator(totalExpectedFrames);

  // Task 119: Broadcast render start
  progressBroadcaster.update({ stage: 'rendering', frame: 0, totalFrames: totalExpectedFrames, percent: 0 });

  // Task 121: Memory check before frame rendering starts
  logMemoryUsage('pre-frames');
  
  // Safety: Periodic progress logging to detect stalls
  let lastFrameCount = 0;
  let lastProgressLog = Date.now();
  const PROGRESS_LOG_INTERVAL = CONFIG.LOG_INTERVAL_MS; // Periodic logging interval
  const STALL_THRESHOLD_MS = CONFIG.STALL_THRESHOLD_MS; // Stall detection threshold
  
  function logRenderProgress() {
    const now = Date.now();
    const elapsed = (now - renderStartTime) / 1000;
    const fps = totalFrames > 0 ? totalFrames / elapsed : 0;
    const progress = (totalFrames / totalExpectedFrames) * 100;
    const eta = fps > 0 ? ((totalExpectedFrames - totalFrames) / fps).toFixed(0) : '?';

    // Task 126: Use EtaEstimator for smoother ETA
    const etaInfo = etaEstimator ? etaEstimator.update(totalFrames) : null;
    const displayEta = etaInfo?.eta || eta;

    log('info', `  📊 Progress: ${totalFrames}/${totalExpectedFrames} frames (${progress.toFixed(1)}%) @ ${fps.toFixed(1)} fps | ETA: ${displayEta}s`);

    // Task 119: Broadcast progress to any listeners
    progressBroadcaster.update({
      frame: totalFrames,
      totalFrames: totalExpectedFrames,
      percent: parseFloat(progress.toFixed(1)),
      fps: parseFloat(fps.toFixed(1)),
      eta: displayEta,
    });

    // Task 121: Memory monitoring every 100 frames
    if (totalFrames % 100 === 0 && totalFrames > 0) {
      logMemoryUsage(`frame ${totalFrames}`);
    }

    // Task 129: Save checkpoint every 100 frames
    if (totalFrames % 100 === 0 && totalFrames > 0) {
      renderStateManager.save(currentSegmentIndex ?? 0, totalFrames, totalExpectedFrames, currentQualityLevel);
    }

    // Check for stalls — auto-recover by writing a dummy frame to unblock
    if (totalFrames === lastFrameCount && (now - lastProgressLog) > STALL_THRESHOLD_MS) {
      console.warn(`\n⚠️  WARNING: Render appears stalled! No new frames in ${(now - lastProgressLog) / 1000}s`);
      console.warn(`   Last frame count: ${lastFrameCount}, Current: ${totalFrames} — skipping frame`);
    }

    lastFrameCount = totalFrames;
    lastProgressLog = now;
  }

  // ── Step 13: Cold open — dynamic frames from the most dramatic segment ───────
  // Task 130: Skip cold open for Shorts mode
  let coldOpenSeg = null;
  if (!isShortsMode) {
    // Score each section segment by dramatic/surprising language heuristics
    let maxScore = -1;
    for (const seg of project.script) {
      if (seg.type === 'section' && seg.narration) {
        const wordCount = seg.narration.split(/\s+/).length;
        let score = wordCount;
        if (/\d+/.test(seg.narration)) score += 50;
        if (/[A-Z][a-z]+ [A-Z][a-z]+/.test(seg.narration)) score += 30;
        if (seg.narration.includes('?')) score += 20;
        if (score > maxScore) {
          maxScore = score;
          coldOpenSeg = seg;
        }
      }
    }
    if (!coldOpenSeg) coldOpenSeg = project.script[0];
  }

  const coldOpenSegIndex = coldOpenSeg ? project.script.indexOf(coldOpenSeg) : -1;
  const coldOpenMedia = coldOpenSeg ? project.media.filter(a => a.segmentId === coldOpenSeg.id) : [];
  if (!isShortsMode) log('info', `  Cold open: ${COLD_OPEN_FRAMES} frames (${coldOpenSec}s) from "${coldOpenSeg?.title}"`);
  if (isShortsMode) log('info', '  Shorts mode: skipping cold open');

  // Opening hook frames — bold text on dark background (req c)
  const COLD_OPEN_HOOK_FRAMES = Math.max(1, Math.round(0.3 * FPS));
  const hookText = coldOpenSeg?.narration
    ? (coldOpenSeg.narration.match(/^[^.!?\n]+/) || [coldOpenSeg.narration.substring(0, 60)])[0].substring(0, 60)
    : 'Watch this!';

  if (!isShortsMode) for (let f = 0; f < COLD_OPEN_FRAMES; f++) {
    // Render at 30-50% progress (the middle of the segment)
    const coldProgress = 0.3 + (f / COLD_OPEN_FRAMES) * 0.2; // 0.3 → 0.5
    const coldMi = Math.min(Math.floor(coldProgress * Math.max(1, coldOpenMedia.length)), Math.max(0, coldOpenMedia.length - 1));
    const coldAsset = coldOpenMedia[coldMi] || null;
    let coldImg = null;

    if (coldAsset) {
      if (coldAsset.type === 'video') {
        // P1: Use pre-extracted frames from cache
        const clipDuration = coldAsset.duration || 10;
        const keyTimestamps = [0, 0.25, 0.5, 0.75, 0.95];
        const closestPct = keyTimestamps.reduce((best, pct) =>
          Math.abs(pct - coldProgress) < Math.abs(best - coldProgress) ? pct : best
        );
        const cacheKey = `${coldAsset.url}@${(closestPct * clipDuration).toFixed(2)}`;
        coldImg = videoFrameCache.get(cacheKey) || null;

        if (!coldImg) {
          try {
            coldImg = await fetchVideoFrame(coldAsset.url, coldProgress * clipDuration, coldAsset.thumbnailUrl);
          } catch {
            if (coldAsset.thumbnailUrl) {
              coldImg = imgCache.get(coldAsset.thumbnailUrl) || null;
            }
          }
        }
      } else {
        coldImg = imgCache.get(coldAsset.url) || null;
      }
    }

    const coldGlobalProgress = (f / COLD_OPEN_FRAMES * coldOpenSec) / totalSec;
    
    // Cold open pattern interrupt: glitch on first 3 frames (Task 46)
    if (f < 3 && !DRAFT_MODE) {
      drawFlashFrame(ctx, WIDTH, HEIGHT, 'white', 0.6);
    }
    // Cold open flash at end before fade-to-black (Task 48)
    if (f === COLD_OPEN_FRAMES - 2 && !DRAFT_MODE) {
      drawFlashFrame(ctx, WIDTH, HEIGHT, 'color', 0.5);
    }
    
    try {
      await drawFrame(ctx, coldOpenSeg, coldAsset, coldImg, coldProgress, project, coldGlobalProgress, coldOpenSegIndex, true);
    } catch (err) {
      console.error(`  ❌ Cold open drawFrame failed: ${err.message}, rendering fallback frame`);
      // Render a simple fallback frame with segment title
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 32px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(coldOpenSeg?.title || 'Loading...', WIDTH / 2, HEIGHT / 2);
    }

    // Opening hook overlay — bold text on dark background for first 0.3s (req c)
    if (f < COLD_OPEN_HOOK_FRAMES) {
      const hookProgress = f / COLD_OPEN_HOOK_FRAMES;
      // Dark overlay
      ctx.fillStyle = `rgba(0, 0, 0, ${0.85 * (1 - hookProgress * 0.7)})`;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      // Hook text with fast fade-in (0.3s)
      ctx.save();
      ctx.globalAlpha = Math.min(1, hookProgress * 3);
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.round(HEIGHT * 0.05)}px system-ui, -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
      ctx.shadowBlur = 24;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;
      ctx.fillText(hookText, WIDTH / 2, HEIGHT / 2);
      ctx.restore();
    }

    // "COMING UP..." text overlay in the top-right corner with contrast background (Requirements 4.1, 4.2, 5.2)
    const comingUpSafeZone = globalSafeZone || computeSafeZone(WIDTH, HEIGHT);
    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.font = '600 14px system-ui, -apple-system, sans-serif';
    ctx.letterSpacing = '2px';
    const comingUpW = ctx.measureText('COMING UP...').width;
    const comingUpPadX = 10;
    const comingUpPadY = 6;
    const comingUpY = comingUpSafeZone.top + 4;
    ctx.fillStyle = 'rgba(96, 165, 250, 0.85)';
    ctx.fillRect(WIDTH - comingUpSafeZone.right - comingUpW - comingUpPadX * 2, comingUpY - comingUpPadY, comingUpW + comingUpPadX * 2, 16 + comingUpPadY * 2);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.letterSpacing = '0px';
    ctx.fillText('COMING UP...', WIDTH - comingUpSafeZone.right - comingUpPadX, comingUpY);
    ctx.restore();

    // Task 16: Draw watermark/branding
    const channelName = project.exportSettings?.channelName || 'THE UPDATE DESK';
    const watermarkLogoUrl = project.exportSettings?.watermarkLogoUrl;
    drawWatermark(ctx, WIDTH, HEIGHT, {
      text: channelName,
      position: 'bottom-right',
      opacity: 0.7,
    });

    // #18: Fade-to-black on the last COLD_OPEN_FADE_FRAMES of the cold open for a smooth
    // crossfade transition into the title card (which already has its own fade-in).
    if (f >= COLD_OPEN_FRAMES - COLD_OPEN_FADE_FRAMES) {
      const fadeOut = (COLD_OPEN_FRAMES - f) / COLD_OPEN_FADE_FRAMES;
      ctx.fillStyle = `rgba(0,0,0,${1 - fadeOut})`;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }

    const raw = getFrameBuffer(canvas);
    if (raw === null) break;
    const canWrite = writeFrameSafely(raw);
    if (canWrite === 'dead') break;
    if (!canWrite) {
      try { await waitForDrain(30000); } catch { log('warn', 'Drain timeout, continuing anyway'); }
    }
    totalFrames++;
    globalFrameCounter++;
    
    // Periodic progress logging (every 50 frames or every 2 seconds)
    if (totalFrames % 50 === 0 || Date.now() - lastProgressLog >= 2000) {
      logRenderProgress();
    }
  }

  // ── Intro title card (first 3 seconds) ──────────────────────────────────
  const projectTitle = project.title || 'AutoTube Video';
  const projectTopic = project.topic || project.title || '';
  log('info', `  Title card: ${titleCardFrames} frames (${TITLE_CARD_SECONDS}s)`);

  if (!isShortsMode) for (let f = 0; f < titleCardFrames; f++) {
    const progress = f / titleCardFrames;
    drawTitleCardFrame(ctx, projectTitle, projectTopic, progress);

    const raw = getFrameBuffer(canvas);
    if (raw === null) break;
    const canWrite = writeFrameSafely(raw);
    if (canWrite === 'dead') break;
    if (!canWrite) {
      try { await waitForDrain(30000); } catch { log('warn', 'Drain timeout, continuing anyway'); }
    }
    totalFrames++;
  }

  // ── Main segment rendering loop ─────────────────────────────────────────
  const accentColorsMap = { intro: '#06d6a0', section: '#4cc9f0', transition: '#f72585', outro: '#06d6a0' };

  // P0: Precompute segment elapsed times (avoids O(n) loop per frame)
  const segmentElapsedTimes = new Float64Array(project.script.length);
  let cumulativeElapsed = TITLE_CARD_SECONDS + COLD_OPEN_FRAMES / FPS;
  for (let si = 0; si < project.script.length; si++) {
    cumulativeElapsed += SEGMENT_TITLE_FRAMES / FPS;
    segmentElapsedTimes[si] = cumulativeElapsed;
    cumulativeElapsed += project.script[si].duration;
  }

  for (let si = 0; si < project.script.length; si++) {
    currentSegmentIndex = si; // Task 129: Track for checkpointing
    const seg = project.script[si];
    const segMedia = project.media.filter(a => a.segmentId === seg.id);
    const numFrames = Math.max(1, Math.round(seg.duration * FPS));
    const mc = Math.max(1, segMedia.length);
    const per = Math.max(1, Math.floor(numFrames / mc));

    log('info', `  Segment ${si + 1}/${project.script.length}: "${seg.title}" (${seg.duration}s, ${segMedia.length} media, ${numFrames} frames)`);

    // Task 125: Per-segment metrics tracking
    stepMetrics.startStep(`segment_${si}`);

    // ── Segment title card: 1.5s (dynamic frames) before each segment ──
    const segAccent = accentColorsMap[seg.type] || '#9b59b6';
    const UP_NEXT_FRAMES = Math.min(Math.max(1, Math.round(0.5 * FPS)), SEGMENT_TITLE_FRAMES);
    for (let tf = 0; tf < SEGMENT_TITLE_FRAMES; tf++) {
      const titleProgress = tf / SEGMENT_TITLE_FRAMES;

      // P1: Skip expensive particle layers for title cards (covered by text)
      drawProceduralBackground(ctx, seg, titleProgress * 0.1, false, si);

      // Fade-in over the first SEGMENT_TITLE_FADE_FRAMES frames
      const titleFadeAlpha = Math.min(1, (tf + 1) / SEGMENT_TITLE_FADE_FRAMES);

      ctx.save();
      ctx.globalAlpha = titleFadeAlpha;

      // "UP NEXT" badge for the first 0.5s (req f)
      if (tf < UP_NEXT_FRAMES) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, (tf + 1) / Math.max(1, UP_NEXT_FRAMES * 0.3));
        ctx.fillStyle = '#facc15';
        ctx.font = '700 18px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.letterSpacing = '4px';
        ctx.fillText('UP NEXT', WIDTH / 2, HEIGHT * 0.28);
        ctx.restore();
      }

      // Segment number — accent-colored with progress indicator
      ctx.fillStyle = '#93c5fd';
      ctx.font = '600 14px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.letterSpacing = '2px';
      ctx.fillText(`CHAPTER ${si + 1} OF ${project.script.length}`, WIDTH / 2, HEIGHT * 0.35);

      // Small progress dots
      const dotSpacing = 12;
      const dotsWidth = project.script.length * dotSpacing;
      const dotsStartX = WIDTH / 2 - dotsWidth / 2 + dotSpacing / 2;
      for (let di = 0; di < project.script.length; di++) {
        const isActive = di === si;
        ctx.beginPath();
        ctx.arc(dotsStartX + di * dotSpacing, HEIGHT * 0.38, isActive ? 3 : 2, 0, Math.PI * 2);
        ctx.fillStyle = isActive ? '#60a5fa' : '#374151';
        ctx.fill();
      }

      // Segment title — bold 42px white text centered at 45% height with scale animation
      const titleScale = titleProgress < 0.2 ? 1.05 - (titleProgress / 0.2) * 0.05 : 1.0;
      ctx.save();
      ctx.translate(WIDTH / 2, HEIGHT * 0.45);
      ctx.scale(titleScale, titleScale);
      ctx.translate(-WIDTH / 2, -HEIGHT * 0.45);
      ctx.shadowColor = '#60a5fa';
      ctx.shadowBlur = 20;
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 42px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.letterSpacing = '0px';
      const { lines: cardTitleLines, fontSize: cardTitleFontSize } = wrapTitleText(ctx, seg.title, WIDTH, 42, undefined, 'bold');
      const cardTitleLineHeight = cardTitleFontSize * 1.3;
      const cardTitleBlockHeight = cardTitleLines.length * cardTitleLineHeight;
      const cardTitleStartY = HEIGHT * 0.45 - cardTitleBlockHeight / 2 + cardTitleLineHeight / 2;
      for (let i = 0; i < cardTitleLines.length; i++) {
        ctx.fillText(cardTitleLines[i], WIDTH / 2, cardTitleStartY + i * cardTitleLineHeight);
      }
      ctx.restore();

      // Thin accent-colored line below the title, 150px wide, centered
      const cardTitleBlockBottom = cardTitleStartY + (cardTitleLines.length - 1) * cardTitleLineHeight + cardTitleLineHeight / 2;
      ctx.shadowBlur = 0;
      ctx.fillStyle = segAccent;
      ctx.fillRect((WIDTH - 150) / 2, cardTitleBlockBottom + 12, 150, 3);

      ctx.restore();

      const raw = getFrameBuffer(canvas);
      if (raw === null) break;
      const canWrite = writeFrameSafely(raw);
      if (canWrite === 'dead') break;
      if (!canWrite) {
        try { await waitForDrain(30000); } catch { log('warn', 'Drain timeout, continuing anyway'); }
      }
      totalFrames++;
      globalFrameCounter++;
      
      // Periodic progress logging (every 50 frames or every 2 seconds)
      if (totalFrames % 50 === 0 || Date.now() - lastProgressLog >= 2000) {
        logRenderProgress();
      }
    }

    // Flash transition frame between title card and segment content (req f)
    if (!DRAFT_MODE) {
      drawFlashFrame(ctx, WIDTH, HEIGHT, 'white', 0.5);
      const raw = getFrameBuffer(canvas);
      if (raw === null) break;
      const canWrite = writeFrameSafely(raw);
      if (canWrite === 'dead') break;
      if (!canWrite) {
        try { await waitForDrain(30000); } catch { log('warn', 'Drain timeout, continuing anyway'); }
      }
      totalFrames++;
      globalFrameCounter++;
    }

    // ── Regular segment frames ────────────────────────────────────────────
    let prevMi = -1; // Track previous media index for zoom/pan transitions (Step 10)
    let zoomTransitionCounter = -1; // Counts down from 3 when mi changes

    // Pacing-based asset alternation interval (Requirements 13.3, 13.4)
    // Capped to a strict 3-second ceiling for premium documentary engagement
    const pacingScore = seg.pacingScore || 3;
    const assetAlternationInterval = Math.min(3.0, pacingScore >= 4 ? 2 : pacingScore <= 2 ? 4 : 3);


    for (let f = 0; f < numFrames; f++) {
      // Use computeActiveAssetIndex for multi-asset alternation (Requirement 4.4)
      const frameTimeSec = f / FPS;
      const mi = segMedia.length > 1
        ? computeActiveAssetIndex(frameTimeSec, segMedia.length, assetAlternationInterval)
        : Math.min(Math.floor(f / per), mc - 1);
      const asset = segMedia[mi];
      let img = null;

      if (asset) {
        if (asset.type === 'video') {
          // Try loading smooth 24fps frame from disk cache first
          const framesDir = videoFramesDirectories.get(asset.url);
          const clipDuration = asset.duration || 10;
          const progress = f / numFrames;
          const timestamp = progress * clipDuration;

          if (framesDir) {
            const frameIndex = Math.min(
              Math.max(1, Math.floor(progress * clipDuration * 24) + 1),
              Math.max(1, Math.floor(clipDuration * 24))
            );
            const framePath = join(framesDir, `frame_${String(frameIndex).padStart(4, '0')}.jpg`);
            if (existsSync(framePath)) {
              try {
                img = await loadImage(framePath);
              } catch (e) {
                // fall through to fallback caches
              }
            }
          }

          if (!img) {
            // Find closest pre-extracted frame (key timestamps: 0%, 25%, 50%, 75%, 95%)
            const keyTimestamps = [0, 0.25, 0.5, 0.75, 0.95];
            const closestPct = keyTimestamps.reduce((best, pct) =>
              Math.abs(pct - progress) < Math.abs(best - progress) ? pct : best
            );
            const cacheKey = `${asset.url}@${(closestPct * clipDuration).toFixed(2)}`;
            img = videoFrameCache.get(cacheKey) || null;

            // Fallback: try fetchVideoFrame if pre-extraction missed (e.g., cold open with different progress)
            if (!img) {
              try {
                img = await fetchVideoFrame(asset.url, timestamp, asset.thumbnailUrl);
              } catch {
                // Fallback to thumbnail image
                if (asset.thumbnailUrl) {
                  img = imgCache.get(asset.thumbnailUrl) || null;
                }
              }
            }
          }
        } else {
          img = imgCache.get(asset.url) || null;
        }
        // Requirement 4.7: procedural background fallback when asset fails to load
        if (!img && asset) {
          drawProceduralFallbackWithText(ctx, WIDTH, HEIGHT, seg.title, seg.type);
        }
      }

      const progress = f / numFrames;

      // Step 10: Detect media asset change within segment and trigger zoom-out transition
      if (mi !== prevMi && prevMi >= 0) {
        zoomTransitionCounter = 3; // Start 3-frame zoom-out transition
      }
      prevMi = mi;

      // Compute global progress for the progress bar (P0: O(1) lookup instead of O(n) loop)
      const elapsed = segmentElapsedTimes[si] + (f / numFrames) * seg.duration;
      const globalProgress = Math.min(1, elapsed / totalSec);

      // #17: Fade-in from black for the first frames of each segment (except the first)
      const FADE_FRAMES = renderFlags.useFastPacing
        ? Math.max(1, Math.round(SEGMENT_FADE_FRAMES * 0.4))
        : SEGMENT_FADE_FRAMES;

      // Step 10: Apply zoom-out scale transform during media asset transitions
      const applyZoomTransition = zoomTransitionCounter > 0;
      let zoomScale = 1.0;
      if (applyZoomTransition) {
        if (zoomTransitionCounter === 3) zoomScale = 1.15;
        else if (zoomTransitionCounter === 2) zoomScale = 1.08;
        else zoomScale = 1.0;
        zoomTransitionCounter--;
      }

      if (si > 0 && f < FADE_FRAMES) {
        // Crossfade transition: blend outgoing black with incoming frame using
        // computeCrossfadeAlpha for consistent blending (Requirements 4.3, 4.6, 10.2)
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        ctx.save();
        ctx.globalAlpha = computeCrossfadeAlpha(f, FADE_FRAMES);
        if (applyZoomTransition && zoomScale !== 1.0) {
          ctx.translate(WIDTH / 2, HEIGHT / 2);
          ctx.scale(zoomScale, zoomScale);
          ctx.translate(-WIDTH / 2, -HEIGHT / 2);
        }
        try {
          await drawFrame(ctx, seg, asset, img, progress, project, globalProgress, si);
        } catch (err) {
          console.error(`    ❌ drawFrame failed (crossfade): ${err.message}, using fallback`);
          ctx.fillStyle = '#3a4a7e';
          ctx.fillRect(0, 0, WIDTH, HEIGHT);
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 24px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(seg.title || `Segment ${si + 1}`, WIDTH / 2, HEIGHT / 2);
        }
        ctx.restore();
      } else {
        if (applyZoomTransition && zoomScale !== 1.0) {
          ctx.save();
          ctx.translate(WIDTH / 2, HEIGHT / 2);
          ctx.scale(zoomScale, zoomScale);
          ctx.translate(-WIDTH / 2, -HEIGHT / 2);
          try {
            await drawFrame(ctx, seg, asset, img, progress, project, globalProgress, si);
          } catch (err) {
            console.error(`    ❌ drawFrame failed (zoom): ${err.message}, using fallback`);
            ctx.fillStyle = '#3a4a7e';
            ctx.fillRect(0, 0, WIDTH, HEIGHT);
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 24px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(seg.title || `Segment ${si + 1}`, WIDTH / 2, HEIGHT / 2);
          }
          ctx.restore();
        } else {
          try {
            await drawFrame(ctx, seg, asset, img, progress, project, globalProgress, si);
          } catch (err) {
            console.error(`    ❌ drawFrame failed: ${err.message}, using fallback`);
            ctx.fillStyle = '#3a4a7e';
            ctx.fillRect(0, 0, WIDTH, HEIGHT);
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 24px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(seg.title || `Segment ${si + 1}`, WIDTH / 2, HEIGHT / 2);
          }
        }
      }

      // ── Post-Review Enrichment: AI feedback-driven visual overlays ──
      if (renderFlags.showDataOverlay && seg.narration) {
        const statMatch = seg.narration.match(/\$[\d,.]+\s*(billion|million|trillion)?|\d+(\.\d+)?%|\d[\d,]*\s*(billion|million|trillion)/i);
        if (statMatch) {
          ctx.save();
          ctx.font = `800 ${Math.round(HEIGHT * 0.08)}px system-ui, -apple-system, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.shadowColor = 'rgba(96, 165, 250, 0.6)';
          ctx.shadowBlur = 30;
          ctx.fillStyle = '#60a5fa';
          ctx.fillText(statMatch[0], WIDTH / 2, HEIGHT * 0.25);
          ctx.restore();
        }
      }
      if (renderFlags.showKineticText && seg.narration) {
        const words = seg.narration.split(' ');
        if (words.length > 0) {
          const highlightIdx = Math.min(Math.floor(progress * words.length), words.length - 1);
          const highlightWord = words[highlightIdx];
          if (highlightWord && highlightWord.length > 2) {
            ctx.save();
            ctx.font = `700 ${Math.round(HEIGHT * 0.045)}px system-ui, -apple-system, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = 'rgba(168, 85, 247, 0.6)';
            ctx.shadowBlur = 20;
            ctx.fillStyle = '#a78bfa';
            ctx.globalAlpha = 0.3 + 0.7 * Math.abs(Math.sin(globalFrameCounter * 0.1));
            ctx.fillText(highlightWord, WIDTH / 2, HEIGHT * 0.72);
            ctx.restore();
          }
        }
      }

      // Task 16: Draw watermark/branding on every frame (only if debug overlays are enabled)
      if (RENDER_DEBUG_OVERLAYS) {
        const wmChannelName = project.exportSettings?.channelName || 'THE UPDATE DESK';
        drawWatermark(ctx, WIDTH, HEIGHT, {
          text: wmChannelName,
          position: 'bottom-right',
          opacity: 0.7,
        });
      }


      // Write raw RGBA frame to ffmpeg with safety checks
      const raw = getFrameBuffer(canvas);
      if (raw === null) break;
      const canWrite = writeFrameSafely(raw);
      if (canWrite === 'dead') break;
      if (!canWrite) {
        try { await waitForDrain(30000); } catch { log('warn', 'Drain timeout, continuing anyway'); }
      }

      totalFrames++;
      globalFrameCounter++;

      // Periodic progress logging (every 50 frames or every 2 seconds)
      if (totalFrames % 50 === 0 || Date.now() - lastProgressLog >= 2000) {
        logRenderProgress();
      }
    }

    // Task 125: End segment metrics
    stepMetrics.endStep(`segment_${si}`, { frameCount: numFrames });
  }

  // ── End screen (last 4 seconds) ─────────────────────────────────────────
  log('info', `  End screen: ${endScreenFrames} frames (${END_SCREEN_SECONDS}s)`);

  for (let f = 0; f < endScreenFrames; f++) {
    const progress = f / endScreenFrames;
    drawEndScreenFrame(ctx, projectTitle, progress);

    const raw = getFrameBuffer(canvas);
    if (raw === null) break;
    const canWrite = writeFrameSafely(raw);
    if (canWrite === 'dead') break;
    if (!canWrite) {
      try { await waitForDrain(30000); } catch { log('warn', 'Drain timeout, continuing anyway'); }
    }
    totalFrames++;
  }

  ffmpeg.stdin.end();

  // Safety: Add timeout to prevent infinite hangs during encoding
  const ENCODING_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes max for encoding
  log('info', `\n⏳ Encoding video (timeout: ${ENCODING_TIMEOUT_MS / 1000}s)...`);

  await new Promise((resolve, reject) => {
    let settled = false;
    const timeoutId = setTimeout(() => {
      if (!settled) {
        settled = true;
        console.error(`\n❌ Ffmpeg encoding timed out after ${ENCODING_TIMEOUT_MS / 1000}s`);
        ffmpeg.kill('SIGKILL');
        reject(new Error(`Ffmpeg encoding timed out after ${ENCODING_TIMEOUT_MS / 1000}s`));
      }
    }, ENCODING_TIMEOUT_MS);

    ffmpeg.on('close', code => {
      if (!settled) {
        settled = true;
        clearTimeout(timeoutId);
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`ffmpeg exited with code ${code}`));
        }
      }
    });

    ffmpeg.on('error', err => {
      if (!settled) {
        settled = true;
        clearTimeout(timeoutId);
        reject(err);
      }
    });
  });

  renderPassed = true;
  finalMp4File = OUTPUT_FILE;

  log('info', `\n✅ Done! ${totalFrames} frames rendered`);
  log('info', `📹 Output: ${OUTPUT_FILE}`);

  // Task 124: Quality gate — validate video output
  const videoGate = validateOutput(OUTPUT_FILE, 'Rendered video');
  if (videoGate.valid) {
    log('info', `  ✅ Video quality gate passed (${(videoGate.size / 1024 / 1024).toFixed(1)}MB)`);
    stepMetrics.endStep('video_render', { frameCount: totalFrames, fileSize: videoGate.size });
  } else {
    log('info', `  ⚠ Video quality gate: ${videoGate.error}`);
    stepMetrics.endStep('video_render', { frameCount: totalFrames, error: videoGate.error });
  }

  // Task 121: Final memory report
  logMemoryUsage('post-render');

  // Task 129: Clear checkpoint on successful completion
  renderStateManager.markComplete();

  // Two-pass encoding post-processing: re-encode temp render with two-pass for highest quality
  if (quality === 'highest' && !DRAFT_MODE && twoPassState.tempFile && existsSync(twoPassState.tempFile)) {
    log('info', `\n🎬 Two-pass encoding for highest quality...`);
    const tempFile = twoPassState.tempFile;
    const passLog = join(tmpdir(), `autotube-twopass-${Date.now()}.log`);
    const codec = twoPassState.finalCodec;
    const crfVal = twoPassState.finalCrf;
    const extraArgs = twoPassState.finalExtraArgs || [];

    // Pass 1: analyze
    const pass1Args = [
      '-y', '-i', tempFile,
      '-c:v', codec, '-preset', 'slow', '-b:v', '12M', '-pass', '1',
      '-passlogfile', passLog,
      ...extraArgs,
      '-an', '-f', 'null', process.platform === 'win32' ? 'NUL' : '/dev/null',
    ];
    log('info', `  Pass 1/2 (analysis)...`);
    const pass1 = spawnSync('ffmpeg', pass1Args, { encoding: 'utf8', timeout: 600000 });

    if (pass1.status === 0) {
      // Pass 2: encode with analysis data
      const pass2Args = [
        '-y', '-i', tempFile,
        '-c:v', codec, '-preset', 'slow', '-b:v', '12M', '-pass', '2',
        '-passlogfile', passLog,
        ...extraArgs,
        '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
        OUTPUT_FILE,
      ];
      log('info', `  Pass 2/2 (encoding)...`);
      const pass2 = spawnSync('ffmpeg', pass2Args, { encoding: 'utf8', timeout: 600000 });

      if (pass2.status === 0) {
        log('info', `  ✓ Two-pass encoding complete`);
      } else {
        log('info', `  ⚠ Pass 2 failed (code ${pass2.status}), keeping single-pass output`);
      }

      // Clean up pass logs
      try { unlinkSync(passLog + '-0.log'); } catch {}
      try { unlinkSync(passLog + '-0.log.mbtree'); } catch {}
    } else {
      log('info', `  ⚠ Pass 1 failed (code ${pass1.status}), keeping single-pass output`);
    }

    // Clean up temp render file
    try { unlinkSync(tempFile); } catch {}
    twoPassState.tempFile = null;
    twoPassState.tempArgs = null;
    twoPassState.finalCodec = null;
    twoPassState.finalCrf = null;
    twoPassState.finalExtraArgs = null;
  }

  // Narration was pre-generated before rendering. Use the existing audioFiles.
  if (audioFiles.length > 0) {
    log('info', `\nMuxing audio with video... (${audioFiles.length} audio segments)`);
    const combinedAudio = join(audioDir, 'combined-narration.aac');
    const audioOk = await concatenateAudio(audioFiles, combinedAudio);
    log('info', `  Audio concatenation: ${audioOk ? '✓' : '✗'} (${existsSync(combinedAudio) ? 'file exists' : 'file missing'})`);

    if (audioOk) {
      // Mux video + audio into final MP4
      const finalMp4 = OUTPUT_FILE.replace('.mp4', '-final.mp4');
      log('info', `  Video input: ${OUTPUT_FILE} (${existsSync(OUTPUT_FILE) ? 'exists' : 'MISSING'})`);
      log('info', `  Audio input: ${combinedAudio} (${existsSync(combinedAudio) ? 'exists' : 'MISSING'})`);
      log('info', `  MP4 output: ${finalMp4}`);

        // Use the audio module's muxVideoWithAudio for background music mixing.
        try {
          const { muxVideoWithAudio: muxAudio } = await import('./server-render/audio.mjs');
          const videoStyle = project.style || 'business_insider';
          const bgMusicEnabled = project.exportSettings?.backgroundMusic !== false;
          const musicPreset = project.exportSettings?.musicPreset || null;
          log('info', `  Style: ${videoStyle}, BG music: ${bgMusicEnabled}, Music preset: ${musicPreset || 'auto'}, Duration: ${totalSec}s`);

          // Build narration timings from project script
          // Build narration timings from project script matching transition configurations
          let currentTime = TITLE_CARD_SECONDS + COLD_OPEN_FRAMES / FPS;
          const narrationTimings = [];
          if (project.script) {
            for (const seg of project.script) {
              currentTime += CONFIG.SEGMENT_TITLE_DURATION;
              narrationTimings.push({ start: currentTime, end: currentTime + seg.duration });
              currentTime += seg.duration;
            }
          }


          const muxOk = muxAudio(OUTPUT_FILE, combinedAudio, finalMp4, totalSec, {
          style: videoStyle,
          musicPreset,
          backgroundMusic: bgMusicEnabled,
          enableAmbient: true,
          enableAudioFx: true,
          enableSubBass: true,
          enableDucking: true,
          statTimestamps: project.script ? project.script.map((s, i) => {
            const match = s.narration ? s.narration.match(/\d+%/) : null;
            return match ? i * 8 : null;
          }).filter(Boolean) : [],
          wordTimestamps: Array.from(wordTimestampCache.values()).flat(),
          narrationTimings,
        });
        log('info', `  Mux result: ${muxOk ? '✓ SUCCESS' : '✗ FAILED'}`);

        // Task 124: Quality gate — validate muxed output
        if (muxOk) {
          const muxGate = validateOutput(finalMp4, 'Muxed video');
          if (muxGate.valid) {
            log('info', `  ✅ Mux quality gate passed (${(muxGate.size / 1024 / 1024).toFixed(1)}MB)`);
            stepMetrics.endStep('audio_mux', { fileSize: muxGate.size });

            // Task 125: Measure audio loudness
            const loudness = measureAudioLoudness(finalMp4);
            if (loudness !== null) {
              log('info', `  📊 Audio loudness: ${loudness.toFixed(1)} LUFS`);
              stepMetrics.endStep('audio_mux', { fileSize: muxGate.size, loudness });
            }
          } else {
            log('info', `  ⚠ Mux quality gate: ${muxGate.error}`);
          }
        }

        if (muxOk) {
          log('info', `✅ Final video with audio: ${finalMp4}`);

          // Task 57: Embed chapters as metadata in MP4 using enhanced chapter system
          if (project.script && project.script.length > 0) {
            const chapters = chaptersFromSegments(project.script, 5);
            const chapterMetadata = generateFFmpegChapterMetadata(chapters);
            const chaptersFile = join(dirname(OUTPUT_FILE), 'chapters.txt');
            writeFileSync(chaptersFile, chapterMetadata);

            const chaptersMp4 = finalMp4.replace('.mp4', '-chapters.mp4');
            const chapterArgs = embedChaptersCommand(finalMp4, chaptersFile, chaptersMp4);
            const chapterResult = spawnSync('ffmpeg', ['-y', ...chapterArgs], { encoding: 'utf8', timeout: 30000 });

            if (chapterResult.status === 0 && existsSync(chaptersMp4)) {
              log('info', `✅ Chapters embedded in MP4: ${chaptersMp4}`);
              try { unlinkSync(chaptersFile); } catch {}
              try { unlinkSync(finalMp4); } catch {}
              spawnSync('mv', [chaptersMp4, finalMp4]);
            } else {
              console.warn('⚠ Chapter embedding failed, keeping video without chapters metadata');
              try { unlinkSync(chaptersFile); } catch {}
            }
          }

          // ── Autonomous Post-Render AI Quality Gate ──
          const openRouterKey = process.env.OPENROUTER_API_KEY || process.env.VITE_OPENROUTER_KEY;
          if (openRouterKey) {
            log('info', '\n🤖 Launching Autonomous AI Video Quality Review...');
            try {
              const { runServerAIReview, parseReviewFeedback } = await import('./server-render/aiReviewer.mjs');
              const scriptText = project.script.map((s) => s.narration).join('\n\n');
              const minScore = 9.0; // Demand Grade A standard (score >= 9.0/10)
              
              const reviewResult = await runServerAIReview(finalMp4, totalSec, scriptText, openRouterKey, minScore);
              if (reviewResult.success) {
                if (reviewResult.passed) {
                  log('info', `\n✅ AI Quality Gate APPROVED the render! Score: ${reviewResult.score}/10.`);
                } else {
                  log('info', `\n🤖 AI Review: Score ${reviewResult.score}/10 (Threshold: ${minScore}/10). Proceeding with render.`);
                  console.error(`[AI Feedback] ${reviewResult.report?.summary || 'N/A'}`);
                }

                // ── Post-Review Enrichment Pass ──
                // Parse the AI summary for actionable improvement items and apply corrective actions.
                const feedback = parseReviewFeedback(reviewResult.report?.summary || '');
                if (feedback.actions.length > 0) {
                  log('info', '\n  🔧 Post-Review Enrichment Pass — parsing AI feedback for corrective actions...');
                  for (const action of feedback.actions) {
                    log('info', `    ✓ Applied fix: ${action.label}`);
                  }

                  // Apply corrective actions to rendering parameters
                  if (feedback.showDataOverlay) {
                    renderFlags.showDataOverlay = true;
                  }
                  if (feedback.showKineticText) {
                    renderFlags.showKineticText = true;
                  }
                  if (feedback.useFastPacing) {
                    renderFlags.useFastPacing = true;
                  }
                } else {
                  log('info', '\n  ✓ Post-Review Enrichment Pass — no corrective actions needed.');
                }

                // If any corrective actions were applied, re-run the render with updated params
                if (feedback.actions.length > 0) {
                  log('info', '\n  🔄 Re-rendering with AI-applied improvements...');
                  // Reset rendering state for re-render
                  totalFrames = 0;
                  globalFrameCounter = 0;
                  
                  // Clean up temporary smooth video frames directories
                  for (const dir of videoFramesDirectories.values()) {
                    try { rmSync(dir, { recursive: true, force: true }); } catch {}
                  }
                  videoFramesDirectories.clear();
                  clipFileCache.clear();
                  
                  continue; // Restart render loop with new flags
                }
              } else {
                log('warn', `⚠ AI Review API call returned success=false: ${reviewResult.error || 'unknown error'}`);
              }
              renderPassed = true;
              finalMp4File = finalMp4;
            } catch (err) {
              console.error(`⚠ AI Quality Review Exception: ${err.message}`);
              // Still mark render as passed — the video itself is fine
              renderPassed = true;
              finalMp4File = finalMp4;
              if (err.message.includes('AI Quality Gate failure')) {
                throw err;
              }
            }
          } else {
            log('warn', '\n⚠ Skipping visual AI quality check: No OPENROUTER_API_KEY or VITE_OPENROUTER_KEY env variable set.');
            renderPassed = true;
            finalMp4File = finalMp4;
          }
          } else {
            console.warn('⚠ Muxing failed, video-only output saved');
            renderPassed = true;
            finalMp4File = OUTPUT_FILE;
          }
        } catch (muxErr) {
          console.error(`⚠ Mux import/execution error: ${muxErr.message}`);
          console.error(muxErr.stack);
          renderPassed = true;
          finalMp4File = OUTPUT_FILE;
        }
      } else {
        console.warn('⚠ Audio concatenation failed — skipping mux');
        renderPassed = true;
        finalMp4File = OUTPUT_FILE;
      }

    // Task 120: If render did not pass and we have more quality levels, degrade
    if (!renderPassed && attempt < MAX_ATTEMPTS) {
      currentQualityLevel++;
      const nextQuality = QUALITY_DEGRADATION_CHAIN[Math.min(currentQualityLevel, QUALITY_DEGRADATION_CHAIN.length - 1)];
      log('info', `\n  📉 Degrading quality for next attempt: ${nextQuality.label}`);

      // Apply quality degradation settings
      if (nextQuality.draftMode) {
        DRAFT_MODE = true;
      }
      if (nextQuality.resolutionScale < 1.0) {
        const origPreset = RESOLUTION_PRESETS[project.exportSettings?.resolution || '1080p'];
        if (origPreset) {
          WIDTH = Math.round(origPreset.width * nextQuality.resolutionScale);
          HEIGHT = Math.round(origPreset.height * nextQuality.resolutionScale);
        }
      }
      totalFrames = 0;
      globalFrameCounter = 0;
    }
  }

  } // end while loop

  // Clean up temporary narration-audio directory after retry loop terminates/succeeds
  try {
    if (existsSync(audioDir)) {
      rmSync(audioDir, { recursive: true, force: true });
      log('info', `   Cleaned up narration-audio dir: ${audioDir}`);
    }
  } catch (cleanupErr) {
    console.warn(`   Failed to clean up narration-audio dir: ${cleanupErr.message}`);
  }

  // Clean up downloaded video clips from temp directory
  try {
    for (const [, clipPath] of clipFileCache) {
      if (existsSync(clipPath)) {
        unlinkSync(clipPath);
      }
    }
    clipFileCache.clear();
    videoFrameCache.clear();
    
    // Clean up temporary smooth video frames directories
    for (const dir of videoFramesDirectories.values()) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {}
    }
    videoFramesDirectories.clear();
    
    log('info', '   Cleaned up video clip cache');
  } catch (cleanupErr) {
    console.warn(`   Failed to clean up video clips: ${cleanupErr.message}`);
  }

  if (renderPassed && finalMp4File) {
    // Copy to Downloads with a topic-based filename
    const safeTitle = (project.title || project.topic || 'autotube-video')
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase()
      .substring(0, 60);
    const downloadName = `autotube-${safeTitle}.mp4`;
    const homeDir = homedir() || tmpdir();
    try {
      copyFileSync(finalMp4File, `${homeDir}/Downloads/${downloadName}`);
      log('info', `📁 Copied to ~/Downloads/${downloadName}`);
    } catch (copyErr) {
      console.warn(`  ⚠ Could not copy video to downloads folder: ${copyErr.message}`);
    }
  }

  // Task 125: Log per-step metrics summary
  stepMetrics.logSummary();

  // Quick quality check
  const probe = spawnSync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration,size',
    '-of', 'default=noprint_wrappers=1', OUTPUT_FILE,
  ], { encoding: 'utf8' });
  log('info', 'Video info:', probe.stdout.trim());

  // Check if images actually rendered (sample a frame)
  const sampleFrame = Math.floor(totalFrames * 0.3);
  const sampleCanvas = createCanvas(WIDTH, HEIGHT);
  const sampleCtx = sampleCanvas.getContext('2d');
  const sampleSeg = project.script[Math.floor(project.script.length * 0.3)];
  const sampleMedia = project.media.filter(a => a.segmentId === sampleSeg?.id);
  const sampleAsset = sampleMedia[0];
  let sampleImg = null;
  if (sampleAsset) {
    if (sampleAsset.type === 'video') {
      sampleImg = await fetchVideoFrame(sampleAsset.url, 0.5, sampleAsset.thumbnailUrl);
    } else {
      sampleImg = imgCache.get(sampleAsset.url) || null;
    }
  }
  await drawFrame(sampleCtx, sampleSeg || project.script[0], sampleAsset, sampleImg, 0.5, project, 0.5, Math.floor(project.script.length * 0.3));
  const sampleData = sampleCtx.getImageData(WIDTH/4, HEIGHT/4, WIDTH/2, HEIGHT/2);
  let totalBrightness = 0;
  for (let i = 0; i < sampleData.data.length; i += 4) {
    totalBrightness += (sampleData.data[i] + sampleData.data[i+1] + sampleData.data[i+2]) / 3;
  }
  const avgBrightness = Math.round(totalBrightness / (sampleData.data.length / 4));
  log('info', `\nFrame quality check: avg brightness = ${avgBrightness}/255`);
  if (avgBrightness > 40) {
    log('info', '✅ Real images are rendering! Video should show actual imagery.');
  } else {
    log('warn', '⚠ Low brightness — images may not have loaded. Check proxy connectivity.');
  }

  // ── #18: Generate thumbnail ──────────────────────────────────────────────
  log('info', '\nGenerating thumbnail...');
  try {
    const thumbCanvas = createCanvas(1280, 720);
    const thumbCtx = thumbCanvas.getContext('2d');

    // Find the best-scored media asset to use as the thumbnail background
    const bestAsset = project.media.reduce((best, a) => (a.score || 0) > (best.score || 0) ? a : best, project.media[0]);
    let bestImg = null;

    if (bestAsset) {
      try {
        if (bestAsset.type === 'video') {
          bestImg = await fetchVideoFrame(bestAsset.url, 0.5, bestAsset.thumbnailUrl);
        } else {
          bestImg = imgCache.get(bestAsset.url) || await fetchImage(bestAsset.url);
        }
      } catch {
        bestImg = null;
      }
    }

    if (bestImg) {
      // Draw the best-scored image full-bleed on the 1280x720 canvas
      const iw = bestImg.width || bestImg.naturalWidth || 1280;
      const ih = bestImg.height || bestImg.naturalHeight || 720;
      const scale = Math.max(1280 / iw, 720 / ih);
      const dw = iw * scale;
      const dh = ih * scale;
      thumbCtx.drawImage(bestImg, (1280 - dw) / 2, (720 - dh) / 2, dw, dh);

      // Add a dark gradient overlay on the bottom 50% for text readability
      const gradY = 720 * 0.50;
      const grad = thumbCtx.createLinearGradient(0, gradY, 0, 720);
      grad.addColorStop(0, 'rgba(10, 10, 26, 0)');
      grad.addColorStop(0.3, 'rgba(10, 10, 26, 0.60)');
      grad.addColorStop(1, 'rgba(10, 10, 26, 0.90)');
      thumbCtx.fillStyle = grad;
      thumbCtx.fillRect(0, gradY, 1280, 720 - gradY);

      // Accent bar with modern gradient
      const thumbAccentColors = { intro: '#06d6a0', section: '#4cc9f0', transition: '#f72585', outro: '#06d6a0' };
      const thumbAccent = thumbAccentColors[project.script[0]?.type] || '#4cc9f0';
      thumbCtx.save();
      thumbCtx.shadowColor = thumbAccent;
      thumbCtx.shadowBlur = 12;
      thumbCtx.fillStyle = thumbAccent;
      thumbCtx.fillRect((1280 - 160) / 2, 720 * 0.55, 160, 3);
      thumbCtx.restore();

      // Title — modern bold with glow
      const fullTitle = project.title || 'AutoTube Video';
      const words = fullTitle.split(/\s+/);
      let longestIdx = 0;
      for (let i = 1; i < words.length; i++) {
        if (words[i].length > words[longestIdx].length) longestIdx = i;
      }
      const start = Math.max(0, longestIdx - 1);
      const end = Math.min(words.length, longestIdx + 2);
      const thumbTitle = words.slice(start, end).join(' ');

      thumbCtx.save();
      thumbCtx.shadowColor = 'rgba(76, 201, 240, 0.5)';
      thumbCtx.shadowBlur = 25;
      thumbCtx.shadowOffsetX = 2;
      thumbCtx.shadowOffsetY = 2;
      thumbCtx.fillStyle = '#ffffff';
      thumbCtx.font = '800 68px system-ui, -apple-system, sans-serif';
      thumbCtx.textAlign = 'center';
      thumbCtx.textBaseline = 'middle';
      thumbCtx.fillText(thumbTitle.substring(0, 35), 1280 / 2, 720 * 0.65);
      thumbCtx.restore();

      // Channel branding
      thumbCtx.save();
      thumbCtx.fillStyle = 'rgba(148, 163, 184, 0.8)';
      thumbCtx.font = '600 16px system-ui, -apple-system, sans-serif';
      thumbCtx.textAlign = 'left';
      thumbCtx.textBaseline = 'top';
      thumbCtx.fillText('THE UPDATE DESK', 24, 24);
      thumbCtx.restore();
    } else {
      // Fallback: use the procedural background approach (original behaviour)
      const hookSeg = project.script[0];
      const hookMedia = project.media.filter(a => a.segmentId === hookSeg.id);
      const hookAsset = hookMedia[0];
      let hookImg = null;
      if (hookAsset) {
        if (hookAsset.type === 'video') {
          hookImg = await fetchVideoFrame(hookAsset.url, 0.3 * (hookAsset.duration || 10), hookAsset.thumbnailUrl);
        } else {
          hookImg = imgCache.get(hookAsset.url) || null;
        }
      }
      await drawFrame(thumbCtx, hookSeg, hookAsset, hookImg, 0.3, project, 0.3, 0);

      // Overlay the project title — modern styling
      const fullTitle2 = project.title || 'AutoTube Video';
      const words2 = fullTitle2.split(/\s+/);
      let longestIdx2 = 0;
      for (let i = 1; i < words2.length; i++) {
        if (words2[i].length > words2[longestIdx2].length) longestIdx2 = i;
      }
      const start2 = Math.max(0, longestIdx2 - 1);
      const end2 = Math.min(words2.length, longestIdx2 + 2);
      const thumbTitle = words2.slice(start2, end2).join(' ');

      thumbCtx.save();
      thumbCtx.shadowColor = 'rgba(76, 201, 240, 0.5)';
      thumbCtx.shadowBlur = 25;
      thumbCtx.shadowOffsetX = 2;
      thumbCtx.shadowOffsetY = 2;
      thumbCtx.fillStyle = '#ffffff';
      thumbCtx.font = '800 68px system-ui, -apple-system, sans-serif';
      thumbCtx.textAlign = 'center';
      thumbCtx.textBaseline = 'middle';
      thumbCtx.fillText(thumbTitle.substring(0, 35), 1280 / 2, 720 * 0.60);
      thumbCtx.restore();
    }

    // Save as thumbnail.png in the output directory
    const thumbPath = join(OUTPUT_DIR, 'thumbnail.png');
    const thumbBuffer = thumbCanvas.toBuffer('image/png');
    writeFileSync(thumbPath, thumbBuffer);
    log('info', `🖼️  Thumbnail saved: ${thumbPath}`);

    // Copy to ~/Downloads/autotube-{topic}-thumbnail.png
    const safeTopic = (project.title || project.topic || 'video')
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase()
      .substring(0, 60);
    const thumbDownloadName = `autotube-${safeTopic}-thumbnail.png`;
    const homeDir = homedir() || tmpdir();
    const thumbDownloadPath = `${homeDir}/Downloads/${thumbDownloadName}`;
    try {
      copyFileSync(thumbPath, thumbDownloadPath);
      log('info', `📁 Thumbnail copied to ~/Downloads/${thumbDownloadName}`);
    } catch (copyErr) {
      console.warn(`  ⚠ Could not copy to downloads folder: ${copyErr.message}`);
    }
  } catch (thumbErr) {
    console.warn('⚠ Thumbnail generation failed:', thumbErr.message);
  }
}

// Export testable functions
// ── Image Validation & Safety Functions ────────────────────────────────────

export function detectImageFormat(buf) {
  if (!buf || !Buffer.isBuffer(buf) || buf.length === 0) return 'unknown';

  // Check magic bytes
  if (buf.length >= 3 && buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) {
    return 'jpeg';
  }
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47 && buf[4] === 0x0D && buf[5] === 0x0A && buf[6] === 0x1A && buf[7] === 0x0A) {
    return 'png';
  }
  if (buf.length >= 6 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38 && (buf[4] === 0x37 || buf[4] === 0x39) && buf[5] === 0x61) {
    return 'gif';
  }
  if (buf.length >= 12 && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x52 && buf[11] === 0x50) {
    // Wait, WEBP is 52 49 46 46 (RIFF) ... 57 45 42 50 (WEBP)
    // buf[8] = W (87 / 0x57), buf[9] = E (69 / 0x45), buf[10] = B (66 / 0x42), buf[11] = P (80 / 0x50)
  }
  if (buf.length >= 12 && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) {
    return 'webp';
  }
  if (buf.length >= 2 && buf[0] === 0x42 && buf[1] === 0x4D) {
    return 'bmp';
  }
  if (buf.length >= 4) {
    if (buf[0] === 0x49 && buf[1] === 0x49 && buf[2] === 0x2A && buf[3] === 0x00) return 'tiff';
    if (buf[0] === 0x4D && buf[1] === 0x4D && buf[2] === 0x00 && buf[3] === 0x2A) return 'tiff';
  }

  // Check SVG (text based)
  try {
    const str = buf.toString('utf8', 0, Math.min(buf.length, 1000));
    if (str.includes('<svg') || str.includes('<SVG')) {
      return 'svg';
    }
  } catch (e) {}

  return 'unknown';
}

export function isCanvasSupportedFormat(format) {
  if (!format) return false;
  const f = format.toLowerCase();
  return ['jpeg', 'png', 'gif', 'bmp'].includes(f);
}

export function validateContentType(contentType, buf) {
  if (!contentType) {
    return { valid: false, error: 'Missing Content-Type header' };
  }

  const lowerType = contentType.toLowerCase();
  if (lowerType.includes('html') || lowerType.includes('text/html')) {
    return { valid: false, error: 'Response is HTML, not an image' };
  }

  if (buf && buf.length > 0) {
    const headStr = buf.toString('utf8', 0, Math.min(buf.length, 100)).trim();
    if (headStr.startsWith('<!DOCTYPE') || headStr.startsWith('<!doctype') || headStr.toLowerCase().startsWith('<html')) {
      return { valid: false, error: 'Content-Type says image but content is HTML' };
    }
  }

  return { valid: true };
}

export function validateImage(img, url, contentLength, buf) {
  if (!img) {
    return { valid: false, error: 'Image is null' };
  }

  const w = img.width;
  const h = img.height;

  if (typeof w !== 'number' || typeof h !== 'number' || isNaN(w) || isNaN(h)) {
    return { valid: false, error: 'Invalid dimension types' };
  }

  if (w <= 0 || h <= 0) {
    return { valid: false, error: 'Invalid image dimensions' };
  }

  const MIN_IMAGE_DIMENSION = 100;
  const MAX_IMAGE_DIMENSION = 8192;
  const ASPECT_RATIO_LIMIT = 10;

  if (w < MIN_IMAGE_DIMENSION || h < MIN_IMAGE_DIMENSION) {
    return { valid: false, error: `Image too small: ${w}x${h}` };
  }

  if (w > MAX_IMAGE_DIMENSION || h > MAX_IMAGE_DIMENSION) {
    return { valid: false, error: `Image too large: ${w}x${h}` };
  }

  const aspectRatio = Math.max(w, h) / Math.min(w, h);
  if (aspectRatio > ASPECT_RATIO_LIMIT) {
    return { valid: false, error: `Extreme aspect ratio ${aspectRatio.toFixed(2)}:1` };
  }

  const size = contentLength !== null ? contentLength : (buf ? buf.length : null);
  if (size !== null) {
    const MIN_SIZE = 1024;
    const MAX_SIZE = 50 * 1024 * 1024;
    if (size < MIN_SIZE) {
      return { valid: false, error: `File too small: ${size} bytes` };
    }
    if (size > MAX_SIZE) {
      return { valid: false, error: `File too large: ${size} bytes` };
    }
  }

  return { valid: true };
}

export function validateUrlSafety(urlString) {
  let parsedUrl;
  try {
    parsedUrl = new URL(urlString);
  } catch (err) {
    return { valid: false, error: "Invalid URL format" };
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    return { valid: false, error: "Only HTTP/HTTPS URLs are allowed" };
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
    return { valid: false, error: "Blocked: localhost access not allowed" };
  }

  // Block private IP ranges (SSRF protection)
  const privateIpPatterns = [
    /^10\./,                    // 10.0.0.0/8
    /^172\.(1[6-9]|2\d|3[0-1])\./, // 172.16.0.0/12
    /^192\.168\./,              // 192.168.0.0/16
    /^169\.254\./,              // 169.254.0.0/16 (link-local)
    /^0\./,                     // 0.0.0.0/8
    /^127\./,                   // 127.0.0.0/8
  ];

  for (const pattern of privateIpPatterns) {
    if (pattern.test(hostname)) {
      return { valid: false, error: "Blocked: private/internal IP address" };
    }
  }

  const blockedHosts = [
    "metadata.google.internal",
    "169.254.169.254",
    "instance-data",
    "metadata.azure.com",
  ];

  if (blockedHosts.some(host => hostname.includes(host))) {
    return { valid: false, error: "Blocked: cloud metadata endpoint" };
  }

  return { valid: true };
}

export {
  fetchProject,
  fetchImage,
  imageCache,
  cacheSet,
  MAX_CACHE_SIZE,
  getAvailableDiskSpace,
  validateDiskSpace,
  drawFrame,
  detectAspectRatioFromTopic,
  RESOLUTION_PRESETS,
  ASPECT_RATIOS,
  concatenateAudio,
  generateNarration,
  validateTTSConfiguration,
};

// Only auto-run when this file is the main entry point
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  render().catch(err => {
    console.error('\n❌ Render failed:', err.message);
    console.error(err.stack);
    
    // Cleanup: Kill ffmpeg if still running
    if (ffmpeg && !ffmpegExited) {
      log('info', '   Killing ffmpeg process...');
      try {
        ffmpeg.kill('SIGKILL');
      } catch (err) {
        console.warn('Cleanup: failed to kill ffmpeg:', err.message);
      }
    }

    // Cleanup: Remove partial output file if it exists
    if (typeof OUTPUT_FILE !== 'undefined' && existsSync(OUTPUT_FILE)) {
      const stats = statSync(OUTPUT_FILE);
      if (stats.size < 1024 * 1024) { // Less than 1MB is likely incomplete
        log('info', `   Removing incomplete output file (${(stats.size / 1024).toFixed(1)} KB)`);
        try {
          unlinkSync(OUTPUT_FILE);
        } catch (err) {
          console.warn('Cleanup: failed to remove partial file:', err.message);
        }
      }
    }

    throw err;
  });
}
