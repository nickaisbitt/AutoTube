import { describe, expect, it, vi } from 'vitest';
import {
  airlineQueryVisionBypass,
  archiveEvidenceLookupBudget,
  archiveEvidenceVerdict,
  archiveIdentifierFromUrl,
  archiveShortQueryVariants,
  archiveTopicSubjectQueries,
  buildMotionPaddingQueue,
  decideStockVisionGate,
  fetchWebVideoResults,
  formatMotionDropFunnel,
  formatMotionPathLog,
  isAirlineRelevantClip,
  isJunkStockClip,
  isSafeStockMotionQuery,
  isYouTubeMotionCandidate,
  isTikTokMotionCandidate,
  isVisionBudgetSoft,
  hasYtDlpCookies,
  unreliableWebProxyInjectReason,
  isYouTubeThumbnailStill,
  restoreMotionRelevancePassed,
  motionCandidateHostRank,
  motionQueryPlan,
  planMotionFetchRounds,
  providerEvidenceText,
  rankMotionCandidates,
  recordVisionStockUnverified,
  resolveInjectClipProbe,
  resolveMotionFetchBudgetMs,
  resolveMotionVolumeTargets,
  resolveStockKeyMode,
  resolveVisionUnverifiedMax,
  shouldFailOpenWebVisionSkip,
  spawnSyncFailureReason,
  restoreMotionRelevancePassed,
  stripJunkDemoVideos,
  webMotionHostQueryVariants,
  webMotionQueryVariants,
  withDistinctProxyIdentity,
  withArchiveSweepSuffix,
} from '../generate-full-video.mjs';
import { evaluateHarvestVolume } from '../harvest-quality.mjs';

const AIRLINE_TOPIC = 'How a regional airline hid recurring cabin-pressure failures from passengers';
const HOUSING_TOPIC = 'The landlord algorithm that evicted tenants from rent-stabilized apartments';

describe('isAirlineRelevantClip', () => {
  it('rejects opaque Archive.org clips that only match a trusted airline query', () => {
    expect(
      isAirlineRelevantClip(
        {
          source: 'Archive.org live',
          query: 'airplane',
          alt: 'opaque-newsreel-identifier',
          url: 'https://archive.org/download/random_collection/random_clip.mp4',
        },
        'airline cabin pressure safety investigation',
      ),
    ).toBe(false);
  });

  it('accepts trusted airline clips when visual metadata is present', () => {
    expect(
      isAirlineRelevantClip(
        {
          source: 'Archive.org live',
          query: 'airplane',
          alt: 'aircraft maintenance hangar with visible airplane',
          url: 'https://archive.org/download/random_collection/random_clip.mp4',
        },
        'airline cabin pressure safety investigation',
      ),
    ).toBe(true);
  });

  it('counts Archive.org item metadata as evidence when the alt is opaque', () => {
    expect(
      isAirlineRelevantClip(
        {
          source: 'Archive.org live',
          query: 'cabin pressurization',
          alt: 'cabin_pressure_reel_04',
          title: 'cabin pressurization and oxygen equipment training film 1958',
          url: 'https://archive.org/download/cp_reel_04/cp_reel_04.mp4',
        },
        AIRLINE_TOPIC,
      ),
    ).toBe(true);
  });

  it('still rejects a clip whose metadata only echoes the query', () => {
    expect(
      isAirlineRelevantClip(
        {
          source: 'Archive.org live',
          query: 'cabin pressurization',
          alt: 'reel_04',
          title: 'cabin pressurization',
          url: 'https://archive.org/download/reel_04/reel_04.mp4',
        },
        AIRLINE_TOPIC,
      ),
    ).toBe(false);
  });

  it('rejects Archive.org metadata that describes off-brand medical footage', () => {
    expect(
      isAirlineRelevantClip(
        {
          source: 'Archive.org live',
          query: 'oxygen mask demonstration',
          alt: 'reel_11',
          title: 'hospital patient oxygen therapy nursing ward demonstration',
          url: 'https://archive.org/download/reel_11/reel_11.mp4',
        },
        AIRLINE_TOPIC,
      ),
    ).toBe(false);
  });
});

describe('airlineQueryVisionBypass', () => {
  const topic = 'airline cabin pressure safety investigation';

  it('never bypasses vision for opaque alts on a trusted query', () => {
    expect(
      airlineQueryVisionBypass(
        {
          source: 'Archive.org live',
          query: 'airplane cabin',
          alt: 'opaque-newsreel-identifier',
          url: 'https://archive.org/download/random_collection/random_clip.mp4',
        },
        'airplane cabin',
        topic,
      ),
    ).toBe(false);
  });

  it('never bypasses vision for provider-echo alts', () => {
    expect(
      airlineQueryVisionBypass(
        { source: 'Pexels', query: 'airplane cabin', alt: 'Pexels video', url: 'https://videos.pexels.com/1234.mp4' },
        'airplane cabin',
        topic,
      ),
    ).toBe(false);
  });

  it('bypasses vision only when the clip carries its own visual evidence', () => {
    expect(
      airlineQueryVisionBypass(
        {
          source: 'Pexels',
          query: 'airplane cabin',
          alt: 'airplane cabin interior with passengers and oxygen mask drop',
          url: 'https://videos.pexels.com/1234.mp4',
        },
        'airplane cabin',
        topic,
      ),
    ).toBe(true);
  });

  it('does not bypass vision on non-airline topics', () => {
    expect(
      airlineQueryVisionBypass(
        { query: 'airplane cabin', alt: 'airplane cabin interior with passengers' },
        'airplane cabin',
        'bank scam call center fraud',
      ),
    ).toBe(false);
  });
});

