export type ParticleStyle = 'sparks' | 'data_streams' | 'embers' | 'snow' | 'dust' | 'stars';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  color: string;
  life: number;
  maxLife: number;
  rotation: number;
}

function rand(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function createSpark(canvasW: number, canvasH: number): Particle {
  return {
    x: rand(0, canvasW),
    y: rand(canvasH * 0.5, canvasH),
    vx: rand(-30, 30),
    vy: rand(-200, -80),
    size: rand(1, 3),
    alpha: rand(0.7, 1.0),
    color: pickRandom(['#ff6600', '#ff9900', '#ffcc00', '#ff4400']),
    life: rand(0.3, 1.0),
    maxLife: rand(0.3, 1.0),
    rotation: rand(0, Math.PI * 2),
  };
}

function createDataStream(canvasW: number, canvasH: number): Particle {
  return {
    x: rand(0, canvasW),
    y: rand(-canvasH * 0.3, 0),
    vx: rand(-5, 5),
    vy: rand(80, 200),
    size: rand(2, 5),
    alpha: rand(0.5, 0.9),
    color: pickRandom(['#00ff41', '#00cc33', '#00ffcc', '#33ff99']),
    life: rand(1.5, 3.0),
    maxLife: rand(1.5, 3.0),
    rotation: 0,
  };
}

function createEmber(canvasW: number, canvasH: number): Particle {
  return {
    x: rand(0, canvasW),
    y: rand(canvasH * 0.6, canvasH),
    vx: rand(-10, 10),
    vy: rand(-40, -15),
    size: rand(2, 6),
    alpha: rand(0.4, 0.8),
    color: pickRandom(['#ffaa00', '#cc8800', '#ffcc44', '#dd9900']),
    life: rand(3.0, 6.0),
    maxLife: rand(3.0, 6.0),
    rotation: rand(0, Math.PI * 2),
  };
}

function createSnow(canvasW: number, _canvasH: number): Particle {
  return {
    x: rand(0, canvasW),
    y: rand(-50, 0),
    vx: rand(-15, 15),
    vy: rand(20, 60),
    size: rand(1, 5),
    alpha: rand(0.4, 0.9),
    color: '#ffffff',
    life: rand(4.0, 8.0),
    maxLife: rand(4.0, 8.0),
    rotation: rand(0, Math.PI * 2),
  };
}

function createDust(canvasW: number, canvasH: number): Particle {
  return {
    x: rand(0, canvasW),
    y: rand(0, canvasH),
    vx: rand(-8, 8),
    vy: rand(-3, 3),
    size: rand(0.5, 2),
    alpha: rand(0.15, 0.4),
    color: pickRandom(['#c4a882', '#b89968', '#d4b896', '#a08060']),
    life: rand(8.0, 15.0),
    maxLife: rand(8.0, 15.0),
    rotation: 0,
  };
}

function createStar(canvasW: number, canvasH: number): Particle {
  return {
    x: rand(0, canvasW),
    y: rand(0, canvasH),
    vx: 0,
    vy: 0,
    size: rand(1, 4),
    alpha: rand(0.3, 1.0),
    color: pickRandom(['#ffffff', '#cceeff', '#aaddff', '#eeeeff']),
    life: 999999,
    maxLife: 999999,
    rotation: rand(0, Math.PI * 2),
  };
}

export function createParticles(
  style: ParticleStyle,
  count: number,
  canvasW: number,
  canvasH: number,
): Particle[] {
  if (count <= 0 || canvasW <= 0 || canvasH <= 0) return [];

  const particles: Particle[] = [];
  const creator = {
    sparks: createSpark,
    data_streams: createDataStream,
    embers: createEmber,
    snow: createSnow,
    dust: createDust,
    stars: createStar,
  }[style];

  for (let i = 0; i < count; i++) {
    particles.push(creator(canvasW, canvasH));
  }
  return particles;
}

export function updateParticles(
  particles: Particle[],
  dt: number,
  canvasW: number,
  canvasH: number,
): Particle[] {
  if (dt <= 0 || canvasW <= 0 || canvasH <= 0) return particles;

  const alive: Particle[] = [];

  for (const p of particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;

    if (p.life <= 0) continue;

    if (p.x < -50) p.x = canvasW + 50;
    else if (p.x > canvasW + 50) p.x = -50;

    if (p.y < -50) p.y = canvasH + 50;
    else if (p.y > canvasH + 50) p.y = -50;

    const lifeRatio = p.life / p.maxLife;
    p.alpha = lifeRatio < 0.3 ? lifeRatio / 0.3 * p.alpha : p.alpha;

    alive.push(p);
  }

  return alive;
}

function drawSparksParticle(ctx: CanvasRenderingContext2D, p: Particle): void {
  ctx.save();
  ctx.globalAlpha = p.alpha;
  ctx.shadowColor = p.color;
  ctx.shadowBlur = 6;
  ctx.fillStyle = p.color;
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rotation);
  ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 2);
  ctx.restore();
}

