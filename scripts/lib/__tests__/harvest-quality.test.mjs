import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  countAirlineStrongVideos,
  ensureTopicalVideoCoverage,
  evaluateHarvestVolumeWithSoftPass,
  isWebNativeMotionSource,
  keylessArchiveHumanPortraitScore,
  scoreAssetRelevance,
  VOLUME_PADDING_MIN_RELEVANCE,
} from '../harvest-quality.mjs';

const AIRLINE_TOPIC = 'Hidden cabin pressure failures at regional airlines';

describe('keyless archive human portrait topical boost', () => {
  const segment = {
    id: 'intro',
    title: 'The incident',
    narration: 'Passengers noticed something was wrong minutes after takeoff.',
  };

  const portraitArchive = {
    type: 'video',
    segmentId: 'intro',
    url: 'https://archive.org/download/reel_face/reel_face.mp4',
    source: 'Archive.org live',
    alt: '',
    query: 'worried passenger face close-up reaction',
  };

  const aviationArchive = {
    type: 'video',
    segmentId: 'intro',
    url: 'https://archive.org/download/cockpit_reel/cockpit_reel.mp4',
    source: 'Archive.org live',
    alt: 'pilot cockpit flight deck instruments',
    query: 'cockpit instruments',
  };

  it('floors keyless archive portrait/reaction clips above topical video minimum', () => {
    const score = keylessArchiveHumanPortraitScore(portraitArchive, segment, AIRLINE_TOPIC);
    expect(score).toBeGreaterThanOrEqual(VOLUME_PADDING_MIN_RELEVANCE);
    expect(scoreAssetRelevance(portraitArchive, segment, AIRLINE_TOPIC)).toBe(0);
  });

  it('does not boost non-archive portrait stock', () => {
    const pexelsPortrait = {
      ...portraitArchive,
      source: 'Pexels',
      url: 'https://videos.pexels.com/video-files/123/clip.mp4',
    };
    expect(keylessArchiveHumanPortraitScore(pexelsPortrait, segment, AIRLINE_TOPIC)).toBe(0);
  });

  it('still rejects archive junk even when the query asks for a face', () => {
    const hospitalJunk = {
      ...portraitArchive,
      query: 'hospital patient worried face close-up reaction',
      alt: 'hospital patient in bed worried face close-up',
    };
    expect(keylessArchiveHumanPortraitScore(hospitalJunk, segment, AIRLINE_TOPIC)).toBe(0);
  });

  it('keeps aviation archive evidence ahead of portrait-only archive clips on airline topics', () => {
    const aviationScore = scoreAssetRelevance(aviationArchive, segment, AIRLINE_TOPIC);
    const portraitScore = keylessArchiveHumanPortraitScore(portraitArchive, segment, AIRLINE_TOPIC);
    expect(aviationScore).toBeGreaterThan(portraitScore);
  });

  it('lets ensureTopicalVideoCoverage count portrait-only archive clips as topical video', () => {
    const project = {
      topic: AIRLINE_TOPIC,
      title: 'Hidden Failures',
      script: [segment],
      media: [portraitArchive],
    };
    const coverage = ensureTopicalVideoCoverage(project);
    expect(coverage.missingBefore).toEqual([]);
    expect(coverage.missing).toEqual([]);
  });
});

