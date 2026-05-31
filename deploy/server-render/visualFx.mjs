/**
 * Visual Effects Module - .mjs wrapper
 * Provides cinematic effects for video rendering
 */

const STYLE_PARTICLES = {
  warfront: { type: 'sparks', count: 200, colors: ['#ff6b35', '#ff8c42', '#ffa600'] },
  cyber: { type: 'data_streams', count: 300, colors: ['#00ff41', '#00d9ff', '#00ffff'] },
  documentary: { type: 'embers', count: 150, colors: ['#ffd700', '#ffed4e', '#ff8c00'] },
  business_insider: { type: 'dust', count: 100, colors: ['#60a5fa', '#93c5fd', '#ffffff'] },
  explainer: { type: 'stars', count: 120, colors: ['#a78bfa', '#c4b5fd', '#ffffff'] },
};

const BRAND_CONFIG = {
  primaryColor: '#60a5fa',
  secondaryColor: '#3b82f6',
  tertiaryColor: '#8b5cf6',
  font: 'sans-serif',
  particleStyle: 'sparks',
};

const COLOR_TEMP_MAP = {
  risk: 'warm',
  prediction: 'cool',
  history: 'warm',
  transition: 'neutral',
  intro: 'neutral',
  outro: 'neutral',
  section: 'neutral',
};

const EFFECT_TYPES = ['sparks', 'data_streams', 'embers', 'dust', 'stars', 'motion_blur', 'chromatic'];

const GRAIN_FREQUENCIES = { r: 137, g: 173, b: 211 };

export function createStyleParticles(style, canvasW, canvasH) {
  const config = STYLE_PARTICLES[style] || STYLE_PARTICLES.documentary;
  const particles = [];
  
  for (let i = 0; i < config.count; i++) {
    particles.push({
      x: Math.random() * canvasW,
      y: Math.random() * canvasH,
      vx: (Math.random() - 0.5) * 0.5,
      vy: config.type === 'data_streams' ? Math.random() * 2 + 1 : -Math.random() * 1.5 - 0.5,
      size: Math.random() * 3 + 1,
      alpha: Math.random() * 0.08 + 0.02,
      color: config.colors[Math.floor(Math.random() * config.colors.length)],
      life: Math.random() * 100,
      maxLife: 100,
      rotation: Math.random() * Math.PI * 2,
    });
  }
  
  return { particles, type: config.type };
}

export function updateStyleParticles(particleSystem, canvasW, canvasH) {
  const { particles, type } = particleSystem;
  const now = Date.now();
  
  for (const p of particles) {
    if (type === 'embers') {
      p.vy += 0.01;
    }
    
    p.vx += Math.sin(now * 0.001 + p.x * 0.1) * 0.05;
    
    if (type === 'dust') {
      p.vx += 0.01;
    }
    
    p.x += p.vx;
    p.y += p.vy;
    p.life++;
    p.rotation += 0.02;
    
    if (p.life > p.maxLife || p.y < -10 || p.y > canvasH + 10 || p.x < -10 || p.x > canvasW + 10) {
      p.x = Math.random() * canvasW;
      p.y = type === 'data_streams' ? -10 : canvasH + 10;
      p.life = 0;
      p.alpha = Math.random() * 0.6 + 0.2;
    }
  }
}

export function drawStyleParticles(ctx, particleSystem) {
  const { particles, type } = particleSystem;
  
  ctx.save();
  
  particles.sort((a, b) => a.size - b.size);
  
  for (const p of particles) {
    const lifeRatio = p.life / p.maxLife;
    const alpha = p.alpha * (1 - lifeRatio);
    
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    
    if (type === 'sparks') {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      ctx.restore();
    } else if (type === 'data_streams') {
      ctx.fillRect(p.x, p.y, 1, p.size * 3);
    } else if (type === 'embers') {
      drawBokehHexagon(ctx, p.x, p.y, p.size * 2, p.color, alpha);
    } else if (type === 'stars') {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = alpha * 0.3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      drawBokehHexagon(ctx, p.x, p.y, p.size, p.color, alpha);
    }
  }
  
  ctx.restore();
}

