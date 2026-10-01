/**
 * Advanced Rendering Module - .mjs wrapper
 * Professional video composition and overlays
 *
 * Features:
 * - 10 transition types with cubic-bezier easing
 * - Animated bar chart reveals
 * - Kinetic text animations (bounce, elastic, slide-in)
 * - Enhanced lower thirds and name cards
 * - Parallax backgrounds with multi-speed scrolling
 * - Breathing room for low-pacing segments
 */

// ── Easing Functions ────────────────────────────────────────────────────────

export function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

export function easeOut(t) {
  return 1 - Math.pow(1 - t, 3);
}

export function easeInBounce(t) {
  const n1 = 7.5625;
  const d1 = 2.75;
  let t2 = t;
  if (t < 1 / d1) {
    return n1 * t2 * t2;
  } else if (t < 2 / d1) {
    t2 -= 1.5 / d1;
    return n1 * t2 * t2 + 0.75;
  } else if (t < 2.5 / d1) {
    t2 -= 2.25 / d1;
    return n1 * t2 * t2 + 0.9375;
  } else {
    t2 -= 2.625 / d1;
    return n1 * t2 * t2 + 0.984375;
  }
}

export function easeOutBounce(t) {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) {
    return n1 * t * t;
  } else if (t < 2 / d1) {
    t -= 1.5 / d1;
    return n1 * t * t + 0.75;
  } else if (t < 2.5 / d1) {
    t -= 2.25 / d1;
    return n1 * t * t + 0.9375;
  } else {
    t -= 2.625 / d1;
    return n1 * t * t + 0.984375;
  }
}

export function easeOutElastic(t) {
  if (t === 0 || t === 1) return t;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
}

export function applyBreathingRoom(intensity, pacingScore) {
  if (pacingScore <= 2) {
    return intensity * 0.5;
  }
  return intensity;
}

// ── Transition Types ────────────────────────────────────────────────────────

const TRANSITION_TYPES = [
  'crossfade', 'cut', 'dissolve', 'wipe_left', 'wipe_right',
  'wipe_up', 'slide_left', 'slide_right', 'zoom_in', 'zoom_out',
];

export function getAvailableTransitions() {
  return [...TRANSITION_TYPES];
}

export function drawTransition(ctx, type, fromRender, toRender, progress, w, h, options = {}) {
  const eased = easeInOut(Math.max(0, Math.min(1, progress)));

  switch (type) {
    case 'crossfade':
      drawCrossfadeTransition(ctx, fromRender, toRender, eased, w, h);
      break;
    case 'cut':
      drawCutTransition(ctx, fromRender, toRender, progress, w, h);
      break;
    case 'dissolve':
      drawDissolveTransition(ctx, fromRender, toRender, eased, w, h);
      break;
    case 'wipe_left':
      drawWipeLeftTransition(ctx, fromRender, toRender, eased, w, h);
      break;
    case 'wipe_right':
      drawWipeRightTransition(ctx, fromRender, toRender, eased, w, h);
      break;
    case 'wipe_up':
      drawWipeUpTransition(ctx, fromRender, toRender, eased, w, h);
      break;
    case 'slide_left':
      drawSlideLeftTransition(ctx, fromRender, toRender, eased, w, h);
      break;
    case 'slide_right':
      drawSlideRightTransition(ctx, fromRender, toRender, eased, w, h);
      break;
    case 'zoom_in':
      drawZoomInTransition(ctx, fromRender, toRender, eased, w, h);
      break;
    case 'zoom_out':
      drawZoomOutTransition(ctx, fromRender, toRender, eased, w, h);
      break;
    default:
      drawCrossfadeTransition(ctx, fromRender, toRender, eased, w, h);
      break;
  }
}

function drawCrossfadeTransition(ctx, fromRender, toRender, eased, w, h) {
  fromRender();
  ctx.save();
  ctx.globalAlpha = eased;
  toRender();
  ctx.restore();
}

