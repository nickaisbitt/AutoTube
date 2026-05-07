import type { ScriptSegment } from '../../types';

/** Visual style types for pattern breaks during video rendering (Requirement 10.7). */
export type VisualStyleType = 'b-roll' | 'kinetic-text' | 'diagram';

/**
 * Determines which visual style to use at a given point in a segment.
 *
 * - Intro and outro segments always return `'b-roll'` for visual consistency.
 * - Section and transition segments cycle through `['b-roll', 'kinetic-text', 'diagram']`
 *   every 7 seconds based on `frameTimeSec`.
 *
 * Requirements 10.1, 10.2, 10.3
 *
 * @param frameTimeSec   - Elapsed time within the segment (≥ 0).
 * @param segmentDurationSec - Total duration of the segment (> 0).
 * @param segmentType    - The segment's type (intro, section, transition, outro).
 * @returns The visual style to apply for the current frame.
 */
export function computeVisualStyle(
  frameTimeSec: number,
  _segmentDurationSec: number,
  segmentType: ScriptSegment['type'],
): VisualStyleType {
  const ROTATION_INTERVAL = 7; // seconds
  const STYLES: VisualStyleType[] = ['b-roll', 'kinetic-text', 'diagram'];

  if (segmentType === 'intro' || segmentType === 'outro') {
    return 'b-roll';
  }

  const styleIndex = Math.floor(frameTimeSec / ROTATION_INTERVAL) % STYLES.length;
  return STYLES[styleIndex];
}

/**
 * Returns the frame sample rate (frames captured per second) for the given
 * quality preset.
 *
 * Requirements 5.1, 5.2: draft → 3 fps, standard → 6 fps, high → 8 fps.
 */
export function getFrameSampleRate(quality: string): number {
  return quality === 'high' ? 8 : quality === 'standard' ? 6 : 3;
}
