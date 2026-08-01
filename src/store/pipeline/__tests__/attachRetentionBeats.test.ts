import { describe, it, expect } from 'vitest';
import type { ScriptSegment } from '../../../types';
import type { RetentionBeat } from '../../../services/renderingShared';
import { attachRetentionBeatsToSegments } from '../orchestrator';

function makeSegment(id: string, duration: number): ScriptSegment {
  return {
    id,
    type: 'section',
    title: id,
    narration: 'Test narration for segment.',
    visualNote: '',
    duration,
  };
}

describe('attachRetentionBeatsToSegments', () => {
  it('maps absolute scheduler times to per-segment `time` for server render', () => {
    const segments = [makeSegment('a', 20), makeSegment('b', 30)];
    const beats: RetentionBeat[] = [
      { segmentIndex: 0, timeOffsetSec: 10, type: 'text_slam' },
      { segmentIndex: 1, timeOffsetSec: 35, type: 'visual_break' },
    ];

    attachRetentionBeatsToSegments(segments, beats);

    expect((segments[0] as ScriptSegment & { retentionBeats?: { time: number; type: string }[] }).retentionBeats).toEqual([
      { type: 'text_slam', time: 10 },
    ]);
    expect((segments[1] as ScriptSegment & { retentionBeats?: { time: number; type: string }[] }).retentionBeats).toEqual([
      { type: 'visual_break', time: 15 },
    ]);
  });

  it('initializes empty retentionBeats arrays on segments with no beats', () => {
    const segments = [makeSegment('a', 20), makeSegment('b', 30)];
    attachRetentionBeatsToSegments(segments, []);

    for (const seg of segments) {
      expect((seg as ScriptSegment & { retentionBeats?: unknown[] }).retentionBeats).toEqual([]);
    }
  });
});