describe('decideStockVisionGate', () => {
  const base = { hasThumb: true, hasApiKey: true, checked: 0, budget: 6, env: {} };

  it('checks clips while the budget lasts', () => {
    expect(decideStockVisionGate({ ...base, checked: 5 }).action).toBe('check');
  });

  it('skips instead of admitting unverified clips once the budget is spent', () => {
    expect(decideStockVisionGate({ ...base, checked: 6 })).toEqual({
      action: 'skip',
      reason: 'budget-exhausted',
    });
  });

  it('fails open past the budget only with AUTOTUBE_VISION_BUDGET_SOFT=1', () => {
    expect(
      decideStockVisionGate({ ...base, checked: 6, env: { AUTOTUBE_VISION_BUDGET_SOFT: '1' } }),
    ).toEqual({ action: 'admit', reason: 'budget-exhausted-soft' });
    expect(isVisionBudgetSoft({ AUTOTUBE_VISION_BUDGET_SOFT: '1' })).toBe(true);
    expect(isVisionBudgetSoft({})).toBe(false);
  });

  it('admits clips with their own visual evidence without spending budget', () => {
    expect(decideStockVisionGate({ ...base, checked: 99, trustedVisualEvidence: true })).toEqual({
      action: 'admit',
      reason: 'trusted-visual-evidence',
    });
  });

  it('admits when vision cannot run at all (no thumb or no key)', () => {
    expect(decideStockVisionGate({ ...base, hasThumb: false }).reason).toBe('vision-unavailable');
    expect(decideStockVisionGate({ ...base, hasApiKey: false }).reason).toBe('vision-unavailable');
  });
});

describe('vision stock unverified gate', () => {
  it('defaults AUTOTUBE_VISION_UNVERIFIED_MAX to 0 (strict skip)', () => {
    expect(resolveVisionUnverifiedMax({})).toBe(0);
    expect(resolveVisionUnverifiedMax({ AUTOTUBE_VISION_UNVERIFIED_MAX: '2' })).toBe(2);
    expect(resolveVisionUnverifiedMax({ AUTOTUBE_VISION_UNVERIFIED_MAX: 'nope' })).toBe(0);
  });

  it('skips unverified clips for every topic when max is 0', () => {
    const report = {};
    const first = recordVisionStockUnverified(
      report,
      { ran: false, reason: 'http-500' },
      { thumbnailUrl: 'https://example.com/a.jpg', env: {} },
    );
    expect(first.unverified).toBe(true);
    expect(first.skip).toBe(true);
    expect(report.visionStockUnverified).toBe(1);
    expect(report.visionStockUnverifiedSkipped).toBe(1);
  });

  it('allows a bounded number of unverified clips when max > 0', () => {
    const report = {};
    const env = { AUTOTUBE_VISION_UNVERIFIED_MAX: '1' };
    const allowed = recordVisionStockUnverified(
      report,
      { ran: false, reason: 'http-500' },
      { thumbnailUrl: 'https://example.com/a.jpg', env },
    );
    const skipped = recordVisionStockUnverified(
      report,
      { ran: false, reason: 'http-500' },
      { thumbnailUrl: 'https://example.com/b.jpg', env },
    );
    expect(allowed.skip).toBe(false);
    expect(skipped.skip).toBe(true);
    expect(report.visionStockUnverifiedAllowed).toBe(1);
    expect(report.visionStockUnverifiedSkipped).toBe(1);
  });

  it('ignores verdicts that actually ran', () => {
    const report = {};
    const result = recordVisionStockUnverified(
      report,
      { ran: true, reject: false },
      { thumbnailUrl: 'https://example.com/a.jpg', env: {} },
    );
    expect(result.unverified).toBe(false);
    expect(report.visionStockUnverified || 0).toBe(0);
  });
});

describe('resolveStockKeyMode', () => {
  it('reports the keyless path when no stock keys are present', () => {
    expect(resolveStockKeyMode({})).toEqual({
      keyed: false,
      keyless: true,
      pexels: false,
      pixabay: false,
      mode: 'keyless',
    });
    expect(resolveStockKeyMode({ PEXELS_API_KEY: '   ' }).mode).toBe('keyless');
  });

  it('reports the keyed path from either provider, env-prefixed or not', () => {
    expect(resolveStockKeyMode({ PEXELS_API_KEY: 'k' })).toMatchObject({ mode: 'keyed', pexels: true });
    expect(resolveStockKeyMode({ VITE_PIXABAY_KEY: 'k' })).toMatchObject({ mode: 'keyed', pixabay: true });
  });
});

describe('providerEvidenceText', () => {
  it('rejects metadata that only echoes the query we sent', () => {
    expect(providerEvidenceText('airplane cabin', { query: 'airplane cabin' })).toBe('');
    expect(providerEvidenceText('Airplane Cabin footage clip', { query: 'airplane cabin' })).toBe('');
  });

  it('keeps metadata that says something of its own, subject words included', () => {
    expect(providerEvidenceText('Cabin Pressurization Training Film', { query: 'cabin pressurization' })).toBe(
      'cabin pressurization training film',
    );
  });

  it('rejects a title copied from the topic sentence', () => {
    expect(providerEvidenceText(AIRLINE_TOPIC, { topicBlob: AIRLINE_TOPIC })).toBe('');
    expect(
      providerEvidenceText('Aircraft cabin interior and oxygen mask drill, 1962 newsreel', {
        topicBlob: AIRLINE_TOPIC,
      }),
    ).toBe('aircraft cabin interior and oxygen mask drill 1962 newsreel');
  });

  it('drops markup and one-word metadata', () => {
    expect(providerEvidenceText('<p>Airliner &amp; hangar footage</p>')).toBe('airliner hangar footage');
    expect(providerEvidenceText('clip')).toBe('');
  });
});

