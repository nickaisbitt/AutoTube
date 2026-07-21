import { describe, expect, it } from 'vitest';
import {
  isUnsafeMediaUrl,
  isJunkWebVolumeStillUrl,
} from '../../../scripts/lib/stock-media-urls.mjs';
import { isVolumePaddingAsset } from '../../../scripts/lib/harvest-quality.mjs';

describe('unsafe media URL bans', () => {
  it('flags adult CDN hosts', () => {
    expect(isUnsafeMediaUrl('https://ei-ph.rdtcdn.com/videos/202401/09/x.jpg')).toBe(true);
    expect(isUnsafeMediaUrl('https://cdn.pornhub.com/thumb.jpg')).toBe(true);
    expect(isJunkWebVolumeStillUrl('https://ei-ph.rdtcdn.com/x.jpg')).toBe(true);
  });

  it('flags junk web volume still hosts', () => {
    expect(isJunkWebVolumeStillUrl('https://cdn.audleytravel.com/niagara-falls.jpg')).toBe(true);
    expect(isJunkWebVolumeStillUrl('https://i.pinimg.com/originals/ab/cd.jpg')).toBe(true);
    expect(isJunkWebVolumeStillUrl('https://www.purepeople.com/uploads/x.jpg')).toBe(true);
  });

  it('allows aviation stock hosts', () => {
    expect(isUnsafeMediaUrl('https://videos.pexels.com/video-files/123/cabin.mp4')).toBe(false);
    expect(isJunkWebVolumeStillUrl('https://cdn.pixabay.com/video/2023/08/20/plane.mp4')).toBe(false);
  });

  it('stripUnsafeMediaAssets drops NSFW and airline web volume stills', async () => {
    const { stripUnsafeMediaAssets } = await import('../../../scripts/lib/generate-full-video.mjs');
    const project = {
      topic: 'How a regional airline hid recurring cabin-pressure failures',
      media: [
        {
          id: 'a',
          type: 'image',
          url: 'https://ei-ph.rdtcdn.com/x.jpg',
          source: 'Search (volume top-up)',
        },
        {
          id: 'b',
          type: 'image',
          url: 'https://cdn.audleytravel.com/niagara.jpg',
          source: 'Bing (volume top-up)',
        },
        {
          id: 'c',
          type: 'video',
          url: 'https://videos.pexels.com/video-files/1/cabin.mp4',
          query: 'airplane cabin passengers daylight',
          source: 'Pexels Videos',
        },
      ],
    };
    const report = {};
    stripUnsafeMediaAssets(project, report);
    expect(project.media.map((m) => m.id)).toEqual(['c']);
    expect(report.unsafeMediaDropped?.length).toBe(2);
  });

  it('soft-pass accepts archive.org motion for airline without Pexels keys', async () => {
    const { evaluateHarvestVolumeWithSoftPass } = await import(
      '../../../scripts/lib/harvest-quality.mjs'
    );
    const segs = Array.from({ length: 6 }, (_, i) => ({
      id: `s${i}`,
      title: `Seg ${i}`,
      duration: 12,
    }));
    const videos = Array.from({ length: 12 }, (_, i) => ({
      id: `v${i}`,
      type: 'video',
      segmentId: segs[i % 6].id,
      url: `https://archive.org/download/x${i}/clip.mp4`,
      source: 'Archive.org live',
      query: 'airplane cabin passengers daylight',
      alt: 'airplane cabin',
    }));
    const project = {
      topic: 'How a regional airline hid recurring cabin-pressure failures',
      script: segs,
      media: videos,
    };
    const report = {
      volumePass: false,
      archiveLiveFetched: 12,
      videoTopUp: videos.slice(0, 6).map((v) => ({ url: v.url })),
      harvestQuality: {
        minPerSegment: 4,
        perSegment: Object.fromEntries(segs.map((s) => [s.id, { count: 2, videoCount: 2 }])),
      },
    };
    expect(evaluateHarvestVolumeWithSoftPass(report, project)).toEqual({
      pass: true,
      reason: 'soft-pass-motion-airline(12v/6segs)',
    });
  });

  it('injectCyberStockStills skips airline topics (ai must not match airline)', async () => {
    const { injectCyberStockStills } = await import('../../../scripts/lib/generate-full-video.mjs');
    const project = {
      topic: 'How a regional airline hid recurring cabin-pressure failures',
      script: [
        { id: 's0', type: 'intro', title: 'Hook' },
        { id: 's1', title: 'Body' },
      ],
      media: [
        {
          id: 'v1',
          type: 'video',
          segmentId: 's1',
          url: 'https://archive.org/download/x/clip.mp4',
          source: 'Archive.org live',
        },
      ],
    };
    const report = {};
    injectCyberStockStills(project, report, 0);
    expect(report.cyberStockSkipped).toBe('airline-motion-only');
    expect(project.media).toHaveLength(1);
  });
});
