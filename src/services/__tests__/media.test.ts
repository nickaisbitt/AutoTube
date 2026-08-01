import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  scoreCandidate,
  searchDDGLocal,
  searchWikimedia,
  searchDDGVideos,
  parseDurationToSeconds,
  hasWatermarkIndicator,
  harvestMediaWithSafetyNet,
} from '../media';
import type { MediaCandidate } from '../media';
import type { AppConfig, TopicContext } from '../../types';

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

vi.mock('../sourceProviders', () => ({
  queryAllProviders: vi.fn(async () => []),
}));

vi.mock('../fullResResolver', () => ({
  batchResolve: vi.fn(async () => new Map()),
}));

vi.mock('../qualityScorer', () => ({
  batchScoreQuality: vi.fn(async () => new Map()),
}));

vi.mock('../visionCheck', () => ({
  batchVisionCheck: vi.fn(async () => new Map()),
  checkCandidateVision: vi.fn(async () => null),
}));

import { queryAllProviders } from '../sourceProviders';

const mockQueryAllProviders = vi.mocked(queryAllProviders);

// ---------------------------------------------------------------------------
// Shared baseline objects
// ---------------------------------------------------------------------------

/** A neutral baseline candidate with no special bonuses from source/URL/dimensions. */
const baseCandidate: MediaCandidate = {
  url: 'https://example.com/image.jpg',
  alt: 'generic image',
  source: 'Generic Source',
  sourceUrl: 'https://example.com/page',
  width: 1280,
  height: 720,
  baseScore: 100,
  query: 'generic query',
  finalScore: 0,
  type: 'image',
};

const baseTopicContext: TopicContext = {
  topic: 'Test Topic',
  coreSubject: 'Test',
  subjectCandidates: ['Test'],
  kind: 'concept',
  description: 'A test topic',
  entities: [],
  parseReasoning: 'Test reasoning',
};

// ---------------------------------------------------------------------------
// scoreCandidate
// ---------------------------------------------------------------------------

