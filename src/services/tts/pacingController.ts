/**
 * Narration Pacing Controller
 *
 * Manages WPM targeting and SSML-like markup for prosody control.
 * Computes segment-appropriate pacing, inserts pauses before data points,
 * and estimates duration for each narration segment.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
 */

export interface PacingConfig {
  /** Target WPM between 120 and 200 */
  targetWpm: number;
  /** Segment type determines WPM range */
  segmentType: 'intro' | 'section' | 'transition' | 'outro';
  /** Key phrases to emphasize with prosody markers */
  emphasisMarkers?: string[];
}

export interface PacingResult {
  /** Text with SSML/prosody markers applied */
  processedText: string;
  /** Calculated WPM for the segment */
  estimatedWpm: number;
  /** Duration in seconds */
  estimatedDuration: number;
  /** Character offsets where pauses are inserted */
  pausePoints: number[];
}

/**
 * Regex patterns for detecting data points in narration text:
 * - Dollar amounts: $1,000 or $1.5 million/billion/trillion
 * - Percentages: 45%, 3.2%
 * - Large numbers: 1,000+ or numbers followed by million/billion/trillion
 */
const DOLLAR_AMOUNT_PATTERN = /\$[\d,]+(?:\.\d+)?(?:\s*(?:million|billion|trillion|thousand))?/gi;
const PERCENTAGE_PATTERN = /\d+(?:\.\d+)?%/g;
const LARGE_NUMBER_PATTERN = /\b\d{1,3}(?:,\d{3})+\b|\b\d+(?:\.\d+)?\s*(?:million|billion|trillion)\b/gi;

/**
 * Compute the target WPM for a given segment type.
 *
 * - intro → 170–180 (creates urgency)
 * - outro/advice → 140–155 (clarity)
 * - others (section, transition) → 120–200 (flexible)
 *
 * Returns the midpoint of the appropriate range.
 */
export function computeSegmentWpm(segmentType: string): number {
  switch (segmentType) {
    case 'intro':
      return 175; // midpoint of 170–180
    case 'outro':
    case 'advice':
      return 148; // midpoint of 140–155
    case 'section':
      return 160; // midpoint of 120–200
    case 'transition':
      return 155; // slightly slower for transitions
    default:
      return 160; // default midpoint of 120–200
  }
}

/**
 * Get the valid WPM range for a segment type.
 */
export function getWpmRange(segmentType: string): { min: number; max: number } {
  switch (segmentType) {
    case 'intro':
      return { min: 170, max: 180 };
    case 'outro':
    case 'advice':
      return { min: 140, max: 155 };
    default:
      return { min: 120, max: 200 };
  }
}

/**
 * Clamp a WPM value to the valid range for the segment type.
 */
function clampWpm(wpm: number, segmentType: string): number {
  const range = getWpmRange(segmentType);
  return Math.max(range.min, Math.min(range.max, wpm));
}

/**
 * Count words in a text string.
 */
function countWords(text: string): number {
  // Strip SSML-like markers before counting
  const cleaned = text
    .replace(/<[^>]+>/g, '')
    .replace(/\[pause:\d+ms\]/g, '')
    .trim();
  if (cleaned.length === 0) return 0;
  return cleaned.split(/\s+/).length;
}

/**
 * Detect data points (dollar amounts, percentages, large numbers) in text
 * and insert 300–500ms pause markers before each occurrence.
 *
 * Uses a 400ms pause (midpoint of 300–500ms range).
 */
