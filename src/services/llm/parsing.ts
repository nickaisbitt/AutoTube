/**
 * Parsing utilities — segment parsing, validation, and topic sanitisation.
 */

import type { ScriptSegment } from '../../types';
import { repairTruncatedJson } from '../../utils/jsonRepair';

/**
 * HR-5 fix: sanitise user-supplied topic before interpolating into LLM prompts.
 * Strips backticks, double-quotes, backslashes and caps length to prevent prompt injection.
 */
export function sanitiseTopic(raw: string): string {
  return raw.replace(/[`"\\]/g, '').slice(0, 200).trim();
}

// ---------------------------------------------------------------------------
// Runtime validation helpers (lightweight, no external deps)
// ---------------------------------------------------------------------------

/**
 * Regex to match spoken part/section/segment labels in narration text.
 * Matches patterns like "Part 1 of 7:", "Section 3 of 5 —", "Segment 2:", etc.
 */
const PART_LABEL_REGEX = /\b(?:Part|Section|Segment)\s+\d+\s*(?:of\s+\d+)?[:\s\-–—]*/gi;

/**
 * Strips "Part X of Y", "Section X of Y", "Segment X" and similar structural
 * labels from narration text. Collapses resulting double spaces and trims.
 *
 * Requirement 2.1 — regex-based removal of structural labels.
 * Requirement 2.3 — idempotent: applying twice yields the same result as once.
 */
export function stripPartLabels(narration: string): string {
  const cleaned = narration.replace(PART_LABEL_REGEX, '').trim();
  return cleaned.replace(/\s{2,}/g, ' ');
}

const VALID_SEGMENT_TYPES = new Set(['intro', 'section', 'transition', 'outro']);

/**
 * Safety net: if the LLM produced >4 segments but forgot to include a
 * transition segment, inject one at the midpoint. The prompt already asks
 * for transitions, but the LLM sometimes ignores it.
 *
 * Requirement 1.2 — scripts with >4 segments must include a transition.
 */
export function injectTransitionIfMissing(segments: ScriptSegment[]): ScriptSegment[] {
  if (segments.length <= 4) return segments;
  if (segments.some((s) => s.type === 'transition')) return segments;

  const midpoint = Math.floor(segments.length / 2);
  const prevSegment = segments[midpoint - 1];
  const nextSegment = segments[midpoint];

  const prevTopic = prevSegment?.title ?? 'what came before';
  const nextTopic = nextSegment?.title ?? 'what comes next';

  const transition: ScriptSegment = {
    id: Math.random().toString(36).substring(2, 11),
    type: 'transition',
    title: 'The Turning Point',
    narration: `So we've seen ${prevTopic}. But the real question is: what happens next? And that answer might surprise you. Let's shift gears and look at ${nextTopic}.`,
    visualNote: 'Pattern break — contrasting imagery, text overlay',
    duration: 15,
    chapterLabel: 'The Pivot',
  };

  const result = [...segments];
  result.splice(midpoint, 0, transition);
  return result;
}

/**
 * Validates a raw segment object from LLM output into a typed ScriptSegment.
 */
export function validateSegment(raw: unknown, index: number): ScriptSegment {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`Segment ${index} is not an object`);
  }
  const s = raw as Record<string, unknown>;

  const type = VALID_SEGMENT_TYPES.has(String(s.type)) ? (s.type as ScriptSegment['type']) : 'section';
  const title = typeof s.title === 'string' && s.title.trim() ? s.title.trim() : `Segment ${index + 1}`;

  // Sanitize narration: strip part labels first (Requirement 2.2), then trim
  const rawNarration =
    typeof s.narration === 'string' && s.narration.trim()
      ? s.narration.trim()
      : `${title}.`;
  const narration = stripPartLabels(rawNarration);

  const visualNote =
    typeof s.visualNote === 'string' && s.visualNote.trim()
      ? s.visualNote.trim()
      : 'Relevant B-roll footage';
  const rawDuration = Number(s.duration);
  const duration = Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : 10;

  // Validate chapterLabel: trim and cap at 50 characters (Requirement 2.6)
  const chapterLabel =
    typeof s.chapterLabel === 'string' && s.chapterLabel.trim()
      ? s.chapterLabel.trim().slice(0, 50)
      : undefined;

  return {
    id: Math.random().toString(36).substring(2, 11),
    type,
    title,
    narration,
    visualNote,
    duration,
    ...(chapterLabel !== undefined && { chapterLabel }),
  };
}

/**
 * Parses raw LLM content string into an array of validated ScriptSegments.
 */
export function parseSegmentsFromContent(content: string): ScriptSegment[] {
  // Strip markdown code fences if present
  const cleaned = content.replace(/```json/g, '').replace(/```/g, '').trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Try to extract a JSON array or object from the string
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    const objectMatch = cleaned.match(/\{[\s\S]*\}/);
    const jsonStr = arrayMatch?.[0] ?? objectMatch?.[0];
    if (jsonStr) {
      try {
        parsed = JSON.parse(jsonStr);
      } catch {
        // Try to repair truncated JSON by closing open brackets/braces
        parsed = JSON.parse(repairTruncatedJson(jsonStr));
      }
    } else {
      // Last resort: try to repair the whole cleaned string
      try {
        parsed = JSON.parse(repairTruncatedJson(cleaned));
      } catch {
        throw new Error('AI returned no parseable JSON');
      }
    }
  }

  // Handle { "segments": [...] } wrapper or bare array
  const rawArray: unknown[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as Record<string, unknown>).segments)
      ? ((parsed as Record<string, unknown>).segments as unknown[])
      : [];

  if (rawArray.length === 0) throw new Error('AI returned an empty segments array');

  return rawArray.map((s, i) => validateSegment(s, i));
}
