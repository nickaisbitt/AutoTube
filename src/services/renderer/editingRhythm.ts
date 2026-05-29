import type { ScriptSegment, MediaAsset, NarrativeBeat } from '../../types';
import { hasStatisticalContent } from '../renderingShared';

// ---------------------------------------------------------------------------
// Fast-Paced Editing Controller
// Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
// ---------------------------------------------------------------------------

/**
 * Configuration for the editing rhythm controller.
 */
export interface EditingRhythmConfig {
  /** Maximum hold time in seconds for a static image (default: 4) */
  maxHoldTimeSec: number;
  /** Maximum hold time in seconds for segments in the first 10 seconds (default: 3) */
  openingMaxHoldTimeSec: number;
  /** Maximum time in seconds an asset can appear without motion/overlay change (default: 7) */
  maxAssetTimeSec: number;
  /** Minimum visual changes per 10-second window (default: 2) */
  minVisualChanges: number;
  /** Narration duration threshold in seconds that triggers shot splitting (default: 6) */
  splitThresholdSec: number;
  /** Ken Burns zoom/pan rate range as fraction per second (default: [0.02, 0.05]) */
  kenBurnsRateRange: [number, number];
  /** Minimum number of shots for segments exceeding splitThresholdSec (default: 2) */
  minShotsForLongSegment: number;
}

/**
 * A single shot within a segment's shot plan.
 */
export interface ShotPlan {
  /** Index into the assets array for this shot */
  assetIndex: number;
  /** Start time in seconds relative to segment start */
  startTime: number;
  /** End time in seconds relative to segment start */
  endTime: number;
  /** Motion type applied to this shot */
  motionType: 'ken_burns' | 'zoom' | 'cut' | 'overlay';
  /** Framing style for this shot */
  framing: 'close_up' | 'wide_angle' | 'medium';
  /** Ken Burns motion rate (fraction per second, e.g. 0.03 = 3%/s). Present when motionType is 'ken_burns'. */
  kenBurnsRate?: number;
}

/**
 * Represents an animated text card inserted into the video.
 */
export interface TextCardEntry {
  /** Segment index where the text card appears */
  segmentIndex: number;
  /** Start time relative to segment start */
  startTime: number;
  /** Duration of the text card in seconds */
  durationSec: number;
  /** Text content to display */
  text: string;
}

/**
 * Represents a detected sentence boundary in narration text.
 */
export interface SentenceBoundary {
  /** Character offset in narration text where the sentence starts */
  charOffset: number;
  /** Word index where the sentence starts */
  wordIndex: number;
  /** Estimated timestamp in seconds from segment start */
  estimatedTimestamp: number;
  /** The sentence text */
  text: string;
}

/** Default editing rhythm configuration */
export const DEFAULT_EDITING_RHYTHM_CONFIG: EditingRhythmConfig = {
  maxHoldTimeSec: 3, // Reduced from 4s for better retention
  openingMaxHoldTimeSec: 2.5, // Reduced from 3s for stronger hook
  maxAssetTimeSec: 7,
  minVisualChanges: 2,
  splitThresholdSec: 6,
  kenBurnsRateRange: [0.02, 0.05],
  minShotsForLongSegment: 2,
};

/** Motion types to cycle through for variety */
const MOTION_TYPES: Array<ShotPlan['motionType']> = ['ken_burns', 'zoom', 'cut', 'overlay'];

/**
 * Plans the shots for a single segment, enforcing fast-paced editing constraints.
 *
 * - Max 4s hold time per static image (Requirement 5.1)
 * - Max 3s hold time in the first 10 seconds of the video (Requirement 7.3)
 * - Split into ≥2 shots when segment exceeds 6s (Requirement 5.2)
 * - Max 7s per asset without motion/overlay change (Requirement 10.5)
 * - Ken Burns motion (2-5% zoom/pan per second) on all static image shots (Requirement 5.6)
 *
 * @param segment - The script segment to plan shots for
 * @param assets - Available media assets for this segment
 * @param config - Editing rhythm configuration
 * @param segmentStartTime - Start time of this segment within the overall video (seconds). Used to determine opening pacing.
 * @returns Array of shot plans for the segment
 */