function drawCutTransition(ctx, fromRender, toRender, progress, w, h) {
  if (progress < 0.5) {
    fromRender();
  } else {
    toRender();
  }
}

function drawDissolveTransition(ctx, fromRender, toRender, eased, w, h) {
  fromRender();
  const tempCanvas = createTempCanvas(w, h);
  const tempCtx = tempCanvas.getContext('2d');
  tempCtx.save();
  toRender(tempCtx);
  tempCtx.restore();
  ctx.save();
  ctx.globalAlpha = eased;
  ctx.filter = `blur(${(1 - eased) * 8}px)`;
  ctx.drawImage(tempCanvas, 0, 0, w, h);
  ctx.restore();
}

function drawWipeLeftTransition(ctx, fromRender, toRender, eased, w, h) {
  toRender();
  ctx.save();
  ctx.beginPath();
  ctx.rect(w * eased, 0, w * (1 - eased), h);
  ctx.clip();
  fromRender();
  ctx.restore();
}

function drawWipeRightTransition(ctx, fromRender, toRender, eased, w, h) {
  toRender();
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w * (1 - eased), h);
  ctx.clip();
  fromRender();
  ctx.restore();
}

function drawWipeUpTransition(ctx, fromRender, toRender, eased, w, h) {
  toRender();
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, h * eased, w, h * (1 - eased));
  ctx.clip();
  fromRender();
  ctx.restore();
}

function drawSlideLeftTransition(ctx, fromRender, toRender, eased, w, h) {
  const offset = -w * eased;
  ctx.save();
  ctx.translate(offset, 0);
  fromRender();
  ctx.restore();
  ctx.save();
  ctx.translate(w + offset, 0);
  toRender();
  ctx.restore();
}

function drawSlideRightTransition(ctx, fromRender, toRender, eased, w, h) {
  const offset = w * eased;
  ctx.save();
  ctx.translate(offset, 0);
  fromRender();
  ctx.restore();
  ctx.save();
  ctx.translate(-w + offset, 0);
  toRender();
  ctx.restore();
}

function drawZoomInTransition(ctx, fromRender, toRender, eased, w, h) {
  const scale = 1 + eased * 0.5;
  const alpha = 1 - eased;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(w / 2, h / 2);
  ctx.scale(scale, scale);
  ctx.translate(-w / 2, -h / 2);
  fromRender();
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = eased;
  toRender();
  ctx.restore();
}

function drawZoomOutTransition(ctx, fromRender, toRender, eased, w, h) {
  const fromScale = 1.5 - eased * 0.5;
  const fromAlpha = 1 - eased;

  ctx.save();
  ctx.globalAlpha = fromAlpha;
  ctx.translate(w / 2, h / 2);
  ctx.scale(fromScale, fromScale);
  ctx.translate(-w / 2, -h / 2);
  fromRender();
  ctx.restore();

  const toScale = 0.5 + eased * 0.5;
  ctx.save();
  ctx.globalAlpha = eased;
  ctx.translate(w / 2, h / 2);
  ctx.scale(toScale, toScale);
  ctx.translate(-w / 2, -h / 2);
  toRender();
  ctx.restore();
}

function createTempCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(w, h);
  }
  if (typeof globalThis !== 'undefined' && typeof globalThis.createCanvas === 'function') {
    const c = globalThis.createCanvas(w, h);
    return c;
  }
  const { createCanvas } = require('canvas');
  return createCanvas(w, h);
}

// ── Zoom Transition (standalone) ────────────────────────────────────────────

