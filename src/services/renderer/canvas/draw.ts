import type { ScriptSegment, MediaAsset, KenBurnsParams } from '../../../types';
import { computeSafeZone } from '../../renderingShared';
import { computeSaturationScore, computeAdaptiveFilter, CHART_KEYWORDS } from '../../captionUtils';
import { logger } from '../../logger';
import type { ImgCache, RenderableImage, RenderOptions } from '../orchestrator';
import { hexToRgba, roundRect, wrapText, drawTechnicalLabel } from './text';
import { SCENE_LAYOUT_DISPATCH } from './scenes';

// Requirement 8.1: Cache saturation scores keyed by image URL so the score is
// computed at most once per image per render session.
const MAX_SATURATION_CACHE_SIZE = 500;
export const saturationCache = new Map<string, number>();

// ── Procedural cinematic backgrounds ──
export function drawProceduralBackground(
  ctx: CanvasRenderingContext2D, w: number, h: number,
  seg: ScriptSegment, progress: number,
  isRendering?: boolean,
): void {
  // Topic-aware color palettes
  const palettes: Record<string, { bg: string[]; accent: string; glow: string; secondary: string }> = {
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
    ctx.fillStyle = palette.accent + '0' + Math.max(0, Math.floor(8 - layer * 2));
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

  // Enhanced particle system (100+ particles in preview; 30 during rendering for speed)
  const particleCount = isRendering ? 30 : 120;
  const sizeScale = isRendering ? 2 : 1;
  const alphaScale = isRendering ? 4 : 1;
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
        const scale = Math.max(w / imgW, h / imgH) * (isSecondaryShot ? 1.12 : 1.08);
        const dw = imgW * scale, dh = imgH * scale;

        let zoom: number;
        let panX: number;
        let panY: number;
        if (kenBurnsOverride) {
          zoom = kenBurnsOverride.zoomStart + progress * (kenBurnsOverride.zoomEnd - kenBurnsOverride.zoomStart);
          const panAmplitudeX = isSecondaryShot ? 18 : 12;
          const panAmplitudeY = isSecondaryShot ? 9 : 6;
          panX = Math.sin(progress * Math.PI) * kenBurnsOverride.panDirectionX * panAmplitudeX;
          panY = Math.cos(progress * Math.PI) * kenBurnsOverride.panDirectionY * panAmplitudeY;
        } else {
          zoom = 1 + progress * (isSecondaryShot ? 0.08 : 0.06);
          panX = Math.sin(progress * Math.PI * (isSecondaryShot ? 1.1 : 0.7)) * (isSecondaryShot ? 18 : 12);
          panY = Math.cos(progress * Math.PI * (isSecondaryShot ? 0.6 : 0.4)) * (isSecondaryShot ? 9 : 6);
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
        const DEFAULT_FILTER = 'saturate(1.12) contrast(1.08) brightness(0.94)';
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
            if (saturationCache.size >= MAX_SATURATION_CACHE_SIZE) {
              const oldestKey = saturationCache.keys().next().value;
              saturationCache.delete(oldestKey);
            }
            saturationCache.set(asset.url, score);
          }
          filterString = computeAdaptiveFilter(score);
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
  const letterboxColor = accentColors[seg.type]
    ? hexToRgba(accentColors[seg.type], 0.85)
    : 'rgba(0, 0, 0, 0.85)';
  ctx.fillStyle = letterboxColor;
  ctx.fillRect(0, 0, w, barH);
  ctx.fillRect(0, h - barH, w, barH);

  // ── Vignette overlay ──
  const vigGrad = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, w * 0.75);
  vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
  vigGrad.addColorStop(0.7, 'rgba(0,0,0,0.15)');
  vigGrad.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vigGrad;
  ctx.fillRect(0, 0, w, h);

  // ── Film grain overlay (sparse, performant) ──
  if (!isRendering) {
    const grainIntensity = 0.04;
    const grainStep = 8;
    for (let gy = 0; gy < h; gy += grainStep) {
      for (let gx = 0; gx < w; gx += grainStep) {
        const noise = (Math.random() - 0.5) * grainIntensity;
        ctx.fillStyle = `rgba(128,128,128,${Math.abs(noise)})`;
        ctx.fillRect(gx, gy, grainStep, grainStep);
      }
    }
  }

  // ── Requirement 4.1–4.5: Technical label badge ──
  drawTechnicalLabel(ctx, asset, barH, w);

  // ── Lower-third title ──
  const ltY = h - barH - 120;
  const ltPadX = 60;
  const ltPadW = w - ltPadX * 2;

  const lineW = 40 + progress * 60;
  ctx.fillStyle = accentColor;
  ctx.fillRect(ltPadX, ltY, Math.min(lineW, 100), 2);

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 36px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  wrapText(ctx, seg.title, ltPadX, ltY + 12, ltPadW, 44, true);
  ctx.restore();

  // ── Subtitle / caption (sliding window) ──
  const words = seg.narration.split(' ').filter(w => w.length > 0);

  if (words.length > 0) {
    const wordIndex = Math.max(0, Math.floor(progress * words.length) - 1);
    let start = Math.max(0, wordIndex - 6);
    let end = Math.min(words.length, start + 12);
    if (end - start < 12 && start > 0) {
      start = Math.max(0, end - 12);
    }
    const visibleWords = words.slice(start, end);
    const captionText = visibleWords.join(' ');

    const capY = h - barH - 60;
    let capBgH = 44;
    const capBgPad = 16;
    const capBgW = Math.min(w * 0.7, 700);
    const capBgX = (w - capBgW) / 2;
    const captionFont = '500 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

    ctx.font = captionFont;
    const textWidth = ctx.measureText(captionText).width;
    const needsTwoLines = textWidth > capBgW - 32;

    if (needsTwoLines) {
      capBgH += 24;
    }

    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    roundRect(ctx, capBgX, capY - capBgPad, capBgW, capBgH + capBgPad * 2, 8);
    ctx.fill();

    ctx.fillStyle = accentColor + '80';
    roundRect(ctx, capBgX, capY - capBgPad, capBgW, 2, 8);
    ctx.fill();

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#ffffff';
    ctx.font = captionFont;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (needsTwoLines) {
      const mid = Math.ceil(visibleWords.length / 2);
      const line1 = visibleWords.slice(0, mid).join(' ');
      const line2 = visibleWords.slice(mid).join(' ');
      ctx.fillText(line1, w / 2, capY + capBgH / 2 - 12);
      ctx.fillText(line2, w / 2, capY + capBgH / 2 + 12);
    } else {
      ctx.fillText(captionText, w / 2, capY + capBgH / 2);
    }

    ctx.restore();
  }

  // ── Subtle progress indicator ──
  const progBarH = 2;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.fillRect(0, h - progBarH, w, progBarH);
  ctx.fillStyle = accentColor;
  ctx.fillRect(0, h - progBarH, w * progress, progBarH);
}
