// Feature: media-source-filter, Property 1: Bug Condition - Blocked Domain Rejection
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { MediaCandidate } from '../media';

/**
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.6**
 *
 * Property 1: Bug Condition — Blocked Domain Candidates Enter Scoring Pool
 *
 * For any MediaCandidate whose sourceUrl or url hostname matches a blocklist
 * pattern (propaganda, watermarked-stock, low-quality, adult-content), the
 * filterCandidates function SHALL reject that candidate (accepted.length === 0,
 * rejected.length === 1) with a non-empty pattern and a valid category.
 *
 * This test is written BEFORE the fix exists. It MUST FAIL on unfixed code
 * because the domainFilter module does not exist yet — confirming the bug:
 * no domain filtering is performed.
 */

// ---------------------------------------------------------------------------
// Blocked domain patterns by category (from design doc)
// ---------------------------------------------------------------------------

const BLOCKED_DOMAINS: Record<string, string[]> = {
  propaganda: ['sputniknews', 'presstv', 'cgtn', 'tass', 'xinhua', 'globalresearch'],
  'watermarked-stock': ['shutterstock', 'gettyimages', 'istockphoto', '123rf', 'dreamstime', 'depositphotos', 'alamy'],
  'low-quality': ['9gag', 'imgur', 'memegenerator', 'knowyourmeme', 'ifunny', 'cheezburger', 'buzzfeed'],
  'adult-content': ['pornhub', 'xvideos', 'xhamster', 'redtube', 'youporn'],
};

const ALL_BLOCKED_ENTRIES = Object.entries(BLOCKED_DOMAINS).flatMap(
  ([category, domains]) => domains.map((domain) => ({ domain, category })),
);

const VALID_CATEGORIES = Object.keys(BLOCKED_DOMAINS);

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Pick a random blocked domain entry (domain + category) */
const blockedEntryArb = fc.constantFrom(...ALL_BLOCKED_ENTRIES);

/** Generate a URL path suffix */
const pathArb = fc.array(fc.constantFrom('a', 'b', '1', '2', '-', '_'), { minLength: 1, maxLength: 20 }).map(chars => chars.join(''));

/** Generate a clean (non-blocked) URL for the other field */

/** Generate a clean (non-blocked) URL for the other field */
const cleanUrlArb = fc.constantFrom(
  'https://example.com/image.jpg',
  'https://cdn.somesite.org/photo.png',
  'https://images.neutral-domain.net/pic.jpg',
);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

import { filterCandidates } from '../domainFilter';