export function drawZoomTransition(ctx, fromRender, toRender, progress, w, h, options = {}) {
  const eased = easeInOut(progress);
  const { fromScale = 1.5, toScale = 0.5 } = options;

  const currentFromScale = fromScale - (fromScale - 1) * eased;
  const currentToScale = toScale + (1 - toScale) * eased;

  ctx.save();
  ctx.globalAlpha = 1 - eased;
  ctx.translate(w / 2, h / 2);
  ctx.scale(currentFromScale, currentFromScale);
  ctx.translate(-w / 2, -h / 2);
  fromRender();
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = eased;
  ctx.translate(w / 2, h / 2);
  ctx.scale(currentToScale, currentToScale);
  ctx.translate(-w / 2, -h / 2);
  toRender();
  ctx.restore();
}

// ── Animated Bar Chart ──────────────────────────────────────────────────────

export function drawAnimatedBarChart(ctx, data, progress, x, y, w, h, options = {}) {
  const {
    barColor = '#60a5fa',
    backgroundColor = 'rgba(0, 0, 0, 0.3)',
    labelColor = '#ffffff',
    accentColor = '#3b82f6',
    animationDuration = 0.8,
    barGap = 8,
    showLabels = true,
    showValues = true,
    cornerRadius = 4,
  } = options;

  if (!data || data.length === 0) return;

  const easedProgress = easeOut(Math.min(1, progress / animationDuration));
  const barCount = data.length;
  const totalGap = barGap * (barCount - 1);
  const barWidth = (w - totalGap) / barCount;
  const maxValue = Math.max(...data.map((d) => (typeof d === 'object' ? d.value : d)), 1);

  ctx.save();
  ctx.globalAlpha = Math.min(1, progress * 3);

  ctx.fillStyle = backgroundColor;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fill();

  data.forEach((item, i) => {
    const value = typeof item === 'object' ? item.value : item;
    const label = typeof item === 'object' ? item.label : String(i + 1);
    const normalizedHeight = (value / maxValue) * h * 0.75;
    const barH = normalizedHeight * easedProgress;
    const barX = x + i * (barWidth + barGap);
    const barY = y + h - barH;

    const grad = ctx.createLinearGradient(barX, barY, barX, y + h);
    grad.addColorStop(0, barColor);
    grad.addColorStop(1, accentColor);
    ctx.fillStyle = grad;

    ctx.beginPath();
    ctx.roundRect(barX, barY, barWidth, barH, [cornerRadius, cornerRadius, 0, 0]);
    ctx.fill();

    if (showValues) {
      ctx.fillStyle = labelColor;
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(String(value), barX + barWidth / 2, barY - 6);
    }

    if (showLabels) {
      ctx.fillStyle = labelColor;
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(label, barX + barWidth / 2, y + h + 6);
    }
  });

  ctx.restore();
}

// ── Kinetic Text Animations ─────────────────────────────────────────────────

export function drawBounceText(ctx, text, x, y, progress, options = {}) {
  const {
    font = 'bold 48px sans-serif',
    color = '#ffffff',
    strokeColor = '#000000',
    strokeWidth = 3,
    animationDuration = 0.6,
  } = options;

  const t = Math.min(1, progress / animationDuration);
  const bounceT = easeOutBounce(t);
  const alpha = t < 0.1 ? t / 0.1 : 1;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const offsetY = (1 - bounceT) * 60;

  if (strokeWidth > 0) {
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeWidth;
    ctx.strokeText(text, x, y - offsetY);
  }

  ctx.fillStyle = color;
  ctx.fillText(text, x, y - offsetY);
  ctx.restore();
}

