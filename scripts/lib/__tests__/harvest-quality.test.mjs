import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  airlineSoftPassMotionFailureReason,
  canonicalMediaKey,
  checkEditTimelineIntroFace,
  repairEditTimelineIntroFace,
  checkIntroFacePool,
  countAirlineStrongVideos,
  ensureTopicalVideoCoverage,
  evaluateHarvestVolumeWithSoftPass,
  filterAssetsByRelevance,
  hasAirlineAviationEvidence,
  hasHealthcareEvidence,
  hasHousingEvidence,
  housingIntroFaceEvidenceMatches,
  healthcareIntroFaceEvidenceMatches,
  isHealthcareEstablishingOpener,
  isHealthcareIntroDeadAirOpener,
  isHealthcareIntroBeautyOrClinicJunk,
  healthcareIntroClinicalEscape,
  healthcareIntroRepairRank,
  isHousingIntroJunkPad,
  housingIntroRepairRank,
  healthcareClinicianOrPatientFace,
  healthcareStrongClinicalMotion,
  countHealthcareStrongVideos,
  healthcareSoftPassMotionFailureReason,
  healthcareOffTopicBrollReason,
  healthcareArchiveTitleMismatchReason,
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

  it('hard-rejects standalone HIMSS and trade-show (without floor) — web20 openers', () => {
    const cases = [
      'HIMSS annual conference healthcare technology 2024 exhibitor',
      'medical trade show AI healthcare products exhibitor',
      'trade show healthcare robotics medical devices vendor',
    ];
    for (const alt of cases) {
      expect(healthcareOffTopicBrollReason(alt, HEALTHCARE_TOPIC)).toMatch(/healthcare off-topic/);
    }
  });

  it('hard-rejects Archive query-mismatch junk that tanked healthcare-web43 (raw 3.4)', () => {
    const cases = [
      'geekbeat tv 433 at t will unlock your old iphone',
      'Jackthreads Real Fashion for Guys commercial',
      'mlk why america may go to hell archival speech',
      'this or that time for your examination game show',
      'metro edition medical exam on the wild side',
      'DAVID & ELIAS - WHY DO I INNOVATE corporate interview',
      'artas hair transplant robotic surgery marketing',
      'advanced healthcare facilities at sri ponni medical centre',
      'bayer logo corporate presentation healthcare keynote',
      'palestine deepdive podcast earbuds interview',
      'the bald truth split screen interview podcast',
      'che guevara imperialism poster graphic',
    ];
    for (const alt of cases) {
      expect(healthcareOffTopicBrollReason(alt, HEALTHCARE_TOPIC)).toMatch(/healthcare off-topic/);
      expect(isGenericStockJunk(alt, HEALTHCARE_TOPIC)).toBe(true);
    }
  });

  it('hard-rejects archive-only soft-pass junk that still leaked after web43 rejects', () => {
    const cases = [
      'Dr. Elias Blind Spot Why AI will change healthcare Vimeo interview',
      'bayer corporate stage logo interview healthcare',
      'massachusetts senate passes swine flu martial law bill',
      'brookhaven spectrum 1967 atomic experiments national laboratory',
      'four year old boy dies in lebanon after being denied hospital care',
      'portland clinic drops cancer patient for transgender critical comments',
      'david daleiden opening statement at congressional hearing',
      'maple grove high schooler already accepted to medical school',
      'episode 84 a and osirix podcast',
      'prcs palestine red crescent mobile operating room gaza',
      'news storage january 30 february 1 1985 archival',
      'game show spinning wheel medical examination variety',
    ];
    for (const alt of cases) {
      expect(healthcareOffTopicBrollReason(alt, HEALTHCARE_TOPIC)).toMatch(/healthcare off-topic/);
      expect(isGenericStockJunk(alt, HEALTHCARE_TOPIC)).toBe(true);
    }
  });

  it('rejects surgical-robot query when Archive title is unrelated (GeekBeat spoof)', () => {
    expect(
      healthcareArchiveTitleMismatchReason(
        'surgical robot',
        'geekbeat tv 433 at t will unlock your old iphone',
        HEALTHCARE_TOPIC,
      ),
    ).toMatch(/mismatch/);
    expect(
      healthcareOffTopicBrollReason(
        'geekbeat tv unlock iphone',
        HEALTHCARE_TOPIC,
        { query: 'surgical robot', alt: 'geekbeat tv unlock iphone', title: '' },
      ),
    ).toBeTruthy();
    expect(
      healthcareArchiveTitleMismatchReason(
        'surgical robot',
        'tiny incision big impact the new surgical robot',
        HEALTHCARE_TOPIC,
      ),
    ).toBe('');
  });

  it('does not let query=surgical robot spoof GeekBeat into intro face pool', () => {
    const result = checkIntroFacePool({
      topic: HEALTHCARE_TOPIC,
      title: 'AI Healthcare',
      media: [
        {
          type: 'video',
          url: 'https://archive.org/download/GeekBeat.TV_433/clip.mp4',
          alt: 'geekbeat tv 433 at t will unlock your old iphone',
          title: 'geekbeat tv 433 at t will unlock your old iphone',
          query: 'surgical robot',
          source: 'Archive.org live',
        },
      ],
    });
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/^INTRO_FACE_FAIL/);
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

describe('healthcare web15 raw 4.4 junk rejects (body-lang / NVIDIA / name-pollution / helium / milestone)', () => {
  it('hard-rejects body-language lifestyle content with healthcare framing', () => {
    const cases = [
      'Mistake 1 Saying the wrong things with your body Healthcare edition',
      'body language healthcare tips for doctors',
      'body language medical coaching mistakes',
      'body language clinical edition communication',
    ];
    for (const alt of cases) {
      expect(healthcareOffTopicBrollReason(alt, HEALTHCARE_TOPIC)).toMatch(/healthcare off-topic/);
      expect(isGenericStockJunk(alt, HEALTHCARE_TOPIC)).toBe(true);
    }
  });

  it('hard-rejects NVIDIA AI for Healthcare / Life Sciences promo', () => {
    const cases = [
      'NVIDIA AI for Healthcare and Life Sciences',
      'NVIDIA for healthcare solutions AI',
      'NVIDIA AI healthcare clinical systems',
      'NVIDIA for life sciences health systems',
    ];
    for (const alt of cases) {
      expect(healthcareOffTopicBrollReason(alt, HEALTHCARE_TOPIC)).toMatch(/healthcare off-topic/);
      expect(isGenericStockJunk(alt, HEALTHCARE_TOPIC)).toBe(true);
    }
  });

  it('hard-rejects AI Patel YouTube channel name pollution', () => {
    const cases = [
      'Why AI Patel Why AI will change healthcare',
      'AI Patel explains why AI will change medicine',
      'why ai patel why ai beats your doctor',
    ];
    for (const alt of cases) {
      expect(healthcareOffTopicBrollReason(alt, HEALTHCARE_TOPIC)).toMatch(/healthcare off-topic/);
      expect(isGenericStockJunk(alt, HEALTHCARE_TOPIC)).toBe(true);
    }
  });

  it('hard-rejects meet-our-staff person-name pollution (jada pemble)', () => {
    const cases = [
      'meet our jacks jada pemble medical lab science community assistant',
      'jada pemble medical laboratory science community assistant',
    ];
    for (const alt of cases) {
      expect(healthcareOffTopicBrollReason(alt, HEALTHCARE_TOPIC)).toMatch(/healthcare off-topic/);
      expect(isGenericStockJunk(alt, HEALTHCARE_TOPIC)).toBe(true);
    }
  });

  it('hard-rejects helium fun-fact content framed as medical', () => {
    const cases = [
      'not just for balloons helium used in medical field',
      'helium used in the medical field MRI scanners',
      'helium used in medical imaging hospital',
    ];
    for (const alt of cases) {
      expect(healthcareOffTopicBrollReason(alt, HEALTHCARE_TOPIC)).toMatch(/healthcare off-topic/);
      expect(isGenericStockJunk(alt, HEALTHCARE_TOPIC)).toBe(true);
    }
  });

  it('hard-rejects hospital milestone celebration events', () => {
    const cases = [
      'maple grove hospital robot milestone celebration',
      'hospital milestone celebration ribbon cutting',
      'milestone celebration hospital new wing opening',
    ];
    for (const alt of cases) {
      expect(healthcareOffTopicBrollReason(alt, HEALTHCARE_TOPIC)).toMatch(/healthcare off-topic/);
      expect(isGenericStockJunk(alt, HEALTHCARE_TOPIC)).toBe(true);
    }
  });

  it('hard-rejects web16 junk: MedCram / PA school / celebrity eclipse / WWI heritage / 1972 TV / bilibili', () => {
    const cases = [
      'medcram medical education',
      'online medical learning how pa schools can benefit from medcram',
      'how can pa schools benefit from online learning',
      'pa schools benefit from medcram lectures',
      'nurses at celebrity eclipse medical facility',
      'celebrity eclipse medical facility staff',
      'celebrity cruise ship nurse medical facilit',
      'maryland women s heritage center honor nurses',
      'women s heritage center nurses wwi tribute',
      'honor nurses from wwi memorial center',
      'wwi heritage center nursing history',
      'emergency 1972 tv series incomplete episode',
      '1972 tv series incomplete emergency',
      '1972 television series incomplete',
      'bilibili chill sakura ai debug pad lofi',
      'bilibili sakura chill music pad',
      'sakura chill ai debug music',
      'chill sakura lofi stream',
      'ai debug pad ambient music',
    ];
    for (const alt of cases) {
      expect(healthcareOffTopicBrollReason(alt, HEALTHCARE_TOPIC)).toMatch(
        /healthcare off-topic/,
        `expected "${alt}" to be rejected`,
      );
    }
  });

  it('does not reject legitimate clinical content similar to rejected terms', () => {
    const keep = [
      'doctor patient body examination physical assessment',
      'CNBC surgical robot operating room hospital',
      'radiologist workstation MRI screen monitor',
      'da Vinci robot surgery operating room patient',
      'medical laboratory technician microscope analysis',
      'MRI scanner room hospital clinical',
      'tiny incision big impact the new surgical robot',
      'hsc first surgical robot minimally invasive',
      'a day with the dexter robotic surgery system operating room',
    ];
    for (const alt of keep) {
      expect(healthcareOffTopicBrollReason(alt, HEALTHCARE_TOPIC)).toBe('');
    }
  });

  it('rejects Science Nation / NSF branding pads (healthcare-web76 logo spam)', () => {
    for (const alt of [
      'Science Nation surgical robot OR lights',
      'science nation surgical robotics OR demonstration',
      'science nation surgical robotics national science foundation nsf',
    ]) {
      expect(healthcareOffTopicBrollReason(alt, HEALTHCARE_TOPIC)).toMatch(/healthcare off-topic/);
    }
  });

  it('rejects healthcare-web77 product-pitch / muddy-MRI / software pads from harvest', () => {
    for (const alt of [
      'why is awbus a better choice over hand held ultrasound screening tom stavros',
      'lab interfaces by microwize for medisoft clinical',
      'introduction to the shelford surgical training in advanced robotic technology start programme',
      'medtronic reveal linq insertable cardiac monitor icm system',
      'tmini miniature robotic system technical overview illustration think surgical',
      'discussing cancer screening with patients healthcare professional information series',
      'talking to family loved ones about lung cancer screening',
      'how an mri mrt scan is performed',
      'mri how it works part 2 the different types',
      'this surgical system can stitch a grape back together',
      'diversified radiology breast imaging screening diagnostic mammography',
      'philips epiq 5 7 lcd monitor removal by mxr imaging',
      'omnibotics corin robotic assisted total knee replacement system',
      'que debe saber sobre la mamografia de diagnostico diagnostic mammogram este video',
    ]) {
      expect(healthcareOffTopicBrollReason(alt, HEALTHCARE_TOPIC)).toMatch(/healthcare off-topic/);
    }
    // Keep real clinical OR / Dexter / CNBC leads
    expect(healthcareOffTopicBrollReason(
      'a day with the dexter robotic surgery system operating room',
      HEALTHCARE_TOPIC,
    )).toBe('');
    expect(healthcareOffTopicBrollReason(
      'cnbc meet the surgical robot that can diagnose lung cancer',
      HEALTHCARE_TOPIC,
    )).toBe('');
  });
});

describe('healthcare web17 raw 5.6 junk rejects — video game, massage pillow, AI Geist/Lynx, ENT lecture', () => {
  it('hard-rejects Surgeon Simulator game clip', () => {
    const cases = [
      'you re in our care now surgeon simulator 2 multiplayer gameplay',
      'surgeon simulator 2 playing as a surgeon game',
      'surgeon simulator multiplayer funny moments',
      'surgeon simulator',
    ];
    for (const alt of cases) {
      expect(healthcareOffTopicBrollReason(alt, HEALTHCARE_TOPIC)).toMatch(
        /healthcare off-topic/,
        `expected "${alt}" to be rejected`,
      );
      expect(isGenericStockJunk(alt, HEALTHCARE_TOPIC)).toBe(true);
    }
  });

  it('does not reject surgical simulation used in real medical training', () => {
    const keep = [
      'surgical simulation training laparoscopy OR hospital',
      'robotic surgery simulation OR training clinical',
      'zero gravity robot surgery OR simulation innovation',
      'robotic surgery training OR simulation minimally invasive',
    ];
    for (const alt of keep) {
      expect(healthcareOffTopicBrollReason(alt, HEALTHCARE_TOPIC)).toBe('');
      expect(isGenericStockJunk(alt, HEALTHCARE_TOPIC)).toBe(false);
    }
  });

  it('hard-rejects electric massage pillow / massage product reviews', () => {
    const cases = [
      'father recalled everything about electric massage pillow neck shoulder',
      'electric massage pillow review unboxing',
      'massage pillow product demo back neck relief',
      'electric massage cushion home use review',
    ];
    for (const alt of cases) {
      expect(healthcareOffTopicBrollReason(alt, HEALTHCARE_TOPIC)).toMatch(
        /healthcare off-topic/,
        `expected "${alt}" to be rejected`,
      );
      expect(isGenericStockJunk(alt, HEALTHCARE_TOPIC)).toBe(true);
    }
  });

  it('hard-rejects AI Geist / Lynx report pads', () => {
    const cases = [
      'ai geist lynx reports healthcare weekly',
      'ai geist technology news report',
      'geist lynx ai reports summary',
      'lynx reports healthcare innovation brief',
      'lynx report weekly ai update',
    ];
    for (const alt of cases) {
      expect(healthcareOffTopicBrollReason(alt, HEALTHCARE_TOPIC)).toMatch(
        /healthcare off-topic/,
        `expected "${alt}" to be rejected`,
      );
      expect(isGenericStockJunk(alt, HEALTHCARE_TOPIC)).toBe(true);
    }
  });

  it('hard-rejects ENT examination lecture by Kathmandu Medical College', () => {
    const cases = [
      'ent examination video by kathmandu medical college otolaryngology',
      'ent examination lecture kathmandu medical college',
      'kathmandu medical college ent otolaryngology training lecture',
      'ent examination tutorial kathmandu medical college students',
    ];
    for (const alt of cases) {
      expect(healthcareOffTopicBrollReason(alt, HEALTHCARE_TOPIC)).toMatch(
        /healthcare off-topic/,
        `expected "${alt}" to be rejected`,
      );
      expect(isGenericStockJunk(alt, HEALTHCARE_TOPIC)).toBe(true);
    }
  });

  it('keeps zero gravity surgery, MRI/xray clinical content; rejects Science Nation branding', () => {
    const keep = [
      'robot zero gravity surgery OR ISS space innovation',
      'robotic surgery training minimally invasive OR hospital',
      'mri scan clinical hospital radiology department',
      'chest x-ray radiology clinical diagnosis hospital',
      'cnbc meet the surgical robot that can diagnose lung cancer',
    ];
    for (const alt of keep) {
      expect(healthcareOffTopicBrollReason(alt, HEALTHCARE_TOPIC)).toBe('');
      expect(isGenericStockJunk(alt, HEALTHCARE_TOPIC)).toBe(false);
    }
    for (const alt of [
      'science nation surgical robotics operating room innovation',
      'science nation robots changing surgery hospital clinical',
      'science nation robot surgery next frontier medicine',
    ]) {
      expect(healthcareOffTopicBrollReason(alt, HEALTHCARE_TOPIC)).toMatch(/healthcare off-topic/);
    }
  });

  it('hard-rejects C4I "Call 4 Investigation" public-access TV pad (healthcare-web46)', () => {
    const cases = [
      'c4i for may 20 jon kelly patricia shupe inner voices speech analyst',
      'call 4 investigation healthcare segment archive clip',
      'call for investigation public access tv news',
      'c4i archive segment interview inner voices',
    ];
    for (const alt of cases) {
      expect(healthcareOffTopicBrollReason(alt, HEALTHCARE_TOPIC)).toMatch(
        /healthcare off-topic/,
        `expected "${alt}" to be rejected`,
      );
    }
  });

  it('hard-rejects Moscow Times Russian nurses storage room (healthcare-web46)', () => {
    const cases = [
      'sick russian nurses in storage room spark outrage the moscow times',
      'sick nurses in storage room moscow times report',
      'nurses storage room outrage moscow times',
    ];
    for (const alt of cases) {
      expect(healthcareOffTopicBrollReason(alt, HEALTHCARE_TOPIC)).toMatch(
        /healthcare off-topic/,
        `expected "${alt}" to be rejected`,
      );
    }
  });

  it('hard-rejects al-Ahli hospital Gaza conflict clip (healthcare-web46)', () => {
    const cases = [
      'dr ghassan abu sitta recounts being forced from al ahli hospital shorts gaza alahli',
      'al ahli hospital forced evacuation conflict zone',
      'abu sitta hospital gaza clinic',
    ];
    for (const alt of cases) {
      expect(healthcareOffTopicBrollReason(alt, HEALTHCARE_TOPIC)).toMatch(
        /healthcare off-topic/,
        `expected "${alt}" to be rejected`,
      );
    }
  });

  it('hard-rejects Bronxnet/public-access-TV bright-studio clips (healthcare-web48 caption contrast fix)', () => {
    // These Bronxnet/OPEN Tuesday clips carry genuine clinical keywords (radiology, breast cancer)
    // but their bright news-studio set produces poor caption contrast with yellow text (captionReadability 4/10).
    // They must be rejected so clinical Archive clips with darker backgrounds are preferred.
    const cases = [
      'bronxnet public access tv ai used to detect breast cancer dr sandra brennan director of radiology',
      'open tuesday ai used to detect breast cancer community media peg bronxnet radiology',
    ];
    for (const alt of cases) {
      expect(healthcareOffTopicBrollReason(alt, HEALTHCARE_TOPIC)).toMatch(
        /healthcare off-topic/,
        `expected "${alt}" to be rejected (bright public-access TV studio kills caption contrast)`,
      );
    }
  });
});

describe('checkIntroFacePool — healthcare web17 intro preference (Science Nation over expo suit)', () => {
  const project = (videos) => ({
    topic: HEALTHCARE_TOPIC,
    title: 'AI Healthcare',
    script: [{ id: 'intro' }, { id: 'body' }],
    media: videos,
  });

  it('disqualifies expo/suit/conference floor shots from intro tier', () => {
    const expoShots = [
      makeVideo({ alt: 'expo floor suit walking healthcare conference booth', query: 'ai healthcare' }),
      makeVideo({ alt: 'business suit enter conference floor trade show medical', query: 'healthcare expo' }),
      makeVideo({ alt: 'suit drop exhibition hall healthcare summit vendor', query: 'healthcare summit' }),
      makeVideo({ alt: 'conference booth expo floor business suit stroll healthcare', query: 'healthcare expo' }),
    ];
    for (const video of expoShots) {
      const result = checkIntroFacePool(project([video]));
      expect(result.pass).toBe(false);
      expect(result.reason).toMatch(/^INTRO_FACE_FAIL/);
    }
  });

  it('disqualifies standalone HIMSS / blurry-test-tube from intro tier (web18/web20)', () => {
    const junkShots = [
      makeVideo({ alt: 'HIMSS annual conference healthcare technology 2024', query: 'healthcare ai' }),
      makeVideo({ alt: 'blurry test tube close-up laboratory b-roll stock', query: 'healthcare lab' }),
      makeVideo({ alt: 'petri dish close-up b-roll stock lab healthcare', query: 'lab healthcare' }),
      makeVideo({ alt: 'corporate presentation healthcare AI digital health keynote', query: 'healthcare ai' }),
    ];
    for (const video of junkShots) {
      const result = checkIntroFacePool(project([video]));
      expect(result.pass).toBe(false);
      expect(result.reason).toMatch(/^INTRO_FACE_FAIL/);
    }
  });

  it('rejects Science Nation-only pool as intro (healthcare-web76 branding)', () => {
    const result = checkIntroFacePool(project([
      makeVideo({ alt: 'science nation surgical robotics OR demonstration hospital', query: 'science nation surgery' }),
    ]));
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/^INTRO_FACE_FAIL/);
  });

  it('rejects science nation robot surgery clip as intro tier', () => {
    const result = checkIntroFacePool(project([
      makeVideo({ alt: 'science nation robots changing surgery next frontier medicine', query: 'science nation surgical robot' }),
    ]));
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/^INTRO_FACE_FAIL/);
  });

  it('accepts robot zero gravity surgery OR clip as intro tier', () => {
    const result = checkIntroFacePool(project([
      makeVideo({ alt: 'robot zero gravity surgery operating room OR innovation', query: 'robot surgery OR' }),
    ]));
    expect(result.pass).toBe(true);
  });

  it('fails when pool has only expo/suit shots (no clinical clips)', () => {
    const result = checkIntroFacePool(project([
      makeVideo({ alt: 'expo floor suit walking healthcare summit vendor', query: 'ai healthcare expo' }),
      makeVideo({ alt: 'exhibition hall conference booth medical trade show healthcare', query: 'healthcare expo floor' }),
    ]));
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/^INTRO_FACE_FAIL/);
  });

  it('passes when pool has expo shot AND CNBC surgical robot (clinical satisfies the gate)', () => {
    const result = checkIntroFacePool(project([
      makeVideo({ alt: 'expo floor suit walking healthcare summit', query: 'healthcare expo' }),
      makeVideo({ alt: 'cnbc meet the surgical robot that can diagnose lung cancer operating room', query: 'surgical robot' }),
    ]));
    expect(result.pass).toBe(true);
  });

  it('does not disqualify expo-floor surgical robot OR demo (clinical context exempts)', () => {
    const result = checkIntroFacePool(project([
      makeVideo({ alt: 'da vinci surgical robot operating room patient surgeon expo floor demo', query: 'surgical robot OR' }),
    ]));
    expect(result.pass).toBe(true);
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

  it('passes a healthcare pool sourced entirely from Archive.org + Dailymotion with clinical intro evidence (no Vimeo)', () => {
    // healthcare-web81+: HARVEST_VOLUME_FAIL fired with vimeo-circuit-open×19 once the
    // Vimeo probe circuit-breaker opened, because too much of the DDG pool was Vimeo.
    // The fetch-time circuit breaker (4fd0875/4c19bf5) now biases the remaining budget
    // to Archive/Dailymotion/direct instead — prove the healthcare soft-pass still
    // clears on a pool that never had any Vimeo supply at all.
    const segments = makeSegments(3);
    const media = [
      {
        type: 'video',
        segmentId: segments[0].id,
        url: 'https://www.dailymotion.com/video/or-web81',
        alt: 'surgical robot operating room da vinci clinical use close up',
        title: 'surgical robot operating room da vinci clinical use close up',
        query: 'surgical robot operating room',
        source: 'Bing web video',
        sourceUrl: 'https://www.dailymotion.com/video/or-web81',
      },
      ...[
        'Hospital corridor with nurses walking',
        'Doctor reviewing MRI scan monitors',
        'AI medical diagnosis computer screen',
        'Nurse workstation hospital computer',
        'Patient waiting room clinic daylight',
      ].map((title, i) => ({
        type: 'video',
        segmentId: segments[i % segments.length].id,
        url: `https://archive.org/download/clinical${i}/clinical${i}.mp4`,
        alt: title,
        title,
        query: 'hospital doctor patient AI diagnosis',
        source: 'Archive.org live',
      })),
    ];
    const project = { topic: HEALTHCARE_TOPIC, title: 'AI Healthcare', script: segments, media };
    const result = evaluateHarvestVolumeWithSoftPass({
      volumePass: false,
      cyberStockInjected: 0,
      pexelsFetched: 0,
      pixabayFetched: 0,
      archiveLiveFetched: 5,
      videoTopUp: [],
    }, project);
    expect(result.pass).toBe(true);
    expect(result.reason).toMatch(/^soft-pass-motion-healthcare\(/);
    expect(media.some((a) => /vimeo\.com/i.test(`${a.url} ${a.sourceUrl || ''}`))).toBe(false);
  });

  it('keyless healthcare mirrors housing floor 4 (not 6) once a clinical intro clip qualifies', () => {
    // Post-Vimeo-purge (openVimeoFetchCircuit), a thin-but-valid Archive+Dailymotion
    // pool must clear the same floor housing does — never re-litigate the raised
    // 6-video airline-style floor once the intro-face + junk/strong-evidence gates
    // above already vetted the pool.
    const segments = makeSegments(3);
    const media = [
      clinicalWebClip({
        segmentId: segments[0].id,
        title: 'Doctor reviewing MRI scan monitors',
        query: 'doctor mri monitor',
        idx: 0,
      }),
      ...Array.from({ length: 3 }, (_, i) => clinicalWebClip({
        segmentId: segments[i % 3].id,
        title: 'Hospital corridor with nurses walking',
        query: 'hospital corridor',
        idx: i + 1,
      })),
    ];
    const project = { topic: HEALTHCARE_TOPIC, title: 'AI Healthcare', script: segments, media };
    const result = evaluateHarvestVolumeWithSoftPass({
      volumePass: false,
      archiveLiveFetched: 10,
      videoTopUp: [],
    }, project);
    expect(result.pass).toBe(true);
    expect(result.reason).toMatch(/^soft-pass-motion-healthcare\(/);
  });

  it('fails thin keyless healthcare pools below the housing-mirrored floor of 4', () => {
    const segments = makeSegments(3);
    const media = [
      clinicalWebClip({
        segmentId: segments[0].id,
        title: 'Doctor reviewing MRI scan monitors',
        query: 'doctor mri monitor',
        idx: 0,
      }),
      ...Array.from({ length: 2 }, (_, i) => clinicalWebClip({
        segmentId: segments[i % 3].id,
        title: 'Hospital corridor with nurses walking',
        query: 'hospital corridor',
        idx: i + 1,
      })),
    ];
    const project = { topic: HEALTHCARE_TOPIC, title: 'AI Healthcare', script: segments, media };
    const result = evaluateHarvestVolumeWithSoftPass({
      volumePass: false,
      archiveLiveFetched: 10,
      videoTopUp: [],
    }, project);
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/soft-pass-motion-healthcare-thin\(3\/4/);
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

describe('housingOffTopicBrollReason — web24 pollution patterns', () => {
  const ctx = HOUSING_TOPIC;

  const cases = [
    // car-crash / vehicle pollution (root cause 2)
    ['Man killed after Volkswagen overturns in severe crash with Tesla Tampa police', 'volkswagen'],
    ['tesla tampa police severe crash', 'tesla'],
    ['fatal crash highway 75 officer injured', 'fatal crash highway'],
    ['police car crash scene footage', 'police car crash'],
    // auto insurance / insurance ad pollution
    ['Auto Insurance Rates Just Dropped 2024', 'auto insurance rates'],
    // political / ICC / Marco Rubio
    ['Marco Rubio We re not members of the ICC statement', 'marco rubio'],
    ['ICC international criminal court', 'icc'],
    // choir / celebrity name pollution (root cause 1 guard at broll level)
    ['Katherine Jenkins sings You\'ll never walk alone', 'katherine jenkins'],
    ['Mormon Tabernacle Choir performance', 'mormon tabernacle'],
    ['Sarah Jenkins interview insurance segment', 'sarah jenkins'],
    // social-justice / anti-violence forum (root cause 3)
    ['the bronx social justice and anti violence forums 2023', 'social justice forum'],
    ['bronxnet anti violence forums community', 'anti violence forums'],
  ];

  it.each(cases)('rejects "%s"', (haystack) => {
    expect(housingOffTopicBrollReason(haystack, ctx)).toBeTruthy();
  });

  it('does not reject on-topic housing content', () => {
    expect(housingOffTopicBrollReason('family evicted apartment door notice', ctx)).toBe('');
    expect(housingOffTopicBrollReason('tenant reads eviction letter close up', ctx)).toBe('');
    expect(housingOffTopicBrollReason('foreclosure sign front yard home sold', ctx)).toBe('');
  });
});

describe('housingOffTopicBrollReason — web59/61 meme/ceremony/tiny-house/slides/physio rejects', () => {
  const ctx = HOUSING_TOPIC;

  it('hard-rejects green-screen shocked-face meme (web61 shopify CDN clip)', () => {
    const cases = [
      'shocked face green screen reaction meme apartment',
      'green screen chroma key housing reaction clip',
      'meme reaction overlay shocked face',
      'shocked face meme reaction clip cdn.shopify.com',
      'https://cdn.shopify.com/s/files/shocked-face-meme.mp4',
    ];
    for (const alt of cases) {
      expect(housingOffTopicBrollReason(alt, ctx)).toMatch(
        /housing off-topic/,
        `expected "${alt}" to be rejected`,
      );
    }
  });

  it('hard-rejects vintage title card "HOUSING IN OUR TIME" (web59/61 Archive clip)', () => {
    const cases = [
      'housing in our time 1952 archive film',
      'title card housing documentary archive',
      'title card vintage film opener archive',
    ];
    for (const alt of cases) {
      expect(housingOffTopicBrollReason(alt, ctx)).toMatch(/housing off-topic/);
    }
  });

  it('hard-rejects naturalization ceremony used as courthouse B-roll (web61)', () => {
    const cases = [
      'tulsa naturalization ceremony 1945 archive film',
      'naturalization ceremony courthouse archive',
      'citizenship ceremony archive film',
      'naturalization film federal courthouse',
    ];
    for (const alt of cases) {
      expect(housingOffTopicBrollReason(alt, ctx)).toMatch(/housing off-topic/);
    }
  });

  it('hard-rejects tiny-house lifestyle B-roll (web59/61 Archive clip)', () => {
    const cases = [
      'tiny house revolution documentary lifestyle',
      'tiny homes movement living community',
      'tiny home builders lifestyle movement',
      'small house movement sustainable living',
    ];
    for (const alt of cases) {
      expect(housingOffTopicBrollReason(alt, ctx)).toMatch(/housing off-topic/);
    }
  });

  it('hard-rejects "Welcome & introductions" presentation slide (web59)', () => {
    const cases = [
      'welcome and introduction presentation slide',
      'welcome slide opening presentation housing',
      'introduction slide webinar opener',
      'presentation slide opening welcome',
    ];
    for (const alt of cases) {
      expect(housingOffTopicBrollReason(alt, ctx)).toMatch(/housing off-topic/);
    }
  });

  it('hard-rejects physiotherapy pyramid / resistance band chart (web59 Etsy product)', () => {
    const cases = [
      'resistance band exercise pyramid chart etsy.com',
      'physiotherapy exercise chart poster resistance band',
      'physical therapy pyramid chart workout',
      'fitness pyramid exercise chart resistance bands',
      'https://www.etsy.com/listing/resistance-band-poster',
    ];
    for (const alt of cases) {
      expect(housingOffTopicBrollReason(alt, ctx)).toMatch(/housing off-topic/);
    }
  });

  it('does not reject on-topic housing clips with unrelated incidental words', () => {
    const keep = [
      'worried tenant reading eviction notice apartment close up',
      'family packing boxes small apartment eviction landlord',
      'couple facing foreclosure sign home front yard',
    ];
    for (const alt of keep) {
      expect(housingOffTopicBrollReason(alt, ctx)).toBe('');
    }
  });
});

describe('checkIntroFacePool — housing web59/61 junk pools trigger INTRO_FACE_FAIL', () => {
  const project = (videos) => ({
    topic: HOUSING_TOPIC,
    title: 'Housing crash',
    script: [{ id: 'intro' }, { id: 'body' }],
    media: videos,
  });

  it('fails when pool contains only green-screen meme (web61 Shopify clip)', () => {
    const result = checkIntroFacePool(project([
      makeVideo({
        alt: 'shocked face green screen meme reaction',
        url: 'https://cdn.shopify.com/meme.mp4',
        source: 'Bing web video',
      }),
    ]));
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/^INTRO_FACE_FAIL/);
  });

  it('fails when pool contains only naturalization ceremony clip (web61)', () => {
    const result = checkIntroFacePool(project([
      makeVideo({
        alt: 'tulsa naturalization ceremony archive film 1945',
        source: 'Archive.org live',
      }),
    ]));
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/^INTRO_FACE_FAIL/);
  });

  it('fails when pool contains only tiny-house lifestyle clip (web59/61)', () => {
    const result = checkIntroFacePool(project([
      makeVideo({ alt: 'tiny homes revolution lifestyle community small home movement' }),
    ]));
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/^INTRO_FACE_FAIL/);
  });
});

describe('housingOffTopicBrollReason — web30 aviation/jet-engine and group-photo rejects', () => {
  it('hard-rejects jet-engine / aviation pads on housing topics', () => {
    const cases = [
      'jet engine close-up roar sound',
      'jet engines sound noise aircraft',
      'turbine engine closeup aviation',
      'aircraft engine intake pod closeup',
      'engine nacelle aircraft jet',
      'airplane taking off taxiing runway',
      'plane taking off runway departure',
      'jet taxiing tarmac takeoff runway',
      'runway aircraft takeoff departure',
    ];
    for (const alt of cases) {
      expect(housingOffTopicBrollReason(alt, HOUSING_TOPIC)).toMatch(/housing off-topic/);
      expect(isGenericStockJunk(alt, HOUSING_TOPIC)).toBe(true);
    }
  });

  it('hard-rejects random group-photo stock without housing vocabulary', () => {
    const cases = [
      'group photo diverse people smiling',
      'team photo office corporate',
      'office group photo professionals',
      'corporate team portrait smiling',
      'group of professionals posing smiling',
      'group portrait corporate business diverse',
      'diverse team smiling photo',
    ];
    for (const alt of cases) {
      expect(housingOffTopicBrollReason(alt, HOUSING_TOPIC)).toMatch(/housing off-topic/);
      expect(isGenericStockJunk(alt, HOUSING_TOPIC)).toBe(true);
    }
  });

  it('allows group clips that carry housing-topical vocabulary', () => {
    expect(
      housingOffTopicBrollReason('tenant group facing eviction outside apartment', HOUSING_TOPIC),
    ).toBe('');
    expect(
      housingOffTopicBrollReason('worried family group reading eviction notice', HOUSING_TOPIC),
    ).toBe('');
  });

  it('does not reject aviation/engine on non-housing topics', () => {
    expect(housingOffTopicBrollReason('jet engine close-up roar sound', AIRLINE_TOPIC)).toBe('');
    expect(housingOffTopicBrollReason('group photo team smiling', AIRLINE_TOPIC)).toBe('');
  });
});

// ── checkIntroFacePool ──────────────────────────────────────────────────────

const makeVideo = (overrides) => ({
  type: 'video',
  segmentId: 'intro',
  url: 'https://example.com/clip.mp4',
  alt: '',
  title: '',
  query: '',
  source: 'Bing web video',
  ...overrides,
});

describe('checkIntroFacePool — housing', () => {
  const project = (videos) => ({
    topic: HOUSING_TOPIC,
    title: 'Housing crash',
    script: [{ id: 'intro' }, { id: 'body' }],
    media: videos,
  });

  it('passes when pool has shocked-face + eviction-notice clip', () => {
    const result = checkIntroFacePool(project([
      makeVideo({ alt: 'shocked face close up eviction notice apartment tenant' }),
    ]));
    expect(result.pass).toBe(true);
  });

  it('passes when pool has worried couple + apartment interior clip', () => {
    const result = checkIntroFacePool(project([
      makeVideo({ alt: 'worried couple reading letter kitchen apartment eviction' }),
    ]));
    expect(result.pass).toBe(true);
  });

  it('passes when pool has packing-boxes lived-in apartment clip', () => {
    const result = checkIntroFacePool(project([
      makeVideo({ alt: 'packing boxes apartment hallway tenant eviction notice moving' }),
    ]));
    expect(result.pass).toBe(true);
  });

  it('passes when pool has foreclosure auction with family distress (timeline-gate aligned)', () => {
    const result = checkIntroFacePool(project([
      makeVideo({ alt: 'family distressed foreclosure eviction auction apartment' }),
    ]));
    expect(result.pass).toBe(true);
  });

  it('fails when pool has only query-stamped face pads without evidence (web8)', () => {
    const result = checkIntroFacePool(project([
      makeVideo({
        title: 'the weeknd can t feel my face remix',
        alt: 'the weeknd can t feel my face remix',
        query: 'worried tenant face close up',
      }),
      makeVideo({
        title: 'viper 787 electronic dartboard',
        alt: 'viper 787 electronic dartboard',
        query: 'shocked face eviction notice',
      }),
    ]));
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/^INTRO_FACE_FAIL/);
  });

  it('fails with INTRO_FACE_FAIL when pool has only FEMA/news-map graphics', () => {
    const result = checkIntroFacePool(project([
      makeVideo({ alt: 'fema disaster map flood area', query: 'housing flood map' }),
      makeVideo({ alt: 'news map united states hurricane impact zone' }),
    ]));
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/^INTRO_FACE_FAIL/);
    expect(result.reason).toMatch(/housing/i);
  });

  it('fails with INTRO_FACE_FAIL when pool has only landscape/aerial Archive clips', () => {
    const result = checkIntroFacePool(project([
      makeVideo({ alt: 'aerial view mountain lake landscape', source: 'Archive.org live' }),
      makeVideo({ alt: 'scenic mountain river forest countryside', source: 'Archive.org live' }),
    ]));
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/^INTRO_FACE_FAIL/);
  });

  it('fails with INTRO_FACE_FAIL when pool has only webinar/talking-head clips', () => {
    const result = checkIntroFacePool(project([
      makeVideo({ alt: 'housing webinar tenant rights sitting in chair presenter', query: 'webinar housing' }),
    ]));
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/^INTRO_FACE_FAIL/);
  });

  it('returns pass: true for non-housing/non-healthcare topics', () => {
    const result = checkIntroFacePool({
      topic: 'crypto market collapse',
      title: 'Bitcoin crashes',
      media: [makeVideo({ alt: 'bitcoin chart price drop' })],
    });
    expect(result.pass).toBe(true);
  });

  it('evaluateHarvestVolumeWithSoftPass returns INTRO_FACE_FAIL for housing pool with no face/lived-in clips', () => {
    const segments = [{ id: 'intro' }, { id: 'body' }, { id: 'outro' }];
    // Clips are topically relevant (apartment/housing) so ensureTopicalVideoCoverage passes,
    // but none have a readable human face or lived-in interior signal — INTRO_FACE_FAIL fires.
    const media = Array.from({ length: 9 }, (_, i) => makeVideo({
      segmentId: segments[i % 3].id,
      url: `https://example.com/apt${i}.mp4`,
      alt: 'apartment building exterior residential neighborhood city street housing',
      query: 'apartment building exterior housing',
    }));
    const proj = { topic: HOUSING_TOPIC, title: 'Housing crash', script: segments, media };
    const result = evaluateHarvestVolumeWithSoftPass({
      volumePass: false,
      archiveLiveFetched: 4,
      videoTopUp: Array.from({ length: 9 }, (_, i) => ({ id: `t${i}` })),
    }, proj);
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/^INTRO_FACE_FAIL/);
  });

  it('evaluateHarvestVolumeWithSoftPass passes housing pool with face clip', () => {
    const segments = [{ id: 'intro' }, { id: 'body' }, { id: 'outro' }];
    const media = [
      makeVideo({
        segmentId: 'intro',
        url: 'https://vimeo.com/face1.mp4',
        alt: 'worried tenant face close up eviction notice apartment',
        query: 'worried tenant eviction face',
        source: 'Bing web video',
        sourceUrl: 'https://vimeo.com/face1',
      }),
      ...Array.from({ length: 7 }, (_, i) => makeVideo({
        segmentId: segments[i % 3].id,
        url: `https://example.com/apt${i}.mp4`,
        alt: 'apartment interior hallway tenant landlord',
        query: 'apartment eviction',
        source: 'Bing web video',
      })),
    ];
    const proj = { topic: HOUSING_TOPIC, title: 'Housing crash', script: segments, media };
    const result = evaluateHarvestVolumeWithSoftPass({
      volumePass: false,
      archiveLiveFetched: 4,
      videoTopUp: Array.from({ length: 8 }, (_, i) => ({ id: `t${i}` })),
    }, proj);
    expect(result.pass).toBe(true);
  });

  it('passes a housing pool sourced entirely from Archive.org + Dailymotion with an intro-face clip (no Vimeo)', () => {
    // housing-web85: the DDG pool skewed almost entirely Vimeo, and the fetch-time
    // circuit breaker (4fd0875/4c19bf5) now biases the remaining budget to Archive/
    // Dailymotion/direct once Vimeo dies. The housing soft-pass must never have
    // depended on Vimeo supply in the first place — prove an Archive+Dailymotion-only
    // pool with a qualifying intro-face clip still clears it.
    const segments = [{ id: 'intro' }, { id: 'body' }, { id: 'outro' }];
    const media = [
      makeVideo({
        segmentId: 'intro',
        url: 'https://www.dailymotion.com/video/face-web85',
        alt: 'worried tenant face close up eviction notice apartment',
        query: 'worried tenant eviction face',
        source: 'Bing web video',
        sourceUrl: 'https://www.dailymotion.com/video/face-web85',
      }),
      ...Array.from({ length: 7 }, (_, i) => makeVideo({
        segmentId: segments[i % 3].id,
        url: `https://archive.org/download/apt${i}/apt${i}.mp4`,
        alt: 'apartment interior hallway tenant landlord eviction',
        query: 'apartment eviction',
        source: 'Archive.org live',
      })),
    ];
    const proj = { topic: HOUSING_TOPIC, title: 'Housing crash', script: segments, media };
    const result = evaluateHarvestVolumeWithSoftPass({
      volumePass: false,
      archiveLiveFetched: 7,
      videoTopUp: Array.from({ length: 8 }, (_, i) => ({ id: `t${i}` })),
    }, proj);
    expect(result.pass).toBe(true);
    expect(result.reason).toMatch(/^soft-pass-motion-housing\(/);
    expect(media.some((a) => /vimeo\.com/i.test(`${a.url} ${a.sourceUrl || ''}`))).toBe(false);
  });

  it('keyless housing soft-passes at 4 unique videos after intro-face (web58 thin at 4/5)', () => {
    const segments = [{ id: 'intro' }, { id: 'body' }, { id: 'outro' }];
    const media = [
      makeVideo({
        segmentId: 'intro',
        url: 'https://vimeo.com/face-web58.mp4',
        alt: 'worried tenant face close up packing boxes apartment',
        query: 'worried tenant face packing',
        source: 'Bing web video',
        sourceUrl: 'https://vimeo.com/face-web58',
      }),
      ...Array.from({ length: 3 }, (_, i) => makeVideo({
        segmentId: segments[i % 3].id,
        url: `https://vimeo.com/housing-web58-${i}.mp4`,
        alt: 'apartment interior hallway tenant eviction packing boxes',
        query: 'apartment eviction packing',
        source: 'Bing web video',
        sourceUrl: `https://vimeo.com/housing-web58-${i}`,
      })),
    ];
    const proj = { topic: HOUSING_TOPIC, title: 'Housing crash', script: segments, media };
    const result = evaluateHarvestVolumeWithSoftPass({
      volumePass: false,
      archiveLiveFetched: 4,
      videoTopUp: Array.from({ length: 4 }, (_, i) => ({ id: `t${i}` })),
    }, proj);
    expect(result.pass).toBe(true);
    expect(result.reason).toMatch(/^soft-pass-motion-housing\(/);
  });

  it('keyless housing still fails below 4 unique videos even with intro-face', () => {
    const segments = [{ id: 'intro' }, { id: 'body' }, { id: 'outro' }];
    const media = [
      makeVideo({
        segmentId: 'intro',
        url: 'https://vimeo.com/face-thin.mp4',
        alt: 'worried tenant face close up eviction apartment',
        query: 'worried tenant face',
        source: 'Bing web video',
        sourceUrl: 'https://vimeo.com/face-thin',
      }),
      ...Array.from({ length: 2 }, (_, i) => makeVideo({
        segmentId: segments[i % 3].id,
        url: `https://vimeo.com/housing-thin-${i}.mp4`,
        alt: 'apartment interior hallway tenant packing boxes',
        query: 'apartment packing',
        source: 'Bing web video',
        sourceUrl: `https://vimeo.com/housing-thin-${i}`,
      })),
    ];
    const proj = { topic: HOUSING_TOPIC, title: 'Housing crash', script: segments, media };
    const result = evaluateHarvestVolumeWithSoftPass({
      volumePass: false,
      archiveLiveFetched: 2,
      videoTopUp: Array.from({ length: 3 }, (_, i) => ({ id: `t${i}` })),
    }, proj);
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/soft-pass-motion-housing-thin\(3\/4/);
  });
});

