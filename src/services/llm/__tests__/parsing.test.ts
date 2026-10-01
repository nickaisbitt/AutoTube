import { describe, it, expect } from 'vitest';
import {
  sanitiseTopic,
  validateSegment,
  parseSegmentsFromContent,
  stripPartLabels,
  injectTransitionIfMissing,
} from '../parsing';
import type { ScriptSegment } from '../../../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSegment(overrides: Partial<ScriptSegment> = {}): ScriptSegment {
  return {
    id: 'test-id',
    type: 'section',
    title: 'Test Segment',
    narration: 'Some narration text.',
    visualNote: 'B-roll footage',
    duration: 20,
    ...overrides,
  };
}

// ===========================================================================
// 1. sanitiseTopic
// ===========================================================================

describe('sanitiseTopic', () => {
  it('strips backticks from the topic', () => {
    expect(sanitiseTopic('`hello` world')).toBe('hello world');
  });

  it('strips double-quotes from the topic', () => {
    expect(sanitiseTopic('"The Rise" of AI')).toBe('The Rise of AI');
  });

  it('strips backslashes from the topic', () => {
    expect(sanitiseTopic('path\\to\\topic')).toBe('pathtotopic');
  });

  it('strips all special characters combined', () => {
    expect(sanitiseTopic('`"test\\value"`')).toBe('testvalue');
  });

  it('caps length at 200 characters', () => {
    const longTopic = 'a'.repeat(300);
    const result = sanitiseTopic(longTopic);
    expect(result.length).toBe(200);
  });

  it('trims whitespace from the result', () => {
    expect(sanitiseTopic('  hello world  ')).toBe('hello world');
  });

  it('handles empty string', () => {
    expect(sanitiseTopic('')).toBe('');
  });

  it('handles string that becomes empty after stripping', () => {
    expect(sanitiseTopic('`"\\"`')).toBe('');
  });

  it('preserves normal characters', () => {
    expect(sanitiseTopic('The Rise of Nvidia')).toBe('The Rise of Nvidia');
  });
});

// ===========================================================================
// 2. validateSegment
// ===========================================================================

describe('validateSegment', () => {
  it('returns a valid segment with all fields when input is complete', () => {
    const raw = {
      type: 'intro',
      title: 'My Title',
      narration: 'Some narration.',
      visualNote: 'Visual note here.',
      duration: 15,
      chapterLabel: 'Chapter 1',
    };
    const result = validateSegment(raw, 0);
    expect(result.type).toBe('intro');
    expect(result.title).toBe('My Title');
    expect(result.narration).toBe('Some narration.');
    expect(result.visualNote).toBe('Visual note here.');
    expect(result.duration).toBe(15);
    expect(result.chapterLabel).toBe('Chapter 1');
    expect(result.id).toBeDefined();
    expect(result.id.length).toBeGreaterThan(0);
  });

  it('defaults type to "section" for missing type', () => {
    const result = validateSegment({ title: 'Test', narration: 'N', visualNote: 'V', duration: 10 }, 0);
    expect(result.type).toBe('section');
  });

  it('defaults type to "section" for invalid type', () => {
    const result = validateSegment({ type: 'invalid', title: 'T', narration: 'N', visualNote: 'V', duration: 10 }, 0);
    expect(result.type).toBe('section');
  });

  it('defaults title to "Segment N" when title is missing', () => {
    const result = validateSegment({ type: 'section', narration: 'N', visualNote: 'V', duration: 10 }, 2);
    expect(result.title).toBe('Segment 3');
  });

  it('defaults title to "Segment N" when title is empty string', () => {
    const result = validateSegment({ type: 'section', title: '', narration: 'N', visualNote: 'V', duration: 10 }, 0);
    expect(result.title).toBe('Segment 1');
  });

  it('defaults title to "Segment N" when title is whitespace-only', () => {
    const result = validateSegment({ type: 'section', title: '   ', narration: 'N', visualNote: 'V', duration: 10 }, 4);
    expect(result.title).toBe('Segment 5');
  });

  it('defaults narration to "title." when narration is missing', () => {
    const result = validateSegment({ type: 'section', title: 'My Title', visualNote: 'V', duration: 10 }, 0);
    expect(result.narration).toBe('My Title.');
  });

  it('defaults narration to "title." when narration is empty', () => {
    const result = validateSegment({ type: 'section', title: 'Hello', narration: '', visualNote: 'V', duration: 10 }, 0);
    expect(result.narration).toBe('Hello.');
  });

  it('defaults duration to 10 for invalid (NaN) duration', () => {
    const result = validateSegment({ type: 'section', title: 'T', narration: 'N', visualNote: 'V', duration: NaN }, 0);
    expect(result.duration).toBe(10);
  });

  it('defaults duration to 10 for zero duration', () => {
    const result = validateSegment({ type: 'section', title: 'T', narration: 'N', visualNote: 'V', duration: 0 }, 0);
    expect(result.duration).toBe(10);
  });

  it('defaults duration to 10 for negative duration', () => {
    const result = validateSegment({ type: 'section', title: 'T', narration: 'N', visualNote: 'V', duration: -5 }, 0);
    expect(result.duration).toBe(10);
  });

  it('defaults duration to 10 for Infinity', () => {
    const result = validateSegment({ type: 'section', title: 'T', narration: 'N', visualNote: 'V', duration: Infinity }, 0);
    expect(result.duration).toBe(10);
  });

  it('caps chapterLabel at 50 characters', () => {
    const longLabel = 'A'.repeat(80);
    const result = validateSegment({ type: 'section', title: 'T', narration: 'N', visualNote: 'V', duration: 10, chapterLabel: longLabel }, 0);
    expect(result.chapterLabel).toBe('A'.repeat(50));
  });

  it('omits chapterLabel when not provided', () => {
    const result = validateSegment({ type: 'section', title: 'T', narration: 'N', visualNote: 'V', duration: 10 }, 0);
    expect(result.chapterLabel).toBeUndefined();
  });

  it('throws for null input', () => {
    expect(() => validateSegment(null, 0)).toThrow(/not an object/);
  });

  it('throws for undefined input', () => {
    expect(() => validateSegment(undefined, 0)).toThrow(/not an object/);
  });

  it('throws for number input', () => {
    expect(() => validateSegment(42, 0)).toThrow(/not an object/);
  });

  it('throws for string input', () => {
    expect(() => validateSegment('hello', 0)).toThrow(/not an object/);
  });
});