export function planSegmentShots(
  segment: ScriptSegment,
  assets: MediaAsset[],
  config: EditingRhythmConfig = DEFAULT_EDITING_RHYTHM_CONFIG,
  segmentStartTime: number = 0,
): ShotPlan[] {
  const duration = segment.duration;

  // Edge case: no duration or no assets
  if (duration <= 0) return [];
  if (assets.length === 0) return [];

  // Determine effective max hold time based on whether segment is in the opening 10 seconds
  const isInOpening = segmentStartTime < 10;
  const effectiveMaxHold = isInOpening ? config.openingMaxHoldTimeSec : config.maxHoldTimeSec;

  const framing = alternateFraming(0); // Will be overridden by caller context
  const shots: ShotPlan[] = [];

  // Determine the narration duration (estimate from word count if not explicit)
  const narrationDuration = estimateNarrationDuration(segment);

  // Determine minimum number of shots needed
  let minShots = 1;

  // Requirement 5.2: Split into ≥2 shots when segment exceeds splitThresholdSec
  if (duration > config.splitThresholdSec) {
    minShots = Math.max(minShots, config.minShotsForLongSegment);
  }

  // Also split based on narration duration exceeding threshold
  if (narrationDuration > config.splitThresholdSec) {
    minShots = Math.max(minShots, config.minShotsForLongSegment);
  }

  // Requirement 5.1 / 7.3: Max hold time per static image
  const maxShotsFromHold = Math.ceil(duration / effectiveMaxHold);
  minShots = Math.max(minShots, maxShotsFromHold);

  // Requirement 10.5: Max asset time without motion change
  const maxShotsFromAssetTime = Math.ceil(duration / config.maxAssetTimeSec);
  minShots = Math.max(minShots, maxShotsFromAssetTime);

  // Calculate shot duration
  const shotDuration = duration / minShots;

  for (let i = 0; i < minShots; i++) {
    const startTime = i * shotDuration;
    const endTime = Math.min((i + 1) * shotDuration, duration);
    const assetIndex = assets.length > 0 ? i % assets.length : 0;
    const motionType = MOTION_TYPES[i % MOTION_TYPES.length];

    shots.push({
      assetIndex,
      startTime,
      endTime,
      motionType,
      framing,
    });
  }

  // Enforce max hold time constraint: split any shot exceeding effectiveMaxHold
  const finalShots = enforceMaxHoldTime(shots, effectiveMaxHold, assets.length);

  // Enforce max asset time constraint: ensure motion changes within maxAssetTimeSec
  const assetTimeEnforced = enforceMaxAssetTime(finalShots, config.maxAssetTimeSec);

  // Apply Ken Burns motion to all static image shots (Requirement 5.6)
  const kenBurnsApplied = applyKenBurnsToStaticImages(assetTimeEnforced, assets, config.kenBurnsRateRange);

  // Requirement 5.3, 8.1, 8.2, 8.3: Align cuts with sentence boundaries
  // If narration is available, detect sentence boundaries and emphasis points,
  // then align cuts to meaning shifts rather than fixed intervals
  if (segment.narration && segment.narration.trim().length > 0 && kenBurnsApplied.length > 1) {
    const boundaries = detectSentenceBoundaries(segment.narration, duration);
    const emphasisPoints = detectEmphasisPoints(segment.narration, duration);
    return alignCutsToSentences(kenBurnsApplied, boundaries, emphasisPoints, duration);
  }

  return kenBurnsApplied;
}

/**
 * Alternates framing between close_up and wide_angle across consecutive segments.
 * Even indices get close_up, odd indices get wide_angle.
 *
 * Requirement 10.3: Alternate between close-up and wide-angle framing
 *
 * @param segmentIndex - The index of the segment in the video
 * @returns The framing type for this segment
 */
export function alternateFraming(segmentIndex: number): 'close_up' | 'wide_angle' {
  return segmentIndex % 2 === 0 ? 'close_up' : 'wide_angle';
}

/**
 * Determines which segments should receive animated text cards.
 * For videos with >5 segments, inserts ≥2 animated text cards distributed across the video.
 *
 * Requirement 10.4: Insert ≥2 animated text cards for videos with >5 segments
 *
 * @param segments - All script segments in the video
 * @returns Array of text card entries to insert
 */