describe('checkIntroFacePool — housing aviation/group-photo demote (web30)', () => {
  const project = (videos) => ({
    topic: HOUSING_TOPIC,
    title: 'Housing crash',
    script: [{ id: 'intro' }, { id: 'body' }],
    media: videos,
  });

  it('fails with INTRO_FACE_FAIL when pool has only jet-engine aviation pads', () => {
    const result = checkIntroFacePool(project([
      makeVideo({ alt: 'jet engine close-up roar sound aircraft', query: 'housing move out packing' }),
    ]));
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/^INTRO_FACE_FAIL/);
  });

  it('fails with INTRO_FACE_FAIL when pool has only group-photo corporate stock', () => {
    const result = checkIntroFacePool(project([
      makeVideo({ alt: 'group photo diverse people smiling corporate', query: 'housing market people' }),
    ]));
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/^INTRO_FACE_FAIL/);
  });

  it('fails with INTRO_FACE_FAIL when pool has only static-document / housing-price-chart clips (web31)', () => {
    const staticDocShots = [
      makeVideo({ alt: 'static document housing crash hidden report', query: 'housing crash document' }),
      makeVideo({ alt: 'housing price index chart graphic document only', query: 'housing price index' }),
      makeVideo({ alt: 'eviction notice only paper text close-up', query: 'eviction document' }),
    ];
    for (const video of staticDocShots) {
      const result = checkIntroFacePool(project([video]));
      expect(result.pass).toBe(false);
      expect(result.reason).toMatch(/^INTRO_FACE_FAIL/);
    }
  });

  it('passes when pool has shocked-face eviction-notice clip despite aviation pad in pool', () => {
    const result = checkIntroFacePool(project([
      makeVideo({ alt: 'jet engine close-up aircraft', query: 'move out packing' }),
      makeVideo({ alt: 'shocked face close up eviction notice apartment tenant' }),
    ]));
    expect(result.pass).toBe(true);
  });
});

