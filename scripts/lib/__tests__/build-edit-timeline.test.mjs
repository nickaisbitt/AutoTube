import { describe, it, expect } from 'vitest';
import {
  introFaceTier,
  hasReadableFaceVisual,
  isHousingApartmentMotion,
  isHousingTalkingHeadMotion,
  isLandscapeOnlyIntroVisual,
  visualSubjectCluster,
  buildEditTimeline,
} from '../build-edit-timeline.mjs';

const HOUSING_TOPIC = 'The landlord algorithm that evicted tenants from rent-stabilized apartments';

// ---------------------------------------------------------------------------
// introFaceTier
// ---------------------------------------------------------------------------

describe('introFaceTier', () => {
  it('returns 0 for an asset with no face-like metadata', () => {
    const asset = { query: 'airplane runway', alt: 'runway tarmac at dusk', url: 'https://example.com/runway.jpg' };
    expect(introFaceTier(asset)).toBe(0);
  });

  it('returns 0 for a back-of-head shot (not a readable face)', () => {
    const asset = { query: 'passenger window', alt: 'back of head looking through airplane window', url: 'https://example.com/backhead.jpg' };
    expect(introFaceTier(asset)).toBe(0);
  });

  it('returns 1 for a generic readable face (non-topical)', () => {
    // needs both face term AND human role term for hasReadableFaceVisual
    const asset = {
      query: 'couple worried',
      alt: 'couple face worried portrait close-up people',
      url: 'https://example.com/couple.jpg',
    };
    expect(introFaceTier(asset, { airline: false, housing: false })).toBe(1);
  });

  it('returns 2 for a topical readable face on airline topic', () => {
    const asset = {
      query: 'passenger worried cabin',
      alt: 'passenger face worried airplane cabin close-up portrait people',
      url: 'https://example.com/pass.jpg',
    };
    expect(introFaceTier(asset, { airline: true, housing: false })).toBe(2);
  });

  it('returns 2 for a topical readable face on housing topic', () => {
    const asset = {
      query: 'tenant eviction letter',
      alt: 'tenant face worried eviction notice apartment close-up portrait people',
      url: 'https://example.com/tenant.jpg',
    };
    expect(introFaceTier(asset, { airline: false, housing: true })).toBe(2);
  });

  it('returns 1 for modern apartment motion without a strict face tag (housing)', () => {
    const asset = {
      query: 'modern apartment living room daylight',
      alt: 'modern apartment interior living room daylight',
      url: 'https://example.com/apt.mp4',
      type: 'video',
    };
    expect(isHousingApartmentMotion(asset)).toBe(true);
    expect(introFaceTier(asset, { airline: false, housing: true })).toBe(1);
  });

  it('returns -1 for landscape-only stock on housing topics', () => {
    const asset = {
      query: 'scenic lake',
      alt: 'aerial landscape mountain lake scenic view',
      url: 'https://archive.org/download/lake/lake.mp4',
      source: 'Archive.org live',
    };
    expect(isLandscapeOnlyIntroVisual(asset)).toBe(true);
    expect(introFaceTier(asset, { airline: false, housing: true })).toBe(-1);
  });

  it('treats Archive bay/war home-movie stock as landscape-only for housing intro', () => {
    const asset = {
      query: 'worried couple reading letter home',
      alt: 'vietnam war home movie of subic bay philippines re supply trip 1966 67',
      title: 'vietnam war home movie of subic bay philippines re supply trip 1966 67',
      url: 'https://archive.org/download/Gregg_Arthur_Subic_Bay_1966/Gregg_Arthur_Subic_Bay_1966.mp4',
      source: 'Archive.org live',
      type: 'video',
    };
    expect(isLandscapeOnlyIntroVisual(asset)).toBe(true);
    expect(introFaceTier(asset, { airline: false, housing: true })).toBe(-1);
  });

  it('treats suburban street establishing as landscape-only for housing intro', () => {
    const asset = {
      query: 'housing market crash phoenix',
      alt: 'suburban street residential neighborhood palm trees stucco homes',
      title: 'suburban street residential neighborhood palm trees',
      url: 'https://example.com/street.mp4',
      type: 'video',
    };
    expect(isLandscapeOnlyIntroVisual(asset)).toBe(true);
    expect(introFaceTier(asset, { airline: false, housing: true })).toBe(-1);
  });

  it('demotes tenant/rent webinars as low-energy housing openers', () => {
    const asset = {
      query: 'tenant eviction',
      alt: 'richmond rent program workshop webinar handling habitability problems tenant focused',
      title: 'richmond rent program workshop webinar handling habitability problems tenant focused',
      url: 'https://archive.org/download/rent/rent.mp4',
      source: 'Archive.org live',
      type: 'video',
    };
    expect(isHousingTalkingHeadMotion(asset)).toBe(true);
    // Still classified as talking-head motion, but never tiered as an intro lead (web17).
    expect(introFaceTier(asset, { airline: false, housing: true })).toBe(-1);
  });

  it('rejects sitting-in-chair and home-tour static openers on housing intro', () => {
    const chair = {
      query: 'tenant rent',
      alt: 'man sitting in a chair talking to camera desk zoom call',
      title: 'office chair webinar desk',
      url: 'https://example.com/chair.mp4',
      type: 'video',
    };
    const tour = {
      query: 'apartment interior',
      alt: '3bhk luxury apartment home tour walkthrough',
      title: '3bhk home tour million apartment',
      url: 'https://example.com/tour.mp4',
      type: 'video',
    };
    expect(introFaceTier(chair, { airline: false, housing: true })).toBe(-1);
    expect(introFaceTier(tour, { airline: false, housing: true })).toBe(-1);
  });

  it('rejects Rolfe Report / Periscope nest / dynamite openers on housing intro', () => {
    expect(introFaceTier({
      query: 'housing crash',
      alt: 'THE ROLFE REPORT WITH JOHN ROLFE thumbnail composite',
      title: 'rolfe report housing',
      url: 'https://example.com/rolfe.jpg',
      type: 'image',
    }, { airline: false, housing: true })).toBe(-1);
    expect(introFaceTier({
      query: 'for rent sign',
      alt: 'a ceiling on your home propaganda film periscopefilm bird nest',
      title: 'periscope film 18384',
      url: 'https://archive.org/download/18384/x.mp4',
      type: 'video',
    }, { airline: false, housing: true })).toBe(-1);
    expect(introFaceTier({
      query: 'ticking time bomb',
      alt: 'sticks of dynamite ticking time bomb alarm clock',
      title: 'time bomb stock',
      url: 'https://example.com/bomb.jpg',
      type: 'image',
    }, { airline: false, housing: true })).toBe(-1);
    expect(introFaceTier({
      query: 'tenant eviction',
      alt: 'the progress center from affordable housing to self sufficiency',
      title: 'progress center affordable housing',
      url: 'https://archive.org/download/progress/x.mp4',
      type: 'video',
    }, { airline: false, housing: true })).toBe(-1);
    expect(introFaceTier({
      query: 'apartment building',
      alt: 'county announces completion of apartment building inspection initiative',
      title: 'administrative officer podium',
      url: 'https://archive.org/download/county/x.mp4',
      type: 'video',
    }, { airline: false, housing: true })).toBe(-1);
  });

  it('rejects protest / rent-strike / tribunal openers on housing intro (web20)', () => {
    expect(introFaceTier({
      query: 'rent strike',
      alt: 'parkdale vs the ltb',
      title: 'parkdale vs the ltb',
      url: 'https://archive.org/download/parkdale/x.mp4',
      type: 'video',
    }, { airline: false, housing: true })).toBe(-1);
    expect(introFaceTier({
      query: 'tenant eviction',
      alt: 'Social Justice Tribunals Ontario tenants reject rent increase gavel',
      title: 'tribunal protest hearing',
      url: 'https://archive.org/download/tribunal/x.mp4',
      type: 'video',
    }, { airline: false, housing: true })).toBe(-1);
  });

  it('rejects RE/MAX for-sale, headset talking-head, and luxury tour openers on housing intro', () => {
    expect(introFaceTier({
      query: 'housing crash',
      alt: 'RE/MAX FOR SALE sign Kathy Bost suburban house yard sign',
      title: 'remax for sale sign',
      url: 'https://example.com/remax.jpg',
      type: 'image',
    }, { airline: false, housing: true })).toBe(-1);
    expect(introFaceTier({
      query: 'housing market',
      alt: 'realtor sign real estate sign suburban exterior',
      title: 'realtor yard sign',
      url: 'https://example.com/realtor.jpg',
      type: 'image',
    }, { airline: false, housing: true })).toBe(-1);
    // Headset / podcast-mic / YouTuber without "webinar" keyword (web19 contact sheet).
    expect(introFaceTier({
      query: 'housing crash explained',
      alt: 'youtuber gaming headset talking to camera podcast mic',
      title: 'subscribe button streamer setup',
      url: 'https://example.com/headset.mp4',
      type: 'video',
    }, { airline: false, housing: true })).toBe(-1);
    expect(introFaceTier({
      query: 'million apartment',
      alt: 'touring a 27 3 million apartment in nyc s one57 business insider',
      title: 'one57 luxury tour',
      url: 'https://archive.org/download/one57/x.mp4',
      type: 'video',
    }, { airline: false, housing: true })).toBe(-1);
    expect(introFaceTier({
      query: 'housing crash chart',
      alt: 'LendingTree bar chart housing crash infographic crater graphic',
      title: 'american home mortgage bankruptcy slide',
      url: 'https://example.com/chart.jpg',
      type: 'image',
    }, { airline: false, housing: true })).toBe(-1);
  });

  it('tiers AI radiology / clinician+screen as healthcare opener (2)', () => {
    const asset = {
      query: 'ai radiology doctor monitor screen',
      alt: 'clinician pointing at mri monitor ai radiology diagnosis',
      title: 'clinician pointing at mri monitor ai radiology diagnosis',
      url: 'https://vimeo.com/12345',
      type: 'video',
    };
    expect(introFaceTier(asset, { healthcare: true })).toBe(2);
  });

  it('demotes pure talking-head / rejects maternity and news studio for healthcare intro', () => {
    expect(introFaceTier({
      alt: 'ai healthcare talking head explainer interview',
      title: 'ai healthcare talking head explainer interview',
      url: 'https://archive.org/download/talk/talk.mp4',
      type: 'video',
    }, { healthcare: true })).toBe(0);
    expect(introFaceTier({
      alt: '1937 maternity ward hospital film archival',
      title: '1937 maternity ward hospital film archival',
      url: 'https://archive.org/download/mat/mat.mp4',
      type: 'video',
    }, { healthcare: true })).toBe(-1);
    expect(introFaceTier({
      alt: 'news talking head studio interview anchor desk',
      title: 'news talking head studio interview anchor desk',
      url: 'https://example.com/news.mp4',
      type: 'video',
    }, { healthcare: true })).toBe(-1);
  });

  it('rejects healthcare-web11 CNN10 / breast-implant / Vietnam / aerial adventure intro leads', () => {
    expect(introFaceTier({
      alt: 'cnn 10 host talking head red studio',
      title: 'cnn 10 healthcare segment',
      url: 'https://archive.org/download/cnn10/cnn10.mp4',
      type: 'video',
    }, { healthcare: true })).toBe(-1);
    expect(introFaceTier({
      alt: 'breast implants plastic surgery mathew epps',
      title: 'lowcountry lowdown breast implants',
      url: 'https://archive.org/download/epps/epps.mp4',
      type: 'video',
    }, { healthcare: true })).toBe(-1);
    expect(introFaceTier({
      alt: 'adventure eight paging dr ross medical city arlington aerial',
      title: 'medical city arlington establishing shot',
      url: 'https://archive.org/download/adv8/adv8.mp4',
      type: 'video',
    }, { healthcare: true })).toBe(-1);
    expect(introFaceTier({
      alt: 'garland isd baylor robotic surgery demo classroom students watching',
      title: 'da vinci surgical system overview',
      url: 'https://archive.org/download/garland/garland.mp4',
      type: 'video',
    }, { healthcare: true })).toBe(-1);
  });

  it('rejects exhibition-hall / trade-show / conference-booth openers on healthcare intro (web11 suit)', () => {
    // Conference-floor product demos — not clinical use — must never lead the hook.
    const exhibitionCases = [
      {
        alt: 'AI healthcare summit booth floor product demo',
        title: 'health IT summit exhibition hall healthcare AI',
        url: 'https://vimeo.com/summit123.mp4',
        type: 'video',
      },
      {
        alt: 'HIMSS conference expo floor healthcare IT booth',
        title: 'HIMSS 2024 medical technology exhibitor',
        url: 'https://example.com/himss.mp4',
        type: 'video',
      },
      {
        alt: 'medical trade show exhibition hall surgical robot product demonstration',
        title: 'healthcare trade show product demo',
        url: 'https://archive.org/download/tradeshow/ts.mp4',
        type: 'video',
      },
      {
        alt: 'suit walking conference floor AI healthcare summit expo booth',
        title: 'executive suit walk healthcare expo',
        url: 'https://example.com/suitwalk.mp4',
        type: 'video',
      },
    ];
    for (const asset of exhibitionCases) {
      expect(introFaceTier(asset, { healthcare: true })).toBe(-1);
    }
  });

  it('tiers OR surgical robot / radiologist workstation as healthcare opener (2)', () => {
    // CNBC-style titles and real OR clips should reliably get tier 2.
    const orCases = [
      {
        alt: 'CNBC surgical robot operating room hospital cancer diagnosis',
        title: 'CNBC surgical robot hospital',
        url: 'https://vimeo.com/cnbc_robot.mp4',
        type: 'video',
      },
      {
        alt: 'da Vinci robot surgery operating room patient procedure',
        title: 'da Vinci robotic surgery OR',
        url: 'https://vimeo.com/davinci.mp4',
        type: 'video',
      },
      {
        alt: 'radiologist workstation MRI screen monitor reading hospital',
        title: 'radiologist reviewing MRI workstation',
        url: 'https://vimeo.com/radwork.mp4',
        type: 'video',
      },
      {
        alt: 'robotic surgery OR lights surgeon operating table',
        title: 'robotic surgery operating room',
        url: 'https://vimeo.com/orsurgeon.mp4',
        type: 'video',
      },
    ];
    for (const asset of orCases) {
      expect(introFaceTier(asset, { healthcare: true })).toBe(2);
    }
  });
});


