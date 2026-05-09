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
import { existsSync, mkdirSync, writeFileSync, unlinkSync, rmSync, readFileSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir, homedir } from 'os';

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
  SEGMENT_TITLE_DURATION: 1.5,
  WATERMARK_OPACITY: 0.6,
};

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
const RESOLUTION_PRESETS = {
  '720p':  { width: 1280, height: 720,  fps: 24, videoBitsPerSecond: 6_000_000 },
  '1080p': { width: 1920, height: 1080, fps: 24, videoBitsPerSecond: 10_000_000 },
  '4K':    { width: 3840, height: 2160, fps: 24, videoBitsPerSecond: 20_000_000 },
};

// ── Aspect ratio presets (Task 17) ──
const ASPECT_RATIOS = {
  '16:9': { width: 1920, height: 1080, label: 'YouTube' },
  '9:16': { width: 1080, height: 1920, label: 'Shorts/TikTok' },
  '1:1':  { width: 1080, height: 1080, label: 'Instagram' },
  '4:5':  { width: 1080, height: 1350, label: 'Facebook' },
};

function detectAspectRatioFromTopic(topic) {
  const lower = (topic || '').toLowerCase();
  if (lower.includes('shorts') || lower.includes('tiktok')) return '9:16';
  return '16:9';
}

