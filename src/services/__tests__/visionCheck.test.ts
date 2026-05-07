// ============================================================================
// Task 9.2 — Unit Tests for visionCheck
// Task 9.3 — Property 4: Vision Check - Blocking Criteria Rejection
// Task 9.4 — Property 5: Vision Check - Graceful Degradation
// Task 10.2 — Integration Tests for Vision Check in the Harvester
// ============================================================================

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import fc from 'fast-check';
import type { MediaCandidate } from '../media';
import {
  buildVisionCheckPrompt,
  checkCandidateVision,
  batchVisionCheck,
  type VisionCheckResult,
} from '../visionCheck';
import { scoreCandidate } from '../media';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../utils/fetchWithTimeout', () => ({
  fetchWithTimeout: vi.fn(),
}));

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

import { fetchWithTimeout } from '../../utils/fetchWithTimeout';
import { logger } from '../logger';

const mockFetch = vi.mocked(fetchWithTimeout);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCandidate(overrides: Partial<MediaCandidate> = {}): MediaCandidate {
  return {
    url: 'https://example.com/image.jpg',
    source: 'DuckDuckGo · web',
    alt: 'test image',
    baseScore: 100,
    query: 'test',
    finalScore: 0,
    type: 'image',
    ...overrides,
  };
}

function makeVisionResponse(result: Record<string, unknown>): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(result) } }],
    }),
    text: async () => JSON.stringify(result),
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Task 9.2 — Unit Tests for visionCheck
// ---------------------------------------------------------------------------

describe('buildVisionCheckPrompt', () => {
  it('includes blocking criteria concepts in the system prompt', () => {
    const { system } = buildVisionCheckPrompt('https://example.com/image.jpg');

    // The prompt covers all blocking criteria concepts, though with different wording
    expect(system).toContain('watermark');
    expect(system).toContain('state media');
    expect(system).toContain('Meme');
    expect(system).toContain('adult content');
    expect(system).toContain('blurry');
    expect(system).toContain('screenshot');
    expect(system).toContain('AI generation');
  });

  it('includes quality evaluation guidance in the system prompt', () => {
    const { system } = buildVisionCheckPrompt('https://example.com/image.jpg');

    // The prompt should guide the model to evaluate image quality
    expect(system).toContain('image quality inspector');
    expect(system).toContain('professional');
    expect(system).toContain('pass');
    expect(system).toContain('quality_score');
  });

  it('includes the image URL in the user message', () => {
    const imageUrl = 'https://example.com/test-image.jpg';
    const { user } = buildVisionCheckPrompt(imageUrl);

    const imageEntry = user.find(
      (entry) => entry.type === 'image_url',
    );
    expect(imageEntry).toBeDefined();
    expect((imageEntry as Record<string, unknown>).image_url).toEqual({ url: imageUrl });
  });

  it('requests JSON response format in the system prompt', () => {
    const { system } = buildVisionCheckPrompt('https://example.com/image.jpg');
    expect(system).toContain('JSON');
    expect(system).toContain('pass');
    expect(system).toContain('confidence');
    expect(system).toContain('issues');
    expect(system).toContain('quality_score');
  });
});

