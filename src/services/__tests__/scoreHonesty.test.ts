import { describe, expect, it } from 'vitest';

describe('score-honesty', () => {
  it('caps floors at raw+1 and never mints 8 with critical issues', async () => {
    const {
      applyCappedFloor,
      applyHonestSceneFloors,
      hasCriticalQualityIssues,
      scoreForTargetGate,
    } = await import('../../../powers/video-watcher/src/score-honesty.mjs');

    const scores = { hook: 6, pacing: 5, visualVariety: 5, captionReadability: 5, youtubeReadiness: 5 };
    const feedback: Record<string, string> = {};
    applyCappedFloor(scores, feedback, 'hook', 8, 'overlay');
    expect(scores.hook).toBe(7);
    expect(feedback.hook).toMatch(/floor 7/);

    expect(hasCriticalQualityIssues(['dung beetle B-roll'], 'scroll past')).toBe(true);
    expect(hasCriticalQualityIssues(['slightly soft captions'], 'solid opener')).toBe(false);
    expect(
      hasCriticalQualityIssues(
        ['Blurry stock bed'],
        'You would not scroll past this in 3 seconds because the hook is strong',
      ),
    ).toBe(false);
    expect(hasCriticalQualityIssues([], 'Viewers will scroll past in 3 seconds')).toBe(true);

    const brutal = {
      report: {
        scores: {
          hook: 7,
          visualVariety: 5,
          captionReadability: 5,
          pacing: 5,
          youtubeReadiness: 5,
        },
        feedback: {},
        topIssues: ['off-brand insect footage'],
        verdict: 'Would scroll past in 3s',
      },
    };
    applyHonestSceneFloors(brutal, {
      sceneQa: { available: true, pass: true, longestSceneSec: 1.5, sceneCount: 60 },
      repetition: { repeatPct: 0, duplicateRunCount: 0 },
      hookVision: { hookPass: true, onScreenText: 'VETERANS BENEFITS EXPOSED' },
      objectiveGate: { pass: true },
    });
    expect(brutal.rawOverall).toBe(5.4);
    // Floors may nudge dims +1, but youtubeReadiness must not jump to 8 with critical issues
    expect(brutal.report.scores.youtubeReadiness).toBeLessThanOrEqual(6);
    expect(brutal.hasCriticalIssues).toBe(true);
    expect(brutal.uploadReady).toBe(false);
    expect(scoreForTargetGate(brutal, 8)).toBe(brutal.rawOverall);
  });

  it('scoreForTargetGate prefers raw and rejects failed brutal', async () => {
    const { scoreForTargetGate } = await import(
      '../../../powers/video-watcher/src/score-honesty.mjs'
    );
    expect(scoreForTargetGate({ success: false, error: 'boom' }, 8)).toBeNull();
    expect(
      scoreForTargetGate({ rawOverall: 7.6, flooredOverall: 8.2, hasCriticalIssues: false }, 8),
    ).toBe(8.2);
    expect(
      scoreForTargetGate({ rawOverall: 6.5, flooredOverall: 8.0, hasCriticalIssues: false }, 8),
    ).toBe(6.5);
  });
});