const ACCENT_COLORS = { intro: '#06d6a0', section: '#4cc9f0', transition: '#f72585', outro: '#06d6a0' };
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
  const result = CHART_KEYWORDS.some(kw => concept.includes(kw) || alt.includes(kw));
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
  if (process.platform !== 'darwin') return null;
  try {
    const result = spawnSync('ffmpeg', ['-encoders'], { encoding: 'utf8', timeout: 5000 });
    if (result.status === 0 && result.stdout.includes('h264_videotoolbox')) {
      return 'h264_videotoolbox';
    }
  } catch {}
  return null;
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

  // Increased zoom range: 1.0-1.45 for more cinematic movement (was 1.0-1.25)
  const zoomStart = 1.0 + h1 * 0.45;
  const zoomEnd = 1.0 + h2 * 0.45;

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
function drawProceduralFallbackWithText(ctx, w, h, topicText, segType) {
  const palettes = {
    intro:      { bg: ['#0f0c29', '#302b63', '#24243e'], accent: '#06d6a0' },
    section:    { bg: ['#0c0c1d', '#1a1a3e', '#0d1b2a'], accent: '#4cc9f0' },
    transition: { bg: ['#1a0a2e', '#2d1b69', '#1a0a2e'], accent: '#f72585' },
    outro:      { bg: ['#0a192f', '#0d2137', '#0a192f'], accent: '#06d6a0' },
  };
  const p = palettes[segType] || palettes.section;

  // Richer multi-stop gradient background
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, p.bg[0]);
  grad.addColorStop(0.5, p.bg[1]);
  grad.addColorStop(1, p.bg[2]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Subtle geometric pattern overlay
  ctx.save();
  ctx.globalAlpha = 0.03;
  ctx.strokeStyle = p.accent;
  ctx.lineWidth = 1;
  for (let i = 0; i < w; i += 60) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, h);
    ctx.stroke();
  }
  for (let i = 0; i < h; i += 60) {
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(w, i);
    ctx.stroke();
  }
  ctx.restore();

  // Topic text centered with glow
  if (topicText) {
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.shadowColor = p.accent;
    ctx.shadowBlur = 30;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 42px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(topicText.substring(0, 50), w / 2, h / 2);
    ctx.restore();
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
function wrapTitleText(ctx, title, canvasWidth, baseFontSize) {
  const safeMargin = canvasWidth * 0.1; // 10% each side
  const maxWidth = canvasWidth - safeMargin * 2;
  let fontSize = baseFontSize;

  for (let pass = 0; pass < 2; pass++) {
    ctx.font = `bold ${fontSize}px sans-serif`;
    const words = title.split(' ');
    const lines = [];
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

/**
 * Computes the adaptive CSS filter string for a given saturation score.
 * Implements Requirements 3.2–3.4.
 *
 * @param {number} score  Saturation score in [0, 1] from computeSaturationScore.
 * @returns {string}      Full CSS filter string.
 */
function computeAdaptiveFilter(score) {
  const DEFAULT_FILTER = 'saturate(1.12) contrast(1.08) brightness(0.94)';

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

  return `saturate(${saturation.toFixed(4)}) contrast(1.08) brightness(0.94)`;
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

function drawTechnicalLabel(ctx, asset, barH) {
  if (!asset) return;

  const haystack = `${asset.concept ?? ''} ${asset.alt ?? ''}`.toLowerCase();

  let matchedKeyword;
  for (const kw of TECHNICAL_LABEL_KEYWORDS) {
    if (haystack.includes(kw.toLowerCase())) {
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
async function fetchProject() {
  // Try loading from /tmp first (saved by /api/save-project)
  const tmpPath = '/tmp/autotube-project.json';
  if (existsSync(tmpPath)) {
    log('info', 'Loading project from /tmp/autotube-project.json');
    return JSON.parse(readFileSync(tmpPath, 'utf8'));
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

async function fetchImage(url) {
  if (imageCache.has(url)) return imageCache.get(url);

  const MAX_RETRIES = CONFIG.FETCH_MAX_RETRIES;
  const TIMEOUT_MS = CONFIG.FETCH_TIMEOUT_MS;

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
      const buf = Buffer.from(await res.arrayBuffer());
      clearTimeout(timer);
      const img = await loadImage(buf);
      
      // MEDIUM #6: Validate image after loading
      if (!img || img.width <= 0 || img.height <= 0) {
        throw new Error(`Invalid image dimensions: ${img?.width}x${img?.height}`);
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
      const buf = Buffer.from(await res.arrayBuffer());
      clearTimeout(timer);
      const img = await loadImage(buf);
      
      // MEDIUM #6: Validate image after loading
      if (!img || img.width <= 0 || img.height <= 0) {
        throw new Error(`Invalid image dimensions: ${img?.width}x${img?.height}`);
      }
      
      cacheSet(url, img);
      return img;
    } catch (err) {
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
function drawProceduralBackground(ctx, seg, progress, skipParticles = false) {
  const palettes = {
    intro:      { bg: ['#0f0c29', '#302b63', '#24243e'], accent: '#06d6a0' },
    section:    { bg: ['#0c0c1d', '#1a1a3e', '#0d1b2a'], accent: '#4cc9f0' },
    transition: { bg: ['#1a0a2e', '#2d1b69', '#1a0a2e'], accent: '#f72585' },
    outro:      { bg: ['#0a192f', '#0d2137', '#0a192f'], accent: '#06d6a0' },
  };
  const p = palettes[seg.type] || palettes.section;

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
  grad.addColorStop(0, p.bg[2]);
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
  // Rich cinematic gradient background
  const cx = WIDTH / 2 + Math.cos(progress * Math.PI * 0.3) * WIDTH * 0.08;
  const cy = HEIGHT / 2 + Math.sin(progress * Math.PI * 0.2) * HEIGHT * 0.06;
  const grad = ctx.createRadialGradient(cx, cy, 0, WIDTH / 2, HEIGHT / 2, WIDTH * 0.85);
  grad.addColorStop(0, '#1a1a4e');
  grad.addColorStop(0.4, '#0f0c29');
  grad.addColorStop(1, '#0a0a1a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Multi-layer particles (skipped in draft mode)
  if (!DRAFT_MODE) {
    ctx.globalAlpha = 0.2;
    for (let i = 0; i < 60; i++) {
      const seed = i * 137.508 + progress * 0.3;
      const px = ((Math.sin(seed) + 1) / 2) * WIDTH;
      const py = ((Math.cos(seed * 0.7) + 1) / 2) * HEIGHT;
      ctx.fillStyle = '#4cc9f0';
      ctx.fillRect(px, py, 1.5, 1.5);
    }
    ctx.globalAlpha = 0.4;
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#4cc9f0';
    for (let i = 0; i < 25; i++) {
      const seed = i * 91.3 + progress * 0.6;
      const px = ((Math.sin(seed * 1.5) + 1) / 2) * WIDTH;
      const py = ((Math.cos(seed * 0.9) + 1) / 2) * HEIGHT;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(px, py, 2 + Math.sin(seed) * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1.0;
  }

  // Fade-in effect for text
  const fadeAlpha = Math.min(1, progress / 0.3);

  // Channel name — modern styling with glow
  ctx.save();
  ctx.globalAlpha = fadeAlpha * 0.7;
  ctx.fillStyle = '#94a3b8';
  ctx.font = '500 18px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.letterSpacing = '3px';
  ctx.fillText('THE UPDATE DESK', WIDTH / 2, HEIGHT * 0.28);
  ctx.restore();

  // Thin accent line above title
  ctx.save();
  ctx.globalAlpha = fadeAlpha;
  const accentGrad = ctx.createLinearGradient(WIDTH * 0.35, 0, WIDTH * 0.65, 0);
  accentGrad.addColorStop(0, 'rgba(76, 201, 240, 0)');
  accentGrad.addColorStop(0.5, '#4cc9f0');
  accentGrad.addColorStop(1, 'rgba(76, 201, 240, 0)');
  ctx.fillStyle = accentGrad;
  ctx.fillRect(WIDTH * 0.35, HEIGHT * 0.32, WIDTH * 0.3, 2);
  ctx.restore();

  // Project title — larger, bolder, with cyan glow
  const visibleChars = progress < 0.6
    ? Math.min(title.length, Math.floor((progress / 0.6) * title.length))
    : title.length;
  const displayTitle = title.substring(0, visibleChars);

  const baseFontSize = Math.min(72, WIDTH * 0.038);
  const { lines: titleLines, fontSize: titleFontSize } = wrapTitleText(ctx, displayTitle, WIDTH, baseFontSize);
  const titleLineHeight = titleFontSize * 1.25;
  const titleBlockHeight = titleLines.length * titleLineHeight;
  const titleStartY = HEIGHT * 0.42 - titleBlockHeight / 2 + titleLineHeight / 2;

  ctx.save();
  ctx.globalAlpha = fadeAlpha;
  ctx.shadowColor = 'rgba(76, 201, 240, 0.4)';
  ctx.shadowBlur = 25;
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 ${titleFontSize}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < titleLines.length; i++) {
    ctx.fillText(titleLines[i], WIDTH / 2, titleStartY + i * titleLineHeight);
  }
  ctx.restore();

  // Topic subtitle — modern styling
  const titleBlockBottom = titleStartY + (titleLines.length - 1) * titleLineHeight + titleLineHeight / 2;
  const subtitleY = Math.max(titleBlockBottom + 24, HEIGHT * 0.55);

  ctx.save();
  ctx.globalAlpha = fadeAlpha * 0.8;
  ctx.shadowColor = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur = 8;
  ctx.fillStyle = '#94a3b8';
  ctx.font = '400 22px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(topic.substring(0, 80), WIDTH / 2, subtitleY);
  ctx.restore();

  // Accent bar below subtitle
  const accentLineY = subtitleY + 24;
  ctx.save();
  ctx.globalAlpha = fadeAlpha;
  ctx.fillStyle = '#4cc9f0';
  ctx.shadowColor = 'rgba(76, 201, 240, 0.5)';
  ctx.shadowBlur = 12;
  ctx.fillRect((WIDTH - 120) / 2, accentLineY, 120, 3);
  ctx.restore();

  // Tagline
  ctx.save();
  ctx.globalAlpha = fadeAlpha * 0.6;
  ctx.fillStyle = '#64748b';
  ctx.font = 'italic 400 16px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('News. Analysis. Opinion.', WIDTH / 2, accentLineY + 28);
  ctx.restore();
}

// ── Draw end screen frame ──────────────────────────────────────────────────
function drawEndScreenFrame(ctx, title, progress) {
  // Rich cinematic gradient background
  const cx = WIDTH / 2 + Math.cos(progress * Math.PI * 0.2) * WIDTH * 0.06;
  const cy = HEIGHT / 2 + Math.sin(progress * Math.PI * 0.15) * HEIGHT * 0.04;
  const grad = ctx.createRadialGradient(cx, cy, 0, WIDTH / 2, HEIGHT / 2, WIDTH * 0.85);
  grad.addColorStop(0, '#1a1a4e');
  grad.addColorStop(0.4, '#0f0c29');
  grad.addColorStop(1, '#0a0a1a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Multi-layer particles (skipped in draft mode)
  if (!DRAFT_MODE) {
    ctx.globalAlpha = 0.2;
    for (let i = 0; i < 50; i++) {
      const seed = i * 137.508 + progress * 0.25;
      const px = ((Math.sin(seed) + 1) / 2) * WIDTH;
      const py = ((Math.cos(seed * 0.7) + 1) / 2) * HEIGHT;
      ctx.fillStyle = '#06d6a0';
      ctx.fillRect(px, py, 1.5, 1.5);
    }
    ctx.globalAlpha = 0.35;
    ctx.shadowBlur = 8;
    ctx.shadowColor = '#06d6a0';
    for (let i = 0; i < 20; i++) {
      const seed = i * 91.3 + progress * 0.5;
      const px = ((Math.sin(seed * 1.5) + 1) / 2) * WIDTH;
      const py = ((Math.cos(seed * 0.9) + 1) / 2) * HEIGHT;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(px, py, 2 + Math.sin(seed), 0, Math.PI * 2);
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
  ctx.shadowColor = 'rgba(6, 214, 160, 0.4)';
  ctx.shadowBlur = 20;
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 48px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Thanks for watching', WIDTH / 2, HEIGHT * 0.32);
  ctx.restore();

  // Accent line
  ctx.save();
  ctx.globalAlpha = fadeAlpha;
  const accentGrad = ctx.createLinearGradient(WIDTH * 0.35, 0, WIDTH * 0.65, 0);
  accentGrad.addColorStop(0, 'rgba(6, 214, 160, 0)');
  accentGrad.addColorStop(0.5, '#06d6a0');
  accentGrad.addColorStop(1, 'rgba(6, 214, 160, 0)');
  ctx.fillStyle = accentGrad;
  ctx.fillRect(WIDTH * 0.35, HEIGHT * 0.38, WIDTH * 0.3, 2);
  ctx.restore();

  // Project title
  ctx.save();
  ctx.globalAlpha = fadeAlpha * 0.8;
  ctx.shadowColor = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur = 8;
  ctx.fillStyle = '#94a3b8';
  ctx.font = '400 26px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title.substring(0, 60), WIDTH / 2, HEIGHT * 0.44);
  ctx.restore();

  // "Subscribe" pill button — modern with glow
  ctx.save();
  ctx.globalAlpha = fadeAlpha;
  const btnText = 'Subscribe';
  ctx.font = '700 24px system-ui, -apple-system, sans-serif';
  const btnTextW = ctx.measureText(btnText).width;
  const btnW = btnTextW + 56;
  const btnH = 52;
  const btnX = (WIDTH - btnW) / 2;
  const btnY = HEIGHT * 0.56 - btnH / 2;
  const btnR = btnH / 2;

  // Button glow
  ctx.shadowColor = 'rgba(6, 214, 160, 0.5)';
  ctx.shadowBlur = 20;

  // Draw rounded rect
  ctx.beginPath();
  ctx.moveTo(btnX + btnR, btnY);
  ctx.lineTo(btnX + btnW - btnR, btnY);
  ctx.arc(btnX + btnW - btnR, btnY + btnR, btnR, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(btnX + btnR, btnY + btnH);
  ctx.arc(btnX + btnR, btnY + btnR, btnR, Math.PI / 2, -Math.PI / 2);
  ctx.closePath();

  // Button gradient
  const btnGrad = ctx.createLinearGradient(btnX, btnY, btnX + btnW, btnY);
  btnGrad.addColorStop(0, '#06d6a0');
  btnGrad.addColorStop(1, '#00b894');
  ctx.fillStyle = btnGrad;
  ctx.fill();

  // Button text
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#0a0a1a';
  ctx.font = '700 24px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(btnText, WIDTH / 2, HEIGHT * 0.56);
  ctx.restore();

  // "More videos coming soon"
  ctx.save();
  ctx.globalAlpha = fadeAlpha * 0.6;
  ctx.fillStyle = '#64748b';
  ctx.font = '400 18px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('More videos coming soon', WIDTH / 2, HEIGHT * 0.72);
  ctx.restore();
}

// ── Safe zone computation (mirrors src/services/renderingShared.ts) ─────────
/**
 * Compute safe zone margins scaled proportionally from a 1080p reference.
 *
 * Reference values at 1080p (1920×1080):
 * - top:    40 px  (avoids YouTube title overlay)
 * - bottom: 60 px  (avoids YouTube progress bar and controls)
 * - left:   5% of width
 * - right:  5% of width
 *
 * Requirements 5.1, 5.2, 5.3
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
  const logoSize = Math.round(h * 0.06);

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
    const fontSize = Math.round(h * 0.025);
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

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(watermarkOpts.text, x + textPadX, y + textPadY);
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
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  } else {
    drawProceduralFallbackWithText(ctx, w, h, null, seg.type);
  }

  // Modern dark overlay
  const overlay = ctx.createLinearGradient(0, 0, 0, h);
  overlay.addColorStop(0, 'rgba(10, 10, 26, 0.80)');
  overlay.addColorStop(0.5, 'rgba(10, 10, 26, 0.70)');
  overlay.addColorStop(1, 'rgba(10, 10, 26, 0.85)');
  ctx.fillStyle = overlay;
  ctx.fillRect(0, 0, w, h);

  const stat = extractStat(seg.narration);
  const displayStat = stat || seg.title;

  const accentColors = { intro: '#06d6a0', section: '#4cc9f0', transition: '#f72585', outro: '#06d6a0' };
  const accent = accentColors[seg.type] || '#4cc9f0';

  // Stat display — large with glow
  ctx.save();
  ctx.font = `800 ${Math.round(h * 0.11)}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = accent;
  ctx.shadowBlur = 30;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(displayStat, w / 2, h * 0.35);
  ctx.restore();

  // Accent line below stat
  ctx.save();
  const statW = ctx.measureText(displayStat).width;
  const lineGrad = ctx.createLinearGradient(w/2 - statW/2, 0, w/2 + statW/2, 0);
  lineGrad.addColorStop(0, 'rgba(76, 201, 240, 0)');
  lineGrad.addColorStop(0.5, accent);
  lineGrad.addColorStop(1, 'rgba(76, 201, 240, 0)');
  ctx.fillStyle = lineGrad;
  ctx.fillRect(w/2 - statW/2, h * 0.35 + h * 0.06, statW, 3);
  ctx.restore();

  // Segment title
  ctx.save();
  ctx.font = `700 ${Math.round(h * 0.035)}px system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = '#e2e8f0';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 8;
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
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
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
  ctx.fillStyle = 'rgba(76, 201, 240, 0.2)';
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
    ctx.save();
    ctx.beginPath();
    ctx.rect(splitX, 0, rightW, h);
    ctx.clip();
    ctx.drawImage(img, splitX + (rightW - dw) / 2, (h - dh) / 2, dw, dh);
    ctx.restore();
  } else {
    // Procedural fallback for right panel
    const palettes = {
      intro: ['#1a0a2e', '#0a1a2e'], section: ['#0a1a2e', '#0a2a3e'],
      transition: ['#2a1a0a', '#1a0a0a'], outro: ['#0a2a1a', '#0a1a2a'],
    };
    const p = palettes[seg.type] || palettes.section;
    const rightGrad = ctx.createLinearGradient(splitX, 0, w, h);
    rightGrad.addColorStop(0, p[0]);
    rightGrad.addColorStop(1, p[1]);
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
  const textMaxW = splitX - textLeft - 30;

  // Accent line
  const accentColors = { intro: '#e74c3c', section: '#3498db', transition: '#f39c12', outro: '#2ecc71' };
  const accent = accentColors[seg.type] || '#3498db';
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
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
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

  const accentColors = { intro: '#06d6a0', section: '#4cc9f0', transition: '#f72585', outro: '#06d6a0' };
  const accent = accentColors[seg.type] || '#4cc9f0';
  const textAreaTop = Math.round(h * 0.68);

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
  const titleY = Math.min(textAreaTop, h - safeZone.bottom - titleFontSize * 2.5);
  ctx.fillText(seg.title.substring(0, 50), safeZone.left + 20, titleY);
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
    const narY = Math.min(titleY + titleFontSize + 10, h - safeZone.bottom - narFontSize - 10);
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
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
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
  ctx.save();
  const titleFontSize = Math.round(h * 0.042);
  ctx.font = `800 ${titleFontSize}px system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 16;
  const titleY = Math.max(safeZone.top + titleFontSize, Math.min(h * 0.38, h - safeZone.bottom - titleFontSize * 3));
  ctx.fillText(seg.title.substring(0, 50), w / 2, titleY);
  ctx.restore();

  // Accent line
  const accentColors = { intro: '#06d6a0', section: '#4cc9f0', transition: '#f72585', outro: '#06d6a0' };
  const accent = accentColors[seg.type] || '#4cc9f0';
  ctx.save();
  const lineGrad = ctx.createLinearGradient(w/2 - 60, 0, w/2 + 60, 0);
  lineGrad.addColorStop(0, 'rgba(76, 201, 240, 0)');
  lineGrad.addColorStop(0.5, accent);
  lineGrad.addColorStop(1, 'rgba(76, 201, 240, 0)');
  ctx.fillStyle = lineGrad;
  ctx.fillRect(w/2 - 60, titleY + titleFontSize * 0.8, 120, 3);
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

// ── Draw a single frame ────────────────────────────────────────────────────
async function drawFrame(ctx, seg, asset, img, progress, project, globalProgress, segmentIndex) {
  // ── Determine if a scene layout should handle background + text rendering ──
  const sceneLayout = seg.sceneLayout || null;
  const layoutFn = sceneLayout ? (SCENE_LAYOUT_DISPATCH[sceneLayout] || null) : null;

  // Draft mode: skip procedural background entirely when image or layout will cover it
  const shouldSkipBackground = DRAFT_MODE && (!!img || !!layoutFn);
  if (!shouldSkipBackground) {
    drawProceduralBackground(ctx, seg, progress, !!img);
  }

  if (layoutFn) {
    // ── Scene layout path: layout function handles background + text overlays ──
    layoutFn(ctx, seg, img, WIDTH, HEIGHT, globalSafeZone || computeSafeZone(WIDTH, HEIGHT));
  } else {
    // ── Default path: Ken Burns image rendering + original text overlays ──

  // Resolve Ken Burns params: edit plan → computeKenBurnsParams default → hardcoded fallback
  // Increased fallback zoom range for more cinematic movement (was 1.0-1.06)
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
    if (segEntry && segEntry.transition) {
      if (progress < 0.01) {
        log('info', `    [EditPlan] Segment "${seg.title}" transition: ${segEntry.transition.type} (${segEntry.transition.durationMs}ms)`);
      }
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
  // High pacing (4-5) → faster zoom (1.5x speed), Low pacing (1-2) → slower zoom (0.6x speed)
  const segPacingScore = seg.pacingScore || 3;
  if (segPacingScore >= 4) {
    kbZoomEnd *= 1.5; // Faster zoom for high-energy segments
  } else if (segPacingScore <= 2) {
    kbZoomEnd *= 0.6; // Slower zoom for calm/reflective segments
  }

  // Ken Burns image overlay with adaptive colour grading (Requirements 3.1–3.6, 4.1, 4.5, 8.1, 9.5)
  if (img) {
    const iw = img.width || img.naturalWidth || 1280;
    const ih = img.height || img.naturalHeight || 720;
    if (iw > 0 && ih > 0) {

      // Requirement 4.5: Render video clips directly without Ken Burns zoom/pan.
      // Video clips already have motion, so applying Ken Burns would be distracting.
      if (asset && asset.type === 'video') {
        const vScale = Math.max(WIDTH / iw, HEIGHT / ih);
        const vdw = iw * vScale, vdh = ih * vScale;
        ctx.drawImage(img, (WIDTH - vdw) / 2, (HEIGHT - vdh) / 2, vdw, vdh);
      } else {
      const scale = Math.max(WIDTH / iw, HEIGHT / ih) * 1.40;
      const dw = iw * scale, dh = ih * scale;
      // Apply Bezier easing for smooth cinematic motion
      const easedProgress = easeInOutCubic(progress);
      const zoom = kbZoomStart + easedProgress * kbZoomEnd;
      // Resolution-scaled pan amplitude
      const resolutionScale = Math.max(WIDTH / 1280, HEIGHT / 720);
      const basePanX = 20 * resolutionScale;
      const basePanY = 10 * resolutionScale;
      // Vary Ken Burns per asset for visual variety
      const assetSeed = asset ? getAssetSeed(asset.url) : 0;
      const panMultX = (assetSeed % 3 === 0) ? -1 : (assetSeed % 3 === 1) ? 0.5 : 1;
      const panMultY = (assetSeed % 5 === 0) ? -1 : (assetSeed % 5 === 1) ? 0.3 : 1;
      const panX = Math.sin(easedProgress * Math.PI * 0.7) * basePanX * kbPanDirX * panMultX;
      const panY = Math.cos(easedProgress * Math.PI * 0.4) * basePanY * kbPanDirY * panMultY;

      // ── Adaptive colour grading ──────────────────────────────────────────
      // Saturation scores pre-computed during preload phase (P0 optimization).
      const DEFAULT_FILTER = 'saturate(1.12) contrast(1.08) brightness(0.94)';
      let filterString = DEFAULT_FILTER;
      if (asset && asset.url && saturationCache.has(asset.url)) {
        filterString = computeAdaptiveFilter(saturationCache.get(asset.url));
      }
      // ────────────────────────────────────────────────────────────────────

      // ── Chart reveal: determine if this asset is a chart (Requirement 5.1) ──
      const isChart = isChartAsset(asset);

      // ── Chart reveal: apply left-to-right clipping mask (Requirements 5.1–5.4, 5.7) ──
      if (isChart) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, WIDTH * progress, HEIGHT);
        ctx.clip();
      }

      // Ken Burns block (zoom factor and pan offsets unchanged — Requirement 5.7, 10.3)
      ctx.save();
      ctx.translate(WIDTH / 2 + panX, HEIGHT / 2 + panY);
      ctx.scale(zoom, zoom);
      ctx.filter = filterString;
      ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
      ctx.filter = 'none';
      ctx.restore();

      if (isChart) {
        ctx.restore();
      }
      } // end else (non-video Ken Burns path)
    }
  } else if (asset) {
    // Requirement 4.7: Procedural background fallback with topic text when image fails to load
    drawProceduralFallbackWithText(ctx, WIDTH, HEIGHT, seg.title, seg.type);
  }

  } // end default (no scene layout) path

  // Letterbox bars — reduced from 4% to 2.5% for more screen real estate
  const barH = Math.round(HEIGHT * 0.025);
  ctx.fillStyle = 'rgba(0,0,0,0.90)';
  ctx.fillRect(0, 0, WIDTH, barH);
  ctx.fillRect(0, HEIGHT - barH, WIDTH, barH);

  // Vignette — skipped in draft mode
  if (!DRAFT_MODE) {
    const vig = ctx.createRadialGradient(WIDTH/2, HEIGHT/2, HEIGHT*0.35, WIDTH/2, HEIGHT/2, WIDTH*0.8);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(0.75, 'rgba(0,0,0,0.10)');
    vig.addColorStop(1, 'rgba(0,0,0,0.40)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  // Film grain overlay — skipped in draft mode
  if (!DRAFT_MODE) {
    if (!drawFrame._filmGrainCanvas) {
      drawFrame._filmGrainCanvas = createCanvas(WIDTH, HEIGHT);
      const fgCtx = drawFrame._filmGrainCanvas.getContext('2d');
      fgCtx.globalAlpha = 0.04;
      for (let i = 0; i < 3000; i++) {
        const x = Math.random() * WIDTH;
        const y = Math.random() * HEIGHT;
        const brightness = Math.random();
        fgCtx.fillStyle = brightness > 0.5 ? '#ffffff' : '#000000';
        fgCtx.fillRect(x, y, 1, 1);
      }
    }
    ctx.drawImage(drawFrame._filmGrainCanvas, 0, 0);
  }

  // Technical label badge (Requirements 4.1–4.5, 4.6, 9.3)
  drawTechnicalLabel(ctx, asset, barH);

  // ── On-screen thesis text (Step 2) ──────────────────────────────────────
  // Extract ALL-CAPS phrases (3+ words) or double-quoted phrases from visualNote
  if (seg.visualNote && progress <= 0.40) {
    // Match 3+ consecutive ALL-CAPS words or a double-quoted phrase
    const capsMatch = seg.visualNote.match(/\b([A-Z]{2,}(?:\s+[A-Z]{2,}){2,})\b/);
    const quoteMatch = seg.visualNote.match(/"([^"]{1,40})"/);
    const thesisPhrase = capsMatch ? capsMatch[1].slice(0, 40) : quoteMatch ? quoteMatch[1].slice(0, 40) : null;

    if (thesisPhrase) {
      // Fade-in for first 10% of display time, fade-out for last 10%
      const displayEnd = 0.40;
      const fadeInEnd = displayEnd * 0.10;   // 0 → 0.04
      const fadeOutStart = displayEnd * 0.90; // 0.36 → 0.40
      let thesisAlpha = 1.0;
      if (progress < fadeInEnd) {
        thesisAlpha = progress / fadeInEnd;
      } else if (progress > fadeOutStart) {
        thesisAlpha = 1.0 - (progress - fadeOutStart) / (displayEnd - fadeOutStart);
      }
      thesisAlpha = Math.max(0, Math.min(1, thesisAlpha));

      ctx.save();
      ctx.globalAlpha = thesisAlpha;

      // Measure text for background box
      ctx.font = 'bold 48px sans-serif';
      const thesisW = ctx.measureText(thesisPhrase).width;
      const boxPadX = 32;
      const boxPadY = 16;
      const boxW = thesisW + boxPadX * 2;
      const boxH = 48 + boxPadY * 2;
      const boxX = (WIDTH - boxW) / 2;
      const boxY = HEIGHT * 0.30 - boxH / 2;

      // Dark semi-transparent background
      ctx.fillStyle = 'rgba(0,0,0,0.70)';
      ctx.fillRect(boxX, boxY, boxW, boxH);

      // Bold white text centered at 30% height
      ctx.shadowColor = 'rgba(0,0,0,0.9)';
      ctx.shadowBlur = 16;
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 48px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(thesisPhrase, WIDTH / 2, HEIGHT * 0.30);

      ctx.restore();
    }
  }

  // Title overlay — only rendered when no scene layout is active (layouts handle their own titles)
  if (!layoutFn) {
  const accent = ACCENT_COLORS[seg.type] || '#4cc9f0';
  const titleSafeZone = globalSafeZone || computeSafeZone(WIDTH, HEIGHT);
  // Position title overlay above the bottom safe zone (Requirement 5.1, 5.3)
  const ltY = Math.min(HEIGHT - barH - 120, HEIGHT - titleSafeZone.bottom - 80);

  // Semi-transparent dark gradient behind the title text area for contrast (Requirement 4.1, 4.2)
  const titleOverlayGrad = ctx.createLinearGradient(0, ltY - 20, 0, ltY + 60);
  titleOverlayGrad.addColorStop(0, 'rgba(0,0,0,0)');
  titleOverlayGrad.addColorStop(0.2, 'rgba(0,0,0,0.6)');
  titleOverlayGrad.addColorStop(1, 'rgba(0,0,0,0.7)');
  ctx.fillStyle = titleOverlayGrad;
  ctx.fillRect(0, ltY - 20, WIDTH * 0.6, 80);

  ctx.fillStyle = accent;
  ctx.fillRect(titleSafeZone.left + 12, ltY, Math.min(40 + progress * 60, 100), 2);

  ctx.save();
  if (!DRAFT_MODE) {
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 16;
  }
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 36px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(seg.title.substring(0, 50), titleSafeZone.left + 12, ltY + 12);
  ctx.restore();

  // #22: Lower-third name card for named people mentioned in narration
  if (seg.narration && progress >= 0.1 && progress <= 0.3) {
    const nameMatch = seg.narration.match(/\b([A-Z][a-z]+ [A-Z][a-z]+)\b/);
    if (nameMatch) {
      const personName = nameMatch[1];
      ctx.save();
      ctx.font = '16px sans-serif';
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
  } // end no-layout title/name-card block
  // Words appear one at a time with a pop-in scale effect
  const words = segWordsCache && segWordsCache.has(seg.id) ? segWordsCache.get(seg.id) : (seg.narration ? seg.narration.split(' ') : []);
  if (words.length > 0) {
    const currentWordIdx = Math.min(Math.floor(progress * words.length), words.length - 1);

    // Show the last 6-7 spoken words plus the current word
    const windowStart = Math.max(0, currentWordIdx - 6);
    const visibleCount = currentWordIdx - windowStart + 1;

    if (visibleCount > 0) {
      // Modern glass-morphism caption background
      const capSafeZone = globalSafeZone || computeSafeZone(WIDTH, HEIGHT);
      const capBgW = Math.min(800, WIDTH * 0.42);
      const capBgH = 56;
      const capY = Math.min(HEIGHT - barH - 56, HEIGHT - capSafeZone.bottom - capBgH + 12);

      // Glass background with rounded corners
      ctx.save();
      ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
      if (!DRAFT_MODE) {
        ctx.shadowColor = 'rgba(76, 201, 240, 0.15)';
        ctx.shadowBlur = 16;
      }
      ctx.beginPath();
      ctx.roundRect((WIDTH - capBgW) / 2, capY - 12, capBgW, capBgH, 10);
      ctx.fill();

      // Top accent line
      ctx.shadowBlur = 0;
      const capAccentGrad = ctx.createLinearGradient((WIDTH - capBgW) / 2, 0, (WIDTH + capBgW) / 2, 0);
      capAccentGrad.addColorStop(0, 'rgba(76, 201, 240, 0)');
      capAccentGrad.addColorStop(0.5, 'rgba(76, 201, 240, 0.5)');
      capAccentGrad.addColorStop(1, 'rgba(76, 201, 240, 0)');
      ctx.fillStyle = capAccentGrad;
      ctx.fillRect((WIDTH - capBgW) / 2 + 20, capY - 12, capBgW - 40, 2);
      ctx.restore();

      // Measure total width to center the word group
      const normalFont = '400 20px system-ui, -apple-system, sans-serif';
      const boldFont = '700 22px system-ui, -apple-system, sans-serif';
      const spaceWidth = measureWordCached(ctx, normalFont, ' ');

      // Pre-measure all words (cached)
      let totalWidth = 0;
      const wordWidths = new Array(visibleCount);
      for (let wi = 0; wi < visibleCount; wi++) {
        const isCurrentWord = (windowStart + wi) === currentWordIdx;
        const word = words[windowStart + wi];
        const font = isCurrentWord ? boldFont : normalFont;
        const ww = measureWordCached(ctx, font, word);
        wordWidths[wi] = ww;
        totalWidth += ww;
        if (wi < visibleCount - 1) {
          totalWidth += spaceWidth;
        }
      }

      // Draw each word
      const centerY = capY + 16;
      let curX = WIDTH / 2 - totalWidth / 2;

      for (let wi = 0; wi < visibleCount; wi++) {
        const globalWordIdx = windowStart + wi;
        const isCurrentWord = globalWordIdx === currentWordIdx;
        const word = words[globalWordIdx];

        const wordKey = `${seg.id}:${globalWordIdx}`;
        if (!wordFirstAppearFrame.has(wordKey)) {
          if (wordFirstAppearFrame.size >= MAX_WORD_FIRST_APPEAR_CACHE_SIZE) {
            wordFirstAppearFrame.delete(wordFirstAppearFrame.keys().next().value);
          }
          wordFirstAppearFrame.set(wordKey, globalFrameCounter);
        }
        const framesSinceAppear = globalFrameCounter - wordFirstAppearFrame.get(wordKey);

        const popScale = framesSinceAppear < 2 ? 1.12 : 1.0;

        ctx.save();

        if (isCurrentWord) {
          ctx.font = boldFont;
          ctx.fillStyle = '#ffffff';
          if (!DRAFT_MODE) {
            ctx.shadowColor = 'rgba(76, 201, 240, 0.4)';
            ctx.shadowBlur = 8;
          }
        } else {
          ctx.font = normalFont;
          ctx.fillStyle = '#94a3b8';
          ctx.shadowBlur = 0;
        }

        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        if (popScale !== 1.0) {
          const wordCenterX = curX + wordWidths[wi] / 2;
          ctx.translate(wordCenterX, centerY);
          ctx.scale(popScale, popScale);
          ctx.translate(-wordCenterX, -centerY);
        }

        ctx.fillText(word, curX, centerY);
        ctx.restore();

        curX += wordWidths[wi];
        if (wi < visibleCount - 1) {
          curX += spaceWidth;
        }
      }
    }
  }

  // ── Step 11: Progress bar at the bottom of the video (safe zone enforced — Requirement 5.1) ──
  if (typeof globalProgress === 'number') {
    ctx.save();
    const progressSafeZone = globalSafeZone || computeSafeZone(WIDTH, HEIGHT);
    ctx.fillStyle = '#4cc9f0';
    // Position progress bar just above the bottom safe zone to avoid YouTube's own progress bar
    const progressBarY = HEIGHT - progressSafeZone.bottom;
    ctx.fillRect(0, progressBarY, globalProgress * WIDTH, 3);
    ctx.restore();
  }
}

// ── Generate narration audio with edge-tts or Grok TTS ─────────────────────
const XAI_TTS_ENDPOINT = 'https://api.x.ai/v1/tts';

async function generateGrokSegment(text, outputPath, xaiKey, voice = 'Sal') {
  try {
    const response = await fetch(XAI_TTS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${xaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        voice_id: voice,
        output_format: { codec: 'mp3', sample_rate: 44100, bit_rate: 128000 },
        language: 'en',
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.warn(`  ⚠ Grok TTS API returned ${response.status}: ${errText.substring(0, 100)}`);
      return false;
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0) return false;
    writeFileSync(outputPath, buffer);
    return existsSync(outputPath);
  } catch (err) {
    console.warn(`  ⚠ Grok TTS request failed: ${err.message}`);
    return false;
  }
}

async function generateMeloSegment(text, outputPath, accountId, apiToken) {
  try {
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/myshell-ai/melotts`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt: text, lang: 'en' }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.warn(`  ⚠ MeloTTS API returned ${response.status}: ${errText.substring(0, 100)}`);
      return false;
    }
    const contentType = response.headers.get('content-type') || '';
    let buffer;
    if (contentType.includes('application/json')) {
      const data = await response.json();
      const base64Audio = data?.result?.audio;
      if (!base64Audio) {
        console.warn('  ⚠ MeloTTS: No audio in JSON response');
        return false;
      }
      buffer = Buffer.from(base64Audio, 'base64');
    } else {
      buffer = Buffer.from(await response.arrayBuffer());
    }
    if (buffer.length === 0) return false;
    writeFileSync(outputPath, buffer);
    return existsSync(outputPath);
  } catch (err) {
    console.warn(`  ⚠ MeloTTS request failed: ${err.message}`);
    return false;
  }
}

async function generateNarration(segments, outputDir, options = {}) {
  const { xaiKey, ttsVoice, cfAccountId, cfApiToken, edgeVoice } = options;
  const useGrok = !!xaiKey;
  const useMelo = !!cfAccountId && !!cfApiToken;
  const audioFiles = [];

  const engines = [];
  if (useGrok) engines.push('Grok TTS');
  if (useMelo) engines.push('MeloTTS');
  engines.push('edge-tts');
  log('info', `Generating narration audio (fallback chain: ${engines.join(' → ')})...`);
  if (useGrok) log('info', `  Grok voice: ${ttsVoice || 'Leo'}`);
  if (!useGrok && !useMelo) log('info', `  edge-tts voice: ${edgeVoice || 'en-US-GuyNeural'}`);

  // Generate initial silence for cold open (2s) + title card (3s) = 5s
  const introSilenceFile = join(outputDir, 'silence-intro.mp3');
  spawnSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-t', '5', introSilenceFile], { encoding: 'utf8', timeout: 10000 });
  if (existsSync(introSilenceFile)) {
    audioFiles.push({ file: introSilenceFile, duration: 5 });
  }

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];

    // Generate 0.5s crossfade silence for the segment title card (reduced from 1.5s for better pacing)
    const silenceFile = join(outputDir, `silence-${i}.mp3`);
    spawnSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-t', '0.5', silenceFile], { encoding: 'utf8', timeout: 5000 });
    if (existsSync(silenceFile)) {
      audioFiles.push({ file: silenceFile, duration: 0.5 });
    }

    const audioFile = join(outputDir, `narration-${i}.mp3`);
    
    process.stdout.write(`\r  Segment ${i + 1}/${segments.length}: "${seg.title.substring(0, 30)}"...`);
    
    let success = false;

    // Tier 1: Grok TTS
    if (useGrok && !success) {
      success = await generateGrokSegment(seg.narration, audioFile, xaiKey, ttsVoice || 'Leo');
      if (!success) {
        console.warn(`\n  ⚠ Grok TTS failed for segment ${i + 1}, trying next engine`);
      }
    }

    // Tier 2: MeloTTS
    if (useMelo && !success) {
      success = await generateMeloSegment(seg.narration, audioFile, cfAccountId, cfApiToken);
      if (!success) {
        console.warn(`\n  ⚠ MeloTTS failed for segment ${i + 1}, trying edge-tts`);
      }
    }

    // Tier 3: edge-tts
    if (!success) {
      const result = spawnSync('edge-tts', [
        '--voice', edgeVoice || 'en-US-GuyNeural',
        '--rate', '+10%',
        '--text', seg.narration,
        '--write-media', audioFile,
      ], { encoding: 'utf8', timeout: 30000 });
      success = result.status === 0 && existsSync(audioFile);
    }

    // Tier 4: Silence (last resort)
    if (success) {
      audioFiles.push({ file: audioFile, duration: seg.duration });
    } else {
      console.warn(`\n  ⚠ All TTS engines failed for segment ${i + 1}, using silence`);
      spawnSync('ffmpeg', [
        '-y', '-f', 'lavfi', '-i', `anullsrc=r=44100:cl=stereo`,
        '-t', String(seg.duration), audioFile,
      ], { encoding: 'utf8', timeout: 10000 });
      if (existsSync(audioFile)) audioFiles.push({ file: audioFile, duration: seg.duration });
    }
  }
  log('info', `\n  ✓ Generated ${audioFiles.length} audio segments (chain: ${engines.join(' → ')})`);
  return audioFiles;
}

// ── TTS Voice presets per engine ──
const TTS_VOICES = {
  grok: ['Leo', 'Sarah', 'Marcus', 'Aria'],
  melotts: ['default'],
  edgetts: ['en-US-GuyNeural', 'en-US-JennyNeural', 'en-GB-SoniaNeural', 'en-AU-NatashaNeural'],
};

function validateApiKey(key, name) {
  if (!key || typeof key !== 'string' || key.length < 10) {
    console.warn(`Invalid or missing ${name} API key`);
    return false;
  }
  return true;
}

// ── TTS provider validation ────────────────────────────────────────────────
function validateTTSConfiguration() {
  const xaiKey = process.env.XAI_API_KEY || process.env.VITE_XAI_KEY || '';
  const cfAccountId = process.env.CF_ACCOUNT_ID || process.env.VITE_CF_ACCOUNT_ID || '';
  const cfApiToken = process.env.CF_API_TOKEN || process.env.VITE_CF_API_TOKEN || '';

  const grokAvailable = validateApiKey(xaiKey, 'Grok/XAI');
  const meloAvailable = validateApiKey(cfAccountId, 'Cloudflare Account ID') && validateApiKey(cfApiToken, 'Cloudflare API Token');
  const edgeTtsAvailable = spawnSync('which', ['edge-tts'], { encoding: 'utf-8' }).status === 0;

  log('info', `TTS providers: Grok=${grokAvailable ? 'YES' : 'NO'}, MeloTTS=${meloAvailable ? 'YES' : 'NO'}, edge-tts=${edgeTtsAvailable ? 'YES' : 'NO'}`);

  if (!grokAvailable && !meloAvailable && !edgeTtsAvailable) {
    console.warn('⚠ WARNING: No TTS providers available. Video will be rendered without narration (video-only).');
    console.warn('   To add narration: Configure XAI_API_KEY for Grok TTS, or install edge-tts (pip install edge-tts).');
  }

  if (!grokAvailable && !meloAvailable && edgeTtsAvailable) {
    console.warn('⚠ WARNING: No API-key TTS providers configured (Grok/MeloTTS). Falling back to edge-tts only.');
  }

  return { grokAvailable, meloAvailable, edgeTtsAvailable };
}

// ── Concatenate audio files ────────────────────────────────────────────────
async function concatenateAudio(audioFiles, outputFile) {
  if (audioFiles.length === 0) return false;
  if (audioFiles.length === 1) {
    const result = spawnSync('ffmpeg', ['-y', '-i', audioFiles[0].file, '-c:a', 'aac', '-b:a', '128k', outputFile], { encoding: 'utf8', timeout: 60000 });
    return result.status === 0;
  }

  const inputs = [];
  const filterInputs = [];
  for (let i = 0; i < audioFiles.length; i++) {
    inputs.push('-i', audioFiles[i].file);
    filterInputs.push(`[${i}:a]`);
  }
  const filterComplex = `${filterInputs.join('')}concat=n=${audioFiles.length}:v=0:a=1[out]`;

  const result = spawnSync('ffmpeg', [
    '-y',
    ...inputs,
    '-filter_complex', filterComplex,
    '-map', '[out]',
    '-c:a', 'aac', '-b:a', '128k',
    outputFile,
  ], { encoding: 'utf8', timeout: 60000 });

  if (result.status !== 0) {
    console.warn(`  ⚠ Audio concat failed:`, result.stderr);
  }
  return result.status === 0;
}

// ── Main render ────────────────────────────────────────────────────────────
async function render() {
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

  // Task 17: Apply aspect ratio preset (overrides resolution dimensions if set)
  const aspectRatioKey = project.exportSettings?.aspectRatio || detectAspectRatioFromTopic(project.topic);
  const aspectPreset = ASPECT_RATIOS[aspectRatioKey];
  if (aspectPreset) {
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

  if (!project.media || project.media.length === 0) {
    throw new Error('No media assets found. Run the pipeline (source media) first.');
  }

  // MEDIUM #10: Check disk space before starting render
  validateDiskSpace(project, OUTPUT_FILE);

  mkdirSync(OUTPUT_DIR, { recursive: true });

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

  // P0: Pre-compute saturation scores during preload (avoids per-frame temp canvas allocation)
  log('info', '  Pre-computing saturation scores for adaptive colour grading...');
  let saturationComputed = 0;
  for (const [url, img] of imgCache) {
    if (saturationCache.has(url)) continue;
    try {
      const iw = img.width || 1280;
      const ih = img.height || 720;
      const tmpCanvas = createCanvas(iw, ih);
      const tmpCtx = tmpCanvas.getContext('2d');
      tmpCtx.drawImage(img, 0, 0, iw, ih);
      const imageData = tmpCtx.getImageData(0, 0, iw, ih);
      const score = computeSaturationScore(imageData.data, iw, ih);
      if (saturationCache.size >= MAX_SATURATION_CACHE_SIZE) {
        saturationCache.delete(saturationCache.keys().next().value);
      }
      saturationCache.set(url, score);
      saturationComputed++;
    } catch {
      if (saturationCache.size >= MAX_SATURATION_CACHE_SIZE) {
        saturationCache.delete(saturationCache.keys().next().value);
      }
      saturationCache.set(url, 0.5);
    }
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

      // Extract frames at key timestamps
      for (const pct of TIMESTAMPS) {
        const timestamp = pct * clipDuration;
        const cacheKey = `${asset.url}@${timestamp.toFixed(2)}`;
        try {
          const result = spawnSync('ffmpeg', [
            '-ss', String(timestamp),
            '-i', clipTmp,
            '-frames:v', '1',
            '-f', 'image2pipe',
            '-vcodec', 'png',
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

  // Set up ffmpeg pipe
  const hwEncoder = DRAFT_MODE ? detectHardwareEncoder() : null;
  const ffmpegArgs = [
    '-y',
    '-f', 'rawvideo',
    '-vcodec', 'rawvideo',
    '-s', `${WIDTH}x${HEIGHT}`,
    '-pix_fmt', 'bgra', // matches node-canvas toBuffer('raw') on little-endian (ARM64/x86)
    '-r', String(FPS),
    '-i', 'pipe:0',
  ];

  if (DRAFT_MODE && hwEncoder === 'h264_videotoolbox') {
    ffmpegArgs.push('-c:v', 'h264_videotoolbox', '-allow_sw', '1');
  } else {
    ffmpegArgs.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-bf', '3', '-tune', 'film');
  }

  if (DRAFT_MODE) {
    ffmpegArgs.push('-vf', `scale=${outputWidth}:${outputHeight}`);
  }

  ffmpegArgs.push('-pix_fmt', 'yuv420p', '-movflags', '+faststart', OUTPUT_FILE);

  const ffmpeg = spawn('ffmpeg', ffmpegArgs, { stdio: ['pipe', 'inherit', 'inherit'] });

  // Safety: Detect if ffmpeg process dies unexpectedly
  let ffmpegExited = false;
  ffmpeg.setMaxListeners(0); // Allow many drain/close listeners at high frame rates
  ffmpeg.on('close', code => {
    ffmpegExited = true;
    if (code !== 0 && code !== null) {
      console.error(`\n❌ Ffmpeg exited prematurely with code ${code}`);
    }
  });

  ffmpeg.on('error', err => {
    ffmpegExited = true;
    console.error(`\n❌ Ffmpeg error: ${err.message}`);
  });

  /**
   * Write a frame to ffmpeg stdin with safety checks.
   * Returns true if write succeeded, false if ffmpeg has died.
   */
  function writeFrameSafely(buffer) {
    if (ffmpegExited) {
      throw new Error('Ffmpeg process has already exited');
    }
    
    try {
      return ffmpeg.stdin.write(buffer);
    } catch (err) {
      throw new Error(`Failed to write frame to ffmpeg: ${err.message}`);
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

  // Precompute values that are constant per render to avoid per-frame work
  globalSafeZone = computeSafeZone(WIDTH, HEIGHT);
  segWordsCache = new Map();
  for (const seg of project.script) {
    segWordsCache.set(seg.id, seg.narration ? seg.narration.split(' ') : []);
  }

  let totalFrames = 0;
  const TITLE_CARD_SECONDS = 3;
  const END_SCREEN_SECONDS = 4;
  const SEGMENT_TITLE_FRAMES = Math.round(CONFIG.SEGMENT_TITLE_DURATION * FPS); // dynamic based on FPS
  const COLD_OPEN_FRAMES = Math.round(2 * FPS); // 2 seconds, dynamic based on FPS
  const COLD_OPEN_FADE_FRAMES = Math.round(0.125 * FPS); // ~0.125s fade-to-black at end of cold open
  const SEGMENT_FADE_FRAMES = Math.round(0.25 * FPS); // ~0.25s crossfade between segments
  const SEGMENT_TITLE_FADE_FRAMES = Math.round(0.17 * FPS); // ~0.17s fade-in for segment title text
  const titleCardFrames = Math.round(TITLE_CARD_SECONDS * FPS);
  const endScreenFrames = Math.round(END_SCREEN_SECONDS * FPS);
  const segmentSec = project.script.reduce((s, seg) => s + seg.duration, 0);
  const segmentTitleSec = (project.script.length * SEGMENT_TITLE_FRAMES) / FPS;
  const coldOpenSec = COLD_OPEN_FRAMES / FPS;
  const totalSec = segmentSec + segmentTitleSec + TITLE_CARD_SECONDS + END_SCREEN_SECONDS + coldOpenSec;

  log('info', `Rendering ${totalSec.toFixed(1)}s video at ${FPS}fps (${coldOpenSec.toFixed(1)}s cold open + ${TITLE_CARD_SECONDS}s title + ${segmentTitleSec.toFixed(1)}s segment titles + ${segmentSec}s content + ${END_SCREEN_SECONDS}s end screen)...`);

  // #14: Track render start time and expected frames for ETA logging
  const renderStartTime = Date.now();
  const totalExpectedFrames = Math.round(totalSec * FPS);
  
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
    
    log('info', `  📊 Progress: ${totalFrames}/${totalExpectedFrames} frames (${progress.toFixed(1)}%) @ ${fps.toFixed(1)} fps | ETA: ${eta}s`);
    
    // Check for stalls
    if (totalFrames === lastFrameCount && (now - lastProgressLog) > STALL_THRESHOLD_MS) {
      console.error(`\n⚠️  WARNING: Render appears stalled! No new frames in ${(now - lastProgressLog) / 1000}s`);
      console.error(`   Last frame count: ${lastFrameCount}, Current: ${totalFrames}`);
    }
    
    lastFrameCount = totalFrames;
    lastProgressLog = now;
  }

  // ── Step 13: Cold open — dynamic frames from the most dramatic segment ───────
  // Score each section segment by dramatic/surprising language heuristics
  let coldOpenSeg = null;
  let maxScore = -1;
  for (const seg of project.script) {
    if (seg.type === 'section' && seg.narration) {
      const wordCount = seg.narration.split(/\s+/).length;
      let score = wordCount;
      // +50 if narration contains a number/statistic
      if (/\d+/.test(seg.narration)) score += 50;
      // +30 if narration contains a named person (two capitalised words)
      if (/[A-Z][a-z]+ [A-Z][a-z]+/.test(seg.narration)) score += 30;
      // +20 if narration contains a question mark
      if (seg.narration.includes('?')) score += 20;
      if (score > maxScore) {
        maxScore = score;
        coldOpenSeg = seg;
      }
    }
  }
  // Fallback: use the first segment if no 'section' type found
  if (!coldOpenSeg) coldOpenSeg = project.script[0];

  const coldOpenSegIndex = project.script.indexOf(coldOpenSeg);
  const coldOpenMedia = project.media.filter(a => a.segmentId === coldOpenSeg.id);
  log('info', `  Cold open: ${COLD_OPEN_FRAMES} frames (${coldOpenSec}s) from "${coldOpenSeg.title}"`);

  for (let f = 0; f < COLD_OPEN_FRAMES; f++) {
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
    try {
      await drawFrame(ctx, coldOpenSeg, coldAsset, coldImg, coldProgress, project, coldGlobalProgress, coldOpenSegIndex);
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

    // "COMING UP..." text overlay in the top-right corner with contrast background (Requirements 4.1, 4.2, 5.2)
    const comingUpSafeZone = globalSafeZone || computeSafeZone(WIDTH, HEIGHT);
    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.font = '16px sans-serif';
    const comingUpW = ctx.measureText('COMING UP...').width;
    const comingUpPadX = 10;
    const comingUpPadY = 6;
    // Position below the top safe zone margin to avoid YouTube title overlay
    const comingUpY = comingUpSafeZone.top + 4;
    ctx.fillStyle = 'rgba(0,0,0,0.60)';
    ctx.fillRect(WIDTH - comingUpSafeZone.right - comingUpW - comingUpPadX * 2, comingUpY - comingUpPadY, comingUpW + comingUpPadX * 2, 16 + comingUpPadY * 2);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
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

    const raw = canvas.toBuffer('raw');
    const canWrite = writeFrameSafely(raw);
    if (!canWrite) {
      await waitForDrain(2000); // 2s timeout
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

  for (let f = 0; f < titleCardFrames; f++) {
    const progress = f / titleCardFrames;
    drawTitleCardFrame(ctx, projectTitle, projectTopic, progress);

    const raw = canvas.toBuffer('raw');
    const canWrite = writeFrameSafely(raw);
    if (!canWrite) {
      await waitForDrain(2000); // 2s timeout
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
    const seg = project.script[si];
    const segMedia = project.media.filter(a => a.segmentId === seg.id);
    const numFrames = Math.max(1, Math.round(seg.duration * FPS));
    const mc = Math.max(1, segMedia.length);
    const per = Math.max(1, Math.floor(numFrames / mc));

    log('info', `  Segment ${si + 1}/${project.script.length}: "${seg.title}" (${seg.duration}s, ${segMedia.length} media, ${numFrames} frames)`);

    // ── Segment title card: 1.5s (dynamic frames) before each segment ──
    const segAccent = accentColorsMap[seg.type] || '#9b59b6';
    for (let tf = 0; tf < SEGMENT_TITLE_FRAMES; tf++) {
      const titleProgress = tf / SEGMENT_TITLE_FRAMES;

      // P1: Skip expensive particle layers for title cards (covered by text)
      drawProceduralBackground(ctx, seg, titleProgress * 0.1, false);

      // Fade-in over the first SEGMENT_TITLE_FADE_FRAMES frames
      const titleFadeAlpha = Math.min(1, (tf + 1) / SEGMENT_TITLE_FADE_FRAMES);

      ctx.save();
      ctx.globalAlpha = titleFadeAlpha;

      // Segment number — 16px dim text above the title
      ctx.fillStyle = '#71717a';
      ctx.font = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`Part ${si + 1} of ${project.script.length}`, WIDTH / 2, HEIGHT * 0.38);

      // Segment title — bold 42px white text centered at 45% height
      ctx.shadowColor = 'rgba(0,0,0,0.9)';
      ctx.shadowBlur = 16;
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 42px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(seg.title.substring(0, 50), WIDTH / 2, HEIGHT * 0.45);

      // Thin accent-colored line below the title, 150px wide, centered
      ctx.shadowBlur = 0;
      ctx.fillStyle = segAccent;
      ctx.fillRect((WIDTH - 150) / 2, HEIGHT * 0.51, 150, 3);

      ctx.restore();

      const raw = canvas.toBuffer('raw');
      const canWrite = writeFrameSafely(raw);
      if (!canWrite) {
        await waitForDrain(2000); // 2s timeout
      }
      totalFrames++;
      globalFrameCounter++;
      
      // Periodic progress logging (every 50 frames or every 2 seconds)
      if (totalFrames % 50 === 0 || Date.now() - lastProgressLog >= 2000) {
        logRenderProgress();
      }
    }

    // ── Regular segment frames ────────────────────────────────────────────
    let prevMi = -1; // Track previous media index for zoom/pan transitions (Step 10)
    let zoomTransitionCounter = -1; // Counts down from 3 when mi changes

    // Pacing-based asset alternation interval (Requirements 13.3, 13.4)
    // High pacing (4-5) → shorter intervals (2s), Low pacing (1-2) → longer intervals (6s)
    const pacingScore = seg.pacingScore || 3;
    const assetAlternationInterval = pacingScore >= 4 ? 2 : pacingScore <= 2 ? 6 : 4;

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
          // P1: Use pre-extracted frames from cache (avoids per-frame ffmpeg spawnSync)
          const clipDuration = asset.duration || 10;
          const progress = f / numFrames;
          const timestamp = progress * clipDuration;
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
      const FADE_FRAMES = SEGMENT_FADE_FRAMES;

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
          ctx.fillStyle = '#1a1a2e';
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
            ctx.fillStyle = '#1a1a2e';
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
            ctx.fillStyle = '#1a1a2e';
            ctx.fillRect(0, 0, WIDTH, HEIGHT);
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 24px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(seg.title || `Segment ${si + 1}`, WIDTH / 2, HEIGHT / 2);
          }
        }
      }

      // Task 16: Draw watermark/branding on every frame
      const wmChannelName = project.exportSettings?.channelName || 'THE UPDATE DESK';
      drawWatermark(ctx, WIDTH, HEIGHT, {
        text: wmChannelName,
        position: 'bottom-right',
        opacity: 0.7,
      });

      // Write raw RGBA frame to ffmpeg with safety checks
      const raw = canvas.toBuffer('raw');
      const canWrite = writeFrameSafely(raw);
      if (!canWrite) {
        await waitForDrain(2000); // 2s timeout
      }

      totalFrames++;
      globalFrameCounter++;

      // Periodic progress logging (every 50 frames or every 2 seconds)
      if (totalFrames % 50 === 0 || Date.now() - lastProgressLog >= 2000) {
        logRenderProgress();
      }
    }
  }

  // ── End screen (last 4 seconds) ─────────────────────────────────────────
  log('info', `  End screen: ${endScreenFrames} frames (${END_SCREEN_SECONDS}s)`);

  for (let f = 0; f < endScreenFrames; f++) {
    const progress = f / endScreenFrames;
    drawEndScreenFrame(ctx, projectTitle, progress);

    const raw = canvas.toBuffer('raw');
    const canWrite = writeFrameSafely(raw);
    if (!canWrite) {
      await waitForDrain(2000); // 2s timeout
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

  log('info', `\n✅ Done! ${totalFrames} frames rendered`);
  log('info', `📹 Output: ${OUTPUT_FILE}`);

  // Generate narration audio (isolated per run to avoid cross-contamination)
  const audioDir = join(dirname(OUTPUT_FILE), `narration-audio-${Date.now()}`);
  mkdirSync(audioDir, { recursive: true });
  // Pass TTS keys from env for 3-tier fallback: Grok → MeloTTS → edge-tts
  const xaiKey = process.env.XAI_API_KEY || process.env.VITE_XAI_KEY || '';
  const ttsVoice = project.exportSettings?.ttsVoice || process.env.XAI_TTS_VOICE || 'Leo';
  const cfAccountId = process.env.CF_ACCOUNT_ID || process.env.VITE_CF_ACCOUNT_ID || '';
  const cfApiToken = process.env.CF_API_TOKEN || process.env.VITE_CF_API_TOKEN || '';
  const edgeVoice = project.exportSettings?.edgeTtsVoice || 'en-US-GuyNeural';
  log('info', `\n🔑 TTS keys: Grok=${xaiKey ? 'YES (' + xaiKey.substring(0, 8) + '...)' : 'NO'}, MeloTTS=${cfAccountId && cfApiToken ? 'YES' : 'NO'}`);
  const audioFiles = await generateNarration(project.script, audioDir, { xaiKey, ttsVoice, cfAccountId, cfApiToken, edgeVoice });

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
        const muxOk = muxAudio(OUTPUT_FILE, combinedAudio, finalMp4, totalSec, {
          style: videoStyle,
          musicPreset,
          backgroundMusic: bgMusicEnabled,
        });
        log('info', `  Mux result: ${muxOk ? '✓ SUCCESS' : '✗ FAILED'}`);

        if (muxOk) {
          log('info', `✅ Final video with audio: ${finalMp4}`);

          // Task 18: Embed chapters as metadata in MP4 using ffmpeg
          const chaptersStr = generateChaptersString(project.script);
          if (chaptersStr) {
            const chaptersFile = join(dirname(OUTPUT_FILE), 'chapters.txt');
            writeFileSync(chaptersFile, `;FFMETADATA1\n${chaptersStr.split('\n').map(line => {
              const [ts, ...titleParts] = line.split(' - ');
              return titleParts.join(' - ');
            }).join('\n')}`);

            // Add chapter metadata to the MP4
            const chaptersMp4 = finalMp4.replace('.mp4', '-chapters.mp4');
            const chapterResult = spawnSync('ffmpeg', [
              '-y', '-i', finalMp4,
              '-i', chaptersFile,
              '-map', '0', '-map_chapters', '1',
              '-c', 'copy',
              '-metadata', `title=${project.title}`,
              chaptersMp4,
            ], { encoding: 'utf8', timeout: 30000 });

            if (chapterResult.status === 0 && existsSync(chaptersMp4)) {
              log('info', `✅ Chapters embedded in MP4: ${chaptersMp4}`);
              try { unlinkSync(chaptersFile); } catch {}
              // Replace finalMp4 with chapters version
              try { unlinkSync(finalMp4); } catch {}
              spawnSync('mv', [chaptersMp4, finalMp4]);
            } else {
              console.warn('⚠ Chapter embedding failed, keeping video without chapters metadata');
              try { unlinkSync(chaptersFile); } catch {}
            }
          }

          // Copy to Downloads with a topic-based filename
          const safeTitle = (project.title || project.topic || 'autotube-video')
            .replace(/[^a-z0-9]+/gi, '-')
          .replace(/^-|-$/g, '')
          .toLowerCase()
          .substring(0, 60);
        const downloadName = `autotube-${safeTitle}.mp4`;
        const homeDir = homedir() || tmpdir();
        spawnSync('cp', [finalMp4, `${homeDir}/Downloads/${downloadName}`]);
        log('info', `📁 Copied to ~/Downloads/${downloadName}`);
      } else {
        console.warn('⚠ Muxing failed, video-only output saved');
      }
      } catch (muxErr) {
        console.error(`⚠ Mux import/execution error: ${muxErr.message}`);
        console.error(muxErr.stack);
      }
    } else {
      console.warn('⚠ Audio concatenation failed — skipping mux');
    }

    // Clean up temporary narration-audio directory after muxing
    try {
      rmSync(audioDir, { recursive: true, force: true });
      log('info', `   Cleaned up narration-audio dir: ${audioDir}`);
    } catch (cleanupErr) {
      console.warn(`   Failed to clean up narration-audio dir: ${cleanupErr.message}`);
    }

    // Clean up downloaded video clips from temp directory (prevent disk space waste)
    try {
      for (const [, clipPath] of clipFileCache) {
        if (existsSync(clipPath)) {
          unlinkSync(clipPath);
        }
      }
      clipFileCache.clear();
      videoFrameCache.clear();
      log('info', '   Cleaned up video clip cache');
    } catch (cleanupErr) {
      console.warn(`   Failed to clean up video clips: ${cleanupErr.message}`);
    }
  }

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
    spawnSync('cp', [thumbPath, thumbDownloadPath]);
    log('info', `📁 Thumbnail copied to ~/Downloads/${thumbDownloadName}`);
  } catch (thumbErr) {
    console.warn('⚠ Thumbnail generation failed:', thumbErr.message);
  }
}

// Export testable functions
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
    if (typeof ffmpeg !== 'undefined' && !ffmpegExited) {
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