describe('checkIntroFacePool — healthcare', () => {
  const project = (videos) => ({
    topic: HEALTHCARE_TOPIC,
    title: 'AI Healthcare',
    script: [{ id: 'intro' }, { id: 'body' }],
    media: videos,
  });

  it('passes when pool has clinician+screen clip', () => {
    const result = checkIntroFacePool(project([
      makeVideo({ alt: 'doctor pointing at mri monitor radiologist workstation screen' }),
    ]));
    expect(result.pass).toBe(true);
  });

  it('passes when pool has surgical-robot OR clip', () => {
    const result = checkIntroFacePool(project([
      makeVideo({ alt: 'surgical robot operating room da vinci surgery' }),
    ]));
    expect(result.pass).toBe(true);
  });

  it('passes when pool has worried patient face + hospital clip', () => {
    const result = checkIntroFacePool(project([
      makeVideo({ alt: 'worried patient face close up hospital clinic medical exam' }),
    ]));
    expect(result.pass).toBe(true);
  });

  it('fails with INTRO_FACE_FAIL when pool has only news-desk talking-head clips', () => {
    const result = checkIntroFacePool(project([
      makeVideo({ alt: 'news anchor studio desk talking head healthcare segment' }),
      makeVideo({ alt: 'webinar host lecture slides healthcare revolution presentation' }),
    ]));
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/^INTRO_FACE_FAIL/);
    expect(result.reason).toMatch(/healthcare/i);
  });

  it('evaluateHarvestVolumeWithSoftPass returns INTRO_FACE_FAIL for healthcare pool with no clinical/face clips', () => {
    const segments = [{ id: 'intro' }, { id: 'body' }, { id: 'outro' }];
    // Clips are topically relevant (hospital/healthcare) so ensureTopicalVideoCoverage passes,
    // but none have a clinician+screen or readable face + healthcare signal — INTRO_FACE_FAIL fires.
    const media = Array.from({ length: 9 }, (_, i) => makeVideo({
      segmentId: segments[i % 3].id,
      url: `https://example.com/hosp${i}.mp4`,
      alt: 'hospital corridor hallway medical floor healthcare facility administrative wing',
      query: 'hospital corridor healthcare',
      source: 'Bing web video',
    }));
    const proj = { topic: HEALTHCARE_TOPIC, title: 'AI Healthcare', script: segments, media };
    const result = evaluateHarvestVolumeWithSoftPass({
      volumePass: false,
      archiveLiveFetched: 4,
      videoTopUp: Array.from({ length: 9 }, (_, i) => ({ id: `t${i}` })),
    }, proj);
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/^INTRO_FACE_FAIL/);
  });

  it('evaluateHarvestVolumeWithSoftPass passes healthcare pool with surgical-robot clip', () => {
    const segments = [{ id: 'intro' }, { id: 'body' }, { id: 'outro' }];
    const media = [
      makeVideo({
        segmentId: 'intro',
        url: 'https://vimeo.com/robot1.mp4',
        alt: 'da vinci surgical robot operating room surgery hospital',
        query: 'surgical robot OR',
        source: 'Bing web video',
        sourceUrl: 'https://vimeo.com/robot1',
      }),
      ...Array.from({ length: 7 }, (_, i) => makeVideo({
        segmentId: segments[i % 3].id,
        url: `https://example.com/doc${i}.mp4`,
        alt: 'doctor hospital clinic medical diagnosis patient',
        query: 'doctor hospital',
        source: 'Bing web video',
      })),
    ];
    const proj = { topic: HEALTHCARE_TOPIC, title: 'AI Healthcare', script: segments, media };
    const result = evaluateHarvestVolumeWithSoftPass({
      volumePass: false,
      archiveLiveFetched: 4,
      videoTopUp: Array.from({ length: 8 }, (_, i) => ({ id: `t${i}` })),
    }, proj);
    expect(result.pass).toBe(true);
  });
});