export function planTextCards(segments: ScriptSegment[]): TextCardEntry[] {
  if (segments.length <= 5) return [];

  const cards: TextCardEntry[] = [];

  // Find segments with statistical content first
  const statisticalSegments = segments
    .map((seg, idx) => ({ seg, idx }))
    .filter(({ seg }) => hasStatisticalContent(seg.narration));

  // Distribute cards evenly across the video
  const targetCardCount = Math.max(2, Math.min(statisticalSegments.length, Math.floor(segments.length / 3)));

  if (statisticalSegments.length >= 2) {
    // Use statistical segments, distributed evenly
    const step = Math.max(1, Math.floor(statisticalSegments.length / targetCardCount));
    for (let i = 0; i < statisticalSegments.length && cards.length < targetCardCount; i += step) {
      const { seg, idx } = statisticalSegments[i];
      cards.push({
        segmentIndex: idx,
        startTime: seg.duration * 0.3, // Place at 30% into the segment
        durationSec: 2.5,
        text: extractStatisticalText(seg.narration),
      });
    }
  }

  // If we still need more cards, add from non-statistical segments with titles
  if (cards.length < 2) {
    const usedIndices = new Set(cards.map(c => c.segmentIndex));
    const remaining = segments
      .map((seg, idx) => ({ seg, idx }))
      .filter(({ idx }) => !usedIndices.has(idx))
      .filter(({ seg }) => seg.title.length > 0);

    // Distribute evenly across remaining segments
    const step = Math.max(1, Math.floor(remaining.length / (2 - cards.length)));
    for (let i = 0; i < remaining.length && cards.length < 2; i += step) {
      const { seg, idx } = remaining[i];
      cards.push({
        segmentIndex: idx,
        startTime: seg.duration * 0.4,
        durationSec: 2.5,
        text: seg.title,
      });
    }
  }

  return cards;
}

// ---------------------------------------------------------------------------
// Sentence Boundary Detection and Cut Alignment
// Requirements: 5.3, 8.1, 8.2, 8.3
// ---------------------------------------------------------------------------

/**
 * Detects sentence boundaries in narration text and estimates their timestamps
 * based on word rate (total words / segment duration).
 *
 * Requirement 5.3, 8.1: Align visual cuts with meaning shifts (sentence boundaries).
 *
 * @param narration - The narration text to analyze
 * @param segmentDuration - Duration of the segment in seconds
 * @returns Array of SentenceBoundary objects with estimated timestamps
 */
export function detectSentenceBoundaries(narration: string, segmentDuration: number): SentenceBoundary[] {
  if (!narration || narration.trim().length === 0 || segmentDuration <= 0) {
    return [];
  }

  // Split narration into sentences using improved regex that handles:
  // - Abbreviations (Dr., Mr., Mrs., Ms., Prof., etc.)
  // - Decimal numbers (3.5 billion, 1.2 million)
  // - Ellipses (...)
  // - Standard sentence endings (.!?)
  // Strategy: split on .!? that are NOT preceded by common abbreviations or digits
  const sentenceRegex = /[^.!?]*(?:[.!?](?![a-zA-Z0-9])|\.\.\.)(?:\s|$)|[^.!?]+$/g;
  const matches = narration.match(sentenceRegex);

  if (!matches || matches.length === 0) {
    // No punctuation found — treat entire narration as one sentence
    return [{
      charOffset: 0,
      wordIndex: 0,
      estimatedTimestamp: 0,
      text: narration.trim(),
    }];
  }

  // Calculate word rate: total words / segment duration
  const allWords = narration.split(/\s+/).filter(w => w.length > 0);
  const totalWords = allWords.length;
  const wordRate = totalWords > 0 ? segmentDuration / totalWords : 0; // seconds per word

  const boundaries: SentenceBoundary[] = [];
  let charOffset = 0;
  let wordIndex = 0;

  for (const sentence of matches) {
    const trimmed = sentence.trim();
    if (trimmed.length === 0) continue;

    // Find the actual char offset in the original narration
    const actualOffset = narration.indexOf(trimmed, charOffset);
    const offset = actualOffset >= 0 ? actualOffset : charOffset;

    // Estimate timestamp based on word index and word rate
    const estimatedTimestamp = wordIndex * wordRate;

    boundaries.push({
      charOffset: offset,
      wordIndex,
      estimatedTimestamp: Math.min(estimatedTimestamp, segmentDuration),
      text: trimmed,
    });

    // Count words in this sentence to advance wordIndex
    const sentenceWords = trimmed.split(/\s+/).filter(w => w.length > 0).length;
    wordIndex += sentenceWords;
    charOffset = offset + trimmed.length;
  }

  return boundaries;
}