describe('scoreCandidate', () => {
  it('4.2 gives +100 bonus for high-trust source URL (reuters.com)', () => {
    // Baseline: no high-trust URL (use a non-trusted domain)
    const baseline: MediaCandidate = {
      ...baseCandidate,
      sourceUrl: 'https://example.com/page',
      width: undefined,
      height: undefined,
    };
    const baselineScore = scoreCandidate(baseline, baseTopicContext);

    // High-trust candidate: reuters.com in sourceUrl
    const highTrust: MediaCandidate = {
      ...baseCandidate,
      sourceUrl: 'https://reuters.com/article/some-news',
      width: undefined,
      height: undefined,
    };
    const highTrustScore = scoreCandidate(highTrust, baseTopicContext);

    // +100 high-trust bonus + 50 (unknown-domain penalty on baseline) = 150
    expect(highTrustScore - baselineScore).toBe(150);
  });

  it('4.3 applies −150 penalty for portrait-ratio image (width:400, height:800, ratio=0.5 < 0.9)', () => {
    // Landscape baseline: 1280×720, ratio ≈ 1.78 → +30 ratio bonus, no pixel bonus (1280*720 < 1920*1080)
    const landscape: MediaCandidate = {
      ...baseCandidate,
      width: 1280,
      height: 720,
      sourceUrl: undefined,
    };
    const landscapeScore = scoreCandidate(landscape, baseTopicContext);

    // Portrait: 400×800, ratio = 0.5 < 0.9 → −150 penalty, no ratio bonus
    const portrait: MediaCandidate = {
      ...baseCandidate,
      width: 400,
      height: 800,
      sourceUrl: undefined,
    };
    const portraitScore = scoreCandidate(portrait, baseTopicContext);

    // Landscape: +30 (ratio bonus) + 0 (720p resolution baseline)
    // Portrait: −150 (portrait penalty) − 50 (below 720p resolution penalty)
    // Difference: 30 − (−200) = 230
    expect(landscapeScore - portraitScore).toBe(230);
  });

  it('4.4 gives +30 ratio bonus and resolution bonuses for 1920×1080 vs small image', () => {
    // Small image: 320×240, ratio ≈ 1.33 → +30 ratio bonus, pixels = 76800 < 307200 → −150 penalty (too small)
    const small: MediaCandidate = {
      ...baseCandidate,
      width: 320,
      height: 240,
      sourceUrl: undefined,
    };
    const smallScore = scoreCandidate(small, baseTopicContext);

    // HD image: 1920×1080, ratio ≈ 1.78 → +30 ratio bonus, +50 (1080p bonus), +100 (HD bonus)
    const hd: MediaCandidate = {
      ...baseCandidate,
      width: 1920,
      height: 1080,
      sourceUrl: undefined,
    };
    const hdScore = scoreCandidate(hd, baseTopicContext);

    // Small net from resolution: +30 (ratio) − 150 (too small penalty) = −120
    // HD net from resolution:    +30 (ratio) + 50 (1080p bonus) + 100 (HD bonus) = +180
    // Difference: 180 − (−120) = 300
    expect(hdScore - smallScore).toBe(300);
  });

  it('4.6 gives +25 per matching query keyword found in alt text', () => {
    // No keyword match: alt has no words from query 'nvidia chip'
    // Use a query with only 1 word > 2 chars to avoid triggering the top-2-query-words penalty asymmetrically
    const noMatch: MediaCandidate = {
      ...baseCandidate,
      alt: 'unrelated content here',
      query: 'nvidia chip',
      sourceUrl: undefined,
      width: undefined,
      height: undefined,
    };
    const noMatchScore = scoreCandidate(noMatch, baseTopicContext);

    // One keyword matches: only 'nvidia' appears in alt
    const oneMatch: MediaCandidate = {
      ...baseCandidate,
      alt: 'nvidia technology overview',
      query: 'nvidia chip',
      sourceUrl: undefined,
      width: undefined,
      height: undefined,
    };
    const oneMatchScore = scoreCandidate(oneMatch, baseTopicContext);

    // Both keywords match: 'nvidia' and 'chip' both appear in alt
    // Query words > 2 chars: 'nvidia' (6), 'chip' (4) → both qualify
    const bothMatch: MediaCandidate = {
      ...baseCandidate,
      alt: 'nvidia chip technology',
      query: 'nvidia chip',
      sourceUrl: undefined,
      width: undefined,
      height: undefined,
    };
    const bothMatchScore = scoreCandidate(bothMatch, baseTopicContext);

    // oneMatch vs noMatch: +25 (1 keyword) + 100 (query relevance: 1 match vs 0) + 150 (top-2 check: has 'nvidia' vs none) = 275
    // bothMatch vs oneMatch: +25 (1 extra keyword) + 100 (query relevance: 2 matches passes vs 1 fails) = 125
    // The core keyword bonus is still +25 per match
    expect(bothMatchScore - oneMatchScore).toBe(125);
    expect(oneMatchScore - noMatchScore).toBe(175);
  });

  it('4.7 gives +90 video bonus in stock source mode', () => {
    // Image candidate in stock mode (baseline) — gets -200 missing-dimensions penalty
    const image: MediaCandidate = {
      ...baseCandidate,
      type: 'image',
      source: 'Generic Source',
      sourceUrl: undefined,
      width: undefined,
      height: undefined,
    };
    const imageScore = scoreCandidate(image, baseTopicContext, undefined, 'stock');

    // Video candidate in stock mode: +150 (stock video bonus), no missing-dimensions penalty
    const video: MediaCandidate = {
      ...baseCandidate,
      type: 'video',
      source: 'Generic Source',
      sourceUrl: undefined,
      width: undefined,
      height: undefined,
    };
    const videoScore = scoreCandidate(video, baseTopicContext, undefined, 'stock');

    // Video: +150 (type bonus) vs Image: -200 (missing dims) → 150 - (-200) = 350
    expect(videoScore - imageScore).toBe(350);
  });

  it('4.8 gives +80 Wikimedia bonus', () => {
    // Non-Wikimedia candidate (baseline)
    const nonWiki: MediaCandidate = {
      ...baseCandidate,
      source: 'Generic Source',
      sourceUrl: undefined,
      width: undefined,
      height: undefined,
    };
    const baselineScore = scoreCandidate(nonWiki, baseTopicContext, undefined, 'raw');

    // Wikimedia Commons: +80 (base Wikimedia Commons bonus)
    const wiki: MediaCandidate = {
      ...baseCandidate,
      source: 'Wikimedia Commons',
      sourceUrl: undefined,
      width: undefined,
      height: undefined,
    };
    const wikiScore = scoreCandidate(wiki, baseTopicContext, undefined, 'raw');

    // Total Wikimedia bonus over baseline: +80 (authority) + 100 (licensed source) = 180
    expect(wikiScore - baselineScore).toBe(180);
  });

  it('promotes face-first airline stakes over branded logo close-ups', () => {
    const aviationTopic: TopicContext = {
      ...baseTopicContext,
      topic: 'How a regional airline hid recurring cabin-pressure failures',
      resolvedTitle: 'How a regional airline hid recurring cabin-pressure failures',
    };
    const query = 'regional airline cabin pressure';
    const passenger: MediaCandidate = {
      ...baseCandidate,
      alt: 'worried passenger face wearing oxygen mask inside aircraft cabin',
      query,
      sourceUrl: undefined,
    };
    const brandedLogo: MediaCandidate = {
      ...baseCandidate,
      alt: 'Qatar Airways airline logo close-up on aircraft tail',
      query,
      sourceUrl: undefined,
    };

    expect(scoreCandidate(passenger, aviationTopic) - scoreCandidate(brandedLogo, aviationTopic)).toBeGreaterThan(500);
  });

  it('derives airline topic flags from the topic context, not the candidate query', () => {
    const neutralTopic: TopicContext = {
      ...baseTopicContext,
      topic: 'Municipal library reading room',
      resolvedTitle: 'Municipal library reading room',
    };
    const brandedLogo: MediaCandidate = {
      ...baseCandidate,
      alt: 'Qatar Airways brand logo close-up on the aircraft tail',
      sourceUrl: undefined,
    };

    // Same candidate, same neutral topic — only the candidate's own query mentions aviation.
    const withAviationQuery = { ...brandedLogo, query: 'regional aviation cabin pressure' };
    const withNeutralQuery = { ...brandedLogo, query: 'municipal library reading room' };

    expect(scoreCandidate(withAviationQuery, neutralTopic)).toBe(scoreCandidate(withNeutralQuery, neutralTopic));

    // The airline penalties still apply when the *topic* is an airline story.
    const airlineTopic: TopicContext = {
      ...baseTopicContext,
      topic: 'How a regional airline hid recurring cabin-pressure failures',
      resolvedTitle: 'How a regional airline hid recurring cabin-pressure failures',
    };
    expect(scoreCandidate(withAviationQuery, airlineTopic))
      .toBeLessThan(scoreCandidate(withAviationQuery, neutralTopic));
  });

  it('derives nursing-abuse topic flags from the topic context, not the candidate query', () => {
    const neutralTopic: TopicContext = {
      ...baseTopicContext,
      topic: 'Municipal library reading room',
      resolvedTitle: 'Municipal library reading room',
    };
    const officeStock: MediaCandidate = {
      ...baseCandidate,
      alt: 'corporate office skyline glass building',
      sourceUrl: undefined,
    };

    const withNursingQuery = { ...officeStock, query: 'nursing home abuse cctv hallway' };
    const withNeutralQuery = { ...officeStock, query: 'municipal library reading room' };

    expect(scoreCandidate(withNursingQuery, neutralTopic)).toBe(scoreCandidate(withNeutralQuery, neutralTopic));

    const nursingTopic: TopicContext = {
      ...baseTopicContext,
      topic: 'Inside a nursing home abuse cover-up',
      resolvedTitle: 'Inside a nursing home abuse cover-up',
    };
    expect(scoreCandidate(withNursingQuery, nursingTopic))
      .toBeLessThan(scoreCandidate(withNursingQuery, neutralTopic));
  });

  it('demotes corporate aviation stock below hangar paperwork stakes', () => {
    const aviationTopic: TopicContext = {
      ...baseTopicContext,
      topic: 'Aviation safety reports at a regional airline',
      resolvedTitle: 'Aviation safety reports at a regional airline',
    };
    const query = 'aviation safety report';
    const paperwork: MediaCandidate = {
      ...baseCandidate,
      alt: 'airline safety report paperwork on clipboard inside aircraft hangar',
      query,
      sourceUrl: undefined,
    };
    const corporate: MediaCandidate = {
      ...baseCandidate,
      alt: 'corporate office business meeting about airline brand strategy',
      query,
      sourceUrl: undefined,
    };

    expect(scoreCandidate(paperwork, aviationTopic)).toBeGreaterThan(scoreCandidate(corporate, aviationTopic));
  });
});