// ===========================================================================
// 3. parseSegmentsFromContent
// ===========================================================================

describe('parseSegmentsFromContent', () => {
  const validSegment = { type: 'intro', title: 'Hook', narration: 'Welcome.', visualNote: 'Logo', duration: 10 };

  it('parses a valid JSON array of segments', () => {
    const content = JSON.stringify([validSegment]);
    const result = parseSegmentsFromContent(content);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('intro');
    expect(result[0].title).toBe('Hook');
  });

  it('parses JSON wrapped in markdown code fences', () => {
    const content = '```json\n' + JSON.stringify([validSegment]) + '\n```';
    const result = parseSegmentsFromContent(content);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('intro');
  });

  it('parses { "segments": [...] } wrapper format', () => {
    const content = JSON.stringify({ segments: [validSegment] });
    const result = parseSegmentsFromContent(content);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Hook');
  });

  it('parses malformed JSON that can be repaired (unclosed array, no complete object)', () => {
    // This exercises the "last resort" repair path where no array/object regex matches
    // but repairTruncatedJson can close the brackets
    const content = '[{"type":"section","title":"Test","narration":"Hello","visualNote":"V","duration":10';
    const result = parseSegmentsFromContent(content);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Test');
  });

  it('throws on empty array', () => {
    expect(() => parseSegmentsFromContent('[]')).toThrow(/empty/i);
  });

  it('throws on non-JSON content', () => {
    expect(() => parseSegmentsFromContent('This is just plain text with no JSON.')).toThrow();
  });

  it('parses multiple segments correctly', () => {
    const segments = [
      { type: 'intro', title: 'Start', narration: 'Begin.', visualNote: 'Logo', duration: 5 },
      { type: 'section', title: 'Middle', narration: 'Content.', visualNote: 'B-roll', duration: 20 },
      { type: 'outro', title: 'End', narration: 'Goodbye.', visualNote: 'Credits', duration: 8 },
    ];
    const result = parseSegmentsFromContent(JSON.stringify(segments));
    expect(result).toHaveLength(3);
    expect(result[0].type).toBe('intro');
    expect(result[1].type).toBe('section');
    expect(result[2].type).toBe('outro');
  });

  it('handles JSON embedded in prose text', () => {
    const json = JSON.stringify([validSegment]);
    const content = `Here is the script: ${json} That is all.`;
    const result = parseSegmentsFromContent(content);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('intro');
  });
});