/**
 * Detects emphasis points in narration text — data citations, proper nouns,
 * and key phrases — and returns their estimated timestamps.
 *
 * Requirement 8.2: Avoid placing cuts within 0.5s of emphasis points.
 *
 * @param narration - The narration text to analyze
 * @param segmentDuration - Duration of the segment in seconds
 * @returns Array of estimated timestamps (seconds) where emphasis points occur
 */
export function detectEmphasisPoints(narration: string, segmentDuration: number): number[] {
  if (!narration || narration.trim().length === 0 || segmentDuration <= 0) {
    return [];
  }

  const allWords = narration.split(/\s+/).filter(w => w.length > 0);
  const totalWords = allWords.length;
  if (totalWords === 0) return [];

  const wordRate = segmentDuration / totalWords; // seconds per word
  const emphasisTimestamps: number[] = [];

  // Pattern 1: Data citations — numbers + units like "$5 billion", "45%", "100 million"
  const dataCitationRegex = /(?:\$[\d,.]+\s*(?:billion|million|trillion)?|\d+(?:[.,]\d+)?\s*(?:%|billion|million|trillion|dollars?|people|victims|attacks?|years?|months?|days?))/gi;
  let match: RegExpExecArray | null;

  while ((match = dataCitationRegex.exec(narration)) !== null) {
    const charPos = match.index;
    const wordIdx = getWordIndexAtChar(narration, charPos);
    const timestamp = wordIdx * wordRate;
    emphasisTimestamps.push(Math.min(timestamp, segmentDuration));
  }

  // Pattern 2: Proper nouns — capitalized words not at sentence start
  // Look for capitalized words that are not the first word after a sentence boundary
  const properNounRegex = /(?<=[.!?]\s+\w+\s+|^.+?\s+)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g;
  while ((match = properNounRegex.exec(narration)) !== null) {
    const charPos = match.index;
    const wordIdx = getWordIndexAtChar(narration, charPos);
    const timestamp = wordIdx * wordRate;
    emphasisTimestamps.push(Math.min(timestamp, segmentDuration));
  }

  // Pattern 3: Key phrases — quoted text
  const quotedRegex = /[""]([^""]+)[""]|"([^"]+)"/g;
  while ((match = quotedRegex.exec(narration)) !== null) {
    const charPos = match.index;
    const wordIdx = getWordIndexAtChar(narration, charPos);
    const timestamp = wordIdx * wordRate;
    emphasisTimestamps.push(Math.min(timestamp, segmentDuration));
  }

  // Deduplicate and sort
  const unique = [...new Set(emphasisTimestamps.map(t => Math.round(t * 100) / 100))];
  unique.sort((a, b) => a - b);

  return unique;
}

/**
 * Aligns shot cut points to the nearest sentence boundary while avoiding
 * cuts within 0.5s of emphasis points.
 *
 * Requirements 5.3, 8.1, 8.2, 8.3:
 * - Snap shot boundaries to nearest sentence boundary
 * - Avoid cuts within 0.5s of emphasis points
 * - Each sentence gets a distinct shot when multiple concepts are available
 * - Preserve total segment duration
 *
 * @param shots - The initial shot plan to adjust
 * @param boundaries - Detected sentence boundaries with timestamps
 * @param emphasisPoints - Timestamps of emphasis points to avoid
 * @param segmentDuration - Total segment duration in seconds
 * @returns Adjusted shot plan with cuts aligned to sentence boundaries
 */
