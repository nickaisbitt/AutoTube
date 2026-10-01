/**
 * Unit Tests — Watermark Vision Check Integration & Fallback Chain
 *
 * Feature: blind-review-quality-fixes, Task 1.3
 * Validates: Requirements 1.3, 1.4
 *
 * Tests that:
 * - Vision check is invoked on top 3 candidates when OpenRouter key is available
 * - Candidates rejected by vision check are removed from results
 * - When all candidates are rejected, the fallback chain tries Wikimedia/Unsplash
 * - Procedural background (Picsum) is used as last resort
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MediaCandidate } from '../media';
import type { TopicContext, AppConfig } from '../../types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../utils/fetchWithTimeout', () => ({
  fetchWithTimeout: vi.fn(),
}));

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

vi.mock('../visionCheck', () => ({
  batchVisionCheck: vi.fn(),
  checkCandidateVision: vi.fn(),
}));

vi.mock('../sourceProviders', () => ({
  queryAllProviders: vi.fn(),
}));

vi.mock('../fullResResolver', () => ({
  batchResolve: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock('../qualityScorer', () => ({
  batchScoreQuality: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock('../mediaCache', () => ({
  MediaCache: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('../focalCropper', () => ({
  focalCrop: vi.fn(),
  needsCropping: vi.fn().mockReturnValue(false),
}));

import { fetchWithTimeout } from '../../utils/fetchWithTimeout';
import { batchVisionCheck } from '../visionCheck';
import { queryAllProviders } from '../sourceProviders';
import { resetUsedUrlsMap, sourceSegmentMedia } from '../media';

const mockFetch = vi.mocked(fetchWithTimeout);
const mockBatchVisionCheck = vi.mocked(batchVisionCheck);
const mockQueryAllProviders = vi.mocked(queryAllProviders);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCandidate(overrides: Partial<MediaCandidate> = {}): MediaCandidate {
  return {
    url: 'https://example.com/image.jpg',
    source: 'DuckDuckGo · example.com',
    alt: 'test topic image',
    baseScore: 200,
    query: 'test topic',
    finalScore: 0,
    type: 'image',
    width: 1920,
    height: 1080,
    ...overrides,
  };
}

const baseTopicContext: TopicContext = {
  topic: 'Test Topic',
  coreSubject: 'Test',
  subjectCandidates: ['Test'],
  kind: 'concept',
  description: 'A test topic',
  entities: ['Entity1', 'Entity2'],
  parseReasoning: 'Test reasoning',
  thumbnailUrl: 'https://upload.wikimedia.org/hero.jpg',
};

const baseConfig: AppConfig = {
  openRouterKey: 'test-key-123',
  sourceType: 'stock',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Watermark Vision Check Integration (Req 1.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetUsedUrlsMap();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls batchVisionCheck on top 3 candidates when OpenRouter key is available', async () => {
    const candidates = [
      makeCandidate({ url: 'https://example.com/1.jpg', alt: 'test topic first' }),
      makeCandidate({ url: 'https://example.com/2.jpg', alt: 'test topic second' }),
      makeCandidate({ url: 'https://example.com/3.jpg', alt: 'test topic third' }),
      makeCandidate({ url: 'https://example.com/4.jpg', alt: 'test topic fourth' }),
    ];

    mockQueryAllProviders.mockResolvedValue(candidates);
    mockBatchVisionCheck.mockResolvedValue(new Map([
      ['https://example.com/1.jpg', { pass: true, confidence: 90, issues: [], qualitySignals: [], qualityScore: 8 }],
      ['https://example.com/2.jpg', { pass: true, confidence: 85, issues: [], qualitySignals: [], qualityScore: 7 }],
      ['https://example.com/3.jpg', { pass: true, confidence: 80, issues: [], qualitySignals: [], qualityScore: 6 }],
    ]));

    const segment = {
      id: 'seg-1',
      title: 'Test Topic',
      narration: 'This is a test topic narration about something.',
      duration: 10,
    } as any;

    const plan = {
      visualAction: 'test action',
      visualConcept: 'test concept',
      queries: ['test topic'],
      shots: [{ concept: 'test', queries: ['test topic'], vibe: 'neutral' }],
    } as any;

    await sourceSegmentMedia(segment, plan, baseTopicContext, new Set(), 0, baseConfig);

    expect(mockBatchVisionCheck).toHaveBeenCalled();
    const [calledCandidates, calledKey] = mockBatchVisionCheck.mock.calls[0];
    expect(calledKey).toBe('test-key-123');
    expect(calledCandidates.length).toBeLessThanOrEqual(3);
    expect(calledCandidates.length).toBe(3);
  });

  it('rejects candidates where vision model identifies a watermark', async () => {
    const candidates = [
      makeCandidate({ url: 'https://example.com/watermarked.jpg', alt: 'test topic watermarked', baseScore: 300 }),
      makeCandidate({ url: 'https://example.com/clean.jpg', alt: 'test topic clean', baseScore: 200 }),
      makeCandidate({ url: 'https://example.com/also-clean.jpg', alt: 'test topic also clean', baseScore: 150 }),
    ];

    mockQueryAllProviders.mockResolvedValue(candidates);
    mockBatchVisionCheck.mockResolvedValue(new Map([
      ['https://example.com/watermarked.jpg', { pass: false, confidence: 95, issues: ['visible watermark overlay'], qualitySignals: [], qualityScore: 2 }],
      ['https://example.com/clean.jpg', { pass: true, confidence: 90, issues: [], qualitySignals: ['professional'], qualityScore: 8 }],
      ['https://example.com/also-clean.jpg', { pass: true, confidence: 85, issues: [], qualitySignals: ['clean'], qualityScore: 7 }],
    ]));

    const segment = {
      id: 'seg-1',
      title: 'Test Topic',
      narration: 'This is a test topic narration.',
      duration: 10,
    } as any;

    const plan = {
      visualAction: 'test action',
      visualConcept: 'test concept',
      queries: ['test topic'],
      shots: [{ concept: 'test', queries: ['test topic'], vibe: 'neutral' }],
    } as any;

    const result = await sourceSegmentMedia(segment, plan, baseTopicContext, new Set(), 0, baseConfig);

    // The watermarked candidate should not be selected as the primary asset
    const selectedUrls = result.assets.map(a => a.url);
    expect(selectedUrls).not.toContain('https://example.com/watermarked.jpg');
  });

  it('does not call batchVisionCheck when OpenRouter key is not available', async () => {
    const candidates = [
      makeCandidate({ url: 'https://example.com/1.jpg', alt: 'test topic image' }),
    ];

    mockQueryAllProviders.mockResolvedValue(candidates);

    const configNoKey: AppConfig = { openRouterKey: '', sourceType: 'stock' };

    const segment = {
      id: 'seg-1',
      title: 'Test Topic',
      narration: 'This is a test topic narration.',
      duration: 10,
    } as any;

    const plan = {
      visualAction: 'test action',
      visualConcept: 'test concept',
      queries: ['test topic'],
      shots: [{ concept: 'test', queries: ['test topic'], vibe: 'neutral' }],
    } as any;

    await sourceSegmentMedia(segment, plan, baseTopicContext, new Set(), 0, configNoKey);

    expect(mockBatchVisionCheck).not.toHaveBeenCalled();
  });
});

describe('Watermark Fallback Chain (Req 1.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetUsedUrlsMap();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('tries Wikimedia/Unsplash when all top candidates are rejected by vision check', async () => {
    // All candidates from initial query will be rejected by vision check
    const candidates = [
      makeCandidate({ url: 'https://example.com/bad1.jpg', alt: 'test topic bad one', baseScore: 300 }),
      makeCandidate({ url: 'https://example.com/bad2.jpg', alt: 'test topic bad two', baseScore: 250 }),
      makeCandidate({ url: 'https://example.com/bad3.jpg', alt: 'test topic bad three', baseScore: 200 }),
    ];

    // First call returns watermarked candidates, subsequent calls return Wikimedia results
    let callCount = 0;
    mockQueryAllProviders.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) return candidates;
      // Subsequent calls (broadened query) return empty to force Wikimedia fallback
      return [];
    });

    // Vision check rejects all top 3
    mockBatchVisionCheck.mockResolvedValue(new Map([
      ['https://example.com/bad1.jpg', { pass: false, confidence: 95, issues: ['visible watermark'], qualitySignals: [], qualityScore: 1 }],
      ['https://example.com/bad2.jpg', { pass: false, confidence: 90, issues: ['stock photo text'], qualitySignals: [], qualityScore: 2 }],
      ['https://example.com/bad3.jpg', { pass: false, confidence: 88, issues: ['watermark overlay'], qualitySignals: [], qualityScore: 1 }],
    ]));

    // Mock the Wikimedia search (called directly in the fallback)
    mockFetch.mockImplementation(async (url: string) => {
      if (typeof url === 'string' && url.includes('commons.wikimedia.org')) {
        return {
          ok: true,
          json: async () => ({
            query: {
              pages: {
                '1': {
                  title: 'Test Topic Wikimedia',
                  imageinfo: [{ url: 'https://upload.wikimedia.org/test-topic.jpg', width: 1920, height: 1080 }],
                },
              },
            },
          }),
        } as unknown as Response;
      }
      return { ok: false, status: 404 } as unknown as Response;
    });

    const segment = {
      id: 'seg-1',
      title: 'Test Topic',
      narration: 'This is a test topic narration about something important.',
      duration: 10,
    } as any;

    const plan = {
      visualAction: 'test action',
      visualConcept: 'test concept',
      queries: ['test topic'],
      shots: [{ concept: 'test', queries: ['test topic'], vibe: 'neutral' }],
    } as any;

    const result = await sourceSegmentMedia(segment, plan, baseTopicContext, new Set(), 0, baseConfig);

    // Should have found some asset (either from Wikimedia fallback or Picsum)
    expect(result.assets.length).toBeGreaterThan(0);

    // The selected asset should NOT be one of the rejected watermarked ones
    const selectedUrls = result.assets.map(a => a.url);
    expect(selectedUrls).not.toContain('https://example.com/bad1.jpg');
    expect(selectedUrls).not.toContain('https://example.com/bad2.jpg');
    expect(selectedUrls).not.toContain('https://example.com/bad3.jpg');
  });

  it('falls back to procedural background (Picsum) when Wikimedia also fails', async () => {
    // All candidates rejected, Wikimedia returns nothing
    const candidates = [
      makeCandidate({ url: 'https://example.com/bad1.jpg', alt: 'test topic bad', baseScore: 300 }),
      makeCandidate({ url: 'https://example.com/bad2.jpg', alt: 'test topic bad two', baseScore: 250 }),
      makeCandidate({ url: 'https://example.com/bad3.jpg', alt: 'test topic bad three', baseScore: 200 }),
    ];

    // First call returns watermarked candidates, subsequent calls return empty
    let callCount = 0;
    mockQueryAllProviders.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) return candidates;
      return [];
    });

    // Vision check rejects all
    mockBatchVisionCheck.mockResolvedValue(new Map([
      ['https://example.com/bad1.jpg', { pass: false, confidence: 95, issues: ['watermark'], qualitySignals: [], qualityScore: 1 }],
      ['https://example.com/bad2.jpg', { pass: false, confidence: 90, issues: ['watermark'], qualitySignals: [], qualityScore: 1 }],
      ['https://example.com/bad3.jpg', { pass: false, confidence: 88, issues: ['watermark'], qualitySignals: [], qualityScore: 1 }],
    ]));

    // Wikimedia returns nothing
    mockFetch.mockImplementation(async () => {
      return { ok: false, status: 500 } as unknown as Response;
    });

    const segment = {
      id: 'seg-1',
      title: 'Test Topic',
      narration: 'This is a test topic narration.',
      duration: 10,
    } as any;

    const plan = {
      visualAction: 'test action',
      visualConcept: 'test concept',
      queries: ['test topic'],
      shots: [{ concept: 'test', queries: ['test topic'], vibe: 'neutral' }],
    } as any;

    const result = await sourceSegmentMedia(segment, plan, baseTopicContext, new Set(), 0, baseConfig);

    // Should still produce assets (from Picsum fallback or Wikipedia hero)
    expect(result.assets.length).toBeGreaterThan(0);

    // The asset should be from a fallback source (Picsum or Wikipedia)
    const asset = result.assets[0];
    const isFallbackSource = asset.source.includes('Picsum') ||
      asset.source.includes('Wikipedia') ||
      asset.source.includes('Wikimedia') ||
      asset.source.includes('Unsplash') ||
      asset.url.includes('picsum.photos') ||
      asset.url.includes('wikimedia.org');
    expect(isFallbackSource).toBe(true);
  });
});
