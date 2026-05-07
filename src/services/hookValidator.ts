/**
 * Hook Validator
 *
 * Validates that generated scripts contain a proper hook in the intro segment.
 * Detects hook patterns, enforces word count constraints, and generates
 * template-based hooks when no LLM is available.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */

import type { ScriptSegment } from '../types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HookPattern =
  | 'surprising_statistic'
  | 'provocative_question'
  | 'personal_stakes'
  | 'counterintuitive_claim';

export interface HookValidationResult {
  /** Whether a valid hook pattern was detected */
  hasHook: boolean;
  /** The detected hook pattern, or null if none found */
  pattern: HookPattern | null;
  /** The identified hook sentence(s) */
  hookText: string;
  /** Total word count of the intro segment narration */
  wordCount: number;
  /** Whether word count is within the 40–60 target range */
  isWithinTarget: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum word count for intro segments */
export const MIN_WORD_COUNT = 40;

/** Maximum word count for intro segments */
export const MAX_WORD_COUNT = 60;

/** Patterns indicating a surprising statistic (numbers, percentages, dollar amounts) */
const STATISTIC_PATTERNS = [
  /\d+%/,                          // percentages
  /\$[\d,.]+/,                     // dollar amounts
  /\d{1,3}(,\d{3})+/,             // large numbers with commas
  /\d+(\.\d+)?\s*(billion|million|trillion|thousand)/i, // numbers with magnitude
  /\d+(\.\d+)?x/,                 // multipliers like 10x
];

/** Words/phrases indicating personal stakes (you/your language) */
const PERSONAL_STAKES_PATTERNS = [
  /\byou\b/i,
  /\byour\b/i,
  /\byou're\b/i,
  /\byou've\b/i,
  /\byourself\b/i,
];

/** Words/phrases indicating counterintuitive claims */
const COUNTERINTUITIVE_PATTERNS = [
  /\bbut\b/i,
  /\bhowever\b/i,
  /\bactually\b/i,
  /\bcontrary\b/i,
  /\bsurprisingly\b/i,
  /\bunexpectedly\b/i,
  /\bironic(ally)?\b/i,
];

// ---------------------------------------------------------------------------
// Hook Pattern Detection
// ---------------------------------------------------------------------------

/**
 * Detects the hook pattern used in a text.
 *
 * Identifies one of four patterns:
 * - surprising_statistic: Contains numbers, percentages, or dollar amounts
 * - provocative_question: Contains a question mark in the first 2 sentences
 * - personal_stakes: Uses you/your language to address the viewer directly
 * - counterintuitive_claim: Uses but/however/actually to set up a twist
 *
 * @param text - The text to analyze for hook patterns
 * @returns The detected HookPattern, or null if no pattern is found
 */
export function detectHookPattern(text: string): HookPattern | null {
  if (!text || text.trim().length === 0) return null;

  const firstTwoSentences = getFirstNSentences(text, 2);

  // Check for surprising statistic (numbers/percentages in first 2 sentences)
  for (const pattern of STATISTIC_PATTERNS) {
    if (pattern.test(firstTwoSentences)) {
      return 'surprising_statistic';
    }
  }

  // Check for provocative question (question marks in first 2 sentences)
  if (firstTwoSentences.includes('?')) {
    return 'provocative_question';
  }

  // Check for personal stakes (you/your language)
  for (const pattern of PERSONAL_STAKES_PATTERNS) {
    if (pattern.test(firstTwoSentences)) {
      return 'personal_stakes';
    }
  }

  // Check for counterintuitive claim (but/however/actually patterns)
  for (const pattern of COUNTERINTUITIVE_PATTERNS) {
    if (pattern.test(firstTwoSentences)) {
      return 'counterintuitive_claim';
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Hook Validation
// ---------------------------------------------------------------------------

/**
 * Validates an intro segment for hook presence, pattern, and word count.
 *
 * @param introSegment - The script segment to validate (should be type 'intro')
 * @returns HookValidationResult with pattern detection, word count, and compliance
 */
export function validateHook(introSegment: ScriptSegment): HookValidationResult {
  const narration = introSegment.narration || '';
  const wordCount = countWords(narration);
  const isWithinTarget = wordCount >= MIN_WORD_COUNT && wordCount <= MAX_WORD_COUNT;

  const pattern = detectHookPattern(narration);
  const hookText = pattern ? getFirstNSentences(narration, 2) : '';

  return {
    hasHook: pattern !== null,
    pattern,
    hookText,
    wordCount,
    isWithinTarget,
  };
}

// ---------------------------------------------------------------------------
// Template Hook Generation
// ---------------------------------------------------------------------------

/**
 * Generates a template-based hook containing the topic name.
 *
 * Used when no LLM API key is available. Produces hooks that embed the topic
 * name and use the specified pattern for urgency framing.
 *
 * @param topic - The video topic to embed in the hook
 * @param pattern - The hook pattern to use for generation
 * @returns A template hook string containing the topic name
 */
export function generateTemplateHook(topic: string, pattern: HookPattern): string {
  const trimmedTopic = topic.trim();

  switch (pattern) {
    case 'surprising_statistic':
      return `In the last 12 months, ${trimmedTopic} has grown by over 300%, reshaping entire industries overnight. Most people have no idea how this happened or what it means for the future. Here's the untold story behind the numbers that Wall Street doesn't want you to know.`;

    case 'provocative_question':
      return `What if everything you thought you knew about ${trimmedTopic} was completely wrong? The truth is far more surprising than the headlines suggest. In the next few minutes, we'll uncover the hidden reality that changes everything.`;

    case 'personal_stakes':
      return `Whether you realize it or not, ${trimmedTopic} is already affecting your daily life in ways you can't ignore. Your money, your career, and your future are all connected to what's happening right now. Here's what you need to know before it's too late.`;

    case 'counterintuitive_claim':
      return `Everyone assumes ${trimmedTopic} is heading in one direction. But the reality is actually the complete opposite of what experts predicted. The data tells a story that contradicts everything the mainstream media has been reporting.`;
  }
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/**
 * Counts the number of words in a text string.
 * Words are defined as sequences of non-whitespace characters.
 */
function countWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
}

/**
 * Extracts the first N sentences from a text.
 * Sentences are split on period, exclamation mark, or question mark
 * followed by a space or end of string.
 */
function getFirstNSentences(text: string, n: number): string {
  const trimmed = text.trim();
  if (trimmed.length === 0) return '';

  // Split on sentence-ending punctuation followed by space or end
  const sentenceEndings = /([.!?])(?:\s|$)/g;
  const sentences: string[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = sentenceEndings.exec(trimmed)) !== null) {
    sentences.push(trimmed.slice(lastIndex, match.index + 1));
    lastIndex = match.index + match[0].length;
    if (sentences.length >= n) break;
  }

  // If we didn't find enough sentence endings, include the remaining text
  if (sentences.length < n && lastIndex < trimmed.length) {
    sentences.push(trimmed.slice(lastIndex));
  }

  return sentences.slice(0, n).join(' ').trim();
}
