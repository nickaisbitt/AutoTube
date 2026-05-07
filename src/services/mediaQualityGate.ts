// ============================================================================
// Media Quality Gate — Quality Thresholds, Cliché Detection & Procedural Fallback
// ============================================================================
//
// Extends the media scoring pipeline with quality gates that enforce minimum
// standards, reject cliché imagery, generate procedural backgrounds as fallback,
// and track video clip sourcing frequency.
//
// Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6

import type { MediaCandidate } from './media';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QualityGateConfig {
  /** Minimum composite score to accept a candidate outright (default: 100) */
  minCompositeScore: number;
  /** Score below which procedural fallback is triggered (default: 80) */
  minAcceptableScore: number;
  /** Preferred minimum image width (default: 1920) */
  preferredMinWidth: number;
  /** Preferred minimum image height (default: 1080) */
  preferredMinHeight: number;
  /** Cliché patterns to detect and reject */
  clichePatterns: string[];
  /** Attempt 1 video clip per this many segments (default: 3) */
  videoClipInterval: number;
}

export interface QualityGateResult {
  /** Whether the candidate is accepted */
  accepted: boolean;
  /** The candidate's effective score */
  score: number;
  /** Action to take if not accepted outright */
  fallbackAction: 'none' | 'broaden_search' | 'procedural_background';
  /** Human-readable reason for the decision */
  reason?: string;
}

