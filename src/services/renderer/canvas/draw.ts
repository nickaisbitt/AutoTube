import type { ScriptSegment, MediaAsset, KenBurnsParams } from '../../../types';
import { computeSafeZone } from '../../renderingShared';
import { computeSaturationScore, computeAdaptiveFilter, CHART_KEYWORDS } from '../../captionUtils';
import { logger } from '../../logger';
import type { ImgCache, RenderableImage, RenderOptions } from '../orchestrator';
import { hexToRgba, wrapText, drawTechnicalLabel } from './text';
import { SCENE_LAYOUT_DISPATCH } from './scenes';

// Requirement 8.1: Cache saturation scores keyed by image URL so the score is
// computed at most once per image per render session.
export const saturationCache = new Map<string, number>();

// ── Procedural cinematic backgrounds ──
export function drawProceduralBackground(
  ctx: CanvasRenderingContext2D, w: number, h: number,
  seg: ScriptSegment, progress: number,
  isRendering?: boolean,
): void {
  // Topic-aware color palettes with segment-type variants
  const palettes: Record<string, { bg: string[]; accent: string; glow: string; secondary: string }> = {
    // Segment type palettes
    intro: {
      bg: ['#0a0a1a', '#1a0a2e', '#0a1a2e'],
      accent: '#e74c3c',
      glow: '#ff6b6b',
      secondary: '#f39c12',
    },
    section: {
      bg: ['#0a0a1a', '#0a1a2e', '#0a2a3e'],
      accent: '#3498db',
      glow: '#5dade2',
      secondary: '#9b59b6',
    },
    transition: {
      bg: ['#1a1a0a', '#2a1a0a', '#1a0a0a'],
      accent: '#f39c12',
      glow: '#f5b041',
      secondary: '#e67e22',
    },
    outro: {
      bg: ['#0a1a0a', '#0a2a1a', '#0a1a2a'],
      accent: '#2ecc71',
      glow: '#58d68d',
      secondary: '#1abc9c',
    },
  };

  // Topic-specific palette overrides (overrides segment type when topic matches)
  const topicPalettes: Array<{ keywords: string[]; palette: typeof palettes['intro'] }> = [
    {
      keywords: ['tech', 'ai', 'software', 'computing', 'digital', 'cyber', 'robot'],
      palette: { bg: ['#0a0a2e', '#0a1a3e', '#1a0a3e'], accent: '#00d4ff', glow: '#00f0ff', secondary: '#7c3aed' },
    },
    {
      keywords: ['finance', 'money', 'crypto', 'stock', 'invest', 'economy', 'bitcoin', 'trading'],
      palette: { bg: ['#0a1a0a', '#0a2a0a', '#1a2a0a'], accent: '#00ff88', glow: '#00ffaa', secondary: '#fbbf24' },
    },
    {
      keywords: ['health', 'medical', 'disease', 'vaccine', 'doctor', 'medicine', 'mental'],
      palette: { bg: ['#0a1a2a', '#0a2a3a', '#1a2a3a'], accent: '#22d3ee', glow: '#67e8f9', secondary: '#a78bfa' },
    },
    {
      keywords: ['science', 'space', 'physics', 'quantum', 'nasa', 'universe', 'research'],
      palette: { bg: ['#0a0a1a', '#1a0a2a', '#0a1a2a'], accent: '#a855f7', glow: '#c084fc', secondary: '#38bdf8' },
    },
    {
      keywords: ['politics', 'government', 'election', 'law', 'policy', 'congress', 'senate'],
      palette: { bg: ['#1a0a0a', '#2a0a0a', '#1a1a0a'], accent: '#ef4444', glow: '#f87171', secondary: '#3b82f6' },
    },
    {
      keywords: ['climate', 'environment', 'earth', 'energy', 'solar', 'green', 'carbon'],
      palette: { bg: ['#0a1a0a', '#0a2a1a', '#1a2a0a'], accent: '#10b981', glow: '#34d399', secondary: '#f59e0b' },
    },
    {
      keywords: ['china', 'lithium', 'ev', 'battery', 'tesla', 'electric', 'vehicle'],
      palette: { bg: ['#1a0a0a', '#2a0a1a', '#1a1a0a'], accent: '#ef4444', glow: '#fca5a5', secondary: '#fbbf24' },
    },
  ];

  // Check if topic matches any topic-specific palette
  const topicLower = (seg.type === 'intro' ? seg.title : seg.title + ' ' + (seg.narration || '')).toLowerCase();
  for (const tp of topicPalettes) {
    if (tp.keywords.some(kw => topicLower.includes(kw))) {
      const palette = palettes[seg.type] || palettes.section;
      // Blend topic palette with segment type palette for cohesion
      Object.assign(palette, tp.palette);
      break;
    }
  }

  const palette = palettes[seg.type] || palettes.section;

  // Animated multi-layer gradient
  const angle = progress * Math.PI * 0.3;
  const cx = w / 2 + Math.cos(angle) * w * 0.2;
  const cy = h / 2 + Math.sin(angle * 0.7) * h * 0.15;

  // Base gradient
  const baseGrad = ctx.createRadialGradient(cx, cy, 0, w / 2, h / 2, w * 0.8);
  baseGrad.addColorStop(0, palette.bg[2]);
  baseGrad.addColorStop(0.5, palette.bg[1]);
  baseGrad.addColorStop(1, palette.bg[0]);
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, w, h);

  // Secondary glow layer
  const glowX = w * 0.3 + Math.sin(progress * Math.PI * 2) * w * 0.1;
  const glowY = h * 0.4 + Math.cos(progress * Math.PI * 1.5) * h * 0.1;
  const glowGrad = ctx.createRadialGradient(glowX, glowY, 0, glowX, glowY, w * 0.5);
  glowGrad.addColorStop(0, palette.glow + '20');
  glowGrad.addColorStop(0.5, palette.glow + '10');
  glowGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = glowGrad;
  ctx.fillRect(0, 0, w, h);

  // Pulsing center orb
  const pulse = Math.sin(progress * Math.PI * 2) * 0.3 + 0.7;
  const orbGrad = ctx.createRadialGradient(w/2, h/2, 0, w/2, h/2, w * 0.15 * pulse);
  orbGrad.addColorStop(0, palette.accent + '30');
  orbGrad.addColorStop(0.5, palette.accent + '10');
  orbGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = orbGrad;
  ctx.fillRect(0, 0, w, h);

  // Animated wave layers
  for (let layer = 0; layer < 3; layer++) {
    const waveOffset = progress * Math.PI * 2 + layer * Math.PI * 0.8;
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
    ctx.fillStyle = palette.accent + waveAlphas[layer];
    ctx.fill();
  }

  // Floating geometric shapes (circles)
  const shapeCount = 8;
  for (let i = 0; i < shapeCount; i++) {
    const seed = i * 173.508;
    const px = ((Math.sin(seed + progress * 0.3 + i) + 1) / 2) * w;
    const py = ((Math.cos(seed * 0.6 + progress * 0.2 + i) + 1) / 2) * h;
    const radius = 20 + Math.sin(seed + progress * 0.5 + i) * 15;
    const alpha = 0.03 + Math.sin(seed * 1.1 + progress) * 0.02;
    
    ctx.beginPath();
    ctx.arc(px, py, Math.max(1, radius), 0, Math.PI * 2);
    ctx.fillStyle = palette.secondary + Math.round(alpha * 255).toString(16).padStart(2, '0');
    ctx.fill();
  }

  // Resolution-scaled particle count (more particles for higher resolutions)
  const resolutionScale = Math.min(Math.max(w / 1280, h / 720), 3); // Cap at 3x for performance
  const baseParticleCount = isRendering ? 80 : 150;
  const particleCount = Math.round(baseParticleCount * resolutionScale);
  const sizeScale = isRendering ? 1.5 : 1;
  const alphaScale = isRendering ? 2 : 1;
  for (let i = 0; i < particleCount; i++) {
    const seed = i * 137.508;
    const px = ((Math.sin(seed + progress * 0.4 + i * 0.1) + 1) / 2) * w;
    const py = ((Math.cos(seed * 0.7 + progress * 0.25 + i * 0.15) + 1) / 2) * h;
    const size = (0.5 + Math.sin(seed + progress * 2 + i) * 0.8) * sizeScale;
    const alpha = (0.05 + Math.sin(seed * 1.3 + progress * 3 + i) * 0.03) * alphaScale;

    ctx.beginPath();
    ctx.arc(px, py, Math.max(0.5, size), 0, Math.PI * 2);
    ctx.fillStyle = palette.accent + Math.round(Math.max(0, Math.min(255, alpha * 255))).toString(16).padStart(2, '0');
    ctx.fill();
  }

  // Floating lines (connecting particles)
  ctx.strokeStyle = palette.accent + '06';
  ctx.lineWidth = 0.5;
  for (let i = 0; i < 15; i++) {
    const seed = i * 200.123;
    const x1 = ((Math.sin(seed + progress * 0.2) + 1) / 2) * w;
    const y1 = ((Math.cos(seed * 0.5 + progress * 0.15) + 1) / 2) * h;
    const x2 = ((Math.sin(seed * 1.3 + progress * 0.25) + 1) / 2) * w;
    const y2 = ((Math.cos(seed * 0.8 + progress * 0.18) + 1) / 2) * h;
    
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // Subtle grid overlay (tech feel)
  ctx.strokeStyle = palette.accent + '06';
  ctx.lineWidth = 0.5;
  const gridSize = 60;
  for (let x = 0; x < w; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y < h; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // Corner accent flares
  const cornerSize = w * 0.15;
  const corners = [[0, 0], [w, 0], [0, h], [w, h]];
  corners.forEach(([cx, cy], idx) => {
    const cornerGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cornerSize);
    const cornerAlpha = Math.max(0, Math.min(255, Math.floor(10 + Math.sin(progress + idx) * 5)));
    cornerGrad.addColorStop(0, `${palette.accent}${cornerAlpha.toString(16).padStart(2, '0')}`);
    cornerGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = cornerGrad;
    ctx.fillRect(cx === 0 ? 0 : cx - cornerSize, cy === 0 ? 0 : cy - cornerSize, cornerSize, cornerSize);
  });
}