describe('archiveEvidenceVerdict', () => {
  it('rejects opaque identifiers even under a topical query', () => {
    const verdict = archiveEvidenceVerdict(
      {
        source: 'Archive.org live',
        url: 'https://archive.org/download/random_collection/random_clip.mp4',
        alt: '',
        title: '',
        query: 'airliner cabin',
      },
      { query: 'airliner cabin', topicBlob: AIRLINE_TOPIC },
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe('no-provider-metadata');
  });

  it('rejects metadata that never mentions the subject we searched for', () => {
    const verdict = archiveEvidenceVerdict(
      {
        source: 'Archive.org live',
        url: 'https://archive.org/download/x/y.mp4',
        title: 'home movies of a county fair parade',
        query: 'airliner cabin',
      },
      { query: 'airliner cabin', topicBlob: AIRLINE_TOPIC },
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe('metadata-off-subject');
  });

  it('admits items whose own metadata names the subject', () => {
    const verdict = archiveEvidenceVerdict(
      {
        source: 'Archive.org live',
        url: 'https://archive.org/download/x/y.mp4',
        title: 'airliner cabin interior, crew oxygen drill (1962)',
        query: 'airliner cabin',
      },
      { query: 'airliner cabin', topicBlob: AIRLINE_TOPIC },
    );
    expect(verdict.ok).toBe(true);
    expect(verdict.matched).toContain('cabin');
  });

  it('does not let an all-echo title pass as its own evidence', () => {
    expect(
      archiveEvidenceVerdict(
        { source: 'Archive.org live', title: 'airliner cabin', query: 'airliner cabin' },
        { query: 'airliner cabin', topicBlob: AIRLINE_TOPIC },
      ).ok,
    ).toBe(false);
  });
});

describe('archiveIdentifierFromUrl', () => {
  it('reads the item identifier from download and details URLs', () => {
    expect(archiveIdentifierFromUrl('https://archive.org/download/CabinPressure1962/clip_512kb.mp4')).toBe(
      'CabinPressure1962',
    );
    expect(archiveIdentifierFromUrl('https://archive.org/details/CabinPressure1962')).toBe('CabinPressure1962');
    expect(archiveIdentifierFromUrl('https://videos.pexels.com/1234.mp4')).toBe('');
  });
});

describe('motionQueryPlan', () => {
  it('keeps the cabin/cockpit face head then hammers the keyed airline pack', () => {
    const plan = motionQueryPlan(AIRLINE_TOPIC, false, {
      faceSeek: true,
      preferBright: true,
      stockKeyed: true,
    });
    expect(plan.mode).toBe('keyed');
    expect(plan.queries.slice(0, 3)).toEqual([
      'airplane cabin passenger face worried',
      'pilot cockpit headset face close-up',
      'flight attendant airplane cabin face',
    ]);
    expect(plan.queries.slice(0, 12)).toEqual(
      expect.arrayContaining(['airplane cabin passengers seated aisle', 'pilot hands cockpit controls close-up']),
    );
    expect(plan.queries.every(isSafeStockMotionQuery)).toBe(true);
  });

  it('leads keyless airline runs with web-friendly scenes before Archive subjects', () => {
    const plan = motionQueryPlan(AIRLINE_TOPIC, false, { faceSeek: true, stockKeyed: false });
    expect(plan.mode).toBe('keyless');
    expect(plan.queries.slice(0, 4)).toEqual([
      'airplane cabin passenger face worried',
      'pilot cockpit headset face close-up',
      'flight attendant airplane cabin face',
      'passenger oxygen mask airplane cabin',
    ]);
    expect(plan.webQueries).toEqual(plan.queries.slice(0, plan.webQueries.length));
    expect(plan.archiveQueries).toEqual(plan.queries);
    expect(plan.webHostQueries).toEqual(expect.arrayContaining([
      expect.stringContaining('site:vimeo.com'),
      expect.stringContaining('site:dailymotion.com'),
    ]));
    expect(plan.queries).toEqual(expect.arrayContaining([
      'airliner cabin',
      'aircraft cabin interior',
      'cabin pressurization',
      'oxygen mask demonstration',
    ]));
    // Diversity, not looser gating: every keyless subject is concrete aviation.
    expect(plan.boostCount).toBeGreaterThanOrEqual(16);
    expect(plan.queries.length).toBeGreaterThan(plan.baseCount);
    expect(plan.queries.every(isSafeStockMotionQuery)).toBe(true);
  });

  it('asks many more distinct archive subjects than the keyless soft-pass floor needs', () => {
    const airline = motionQueryPlan(AIRLINE_TOPIC, false, { stockKeyed: false, faceSeek: true });
    expect(airline.boostCount).toBeGreaterThanOrEqual(32);
    const housing = motionQueryPlan(HOUSING_TOPIC, false, { stockKeyed: false });
    expect(housing.boostCount).toBeGreaterThanOrEqual(18);
    for (const plan of [airline, housing]) {
      expect(new Set(plan.queries).size).toBe(plan.queries.length);
      expect(plan.queries.every(isSafeStockMotionQuery)).toBe(true);
    }
  });

  it('adds literal topic subjects to keyless topics with no curated pack', () => {
    const plan = motionQueryPlan('The county water plant that dumped lead into the supply', false, {
      stockKeyed: false,
    });
    expect(plan.queries).toEqual(expect.arrayContaining(['water plant']));
    expect(plan.queries.every(isSafeStockMotionQuery)).toBe(true);
  });

  it('adds apartment-first packs for housing in both modes', () => {
    const keyed = motionQueryPlan(HOUSING_TOPIC, false, { stockKeyed: true, faceSeek: true });
    expect(keyed.queries).toEqual(
      expect.arrayContaining(['apartment kitchen interior daylight', 'apartment building hallway doors']),
    );
    const keyless = motionQueryPlan(HOUSING_TOPIC, false, { stockKeyed: false });
    expect(keyless.queries.slice(0, 3)).toEqual([
      'apartment building exterior city',
      'for rent sign house porch',
      'worried couple reading letter home',
    ]);
    expect(keyless.queries).toEqual(
      expect.arrayContaining(['apartment building', 'apartment interior', 'public housing']),
    );
  });

  it('derives short archive subjects for topics without a curated pack', () => {
    const keyless = motionQueryPlan('The nursing home cameras that recorded abuse for years', false, {
      stockKeyed: false,
      faceSeek: true,
    });
    expect(keyless.queries).toEqual(expect.arrayContaining(['security camera', 'nursing home']));
    // Reaction/lighting leads produce opaque archive matches, so they are never derived.
    expect(keyless.queries.some((q) => /^(worried|shocked|bright|sunny|real|documentary)\b/i.test(q) && q.split(' ').length === 2)).toBe(
      false,
    );
  });

  it('never emits an unsafe (long/essay) query in either mode', () => {
    for (const stockKeyed of [true, false]) {
      const plan = motionQueryPlan(AIRLINE_TOPIC, false, { stockKeyed, faceSeek: true, preferBright: true });
      expect(plan.queries.every(isSafeStockMotionQuery)).toBe(true);
      expect(plan.queries.every((q) => q.length <= 64)).toBe(true);
      expect(new Set(plan.queries).size).toBe(plan.queries.length);
    }
  });
});

describe('webMotionQueryVariants', () => {
  it('uses vetted scene queries and literal topic subjects without generic laundering terms', () => {
    const queries = webMotionQueryVariants(
      'The county water plant that dumped lead into the supply',
      ['water treatment plant pipes', 'shocked face close up', ''],
    );
    expect(queries[0]).toBe('water treatment plant pipes');
    expect(queries).toContain('water plant');
    expect(queries.every(isSafeStockMotionQuery)).toBe(true);
    expect(queries.some((query) => /unrelated|viral|trending/i.test(query))).toBe(false);
  });
});

describe('non-YouTube motion planning and ranking', () => {
  it('keeps explicit Vimeo and Dailymotion searches safe and tied to base queries', () => {
    const queries = webMotionHostQueryVariants([
      'airliner cabin oxygen mask',
      'pilot cockpit headset face close-up',
    ]);

    expect(queries).toEqual([
      'airliner cabin oxygen mask site:vimeo.com',
      'airliner cabin oxygen mask site:dailymotion.com',
    ]);
    expect(queries.every(isSafeStockMotionQuery)).toBe(true);
  });

  it('ranks direct files and non-YouTube hosts ahead of a higher-scored YouTube wrapper', () => {
    const youtube = {
      url: `http://localhost:5173/api/download-clip?url=${encodeURIComponent('https://youtu.be/abc')}`,
      score: 100,
    };
    const tiktok = {
      url: `http://localhost:5173/api/download-clip?url=${encodeURIComponent('https://www.tiktok.com/@aviation/video/1')}`,
      sourceUrl: 'https://www.tiktok.com/@aviation/video/1',
      score: 90,
    };
    const candidates = [
      youtube,
      tiktok,
      { url: 'https://vimeo.com/12345', score: 1 },
      { url: 'https://cdn.example.org/cabin.webm', score: 0 },
      { url: 'https://archive.org/download/cabin/cabin.mp4', score: -5 },
      { url: 'https://www.dailymotion.com/video/xyz', score: 2 },
      { url: 'https://giphy.com/gifs/airplane-cabin-xyz', score: 3 },
      { url: 'https://example.org/page-only', score: 50 },
    ];

    const ranked = rankMotionCandidates(candidates, (clip) => clip.score);
    expect(ranked.map((clip) => clip.url)).toEqual([
      'https://archive.org/download/cabin/cabin.mp4',
      'https://cdn.example.org/cabin.webm',
      'https://giphy.com/gifs/airplane-cabin-xyz',
      'https://www.dailymotion.com/video/xyz',
      'https://vimeo.com/12345',
      'https://example.org/page-only',
      tiktok.url,
      youtube.url,
    ]);
    expect(isYouTubeMotionCandidate(youtube)).toBe(true);
    expect(motionCandidateHostRank(youtube)).toBeGreaterThan(50);
    expect(motionCandidateHostRank(tiktok)).toBeGreaterThan(motionCandidateHostRank({ url: 'https://vimeo.com/1' }));
    expect(motionCandidateHostRank(tiktok)).toBeLessThan(motionCandidateHostRank(youtube));
  });

  it('demotes opaque Archive behind web face clips on housing topics', () => {
    const opaqueArchive = {
      url: 'https://archive.org/download/landscape/landscape.mp4',
      source: 'Archive.org live',
      query: 'city street',
      alt: 'helicopter aerial landscape',
      score: 100,
    };
    const housingArchive = {
      url: 'https://archive.org/download/apt/apartment.mp4',
      source: 'Archive.org live',
      query: 'apartment building',
      alt: 'public housing apartment building',
      score: 1,
    };
    const webFace = {
      url: `http://localhost:5173/api/download-clip?url=${encodeURIComponent('https://vimeo.com/face')}`,
      sourceUrl: 'https://vimeo.com/face',
      source: 'Bing web video',
      query: 'shocked face close up phone',
      alt: 'worried couple reading letter home',
      score: 0,
    };
    const bingWeb = {
      url: `http://localhost:5173/api/download-clip?url=${encodeURIComponent('https://example.com/clip.mp4')}`,
      sourceUrl: 'https://example.com/clip.mp4',
      source: 'Bing web video',
      query: 'worried couple apartment',
      alt: 'tenant reading eviction letter',
      score: 0,
    };
    const ranked = rankMotionCandidates(
      [opaqueArchive, housingArchive, webFace, bingWeb],
      (clip) => clip.score,
      { topicBlob: HOUSING_TOPIC },
    );
    // Direct .mp4 web (1) beats Vimeo (2); both beat housing Archive (15) and opaque (35).
    expect(ranked.map((clip) => clip.url)).toEqual([
      bingWeb.url,
      webFace.url,
      housingArchive.url,
      opaqueArchive.url,
    ]);
    expect(motionCandidateHostRank(housingArchive, { topicBlob: HOUSING_TOPIC }))
      .toBeGreaterThan(motionCandidateHostRank(bingWeb, { topicBlob: HOUSING_TOPIC }));
    expect(motionCandidateHostRank(housingArchive, { topicBlob: HOUSING_TOPIC }))
      .toBeGreaterThan(10);
    expect(motionCandidateHostRank(opaqueArchive, { topicBlob: HOUSING_TOPIC }))
      .toBeGreaterThan(motionCandidateHostRank(webFace, { topicBlob: HOUSING_TOPIC }));
    // Airline topics still prefer Archive first.
    expect(motionCandidateHostRank(opaqueArchive, { topicBlob: AIRLINE_TOPIC })).toBe(0);
  });

  it('skips YouTube inject without cookies and honors a TikTok circuit breaker', () => {
    const youtube = {
      url: `http://localhost:5173/api/download-clip?url=${encodeURIComponent('https://youtu.be/abc')}`,
    };
    const tiktok = {
      url: `http://localhost:5173/api/download-clip?url=${encodeURIComponent('https://www.tiktok.com/@x/video/1')}`,
      sourceUrl: 'https://www.tiktok.com/@x/video/1',
    };
    const prevCookies = process.env.YTDLP_COOKIES;
    delete process.env.YTDLP_COOKIES;
    delete process.env.YTDLP_COOKIES_FROM_BROWSER;
    delete process.env.YTDLP_COOKIES_FILE;
    try {
      expect(hasYtDlpCookies()).toBe(false);
      expect(isTikTokMotionCandidate(tiktok)).toBe(true);
      expect(unreliableWebProxyInjectReason(youtube)).toBe('youtube-without-cookies');
      expect(unreliableWebProxyInjectReason(tiktok)).toBe(null);
      expect(unreliableWebProxyInjectReason(tiktok, { tiktokBlocked: true })).toBe('tiktok-circuit-open');
      expect(unreliableWebProxyInjectReason({ url: 'https://archive.org/download/a/a.mp4' })).toBe(null);
      expect(isYouTubeThumbnailStill('https://i.ytimg.com/vi/abc/maxresdefault.jpg')).toBe(true);
      expect(isYouTubeThumbnailStill('https://archive.org/download/a/still.jpg')).toBe(false);
    } finally {
      if (prevCookies === undefined) delete process.env.YTDLP_COOKIES;
      else process.env.YTDLP_COOKIES = prevCookies;
    }
  });

  it('restores Archive injects marked motionRelevancePassed after relevance strips them', () => {
    const archive = {
      id: 'stock-video-s1-p0-0',
      segmentId: 's1',
      type: 'video',
      url: 'https://archive.org/download/housing/housing.mp4',
      source: 'Archive.org live',
      motionRelevancePassed: true,
    };
    const kept = restoreMotionRelevancePassed(
      [],
      [archive],
      [{ segmentId: 's1', url: archive.url, motionRelevancePassed: true }],
    );
    expect(kept.media).toHaveLength(1);
    expect(kept.media[0].url).toBe(archive.url);
  });
});

describe('fetchWebVideoResults', () => {
  it('uses authenticated server routes and emits distinct local download wrappers', async () => {
    const previousFetch = globalThis.fetch;
    const previousKey = process.env.AUTOTUBE_API_KEY;
    process.env.AUTOTUBE_API_KEY = 'test-api-key';
    globalThis.fetch = vi.fn(async (url) => {
      if (String(url).includes('/api/search-videos')) {
        return {
          ok: true,
          json: async () => ({
            results: [{
              content: 'https://vimeo.com/12345',
              title: 'Airliner cabin oxygen equipment training film',
              images: { large: 'https://example.com/ddg.jpg' },
              duration: '2:10',
            }],
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({
          results: [{
            url: `https://www.youtube.com/watch?v=${String(url).includes('google') ? 'google' : 'bing'}`,
            title: 'Airliner cabin oxygen equipment training film',
            thumbnailUrl: 'https://example.com/web.jpg',
            duration: '2:10',
          }],
        }),
      };
    });

    try {
      const clips = await Promise.all(
        ['bing', 'google', 'ddg'].map((provider) =>
          fetchWebVideoResults('http://localhost:5173', provider, 'airliner cabin', {
            topicBlob: AIRLINE_TOPIC,
          })),
      );
      expect(clips.flat()).toHaveLength(3);
      expect(new Set(clips.flat().map((clip) => clip.url)).size).toBe(3);
      for (const clip of clips.flat()) {
        expect(clip.url).toContain('http://localhost:5173/api/download-clip?url=');
        expect(clip.alt).toContain('oxygen equipment training film');
      }
      for (const [, options] of globalThis.fetch.mock.calls) {
        expect(options.headers['X-API-Key']).toBe('test-api-key');
      }
    } finally {
      globalThis.fetch = previousFetch;
      if (previousKey === undefined) delete process.env.AUTOTUBE_API_KEY;
      else process.env.AUTOTUBE_API_KEY = previousKey;
    }
  });

  it('does not turn the query echo into provider evidence', async () => {
    const previousFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        results: [{
          url: 'https://www.youtube.com/watch?v=echo',
          title: 'airliner cabin',
          duration: '1:00',
        }],
      }),
    }));
    try {
      for (const query of ['airliner cabin', 'airliner cabin site:vimeo.com']) {
        const clips = await fetchWebVideoResults('http://localhost:5173', 'bing', query, {
          topicBlob: AIRLINE_TOPIC,
        });
        expect(clips).toEqual([]);
      }
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  it('keeps an arbitrary HTTPS direct MP4 instead of routing it through yt-dlp', async () => {
    const previousFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        results: [{
          url: 'https://cdn.example.org/aviation/cabin.mp4',
          title: 'Airliner cabin oxygen equipment demonstration',
          duration: '0:30',
        }],
      }),
    }));
    try {
      const clips = await fetchWebVideoResults('http://localhost:5173', 'bing', 'airliner cabin', {
        topicBlob: AIRLINE_TOPIC,
      });
      expect(clips).toHaveLength(1);
      expect(clips[0].url).toBe('https://cdn.example.org/aviation/cabin.mp4');
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});

describe('stripJunkDemoVideos', () => {
  it('keeps topical YouTube/TikTok wrappers but still removes demo and adult clips', () => {
    const wrap = (url) => `/api/download-clip?url=${encodeURIComponent(url)}&duration=10`;
    const project = {
      topic: AIRLINE_TOPIC,
      media: [
        {
          id: 'youtube',
          type: 'video',
          url: wrap('https://www.youtube.com/watch?v=cabin'),
          sourceUrl: 'https://www.youtube.com/watch?v=cabin',
          source: 'Bing web video',
          alt: 'Airliner cabin oxygen mask safety demonstration',
          query: 'airliner cabin',
        },
        {
          id: 'tiktok',
          type: 'video',
          url: wrap('https://www.tiktok.com/@aviation/video/123'),
          sourceUrl: 'https://www.tiktok.com/@aviation/video/123',
          source: 'DuckDuckGo web video',
          alt: 'Aircraft cabin pressurization training demonstration',
          query: 'cabin pressurization',
        },
        {
          id: 'demo',
          type: 'video',
          url: wrap('https://samplelib.com/lib/preview/mp4/sample-5s.mp4'),
          alt: 'Airliner cabin safety demonstration',
        },
        {
          id: 'adult',
          type: 'video',
          url: wrap('https://www.xvideos.com/video123/example'),
          alt: 'Airliner cabin safety demonstration',
        },
      ],
    };
    const report = {};

    stripJunkDemoVideos(project, report);

    expect(project.media.map(({ id }) => id)).toEqual(['youtube', 'tiktok']);
    expect(report.junkVideoDropped).toHaveLength(2);
  });
});

describe('archiveShortQueryVariants', () => {
  it('keeps topical heads and drops reaction/lighting leads', () => {
    expect(
      archiveShortQueryVariants([
        'apartment building exterior city',
        'worried couple reading letter home',
        'bright apartment interior daylight',
        'keys lock',
      ]),
    ).toEqual(['apartment building']);
  });
});

describe('archiveTopicSubjectQueries', () => {
  it('derives concrete subjects from the topic and drops story framing words', () => {
    const subjects = archiveTopicSubjectQueries(
      'The nursing home cameras that recorded abuse for years, and nobody noticed',
    );
    expect(subjects).toEqual(expect.arrayContaining(['nursing home', 'home cameras']));
    expect(subjects.some((q) => /\b(nobody|noticed|years|that)\b/.test(q))).toBe(false);
    expect(subjects.every(isSafeStockMotionQuery)).toBe(true);
  });

  it('returns nothing to search when the topic is all framing', () => {
    expect(archiveTopicSubjectQueries('What they will never tell you about this')).toEqual([]);
  });
});

describe('planMotionFetchRounds', () => {
  const queries = ['airliner cabin', 'cabin pressurization', 'oxygen mask demonstration'];

  it('gives keyed runs a second provider page over the leading topical subjects', () => {
    const rounds = planMotionFetchRounds(queries, { keyed: true, queryCap: 3 });
    expect(rounds.map((r) => r.label)).toEqual(['primary', 'provider-page-2']);
    expect(rounds[0].attempts.every((a) => a.page === 1 && !a.extra)).toBe(true);
    expect(rounds[1].attempts.every((a) => a.page === 2 && a.extra)).toBe(true);
    expect(rounds[1].attempts.map((a) => a.query)).toEqual(queries);
  });

  it('gives keyless runs one archive sweep round per label, tied back to the subject', () => {
    const rounds = planMotionFetchRounds(queries, { keyed: false, queryCap: 3 });
    expect(rounds[0].label).toBe('primary');
    expect(rounds.slice(1).map((r) => r.label)).toEqual([
      'archive-sweep-footage',
      'archive-sweep-film',
      'archive-sweep-newsreel',
    ]);
    const sweep = rounds[1].attempts[0];
    expect(sweep).toMatchObject({ query: 'airliner cabin footage', subject: 'airliner cabin', extra: true });
    expect(rounds.slice(1).flatMap((r) => r.attempts).every((a) => a.extra && a.page === 1)).toBe(true);
  });

  it('never plans the same query twice and honours the query cap', () => {
    const rounds = planMotionFetchRounds([...queries, 'airliner cabin', 'jet airliner takeoff'], {
      keyed: false,
      queryCap: 3,
    });
    const keys = rounds.flatMap((r) => r.attempts).map((a) => `${a.query}|${a.page}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.some((k) => k.startsWith('jet airliner takeoff'))).toBe(false);
  });
});

describe('archive lookup and fetch budgets', () => {
  it('spends far more archive metadata lookups when keyless', () => {
    expect(archiveEvidenceLookupBudget(false)).toBeGreaterThan(archiveEvidenceLookupBudget(true) * 4);
  });

  it('gives the wider keyless search plan more wall-clock, overridable by env', () => {
    expect(resolveMotionFetchBudgetMs(false, {})).toBeGreaterThan(resolveMotionFetchBudgetMs(true, {}));
    expect(resolveMotionFetchBudgetMs(false, { AUTOTUBE_MOTION_FETCH_BUDGET_MS: '1000' })).toBe(1000);
    expect(resolveMotionFetchBudgetMs(false, { AUTOTUBE_MOTION_FETCH_BUDGET_MS: 'nope' })).toBe(
      resolveMotionFetchBudgetMs(false, {}),
    );
  });
});

describe('withArchiveSweepSuffix', () => {
  it('re-ranks a short subject without breaking query safety', () => {
    expect(withArchiveSweepSuffix('airliner cabin', 'footage')).toBe('airliner cabin footage');
    expect(withArchiveSweepSuffix('airliner cabin', '')).toBe('airliner cabin');
    expect(withArchiveSweepSuffix('airliner cabin footage', 'footage')).toBe('');
    expect(withArchiveSweepSuffix('airplane cabin passenger face worried', 'footage')).toBe('');
  });
});

describe('resolveMotionVolumeTargets', () => {
  const base = { segmentCount: 6, segmentDurationSec: 90, cutIntervalSec: 0.85 };

  it('chases far more clips on keyed airline/housing runs', () => {
    const airline = resolveMotionVolumeTargets({ ...base, hasStockKeys: true, topicBlob: AIRLINE_TOPIC });
    expect(airline.mode).toBe('keyed');
    expect(airline.aggressive).toBe(true);
    expect(airline.minVideos).toBeGreaterThanOrEqual(40);
    expect(airline.perSegTarget).toBe(6);
    expect(airline.introTarget).toBe(7);
    const housing = resolveMotionVolumeTargets({ ...base, hasStockKeys: true, topicBlob: HOUSING_TOPIC });
    expect(housing.aggressive).toBe(true);
    const other = resolveMotionVolumeTargets({ ...base, hasStockKeys: true, topicBlob: 'bank otp scam' });
    expect(other.minVideos).toBeLessThan(airline.minVideos);
  });

  it('keeps chasing archive volume when keyless, above the keyless soft-pass floor', () => {
    const airline = resolveMotionVolumeTargets({ ...base, hasStockKeys: false, topicBlob: AIRLINE_TOPIC });
    expect(airline.mode).toBe('keyless');
    // Soft-pass needs 6 keyless airline clips; the top-up target stays well above it.
    expect(airline.minVideos).toBeGreaterThanOrEqual(18);
    expect(airline.perSegTarget).toBe(3);
    const generic = resolveMotionVolumeTargets({ ...base, hasStockKeys: false, topicBlob: 'bank otp scam' });
    expect(generic.minVideos).toBe(6);
    expect(generic.stockNeed).toBe(0);
  });

  it('subtracts motion already harvested from the stock need', () => {
    const targets = resolveMotionVolumeTargets({
      ...base,
      hasStockKeys: false,
      topicBlob: AIRLINE_TOPIC,
      stockApiVideoCount: 5,
    });
    expect(targets.stockNeed).toBe(targets.minVideos - 5);
  });
});

describe('formatMotionPathLog', () => {
  it('names the keyed path and its provider counts', () => {
    const line = formatMotionPathLog({
      motionKeyMode: 'keyed',
      motionKeyPexels: true,
      motionKeyPixabay: false,
      pexelsFetched: 22,
      pixabayFetched: 4,
      archiveLiveFetched: 1,
      bingWebVideoFetched: 5,
      googleWebVideoFetched: 3,
      ddgWebVideoFetched: 2,
      motionQueriesTried: 24,
      motionQueryPoolSize: 30,
      motionPoolSize: 41,
      motionTargetVideos: 30,
      motionSelectedYouTube: 2,
      motionSelectedNonYouTube: 25,
      videoTopUp: new Array(27),
    });
    expect(line).toContain('Motion path: keyed');
    expect(line).toContain('pexels=22');
    expect(line).toContain('bing=5 google=3 ddg=2 archive=1');
    expect(line).toContain('queries-tried=24 query-pack=30');
    expect(line).toContain('injected=27/30');
    expect(line).toContain('selected(youtube=2 non-youtube=25)');
  });

  it('reports how deep a keyed run paged, without keyless archive noise', () => {
    const line = formatMotionPathLog({
      motionKeyMode: 'keyed',
      motionKeyPexels: true,
      motionKeyPixabay: true,
      pexelsFetched: 40,
      pixabayFetched: 18,
      motionPageTwoQueries: 14,
      motionTargetVideos: 42,
      videoTopUp: new Array(42),
    });
    expect(line).toContain('page2-queries=14');
    expect(line).not.toContain('sweep-queries');
    expect(line).not.toContain('dead-subjects');
    expect(line).toContain('injected=42/42');
  });

  it('names the keyless path with archive attempt and evidence counts', () => {
    const line = formatMotionPathLog({
      motionKeyMode: 'keyless',
      archiveLiveFetched: 19,
      bingWebVideoFetched: 12,
      googleWebVideoFetched: 8,
      ddgWebVideoFetched: 6,
      archiveQueriesTried: 33,
      archiveSweepQueries: 12,
      archiveEvidenceLookups: 40,
      archiveEvidenceEnriched: 17,
      archiveEvidenceRejected: 21,
      motionQueriesTried: 45,
      motionQueryPoolSize: 36,
      motionTargetVideos: 18,
      videoTopUp: new Array(16),
    });
    expect(line).toContain('Motion path: keyless');
    expect(line).toContain('bing=12 google=8 ddg=6 archive=19');
    expect(line).not.toContain('pexels=0 pixabay=0 archive=');
    expect(line).toContain('sweep-queries=12');
    expect(line).toContain('evidence-rejected=21');
    expect(line).toContain('injected=16/18');
  });

  it('says why a keyless run has no provider counts, and where archive recall went', () => {
    const line = formatMotionPathLog({
      motionKeyMode: 'keyless',
      archiveLiveFetched: 19,
      archiveQueriesTried: 33,
      archiveRawHits: 214,
      archiveDeadSubjects: 7,
      archiveEvidenceCacheHits: 26,
      motionTargetVideos: 18,
      videoTopUp: new Array(16),
    });
    expect(line).toContain('web + Archive.org');
    expect(line).toContain('dead-subjects=7');
    expect(line).toContain('raw-hits=214');
    expect(line).toContain('evidence-cached=26');
  });
});

describe('resolveInjectClipProbe', () => {
  it('trusts proxied /api/download-clip web clips without a full transcode probe', () => {
    const plan = resolveInjectClipProbe(
      'http://localhost:5173/api/download-clip?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3Dabc&duration=10',
    );
    expect(plan.probe).toBe(false);
    expect(plan.trust).toBe('proxy-clip');
  });

  it('still probes direct archive/stock video URLs', () => {
    expect(resolveInjectClipProbe('https://archive.org/download/reel/reel.mp4').probe).toBe(true);
    expect(resolveInjectClipProbe('https://videos.pexels.com/video-files/1/clip.mp4').probe).toBe(true);
    expect(resolveInjectClipProbe('').probe).toBe(true);
  });
});

describe('web-motion volume identity and distribution', () => {
  it('stores distinct proxy identities that fetch through the unchanged endpoint', () => {
    const base =
      'http://localhost:5173/api/download-clip?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3Dabc&duration=10';
    const first = withDistinctProxyIdentity(base, 'seg-a-0');
    const second = withDistinctProxyIdentity(base, 'seg-b-1');

    expect(first.split('?')[0]).not.toBe(second.split('?')[0]);
    expect(new URL(first).pathname).toBe('/api/download-clip');
    expect(new URL(second).pathname).toBe('/api/download-clip');
    expect(new URL(first).searchParams.get('url')).toBe('https://www.youtube.com/watch?v=abc');
    expect(resolveInjectClipProbe(first).probe).toBe(false);
  });

  it('makes six web proxy targets count as six assets at the unchanged volume gate', () => {
    const segment = {
      id: 's1',
      title: 'Bank fraud phone breach',
      narration: 'Bank fraud investigators traced stolen phone records and account data.',
    };
    const media = Array.from({ length: 6 }, (_, index) => {
      const proxy =
        `/api/download-clip?url=${encodeURIComponent(`https://youtu.be/bank-${index}`)}&duration=10`;
      return {
        id: `web-${index}`,
        segmentId: segment.id,
        type: 'video',
        url: withDistinctProxyIdentity(proxy, `${segment.id}-${index}`),
        alt: 'bank fraud smartphone security investigation',
        query: 'bank fraud phone breach',
        source: 'Bing web video',
      };
    });
    const volume = evaluateHarvestVolume({
      topic: 'The bank fraud phone breach that exposed account records',
      script: [segment],
      media,
    }, 6);

    expect(volume.perSegment.s1.count).toBe(6);
    expect(volume.pass).toBe(true);
  });

  it('balances a finite motion pool across the thinnest segments before filling to six', () => {
    const script = [
      { id: 's1', title: 'Three' },
      { id: 's2', title: 'Two' },
      { id: 's3', title: 'One' },
    ];
    const media = [
      ...['a', 'b', 'c'].map((id) => ({ segmentId: 's1', url: `https://img/${id}.jpg` })),
      ...['d', 'e'].map((id) => ({ segmentId: 's2', url: `https://img/${id}.jpg` })),
      { segmentId: 's3', url: 'https://img/f.jpg' },
    ];
    const project = { script, media };

    expect(buildMotionPaddingQueue(project, 6, 4)).toEqual(['s3', 's2', 's3', 's1']);

    const full = buildMotionPaddingQueue(project, 6);
    const counts = { s1: 3, s2: 2, s3: 1 };
    for (const segmentId of full) counts[segmentId] += 1;
    expect(counts).toEqual({ s1: 6, s2: 6, s3: 6 });
    expect(full).toHaveLength(12);
  });

  it('restores only fresh clips with run-local motion relevance proof', () => {
    const trusted = {
      id: 'trusted',
      segmentId: 's1',
      type: 'video',
      url: withDistinctProxyIdentity('/api/download-clip?url=https%3A%2F%2Fyoutu.be%2Fabc', 's1-0'),
    };
    const untrusted = {
      id: 'untrusted',
      segmentId: 's1',
      type: 'video',
      url: '/api/download-clip?url=https%3A%2F%2Fyoutu.be%2Fbad',
    };
    const kept = [{ id: 'still', segmentId: 's1', type: 'image', url: 'https://img/keep.jpg' }];
    const result = restoreMotionRelevancePassed(kept, [trusted, untrusted], [
      { segmentId: 's1', url: trusted.url, motionRelevancePassed: true },
      { segmentId: 's1', url: untrusted.url, motionRelevancePassed: false },
    ]);

    expect(result.media.map((asset) => asset.id)).toEqual(['still', 'trusted']);
    expect(result.restored).toEqual([trusted]);
  });
});

describe('shouldFailOpenWebVisionSkip', () => {
  it('keeps a web clip that carries its own strong evidence when the vision budget is spent', () => {
    expect(shouldFailOpenWebVisionSkip({ isWebClip: true, hasStrongEvidence: true })).toBe(true);
  });

  it('drops web clips without evidence and never fails open on stock/archive clips', () => {
    expect(shouldFailOpenWebVisionSkip({ isWebClip: true, hasStrongEvidence: false })).toBe(false);
    expect(shouldFailOpenWebVisionSkip({ isWebClip: false, hasStrongEvidence: true })).toBe(false);
    expect(shouldFailOpenWebVisionSkip()).toBe(false);
  });
});

describe('formatMotionDropFunnel', () => {
  it('traces fetched → after-junk → after-vision → after-relevance → injected', () => {
    const line = formatMotionDropFunnel({
      motionCandidatesSeen: 180,
      motionAfterJunk: 150,
      motionAfterVision: 140,
      motionPoolSize: 140,
      motionDroppedJunk: 22,
      motionDroppedRelevance: 8,
      motionDroppedVision: 10,
      visionWebFailOpen: 4,
      injectProbePassed: 3,
      injectProbeFailed: 1,
      injectProxyTrusted: 14,
      relevanceDroppedAfterTopUp: new Array(2),
      motionRelevanceDroppedAfterTopUp: [],
      videoTopUp: new Array(17),
    });
    expect(line).toContain('fetched=180');
    expect(line).toContain('after-junk=150');
    expect(line).toContain('after-vision=140');
    expect(line).toContain('after-relevance=140');
    expect(line).toContain('injected=17');
    expect(line).toContain('junk=22 relevance=8 vision=10 web-fail-open=4');
    expect(line).toContain('probe-pass=3 probe-fail=1 proxy-trusted=14');
  });

  it('falls back to the clip pool size when the after-vision counter is absent', () => {
    const line = formatMotionDropFunnel({ motionPoolSize: 41, videoTopUp: new Array(1) });
    expect(line).toContain('after-vision=41');
    expect(line).toContain('injected=1');
  });
});

describe('keyless archive subjects are questions, not evidence', () => {
  it('rejects an opaque item returned under a widened archive subject', () => {
    const subjects = motionQueryPlan(AIRLINE_TOPIC, false, { stockKeyed: false }).queries;
    expect(subjects).toEqual(expect.arrayContaining(['explosive decompression test', 'airline stewardess cabin']));
    for (const query of ['explosive decompression test', 'airline stewardess cabin']) {
      const verdict = archiveEvidenceVerdict(
        {
          source: 'Archive.org live',
          url: 'https://archive.org/download/reel_88/reel_88.mp4',
          title: '',
          query,
        },
        { query, topicBlob: AIRLINE_TOPIC },
      );
      expect(verdict.ok).toBe(false);
      expect(verdict.reason).toBe('no-provider-metadata');
    }
  });

  it('still admits an item whose own metadata names the widened subject', () => {
    const verdict = archiveEvidenceVerdict(
      {
        source: 'Archive.org live',
        url: 'https://archive.org/download/decomp58/decomp58.mp4',
        title: 'explosive decompression of a pressurized airliner cabin, 1958 test flight',
        query: 'explosive decompression test',
      },
      { query: 'explosive decompression test', topicBlob: AIRLINE_TOPIC },
    );
    expect(verdict.ok).toBe(true);
  });
});

describe('airline off-topic still junk (wildfire/Google/booking/false-pressure)', () => {
  it('isJunkStockClip rejects wave-2A airline scrape patterns', () => {
    const topic = AIRLINE_TOPIC;
    const cases = [
      ["LA's Deadly Fires Triggered by Hidden Electrical Faults grid failures", 'wildfire'],
      ['SOME TERMINATED PROJECTS BY IT GIANT GOOGLE must watch failures hidden', 'google'],
      ['How to book Allegiant Airline flight tickets', 'booking'],
      ['Calculate the final pressure of an ideal diatomic gas', 'false-pressure'],
      ['Orion Pressure Vessel spacecraft capsule weld', 'false-pressure'],
      ['flying with fuel made from sunlight solar kerosene swiss airline', 'solar'],
    ];
    for (const [alt] of cases) {
      expect(isJunkStockClip({ alt, query: 'Hidden Failures' }, topic)).toBe(true);
      expect(isAirlineRelevantClip({ alt, query: 'Hidden Failures' }, topic)).toBe(false);
    }
    expect(
      isAirlineRelevantClip(
        {
          alt: 'airplane cabin oxygen masks deployed above worried passengers',
          query: 'oxygen mask deploy airplane cabin',
        },
        topic,
      ),
    ).toBe(true);
  });
});

describe('spawnSyncFailureReason', () => {
  it('treats null status from signal kill or timeout as a failure reason', () => {
    expect(spawnSyncFailureReason({ status: null, signal: 'SIGTERM' }, 'server-render')).toBe(
      'server-render killed or timed out (SIGTERM)',
    );
  });

  it('returns no failure reason for status zero', () => {
    expect(spawnSyncFailureReason({ status: 0 }, 'server-render')).toBe('');
  });
});
