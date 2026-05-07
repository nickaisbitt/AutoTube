// ============================================================================
// extractJson — Robust JSON extraction from LLM responses
// ============================================================================

import { repairTruncatedJson } from './jsonRepair';

/**
 * Extract and parse JSON from an LLM response string that may contain
 * markdown fences, surrounding prose, or truncated content.
 *
 * Strategies (tried in order):
 * 1. Direct JSON.parse (fast path for clean JSON)
 * 2. Strip markdown fences (flexible regex, not anchored to ^/$)
 * 3. Find first `{`/last `}` or first `[`/last `]` and parse that substring
 * 4. Apply repairTruncatedJson to the extracted substring for truncation recovery
 *
 * Returns the parsed value or null if all strategies fail.
 */
export function extractJson(input: string): unknown | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Strategy 1: Try JSON.parse directly (fast path for clean JSON)
  try {
    return JSON.parse(trimmed);
  } catch {
    // continue to next strategy
  }

  // Strategy 2: Strip markdown fences with flexible regex (not anchored to ^/$)
  const fenceRegex = /```(?:json|javascript|js)?\s*\n?([\s\S]*?)\n?\s*```/;
  const fenceMatch = trimmed.match(fenceRegex);
  if (fenceMatch) {
    const fenceContent = fenceMatch[1].trim();
    try {
      return JSON.parse(fenceContent);
    } catch {
      // continue to next strategy
    }
  }

  // Strategy 3: Find first `{`/last `}` or first `[`/last `]` and try parsing
  const extracted = extractBracketedSubstring(trimmed);
  if (extracted) {
    try {
      return JSON.parse(extracted);
    } catch {
      // continue to next strategy
    }

    // Strategy 4: Apply repairTruncatedJson to the extracted substring
    try {
      const repaired = repairTruncatedJson(extracted);
      return JSON.parse(repaired);
    } catch {
      // all strategies failed
    }
  }

  return null;
}

/**
 * Find the outermost JSON object or array in a string by locating
 * the first `{`/last `}` or first `[`/last `]`.
 *
 * Returns the substring or null if no brackets found.
 */
function extractBracketedSubstring(input: string): string | null {
  const firstBrace = input.indexOf('{');
  const firstBracket = input.indexOf('[');

  // Determine which comes first (or which exists)
  let start: number;
  let end: number;

  if (firstBrace === -1 && firstBracket === -1) {
    return null;
  }

  if (firstBrace === -1) {
    // Only brackets
    start = firstBracket;
    end = input.lastIndexOf(']');
  } else if (firstBracket === -1) {
    // Only braces
    start = firstBrace;
    end = input.lastIndexOf('}');
  } else if (firstBrace < firstBracket) {
    // Brace comes first
    start = firstBrace;
    end = input.lastIndexOf('}');
  } else {
    // Bracket comes first
    start = firstBracket;
    end = input.lastIndexOf(']');
  }

  if (end <= start) {
    return null;
  }

  return input.slice(start, end + 1);
}