export function alignCutsToSentences(
  shots: ShotPlan[],
  boundaries: SentenceBoundary[],
  emphasisPoints: number[],
  segmentDuration: number,
): ShotPlan[] {
  // If no boundaries or only one sentence, return shots as-is
  if (boundaries.length <= 1 || shots.length <= 1) {
    return shots;
  }

  // Get sentence boundary timestamps (excluding the first at 0)
  const boundaryTimestamps = boundaries
    .map(b => b.estimatedTimestamp)
    .filter(t => t > 0 && t < segmentDuration);

  if (boundaryTimestamps.length === 0) {
    return shots;
  }

  // Strategy: assign one shot per sentence boundary where possible
  // If we have more sentences than shots, snap existing cut points to nearest boundary
  // If we have more shots than sentences, keep extra shots but align what we can

  const cutPoints: number[] = [];

  // Collect the internal cut points from the original shot plan (exclude start=0 and end=duration)
  for (let i = 1; i < shots.length; i++) {
    cutPoints.push(shots[i].startTime);
  }

  // Snap each cut point to the nearest sentence boundary
  const alignedCutPoints: number[] = [];
  const usedBoundaries = new Set<number>();

  for (const cutPoint of cutPoints) {
    // Find nearest sentence boundary
    let bestBoundary = cutPoint;
    let bestDistance = Infinity;

    for (const bt of boundaryTimestamps) {
      if (usedBoundaries.has(bt)) continue;
      const distance = Math.abs(bt - cutPoint);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestBoundary = bt;
      }
    }

    // Only snap if within reasonable range (within half the average shot duration)
    const avgShotDuration = segmentDuration / shots.length;
    if (bestDistance <= avgShotDuration * 0.75) {
      // Check if this boundary is too close to an emphasis point
      const tooCloseToEmphasis = emphasisPoints.some(
        ep => Math.abs(bestBoundary - ep) < 0.5
      );

      if (tooCloseToEmphasis) {
        // Try the next closest boundary that isn't near an emphasis point
        const alternativeBoundaries = boundaryTimestamps
          .filter(bt => !usedBoundaries.has(bt))
          .filter(bt => !emphasisPoints.some(ep => Math.abs(bt - ep) < 0.5))
          .sort((a, b) => Math.abs(a - cutPoint) - Math.abs(b - cutPoint));

        if (alternativeBoundaries.length > 0) {
          bestBoundary = alternativeBoundaries[0];
        } else {
          // No good alternative — keep original cut point but shift away from emphasis
          bestBoundary = cutPoint;
          // Shift away from nearest emphasis point
          const nearestEmphasis = emphasisPoints
            .sort((a, b) => Math.abs(a - cutPoint) - Math.abs(b - cutPoint))[0];
          if (nearestEmphasis !== undefined && Math.abs(cutPoint - nearestEmphasis) < 0.5) {
            // Move cut point 0.5s away from emphasis
            bestBoundary = nearestEmphasis + (cutPoint > nearestEmphasis ? 0.5 : -0.5);
            // Clamp to valid range
            bestBoundary = Math.max(0.1, Math.min(segmentDuration - 0.1, bestBoundary));
          }
        }
      }

      usedBoundaries.add(bestBoundary);
      alignedCutPoints.push(bestBoundary);
    } else {
      // Boundary too far — keep original cut point but check emphasis avoidance
      let adjustedCut = cutPoint;
      const tooCloseToEmphasis = emphasisPoints.some(
        ep => Math.abs(adjustedCut - ep) < 0.5
      );
      if (tooCloseToEmphasis) {
        const nearestEmphasis = emphasisPoints
          .sort((a, b) => Math.abs(a - adjustedCut) - Math.abs(b - adjustedCut))[0];
        if (nearestEmphasis !== undefined) {
          adjustedCut = nearestEmphasis + (adjustedCut > nearestEmphasis ? 0.5 : -0.5);
          adjustedCut = Math.max(0.1, Math.min(segmentDuration - 0.1, adjustedCut));
        }
      }
      alignedCutPoints.push(adjustedCut);
    }
  }

  // Sort cut points and ensure they're monotonically increasing
  alignedCutPoints.sort((a, b) => a - b);

  // Rebuild shot plan with aligned cut points
  const result: ShotPlan[] = [];

  for (let i = 0; i < shots.length; i++) {
    const startTime = i === 0 ? 0 : alignedCutPoints[i - 1];
    const endTime = i < alignedCutPoints.length ? alignedCutPoints[i] : segmentDuration;

    // Skip shots with zero or negative duration
    if (endTime <= startTime) continue;

    result.push({
      ...shots[i],
      startTime,
      endTime,
    });
  }

  // Ensure last shot extends to segment duration
  if (result.length > 0 && result[result.length - 1].endTime < segmentDuration) {
    result[result.length - 1] = {
      ...result[result.length - 1],
      endTime: segmentDuration,
    };
  }

  return result.length > 0 ? result : shots;
}

