import { describe, it, expect } from 'vitest';
import type { VideoProject, EditPlan } from '../../../types';
import { segmentDurationForProject, segmentIndexAtTime } from '../usePlayback';

function makeProject(editPlan?: EditPlan): VideoProject {
  return {
    version: 1,
    id: 'p1',
    title: 'T',
    topic: 'T',
    style: 'business_insider',
    targetDuration: 30,
    script: [
      { id: 'seg-1', type: 'intro', title: 'A', narration: 'a', visualNote: 'v', duration: 10 },
      { id: 'seg-2', type: 'section', title: 'B', narration: 'b', visualNote: 'v', duration: 15 },
      { id: 'seg-3', type: 'outro', title: 'C', narration: 'c', visualNote: 'v', duration: 5 },
    ],
    media: [],
    narration: [],
    status: 'complete',
    createdAt: new Date(),
    editPlan,
  };
}

describe('usePlayback editPlan segment timing', () => {
  it('segmentIndexAtTime uses adjustedDuration boundaries', () => {
    const project = makeProject({
      segments: [
        { segmentId: 'seg-1', shotOrder: [], adjustedDuration: 8, originalDuration: 10, transition: null, kenBurns: {}, captionSettings: { wordsPerWindow: 8, displayDurationMs: 2000, isFastPaced: false }, replacementSuggestions: [], rationale: '' },
        { segmentId: 'seg-2', shotOrder: [], adjustedDuration: 12, originalDuration: 15, transition: null, kenBurns: {}, captionSettings: { wordsPerWindow: 8, displayDurationMs: 2000, isFastPaced: false }, replacementSuggestions: [], rationale: '' },
        { segmentId: 'seg-3', shotOrder: [], adjustedDuration: null, originalDuration: 5, transition: null, kenBurns: {}, captionSettings: { wordsPerWindow: 8, displayDurationMs: 2000, isFastPaced: false }, replacementSuggestions: [], rationale: '' },
      ],
      summary: 'test',
      isDefault: false,
    });

    expect(segmentDurationForProject(project, 0)).toBe(8);
    expect(segmentDurationForProject(project, 1)).toBe(12);
    expect(segmentDurationForProject(project, 2)).toBe(5);

    expect(segmentIndexAtTime(project, 0)).toBe(0);
    expect(segmentIndexAtTime(project, 7.9)).toBe(0);
    expect(segmentIndexAtTime(project, 8)).toBe(1);
    expect(segmentIndexAtTime(project, 19.9)).toBe(1);
    expect(segmentIndexAtTime(project, 20)).toBe(2);
  });
});
