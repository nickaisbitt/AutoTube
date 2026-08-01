import { describe, expect, it } from 'vitest';
import {
  airlineQueryVisionBypass,
  archiveEvidenceVerdict,
  archiveIdentifierFromUrl,
  archiveShortQueryVariants,
  decideStockVisionGate,
  formatMotionPathLog,
  isAirlineRelevantClip,
  isJunkStockClip,
  isSafeStockMotionQuery,
  isVisionBudgetSoft,
  motionQueryPlan,
  providerEvidenceText,
  recordVisionStockUnverified,
  resolveMotionVolumeTargets,
  resolveStockKeyMode,
  resolveVisionUnverifiedMax,
  spawnSyncFailureReason,
  withArchiveSweepSuffix,
} from '../generate-full-video.mjs';

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

  it('leads keyless airline runs with short Archive.org subjects', () => {
    const plan = motionQueryPlan(AIRLINE_TOPIC, false, { faceSeek: true, stockKeyed: false });
    expect(plan.mode).toBe('keyless');
    expect(plan.queries.slice(0, 4)).toEqual([
      'airliner cabin',
      'aircraft cabin interior',
      'cabin pressurization',
      'oxygen mask demonstration',
    ]);
    // Diversity, not looser gating: every keyless subject is concrete aviation.
    expect(plan.boostCount).toBeGreaterThanOrEqual(16);
    expect(plan.queries.length).toBeGreaterThan(plan.baseCount);
    expect(plan.queries.every(isSafeStockMotionQuery)).toBe(true);
  });

  it('adds apartment-first packs for housing in both modes', () => {
    const keyed = motionQueryPlan(HOUSING_TOPIC, false, { stockKeyed: true, faceSeek: true });
    expect(keyed.queries).toEqual(
      expect.arrayContaining(['apartment kitchen interior daylight', 'apartment building hallway doors']),
    );
    const keyless = motionQueryPlan(HOUSING_TOPIC, false, { stockKeyed: false });
    expect(keyless.queries.slice(0, 3)).toEqual(['apartment building', 'apartment interior', 'public housing']);
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
    expect(airline.minVideos).toBeGreaterThanOrEqual(30);
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
      motionQueriesTried: 24,
      motionQueryPoolSize: 30,
      motionPoolSize: 41,
      motionTargetVideos: 30,
      videoTopUp: new Array(27),
    });
    expect(line).toContain('Motion path: keyed');
    expect(line).toContain('pexels=22');
    expect(line).toContain('queries-tried=24 query-pack=30');
    expect(line).toContain('injected=27/30');
  });

  it('names the keyless path with archive attempt and evidence counts', () => {
    const line = formatMotionPathLog({
      motionKeyMode: 'keyless',
      archiveLiveFetched: 19,
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
    expect(line).not.toContain('pexels=0 pixabay=0 archive=');
    expect(line).toContain('sweep-queries=12');
    expect(line).toContain('evidence-rejected=21');
    expect(line).toContain('injected=16/18');
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
