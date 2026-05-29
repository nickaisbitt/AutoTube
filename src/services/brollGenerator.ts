// ============================================================================
// AI B-Roll Image Generator — Procedural Canvas-Based Visual Generation
// ============================================================================

import { logger } from './logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BRollImage {
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
  theme: string;
}

export interface BRollOptions {
  width?: number;
  height?: number;
  narrationText?: string;
  accentColor?: string;
}

// ---------------------------------------------------------------------------
// Color palette derivation from narration
// ---------------------------------------------------------------------------

const THEME_KEYWORDS: Record<string, { gradient: string[]; shapes: string; mood: 'dark' | 'light' | 'dramatic' }> = {
  technology: { gradient: ['#0a0a1a', '#1a1a3e', '#0a0a1a'], shapes: 'circuit', mood: 'dark' },
  finance: { gradient: ['#0d1117', '#1a2332', '#0d1117'], shapes: 'grid', mood: 'dark' },
  security: { gradient: ['#1a0000', '#3d0000', '#1a0000'], shapes: 'shield', mood: 'dramatic' },
  ai: { gradient: ['#0a001a', '#1a003e', '#0a001a'], shapes: 'neural', mood: 'dark' },
  health: { gradient: ['#001a0a', '#003e1a', '#001a0a'], shapes: 'wave', mood: 'light' },
  energy: { gradient: ['#1a1a00', '#3e3e00', '#1a1a00'], shapes: 'circuit', mood: 'dramatic' },
  default: { gradient: ['#0a1628', '#1e3a5f', '#0a1628'], shapes: 'geometric', mood: 'dark' },
};

function deriveTheme(narrationText?: string): { gradient: string[]; shapes: string; mood: 'dark' | 'light' | 'dramatic' } {
  if (!narrationText) return THEME_KEYWORDS.default;
  const lower = narrationText.toLowerCase();
  for (const [key, theme] of Object.entries(THEME_KEYWORDS)) {
    if (key === 'default') continue;
    if (lower.includes(key)) return theme;
  }
  return THEME_KEYWORDS.default;
}

// ---------------------------------------------------------------------------
// Procedural shape drawing
// ---------------------------------------------------------------------------

