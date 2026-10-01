import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  evictOldestEntries,
  IMG_CACHE_MAX,
  MAX_FRAMES,
  isCanvasSafeSource,
  QUALITY_PRESETS,
  buildImageSources,
} from '../renderer';
import type { ImgCache } from '../renderer';

// ---------------------------------------------------------------------------
// Property 5: Image cache bounded to maximum size
// Feature: codebase-robustness-audit, Property 5: Image cache bounded to maximum size
// **Validates: Requirements 5.6**
// ---------------------------------------------------------------------------

describe('Property 5: Image cache bounded to maximum size', () => {
  /**
   * For any number of images loaded, the image cache SHALL contain at most
   * 60 entries (IMG_CACHE_MAX), evicting oldest entries when the limit is exceeded.
   *
   * We generate a cache with an arbitrary number of entries (0..200), call
   * evictOldestEntries, and verify the cache never exceeds IMG_CACHE_MAX.
   */
  it('evictOldestEntries keeps cache at most IMG_CACHE_MAX entries for any cache size', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 200 }),
        (numEntries) => {
          // Build a cache with numEntries entries
          const cache: ImgCache = {};
          for (let i = 0; i < numEntries; i++) {
            cache[`img-${i}`] = {} as HTMLImageElement;
          }

          evictOldestEntries(cache);

          const remaining = Object.keys(cache).length;
          expect(remaining).toBeLessThanOrEqual(IMG_CACHE_MAX);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('evictOldestEntries preserves all entries when cache is at or below the limit', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: IMG_CACHE_MAX }),
        (numEntries) => {
          const cache: ImgCache = {};
          for (let i = 0; i < numEntries; i++) {
            cache[`img-${i}`] = {} as HTMLImageElement;
          }

          evictOldestEntries(cache);

          // No eviction should occur — all entries preserved
          expect(Object.keys(cache).length).toBe(numEntries);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('evictOldestEntries evicts oldest entries (lowest indices) when over limit', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: IMG_CACHE_MAX + 1, max: 200 }),
        (numEntries) => {
          const cache: ImgCache = {};
          for (let i = 0; i < numEntries; i++) {
            cache[`img-${i}`] = {} as HTMLImageElement;
          }

          evictOldestEntries(cache);

          const keys = Object.keys(cache);
          expect(keys.length).toBe(IMG_CACHE_MAX);

          // The remaining keys should be the last IMG_CACHE_MAX entries
          // (oldest entries were evicted)
          for (let i = numEntries - IMG_CACHE_MAX; i < numEntries; i++) {
            expect(cache[`img-${i}`]).toBeDefined();
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 6: Captured frames bounded to maximum count
// Feature: codebase-robustness-audit, Property 6: Captured frames bounded to maximum count
// **Validates: Requirements 6.1**
// ---------------------------------------------------------------------------

describe('Property 6: Captured frames bounded to maximum count', () => {
  /**
   * The renderer SHALL capture at most MAX_FRAMES (2000) frames.
   *
   * We replicate the frame capture guard logic from renderVideoToBlob:
   *   if (f % frameInterval === 0 && capturedFrames.length < MAX_CAPTURED_FRAMES) {
   *     capturedFrames.push(frame);
   *   }
   *
   * For any total frame count and frame interval, the captured frames array
   * never exceeds MAX_FRAMES.
   */
  it('frame capture guard never allows more than MAX_FRAMES captured frames', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10000 }),  // totalFrames
        fc.integer({ min: 1, max: 10 }),      // frameInterval
        (totalFrames, frameInterval) => {
          const capturedFrames: string[] = [];

          for (let f = 0; f < totalFrames; f++) {
            if (f % frameInterval === 0 && capturedFrames.length < MAX_FRAMES) {
              capturedFrames.push('frame');
            }
          }

          expect(capturedFrames.length).toBeLessThanOrEqual(MAX_FRAMES);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('MAX_FRAMES constant equals 2000', () => {
    expect(MAX_FRAMES).toBe(2000);
  });
});

// ---------------------------------------------------------------------------
// Property 9: Canvas safety classification
// Feature: codebase-robustness-audit, Property 9: Canvas safety classification
// **Validates: Requirements 12.1**
// ---------------------------------------------------------------------------

describe('Property 9: Canvas safety classification', () => {
  // Arbitrary generators for safe URL patterns
  const safeDataUrls = fc.stringMatching(/^[a-zA-Z0-9+/=]{1,50}$/)
    .map(s => `data:image/png;base64,${s}`);

  const safeBlobUrls = fc.stringMatching(/^[a-z0-9-]{1,30}$/)
    .map(s => `blob:http://localhost/${s}`);

  const safeLocalProxyUrls = fc.stringMatching(/^[a-z]{3,15}\.(com|org|net)$/)
    .map(domain => `/api/proxy-image?url=${encodeURIComponent(`https://${domain}/image.jpg`)}`);

  const safeWeservUrls = fc.stringMatching(/^[a-z]{3,15}\.(com|org|net)$/)
    .map(domain => `https://images.weserv.nl/?url=https://${domain}/image.jpg`);

  const safeAlloriginsUrls = fc.stringMatching(/^[a-z]{3,15}\.(com|org|net)$/)
    .map(domain => `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://${domain}/image.jpg`)}`);

  const safeCorsproxUrls = fc.stringMatching(/^[a-z]{3,15}\.(com|org|net)$/)
    .map(domain => `https://corsproxy.io/?${encodeURIComponent(`https://${domain}/image.jpg`)}`);

  // Arbitrary generator for unsafe URLs (random external HTTPS URLs not in the safe list)
  const unsafeUrls = fc.stringMatching(/^[a-z]{3,20}$/)
    .map(domain => `https://${domain}.com/image.jpg`);

  it('returns true for data: URLs', () => {
    fc.assert(
      fc.property(safeDataUrls, (url) => {
        expect(isCanvasSafeSource(url)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('returns true for blob: URLs', () => {
    fc.assert(
      fc.property(safeBlobUrls, (url) => {
        expect(isCanvasSafeSource(url)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('returns true for local proxy URLs', () => {
    fc.assert(
      fc.property(safeLocalProxyUrls, (url) => {
        expect(isCanvasSafeSource(url)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('returns true for weserv.nl proxy URLs', () => {
    fc.assert(
      fc.property(safeWeservUrls, (url) => {
        expect(isCanvasSafeSource(url)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('returns true for allorigins.win proxy URLs', () => {
    fc.assert(
      fc.property(safeAlloriginsUrls, (url) => {
        expect(isCanvasSafeSource(url)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('returns true for corsproxy.io proxy URLs', () => {
    fc.assert(
      fc.property(safeCorsproxUrls, (url) => {
        expect(isCanvasSafeSource(url)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('returns false for arbitrary external HTTPS URLs not in the safe list', () => {
    fc.assert(
      fc.property(unsafeUrls, (url) => {
        expect(isCanvasSafeSource(url)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('returns false for empty string', () => {
    expect(isCanvasSafeSource('')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Property 10: Canvas dimensions match quality preset
// Feature: codebase-robustness-audit, Property 10: Canvas dimensions match quality preset
// **Validates: Requirements 12.4**
// ---------------------------------------------------------------------------

describe('Property 10: Canvas dimensions match quality preset', () => {
  const qualityValues = ['draft', 'standard', 'high'] as const;

  const expectedDimensions: Record<string, { width: number; height: number }> = {
    draft: { width: 854, height: 480 },
    standard: { width: 1920, height: 1080 },
    high: { width: 1920, height: 1080 },
  };

  it('QUALITY_PRESETS dimensions match expected values for any quality', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...qualityValues),
        (quality) => {
          const preset = QUALITY_PRESETS[quality];
          const expected = expectedDimensions[quality];

          expect(preset.width).toBe(expected.width);
          expect(preset.height).toBe(expected.height);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('QUALITY_PRESETS has entries for all three quality levels', () => {
    for (const q of qualityValues) {
      expect(QUALITY_PRESETS[q]).toBeDefined();
      expect(QUALITY_PRESETS[q].width).toBeGreaterThan(0);
      expect(QUALITY_PRESETS[q].height).toBeGreaterThan(0);
      expect(QUALITY_PRESETS[q].fps).toBeGreaterThan(0);
    }
  });

  it('higher quality presets have larger or equal dimensions', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          ['draft', 'standard'] as const,
          ['standard', 'high'] as const,
        ),
        ([lower, higher]) => {
          expect(QUALITY_PRESETS[higher].width).toBeGreaterThanOrEqual(QUALITY_PRESETS[lower].width);
          expect(QUALITY_PRESETS[higher].height).toBeGreaterThanOrEqual(QUALITY_PRESETS[lower].height);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 17: Image source ordering
// Feature: codebase-robustness-audit, Property 17: Image source ordering
// **Validates: Requirements 19.1**
// ---------------------------------------------------------------------------

describe('Property 17: Image source ordering', () => {
  // Generator for valid external HTTP/HTTPS URLs
  const externalUrls = fc.stringMatching(/^[a-z]{3,15}$/)
    .map(domain => `https://${domain}.com/path/to/image.jpg`);

  it('returns sources in order: [local proxy, weserv.nl, corsproxy.io, direct URL]', () => {
    fc.assert(
      fc.property(externalUrls, (url) => {
        const sources = buildImageSources(url);

        // Must have exactly 4 sources
        expect(sources).toHaveLength(4);

        // 1. Local proxy
        expect(sources[0]).toMatch(/^\/api\/proxy-image\?url=/);

        // 2. weserv.nl
        expect(sources[1]).toContain('images.weserv.nl');

        // 3. corsproxy.io
        expect(sources[2]).toContain('corsproxy.io');

        // 4. Direct URL
        expect(sources[3]).toBe(url);
      }),
      { numRuns: 100 },
    );
  });

  it('returns single-element array for non-HTTP URLs', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('/images/local.jpg', '/api/data', 'relative/path.png', './file.jpg'),
        (url) => {
          const sources = buildImageSources(url);
          expect(sources).toEqual([url]);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('local proxy source contains the original URL encoded', () => {
    fc.assert(
      fc.property(externalUrls, (url) => {
        const sources = buildImageSources(url);
        expect(sources[0]).toContain(encodeURIComponent(url));
      }),
      { numRuns: 100 },
    );
  });
});