describe('housingOffTopicBrollReason — web78 luxury/packaging/sudan/treehouse rejects', () => {
  const ctx = HOUSING_TOPIC;
  const junk = [
    'the mansions at canyon springs san antonio first class living',
    'six sided packaging of panels and boards packaging various types',
    'sudanese refugees homes beyond borders dignity for refugees in cairo',
    'barcroft tv grandmother faces eviction from paradise treehouse',
    'volvo - moments that never happen',
  ];
  it.each(junk)('rejects "%s"', (haystack) => {
    expect(housingOffTopicBrollReason(haystack, ctx)).toMatch(/housing off-topic/);
  });
  it('keeps on-topic tenant eviction face clips', () => {
    expect(housingOffTopicBrollReason('worried tenant face close up eviction notice apartment', ctx)).toBe('');
  });
});

describe('healthcareOffTopicBrollReason — web61 corporate RSNA/training/slide rejects', () => {
  const junk = [
    'ai interoperability and workflow automation at rsna 2025 interview',
    'mindray n series user training part3 quick keys',
    'journal of diagnosis case reports 1',
    'kaggle slide notebook competition healthcare',
    'guerbet aimed 1 applied radiology',
    'nih data science and medicine what\'s possibly at the cutting edge',
    'corporate powerpoint slide presentation healthcare ai',
  ];
  it.each(junk)('rejects "%s"', (haystack) => {
    expect(healthcareOffTopicBrollReason(haystack, HEALTHCARE_TOPIC)).toMatch(/healthcare off-topic/);
  });
  it('rejects web64 ensemble-x / whitney / zero-g / tutorial pads', () => {
    const more = [
      'ensemble x your personal stratagem to build ensembled deep learning models',
      'whitney hatch heart patient interview robotic surgery',
      'chest x ray interpretation explained clearly how to read a chest xray',
      'dr richard gallagher gives an overview of the da vinci surgical robot',
      'onyx rad demonstration video digital imaging xray',
    ];
    for (const alt of more) {
      expect(healthcareOffTopicBrollReason(alt, HEALTHCARE_TOPIC)).toMatch(/healthcare off-topic/);
    }
  });
  it('keeps clinical OR / MRI motion', () => {
    expect(healthcareOffTopicBrollReason('da vinci surgical robot operating room patient', HEALTHCARE_TOPIC)).toBe('');
    expect(healthcareOffTopicBrollReason('mri scanner hospital radiologist clinician', HEALTHCARE_TOPIC)).toBe('');
  });
});

