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
import { existsSync, mkdirSync, writeFileSync, unlinkSync, rmSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, 'test-recordings');
const OUTPUT_FILE = process.argv[2] || join(OUTPUT_DIR, `server-render-${Date.now()}.mp4`);

// Dev server base URL — auto-detect port or use env var
const DEV_SERVER = process.env.DEV_SERVER_URL || 'http://localhost:5173';

// Default resolution — overridden by project.exportSettings.resolution when available
let WIDTH = 1920;
let HEIGHT = 1080;
let FPS = 24; // frames per second for standard quality

// ── Resolution presets (mirrors src/services/renderingShared.ts RESOLUTION_PRESETS) ──
const RESOLUTION_PRESETS = {
  '720p':  { width: 1280, height: 720,  fps: 24, videoBitsPerSecond: 6_000_000 },
  '1080p': { width: 1920, height: 1080, fps: 24, videoBitsPerSecond: 10_000_000 },
  '4K':    { width: 3840, height: 2160, fps: 24, videoBitsPerSecond: 20_000_000 },
};

// ── Shared rendering constants and functions (mirrors src/services/renderingShared.ts) ──
// These are duplicated here because .mjs cannot import .ts directly.

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

  const zoomStart = 1.0 + h1 * 0.25;
  const zoomEnd = 1.0 + h2 * 0.25;

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
    intro:      { bg: ['#0a0a1a', '#1a0a2e', '#0a1a2e'], accent: '#e74c3c' },
    section:    { bg: ['#0a0a1a', '#0a1a2e', '#0a2a3e'], accent: '#3498db' },
    transition: { bg: ['#1a1a0a', '#2a1a0a', '#1a0a0a'], accent: '#f39c12' },
    outro:      { bg: ['#0a1a0a', '#0a2a1a', '#0a1a2a'], accent: '#2ecc71' },
  };
  const p = palettes[segType] || palettes.section;

  // Gradient background
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, p.bg[0]);
  grad.addColorStop(0.5, p.bg[1]);
  grad.addColorStop(1, p.bg[2]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Topic text centered
  if (topicText) {
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px sans-serif';
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

// ── Technical label keywords (Requirement 4.1) ────────────────────────────
const TECHNICAL_LABEL_KEYWORDS = [
  'Isaac Sim',
  'Omniverse',
  'CUDA',
  'Drive',
  'Jetson',
  'DGX',
  'NIM',
  'Blackwell',
  'Hopper',
  'H100',
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
function drawTechnicalLabel(ctx, asset, barH) {
  // Requirement 4.5: if no asset, do nothing
  if (!asset) return;

  const haystack = `${asset.concept ?? ''} ${asset.alt ?? ''}`.toLowerCase();

  // Requirement 4.1 / 4.2: case-insensitive keyword match
  let matchedKeyword;
  for (const kw of TECHNICAL_LABEL_KEYWORDS) {
    if (haystack.includes(kw.toLowerCase())) {
      matchedKeyword = kw;
      break;
    }
  }

  // Requirement 4.5: no match → no label
  if (!matchedKeyword) return;

  // Requirement 4.4: truncate to 40 characters
  const labelText = matchedKeyword.slice(0, 40);

  // Requirement 4.3: measure text, draw background rect, then white text
  ctx.save();
  ctx.font = 'bold 14px sans-serif';
  const textW = ctx.measureText(labelText).width;
  const padX = 8;
  const padY = 4;
  const rectX = 12;
  const rectY = barH + 12;
  const rectW = textW + padX * 2;
  const rectH = 14 + padY * 2; // font size + vertical padding

  ctx.fillStyle = 'rgba(0,0,0,0.70)';
  ctx.fillRect(rectX, rectY, rectW, rectH);

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(labelText, rectX + padX, rectY + padY);
  ctx.restore();
}

// ── Fetch project from dev server ─────────────────────────────────────────
async function fetchProject() {
  // Try loading from /tmp first (saved by /api/save-project)
  const tmpPath = '/tmp/autotube-project.json';
  if (existsSync(tmpPath)) {
    console.log('Loading project from /tmp/autotube-project.json');
    return JSON.parse(readFileSync(tmpPath, 'utf8'));
  }
  console.log(`Fetching project from dev server (${DEV_SERVER})...`);
  const res = await fetch(`${DEV_SERVER}/api/export-project`);
  if (!res.ok) throw new Error(`Failed to fetch project: ${res.status} ${await res.text()}`);
  return res.json();
}

// ── Fetch image via proxy with retry + direct fallback (CORS-safe) ────────
const imageCache = new Map();
async function fetchImage(url) {
  if (imageCache.has(url)) return imageCache.get(url);

  const MAX_RETRIES = 3;
  const TIMEOUT_MS = 15000;

  // Attempt proxy fetch with retries and exponential backoff
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const proxyUrl = `${DEV_SERVER}/api/proxy-image?url=${encodeURIComponent(url)}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const res = await fetch(proxyUrl, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`Proxy returned ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const img = await loadImage(buf);
      imageCache.set(url, img);
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
      const img = await loadImage(url);
      clearTimeout(timer);
      imageCache.set(url, img);
      return img;
    } catch (err) {
      // Direct fetch also failed — fall through to null
    }
  }

  console.warn(`  ⚠ All attempts failed for image: ${url.substring(0, 60)}`);
  return null;
}

// ── Fetch a video clip and extract a frame at a given timestamp ────────────
const videoFrameCache = new Map();
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
          console.log(`    ↳ Trying thumbnail fallback: ${thumbnailUrl.substring(0, 60)}`);
          const fallbackImg = await fetchImage(thumbnailUrl);
          if (fallbackImg) {
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
    ], { encoding: 'buffer', timeout: 15000 });

    if (result.status !== 0 || !result.stdout || result.stdout.length === 0) {
      console.warn(`  ⚠ ffmpeg frame extraction failed for clip at t=${timestamp}`);
      return null;
    }

    const img = await loadImage(result.stdout);
    videoFrameCache.set(cacheKey, img);
    return img;
  } catch (err) {
    console.warn(`  ⚠ Video frame extraction error: ${err.message}`);
    return null;
  }
}

