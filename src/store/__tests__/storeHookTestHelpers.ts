import type { ScriptSegment } from '../../types';

/** Segments with hook language that passes script quality-gate checks in tests. */
export function makeHookSafeSegments(count = 2): ScriptSegment[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `seg-${i}`,
    type: (i === 0 ? 'intro' : 'section') as ScriptSegment['type'],
    title: `Segment ${i}`,
    narration:
      i === 0
        ? 'Your money and passwords could be stolen by hackers unless you act now.'
        : `Narration text for segment ${i} with protect and safe steps.`,
    visualNote: 'Some visual note',
    duration: 10,
  }));
}