describe('healthcareOffTopicBrollReason — web61 srcpublishers / manuscript today / cassette rejects', () => {
  it('rejects srcpublishers.com URL', () => {
    expect(healthcareOffTopicBrollReason('https://srcpublishers.com/manuscript-today-submission', HEALTHCARE_TOPIC)).toMatch(/healthcare off-topic/);
  });
  it('rejects "manuscript today" promo slides', () => {
    expect(healthcareOffTopicBrollReason('manuscript today submission guidelines healthcare journal', HEALTHCARE_TOPIC)).toMatch(/healthcare off-topic/);
    expect(healthcareOffTopicBrollReason('MANUSCRIPT TODAY promo slide academic publishing', HEALTHCARE_TOPIC)).toMatch(/healthcare off-topic/);
  });
  it('rejects cassette glitch pads', () => {
    expect(healthcareOffTopicBrollReason('vhs cassette tape retro glitch aesthetic', HEALTHCARE_TOPIC)).toMatch(/healthcare off-topic/);
    expect(healthcareOffTopicBrollReason('cassette pad retro aesthetic intro', HEALTHCARE_TOPIC)).toMatch(/healthcare off-topic/);
  });
});

describe('healthcareSoftPassMotionFailureReason — web61 hard-rejects (kaggle/cassette/guerbet/rsna/srcpublishers)', () => {
  const makeJunkVideo = (altOverride, idx = 0) => ({
    type: 'video',
    segmentId: 'seg0',
    url: `https://vimeo.com/junk${idx}.mp4`,
    alt: altOverride,
    title: altOverride,
    query: 'healthcare ai',
    source: 'Bing web video',
  });

  const makeProject = (videos) => ({
    topic: HEALTHCARE_TOPIC,
    title: 'AI Healthcare',
    script: [{ id: 'seg0', title: 'Intro', narration: 'AI medicine.' }],
    media: videos,
  });

  it('flags soft-pass with hard-junk when 3+ kaggle pads dominate', () => {
    const project = makeProject([
      makeJunkVideo('kaggle notebook medical imaging classification', 0),
      makeJunkVideo('kaggle competition healthcare ai radiology', 1),
      makeJunkVideo('kaggle slide data science medicine', 2),
    ]);
    const reason = healthcareSoftPassMotionFailureReason(project, {});
    // kaggle may match healthcare-off-topic-broll (which lists kaggle) or kaggle-slide;
    // either way the pool is flagged as junk.
    expect(reason).toMatch(/soft-pass-motion-healthcare-junk/);
  });

  it('flags soft-pass with hard-junk when 3+ cassette glitch pads dominate', () => {
    const project = makeProject([
      makeJunkVideo('cassette tape vhs glitch retro aesthetic', 0),
      makeJunkVideo('cassette pad intro animation loop', 1),
      makeJunkVideo('vhs cassette retro video healthcare promo', 2),
    ]);
    const reason = healthcareSoftPassMotionFailureReason(project, {});
    expect(reason).toMatch(/soft-pass-motion-healthcare-junk/);
  });

  it('flags soft-pass with hard-junk when 3+ guerbet pads dominate', () => {
    const project = makeProject([
      makeJunkVideo('guerbet contrast injection product demo', 0),
      makeJunkVideo('guerbet aimed applied radiology imaging', 1),
      makeJunkVideo('guerbet radiology marketing video 2024', 2),
    ]);
    const reason = healthcareSoftPassMotionFailureReason(project, {});
    expect(reason).toMatch(/soft-pass-motion-healthcare-junk/);
  });

  it('flags soft-pass with hard-junk when 3+ srcpublishers/manuscript pads dominate', () => {
    const project = makeProject([
      makeJunkVideo('manuscript today submission medical journal', 0),
      makeJunkVideo('manuscript today healthcare publishing promo', 1),
      makeJunkVideo('MANUSCRIPT TODAY guidelines academic publishing', 2),
    ]);
    const reason = healthcareSoftPassMotionFailureReason(project, {});
    expect(reason).toMatch(/soft-pass-motion-healthcare-junk/);
  });
});

describe('housingOffTopicBrollReason — FKA Twigs music pad reject', () => {
  const ctx = HOUSING_TOPIC;
  it('rejects FKA Twigs music pad', () => {
    expect(housingOffTopicBrollReason('fka twigs ultraviolet official music video', ctx)).toMatch(/housing off-topic/);
    expect(housingOffTopicBrollReason('FKA Twigs two weeks music performance', ctx)).toMatch(/housing off-topic/);
  });
  it('keeps on-topic housing clips', () => {
    expect(housingOffTopicBrollReason('worried tenant face eviction notice apartment close-up', ctx)).toBe('');
  });
});

describe('housingOffTopicBrollReason — web152 Gwyneth ski-crash celebrity pad', () => {
  const ctx = HOUSING_TOPIC;
  it('rejects Gwyneth Paltrow ski-crash court celebrity stills', () => {
    expect(housingOffTopicBrollReason(
      'skynews gwyneth paltrow ski crash court case us star slammed',
      ctx,
    )).toMatch(/housing off-topic/);
    expect(housingOffTopicBrollReason('gwyneth paltrow ski crash court', ctx)).toMatch(/housing off-topic/);
  });
  it('keeps topical eviction stills', () => {
    expect(housingOffTopicBrollReason(
      'toledo woman receives eviction notice apartment rent',
      ctx,
    )).toBe('');
  });
});

describe('healthcareOffTopicBrollReason — web65/66 new junk patterns', () => {
  const ctx = 'AI beats your doctor healthcare hospital';
  it('rejects personal injury clinic MRI ads', () => {
    expect(healthcareOffTopicBrollReason('car accident doctor greenville sc mri scan at personal injury clinic', ctx)).toMatch(/off-topic/);
    expect(healthcareOffTopicBrollReason('personal injury doctor mri scan auto accident', ctx)).toMatch(/off-topic/);
  });
  it('rejects cabrini foundation fundraising appeal', () => {
    expect(healthcareOffTopicBrollReason('cabrini foundation surgical robot appeal', ctx)).toMatch(/off-topic/);
  });
  it('rejects veterinary imaging (animals not humans)', () => {
    expect(healthcareOffTopicBrollReason('veterinary imaging modalities explained x ray ct mri ultrasound', ctx)).toMatch(/off-topic/);
    expect(healthcareOffTopicBrollReason('veterinary radiology diagnostic imaging dogs cats', ctx)).toMatch(/off-topic/);
  });
  it('rejects after effects project templates', () => {
    expect(healthcareOffTopicBrollReason('doctor presenting medical cosmetic product after effects project template', ctx)).toMatch(/off-topic/);
  });
  it('rejects STEM program promos', () => {
    expect(healthcareOffTopicBrollReason('iamstemak the surgery techs high school program', ctx)).toMatch(/off-topic/);
    expect(healthcareOffTopicBrollReason('gcsc surgical services programs career education', ctx)).toMatch(/off-topic/);
  });
  it('rejects patient portal UI clips', () => {
    expect(healthcareOffTopicBrollReason('connect patient portal arizona diagnostic radiology arizona diagnostic', ctx)).toMatch(/off-topic/);
  });
  it('keeps legitimate surgical robot clips', () => {
    expect(healthcareOffTopicBrollReason('cnbc meet the surgical robot that can diagnose lung cancer', ctx)).toBe('');
    // web69: cambridge filmworks / versius promo titles are off-topic pads
    expect(healthcareOffTopicBrollReason('versius surgical robotic system cmr surgical cambridge filmworks', ctx)).toMatch(/off-topic/);
    // healthcare-web76: Science Nation Archive packs stamp logo spam
    expect(healthcareOffTopicBrollReason('science nation surgical robotics operating room hospital', ctx)).toMatch(/off-topic/);
  });
  it('keeps da Vinci surgical robot live OR footage', () => {
    expect(healthcareOffTopicBrollReason('the da vinci surgical robot dr richard gallagher operating room', ctx)).toBe('');
  });
});

describe('checkEditTimelineIntroFace — healthcare timeline gate', () => {
  function makeAsset(title, type = 'video') {
    return { id: title.slice(0, 10), type, title, alt: title, url: `https://archive.org/${title}` };
  }
  function makeProject(assets, timelineFirstSec = null) {
    const media = assets;
    const editTimeline = timelineFirstSec !== null
      ? [{ segmentId: 's1', startSec: timelineFirstSec, endSec: timelineFirstSec + 1, assetId: assets[0]?.id }]
      : assets.map((a, i) => ({ segmentId: 's1', startSec: i * 0.65, endSec: (i + 1) * 0.65, assetId: a.id }));
    return {
      topic: 'AI beats your doctor healthcare hospital',
      script: [{ id: 's1', title: 'Hook', duration: 18 }],
      media,
      editTimeline,
    };
  }

  it('passes when first 3s has a surgical robot video', () => {
    const project = makeProject([
      makeAsset('cnbc meet the surgical robot that can diagnose lung cancer'),
    ]);
    expect(checkEditTimelineIntroFace(project).pass).toBe(true);
  });

  it('passes when first 3s has a da Vinci OR video', () => {
    const project = makeProject([
      makeAsset('the da vinci surgical robot dr gallagher operating room'),
    ]);
    expect(checkEditTimelineIntroFace(project).pass).toBe(true);
  });

  it('fails when first 3s only has a personal injury clinic video', () => {
    const project = makeProject([
      makeAsset('car accident doctor mri scan personal injury clinic'),
    ]);
    const result = checkEditTimelineIntroFace(project);
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/INTRO_FACE_FAIL_TIMELINE/);
  });

  it('fails when first 3s only has cabrini foundation appeal', () => {
    const project = makeProject([
      makeAsset('cabrini foundation surgical robot appeal'),
    ]);
    const result = checkEditTimelineIntroFace(project);
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/INTRO_FACE_FAIL_TIMELINE/);
  });

  it('passes for non-healthcare topics without check', () => {
    const project = {
      topic: 'airline cabin pressure failure',
      media: [makeAsset('random clip')],
      editTimeline: [{ segmentId: 's1', startSec: 0, endSec: 1, assetId: 'random cli' }],
    };
    expect(checkEditTimelineIntroFace(project).pass).toBe(true);
  });

  it('passes when first 3s has radiologist mentioned in title', () => {
    const project = makeProject([
      makeAsset('radiologist reviewing mri scan at workstation monitor'),
    ]);
    expect(checkEditTimelineIntroFace(project).pass).toBe(true);
  });

  it('fails when first 3s video is the off-topic broll (veterinary imaging)', () => {
    const project = makeProject([
      makeAsset('veterinary imaging modalities ct mri ultrasound dogs'),
    ]);
    const result = checkEditTimelineIntroFace(project);
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/INTRO_FACE_FAIL_TIMELINE/);
  });

  // healthcare-web197: soft-pass then WATCH raw 4.2 — corridor / blurry-container openers
  // with bare "doctor" metadata must fail the first-3s gate.
  it('fails hospital corridor walking-away opener (web197)', () => {
    const project = makeProject([
      makeAsset('hospital corridor walking away nurses hallway footage'),
    ]);
    const result = checkEditTimelineIntroFace(project);
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/INTRO_FACE_FAIL_TIMELINE/);
  });

  it('fails blurry container opener (web197)', () => {
    const project = makeProject([
      makeAsset('blurry shipping container yard cargo containers aerial'),
    ]);
    const result = checkEditTimelineIntroFace(project);
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/INTRO_FACE_FAIL_TIMELINE/);
  });

  it('fails bare doctor walking corridor without face/OR/MRI (web197)', () => {
    const project = makeProject([
      makeAsset('doctor walking down hospital corridor hallway'),
    ]);
    const result = checkEditTimelineIntroFace(project);
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/INTRO_FACE_FAIL_TIMELINE/);
  });

  it('passes doctor face consultation in first 3s (web197)', () => {
    const project = makeProject([
      makeAsset('doctor face patient consultation close up hospital'),
    ]);
    expect(checkEditTimelineIntroFace(project).pass).toBe(true);
  });

  it('passes MRI scanner room clinical opener (web197)', () => {
    const project = makeProject([
      makeAsset('mri scanner room clinical hospital radiology'),
    ]);
    expect(checkEditTimelineIntroFace(project).pass).toBe(true);
  });

  it('repair swaps corridor opener for doctor-face clip in pool (web197)', () => {
    const corridor = {
      id: 'corr1',
      type: 'video',
      title: 'hospital corridor walking away nurses hallway',
      alt: 'hospital corridor walking away',
      url: 'https://archive.org/corr.mp4',
    };
    const face = {
      id: 'face1',
      type: 'video',
      title: 'doctor face patient consultation close up hospital',
      alt: 'doctor face patient consultation',
      url: 'https://archive.org/face.mp4',
    };
    const project = {
      topic: 'Why AI will change healthcare forever',
      script: [{ id: 's1', title: 'Hook', duration: 18 }],
      media: [corridor, face],
      editTimeline: [
        { segmentId: 's1', startSec: 0, endSec: 1.5, assetId: 'corr1' },
        { segmentId: 's1', startSec: 1.5, endSec: 3.0, assetId: 'corr1' },
      ],
    };
    expect(checkEditTimelineIntroFace(project).pass).toBe(false);
    const repaired = repairEditTimelineIntroFace(project);
    expect(repaired.repaired).toBe(true);
    expect(repaired.pass).toBe(true);
    expect(project.editTimeline[0].assetId).toBe('face1');
  });

  // healthcare-web198: tip 2ea80de corridor reject still insufficient — French
  // "faire face" + patients / recorded-call MRI / medics-backs / title-card led
  // the hook (WATCH raw 4.2). Hard-fail these metadata patterns.
  it('fails French faire-face + patients couloir opener (web198)', () => {
    const project = makeProject([
      makeAsset(
        'covid 19 face l afflux de patients l h pital de villeneuve saint georges '
        + 'une unit de r animation temporaire dans un couloir pour faire face l arriv e',
      ),
    ]);
    const result = checkEditTimelineIntroFace(project);
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/INTRO_FACE_FAIL_TIMELINE/);
  });

  it('fails recorded-call radiologist + mri error title card (web198)', () => {
    const project = makeProject([
      makeAsset(
        'recorded call american health imaging refuses to correct million dollar '
        + 'head injury mri error radiologist dr angus baird',
      ),
    ]);
    const result = checkEditTimelineIntroFace(project);
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/INTRO_FACE_FAIL_TIMELINE/);
  });

  it('fails medics backs / from behind / hallway walking openers (web198)', () => {
    for (const title of [
      'medics from behind hospital hallway walking away',
      'doctors backs to camera hospital corridor',
      'nurses walking away down hallway establishing shot',
      'title card only healthcare ai presentation slide',
    ]) {
      const project = makeProject([makeAsset(title)]);
      expect(checkEditTimelineIntroFace(project).pass).toBe(false);
    }
  });

  it('repair prefers doctor-face close-up over OR/MRI when both in pool (web198)', () => {
    const corridor = {
      id: 'corr1',
      type: 'video',
      title: 'medics from behind hospital hallway walking away',
      alt: 'medics backs hallway',
      url: 'https://archive.org/corr.mp4',
    };
    const robot = {
      id: 'robot1',
      type: 'video',
      title: 'surgical robot operating room da vinci',
      alt: 'surgical robot OR lights',
      url: 'https://archive.org/robot.mp4',
    };
    const face = {
      id: 'face1',
      type: 'video',
      title: 'doctor face patient consultation close up hospital',
      alt: 'doctor face close up',
      url: 'https://archive.org/face.mp4',
    };
    const project = {
      topic: 'Why AI will change healthcare',
      script: [{ id: 's1', title: 'Hook', duration: 18 }],
      // robot listed before face — repair must still prefer face (rank 4 > 2).
      media: [corridor, robot, face],
      editTimeline: [
        { segmentId: 's1', startSec: 0, endSec: 1.5, assetId: 'corr1' },
        { segmentId: 's1', startSec: 1.5, endSec: 3.0, assetId: 'corr1' },
      ],
    };
    expect(checkEditTimelineIntroFace(project).pass).toBe(false);
    const repaired = repairEditTimelineIntroFace(project);
    expect(repaired.repaired).toBe(true);
    expect(project.editTimeline[0].assetId).toBe('face1');
    expect(healthcareIntroRepairRank(face)).toBeGreaterThan(healthcareIntroRepairRank(robot));
  });
});

