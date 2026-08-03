import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  airlineSoftPassMotionFailureReason,
  canonicalMediaKey,
  countAirlineStrongVideos,
  ensureTopicalVideoCoverage,
  evaluateHarvestVolumeWithSoftPass,
  filterAssetsByRelevance,
  hasAirlineAviationEvidence,
  hasHealthcareEvidence,
  hasHousingEvidence,
  countHealthcareStrongVideos,
  healthcareSoftPassMotionFailureReason,
  healthcareOffTopicBrollReason,
  housingOffTopicBrollReason,
  isGenericStockJunk,
  isWebNativeMotionSource,
  keylessArchiveHumanPortraitScore,
  scoreAssetRelevance,
  VOLUME_PADDING_MIN_RELEVANCE,
} from '../harvest-quality.mjs';

const AIRLINE_TOPIC = 'Hidden cabin pressure failures at regional airlines';
const HEALTHCARE_TOPIC = 'Why AI will change healthcare';
const HOUSING_TOPIC = 'The housing crash they said would never happen';

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

  it('rejects SlideShare / SaaS pitch decks scraped as airline B-roll', () => {
    expect(
      isGenericStockJunk(
        'Findability Sciences pitch deck image.slidesharecdn.com airline analytics',
        AIRLINE_TOPIC,
      ),
    ).toBe(true);
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

describe('housing off-topic B-roll rejects', () => {
  it('hard-rejects crash/fire/council/quake/chart/CAN-TV/house-on-rock junk', () => {
    const cases = [
      'dashcam car crash footage highway pile-up',
      'traffic accident scene daylight news',
      'wildfire smoke aerial fire footage',
      'thirteen people displace by apartment fire san diego',
      'airstrike levelled an apartment building in gaza strip',
      'vietnam war home movie of subic bay philippines',
      'county building commission hearing june 2026',
      'plan commission meeting april 22 2026 approvals for housing solar',
      'Plane crashes into roof of Texas home',
      'fire department ladder truck house roof response',
      'city council meeting apartments approved',
      'earthquake quake damage newsreel',
      'pie chart poll graphic lendingtree infographic',
      'CAN TV station id bumper',
      '3d house on a rock neohomeloans illustration',
      'queen elizabeth ii memorial portrait',
      // housing-web18: script-query pollution + wrong Archive slices
      'Why October is Filled with Ticking Time Bombs for Streaming Fans',
      'Corporate Technical Risk. The Ticking Time Bomb dynamite',
      'a ceiling on your home 1946 rent price controls propaganda film periscopefilm bird nest',
      'leapfrog letter factory part 4 480p kids alphabet',
      'our miss brooks the cafeteria strike mister conklins love nest',
      'Maps and Diagrams of the Camp Mystic Grounds Guadalupe River texas flooding',
      'Harnessing Perversity: J.G. Ballard, David Cronenberg, and Crash',
      'David Crosby: Remember My Name',
      'literacy adam finds an apartment leapfrog',
      'THE ROLFE REPORT WITH JOHN ROLFE thumbnail',
      'i got a strike again bowling',
      // housing-web18 body pads that still survived inject
      'the progress center from affordable housing to self sufficiency',
      'sixth annual fair housing conference april 20 2026',
      'county announces completion of 2 year apartment building inspection initiative',
      'Jerome Fletcher Assistant Chief Administrative Officer montgomery',
      // housing-web19
      'RE/MAX FOR SALE sign Kathy Bost suburban house yard sign',
      'touring a 27 3 million apartment in nyc s one57',
      'negative space based on a 150 word poem by ron koertge animated film',
      'The Michael Jackson Interview: The Footage You Were Never Meant to See',
      'Massie End the Fed fox news still',
      'August 6 2007 American Home Mortgage mousetrap house illustration',
      'golden valley approves 2 new apartment complexes',
      'WHAT HAPPENS WHEN THE CREDIT HIT MARKET CRASHES crater graphic',
      'overview of the virginia residential landlord tenant act and eviction laws',
      'lawyers committee for better housing tenant advocacy during covid 19',
      '1300-square-foot living room business insider luxury tour',
      'world s most sustainable high rise apartment building',
      'may day caravan to cancel rent mortgage livestream archive',
      'understanding all the eviction ban nonsense constitutional shredding',
      '2 alarm fire destroys apartment building in houston',
      // web19 contact-sheet / required rejects
      'realtor sign for sale suburban house exterior',
      'real estate sign yard listing open house',
      // web21 volume-fail junk that still polluted the motion pool
      'We asked Trump voters at a Pennsylvania rally what would happen',
      'Meet the Garcias: Homestead Rescue',
      'Colorado Experience:The Smaldones, Family of Crime',
      'One Family Fight Struggle Street Episode',
      // web22 opener/body junk
      'CBS 6 PROBLEM SOLVERS HE IS KIND OF A GHOST gaming chair',
      'odsp tenant warn bill 60 will push more disable residents',
      '2011 moldova construction project presentation',
      'Big satisfed in Real Estate Redfin predictions 2026',
      'soviet flag hammer and sickle sunflower collage',
      // web23 bathroom / clickbait / ARM pollution
      'dirty bathroom bucket floor drain moldy tiles',
      'CRASH IS HERE yellow turban talking head dollar bills',
      'Cummins ISC ISL 8.9L Diesel Engine Rocker arm Housing',
      'Zillow chart graph housing crash',
      '60 Overthinking Quotes To Break Free From The Mental Trap',
      // web24 script-title pollution → car crash / choir / BronxNet
      'Man killed after Volkswagen overturns in severe crash with Tesla, Tampa police',
      'KATHERINE JENKINS SINGS WITH THE MORMON TABERNACLE CHOIR',
      'the bronx social justice and anti violence forums housing justice for all',
      'Marco Rubio:We are not members of the ICC',
      'Auto Insurance Rates Just Dropped Sarah Jenkins',
      // web25 music/disaster pollution despite face queries
      'New Kids On The Block - Crash (Official Lyric Video)',
      'new jersey apartment complex explosion',
      'FEMA fraud and scam awareness',
      'Community recovery after disaster',
      'News motion footage',
      'LendingTree bar chart housing crash infographic',
      'American Home Mortgage bankruptcy slide graphic',
      'youtuber headset talking head podcast mic subscribe button',
      'gaming headset streamer setup talking to camera',
      // web20 Archive clips fetched under defunct "rent strike" query
      'parkdale vs the ltb',
      'first het eten dan de huur nl subs dutch subtitles',
      'ontario landlord tenant board hearing order',
      'ltb application review rent tribunal housing tribunal hearing',
      'general rent strike against landlord rent increase',
      // web20 price-chart stills laundered through Archive query
      'median home price chart 2024 housing market',
      'housing price chart year over year graphic',
    ];
    for (const alt of cases) {
      expect(housingOffTopicBrollReason(alt, HOUSING_TOPIC)).toMatch(/housing off-topic/);
      expect(isGenericStockJunk(alt, HOUSING_TOPIC)).toBe(true);
    }
  });

  it('does not reject lived-in apartment B-roll or bare market-crash wording', () => {
    expect(
      housingOffTopicBrollReason('worried couple reading eviction notice apartment', HOUSING_TOPIC),
    ).toBe('');
    expect(
      housingOffTopicBrollReason('housing market crash documentary apartment tenants', HOUSING_TOPIC),
    ).toBe('');
    expect(housingOffTopicBrollReason('car crash dashcam footage', AIRLINE_TOPIC)).toBe('');
    // Archive apartment body volume must stay (not headset/luxury junk).
    expect(
      housingOffTopicBrollReason(
        'tenant left in limbo after landlord was evicted from rental home apartment hallway',
        HOUSING_TOPIC,
      ),
    ).toBe('');
    // Housing court/tribunal that is about housing outcomes stays (not a board hearing).
    expect(
      housingOffTopicBrollReason('eviction court ruling family apartment news footage', HOUSING_TOPIC),
    ).toBe('');
  });
});

describe('healthcare off-topic B-roll rejects', () => {
  it('hard-rejects Huxley/Orwell/FEMA/insect/peas/painting/literary-fest junk', () => {
    const cases = [
      'aldous huxley brave new world conspiracy documentary EXPOSED',
      'george orwell 1984 dystopian truth exposed title card',
      'FEMA fraud and scam awareness',
      'Hurricane Laura FEMA assistance PSA',
      'Tornado anniversary coverage storm recovery',
      'Community recovery after disaster',
      'cockroach insect close up crawling',
      'green peas meme viral clip',
      'classical oil painting renaissance portrait museum',
      'brattleboro literary festival two sides of friendship',
      'c 19 propaganda war ade sleepy joe antibody dependent enhancement',
    ];
    for (const alt of cases) {
      expect(healthcareOffTopicBrollReason(alt, HEALTHCARE_TOPIC)).toMatch(/healthcare off-topic/);
      expect(isGenericStockJunk(alt, HEALTHCARE_TOPIC)).toBe(true);
    }
  });

  it('keeps clinical/AI/hospital/doctor/patient/lab motion', () => {
    const keep = [
      'doctor reviewing patient chart hospital corridor',
      'AI radiology diagnosis laptop clinician',
      'nurse workstation hospital ward patients',
      'clinical laboratory microscope blood analysis',
      'mri scan medical imaging hospital',
      'preemie ward neonatal intensive care',
    ];
    for (const alt of keep) {
      expect(healthcareOffTopicBrollReason(alt, HEALTHCARE_TOPIC)).toBe('');
      expect(isGenericStockJunk(alt, HEALTHCARE_TOPIC)).toBe(false);
    }
    expect(healthcareOffTopicBrollReason('FEMA disaster footage', HOUSING_TOPIC)).toBe('');
    expect(healthcareOffTopicBrollReason('FEMA disaster footage', AIRLINE_TOPIC)).toBe('');
  });

  it('hard-rejects giphy hosts, Coursera title cards, and capitol protest pads', () => {
    expect(
      healthcareOffTopicBrollReason('https://media.giphy.com/media/abc/giphy.mp4', HEALTHCARE_TOPIC),
    ).toMatch(/giphy/);
    expect(
      healthcareOffTopicBrollReason('coursera stanford online course trailer title card', HEALTHCARE_TOPIC),
    ).toMatch(/healthcare off-topic/);
    expect(
      healthcareOffTopicBrollReason('utah state capitol protest rally crowd footage', HEALTHCARE_TOPIC),
    ).toMatch(/healthcare off-topic/);
  });

  it('hard-rejects Archive maternity, kapparot ritual, news talking-head studio, COVID PSA, lecture slides', () => {
    const cases = [
      '1937 maternity ward hospital film archival footage',
      'maternity hospital childbirth training film',
      'kapparot ritual chicken atonement ceremony',
      'news talking head studio interview anchor desk',
      'woman green screen christmas tree healthcare webinar',
      'news anchor studio desk healthcare segment',
      'covid propaganda psa misinfo leftover clip',
      'coursera lecture slides online course mooc',
      'powerpoint lecture slides medical ethics title card',
      'def con 25 biohacking village presentation slides',
      'madness and medicine archival reel',
      'dr samadi prostate cancer sex after prostate surgery',
      'waiting rooms hospital bills lego style explosive iran',
      'terrible nurses mgtow rant',
      'hiroshima atomic bomb medical aspect graphic',
      'warzone in sweden stops ambulance',
    ];
    for (const alt of cases) {
      expect(healthcareOffTopicBrollReason(alt, HEALTHCARE_TOPIC)).toMatch(/healthcare off-topic/);
      expect(isGenericStockJunk(alt, HEALTHCARE_TOPIC)).toBe(true);
    }
  });

  it('keeps AI radiology / clinician+screen / surgical robot / ultrasound demo motion', () => {
    const keep = [
      'ai radiology doctor pointing at monitor screen',
      'clinician reviewing mri scan monitors hospital',
      'surgical robot operating room demonstration',
      'ultrasound demonstration clinician probe exam',
      'radiologist ai diagnosis laptop screen',
      'cnbc meet the surgical robot that can diagnose lung cancer',
    ];
    for (const alt of keep) {
      expect(healthcareOffTopicBrollReason(alt, HEALTHCARE_TOPIC)).toBe('');
      expect(isGenericStockJunk(alt, HEALTHCARE_TOPIC)).toBe(false);
    }
  });

  it('hard-rejects healthcare-web11 CNN10 / breast-implant / Vietnam / civic / political pads', () => {
    const cases = [
      'cnn 10 host talking head red studio background',
      'lowcountry lowdown breast implants technology mathew epps md plastic surgery',
      'cong hoa hospital burn ward saigon vietnam',
      'penfield reading room archival lecture',
      'ltc lakin denied kansas medical license for challenging obama s eligibility',
      'scooter vs car emergency services respond to collision in venice',
      'adventure eight paging dr ross mayor performs simulated procedure at medical city arlington',
      'scottsdale s cure corridor feature story march 2019 city of scottsdale',
      'amazon pharmacy and healthcare 2023 game change',
      'garland isd baylor robotic surgery demo',
      'garland isd baylor robotic surgery demo classroom students watching',
      'da vinci surgical system overview powerpoint classroom children seated',
      'neuralink working on the neuralink robot lab demo',
    ];
    for (const alt of cases) {
      expect(healthcareOffTopicBrollReason(alt, HEALTHCARE_TOPIC)).toMatch(/healthcare off-topic/);
      expect(isGenericStockJunk(alt, HEALTHCARE_TOPIC)).toBe(true);
    }
  });

  it('hard-rejects healthcare-web12 school-nurse / war / laparoscopy-romantic / zoo pads', () => {
    const cases = [
      'whhi news wendy cummings school nurse report finishing school year',
      'al funduq curfew doctor denied access to patient',
      'ukraine pow september 28th 2024',
      'the anatomy of kissing and love in magnetic resonance imaging mri',
      'world s first rhino ct scan performed at zoo',
      'circumcure hospital circumcision surgery staplers',
      'board of commissioners mtg excerpt october healthcare',
      'organ harvesting and the illusion of brain death',
      '15 years of robotic surgery excellence world laparoscopy hospital anniversary celebration',
      'radiologic x ray technology start a fast paced well paying medical career',
      'second opinion project hospitals safe from covid 19',
    ];
    for (const alt of cases) {
      expect(healthcareOffTopicBrollReason(alt, HEALTHCARE_TOPIC)).toMatch(/healthcare off-topic/);
      expect(isGenericStockJunk(alt, HEALTHCARE_TOPIC)).toBe(true);
    }
  });

  it('hard-rejects healthcare-web13 mikovits / samadi / liability / local-TV pads', () => {
    const cases = [
      'censored scientists dr judy mikovits',
      'talk of the town dr rachael kermis new clinic ochsner health whhitv',
      'dr david samadi new prostate cancer tests',
      'the truth about canadian healthcare 5 minute video',
      'healthloop how medical liability slows down health care',
      'bad patient diagnoses perspective',
      'we talked to an icu nurse working in an overwhelmed covid 19 ward',
    ];
    for (const alt of cases) {
      expect(healthcareOffTopicBrollReason(alt, HEALTHCARE_TOPIC)).toMatch(/healthcare off-topic/);
      expect(isGenericStockJunk(alt, HEALTHCARE_TOPIC)).toBe(true);
    }
  });


  it('hard-rejects healthcare-web14 samadi-bare / vaccine-politics / hospital-tour pads', () => {
    const cases = [
      'the benefits of robotic prostate cancer surgery explained by dr samadi',
      'sen ron johnson cdc is hiding mrna vaccine injury data ask dr drew',
      'intestinal injury at attempted abortion by unqualified doctor',
      'hawthorn walk in center mental health addictions care',
      'n c doctor sues to break up state enforced medical monopoly',
      'tour glendale s new hospital st joseph s westgate',
      'absolute justice watermark conspiracy healthcare',
    ];
    for (const alt of cases) {
      expect(healthcareOffTopicBrollReason(alt, HEALTHCARE_TOPIC)).toMatch(/healthcare off-topic/);
      expect(isGenericStockJunk(alt, HEALTHCARE_TOPIC)).toBe(true);
    }
  });

  it('does not hard-reject webinar/longevity talks (intro-demote only; volume soft-pass)', () => {
    // Hard-rejecting these starved healthcare-web4 to soft-pass-thin(1/6).
    const bodyOk = [
      'The Two Healthcare Revolutions in Our Lifetime: AI and Longevity',
      'ai healthcare webinar keynote panel discussion',
      'tedx talk doctor ai medicine future',
    ];
    for (const alt of bodyOk) {
      expect(healthcareOffTopicBrollReason(alt, HEALTHCARE_TOPIC)).toBe('');
    }
  });

  it('hard-rejects exhibition-hall / trade-show / conference-booth pads (web11 suit opener)', () => {
    const cases = [
      // Exhibition floors scraped via "surgical robot" / "AI healthcare" queries
      'AI healthcare summit booth floor product demo CES 2024',
      'HIMSS conference expo floor healthcare IT exhibitor',
      'medical trade show exhibition hall healthcare AI demo',
      'healthcare expo trade show surgical robot product demonstration',
      'suit walking conference floor AI healthcare summit',
      // Generic conference/expo floor without OR/clinical context
      'health IT summit booth floor medical vendor demo',
      'AI summit conference booth product demo robotics',
    ];
    for (const alt of cases) {
      expect(healthcareOffTopicBrollReason(alt, HEALTHCARE_TOPIC)).toMatch(/healthcare off-topic/);
      expect(isGenericStockJunk(alt, HEALTHCARE_TOPIC)).toBe(true);
    }
  });

  it('keeps OR surgical-robot / radiologist workstation clinical B-roll', () => {
    const keep = [
      'CNBC surgical robot operating room hospital patient',
      'da Vinci robot surgery operating room surgeon',
      'radiologist workstation MRI screen monitor hospital',
      'robotic surgery OR lights surgeon operating table',
      'da Vinci robotic surgery patient procedure',
      'surgical robot operating room clinical use',
    ];
    for (const alt of keep) {
      expect(healthcareOffTopicBrollReason(alt, HEALTHCARE_TOPIC)).toBe('');
      expect(isGenericStockJunk(alt, HEALTHCARE_TOPIC)).toBe(false);
    }
  });
});

describe('healthcare non-clinical ceremony / event rejects (web13)', () => {
  it('hard-rejects white-coat ceremony / medical graduation / nursing pinning', () => {
    const cases = [
      'white coat ceremony medical school class 2024',
      'medical school graduation convocation ceremony',
      'nursing pinning ceremony class of 2024',
      'nursing graduation ceremony celebration day',
    ];
    for (const alt of cases) {
      expect(healthcareOffTopicBrollReason(alt, HEALTHCARE_TOPIC)).toMatch(/healthcare off-topic/);
      expect(isGenericStockJunk(alt, HEALTHCARE_TOPIC)).toBe(true);
    }
  });

  it('hard-rejects hospital gala / fundraiser benefit events', () => {
    const cases = [
      'hospital fundraiser benefit gala evening',
      'hospital benefit gala annual fundraising dinner',
      'hospital benefit concert charity event',
      'hospital anniversary gala fundraising',
    ];
    for (const alt of cases) {
      expect(healthcareOffTopicBrollReason(alt, HEALTHCARE_TOPIC)).toMatch(/healthcare off-topic/);
      expect(isGenericStockJunk(alt, HEALTHCARE_TOPIC)).toBe(true);
    }
  });

  it('hard-rejects EHR/EMR software product demos and digital health conference floors', () => {
    const cases = [
      'EHR demo product demo hospital software keynote',
      'EMR product demo electronic medical records software',
      'digital health summit expo floor product demo healthcare',
      'digital health conference floor vendor booth healthcare IT',
      'health technology conference floor booth keynote expo',
    ];
    for (const alt of cases) {
      expect(healthcareOffTopicBrollReason(alt, HEALTHCARE_TOPIC)).toMatch(/healthcare off-topic/);
      expect(isGenericStockJunk(alt, HEALTHCARE_TOPIC)).toBe(true);
    }
  });

  it('keeps clinical content that is not a ceremony or event demo', () => {
    const keep = [
      'doctor reviewing MRI results hospital',
      'radiologist workstation screen monitor hospital',
      'CNBC surgical robot operating room patient',
      'medical school anatomy class hands-on lab',
      'EHR record on hospital computer nurse',
    ];
    for (const alt of keep) {
      expect(healthcareOffTopicBrollReason(alt, HEALTHCARE_TOPIC)).toBe('');
    }
  });
});

describe('healthcare keyless soft-pass-motion (web + Archive)', () => {
  beforeEach(() => {
    vi.stubEnv('PEXELS_API_KEY', '');
    vi.stubEnv('VITE_PEXELS_KEY', '');
    vi.stubEnv('PIXABAY_API_KEY', '');
    vi.stubEnv('VITE_PIXABAY_KEY', '');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const makeSegments = (n) =>
    Array.from({ length: n }, (_, i) => ({
      id: `seg${i}`,
      title: `Segment ${i}`,
      narration: 'AI tools are changing how doctors diagnose disease in hospitals.',
    }));

  const clinicalWebClip = ({ segmentId, title, query, idx }) => ({
    type: 'video',
    segmentId,
    url: `http://localhost:5173/api/download-clip?url=${encodeURIComponent(`https://vimeo.com/${8000 + idx}`)}&duration=10`,
    alt: title,
    title,
    query,
    source: idx % 2 ? 'Bing web video' : 'Google web video',
    sourceUrl: `https://vimeo.com/${8000 + idx}`,
  });

  it('counts clinical web clips as healthcare-strong', () => {
    const titles = [
      'Hospital corridor with nurses walking',
      'Doctor reviewing MRI scan monitors',
      'AI medical diagnosis computer screen',
      'Nurse workstation hospital computer',
      'Patient waiting room clinic daylight',
      'Telemedicine doctor video call',
    ];
    const clips = titles.map((title, i) => clinicalWebClip({
      segmentId: `seg${i}`,
      title,
      query: 'hospital doctor patient',
      idx: i,
    }));
    expect(countHealthcareStrongVideos(clips, HEALTHCARE_TOPIC)).toBe(clips.length);
    expect(hasHealthcareEvidence(clips[0])).toBe(true);
  });

  it('soft-passes a keyless healthcare pool with clinical web motion', () => {
    const segments = makeSegments(3);
    const titles = [
      'Hospital corridor with nurses walking',
      'Doctor reviewing MRI scan monitors',
      'AI medical diagnosis computer screen',
      'Nurse workstation hospital computer',
      'Patient waiting room clinic daylight',
      'Telemedicine doctor video call',
    ];
    const media = titles.map((title, i) => clinicalWebClip({
      segmentId: segments[i % segments.length].id,
      title,
      query: 'hospital doctor patient AI diagnosis',
      idx: i,
    }));
    const project = { topic: HEALTHCARE_TOPIC, title: 'AI Healthcare', script: segments, media };
    expect(healthcareSoftPassMotionFailureReason(project, {})).toBeNull();
    const result = evaluateHarvestVolumeWithSoftPass({
      volumePass: false,
      cyberStockInjected: 0,
      pexelsFetched: 0,
      pixabayFetched: 0,
      archiveLiveFetched: 0,
      videoTopUp: [],
    }, project);
    expect(result.pass).toBe(true);
    expect(result.reason).toMatch(/^soft-pass-motion-healthcare\(/);
  });

  it('fails thin keyless healthcare pools below the motion floor', () => {
    const segments = makeSegments(3);
    const media = Array.from({ length: 4 }, (_, i) => clinicalWebClip({
      segmentId: segments[i % 3].id,
      title: 'Hospital corridor with nurses walking',
      query: 'hospital corridor',
      idx: i,
    }));
    const project = { topic: HEALTHCARE_TOPIC, title: 'AI Healthcare', script: segments, media };
    const result = evaluateHarvestVolumeWithSoftPass({
      volumePass: false,
      archiveLiveFetched: 10,
      videoTopUp: [],
    }, project);
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/soft-pass-motion-healthcare-thin\(4\/6/);
  });

  it('keeps clinical hospital titles through relevance on AI healthcare topics', () => {
    const segments = makeSegments(1);
    const media = [
      clinicalWebClip({
        segmentId: 'seg0',
        title: 'Doctor reviewing MRI radiology monitors in hospital',
        query: 'mri scan hospital',
        idx: 1,
      }),
    ];
    const project = { topic: HEALTHCARE_TOPIC, title: 'AI Healthcare', script: segments, media };
    const { media: kept, dropped } = filterAssetsByRelevance(media, project);
    expect(kept.length).toBe(1);
    expect(dropped).toEqual([]);
  });

  it('rejects bank-otp pads in healthcare soft-pass junk gate', () => {
    const segments = makeSegments(3);
    const media = [
      ...Array.from({ length: 3 }, (_, i) => clinicalWebClip({
        segmentId: segments[i].id,
        title: 'Hospital corridor with nurses',
        query: 'hospital',
        idx: i,
      })),
      ...Array.from({ length: 3 }, (_, i) => ({
        type: 'video',
        segmentId: segments[i].id,
        url: `https://archive.org/download/otp${i}/otp${i}.mp4`,
        source: 'Archive.org live',
        alt: 'bank otp keypad sms scam phone',
        title: 'bank otp keypad sms scam phone',
        query: 'otp bank',
      })),
    ];
    const project = { topic: HEALTHCARE_TOPIC, script: segments, media };
    const fail = healthcareSoftPassMotionFailureReason(project, {});
    expect(fail).toMatch(/soft-pass-motion-healthcare-junk\(bank-otp-scam/);
  });
});

describe('housing evidence floor for abstract script beats', () => {
  const fearSeg = {
    id: 'fear',
    title: 'The Fear Factor',
    narration: 'People are scared to open the envelope.',
  };
  const zillowSeg = {
    id: 'zillow',
    title: 'The Zillow Collapse',
    narration: 'Listings vanished overnight.',
  };

  const housingWebClip = ({ segmentId, title, query, idx }) => ({
    type: 'video',
    segmentId,
    url: `http://localhost:5173/api/download-clip?url=${encodeURIComponent(`https://vimeo.com/${9000 + idx}`)}&duration=10`,
    alt: title,
    title,
    query,
    source: 'Bing web video',
    sourceUrl: `https://vimeo.com/${9000 + idx}`,
  });

  it('recognizes apartment/eviction/zillow titles as housing evidence', () => {
    const clip = housingWebClip({
      segmentId: 'zillow',
      title: 'Zillow listings crash as eviction notices pile up',
      query: 'housing market crash',
      idx: 1,
    });
    expect(hasHousingEvidence(clip)).toBe(true);
  });

  it('floors relevance on Fear Factor when only housing evidence matches', () => {
    const clip = housingWebClip({
      segmentId: 'fear',
      title: 'Tenant reads eviction notice in apartment hallway',
      query: 'worried tenant eviction',
      idx: 2,
    });
    const score = scoreAssetRelevance(clip, fearSeg, HOUSING_TOPIC);
    expect(score).toBeGreaterThanOrEqual(VOLUME_PADDING_MIN_RELEVANCE);
  });

  it('pads Fear Factor topical video from Zillow-segment housing clips', () => {
    const zillowClip = housingWebClip({
      segmentId: 'zillow',
      title: 'Apartment building for rent signs on residential street',
      query: 'apartment for rent',
      idx: 3,
    });
    const project = {
      topic: HOUSING_TOPIC,
      title: 'Housing Crash',
      script: [fearSeg, zillowSeg],
      media: [
        {
          type: 'image',
          segmentId: 'fear',
          url: 'https://example.com/fear-still.jpg',
          alt: 'generic stock still',
          title: 'generic stock still',
        },
        zillowClip,
      ],
    };
    const coverage = ensureTopicalVideoCoverage(project);
    expect(coverage.missing).toEqual([]);
    expect(coverage.padded.some((a) => a.segmentId === 'fear')).toBe(true);
    const soft = evaluateHarvestVolumeWithSoftPass({
      volumePass: false,
      cyberStockInjected: 0,
      pexelsFetched: 0,
      pixabayFetched: 0,
      archiveLiveFetched: 4,
      videoTopUp: Array.from({ length: 6 }, (_, i) => ({ id: `t${i}` })),
    }, {
      ...project,
      // Enough unique housing motion for soft-pass-motion (≥2 videos/seg).
      media: [
        ...project.media,
        ...Array.from({ length: 5 }, (_, i) => housingWebClip({
          segmentId: i % 2 === 0 ? 'fear' : 'zillow',
          title: `Landlord tenant rent hearing apartment ${i}`,
          query: 'landlord tenant rent',
          idx: 10 + i,
        })),
      ],
    });
    // Soft-pass must not die on volume-topical-video-empty after evidence floor.
    expect(soft.reason || '').not.toMatch(/volume-topical-video-empty/);
  });

  it('keeps housing evidence through relevance on abstract Fear Factor beat', () => {
    const media = [
      housingWebClip({
        segmentId: 'fear',
        title: 'Foreclosure auction residential neighborhood homes',
        query: 'foreclosure auction',
        idx: 4,
      }),
    ];
    const project = {
      topic: HOUSING_TOPIC,
      script: [fearSeg],
      media,
    };
    const { media: kept, dropped } = filterAssetsByRelevance(media, project);
    expect(kept.length).toBe(1);
    expect(dropped).toEqual([]);
  });

  it('does not treat bare home-movie Archive junk as housing evidence', () => {
    const warHomeMovie = {
      type: 'video',
      segmentId: 'fear',
      url: 'https://archive.org/download/vietnam-war-home-movie/clip.mp4',
      source: 'Archive.org live',
      alt: 'vietnam war home movie of subic bay philippines re supply trip',
      title: 'vietnam war home movie of subic bay philippines re supply trip',
      query: 'worried couple reading letter home',
    };
    expect(hasHousingEvidence(warHomeMovie)).toBe(false);
    expect(scoreAssetRelevance(warHomeMovie, fearSeg, HOUSING_TOPIC)).toBe(0);
  });
});