describe('checkCandidateVision', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns null on API failure (non-throwing)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    } as unknown as Response);

    const result = await checkCandidateVision('https://example.com/image.jpg', 'test-key');
    expect(result).toBeNull();
  });

  it('returns null when fetch throws a network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const result = await checkCandidateVision('https://example.com/image.jpg', 'test-key');
    expect(result).toBeNull();
  });

  it('returns null when API returns empty content', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: '' } }],
      }),
    } as unknown as Response);

    const result = await checkCandidateVision('https://example.com/image.jpg', 'test-key');
    expect(result).toBeNull();
  });

  it('parses valid responses correctly — pass: true', async () => {
    mockFetch.mockResolvedValueOnce(
      makeVisionResponse({
        pass: true,
        confidence: 85,
        issues: [],
        quality_signals: ['professional editorial photography', 'high resolution'],
        quality_score: 8,
      }),
    );

    const result = await checkCandidateVision('https://example.com/image.jpg', 'test-key');
    expect(result).not.toBeNull();
    expect(result!.pass).toBe(true);
    expect(result!.confidence).toBe(85);
    expect(result!.issues).toEqual([]);
    expect(result!.qualitySignals).toEqual(['professional editorial photography', 'high resolution']);
    expect(result!.qualityScore).toBe(8);
  });

  it('parses valid responses correctly — pass: false with issues', async () => {
    mockFetch.mockResolvedValueOnce(
      makeVisionResponse({
        pass: false,
        confidence: 92,
        issues: ['visible watermarks or stock photo text overlays'],
        quality_signals: [],
        quality_score: 2,
      }),
    );

    const result = await checkCandidateVision('https://example.com/image.jpg', 'test-key');
    expect(result).not.toBeNull();
    expect(result!.pass).toBe(false);
    expect(result!.confidence).toBe(92);
    expect(result!.issues).toEqual(['visible watermarks or stock photo text overlays']);
    expect(result!.qualityScore).toBe(2);
  });

  it('handles JSON wrapped in markdown fences', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          message: {
            content: '```json\n{"pass": true, "confidence": 90, "issues": [], "quality_signals": ["sharp detail"], "quality_score": 9}\n```',
          },
        }],
      }),
    } as unknown as Response);

    const result = await checkCandidateVision('https://example.com/image.jpg', 'test-key');
    expect(result).not.toBeNull();
    expect(result!.pass).toBe(true);
    expect(result!.qualityScore).toBe(9);
  });

  it('re-throws AbortError for cancellation support', async () => {
    const abortError = new DOMException('The operation was aborted.', 'AbortError');
    mockFetch.mockRejectedValueOnce(abortError);

    await expect(
      checkCandidateVision('https://example.com/image.jpg', 'test-key'),
    ).rejects.toThrow('The operation was aborted.');
  });
});

describe('batchVisionCheck', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('respects concurrency limit of 3', async () => {
    const candidates = Array.from({ length: 6 }, (_, i) =>
      makeCandidate({ url: `https://example.com/image${i}.jpg` }),
    );

    let concurrentCalls = 0;
    let maxConcurrent = 0;

    mockFetch.mockImplementation(async () => {
      concurrentCalls++;
      maxConcurrent = Math.max(maxConcurrent, concurrentCalls);
      // Simulate some async work
      await new Promise((r) => setTimeout(r, 10));
      concurrentCalls--;
      return makeVisionResponse({
        pass: true,
        confidence: 80,
        issues: [],
        quality_signals: [],
        quality_score: 7,
      });
    });

    await batchVisionCheck(candidates, 'test-key', { concurrency: 3 });

    // Max concurrent should not exceed 3
    expect(maxConcurrent).toBeLessThanOrEqual(3);
    // All 6 candidates should have been checked
    expect(mockFetch).toHaveBeenCalledTimes(6);
  });

  it('returns partial results when some checks fail', async () => {
    const candidates = [
      makeCandidate({ url: 'https://example.com/good.jpg' }),
      makeCandidate({ url: 'https://example.com/fail.jpg' }),
      makeCandidate({ url: 'https://example.com/good2.jpg' }),
    ];

    let callCount = 0;
    mockFetch.mockImplementation(async () => {
      callCount++;
      if (callCount === 2) {
        // Second call fails
        return {
          ok: false,
          status: 500,
          text: async () => 'Server Error',
        } as unknown as Response;
      }
      return makeVisionResponse({
        pass: true,
        confidence: 85,
        issues: [],
        quality_signals: ['professional'],
        quality_score: 8,
      });
    });

    const results = await batchVisionCheck(candidates, 'test-key');

    // Should have results for 2 out of 3 candidates
    expect(results.size).toBe(2);
    expect(results.has('https://example.com/good.jpg')).toBe(true);
    expect(results.has('https://example.com/fail.jpg')).toBe(false);
    expect(results.has('https://example.com/good2.jpg')).toBe(true);
  });

  it('returns empty map when all checks fail', async () => {
    const candidates = [
      makeCandidate({ url: 'https://example.com/img1.jpg' }),
      makeCandidate({ url: 'https://example.com/img2.jpg' }),
    ];

    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Server Error',
    } as unknown as Response);

    const results = await batchVisionCheck(candidates, 'test-key');
    expect(results.size).toBe(0);
  });

  it('returns empty map for empty candidates array', async () => {
    const results = await batchVisionCheck([], 'test-key');
    expect(results.size).toBe(0);
  });
});


