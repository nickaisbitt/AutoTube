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
});