export function drawElasticText(ctx, text, x, y, progress, options = {}) {
  const {
    font = 'bold 48px sans-serif',
    color = '#ffffff',
    strokeColor = '#000000',
    strokeWidth = 3,
    animationDuration = 0.8,
  } = options;

  const t = Math.min(1, progress / animationDuration);
  const elasticT = easeOutElastic(t);
  const alpha = t < 0.1 ? t / 0.1 : 1;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const scaleX = 0.5 + elasticT * 0.5;
  const scaleY = 0.5 + elasticT * 0.5;

  ctx.translate(x, y);
  ctx.scale(scaleX, scaleY);

  if (strokeWidth > 0) {
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeWidth;
    ctx.strokeText(text, 0, 0);
  }

  ctx.fillStyle = color;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

export function drawSlideInText(ctx, text, x, y, progress, options = {}) {
  const {
    font = 'bold 48px sans-serif',
    color = '#ffffff',
    strokeColor = '#000000',
    strokeWidth = 3,
    direction = 'left',
    animationDuration = 0.5,
  } = options;

  const t = Math.min(1, progress / animationDuration);
  const easedT = easeOut(t);
  const alpha = t < 0.2 ? t / 0.2 : 1;

  let offsetX = 0;
  let offsetY = 0;
  const distance = 300;

  switch (direction) {
    case 'left':
      offsetX = -distance + distance * easedT;
      break;
    case 'right':
      offsetX = distance - distance * easedT;
      break;
    case 'up':
      offsetY = -distance + distance * easedT;
      break;
    case 'down':
      offsetY = distance - distance * easedT;
      break;
  }

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (strokeWidth > 0) {
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeWidth;
    ctx.strokeText(text, x + offsetX, y + offsetY);
  }

  ctx.fillStyle = color;
  ctx.fillText(text, x + offsetX, y + offsetY);
  ctx.restore();
}

// ── Lower Third (enhanced with slide-in, accent bar extension, shadow) ──────

export function drawLowerThird(ctx, text, subtitle, progress, w, h, accentColor, options = {}) {
  if (progress < 0 || progress > 1) return;

  const {
    pacingScore = 3,
    shadowEnabled = true,
  } = options;

  const intensity = applyBreathingRoom(1, pacingScore);

  const slideIn = Math.min(1, progress / 0.15);
  const slideOut = progress > 0.85 ? (1 - progress) / 0.15 : 1;
  const alpha = slideIn * slideOut * intensity;

  const easedSlideIn = easeOut(Math.min(1, progress / 0.2));
  const barHeight = 80;
  const barY = h - barHeight - 40;
  const barX = -400 + easedSlideIn * 400;

  const accentBarMaxWidth = 400;
  const accentBarProgress = Math.min(1, Math.max(0, (progress - 0.1) / 0.3));
  const accentBarWidth = accentBarMaxWidth * easeOut(accentBarProgress);

  ctx.save();
  ctx.globalAlpha = alpha;

  if (shadowEnabled) {
    const shadowOffset = 4 * easedSlideIn;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.beginPath();
    ctx.roundRect(barX + shadowOffset, barY + shadowOffset, accentBarWidth, barHeight, 4);
    ctx.fill();
  }

  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.beginPath();
  ctx.roundRect(barX, barY, accentBarWidth, barHeight, 4);
  ctx.fill();

  const accentWidth = accentBarWidth * Math.min(1, easedSlideIn * 2);
  ctx.fillStyle = accentColor || '#60a5fa';
  ctx.fillRect(barX, barY, Math.max(4, accentWidth), barHeight);

  ctx.font = 'bold 28px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, barX + 20, barY + (subtitle ? 30 : 40));

  if (subtitle) {
    ctx.font = '20px sans-serif';
    ctx.fillStyle = '#cccccc';
    ctx.fillText(subtitle, barX + 20, barY + 55);
  }

  ctx.restore();
}

// ── Name Card (enhanced with fade-in, upward movement, accent bar, fade-out) ─

export function drawNameCard(ctx, name, title, progress, w, h, accentColor, options = {}) {
  if (progress < 0 || progress > 1) return;

  const {
    pacingScore = 3,
  } = options;

  const intensity = applyBreathingRoom(1, pacingScore);

  const easedFadeIn = easeOut(Math.min(1, progress / 0.15));
  const fadeOut = progress > 0.85 ? (1 - progress) / 0.15 : 1;
  const alpha = easedFadeIn * fadeOut * intensity;

  const cardW = 300;
  const cardH = 70;
  const x = 40;
  const targetY = h - cardH - 100;
  const offsetY = (1 - easedFadeIn) * 30;
  const y = targetY + offsetY;

  const accentBarProgress = Math.min(1, Math.max(0, (progress - 0.1) / 0.25));
  const accentBarWidth = cardW * easeOut(accentBarProgress);

  ctx.save();
  ctx.globalAlpha = alpha;

  ctx.fillStyle = 'rgba(20, 20, 30, 0.85)';
  ctx.beginPath();
  ctx.roundRect(x, y, cardW, cardH, 4);
  ctx.fill();

  ctx.fillStyle = accentColor || '#60a5fa';
  ctx.fillRect(x, y, Math.max(3, accentBarWidth), 3);

  ctx.font = 'bold 24px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, x + 15, y + (title ? 25 : 35));

  if (title) {
    ctx.font = '16px sans-serif';
    ctx.fillStyle = '#aaaaaa';
    ctx.fillText(title, x + 15, y + 48);
  }

  ctx.restore();
}

// ── Source Citation ─────────────────────────────────────────────────────────

export function drawSourceCitation(ctx, source, progress, w, h) {
  if (progress < 0 || progress > 1) return;

  const fadeIn = Math.min(1, progress / 0.1);
  const fadeOut = progress > 0.9 ? (1 - progress) / 0.1 : 1;
  const alpha = fadeIn * fadeOut;

  ctx.save();
  ctx.globalAlpha = alpha;

  const text = `Source: ${source}`;
  ctx.font = '14px sans-serif';
  const metrics = ctx.measureText(text);
  const padding = 10;
  const badgeW = metrics.width + padding * 2;
  const badgeH = 24;
  const x = w - badgeW - 20;
  const y = h - badgeH - 20;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(x, y, badgeW, badgeH);

  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + padding, y + badgeH / 2);

  ctx.restore();
}