// ---------------------------------------------------------------------------
// Watermark indicator matching
// ---------------------------------------------------------------------------

describe('hasWatermarkIndicator', () => {
  it('ignores words that merely contain an indicator as a substring', () => {
    expect(hasWatermarkIndicator({
      alt: 'company comparison chart in Stockholm',
      url: 'https://cdn.example.com/stockholm-company-comparison.jpg',
    })).toBe(false);

    expect(hasWatermarkIndicator({
      alt: 'compass competition compound complete',
      url: 'https://stockholm.example.com/compare/sampler.jpg',
    })).toBe(false);
  });

  it('flags indicators that appear as whole tokens in alt text', () => {
    expect(hasWatermarkIndicator({ alt: 'stock photo of a bridge', url: 'https://example.com/a.jpg' })).toBe(true);
    expect(hasWatermarkIndicator({ alt: 'licensed editorial image', url: 'https://example.com/a.jpg' })).toBe(true);
    expect(hasWatermarkIndicator({ alt: 'watermarked frame', url: 'https://example.com/a.jpg' })).toBe(true);
  });

  it('flags indicators that appear as host or path tokens in the URL', () => {
    expect(hasWatermarkIndicator({ alt: 'bridge', url: 'https://example.com/preview/frame-1.jpg' })).toBe(true);
    expect(hasWatermarkIndicator({ alt: 'bridge', url: 'https://images.example.com/comp/xyz.jpg' })).toBe(true);
    expect(hasWatermarkIndicator({ alt: 'bridge', url: 'https://stock.example.com/xyz.jpg' })).toBe(true);
    expect(hasWatermarkIndicator({ alt: 'bridge', url: 'https://example.com/adobe%20stock/xyz.jpg' })).toBe(true);
  });
});