// ---------------------------------------------------------------------------
// Pattern Interrupt Planning
// Requirements: 5.4, 5.5
// ---------------------------------------------------------------------------

/** Maximum gap in seconds between pattern interrupts */
const MAX_PATTERN_INTERRUPT_GAP_SEC = 12; // Reduced from 20s for Gen Z attention spans

/**
 * Plans pattern interrupts across the entire video to ensure no gap > 20 seconds
 * between visual changes (text cards, zoom changes, or transitions).
 *
 * Requirement 5.4: Insert a pattern interrupt at least once every 20 seconds.
 *
 * @param totalDuration - Total video duration in seconds
 * @param segments - All script segments in the video
 * @returns Array of TextCardEntry objects representing planned pattern interrupts
 */
export function planPatternInterrupts(totalDuration: number, segments: ScriptSegment[]): TextCardEntry[] {
  if (totalDuration <= MAX_PATTERN_INTERRUPT_GAP_SEC || segments.length === 0) {
    return [];
  }

  const cards: TextCardEntry[] = [];

  // Build a timeline of existing pattern interrupts (segment transitions count as interrupts)
  const existingInterrupts: number[] = [0]; // Video start is an implicit interrupt

  // Each segment boundary is a natural transition (pattern interrupt)
  let cumulativeTime = 0;
  for (const seg of segments) {
    cumulativeTime += seg.duration;
    existingInterrupts.push(cumulativeTime);
  }

  // Find gaps > 20s between existing interrupts and fill them with text cards
  for (let i = 1; i < existingInterrupts.length; i++) {
    const gapStart = existingInterrupts[i - 1];
    const gapEnd = existingInterrupts[i];
    const gapDuration = gapEnd - gapStart;

    if (gapDuration > MAX_PATTERN_INTERRUPT_GAP_SEC) {
      // Determine how many interrupts we need to fill this gap
      const numInterrupts = Math.ceil(gapDuration / MAX_PATTERN_INTERRUPT_GAP_SEC) - 1;
      const intervalSize = gapDuration / (numInterrupts + 1);

      // Find which segment this gap belongs to
      let segCumulativeTime = 0;
      let segIndex = -1;
      for (let s = 0; s < segments.length; s++) {
        if (segCumulativeTime + segments[s].duration >= gapEnd - 0.001) {
          segIndex = s;
          break;
        }
        segCumulativeTime += segments[s].duration;
      }

      if (segIndex < 0) segIndex = segments.length - 1;

      const seg = segments[segIndex];

      for (let j = 1; j <= numInterrupts; j++) {
        const interruptTime = j * intervalSize;
        const relativeStartTime = interruptTime; // Relative to segment start

        // Extract meaningful text for the card from the segment narration
        const cardText = extractPatternInterruptText(seg);

        cards.push({
          segmentIndex: segIndex,
          startTime: Math.min(relativeStartTime, seg.duration - 2.5),
          durationSec: 2.5,
          text: cardText,
        });
      }
    }
  }

  return cards;
}

/**
 * Determines whether a contrasting visual transition should be inserted between
 * two consecutive segments that share the same narrative beat classification.
 *
 * Requirement 5.5: When consecutive segments share the same narrative beat,
 * insert a contrasting visual transition to prevent monotony.
 *
 * @param beatA - The narrative beat of the first segment
 * @param beatB - The narrative beat of the second segment
 * @returns true if a contrasting transition should be inserted
 */
export function shouldInsertContrastingTransition(beatA: NarrativeBeat, beatB: NarrativeBeat): boolean {
  return beatA === beatB;
}

/**
 * Extracts meaningful text for a pattern interrupt text card from segment narration.
 * Prioritizes statistical content, then falls back to key phrases or the segment title.
 */