export function drawDynamicVignette(ctx, w, h, pacingScore, progress) {
  const intensity = 0.0;
  if (intensity <= 0) return;
  const gradient = ctx.createRadialGradient(w / 2, h / 2, w * 0.5, w / 2, h / 2, w * 0.9);
  gradient.addColorStop(0, 'transparent');
  gradient.addColorStop(1, `rgba(0, 0, 0, ${intensity})`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
}

export function drawChromaticAberration(ctx, w, h, intensity) {
  if (intensity <= 0) return;
  
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;
  const sourceData = new Uint8ClampedArray(data);
  const offset = Math.round(intensity * 3);
  
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      
      const rIdx = (y * w + Math.max(0, x - offset)) * 4;
      const bIdx = (y * w + Math.min(w - 1, x + offset)) * 4;
      
      data[idx] = sourceData[rIdx];
      data[idx + 2] = sourceData[bIdx + 2];
    }
  }
  
  ctx.putImageData(imageData, 0, 0);
}

export function drawFlashFrame(ctx, w, h, flashType, intensity) {
  ctx.save();
  
  if (flashType === 'white') {
    ctx.globalAlpha = intensity * 0.6;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
  } else if (flashType === 'color') {
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = intensity * 0.5;
    ctx.fillStyle = '#ff6b35';
    ctx.fillRect(0, 0, w, h);
  }
  
  ctx.restore();
}

export function computeTensionZoom(segmentIndex, totalSegments, progress) {
  const segmentRatio = segmentIndex / totalSegments;
  const baseZoom = 1.0 + segmentRatio * 0.15;
  const progressZoom = progress * 0.1;
  return baseZoom + progressZoom;
}

export function drawKineticOverlay(ctx, text, x, y, progress, w, h) {
  if (progress < 0 || progress > 1) return;
  
  const scale = progress < 0.2 ? progress / 0.2 : 1;
  const alpha = progress > 0.8 ? (1 - progress) / 0.2 : 1;
  
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  
  ctx.font = 'bold 48px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 4;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  ctx.strokeText(text, 0, 0);
  ctx.fillText(text, 0, 0);
  
  ctx.restore();
}

export function applyMotionBlur(ctx, w, h, direction, intensity) {
  if (intensity <= 0) return;
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;
  const sourceData = new Uint8ClampedArray(data);
  const offset = Math.round(intensity * 8);
  const dirX = direction === 'left' ? -1 : direction === 'right' ? 1 : 0;
  const dirY = direction === 'up' ? -1 : direction === 'down' ? 1 : 0;
  
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      let sr = 0, sg = 0, sb = 0, count = 0;
      
      for (let s = 0; s <= offset; s++) {
        const sx = Math.round(x - dirX * s);
        const sy = Math.round(y - dirY * s);
        if (sx >= 0 && sx < w && sy >= 0 && sy < h) {
          const sIdx = (sy * w + sx) * 4;
          sr += sourceData[sIdx];
          sg += sourceData[sIdx + 1];
          sb += sourceData[sIdx + 2];
          count++;
        }
      }
      
      if (count > 0) {
        const blend = 1 - intensity * 0.5;
        data[idx] = Math.round(sourceData[idx] * blend + (sr / count) * (1 - blend));
        data[idx + 1] = Math.round(sourceData[idx + 1] * blend + (sg / count) * (1 - blend));
        data[idx + 2] = Math.round(sourceData[idx + 2] * blend + (sb / count) * (1 - blend));
      }
    }
  }
  
  ctx.putImageData(imageData, 0, 0);
}

export function applyColorGrade(ctx, w, h, grade) {
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;
  
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];
    
    if (grade === 'warm') {
      r = Math.min(255, r + 10);
      g = Math.min(255, g + 5);
      b = Math.max(0, b - 5);
    } else if (grade === 'cool') {
      b = Math.min(255, b + 10);
      r = Math.max(0, r - 5);
      g = Math.max(0, g - 5);
    } else if (grade === 'cinematic') {
      const luminance = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
      if (luminance < 0.5) {
        r = Math.round(r * 0.8 + 20);
        g = Math.round(g * 0.9 + 30);
        b = Math.round(b * 1.1 + 10);
      } else {
        r = Math.min(255, Math.round(r * 1.1 + 20));
        g = Math.min(255, Math.round(g * 1.05));
        b = Math.max(0, Math.round(b * 0.85));
      }
    } else if (grade === 'documentary') {
      const gray = r * 0.299 + g * 0.587 + b * 0.114;
      r = Math.round(r * 0.7 + gray * 0.3);
      g = Math.round(g * 0.7 + gray * 0.3);
      b = Math.round(b * 0.7 + gray * 0.3);
    }
    
    data[i] = Math.min(255, Math.max(0, r));
    data[i + 1] = Math.min(255, Math.max(0, g));
    data[i + 2] = Math.min(255, Math.max(0, b));
  }
  
  ctx.putImageData(imageData, 0, 0);
}

