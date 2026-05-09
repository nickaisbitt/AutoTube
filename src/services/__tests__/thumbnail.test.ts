/**
 * Unit tests for generateSplitScreenThumbnail
 *
 * Validates: Requirements 7.4, 7.7
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateSplitScreenThumbnail } from '../thumbnail';
import type { VideoProject, MediaAsset } from '../../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds a minimal VideoProject with one chart asset and one non-chart asset.
 */
function makeProject(): VideoProject {
  const chartAsset: MediaAsset = {
    id: 'asset-chart',
    segmentId: 'seg-1',
    type: 'image',
    url: 'https://example.com/chart.png',
    alt: 'revenue chart',
    source: 'test',
    concept: 'revenue chart',
    score: 0.9,
  };

  const portraitAsset: MediaAsset = {
    id: 'asset-portrait',
    segmentId: 'seg-2',
    type: 'image',
    url: 'https://example.com/portrait.png',
    alt: 'CEO portrait',
    source: 'test',
    concept: 'CEO portrait',
    score: 0.8,
  };

  return {
    id: 'proj-1',
    title: 'Test Project',
    topic: 'Test Topic',
    style: 'business_insider',
    targetDuration: 60,
    script: [],
    media: [chartAsset, portraitAsset],
    narration: [],
    version: 1,
    status: 'draft',
    createdAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Image mock helpers
// ---------------------------------------------------------------------------

/**
 * A mock Image class that auto-resolves onload after a microtask.
 * Simulates a successful image load with width=100, height=100.
 */
class MockImageSuccess {
  crossOrigin = '';
  referrerPolicy = '';
  decoding = '';
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  width = 100;
  height = 100;

  set src(_url: string) {
    setTimeout(() => this.onload?.(), 0);
  }
}

/**
 * A mock Image class that auto-rejects onerror after a microtask.
 * Simulates a failed image load.
 */
class MockImageFailure {
  crossOrigin = '';
  referrerPolicy = '';
  decoding = '';
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  width = 0;
  height = 0;

  set src(_url: string) {
    setTimeout(() => this.onerror?.(), 0);
  }
}

// ---------------------------------------------------------------------------
// Canvas mock
// ---------------------------------------------------------------------------

/**
 * Patches HTMLCanvasElement.prototype.toBlob to call the callback with a
 * real Blob of type image/png, since jsdom does not implement toBlob.
 */
function mockToBlob() {
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
    function (callback: BlobCallback) {
      callback(new Blob([], { type: 'image/png' }));
    },
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('generateSplitScreenThumbnail', () => {
  beforeEach(() => {
    mockToBlob();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Requirement 7.4 — split-screen layout resolves to a PNG Blob
  // -------------------------------------------------------------------------

  it('resolves to a Blob of type image/png when both assets load successfully (Requirement 7.4)', async () => {
    vi.stubGlobal('Image', MockImageSuccess);

    const project = makeProject();
    const blob = await generateSplitScreenThumbnail(project, 'Test Title');

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/png');
  });

  // -------------------------------------------------------------------------
  // Requirement 7.7 — fallback when images cannot be loaded
  // -------------------------------------------------------------------------

  it('falls back to generateThumbnail (returns a Blob) when loadImage rejects (Requirement 7.7)', async () => {
    vi.stubGlobal('Image', MockImageFailure);

    const project = makeProject();
    // Should not throw — must fall back gracefully
    const blob = await generateSplitScreenThumbnail(project, 'Test Title');

    expect(blob).toBeInstanceOf(Blob);
  });

  it('does not throw when loadImage rejects (Requirement 7.7)', async () => {
    vi.stubGlobal('Image', MockImageFailure);

    const project = makeProject();
    await expect(generateSplitScreenThumbnail(project, 'Test Title')).resolves.not.toThrow();
  });

  // -------------------------------------------------------------------------
  // Fallback when assets are missing
  // -------------------------------------------------------------------------

  it('falls back to generateThumbnail when no chart asset exists', async () => {
    vi.stubGlobal('Image', MockImageSuccess);

    const project = makeProject();
    // Remove the chart asset so no chart keyword matches
    project.media = project.media.filter(a => a.id !== 'asset-chart');

    const blob = await generateSplitScreenThumbnail(project, 'Test Title');

    expect(blob).toBeInstanceOf(Blob);
  });

  it('falls back to generateThumbnail when no portrait asset exists', async () => {
    vi.stubGlobal('Image', MockImageSuccess);

    const project = makeProject();
    // Remove the non-chart asset
    project.media = project.media.filter(a => a.id !== 'asset-portrait');

    const blob = await generateSplitScreenThumbnail(project, 'Test Title');

    expect(blob).toBeInstanceOf(Blob);
  });
});