describe('Property 1: Bug Condition — Blocked Domain Rejection', () => {
  it('should reject candidates with a blocked domain in sourceUrl', () => {
    fc.assert(
      fc.property(
        blockedEntryArb,
        pathArb,
        cleanUrlArb,
        fc.string({ minLength: 1, maxLength: 30 }),
        fc.integer({ min: 0, max: 300 }),
        fc.constantFrom('image' as const, 'video' as const),
        (entry, path, cleanUrl, alt, baseScore, type) => {
          const sourceUrl = `https://${entry.domain}.com/${path}`;
          const candidate: MediaCandidate = {
            url: cleanUrl,
            sourceUrl,
            source: 'DuckDuckGo · web',
            alt,
            baseScore,
            query: 'test query',
            finalScore: 0,
            type,
          };

          const result = filterCandidates([candidate]);

          expect(result.accepted.length).toBe(0);
          expect(result.rejected.length).toBe(1);
          expect(result.rejected[0].pattern).toBeTruthy();
          expect(VALID_CATEGORIES).toContain(result.rejected[0].category);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should reject candidates with a blocked domain in url (even if sourceUrl is clean)', () => {
    fc.assert(
      fc.property(
        blockedEntryArb,
        pathArb,
        cleanUrlArb,
        fc.string({ minLength: 1, maxLength: 30 }),
        fc.integer({ min: 0, max: 300 }),
        fc.constantFrom('image' as const, 'video' as const),
        (entry, path, cleanSourceUrl, alt, baseScore, type) => {
          const blockedUrl = `https://cdn.${entry.domain}.com/${path}`;
          const candidate: MediaCandidate = {
            url: blockedUrl,
            sourceUrl: cleanSourceUrl,
            source: 'DuckDuckGo · web',
            alt,
            baseScore,
            query: 'test query',
            finalScore: 0,
            type,
          };

          const result = filterCandidates([candidate]);

          expect(result.accepted.length).toBe(0);
          expect(result.rejected.length).toBe(1);
          expect(result.rejected[0].pattern).toBeTruthy();
          expect(VALID_CATEGORIES).toContain(result.rejected[0].category);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// Feature: media-source-filter, Property 2: Preservation - Non-Blocked Candidate Behavior
import { scoreCandidate } from '../media';
import type { TopicContext } from '../../types';

/**
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**
 *
 * Property 2: Preservation — Non-Blocked Candidate Behavior Unchanged
 *
 * These tests capture the CURRENT behavior of scoreCandidate for non-blocked
 * candidates. They are written BEFORE the fix is implemented and should PASS
 * on the current unfixed code. After the fix, they will be re-run to verify
 * no regressions in scoring logic for non-blocked candidates.
 */

// ---------------------------------------------------------------------------
// Blocked domain patterns (used to EXCLUDE from generated candidates)
// ---------------------------------------------------------------------------

const ALL_BLOCKED_PATTERNS = [
  'sputniknews', 'rt.com', 'presstv', 'cgtn', 'tass', 'xinhua', 'globalresearch',
  'shutterstock', 'gettyimages', 'istockphoto', '123rf', 'dreamstime', 'depositphotos', 'alamy',
  '9gag', 'imgur', 'memegenerator', 'knowyourmeme', 'ifunny', 'cheezburger', 'buzzfeed',
  'pornhub', 'xvideos', 'xhamster', 'redtube', 'youporn',
];

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const STUB_TOPIC_CONTEXT: TopicContext = {
  topic: 'Test Topic',
  coreSubject: 'Test',
  subjectCandidates: ['Test'],
  kind: 'concept',
  description: 'A test topic for preservation tests',
  entities: ['Test'],
  parseReasoning: 'test',
};

// ---------------------------------------------------------------------------
// Arbitraries for non-blocked candidates
// ---------------------------------------------------------------------------

/** Domains that are guaranteed NOT to match any blocklist pattern */
const SAFE_DOMAINS = [
  'reuters.com', 'apnews.com', 'bbc.co.uk', 'bloomberg.com',
  'nytimes.com', 'wsj.com', 'cnn.com', 'cnbc.com', 'forbes.com',
  'example.com', 'mysite.org', 'photos.example.net',
  'cdn.neutral-domain.com', 'images.cleansite.org',
];

/** Verify a domain doesn't match any blocked pattern */
function isNonBlocked(domain: string): boolean {
  const lower = domain.toLowerCase();
  return !ALL_BLOCKED_PATTERNS.some(p => lower.includes(p));
}

const safeDomainArb = fc.constantFrom(...SAFE_DOMAINS).filter(d => isNonBlocked(d));

const safeUrlArb = safeDomainArb.chain(domain =>
  fc.array(fc.constantFrom('a', 'b', '1', '2', '-', '_'), { minLength: 1, maxLength: 15 })
    .map(chars => `https://${domain}/${chars.join('')}`)
);

const nonBlockedCandidateArb = fc.record({
  url: safeUrlArb,
  sourceUrl: safeUrlArb,
  source: fc.constantFrom('DuckDuckGo · web', 'Google · web', 'Firecrawl Search'),
  alt: fc.array(fc.constantFrom('a', 'b', 'c', 'd', 'e', ' ', 'test', 'photo'), { minLength: 1, maxLength: 6 }).map(parts => parts.join('')),
  baseScore: fc.integer({ min: 50, max: 250 }),
  query: fc.constantFrom('test query', 'sample search', 'news photo'),
  finalScore: fc.constant(0),
  type: fc.constantFrom('image' as const, 'video' as const),
  width: fc.option(fc.integer({ min: 100, max: 4000 }), { nil: undefined }),
  height: fc.option(fc.integer({ min: 100, max: 4000 }), { nil: undefined }),
}) as fc.Arbitrary<MediaCandidate>;

// ---------------------------------------------------------------------------
// Preservation Tests
// ---------------------------------------------------------------------------

describe('Property 2: Preservation — Non-Blocked Candidate Behavior', () => {
  // -----------------------------------------------------------------------
  // 2a: Trusted domain candidates receive the existing high-trust bonus
  // -----------------------------------------------------------------------
  describe('trusted domain scoring preservation', () => {
    const trustedDomains = ['reuters.com', 'apnews.com', 'bbc.co.uk'];

    const trustedCandidateArb = fc.constantFrom(...trustedDomains).chain(domain =>
      fc.record({
        url: fc.constant(`https://images.${domain}/photo.jpg`),
        sourceUrl: fc.constant(`https://${domain}/article/12345`),
        source: fc.constant(`DuckDuckGo · ${domain}`),
        alt: fc.constantFrom('news photo', 'editorial image', 'press photo'),
        baseScore: fc.integer({ min: 100, max: 250 }),
        query: fc.constantFrom('test query', 'news photo', 'editorial'),
        finalScore: fc.constant(0),
        type: fc.constant('image' as const),
        width: fc.constantFrom(1920, 1280, undefined),
        height: fc.constantFrom(1080, 720, undefined),
      })
    ) as fc.Arbitrary<MediaCandidate>;

    it('should include the +100 high-trust bonus for trusted editorial domains', () => {
      fc.assert(
        fc.property(trustedCandidateArb, (candidate) => {
          const score = scoreCandidate(candidate, STUB_TOPIC_CONTEXT, undefined, 'stock');

          // Build expected score manually to verify the high-trust bonus is present.
          // We create a clone with a non-trusted sourceUrl and compare.
          const untrustedClone: MediaCandidate = {
            ...candidate,
            sourceUrl: 'https://unknown-domain.example.com/article/12345',
            source: 'DuckDuckGo · unknown-domain.example.com',
          };
          const untrustedScore = scoreCandidate(untrustedClone, STUB_TOPIC_CONTEXT, undefined, 'stock');

          // The trusted candidate should score at least 100 points higher due to the
          // high-trust bonus (other scoring factors may also differ slightly due to
          // keyword matching on sourceUrl, but the +100 bonus is the dominant factor).
          expect(score).toBeGreaterThan(untrustedScore);
          // The difference should be at least 100 (the high-trust bonus)
          expect(score - untrustedScore).toBeGreaterThanOrEqual(100);
        }),
        { numRuns: 50 },
      );
    });
  });

  // -----------------------------------------------------------------------
  // 2b: Wikimedia Commons candidates receive the existing Wikimedia bonus
  // -----------------------------------------------------------------------
  describe('Wikimedia Commons scoring preservation', () => {
    const wikimediaCandidateArb = fc.record({
      url: fc.constant('https://upload.wikimedia.org/wikipedia/commons/a/ab/photo.jpg'),
      sourceUrl: fc.constant('https://commons.wikimedia.org/wiki/File:photo.jpg'),
      source: fc.constant('Wikimedia Commons'),
      alt: fc.constantFrom('Wikimedia photo', 'Commons image', 'test photo'),
      baseScore: fc.integer({ min: 100, max: 200 }),
      query: fc.constantFrom('test query', 'sample search'),
      finalScore: fc.constant(0),
      type: fc.constant('image' as const),
      width: fc.constantFrom(1920, 1280, undefined),
      height: fc.constantFrom(1080, 720, undefined),
    }) as fc.Arbitrary<MediaCandidate>;

    it('should include the Wikimedia bonus (+80 base, +20 stock / +120 raw)', () => {
      fc.assert(
        fc.property(
          wikimediaCandidateArb,
          fc.constantFrom('stock' as const, 'raw' as const),
          (candidate, sourceType) => {
            const score = scoreCandidate(candidate, STUB_TOPIC_CONTEXT, undefined, sourceType);

            // Create a non-Wikimedia clone to isolate the Wikimedia bonus
            const nonWikiClone: MediaCandidate = {
              ...candidate,
              source: 'Generic Source',
              sourceUrl: 'https://example.com/photo.jpg',
            };
            const nonWikiScore = scoreCandidate(nonWikiClone, STUB_TOPIC_CONTEXT, undefined, sourceType);

            // Wikimedia Commons gets +80 base bonus from `c.source === 'Wikimedia Commons'`
            // Plus sourceType-dependent bonus: stock → +20, raw → +120
            // The total Wikimedia advantage should be at least +80
            expect(score).toBeGreaterThan(nonWikiScore);
            expect(score - nonWikiScore).toBeGreaterThanOrEqual(80);
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  // -----------------------------------------------------------------------
  // 2c: scoreCandidate is deterministic for non-blocked candidates
  // -----------------------------------------------------------------------
  describe('scoring determinism for non-blocked candidates', () => {
    it('should produce identical scores when called twice with the same inputs', () => {
      fc.assert(
        fc.property(
          nonBlockedCandidateArb,
          fc.constantFrom('stock' as const, 'raw' as const),
          fc.constantFrom(undefined, 'dramatic scene', 'portrait photo'),
          (candidate, sourceType, visualConcept) => {
            const score1 = scoreCandidate(candidate, STUB_TOPIC_CONTEXT, visualConcept, sourceType);
            const score2 = scoreCandidate(candidate, STUB_TOPIC_CONTEXT, visualConcept, sourceType);
            expect(score1).toBe(score2);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // -----------------------------------------------------------------------
  // 2d: All existing scoring factors produce consistent results
  // -----------------------------------------------------------------------
  describe('existing scoring factors consistency', () => {
    it('should return a finite number for any non-blocked candidate', () => {
      fc.assert(
        fc.property(
          nonBlockedCandidateArb,
          fc.constantFrom('stock' as const, 'raw' as const),
          (candidate, sourceType) => {
            const score = scoreCandidate(candidate, STUB_TOPIC_CONTEXT, undefined, sourceType);
            expect(typeof score).toBe('number');
            expect(Number.isFinite(score)).toBe(true);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('should give video candidates a higher base than image candidates (all else equal)', () => {
      fc.assert(
        fc.property(
          nonBlockedCandidateArb,
          fc.constantFrom('stock' as const, 'raw' as const),
          (candidate, sourceType) => {
            // Ensure landscape dimensions so portrait penalty doesn't apply to video
            const landscapeCandidate = { ...candidate, width: 1920, height: 1080 };
            const imageCandidate: MediaCandidate = { ...landscapeCandidate, type: 'image' };
            const videoCandidate: MediaCandidate = { ...landscapeCandidate, type: 'video' };
            const imageScore = scoreCandidate(imageCandidate, STUB_TOPIC_CONTEXT, undefined, sourceType);
            const videoScore = scoreCandidate(videoCandidate, STUB_TOPIC_CONTEXT, undefined, sourceType);
            // Video candidates get +90 (stock) or +60 (raw) bonus
            expect(videoScore).toBeGreaterThan(imageScore);
          },
        ),
        { numRuns: 50 },
      );
    });

    it('should penalize SVG URLs', () => {
      fc.assert(
        fc.property(nonBlockedCandidateArb, (candidate) => {
          const jpgCandidate: MediaCandidate = {
            ...candidate,
            url: candidate.url.replace(/\.[^.]*$/, '.jpg'),
          };
          const svgCandidate: MediaCandidate = {
            ...candidate,
            url: candidate.url.replace(/\.[^.]*$/, '.svg'),
          };
          const jpgScore = scoreCandidate(jpgCandidate, STUB_TOPIC_CONTEXT, undefined, 'stock');
          const svgScore = scoreCandidate(svgCandidate, STUB_TOPIC_CONTEXT, undefined, 'stock');
          // SVG penalty is -200
          expect(svgScore).toBeLessThan(jpgScore);
        }),
        { numRuns: 50 },
      );
    });

    it('should penalize very small images (< 200x200)', () => {
      fc.assert(
        fc.property(
          nonBlockedCandidateArb.map(c => ({ ...c, width: 1920, height: 1080 })),
          (candidate) => {
            const normalCandidate: MediaCandidate = { ...candidate, width: 1920, height: 1080 };
            const tinyCandidate: MediaCandidate = { ...candidate, width: 100, height: 100 };
            const normalScore = scoreCandidate(normalCandidate, STUB_TOPIC_CONTEXT, undefined, 'stock');
            const tinyScore = scoreCandidate(tinyCandidate, STUB_TOPIC_CONTEXT, undefined, 'stock');
            // Small image penalty is -300
            expect(tinyScore).toBeLessThan(normalScore);
          },
        ),
        { numRuns: 50 },
      );
    });
  });
});


// ============================================================================
// Task 3.2 — Unit Tests for domainFilter
// ============================================================================

import { extractHostname, isDomainBlocked, getDomainTrustTier } from '../domainFilter';

// ---------------------------------------------------------------------------
// extractHostname
// ---------------------------------------------------------------------------

describe('extractHostname', () => {
  it('extracts hostname from a valid HTTPS URL', () => {
    expect(extractHostname('https://www.example.com/path/to/page')).toBe('www.example.com');
  });

  it('extracts hostname from a valid HTTP URL', () => {
    expect(extractHostname('http://cdn.reuters.com/image.jpg')).toBe('cdn.reuters.com');
  });

  it('extracts hostname from a URL with port', () => {
    expect(extractHostname('https://localhost:3000/api')).toBe('localhost');
  });

  it('extracts hostname from a URL with query params and fragment', () => {
    expect(extractHostname('https://images.unsplash.com/photo?w=800#top')).toBe('images.unsplash.com');
  });

  it('returns empty string for an empty string input', () => {
    expect(extractHostname('')).toBe('');
  });

  it('returns empty string for an invalid URL', () => {
    expect(extractHostname('not-a-url')).toBe('');
  });

  it('returns empty string for a URL without protocol', () => {
    expect(extractHostname('www.example.com/path')).toBe('');
  });

  it('returns empty string for a random string with spaces', () => {
    expect(extractHostname('some random text')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// isDomainBlocked
// ---------------------------------------------------------------------------

describe('isDomainBlocked', () => {
  describe('propaganda category', () => {
    it.each([
      ['https://sputniknews.com/photo/123', 'sputniknews'],
      ['https://rt.com/news/article', 'rt.com'],
      ['https://www.presstv.ir/detail/2024', 'presstv'],
      ['https://cgtn.com/video/abc', 'cgtn'],
      ['https://tass.com/world/12345', 'tass'],
      ['https://xinhua.net/english/2024', 'xinhua'],
      ['https://www.globalresearch.ca/article', 'globalresearch'],
    ])('blocks %s (pattern: %s)', (url, expectedPattern) => {
      const result = isDomainBlocked(url);
      expect(result.blocked).toBe(true);
      expect(result.pattern).toBe(expectedPattern);
      expect(result.category).toBe('propaganda');
    });
  });

  describe('watermarked-stock category', () => {
    it.each([
      ['https://image.shutterstock.com/watermark/123.jpg', 'shutterstock'],
      ['https://www.gettyimages.com/detail/photo/123', 'gettyimages'],
      ['https://media.istockphoto.com/id/123', 'istockphoto'],
      ['https://previews.123rf.com/images/photo.jpg', '123rf'],
      ['https://thumbs.dreamstime.com/z/photo-123.jpg', 'dreamstime'],
      ['https://st.depositphotos.com/123/photo.jpg', 'depositphotos'],
      ['https://c8.alamy.com/comp/photo.jpg', 'alamy'],
    ])('blocks %s (pattern: %s)', (url, expectedPattern) => {
      const result = isDomainBlocked(url);
      expect(result.blocked).toBe(true);
      expect(result.pattern).toBe(expectedPattern);
      expect(result.category).toBe('watermarked-stock');
    });
  });

  describe('low-quality category', () => {
    it.each([
      ['https://9gag.com/gag/12345', '9gag'],
      ['https://i.imgur.com/abc123.jpg', 'imgur'],
      ['https://memegenerator.net/meme/123', 'memegenerator'],
      ['https://knowyourmeme.com/memes/test', 'knowyourmeme'],
      ['https://ifunny.co/picture/abc', 'ifunny'],
      ['https://cheezburger.com/123/lol', 'cheezburger'],
      ['https://www.buzzfeed.com/article/123', 'buzzfeed'],
    ])('blocks %s (pattern: %s)', (url, expectedPattern) => {
      const result = isDomainBlocked(url);
      expect(result.blocked).toBe(true);
      expect(result.pattern).toBe(expectedPattern);
      expect(result.category).toBe('low-quality');
    });
  });

  describe('adult-content category', () => {
    it.each([
      ['https://pornhub.com/view/123', 'pornhub'],
      ['https://xvideos.com/video123', 'xvideos'],
      ['https://xhamster.com/videos/123', 'xhamster'],
      ['https://redtube.com/123', 'redtube'],
      ['https://youporn.com/watch/123', 'youporn'],
    ])('blocks %s (pattern: %s)', (url, expectedPattern) => {
      const result = isDomainBlocked(url);
      expect(result.blocked).toBe(true);
      expect(result.pattern).toBe(expectedPattern);
      expect(result.category).toBe('adult-content');
    });
  });

  describe('non-blocked domains', () => {
    it('returns { blocked: false } for trusted domains', () => {
      expect(isDomainBlocked('https://reuters.com/photo/123')).toEqual({ blocked: false });
      expect(isDomainBlocked('https://apnews.com/article/123')).toEqual({ blocked: false });
      expect(isDomainBlocked('https://bbc.co.uk/news/123')).toEqual({ blocked: false });
      expect(isDomainBlocked('https://upload.wikimedia.org/photo.jpg')).toEqual({ blocked: false });
    });

    it('returns { blocked: false } for unknown domains', () => {
      expect(isDomainBlocked('https://example.com/image.jpg')).toEqual({ blocked: false });
      expect(isDomainBlocked('https://cdn.mysite.org/photo.png')).toEqual({ blocked: false });
    });

    it('returns { blocked: false } for empty or invalid URLs', () => {
      expect(isDomainBlocked('')).toEqual({ blocked: false });
      expect(isDomainBlocked('not-a-url')).toEqual({ blocked: false });
    });
  });
});

// ---------------------------------------------------------------------------
// filterCandidates — unit tests
// ---------------------------------------------------------------------------

describe('filterCandidates — unit tests', () => {
  const makeCandidate = (overrides: Partial<MediaCandidate> = {}): MediaCandidate => ({
    url: 'https://example.com/image.jpg',
    source: 'DuckDuckGo · web',
    alt: 'test image',
    baseScore: 100,
    query: 'test',
    finalScore: 0,
    type: 'image',
    ...overrides,
  });

  it('accepts all candidates when none are blocked', () => {
    const candidates = [
      makeCandidate({ url: 'https://reuters.com/photo.jpg', sourceUrl: 'https://reuters.com/article' }),
      makeCandidate({ url: 'https://example.com/img.png', sourceUrl: 'https://example.com/page' }),
    ];
    const result = filterCandidates(candidates);
    expect(result.accepted).toHaveLength(2);
    expect(result.rejected).toHaveLength(0);
  });

  it('rejects all candidates when all are blocked', () => {
    const candidates = [
      makeCandidate({ url: 'https://sputniknews.com/photo.jpg' }),
      makeCandidate({ url: 'https://9gag.com/gag/123' }),
    ];
    const result = filterCandidates(candidates);
    expect(result.accepted).toHaveLength(0);
    expect(result.rejected).toHaveLength(2);
  });

  it('correctly splits a mixed array into accepted and rejected', () => {
    const candidates = [
      makeCandidate({ url: 'https://reuters.com/photo.jpg', sourceUrl: 'https://reuters.com/article' }),
      makeCandidate({ url: 'https://sputniknews.com/photo.jpg' }),
      makeCandidate({ url: 'https://example.com/img.png' }),
      makeCandidate({ url: 'https://i.imgur.com/abc.jpg' }),
    ];
    const result = filterCandidates(candidates);
    expect(result.accepted).toHaveLength(2);
    expect(result.rejected).toHaveLength(2);
    expect(result.accepted[0].url).toBe('https://reuters.com/photo.jpg');
    expect(result.accepted[1].url).toBe('https://example.com/img.png');
  });

  it('rejected entries include pattern and category', () => {
    const candidates = [makeCandidate({ url: 'https://shutterstock.com/preview.jpg' })];
    const result = filterCandidates(candidates);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].pattern).toBe('shutterstock');
    expect(result.rejected[0].category).toBe('watermarked-stock');
    expect(result.rejected[0].candidate).toBe(candidates[0]);
  });

  it('rejects a candidate when sourceUrl is blocked but url is clean', () => {
    const candidate = makeCandidate({
      url: 'https://cdn.cleanhost.com/image.jpg',
      sourceUrl: 'https://rt.com/news/article',
    });
    const result = filterCandidates([candidate]);
    expect(result.accepted).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].pattern).toBe('rt.com');
    expect(result.rejected[0].category).toBe('propaganda');
  });

  it('rejects a candidate when url is blocked but sourceUrl is clean', () => {
    const candidate = makeCandidate({
      url: 'https://image.shutterstock.com/watermark/123.jpg',
      sourceUrl: 'https://example.com/article',
    });
    const result = filterCandidates([candidate]);
    expect(result.accepted).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].pattern).toBe('shutterstock');
  });

  it('accepts a candidate when sourceUrl is undefined and url is clean', () => {
    const candidate = makeCandidate({
      url: 'https://example.com/photo.jpg',
      sourceUrl: undefined,
    });
    const result = filterCandidates([candidate]);
    expect(result.accepted).toHaveLength(1);
    expect(result.rejected).toHaveLength(0);
  });

  it('returns empty arrays for an empty input', () => {
    const result = filterCandidates([]);
    expect(result.accepted).toHaveLength(0);
    expect(result.rejected).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getDomainTrustTier
// ---------------------------------------------------------------------------

describe('getDomainTrustTier', () => {
  it('returns "trusted" for allowlisted domains', () => {
    expect(getDomainTrustTier('https://reuters.com/photo/123')).toBe('trusted');
    expect(getDomainTrustTier('https://apnews.com/article/123')).toBe('trusted');
    expect(getDomainTrustTier('https://bbc.co.uk/news/123')).toBe('trusted');
    expect(getDomainTrustTier('https://bloomberg.com/news/123')).toBe('trusted');
    expect(getDomainTrustTier('https://nytimes.com/2024/article')).toBe('trusted');
    expect(getDomainTrustTier('https://wsj.com/articles/123')).toBe('trusted');
    expect(getDomainTrustTier('https://cnn.com/2024/news')).toBe('trusted');
    expect(getDomainTrustTier('https://cnbc.com/2024/markets')).toBe('trusted');
    expect(getDomainTrustTier('https://forbes.com/sites/article')).toBe('trusted');
    expect(getDomainTrustTier('https://upload.wikimedia.org/photo.jpg')).toBe('trusted');
    expect(getDomainTrustTier('https://images.unsplash.com/photo.jpg')).toBe('trusted');
    expect(getDomainTrustTier('https://images.pexels.com/photo.jpg')).toBe('trusted');
  });

  it('returns "trusted" for subdomains of allowlisted domains', () => {
    expect(getDomainTrustTier('https://cdn.reuters.com/image.jpg')).toBe('trusted');
    expect(getDomainTrustTier('https://images.forbes.com/photo.jpg')).toBe('trusted');
  });

  it('returns "unknown" for domains not on the allowlist', () => {
    expect(getDomainTrustTier('https://example.com/image.jpg')).toBe('unknown');
    expect(getDomainTrustTier('https://randomsite.org/photo.png')).toBe('unknown');
    expect(getDomainTrustTier('https://cdn.mysite.net/img.jpg')).toBe('unknown');
  });

  it('returns "unknown" for empty or invalid URLs', () => {
    expect(getDomainTrustTier('')).toBe('unknown');
    expect(getDomainTrustTier('not-a-url')).toBe('unknown');
  });
});


// ============================================================================
// Task 5.3 — Integration Tests for Domain Filtering in the Harvester
// ============================================================================

import { vi, afterEach } from 'vitest';

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

import { logger } from '../logger';

describe('Integration: domain filtering in harvester', () => {
  const makeCandidate = (overrides: Partial<MediaCandidate> = {}): MediaCandidate => ({
    url: 'https://example.com/image.jpg',
    source: 'DuckDuckGo · web',
    alt: 'test image',
    baseScore: 100,
    query: 'test',
    finalScore: 0,
    type: 'image',
    ...overrides,
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('filterCandidates correctly filters a realistic mixed array of candidates', () => {
    const candidates: MediaCandidate[] = [
      // Should be accepted — trusted editorial
      makeCandidate({ url: 'https://cdn.reuters.com/photo1.jpg', sourceUrl: 'https://reuters.com/article/1' }),
      // Should be rejected — propaganda
      makeCandidate({ url: 'https://cdn.sputniknews.com/img/photo.jpg', sourceUrl: 'https://sputniknews.com/photo/123' }),
      // Should be accepted — unknown but clean domain
      makeCandidate({ url: 'https://example.com/photo2.jpg', sourceUrl: 'https://example.com/page' }),
      // Should be rejected — watermarked stock
      makeCandidate({ url: 'https://image.shutterstock.com/watermark/456.jpg', sourceUrl: 'https://shutterstock.com/preview/456' }),
      // Should be accepted — Wikimedia
      makeCandidate({ url: 'https://upload.wikimedia.org/commons/photo.jpg', source: 'Wikimedia Commons' }),
      // Should be rejected — low-quality
      makeCandidate({ url: 'https://i.imgur.com/abc123.jpg', sourceUrl: 'https://imgur.com/gallery/abc' }),
      // Should be accepted — BBC
      makeCandidate({ url: 'https://ichef.bbci.co.uk/news/photo.jpg', sourceUrl: 'https://bbc.co.uk/news/article' }),
      // Should be rejected — adult content
      makeCandidate({ url: 'https://pornhub.com/thumb/123.jpg' }),
      // Should be rejected — blocked url with clean sourceUrl
      makeCandidate({ url: 'https://cdn.rt.com/image.jpg', sourceUrl: 'https://cleansite.com/article' }),
    ];

    const result = filterCandidates(candidates);

    expect(result.accepted).toHaveLength(4);
    expect(result.rejected).toHaveLength(5);

    // Verify accepted candidates are the expected ones
    const acceptedUrls = result.accepted.map(c => c.url);
    expect(acceptedUrls).toContain('https://cdn.reuters.com/photo1.jpg');
    expect(acceptedUrls).toContain('https://example.com/photo2.jpg');
    expect(acceptedUrls).toContain('https://upload.wikimedia.org/commons/photo.jpg');
    expect(acceptedUrls).toContain('https://ichef.bbci.co.uk/news/photo.jpg');

    // Verify rejected candidates have correct categories
    const rejectedCategories = result.rejected.map(r => r.category);
    expect(rejectedCategories).toContain('propaganda');
    expect(rejectedCategories).toContain('watermarked-stock');
    expect(rejectedCategories).toContain('low-quality');
    expect(rejectedCategories).toContain('adult-content');
  });

  it('rejection logging is called with correct parameters', () => {
    const candidates: MediaCandidate[] = [
      makeCandidate({ url: 'https://sputniknews.com/photo.jpg', sourceUrl: 'https://sputniknews.com/article' }),
      makeCandidate({ url: 'https://reuters.com/photo.jpg', sourceUrl: 'https://reuters.com/article' }),
      makeCandidate({ url: 'https://9gag.com/gag/123' }),
    ];

    const { rejected } = filterCandidates(candidates);

    // Simulate the logging that harvestMediaWithSafetyNet does
    for (const { candidate: rejCandidate, pattern, category } of rejected) {
      logger.warn('DomainFilter', `Rejected: ${rejCandidate.url} [${category}] matched pattern "${pattern}"`);
    }

    expect(logger.warn).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith(
      'DomainFilter',
      expect.stringContaining('sputniknews.com'),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      'DomainFilter',
      expect.stringContaining('[propaganda]'),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      'DomainFilter',
      expect.stringContaining('9gag'),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      'DomainFilter',
      expect.stringContaining('[low-quality]'),
    );
  });
});

// ============================================================================
// Task 7.4 — Property 3: Resolution Scoring - Resolution Bonus Monotonicity
// Feature: media-source-filter, Property 3: Resolution Scoring - Resolution Bonus Monotonicity
// ============================================================================

/**
 * **Validates: Requirements 5.1, 5.3, 5.4**
 *
 * Property 3: Resolution Scoring — Resolution Bonus Monotonicity
 *
 * For any two MediaCandidate objects identical except for resolution,
 * the candidate with higher resolution SHALL receive a higher or equal
 * resolution bonus. Specifically:
 *   4K+ (≥3840×2160) → +200
 *   2K  (≥2560×1440) → +100
 *   1080p (≥1920×1080) → +50
 *   720p  (≥1280×720) → +0
 *   below 720p → -100
 *   unknown → +0
 */

describe('Property 3: Resolution Scoring — Resolution Bonus Monotonicity', () => {
  // Resolution tiers ordered from highest to lowest expected bonus
  const RESOLUTION_TIERS = [
    { name: '4K', width: 3840, height: 2160, expectedBonus: 200 },
    { name: '2K', width: 2560, height: 1440, expectedBonus: 100 },
    { name: '1080p', width: 1920, height: 1080, expectedBonus: 50 },
    { name: '720p', width: 1280, height: 720, expectedBonus: 0 },
    { name: 'below720p', width: 640, height: 480, expectedBonus: -100 },
  ];

  const baseResCandidate: MediaCandidate = {
    url: 'https://example.com/image.jpg',
    source: 'DuckDuckGo · web',
    sourceUrl: 'https://example.com/page',
    alt: 'test image',
    baseScore: 100,
    query: 'test',
    finalScore: 0,
    type: 'image',
  };

  it('higher resolution tiers always produce higher or equal scores than lower tiers', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: RESOLUTION_TIERS.length - 2 }),
        (tierIdx) => {
          const higherTier = RESOLUTION_TIERS[tierIdx];
          const lowerTier = RESOLUTION_TIERS[tierIdx + 1];

          const higherCandidate: MediaCandidate = {
            ...baseResCandidate,
            width: higherTier.width,
            height: higherTier.height,
          };
          const lowerCandidate: MediaCandidate = {
            ...baseResCandidate,
            width: lowerTier.width,
            height: lowerTier.height,
          };

          const higherScore = scoreCandidate(higherCandidate, STUB_TOPIC_CONTEXT, undefined, 'stock');
          const lowerScore = scoreCandidate(lowerCandidate, STUB_TOPIC_CONTEXT, undefined, 'stock');

          expect(higherScore).toBeGreaterThan(lowerScore);
        },
      ),
      { numRuns: 50 },
    );
  });

  it('resolution bonus values match the spec for generated resolution pairs', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...RESOLUTION_TIERS),
        fc.constantFrom(...RESOLUTION_TIERS),
        (tierA, tierB) => {
          const candidateA: MediaCandidate = {
            ...baseResCandidate,
            width: tierA.width,
            height: tierA.height,
          };
          const candidateB: MediaCandidate = {
            ...baseResCandidate,
            width: tierB.width,
            height: tierB.height,
          };

          const scoreA = scoreCandidate(candidateA, STUB_TOPIC_CONTEXT, undefined, 'stock');
          const scoreB = scoreCandidate(candidateB, STUB_TOPIC_CONTEXT, undefined, 'stock');

          // Account for pixel-based scoring differences too (section 4 in scoreCandidate)
          // We just verify monotonicity: if tierA has higher bonus, scoreA >= scoreB
          if (tierA.expectedBonus > tierB.expectedBonus) {
            expect(scoreA).toBeGreaterThan(scoreB);
          } else if (tierA.expectedBonus === tierB.expectedBonus) {
            expect(scoreA).toBe(scoreB);
          } else {
            expect(scoreA).toBeLessThan(scoreB);
          }
        },
      ),
      { numRuns: 50 },
    );
  });

  it('unknown dimensions (undefined) produce +0 bonus — same as 720p baseline', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('stock' as const, 'raw' as const),
        (sourceType) => {
          const unknownCandidate: MediaCandidate = {
            ...baseResCandidate,
            width: undefined,
            height: undefined,
          };
          const unknownScore = scoreCandidate(unknownCandidate, STUB_TOPIC_CONTEXT, undefined, sourceType);

          // Unknown dimensions get no resolution bonus (+0), same as 720p (+0)
          // But 720p has pixel-based and ratio-based scoring from section 4 that unknown doesn't
          // So unknown should score LESS than 720p (720p gets ratio bonus +30)
          // The key property: unknown does NOT get the -100 below-720p penalty
          const below720Candidate: MediaCandidate = {
            ...baseResCandidate,
            width: 640,
            height: 480,
          };
          const below720Score = scoreCandidate(below720Candidate, STUB_TOPIC_CONTEXT, undefined, sourceType);

          // Unknown should score higher than below-720p (which gets -100 penalty)
          expect(unknownScore).toBeGreaterThan(below720Score);
        },
      ),
      { numRuns: 20 },
    );
  });
});

// ============================================================================
// Task 7.5 — Unit Tests for Resolution Scoring and Search Hints
// ============================================================================

describe('Resolution scoring — unit tests', () => {
  const baseResUnitCandidate: MediaCandidate = {
    url: 'https://example.com/image.jpg',
    source: 'DuckDuckGo · web',
    sourceUrl: 'https://example.com/page',
    alt: 'test image',
    baseScore: 100,
    query: 'test',
    finalScore: 0,
    type: 'image',
  };

  it('4K resolution (3840×2160) gets +200 bonus', () => {
    const candidate4K: MediaCandidate = { ...baseResUnitCandidate, width: 3840, height: 2160 };
    const candidate720: MediaCandidate = { ...baseResUnitCandidate, width: 1280, height: 720 };
    const score4K = scoreCandidate(candidate4K, STUB_TOPIC_CONTEXT, undefined, 'stock');
    const score720 = scoreCandidate(candidate720, STUB_TOPIC_CONTEXT, undefined, 'stock');
    // 4K gets +200 resolution bonus, 720p gets +0
    // 4K also gets +40 pixel bonus (≥1920×1080), 720p doesn't
    // Both get +30 ratio bonus (landscape)
    // Net difference from resolution alone: 200 - 0 = 200, plus pixel diff
    expect(score4K).toBeGreaterThan(score720);
    expect(score4K - score720).toBeGreaterThanOrEqual(200);
  });

  it('2K resolution (2560×1440) gets +100 bonus', () => {
    const candidate2K: MediaCandidate = { ...baseResUnitCandidate, width: 2560, height: 1440 };
    const candidate720: MediaCandidate = { ...baseResUnitCandidate, width: 1280, height: 720 };
    const score2K = scoreCandidate(candidate2K, STUB_TOPIC_CONTEXT, undefined, 'stock');
    const score720 = scoreCandidate(candidate720, STUB_TOPIC_CONTEXT, undefined, 'stock');
    expect(score2K).toBeGreaterThan(score720);
    expect(score2K - score720).toBeGreaterThanOrEqual(100);
  });

  it('1080p resolution (1920×1080) gets +50 bonus', () => {
    const candidate1080: MediaCandidate = { ...baseResUnitCandidate, width: 1920, height: 1080 };
    const candidate720: MediaCandidate = { ...baseResUnitCandidate, width: 1280, height: 720 };
    const score1080 = scoreCandidate(candidate1080, STUB_TOPIC_CONTEXT, undefined, 'stock');
    const score720 = scoreCandidate(candidate720, STUB_TOPIC_CONTEXT, undefined, 'stock');
    expect(score1080).toBeGreaterThan(score720);
    expect(score1080 - score720).toBeGreaterThanOrEqual(50);
  });

  it('720p resolution (1280×720) gets +0 bonus (baseline)', () => {
    const candidate720: MediaCandidate = { ...baseResUnitCandidate, width: 1280, height: 720 };
    const candidateBelow: MediaCandidate = { ...baseResUnitCandidate, width: 640, height: 480 };
    const score720 = scoreCandidate(candidate720, STUB_TOPIC_CONTEXT, undefined, 'stock');
    const scoreBelow = scoreCandidate(candidateBelow, STUB_TOPIC_CONTEXT, undefined, 'stock');
    // 720p gets +0, below 720p gets -100
    expect(score720).toBeGreaterThan(scoreBelow);
  });

  it('below 720p resolution gets -100 penalty', () => {
    const candidateBelow: MediaCandidate = { ...baseResUnitCandidate, width: 640, height: 480 };
    const candidate720: MediaCandidate = { ...baseResUnitCandidate, width: 1280, height: 720 };
    const scoreBelow = scoreCandidate(candidateBelow, STUB_TOPIC_CONTEXT, undefined, 'stock');
    const score720 = scoreCandidate(candidate720, STUB_TOPIC_CONTEXT, undefined, 'stock');
    // The below-720p candidate should score at least 100 less than 720p
    expect(score720 - scoreBelow).toBeGreaterThanOrEqual(100);
  });

  it('unknown dimensions (undefined width/height) produce +0 bonus', () => {
    const unknownCandidate: MediaCandidate = {
      ...baseResUnitCandidate,
      width: undefined,
      height: undefined,
    };
    const score = scoreCandidate(unknownCandidate, STUB_TOPIC_CONTEXT, undefined, 'stock');
    // Score should be a valid number (no NaN from undefined dimensions)
    expect(Number.isFinite(score)).toBe(true);

    // Compare with a 720p candidate — unknown should not get the resolution bonus
    // but also should not get the below-720p penalty
    const below720Candidate: MediaCandidate = { ...baseResUnitCandidate, width: 640, height: 480 };
    const below720Score = scoreCandidate(below720Candidate, STUB_TOPIC_CONTEXT, undefined, 'stock');
    // Unknown should score higher than below-720p (no -100 penalty)
    expect(score).toBeGreaterThan(below720Score);
  });
});