export interface VideoClipPlan {
  /** Total number of segments */
  totalSegments: number;
  /** Number of video clips to attempt */
  targetVideoClips: number;
  /** Segment indices where video clips should be attempted */
  videoSegmentIndices: number[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default quality gate configuration */
export const DEFAULT_QUALITY_GATE_CONFIG: QualityGateConfig = {
  minCompositeScore: 100,
  minAcceptableScore: 80,
  preferredMinWidth: 1920,
  preferredMinHeight: 1080,
  clichePatterns: [
    'hooded hacker',
    'binary code',
    'circuit board',
    'abstract circuit',
    'hacker hoodie',
    'green matrix',
    'stock handshake',
    'generic office',
  ],
  videoClipInterval: 3,
};

/** Cliché rejection threshold — alternatives must score above this to reject a cliché */
const CLICHE_ALTERNATIVE_THRESHOLD = 150;

// ---------------------------------------------------------------------------
// Candidate Evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluates a media candidate against quality thresholds.
 *
 * Decision logic:
 * - Score >= minCompositeScore (100): Accept
 * - Score < minCompositeScore but >= minAcceptableScore (80): Broaden search
 * - Score < minAcceptableScore (80): Procedural fallback
 *
 * Also applies resolution preference scoring.
 *
 * @param candidate - The media candidate to evaluate
 * @param config - Quality gate configuration (uses defaults if not provided)
 * @returns QualityGateResult with acceptance decision and fallback action
 */
export function evaluateCandidate(
  candidate: MediaCandidate,
  config: QualityGateConfig = DEFAULT_QUALITY_GATE_CONFIG,
): QualityGateResult {
  const score = candidate.qualityCompositeScore ?? candidate.finalScore ?? 0;

  // Apply resolution preference bonus/penalty
  const resolutionAdjustedScore = applyResolutionPreference(score, candidate, config);

  if (resolutionAdjustedScore >= config.minCompositeScore) {
    return {
      accepted: true,
      score: resolutionAdjustedScore,
      fallbackAction: 'none',
    };
  }

  if (resolutionAdjustedScore >= config.minAcceptableScore) {
    return {
      accepted: false,
      score: resolutionAdjustedScore,
      fallbackAction: 'broaden_search',
      reason: `Score ${resolutionAdjustedScore} below acceptance threshold ${config.minCompositeScore}; broadening search`,
    };
  }

  return {
    accepted: false,
    score: resolutionAdjustedScore,
    fallbackAction: 'procedural_background',
    reason: `Score ${resolutionAdjustedScore} below minimum ${config.minAcceptableScore}; using procedural background`,
  };
}

// ---------------------------------------------------------------------------
// Resolution Preference
// ---------------------------------------------------------------------------

/**
 * Applies a resolution preference adjustment to the score.
 * Candidates meeting 1920×1080 minimum get a small bonus;
 * those significantly below get a penalty.
 */
function applyResolutionPreference(
  score: number,
  candidate: MediaCandidate,
  config: QualityGateConfig,
): number {
  const width = candidate.resolvedWidth ?? candidate.width ?? 0;
  const height = candidate.resolvedHeight ?? candidate.height ?? 0;

  // If resolution info is unavailable, return score unchanged
  if (width === 0 && height === 0) return score;

  if (width >= config.preferredMinWidth && height >= config.preferredMinHeight) {
    // Meets preferred resolution — small bonus
    return score + 10;
  }

  // Below preferred resolution — proportional penalty
  const widthRatio = width / config.preferredMinWidth;
  const heightRatio = height / config.preferredMinHeight;
  const ratio = Math.min(widthRatio, heightRatio);

  if (ratio < 0.5) {
    // Very low resolution — significant penalty
    return score - 15;
  }

  return score;
}

// ---------------------------------------------------------------------------
// Cliché Pattern Detection
// ---------------------------------------------------------------------------

/**
 * Detects whether a candidate matches a cliché visual pattern.
 *
 * Checks the candidate's alt text, URL, and source URL against known
 * cliché patterns (hooded hacker, binary code, circuit boards, etc.).
 *
 * @param candidate - The media candidate to check
 * @param patterns - Array of cliché pattern strings to match against
 * @returns The matched pattern string, or null if no cliché detected
 */
export function detectClichePattern(
  candidate: MediaCandidate,
  patterns: string[] = DEFAULT_QUALITY_GATE_CONFIG.clichePatterns,
): string | null {
  const searchText = [
    candidate.alt,
    candidate.url,
    candidate.sourceUrl ?? '',
    candidate.query,
  ]
    .join(' ')
    .toLowerCase();

  for (const pattern of patterns) {
    if (searchText.includes(pattern.toLowerCase())) {
      return pattern;
    }
  }

  return null;
}

/**
 * Filters candidates by rejecting cliché matches when better alternatives exist.
 *
 * A cliché candidate is rejected ONLY when at least one non-cliché alternative
 * scores above the CLICHE_ALTERNATIVE_THRESHOLD (150).
 *
 * @param candidates - Array of media candidates to filter
 * @param config - Quality gate configuration
 * @returns Filtered array with clichés removed (when alternatives are strong enough)
 */
export function rejectClicheCandidates(
  candidates: MediaCandidate[],
  config: QualityGateConfig = DEFAULT_QUALITY_GATE_CONFIG,
): MediaCandidate[] {
  if (candidates.length === 0) return [];

  const clicheIndices = new Set<number>();
  const nonClicheCandidates: MediaCandidate[] = [];

  // Identify cliché and non-cliché candidates
  for (let i = 0; i < candidates.length; i++) {
    const matched = detectClichePattern(candidates[i], config.clichePatterns);
    if (matched) {
      clicheIndices.add(i);
    } else {
      nonClicheCandidates.push(candidates[i]);
    }
  }

  // If no clichés found, return all candidates
  if (clicheIndices.size === 0) return candidates;

  // Check if any non-cliché alternative scores above the threshold
  const hasStrongAlternative = nonClicheCandidates.some((c) => {
    const score = c.qualityCompositeScore ?? c.finalScore ?? 0;
    return score > CLICHE_ALTERNATIVE_THRESHOLD;
  });

  // Only reject clichés if strong alternatives exist
  if (!hasStrongAlternative) return candidates;

  return candidates.filter((_, i) => !clicheIndices.has(i));
}

// ---------------------------------------------------------------------------
// Procedural Background Generation
// ---------------------------------------------------------------------------

/**
 * Generates a procedural gradient background using the segment's semantic colors.
 *
 * Renders a 1920×1080 canvas with a diagonal gradient from primary to secondary color.
 * Used as a fallback when all sourced candidates score below the minimum threshold.
 *
 * @param semanticColors - Object with primary and secondary color hex strings
 * @returns An HTMLCanvasElement with the rendered gradient (or a data object in non-browser environments)
 */
export function generateProceduralBackground(semanticColors: {
  primary: string;
  secondary: string;
}): HTMLCanvasElement {
  const width = 1920;
  const height = 1080;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    // Return the canvas even without context (edge case in test environments)
    return canvas;
  }

  // Create a diagonal gradient from top-left to bottom-right
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, semanticColors.primary);
  gradient.addColorStop(0.5, blendColors(semanticColors.primary, semanticColors.secondary, 0.5));
  gradient.addColorStop(1, semanticColors.secondary);

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Add subtle noise/texture overlay for visual interest
  addSubtleTexture(ctx, width, height);

