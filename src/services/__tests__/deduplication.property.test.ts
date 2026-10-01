/**
 * Property-Based Tests — Visual Deduplication Engine
 *
 * Feature: blind-review-quality-fixes, Property 3: Deduplication registry tracks all assigned assets
 * Feature: blind-review-quality-fixes, Property 4: Near-duplicate penalty
 *
 * Validates: Requirements 2.1, 2.2, 2.3
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  createDeduplicationRegistry,
  registerAsset,
  getDeduplicationPenalty,
} from '../media';
import type { MediaCandidate } from '../media';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Arbitrary for a valid domain name */
const domainArb: fc.Arbitrary<string> = fc.stringMatching(/^[a-z]{3,8}\.(com|org|net)$/);

/** Arbitrary for a URL path segment */
const pathArb: fc.Arbitrary<string> = fc.stringMatching(/^\/[a-z]{2,8}\/[a-z0-9]{4,10}\.(jpg|png)$/);

/** Arbitrary for alt text (non-empty, lowercase words) */
const altArb: fc.Arbitrary<string> = fc.stringMatching(/^[a-z]{3,8}( [a-z]{3,8}){1,4}$/);

/**
 * Arbitrary for a minimal MediaAsset-like object suitable for registerAsset.
 * Uses the overload that accepts { url, alt?, sourceUrl? }.
 */
function assetArb(domain: string, path: string, alt: string): { url: string; alt: string; sourceUrl: string } {
  return {
    url: `https://${domain}${path}`,
    alt,
    sourceUrl: `https://${domain}/page`,
  };
}

/**
 * Build a MediaCandidate from parts.
 */
function buildCandidate(opts: {
  url: string;
  alt: string;
  sourceUrl?: string;
}): MediaCandidate {
  return {
    url: opts.url,
    alt: opts.alt,
    source: 'Generic Source',
    sourceUrl: opts.sourceUrl,
    width: undefined,
    height: undefined,
    baseScore: 100,
    query: 'test query',
    finalScore: 0,
    type: 'image',
  };
}

// ---------------------------------------------------------------------------
// Property 3: Deduplication registry tracks all assigned assets
// ---------------------------------------------------------------------------