function extractPatternInterruptText(segment: ScriptSegment): string {
  const narration = segment.narration;

  // Priority 1: Statistical content (numbers, percentages, dollar amounts)
  if (narration && hasStatisticalContent(narration)) {
    const dollarMatch = narration.match(/\$[\d,.]+\s*(?:billion|million|trillion)?/i);
    if (dollarMatch) return dollarMatch[0];

    const percentMatch = narration.match(/\d+(?:\.\d+)?%/);
    if (percentMatch) return percentMatch[0];

    const largeNumMatch = narration.match(/\d+(?:\.\d+)?\s*(?:billion|million|trillion)/i);
    if (largeNumMatch) return largeNumMatch[0];
  }

  // Priority 2: Extract impactful phrases (look for strong verbs, key claims)
  if (narration) {
    const sentences = narration.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const impactfulSentences = sentences.filter(s => {
      const lower = s.toLowerCase();
      return /\b(fail|crash|ban|monopol|dominat|control|crisis|warning|danger|threat|record|shock|surge|collapse)\b/i.test(lower);
    });
    if (impactfulSentences.length > 0) {
      impactfulSentences.sort((a, b) => a.length - b.length);
      return impactfulSentences[0].trim().substring(0, 50);
    }
  }

  // Priority 3: Segment title (cleaned up)
  if (segment.title && segment.title.length > 0) {
    const cleaned = segment.title.replace(/\b(The|A|An|Is|Are|Was|Were|Of|In|On|At|To|For)\b/gi, '').trim();
    return cleaned || segment.title;
  }

  // Priority 4: Extract a meaningful summary from narration
  if (narration) {
    const sentences = narration.split(/[.!?]+/).filter(s => s.trim().length > 0);
    if (sentences.length > 0) {
      const firstGood = sentences.find(s => s.trim().length > 10 && s.trim().length < 80);
      if (firstGood) return firstGood.trim().substring(0, 60);
      return sentences[0].trim().substring(0, 60);
    }
  }

  return segment.type === 'intro' ? 'Wait for it...' : 'Key insight';
}

// ---------------------------------------------------------------------------
// Narration-to-Cut Synchronization
// Requirements: 8.4
// ---------------------------------------------------------------------------

/**
 * Synchronizes animated text card display times with corresponding narration timestamps.
 *
 * For each text card, looks up its text content in the narrationTimestamps map.
 * If a matching timestamp is found and the card's startTime is not already within
 * the tolerance, adjusts the startTime to match the narration timestamp.
 * Cards without a matching timestamp are left unchanged.
 *
 * Requirement 8.4: Synchronize animated text cards (statistics, quotes) with
 * the corresponding narration timestamp within a 0.5-second tolerance.
 *
 * @param cards - Array of text card entries to synchronize
 * @param narrationTimestamps - Map of text content to narration timestamps (seconds)
 * @param tolerance - Maximum allowed difference in seconds (default 0.5)
 * @returns New array of text cards with adjusted start times
 */