function drawCircuitPattern(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number) {
  ctx.strokeStyle = 'rgba(100, 200, 255, 0.12)';
  ctx.lineWidth = 1;
  const rng = seededRandom(seed);
  const gridSize = 40;
  for (let x = 0; x < w; x += gridSize) {
    for (let y = 0; y < h; y += gridSize) {
      if (rng() > 0.7) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        if (rng() > 0.5) ctx.lineTo(x + gridSize, y);
        else ctx.lineTo(x, y + gridSize);
        ctx.stroke();
      }
      if (rng() > 0.85) {
        ctx.fillStyle = 'rgba(100, 200, 255, 0.2)';
        ctx.beginPath();
        ctx.arc(x + gridSize / 2, y + gridSize / 2, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function drawGridPattern(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number) {
  ctx.strokeStyle = 'rgba(200, 200, 200, 0.08)';
  ctx.lineWidth = 0.5;
  const rng = seededRandom(seed);
  const step = 60;
  for (let x = 0; x < w; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + (rng() - 0.5) * 20, h);
    ctx.stroke();
  }
  for (let y = 0; y < h; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y + (rng() - 0.5) * 20);
    ctx.stroke();
  }
}

function drawShieldPattern(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number) {
  const rng = seededRandom(seed);
  ctx.strokeStyle = 'rgba(255, 80, 80, 0.1)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 5; i++) {
    const cx = w * (0.2 + rng() * 0.6);
    const cy = h * (0.2 + rng() * 0.6);
    const size = 30 + rng() * 60;
    ctx.beginPath();
    ctx.moveTo(cx, cy - size);
    ctx.quadraticCurveTo(cx + size, cy, cx, cy + size);
    ctx.quadraticCurveTo(cx - size, cy, cx, cy - size);
    ctx.stroke();
  }
}

function drawNeuralPattern(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number) {
  const rng = seededRandom(seed);
  const nodes: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < 20; i++) {
    nodes.push({ x: rng() * w, y: rng() * h });
  }
  ctx.strokeStyle = 'rgba(150, 100, 255, 0.08)';
  ctx.lineWidth = 0.5;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dist = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y);
      if (dist < w * 0.3) {
        ctx.beginPath();
        ctx.moveTo(nodes[i].x, nodes[i].y);
        ctx.lineTo(nodes[j].x, nodes[j].y);
        ctx.stroke();
      }
    }
  }
  ctx.fillStyle = 'rgba(150, 100, 255, 0.15)';
  for (const node of nodes) {
    ctx.beginPath();
    ctx.arc(node.x, node.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawWavePattern(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number) {
  const rng = seededRandom(seed);
  ctx.strokeStyle = 'rgba(100, 255, 150, 0.1)';
  ctx.lineWidth = 1.5;
  for (let wave = 0; wave < 5; wave++) {
    ctx.beginPath();
    const yBase = h * (0.2 + rng() * 0.6);
    const amplitude = 20 + rng() * 40;
    const frequency = 0.005 + rng() * 0.01;
    for (let x = 0; x < w; x += 2) {
      const y = yBase + Math.sin(x * frequency + rng() * 10) * amplitude;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

function drawGeometricPattern(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number) {
  const rng = seededRandom(seed);
  ctx.globalAlpha = 0.12;
  for (let i = 0; i < 8; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const size = 30 + rng() * 100;
    const color = i % 2 === 0 ? '#ffffff' : '#ef4444';
    ctx.fillStyle = color;
    if (rng() > 0.5) {
      ctx.fillRect(x - size / 2, y - size / 2, size, size);
    } else {
      ctx.beginPath();
      ctx.arc(x, y, size / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

const SHAPE_RENDERERS: Record<string, (ctx: CanvasRenderingContext2D, w: number, h: number, seed: number) => void> = {
  circuit: drawCircuitPattern,
  grid: drawGridPattern,
  shield: drawShieldPattern,
  neural: drawNeuralPattern,
  wave: drawWavePattern,
  geometric: drawGeometricPattern,
};

// ---------------------------------------------------------------------------
// Deterministic seeded random
// ---------------------------------------------------------------------------

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

// ---------------------------------------------------------------------------
// Canvas rendering
// ---------------------------------------------------------------------------

function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/jpeg', quality = 0.92): Promise<Blob> {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => { resolve(blob || new Blob([], { type })); },
      type,
      quality,
    );
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generates a procedural B-roll image based on narration content.
 * Uses gradients, shapes, and patterns to create visually interesting backgrounds.
 */
export async function generateBRollImage(
  narrationText: string,
  options: BRollOptions = {},
): Promise<BRollImage> {
  const width = options.width ?? 1920;
  const height = options.height ?? 1080;
  const theme = deriveTheme(narrationText);
  const seed = hashString(narrationText || 'default');

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  // 1. Gradient background
  const grad = ctx.createLinearGradient(0, 0, width, height);
  theme.gradient.forEach((color, i) => {
    grad.addColorStop(i / (theme.gradient.length - 1), color);
  });
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // 2. Radial highlight for depth
  const radial = ctx.createRadialGradient(
    width * 0.5, height * 0.4, 0,
    width * 0.5, height * 0.4, width * 0.5,
  );
  radial.addColorStop(0, 'rgba(255,255,255,0.06)');
  radial.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = radial;
  ctx.fillRect(0, 0, width, height);

  // 3. Theme-specific shapes
  const renderer = SHAPE_RENDERERS[theme.shapes] || SHAPE_RENDERERS.geometric;
  renderer(ctx, width, height, seed);

  // 4. Vignette
  const vignette = ctx.createRadialGradient(
    width / 2, height / 2, height * 0.3,
    width / 2, height / 2, width * 0.75,
  );
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);

  // 5. Accent line
  const accentColor = options.accentColor || '#ef4444';
  ctx.fillStyle = accentColor;
  ctx.fillRect(width * 0.05, height * 0.85, width * 0.15, 4);

  const blob = await canvasToBlob(canvas);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

  logger.info('BRollGenerator', `Generated procedural B-roll (${width}x${height}, theme: ${theme.shapes})`);
  return { blob, dataUrl, width, height, theme: theme.shapes };
}

/**
 * Generates multiple B-roll variants for a single narration segment.
 */
export async function generateBRollVariants(
  narrationText: string,
  count: number,
  options: BRollOptions = {},
): Promise<BRollImage[]> {
  const variants: BRollImage[] = [];
  for (let i = 0; i < count; i++) {
    const variantText = `${narrationText}::variant${i}`;
    variants.push(await generateBRollImage(variantText, options));
  }
  return variants;
}