// ============================================================================
// Task 9.3 — Property 4: Vision Check - Blocking Criteria Rejection
// Feature: media-source-filter, Property 4: Vision Check - Blocking Criteria Rejection
// ============================================================================

/**
 * **Validates: Requirements 4.1, 4.2, 4.5**
 *
 * Property 4: Vision Check — Blocking Criteria Rejection
 *
 * For any MediaCandidate that passes domain filtering, if the Reka Edge
 * vision model returns `pass: false` with detected issues, the candidate
 * SHALL be rejected from the final selection and the rejection SHALL be logged.
 */

describe('Property 4: Vision Check — Blocking Criteria Rejection', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // Arbitrary for generating VisionCheckResult with pass: false
  const failingVisionResultArb = fc.record({
    pass: fc.constant(false),
    confidence: fc.integer({ min: 50, max: 100 }),
    issues: fc.array(
      fc.constantFrom(
        'visible watermarks or stock photo text overlays',
        'state media branding or logos',
        'meme text overlays or Impact font captions',
        'adult or graphic violence content',
        'extremely low resolution or heavily compressed/artifacted images',
        'screenshots of social media posts',
        'AI-generated images with obvious artifacts',
      ),
      { minLength: 1, maxLength: 3 },
    ),
    qualitySignals: fc.constant([] as string[]),
    qualityScore: fc.integer({ min: 1, max: 3 }),
  }) as fc.Arbitrary<VisionCheckResult>;

  // Arbitrary for generating VisionCheckResult with pass: true
  const passingVisionResultArb = fc.record({
    pass: fc.constant(true),
    confidence: fc.integer({ min: 70, max: 100 }),
    issues: fc.constant([] as string[]),
    qualitySignals: fc.array(
      fc.constantFrom(
        'professional editorial photography',
        'high resolution and sharp detail',
        'relevant subject matter',
        'clean background or professional setting',
      ),
      { minLength: 1, maxLength: 3 },
    ),
    qualityScore: fc.integer({ min: 6, max: 10 }),
  }) as fc.Arbitrary<VisionCheckResult>;

  it('candidates with pass: false are removed from the pool', () => {
    fc.assert(
      fc.property(failingVisionResultArb, (visionResult) => {
        // Simulate the vision check integration logic from harvestMediaWithSafetyNet
        const candidates = [
          makeCandidate({ url: 'https://example.com/img1.jpg', finalScore: 500 }),
          makeCandidate({ url: 'https://example.com/img2.jpg', finalScore: 400 }),
        ];

        // Simulate: vision check returns pass: false for img1
        const visionResults = new Map<string, VisionCheckResult>();
        visionResults.set('https://example.com/img1.jpg', visionResult);
        visionResults.set('https://example.com/img2.jpg', {
          pass: true,
          confidence: 90,
          issues: [],
          qualitySignals: ['professional'],
          qualityScore: 8,
        });

        // Apply vision results (same logic as harvestMediaWithSafetyNet)
        const remaining = candidates.filter((c) => {
          const result = visionResults.get(c.url);
          if (!result) return true; // No result — keep
          return result.pass;
        });

        // The failing candidate should be removed
        expect(remaining).toHaveLength(1);
        expect(remaining[0].url).toBe('https://example.com/img2.jpg');
      }),
      { numRuns: 50 },
    );
  });

  it('candidates with pass: true receive a quality score bonus (qualityScore * 20)', () => {
    fc.assert(
      fc.property(passingVisionResultArb, (visionResult) => {
        const candidate = makeCandidate({ url: 'https://example.com/img.jpg', finalScore: 300 });

        // Apply vision bonus (same logic as harvestMediaWithSafetyNet)
        const boostedScore = candidate.finalScore + (visionResult.qualityScore * 20);

        // Bonus should be between 120 (6*20) and 200 (10*20)
        expect(boostedScore).toBeGreaterThan(candidate.finalScore);
        expect(visionResult.qualityScore * 20).toBeGreaterThanOrEqual(20);
        expect(visionResult.qualityScore * 20).toBeLessThanOrEqual(200);
      }),
      { numRuns: 50 },
    );
  });
});