export function synchronizeTextCards(
  cards: TextCardEntry[],
  narrationTimestamps: Map<string, number>,
  tolerance: number = 0.5,
): TextCardEntry[] {
  return cards.map(card => {
    const narrationTime = narrationTimestamps.get(card.text);

    // No matching timestamp found — leave unchanged
    if (narrationTime === undefined) {
      return card;
    }

    // Already within tolerance — leave unchanged
    if (Math.abs(card.startTime - narrationTime) <= tolerance) {
      return card;
    }

    // Adjust startTime to match the narration timestamp
    return {
      ...card,
      startTime: narrationTime,
    };
  });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Estimates narration duration from segment data.
 * Uses segment.duration as the primary source, or estimates from word count.
 */
function estimateNarrationDuration(segment: ScriptSegment): number {
  // Use the segment duration as the narration duration estimate
  // (narration typically fills most of the segment)
  if (segment.narration) {
    const wordCount = segment.narration.split(/\s+/).filter(w => w.length > 0).length;
    // Average speaking rate ~150 WPM = 2.5 words/sec
    const estimatedFromWords = wordCount / 2.5;
    // Use the larger of word-based estimate and segment duration
    return Math.max(estimatedFromWords, segment.duration);
  }
  return segment.duration;
}

/**
 * Enforces the maximum hold time constraint by splitting shots that exceed the limit.
 */
function enforceMaxHoldTime(
  shots: ShotPlan[],
  maxHoldTimeSec: number,
  assetCount: number,
): ShotPlan[] {
  const result: ShotPlan[] = [];

  for (const shot of shots) {
    const shotDuration = shot.endTime - shot.startTime;

    if (shotDuration > maxHoldTimeSec) {
      // Split this shot into smaller pieces
      const numParts = Math.ceil(shotDuration / maxHoldTimeSec);
      const partDuration = shotDuration / numParts;

      for (let i = 0; i < numParts; i++) {
        const newAssetIndex = assetCount > 0 ? (shot.assetIndex + i) % assetCount : 0;
        result.push({
          assetIndex: newAssetIndex,
          startTime: shot.startTime + i * partDuration,
          endTime: shot.startTime + (i + 1) * partDuration,
          motionType: MOTION_TYPES[(result.length) % MOTION_TYPES.length],
          framing: shot.framing,
        });
      }
    } else {
      result.push(shot);
    }
  }

  return result;
}

/**
 * Enforces the maximum asset display time constraint by inserting motion changes.
 */
function enforceMaxAssetTime(
  shots: ShotPlan[],
  maxAssetTimeSec: number,
): ShotPlan[] {
  const result: ShotPlan[] = [];

  for (const shot of shots) {
    const shotDuration = shot.endTime - shot.startTime;

    if (shotDuration > maxAssetTimeSec) {
      // Split into parts with different motion types
      const numParts = Math.ceil(shotDuration / maxAssetTimeSec);
      const partDuration = shotDuration / numParts;

      for (let i = 0; i < numParts; i++) {
        result.push({
          assetIndex: shot.assetIndex,
          startTime: shot.startTime + i * partDuration,
          endTime: shot.startTime + (i + 1) * partDuration,
          motionType: MOTION_TYPES[(result.length) % MOTION_TYPES.length],
          framing: shot.framing,
        });
      }
    } else {
      result.push(shot);
    }
  }

  return result;
}

/**
 * Applies Ken Burns motion to all shots that use static image assets.
 * Sets motionType to 'ken_burns' and assigns a random rate within the configured range.
 *
 * Requirement 5.6: Ken Burns motion (2-5% zoom/pan per second) on all static images.
 */
function applyKenBurnsToStaticImages(
  shots: ShotPlan[],
  assets: MediaAsset[],
  kenBurnsRateRange: [number, number],
): ShotPlan[] {
  return shots.map((shot, index) => {
    const asset = assets[shot.assetIndex];
    // Apply Ken Burns to all static image assets
    if (asset && asset.type === 'image') {
      // Deterministic rate based on shot index to vary across shots
      const [minRate, maxRate] = kenBurnsRateRange;
      const rate = minRate + ((index * 0.618) % 1) * (maxRate - minRate);
      // Clamp to range
      const clampedRate = Math.max(minRate, Math.min(maxRate, rate));
      return {
        ...shot,
        motionType: 'ken_burns' as const,
        kenBurnsRate: clampedRate,
      };
    }
    return shot;
  });
}

/**
 * Extracts the first statistical text (number, percentage, dollar amount) from narration.
 */
function extractStatisticalText(narration: string): string {
  // Match dollar amounts
  const dollarMatch = narration.match(/\$[\d,.]+\s*(?:billion|million|trillion)?/i);
  if (dollarMatch) return dollarMatch[0];

  // Match percentages
  const percentMatch = narration.match(/\d+(?:\.\d+)?%/);
  if (percentMatch) return percentMatch[0];

  // Match large numbers with units
  const largeNumMatch = narration.match(/\d+(?:\.\d+)?\s*(?:billion|million|trillion)/i);
  if (largeNumMatch) return largeNumMatch[0];

  // Match years
  const yearMatch = narration.match(/\b(19|20)\d{2}\b/);
  if (yearMatch) return yearMatch[0];

  // Fallback: first number found
  const numMatch = narration.match(/\d+/);
  return numMatch ? numMatch[0] : '';
}

/**
 * Gets the word index at a given character position in a string.
 * Used to convert character offsets to word-based timestamps.
 */
function getWordIndexAtChar(text: string, charPos: number): number {
  const prefix = text.slice(0, charPos);
  const words = prefix.split(/\s+/).filter(w => w.length > 0);
  return words.length;
}
