// ============================================================================
// Motion Analyzer — Frame-to-Frame Difference for Video Clip Scoring
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MotionScore {
  /** Overall motion level 0 (static) to 1 (very high motion) */
  motionLevel: number;
  /** Average absolute pixel difference between frames */
  avgPixelDiff: number;
  /** Percentage of pixels that changed significantly */
  changePercent: number;
  /** Motion classification */
  classification: 'static' | 'low' | 'medium' | 'high';
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

/**
 * Analyzes motion level between two frames by computing average absolute
 * pixel difference. Both images must be the same dimensions.
 *
 * @param prevFrame - Previous frame ImageData or Uint8ClampedArray
 * @param currFrame - Current frame ImageData or Uint8ClampedArray
 * @param w - Frame width
 * @param h - Frame height
 * @returns MotionScore with level and classification
 */
export function analyzeMotion(
  prevFrame: Uint8ClampedArray,
  currFrame: Uint8ClampedArray,
  w: number,
  h: number,
): MotionScore {
  const totalPixels = w * h;
  if (totalPixels === 0) {
    return { motionLevel: 0, avgPixelDiff: 0, changePercent: 0, classification: 'static' };
  }

  let totalDiff = 0;
  let changedPixels = 0;
  const CHANGE_THRESHOLD = 25;

  for (let i = 0; i < prevFrame.length; i += 4) {
    const rDiff = Math.abs(prevFrame[i] - currFrame[i]);
    const gDiff = Math.abs(prevFrame[i + 1] - currFrame[i + 1]);
    const bDiff = Math.abs(prevFrame[i + 2] - currFrame[i + 2]);
    const avgDiff = (rDiff + gDiff + bDiff) / 3;
    totalDiff += avgDiff;
    if (avgDiff > CHANGE_THRESHOLD) changedPixels++;
  }

  const avgPixelDiff = totalDiff / totalPixels;
  const changePercent = changedPixels / totalPixels;

  // Normalize to 0-1 range (max expected diff ~80 per pixel for high motion)
  const motionLevel = Math.min(1, avgPixelDiff / 80);

  let classification: MotionScore['classification'];
  if (motionLevel < 0.05) classification = 'static';
  else if (motionLevel < 0.2) classification = 'low';
  else if (motionLevel < 0.5) classification = 'medium';
  else classification = 'high';

  return {
    motionLevel: Math.round(motionLevel * 100) / 100,
    avgPixelDiff: Math.round(avgPixelDiff * 100) / 100,
    changePercent: Math.round(changePercent * 10000) / 100,
    classification,
  };
}

/**
 * Scores a video clip candidate based on its motion level.
 * Returns a bonus/penalty to apply to the candidate's score.
 *
 * - High motion clips (action, movement): +30 bonus
 * - Medium motion: +10 bonus
 * - Low motion: 0
 * - Static clips: -20 penalty (may be boring for B-roll)
 */
export function scoreMotionBonus(motionLevel: number): number {
  if (motionLevel >= 0.5) return 30;
  if (motionLevel >= 0.2) return 10;
  if (motionLevel >= 0.05) return 0;
  return -20;
}
