import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  assessImageBufferQuality,
  assessStillMetadataQuality,
  computeStillSharpnessMetrics,
  decorateStillWithQuality,
  isAnimeFictionSource,
  isQueryEchoAlt,
  queryEchoOverlapRatio,
  stillQualityTimelinePenalty,
  topicAllowsAnimeFiction,
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


const BEEKEEPERS_TOPIC = 'Why Victorian beekeepers feared the silent hive';

describe('query-echo still metadata gates', () => {
  it('detects volume-pad alts that are just segment title + topic', () => {
    const alt = 'The Silence That Meant Death Why Victorian beekeepers feared the silent hive';
    const query = 'The Silence That Meant Death Why Victorian beekeepers feared the silent hive news photo';
    expect(isQueryEchoAlt(alt, {
      query,
      topic: BEEKEEPERS_TOPIC,
      segmentTitle: 'The Silence That Meant Death',
    })).toBe(true);
    expect(queryEchoOverlapRatio(alt, [query, BEEKEEPERS_TOPIC])).toBeGreaterThanOrEqual(0.75);
  });

  it('detects deep-harvest alts that exactly echo the search query', () => {
    const echoed = 'Varroa Line in the Sand Why Victorian beekeepers feared the silent hive';
    expect(isQueryEchoAlt(echoed, { query: echoed, topic: BEEKEEPERS_TOPIC })).toBe(true);
  });

  it('keeps independent visual alts that mention the topic lightly', () => {
    const alt = 'Beekeeper inspects wooden hive frames covered in Varroa mites close-up';
    expect(isQueryEchoAlt(alt, {
      query: 'Varroa Line in the Sand Why Victorian beekeepers feared the silent hive',
      topic: BEEKEEPERS_TOPIC,
    })).toBe(false);
  });

  it('rejects empty or near-empty alts as query-echo placeholders', () => {
    expect(isQueryEchoAlt('', { query: 'bees', topic: BEEKEEPERS_TOPIC })).toBe(true);
    expect(isQueryEchoAlt('the photo', { query: 'bees', topic: BEEKEEPERS_TOPIC })).toBe(true);
  });

  it('hard-rejects volume top-up stills with query-echo alts', () => {
    const verdict = assessStillMetadataQuality(
      {
        alt: `${BEEKEEPERS_TOPIC}`,
        query: `${BEEKEEPERS_TOPIC} photo`,
        source: 'Search (volume top-up)',
        url: 'https://example.com/yacht.jpg',
      },
      { topicBlob: BEEKEEPERS_TOPIC },
    );
    expect(verdict.action).toBe('reject');
    expect(verdict.flags).toContain('query-echo');
    expect(verdict.reason).toMatch(/query-echo/i);
  });

  it('demotes non-volume stills whose alt is mostly topic copy', () => {
    const verdict = assessStillMetadataQuality(
      {
        alt: BEEKEEPERS_TOPIC,
        query: BEEKEEPERS_TOPIC,
        source: 'Deep Harvest (www.discovermagazine.com)',
        url: 'https://cdn.discovermagazine.com/fallback.jpg',
      },
      { topicBlob: BEEKEEPERS_TOPIC },
    );
    expect(verdict.action).toBe('demote');
    expect(verdict.flags).toContain('query-echo');
  });

  it('rejects zerochan Silent Witch stills on non-anime documentary topics', () => {
    expect(isAnimeFictionSource({
      url: 'https://static.zerochan.net/Silent.Witch.full.4526069.jpg',
      source: 'DuckDuckGo · www.zerochan.net',
    })).toBe(true);
    expect(topicAllowsAnimeFiction(BEEKEEPERS_TOPIC)).toBe(false);
    const verdict = assessStillMetadataQuality(
      {
        alt: 'Silent Witch: Chinmoku no Majo no Kakushigoto (Secrets of the Silent ...',
        query: 'family crying distressed Why Victorian beekeepers feared the silent hive',
        source: 'DuckDuckGo · www.zerochan.net',
        url: 'https://static.zerochan.net/Silent.Witch.full.4526069.jpg',
      },
      { topicBlob: BEEKEEPERS_TOPIC },
    );
    expect(verdict.action).toBe('reject');
    expect(verdict.flags).toContain('anime-fiction-source');
  });

  it('allows anime hosts when the topic is explicitly anime', () => {
    expect(topicAllowsAnimeFiction('best silent witch anime openings')).toBe(true);
    const verdict = assessStillMetadataQuality(
      {
        alt: 'Silent Witch anime key visual',
        url: 'https://static.zerochan.net/Silent.Witch.full.1.jpg',
        source: 'zerochan',
      },
      { topicBlob: 'best silent witch anime openings' },
    );
    expect(verdict.action).not.toBe('reject');
  });

  it('applies a timeline penalty for query-echo demotions', () => {
    const decorated = decorateStillWithQuality(
      { id: 'a', type: 'image', url: 'https://example.com/a.jpg' },
      { action: 'demote', reason: 'query-echo', flags: ['query-echo'] },
    );
    expect(stillQualityTimelinePenalty(decorated)).toBeLessThanOrEqual(-8);
  });
});
