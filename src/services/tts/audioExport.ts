/**
 * Narration Audio Export Service
 *
 * Manages audio blob storage and timing metadata for the assembly step.
 * Exports narration clips as blob URLs with cumulative start offsets,
 * and validates total narration duration against the target video duration.
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4
 */

export interface AudioExportResult {
  /** Blob URL for playback/assembly */
  blobUrl: string;
  /** Duration in seconds */
  duration: number;
  /** Segment identifier */
  segmentId: string;
  /** Cumulative start time offset in seconds */
  startOffset: number;
  /** Audio format */
  format: 'wav' | 'mp3';
}

export interface NarrationTimingValidation {
  /** Sum of all clip durations */
  totalDuration: number;
  /** Target video duration */
  targetDuration: number;
  /** True iff totalDuration is within targetDuration ± 20% */
  withinTolerance: boolean;
  /** How much the total exceeds the target as a percentage (can be negative if under) */
  overagePercent: number;
  /** Suggestion when exceeding target by more than 20% */
  suggestion?: string;
}

/** Internal store of exported clips for cumulative offset calculation */
let _exportedClips: AudioExportResult[] = [];

/**
 * Reset the internal clip store. Useful between projects or for testing.
 */
export function resetExportedClips(): void {
  _exportedClips = [];
}

/**
 * Get all currently exported clips.
 */
export function getExportedClips(): AudioExportResult[] {
  return [..._exportedClips];
}

/**
 * Detect audio format from a Blob's MIME type.
 */
function detectFormat(blob: Blob): 'wav' | 'mp3' {
  const type = blob.type.toLowerCase();
  if (type.includes('mp3') || type.includes('mpeg')) {
    return 'mp3';
  }
  return 'wav';
}

/**
 * Estimate duration from blob size when actual duration is not available.
 * Uses approximate bitrates:
 * - WAV: 16-bit, 44.1kHz, mono = ~88.2 KB/s
 * - MP3: ~128 kbps = ~16 KB/s
 */
function estimateDurationFromBlob(blob: Blob, format: 'wav' | 'mp3'): number {
  const sizeBytes = blob.size;
  if (sizeBytes === 0) return 0;

  if (format === 'wav') {
    // 16-bit, 44.1kHz, mono ≈ 88,200 bytes/sec
    return sizeBytes / 88_200;
  }
  // MP3 at 128kbps ≈ 16,000 bytes/sec
  return sizeBytes / 16_000;
}

/**
 * Export a narration clip, storing it as a blob URL with timing metadata.
 *
 * Calculates the cumulative start offset based on previously exported clips.
 * The duration is estimated from the blob size and format.
 *
 * @param audioBlob - The audio Blob from TTS generation
 * @param segmentId - The segment identifier this clip belongs to
 * @returns AudioExportResult with blob URL, timing metadata, and format
 */
export function exportNarrationClip(audioBlob: Blob, segmentId: string): AudioExportResult {
  const format = detectFormat(audioBlob);
  const blobUrl = URL.createObjectURL(audioBlob);
  const duration = estimateDurationFromBlob(audioBlob, format);

  // Calculate cumulative start offset from existing clips
  const startOffset = _exportedClips.reduce((acc, clip) => acc + clip.duration, 0);

  const result: AudioExportResult = {
    blobUrl,
    duration: Math.round(duration * 100) / 100,
    segmentId,
    startOffset: Math.round(startOffset * 100) / 100,
    format,
  };

  _exportedClips.push(result);
  return result;
}

/**
 * Calculate cumulative start offsets for an array of clips.
 * Each clip's startOffset is the sum of all preceding clip durations.
 *
 * @param clips - Array of AudioExportResult clips
 * @returns New array with recalculated startOffset values
 */
export function calculateCumulativeOffsets(clips: AudioExportResult[]): AudioExportResult[] {
  let cumulative = 0;
  return clips.map((clip) => {
    const updated = { ...clip, startOffset: Math.round(cumulative * 100) / 100 };
    cumulative += clip.duration;
    return updated;
  });
}

/**
 * Validate that total narration duration falls within the target video duration ± 20%.
 *
 * Returns withinTolerance=true only when the total is within range.
 * Provides a suggestion when exceeding the target by more than 20%.
 *
 * @param clips - Array of exported narration clips
 * @param targetDuration - Target video duration in seconds
 * @returns NarrationTimingValidation with tolerance check and optional suggestion
 */
export function validateNarrationTiming(
  clips: AudioExportResult[],
  targetDuration: number,
): NarrationTimingValidation {
  const totalDuration = clips.reduce((acc, clip) => acc + clip.duration, 0);

  // Guard against zero/negative target
  if (targetDuration <= 0) {
    return {
      totalDuration: Math.round(totalDuration * 100) / 100,
      targetDuration,
      withinTolerance: false,
      overagePercent: totalDuration > 0 ? 100 : 0,
      suggestion: 'Invalid target duration. Please set a positive target duration.',
    };
  }

  const overagePercent = ((totalDuration - targetDuration) / targetDuration) * 100;
  const roundedOverage = Math.round(overagePercent * 100) / 100;

  // Within tolerance: total is within targetDuration ± 20%
  const lowerBound = targetDuration * 0.8;
  const upperBound = targetDuration * 1.2;
  const withinTolerance = totalDuration >= lowerBound && totalDuration <= upperBound;

  // Provide suggestion when exceeding by more than 20%
  let suggestion: string | undefined;
  if (overagePercent > 20) {
    const excessSeconds = Math.round(totalDuration - targetDuration);
    suggestion = `Total narration (${Math.round(totalDuration)}s) exceeds target (${Math.round(targetDuration)}s) by ${Math.round(overagePercent)}%. Consider removing or shortening segments to reduce duration by ~${excessSeconds}s.`;
  }

  return {
    totalDuration: Math.round(totalDuration * 100) / 100,
    targetDuration,
    withinTolerance,
    overagePercent: roundedOverage,
    suggestion,
  };
}