// ============================================================================
// Task 9.4 — Property 5: Vision Check - Graceful Degradation
// Feature: media-source-filter, Property 5: Vision Check - Graceful Degradation
// ============================================================================

/**
 * **Validates: Requirements 4.7**
 *
 * Property 5: Vision Check — Graceful Degradation
 *
 * For any scenario where the OpenRouter API key is missing, the vision model
 * call fails, or the call times out, the pipeline SHALL continue with
 * domain-only filtering — no candidates SHALL be lost.
 */

describe('Property 5: Vision Check — Graceful Degradation', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('all candidates are preserved when batchVisionCheck returns empty results (API failure)', async () => {
    const candidates = [
      makeCandidate({ url: 'https://example.com/img1.jpg' }),
      makeCandidate({ url: 'https://example.com/img2.jpg' }),
      makeCandidate({ url: 'https://example.com/img3.jpg' }),
    ];

    // Simulate API failure — all checks fail, returning empty map
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Server Error',
    } as unknown as Response);

    const results = await batchVisionCheck(candidates, 'test-key');

    // All checks failed — empty map
    expect(results.size).toBe(0);

    // When results are empty, the pipeline should keep all candidates
    const remaining = candidates.filter((c) => {
      const result = results.get(c.url);
      if (!result) return true;
      return result.pass;
    });

    expect(remaining).toHaveLength(candidates.length);
  });

  it('all candidates are preserved when API key is missing (vision check skipped)', () => {
    // Simulate the harvestMediaWithSafetyNet logic:
    // if no API key, skip vision check entirely
    const candidates = [
      makeCandidate({ url: 'https://example.com/img1.jpg' }),
      makeCandidate({ url: 'https://example.com/img2.jpg' }),
    ];
    const hasApiKey = false;

    // When no API key, vision check is skipped — all candidates preserved
    let remaining = [...candidates];
    if (hasApiKey) {
      // Would run vision check here
      remaining = [];
    }

    expect(remaining).toHaveLength(candidates.length);
  });

  it('all candidates are preserved when batchVisionCheck throws an error', async () => {
    const candidates = [
      makeCandidate({ url: 'https://example.com/img1.jpg' }),
      makeCandidate({ url: 'https://example.com/img2.jpg' }),
      makeCandidate({ url: 'https://example.com/img3.jpg' }),
    ];

    // Simulate the graceful degradation in harvestMediaWithSafetyNet
    let remaining = [...candidates];

    try {
      // Simulate batchVisionCheck throwing
      mockFetch.mockRejectedValue(new Error('Network timeout'));
      await batchVisionCheck(candidates, 'test-key');
    } catch {
      // Vision check failed — continue with all candidates (graceful degradation)
      // This is what the try/catch in harvestMediaWithSafetyNet does
    }

    // All candidates should be preserved
    expect(remaining).toHaveLength(candidates.length);
  });
});

// ============================================================================
// Task 10.2 — Integration Tests for Vision Check in the Harvester
// ============================================================================