  return canvas;
}

// ---------------------------------------------------------------------------
// Video Clip Sourcing Plan
// ---------------------------------------------------------------------------

/**
 * Computes the video clip sourcing plan for a given number of segments.
 *
 * For N segments, attempts ⌊N/3⌋ video clips distributed evenly across the timeline.
 *
 * @param totalSegments - Total number of segments in the video
 * @param interval - Number of segments per video clip (default: 3)
 * @returns VideoClipPlan with target count and segment indices
 */
export function computeVideoClipPlan(
  totalSegments: number,
  interval: number = DEFAULT_QUALITY_GATE_CONFIG.videoClipInterval,
): VideoClipPlan {
  const targetVideoClips = Math.floor(totalSegments / interval);
  const videoSegmentIndices: number[] = [];

  if (targetVideoClips > 0 && totalSegments > 0) {
    // Distribute video clips evenly across segments
    const spacing = totalSegments / targetVideoClips;
    for (let i = 0; i < targetVideoClips; i++) {
      const index = Math.floor(spacing * i + spacing / 2);
      videoSegmentIndices.push(Math.min(index, totalSegments - 1));
    }
  }

  return {
    totalSegments,
    targetVideoClips,
    videoSegmentIndices,
  };
}

// ---------------------------------------------------------------------------
// Batch Evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluates a batch of candidates for a segment, applying cliché filtering
 * and quality thresholds. Returns the best candidate or indicates fallback needed.
 *
 * @param candidates - Array of candidates for a segment
 * @param config - Quality gate configuration
 * @returns The best result after filtering
 */
export function evaluateCandidateBatch(
  candidates: MediaCandidate[],
  config: QualityGateConfig = DEFAULT_QUALITY_GATE_CONFIG,
): { bestCandidate: MediaCandidate | null; result: QualityGateResult } {
  if (candidates.length === 0) {
    return {
      bestCandidate: null,
      result: {
        accepted: false,
        score: 0,
        fallbackAction: 'procedural_background',
        reason: 'No candidates available',
      },
    };
  }

  // Filter out clichés when strong alternatives exist
  const filtered = rejectClicheCandidates(candidates, config);

  // Sort by score descending
  const sorted = [...filtered].sort((a, b) => {
    const scoreA = a.qualityCompositeScore ?? a.finalScore ?? 0;
    const scoreB = b.qualityCompositeScore ?? b.finalScore ?? 0;
    return scoreB - scoreA;
  });

  const best = sorted[0];
  const result = evaluateCandidate(best, config);

  return { bestCandidate: best, result };
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Blends two hex colors at a given ratio.
 */
function blendColors(color1: string, color2: string, ratio: number): string {
  const c1 = parseHexColor(color1);
  const c2 = parseHexColor(color2);

  const r = Math.round(c1.r * (1 - ratio) + c2.r * ratio);
  const g = Math.round(c1.g * (1 - ratio) + c2.g * ratio);
  const b = Math.round(c1.b * (1 - ratio) + c2.b * ratio);

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Parses a hex color string into RGB components.
 */
function parseHexColor(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  const fullHex = clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean;

  return {
    r: parseInt(fullHex.slice(0, 2), 16) || 0,
    g: parseInt(fullHex.slice(2, 4), 16) || 0,
    b: parseInt(fullHex.slice(4, 6), 16) || 0,
  };
}

/**
 * Adds a subtle texture overlay to the canvas for visual interest.
 */
function addSubtleTexture(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  // Add very subtle dot pattern
  ctx.globalAlpha = 0.03;
  ctx.fillStyle = '#ffffff';

  const spacing = 20;
  for (let x = 0; x < width; x += spacing) {
    for (let y = 0; y < height; y += spacing) {
      ctx.beginPath();
      ctx.arc(x, y, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.globalAlpha = 1.0;
}
