import { describe, expect, it } from 'vitest';
import {
  applyFrozenMediaToProject,
  shouldKeepBest,
  shouldFreezeOnTopicalAssets,
  countStrongTopicalVideos,
  KEEP_BEST_RAW_FLOOR,
  STRONG_TOPICAL_RELEVANCE_MIN,
} from '../keep-best.mjs';

// ---------------------------------------------------------------------------
// shouldKeepBest — score + critical-issue gate
// ---------------------------------------------------------------------------
describe('shouldKeepBest', () => {
  it('returns false for a null/missing watch', () => {
    expect(shouldKeepBest(null)).toBe(false);
    expect(shouldKeepBest(undefined)).toBe(false);
  });

  it('refuses when hasCriticalIssues is true, even when uploadReady', () => {
    expect(shouldKeepBest({ brutal: { hasCriticalIssues: true }, uploadReady: true })).toBe(false);
  });

  it('refuses when hasCriticalIssues is true, even when rawOverall >= floor', () => {
    expect(
      shouldKeepBest({ brutal: { hasCriticalIssues: true, rawOverall: KEEP_BEST_RAW_FLOOR + 1 } }),
    ).toBe(false);
  });

  it('returns true for uploadReady watch without critical issues', () => {
    expect(shouldKeepBest({ brutal: { hasCriticalIssues: false }, uploadReady: true })).toBe(true);
  });

  it('returns true when rawOverall exactly equals the floor', () => {
    expect(
      shouldKeepBest({ brutal: { hasCriticalIssues: false, rawOverall: KEEP_BEST_RAW_FLOOR } }),
    ).toBe(true);
  });

  it('returns true when rawOverall exceeds the floor', () => {
    expect(
      shouldKeepBest({ brutal: { hasCriticalIssues: false, rawOverall: 8.5 } }),
    ).toBe(true);
  });

  it('returns false when rawOverall is below the floor and not uploadReady', () => {
    expect(
      shouldKeepBest({ brutal: { hasCriticalIssues: false, rawOverall: 6.0 }, uploadReady: false }),
    ).toBe(false);
  });

  it('returns false when rawOverall is missing and not uploadReady', () => {
    expect(shouldKeepBest({ brutal: { hasCriticalIssues: false } })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// countStrongTopicalVideos — airline and generic paths
// ---------------------------------------------------------------------------
describe('countStrongTopicalVideos', () => {
  it('returns 0 for a project with no media', () => {
    expect(countStrongTopicalVideos({ media: [] }, 'airline topic')).toBe(0);
    expect(countStrongTopicalVideos({}, 'airline topic')).toBe(0);
  });

  it('returns 0 for a project with only image assets', () => {
    const project = {
      media: [{ id: 'img1', type: 'image', url: 'https://example.test/still.jpg', alt: 'cockpit' }],
    };
    expect(countStrongTopicalVideos(project, 'airline cabin pressure failures')).toBe(0);
  });

  it('counts cockpit video as a strong airline asset', () => {
    const project = {
      media: [
        {
          id: 'v1',
          type: 'video',
          url: 'https://example.test/cockpit.mp4',
          alt: 'cockpit flight deck',
        },
      ],
    };
    expect(countStrongTopicalVideos(project, 'How airlines hide cabin pressure failures')).toBe(1);
  });

  it('counts airplane cabin interior video as a strong airline asset', () => {
    const project = {
      media: [
        {
          id: 'v1',
          type: 'video',
          url: 'https://example.test/cabin.mp4',
          alt: 'airplane cabin interior passengers seated',
        },
      ],
    };
    expect(countStrongTopicalVideos(project, 'airline cabin pressure')).toBeGreaterThanOrEqual(1);
  });

  it('does not count airline junk (hospital/medical) as strong for airline topics', () => {
    const project = {
      media: [
        {
          id: 'v1',
          type: 'video',
          url: 'https://example.test/hospital.mp4',
          alt: 'hospital patient nurse ICU room',
        },
      ],
    };
    expect(countStrongTopicalVideos(project, 'airline cabin pressure failures')).toBe(0);
  });

  it('counts generic videos by relevanceScore for non-airline topics', () => {
    const project = {
      topic: 'housing eviction crisis',
      media: [
        {
          id: 'v1',
          type: 'video',
          url: 'https://example.test/eviction.mp4',
          alt: 'eviction notice tenant moving',
          relevanceScore: STRONG_TOPICAL_RELEVANCE_MIN,
        },
        {
          id: 'v2',
          type: 'video',
          url: 'https://example.test/low.mp4',
          alt: 'some video',
          relevanceScore: 0.3,
        },
        {
          id: 'v3',
          type: 'video',
          url: 'https://example.test/no-score.mp4',
          alt: 'no score set',
          // no relevanceScore
        },
      ],
    };
    expect(countStrongTopicalVideos(project, 'housing eviction crisis')).toBe(1);
  });

  it('detects .mp4 extension as video even without explicit type field', () => {
    const project = {
      media: [
        {
          id: 'v1',
          url: 'https://example.test/cabin.mp4',
          alt: 'airplane cabin interior',
        },
      ],
    };
    expect(countStrongTopicalVideos(project, 'airline cabin pressure')).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// shouldFreezeOnTopicalAssets
// ---------------------------------------------------------------------------
describe('shouldFreezeOnTopicalAssets', () => {
  const airlineTopic = 'How airlines hid the cabin pressure failures';
  const cockpitVideo = {
    id: 'cockpit',
    type: 'video',
    url: 'https://example.test/cockpit.mp4',
    alt: 'cockpit flight deck pilot',
  };

  it('returns false when watch is null', () => {
    expect(shouldFreezeOnTopicalAssets(null, { media: [cockpitVideo] }, airlineTopic)).toBe(false);
  });

  it('returns false when watch has critical issues', () => {
    const watch = { brutal: { hasCriticalIssues: true } };
    expect(shouldFreezeOnTopicalAssets(watch, { media: [cockpitVideo] }, airlineTopic)).toBe(false);
  });

  it('returns false when project is null or has no media', () => {
    const watch = { brutal: { hasCriticalIssues: false } };
    expect(shouldFreezeOnTopicalAssets(watch, null, airlineTopic)).toBe(false);
    expect(shouldFreezeOnTopicalAssets(watch, { media: [] }, airlineTopic)).toBe(false);
  });

  it('returns true for airline topic with a strong aviation video and no critical issues', () => {
    const watch = { brutal: { hasCriticalIssues: false } };
    expect(shouldFreezeOnTopicalAssets(watch, { media: [cockpitVideo] }, airlineTopic)).toBe(true);
  });

  it('returns true for airline topic using topic from project when not passed explicitly', () => {
    const watch = { brutal: { hasCriticalIssues: false } };
    const project = { topic: airlineTopic, media: [cockpitVideo] };
    expect(shouldFreezeOnTopicalAssets(watch, project)).toBe(true);
  });

  it('returns false for airline topic when only medical/junk videos present', () => {
    const watch = { brutal: { hasCriticalIssues: false } };
    const project = {
      media: [
        {
          id: 'hosp',
          type: 'video',
          url: 'https://example.test/hospital.mp4',
          alt: 'hospital patient nurse ICU room',
        },
      ],
    };
    expect(shouldFreezeOnTopicalAssets(watch, project, airlineTopic)).toBe(false);
  });

  it('returns true for non-airline topic when video has strong relevanceScore', () => {
    const watch = { brutal: { hasCriticalIssues: false } };
    const project = {
      media: [
        {
          id: 'v1',
          type: 'video',
          url: 'https://example.test/eviction.mp4',
          alt: 'eviction notice tenant',
          relevanceScore: 0.65,
        },
      ],
    };
    expect(shouldFreezeOnTopicalAssets(watch, project, 'housing eviction crisis')).toBe(true);
  });

  it('returns false for non-airline topic when no video has relevanceScore >= threshold', () => {
    const watch = { brutal: { hasCriticalIssues: false } };
    const project = {
      media: [
        { id: 'v1', type: 'video', url: 'https://example.test/low.mp4', alt: 'generic clip', relevanceScore: 0.3 },
        { id: 'v2', type: 'video', url: 'https://example.test/none.mp4', alt: 'no score' },
      ],
    };
    expect(shouldFreezeOnTopicalAssets(watch, project, 'housing eviction crisis')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// applyFrozenMediaToProject — orphan handling + airline freeze/thaw
// ---------------------------------------------------------------------------
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

  it('freeze/thaw round-trip preserves airline aviation assets across different scripts', () => {
    const project = {
      script: [
        { id: 'new-intro' },
        { id: 'new-main' },
      ],
    };
    const frozen = {
      topic: 'Airline cabin pressure failures',
      script: [
        { id: 'old-intro' },
        { id: 'old-main' },
      ],
      media: [
        {
          id: 'cockpit-video',
          type: 'video',
          segmentId: 'old-main',
          alt: 'cockpit flight deck pilot',
          url: 'https://example.test/cockpit.mp4',
          relevanceScore: 0.7,
        },
        {
          id: 'hospital-orphan',
          type: 'video',
          segmentId: 'old-missing',
          alt: 'hospital room patient ICU',
          url: 'https://example.test/hospital.mp4',
        },
      ],
      editTimeline: [
        { id: 'cut-cockpit', segmentId: 'old-main' },
        { id: 'cut-orphan', segmentId: 'old-missing' },
      ],
    };

    const result = applyFrozenMediaToProject(project, frozen);

    expect(result.ok).toBe(true);
    expect(result.mediaCount).toBe(1);
    expect(result.orphanMediaCount).toBe(1);
    expect(result.droppedOrphanMediaIds).toContain('hospital-orphan');
    // Cockpit video remapped to new-main
    expect(project.media[0]).toMatchObject({ id: 'cockpit-video', segmentId: 'new-main' });
    // Orphan must NOT be silently placed on new-intro (segment 0)
    expect(project.media.some((m) => m.id === 'hospital-orphan')).toBe(false);
    // Timeline orphan dropped
    expect(project.editTimeline).toEqual([{ id: 'cut-cockpit', segmentId: 'new-main' }]);
  });

  it('maps multiple airline assets from a longer frozen script to a shorter new script', () => {
    const project = {
      script: [
        { id: 'seg-a' },
        { id: 'seg-b' },
      ],
    };
    const frozen = {
      script: [
        { id: 'f-0' },
        { id: 'f-1' },
        { id: 'f-2' }, // extra segment — clamped to script.length - 1
        { id: 'f-3' }, // extra segment — clamped to script.length - 1
      ],
      media: [
        { id: 'm0', segmentId: 'f-0', type: 'video', url: 'https://example.test/0.mp4' },
        { id: 'm1', segmentId: 'f-1', type: 'video', url: 'https://example.test/1.mp4' },
        { id: 'm2', segmentId: 'f-2', type: 'video', url: 'https://example.test/2.mp4' },
        { id: 'm3', segmentId: 'f-3', type: 'video', url: 'https://example.test/3.mp4' },
      ],
    };

    const result = applyFrozenMediaToProject(project, frozen);

    expect(result.ok).toBe(true);
    expect(result.mediaCount).toBe(4);
    // No orphans — every frozen segment exists in frozen.script
    expect(result.orphanMediaCount).toBe(0);
    // f-0 → seg-a, f-1 → seg-b, f-2 → clamped to seg-b, f-3 → clamped to seg-b
    expect(project.media[0].segmentId).toBe('seg-a');
    expect(project.media[1].segmentId).toBe('seg-b');
    expect(project.media[2].segmentId).toBe('seg-b');
    expect(project.media[3].segmentId).toBe('seg-b');
    // None end up assigned to a non-existent or undefined segment
    for (const m of project.media) {
      expect(['seg-a', 'seg-b']).toContain(m.segmentId);
    }
  });

  it('returns ok:false when frozen media is empty', () => {
    const project = { script: [{ id: 's1' }] };
    const frozen = { script: [{ id: 's1' }], media: [] };
    expect(applyFrozenMediaToProject(project, frozen).ok).toBe(false);
  });

  it('returns ok:false when project script is empty', () => {
    const project = { script: [] };
    const frozen = {
      script: [{ id: 's1' }],
      media: [{ id: 'm1', segmentId: 's1', url: 'https://example.test/v.mp4' }],
    };
    expect(applyFrozenMediaToProject(project, frozen).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// STRONG_TOPICAL_RELEVANCE_MIN — constant sanity
// ---------------------------------------------------------------------------
describe('constants', () => {
  it('STRONG_TOPICAL_RELEVANCE_MIN is between 0 and 1', () => {
    expect(STRONG_TOPICAL_RELEVANCE_MIN).toBeGreaterThan(0);
    expect(STRONG_TOPICAL_RELEVANCE_MIN).toBeLessThanOrEqual(1);
  });

  it('KEEP_BEST_RAW_FLOOR is a sensible numeric floor', () => {
    expect(KEEP_BEST_RAW_FLOOR).toBeGreaterThan(5);
    expect(KEEP_BEST_RAW_FLOOR).toBeLessThan(10);
  });
});
