/**
 * Unit tests for thumbnail helper functions: selectThumbnailBackground, truncateOverlayText
 *
 * Validates: Requirements 3.2, 3.5, 3.6
 */

import { describe, it, expect } from 'vitest';
import { selectThumbnailBackground, truncateOverlayText } from '../thumbnail';
import type { MediaAsset } from '../../types';

// ---------------------------------------------------------------------------
// Helper: build a minimal MediaAsset
// ---------------------------------------------------------------------------
function makeAsset(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: 'asset-1',
    segmentId: 'seg-1',
    type: 'image',
    url: 'https://example.com/image.jpg',
    alt: 'test image',
    source: 'test',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// selectThumbnailBackground
// ---------------------------------------------------------------------------

describe('selectThumbnailBackground', () => {
  it('returns the highest-scored non-fallback asset (Requirement 3.2)', () => {
    const assets: MediaAsset[] = [
      makeAsset({ id: 'a1', score: 0.5, isFallback: false }),
      makeAsset({ id: 'a2', score: 0.9, isFallback: false }),
      makeAsset({ id: 'a3', score: 0.7, isFallback: false }),
    ];
    const result = selectThumbnailBackground(assets);
    expect(result?.id).toBe('a2');
  });

  it('ignores fallback assets', () => {
    const assets: MediaAsset[] = [
      makeAsset({ id: 'a1', score: 0.9, isFallback: true }),
      makeAsset({ id: 'a2', score: 0.5, isFallback: false }),
    ];
    const result = selectThumbnailBackground(assets);
    expect(result?.id).toBe('a2');
  });

  it('returns undefined when all assets are fallback', () => {
    const assets: MediaAsset[] = [
      makeAsset({ id: 'a1', score: 0.9, isFallback: true }),
      makeAsset({ id: 'a2', score: 0.5, isFallback: true }),
    ];
    const result = selectThumbnailBackground(assets);
    expect(result).toBeUndefined();
  });

  it('returns undefined for an empty array', () => {
    const result = selectThumbnailBackground([]);
    expect(result).toBeUndefined();
  });

  it('treats assets without isFallback as non-fallback', () => {
    const assets: MediaAsset[] = [
      makeAsset({ id: 'a1', score: 0.8 }),
    ];
    const result = selectThumbnailBackground(assets);
    expect(result?.id).toBe('a1');
  });

  it('treats assets with undefined score as score 0', () => {
    const assets: MediaAsset[] = [
      makeAsset({ id: 'a1' }),
      makeAsset({ id: 'a2', score: 0.1 }),
    ];
    const result = selectThumbnailBackground(assets);
    expect(result?.id).toBe('a2');
  });
});

// ---------------------------------------------------------------------------
// truncateOverlayText
// ---------------------------------------------------------------------------

describe('truncateOverlayText', () => {
  it('returns text unchanged when within maxLength (Requirement 3.6)', () => {
    expect(truncateOverlayText('Hello World', 80)).toBe('Hello World');
  });

  it('returns text unchanged when exactly at maxLength', () => {
    const text = 'a'.repeat(80);
    expect(truncateOverlayText(text, 80)).toBe(text);
  });

  it('truncates and adds ellipsis when text exceeds maxLength', () => {
    const text = 'a'.repeat(100);
    const result = truncateOverlayText(text, 80);
    expect(result.length).toBe(80);
    expect(result.endsWith('…')).toBe(true);
  });

  it('truncates to exactly maxLength characters', () => {
    const text = 'This is a very long text that definitely exceeds the maximum length of eighty characters allowed for overlay';
    const result = truncateOverlayText(text, 80);
    expect(result.length).toBe(80);
  });

  it('handles empty string', () => {
    expect(truncateOverlayText('', 80)).toBe('');
  });

  it('handles maxLength of 1', () => {
    const result = truncateOverlayText('Hello', 1);
    expect(result.length).toBe(1);
    expect(result).toBe('…');
  });
});