// ---------------------------------------------------------------------------
// visualSubjectCluster — cluster detection
// ---------------------------------------------------------------------------

describe('visualSubjectCluster', () => {
  it('classifies a person/face asset as human', () => {
    // query uses "person" not "port" to avoid matching the port/harbour cluster
    const asset = { alt: 'person close-up worried face expression', query: 'person face' };
    expect(visualSubjectCluster(asset)).toBe('human');
  });

  it('classifies a cockpit image as cockpit (takes priority over human)', () => {
    // cockpit is tested before human in the cluster function — document it explicitly
    const asset = { alt: 'pilot in cockpit flight deck', query: 'cockpit' };
    expect(visualSubjectCluster(asset)).toBe('cockpit');
  });

  it('classifies a runway as aircraft not human', () => {
    const asset = { alt: 'airplane on runway tarmac', query: 'runway' };
    expect(visualSubjectCluster(asset)).toBe('aircraft');
  });
});

// ---------------------------------------------------------------------------
// buildEditTimeline: 2-still hold extension
// ---------------------------------------------------------------------------

function makeBodyProject(assets, segDur = 10) {
  return {
    topic: 'test topic generic',
    script: [
      {
        id: 'seg1',
        type: 'body',
        duration: segDur,
        narration: 'This is a body segment with test narration content here.',
        title: 'Body segment',
      },
    ],
    media: assets.map((a, i) => ({ ...a, id: `a${i}`, segmentId: 'seg1' })),
  };
}