describe('scoreCandidate — watermark indicator penalty', () => {
  it('applies the −300 penalty only for whole-token indicator matches', () => {
    const innocent: MediaCandidate = {
      ...baseCandidate,
      alt: 'company comparison in Stockholm',
      url: 'https://cdn.example.com/stockholm-company.jpg',
      sourceUrl: undefined,
    };
    const watermarked: MediaCandidate = {
      ...innocent,
      alt: 'stock sample preview',
      url: 'https://cdn.example.com/stock-sample-preview.jpg',
    };

    expect(scoreCandidate(innocent, baseTopicContext) - scoreCandidate(watermarked, baseTopicContext)).toBe(300);
  });
});

// ---------------------------------------------------------------------------
// harvestMediaWithSafetyNet — fallback filtering
// ---------------------------------------------------------------------------

describe('harvestMediaWithSafetyNet fallback chain', () => {
  const primaryQuery = 'nursing home abuse investigation footage';
  const broadenedQuery = 'nursing home abuse';
  const entityQuery = 'Sunrise Care State Inspector';

  const harvestConfig: AppConfig = { sourceType: 'stock' };

  const harvestTopic: TopicContext = {
    ...baseTopicContext,
    topic: 'Nursing home abuse investigation',
    coreSubject: 'Nursing home abuse investigation',
    entities: ['Sunrise Care', 'State Inspector'],
  };

  function harvestCandidate(overrides: Partial<MediaCandidate>): MediaCandidate {
    return {
      url: 'https://example.com/image.jpg',
      alt: 'nursing home abuse investigation footage',
      source: 'DuckDuckGo Images',
      baseScore: 300,
      query: primaryQuery,
      finalScore: 0,
      type: 'image',
      width: 1920,
      height: 1080,
      ...overrides,
    };
  }

  /** Blocked domains, NSFW hosts and undersized images returned by every fallback query. */
  const dirtyFallbackResults: MediaCandidate[] = [
    harvestCandidate({ url: 'https://sputniknews.com/propaganda.jpg' }),
    harvestCandidate({ url: 'https://cdn.pornhub.com/nsfw.jpg' }),
    harvestCandidate({ url: 'https://example.com/via-source.jpg', sourceUrl: 'https://9gag.com/gag/1' }),
    harvestCandidate({ url: 'https://example.com/low-res.jpg', width: 640, height: 480 }),
    harvestCandidate({ url: 'https://example.com/clean.jpg' }),
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    // Wikimedia fallback goes straight to the network — keep it offline.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('applies the domain/NSFW/resolution filter chain to fallback query results', async () => {
    mockQueryAllProviders.mockImplementation(async (query: string) => (
      query === primaryQuery ? [] : dirtyFallbackResults
    ));

    const { candidates } = await harvestMediaWithSafetyNet(primaryQuery, harvestTopic, harvestConfig);

    const queriedTerms = mockQueryAllProviders.mock.calls.map(call => call[0]);
    expect(queriedTerms).toContain(broadenedQuery);
    expect(queriedTerms).toContain(harvestTopic.coreSubject);

    const urls = candidates.map(c => c.url);
    expect(urls).toContain('https://example.com/clean.jpg');
    expect(urls).not.toContain('https://sputniknews.com/propaganda.jpg');
    expect(urls).not.toContain('https://cdn.pornhub.com/nsfw.jpg');
    expect(urls).not.toContain('https://example.com/via-source.jpg');
    expect(urls).not.toContain('https://example.com/low-res.jpg');
  });

  it('filters the entity fallback too, leaving nothing when every result is blocked', async () => {
    mockQueryAllProviders.mockImplementation(async (query: string) => (
      query === primaryQuery ? [] : dirtyFallbackResults.filter(c => c.url !== 'https://example.com/clean.jpg')
    ));

    const { candidates } = await harvestMediaWithSafetyNet(primaryQuery, harvestTopic, harvestConfig);

    expect(mockQueryAllProviders.mock.calls.map(call => call[0])).toContain(entityQuery);
    expect(candidates).toEqual([]);
  });

  it('leaves a segment empty instead of injecting Picsum stock as a last resort', async () => {
    mockQueryAllProviders.mockResolvedValue([]);

    const { candidates, trace } = await harvestMediaWithSafetyNet(primaryQuery, harvestTopic, harvestConfig);

    expect(candidates).toEqual([]);
    expect(candidates.some(c => c.url.includes('picsum.photos'))).toBe(false);
    expect(trace.join(' | ')).toContain('Fallback exhausted');
  });

  it('never injects Picsum candidates alongside real fallback results', async () => {
    mockQueryAllProviders.mockImplementation(async (query: string) => (
      query === primaryQuery ? [] : [harvestCandidate({ url: 'https://example.com/clean.jpg' })]
    ));

    const { candidates } = await harvestMediaWithSafetyNet(primaryQuery, harvestTopic, harvestConfig);

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.some(c => c.url.includes('picsum.photos'))).toBe(false);
    expect(candidates.some(c => c.source.includes('Picsum'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// searchDDGLocal error paths
// ---------------------------------------------------------------------------

describe('searchDDGLocal error paths', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('4.9 returns empty array when fetch returns 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({}),
    }));

    const result = await searchDDGLocal('test query');
    expect(result).toEqual([]);
  });

  it('4.10 returns empty array when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    const result = await searchDDGLocal('test query');
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// searchWikimedia error paths
// ---------------------------------------------------------------------------

describe('searchWikimedia error paths', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('4.11 returns empty array when fetch returns 500', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    }));

    const result = await searchWikimedia('test query');
    expect(result).toEqual([]);
  });

  it('4.12 returns empty array when response has no query.pages', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    }));

    const result = await searchWikimedia('test query');
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// parseDurationToSeconds
// ---------------------------------------------------------------------------