export function drawPerChannelGrain(ctx, w, h, intensity) {
  if (intensity <= 0) return;
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;
  
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const noiseR = (Math.sin(x * GRAIN_FREQUENCIES.r * 0.01 + y * 0.01) * 0.5 + 0.5) * 2 - 1;
      const noiseG = (Math.sin(x * GRAIN_FREQUENCIES.g * 0.01 + y * 0.01 + 1.23) * 0.5 + 0.5) * 2 - 1;
      const noiseB = (Math.sin(x * GRAIN_FREQUENCIES.b * 0.01 + y * 0.01 + 4.56) * 0.5 + 0.5) * 2 - 1;
      
      data[idx] = Math.min(255, Math.max(0, data[idx] + noiseR * intensity * 20));
      data[idx + 1] = Math.min(255, Math.max(0, data[idx + 1] + noiseG * intensity * 20));
      data[idx + 2] = Math.min(255, Math.max(0, data[idx + 2] + noiseB * intensity * 20));
    }
  }
  
  ctx.putImageData(imageData, 0, 0);
}

export function applyDepthOfField(ctx, w, h, focusY, blurRadius) {
  if (blurRadius <= 0) return;
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;
  const output = new Uint8ClampedArray(data.length);
  
  for (let y = 0; y < h; y++) {
    const distFromFocus = Math.abs(y - focusY);
    const blur = Math.min(1, distFromFocus / blurRadius) * 3;
    const radius = Math.round(blur);
    
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      let sr = 0, sg = 0, sb = 0, count = 0;
      
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
            const nIdx = (ny * w + nx) * 4;
            sr += data[nIdx];
            sg += data[nIdx + 1];
            sb += data[nIdx + 2];
            count++;
          }
        }
      }
      
      output[idx] = sr / count;
      output[idx + 1] = sg / count;
      output[idx + 2] = sb / count;
      output[idx + 3] = data[idx + 3];
    }
  }
  
  const outputImageData = new ImageData(output, w, h);
  ctx.putImageData(outputImageData, 0, 0);
}

export function drawBokehHexagon(ctx, x, y, size, color, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha * 0.7;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    const hx = x + Math.cos(angle) * size;
    const hy = y + Math.sin(angle) * size;
    if (i === 0) ctx.moveTo(hx, hy);
    else ctx.lineTo(hx, hy);
  }
  ctx.closePath();
  ctx.stroke();
  
  ctx.globalAlpha = alpha * 0.2;
  ctx.fillStyle = color;
  ctx.fill();
  
  ctx.globalAlpha = alpha * 0.5;
  ctx.beginPath();
  ctx.arc(x, y, size * 0.4, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  
  ctx.restore();
}

export function drawLensFlare(ctx, x, y, intensity, w, h) {
  if (intensity <= 0) return;
  ctx.save();
  
  const streakLength = w * 0.3 * intensity;
  const gradient = ctx.createLinearGradient(x - streakLength, y, x + streakLength, y);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
  gradient.addColorStop(0.4, `rgba(255, 255, 255, ${intensity * 0.3})`);
  gradient.addColorStop(0.5, `rgba(255, 255, 255, ${intensity * 0.6})`);
  gradient.addColorStop(0.6, `rgba(255, 255, 255, ${intensity * 0.3})`);
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  
  ctx.fillStyle = gradient;
  ctx.fillRect(x - streakLength, y - 2, streakLength * 2, 4);
  
  const glowGrad = ctx.createRadialGradient(x, y, 0, x, y, 30 * intensity);
  glowGrad.addColorStop(0, `rgba(255, 255, 255, ${intensity * 0.5})`);
  glowGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = glowGrad;
  ctx.beginPath();
  ctx.arc(x, y, 30 * intensity, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.restore();
}

export function applyAnamorphicEffect(ctx, w, h, intensity) {
  if (intensity <= 0) return;
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;
  const sourceData = new Uint8ClampedArray(data);
  
  const centerX = w / 2;
  const centerY = h / 2;
  const maxDist = Math.sqrt(centerX * centerX + centerY * centerY);
  
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x - centerX) / centerX;
      const dy = (y - centerY) / centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const distortion = 1 + dist * dist * intensity * 0.1;
      
      const srcX = Math.round(centerX + (x - centerX) * distortion);
      const srcY = Math.round(centerY + (y - centerY) * distortion);
      
      if (srcX >= 0 && srcX < w && srcY >= 0 && srcY < h) {
        const dstIdx = (y * w + x) * 4;
        const srcIdx = (srcY * w + srcX) * 4;
        data[dstIdx] = sourceData[srcIdx];
        data[dstIdx + 1] = sourceData[srcIdx + 1];
        data[dstIdx + 2] = sourceData[srcIdx + 2];
      }
    }
  }
  
  ctx.putImageData(imageData, 0, 0);
  
  ctx.save();
  ctx.globalAlpha = intensity * 0.15;
  const streakGrad = ctx.createLinearGradient(0, h * 0.48, 0, h * 0.52);
  streakGrad.addColorStop(0, 'rgba(100, 150, 255, 0)');
  streakGrad.addColorStop(0.5, 'rgba(100, 150, 255, 0.3)');
  streakGrad.addColorStop(1, 'rgba(100, 150, 255, 0)');
  ctx.fillStyle = streakGrad;
  ctx.fillRect(0, h * 0.48, w, h * 0.04);
  ctx.restore();
}

