import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

  it('crime/heist topics use lower volume floor and aggregate soft-pass', async () => {
    const { evaluateHarvestVolume, evaluateHarvestVolumeWithSoftPass } = await import(
      '../../../scripts/lib/harvest-quality.mjs'
    );
    const topic = 'The diamond heist that used a fake airport';
    const project = {
      topic,
      script: [
        { id: 's1', title: 'Hook' },
        { id: 's2', title: 'Vault' },
        { id: 's3', title: 'Escape' },
      ],
      media: [
        { segmentId: 's1', url: 'https://x/1.jpg' },
        { segmentId: 's1', url: 'https://x/2.jpg' },
        { segmentId: 's1', url: 'https://x/3.jpg' },
        { segmentId: 's1', url: 'https://x/4.jpg' },
        { segmentId: 's2', url: 'https://x/5.jpg' },
        { segmentId: 's2', url: 'https://x/6.jpg' },
        { segmentId: 's2', url: 'https://x/7.jpg' },
        { segmentId: 's2', url: 'https://x/8.jpg' },
        { segmentId: 's3', url: 'https://x/9.jpg' },
        { segmentId: 's3', url: 'https://x/10.jpg' },
        { segmentId: 's3', url: 'https://x/11.jpg' },
        { segmentId: 's3', url: 'https://x/12.jpg' },
      ],
    };
    const volume = evaluateHarvestVolume(project, 6);
    expect(volume.crimeHeistTopic).toBe(true);
    expect(volume.minPerSegment).toBe(4);
    expect(volume.pass).toBe(true);

    const thin = {
      ...project,
      media: ['s1', 's2', 's3'].flatMap((segId) =>
        project.media.filter((m) => m.segmentId === segId).slice(0, 3),
      ),
    };
    const thinVolume = evaluateHarvestVolume(thin, 6);
    expect(thinVolume.pass).toBe(false);
    const soft = evaluateHarvestVolumeWithSoftPass(
      { volumePass: false, harvestQuality: thinVolume },
      thin,
    );
    expect(soft.pass).toBe(true);
    expect(soft.reason).toMatch(/soft-pass-crime-heist|soft-pass-aggregate/);
  });

  it('mergeVolumePadding keeps stock top-up after relevance filter', async () => {
    const {
      filterAssetsByRelevance,
      isVolumePaddingAsset,
      mergeVolumePadding,
      scoreAssetRelevance,
    } = await import('../../../scripts/lib/harvest-quality.mjs');
    const topic = 'The diamond heist that used a fake airport';
    const seg = { id: 's1', title: 'The $100M Airport That Never Existed', narration: 'fake runway cargo switch' };
    const padding = {
      id: 'stock-topup-s1-0',
      segmentId: 's1',
      type: 'image',
      url: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&w=1920',
      alt: 'Airport runway plane takeoff',
      query: 'stock-pool Hook',
      source: 'Stock pool (volume top-up)',
    };
    expect(isVolumePaddingAsset(padding)).toBe(true);
    expect(scoreAssetRelevance(padding, seg, topic)).toBeGreaterThan(0.2);

    const project = { topic, script: [seg], media: [padding] };
    const filtered = filterAssetsByRelevance(project.media, project, { minScore: 0.25 });
    const merged = mergeVolumePadding(filtered.media, [padding]);
    expect(merged.length).toBeGreaterThanOrEqual(1);
    expect(merged.some((a) => a.source?.includes('volume top-up'))).toBe(true);
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

  it('rejects synthetic stock-video query self-inflation', async () => {
    const { scoreAssetRelevance } = await import('../../../scripts/lib/harvest-quality.mjs');
    const seg = { id: 's1', title: 'Intro', narration: 'cameras recorded nursing home abuse' };
    const fake = {
      alt: 'architectural model office',
      url: 'https://x/arch.mp4',
      query: 'stock-video Intro',
    };
    expect(scoreAssetRelevance(fake, seg, 'nursing home cameras abuse')).toBe(0);
    const real = {
      alt: 'security camera cctv hallway nursing home',
      url: 'https://x/cctv.mp4',
      query: 'security camera cctv hallway',
    };
    expect(scoreAssetRelevance(real, seg, 'nursing home cameras abuse')).toBeGreaterThan(0.2);
  });

  it('estimateRenderCost returns server-render shape', async () => {
    const { estimateRenderCost, trackOpenRouterCost, getCostSummary } = await import('../costTracker.node.mjs');
    const est = estimateRenderCost({
      script: [{ duration: 30 }, { duration: 30 }],
      exportSettings: { resolution: '1080p' },
    });
    expect(est.totalEstimate).toBeGreaterThan(0);
    expect(est.apiCostEstimate).toBeDefined();
    trackOpenRouterCost('xiaomi/mimo-v2.5', 100, 50, 'unit-test');
    expect(getCostSummary().grandTotal).toBeGreaterThanOrEqual(0);
  });

  it('openRouterMessageText falls back to reasoning', async () => {
    const { openRouterMessageText } = await import('../../utils/openRouterMessageText');
    expect(openRouterMessageText({ content: '', reasoning: '{"ok":true}' })).toBe('{"ok":true}');
    expect(openRouterMessageText({ content: 'hello' })).toBe('hello');
  });

  it('isBrutalHardFail ignores missing scores when vision was skipped', async () => {
    const { isBrutalHardFail } = await import('../../../scripts/lib/brutal-gate.mjs');
    expect(isBrutalHardFail(false, null)).toBe(false);
    expect(isBrutalHardFail(false, { success: false })).toBe(false);
    expect(isBrutalHardFail(true, null)).toBe(true);
    expect(isBrutalHardFail(true, { success: false, error: 'boom' })).toBe(true);
    expect(isBrutalHardFail(true, { success: true, report: { scores: { overall: 7 } } })).toBe(false);
  });

  it('evaluatePlaceholderGate uses grain-only manifest accounting', async () => {
    const { evaluatePlaceholderGate } = await import('../../../scripts/lib/run-objective-qa.mjs');
    const base = mkdtempSync(join(tmpdir(), 'autotube-placeholder-'));
    const assemblyDir = join(base, 'ffmpeg-assembly');
    mkdirSync(assemblyDir, { recursive: true });
    const videoPath = join(base, 'out.mp4');
    writeFileSync(videoPath, '');

    // Regression: 8 reuse fallbacks + 1 grain filler → 10% placeholders, not 90%.
    writeFileSync(
      join(assemblyDir, 'render-manifest.json'),
      JSON.stringify({
        clipCount: 10,
        placeholderClipCount: 1,
        placeholderPct: 10,
      }),
    );
    const grainOnly = evaluatePlaceholderGate(videoPath);
    expect(grainOnly.available).toBe(true);
    expect(grainOnly.placeholderClipCount).toBe(1);
    expect(grainOnly.placeholderPct).toBe(10);
    expect(grainOnly.pass).toBe(true);

    writeFileSync(
      join(assemblyDir, 'render-manifest.json'),
      JSON.stringify({
        clipCount: 20,
        placeholderClipCount: 3,
      }),
    );
    const overLimit = evaluatePlaceholderGate(videoPath);
    expect(overLimit.placeholderPct).toBe(15);
    expect(overLimit.pass).toBe(false);
  });

  it('evaluatePlaceholderGate unavailable without render manifest', async () => {
    const { evaluatePlaceholderGate } = await import('../../../scripts/lib/run-objective-qa.mjs');
    const base = mkdtempSync(join(tmpdir(), 'autotube-placeholder-missing-'));
    expect(evaluatePlaceholderGate(join(base, 'out.mp4'))).toEqual({ available: false });
  });

  const mildPlaceholderGate = {
    available: true,
    pass: false,
    placeholderPct: 15,
    maxPlaceholderPct: 10,
  };
  const passingSceneQa = {
    available: true,
    hookPass: true,
    bodyPass: true,
    longestHookSec: 1,
    longestSceneSec: 1.5,
  };
  const passingClipGate = { available: true, pass: true, clipCount: 40, minClips: 20 };
  const passingObjectiveQa = {
    silencePass: true,
    silenceFirst60Sec: 0,
    scorePass: true,
    score: 80,
  };

  it('draft soft-passes mild placeholder_pct when scene body ok', async () => {
    const { evaluateObjectiveGate } = await import('../../../scripts/lib/run-objective-qa.mjs');
    const gate = evaluateObjectiveGate({
      renderTier: 'draft',
      sceneQa: passingSceneQa,
      clipCountGate: passingClipGate,
      placeholderGate: mildPlaceholderGate,
      objectiveQa: { silencePass: true, silenceFirst60Sec: 0 },
    });
    expect(gate.tier).toBe('draft');
    expect(gate.pass).toBe(true);
    expect(gate.checks.find((c) => c.name === 'placeholder_pct')?.pass).toBe(true);
    expect(gate.checks.some((c) => c.name === 'tech_score')).toBe(false);
  });

  it('full tier fails placeholder_pct that draft soft-passes', async () => {
    const { evaluateObjectiveGate } = await import('../../../scripts/lib/run-objective-qa.mjs');
    const parts = {
      sceneQa: passingSceneQa,
      clipCountGate: passingClipGate,
      placeholderGate: mildPlaceholderGate,
      objectiveQa: passingObjectiveQa,
    };
    const draft = evaluateObjectiveGate({ ...parts, renderTier: 'draft' });
    const full = evaluateObjectiveGate({ ...parts, renderTier: 'full' });
    expect(draft.checks.find((c) => c.name === 'placeholder_pct')?.pass).toBe(true);
    expect(full.checks.find((c) => c.name === 'placeholder_pct')?.pass).toBe(false);
    expect(draft.pass).toBe(true);
    expect(full.pass).toBe(false);
    expect(full.tier).toBe('full');
  });

  it('full tier enforces tech_score; draft defers it', async () => {
    const { evaluateObjectiveGate } = await import('../../../scripts/lib/run-objective-qa.mjs');
    const parts = {
      sceneQa: passingSceneQa,
      clipCountGate: passingClipGate,
      placeholderGate: { available: true, pass: true, placeholderPct: 5, maxPlaceholderPct: 10 },
      objectiveQa: { silencePass: true, silenceFirst60Sec: 0, scorePass: false, score: 50 },
    };
    const draft = evaluateObjectiveGate({ ...parts, renderTier: 'draft' });
    const full = evaluateObjectiveGate({ ...parts, renderTier: 'full' });
    expect(draft.checks.some((c) => c.name === 'tech_score')).toBe(false);
    expect(full.checks.find((c) => c.name === 'tech_score')?.pass).toBe(false);
    expect(draft.pass).toBe(true);
    expect(full.pass).toBe(false);
  });

  it('draft does not soft-pass catastrophic placeholder_pct', async () => {
    const { evaluateObjectiveGate } = await import('../../../scripts/lib/run-objective-qa.mjs');
    const gate = evaluateObjectiveGate({
      renderTier: 'draft',
      sceneQa: passingSceneQa,
      clipCountGate: passingClipGate,
      placeholderGate: {
        available: true,
        pass: false,
        placeholderPct: 25,
        maxPlaceholderPct: 10,
      },
      objectiveQa: { silencePass: true, silenceFirst60Sec: 0 },
    });
    expect(gate.checks.find((c) => c.name === 'placeholder_pct')?.pass).toBe(false);
    expect(gate.pass).toBe(false);
  });
});