describe('healthcareIntroFaceEvidenceMatches — web197 corridor/face contract', () => {
  it('rejects corridor / building / blurry-container establishing', () => {
    expect(isHealthcareEstablishingOpener('hospital corridor walking away nurses')).toBe(true);
    expect(isHealthcareEstablishingOpener('blurry shipping container yard')).toBe(true);
    expect(healthcareIntroFaceEvidenceMatches('hospital corridor walking away nurses')).toBe(false);
    expect(healthcareIntroFaceEvidenceMatches('doctor walking down hospital corridor')).toBe(false);
    expect(healthcareIntroFaceEvidenceMatches('blurry container port aerial')).toBe(false);
  });

  it('accepts doctor/surgeon/patient face and OR/MRI/robot', () => {
    expect(healthcareIntroFaceEvidenceMatches('doctor face patient consultation close up')).toBe(true);
    expect(healthcareIntroFaceEvidenceMatches('worried patient face doctor hospital')).toBe(true);
    expect(healthcareIntroFaceEvidenceMatches('surgeon face operating room close up')).toBe(true);
    expect(healthcareIntroFaceEvidenceMatches('surgical robot operating room da vinci')).toBe(true);
    expect(healthcareIntroFaceEvidenceMatches('mri scanner room clinical hospital')).toBe(true);
    expect(healthcareIntroFaceEvidenceMatches('radiologist reviewing mri scan workstation monitor')).toBe(true);
  });
});

describe('healthcareIntroFaceEvidenceMatches — web198 backs/title-card contract', () => {
  it('rejects from-behind / medics-backs / title-card / French faire-face', () => {
    expect(isHealthcareIntroDeadAirOpener('medics from behind hospital hallway')).toBe(true);
    expect(isHealthcareIntroDeadAirOpener('doctors backs to camera corridor')).toBe(true);
    expect(isHealthcareIntroDeadAirOpener('title card only presentation slide')).toBe(true);
    expect(isHealthcareEstablishingOpener('dans un couloir pour faire face')).toBe(true);
    expect(healthcareIntroFaceEvidenceMatches(
      'covid 19 face l afflux de patients dans un couloir pour faire face',
    )).toBe(false);
    expect(healthcareIntroFaceEvidenceMatches(
      'recorded call radiologist mri error american health imaging',
    )).toBe(false);
    expect(healthcareIntroFaceEvidenceMatches('medics from behind walking away hallway')).toBe(false);
    expect(healthcareIntroFaceEvidenceMatches('title card healthcare ai beats doctor')).toBe(false);
    expect(healthcareClinicianOrPatientFace(
      'covid 19 face l afflux de patients dans un couloir',
    )).toBe(false);
    expect(healthcareStrongClinicalMotion(
      'recorded call radiologist mri error',
    )).toBe(false);
  });

  it('still accepts collocated face and visual OR/MRI/robot', () => {
    expect(healthcareClinicianOrPatientFace('doctor face close up hospital')).toBe(true);
    expect(healthcareStrongClinicalMotion('mri scanner room clinical')).toBe(true);
    expect(healthcareStrongClinicalMotion('surgical robot operating room')).toBe(true);
    expect(healthcareIntroRepairRank({
      title: 'doctor face patient consultation close up',
      type: 'video',
      url: 'https://x/a.mp4',
    })).toBe(4);
    expect(healthcareIntroRepairRank({
      title: 'surgical robot operating room da vinci',
      type: 'video',
      url: 'https://x/b.mp4',
    })).toBe(2);
    expect(healthcareIntroRepairRank({
      title: 'radiologist reviewing mri scan workstation monitor',
      type: 'video',
      url: 'https://x/c.mp4',
    })).toBe(1);
  });
});

describe('healthcareIntroFaceEvidenceMatches — web200 beauty/osteopathy junk', () => {
  it('rejects pretty woman face beauty stock', () => {
    expect(isHealthcareIntroBeautyOrClinicJunk(
      'close up view of pretty woman s face',
    )).toBe(true);
    expect(healthcareIntroFaceEvidenceMatches(
      'close up view of pretty woman s face close up view of pretty woman s face',
    )).toBe(false);
    expect(healthcareOffTopicBrollReason(
      'close up view of pretty woman s face',
      HEALTHCARE_TOPIC,
    )).toMatch(/beauty|osteopathy/i);
    expect(healthcareIntroRepairRank({
      title: 'close up view of pretty woman s face',
      type: 'video',
      url: 'https://x/pretty.mp4',
    })).toBe(0);
  });

  it('rejects osteopathy / holistic rehab clinic ads', () => {
    expect(isHealthcareIntroBeautyOrClinicJunk(
      'holisticrehabclinic osteopathy physiotherapy holborn wc1x',
    )).toBe(true);
    expect(healthcareIntroFaceEvidenceMatches(
      'holisticrehabclinic osteopathy physiotherapy holborn wc1x 8nw osteopathy our consultant osteopaths at holistic rehab clinic',
    )).toBe(false);
    expect(healthcareOffTopicBrollReason(
      'holisticrehabclinic osteopathy physiotherapy holborn',
      HEALTHCARE_TOPIC,
    )).toMatch(/beauty|osteopathy/i);
  });

  it('accepts surgeon face OR and radiologist MRI', () => {
    expect(healthcareIntroFaceEvidenceMatches(
      'surgeon face operating room close up',
    )).toBe(true);
    expect(healthcareIntroFaceEvidenceMatches(
      'radiologist reviewing mri scan workstation monitor',
    )).toBe(true);
    expect(isHealthcareIntroBeautyOrClinicJunk(
      'surgeon face operating room close up',
    )).toBe(false);
    expect(healthcareIntroClinicalEscape(
      'radiologist reviewing mri scan workstation monitor',
    )).toBe(true);
  });

  it('ranks consultation face > OR/robot > MRI screen', () => {
    const consultation = healthcareIntroRepairRank({
      title: 'doctor face patient consultation close up',
      type: 'video',
      url: 'https://x/consult.mp4',
    });
    const robot = healthcareIntroRepairRank({
      title: 'surgical robot operating room da vinci',
      type: 'video',
      url: 'https://x/robot.mp4',
    });
    const mri = healthcareIntroRepairRank({
      title: 'radiologist reviewing mri scan workstation monitor',
      type: 'video',
      url: 'https://x/mri.mp4',
    });
    expect(consultation).toBeGreaterThan(robot);
    expect(robot).toBeGreaterThan(mri);
    expect(mri).toBeGreaterThan(0);
  });

  it('allows clinical escape when beauty junk co-occurs with surgical robot', () => {
    expect(healthcareIntroFaceEvidenceMatches(
      'pretty woman face surgical robot operating room da vinci',
    )).toBe(true);
  });
});