describe('Feature: blind-review-quality-fixes, Property 3: Deduplication registry tracks all assigned assets', () => {
  /**
   * **Validates: Requirements 2.1, 2.2**
   *
   * For any sequence of registerAsset calls with distinct MediaAssets,
   * the registry's usedUrls set SHALL contain exactly those asset URLs,
   * and getDeduplicationPenalty for any of those URLs SHALL return -400.
   */

  it('usedUrls contains all registered asset URLs', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(domainArb, pathArb, altArb),
          { minLength: 1, maxLength: 10 },
        ),
        (assetTuples) => {
          const registry = createDeduplicationRegistry();

          // Generate distinct URLs by combining domain + path
          const assets = assetTuples.map(([domain, path, alt]) => assetArb(domain, path, alt));

          // Deduplicate by URL to ensure distinct assets
          const uniqueAssets = assets.filter(
            (a, i, arr) => arr.findIndex((b) => b.url === a.url) === i,
          );

          // Register all assets
          for (const asset of uniqueAssets) {
            registerAsset(registry, asset);
          }

          // Verify usedUrls contains exactly those URLs
          for (const asset of uniqueAssets) {
            expect(registry.usedUrls.has(asset.url)).toBe(true);
          }
          expect(registry.usedUrls.size).toBe(uniqueAssets.length);
        },
      ),
      { numRuns: 30 },
    );
  });

  it('getDeduplicationPenalty returns -400 for any registered URL', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.tuple(domainArb, pathArb, altArb),
          { minLength: 1, maxLength: 10 },
        ),
        fc.nat({ max: 9 }),
        (assetTuples, pickIndex) => {
          const registry = createDeduplicationRegistry();

          const assets = assetTuples.map(([domain, path, alt]) => assetArb(domain, path, alt));

          // Deduplicate by URL
          const uniqueAssets = assets.filter(
            (a, i, arr) => arr.findIndex((b) => b.url === a.url) === i,
          );

          if (uniqueAssets.length === 0) return; // skip degenerate case

          // Register all assets
          for (const asset of uniqueAssets) {
            registerAsset(registry, asset);
          }

          // Pick one of the registered assets and check penalty
          const idx = pickIndex % uniqueAssets.length;
          const target = uniqueAssets[idx];

          const candidate = buildCandidate({
            url: target.url,
            alt: 'different alt text',
            sourceUrl: 'https://other.com/page',
          });

          const penalty = getDeduplicationPenalty(registry, candidate);
          expect(penalty).toBe(-400);
        },
      ),
      { numRuns: 30 },
    );
  });

  it('getDeduplicationPenalty returns 0 for URLs not in the registry', () => {
    fc.assert(
      fc.property(
        fc.tuple(domainArb, pathArb, altArb),
        fc.tuple(domainArb, pathArb, altArb),
        (registeredTuple, queryTuple) => {
          const registry = createDeduplicationRegistry();

          const [regDomain, regPath, regAlt] = registeredTuple;
          const [qDomain, qPath, qAlt] = queryTuple;

          const registeredAsset = assetArb(regDomain, regPath, regAlt);
          registerAsset(registry, registeredAsset);

          // Build a candidate with a different URL and different domain+alt signature
          const candidateUrl = `https://${qDomain}${qPath}`;
          if (candidateUrl === registeredAsset.url) return; // skip if URLs collide

          const candidate = buildCandidate({
            url: candidateUrl,
            alt: qAlt,
            sourceUrl: `https://${qDomain}/other`,
          });

          // If the signature also doesn't match, penalty should be 0
          const regSignature = `${regDomain}.com::${regAlt}`;
          const candidateSignature = `${qDomain}.com::${qAlt}`;
          if (regSignature === candidateSignature) return; // skip near-dup collision

          const penalty = getDeduplicationPenalty(registry, candidate);
          expect(penalty).toBe(0);
        },
      ),
      { numRuns: 30 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 4: Near-duplicate penalty
// ---------------------------------------------------------------------------

describe('Feature: blind-review-quality-fixes, Property 4: Near-duplicate penalty', () => {
  /**
   * **Validates: Requirements 2.3**
   *
   * For any MediaCandidate whose (source domain, normalized alt text) pair
   * matches an entry already in the deduplication registry,
   * getDeduplicationPenalty SHALL return -200 (when the exact URL does not
   * match but the signature does).
   */

  it('near-duplicate (same domain + alt, different URL) returns -200 penalty', () => {
    fc.assert(
      fc.property(
        domainArb,
        pathArb,
        pathArb,
        altArb,
        (domain, path1, path2, alt) => {
          const registry = createDeduplicationRegistry();

          // Ensure the two paths produce different URLs
          const url1 = `https://${domain}${path1}`;
          const url2 = `https://${domain}${path2}`;
          if (url1 === url2) return; // skip if URLs collide

          // Register the first asset
          const asset = {
            url: url1,
            alt,
            sourceUrl: `https://${domain}/page1`,
          };
          registerAsset(registry, asset);

          // Build a candidate with same domain + same alt but different URL
          const candidate = buildCandidate({
            url: url2,
            alt,
            sourceUrl: `https://${domain}/page2`,
          });

          const penalty = getDeduplicationPenalty(registry, candidate);
          expect(penalty).toBe(-200);
        },
      ),
      { numRuns: 30 },
    );
  });

  it('near-duplicate detection is case-insensitive for alt text', () => {
    fc.assert(
      fc.property(
        domainArb,
        pathArb,
        pathArb,
        altArb,
        (domain, path1, path2, alt) => {
          const registry = createDeduplicationRegistry();

          const url1 = `https://${domain}${path1}`;
          const url2 = `https://${domain}${path2}`;
          if (url1 === url2) return;

          // Register with lowercase alt
          const asset = {
            url: url1,
            alt: alt.toLowerCase(),
            sourceUrl: `https://${domain}/page1`,
          };
          registerAsset(registry, asset);

          // Query with uppercase alt — should still match due to normalization
          const candidate = buildCandidate({
            url: url2,
            alt: alt.toUpperCase(),
            sourceUrl: `https://${domain}/page2`,
          });

          const penalty = getDeduplicationPenalty(registry, candidate);
          expect(penalty).toBe(-200);
        },
      ),
      { numRuns: 30 },
    );
  });

  it('exact URL match takes priority over near-duplicate (-400 not -200)', () => {
    fc.assert(
      fc.property(
        domainArb,
        pathArb,
        altArb,
        (domain, path, alt) => {
          const registry = createDeduplicationRegistry();

          const url = `https://${domain}${path}`;

          // Register the asset
          const asset = {
            url,
            alt,
            sourceUrl: `https://${domain}/page`,
          };
          registerAsset(registry, asset);

          // Candidate with exact same URL AND same domain+alt
          const candidate = buildCandidate({
            url,
            alt,
            sourceUrl: `https://${domain}/page`,
          });

          // Should return -400 (exact match) not -200 (near-duplicate)
          const penalty = getDeduplicationPenalty(registry, candidate);
          expect(penalty).toBe(-400);
        },
      ),
      { numRuns: 30 },
    );
  });

  it('different domain with same alt text does NOT trigger near-duplicate penalty', () => {
    fc.assert(
      fc.property(
        domainArb,
        domainArb,
        pathArb,
        pathArb,
        altArb,
        (domain1, domain2, path1, path2, alt) => {
          // Ensure domains are different
          if (domain1 === domain2) return;

          const registry = createDeduplicationRegistry();

          const url1 = `https://${domain1}${path1}`;
          const url2 = `https://${domain2}${path2}`;
          if (url1 === url2) return;

          // Register asset from domain1
          const asset = {
            url: url1,
            alt,
            sourceUrl: `https://${domain1}/page`,
          };
          registerAsset(registry, asset);

          // Candidate from domain2 with same alt but different domain
          const candidate = buildCandidate({
            url: url2,
            alt,
            sourceUrl: `https://${domain2}/page`,
          });

          // Different domain means signature won't match → penalty should be 0
          const penalty = getDeduplicationPenalty(registry, candidate);
          expect(penalty).toBe(0);
        },
      ),
      { numRuns: 30 },
    );
  });
});
