/**
 * Unit tests for Narration Audio Export service.
 *
 * Tests exportNarrationClip, validateNarrationTiming, and calculateCumulativeOffsets.
 * Requirements: 9.1, 9.2, 9.3, 9.4
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  exportNarrationClip,
  validateNarrationTiming,
  calculateCumulativeOffsets,
  resetExportedClips,
  getExportedClips,
  type AudioExportResult,
} from '../audioExport';

// Mock URL.createObjectURL
const mockCreateObjectURL = vi.fn();
globalThis.URL.createObjectURL = mockCreateObjectURL;

describe('audioExport', () => {
  beforeEach(() => {
    resetExportedClips();
    mockCreateObjectURL.mockReset();
    mockCreateObjectURL.mockReturnValue('blob:mock-url');
  });

  describe('exportNarrationClip', () => {
    it('should export a WAV clip with correct metadata', () => {
      const blob = new Blob(['x'.repeat(88_200)], { type: 'audio/wav' });
      mockCreateObjectURL.mockReturnValue('blob:wav-clip-1');

      const result = exportNarrationClip(blob, 'segment-1');

      expect(result.blobUrl).toBe('blob:wav-clip-1');
      expect(result.segmentId).toBe('segment-1');
      expect(result.format).toBe('wav');
      expect(result.duration).toBeCloseTo(1.0, 1);
      expect(result.startOffset).toBe(0);
    });

    it('should export an MP3 clip with correct format detection', () => {
      const blob = new Blob(['x'.repeat(16_000)], { type: 'audio/mpeg' });
      mockCreateObjectURL.mockReturnValue('blob:mp3-clip-1');

      const result = exportNarrationClip(blob, 'segment-2');

      expect(result.format).toBe('mp3');
      expect(result.duration).toBeCloseTo(1.0, 1);
    });

    it('should detect mp3 format from audio/mp3 MIME type', () => {
      const blob = new Blob(['x'.repeat(16_000)], { type: 'audio/mp3' });

      const result = exportNarrationClip(blob, 'segment-3');

      expect(result.format).toBe('mp3');
    });

    it('should calculate cumulative start offsets for sequential clips', () => {
      // First clip: ~1 second WAV
      const blob1 = new Blob(['x'.repeat(88_200)], { type: 'audio/wav' });
      mockCreateObjectURL.mockReturnValueOnce('blob:clip-1');
      const result1 = exportNarrationClip(blob1, 'seg-1');

      // Second clip: ~2 seconds WAV
      const blob2 = new Blob(['x'.repeat(176_400)], { type: 'audio/wav' });
      mockCreateObjectURL.mockReturnValueOnce('blob:clip-2');
      const result2 = exportNarrationClip(blob2, 'seg-2');

      // Third clip
      const blob3 = new Blob(['x'.repeat(88_200)], { type: 'audio/wav' });
      mockCreateObjectURL.mockReturnValueOnce('blob:clip-3');
      const result3 = exportNarrationClip(blob3, 'seg-3');

      expect(result1.startOffset).toBe(0);
      expect(result2.startOffset).toBeCloseTo(1.0, 1);
      expect(result3.startOffset).toBeCloseTo(3.0, 1);
    });

    it('should handle empty blob with zero duration', () => {
      const blob = new Blob([], { type: 'audio/wav' });
      mockCreateObjectURL.mockReturnValue('blob:empty');

      const result = exportNarrationClip(blob, 'seg-empty');

      expect(result.duration).toBe(0);
      expect(result.startOffset).toBe(0);
    });

    it('should store clips in internal state', () => {
      const blob = new Blob(['x'.repeat(88_200)], { type: 'audio/wav' });
      exportNarrationClip(blob, 'seg-1');
      exportNarrationClip(blob, 'seg-2');

      const clips = getExportedClips();
      expect(clips).toHaveLength(2);
      expect(clips[0].segmentId).toBe('seg-1');
      expect(clips[1].segmentId).toBe('seg-2');
    });

    it('should reset exported clips', () => {
      const blob = new Blob(['x'.repeat(88_200)], { type: 'audio/wav' });
      exportNarrationClip(blob, 'seg-1');

      resetExportedClips();

      expect(getExportedClips()).toHaveLength(0);
    });
  });

  describe('calculateCumulativeOffsets', () => {
    it('should recalculate start offsets from clip durations', () => {
      const clips: AudioExportResult[] = [
        { blobUrl: 'blob:1', duration: 2.5, segmentId: 'a', startOffset: 0, format: 'wav' },
        { blobUrl: 'blob:2', duration: 3.0, segmentId: 'b', startOffset: 0, format: 'wav' },
        { blobUrl: 'blob:3', duration: 1.5, segmentId: 'c', startOffset: 0, format: 'mp3' },
      ];

      const result = calculateCumulativeOffsets(clips);

      expect(result[0].startOffset).toBe(0);
      expect(result[1].startOffset).toBe(2.5);
      expect(result[2].startOffset).toBe(5.5);
    });

    it('should handle empty clips array', () => {
      const result = calculateCumulativeOffsets([]);
      expect(result).toEqual([]);
    });

    it('should handle single clip', () => {
      const clips: AudioExportResult[] = [
        { blobUrl: 'blob:1', duration: 5.0, segmentId: 'a', startOffset: 99, format: 'wav' },
      ];

      const result = calculateCumulativeOffsets(clips);

      expect(result[0].startOffset).toBe(0);
    });
  });

  describe('validateNarrationTiming', () => {
    it('should return withinTolerance=true when total is exactly at target', () => {
      const clips: AudioExportResult[] = [
        { blobUrl: 'blob:1', duration: 30, segmentId: 'a', startOffset: 0, format: 'wav' },
        { blobUrl: 'blob:2', duration: 30, segmentId: 'b', startOffset: 30, format: 'wav' },
      ];

      const result = validateNarrationTiming(clips, 60);

      expect(result.withinTolerance).toBe(true);
      expect(result.totalDuration).toBe(60);
      expect(result.overagePercent).toBe(0);
      expect(result.suggestion).toBeUndefined();
    });

    it('should return withinTolerance=true at exactly +20% boundary', () => {
      const clips: AudioExportResult[] = [
        { blobUrl: 'blob:1', duration: 72, segmentId: 'a', startOffset: 0, format: 'wav' },
      ];

      const result = validateNarrationTiming(clips, 60);

      expect(result.withinTolerance).toBe(true);
      expect(result.overagePercent).toBe(20);
    });

    it('should return withinTolerance=true at exactly -20% boundary', () => {
      const clips: AudioExportResult[] = [
        { blobUrl: 'blob:1', duration: 48, segmentId: 'a', startOffset: 0, format: 'wav' },
      ];

      const result = validateNarrationTiming(clips, 60);

      expect(result.withinTolerance).toBe(true);
      expect(result.overagePercent).toBe(-20);
    });

    it('should return withinTolerance=false when exceeding +20%', () => {
      const clips: AudioExportResult[] = [
        { blobUrl: 'blob:1', duration: 80, segmentId: 'a', startOffset: 0, format: 'wav' },
      ];

      const result = validateNarrationTiming(clips, 60);

      expect(result.withinTolerance).toBe(false);
      expect(result.overagePercent).toBeCloseTo(33.33, 1);
      expect(result.suggestion).toBeDefined();
      expect(result.suggestion).toContain('exceeds');
    });

    it('should return withinTolerance=false when below -20%', () => {
      const clips: AudioExportResult[] = [
        { blobUrl: 'blob:1', duration: 20, segmentId: 'a', startOffset: 0, format: 'wav' },
      ];

      const result = validateNarrationTiming(clips, 60);

      expect(result.withinTolerance).toBe(false);
      expect(result.overagePercent).toBeCloseTo(-66.67, 1);
      expect(result.suggestion).toBeUndefined(); // suggestion only for exceeding
    });

    it('should provide suggestion only when exceeding by >20%', () => {
      // Exactly at +20% — no suggestion
      const clipsAt20: AudioExportResult[] = [
        { blobUrl: 'blob:1', duration: 72, segmentId: 'a', startOffset: 0, format: 'wav' },
      ];
      const resultAt20 = validateNarrationTiming(clipsAt20, 60);
      expect(resultAt20.suggestion).toBeUndefined();

      // At +25% — should have suggestion
      const clipsOver: AudioExportResult[] = [
        { blobUrl: 'blob:1', duration: 75, segmentId: 'a', startOffset: 0, format: 'wav' },
      ];
      const resultOver = validateNarrationTiming(clipsOver, 60);
      expect(resultOver.suggestion).toBeDefined();
      expect(resultOver.suggestion).toContain('removing or shortening');
    });

    it('should handle empty clips array', () => {
      const result = validateNarrationTiming([], 60);

      expect(result.totalDuration).toBe(0);
      expect(result.withinTolerance).toBe(false);
      expect(result.overagePercent).toBe(-100);
    });

    it('should handle zero target duration', () => {
      const clips: AudioExportResult[] = [
        { blobUrl: 'blob:1', duration: 10, segmentId: 'a', startOffset: 0, format: 'wav' },
      ];

      const result = validateNarrationTiming(clips, 0);

      expect(result.withinTolerance).toBe(false);
      expect(result.suggestion).toBeDefined();
    });

    it('should sum durations from multiple clips', () => {
      const clips: AudioExportResult[] = [
        { blobUrl: 'blob:1', duration: 10, segmentId: 'a', startOffset: 0, format: 'wav' },
        { blobUrl: 'blob:2', duration: 15, segmentId: 'b', startOffset: 10, format: 'wav' },
        { blobUrl: 'blob:3', duration: 20, segmentId: 'c', startOffset: 25, format: 'mp3' },
        { blobUrl: 'blob:4', duration: 15, segmentId: 'd', startOffset: 45, format: 'wav' },
      ];

      const result = validateNarrationTiming(clips, 60);

      expect(result.totalDuration).toBe(60);
      expect(result.withinTolerance).toBe(true);
    });
  });
});