// ── Procedural background (matches browser renderer) ──────────────────────
function drawProceduralBackground(ctx, seg, progress) {
  const palettes = {
    intro:      { bg: ['#0a0a1a', '#1a0a2e', '#0a1a2e'], accent: '#e74c3c' },
    section:    { bg: ['#0a0a1a', '#0a1a2e', '#0a2a3e'], accent: '#3498db' },
    transition: { bg: ['#1a1a0a', '#2a1a0a', '#1a0a0a'], accent: '#f39c12' },
    outro:      { bg: ['#0a1a0a', '#0a2a1a', '#0a1a2a'], accent: '#2ecc71' },
  };
  const p = palettes[seg.type] || palettes.section;

  const angle = progress * Math.PI * 0.3;
  const cx = WIDTH / 2 + Math.cos(angle) * WIDTH * 0.2;
  const cy = HEIGHT / 2 + Math.sin(angle * 0.7) * HEIGHT * 0.15;

  const grad = ctx.createRadialGradient(cx, cy, 0, WIDTH / 2, HEIGHT / 2, WIDTH * 0.8);
  grad.addColorStop(0, p.bg[2]);
  grad.addColorStop(0.5, p.bg[1]);
  grad.addColorStop(1, p.bg[0]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Particles
  for (let i = 0; i < 60; i++) {
    const seed = i * 137.508;
    const px = ((Math.sin(seed + progress * 0.4 + i * 0.1) + 1) / 2) * WIDTH;
    const py = ((Math.cos(seed * 0.7 + progress * 0.25 + i * 0.15) + 1) / 2) * HEIGHT;
    const size = 0.5 + Math.sin(seed + progress * 2 + i) * 0.8;
    ctx.beginPath();
    ctx.arc(px, py, Math.max(0.5, size), 0, Math.PI * 2);
    ctx.fillStyle = p.accent + '08';
    ctx.fill();
  }
}

// ── Draw intro title card frame ────────────────────────────────────────────
function drawTitleCardFrame(ctx, title, topic, progress) {
  // Dark gradient background
  const cx = WIDTH / 2 + Math.cos(progress * Math.PI * 0.3) * WIDTH * 0.1;
  const cy = HEIGHT / 2 + Math.sin(progress * Math.PI * 0.2) * HEIGHT * 0.08;
  const grad = ctx.createRadialGradient(cx, cy, 0, WIDTH / 2, HEIGHT / 2, WIDTH * 0.8);
  grad.addColorStop(0, '#0a1a2e');
  grad.addColorStop(0.5, '#1a0a2e');
  grad.addColorStop(1, '#0a0a1a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Subtle particles
  for (let i = 0; i < 40; i++) {
    const seed = i * 137.508;
    const px = ((Math.sin(seed + progress * 0.4 + i * 0.1) + 1) / 2) * WIDTH;
    const py = ((Math.cos(seed * 0.7 + progress * 0.25 + i * 0.15) + 1) / 2) * HEIGHT;
    const size = 0.5 + Math.sin(seed + progress * 2 + i) * 0.8;
    ctx.beginPath();
    ctx.arc(px, py, Math.max(0.5, size), 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(231, 76, 60, 0.06)';
    ctx.fill();
  }

  // Fade-in effect for text (ramp up over first 30% of title card)
  const fadeAlpha = Math.min(1, progress / 0.3);

  // Step 12: Channel name — 16px dim text at 30% height
  ctx.save();
  ctx.globalAlpha = fadeAlpha;
  ctx.fillStyle = '#71717a';
  ctx.font = '16px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('The Update Desk', WIDTH / 2, HEIGHT * 0.30);
  ctx.restore();

  // Project title — bold 56px white, word-wrapped within safe zone
  // Step 12: Typewriter effect — reveal characters over first 60% of duration
  const visibleChars = progress < 0.6
    ? Math.min(title.length, Math.floor((progress / 0.6) * title.length))
    : title.length;
  const displayTitle = title.substring(0, visibleChars);

  // Use wrapTitleText to wrap at word boundaries with 10% safe zone margins
  // and reduce font size by 20% if more than 3 lines (Requirements 2.1, 2.2, 2.3)
  const baseFontSize = 56;
  const { lines: titleLines, fontSize: titleFontSize } = wrapTitleText(ctx, displayTitle, WIDTH, baseFontSize);
  const titleLineHeight = titleFontSize * 1.3;
  const titleBlockHeight = titleLines.length * titleLineHeight;
  const titleStartY = HEIGHT * 0.40 - titleBlockHeight / 2 + titleLineHeight / 2;

  ctx.save();
  ctx.globalAlpha = fadeAlpha;
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 20;
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${titleFontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < titleLines.length; i++) {
    ctx.fillText(titleLines[i], WIDTH / 2, titleStartY + i * titleLineHeight);
  }
  ctx.restore();

  // Adjust subtitle position based on wrapped title height
  const titleBlockBottom = titleStartY + (titleLines.length - 1) * titleLineHeight + titleLineHeight / 2;
  const subtitleY = Math.max(titleBlockBottom + 30, HEIGHT * 0.50);

  // Topic subtitle — 24px surface-400 color, below the title
  ctx.save();
  ctx.globalAlpha = fadeAlpha;
  ctx.shadowColor = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur = 10;
  ctx.fillStyle = '#a1a1aa'; // surface-400
  ctx.font = '24px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(topic.substring(0, 80), WIDTH / 2, subtitleY);
  ctx.restore();

  // Thin red accent line — 4px tall, 200px wide, centered below subtitle
  const accentLineY = subtitleY + 30;
  ctx.save();
  ctx.globalAlpha = fadeAlpha;
  ctx.fillStyle = '#e74c3c';
  ctx.fillRect((WIDTH - 200) / 2, accentLineY, 200, 4);
  ctx.restore();

  // Step 12: Tagline — 14px italic dim text below accent line
  ctx.save();
  ctx.globalAlpha = fadeAlpha;
  ctx.fillStyle = '#71717a';
  ctx.font = 'italic 14px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('News. Analysis. Opinion.', WIDTH / 2, accentLineY + 28);
  ctx.restore();
}

// ── Draw end screen frame ──────────────────────────────────────────────────
function drawEndScreenFrame(ctx, title, progress) {
  // Dark gradient background
  const cx = WIDTH / 2 + Math.cos(progress * Math.PI * 0.2) * WIDTH * 0.08;
  const cy = HEIGHT / 2 + Math.sin(progress * Math.PI * 0.15) * HEIGHT * 0.06;
  const grad = ctx.createRadialGradient(cx, cy, 0, WIDTH / 2, HEIGHT / 2, WIDTH * 0.8);
  grad.addColorStop(0, '#0a1a2e');
  grad.addColorStop(0.5, '#1a0a2e');
  grad.addColorStop(1, '#0a0a1a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Subtle particles
  for (let i = 0; i < 40; i++) {
    const seed = i * 137.508;
    const px = ((Math.sin(seed + progress * 0.3 + i * 0.1) + 1) / 2) * WIDTH;
    const py = ((Math.cos(seed * 0.7 + progress * 0.2 + i * 0.15) + 1) / 2) * HEIGHT;
    const size = 0.5 + Math.sin(seed + progress * 2 + i) * 0.8;
    ctx.beginPath();
    ctx.arc(px, py, Math.max(0.5, size), 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(231, 76, 60, 0.06)';
    ctx.fill();
  }

  // Fade-in for text
  const fadeAlpha = Math.min(1, progress / 0.25);

  // "Thanks for watching" — 36px white at 35% height
  ctx.save();
  ctx.globalAlpha = fadeAlpha;
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 16;
  ctx.fillStyle = '#ffffff';
  ctx.font = '36px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Thanks for watching', WIDTH / 2, HEIGHT * 0.35);
  ctx.restore();

  // Project title — 28px surface-300 at 45% height
  ctx.save();
  ctx.globalAlpha = fadeAlpha;
  ctx.shadowColor = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur = 10;
  ctx.fillStyle = '#d4d4d8'; // surface-300
  ctx.font = '28px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title.substring(0, 60), WIDTH / 2, HEIGHT * 0.45);
  ctx.restore();

  // "Subscribe" pill button — rounded rect, red fill, white text at 60% height
  ctx.save();
  ctx.globalAlpha = fadeAlpha;
  const btnText = 'Subscribe';
  ctx.font = 'bold 22px sans-serif';
  const btnTextW = ctx.measureText(btnText).width;
  const btnW = btnTextW + 48;
  const btnH = 44;
  const btnX = (WIDTH - btnW) / 2;
  const btnY = HEIGHT * 0.60 - btnH / 2;
  const btnR = btnH / 2; // fully rounded ends

  // Draw rounded rect
  ctx.beginPath();
  ctx.moveTo(btnX + btnR, btnY);
  ctx.lineTo(btnX + btnW - btnR, btnY);
  ctx.arc(btnX + btnW - btnR, btnY + btnR, btnR, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(btnX + btnR, btnY + btnH);
  ctx.arc(btnX + btnR, btnY + btnR, btnR, Math.PI / 2, -Math.PI / 2);
  ctx.closePath();
  ctx.fillStyle = '#e74c3c';
  ctx.fill();

  // Button text
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(btnText, WIDTH / 2, HEIGHT * 0.60);
  ctx.restore();

  // "More videos coming soon" — 18px surface-500 at 75% height
  ctx.save();
  ctx.globalAlpha = fadeAlpha;
  ctx.fillStyle = '#71717a'; // surface-500
  ctx.font = '18px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('More videos coming soon', WIDTH / 2, HEIGHT * 0.75);
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
  // Draw background image if available, otherwise procedural gradient
  if (img) {
    const iw = img.width || img.naturalWidth || 1280;
    const ih = img.height || img.naturalHeight || 720;
    const scale = Math.max(w / iw, h / ih);
    const dw = iw * scale, dh = ih * scale;
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  } else {
    drawProceduralFallbackWithText(ctx, w, h, null, seg.type);
  }

  // Semi-transparent dark overlay covering the full frame for contrast
  const overlay = ctx.createLinearGradient(0, 0, 0, h);
  overlay.addColorStop(0, 'rgba(0,0,0,0.75)');
  overlay.addColorStop(0.5, 'rgba(0,0,0,0.65)');
  overlay.addColorStop(1, 'rgba(0,0,0,0.75)');
  ctx.fillStyle = overlay;
  ctx.fillRect(0, 0, w, h);

  // Extract the stat from narration
  const stat = extractStat(seg.narration);
  const displayStat = stat || seg.title;

  // Accent background pill behind the stat
  const accentColors = { intro: '#e74c3c', section: '#3498db', transition: '#f39c12', outro: '#2ecc71' };
  const accent = accentColors[seg.type] || '#3498db';

  ctx.save();
  ctx.font = `bold ${Math.round(h * 0.1)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const statW = ctx.measureText(displayStat).width;
  const pillPadX = 40;
  const pillPadY = 20;
  const pillW = statW + pillPadX * 2;
  const pillH = Math.round(h * 0.1) + pillPadY * 2;
  const pillX = (w - pillW) / 2;
  const pillY = h * 0.35 - pillH / 2;

  // Draw accent pill
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.85;
  ctx.fillRect(pillX, pillY, pillW, pillH);
  ctx.globalAlpha = 1.0;

  // Draw stat text
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 12;
  ctx.fillText(displayStat, w / 2, h * 0.35);
  ctx.restore();

  // Draw segment title below the stat within safe zone
  ctx.save();
  ctx.font = `bold ${Math.round(h * 0.035)}px sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 8;
  const titleY = Math.min(h * 0.52, h - safeZone.bottom - 80);
  ctx.fillText(seg.title.substring(0, 60), w / 2, titleY);
  ctx.restore();

  // Draw narration excerpt in the lower portion within safe zone
  if (seg.narration) {
    const maxNarrationY = h - safeZone.bottom - 20;
    const narrationY = Math.min(h * 0.65, maxNarrationY);
    const maxTextW = w - safeZone.left - safeZone.right;
    ctx.save();
    ctx.font = `${Math.round(h * 0.025)}px sans-serif`;
    ctx.fillStyle = '#d4d4d8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 6;
    const excerpt = seg.narration.substring(0, 80) + (seg.narration.length > 80 ? '...' : '');
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
  // Draw background image if available
  if (img) {
    const iw = img.width || img.naturalWidth || 1280;
    const ih = img.height || img.naturalHeight || 720;
    const scale = Math.max(w / iw, h / ih);
    const dw = iw * scale, dh = ih * scale;
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  } else {
    drawProceduralFallbackWithText(ctx, w, h, null, seg.type);
  }

  // Dark gradient overlay for text contrast
  const overlay = ctx.createLinearGradient(0, 0, 0, h);
  overlay.addColorStop(0, 'rgba(0,0,0,0.70)');
  overlay.addColorStop(0.4, 'rgba(0,0,0,0.60)');
  overlay.addColorStop(1, 'rgba(0,0,0,0.80)');
  ctx.fillStyle = overlay;
  ctx.fillRect(0, 0, w, h);

  // Extract a quote-worthy excerpt from narration (first sentence or first 120 chars)
  let quoteText = '';
  if (seg.narration) {
    const firstSentence = seg.narration.match(/^[^.!?]+[.!?]/);
    quoteText = firstSentence ? firstSentence[0] : seg.narration.substring(0, 120);
    if (quoteText.length > 120) quoteText = quoteText.substring(0, 117) + '...';
  }

  const maxTextW = w - safeZone.left - safeZone.right - 80; // extra padding for quote marks
  const fontSize = Math.round(h * 0.04);

  // Opening quote mark
  ctx.save();
  ctx.font = `bold ${Math.round(h * 0.12)}px serif`;
  ctx.fillStyle = '#e74c3c';
  ctx.globalAlpha = 0.6;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('\u201C', safeZone.left + 20, safeZone.top + h * 0.15);
  ctx.restore();

  // Quote text — large italic font, word-wrapped within safe zone
  if (quoteText) {
    ctx.save();
    ctx.font = `italic ${fontSize}px sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 12;

    // Simple word wrapping
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

  // Attribution line — segment title as the source
  ctx.save();
  ctx.font = `${Math.round(h * 0.022)}px sans-serif`;
  ctx.fillStyle = '#a1a1aa';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const attrY = Math.min(h * 0.62, h - safeZone.bottom - 40);
  ctx.fillText(`— ${seg.title.substring(0, 50)}`, w / 2, attrY);
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
  // Full-bleed background image
  if (img) {
    const iw = img.width || img.naturalWidth || 1280;
    const ih = img.height || img.naturalHeight || 720;
    const scale = Math.max(w / iw, h / ih);
    const dw = iw * scale, dh = ih * scale;
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  } else {
    drawProceduralFallbackWithText(ctx, w, h, null, seg.type);
  }

  // Dark gradient overlay on the bottom third for text contrast
  const overlayTop = Math.round(h * 0.6);
  const overlay = ctx.createLinearGradient(0, overlayTop, 0, h);
  overlay.addColorStop(0, 'rgba(0,0,0,0)');
  overlay.addColorStop(0.3, 'rgba(0,0,0,0.55)');
  overlay.addColorStop(1, 'rgba(0,0,0,0.85)');
  ctx.fillStyle = overlay;
  ctx.fillRect(0, overlayTop, w, h - overlayTop);

  // Accent line above the text area
  const accentColors = { intro: '#e74c3c', section: '#3498db', transition: '#f39c12', outro: '#2ecc71' };
  const accent = accentColors[seg.type] || '#f39c12';
  const textAreaTop = Math.round(h * 0.72);
  ctx.fillStyle = accent;
  ctx.fillRect(safeZone.left + 20, textAreaTop - 8, 80, 3);

  // Segment title in the lower third
  ctx.save();
  const titleFontSize = Math.round(h * 0.038);
  ctx.font = `bold ${titleFontSize}px sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 12;
  const titleY = Math.min(textAreaTop, h - safeZone.bottom - titleFontSize * 2.5);
  ctx.fillText(seg.title.substring(0, 50), safeZone.left + 20, titleY);
  ctx.restore();

  // Narration excerpt below the title
  if (seg.narration) {
    ctx.save();
    const narFontSize = Math.round(h * 0.022);
    ctx.font = `${narFontSize}px sans-serif`;
    ctx.fillStyle = '#d4d4d8';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 6;
    const narY = Math.min(titleY + titleFontSize + 10, h - safeZone.bottom - narFontSize - 10);
    const maxTextW = w - safeZone.left - safeZone.right - 40;
    const excerpt = seg.narration.substring(0, 100) + (seg.narration.length > 100 ? '...' : '');
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
  // Draw background image if available
  if (img) {
    const iw = img.width || img.naturalWidth || 1280;
    const ih = img.height || img.naturalHeight || 720;
    const scale = Math.max(w / iw, h / ih);
    const dw = iw * scale, dh = ih * scale;
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  } else {
    drawProceduralFallbackWithText(ctx, w, h, null, seg.type);
  }

  // Semi-transparent dark gradient overlay behind the center text area
  const centerOverlayTop = Math.round(h * 0.25);
  const centerOverlayBottom = Math.round(h * 0.75);
  const overlay = ctx.createLinearGradient(0, centerOverlayTop, 0, centerOverlayBottom);
  overlay.addColorStop(0, 'rgba(0,0,0,0)');
  overlay.addColorStop(0.15, 'rgba(0,0,0,0.55)');
  overlay.addColorStop(0.85, 'rgba(0,0,0,0.55)');
  overlay.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = overlay;
  ctx.fillRect(0, centerOverlayTop, w, centerOverlayBottom - centerOverlayTop);

  // Segment title centered
  ctx.save();
  const titleFontSize = Math.round(h * 0.042);
  ctx.font = `bold ${titleFontSize}px sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 14;
  const titleY = Math.max(safeZone.top + titleFontSize, Math.min(h * 0.38, h - safeZone.bottom - titleFontSize * 3));
  ctx.fillText(seg.title.substring(0, 50), w / 2, titleY);
  ctx.restore();

  // Accent line below title
  const accentColors = { intro: '#e74c3c', section: '#3498db', transition: '#f39c12', outro: '#2ecc71' };
  const accent = accentColors[seg.type] || '#9b59b6';
  ctx.fillStyle = accent;
  ctx.fillRect((w - 100) / 2, titleY + titleFontSize * 0.8, 100, 3);

  // Narration excerpt centered below the accent line
  if (seg.narration) {
    ctx.save();
    const narFontSize = Math.round(h * 0.025);
    ctx.font = `${narFontSize}px sans-serif`;
    ctx.fillStyle = '#d4d4d8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 6;

    // Word-wrap narration within safe zone
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
const wordFirstAppearFrame = new Map();
let globalFrameCounter = 0;

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
  drawProceduralBackground(ctx, seg, progress);

  // ── Determine if a scene layout should handle background + text rendering ──
  // When a scene layout is assigned, it draws the background image and text overlays.
  // Ken Burns animation is still applied on top for the default (no-layout) path.
  // Requirements 3.5, 4.1
  const sceneLayout = seg.sceneLayout || null;
  const layoutFn = sceneLayout ? (SCENE_LAYOUT_DISPATCH[sceneLayout] || null) : null;

  if (layoutFn) {
    // ── Scene layout path: layout function handles background + text overlays ──
    const safeZone = computeSafeZone(WIDTH, HEIGHT);
    layoutFn(ctx, seg, img, WIDTH, HEIGHT, safeZone);
  } else {
    // ── Default path: Ken Burns image rendering + original text overlays ──

  // Resolve Ken Burns params: edit plan → computeKenBurnsParams default → hardcoded fallback
  let kbZoomStart = 1.0;
  let kbZoomEnd = 0.06;
  let kbPanDirX = 1.0;
  let kbPanDirY = 1.0;
  let hasEditPlanKB = false;

  if (project && project.editPlan && project.editPlan.segments && asset) {
    const segEntry = project.editPlan.segments.find(e => e.segmentId === seg.id);
    if (segEntry && segEntry.kenBurns && segEntry.kenBurns[asset.id]) {
      const kb = segEntry.kenBurns[asset.id];
      kbZoomStart = kb.zoomStart ?? 1.0;
      kbZoomEnd = (kb.zoomEnd ?? 1.06) - (kb.zoomStart ?? 1.0);
      kbPanDirX = kb.panDirectionX ?? 1.0;
      kbPanDirY = kb.panDirectionY ?? 1.0;
      hasEditPlanKB = true;
    }
    if (segEntry && segEntry.transition) {
      if (progress < 0.01) {
        console.log(`    [EditPlan] Segment "${seg.title}" transition: ${segEntry.transition.type} (${segEntry.transition.durationMs}ms)`);
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
        ctx.save();
        ctx.drawImage(img, (WIDTH - vdw) / 2, (HEIGHT - vdh) / 2, vdw, vdh);
        ctx.restore();
      } else {
      const scale = Math.max(WIDTH / iw, HEIGHT / ih) * 1.15;
      const dw = iw * scale, dh = ih * scale;
      const zoom = kbZoomStart + progress * kbZoomEnd;
      // Vary Ken Burns per asset for visual variety
      const assetSeed = asset ? [...asset.url].reduce((s, c) => s + c.charCodeAt(0), 0) : 0;
      const panMultX = (assetSeed % 3 === 0) ? -1 : (assetSeed % 3 === 1) ? 0.5 : 1;
      const panMultY = (assetSeed % 5 === 0) ? -1 : (assetSeed % 5 === 1) ? 0.3 : 1;
      const panX = Math.sin(progress * Math.PI * 0.7) * 12 * kbPanDirX * panMultX;
      const panY = Math.cos(progress * Math.PI * 0.4) * 6 * kbPanDirY * panMultY;

      // ── Adaptive colour grading ──────────────────────────────────────────
      // Compute saturation score at most once per image URL (Requirement 8.1).
      const DEFAULT_FILTER = 'saturate(1.12) contrast(1.08) brightness(0.94)';
      let filterString = DEFAULT_FILTER;
      if (asset && asset.url) {
        let score;
        if (saturationCache.has(asset.url)) {
          score = saturationCache.get(asset.url);
        } else {
          try {
            // Draw image onto a temporary offscreen canvas to read pixel data
            // (Requirement 9.5: use ctx.getImageData on a canvas context)
            const tmpCanvas = createCanvas(iw, ih);
            const tmpCtx = tmpCanvas.getContext('2d');
            tmpCtx.drawImage(img, 0, 0, iw, ih);
            const imageData = tmpCtx.getImageData(0, 0, iw, ih);
            score = computeSaturationScore(imageData.data, iw, ih);
          } catch {
            // Requirement 3.6: fall back to score 0.5 (maps to default filter)
            score = 0.5;
          }
          saturationCache.set(asset.url, score);
        }
        filterString = computeAdaptiveFilter(score);
      }
      // ────────────────────────────────────────────────────────────────────

      // ── Chart reveal: determine if this asset is a chart (Requirement 5.1) ──
      const isChart = !!(asset && (
        CHART_KEYWORDS.some(kw =>
          (asset.concept ?? '').toLowerCase().includes(kw.toLowerCase()) ||
          (asset.alt ?? '').toLowerCase().includes(kw.toLowerCase())
        )
      ));

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

  // Letterbox
  const barH = Math.round(HEIGHT * 0.04);
  ctx.fillStyle = 'rgba(0,0,0,0.85)';
  ctx.fillRect(0, 0, WIDTH, barH);
  ctx.fillRect(0, HEIGHT - barH, WIDTH, barH);

  // Vignette
  const vig = ctx.createRadialGradient(WIDTH/2, HEIGHT/2, HEIGHT*0.3, WIDTH/2, HEIGHT/2, WIDTH*0.75);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(0.7, 'rgba(0,0,0,0.15)');
  vig.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

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
  const accentColors = { intro: '#e74c3c', section: '#3498db', transition: '#f39c12', outro: '#2ecc71' };
  const accent = accentColors[seg.type] || '#9b59b6';
  const titleSafeZone = computeSafeZone(WIDTH, HEIGHT);
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
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 16;
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
  const words = seg.narration.split(' ');
  if (seg.narration && words.length > 0) {
    const currentWordIdx = Math.min(Math.floor(progress * words.length), words.length - 1);

    // Show the last 6-7 spoken words plus the current word
    const windowStart = Math.max(0, currentWordIdx - 6);
    const visibleWords = words.slice(windowStart, currentWordIdx + 1);

    if (visibleWords.length > 0) {
      // Draw dark background box behind caption area (safe zone enforced — Requirement 5.1, 5.3)
      const capSafeZone = computeSafeZone(WIDTH, HEIGHT);
      const capBgW = 700;
      const capBgH = 60;
      // Position caption so its bottom edge respects the bottom safe zone margin
      const capY = Math.min(HEIGHT - barH - 60, HEIGHT - capSafeZone.bottom - capBgH + 16);
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect((WIDTH - capBgW) / 2, capY - 16, capBgW, capBgH);

      // Measure total width to center the word group
      const normalFont = '500 20px sans-serif';
      const boldFont = 'bold 22px sans-serif';
      ctx.font = normalFont;

      // Pre-measure all words to compute total line width
      let totalWidth = 0;
      const wordWidths = [];
      for (let wi = 0; wi < visibleWords.length; wi++) {
        const isCurrentWord = (windowStart + wi) === currentWordIdx;
        ctx.font = isCurrentWord ? boldFont : normalFont;
        const ww = ctx.measureText(visibleWords[wi]).width;
        wordWidths.push(ww);
        totalWidth += ww;
        if (wi < visibleWords.length - 1) {
          totalWidth += ctx.measureText(' ').width;
        }
      }

      // Draw each word
      const centerY = capY + 14;
      let curX = WIDTH / 2 - totalWidth / 2;

      for (let wi = 0; wi < visibleWords.length; wi++) {
        const globalWordIdx = windowStart + wi;
        const isCurrentWord = globalWordIdx === currentWordIdx;
        const word = visibleWords[wi];

        // Track pop-in: record when this word first appeared
        const wordKey = `${seg.id}:${globalWordIdx}`;
        if (!wordFirstAppearFrame.has(wordKey)) {
          wordFirstAppearFrame.set(wordKey, globalFrameCounter);
        }
        const framesSinceAppear = globalFrameCounter - wordFirstAppearFrame.get(wordKey);

        // Pop-in scale: 1.15x for first 2 frames, then settle to 1.0
        const popScale = framesSinceAppear < 2 ? 1.15 : 1.0;

        ctx.save();

        if (isCurrentWord) {
          // Current word: bold white, slightly larger, with pop scale
          ctx.font = boldFont;
          ctx.fillStyle = '#ffffff';
        } else {
          // Previous words: normal font, dimmer color
          ctx.font = normalFont;
          ctx.fillStyle = '#a1a1aa';
        }

        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        // Apply pop-in scale around the word center
        if (popScale !== 1.0) {
          const wordCenterX = curX + wordWidths[wi] / 2;
          ctx.translate(wordCenterX, centerY);
          ctx.scale(popScale, popScale);
          ctx.translate(-wordCenterX, -centerY);
        }

        ctx.fillText(word, curX, centerY);
        ctx.restore();

        curX += wordWidths[wi];
        if (wi < visibleWords.length - 1) {
          ctx.font = normalFont;
          curX += ctx.measureText(' ').width;
        }
      }
    }
  }

  // ── Step 11: Progress bar at the bottom of the video (safe zone enforced — Requirement 5.1) ──
  if (typeof globalProgress === 'number') {
    ctx.save();
    const progressSafeZone = computeSafeZone(WIDTH, HEIGHT);
    ctx.fillStyle = '#e74c3c';
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
  const { xaiKey, ttsVoice, cfAccountId, cfApiToken } = options;
  const useGrok = !!xaiKey;
  const useMelo = !!cfAccountId && !!cfApiToken;
  const audioFiles = [];

  const engines = [];
  if (useGrok) engines.push('Grok TTS');
  if (useMelo) engines.push('MeloTTS');
  engines.push('edge-tts');
  console.log(`Generating narration audio (fallback chain: ${engines.join(' → ')})...`);
  if (useGrok) console.log(`  Grok voice: ${ttsVoice || 'Leo'}`);

  // Generate initial silence for cold open (2s) + title card (3s) = 5s
  const introSilenceFile = join(outputDir, 'silence-intro.mp3');
  spawnSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-t', '5', introSilenceFile], { encoding: 'utf8', timeout: 10000 });
  if (existsSync(introSilenceFile)) {
    audioFiles.push({ file: introSilenceFile, duration: 5 });
  }

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];

    // Generate 1.5s silence for the segment title card that plays before each segment
    const silenceFile = join(outputDir, `silence-${i}.mp3`);
    spawnSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-t', '1.5', silenceFile], { encoding: 'utf8', timeout: 5000 });
    if (existsSync(silenceFile)) {
      audioFiles.push({ file: silenceFile, duration: 1.5 });
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
        '--voice', 'en-US-GuyNeural',
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
  console.log(`\n  ✓ Generated ${audioFiles.length} audio segments (chain: ${engines.join(' → ')})`);
  return audioFiles;
}

// ── Concatenate audio files ────────────────────────────────────────────────
async function concatenateAudio(audioFiles, outputFile) {
  const listFile = join(tmpdir(), `autotube-audio-list-${Date.now()}.txt`);
  const listContent = audioFiles.map(a => `file '${a.file}'`).join('\n');
  writeFileSync(listFile, listContent);

  const result = spawnSync('ffmpeg', [
    '-y', '-f', 'concat', '-safe', '0',
    '-i', listFile,
    '-c:a', 'aac', '-b:a', '128k',
    outputFile,
  ], { encoding: 'utf8', timeout: 60000 });

  try { unlinkSync(listFile); } catch {}
  return result.status === 0;
}

// ── Main render ────────────────────────────────────────────────────────────
async function render() {
  console.log('Fetching project from dev server...');
  const project = await fetchProject();
  console.log(`Project: "${project.title}" | ${project.script.length} segments | ${project.media.length} media assets`);

  // Apply resolution preset from project export settings (Requirement 6.1, 6.6)
  const resolutionKey = project.exportSettings?.resolution || '720p';
  const resPreset = RESOLUTION_PRESETS[resolutionKey];
  if (resPreset) {
    WIDTH = resPreset.width;
    HEIGHT = resPreset.height;
    FPS = resPreset.fps;
    console.log(`Resolution: ${resolutionKey} (${WIDTH}x${HEIGHT} @ ${FPS}fps)`);
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

  if (!project.media || project.media.length === 0) {
    throw new Error('No media assets found. Run the pipeline (source media) first.');
  }

  mkdirSync(OUTPUT_DIR, { recursive: true });

  // Pre-load all images concurrently with concurrency limit (skip video clips — they're fetched per-frame)
  // Requirements 1.3, 1.4: preload all images before any frame rendering begins
  console.log('Pre-loading images via proxy...');
  const imgCache = new Map();
  const uniqueUrls = [...new Set(project.media.filter(a => a.type !== 'video').map(a => a.url))];
  let loadedCount = 0;
  let failedCount = 0;

  // Concurrent fetch with semaphore pattern (concurrency limit of 5)
  const CONCURRENCY_LIMIT = 5;

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

  console.log(`\n  ✓ Image preloading complete: ${loadedCount} loaded, ${failedCount} failed out of ${uniqueUrls.length} unique URLs`);
  const videoAssetCount = project.media.filter(a => a.type === 'video').length;
  if (videoAssetCount > 0) {
    console.log(`  ${videoAssetCount} video clip(s) will be frame-extracted during render`);
  }

  // Set up ffmpeg pipe
  const videoBitrate = resPreset ? `${Math.round(resPreset.videoBitsPerSecond / 1_000_000)}M` : '3M';
  const ffmpeg = spawn('ffmpeg', [
    '-y',
    '-f', 'rawvideo',
    '-vcodec', 'rawvideo',
    '-s', `${WIDTH}x${HEIGHT}`,
    '-pix_fmt', 'rgba',
    '-r', String(FPS),
    '-i', 'pipe:0',
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
    '-b:v', videoBitrate,
    '-pix_fmt', 'yuv420p',
    OUTPUT_FILE,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  let totalFrames = 0;
  const TITLE_CARD_SECONDS = 3;
  const END_SCREEN_SECONDS = 4;
  const SEGMENT_TITLE_FRAMES = Math.round(1.5 * FPS); // 1.5 seconds, dynamic based on FPS
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

  console.log(`Rendering ${totalSec.toFixed(1)}s video at ${FPS}fps (${coldOpenSec.toFixed(1)}s cold open + ${TITLE_CARD_SECONDS}s title + ${segmentTitleSec.toFixed(1)}s segment titles + ${segmentSec}s content + ${END_SCREEN_SECONDS}s end screen)...`);

  // #14: Track render start time and expected frames for ETA logging
  const renderStartTime = Date.now();
  const totalExpectedFrames = Math.round(totalSec * FPS);

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
  console.log(`  Cold open: ${COLD_OPEN_FRAMES} frames (${coldOpenSec}s) from "${coldOpenSeg.title}"`);

  for (let f = 0; f < COLD_OPEN_FRAMES; f++) {
    // Render at 30-50% progress (the middle of the segment)
    const coldProgress = 0.3 + (f / COLD_OPEN_FRAMES) * 0.2; // 0.3 → 0.5
    const coldMi = Math.min(Math.floor(coldProgress * Math.max(1, coldOpenMedia.length)), Math.max(0, coldOpenMedia.length - 1));
    const coldAsset = coldOpenMedia[coldMi] || null;
    let coldImg = null;

    if (coldAsset) {
      if (coldAsset.type === 'video') {
        const clipDuration = coldAsset.duration || 10;
        coldImg = await fetchVideoFrame(coldAsset.url, coldProgress * clipDuration, coldAsset.thumbnailUrl);
      } else {
        coldImg = imgCache.get(coldAsset.url) || null;
      }
    }

    const coldGlobalProgress = (f / COLD_OPEN_FRAMES * coldOpenSec) / totalSec;
    await drawFrame(ctx, coldOpenSeg, coldAsset, coldImg, coldProgress, project, coldGlobalProgress, coldOpenSegIndex);

    // "COMING UP..." text overlay in the top-right corner with contrast background (Requirements 4.1, 4.2, 5.2)
    const comingUpSafeZone = computeSafeZone(WIDTH, HEIGHT);
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

    // #18: Fade-to-black on the last COLD_OPEN_FADE_FRAMES of the cold open for a smooth
    // crossfade transition into the title card (which already has its own fade-in).
    if (f >= COLD_OPEN_FRAMES - COLD_OPEN_FADE_FRAMES) {
      const fadeOut = (COLD_OPEN_FRAMES - f) / COLD_OPEN_FADE_FRAMES;
      ctx.fillStyle = `rgba(0,0,0,${1 - fadeOut})`;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }

    const raw = canvas.toBuffer('raw');
    const canWrite = ffmpeg.stdin.write(raw);
    if (!canWrite) {
      await new Promise(r => ffmpeg.stdin.once('drain', r));
    }
    totalFrames++;
    globalFrameCounter++;
  }

  // ── Intro title card (first 3 seconds) ──────────────────────────────────
  const projectTitle = project.title || 'AutoTube Video';
  const projectTopic = project.topic || project.title || '';
  console.log(`  Title card: ${titleCardFrames} frames (${TITLE_CARD_SECONDS}s)`);

  for (let f = 0; f < titleCardFrames; f++) {
    const progress = f / titleCardFrames;
    drawTitleCardFrame(ctx, projectTitle, projectTopic, progress);

    const raw = canvas.toBuffer('raw');
    const canWrite = ffmpeg.stdin.write(raw);
    if (!canWrite) {
      await new Promise(r => ffmpeg.stdin.once('drain', r));
    }
    totalFrames++;
  }

  // ── Main segment rendering loop ─────────────────────────────────────────
  const accentColorsMap = { intro: '#e74c3c', section: '#3498db', transition: '#f39c12', outro: '#2ecc71' };

  for (let si = 0; si < project.script.length; si++) {
    const seg = project.script[si];
    const segMedia = project.media.filter(a => a.segmentId === seg.id);
    const numFrames = Math.max(1, Math.round(seg.duration * FPS));
    const mc = Math.max(1, segMedia.length);
    const per = Math.max(1, Math.floor(numFrames / mc));

    console.log(`  Segment ${si + 1}/${project.script.length}: "${seg.title}" (${seg.duration}s, ${segMedia.length} media, ${numFrames} frames)`);

    // ── Segment title card: 1.5s (dynamic frames) before each segment ──
    const segAccent = accentColorsMap[seg.type] || '#9b59b6';
    for (let tf = 0; tf < SEGMENT_TITLE_FRAMES; tf++) {
      const titleProgress = tf / SEGMENT_TITLE_FRAMES;

      // Dark gradient background
      drawProceduralBackground(ctx, seg, titleProgress * 0.1);

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
      const canWrite = ffmpeg.stdin.write(raw);
      if (!canWrite) {
        await new Promise(r => ffmpeg.stdin.once('drain', r));
      }
      totalFrames++;
      globalFrameCounter++;
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
          // Extract a frame from the video clip at the current progress point
          const clipDuration = asset.duration || 10;
          const progress = f / numFrames;
          const timestamp = progress * clipDuration;
          img = await fetchVideoFrame(asset.url, timestamp, asset.thumbnailUrl);
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

      // Compute global progress for the progress bar (Step 11)
      let elapsed = 0;
      for (let s = 0; s < si; s++) {
        elapsed += project.script[s].duration + SEGMENT_TITLE_FRAMES / FPS;
      }
      elapsed += SEGMENT_TITLE_FRAMES / FPS; // current segment's title card
      elapsed += TITLE_CARD_SECONDS; // intro title card
      elapsed += COLD_OPEN_FRAMES / FPS; // cold open duration
      const globalProgress = Math.min(1, (elapsed + (f / numFrames) * seg.duration) / totalSec);

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
        await drawFrame(ctx, seg, asset, img, progress, project, globalProgress, si);
        ctx.restore();
      } else {
        if (applyZoomTransition && zoomScale !== 1.0) {
          ctx.save();
          ctx.translate(WIDTH / 2, HEIGHT / 2);
          ctx.scale(zoomScale, zoomScale);
          ctx.translate(-WIDTH / 2, -HEIGHT / 2);
          await drawFrame(ctx, seg, asset, img, progress, project, globalProgress, si);
          ctx.restore();
        } else {
          await drawFrame(ctx, seg, asset, img, progress, project, globalProgress, si);
        }
      }

      // Write raw RGBA frame to ffmpeg
      const raw = canvas.toBuffer('raw');
      const canWrite = ffmpeg.stdin.write(raw);
      if (!canWrite) {
        await new Promise(r => ffmpeg.stdin.once('drain', r));
      }

      totalFrames++;
      globalFrameCounter++;

      // #14: Log ETA every 100 frames
      if (totalFrames % 100 === 0 && totalFrames > 0) {
        const elapsed = (Date.now() - renderStartTime) / 1000;
        const fps = totalFrames / elapsed;
        const remaining = (totalExpectedFrames - totalFrames) / fps;
        console.log(`    [${totalFrames} frames, ${fps.toFixed(1)} fps, ~${Math.round(remaining)}s remaining]`);
      }
    }
  }

  // ── End screen (last 4 seconds) ─────────────────────────────────────────
  console.log(`  End screen: ${endScreenFrames} frames (${END_SCREEN_SECONDS}s)`);

  for (let f = 0; f < endScreenFrames; f++) {
    const progress = f / endScreenFrames;
    drawEndScreenFrame(ctx, projectTitle, progress);

    const raw = canvas.toBuffer('raw');
    const canWrite = ffmpeg.stdin.write(raw);
    if (!canWrite) {
      await new Promise(r => ffmpeg.stdin.once('drain', r));
    }
    totalFrames++;
  }

  ffmpeg.stdin.end();

  await new Promise((resolve, reject) => {
    ffmpeg.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}`));
    });
  });

  console.log(`\n✅ Done! ${totalFrames} frames rendered`);
  console.log(`📹 Output: ${OUTPUT_FILE}`);

  // Generate narration audio (isolated per run to avoid cross-contamination)
  const audioDir = join(dirname(OUTPUT_FILE), `narration-audio-${Date.now()}`);
  mkdirSync(audioDir, { recursive: true });
  // Pass TTS keys from env for 3-tier fallback: Grok → MeloTTS → edge-tts
  const xaiKey = process.env.XAI_API_KEY || process.env.VITE_XAI_KEY || '';
  const ttsVoice = process.env.XAI_TTS_VOICE || 'Leo';
  const cfAccountId = process.env.CF_ACCOUNT_ID || process.env.VITE_CF_ACCOUNT_ID || '';
  const cfApiToken = process.env.CF_API_TOKEN || process.env.VITE_CF_API_TOKEN || '';
  console.log(`\n🔑 TTS keys: Grok=${xaiKey ? 'YES (' + xaiKey.substring(0, 8) + '...)' : 'NO'}, MeloTTS=${cfAccountId && cfApiToken ? 'YES' : 'NO'}`);
  const audioFiles = await generateNarration(project.script, audioDir, { xaiKey, ttsVoice, cfAccountId, cfApiToken });

  if (audioFiles.length > 0) {
    console.log(`\nMuxing audio with video... (${audioFiles.length} audio segments)`);
    const combinedAudio = join(audioDir, 'combined-narration.aac');
    const audioOk = await concatenateAudio(audioFiles, combinedAudio);
    console.log(`  Audio concatenation: ${audioOk ? '✓' : '✗'} (${existsSync(combinedAudio) ? 'file exists' : 'file missing'})`);

    if (audioOk) {
      // Mux video + audio into final MP4
      const finalMp4 = OUTPUT_FILE.replace('.mp4', '-final.mp4');
      console.log(`  Video input: ${OUTPUT_FILE} (${existsSync(OUTPUT_FILE) ? 'exists' : 'MISSING'})`);
      console.log(`  Audio input: ${combinedAudio} (${existsSync(combinedAudio) ? 'exists' : 'MISSING'})`);
      console.log(`  MP4 output: ${finalMp4}`);

      // Use the audio module's muxVideoWithAudio for background music mixing.
      try {
        const { muxVideoWithAudio: muxAudio } = await import('./server-render/audio.mjs');
        const videoStyle = project.style || 'business_insider';
        const bgMusicEnabled = project.exportSettings?.backgroundMusic !== false;
        console.log(`  Style: ${videoStyle}, BG music: ${bgMusicEnabled}, Duration: ${totalSec}s`);
        const muxOk = muxAudio(OUTPUT_FILE, combinedAudio, finalMp4, totalSec, {
          style: videoStyle,
          backgroundMusic: bgMusicEnabled,
        });
        console.log(`  Mux result: ${muxOk ? '✓ SUCCESS' : '✗ FAILED'}`);

        if (muxOk) {
          console.log(`✅ Final video with audio: ${finalMp4}`);
          // Copy to Downloads with a topic-based filename
          const safeTitle = (project.title || project.topic || 'autotube-video')
            .replace(/[^a-z0-9]+/gi, '-')
          .replace(/^-|-$/g, '')
          .toLowerCase()
          .substring(0, 60);
        const downloadName = `autotube-${safeTitle}.mp4`;
        spawnSync('cp', [finalMp4, `${process.env.HOME}/Downloads/${downloadName}`]);
        console.log(`📁 Copied to ~/Downloads/${downloadName}`);
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
      console.log(`🧹 Cleaned up narration-audio dir: ${audioDir}`);
    } catch (cleanupErr) {
      console.warn(`⚠ Failed to clean up narration-audio dir: ${cleanupErr.message}`);
    }
  }

  // Quick quality check
  const probe = spawnSync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration,size',
    '-of', 'default=noprint_wrappers=1', OUTPUT_FILE,
  ], { encoding: 'utf8' });
  console.log('Video info:', probe.stdout.trim());

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
  console.log(`\nFrame quality check: avg brightness = ${avgBrightness}/255`);
  if (avgBrightness > 40) {
    console.log('✅ Real images are rendering! Video should show actual imagery.');
  } else {
    console.log('⚠ Low brightness — images may not have loaded. Check proxy connectivity.');
  }

  // ── #18: Generate thumbnail ──────────────────────────────────────────────
  console.log('\nGenerating thumbnail...');
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

      // Add a dark gradient overlay on the bottom 40% for text readability
      const gradY = 720 * 0.60; // gradient starts at 60% height
      const grad = thumbCtx.createLinearGradient(0, gradY, 0, 720);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.3, 'rgba(0,0,0,0.55)');
      grad.addColorStop(1, 'rgba(0,0,0,0.85)');
      thumbCtx.fillStyle = grad;
      thumbCtx.fillRect(0, gradY, 1280, 720 - gradY);

      // Draw a thin accent bar (4px tall, 200px wide) above the title at 58% height
      // #28: Vary accent bar color based on the first segment's type
      const thumbAccentColors = { intro: '#e74c3c', section: '#3498db', transition: '#f39c12', outro: '#2ecc71' };
      const thumbAccent = thumbAccentColors[project.script[0]?.type] || '#e74c3c';
      thumbCtx.fillStyle = thumbAccent;
      thumbCtx.fillRect((1280 - 200) / 2, 720 * 0.58, 200, 4);

      // Draw the title in bold 52px white text at 65% height (over the dark gradient)
      thumbCtx.save();
      thumbCtx.shadowColor = 'rgba(0,0,0,0.9)';
      thumbCtx.shadowBlur = 20;
      thumbCtx.shadowOffsetX = 3;
      thumbCtx.shadowOffsetY = 3;
      thumbCtx.fillStyle = '#ffffff';
      thumbCtx.font = 'bold 52px sans-serif';
      thumbCtx.textAlign = 'center';
      thumbCtx.textBaseline = 'middle';
      // Extract the most impactful 3-4 words from the title (#26)
      const fullTitle = project.title || 'AutoTube Video';
      const words = fullTitle.split(/\s+/);
      // Find the longest word (likely the key noun)
      let longestIdx = 0;
      for (let i = 1; i < words.length; i++) {
        if (words[i].length > words[longestIdx].length) longestIdx = i;
      }
      // Take the longest word plus 1 word before and after
      const start = Math.max(0, longestIdx - 1);
      const end = Math.min(words.length, longestIdx + 2);
      const thumbTitle = words.slice(start, end).join(' ');
      // Draw in larger, bolder text for thumbnail readability
      thumbCtx.font = 'bold 64px sans-serif';
      thumbCtx.fillText(thumbTitle.substring(0, 35), 1280 / 2, 720 * 0.65);
      thumbCtx.restore();

      // #29: Channel branding in top-left corner
      thumbCtx.save();
      thumbCtx.fillStyle = 'rgba(255,255,255,0.8)';
      thumbCtx.font = 'bold 18px sans-serif';
      thumbCtx.textAlign = 'left';
      thumbCtx.textBaseline = 'top';
      thumbCtx.fillText('The Update Desk', 20, 20);
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

      // Overlay the project title
      thumbCtx.save();
      thumbCtx.shadowColor = 'rgba(0,0,0,0.9)';
      thumbCtx.shadowBlur = 20;
      thumbCtx.shadowOffsetX = 3;
      thumbCtx.shadowOffsetY = 3;
      thumbCtx.fillStyle = '#ffffff';
      thumbCtx.font = 'bold 52px sans-serif';
      thumbCtx.textAlign = 'center';
      thumbCtx.textBaseline = 'middle';
      // Extract the most impactful 3-4 words from the title (#26)
      const fullTitle2 = project.title || 'AutoTube Video';
      const words2 = fullTitle2.split(/\s+/);
      let longestIdx2 = 0;
      for (let i = 1; i < words2.length; i++) {
        if (words2[i].length > words2[longestIdx2].length) longestIdx2 = i;
      }
      const start2 = Math.max(0, longestIdx2 - 1);
      const end2 = Math.min(words2.length, longestIdx2 + 2);
      const thumbTitle = words2.slice(start2, end2).join(' ');
      thumbCtx.font = 'bold 64px sans-serif';
      thumbCtx.fillText(thumbTitle.substring(0, 35), 1280 / 2, 720 * 0.60);
      thumbCtx.restore();
    }

    // Save as thumbnail.png in the output directory
    const thumbPath = join(OUTPUT_DIR, 'thumbnail.png');
    const thumbBuffer = thumbCanvas.toBuffer('image/png');
    writeFileSync(thumbPath, thumbBuffer);
    console.log(`🖼️  Thumbnail saved: ${thumbPath}`);

    // Copy to ~/Downloads/autotube-{topic}-thumbnail.png
    const safeTopic = (project.title || project.topic || 'video')
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase()
      .substring(0, 60);
    const thumbDownloadName = `autotube-${safeTopic}-thumbnail.png`;
    const thumbDownloadPath = `${process.env.HOME}/Downloads/${thumbDownloadName}`;
    spawnSync('cp', [thumbPath, thumbDownloadPath]);
    console.log(`📁 Thumbnail copied to ~/Downloads/${thumbDownloadName}`);
  } catch (thumbErr) {
    console.warn('⚠ Thumbnail generation failed:', thumbErr.message);
  }
}

render().catch(err => {
  console.error('❌ Render failed:', err.message);
  process.exit(1);
});