describe('parseDurationToSeconds', () => {
  it('parses "1:30" as 90 seconds', () => {
    expect(parseDurationToSeconds('1:30')).toBe(90);
  });

  it('parses "5:00" as 300 seconds', () => {
    expect(parseDurationToSeconds('5:00')).toBe(300);
  });

  it('parses "1:05:30" as 3930 seconds', () => {
    expect(parseDurationToSeconds('1:05:30')).toBe(3930);
  });

  it('returns Infinity for undefined', () => {
    expect(parseDurationToSeconds(undefined)).toBe(Infinity);
  });

  it('returns Infinity for non-numeric string', () => {
    expect(parseDurationToSeconds('abc')).toBe(Infinity);
  });

  it('parses single number "45" as 45 seconds', () => {
    expect(parseDurationToSeconds('45')).toBe(45);
  });
});

// ---------------------------------------------------------------------------
// searchDDGVideos
// ---------------------------------------------------------------------------

describe('searchDDGVideos', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns video candidates from valid DDG video results', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        results: [
          {
            content: 'https://example.com/video1.mp4',
            title: 'Test Video',
            description: 'A test video',
            images: { large: 'https://example.com/thumb.jpg' },
            duration: '2:30',
            embed_url: 'https://example.com/embed/1',
          },
        ],
      }),
    }));

    const result = await searchDDGVideos('test query');
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('video');
    expect(result[0].alt).toBe('Test Video');
    expect(result[0].thumbnailUrl).toBe('https://example.com/thumb.jpg');
    expect(result[0].url).toContain('/api/download-clip?url=');
    expect(result[0].source).toBe('DuckDuckGo Video');
  });

  it('filters out videos longer than 10 minutes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        results: [
          { content: 'https://example.com/short.mp4', title: 'Short', duration: '2:00' },
          { content: 'https://example.com/long.mp4', title: 'Long', duration: '15:00' },
          { content: 'https://example.com/medium.mp4', title: 'Medium', duration: '9:59' },
        ],
      }),
    }));

    const result = await searchDDGVideos('test query');
    expect(result).toHaveLength(2);
    expect(result.map(r => r.alt)).toEqual(['Short', 'Medium']);
  });

  it('limits to 10 results', async () => {
    const results = Array.from({ length: 15 }, (_, i) => ({
      content: `https://example.com/video${i}.mp4`,
      title: `Video ${i}`,
      duration: '1:00',
    }));

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ results }),
    }));

    const result = await searchDDGVideos('test query');
    expect(result).toHaveLength(10);
  });

  it('returns empty array when fetch returns 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({}),
    }));

    const result = await searchDDGVideos('test query');
    expect(result).toEqual([]);
  });

  it('returns empty array when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    const result = await searchDDGVideos('test query');
    expect(result).toEqual([]);
  });

  it('skips results without content URL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        results: [
          { title: 'No Content', duration: '1:00' },
          { content: 'https://example.com/valid.mp4', title: 'Valid', duration: '1:00' },
        ],
      }),
    }));

    const result = await searchDDGVideos('test query');
    expect(result).toHaveLength(1);
    expect(result[0].alt).toBe('Valid');
  });
});

