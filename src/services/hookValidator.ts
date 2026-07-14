/**
 * Hook Validator
 *
 * Validates that generated scripts contain a proper hook in the intro segment.
 * Detects hook patterns, enforces word count constraints, and generates
 * template-based hooks when no LLM is available.
 *
 * Aligned with Video Watcher auditHookFromScript + videoQualityChecklist GENERIC_HOOK_PHRASES.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */

import type { ScriptSegment } from '../types';
import { GENERIC_HOOK_PHRASES } from './videoQualityChecklist';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HookPattern =
  | 'surprising_statistic'
  | 'provocative_question'
  | 'personal_stakes'
  | 'counterintuitive_claim';

export interface HookValidationResult {
  /** Whether a valid hook pattern was detected (and opener is not weak/filler) */
  hasHook: boolean;
  /** The detected hook pattern, or null if none found */
  pattern: HookPattern | null;
  /** The identified hook sentence(s) */
  hookText: string;
  /** Total word count of the intro segment narration */
  wordCount: number;
  /** Whether word count is within the 40–60 target range */
  isWithinTarget: boolean;
  /** True when opener matches year/filler/generic bans (watcher + checklist) */
  weakOpener: boolean;
  /** Human-readable reason when weakOpener is true */
  weakOpenerReason: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum word count for intro segments */
export const MIN_WORD_COUNT = 40;

/** Maximum word count for intro segments */
export const MAX_WORD_COUNT = 60;

/** On-screen hook overlay max words (shock hook line) */
export const MAX_HOOK_OVERLAY_WORDS = 8;

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

/** Filler openers — matches powers/video-watcher auditHookFromScript */
const WEAK_OPENER_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  {
    re: /^in\s+(?:late\s+|early\s+|mid-?)?(19|20)\d{2}\b/i,
    reason: 'Script opens with a year ("In 2024…") — weak for YouTube hook',
  },
  {
    re: /^in\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+(19|20)\d{2}\b/i,
    reason: 'Script opens with a month+year ("In January 2025…") — weak for YouTube hook',
  },
  {
    re: /^(on\s+(?:\w+\s+)?\d{1,2},?\s+\d{4}|as\s+of\s+\w+\s+\d{4})\b/i,
    reason: 'Script opens with a date ("On March 12, 2024…") — weak for YouTube hook',
  },
  {
    re: /^(in this video|today we|let me explain|welcome)\b/i,
    reason: 'Script opens with filler, not stakes',
  },
];

// ---------------------------------------------------------------------------
// Weak opener / overlay helpers
// ---------------------------------------------------------------------------

/**
 * Returns whether the narration opens with a banned year/filler/generic phrase.
 * Matches Video Watcher script audit + GENERIC_HOOK_PHRASES checklist.
 */
export function hasWeakHookOpener(text: string): { weak: boolean; reason: string | null } {
  const trimmed = (text || '').trim();
  if (!trimmed) {
    return { weak: true, reason: 'No opening narration found' };
  }

  const firstSentence = trimmed.split(/(?<=[.!?])\s+/)[0] || trimmed;
  for (const { re, reason } of WEAK_OPENER_PATTERNS) {
    if (re.test(firstSentence.trim())) {
      return { weak: true, reason };
    }
  }

  const lower = trimmed.toLowerCase();
  const match = GENERIC_HOOK_PHRASES.find((p) => lower.includes(p));
  if (match) {
    return {
      weak: true,
      reason: `Opening uses generic phrase "${match}" — rewrite with personal-stakes hook`,
    };
  }

  return { weak: false, reason: null };
}

/**
 * Truncates a spoken hook to a short on-screen overlay (≤ {@link MAX_HOOK_OVERLAY_WORDS} words).
 */
export function buildShortHookOverlay(text: string, maxWords = MAX_HOOK_OVERLAY_WORDS): string {
  const words = (text || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'Watch this.';
  if (words.length <= maxWords) return words.join(' ');
  return words.slice(0, maxWords).join(' ');
}

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

  const weak = hasWeakHookOpener(narration);
  const pattern = weak.weak ? null : detectHookPattern(narration);
  const hookText = pattern ? getFirstNSentences(narration, 2) : '';

  return {
    hasHook: pattern !== null && !weak.weak,
    pattern,
    hookText,
    wordCount,
    isWithinTarget,
    weakOpener: weak.weak,
    weakOpenerReason: weak.reason,
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