describe('web-native motion is first-class live motion', () => {
  // Stock keys must be absent — raw web harvest is the primary supply, not Pexels/Pixabay.
  beforeEach(() => {
    vi.stubEnv('PEXELS_API_KEY', '');
    vi.stubEnv('VITE_PEXELS_KEY', '');
    vi.stubEnv('PIXABAY_API_KEY', '');
    vi.stubEnv('VITE_PIXABAY_KEY', '');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('classifies raw web harvest sources as web-native motion, stock APIs as not', () => {
    expect(isWebNativeMotionSource({ source: 'Vimeo', url: 'https://vimeo.com/1.mp4' })).toBe(true);
    expect(isWebNativeMotionSource({ source: 'Dailymotion', url: 'https://www.dailymotion.com/v/x.mp4' })).toBe(true);
    expect(isWebNativeMotionSource({ source: 'giphy', url: 'https://media.giphy.com/a.mp4' })).toBe(true);
    expect(isWebNativeMotionSource({ source: 'HybridScraper (Proxy)', url: 'https://x/y.mp4' })).toBe(true);
    expect(isWebNativeMotionSource({ source: 'Deep Harvest (news.example.com)', url: 'https://x/y.mp4' })).toBe(true);
    expect(isWebNativeMotionSource({ source: 'DuckDuckGo', url: 'https://x/y.mp4' })).toBe(true);
    expect(isWebNativeMotionSource({ source: 'Search', url: '/api/download-clip?url=https%3A%2F%2Fz%2Fc.mp4' })).toBe(true);
    expect(isWebNativeMotionSource({ source: 'Archive.org live', url: 'https://archive.org/download/x/x.mp4' })).toBe(true);
    // Optional stock filler is never counted as web-native motion.
    expect(isWebNativeMotionSource({ source: 'Pexels Videos', url: 'https://videos.pexels.com/1.mp4' })).toBe(false);
    expect(isWebNativeMotionSource({ source: 'Pixabay Videos', url: 'https://pixabay.com/v/1.mp4' })).toBe(false);
  });

  it('counts web clips as airline strong-video via title/alt/query (parallel to archive evidence)', () => {
    // Aviation proof lives only in the harvest query — allowed for web-native clips.
    const webQueryOnly = {
      type: 'video',
      segmentId: 'intro',
      url: 'https://vimeo.com/900001.mp4',
      source: 'Vimeo',
      alt: '',
      title: '',
      query: 'airplane cockpit flight deck instruments',
    };
    expect(countAirlineStrongVideos([webQueryOnly], AIRLINE_TOPIC)).toBe(1);

    // The same query echo on a stock clip proves nothing — stock stays visual-only.
    const stockQueryOnly = {
      ...webQueryOnly,
      source: 'Pexels Videos',
      url: 'https://videos.pexels.com/video-files/1/clip.mp4',
    };
    expect(countAirlineStrongVideos([stockQueryOnly], AIRLINE_TOPIC)).toBe(0);
  });

  const makeSegments = (n) =>
    Array.from({ length: n }, (_, i) => ({
      id: `seg${i}`,
      title: `Segment ${i}`,
      narration: 'Passengers noticed something was wrong minutes after takeoff.',
    }));

  it('soft-passes an airline pool built only from web-native motion (no Pexels/Pixabay)', () => {
    const segments = makeSegments(5);
    const WEB_SOURCES = ['Vimeo', 'Dailymotion', 'DuckDuckGo', 'HybridScraper (Proxy)', 'giphy'];
    const media = [];
    segments.forEach((seg, si) => {
      for (let k = 0; k < 2; k += 1) {
        const idx = si * 2 + k;
        media.push({
          type: 'video',
          segmentId: seg.id,
          url: `https://vimeo.com/${9000 + idx}.mp4`,
          source: WEB_SOURCES[idx % WEB_SOURCES.length],
          alt: 'airplane cabin oxygen mask deployed after cabin pressure drop',
          query: 'regional airline cabin pressure incident',
        });
      }
    });
    const project = { topic: AIRLINE_TOPIC, title: 'Hidden Failures', script: segments, media };
    const mediaReport = {
      volumePass: false,
      cyberStockInjected: 0,
      pexelsFetched: 0,
      pixabayFetched: 0,
      archiveLiveFetched: 0,
      videoTopUp: [],
    };
    const result = evaluateHarvestVolumeWithSoftPass(mediaReport, project);
    expect(result.pass).toBe(true);
    expect(result.reason).toMatch(/^soft-pass-motion-airline\(/);
    expect(result.reason).not.toMatch(/no-live-motion/);
  });

  it('still fails an airline pool with no live motion source at all', () => {
    const segments = makeSegments(5);
    const media = [];
    segments.forEach((seg, si) => {
      for (let k = 0; k < 2; k += 1) {
        const idx = si * 2 + k;
        media.push({
          type: 'video',
          segmentId: seg.id,
          // Mixkit is neither web-native harvest nor Pexels/Pixabay stock nor archive.
          url: `https://assets.mixkit.co/videos/${5000 + idx}/clip.mp4`,
          source: 'Mixkit',
          alt: 'airplane cabin oxygen mask deployed after cabin pressure drop',
          query: 'regional airline cabin pressure incident',
        });
      }
    });
    const project = { topic: AIRLINE_TOPIC, title: 'Hidden Failures', script: segments, media };
    const mediaReport = {
      volumePass: false,
      cyberStockInjected: 0,
      pexelsFetched: 0,
      pixabayFetched: 0,
      archiveLiveFetched: 0,
      videoTopUp: [],
    };
    const result = evaluateHarvestVolumeWithSoftPass(mediaReport, project);
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/no-live-motion/);
  });

  it('soft-passes a generic web-video-rich pool via soft-pass-web-motion (no stock)', () => {
    const TOPIC = 'Coral reef bleaching crisis in Australia';
    const segments = makeSegments(5).map((s) => ({
      ...s,
      narration: 'Scientists documented coral reef bleaching across the reef.',
    }));
    const WEB_SOURCES = [
      { source: 'Vimeo', host: 'https://vimeo.com' },
      { source: 'Dailymotion', host: 'https://www.dailymotion.com/v' },
      { source: 'giphy', host: 'https://media.giphy.com' },
      { source: 'Deep Harvest (ocean.example.com)', host: 'https://cdn.example.com' },
    ];
    // 16 unique topical web videos, ≥2 per segment (distribution 4,3,3,3,3).
    const perSeg = [4, 3, 3, 3, 3];
    const media = [];
    let idx = 0;
    segments.forEach((seg, si) => {
      for (let k = 0; k < perSeg[si]; k += 1) {
        const src = WEB_SOURCES[idx % WEB_SOURCES.length];
        media.push({
          type: 'video',
          segmentId: seg.id,
          url: `${src.host}/${7000 + idx}.mp4`,
          source: src.source,
          alt: 'coral reef underwater bleaching footage on the great barrier reef',
          query: 'coral reef bleaching footage',
        });
        idx += 1;
      }
    });
    expect(media.length).toBe(16);
    const project = { topic: TOPIC, title: 'Reef Crisis', script: segments, media };
    const mediaReport = {
      volumePass: false,
      cyberStockInjected: 0,
      pexelsFetched: 0,
      pixabayFetched: 0,
      archiveLiveFetched: 0,
      videoTopUp: [],
    };
    const result = evaluateHarvestVolumeWithSoftPass(mediaReport, project);
    expect(result.pass).toBe(true);
    expect(result.reason).toMatch(/^soft-pass-web-motion\(/);
  });
});