describe('buildEditTimeline: 2-still hold extension', () => {
  it('holds each still ≥4 s when only 2 still URLs exist in a body segment', () => {
    const project = makeBodyProject(
      [
        { type: 'image', url: 'https://example.com/still1.jpg', alt: 'landscape still one', query: 'still one' },
        { type: 'image', url: 'https://example.com/still2.jpg', alt: 'landscape still two', query: 'still two' },
      ],
      10,
    );
    const timeline = buildEditTimeline(project, { cutIntervalSec: 1.25 });
    // 10 s ÷ 4 s/clip → at most 3 entries (not 8 rapid 1.25 s cuts)
    expect(timeline.length).toBeLessThanOrEqual(3);
    // All entries except possibly the final tail should hold ≥4 s.
    // The last entry may be shorter if the segment duration doesn't divide evenly.
    const nonFinal = timeline.slice(0, -1);
    for (const entry of nonFinal) {
      expect(entry.endSec - entry.startSec).toBeGreaterThanOrEqual(3.9);
    }
    // Even at 1.25 s pacing without the fix we'd get ≥7 entries; ≤3 confirms the fix.
    expect(timeline.length).toBeGreaterThan(0);
  });

  it('does not extend holds when a video is available alongside stills', () => {
    const project = makeBodyProject(
      [
        { type: 'video', url: 'https://example.com/vid1.mp4', alt: 'video clip one', query: 'video one' },
        { type: 'image', url: 'https://example.com/still1.jpg', alt: 'still one', query: 'still one' },
      ],
      10,
    );
    const timeline = buildEditTimeline(project, { cutIntervalSec: 1.25 });
    // Normal 1.25 s pacing → ≥6 entries over 10 s
    expect(timeline.length).toBeGreaterThan(4);
  });

  it('does not extend holds for intro segments even with 2 stills', () => {
    const project = {
      topic: 'test topic generic',
      script: [
        {
          id: 'seg1',
          type: 'intro',
          duration: 10,
          narration: 'Intro narration content here.',
          title: 'Intro',
        },
      ],
      media: [
        { id: 'a0', segmentId: 'seg1', type: 'image', url: 'https://example.com/s1.jpg', alt: 'still one', query: 's1' },
        { id: 'a1', segmentId: 'seg1', type: 'image', url: 'https://example.com/s2.jpg', alt: 'still two', query: 's2' },
      ],
    };
    const timeline = buildEditTimeline(project, { cutIntervalSec: 1.25 });
    // Intro uses 0.65 s interval; ≥10 cuts over 10 s
    expect(timeline.length).toBeGreaterThan(8);
  });
});