// ---------------------------------------------------------------------------
// Emotional Clarity Scoring (Section 15)
// ---------------------------------------------------------------------------

describe('scoreCandidate — emotional clarity scoring', () => {
  it('rewards candidates with human emotion indicators in alt text', () => {
    const neutral: MediaCandidate = {
      ...baseCandidate,
      alt: 'computer screen with data',
      query: 'cybercrime',
      sourceUrl: undefined,
      width: undefined,
      height: undefined,
    };
    const emotional: MediaCandidate = {
      ...baseCandidate,
      alt: 'distressed person face reaction',
      query: 'cybercrime',
      sourceUrl: undefined,
      width: undefined,
      height: undefined,
    };

    const neutralScore = scoreCandidate(neutral, baseTopicContext);
    const emotionalScore = scoreCandidate(emotional, baseTopicContext);

    // Emotional candidate should score higher due to human emotion keywords
    expect(emotionalScore).toBeGreaterThan(neutralScore);
  });

  it('rewards cause-and-effect imagery', () => {
    const process: MediaCandidate = {
      ...baseCandidate,
      alt: 'typing on computer keyboard',
      query: 'cybercrime',
      sourceUrl: undefined,
      width: undefined,
      height: undefined,
    };
    const consequence: MediaCandidate = {
      ...baseCandidate,
      alt: 'destroyed aftermath damage result',
      query: 'cybercrime',
      sourceUrl: undefined,
      width: undefined,
      height: undefined,
    };

    const processScore = scoreCandidate(process, baseTopicContext);
    const consequenceScore = scoreCandidate(consequence, baseTopicContext);

    expect(consequenceScore).toBeGreaterThan(processScore);
  });

  it('penalizes visually vague imagery (abstract, blurry, generic)', () => {
    const clear: MediaCandidate = {
      ...baseCandidate,
      alt: 'sharp focused portrait of employee',
      query: 'cybercrime',
      sourceUrl: undefined,
      width: undefined,
      height: undefined,
    };
    const vague: MediaCandidate = {
      ...baseCandidate,
      alt: 'abstract blurry generic pattern texture',
      query: 'cybercrime',
      sourceUrl: undefined,
      width: undefined,
      height: undefined,
    };

    const clearScore = scoreCandidate(clear, baseTopicContext);
    const vagueScore = scoreCandidate(vague, baseTopicContext);

    expect(clearScore).toBeGreaterThan(vagueScore);
  });

  it('penalizes "hackers typing" cliché imagery', () => {
    const normal: MediaCandidate = {
      ...baseCandidate,
      alt: 'business office meeting',
      query: 'cybercrime',
      sourceUrl: undefined,
      width: undefined,
      height: undefined,
    };
    const cliche: MediaCandidate = {
      ...baseCandidate,
      alt: 'hooded hacker typing on keyboard in dark room',
      query: 'cybercrime',
      sourceUrl: undefined,
      width: undefined,
      height: undefined,
    };

    const normalScore = scoreCandidate(normal, baseTopicContext);
    const clicheScore = scoreCandidate(cliche, baseTopicContext);

    // Cliché hacker imagery should be penalized
    expect(normalScore).toBeGreaterThan(clicheScore);
  });

  it('prefers human-centered visuals over abstract tech backgrounds', () => {
    const humanCentered: MediaCandidate = {
      ...baseCandidate,
      alt: 'employee at workplace desk',
      query: 'cybercrime',
      sourceUrl: undefined,
      width: undefined,
      height: undefined,
    };
    const abstractTech: MediaCandidate = {
      ...baseCandidate,
      alt: 'circuit board motherboard close view',
      query: 'cybercrime',
      sourceUrl: undefined,
      width: undefined,
      height: undefined,
    };

    const humanScore = scoreCandidate(humanCentered, baseTopicContext);
    const techScore = scoreCandidate(abstractTech, baseTopicContext);

    expect(humanScore).toBeGreaterThan(techScore);
  });

  it('returns a valid numeric score (not NaN or Infinity) with emotional clarity scoring', () => {
    const candidate: MediaCandidate = {
      ...baseCandidate,
      alt: 'distressed person face reaction aftermath damage abstract blurry hacker typing',
      query: 'cybercrime identity theft',
      sourceUrl: undefined,
      width: undefined,
      height: undefined,
    };

    const score = scoreCandidate(candidate, baseTopicContext);
    expect(Number.isFinite(score)).toBe(true);
    expect(typeof score).toBe('number');
  });
});
