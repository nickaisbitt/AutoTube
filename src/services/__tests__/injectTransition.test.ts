import { describe, it, expect } from 'vitest';
import { injectTransitionIfMissing } from '../llm/index';
import type { ScriptSegment } from '../../types';

/**
 * Unit tests for injectTransitionIfMissing — the post-parse safety net
 * that ensures scripts with >4 segments include a transition segment.
 *
 * Validates: Requirement 1.2
 */

function makeSegment(overrides: Partial<ScriptSegment> = {}): ScriptSegment {
  return {
    id: Math.random().toString(36).substring(2, 11),
    type: 'section',
    title: 'Test Segment',
    narration: 'Some narration text.',
    visualNote: 'B-roll footage',
    duration: 20,
    ...overrides,
  };
}

describe('injectTransitionIfMissing', () => {
  it('returns segments unchanged when there are 4 or fewer segments', () => {
    const segments = [
      makeSegment({ type: 'intro', title: 'Hook' }),
      makeSegment({ title: 'Body 1' }),
      makeSegment({ title: 'Body 2' }),
      makeSegment({ type: 'outro', title: 'Close' }),
    ];
    const result = injectTransitionIfMissing(segments);
    expect(result).toEqual(segments);
    expect(result.length).toBe(4);
  });

  it('returns segments unchanged when a transition already exists', () => {
    const segments = [
      makeSegment({ type: 'intro', title: 'Hook' }),
      makeSegment({ title: 'Body 1' }),
      makeSegment({ type: 'transition', title: 'Bridge' }),
      makeSegment({ title: 'Body 2' }),
      makeSegment({ title: 'Body 3' }),
      makeSegment({ type: 'outro', title: 'Close' }),
    ];
    const result = injectTransitionIfMissing(segments);
    expect(result).toEqual(segments);
    expect(result.length).toBe(6);
  });

  it('injects a transition at the midpoint when >4 segments and none are transitions', () => {
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
    const injected = result[midpoint];
    expect(injected.type).toBe('transition');
    expect(injected.title).toBe('The Turning Point');
    expect(injected.duration).toBe(15);
    expect(injected.chapterLabel).toBe('The Pivot');
    expect(injected.visualNote).toBe('Pattern break — contrasting imagery, text overlay');
  });

  it('uses surrounding segment titles in the narration bridge', () => {
    const segments = [
      makeSegment({ type: 'intro', title: 'The Rise' }),
      makeSegment({ title: 'Market Forces' }),
      makeSegment({ title: 'The Fallout' }),
      makeSegment({ title: 'Who Benefits' }),
      makeSegment({ type: 'outro', title: 'Final Take' }),
    ];
    const result = injectTransitionIfMissing(segments);
    const midpoint = Math.floor(segments.length / 2); // 2
    const injected = result[midpoint];

    // The narration should reference the previous and next segment titles
    expect(injected.narration).toContain('Market Forces');
    expect(injected.narration).toContain('The Fallout');
  });

  it('inserts at the correct midpoint for 6 segments', () => {
    const segments = [
      makeSegment({ type: 'intro', title: 'Hook' }),
      makeSegment({ title: 'A' }),
      makeSegment({ title: 'B' }),
      makeSegment({ title: 'C' }),
      makeSegment({ title: 'D' }),
      makeSegment({ type: 'outro', title: 'Close' }),
    ];
    const result = injectTransitionIfMissing(segments);
    expect(result.length).toBe(7);

    // midpoint = Math.floor(6/2) = 3
    expect(result[3].type).toBe('transition');
    // Original segments before midpoint are preserved
    expect(result[0].title).toBe('Hook');
    expect(result[1].title).toBe('A');
    expect(result[2].title).toBe('B');
    // Original segments after midpoint are shifted
    expect(result[4].title).toBe('C');
    expect(result[5].title).toBe('D');
    expect(result[6].title).toBe('Close');
  });

  it('does not mutate the original segments array', () => {
    const segments = [
      makeSegment({ type: 'intro', title: 'Hook' }),
      makeSegment({ title: 'Body 1' }),
      makeSegment({ title: 'Body 2' }),
      makeSegment({ title: 'Body 3' }),
      makeSegment({ type: 'outro', title: 'Close' }),
    ];
    const originalLength = segments.length;
    injectTransitionIfMissing(segments);
    expect(segments.length).toBe(originalLength);
  });

  it('injected transition has a valid id', () => {
    const segments = [
      makeSegment({ type: 'intro' }),
      makeSegment(),
      makeSegment(),
      makeSegment(),
      makeSegment({ type: 'outro' }),
    ];
    const result = injectTransitionIfMissing(segments);
    const midpoint = Math.floor(segments.length / 2);
    const injected = result[midpoint];
    expect(typeof injected.id).toBe('string');
    expect(injected.id.length).toBeGreaterThan(0);
  });
});
