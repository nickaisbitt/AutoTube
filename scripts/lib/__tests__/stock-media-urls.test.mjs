import { describe, expect, it } from 'vitest';
import {
  isJunkDemoVideoUrl,
  isJunkWebVolumeStillUrl,
} from '../stock-media-urls.mjs';

// ---------------------------------------------------------------------------
// isJunkDemoVideoUrl
// ---------------------------------------------------------------------------

describe('isJunkDemoVideoUrl', () => {
  describe('allows legitimate yt-dlp resolved CDNs', () => {
    it('allows googlevideo.com/videoplayback URLs', () => {
      expect(isJunkDemoVideoUrl(
        'https://rr1---sn-abc123.googlevideo.com/videoplayback?expire=123&id=abc',
      )).toBe(false);
    });

    it('allows various googlevideo.com/videoplayback routes', () => {
      expect(isJunkDemoVideoUrl(
        'https://r3---sn-xyz.googlevideo.com/videoplayback?itag=22&source=youtube',
      )).toBe(false);
    });
  });

  describe('still blocks demo/sample/filler video hosts', () => {
    it('blocks samplelib.com', () => {
      expect(isJunkDemoVideoUrl('https://download.samplelib.com/mp4/sample-5s.mp4')).toBe(true);
    });

    it('blocks filesamples.com', () => {
      expect(isJunkDemoVideoUrl('https://filesamples.com/samples/video/mp4/sample_640x360.mp4')).toBe(true);
    });

    it('blocks w3schools.com', () => {
      expect(isJunkDemoVideoUrl('https://www.w3schools.com/html/mov_bbb.mp4')).toBe(true);
    });

    it('blocks commondatastorage googleapis gtv-videos', () => {
      expect(isJunkDemoVideoUrl(
        'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
      )).toBe(true);
    });

    it('blocks media.w3.org sample clips', () => {
      expect(isJunkDemoVideoUrl('https://media.w3.org/2010/05/sintel/trailer.mp4')).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// isJunkWebVolumeStillUrl
// ---------------------------------------------------------------------------

describe('isJunkWebVolumeStillUrl', () => {
  describe('allows legitimate yt-dlp resolved CDNs', () => {
    it('allows dailymotion.com URLs', () => {
      expect(isJunkWebVolumeStillUrl('https://www.dailymotion.com/video/x7abc12')).toBe(false);
    });

    it('allows dmcdn.net (Dailymotion CDN) URLs', () => {
      expect(isJunkWebVolumeStillUrl('https://s2.dmcdn.net/v/abc123/x720')).toBe(false);
    });

    it('allows static.dmcdn.net thumbnail URLs', () => {
      expect(isJunkWebVolumeStillUrl('https://static.dmcdn.net/thumbnail/abc.jpg')).toBe(false);
    });
  });

  describe('still blocks known junk still hosts', () => {
    it('blocks pinterest.com', () => {
      expect(isJunkWebVolumeStillUrl('https://www.pinterest.com/pin/123/')).toBe(true);
    });

    it('blocks pinimg.com (Pinterest CDN)', () => {
      expect(isJunkWebVolumeStillUrl('https://i.pinimg.com/originals/abc.jpg')).toBe(true);
    });

    it('blocks discogs', () => {
      expect(isJunkWebVolumeStillUrl('https://www.discogs.com/artist/123')).toBe(true);
    });

    it('blocks wallpapers.com', () => {
      expect(isJunkWebVolumeStillUrl('https://wallpapers.com/images/hd/photo.jpg')).toBe(true);
    });
  });
});
