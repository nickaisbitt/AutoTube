import { describe, expect, it, vi } from 'vitest';
import {
  airlineQueryVisionBypass,
  archiveEvidenceLookupBudget,
  archiveEvidenceVerdict,
  preferHealthcareArchiveClinicalQueries,
  archiveIdentifierFromUrl,
  archiveShortQueryVariants,
  archiveTopicSubjectQueries,
  buildMotionPaddingQueue,
  decideStockVisionGate,
  decideInjectRelevanceAction,
  INJECT_RELEVANCE_STARVE_SOFT_THRESHOLD,
  shouldRunHarvestRelevanceGate,
  extraArchiveClinicalAttemptsOnVimeoCircuitOpen,
  prioritizeArchiveClinicalFaceOrMriLeads,
  resolveArchiveClinicalBoostCount,
  DUAL_CIRCUIT_ARCHIVE_CLINICAL_BOOST_COUNT,
  VIMEO_CIRCUIT_ARCHIVE_CLINICAL_BOOST_COUNT,
  fetchWebVideoResults,
  formatMotionDropFunnel,
  formatMotionPathLog,
  isAirlineRelevantClip,
  isJunkStockClip,
  isSafeStockMotionQuery,
  isYouTubeMotionCandidate,
  isTikTokMotionCandidate,
  isVimeoMotionCandidate,
  isDailymotionMotionCandidate,
  dailymotionVideoIdFromUrl,
  resolveDailymotionProbeUrl,
  softProbeDailymotionUrl,
  isHousingNamedDocumentaryBlob,
  isHousingDaleFarmOnlyNamedBlob,
  isVisionBudgetSoft,
  hasYtDlpCookies,
  unreliableWebProxyInjectReason,
  isYouTubeThumbnailStill,
  restoreMotionRelevancePassed,
  keylessOmitsStockMotionPool,
  motionCandidateHostRank,
  motionQueryPlan,
  openVimeoFetchCircuit,
  openDailymotionFetchCircuit,
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
  stripJunkDemoVideos,
  stripJunkStillAssets,
  webMotionHostQueryVariants,
  webMotionQueryVariants,
  withDistinctProxyIdentity,
  withArchiveSweepSuffix,
  HEALTHCARE_FACE_FIRST_REHARVEST_QUERIES,
  HEALTHCARE_HOST_FACE_EARLY_COUNT,
  HEALTHCARE_KEYLESS_QUERY_CAP,
  HOUSING_FACE_FIRST_REHARVEST_QUERIES,
  HOUSING_HOST_FACE_EARLY_COUNT,
  HOUSING_KEYLESS_QUERY_CAP,
  isWebHostScopedQuery,
} from '../generate-full-video.mjs';
import { evaluateHarvestVolume } from '../harvest-quality.mjs';

