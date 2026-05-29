import { describe, it, expect } from 'vitest';
import { generateChapterMarkers, generateDetailedChapters } from '../chapters';
import type { ScriptSegment } from '../../types';

/** Helper to build a minimal ScriptSegment for testing. */
function makeSegment(overrides: Partial<ScriptSegment> & { title: string; duration: number }): ScriptSegment {
  return {
    id: 'seg-1',
    type: 'section',
    narration: 'Test narration.',
    visualNote: 'Test visual.',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// generateChapterMarkers
// ---------------------------------------------------------------------------

describe('generateChapterMarkers', () => {
  // 7.2 – single segment starting at 00:00
  it('formats a single segment starting at 00:00', () => {
    const segments: ScriptSegment[] = [makeSegment({ title: 'Intro', duration: 30 })];
    const result = generateChapterMarkers(segments);
    expect(result).toMatch(/^00:00 Why Intro Matters More Than You Think/);
  });

  // 7.3 – multiple segments produce correct cumulative timestamps
  it('produces correct cumulative timestamps for three 30-second segments', () => {
    const segments: ScriptSegment[] = [
      makeSegment({ id: 'seg-1', title: 'Part One', duration: 30 }),
      makeSegment({ id: 'seg-2', title: 'Part Two', duration: 30 }),
      makeSegment({ id: 'seg-3', title: 'Part Three', duration: 30 }),
    ];
    const result = generateChapterMarkers(segments);
    const lines = result.split('\n');

    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^00:00/);
    expect(lines[1]).toMatch(/^00:30/);
    expect(lines[2]).toMatch(/^01:00/);
  });

  // 7.4 – HH:MM:SS format when a segment's start time reaches or exceeds 3600 seconds
  it('uses HH:MM:SS format for a segment whose start time is >= 3600 seconds', () => {
    // First segment: 3600s duration → second segment starts at exactly 3600s
    const segments: ScriptSegment[] = [
      makeSegment({ id: 'seg-1', title: 'Long Intro', duration: 3600 }),
      makeSegment({ id: 'seg-2', title: 'After One Hour', duration: 60 }),
    ];
    const result = generateChapterMarkers(segments);
    const lines = result.split('\n');

    // The second segment starts at 3600s → should use HH:MM:SS
    expect(lines[1]).toMatch(/^01:00:00/);
  });

  // 7.5 – MM:SS format for durations under 3600 seconds total
  it('uses MM:SS format when total duration is under 3600 seconds', () => {
    const segments: ScriptSegment[] = [
      makeSegment({ id: 'seg-1', title: 'Opening', duration: 120 }),
      makeSegment({ id: 'seg-2', title: 'Main Content', duration: 300 }),
    ];
    const result = generateChapterMarkers(segments);
    const lines = result.split('\n');

    // All timestamps should be MM:SS (no HH: prefix)
    for (const line of lines) {
      // MM:SS pattern: exactly two digits, colon, two digits at the start
      expect(line).toMatch(/^\d{2}:\d{2} /);
      // Must NOT be HH:MM:SS (which would have a second colon in the timestamp)
      const timestamp = line.split(' ')[0];
      expect(timestamp.split(':').length).toBe(2);
    }
  });
});

// ---------------------------------------------------------------------------
// generateDetailedChapters
// ---------------------------------------------------------------------------

describe('generateDetailedChapters', () => {
  // 7.6 – each chapter line includes a type emoji
  it('includes a type emoji in each chapter line', () => {
    const segments: ScriptSegment[] = [
      makeSegment({ id: 'seg-1', type: 'intro', title: 'Introduction', duration: 30 }),
      makeSegment({ id: 'seg-2', type: 'section', title: 'Main Section', duration: 60 }),
      makeSegment({ id: 'seg-3', type: 'transition', title: 'Bridge', duration: 10 }),
      makeSegment({ id: 'seg-4', type: 'outro', title: 'Wrap Up', duration: 20 }),
    ];
    const result = generateDetailedChapters(segments);
    const lines = result.split('\n');

    expect(lines).toHaveLength(4);

    // Each line must contain at least one emoji character (Unicode range check)
    for (const line of lines) {
      // Emoji characters have code points above U+00FF; use a broad emoji regex
      expect(line).toMatch(/[\u{1F000}-\u{1FFFF}]|[\u{2600}-\u{27BF}]/u);
    }

    // Verify specific emojis for known types
    expect(lines[0]).toContain('🎬'); // intro
    expect(lines[1]).toContain('📖'); // section
    expect(lines[2]).toContain('➡️'); // transition
    expect(lines[3]).toContain('🏁'); // outro
  });

  it('uses fallback emoji 📌 for unknown segment types', () => {
    // Cast to bypass TypeScript's type check so we can test the fallback path
    const segments = [
      { ...makeSegment({ title: 'Unknown Type', duration: 30 }), type: 'unknown' as ScriptSegment['type'] },
    ];
    const result = generateDetailedChapters(segments);
    expect(result).toContain('📌');
  });
});
