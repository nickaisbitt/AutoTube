/**
 * Pure helper utilities for caption rendering.
 * Kept in a separate module so they can be unit-tested without a canvas environment.
 */

// ── Requirement 4.1: Technical product name keywords ────────────────────────
export const TECHNICAL_LABEL_KEYWORDS: string[] = [
  "Isaac Sim",
  "Omniverse",
  "CUDA",
  "Drive",
  "Jetson",
  "DGX",
  "NIM",
  "Blackwell",
  "Hopper",
  "H100",
];

// ── Requirement 5.1: Chart / graph keywords ──────────────────────────────────
export const CHART_KEYWORDS: string[] = [
  "chart",
  "graph",
  "revenue",
  "stock",
  "salary",
  "growth",
  "market cap",
];

/**
 * Computes the average HSL saturation of an image by sampling a 32×32 grid of pixels.
 *
 * Implements Requirement 3.1: sample every Math.floor(width/32)-th pixel in both axes,
 * convert each RGB sample to HSL, and return the mean S value in [0, 1].
 *
 * @param data   Raw RGBA pixel data from ImageData.data (Uint8ClampedArray).
 * @param width  Image width in pixels.
 * @param height Image height in pixels.
 * @returns      Average saturation in [0, 1].
 */
export function computeSaturationScore(
  data: Uint8ClampedArray,
  width: number,
  height: number
): number {
  const stepX = Math.max(1, Math.floor(width / 32));
  const stepY = Math.max(1, Math.floor(height / 32));

  let total = 0;
  let count = 0;

  for (let y = 0; y < height; y += stepY) {
    for (let x = 0; x < width; x += stepX) {
      const idx = (y * width + x) * 4;
      const r = data[idx] / 255;
      const g = data[idx + 1] / 255;
      const b = data[idx + 2] / 255;

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const l = (max + min) / 2;

      let s = 0;
      if (max !== min) {
        if (l < 0.5) {
          s = (max - min) / (max + min);
        } else {
          s = (max - min) / (2 - max - min);
        }
      }

      total += s;
      count++;
    }
  }

  return count === 0 ? 0 : total / count;
}

/**
 * Computes the adaptive CSS filter string for a given saturation score.
 *
 * Implements Requirements 3.2–3.4:
 *   - score > 0.75  → desaturate (reduce saturation toward 1.0), clamped to [0.85, 1.12]
 *   - score < 0.35  → boost saturation, clamped to [1.12, 1.30]
 *   - otherwise     → default filter unchanged
 *
 * @param score  Saturation score in [0, 1] from computeSaturationScore.
 * @returns      Full CSS filter string.
 */
export function computeAdaptiveFilter(score: number): string {
  const DEFAULT_FILTER = "saturate(1.15) contrast(1.12) brightness(1.08)";

  let saturation: number;

  if (score > 0.75) {
    // Requirement 3.2: desaturation correction
    const raw = 1.0 + (1.15 - 1.0) * (1 - (score - 0.75) / 0.25);
    saturation = Math.min(1.15, Math.max(0.88, raw));
  } else if (score < 0.35) {
    // Requirement 3.3: saturation boost
    const raw = 1.15 + (0.35 - score) * 0.4;
    saturation = Math.min(1.33, Math.max(1.15, raw));
  } else {
    // Requirement 3.4: default band [0.35, 0.75]
    return DEFAULT_FILTER;
  }

  return `saturate(${saturation.toFixed(4)}) contrast(1.12) brightness(1.08)`;
}

/**
 * Computes the sliding-window subset of words to display as a caption at a given
 * playback progress within a segment.
 *
 * Algorithm:
 *   wordIndex = Math.max(0, Math.floor(progress * words.length) - 1)
 *   start     = Math.max(0, wordIndex - 6)
 *   end       = Math.min(words.length, start + 12)
 *   if end - start < 12 && start > 0 → clamp: start = Math.max(0, end - 12)
 *   return words.slice(start, end)
 *
 * @param words    The word array produced by splitting the current segment's narration.
 * @param progress A value in [0, 1] representing how far through the segment we are.
 * @returns        The subset of words to display (at most 12).
 */
export function computeCaptionWindow(words: string[], progress: number): string[] {
  if (words.length === 0) return [];

  const wordIndex = Math.max(0, Math.floor(progress * words.length) - 1);
  let start = Math.max(0, wordIndex - 6);
  const end = Math.min(words.length, start + 12);

  // Clamp start back if we're near the end and have fewer than 12 words in window
  if (end - start < 12 && start > 0) {
    start = Math.max(0, end - 12);
  }

  return words.slice(start, end);
}