export function draw(
  ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement,
  seg: ScriptSegment, asset: MediaAsset | undefined, cache: ImgCache, progress = 0,
  _watermark?: RenderOptions['watermark'],
  isRendering?: boolean,
  bgCache?: HTMLCanvasElement | null,
  kenBurnsOverride?: KenBurnsParams,
): void {
  const w = canvas.width, h = canvas.height;

  // ── Procedural cinematic background (topic-aware) ──
  if (bgCache) {
    ctx.drawImage(bgCache, 0, 0);
  } else {
    drawProceduralBackground(ctx, w, h, seg, progress, isRendering);
  }

  // ── Scene layout dispatch (Requirements 2.4, 3.6, 4.3, 5.4) ──
  const sceneLayout = seg.sceneLayout || null;
  const layoutFn = sceneLayout ? (SCENE_LAYOUT_DISPATCH[sceneLayout] || null) : null;

  if (layoutFn && asset && cache[asset.url]) {
    const img = cache[asset.url] as RenderableImage;
    const safeZone = computeSafeZone(w, h);
    if (img.safeForCanvas) {
      layoutFn(ctx, seg, img, w, h, safeZone);
      return;
    }
  } else if (layoutFn && (!asset || !cache[asset.url])) {
    const safeZone = computeSafeZone(w, h);
    layoutFn(ctx, seg, undefined, w, h, safeZone);
    return;
  }

  // ── Optional: Image with cinematic Ken Burns (only if CORS-safe) ──
  if (asset && cache[asset.url]) {
    const img = cache[asset.url] as RenderableImage;
    if (!img.safeForCanvas) {
      logger.warn('Renderer', `Image NOT safe for canvas: ${asset.url.substring(0,60)}`);
    }
    if (img.safeForCanvas) {
      const isSecondaryShot = asset.shotType === 'secondary';
      const imgW = (img as RenderableImage).naturalW || img.naturalWidth || img.width || 1280;
      const imgH = (img as RenderableImage).naturalH || img.naturalHeight || img.height || 720;
      logger.info('Renderer', `Drawing image: ${asset.url.substring(0,60)} safeForCanvas=${img.safeForCanvas} dims=${imgW}x${imgH}`);
      if (imgW > 0 && imgH > 0) {

        // Requirement 4.5: Render video clips directly without Ken Burns zoom/pan.
        if (asset.type === 'video') {
          const vScale = Math.max(w / imgW, h / imgH);
          const vdw = imgW * vScale, vdh = imgH * vScale;
          ctx.save();
          ctx.drawImage(img, (w - vdw) / 2, (h - vdh) / 2, vdw, vdh);
          ctx.restore();
        } else {
        // ─ P1: Cinematic Ken Burns — punchy zoom + aggressive pan with Bezier easing ──
        const scale = Math.max(w / imgW, h / imgH) * (isSecondaryShot ? 1.45 : 1.40);
        const dw = imgW * scale, dh = imgH * scale;

        // Resolution-scaled pan amplitude
        const resolutionScale = Math.max(w / 1280, h / 720);
        const basePanX = isSecondaryShot ? 60 : 45;
        const basePanY = isSecondaryShot ? 30 : 22;
        const panAmplitudeX = basePanX * resolutionScale;
        const panAmplitudeY = basePanY * resolutionScale;

        // Cubic Bezier easing function for smoother cinematic motion
        const easeInOutCubic = (t: number): number =>
          t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

        // Alternate zoom direction per shot for visual variety
        const zoomIn = !isSecondaryShot;
        let zoom: number;
        let panX: number;
        let panY: number;
        if (kenBurnsOverride) {
          const easedProgress = easeInOutCubic(progress);
          zoom = kenBurnsOverride.zoomStart + easedProgress * (kenBurnsOverride.zoomEnd - kenBurnsOverride.zoomStart);
          panX = Math.sin(easedProgress * Math.PI) * kenBurnsOverride.panDirectionX * panAmplitudeX;
          panY = Math.cos(easedProgress * Math.PI) * kenBurnsOverride.panDirectionY * panAmplitudeY;
        } else {
          // Zoom in OR zoom out depending on shot index — cinematic variety with Bezier easing
          const easedProgress = easeInOutCubic(progress);
          zoom = zoomIn
            ? 1.0 + easedProgress * (isSecondaryShot ? 0.45 : 0.40)
            : 1.0 + (1 - easedProgress) * (isSecondaryShot ? 0.45 : 0.40);
          panX = Math.sin(easedProgress * Math.PI * (isSecondaryShot ? 1.1 : 0.7)) * panAmplitudeX;
          panY = Math.cos(easedProgress * Math.PI * (isSecondaryShot ? 0.6 : 0.4)) * panAmplitudeY;
        }

        // ── Requirement 5.1–5.7: Chart reveal — left-to-right progressive clip ──
        const isChart = CHART_KEYWORDS.some(kw =>
          (asset.concept ?? '').toLowerCase().includes(kw.toLowerCase()) ||
          (asset.alt ?? '').toLowerCase().includes(kw.toLowerCase())
        );

        if (isChart) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, 0, w * progress, h);
          ctx.clip();
        }

        ctx.save();
        ctx.translate(w / 2 + panX, h / 2 + panY);
        ctx.scale(zoom, zoom);

        // ── Requirement 3.1–3.6, 8.1: Adaptive colour grading ──
        const DEFAULT_FILTER = 'saturate(1.18) contrast(1.10) brightness(1.02)';
        let filterString = DEFAULT_FILTER;
        if (asset) {
          let score: number;
          if (saturationCache.has(asset.url)) {
            score = saturationCache.get(asset.url)!;
          } else {
            try {
              const tmpCanvas = document.createElement('canvas');
              tmpCanvas.width = imgW;
              tmpCanvas.height = imgH;
              const tmpCtx = tmpCanvas.getContext('2d');
              if (!tmpCtx) throw new Error('No 2D context on temp canvas');
              tmpCtx.drawImage(img, 0, 0, imgW, imgH);
              const imageData = tmpCtx.getImageData(0, 0, imgW, imgH);
              score = computeSaturationScore(imageData.data, imgW, imgH);
            } catch {
              // Requirement 3.6: fall back to score 0.5 (maps to default filter)
              score = 0.5;
            }
            saturationCache.set(asset.url, score);
          }
          filterString = computeAdaptiveFilter(score);

          // Segment-type colour grading overrides
          const baseSaturate = 1.18;
          const baseContrast = 1.10;
          const baseBrightness = 1.02;
          let sat = baseSaturate;
          let ctr = baseContrast;
          let bri = baseBrightness;
          let hueRotate = 0;

          switch (seg.type) {
            case 'intro':
              // Cooler temperature for urgency
              hueRotate = -8;
              sat = baseSaturate + 0.05;
              bri = baseBrightness - 0.01;
              break;
            case 'section':
              // Neutral/warm for trust
              hueRotate = 5;
              sat = baseSaturate + 0.08;
              bri = baseBrightness + 0.02;
              break;
            case 'transition':
              // Tension: desaturate + increase contrast for drama
              sat = baseSaturate - 0.20;
              ctr = baseContrast + 0.15;
              bri = baseBrightness - 0.02;
              break;
            default:
              break;
          }

          // Detect stat segments: narration has numbers
          if (/\$[\d,.]+|\d+%|\d+\s*(billion|million|trillion)/i.test(seg.narration)) {
            // Boost vibrancy for data impact
            sat = baseSaturate + 0.15;
            ctr = baseContrast + 0.05;
            bri = baseBrightness + 0.03;
            hueRotate = 0;
          }

          filterString = `saturate(${sat}) contrast(${ctr}) brightness(${bri}) hue-rotate(${hueRotate}deg)`;
        }

        ctx.filter = filterString;
        // Task 17.1: Apply crop metadata when available
        if (asset?.cropMetadata) {
          const crop = asset.cropMetadata;
          ctx.drawImage(img, crop.x, crop.y, crop.width, crop.height, -dw / 2, -dh / 2, dw, dh);
        } else {
          ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
        }
        ctx.filter = 'none';
        ctx.restore();

        if (isChart) {
          ctx.restore();
        }
        } // end else (non-video Ken Burns path)
      }
    }
  }

  // ── Segment title card (Requirements 12.1–12.5) ──
  const accentColors: Record<string, string> = { intro: '#e74c3c', section: '#3498db', transition: '#f39c12', outro: '#2ecc71' };
  const accentColor = accentColors[seg.type] || '#9b59b6';

  const noSafeImage = !asset || !cache[asset.url] || !(cache[asset.url] as RenderableImage).safeForCanvas;
  if (noSafeImage) {
    const barH_tc = Math.round(h * 0.04);
    const availH = h - 2 * barH_tc;
    const centreY = barH_tc + availH / 2;

    const statMatch = seg.narration.match(/\d+/);
    const statNumber = statMatch ? statMatch[0] : null;

    const titleCardY = statNumber ? h * 0.60 : centreY;
    const statCardY = h * 0.30;

    if (statNumber) {
      ctx.save();
      ctx.font = 'bold 96px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
      ctx.shadowBlur = 20;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 2;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(statNumber, w / 2, statCardY);

      const narrationWords = seg.narration.split(' ');
      const matchIndex = narrationWords.findIndex(word => /\d+/.test(word));
      const labelStart = Math.max(0, matchIndex - 2);
      const labelEnd = Math.min(narrationWords.length, matchIndex + 3);
      const label = narrationWords.slice(labelStart, labelEnd).join(' ');

      ctx.font = '24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText(label, w / 2, statCardY + 60);
      ctx.restore();
    }

    ctx.save();
    ctx.font = 'bold 72px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = '#ffffff';

    const titleMaxW = w - 120;
    const titleMeasure = ctx.measureText(seg.title);
    if (titleMeasure.width > titleMaxW) {
      const titleWords = seg.title.split(' ');
      const lines: string[] = [];
      let currentLine = '';
      for (const word of titleWords) {
        const test = currentLine ? `${currentLine} ${word}` : word;
        if (ctx.measureText(test).width > titleMaxW && currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = test;
        }
      }
      if (currentLine) lines.push(currentLine);
      const lineH = 84;
      const totalTextH = lines.length * lineH;
      const startY = titleCardY - totalTextH / 2 + lineH / 2;
      lines.forEach((line, idx) => {
        ctx.fillText(line, w / 2, startY + idx * lineH);
      });
    } else {
      ctx.fillText(seg.title, w / 2, titleCardY);
    }
    ctx.restore();

    const underlineW = w * 0.6;
    const underlineX = (w - underlineW) / 2;
    const underlineY = titleCardY + 50;
    ctx.fillStyle = accentColor;
    ctx.fillRect(underlineX, underlineY, underlineW, 4);
  }

  // ── Cinematic letterbox bars ──
  const barH = Math.round(h * 0.04);
  const accentHex = accentColors[seg.type] || '#ffffff';
  // Black bars
  ctx.fillStyle = 'rgba(0, 0, 0, 0.92)';
  ctx.fillRect(0, 0, w, barH);
  ctx.fillRect(0, h - barH, w, barH);
  // Subtle accent inner edge glow
  ctx.fillStyle = hexToRgba(accentHex, 0.5);
  ctx.fillRect(0, barH - 2, w, 2);
  ctx.fillRect(0, h - barH, w, 2);

  // ── Vignette overlay ──
  const vigGrad = ctx.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, w * 0.8);
  vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
  vigGrad.addColorStop(0.6, 'rgba(0,0,0,0.0)');
  vigGrad.addColorStop(0.85, 'rgba(0,0,0,0.15)');
  vigGrad.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = vigGrad;
  ctx.fillRect(0, 0, w, h);

  // ── Film grain overlay (animated per-frame for organic look) ──
  const grainIntensity = 0.03;
  const grainStep = isRendering ? 6 : 8;
  const grainSeed = Math.random() * 1000;
  for (let gy = 0; gy < h; gy += grainStep) {
    for (let gx = 0; gx < w; gx += grainStep) {
      const noise = (Math.sin(gx * 12.9898 + gy * 78.233 + grainSeed) * 43758.5453) % 1;
      const absNoise = Math.abs(noise - 0.5) * grainIntensity;
      ctx.fillStyle = noise > 0.5 ? `rgba(255,255,255,${absNoise})` : `rgba(0,0,0,${absNoise})`;
      ctx.fillRect(gx, gy, grainStep, grainStep);
    }
  }

  // ── Film scratch effect (organic vertical white lines) ──
  const scratchCount = 1 + Math.floor(Math.random() * 2); // 1-2 scratches per frame
  for (let s = 0; s < scratchCount; s++) {
    const scratchX = Math.random() * w;
    const scratchAlpha = 0.03 + Math.random() * 0.05; // 0.03-0.08 opacity
    const scratchH = h * (0.3 + Math.random() * 0.4); // 30-70% of height
    const scratchY = Math.random() * (h - scratchH);
    ctx.fillStyle = `rgba(255, 255, 255, ${scratchAlpha})`;
    ctx.fillRect(Math.floor(scratchX), Math.floor(scratchY), 1, Math.floor(scratchH));
  }

  // ── Requirement 4.1–4.5: Technical label badge ──
  drawTechnicalLabel(ctx, asset, barH, w);

  // ── P0: Bold lower-third — animated accent bar + dual-line title ──
  const ltPadX = 56;
  const ltPadW = w - ltPadX * 2;
  const ltBaseY = h - barH - 140;

  // Animated accent bar (grows from left)
  const accentBarW = Math.min(Math.round(progress * 120 + 40), 160);
  ctx.fillStyle = accentColor;
  ctx.fillRect(ltPadX, ltBaseY, accentBarW, 5);

  // Title text — bold, large, with hard drop shadow (not just blur)
  ctx.save();
  ctx.font = 'bold 42px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  // Hard offset shadow for depth
  ctx.fillStyle = 'rgba(0,0,0,0.85)';
  ctx.fillText(seg.title.substring(0, 50), ltPadX + 3, ltBaseY + 14);
  // White text on top
  ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = '#ffffff';
  wrapText(ctx, seg.title, ltPadX, ltBaseY + 12, ltPadW, 50, true);
  ctx.restore();

  // ── P0: MrBeast-style captions — large, outlined, active word highlighted ──
  const words = seg.narration.split(' ').filter(w => w.length > 0);

  if (words.length > 0) {
    // Show 4-6 words at a time, centered on current spoken word
    const activeWordIdx = Math.max(0, Math.min(Math.floor(progress * words.length), words.length - 1));
    const windowSize = 7;
    const halfW = Math.floor(windowSize / 2);
    const start = Math.max(0, Math.min(activeWordIdx - halfW, words.length - windowSize));
    const end = Math.min(words.length, start + windowSize);
    const visibleWords = words.slice(start, end);
    const activeInWindow = activeWordIdx - start;

    const capFontSize = Math.round(h * 0.058); // ~56px at 1080p, scales with resolution
    const capFont = `900 ${capFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.font = capFont;

    // Calculate total width to center the group
    const wordWidths = visibleWords.map(word => ctx.measureText(word).width);
    const wordGap = Math.round(capFontSize * 0.3);
    const totalW = wordWidths.reduce((a, b) => a + b, 0) + wordGap * (visibleWords.length - 1);
    let wordX = (w - totalW) / 2;
    const capCenterY = h - barH - Math.round(h * 0.09); // 9% from bottom bar

    visibleWords.forEach((word, idx) => {
      const ww = wordWidths[idx];
      const isActive = idx === activeInWindow;

      ctx.save();
      ctx.font = capFont;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';

      // Black stroke outline (MrBeast style) — cap stroke width to prevent excessive outline on long words
      const strokeWidth = Math.min(Math.round(capFontSize * 0.14), 12);
      ctx.lineWidth = strokeWidth;
      ctx.strokeStyle = 'rgba(0,0,0,0.95)';
      ctx.lineJoin = 'round';
      ctx.miterLimit = 2;
      ctx.strokeText(word, wordX, capCenterY);

      // Fill: highlight active word in accent color, others white
      if (isActive) {
        ctx.fillStyle = accentColor === '#e74c3c' ? '#FFD700' : accentColor; // yellow for red themes
      } else {
        ctx.fillStyle = '#ffffff';
      }
      ctx.fillText(word, wordX, capCenterY);
      ctx.restore();

      wordX += ww + wordGap;
    });
  }

  // ── Subtle progress indicator ──
  const progBarH = 2;
  // Fade out during last 10% of segment
  const fadeProgress = Math.max(0, Math.min(1, (1 - progress) / 0.1));
  const barAlpha = fadeProgress;
  // Background track
  ctx.fillStyle = `rgba(255, 255, 255, ${0.10 * barAlpha})`;
  ctx.fillRect(0, h - progBarH, w, progBarH);
  // Progress fill with glow effect
  ctx.save();
  ctx.shadowColor = accentColor;
  ctx.shadowBlur = 8;
  ctx.fillStyle = accentColor;
  ctx.globalAlpha = barAlpha;
  ctx.fillRect(0, h - progBarH, w * progress, progBarH);
  ctx.restore();
}