// ── Progress Timeline ───────────────────────────────────────────────────────

export function drawProgressTimeline(ctx, segments, globalProgress, w, h, accentColor) {
  const barH = 6;
  const y = h - barH - 5;

  ctx.save();

  ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.fillRect(0, y, w, barH);

  const filledW = w * globalProgress;
  const gradient = ctx.createLinearGradient(0, y, filledW, y);
  gradient.addColorStop(0, accentColor || '#60a5fa');
  gradient.addColorStop(0.5, '#93c5fd');
  gradient.addColorStop(1, '#ffffff');
  ctx.fillStyle = gradient;

  ctx.shadowColor = accentColor || '#60a5fa';
  ctx.shadowBlur = 8;
  ctx.fillRect(0, y, filledW, barH);
  ctx.shadowBlur = 0;

  let currentTime = 0;
  const totalDuration = segments.reduce((sum, s) => sum + s.duration, 0);

  for (const seg of segments) {
    const segProgress = currentTime / totalDuration;
    const notchX = w * segProgress;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.fillRect(notchX, y - 2, 2, barH + 4);

    currentTime += seg.duration;
  }

  ctx.restore();
}

// ── Chart Reveal ────────────────────────────────────────────────────────────

export function drawChartReveal(ctx, image, progress, w, h) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w * progress, h);
  ctx.clip();
  if (image && typeof image === 'object' && image.src) {
    ctx.drawImage(image, 0, 0, w, h);
  } else if (typeof image === 'function') {
    image(ctx, 0, 0, w, h);
  } else {
    ctx.fillStyle = 'rgba(100, 100, 150, 0.3)';
    ctx.fillRect(0, 0, w * progress, h);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Chart', w / 2, h / 2);
  }
  ctx.restore();
}

// ── Parallax Background ─────────────────────────────────────────────────────