// ---------------------------------------------------------------------------
// buildEditTimeline: introFaceTier human-cluster fallback
// ---------------------------------------------------------------------------

describe('buildEditTimeline: introFaceTier human-cluster fallback', () => {
  it('picks a human-cluster asset before a non-human one for the intro lead when no strict face exists', () => {
    // "person portrait" matches the human cluster but does NOT have the role-word+face-term
    // combo that hasReadableFaceVisual requires (so introFaceTier returns 0).
    // The new fallback should still prefer this over a runway/aerial asset.
    const project = {
      topic: 'generic test story',
      script: [
        {
          id: 'seg1',
          type: 'intro',
          duration: 5,
          narration: 'Hook narration here for the test.',
          title: 'Intro',
        },
      ],
      media: [
        // Human-cluster still (weak face signal — no explicit role word like "passenger")
        {
          id: 'human1',
          segmentId: 'seg1',
          type: 'image',
          url: 'https://example.com/person-portrait.jpg',
          alt: 'person close-up portrait',
          query: 'portrait',
        },
        // Aerial / establishing shot — no human signal
        {
          id: 'aerial1',
          segmentId: 'seg1',
          type: 'image',
          url: 'https://example.com/aerial.jpg',
          alt: 'aerial view city skyline',
          query: 'aerial',
        },
      ],
    };
    const timeline = buildEditTimeline(project, { cutIntervalSec: 1.25 });
    // First entry should use the portrait asset, not the aerial one
    const firstEntry = timeline[0];
    expect(firstEntry).toBeDefined();
    expect(firstEntry.assetId).toBe('human1');
  });
});