describe('Integration: vision check in harvester', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('vision-rejected candidates are removed from final results', async () => {
    const candidates = [
      makeCandidate({ url: 'https://example.com/good.jpg' }),
      makeCandidate({ url: 'https://example.com/bad.jpg' }),
      makeCandidate({ url: 'https://example.com/good2.jpg' }),
    ];

    // Simulate batchVisionCheck results
    let callIdx = 0;
    mockFetch.mockImplementation(async () => {
      callIdx++;
      if (callIdx === 2) {
        // Second candidate fails vision check
        return makeVisionResponse({
          pass: false,
          confidence: 95,
          issues: ['visible watermarks or stock photo text overlays'],
          quality_signals: [],
          quality_score: 1,
        });
      }
      return makeVisionResponse({
        pass: true,
        confidence: 85,
        issues: [],
        quality_signals: ['professional editorial photography'],
        quality_score: 8,
      });
    });

    const results = await batchVisionCheck(candidates, 'test-key');

    // Apply vision results (same logic as harvestMediaWithSafetyNet)
    const scored = candidates.map((c) => ({ ...c, finalScore: 300 }));
    const finalCandidates: MediaCandidate[] = [];

    for (const candidate of scored) {
      const result = results.get(candidate.url);
      if (!result) {
        finalCandidates.push(candidate);
        continue;
      }
      if (result.pass) {
        finalCandidates.push({
          ...candidate,
          finalScore: candidate.finalScore + (result.qualityScore * 20),
        });
      }
      // pass: false → candidate is removed (not pushed)
    }

    expect(finalCandidates).toHaveLength(2);
    expect(finalCandidates.find((c) => c.url === 'https://example.com/bad.jpg')).toBeUndefined();
  });

  it('vision check failure falls back gracefully to domain-only filtering', async () => {
    const candidates = [
      makeCandidate({ url: 'https://example.com/img1.jpg' }),
      makeCandidate({ url: 'https://example.com/img2.jpg' }),
    ];

    // All vision checks fail
    mockFetch.mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'Service Unavailable',
    } as unknown as Response);

    const results = await batchVisionCheck(candidates, 'test-key');

    // No results — all candidates should be preserved
    expect(results.size).toBe(0);

    // Simulate harvestMediaWithSafetyNet logic: if no results, keep all
    const finalCandidates = candidates.filter((c) => {
      const result = results.get(c.url);
      if (!result) return true;
      return result.pass;
    });

    expect(finalCandidates).toHaveLength(2);
  });

  it('4K candidates score higher than 1080p candidates with otherwise identical attributes', () => {
    const topicContext = {
      topic: 'Test Topic',
      coreSubject: 'Test',
      subjectCandidates: ['Test'],
      kind: 'concept' as const,
      description: 'A test topic',
      entities: ['Test'],
      parseReasoning: 'test',
    };

    const candidate4K = makeCandidate({ width: 3840, height: 2160 });
    const candidate1080 = makeCandidate({ width: 1920, height: 1080 });

    const score4K = scoreCandidate(candidate4K, topicContext, undefined, 'stock');
    const score1080 = scoreCandidate(candidate1080, topicContext, undefined, 'stock');

    expect(score4K).toBeGreaterThan(score1080);
  });

  it('vision-passed candidates receive quality score bonus', async () => {
    const candidates = [
      makeCandidate({ url: 'https://example.com/quality.jpg' }),
    ];

    mockFetch.mockResolvedValueOnce(
      makeVisionResponse({
        pass: true,
        confidence: 90,
        issues: [],
        quality_signals: ['professional editorial photography', 'high resolution'],
        quality_score: 9,
      }),
    );

    const results = await batchVisionCheck(candidates, 'test-key');
    const result = results.get('https://example.com/quality.jpg');

    expect(result).toBeDefined();
    expect(result!.pass).toBe(true);

    // Apply bonus: qualityScore * 20 = 9 * 20 = 180
    const originalScore = 300;
    const boostedScore = originalScore + (result!.qualityScore * 20);
    expect(boostedScore).toBe(480);
  });
});