export function drawParallaxBackground(ctx, layers, progress, w, h) {
  if (!layers || layers.length === 0) return;

  ctx.save();

  layers.forEach((layer) => {
    const { color, speed = 1, yOffset = 0, pattern = 'gradient' } = layer;
    const scrollOffset = progress * speed * w * 0.3;

    if (pattern === 'gradient') {
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, color || '#1a1a2e');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0.5)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, yOffset, w, h);
    } else if (pattern === 'horizontal') {
      const grad = ctx.createLinearGradient(-scrollOffset, 0, w - scrollOffset, 0);
      grad.addColorStop(0, color || 'rgba(100, 100, 200, 0.1)');
      grad.addColorStop(0.5, 'rgba(200, 200, 255, 0.15)');
      grad.addColorStop(1, color || 'rgba(100, 100, 200, 0.1)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, yOffset, w, h);
    } else if (pattern === 'dots') {
      ctx.fillStyle = color || 'rgba(255, 255, 255, 0.05)';
      for (let dx = -scrollOffset % 40; dx < w + 40; dx += 40) {
        for (let dy = yOffset; dy < h + 40; dy += 40) {
          ctx.beginPath();
          ctx.arc(dx, dy, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (pattern === 'lines') {
      ctx.strokeStyle = color || 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      for (let dx = -scrollOffset % 60; dx < w + 60; dx += 60) {
        ctx.beginPath();
        ctx.moveTo(dx, yOffset);
        ctx.lineTo(dx, h);
        ctx.stroke();
      }
    }
  });

  ctx.restore();
}

// ── Text Helpers ────────────────────────────────────────────────────────────

export function extractNamesFromText(text) {
  const names = [];
  const patterns = [
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g,
  ];

  const stopPatterns = [
    /The Update Desk/i,
    /Wall Street/i,
    /Silicon Valley/i,
    /White House/i,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const name = match[1];
      if (!stopPatterns.some(sp => sp.test(name))) {
        names.push({ name, title: null });
      }
    }
  }

  return names.slice(0, 3);
}

export function extractCitationsFromSegments(segments) {
  const citations = [];

  for (let i = 0; i < segments.length; i++) {
    const text = segments[i].narration || '';
    const match = text.match(/according to ([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i);
    if (match) {
      citations.push({
        segmentIndex: i,
        source: match[1],
      });
    }
  }

  return citations;
}

export function selectTransitionForSegment(purposeTag, pacingScore) {
  if (purposeTag === 'stat_hook' || pacingScore >= 4) return 'zoom_in';
  if (purposeTag === 'risk' || purposeTag === 'prediction') return 'wipe_left';
  if (pacingScore <= 2) return 'crossfade';
  return 'cut';
}

// ── B-Roll Coverage Logging ─────────────────────────────────────────────────

export function logBRollCoverage(segments, brollMap) {
  let totalNarrationTime = 0;
  let brollNarrationTime = 0;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const duration = seg.duration || 0;
    totalNarrationTime += duration;

    if (brollMap && brollMap.has(i)) {
      brollNarrationTime += duration;
    }
  }

  const coverage = totalNarrationTime > 0
    ? ((brollNarrationTime / totalNarrationTime) * 100).toFixed(1)
    : '0.0';

  console.log(`  📹 B-Roll coverage: ${coverage}% (${brollNarrationTime.toFixed(1)}s / ${totalNarrationTime.toFixed(1)}s)`);
  return { coverage: parseFloat(coverage), brollTime: brollNarrationTime, totalTime: totalNarrationTime };
}

// ── Transition Beat Alignment ───────────────────────────────────────────────

export function snapTransitionToBeat(transitionTime, beats, toleranceMs = 100) {
  if (!beats || beats.length === 0) return transitionTime;

  const toleranceSec = toleranceMs / 1000;
  let closestBeat = null;
  let closestDist = Infinity;

  for (const beat of beats) {
    const dist = Math.abs(transitionTime - beat);
    if (dist < closestDist) {
      closestDist = dist;
      closestBeat = beat;
    }
  }

  if (closestBeat !== null && closestDist <= toleranceSec) {
    return closestBeat;
  }

  return transitionTime;
}