describe('checkEditTimelineIntroFace — housing first-segment gate', () => {
  it('fails when opener is music/dartboard even if a later segment has a face', () => {
    const junk = {
      id: 'junk1',
      type: 'video',
      title: 'd d shostakovich piano concerto no 2 andante',
      alt: 'piano concerto',
      url: 'https://example.com/shostakovich.mp4',
      query: 'worried tenant face close up',
    };
    const face = {
      id: 'face1',
      type: 'video',
      title: 'family crying distressed evicted apartment door',
      alt: 'family crying distressed',
      url: 'https://example.com/evict.mp4',
    };
    const project = {
      topic: 'The housing crash they said would never happen',
      script: [
        { id: 'seg1', title: 'Hook', duration: 18 },
        { id: 'seg2', title: 'Body', duration: 18 },
      ],
      media: [junk, face],
      editTimeline: [
        { segmentId: 'seg1', startSec: 0, endSec: 1.3, assetId: 'junk1' },
        { segmentId: 'seg1', startSec: 1.3, endSec: 2.6, assetId: 'junk1' },
        // Later segment local startSec < 3 must NOT satisfy the gate
        { segmentId: 'seg2', startSec: 0, endSec: 1.3, assetId: 'face1' },
        { segmentId: 'seg2', startSec: 1.3, endSec: 2.6, assetId: 'face1' },
      ],
    };
    const result = checkEditTimelineIntroFace(project);
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/INTRO_FACE_FAIL_TIMELINE/);
  });

  it('ignores query-stamped face words on dartboard opener', () => {
    const dart = {
      id: 'dart1',
      type: 'video',
      title: 'viper 797 electronic dartboard featuring the regulation target face',
      alt: 'dartboard target face',
      url: 'https://vimeo.com/178327921',
      query: 'worried tenant face close up',
    };
    const project = {
      topic: 'The housing crash they said would never happen',
      script: [{ id: 'seg1', title: 'Hook', duration: 18 }],
      media: [dart],
      editTimeline: [{ segmentId: 'seg1', startSec: 0, endSec: 2, assetId: 'dart1' }],
    };
    const result = checkEditTimelineIntroFace(project);
    expect(result.pass).toBe(false);
  });

  it('passes when first segment opens on distressed tenant face', () => {
    const face = {
      id: 'face1',
      type: 'video',
      title: 'family crying distressed evicted apartment door',
      alt: 'family crying distressed',
      url: 'https://example.com/evict.mp4',
    };
    const project = {
      topic: 'The housing crash they said would never happen',
      script: [{ id: 'seg1', title: 'Hook', duration: 18 }],
      media: [face],
      editTimeline: [{ segmentId: 'seg1', startSec: 0, endSec: 2, assetId: 'face1' }],
    };
    expect(checkEditTimelineIntroFace(project).pass).toBe(true);
  });

  it('fails on scream-crying collection opener without tenant face', () => {
    const junk = {
      id: 'scream1',
      type: 'video',
      title: 'Everyone Crash Lost Scream Crying and Collection',
      alt: 'scream crying collection',
      url: 'https://example.com/scream.mp4',
    };
    const project = {
      topic: 'The housing crash they said would never happen',
      script: [{ id: 'seg1', title: 'Hook', duration: 18 }],
      media: [junk],
      editTimeline: [{ segmentId: 'seg1', startSec: 0, endSec: 2, assetId: 'scream1' }],
    };
    expect(checkEditTimelineIntroFace(project).pass).toBe(false);
  });

  it('rejects housing-web81 junk via off-topic broll', () => {
    expect(housingOffTopicBrollReason(
      '32 ect vs 200 find the best corrugated cardboard box for you',
      'housing crash eviction',
    )).toBeTruthy();
    expect(housingOffTopicBrollReason(
      'vacuum skin packaging machine vsp by kodipak',
      'housing crash eviction',
    )).toBeTruthy();
    expect(housingOffTopicBrollReason(
      'viper 797 electronic dartboard',
      'housing crash eviction',
    )).toBeTruthy();
    expect(housingOffTopicBrollReason(
      'In Nepal Crash, Pilot Met the Same Fate as Her Husband',
      'housing crash eviction',
    )).toBeTruthy();
  });

  it('rejects housing-web82 credit-repair / mortgage-protection / auction promo pads', () => {
    expect(housingOffTopicBrollReason(
      'Denied Credit Repair two months rent free housing crash is here',
      'housing crash eviction',
    )).toBeTruthy();
    expect(housingOffTopicBrollReason(
      'mortgage protection a mortgage protection plan is the smartest',
      'housing crash eviction',
    )).toBeTruthy();
    expect(housingOffTopicBrollReason(
      'manheim auction how to buy in person are you new to car auctions',
      'housing crash eviction',
    )).toBeTruthy();
    expect(housingOffTopicBrollReason(
      'mammoth real estate condos mammoth village properties',
      'housing crash eviction',
    )).toBeTruthy();
  });

  it('rejects housing-web83 psychology/motel/opioid/student-testimonial pads', () => {
    expect(housingOffTopicBrollReason(
      'understanding transcrisis states this presentation is an introduction',
      'housing crash eviction',
    )).toMatch(/housing off-topic/);
    expect(housingOffTopicBrollReason(
      'the last guest of the holloway motel tribeca teaser clip',
      'housing crash eviction',
    )).toMatch(/housing off-topic/);
    expect(housingOffTopicBrollReason(
      'family explores the tension of safety and danger gang culture and the opioid',
      'housing crash eviction',
    )).toMatch(/housing off-topic/);
    expect(housingOffTopicBrollReason(
      'prairie view a m student testimonial project prc helped me stay in school',
      'housing crash eviction',
    )).toMatch(/housing off-topic/);
    expect(housingOffTopicBrollReason(
      'interfaith adopt a family sponsors ellen clayton kershaw',
      'housing crash eviction',
    )).toMatch(/housing off-topic/);
    expect(housingOffTopicBrollReason(
      'worried tenant face eviction notice apartment close-up',
      'housing crash eviction',
    )).toBe('');
  });

  it('rejects housing-web84 motivational-quote poster + flash-flood gauge pads', () => {
    expect(housingOffTopicBrollReason(
      'stop worrying about future events that will never happen salesintroverts.com',
      'housing crash eviction',
    )).toMatch(/housing off-topic/);
    expect(housingOffTopicBrollReason(
      'flash floods how they happen flood gauge feet wqad.com',
      'housing crash eviction',
    )).toMatch(/housing off-topic/);
    expect(housingOffTopicBrollReason(
      'motivational quote poster inspirational graphic hexagon',
      'housing crash eviction',
    )).toMatch(/housing off-topic/);
    expect(housingOffTopicBrollReason(
      'worried tenant face eviction notice apartment close-up',
      'housing crash eviction',
    )).toBe('');
  });

  it('rejects housing-web85 uganda/NSFW/promo/blog pads that looped as slideshow B-roll', () => {
    expect(housingOffTopicBrollReason(
      "love is a message from uganda's gay transgender community",
      'housing crash eviction',
    )).toMatch(/housing off-topic/);
    expect(housingOffTopicBrollReason(
      "girlfriend's wetting by cianiemoo on vimeo",
      'housing crash eviction',
    )).toMatch(/housing off-topic/);
    expect(housingOffTopicBrollReason(
      'social media addiction isnt just kids these days',
      'housing crash eviction',
    )).toMatch(/housing off-topic/);
    expect(housingOffTopicBrollReason(
      'dharavi diary official trailer redevelopers are destroying the slum',
      'housing crash eviction',
    )).toMatch(/housing off-topic/);
    expect(housingOffTopicBrollReason(
      'national faith home buyers bernadine family testimonial',
      'housing crash eviction',
    )).toMatch(/housing off-topic/);
    expect(housingOffTopicBrollReason(
      'safe families for children introducing the merritts',
      'housing crash eviction',
    )).toMatch(/housing off-topic/);
    expect(housingOffTopicBrollReason(
      'shortform.com blog the cycle of poverty family crying',
      'housing crash eviction',
    )).toMatch(/housing off-topic/);
    expect(housingOffTopicBrollReason(
      'worried tenant face eviction notice apartment close-up',
      'housing crash eviction',
    )).toBe('');
  });

  it('rejects AI-generated illustration/digital-art pads by content tell, not just domain', () => {
    // housing-web85: shortform.com's blog illustration ("Evicted" door scene, digital
    // painting, no camera texture) was already domain-blocked, but the same digital-art
    // "family evicted" pad from a DIFFERENT blog/stock host must also be caught — the
    // domain allowlist alone would let the next AI-art blog straight back into the pool.
    expect(housingOffTopicBrollReason(
      'AI-generated illustration of a family evicted from their home',
      'housing crash eviction',
    )).toMatch(/AI-generated illustration/);
    expect(housingOffTopicBrollReason(
      'midjourney render evicted family standing at door',
      'housing crash eviction',
    )).toMatch(/AI-generated illustration/);
    expect(housingOffTopicBrollReason(
      'digital painting family looking at eviction notice',
      'housing crash eviction',
    )).toMatch(/AI-generated illustration/);
    expect(housingOffTopicBrollReason(
      "artist's impression of an evicted family outside their apartment",
      'housing crash eviction',
    )).toMatch(/AI-generated illustration/);
    expect(housingOffTopicBrollReason(
      'stable diffusion image of a family packing boxes',
      'housing crash eviction',
    )).toMatch(/AI-generated illustration/);
    // Real photojournalism must not be caught by the illustration reject.
    expect(housingOffTopicBrollReason(
      'family photo sitting on couch after wall collapsed in their home',
      'housing crash eviction',
    )).toBe('');
    expect(housingOffTopicBrollReason(
      'moving day photo family carrying boxes into u-haul truck',
      'housing crash eviction',
    )).toBe('');
  });
});

describe('housingIntroFaceEvidenceMatches — real DDG site:vimeo.com titles (waves 36-60)', () => {
  // These titles are live DuckDuckGo video-search results for the housingHostLead
  // site:vimeo.com queries after the ':' sanitizeQuery fix (23d3fe9) restored
  // Bing/Google/DDG hits for site:-scoped searches. They are genuine, downloadable
  // face+eviction stories the old narrow word list (singular tenant/family/woman/
  // man/couple only, `evict(?:ion|ed|s)?`) silently dropped.
  it('accepts real face+eviction Vimeo titles the narrow word list used to miss', () => {
    const realTitles = [
      "Barcroft TV: Grandmother Faces Eviction From 'Paradise' Treehouse",
      'Tenants Rise Up! Fighting for Housing Justice in the Bay Area',
      "One Man, One City, Three Evictions | The Human Cost of Rio's Growth",
      'Residents of a Little Havana mobile home are shocked by sudden eviction notice',
      'Dozens face eviction at downtown Las Vegas transitional housing complex',
    ];
    for (const title of realTitles) {
      expect(housingIntroFaceEvidenceMatches(title)).toBe(true);
    }
  });

  it('still rejects weak/off-topic Vimeo titles with no person+eviction signal', () => {
    const weakTitles = [
      'Housing Stability - Urban Institute',
      'Understanding and Preventing the Eviction Process',
      'D.D. Shostakovich. Piano Concerto No. 2, Andante.',
      'viper 797 electronic dartboard featuring the regulation target face',
      'Improving MRI Physics for Radiology Residents: Year One',
    ];
    for (const title of weakTitles) {
      expect(housingIntroFaceEvidenceMatches(title)).toBe(false);
    }
  });

  it('matches "evicting"/"evictions" verb and plural forms dropped by the old evict(?:ion|ed|s)? stem', () => {
    expect(housingIntroFaceEvidenceMatches('family evicting tenants from apartment')).toBe(true);
    expect(housingIntroFaceEvidenceMatches('tenant faces multiple evictions this year')).toBe(true);
  });

  it('matches plural family and kinship/status nouns missing from the old singular-only list', () => {
    expect(housingIntroFaceEvidenceMatches('families evicted from their apartment')).toBe(true);
    expect(housingIntroFaceEvidenceMatches('grandmother evicted from her home')).toBe(true);
    expect(housingIntroFaceEvidenceMatches('renter evicted after rent hike')).toBe(true);
    expect(housingIntroFaceEvidenceMatches('homeowner evicted by bank foreclosure')).toBe(true);
  });

  it('does not resurrect the already-rejected Barcroft/Paradise-treehouse pad despite matching person+eviction words', () => {
    // housingOffTopicBrollReason hard-rejects this exact title (tabloid treehouse
    // human-interest story, not a real housing-crisis eviction) upstream of the
    // evidence-matcher — evidence broadening must not bypass that reject.
    const title = "Barcroft TV: Grandmother Faces Eviction From 'Paradise' Treehouse";
    expect(housingOffTopicBrollReason(title.toLowerCase(), HOUSING_TOPIC)).toBeTruthy();
    const clip = { id: 'barcroft1', type: 'video', title, alt: title, url: 'https://vimeo.com/200166289' };
    const project = {
      topic: HOUSING_TOPIC,
      script: [{ id: 'seg1', title: 'Hook', duration: 18 }],
      media: [clip],
      editTimeline: [{ segmentId: 'seg1', startSec: 0, endSec: 2, assetId: 'barcroft1' }],
    };
    expect(checkIntroFacePool(project).pass).toBe(false);
    expect(checkEditTimelineIntroFace(project).pass).toBe(false);
  });

  it('checkIntroFacePool and checkEditTimelineIntroFace both pass on a real un-rejected eviction-notice clip', () => {
    const title = 'Residents of a Little Havana mobile home are shocked by sudden eviction notice';
    const clip = { id: 'havana1', type: 'video', title, alt: title, url: 'https://vimeo.com/200000001' };
    const project = {
      topic: HOUSING_TOPIC,
      script: [{ id: 'seg1', title: 'Hook', duration: 18 }],
      media: [clip],
      editTimeline: [{ segmentId: 'seg1', startSec: 0, endSec: 2, assetId: 'havana1' }],
    };
    expect(checkIntroFacePool(project).pass).toBe(true);
    expect(checkEditTimelineIntroFace(project).pass).toBe(true);
  });

  it('rejects housing-web153 false-positive intro-face pads (constable / radio caller)', () => {
    // Bare "face"/"shocked" + eviction used to clear these political/news pads.
    expect(housingIntroFaceEvidenceMatches(
      'constables face dangers while serving eviction notices maricopa county',
    )).toBe(false);
    expect(housingIntroFaceEvidenceMatches(
      'maajid nawaz shocked at caller s eviction over political views',
    )).toBe(false);
    // Still accept real emotion+face and person+eviction forms.
    expect(housingIntroFaceEvidenceMatches(
      'shocked face eviction notice apartment tenant',
    )).toBe(true);
    expect(housingIntroFaceEvidenceMatches(
      'west sussex man faces an eviction order from his littlehampton home',
    )).toBe(true);
    expect(housingIntroFaceEvidenceMatches(
      'Dozens face eviction at downtown Las Vegas transitional housing complex',
    )).toBe(true);
  });
});

describe('housingOffTopicBrollReason — web153 DM/Archive junk that soft-passed', () => {
  const ctx = HOUSING_TOPIC;
  it('rejects electric-shock / box-destruction / millionaire clickbait DM pads', () => {
    for (const alt of [
      'man gets electric shock watch man gets electric shock worldtalk on dailymotion',
      '16 seconds of moving box destruction watch 16 seconds of moving box destruction emjr',
      'millionaire returned home pretending to be poor to test his family what they did shocked him',
    ]) {
      expect(housingOffTopicBrollReason(alt, ctx)).toMatch(/housing off-topic/);
    }
  });

  it('rejects noida assault / mariupol war / committee-meeting / smart-growth promo pads', () => {
    for (const alt of [
      'when security guards assaulted a resident these visuals from a swanky noida apartment complex',
      'more than 100 turkish citizens are in occupied by russian military city mariupol',
      'comm services public safety and housing development committee meeting 9 12 2023',
      'a smart growth approach to affordable housing',
      'how affordable housing is transforming lives in cambridge 106 new units',
      'project connect glendale 2014',
      'constables face dangers while serving eviction notices maricopa county',
      'maajid nawaz shocked at caller s eviction over political views',
      'foreclosure illinois naperville naperville community television nctv17 public access tv',
    ]) {
      expect(housingOffTopicBrollReason(alt, ctx)).toMatch(/housing off-topic/);
    }
  });

  it('keeps real eviction/tenant face motion', () => {
    expect(housingOffTopicBrollReason(
      'worried tenant face close up eviction notice apartment',
      ctx,
    )).toBe('');
    expect(housingOffTopicBrollReason(
      'family crying eviction apartment packing boxes',
      ctx,
    )).toBe('');
  });
});