export function drawTypewriterText(ctx, text, x, y, progress, font, color) {
  ctx.save();
  ctx.font = font || 'bold 36px sans-serif';
  ctx.fillStyle = color || '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  
  const charCount = Math.floor(text.length * Math.min(1, progress * 1.2));
  const displayText = text.substring(0, charCount);
  
  ctx.fillText(displayText, x, y);
  
  if (progress < 1 && Math.floor(progress * 20) % 2 === 0) {
    const metrics = ctx.measureText(displayText);
    ctx.fillRect(x + metrics.width + 2, y, 2, 36);
  }
  
  ctx.restore();
}

export function drawSlamText(ctx, text, x, y, progress, font, color) {
  ctx.save();
  
  const scale = progress < 0.1 ? progress / 0.1 * 3 : progress < 0.2 ? 3 - (progress - 0.1) / 0.1 * 2 : 1;
  const alpha = progress > 0.8 ? (1 - progress) / 0.2 : 1;
  
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  
  ctx.font = font || 'bold 64px sans-serif';
  ctx.fillStyle = color || '#ffffff';
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 6;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  ctx.strokeText(text, 0, 0);
  ctx.fillText(text, 0, 0);
  
  ctx.restore();
}

export function drawFadeUpText(ctx, text, x, y, progress, font, color) {
  ctx.save();
  
  const alpha = Math.min(1, progress * 2);
  const offsetY = (1 - Math.min(1, progress * 2)) * 30;
  
  ctx.globalAlpha = alpha;
  ctx.font = font || 'bold 36px sans-serif';
  ctx.fillStyle = color || '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  ctx.fillText(text, x, y - offsetY);
  
  ctx.restore();
}

let lastEffectType = '';
let lastEffectTime = 0;

export function getRotatingEffect(currentTime) {
  if (currentTime - lastEffectTime > 30000 || lastEffectType === '') {
    const available = EFFECT_TYPES.filter(e => e !== lastEffectType);
    lastEffectType = available[Math.floor(Math.random() * available.length)];
    lastEffectTime = currentTime;
  }
  return lastEffectType;
}

