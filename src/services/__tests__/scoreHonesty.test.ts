import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';

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
    expect(
      hasCriticalQualityIssues(
        ['Over-reliance on stock footage'],
        'would likely make me scroll past within 10-15 seconds',
      ),
    ).toBe(false);
    expect(
      hasCriticalQualityIssues(
        ['Generic stock footage feel'],
        "While the hook is strong, the video's generic stock footage aesthetic would likely make me scroll past within 3 seconds.",
      ),
    ).toBe(false);
    // Firm "I would scroll past" verdict is a clear negative — must stay critical
    expect(
      hasCriticalQualityIssues(
        ['Over-reliance on generic stock footage'],
        'I would scroll past this in 3 seconds; the generic stock footage fails to capitalize on the hook.',
      ),
    ).toBe(true);
    // Genuine hedges (might/may/could) remain whitelisted
    expect(
      hasCriticalQualityIssues(
        ['Middling stock bed'],
        'Some viewers might scroll past this if the pacing drags.',
      ),
    ).toBe(false);
    expect(hasCriticalQualityIssues(['AUTO SKIPPED frame on screen'], '')).toBe(true);

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

  it('scoreForTargetGate uses raw only and rejects failed brutal', async () => {
    const { scoreForTargetGate } = await import(
      '../../../powers/video-watcher/src/score-honesty.mjs'
    );
    expect(scoreForTargetGate({ success: false, error: 'boom' }, 8)).toBeNull();
    // Floored score never counts toward a target, even when raw is within 0.5 of it
    expect(
      scoreForTargetGate({ rawOverall: 7.6, flooredOverall: 8.2, hasCriticalIssues: false }, 8),
    ).toBe(7.6);
    expect(
      scoreForTargetGate({ rawOverall: 6.5, flooredOverall: 8.0, hasCriticalIssues: false }, 8),
    ).toBe(6.5);
    // Floored/overall is only a fallback when no raw was recorded
    expect(scoreForTargetGate({ flooredOverall: 8.2, overall: 8.2 }, 8)).toBe(8.2);
    expect(scoreForTargetGate({ overall: 6.9 }, 8)).toBe(6.9);
    expect(scoreForTargetGate({}, 8)).toBeNull();
  });

  it('reconcileHookVision never lets pipeline overlay claims override vision', async () => {
    const { reconcileHookVision } = await import('../../../powers/video-watcher/src/analyze.mjs');
    const project = { exportSettings: { hookOverlay: 'BANKS HIDE THIS' } };

    // Vision miss + pipeline claim → fails closed, claim recorded separately
    const miss = reconcileHookVision(
      { hookPass: false, onScreenText: '', scrollPastIn3s: true, fix: 'shock line first' },
      project,
    );
    expect(miss.hookPass).toBe(false);
    expect(miss.onScreenText).toBe('');
    expect(miss.scrollPastIn3s).toBe(true);
    expect(miss.pipelineClaimsOverlay).toBe('BANKS HIDE THIS');

    // Vision error object also fails closed
    const err = reconcileHookVision({ hookPass: false, error: 'boom' }, project);
    expect(err.hookPass).toBe(false);
    expect(err.pipelineClaimsOverlay).toBe('BANKS HIDE THIS');

    // Genuine vision pass is preserved as-is (no inflation either)
    const pass = reconcileHookVision(
      { hookPass: true, onScreenText: 'BANKS HIDE THIS', scrollPastIn3s: false },
      project,
    );
    expect(pass.hookPass).toBe(true);
    expect(pass.onScreenText).toBe('BANKS HIDE THIS');

    // No claim → no annotation
    const noClaim = reconcileHookVision({ hookPass: false, onScreenText: '' }, {});
    expect(noClaim.pipelineClaimsOverlay).toBeNull();
    expect(reconcileHookVision(null, project)).toBeNull();
  });

  it('recovers false-empty hook OCR only with yellow/dark pixel proof', async () => {
    const { applyLocalHookOverlayFallback, detectYellowHookOverlay } = await import(
      '../../../powers/video-watcher/src/vision-brutal.mjs'
    );
    const claim = 'WHY DID THE CABIN KEEP FAILING?';
    const overlaySvg = Buffer.from(`
      <svg xmlns="http://www.w3.org/2000/svg" width="640" height="360">
        <rect width="640" height="360" fill="#dce8ef"/>
        <g text-anchor="middle" font-family="sans-serif" font-size="54"
           font-weight="800" fill="#ffe600" stroke="#050505" stroke-width="10"
           paint-order="stroke">
          <text x="320" y="135">WHY DID THE CABIN</text>
          <text x="320" y="205">KEEP FAILING?</text>
        </g>
      </svg>
    `);
    const overlayJpeg = await sharp(overlaySvg).jpeg({ quality: 92 }).toBuffer();
    const overlayFrame = `data:image/jpeg;base64,${overlayJpeg.toString('base64')}`;

    const evidence = await detectYellowHookOverlay([overlayFrame, overlayFrame]);
    expect(evidence.detected).toBe(true);
    expect(evidence.matchingFrames).toBe(2);
    const ffmpegEvidence = await detectYellowHookOverlay([overlayFrame], {
      forceFfmpeg: true,
    });
    expect(ffmpegEvidence).toMatchObject({
      detected: true,
      inspectedFrames: 1,
      matchingFrames: 1,
      failedFrames: 0,
      fallbackFrames: 1,
    });
    expect(ffmpegEvidence.strongest?.decoder).toBe('ffmpeg-ppm');

    const recovered = await applyLocalHookOverlayFallback(
      { hookPass: false, onScreenText: '', scrollPastIn3s: false },
      [overlayFrame],
      claim,
    );
    expect(recovered.hookPass).toBe(true);
    expect(recovered.onScreenText).toBe(claim);
    expect(recovered.localOverlayFallback).toMatchObject({
      method: 'yellow-dark-pixel-overlay',
      detected: true,
      applied: true,
    });

    // Pixel evidence cannot overturn a qualitative fail when model OCR worked.
    const qualitativeFail = await applyLocalHookOverlayFallback(
      { hookPass: false, onScreenText: claim },
      [overlayFrame],
      claim,
    );
    expect(qualitativeFail.hookPass).toBe(false);
    expect(qualitativeFail.localOverlayFallback).toMatchObject({
      detected: true,
      applied: false,
    });

    // Metadata is retained even when a model pass means no recovery is applied.
    const alreadyPassed = await applyLocalHookOverlayFallback(
      { hookPass: true, onScreenText: claim },
      [overlayFrame],
      claim,
    );
    expect(alreadyPassed.localOverlayFallback).toMatchObject({
      detected: true,
      inspectedFrames: 1,
      applied: false,
    });

    // analyze.mjs retries from watch output JPEGs when hook review omitted metadata.
    const { recoverMissingLocalOverlayFallback } = await import(
      '../../../powers/video-watcher/src/analyze.mjs'
    );
    const watchDir = mkdtempSync(join(tmpdir(), 'autotube-watch-hook-'));
    try {
      const savedFrame = join(watchDir, 'frame-0000s.jpg');
      writeFileSync(savedFrame, overlayJpeg);
      const recoveredFromSavedFrame = await recoverMissingLocalOverlayFallback(
        {
          hookPass: false,
          onScreenText: '',
          pipelineClaimsOverlay: claim,
        },
        [{ path: savedFrame, timestampSec: 0 }],
        watchDir,
      );
      expect(recoveredFromSavedFrame).toMatchObject({
        hookPass: true,
        onScreenText: claim,
        localOverlayFallback: {
          detected: true,
          inspectedFrames: 1,
          applied: true,
        },
      });
    } finally {
      rmSync(watchDir, { recursive: true, force: true });
    }

    const flatJpeg = await sharp({
      create: {
        width: 640,
        height: 360,
        channels: 3,
        background: { r: 255, g: 225, b: 0 },
      },
    }).jpeg().toBuffer();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const rejected = await applyLocalHookOverlayFallback(
      { hookPass: false, onScreenText: '' },
      [`data:image/jpeg;base64,${flatJpeg.toString('base64')}`],
      claim,
    );
    const warningCalls = warn.mock.calls;
    warn.mockRestore();
    expect(rejected.hookPass).toBe(false);
    expect(rejected.onScreenText).toBe('');
    expect(rejected.localOverlayFallback).toMatchObject({
      detected: false,
      inspectedFrames: 1,
      applied: false,
    });
    expect(warningCalls).toHaveLength(1);
    expect(warningCalls[0][0]).toMatch(/local hook overlay not detected.*1 inspected/);
  });

  it('computeUploadReady ANDs brutal-raw, objective, scene, and hook gates', async () => {
    const { computeUploadReady } = await import('../../../powers/video-watcher/src/analyze.mjs');
    const base = {
      brutal: { uploadReady: true, hasCriticalIssues: false, rawOverall: 7.2 },
      hookVision: { hookPass: true, onScreenText: 'BANKS HIDE THIS' },
      hookScript: { pass: true },
      objectiveGate: { available: true, pass: true },
      sceneQa: { available: true, pass: true },
    };
    expect(computeUploadReady(base)).toBe(true);

    // Objective/scene gates only block when available
    expect(
      computeUploadReady({ ...base, objectiveGate: { available: false }, sceneQa: { available: false } }),
    ).toBe(true);
    expect(
      computeUploadReady({ ...base, objectiveGate: { available: true, pass: false } }),
    ).toBe(false);
    expect(computeUploadReady({ ...base, sceneQa: { available: true, pass: false } })).toBe(false);

    // Hook vision failure blocks
    expect(
      computeUploadReady({ ...base, hookVision: { hookPass: false, onScreenText: '' } }),
    ).toBe(false);
    // Vision-seen burned-in text (≥8 chars) counts even without explicit hookPass
    expect(
      computeUploadReady({ ...base, hookVision: { hookPass: false, onScreenText: 'BANKS HIDE THIS' } }),
    ).toBe(true);

    // Brutal-raw gate: failed/missing review never passes, even in skip-vision draft mode
    expect(computeUploadReady({ ...base, brutal: { uploadReady: false, hasCriticalIssues: false } })).toBe(false);
    expect(computeUploadReady({ ...base, brutal: null, skipVision: true })).toBe(false);
    expect(computeUploadReady({ ...base, brutal: null, skipVision: false })).toBe(false);
    expect(computeUploadReady({ ...base, brutal: { success: false, error: 'boom' } })).toBe(false);

    // Critical issues always block
    expect(
      computeUploadReady({ ...base, brutal: { uploadReady: true, hasCriticalIssues: true, rawOverall: 8 } }),
    ).toBe(false);

    // Weak script hook blocks
    expect(computeUploadReady({ ...base, hookScript: { pass: false } })).toBe(false);
  });
});
