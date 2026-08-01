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
 * Returns the frame sample rate (target frames captured per second) for the
 * given quality preset.
 *
 * high → 24 fps, standard → 16 fps, draft → 12 fps.
 *
 * NOTE: This is only a *target*. The renderer captures one frame every
 * `frameInterval = round(fps / frameSampleRate)` source frames, so the actual
 * capture rate is `getEffectiveSampleRate(fps, frameSampleRate)` which can
 * differ from this value when the target does not divide the source fps evenly
 * (e.g. 24fps / 16 target → interval 2 → 12fps actual). Always use the
 * effective rate when telling ffmpeg / MediaRecorder how fast to play frames,
 * otherwise the video plays back too fast.
 */
export function getFrameSampleRate(quality: string): number {
  return quality === 'high' ? 24 : quality === 'standard' ? 16 : 12;
}

/**
 * Number of source frames to advance between captured frames.
 *
 * A frame is captured whenever `f % frameInterval === 0`, so the *actual*
 * capture rate is `fps / frameInterval`, which may not equal the requested
 * `frameSampleRate` because of rounding.
 */
export function getFrameInterval(fps: number, frameSampleRate: number): number {
  return Math.max(1, Math.round(fps / frameSampleRate));
}

/**
 * The real capture/playback rate (frames per second) implied by capturing one
 * frame every `getFrameInterval(fps, frameSampleRate)` source frames.
 *
 * This is the value that MUST be reported to /api/render-video and
 * MediaRecorder so playback speed matches the captured frames. Using the raw
 * `frameSampleRate` when it does not divide `fps` evenly makes the video play
 * back too fast (e.g. 16 requested vs 12 actual → ~33% too fast).
 */
export function getEffectiveSampleRate(fps: number, frameSampleRate: number): number {
  return fps / getFrameInterval(fps, frameSampleRate);
}
