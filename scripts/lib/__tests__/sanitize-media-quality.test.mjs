import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  assessImageBufferQuality,
  computeStillSharpnessMetrics,
  decorateStillWithQuality,
  stillQualityTimelinePenalty,
} from '../sanitize-media-quality.mjs';

function checkerRaw(width, height, block = 12) {
  const data = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const on = (Math.floor(x / block) + Math.floor(y / block)) % 2 === 0;
      const value = on ? 235 : 25;
      const i = (y * width + x) * 3;
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
    }
  }
  return data;
}

async function checkerJpeg(width = 1280, height = 720, block = 12) {
  return sharp(checkerRaw(width, height, block), {
    raw: { width, height, channels: 3 },
  })
    .jpeg({ quality: 92 })
    .toBuffer();
}

describe('sanitize-media-quality still gates', () => {
  it('keeps a crisp, adequately sized still', async () => {
    const image = await checkerJpeg();
    const verdict = await assessImageBufferQuality(image);

    expect(verdict.action).toBe('keep');
    expect(verdict.width).toBe(1280);
    expect(verdict.height).toBe(720);
    expect(verdict.laplacianVariance).toBeGreaterThan(100);
  });

  it('rejects tiny thumbnails before assembly', async () => {
    const image = await checkerJpeg(300, 170, 8);
    const verdict = await assessImageBufferQuality(image);

    expect(verdict.action).toBe('reject');
    expect(verdict.reason).toMatch(/low-resolution/i);
  });

  it('demotes marginal-resolution stills that may be needed as scarcity fallback', async () => {
    const image = await checkerJpeg(640, 360, 8);
    const verdict = await assessImageBufferQuality(image);
    const decorated = decorateStillWithQuality({ id: 'a', type: 'image', url: 'https://example.com/a.jpg' }, verdict);

    expect(verdict.action).toBe('demote');
    expect(verdict.flags).toContain('low-resolution');
    expect(decorated.qualityDemoted).toBe(true);
    expect(stillQualityTimelinePenalty(decorated)).toBeLessThanOrEqual(-6);
  });

  it('rejects blank/flat stills', async () => {
    const image = await sharp({
      create: {
        width: 1280,
        height: 720,
        channels: 3,
        background: '#777777',
      },
    })
      .jpeg()
      .toBuffer();
    const verdict = await assessImageBufferQuality(image);

    expect(verdict.action).toBe('reject');
    expect(verdict.reason).toMatch(/flat|blank/i);
  });

  it('rejects severely blurred stills', async () => {
    const crisp = await checkerJpeg(1280, 720, 8);
    const blurred = await sharp(crisp).blur(20).jpeg({ quality: 92 }).toBuffer();
    const metrics = await computeStillSharpnessMetrics(blurred);
    const verdict = await assessImageBufferQuality(blurred);

    expect(metrics.laplacianVariance).toBeLessThan(8);
    expect(verdict.action).toBe('reject');
    expect(verdict.reason).toMatch(/blurry|flat|blank/i);
  });
});
