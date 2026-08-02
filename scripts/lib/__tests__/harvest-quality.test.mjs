import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  airlineSoftPassMotionFailureReason,
  canonicalMediaKey,
  countAirlineStrongVideos,
  ensureTopicalVideoCoverage,
  evaluateHarvestVolumeWithSoftPass,
  filterAssetsByRelevance,
  hasAirlineAviationEvidence,
  isGenericStockJunk,
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

  it('rejects MSN blood-pressure health stills when cabin-pressure queries pull medical clickbait', () => {
    const msnHealth = [
      'New scan could help millions dealing with hidden causes of high blood ...',
      'https://www.msn.com/en-ca/health/other/new-scan-could-help-millions-dealing-with-hidden-causes-of-high-blood-pressure/ar-AA1RpcYS',
      'Hidden Pressure, Dangers',
    ].join(' ');
    expect(isGenericStockJunk(msnHealth, AIRLINE_TOPIC)).toBe(true);
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

describe('proxied download-clip web clips (Bing/Google/DuckDuckGo) count as aviation motion', () => {
  // Raw web harvest is the primary supply — no Pexels/Pixabay keys present.
  beforeEach(() => {
    vi.stubEnv('PEXELS_API_KEY', '');
    vi.stubEnv('VITE_PEXELS_KEY', '');
    vi.stubEnv('PIXABAY_API_KEY', '');
    vi.stubEnv('VITE_PIXABAY_KEY', '');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const DEV = 'http://localhost:5173';
  // Shape matches generate-full-video's fetchWebVideoResults + sanitize output:
  // proxied `/api/download-clip?url=<encoded target>&duration=10`, real page title
  // echoed into alt+title, plus the harvest query and the web-video source label.
  const webClip = ({ segmentId = 'intro', title, query, target, source = 'Bing web video' }) => ({
    type: 'video',
    segmentId,
    url: `${DEV}/api/download-clip?url=${encodeURIComponent(target)}&duration=10`,
    alt: title,
    title,
    query,
    source,
    sourceUrl: target,
  });

  it('classifies /api/download-clip Bing/Google/DDG clips as web-native motion', () => {
    for (const source of ['Bing web video', 'Google web video', 'DuckDuckGo web video']) {
      const clip = webClip({
        title: 'Inside the A380 cabin',
        query: 'cabin pressure aircraft',
        target: 'https://youtube.com/watch?v=a1',
        source,
      });
      expect(isWebNativeMotionSource(clip)).toBe(true);
    }
  });

  it('counts download-clip web clips as aviation-strong via everyday aviation vocab in title', () => {
    // Titles use plane/jet/airline/flight/Boeing/Airbus/turbulence/pressurization —
    // the words real web titles use, which the narrow strong-video regexes missed.
    const titles = [
      'Boeing 737 flight to London',
      'Airbus A320 emergency landing caught on camera',
      'Passengers panic as jet loses pressurization',
      'Severe turbulence on a regional airline',
      'How planes stay pressurized at altitude',
      'Inside the aircraft cabin',
    ];
    const clips = titles.map((title, i) => webClip({
      segmentId: `seg${i}`,
      title,
      query: 'regional airline incident',
      target: `https://youtube.com/watch?v=v${i}`,
      source: i % 2 ? 'Google web video' : 'Bing web video',
    }));
    expect(countAirlineStrongVideos(clips, AIRLINE_TOPIC)).toBe(clips.length);
  });

  it('counts a download-clip web clip whose aviation proof lives only in the query', () => {
    const queryOnly = webClip({
      title: 'clip 12345',
      query: 'airplane cockpit flight deck instruments',
      target: 'https://youtube.com/watch?v=q1',
      source: 'Google web video',
    });
    expect(countAirlineStrongVideos([queryOnly], AIRLINE_TOPIC)).toBe(1);
    expect(hasAirlineAviationEvidence(queryOnly)).toBe(true);
  });

  it('still refuses non-aviation and hard-junk download-clip web clips', () => {
    const catClip = webClip({
      title: 'Funny cat compilation',
      query: 'funny cats',
      target: 'https://youtube.com/watch?v=cat',
    });
    const militaryClip = webClip({
      title: 'F/A-18 fighter jet aircraft carrier landing',
      query: 'fighter jet carrier',
      target: 'https://youtube.com/watch?v=f18',
      source: 'Google web video',
    });
    expect(countAirlineStrongVideos([catClip, militaryClip], AIRLINE_TOPIC)).toBe(0);
  });

  it('never lets a stock clip certify aviation from the query (contrast to web-native)', () => {
    const stockQueryOnly = {
      type: 'video',
      segmentId: 'intro',
      url: 'https://videos.pexels.com/video-files/1/clip.mp4',
      source: 'Pexels Videos',
      alt: '',
      title: '',
      query: 'airplane cockpit flight deck instruments',
    };
    expect(countAirlineStrongVideos([stockQueryOnly], AIRLINE_TOPIC)).toBe(0);
    expect(hasAirlineAviationEvidence(stockQueryOnly)).toBe(false);
  });

  it('keeps download-clip aviation web clips through the relevance filter', () => {
    const titles = [
      'Boeing 737 flight to London',
      'Airbus A320 emergency landing',
      'jet loses pressurization mid-air',
      'regional airline turbulence',
    ];
    const segments = titles.map((_, i) => ({
      id: `seg${i}`,
      title: `Segment ${i}`,
      narration: 'Passengers noticed a problem after takeoff.',
    }));
    const media = titles.map((title, i) => webClip({
      segmentId: `seg${i}`,
      title,
      query: 'regional airline cabin pressure',
      target: `https://youtube.com/watch?v=r${i}`,
    }));
    const project = { topic: AIRLINE_TOPIC, title: 'Hidden Failures', script: segments, media };
    const { media: kept, dropped } = filterAssetsByRelevance(media, project);
    expect(kept.length).toBe(media.length);
    expect(dropped).toEqual([]);
  });

  it('canonicalMediaKey keeps distinct proxied targets distinct (no /api/download-clip collapse)', () => {
    const a = `${DEV}/api/download-clip?url=${encodeURIComponent('https://youtube.com/watch?v=aaa')}&duration=10`;
    const b = `${DEV}/api/download-clip?url=${encodeURIComponent('https://youtube.com/watch?v=bbb')}&duration=10`;
    expect(canonicalMediaKey(a)).not.toBe(canonicalMediaKey(b));
    // The naive query-stripping key would have collapsed both to `/api/download-clip`.
    expect(canonicalMediaKey(a)).not.toBe(`${DEV}/api/download-clip`);
    // Non-proxied URLs still key by their query-stripped path.
    expect(canonicalMediaKey('https://archive.org/download/x/x.mp4?a=1')).toBe(
      'https://archive.org/download/x/x.mp4',
    );
  });

  it('soft-passes an airline pool of ≥6 distinct download-clip web videos (no strong-floor/thin fail)', () => {
    const segments = Array.from({ length: 6 }, (_, i) => ({
      id: `seg${i}`,
      title: `Segment ${i}`,
      narration: 'Passengers noticed a problem after takeoff.',
    }));
    const SOURCES = ['Bing web video', 'Google web video', 'DuckDuckGo web video'];
    const TITLES = [
      'Boeing 737 flight',
      'Airbus A320 emergency landing',
      'jet loses pressurization',
      'regional airline turbulence',
      'planes pressurized at altitude',
      'inside the aircraft cabin',
    ];
    const media = [];
    let idx = 0;
    for (const seg of segments) {
      for (let k = 0; k < 2; k += 1) {
        media.push(webClip({
          segmentId: seg.id,
          title: TITLES[idx % TITLES.length],
          query: 'regional airline cabin pressure incident',
          target: `https://youtube.com/watch?v=v${idx}`,
          source: SOURCES[idx % SOURCES.length],
        }));
        idx += 1;
      }
    }
    const project = { topic: AIRLINE_TOPIC, title: 'Hidden Failures', script: segments, media };
    // The dedicated airline gate no longer trips the aviation-strong floor.
    expect(airlineSoftPassMotionFailureReason(project, {})).toBeNull();

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
    expect(result.reason).not.toMatch(/aviation-strong-floor|thin/);
  });
});