function drawDataStreamParticle(ctx: CanvasRenderingContext2D, p: Particle): void {
  ctx.save();
  ctx.globalAlpha = p.alpha;
  const trailLength = p.size * 8;
  const gradient = ctx.createLinearGradient(p.x, p.y - trailLength, p.x, p.y);
  gradient.addColorStop(0, 'rgba(0,0,0,0)');
  gradient.addColorStop(1, p.color);
  ctx.strokeStyle = gradient;
  ctx.lineWidth = p.size * 0.5;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y - trailLength);
  ctx.lineTo(p.x, p.y);
  ctx.stroke();
  ctx.restore();
}

function drawEmberParticle(ctx: CanvasRenderingContext2D, p: Particle): void {
  ctx.save();
  ctx.globalAlpha = p.alpha;
  const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 2);
  gradient.addColorStop(0, p.color);
  gradient.addColorStop(0.4, p.color);
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.size * 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawSnowParticle(ctx: CanvasRenderingContext2D, p: Particle): void {
  ctx.save();
  ctx.globalAlpha = p.alpha;
  ctx.shadowColor = '#ffffff';
  ctx.shadowBlur = 3;
  ctx.fillStyle = p.color;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawDustParticle(ctx: CanvasRenderingContext2D, p: Particle): void {
  ctx.save();
  ctx.globalAlpha = p.alpha;
  ctx.fillStyle = p.color;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawStarParticle(ctx: CanvasRenderingContext2D, p: Particle, time: number): void {
  ctx.save();
  const twinkle = 0.5 + 0.5 * Math.sin(time * 3 + p.rotation * 10);
  ctx.globalAlpha = p.alpha * twinkle;
  ctx.fillStyle = p.color;
  ctx.shadowColor = p.color;
  ctx.shadowBlur = p.size * 3;
  ctx.translate(p.x, p.y);

  const outerR = p.size;
  const innerR = p.size * 0.3;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4;
    const r = i % 2 === 0 ? outerR : innerR;
    const sx = Math.cos(angle) * r;
    const sy = Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function drawParticles(
  ctx: CanvasRenderingContext2D,
  particles: Particle[],
  style: ParticleStyle,
): void {
  if (particles.length === 0) return;

  const time = Date.now() / 1000;

  for (const p of particles) {
    switch (style) {
      case 'sparks':
        drawSparksParticle(ctx, p);
        break;
      case 'data_streams':
        drawDataStreamParticle(ctx, p);
        break;
      case 'embers':
        drawEmberParticle(ctx, p);
        break;
      case 'snow':
        drawSnowParticle(ctx, p);
        break;
      case 'dust':
        drawDustParticle(ctx, p);
        break;
      case 'stars':
        drawStarParticle(ctx, p, time);
        break;
    }
  }
}

export function getStyleForVideo(videoStyle: string): ParticleStyle {
  const map: Record<string, ParticleStyle> = {
    warfront: 'sparks',
    cyber: 'data_streams',
    tech: 'data_streams',
    documentary: 'embers',
    historical: 'embers',
    winter: 'snow',
    holiday: 'snow',
    nature: 'dust',
    travel: 'dust',
    space: 'stars',
    sci_fi: 'stars',
  };
  return map[videoStyle] ?? 'dust';
}
