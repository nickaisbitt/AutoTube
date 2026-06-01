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
    return JSON.parse(stripTrailingCommas(trimmed));
  } catch {
    // continue to next strategy
  }

  // Strategy 2: Strip markdown fences with flexible regex (not anchored to ^/$)
  const fenceRegex = /```(?:json|javascript|js)?\s*\n?([\s\S]*?)\n?\s*```/;
  const fenceMatch = trimmed.match(fenceRegex);
  if (fenceMatch) {
    const fenceContent = stripTrailingCommas(fenceMatch[1].trim());
    try {
      return JSON.parse(fenceContent);
    } catch {
      // continue to next strategy
    }
  }

  // Strategy 3: Find first `{`/last `}` or first `[`/last `]` and try parsing
  const extracted = extractBracketedSubstring(trimmed);
  if (extracted) {
    const cleaned = stripTrailingCommas(extracted);
    try {
      return JSON.parse(cleaned);
    } catch {
      // continue to next strategy
    }

    // Strategy 4: Apply repairTruncatedJson to the extracted substring
    try {
      const repaired = repairTruncatedJson(cleaned);
      return JSON.parse(repaired);
    } catch {
      // continue to next strategy
    }
  }

  // Strategy 5: Handle multiple JSON objects/arrays concatenated in one response
  const multiResult = tryParseMultipleJson(trimmed);
  if (multiResult !== null) {
    return multiResult;
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

/**
 * Strips trailing commas before `}` or `]` in a JSON string.
 * Uses a character-by-character scan to avoid modifying commas
 * inside string values.
 */
function stripTrailingCommas(input: string): string {
  let result = '';
  let inString = false;
  let escaped = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (escaped) {
      result += char;
      escaped = false;
      continue;
    }

    if (char === '\\' && inString) {
      result += char;
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      result += char;
      continue;
    }

    if (!inString && char === ',') {
      let j = i + 1;
      while (j < input.length && /\s/.test(input[j])) j++;
      if (j < input.length && (input[j] === '}' || input[j] === ']')) {
        continue;
      }
    }

    result += char;
  }

  return result;
}

/**
 * Attempts to parse multiple JSON objects or arrays concatenated in one string.
 * Tries splitting by `}{` or `][` boundaries and parsing each individually.
 * Returns an array of parsed values if at least one succeeds, or null.
 */
function tryParseMultipleJson(input: string): unknown[] | null {
  const results: unknown[] = [];

  // Try splitting concatenated objects: }{ boundary
  if (input.includes('}{')) {
    const parts = splitJsonBoundaries(input, '}{');
    for (const part of parts) {
      try {
        results.push(JSON.parse(stripTrailingCommas(part)));
      } catch {
        // skip unparseable parts
      }
    }
  }

  // Try splitting concatenated arrays: ][ boundary
  if (results.length === 0 && input.includes('][')) {
    const parts = splitJsonBoundaries(input, '][');
    for (const part of parts) {
      try {
        results.push(JSON.parse(stripTrailingCommas(part)));
      } catch {
        // skip unparseable parts
      }
    }
  }

  return results.length > 0 ? results : null;
}

/**
 * Splits a string at JSON boundary points (e.g., `}{` or `][`).
 * Re-inserts the closing bracket on the left part and the opening bracket on the right part.
 */
function splitJsonBoundaries(input: string, boundary: string): string[] {
  const parts: string[] = [];
  let remaining = input;
  while (remaining.includes(boundary)) {
    const idx = remaining.indexOf(boundary);
    parts.push(remaining.slice(0, idx + 1));
    remaining = remaining.slice(idx + 1);
  }
  parts.push(remaining);
  return parts;
}