export function drawBrandedIntro(ctx, w, h, channelName, progress) {
  if (progress >= 1) return;
  
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
  ctx.fillRect(0, 0, w, h);
  
  const alpha = progress < 0.2 ? progress / 0.2 : progress > 0.8 ? (1 - progress) / 0.2 : 1;
  ctx.globalAlpha = alpha;
  
  const particleCount = Math.floor(progress * 30);
  for (let i = 0; i < particleCount; i++) {
    const angle = (i / 30) * Math.PI * 2;
    const radius = 50 + progress * 200;
    const px = w / 2 + Math.cos(angle) * radius;
    const py = h / 2 + Math.sin(angle) * radius;
    ctx.globalAlpha = alpha * (1 - progress * 0.5);
    ctx.fillStyle = BRAND_CONFIG.primaryColor;
    ctx.beginPath();
    ctx.arc(px, py, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  
  ctx.globalAlpha = alpha;
  ctx.font = `bold 48px ${BRAND_CONFIG.font}`;
  ctx.fillStyle = BRAND_CONFIG.primaryColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(channelName || 'AutoTube', w / 2, h / 2);
  
  ctx.restore();
}

export function drawBrandedOutro(ctx, w, h, channelName, progress) {
  ctx.save();
  
  ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
  ctx.fillRect(0, 0, w, h);
  
  const alpha = Math.min(1, progress * 2);
  ctx.globalAlpha = alpha;
  
  ctx.font = `bold 42px ${BRAND_CONFIG.font}`;
  ctx.fillStyle = BRAND_CONFIG.primaryColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(channelName || 'AutoTube', w / 2, h * 0.35);
  
  ctx.font = `24px ${BRAND_CONFIG.font}`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText('Thanks for watching', w / 2, h * 0.48);
  
  const ctaY = h * 0.6;
  const ctaW = 260;
  const ctaH = 50;
  const ctaX = w / 2 - ctaW / 2;
  
  ctx.fillStyle = BRAND_CONFIG.secondaryColor;
  ctx.beginPath();
  ctx.moveTo(ctaX + 10, ctaY);
  ctx.lineTo(ctaX + ctaW - 10, ctaY);
  ctx.arcTo(ctaX + ctaW, ctaY, ctaX + ctaW, ctaY + 10, 10);
  ctx.lineTo(ctaX + ctaW, ctaY + ctaH - 10);
  ctx.arcTo(ctaX + ctaW, ctaY + ctaH, ctaX + ctaW - 10, ctaY + ctaH, 10);
  ctx.lineTo(ctaX + 10, ctaY + ctaH);
  ctx.arcTo(ctaX, ctaY + ctaH, ctaX, ctaY + ctaH - 10, 10);
  ctx.lineTo(ctaX, ctaY + 10);
  ctx.arcTo(ctaX, ctaY, ctaX + 10, ctaY, 10);
  ctx.closePath();
  ctx.fill();
  
  ctx.font = `bold 22px ${BRAND_CONFIG.font}`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText('SUBSCRIBE', w / 2, ctaY + ctaH / 2);
  
  ctx.restore();
}

export function drawPracticalLights(ctx, w, h, intensity) {
  if (intensity <= 0) return;
  ctx.save();
  
  const lights = [
    { x: w * 0.1, y: h * 0.2, color: 'rgba(255, 180, 100, 0.08)', radius: 80 },
    { x: w * 0.9, y: h * 0.3, color: 'rgba(100, 180, 255, 0.06)', radius: 100 },
    { x: w * 0.5, y: h * 0.8, color: 'rgba(200, 150, 255, 0.05)', radius: 70 },
    { x: w * 0.2, y: h * 0.7, color: 'rgba(255, 200, 100, 0.07)', radius: 60 },
    { x: w * 0.8, y: h * 0.1, color: 'rgba(100, 255, 200, 0.04)', radius: 90 },
  ];
  
  for (const light of lights) {
    ctx.globalAlpha = intensity;
    const grad = ctx.createRadialGradient(light.x, light.y, 0, light.x, light.y, light.radius);
    grad.addColorStop(0, light.color);
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(light.x, light.y, light.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  
  ctx.restore();
}

export function drawDepthLayers(ctx, w, h, progress, intensity) {
  if (intensity <= 0) return;
  ctx.save();
  
  const layers = [
    { y: h * 0.7, alpha: 0.15, count: 8, sizeMin: 2, sizeMax: 5 },
    { y: h * 0.5, alpha: 0.1, count: 12, sizeMin: 1, sizeMax: 3 },
    { y: h * 0.3, alpha: 0.05, count: 20, sizeMin: 0.5, sizeMax: 1.5 },
  ];
  
  for (const layer of layers) {
    ctx.globalAlpha = layer.alpha * intensity;
    for (let i = 0; i < layer.count; i++) {
      const x = (i / layer.count) * w + Math.sin(progress * Math.PI * 2 + i) * 20;
      const y = layer.y + Math.cos(progress * Math.PI + i * 0.5) * 10;
      const size = layer.sizeMin + Math.random() * (layer.sizeMax - layer.sizeMin);
      ctx.fillStyle = `rgba(255, 255, 255, ${layer.alpha})`;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  
  ctx.restore();
}

export function getColorTemperature(segType) {
  return COLOR_TEMP_MAP[segType] || 'neutral';
}
