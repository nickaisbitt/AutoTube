import { describe, expect, it } from 'vitest';

describe('quality waves 2–5 helpers', () => {
  it('clearTopicPackaging resets hooks and mediaOffset', async () => {
    const { clearTopicPackaging } = await import('../../../scripts/lib/loop-state.mjs');
    const state = {
      hookLine: 'BANK OTP EXPOSED',
      hookOverlay: 'BANK OTP',
      impactBeats: ['X'],
      mediaOffset: 12,
      harvestNonce: 3,
      rewriteScript: true,
      preferBrightBroll: true,
    };
    clearTopicPackaging(state);
    expect(state.hookLine).toBeNull();
    expect(state.hookOverlay).toBeUndefined();
    expect(state.impactBeats).toBeUndefined();
    expect(state.mediaOffset).toBe(0);
    expect(state.harvestNonce).toBe(0);
    expect(state.rewriteScript).toBe(false);
    expect(state.preferBrightBroll).toBe(true);
  });

  it('soft-pass requires motion, not cyber stills alone', async () => {
    const { evaluateHarvestVolumeWithSoftPass } = await import(
      '../../../scripts/lib/harvest-quality.mjs'
    );
    const project = {
      script: [{ id: 'a' }, { id: 'b' }],
      media: [
        { type: 'image', segmentId: 'a', url: 'https://x/1.jpg' },
        { type: 'image', segmentId: 'b', url: 'https://x/2.jpg' },
      ],
    };
    expect(
      evaluateHarvestVolumeWithSoftPass(
        { volumePass: false, cyberStockInjected: 8, pexelsFetched: 0 },
        project,
      ).pass,
    ).toBe(false);

    const motionProject = {
      script: [{ id: 'a' }, { id: 'b' }],
      media: [
        { type: 'video', segmentId: 'a', url: 'https://x/a.mp4' },
        { type: 'video', segmentId: 'a', url: 'https://x/a2.mp4' },
        { type: 'video', segmentId: 'b', url: 'https://x/b.mp4' },
        { type: 'video', segmentId: 'b', url: 'https://x/b2.mp4' },
      ],
    };
    expect(
      evaluateHarvestVolumeWithSoftPass(
        { volumePass: false, pexelsFetched: 3, videoTopUp: [1, 2] },
        motionProject,
      ).pass,
    ).toBe(true);
  });

  it('preferBright and anti-HUD appear in stockMotionQueries', async () => {
    const { stockMotionQueries } = await import('../../../scripts/lib/generate-full-video.mjs');
    const q = stockMotionQueries('bank fraud otp scam', true, { preferBright: true, faceSeek: true });
    expect(q.some((x) => /bright office daylight/i.test(x))).toBe(true);
    expect(q.some((x) => /real footage people office/i.test(x))).toBe(true);
  });

  it('nursing preferBright uses care-home boost not office', async () => {
    const { stockMotionQueries } = await import('../../../scripts/lib/generate-full-video.mjs');
    const q = stockMotionQueries('nursing home cameras abuse', false, { preferBright: true });
    expect(q.some((x) => /care home|nursing home hallway|elderly care/i.test(x))).toBe(true);
    expect(q.every((x) => !/bright office daylight/i.test(x))).toBe(true);
  });

  it('openRouterMessageText falls back to reasoning', async () => {
    const { openRouterMessageText } = await import('../../utils/openRouterMessageText');
    expect(openRouterMessageText({ content: '', reasoning: '{"ok":true}' })).toBe('{"ok":true}');
    expect(openRouterMessageText({ content: 'hello' })).toBe('hello');
  });
});