export function insertDataPointPauses(text: string): string {
  if (!text || text.trim().length === 0) return text;

  // Collect all data point matches with their positions
  interface Match {
    index: number;
    length: number;
    text: string;
  }

  const matches: Match[] = [];

  // Find dollar amounts
  let match: RegExpExecArray | null;
  const dollarRegex = new RegExp(DOLLAR_AMOUNT_PATTERN.source, 'gi');
  while ((match = dollarRegex.exec(text)) !== null) {
    matches.push({ index: match.index, length: match[0].length, text: match[0] });
  }

  // Find percentages
  const pctRegex = new RegExp(PERCENTAGE_PATTERN.source, 'g');
  while ((match = pctRegex.exec(text)) !== null) {
    // Avoid duplicates if already captured by another pattern
    const isDuplicate = matches.some(
      (m) => m.index <= match!.index && match!.index < m.index + m.length,
    );
    if (!isDuplicate) {
      matches.push({ index: match.index, length: match[0].length, text: match[0] });
    }
  }

  // Find large numbers
  const largeNumRegex = new RegExp(LARGE_NUMBER_PATTERN.source, 'gi');
  while ((match = largeNumRegex.exec(text)) !== null) {
    const isDuplicate = matches.some(
      (m) => m.index <= match!.index && match!.index < m.index + m.length,
    );
    if (!isDuplicate) {
      matches.push({ index: match.index, length: match[0].length, text: match[0] });
    }
  }

  if (matches.length === 0) return text;

  // Sort by position (descending) so we can insert without shifting indices
  matches.sort((a, b) => b.index - a.index);

  let result = text;
  for (const m of matches) {
    const pauseMarker = '[pause:400ms]';
    // Insert pause before the data point
    result = result.slice(0, m.index) + pauseMarker + result.slice(m.index);
  }

  return result;
}

/**
 * Apply emphasis markers to key phrases in the text using SSML-like tags.
 */
function applyEmphasis(text: string, emphasisMarkers?: string[]): string {
  if (!emphasisMarkers || emphasisMarkers.length === 0) return text;

  let result = text;
  for (const phrase of emphasisMarkers) {
    if (!phrase || phrase.trim().length === 0) continue;
    // Case-insensitive replacement with emphasis tags
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    result = result.replace(regex, '<emphasis>$1</emphasis>');
  }
  return result;
}

/**
 * Get character offsets of all pause markers in the processed text.
 */
function getPausePoints(text: string): number[] {
  const points: number[] = [];
  const pauseRegex = /\[pause:\d+ms\]/g;
  let match: RegExpExecArray | null;
  while ((match = pauseRegex.exec(text)) !== null) {
    points.push(match.index);
  }
  return points;
}

/**
 * Apply pacing to narration text based on segment configuration.
 *
 * 1. Determines the effective WPM (clamped to segment-type range)
 * 2. Inserts data point pauses
 * 3. Applies emphasis markers
 * 4. Wraps text in prosody rate tag
 * 5. Calculates estimated WPM and duration
 */
export function applyPacing(text: string, config: PacingConfig): PacingResult {
  if (!text || text.trim().length === 0) {
    return {
      processedText: text || '',
      estimatedWpm: 0,
      estimatedDuration: 0,
      pausePoints: [],
    };
  }

  // Determine effective WPM: use config target clamped to segment range
  const effectiveWpm = clampWpm(config.targetWpm, config.segmentType);

  // Step 1: Insert data point pauses
  let processed = insertDataPointPauses(text);

  // Step 2: Apply emphasis markers
  processed = applyEmphasis(processed, config.emphasisMarkers);

  // Step 3: Wrap in prosody rate tag
  const ratePercent = Math.round((effectiveWpm / 160) * 100); // 160 WPM = 100% rate
  processed = `<prosody rate="${ratePercent}%">${processed}</prosody>`;

  // Calculate pause points (before wrapping in prosody tag shifts them)
  const pausePoints = getPausePoints(processed);

  // Calculate word count from original text (without markers)
  const wordCount = countWords(text);

  // Calculate estimated duration:
  // Base duration from WPM + additional time for pauses
  const pauseCount = (processed.match(/\[pause:\d+ms\]/g) || []).length;
  const pauseDurationSec = (pauseCount * 400) / 1000; // 400ms per pause
  const baseDuration = wordCount > 0 ? (wordCount / effectiveWpm) * 60 : 0;
  const estimatedDuration = baseDuration + pauseDurationSec;

  return {
    processedText: processed,
    estimatedWpm: effectiveWpm,
    estimatedDuration: Math.round(estimatedDuration * 100) / 100, // round to 2 decimals
    pausePoints,
  };
}