// ---------------------------------------------------------------------------
// buildEditTimeline: housing intro face/apartment over landscape
// ---------------------------------------------------------------------------

describe('buildEditTimeline: housing intro face/apartment over landscape', () => {
  it('opens the housing hook on a face clip, not landscape Archive', () => {
    const project = {
      topic: HOUSING_TOPIC,
      script: [
        {
          id: 'intro',
          type: 'intro',
          duration: 5,
          narration: 'Your landlord just raised the rent again overnight.',
          title: 'Intro',
        },
        {
          id: 'body',
          type: 'body',
          duration: 10,
          narration: 'Tenants across the city are facing algorithmic eviction notices.',
          title: 'Body',
        },
      ],
      media: [
        {
          id: 'lake',
          segmentId: 'intro',
          type: 'video',
          url: 'https://archive.org/download/lake/lake.mp4',
          alt: 'scenic mountain lake landscape aerial view',
          query: 'landscape lake',
          source: 'Archive.org live',
        },
        {
          id: 'face',
          segmentId: 'body',
          type: 'video',
          url: 'https://example.com/tenant-face.mp4',
          alt: 'tenant face worried eviction notice apartment close-up portrait people',
          query: 'worried tenant apartment',
          source: 'Bing web video',
        },
      ],
    };
    const timeline = buildEditTimeline(project, { cutIntervalSec: 1.25 });
    const first3s = timeline.filter((e) => e.segmentId === 'intro' && e.startSec < 3);
    expect(first3s.length).toBeGreaterThan(0);
    expect(first3s.every((e) => e.assetId === 'face')).toBe(true);
    expect(hasReadableFaceVisual(project.media.find((m) => m.id === 'face'))).toBe(true);
  });

  it('prefers modern apartment motion over landscape when no strict face exists', () => {
    const project = {
      topic: HOUSING_TOPIC,
      script: [
        {
          id: 'intro',
          type: 'intro',
          duration: 5,
          narration: 'Your landlord just raised the rent again overnight.',
          title: 'Intro',
        },
      ],
      media: [
        {
          id: 'lake',
          segmentId: 'intro',
          type: 'video',
          url: 'https://archive.org/download/lake/lake.mp4',
          alt: 'scenic mountain lake landscape aerial view',
          query: 'landscape lake',
          source: 'Archive.org live',
        },
        {
          id: 'apt',
          segmentId: 'intro',
          type: 'video',
          url: 'https://example.com/apt-interior.mp4',
          alt: 'modern apartment interior living room daylight',
          query: 'modern apartment living room',
          source: 'Bing web video',
        },
      ],
    };
    const timeline = buildEditTimeline(project, { cutIntervalSec: 1.25 });
    const first3s = timeline.filter((e) => e.startSec < 3);
    expect(first3s.length).toBeGreaterThan(0);
    expect(first3s.every((e) => e.assetId === 'apt')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildEditTimeline: strict reuse cap for thin keyless pools
// ---------------------------------------------------------------------------

function makeVideoPool(n, { source = 'Stock video pool', prefix = 'clip' } = {}) {
  return Array.from({ length: n }, (_, i) => ({
    id: `v${i}`,
    segmentId: 'seg1',
    type: 'video',
    url: `https://example.com/${prefix}${i}.mp4`,
    alt: `airline b-roll clip ${i} cabin aircraft`,
    query: 'airline aircraft cabin',
    source,
  }));
}

function reuseCounts(timeline, windowSec = null) {
  const counts = new Map();
  for (const e of timeline) {
    if (windowSec != null && e.startSec >= windowSec) continue;
    counts.set(e.assetId, (counts.get(e.assetId) || 0) + 1);
  }
  return counts;
}

describe('buildEditTimeline: strict reuse cap (thin keyless pools)', () => {
  it('caps a dominant archive/sim clip at ≤2 in the first 30s when alternatives exist (airline-v2 repro)', () => {
    // The airline-v2 failure: a lone flight-sim archive clip is the only
    // non-"aircraft" cluster, so the consecutive-cluster rule funnelled every
    // other pick back onto it — it appeared ≥3× in the opening sample even
    // though five fresh airline clips were available. The strict window cap
    // must hold it (and every URL) to ≤2 across the opening 30s.
    const project = {
      topic: 'airline emergency mystery',
      script: [
        {
          id: 'seg1',
          type: 'body',
          duration: 150,
          narration: 'The airline flight faced an emergency as the aircraft cabin filled with worried passengers and crew members.',
          title: 'Body',
        },
      ],
      media: [
        {
          id: 'sim',
          segmentId: 'seg1',
          type: 'video',
          url: 'https://archive.org/download/flightsim/flightsim.mp4',
          alt: 'airplane cockpit flight simulator aviation jet flight deck aircraft cabin passenger',
          query: 'flight simulator cockpit aircraft cabin',
          source: 'Archive.org live',
        },
        ...Array.from({ length: 5 }, (_, i) => ({
          id: `fresh${i}`,
          segmentId: 'seg1',
          type: 'video',
          url: `https://example.com/fresh${i}.mp4`,
          alt: `airplane clip ${i}`,
          query: 'airplane',
          source: 'Pexels Videos',
        })),
      ],
    };
    const timeline = buildEditTimeline(project, { cutIntervalSec: 1.25 });
    const first30 = reuseCounts(timeline, 30);
    expect(first30.get('sim') || 0).toBeLessThanOrEqual(2);
    expect(Math.max(...first30.values())).toBeLessThanOrEqual(2);
  });

  it('holds a repeated source URL to ≤2 within the first 30s window when alternatives exist', () => {
    // Broad pool, long (non-short) video: the opening 30s must never loop a
    // single clip past twice while fresh URLs remain reachable.
    const project = {
      topic: 'airline emergency mystery',
      script: [
        {
          id: 'seg1',
          type: 'body',
          duration: 150,
          narration: 'The airline flight faced an emergency as the aircraft cabin filled with worried passengers and crew.',
          title: 'Body',
        },
      ],
      media: makeVideoPool(14),
    };
    const timeline = buildEditTimeline(project, { cutIntervalSec: 1.25 });
    const counts = reuseCounts(timeline, 30);
    const maxReuse = Math.max(...counts.values());
    expect(maxReuse).toBeLessThanOrEqual(2);
  });

  it('relaxes the cap when the pool is too thin for an alternative to exist', () => {
    // Only 2 clips over 20s: no third URL to cut to, so reuse past twice is the
    // best available coverage. The cap must not starve the timeline into gaps.
    const project = {
      topic: 'airline emergency mystery',
      script: [
        {
          id: 'seg1',
          type: 'body',
          duration: 20,
          narration: 'The airline flight faced an emergency as the aircraft cabin filled with passengers.',
          title: 'Body',
        },
      ],
      media: makeVideoPool(2),
    };
    const timeline = buildEditTimeline(project, { cutIntervalSec: 1.25 });
    // Full coverage: cuts span the whole segment with no gap.
    expect(timeline.length).toBeGreaterThan(0);
    expect(timeline[timeline.length - 1].endSec).toBeGreaterThanOrEqual(19.9);
  });

  it('demotes a repeated archive/sim clip below a fresher lower-scoring clip', () => {
    // A highly-topical flight-sim archive clip must not be reused a second time
    // ahead of a fresh, less-topical airline clip: after its first use the
    // archive/sim penalty demotes it so variety wins the next slot.
    const project = {
      topic: 'airline emergency mystery',
      script: [
        {
          id: 'seg1',
          type: 'body',
          duration: 10,
          narration: 'The airline flight faced an emergency as the aircraft cabin filled with passengers.',
          title: 'Body',
        },
      ],
      media: [
        {
          id: 'sim',
          segmentId: 'seg1',
          type: 'video',
          url: 'https://archive.org/download/flightsim/flightsim.mp4',
          alt: 'airplane cockpit flight simulator aviation jet flight deck aircraft cabin',
          query: 'flight simulator cockpit aircraft',
          source: 'Archive.org live',
        },
        {
          id: 'fresh',
          segmentId: 'seg1',
          type: 'video',
          url: 'https://example.com/fresh.mp4',
          alt: 'airplane cabin aisle',
          query: 'airline cabin',
          source: 'Pexels Videos',
        },
      ],
    };
    const timeline = buildEditTimeline(project, { cutIntervalSec: 1.25 });
    const counts = reuseCounts(timeline);
    // The sim clip is used at most as often as the fresh clip — never looped.
    expect(counts.get('sim') || 0).toBeLessThanOrEqual(counts.get('fresh') || 0);
  });
});

// ---------------------------------------------------------------------------
// buildEditTimeline: rich-pool short holds (≥12 unique URLs)
// ---------------------------------------------------------------------------

function makeRichPool(n, { topic = 'airline emergency mystery', segDur = 60 } = {}) {
  return {
    topic,
    script: [
      {
        id: 'seg1',
        type: 'body',
        duration: segDur,
        narration: 'The airline flight faced an emergency as the aircraft cabin filled with worried passengers and crew members.',
        title: 'Body',
      },
    ],
    media: Array.from({ length: n }, (_, i) => ({
      id: `v${i}`,
      segmentId: 'seg1',
      type: 'video',
      url: `https://example.com/clip${i}.mp4`,
      alt: `airline b-roll clip ${i} cabin aircraft passenger`,
      query: 'airline aircraft cabin',
      source: 'Pexels Videos',
    })),
  };
}

describe('buildEditTimeline: rich-pool short holds', () => {
  it('caps body holds at ≤1.5s when pool has ≥12 unique video URLs', () => {
    const project = makeRichPool(14, { segDur: 30 });
    const timeline = buildEditTimeline(project, { cutIntervalSec: 1.25 });
    expect(timeline.length).toBeGreaterThan(0);
    // With ≥12 URLs, effectiveCut ≤ 1.5s → ≥12 cuts in 30s, not 3–5 long holds
    const nonFinal = timeline.slice(0, -1);
    for (const entry of nonFinal) {
      expect(entry.endSec - entry.startSec).toBeLessThanOrEqual(1.6); // 1.5 + float tolerance
    }
    // At 1.5s max per cut, 30s → at least 18 entries
    expect(timeline.length).toBeGreaterThanOrEqual(18);
  });

  it('caps body holds at ≤1.5s when pool is ≥2× segment count (relative threshold)', () => {
    // 3 script segments, 8 unique clips (8 ≥ 8 minimum AND 8 ≥ 2×3=6 → rich pool)
    const project = {
      topic: 'airline emergency mystery',
      script: [
        { id: 'seg1', type: 'intro', duration: 5, narration: 'Hook here.', title: 'Intro' },
        { id: 'seg2', type: 'body', duration: 20, narration: 'The airline flight faced an emergency with worried passengers.', title: 'Body' },
        { id: 'seg3', type: 'outro', duration: 5, narration: 'Subscribe.', title: 'Outro' },
      ],
      media: Array.from({ length: 8 }, (_, i) => ({
        id: `v${i}`,
        segmentId: i < 4 ? 'seg2' : 'seg2',
        type: 'video',
        url: `https://example.com/clip${i}.mp4`,
        alt: `airline clip ${i} aircraft cabin passenger face`,
        query: 'airline aircraft',
        source: 'Pexels Videos',
      })),
    };
    const timeline = buildEditTimeline(project, { cutIntervalSec: 1.25 });
    const bodyEntries = timeline.filter((e) => e.segmentId === 'seg2');
    const nonFinal = bodyEntries.slice(0, -1);
    for (const entry of nonFinal) {
      expect(entry.endSec - entry.startSec).toBeLessThanOrEqual(1.6);
    }
    // 20s body at ≤1.5s → at least 12 body entries
    expect(bodyEntries.length).toBeGreaterThanOrEqual(12);
  });

  it('does NOT apply rich-pool short-hold cap to a thin pool (< 12 and < 2× seg count)', () => {
    // 4 unique clips for a body segment — thin pool, should use up to 2.5s holds
    const project = makeRichPool(4, { segDur: 20 });
    const timeline = buildEditTimeline(project, { cutIntervalSec: 1.25 });
    // Thin pool: hardMaxReuse will stretch holds beyond 1.5s to fill coverage
    // when all clips hit their per-segment reuse limit; let it — just verify
    // we still get full coverage.
    expect(timeline.length).toBeGreaterThan(0);
    expect(timeline[timeline.length - 1].endSec).toBeGreaterThanOrEqual(19.9);
  });

  it('no single URL appears more than once in the first 15s of a rich pool', () => {
    // 16 unique clips, 45s body — rich pool: first 15s must cycle through
    // fresh clips without repeating any URL.
    const project = makeRichPool(16, { segDur: 45 });
    const timeline = buildEditTimeline(project, { cutIntervalSec: 1.25 });
    const countsFirst15 = reuseCounts(timeline, 15);
    const maxReuseFirst15 = countsFirst15.size ? Math.max(...countsFirst15.values()) : 0;
    expect(maxReuseFirst15).toBeLessThanOrEqual(1);
  });

  it('≤2 cap still holds in first 30s for rich pool (existing contract)', () => {
    const project = makeRichPool(16, { segDur: 60 });
    const timeline = buildEditTimeline(project, { cutIntervalSec: 1.25 });
    const counts30 = reuseCounts(timeline, 30);
    expect(Math.max(...counts30.values())).toBeLessThanOrEqual(2);
  });

  it('rich-pool hold cap does not starve coverage on a rich airline-web scenario (26 clips)', () => {
    // Matches the failing audit scenario: 26 web motion clips injected.
    const project = makeRichPool(26, { segDur: 120 });
    const timeline = buildEditTimeline(project, { cutIntervalSec: 1.25 });
    // Full coverage
    expect(timeline[timeline.length - 1].endSec).toBeGreaterThanOrEqual(119.9);
    // Body holds ≤ 1.5s throughout
    const nonFinal = timeline.slice(0, -1);
    for (const entry of nonFinal) {
      expect(entry.endSec - entry.startSec).toBeLessThanOrEqual(1.6);
    }
    // First 15s: each URL used at most once
    const countsFirst15 = reuseCounts(timeline, 15);
    expect(Math.max(...countsFirst15.values())).toBeLessThanOrEqual(1);
    // First 30s: each URL used at most twice
    const counts30 = reuseCounts(timeline, 30);
    expect(Math.max(...counts30.values())).toBeLessThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// buildEditTimeline: housing / medium-pool first-15s reuse + early motion
// ---------------------------------------------------------------------------

const HOUSING_CRASH_TOPIC = 'The housing crash they said would never happen';

function makeHousingVideoPool(n, { segDur = 45, prefix = 'hclip' } = {}) {
  return {
    topic: HOUSING_CRASH_TOPIC,
    script: [
      {
        id: 'seg1',
        type: 'body',
        duration: segDur,
        narration: 'Landlords and tenants faced eviction notices as the housing market crashed overnight across apartment buildings.',
        title: 'Body',
      },
    ],
    media: Array.from({ length: n }, (_, i) => ({
      id: `h${i}`,
      segmentId: 'seg1',
      type: 'video',
      url: `https://example.com/${prefix}${i}.mp4`,
      alt: `apartment tenant landlord clip ${i} face worried eviction`,
      query: 'apartment tenant eviction',
      source: 'Pexels Videos',
    })),
  };
}

describe('buildEditTimeline: housing / medium-pool first-15s reuse caps', () => {
  it('caps each URL at ≤1 in the first 15s for a medium (8-URL) housing pool', () => {
    // Keyless housing often lands in the 6–11 URL band — below the rich-pool
    // threshold of 12 — so first-15s single-use must still apply.
    const project = makeHousingVideoPool(8, { segDur: 40 });
    const timeline = buildEditTimeline(project, { cutIntervalSec: 1.25, maxReusePerUrl: 1 });
    const countsFirst15 = reuseCounts(timeline, 15);
    expect(countsFirst15.size).toBeGreaterThan(0);
    expect(Math.max(...countsFirst15.values())).toBeLessThanOrEqual(1);
    // Full coverage preserved (watch floors untouched).
    expect(timeline[timeline.length - 1].endSec).toBeGreaterThanOrEqual(39.9);
  });

  it('honors maxReusePerUrl=1 for housing (hardMax ≤3, no 6× loops)', () => {
    const project = makeHousingVideoPool(6, { segDur: 60 });
    const timeline = buildEditTimeline(project, { cutIntervalSec: 1.25, maxReusePerUrl: 1 });
    const counts = reuseCounts(timeline);
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(3);
    expect(timeline[timeline.length - 1].endSec).toBeGreaterThanOrEqual(59.9);
  });

  it('does not repeat the same car-crash URL in the first 15s when alternatives exist', () => {
    const project = {
      topic: HOUSING_CRASH_TOPIC,
      script: [
        {
          id: 'seg1',
          type: 'body',
          duration: 20,
          narration: 'The housing market crash left tenants facing eviction notices from landlords across the city.',
          title: 'Body',
        },
      ],
      media: [
        {
          id: 'crash',
          segmentId: 'seg1',
          type: 'video',
          url: 'https://example.com/car-crash-dashcam.mp4',
          alt: 'car crash dashcam highway accident wreck',
          query: 'car crash dashcam',
          source: 'Stock footage',
        },
        ...Array.from({ length: 5 }, (_, i) => ({
          id: `apt${i}`,
          segmentId: 'seg1',
          type: 'video',
          url: `https://example.com/apt${i}.mp4`,
          alt: `apartment tenant face worried eviction clip ${i}`,
          query: 'apartment tenant eviction',
          source: 'Pexels Videos',
        })),
      ],
    };
    const timeline = buildEditTimeline(project, { cutIntervalSec: 1.25, maxReusePerUrl: 1 });
    const first15 = reuseCounts(timeline, 15);
    expect(first15.get('crash') || 0).toBeLessThanOrEqual(1);
  });

  it('prefers video over Ken-Burns stills in the first 15s when videos exist', () => {
    const project = {
      topic: HOUSING_CRASH_TOPIC,
      script: [
        {
          id: 'seg1',
          type: 'body',
          duration: 16,
          narration: 'Tenants and landlords faced eviction notices as apartments emptied across the city overnight.',
          title: 'Body',
        },
      ],
      media: [
        {
          id: 'still1',
          segmentId: 'seg1',
          type: 'image',
          url: 'https://example.com/landscape1.jpg',
          alt: 'scenic landscape skyline establishing',
          query: 'landscape',
        },
        {
          id: 'still2',
          segmentId: 'seg1',
          type: 'image',
          url: 'https://example.com/landscape2.jpg',
          alt: 'scenic countryside mountain vista',
          query: 'landscape',
        },
        ...Array.from({ length: 6 }, (_, i) => ({
          id: `vid${i}`,
          segmentId: 'other',
          type: 'video',
          url: `https://example.com/motion${i}.mp4`,
          alt: `apartment tenant face worried eviction clip ${i}`,
          query: 'apartment tenant',
          source: 'Pexels Videos',
        })),
      ],
    };
    const timeline = buildEditTimeline(project, { cutIntervalSec: 1.25, maxReusePerUrl: 1 });
    const mediaById = Object.fromEntries(project.media.map((m) => [m.id, m]));
    const first15 = timeline.filter((e) => e.startSec < 15);
    expect(first15.length).toBeGreaterThan(0);
    // Stills must not appear until every unused motion URL has been tried once.
    const videoIds = new Set(project.media.filter((m) => m.type === 'video').map((m) => m.id));
    const seenVideos = new Set();
    for (const entry of first15) {
      const asset = mediaById[entry.assetId];
      if (asset?.type === 'video') {
        seenVideos.add(entry.assetId);
        continue;
      }
      expect(seenVideos.size).toBe(videoIds.size);
    }
    // Opener itself must be motion, not a Ken-Burns landscape still.
    expect(mediaById[first15[0].assetId]?.type).toBe('video');
  });
});

