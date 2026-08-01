import { describe, it, expect } from 'vitest';
import { validateEditPlanResponse } from '../aiEditor';
import type { VideoProject } from '../../types';

function makeProject(): VideoProject {
  return {
    version: 1,
    id: 'proj-1',
    title: 'Test',
    topic: 'Test topic',
    style: 'business_insider',
    targetDuration: 5,
    script: [
      {
        id: 'seg-1',
        type: 'intro',
        title: 'Intro',
        narration: 'Hello world',
        visualNote: '',
        duration: 10,
      },
    ],
    media: [{ id: 'asset-1', segmentId: 'seg-1', url: 'https://example.com/a.jpg', type: 'image', source: 'test' }],
    narration: [],
    status: 'draft',
    createdAt: new Date(),
  };
}

describe('validateEditPlanResponse caption settings', () => {
  it('ignores LLM captionSettings and keeps renderer defaults', () => {
    const project = makeProject();
    const raw = {
      segments: [
        {
          segmentId: 'seg-1',
          shotOrder: ['asset-1'],
          adjustedDuration: null,
          originalDuration: 10,
          transition: null,
          kenBurns: {},
          captionSettings: { wordsPerWindow: 12, displayDurationMs: 9000, isFastPaced: true },
          replacementSuggestions: [],
          rationale: 'test',
        },
      ],
      summary: 'test',
      isDefault: false,
    };

    const result = validateEditPlanResponse(raw, project);
    expect(result).not.toBeNull();
    expect(result!.segments[0].captionSettings.wordsPerWindow).toBe(4);
    expect(result!.segments[0].captionSettings.isFastPaced).toBe(false);
  });
});
