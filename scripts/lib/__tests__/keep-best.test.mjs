import { describe, expect, it } from 'vitest';
import { applyFrozenMediaToProject } from '../keep-best.mjs';

describe('applyFrozenMediaToProject', () => {
  it('drops frozen media whose segment no longer exists instead of assigning it to segment 0', () => {
    const project = {
      script: [
        { id: 'new-intro' },
        { id: 'new-body' },
      ],
    };
    const frozen = {
      script: [
        { id: 'old-intro' },
        { id: 'old-body' },
      ],
      media: [
        { id: 'kept', segmentId: 'old-body', url: 'https://example.test/body.mp4' },
        { id: 'orphan', segmentId: 'old-missing', url: 'https://example.test/orphan.mp4' },
      ],
      editTimeline: [
        { id: 'cut-1', segmentId: 'old-body' },
        { id: 'cut-orphan', segmentId: 'old-missing' },
      ],
    };

    const applied = applyFrozenMediaToProject(project, frozen);

    expect(applied).toMatchObject({
      ok: true,
      mediaCount: 1,
      timelineCount: 1,
      orphanMediaCount: 1,
      orphanTimelineCount: 1,
      droppedOrphanMediaIds: ['orphan'],
    });
    expect(project.media).toEqual([
      { id: 'kept', segmentId: 'new-body', url: 'https://example.test/body.mp4' },
    ]);
    expect(project.media.some((m) => m.segmentId === 'new-intro' && m.id === 'orphan')).toBe(false);
    expect(project.editTimeline).toEqual([{ id: 'cut-1', segmentId: 'new-body' }]);
  });
});