describe('healthcareOffTopicBrollReason — clinic promo pads', () => {
  const ctx = 'Why AI will change healthcare';
  it('rejects clinic promo / imaging-center ad junk', () => {
    expect(healthcareOffTopicBrollReason('clinic promo personal injury MRI', ctx)).toMatch(/off-topic/);
    expect(healthcareOffTopicBrollReason('imaging center promo advertisement commercial MRI', ctx)).toMatch(/off-topic/);
    expect(healthcareOffTopicBrollReason('free mri consultation promo walk-in', ctx)).toMatch(/off-topic/);
  });
  it('keeps clinical OR/MRI/face motion', () => {
    expect(healthcareOffTopicBrollReason('doctor face patient consultation close up hospital', ctx)).toBe('');
    expect(healthcareOffTopicBrollReason('radiologist face reviewing mri screen', ctx)).toBe('');
    expect(healthcareOffTopicBrollReason('surgical robot operating room patient', ctx)).toBe('');
  });
});

describe('healthcareOffTopicBrollReason — web69 medica/filmworks pads', () => {
  const HEALTHCARE_TOPIC = 'Why AI will change healthcare';
  it('rejects cambridge filmworks / medica 2013 / versius promo titles', () => {
    expect(healthcareOffTopicBrollReason(
      'versius surgical robotic system cmr surgical cambridge filmworks have partnered',
      HEALTHCARE_TOPIC,
    )).toMatch(/healthcare off-topic/);
    expect(healthcareOffTopicBrollReason(
      'wide and fsn at medica 2013 smart medical series',
      HEALTHCARE_TOPIC,
    )).toMatch(/healthcare off-topic/);
    expect(healthcareOffTopicBrollReason(
      'senhance surgical robotic system full length benefits',
      HEALTHCARE_TOPIC,
    )).toMatch(/healthcare off-topic/);
  });
});

describe('repairEditTimelineIntroFace — housing-web4/8/10 pool-vs-timeline', () => {
  it('swaps Chinatown eviction into first cut when dartboard led', () => {
    const junk = {
      id: 'junk1',
      type: 'video',
      title: 'viper 787 electronic dartboard begin your darts journey',
      alt: 'dartboard target face',
      url: 'https://example.com/dart.mp4',
      query: 'worried tenant face close up',
    };
    const good = {
      id: 'good1',
      type: 'video',
      title: 'torres save chinatown fights displacement as iconic dc businesses face eviction for new hotel',
      alt: 'chinatown fights displacement face eviction',
      url: 'https://example.com/chinatown.mp4',
    };
    const project = {
      topic: 'The housing crash they said would never happen',
      script: [{ id: 'seg1', title: 'Hook', duration: 18 }],
      media: [junk, good],
      editTimeline: [
        { segmentId: 'seg1', startSec: 0, endSec: 1.3, assetId: 'junk1' },
        { segmentId: 'seg1', startSec: 1.3, endSec: 2.6, assetId: 'junk1' },
      ],
    };
    expect(checkEditTimelineIntroFace(project).pass).toBe(false);
    const repaired = repairEditTimelineIntroFace(project);
    expect(repaired.repaired).toBe(true);
    expect(repaired.pass).toBe(true);
    expect(project.editTimeline[0].assetId).toBe('good1');
    expect(project.editTimeline[0].reason).toBe('intro-face-repair');
  });

  it('rejects NSF Science Nation branding as healthcare timeline opener (web71)', () => {
    const brand = {
      id: 'brand1',
      type: 'video',
      title: 'science nation surgical robotics national science foundation nsf science nation sciencenation',
      alt: 'science nation surgical robotics nsf',
      url: 'https://archive.org/sn.mp4',
    };
    const clinical = {
      id: 'cnbc1',
      type: 'video',
      title: 'cnbc meet the surgical robot that can diagnose lung cancer',
      alt: 'cnbc surgical robot diagnose lung cancer operating room',
      url: 'https://example.com/cnbc.mp4',
    };
    const project = {
      topic: 'Why AI will change healthcare',
      script: [{ id: 'seg1', title: 'Hook', duration: 18 }],
      media: [brand, clinical],
      editTimeline: [
        { segmentId: 'seg1', startSec: 0, endSec: 1.3, assetId: 'brand1' },
        { segmentId: 'seg1', startSec: 1.3, endSec: 2.6, assetId: 'brand1' },
      ],
    };
    expect(checkEditTimelineIntroFace(project).pass).toBe(false);
    const repaired = repairEditTimelineIntroFace(project);
    expect(repaired.repaired).toBe(true);
    expect(repaired.pass).toBe(true);
    expect(project.editTimeline[0].assetId).toBe('cnbc1');
  });

  it('rejects AWBUS product-pitch opener and swaps CNBC surgical robot (web73)', () => {
    const pitch = {
      id: 'pitch1',
      type: 'video',
      title: 'why is awbus a better choice over hand held ultrasound screening tom stavros md facr',
      alt: 'awbus better choice hand held ultrasound screening doctor',
      url: 'https://example.com/awbus.mp4',
    };
    const clinical = {
      id: 'cnbc1',
      type: 'video',
      title: 'cnbc meet the surgical robot that can diagnose lung cancer',
      alt: 'cnbc surgical robot diagnose lung cancer operating room',
      url: 'https://example.com/cnbc.mp4',
    };
    const project = {
      topic: 'Why AI will change healthcare',
      script: [{ id: 'seg1', title: 'Hook', duration: 18 }],
      media: [pitch, clinical],
      editTimeline: [
        { segmentId: 'seg1', startSec: 0, endSec: 1.3, assetId: 'pitch1' },
        { segmentId: 'seg1', startSec: 1.3, endSec: 2.6, assetId: 'pitch1' },
      ],
    };
    expect(checkEditTimelineIntroFace(project).pass).toBe(false);
    const repaired = repairEditTimelineIntroFace(project);
    expect(repaired.repaired).toBe(true);
    expect(repaired.pass).toBe(true);
    expect(project.editTimeline[0].assetId).toBe('cnbc1');
  });

  it('rejects healthcare-web75 angry-boy / regen-seminar injection pads', () => {
    expect(healthcareOffTopicBrollReason(
      'angry boy part i',
      'Why AI will change healthcare',
    )).toMatch(/healthcare off-topic/);
    expect(healthcareOffTopicBrollReason(
      'regen seminar ultrasound guided injections ultrasound knee demonstration',
      'Why AI will change healthcare',
    )).toMatch(/healthcare off-topic/);
    expect(healthcareOffTopicBrollReason(
      'dexter robotic surgery system operating room AI medicine',
      'Why AI will change healthcare',
    )).toBe('');
  });
});

describe('housingOffTopicBrollReason — web159 reality-TV/trailer/geopolitics/mental-health junk', () => {
  const ctx = HOUSING_TOPIC;

  it('rejects Bigg Boss / BBOTT / OTT reality-show eviction pads', () => {
    expect(housingOffTopicBrollReason(
      'bbott2 manisha rani father entry bigg boss eviction bigg boss ott2 bigg boss ott2 manisha rani s father will come in family week',
      ctx,
    )).toMatch(/housing off-topic/);
    expect(isHousingIntroJunkPad(
      'bbott2 manisha rani father entry bigg boss eviction',
    )).toBe(true);
  });

  it('rejects movie / official trailers that borrow eviction metaphors', () => {
    expect(housingOffTopicBrollReason(
      'bull street movie 2024 official trailer a woman faces the battle of her life when her estranged father s family tries to evict her and her grandmother',
      ctx,
    )).toMatch(/housing off-topic/);
    expect(housingIntroFaceEvidenceMatches(
      'bull street movie 2024 official trailer a woman faces the battle of her life when her estranged father s family tries to evict her and her grandmother',
    )).toBe(false);
  });

  it('rejects israeli-police / riot geopolitics and Vice/Flint charged-Russian pads', () => {
    expect(housingOffTopicBrollReason(
      'riot israeli police violence during salame 6 eviction on oct 4 2011',
      ctx,
    )).toMatch(/housing off-topic/);
    expect(housingOffTopicBrollReason(
      'flint charged russian eviction vice news tonight hbo',
      ctx,
    )).toMatch(/housing off-topic/);
  });

  it('rejects men\'s mental-health crisis pads scraped via housing crisis family', () => {
    expect(housingOffTopicBrollReason(
      'men s mental health a silent crisis with karen straughan london feb 27 2018',
      ctx,
    )).toMatch(/housing off-topic/);
  });

  it('rejects mortgage-fraud / timber-chronicles talking-head pads', () => {
    expect(housingOffTopicBrollReason(
      'your mortgage financing your home without falling for fraud with marie mcdonnell',
      ctx,
    )).toMatch(/housing off-topic/);
    expect(housingOffTopicBrollReason(
      'mortgage foreclosure rescue scams documentary video',
      ctx,
    )).toMatch(/housing off-topic/);
    expect(housingOffTopicBrollReason(
      '57 bill barnum s chronicles from eureka s timber roots to housing hurdles and sustainable futures',
      ctx,
    )).toMatch(/housing off-topic/);
  });

  it('keeps real tenant / grandmother / family eviction faces', () => {
    expect(housingOffTopicBrollReason('grandmother faces eviction apartment', ctx)).toBe('');
    expect(housingIntroFaceEvidenceMatches('grandmother faces eviction apartment')).toBe(true);
    expect(housingOffTopicBrollReason('west sussex man faces eviction', ctx)).toBe('');
    expect(housingIntroFaceEvidenceMatches('west sussex man faces eviction')).toBe(true);
    expect(housingOffTopicBrollReason(
      'worried tenant face close up eviction notice apartment',
      ctx,
    )).toBe('');
    expect(housingIntroFaceEvidenceMatches(
      'worried tenant face close up eviction notice apartment',
    )).toBe(true);
  });

  it('checkIntroFacePool fails when only web159 junk is in the pool', () => {
    const junk = [
      {
        id: 'j1', type: 'video', url: 'https://example.com/a.mp4',
        title: 'bbott2 manisha rani bigg boss eviction',
        alt: 'bbott2 manisha rani bigg boss eviction',
      },
      {
        id: 'j2', type: 'video', url: 'https://example.com/b.mp4',
        title: 'bull street movie 2024 official trailer grandmother evict',
        alt: 'bull street movie 2024 official trailer grandmother evict',
      },
      {
        id: 'j3', type: 'video', url: 'https://example.com/c.mp4',
        title: 'men s mental health a silent crisis with karen straughan',
        alt: 'men s mental health a silent crisis with karen straughan',
      },
    ];
    const result = checkIntroFacePool({
      topic: HOUSING_TOPIC,
      media: junk,
      script: [{ id: 'seg1', title: 'Hook', duration: 18 }],
    });
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/INTRO_FACE_FAIL/);
  });

  it('checkIntroFacePool passes with west sussex / grandmother tenant faces', () => {
    const result = checkIntroFacePool({
      topic: HOUSING_TOPIC,
      media: [
        {
          id: 'good1', type: 'video', url: 'https://example.com/good.mp4',
          title: 'west sussex man faces an eviction order from his littlehampton home',
          alt: 'west sussex man faces an eviction order from his littlehampton home',
        },
      ],
      script: [{ id: 'seg1', title: 'Hook', duration: 18 }],
    });
    expect(result.pass).toBe(true);
  });

  it('housingIntroRepairRank prefers documentary tenant eviction over weak lived-in', () => {
    const documentary = {
      id: 'doc1', type: 'video', url: 'https://example.com/doc.mp4',
      title: '670 low income tenants being evicted in san francisco documentary news footage',
      alt: '670 low income tenants being evicted in san francisco documentary news footage',
    };
    const weak = {
      id: 'weak1', type: 'video', url: 'https://example.com/weak.mp4',
      title: 'apartment interior living room close-up',
      alt: 'apartment interior living room close-up',
    };
    const trailer = {
      id: 'tr1', type: 'video', url: 'https://example.com/tr.mp4',
      title: 'bull street movie 2024 official trailer grandmother faces eviction',
      alt: 'bull street movie 2024 official trailer grandmother faces eviction',
    };
    expect(housingIntroRepairRank(documentary)).toBeGreaterThan(housingIntroRepairRank(weak));
    expect(housingIntroRepairRank(trailer)).toBe(0);
    expect(housingIntroRepairRank(documentary)).toBeGreaterThanOrEqual(2);
  });

  it('repairEditTimelineIntroFace swaps documentary tenant face ahead of trailer junk lead', () => {
    const trailer = {
      id: 'trailer1', type: 'video', url: 'https://example.com/tr.mp4',
      title: 'bull street movie 2024 official trailer grandmother faces eviction',
      alt: 'bull street movie 2024 official trailer grandmother faces eviction',
    };
    const tenant = {
      id: 'tenant1', type: 'video', url: 'https://example.com/tenant.mp4',
      title: 'west sussex man faces an eviction order from his littlehampton home',
      alt: 'west sussex man faces an eviction order from his littlehampton home',
    };
    const project = {
      topic: HOUSING_TOPIC,
      script: [{ id: 'seg1', title: 'Hook', duration: 18 }],
      media: [trailer, tenant],
      editTimeline: [
        // Trailer alone in the first 3s — tenant sits later so timeline gate fails.
        { segmentId: 'seg1', startSec: 0, endSec: 2.5, assetId: 'trailer1' },
        { segmentId: 'seg1', startSec: 4, endSec: 7, assetId: 'tenant1' },
      ],
    };
    expect(checkEditTimelineIntroFace(project).pass).toBe(false);
    const repaired = repairEditTimelineIntroFace(project);
    expect(repaired.pass).toBe(true);
    expect(project.editTimeline[0].assetId).toBe('tenant1');
  });
});