// ===========================================================================
// 4. stripPartLabels
// ===========================================================================

describe('stripPartLabels', () => {
  it('removes "Part 1 of 7:" patterns', () => {
    const result = stripPartLabels('Part 1 of 7: The beginning of the story');
    expect(result).toBe('The beginning of the story');
  });

  it('removes "Section 3 of 5 —" patterns', () => {
    const result = stripPartLabels('Section 3 of 5 — The middle section');
    expect(result).toBe('The middle section');
  });

  it('removes "Segment 2:" patterns', () => {
    const result = stripPartLabels('Segment 2: Some content here');
    expect(result).toBe('Some content here');
  });

  it('removes patterns without "of N" part', () => {
    const result = stripPartLabels('Part 4: Just a part');
    expect(result).toBe('Just a part');
  });

  it('collapses double spaces after removal', () => {
    const result = stripPartLabels('Hello Part 1 of 3:  world');
    expect(result).not.toContain('  ');
  });

  it('is idempotent (applying twice gives same result)', () => {
    const input = 'Part 1 of 5: Section 2 of 3 — Hello world';
    const once = stripPartLabels(input);
    const twice = stripPartLabels(once);
    expect(twice).toBe(once);
  });

  it('returns unchanged text when no patterns are present', () => {
    const input = 'This is a normal sentence without any labels.';
    expect(stripPartLabels(input)).toBe(input);
  });

  it('handles empty string', () => {
    expect(stripPartLabels('')).toBe('');
  });
});

// ===========================================================================
// 5. injectTransitionIfMissing
// ===========================================================================

describe('injectTransitionIfMissing', () => {
  it('does nothing for ≤4 segments', () => {
    const segments = [
      makeSegment({ type: 'intro' }),
      makeSegment(),
      makeSegment(),
      makeSegment({ type: 'outro' }),
    ];
    const result = injectTransitionIfMissing(segments);
    expect(result).toEqual(segments);
    expect(result.length).toBe(4);
  });

  it('does nothing if a transition already exists', () => {
    const segments = [
      makeSegment({ type: 'intro' }),
      makeSegment(),
      makeSegment({ type: 'transition', title: 'Bridge' }),
      makeSegment(),
      makeSegment({ type: 'outro' }),
    ];
    const result = injectTransitionIfMissing(segments);
    expect(result).toEqual(segments);
    expect(result.length).toBe(5);
  });

  it('injects a transition at midpoint for >4 segments without one', () => {
    const segments = [
      makeSegment({ type: 'intro', title: 'Hook' }),
      makeSegment({ title: 'Body 1' }),
      makeSegment({ title: 'Body 2' }),
      makeSegment({ title: 'Body 3' }),
      makeSegment({ type: 'outro', title: 'Close' }),
    ];
    const result = injectTransitionIfMissing(segments);
    expect(result.length).toBe(6);

    const midpoint = Math.floor(segments.length / 2); // 2
    expect(result[midpoint].type).toBe('transition');
    expect(result[midpoint].title).toBe('The Turning Point');
    expect(result[midpoint].duration).toBe(15);
  });

  it('does not mutate the original array', () => {
    const segments = [
      makeSegment({ type: 'intro' }),
      makeSegment(),
      makeSegment(),
      makeSegment(),
      makeSegment({ type: 'outro' }),
    ];
    const originalLength = segments.length;
    injectTransitionIfMissing(segments);
    expect(segments.length).toBe(originalLength);
  });

  it('references surrounding segment titles in the injected narration', () => {
    const segments = [
      makeSegment({ type: 'intro', title: 'The Rise' }),
      makeSegment({ title: 'Market Forces' }),
      makeSegment({ title: 'The Fallout' }),
      makeSegment({ title: 'Who Benefits' }),
      makeSegment({ type: 'outro', title: 'Final Take' }),
    ];
    const result = injectTransitionIfMissing(segments);
    const midpoint = Math.floor(segments.length / 2);
    const injected = result[midpoint];
    expect(injected.narration).toContain('Market Forces');
    expect(injected.narration).toContain('The Fallout');
  });
});