const AIRLINE_TOPIC = 'How a regional airline hid recurring cabin-pressure failures from passengers';
const HOUSING_TOPIC = 'The landlord algorithm that evicted tenants from rent-stabilized apartments';
const HEALTHCARE_AI_TOPIC = 'Why AI will change healthcare';
const HOUSING_CRASH_TOPIC = 'The housing crash they said would never happen';

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

  it('admits healthcare Archive items with clinical metadata even when topic tokens miss', () => {
    const verdict = archiveEvidenceVerdict(
      {
        source: 'Archive.org live',
        url: 'https://archive.org/download/x/y.mp4',
        title: 'hospital corridor nurse station ward',
        query: 'opaque harvest subject xyz',
      },
      { query: 'opaque harvest subject xyz', topicBlob: 'Why AI will change healthcare' },
    );
    expect(verdict.ok).toBe(true);
    expect(verdict.reason).toBe('healthcare-clinical-metadata');
  });

  it('rejects surgical-robot Archive hits whose titles are GeekBeat / fashion mismatch', () => {
    const verdict = archiveEvidenceVerdict(
      {
        source: 'Archive.org live',
        url: 'https://archive.org/download/GeekBeat/clip.mp4',
        title: 'geekbeat tv 433 at t will unlock your old iphone',
        query: 'surgical robot',
      },
      { query: 'surgical robot', topicBlob: 'Why AI will change healthcare' },
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toMatch(/healthcare-query-title-mismatch|healthcare-off-topic/);
  });

  it('rejects ambiguous laboratory-only Archive match for medical laboratory query', () => {
    const verdict = archiveEvidenceVerdict(
      {
        source: 'Archive.org live',
        url: 'https://archive.org/download/brookhaven/clip.mp4',
        title: 'brookhaven spectrum 1967 atomic experiments at brookhaven national laboratory',
        query: 'medical laboratory',
      },
      { query: 'medical laboratory', topicBlob: 'Why AI will change healthcare' },
    );
    expect(verdict.ok).toBe(false);
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
    // housing-web168: named-doc DM leads first, then shocked-face / lived-in.
    expect(keyless.queries.slice(0, 2)).toEqual([
      'dale farm eviction site:dailymotion.com',
      'west sussex eviction site:dailymotion.com',
    ]);
    expect(keyless.queries).toEqual(
      expect.arrayContaining([
        'foreclosure auction house steps crowd',
        'worried face eviction notice apartment',
        'packing moving boxes evicted apartment',
      ]),
    );
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

  it('does NOT include literal topic subjects for housing topics', () => {
    const queries = webMotionQueryVariants(
      'The housing crash they said would never happen',
      ['worried tenant eviction notice apartment', 'family packing boxes moving'],
    );
    // baseQueries should pass through
    expect(queries).toContain('worried tenant eviction notice apartment');
    // but archiveTopicSubjectQueries literal derivatives like "housing crash" must not appear
    expect(queries.some((q) => /\bhousing\s+crash\b/i.test(q))).toBe(false);
    expect(queries.some((q) => /\bhousing\s+market\b/i.test(q))).toBe(false);
  });

  it('does NOT include literal topic subjects for healthcare topics', () => {
    const queries = webMotionQueryVariants(
      'Why AI will change healthcare forever',
      ['doctor patient face clinical', 'radiologist mri monitor'],
    );
    expect(queries).toContain('doctor patient face clinical');
    // literal "healthcare" / "AI healthcare" subjects from archiveTopicSubjectQueries must not appear
    expect(queries.some((q) => /\bhealthcare\b/i.test(q) && !/doctor|patient|clinic|hospital|mri|radiolog/i.test(q))).toBe(false);
  });
});


describe('preferHealthcareArchiveClinicalQueries', () => {
  it('prepends face-first / surgical-robot / radiologist leads when archive-only', () => {
    const biased = preferHealthcareArchiveClinicalQueries(
      ['hospital ward', 'doctor patient', 'medical examination'],
      { archiveOnly: true },
    );
    expect(biased[0]).toMatch(/face|surgical robot|radiologist|da vinci|ai radiology/i);
    expect(biased).toEqual(expect.arrayContaining(['hospital ward']));
  });

  it('leaves query order unchanged when not archive-only', () => {
    const qs = ['hospital ward', 'doctor patient'];
    expect(preferHealthcareArchiveClinicalQueries(qs, { archiveOnly: false })).toEqual(qs);
  });
});

describe('non-YouTube motion planning and ranking', () => {
  it('keeps explicit Vimeo and Dailymotion searches safe and tied to base queries', () => {
    const queries = webMotionHostQueryVariants([
      'airliner cabin oxygen mask',
      'pilot cockpit headset face close-up',
    ]);

    expect(queries).toEqual([
      'airliner cabin oxygen mask site:dailymotion.com',
      'airliner cabin oxygen mask site:vimeo.com',
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
    // Vimeo demoted to 25 (TLS fingerprint risk) — after generic web (10), before TikTok (40).
    expect(ranked.map((clip) => clip.url)).toEqual([
      'https://archive.org/download/cabin/cabin.mp4',
      'https://cdn.example.org/cabin.webm',
      'https://giphy.com/gifs/airplane-cabin-xyz',
      'https://www.dailymotion.com/video/xyz',
      'https://example.org/page-only',
      'https://vimeo.com/12345',
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
    const faceArchive = {
      url: 'https://archive.org/download/face/eviction.mp4',
      source: 'Archive.org live',
      query: 'shocked face eviction notice',
      alt: 'grandmother faces eviction from apartment',
      score: 2,
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
      [opaqueArchive, housingArchive, faceArchive, webFace, bingWeb],
      (clip) => clip.score,
      { topicBlob: HOUSING_TOPIC },
    );
    // Direct .mp4 web (1) beats strong housing Archive (5); within Archive tier,
    // higher topical score (face) wins. Vimeo demoted to 25; opaque stays 35.
    expect(ranked.map((clip) => clip.url)).toEqual([
      bingWeb.url,
      faceArchive.url,
      housingArchive.url,
      webFace.url,
      opaqueArchive.url,
    ]);
    // Strong apartment + intro-face Archive share tier 5; opaque stays 35.
    expect(motionCandidateHostRank(faceArchive, { topicBlob: HOUSING_TOPIC })).toBe(5);
    expect(motionCandidateHostRank(housingArchive, { topicBlob: HOUSING_TOPIC })).toBe(5);
    expect(motionCandidateHostRank(opaqueArchive, { topicBlob: HOUSING_TOPIC })).toBe(35);
    expect(motionCandidateHostRank(housingArchive, { topicBlob: HOUSING_TOPIC }))
      .toBeLessThan(motionCandidateHostRank(
        { url: `http://localhost:5173/api/download-clip?url=${encodeURIComponent('https://news.example/page')}` },
        { topicBlob: HOUSING_TOPIC },
      ));
    expect(motionCandidateHostRank(opaqueArchive, { topicBlob: HOUSING_TOPIC }))
      .toBeGreaterThan(motionCandidateHostRank(webFace, { topicBlob: HOUSING_TOPIC }));
    // Airline topics still prefer Archive first.
    expect(motionCandidateHostRank(opaqueArchive, { topicBlob: AIRLINE_TOPIC })).toBe(0);
  });

  it('housing named-doc Archive: West Sussex/SF/Richmond rank 4; Dale-Farm-only demoted to 5 (web172)', () => {
    // housing-web168: injected=6/18 with probe-fail=3 — random direct .mp4 (rank 1)
    // beat Archive face (5) then failed canFetch. Named-doc Archive host tier 4
    // (aligned with housingIntroRepairRank 4) + preferProbePassHosts demotes
    // non-archive directs behind Archive so probe-pass hosts fill ≥12 slots.
    // housing-web172: Dale-Farm-only demoted to 5 so West Sussex / SF / Richmond
    // outrank early Dale Farm oversaturation without breaking intro-face gates.
    const daleFarmOnly = {
      url: 'https://archive.org/download/dale/dale-farm.mp4',
      source: 'Archive.org live',
      title: 'dale farm travellers eviction documentary',
      alt: 'dale farm eviction family face',
      query: 'dale farm eviction',
    };
    const westSussex = {
      url: 'https://archive.org/download/ws/west-sussex.mp4',
      source: 'Archive.org live',
      title: 'west sussex man faces an eviction order from his littlehampton home',
      alt: 'west sussex eviction face',
      query: 'west sussex eviction',
    };
    const faceArchive = {
      url: 'https://archive.org/download/face/eviction.mp4',
      source: 'Archive.org live',
      query: 'shocked face eviction notice',
      alt: 'grandmother faces eviction from apartment',
    };
    const flakyDirect = {
      url: `http://localhost:5173/api/download-clip?url=${encodeURIComponent('https://example.com/dead.mp4')}`,
      sourceUrl: 'https://example.com/dead.mp4',
      source: 'DDG web video',
      query: 'worried couple apartment',
      alt: 'tenant reading eviction letter',
    };
    expect(isHousingDaleFarmOnlyNamedBlob(daleFarmOnly.title)).toBe(true);
    expect(isHousingDaleFarmOnlyNamedBlob(westSussex.title)).toBe(false);
    expect(motionCandidateHostRank(westSussex, { topicBlob: HOUSING_TOPIC })).toBe(4);
    expect(motionCandidateHostRank(daleFarmOnly, { topicBlob: HOUSING_TOPIC })).toBe(5);
    expect(motionCandidateHostRank(faceArchive, { topicBlob: HOUSING_TOPIC })).toBe(5);
    expect(motionCandidateHostRank(flakyDirect, {
      topicBlob: HOUSING_TOPIC,
      preferProbePassHosts: true,
    })).toBe(8);
    expect(motionCandidateHostRank(flakyDirect, { topicBlob: HOUSING_TOPIC })).toBe(1);
    const ranked = rankMotionCandidates(
      [flakyDirect, faceArchive, daleFarmOnly, westSussex],
      () => 0,
      { topicBlob: HOUSING_TOPIC, preferProbePassHosts: true },
    );
    expect(ranked.map((c) => c.url)).toEqual([
      westSussex.url,
      faceArchive.url,
      daleFarmOnly.url,
      flakyDirect.url,
    ]);
  });

  it('housing Vimeo/DM circuit pins liveTarget to liveCap so Archive extras run', () => {
    // housing-web168: web pool already past liveTarget → Archive extras skipped
    // (archive=4) while clip-pool=121. Pin liveTarget=liveCap for housing.
    const archive = { url: 'https://archive.org/download/a/a.mp4', source: 'Archive.org live' };
    const vimeoDead = {
      url: 'http://localhost:5173/api/download-clip?url=' + encodeURIComponent('https://vimeo.com/1'),
      sourceUrl: 'https://vimeo.com/1',
    };
    const liveClips = [archive, vimeoDead];
    const widened = openVimeoFetchCircuit(
      liveClips,
      { liveCap: 140, perQueryCap: 10, liveTarget: 40 },
      { housing: true },
    );
    expect(widened.liveTarget).toBe(widened.liveCap);
    expect(widened.liveCap).toBeGreaterThan(140);
    const dmClips = [archive];
    const dmWidened = openDailymotionFetchCircuit(
      dmClips,
      { liveCap: 140, perQueryCap: 10, liveTarget: 40 },
      { housing: true },
    );
    expect(dmWidened.liveTarget).toBe(dmWidened.liveCap);
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
      expect(unreliableWebProxyInjectReason(tiktok)).toBe('tiktok-without-cookies');
      expect(unreliableWebProxyInjectReason(tiktok, { tiktokBlocked: true })).toBe('tiktok-without-cookies');
      expect(unreliableWebProxyInjectReason({ url: 'https://archive.org/download/a/a.mp4' })).toBe(null);
      expect(isYouTubeThumbnailStill('https://i.ytimg.com/vi/abc/maxresdefault.jpg')).toBe(true);
      expect(isYouTubeThumbnailStill('https://archive.org/download/a/still.jpg')).toBe(false);
    } finally {
      if (prevCookies === undefined) delete process.env.YTDLP_COOKIES;
      else process.env.YTDLP_COOKIES = prevCookies;
    }
  });

  it('honors a Vimeo circuit breaker once the soft-probe fails', () => {
    // housing-web85: 18/18 injected Vimeo proxy clips were trusted with no probe,
    // every one failed yt-dlp ("blocked due to its TLS fingerprint") at render time,
    // and every slot silently reused a thumbnail still (raw tip-best 7.0, upload-ready
    // NO — LLM-detected two-image slideshow). Vimeo has no cookie requirement, so it
    // is not skipped up front like YouTube/TikTok — it opens the same circuit-breaker
    // once a soft-probe actually fails.
    const vimeo = {
      url: `http://localhost:5173/api/download-clip?url=${encodeURIComponent('https://vimeo.com/1051353744')}`,
      sourceUrl: 'https://vimeo.com/1051353744',
    };
    expect(isVimeoMotionCandidate(vimeo)).toBe(true);
    expect(unreliableWebProxyInjectReason(vimeo)).toBe(null);
    expect(unreliableWebProxyInjectReason(vimeo, { vimeoBlocked: false })).toBe(null);
    expect(unreliableWebProxyInjectReason(vimeo, { vimeoBlocked: true })).toBe('vimeo-circuit-open');
    expect(unreliableWebProxyInjectReason({ url: 'https://archive.org/download/a/a.mp4' }, { vimeoBlocked: true }))
      .toBe(null);
  });

  it('honors a Dailymotion circuit breaker once the soft-probe fails', () => {
    // housing-web152: ddg=82 / injected=18 DM after d15a0ad junk-match fix, but
    // yt-dlp lacked curl_cffi impersonation → every assemble download failed and
    // ffmpeg A/B-looped two stills (raw 5.2). Same circuit shape as Vimeo.
    const dm = {
      url: `http://localhost:5173/api/download-clip?url=${encodeURIComponent('https://www.dailymotion.com/video/x8fmvll')}`,
      sourceUrl: 'https://www.dailymotion.com/video/x8fmvll',
    };
    expect(isDailymotionMotionCandidate(dm)).toBe(true);
    expect(unreliableWebProxyInjectReason(dm)).toBe(null);
    expect(unreliableWebProxyInjectReason(dm, { dailymotionBlocked: false })).toBe(null);
    expect(unreliableWebProxyInjectReason(dm, { dailymotionBlocked: true })).toBe('dailymotion-circuit-open');
    expect(unreliableWebProxyInjectReason({ url: 'https://archive.org/download/a/a.mp4' }, { dailymotionBlocked: true }))
      .toBe(null);
  });

  it('dedupes Dailymotion page + CDN manifest URLs to the same video id', () => {
    expect(dailymotionVideoIdFromUrl('https://www.dailymotion.com/video/x8fmvll')).toBe('x8fmvll');
    expect(dailymotionVideoIdFromUrl(
      'https://cdndirector.dailymotion.com/cdn/manifest/video/x8fmvll.m3u8?sec=abc',
    )).toBe('x8fmvll');
    expect(dailymotionVideoIdFromUrl(
      `http://localhost:5173/api/download-clip?url=${encodeURIComponent('https://www.dailymotion.com/video/x8fmvll')}`,
    )).toBe('');
    // proxied targets are resolved via motionUrlKey; id helper is for raw URLs
    expect(dailymotionVideoIdFromUrl('https://dai.ly/x8fmvll')).toBe('x8fmvll');
  });

  it('maps CDN m3u8 manifests to the public page URL for soft-probe', () => {
    // housing-web153: probing cdndirector…/x8fmvll.m3u8 returned false and
    // false-tripped the DM circuit while the page URL soft-probes true.
    expect(resolveDailymotionProbeUrl(
      'https://cdndirector.dailymotion.com/cdn/manifest/video/x8fmvll.m3u8?sec=abc',
    )).toBe('https://www.dailymotion.com/video/x8fmvll');
    expect(resolveDailymotionProbeUrl('https://www.dailymotion.com/video/x8fmvll'))
      .toBe('https://www.dailymotion.com/video/x8fmvll');
    expect(resolveDailymotionProbeUrl('https://archive.org/download/a/a.mp4'))
      .toBe('https://archive.org/download/a/a.mp4');
    // softProbeDailymotionUrl must canonicalize before yt-dlp (housing-web168:
    // helper existed but was unwired — CDN probes false-tripped the circuit).
    expect(typeof softProbeDailymotionUrl).toBe('function');
    expect(isHousingNamedDocumentaryBlob(
      'west sussex man faces an eviction order from his littlehampton home',
    )).toBe(true);
    expect(isHousingNamedDocumentaryBlob('apartment building exterior')).toBe(false);
  });

  it('opens the Dailymotion circuit and biases remaining budget to Archive/direct at fetch time', () => {
    const archive = { url: 'https://archive.org/download/a/a.mp4', source: 'Archive.org live' };
    const vimeo = {
      url: 'http://localhost:5173/api/download-clip?url=' + encodeURIComponent('https://vimeo.com/1'),
      sourceUrl: 'https://vimeo.com/1',
    };
    const dmDead = {
      url: 'http://localhost:5173/api/download-clip?url=' + encodeURIComponent('https://www.dailymotion.com/video/x1'),
      sourceUrl: 'https://www.dailymotion.com/video/x1',
    };
    const dmAlsoDead = {
      url: 'http://localhost:5173/api/download-clip?url=' + encodeURIComponent('https://www.dailymotion.com/video/x2'),
      sourceUrl: 'https://www.dailymotion.com/video/x2',
    };
    const liveClips = [archive, dmDead, vimeo, dmAlsoDead];
    const widened = openDailymotionFetchCircuit(liveClips, { liveCap: 140, perQueryCap: 10, liveTarget: 40 });
    expect(liveClips).toEqual([archive, vimeo]);
    expect(widened.purged).toBe(2);
    expect(widened.liveCap).toBeGreaterThan(140);
    expect(widened.perQueryCap).toBeGreaterThan(10);
    expect(widened.liveTarget).toBeGreaterThan(40);
    expect(widened.liveTarget).toBeLessThanOrEqual(widened.liveCap);
  });

  it('opens the Vimeo circuit and biases remaining budget to Archive/Dailymotion/direct at fetch time', () => {
    // healthcare-web81+/housing-web85: the Vimeo circuit only opened at inject time,
    // after the entire fetch/collection budget had already been spent admitting doomed
    // Vimeo proxy clips into the live pool — so once inject rejected all of them, there
    // was no remaining fetch budget left to backfill from Archive/Dailymotion/direct
    // (HARVEST_VOLUME_FAIL). openVimeoFetchCircuit purges the already-admitted Vimeo
    // clips (they are exactly as doomed as the one that just failed the probe) and
    // widens the caps so the freed budget goes to hosts that actually survive assembly.
    const archive = { url: 'https://archive.org/download/a/a.mp4', source: 'Archive.org live' };
    const dailymotion = {
      url: 'http://localhost:5173/api/download-clip?url=' + encodeURIComponent('https://www.dailymotion.com/video/x1'),
      sourceUrl: 'https://www.dailymotion.com/video/x1',
    };
    const vimeoDead = {
      url: 'http://localhost:5173/api/download-clip?url=' + encodeURIComponent('https://vimeo.com/1051353744'),
      sourceUrl: 'https://vimeo.com/1051353744',
    };
    const vimeoAlsoDead = {
      url: 'http://localhost:5173/api/download-clip?url=' + encodeURIComponent('https://vimeo.com/999'),
      sourceUrl: 'https://vimeo.com/999',
    };
    const liveClips = [archive, vimeoDead, dailymotion, vimeoAlsoDead];
    const widened = openVimeoFetchCircuit(liveClips, { liveCap: 140, perQueryCap: 10, liveTarget: 40 });
    // Both already-admitted Vimeo clips are purged from the pool in place...
    expect(liveClips).toEqual([archive, dailymotion]);
    expect(widened.purged).toBe(2);
    // ...and the remaining budget widens, never shrinks, so Archive/Dailymotion/direct
    // absorb what Vimeo can no longer supply.
    expect(widened.liveCap).toBeGreaterThan(140);
    expect(widened.perQueryCap).toBeGreaterThan(10);
    expect(widened.liveTarget).toBeGreaterThan(40);
    expect(widened.liveTarget).toBeLessThanOrEqual(widened.liveCap);
  });

  it('schedules more Archive clinical subjects once the healthcare Vimeo circuit opens', () => {
    // healthcare-web81+: queryCap truncates plan.queries (and the batches built from
    // it) long before every clinical Archive subject in plan.archiveQueries gets a
    // turn. Once the circuit opens, the widened budget from openVimeoFetchCircuit
    // should go to more Archive clinical subjects — not another round of the same
    // Vimeo-heavy web queries queryCap already scheduled.
    const archiveQueries = [
      'surgical robot',
      'ultrasound demonstration',
      'operating room surgery',
      'mri scanner hospital',
      'ai cancer detection',
    ];
    const scheduledKeys = new Set(['surgical robot', 'ultrasound demonstration']);
    const boost = extraArchiveClinicalAttemptsOnVimeoCircuitOpen(archiveQueries, scheduledKeys);
    expect(boost.map((a) => a.query)).toEqual([
      'operating room surgery',
      'mri scanner hospital',
      'ai cancer detection',
    ]);
    expect(boost.every((a) => a.extra === true && a.page === 1 && a.sweep === '')).toBe(true);
  });

  it('caps and dedupes the Vimeo-circuit Archive clinical boost', () => {
    const archiveQueries = ['a', 'A', 'b', 'c'];
    const boost = extraArchiveClinicalAttemptsOnVimeoCircuitOpen(archiveQueries, new Set(), 2);
    expect(boost.map((a) => a.query)).toEqual(['a', 'b']);
  });

  it('raises Archive clinical boost when Vimeo+DM are both dead or after-junk is thin', () => {
    // Surviving HC runs often HARVEST_VOLUME_FAIL with after-junk≈6–8 once web
    // proxies die — dual-circuit / thin volume must schedule more face/OR/MRI.
    expect(resolveArchiveClinicalBoostCount({
      vimeoCircuitOpen: true,
      dailymotionCircuitOpen: true,
    })).toBe(DUAL_CIRCUIT_ARCHIVE_CLINICAL_BOOST_COUNT);
    expect(resolveArchiveClinicalBoostCount({
      vimeoCircuitOpen: true,
      afterJunk: 7,
    })).toBe(DUAL_CIRCUIT_ARCHIVE_CLINICAL_BOOST_COUNT);
    expect(resolveArchiveClinicalBoostCount({
      vimeoCircuitOpen: true,
      dailymotionCircuitOpen: false,
      afterJunk: 40,
    })).toBe(VIMEO_CIRCUIT_ARCHIVE_CLINICAL_BOOST_COUNT);
    expect(DUAL_CIRCUIT_ARCHIVE_CLINICAL_BOOST_COUNT).toBeGreaterThan(
      VIMEO_CIRCUIT_ARCHIVE_CLINICAL_BOOST_COUNT,
    );
  });

  it('prioritizes face/OR/MRI Archive leads ahead of weaker clinical subjects', () => {
    const ordered = prioritizeArchiveClinicalFaceOrMriLeads([
      'hospital ward nurses',
      'doctor face patient consultation close up',
      'medical laboratory clinical',
      'mri scanner hospital',
      'operating room surgery',
      'stethoscope doctor',
    ]);
    expect(ordered.slice(0, 3)).toEqual([
      'doctor face patient consultation close up',
      'mri scanner hospital',
      'operating room surgery',
    ]);
    const boost = extraArchiveClinicalAttemptsOnVimeoCircuitOpen(
      [
        'hospital ward nurses',
        'stethoscope doctor',
        'doctor face patient consultation close up',
        'operating room surgery',
      ],
      new Set(['hospital ward nurses']),
      2,
    );
    expect(boost.map((a) => a.query)).toEqual([
      'doctor face patient consultation close up',
      'operating room surgery',
    ]);
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

  it('restores housing Bing/DDG face clips marked motionRelevancePassed after relevance strips them', () => {
    // housing-web57/58: Mixkit pads lacked this flag → protected-motion=0 → thin unique videos.
    const webFace = {
      id: 'stock-video-s1-p0-0',
      segmentId: 's1',
      type: 'video',
      url: 'http://localhost:5173/api/download-clip/.autotube-s1-0/../../download-clip?url='
        + encodeURIComponent('https://vimeo.com/housing-face-1'),
      source: 'Bing web video',
      alt: 'worried tenant face close up packing boxes apartment',
      query: 'worried tenant apartment face close up',
      motionRelevancePassed: true,
    };
    const mixkitPad = {
      id: 'stock-video-s1-p0-1',
      segmentId: 's1',
      type: 'video',
      url: 'https://assets.mixkit.co/videos/10052/10052-720.mp4',
      source: 'pool',
      motionRelevancePassed: false,
    };
    const kept = restoreMotionRelevancePassed(
      [],
      [webFace, mixkitPad],
      [
        { segmentId: 's1', url: webFace.url, motionRelevancePassed: true },
        { segmentId: 's1', url: mixkitPad.url, motionRelevancePassed: false },
      ],
    );
    expect(kept.media).toHaveLength(1);
    expect(kept.media[0].url).toBe(webFace.url);
  });
});

describe('keylessOmitsStockMotionPool — housing-web57/58 Mixkit leak', () => {
  it('omits Mixkit/STOCK fallback for keyless housing and healthcare', () => {
    expect(keylessOmitsStockMotionPool(HOUSING_CRASH_TOPIC, false)).toBe(true);
    expect(keylessOmitsStockMotionPool(HOUSING_TOPIC, false)).toBe(true);
    expect(keylessOmitsStockMotionPool('Why AI will change healthcare forever', false)).toBe(true);
  });

  it('keeps stock fallback when stock API keys are present or topic is unrelated', () => {
    expect(keylessOmitsStockMotionPool(HOUSING_CRASH_TOPIC, true)).toBe(false);
    expect(keylessOmitsStockMotionPool(AIRLINE_TOPIC, false)).toBe(false);
    expect(keylessOmitsStockMotionPool('bank scam voice clone', false)).toBe(false);
  });

  it('documents Mixkit host-rank beating Bing/DDG Vimeo (why omit is required)', () => {
    const mixkit = { url: 'https://assets.mixkit.co/videos/10052/10052-720.mp4', source: 'pool' };
    const vimeoWeb = {
      url: `http://localhost:5173/api/download-clip?url=${encodeURIComponent('https://vimeo.com/12345')}`,
      sourceUrl: 'https://vimeo.com/12345',
      source: 'Bing web video',
      alt: 'worried tenant apartment face',
    };
    expect(motionCandidateHostRank(mixkit, { topicBlob: HOUSING_CRASH_TOPIC }))
      .toBeLessThan(motionCandidateHostRank(vimeoWeb, { topicBlob: HOUSING_CRASH_TOPIC }));
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

describe('healthcare keyless motion pack + volume chase', () => {
  it('uses ARCHIVE healthcare subjects for keyless AI-healthcare topics', () => {
    const plan = motionQueryPlan(HEALTHCARE_AI_TOPIC, false, { stockKeyed: false, faceSeek: true });
    expect(plan.mode).toBe('keyless');
    expect(plan.queries).toEqual(expect.arrayContaining([
      'dexter robotic surgery system',
      'mri scanner',
      'radiologist workstation',
      'surgical robot operating room',
    ]));
    // Clinical leads come first so archive-only (bing=ddg=google=0) burns budget on OR/robot.
    expect(plan.queries[0]).toMatch(/face|surgical robot|radiologist|da vinci|ai radiology/i);
    expect(plan.archiveQueries[0]).toMatch(/face|surgical robot|radiologist|da vinci|ai radiology/i);
    expect(plan.queries.some((q) => /radiologist|telemedicine|surgical robot|operating room/i.test(q))).toBe(true);
  });

  it('leads with AI radiology / clinician+screen / OR face-first queries and DM/Vimeo host searches', () => {
    const plan = motionQueryPlan(HEALTHCARE_AI_TOPIC, false, { stockKeyed: false, faceSeek: true });
    // Human face leads must outrank corridor establishing shots (tip-best 6.6 stall).
    // Short host-lead bases lead (web197); "close up" variants follow in the clinical pack.
    // healthcare-web199: first-class site: face searches occupy early slots so DM/Vimeo
    // face leads run before Archive enrichment burns the batch budget (was 8/25).
    expect(plan.queries.slice(0, HEALTHCARE_HOST_FACE_EARLY_COUNT).every(isWebHostScopedQuery)).toBe(true);
    expect(plan.queries[0]).toMatch(/doctor face patient consultation site:dailymotion\.com/i);
    expect(plan.queries).toEqual(expect.arrayContaining([
      'doctor face patient consultation',
      'doctor face patient consultation close up',
      'ai radiology doctor monitor screen',
      'clinician pointing at mri monitor',
      'surgical robot operating room',
      'ultrasound demonstration clinician',
      'ai radiology',
    ]));
    // Prefer Dailymotion host leads (Vimeo TLS fingerprint risk); keep Vimeo fallbacks.
    // Short bases (≤5 content words) so site: variants clear isSafeStockMotionQuery;
    // motionQueryPlan prepends every host-lead base into early queries (web197).
    expect(plan.webHostQueries[0]).toMatch(/doctor face patient consultation site:dailymotion\.com/i);
    expect(plan.webHostQueries.some((q) => /surgeon face operating room site:dailymotion\.com/i.test(q))).toBe(true);
    expect(plan.webHostQueries.some((q) => /clinician face at workstation monitors site:dailymotion\.com/i.test(q))).toBe(true);
    expect(plan.webHostQueries.some((q) => /ai\s+radiology\s+site:dailymotion\.com/i.test(q))).toBe(true);
    expect(plan.webHostQueries.some((q) => /surgical\s+robot\s+site:dailymotion\.com/i.test(q))).toBe(true);
    expect(plan.webHostQueries.some((q) => /mri scanner room clinical site:dailymotion\.com/i.test(q))).toBe(true);
    expect(plan.webHostQueries.some((q) => /ai\s+radiology\s+site:vimeo\.com/i.test(q))).toBe(true);
    expect(plan.webHostQueries.some((q) => /surgical\s+robot\s+site:vimeo\.com/i.test(q))).toBe(true);
    // Host pool grew past web199's 25 so more face/OR site: leads are available.
    expect(plan.webHostQueries.length).toBeGreaterThanOrEqual(30);
    // site: searches stay out of the Archive lane.
    expect(plan.archiveQueries.every((q) => !isWebHostScopedQuery(q))).toBe(true);
    // Every healthcareHostLead base must appear in the early query list so site:
    // searches fire within queryCap (web197 thin ddg=8 / host-queries=4/23;
    // web199 raised cap so first-class site: + bases both fit).
    const capped = plan.queries.slice(0, HEALTHCARE_KEYLESS_QUERY_CAP).map((q) => q.toLowerCase());
    const hostBases = plan.webHostQueries.map((hq) => hq.replace(/\s+site:(?:vimeo\.com|dailymotion\.com)\s*$/i, '').trim().toLowerCase());
    const uniqueHostBases = [...new Set(hostBases)];
    const fireable = uniqueHostBases.filter((b) => capped.includes(b) || capped.some((q) => q.startsWith(`${b} site:`)));
    expect(fireable.length).toBe(uniqueHostBases.length);
    const faceIdx = plan.queries.findIndex((q) => /doctor face patient consultation/i.test(q));
    const corridorIdx = plan.queries.findIndex((q) => /hospital corridor hallway/i.test(q));
    expect(faceIdx).toBeGreaterThanOrEqual(0);
    expect(corridorIdx).toBeGreaterThan(faceIdx);
  });

  it('uses dedicated face/OR/MRI pack when faceSeek (INTRO_FACE_FAIL re-harvest)', () => {
    const plan = motionQueryPlan(HEALTHCARE_AI_TOPIC, false, { stockKeyed: false, faceSeek: true });
    expect(plan.faceSeek).toBe(true);
    // Face-first reharvest pack subjects appear before ward/corridor magnets.
    for (const q of HEALTHCARE_FACE_FIRST_REHARVEST_QUERIES.slice(0, 8)) {
      expect(plan.queries.some((p) => p.toLowerCase() === q.toLowerCase())).toBe(true);
    }
    const facePackLast = Math.max(
      ...HEALTHCARE_FACE_FIRST_REHARVEST_QUERIES.map((q) =>
        plan.queries.findIndex((p) => p.toLowerCase() === q.toLowerCase())),
    );
    const wardIdx = plan.queries.findIndex((q) => /^hospital ward$/i.test(q));
    if (wardIdx >= 0) expect(wardIdx).toBeGreaterThan(facePackLast);
  });

  it('prefers Archive clinical face/OR over corridor establishing on healthcare', () => {
    const faceArchive = {
      url: 'https://archive.org/download/face/face.mp4',
      source: 'Archive.org live',
      alt: 'doctor face patient consultation close up hospital',
      title: 'doctor face patient consultation',
      score: 0,
    };
    const orArchive = {
      url: 'https://archive.org/download/or/or.mp4',
      source: 'Archive.org live',
      alt: 'surgical robot operating room da vinci clinical',
      title: 'surgical robot operating room',
      score: 0,
    };
    const corridorArchive = {
      url: 'https://archive.org/download/corridor/corridor.mp4',
      source: 'Archive.org live',
      alt: 'hospital corridor walking away nurses hallway',
      title: 'hospital corridor footage',
      score: 100,
    };
    const dmFace = {
      url: 'https://www.dailymotion.com/video/face1',
      source: 'DuckDuckGo web video',
      alt: 'worried patient face doctor hospital',
      score: 0,
    };
    expect(motionCandidateHostRank(faceArchive, { topicBlob: HEALTHCARE_AI_TOPIC })).toBe(5);
    expect(motionCandidateHostRank(orArchive, { topicBlob: HEALTHCARE_AI_TOPIC })).toBe(5);
    expect(motionCandidateHostRank(corridorArchive, { topicBlob: HEALTHCARE_AI_TOPIC })).toBe(35);
    const beautyArchive = {
      url: 'https://archive.org/download/beauty/beauty.mp4',
      source: 'Archive.org live',
      alt: 'close up view of pretty woman s face',
      title: 'close up view of pretty woman s face',
      score: 0,
    };
    const osteoArchive = {
      url: 'https://archive.org/download/osteo/osteo.mp4',
      source: 'Archive.org live',
      alt: 'holisticrehabclinic osteopathy physiotherapy holborn',
      title: 'holisticrehabclinic osteopathy physiotherapy',
      score: 0,
    };
    expect(motionCandidateHostRank(beautyArchive, { topicBlob: HEALTHCARE_AI_TOPIC })).toBe(35);
    expect(motionCandidateHostRank(osteoArchive, { topicBlob: HEALTHCARE_AI_TOPIC })).toBe(35);
    const ranked = rankMotionCandidates(
      [corridorArchive, orArchive, faceArchive, dmFace, beautyArchive],
      (clip) => clip.score,
      { topicBlob: HEALTHCARE_AI_TOPIC },
    );
    // DM (2) ahead of intro-face Archive (5); corridor/beauty establishing last (35).
    expect(ranked[0].url).toBe(dmFace.url);
    expect(ranked[ranked.length - 1].url).toMatch(/corridor|beauty/);
    expect(ranked.slice(1, 3).map((c) => c.url).sort()).toEqual(
      [faceArchive.url, orArchive.url].sort(),
    );
  });

  it('housing webHostQueries lead with named-doc + shocked-face DM before Vimeo', () => {
    const plan = motionQueryPlan(HOUSING_TOPIC, false, { stockKeyed: false });
    // housing-web158/168: first-class site: named-doc + face/lived-in occupy early slots.
    expect(plan.queries.slice(0, HOUSING_HOST_FACE_EARLY_COUNT).every(isWebHostScopedQuery)).toBe(true);
    expect(plan.queries[0]).toMatch(/dale farm eviction site:dailymotion\.com/i);
    expect(plan.webHostQueries[0]).toMatch(/dale farm eviction site:dailymotion\.com/i);
    expect(plan.webHostQueries).toEqual(expect.arrayContaining([
      'dale farm eviction site:dailymotion.com',
      'west sussex eviction site:dailymotion.com',
      'san francisco tenants eviction site:dailymotion.com',
      'richmond eviction documentary site:dailymotion.com',
      'worried tenant face close up site:dailymotion.com',
      'renter face eviction notice apartment site:dailymotion.com',
      'family crying eviction apartment site:dailymotion.com',
      'grandmother faces eviction apartment site:dailymotion.com',
      'tenants faces eviction apartment site:dailymotion.com',
      'apartment interior living room tenant site:dailymotion.com',
      'shocked face eviction notice site:vimeo.com',
    ]));
    const dmNamed = plan.webHostQueries.findIndex((q) => /dale farm eviction site:dailymotion/i.test(q));
    const dmFace = plan.webHostQueries.findIndex((q) => /shocked face eviction notice site:dailymotion/i.test(q));
    const vimeoFace = plan.webHostQueries.findIndex((q) => /shocked face eviction notice site:vimeo/i.test(q));
    expect(dmNamed).toBe(0);
    expect(dmFace).toBeGreaterThan(dmNamed);
    expect(vimeoFace).toBeGreaterThan(dmFace);
    expect(plan.archiveQueries.every((q) => !isWebHostScopedQuery(q))).toBe(true);
    expect(plan.archiveQueries.slice(0, 4).join(' ')).toMatch(/dale farm|west sussex|san francisco|richmond/i);
    // Cap raised so first-class site: early + host bases both fit (was truncating).
    expect(HOUSING_KEYLESS_QUERY_CAP).toBeGreaterThanOrEqual(44);
    expect(HOUSING_HOST_FACE_EARLY_COUNT).toBeGreaterThanOrEqual(14);
    const capped = plan.queries.slice(0, HOUSING_KEYLESS_QUERY_CAP).map((q) => q.toLowerCase());
    const hostBases = plan.webHostQueries.map((hq) => hq.replace(/\s+site:(?:vimeo\.com|dailymotion\.com)\s*$/i, '').trim().toLowerCase());
    const uniqueHostBases = [...new Set(hostBases)];
    const fireable = uniqueHostBases.filter((b) => capped.includes(b) || capped.some((q) => q.startsWith(`${b} site:`)));
    expect(fireable.length).toBe(uniqueHostBases.length);
    expect(capped.filter((q) => isWebHostScopedQuery(q)).length)
      .toBeGreaterThanOrEqual(HOUSING_HOST_FACE_EARLY_COUNT);
  });

  it('uses dedicated housing face/lived-in pack when faceSeek (INTRO_FACE_FAIL re-harvest)', () => {
    const plan = motionQueryPlan(HOUSING_TOPIC, false, { stockKeyed: false, faceSeek: true });
    expect(plan.faceSeek).toBe(true);
    for (const q of HOUSING_FACE_FIRST_REHARVEST_QUERIES.slice(0, 8)) {
      expect(plan.queries.some((p) => p.toLowerCase() === q.toLowerCase())).toBe(true);
    }
  });

  it('chases keyless healthcare volume above the soft-pass floor like airline', () => {
    const targets = resolveMotionVolumeTargets({
      segmentCount: 6,
      segmentDurationSec: 90,
      cutIntervalSec: 0.85,
      hasStockKeys: false,
      topicBlob: HEALTHCARE_AI_TOPIC,
    });
    expect(targets.mode).toBe('keyless');
    expect(targets.minVideos).toBeGreaterThanOrEqual(18);
    expect(targets.perSegTarget).toBe(3);
    expect(targets.stockNeed).toBeGreaterThan(0);
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

describe('decideInjectRelevanceAction', () => {
  const base = {
    checked: 0,
    budget: 48,
    need: 8,
    isIntro: false,
    strongEvidence: false,
    motionRelevancePassed: false,
    relevanceRejected: 0,
  };

  it('runs the LLM gate within budget for unknown body clips', () => {
    expect(decideInjectRelevanceAction(base)).toEqual({
      action: 'check',
      reason: 'within-budget',
    });
    expect(shouldRunHarvestRelevanceGate(base)).toBe(true);
  });

  it('skips LLM and admits body clips with strongEvidence', () => {
    expect(
      decideInjectRelevanceAction({ ...base, strongEvidence: true }),
    ).toEqual({ action: 'admit', reason: 'strong-evidence' });
    expect(shouldRunHarvestRelevanceGate({ ...base, strongEvidence: true })).toBe(false);
  });

  it('skips LLM and admits body clips with motionRelevancePassed', () => {
    expect(
      decideInjectRelevanceAction({ ...base, motionRelevancePassed: true }),
    ).toEqual({ action: 'admit', reason: 'strong-evidence' });
  });

  it('still gates intro even with strongEvidence or motionRelevancePassed', () => {
    expect(
      decideInjectRelevanceAction({
        ...base,
        isIntro: true,
        strongEvidence: true,
        motionRelevancePassed: true,
      }),
    ).toEqual({ action: 'check', reason: 'within-budget' });
    expect(
      shouldRunHarvestRelevanceGate({
        ...base,
        isIntro: true,
        strongEvidence: true,
        motionRelevancePassed: true,
      }),
    ).toBe(true);
  });

  it('enters starveSoft admit on body after reject threshold while need remains', () => {
    expect(
      decideInjectRelevanceAction({
        ...base,
        relevanceRejected: INJECT_RELEVANCE_STARVE_SOFT_THRESHOLD,
        need: 5,
      }),
    ).toEqual({ action: 'admit', reason: 'starve-soft' });
    expect(
      decideInjectRelevanceAction({
        ...base,
        relevanceRejected: INJECT_RELEVANCE_STARVE_SOFT_THRESHOLD + 3,
        need: 1,
      }),
    ).toEqual({ action: 'admit', reason: 'starve-soft' });
  });

  it('does not starveSoft-admit when need is already filled', () => {
    expect(
      decideInjectRelevanceAction({
        ...base,
        need: 0,
        relevanceRejected: INJECT_RELEVANCE_STARVE_SOFT_THRESHOLD,
      }),
    ).toEqual({ action: 'check', reason: 'within-budget' });
  });

  it('keeps judging intro under starveSoft (WEAK still blocked by caller)', () => {
    expect(
      decideInjectRelevanceAction({
        ...base,
        isIntro: true,
        need: 6,
        relevanceRejected: INJECT_RELEVANCE_STARVE_SOFT_THRESHOLD,
      }),
    ).toEqual({ action: 'check', reason: 'within-budget' });
  });

  it('budget-skips without silently dropping the count path', () => {
    expect(
      decideInjectRelevanceAction({ ...base, checked: 48, budget: 48 }),
    ).toEqual({ action: 'admit', reason: 'budget-exhausted' });
    expect(shouldRunHarvestRelevanceGate({ ...base, checked: 48, budget: 48 })).toBe(false);
  });

  it('prefers strong-evidence admit over starveSoft and budget', () => {
    expect(
      decideInjectRelevanceAction({
        ...base,
        strongEvidence: true,
        checked: 99,
        relevanceRejected: 99,
        need: 9,
      }),
    ).toEqual({ action: 'admit', reason: 'strong-evidence' });
  });

  it('prefers starveSoft over budget-exhausted on body', () => {
    expect(
      decideInjectRelevanceAction({
        ...base,
        checked: 48,
        budget: 48,
        need: 4,
        relevanceRejected: INJECT_RELEVANCE_STARVE_SOFT_THRESHOLD,
      }),
    ).toEqual({ action: 'admit', reason: 'starve-soft' });
  });

  it('defaults starveSoft threshold to 12', () => {
    expect(INJECT_RELEVANCE_STARVE_SOFT_THRESHOLD).toBe(12);
    expect(
      decideInjectRelevanceAction({
        ...base,
        relevanceRejected: 11,
        need: 3,
      }).action,
    ).toBe('check');
    expect(
      decideInjectRelevanceAction({
        ...base,
        relevanceRejected: 12,
        need: 3,
      }).reason,
    ).toBe('starve-soft');
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
      relevanceChecked: 35,
      relevanceKept: 7,
      relevanceRejected: 28,
      relevanceWeakAdmitted: 2,
      relevanceUnverified: 0,
      relevanceBudgetSkipped: 0,
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
    expect(line).toContain('llm-checked=35 llm-kept=7 llm-rejected=28 llm-weak=2');
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

describe('healthcare off-topic conspiracy/FEMA/meme junk', () => {
  it('isJunkStockClip rejects Huxley/Orwell/FEMA/insect/peas/painting/literary-fest', () => {
    const cases = [
      { alt: 'aldous huxley orwell conspiracy EXPOSED title', query: 'healthcare ai' },
      { alt: 'FEMA fraud and scam awareness', query: 'healthcare' },
      { alt: 'Hurricane Laura FEMA assistance PSA', query: 'AI doctor' },
      { alt: 'Tornado anniversary coverage', query: 'diagnose' },
      { alt: 'cockroach insect close up', query: 'hospital' },
      { alt: 'green peas meme viral', query: 'healthcare' },
      { alt: 'classical oil painting renaissance portrait', query: 'medicine' },
      { alt: 'brattleboro literary festival friendship', query: 'hospital ward' },
      {
        alt: 'c 19 propaganda war ade sleepy joe',
        query: 'covid vaccine antibody dependent enhancement',
      },
    ];
    for (const clip of cases) {
      expect(isJunkStockClip(clip, HEALTHCARE_AI_TOPIC)).toBe(true);
    }
    expect(
      isJunkStockClip(
        {
          alt: 'doctor reviewing AI diagnosis with patient hospital',
          query: 'clinical AI hospital',
        },
        HEALTHCARE_AI_TOPIC,
      ),
    ).toBe(false);
    expect(
      isJunkStockClip(
        { alt: 'clinical laboratory microscope blood analysis', query: 'medical lab' },
        HEALTHCARE_AI_TOPIC,
      ),
    ).toBe(false);
  });

  it('stripJunkStillAssets drops healthcare off-topic stills but keeps clinical faces', () => {
    const project = {
      topic: HEALTHCARE_AI_TOPIC,
      media: [
        {
          id: 'orwell',
          type: 'image',
          url: 'https://cdn.example.com/orwell-exposed.jpg',
          alt: 'george orwell 1984 dystopian truth exposed',
          query: 'healthcare exposed',
        },
        {
          id: 'fema',
          type: 'image',
          url: 'https://cdn.example.com/fema-psa.jpg',
          alt: 'FEMA public outreach storm recovery',
          query: 'AI doctor',
        },
        {
          id: 'roach',
          type: 'image',
          url: 'https://cdn.example.com/cockroach.jpg',
          alt: 'cockroach insect close up crawling',
          query: 'hospital',
        },
        {
          id: 'fest',
          type: 'image',
          url: 'https://cdn.example.com/literary-fest.jpg',
          alt: 'literary festival authors on stage',
          query: 'hospital ward',
        },
        {
          id: 'doctor',
          type: 'image',
          url: 'https://cdn.example.com/doctor-ai.jpg',
          alt: 'doctor reviewing AI diagnosis patient hospital',
          query: 'clinical AI',
        },
      ],
    };
    const report = {};
    stripJunkStillAssets(project, report);
    expect(project.media.map(({ id }) => id)).toEqual(['doctor']);
    expect(report.junkStillDropped.length).toBeGreaterThanOrEqual(4);
  });
});

describe('housing off-topic crash/council/fire junk', () => {
  it('isJunkStockClip rejects car-crash, fire, council, quake, chart, CAN TV, house-on-rock', () => {
    const cases = [
      { alt: 'dashcam car crash footage on highway', query: 'housing crash' },
      { alt: 'traffic accident scene news footage', query: 'market crash' },
      { alt: 'wildfire burning building fire footage', query: 'housing' },
      { alt: 'city council meeting apartments approved', query: 'apartment' },
      { alt: 'earthquake quake damage downtown', query: 'housing crisis' },
      { alt: 'pie chart poll graphic lendingtree', query: 'rent prices' },
      { alt: 'CAN TV station id bumper', query: 'public housing' },
      {
        alt: '3d floating house illustration',
        url: 'https://neohomeloans.com/will-the-housing-market-crash.jpg',
        query: 'housing crash',
      },
      // housing-web18 query-pollution / wrong Archive slices
      { alt: 'Ticking Time Bomb dynamite alarm clock stock', query: 'housing crash' },
      { alt: 'periscopefilm bird nest propaganda film 18384', query: 'for rent sign' },
      { alt: 'leapfrog letter factory part 4 kids alphabet', query: 'reading letter' },
      { alt: 'Camp Mystic Guadalupe River texas flooding map', query: 'Florida and Texas' },
      { alt: 'J.G. Ballard David Cronenberg Crash movie', query: 'housing crash' },
      { alt: 'the progress center from affordable housing to self sufficiency', query: 'tenant eviction' },
      { alt: 'sixth annual fair housing conference april 2026', query: 'housing' },
      { alt: 'county announces apartment building inspection initiative', query: 'apartment building' },
      // housing-web19 required rejects
      { alt: 'RE/MAX FOR SALE sign suburban house yard sign', query: 'housing crash' },
      { alt: 'realtor sign real estate sign exterior listing', query: 'for sale' },
      { alt: 'LendingTree bar chart housing crash infographic', query: 'housing crash' },
      { alt: 'American Home Mortgage mousetrap bankruptcy slide graphic', query: 'housing crash' },
      { alt: 'youtuber gaming headset talking head podcast mic', query: 'housing explained' },
      { alt: 'touring a 27 3 million apartment in nyc s one57 business insider', query: 'apartment tour' },
    ];
    for (const clip of cases) {
      expect(isJunkStockClip(clip, HOUSING_CRASH_TOPIC)).toBe(true);
      expect(isJunkStockClip(clip, HOUSING_TOPIC)).toBe(true);
    }
    expect(
      isJunkStockClip(
        {
          alt: 'worried couple reading eviction notice apartment interior',
          query: 'eviction notice tenant',
        },
        HOUSING_CRASH_TOPIC,
      ),
    ).toBe(false);
    // Keep Archive apartment body volume (lived-in tenant motion).
    expect(
      isJunkStockClip(
        {
          alt: 'tenant left in limbo apartment hallway packing boxes',
          query: 'eviction tenant apartment',
          source: 'Archive.org live',
        },
        HOUSING_CRASH_TOPIC,
      ),
    ).toBe(false);
  });

  it('stripJunkStillAssets drops housing off-topic stills but keeps apartment faces', () => {
    const project = {
      topic: HOUSING_CRASH_TOPIC,
      media: [
        {
          id: 'crash',
          type: 'image',
          url: 'https://cdn.example.com/car-crash-dashcam.jpg',
          alt: 'car crash dashcam footage highway',
          query: 'housing crash',
        },
        {
          id: 'council',
          type: 'image',
          url: 'https://cdn.example.com/city-council.jpg',
          alt: 'city council meeting public hearing',
          query: 'apartment zoning',
        },
        {
          id: 'rock',
          type: 'image',
          url: 'https://neohomeloans.com/housing-market-crash.jpg',
          alt: 'house on a rock 3d illustration',
          query: 'housing crash',
        },
        {
          id: 'tenant',
          type: 'image',
          url: 'https://cdn.example.com/tenant-letter.jpg',
          alt: 'worried tenant reading eviction notice apartment interior',
          query: 'eviction notice',
        },
      ],
    };
    const report = {};
    stripJunkStillAssets(project, report);
    expect(project.media.map(({ id }) => id)).toEqual(['tenant']);
    expect(report.junkStillDropped.length).toBeGreaterThanOrEqual(3);
  });
});

describe('Dailymotion host must not trip lifestyleJunk (DM-prefer)', () => {
  it('keeps topical DM clips whose only dailymotion token is the host URL', () => {
    // Pre-fix: lifestyleJunk matched bare `dailymotion` against sourceUrl/url and
    // zeroed every site:dailymotion.com hit (healthcare HARVEST_VOLUME_FAIL / housing
    // Archive-only despite live DDG DM SERPs after 4c19bf5/1b95c7a).
    // Fixture uses live Ulster OR (not medway product-pad) so web202 faceless-robot
    // reject does not mask the host-URL lifestyleJunk regression this test guards.
    expect(
      isJunkStockClip(
        {
          alt: 'ulster hospital surgical robot operating theatre live surgery',
          title: 'ulster hospital surgical robot operating theatre live surgery',
          query: 'surgical robot',
          source: 'DuckDuckGo web video',
          sourceUrl: 'https://www.dailymotion.com/video/x85pxfx',
          url: 'http://127.0.0.1:5173/api/download-clip?url=https%3A%2F%2Fwww.dailymotion.com%2Fvideo%2Fx85pxfx&duration=10',
        },
        HEALTHCARE_AI_TOPIC,
      ),
    ).toBe(false);
    expect(
      isJunkStockClip(
        {
          alt: 'west sussex man faces an eviction order from his littlehampton home',
          title: 'west sussex man faces an eviction order from his littlehampton home',
          query: 'eviction documentary',
          source: 'DuckDuckGo web video',
          sourceUrl: 'https://www.dailymotion.com/video/x9abcde',
          url: 'http://127.0.0.1:5173/api/download-clip?url=https%3A%2F%2Fwww.dailymotion.com%2Fvideo%2Fx9abcde&duration=10',
        },
        HOUSING_CRASH_TOPIC,
      ),
    ).toBe(false);
  });

  it('still rejects usa-it-shop storefront spam in title/alt', () => {
    expect(
      isJunkStockClip(
        {
          alt: 'usa it shop verified account cash app',
          title: 'usa it shop dailymotion promo',
          query: 'surgical robot',
          sourceUrl: 'https://www.dailymotion.com/video/xspam',
        },
        HEALTHCARE_AI_TOPIC,
      ),
    ).toBe(true);
  });
});
