import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('quality waves 2–5 helpers', () => {
  const stockKeyEnvNames = ['PEXELS_API_KEY', 'VITE_PEXELS_KEY', 'PIXABAY_API_KEY', 'VITE_PIXABAY_KEY'] as const;
  const saveStockKeyEnv = () => stockKeyEnvNames.map((name) => [name, process.env[name]] as const);
  const restoreStockKeyEnv = (saved: readonly (readonly [string, string | undefined])[]) => {
    for (const [name, value] of saved) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  };
  const airlineTopic = 'How a regional airline hid cabin pressure failures from passengers';
  const airlineScript = () => Array.from({ length: 6 }, (_, i) => ({ id: `s${i + 1}` }));
  const strongAirlineVideo = (i: number) => ({
    type: 'video',
    segmentId: `s${(i % 6) + 1}`,
    url: `https://videos.pexels.com/airline-strong-${i}.mp4`,
    alt: [
      'airplane cabin passengers oxygen masks',
      'pilot cockpit instruments aircraft',
      'maintenance hangar aircraft mechanic',
      'airport runway aircraft taking off',
    ][i % 4],
    query: 'airplane cabin pressure failure stock',
    source: 'Pexels Videos',
  });
  const airlineMotionReport = (videoCount: number) => ({
    volumePass: false,
    pexelsFetched: videoCount,
    videoTopUp: Array.from({ length: 6 }, (_, i) => i + 1),
  });

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
      media: Array.from({ length: 16 }, (_, i) => ({
        type: 'video',
        segmentId: i < 8 ? 'a' : 'b',
        url: `https://x/motion-${i}.mp4`,
        alt: i < 8 ? 'ambulance gps dispatch' : 'rural road paramedic',
      })),
    };
    expect(
      evaluateHarvestVolumeWithSoftPass(
        { volumePass: false, pexelsFetched: 16, videoTopUp: [1, 2] },
        motionProject,
      ).pass,
    ).toBe(true);
  });

  it('soft-pass-motion fails closed below stock-key unique video floor', async () => {
    const { evaluateHarvestVolumeWithSoftPass } = await import(
      '../../../scripts/lib/harvest-quality.mjs'
    );
    const saved = saveStockKeyEnv();
    try {
      process.env.PEXELS_API_KEY = 'test-key';
      delete process.env.VITE_PEXELS_KEY;
      delete process.env.PIXABAY_API_KEY;
      delete process.env.VITE_PIXABAY_KEY;
      const project = {
        topic: 'How school districts lost student mental-health records to ransomware',
        script: [{ id: 's1' }, { id: 's2' }, { id: 's3' }, { id: 's4' }],
        media: Array.from({ length: 12 }, (_, i) => ({
          type: 'video',
          segmentId: `s${(i % 4) + 1}`,
          url: `https://videos.pexels.com/topical-${i}.mp4`,
          alt: i % 2 ? 'school hallway student records ransomware' : 'worried parent phone data breach',
          source: 'Pexels Videos',
        })),
      };
      const soft = evaluateHarvestVolumeWithSoftPass(
        { volumePass: false, pexelsFetched: 12, videoTopUp: [1, 2, 3, 4] },
        project,
      );
      expect(soft.pass).toBe(false);
      expect(soft.reason).toBe('soft-pass-motion-unique-video-floor(12/16 topical videos)');
    } finally {
      restoreStockKeyEnv(saved);
    }
  });

  it('soft-pass-motion rejects generic-junk dominated video pools', async () => {
    const { evaluateHarvestVolumeWithSoftPass } = await import(
      '../../../scripts/lib/harvest-quality.mjs'
    );
    const saved = saveStockKeyEnv();
    try {
      for (const name of stockKeyEnvNames) delete process.env[name];
      const project = {
        topic: 'How school districts lost student mental-health records to ransomware',
        script: [{ id: 's1' }, { id: 's2' }],
        media: Array.from({ length: 16 }, (_, i) => ({
          type: 'video',
          segmentId: i % 2 ? 's1' : 's2',
          url: `https://x/generic-mix-${i}.mp4`,
          alt: i < 7
            ? 'corporate handshake empty office skyline timelapse'
            : 'school hallway students worried phone ransomware records',
          query: i < 7 ? 'stock footage loop' : 'school ransomware records',
          source: 'Stock video pool',
        })),
      };
      const soft = evaluateHarvestVolumeWithSoftPass(
        { volumePass: false, videoTopUp: [1, 2] },
        project,
      );
      expect(soft.pass).toBe(false);
      expect(soft.reason).toBe('soft-pass-motion-generic-junk(7/16 videos)');
    } finally {
      restoreStockKeyEnv(saved);
    }
  });

  it.each([
    {
      label: 'medical patient/nurse',
      alt: 'hospital patient nurse medical ward',
      reason: 'soft-pass-motion-airline-junk(medical-patient-nurse)',
    },
    {
      label: 'mail/mailbox',
      alt: 'mailbox postal delivery mail carrier',
      reason: 'soft-pass-motion-airline-junk(mail-mailbox)',
    },
    {
      label: 'financial reports',
      alt: 'financial reports spreadsheet office desk',
      reason: 'soft-pass-motion-airline-junk(financial-reports)',
    },
  ])('airline soft-pass-motion rejects $label pads', async ({ alt, reason }) => {
    const { evaluateHarvestVolumeWithSoftPass } = await import(
      '../../../scripts/lib/harvest-quality.mjs'
    );
    // Three hard-junk pads (> ratio / count thresholds) must fail closed.
    const project = {
      topic: airlineTopic,
      script: airlineScript(),
      media: [
        ...Array.from({ length: 12 }, (_, i) => strongAirlineVideo(i)),
        ...Array.from({ length: 3 }, (_, i) => ({
          type: 'video',
          segmentId: 's1',
          url: `https://videos.pexels.com/airline-bad-pad-${i}.mp4`,
          alt,
          query: 'airline cabin pressure footage',
          source: 'Pexels Videos',
        })),
      ],
    };

    const soft = evaluateHarvestVolumeWithSoftPass(airlineMotionReport(project.media.length), project);
    expect(soft.pass).toBe(false);
    expect(soft.reason).toBe(reason.replace(/\)$/, ':3/15)'));
  });

  it('airline soft-pass-motion tolerates one leftover junk pad in a strong pool', async () => {
    const { evaluateHarvestVolumeWithSoftPass } = await import(
      '../../../scripts/lib/harvest-quality.mjs'
    );
    const project = {
      topic: airlineTopic,
      script: airlineScript(),
      media: [
        ...Array.from({ length: 12 }, (_, i) => strongAirlineVideo(i)),
        {
          type: 'video',
          segmentId: 's1',
          url: 'https://videos.pexels.com/airline-one-bad.mp4',
          alt: 'hospital patient nurse bed',
          query: 'airline cabin pressure footage',
          source: 'Pexels Videos',
        },
      ],
    };
    const soft = evaluateHarvestVolumeWithSoftPass(airlineMotionReport(project.media.length), project);
    expect(soft.pass).toBe(true);
  });

  it('airline soft-pass-motion requires at least four strong aviation videos', async () => {
    const { evaluateHarvestVolumeWithSoftPass } = await import(
      '../../../scripts/lib/harvest-quality.mjs'
    );
    const project = {
      topic: airlineTopic,
      script: airlineScript(),
      media: [
        ...Array.from({ length: 3 }, (_, i) => strongAirlineVideo(i)),
        ...Array.from({ length: 17 }, (_, i) => ({
          type: 'video',
          segmentId: `s${(i % 6) + 1}`,
          url: `https://videos.pexels.com/airport-weak-${i}.mp4`,
          alt: 'airport terminal passengers walking gate',
          query: 'airline passenger reaction',
          source: 'Pexels Videos',
        })),
      ],
    };

    const soft = evaluateHarvestVolumeWithSoftPass(airlineMotionReport(project.media.length), project);
    expect(soft.pass).toBe(false);
    expect(soft.reason).toBe('soft-pass-motion-airline-aviation-strong-floor(3/4 videos)');
  });

  it('airline soft-pass-motion uses a tighter generic-junk video ratio', async () => {
    const { evaluateHarvestVolumeWithSoftPass } = await import(
      '../../../scripts/lib/harvest-quality.mjs'
    );
    const project = {
      topic: airlineTopic,
      script: airlineScript(),
      media: [
        ...Array.from({ length: 12 }, (_, i) => strongAirlineVideo(i)),
        ...Array.from({ length: 5 }, (_, i) => ({
          type: 'video',
          segmentId: `s${(i % 6) + 1}`,
          url: `https://videos.pexels.com/airline-generic-${i}.mp4`,
          alt: 'corporate handshake empty office skyline timelapse',
          query: 'stock footage loop',
          source: 'Pexels Videos',
        })),
      ],
    };

    const soft = evaluateHarvestVolumeWithSoftPass(airlineMotionReport(project.media.length), project);
    expect(soft.pass).toBe(false);
    expect(soft.reason).toBe('soft-pass-motion-airline-generic-junk(5/17 videos)');
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

  it('mergeVolumePadding drops junk padding when project is passed', async () => {
    process.env.AUTOTUBE_EVAL_COLD = '1';
    const { mergeVolumePadding } = await import('../../../scripts/lib/harvest-quality.mjs');
    const topic = 'How school districts lost student mental-health records to ransomware';
    const project = {
      topic,
      script: [{ id: 's1', title: 'Intro', narration: 'student counseling records stolen' }],
      media: [],
    };
    const keep = {
      id: 'ok',
      segmentId: 's1',
      type: 'video',
      url: 'https://example.com/school.mp4',
      alt: 'school hallway students worried phones',
      query: 'school ransomware',
      source: 'Stock pool (volume top-up)',
    };
    const junk = {
      id: 'junk',
      segmentId: 's1',
      type: 'video',
      url: 'https://example.com/office.mp4',
      alt: 'corporate handshake empty office skyline timelapse',
      query: 'stock footage loop',
      source: 'Stock pool (volume top-up)',
    };
    const merged = mergeVolumePadding([keep], [junk], project);
    expect(merged.some((a) => a.id === 'junk')).toBe(false);
    expect(merged.some((a) => a.id === 'ok')).toBe(true);
    delete process.env.AUTOTUBE_EVAL_COLD;
  });

  it('soft-pass-cold-thin requires enough unique motion (not 1 video/seg)', async () => {
    process.env.AUTOTUBE_EVAL_COLD = '1';
    const { evaluateHarvestVolumeWithSoftPass } = await import(
      '../../../scripts/lib/harvest-quality.mjs'
    );
    const project = {
      topic: 'Why rural ambulance GPS routes send crews to demolished houses',
      script: [
        { id: 'a', title: 'A' },
        { id: 'b', title: 'B' },
        { id: 'c', title: 'C' },
      ],
      media: [
        { segmentId: 'a', type: 'video', url: 'https://x/a1.mp4', alt: 'ambulance' },
        { segmentId: 'a', type: 'video', url: 'https://x/a2.mp4', alt: 'gps map' },
        { segmentId: 'a', type: 'video', url: 'https://x/a3.mp4', alt: 'dispatch desk' },
        { segmentId: 'a', type: 'video', url: 'https://x/a5.mp4', alt: 'ambulance rural road' },
        { segmentId: 'a', type: 'video', url: 'https://x/a6.mp4', alt: 'gps route map close up' },
        { segmentId: 'a', type: 'image', url: 'https://x/a4.jpg', alt: 'map still' },
        { segmentId: 'b', type: 'video', url: 'https://x/b1.mp4', alt: 'paramedic' },
        { segmentId: 'b', type: 'video', url: 'https://x/b2.mp4', alt: 'demolished house' },
        { segmentId: 'b', type: 'video', url: 'https://x/b3.mp4', alt: 'dispatch' },
        { segmentId: 'b', type: 'video', url: 'https://x/b5.mp4', alt: 'paramedic team ambulance' },
        { segmentId: 'b', type: 'video', url: 'https://x/b6.mp4', alt: 'demolished house street' },
        { segmentId: 'b', type: 'image', url: 'https://x/b4.jpg', alt: 'ruins still' },
        { segmentId: 'c', type: 'video', url: 'https://x/c1.mp4', alt: 'rural road' },
        { segmentId: 'c', type: 'video', url: 'https://x/c2.mp4', alt: 'crew' },
        { segmentId: 'c', type: 'video', url: 'https://x/c3.mp4', alt: 'ruins' },
        { segmentId: 'c', type: 'video', url: 'https://x/c5.mp4', alt: 'emergency crew rural route' },
        { segmentId: 'c', type: 'video', url: 'https://x/c6.mp4', alt: 'gps map ambulance dispatch' },
        { segmentId: 'c', type: 'video', url: 'https://x/c7.mp4', alt: 'demolished house address' },
        { segmentId: 'c', type: 'image', url: 'https://x/c4.jpg', alt: 'house' },
      ],
    };
    const soft = evaluateHarvestVolumeWithSoftPass(
      {
        volumePass: false,
        harvestQuality: {
          minPerSegment: 6,
          perSegment: {
            a: { count: 4 },
            b: { count: 4 },
            c: { count: 4 },
          },
        },
        pexelsFetched: 16,
        videoTopUp: [1, 2, 3, 4],
      },
      project,
    );
    expect(soft.pass).toBe(true);
    expect(soft.reason).toMatch(/soft-pass-cold-thin|soft-pass-motion|soft-pass-aggregate/);

    const tooThin = evaluateHarvestVolumeWithSoftPass(
      {
        volumePass: false,
        harvestQuality: {
          minPerSegment: 6,
          perSegment: {
            a: { count: 2 },
            b: { count: 3 },
            c: { count: 4 },
          },
        },
        pexelsFetched: 5,
        videoTopUp: [1],
      },
      {
        ...project,
        media: project.media.filter((m) => m.type === 'image' || /a1|b1|c1/.test(m.url)),
      },
    );
    expect(tooThin.pass).toBe(false);
    delete process.env.AUTOTUBE_EVAL_COLD;
  });

  it('preferBright fillers append after topical packs (not crowding subject queries)', async () => {
    const { stockMotionQueries } = await import('../../../scripts/lib/generate-full-video.mjs');
    const q = stockMotionQueries('bank fraud otp scam', true, { preferBright: true, faceSeek: true });
    // Office pads are banned; bright outdoor/news fillers trail faces+topic.
    expect(q.some((x) => /city street pedestrians daylight|news interview worried person outdoor|sunny city street/i.test(x))).toBe(
      true,
    );
    expect(q.every((x) => !/bright office daylight/i.test(x))).toBe(true);
    const faceIdx = q.findIndex((x) => /shocked person looking at phone/i.test(x));
    const brightIdx = q.findIndex((x) => /city street pedestrians daylight|sunny city street/i.test(x));
    expect(faceIdx).toBeGreaterThanOrEqual(0);
    expect(brightIdx).toBeGreaterThan(faceIdx);
  });

  it('port-strike queries lead with dock/cargo not office handheld filler', async () => {
    const { stockMotionQueries } = await import('../../../scripts/lib/generate-full-video.mjs');
    const q = stockMotionQueries('The port strike that hid a container-tracking hack', true, {
      preferBright: true,
      faceSeek: true,
    });
    expect(q.some((x) => /container|cargo|dock|shipping|port strike/i.test(x))).toBe(true);
    expect(q.every((x) => !/handheld camera|bright office daylight people/i.test(x))).toBe(true);
    const topicalIdx = q.findIndex((x) => /shipping container|cargo ship|port strike/i.test(x));
    const fillerIdx = q.findIndex((x) => /news interview|city street pedestrians/i.test(x));
    expect(topicalIdx).toBeGreaterThanOrEqual(0);
    if (fillerIdx >= 0) expect(fillerIdx).toBeGreaterThan(topicalIdx);
  });

  it('nursing preferBright uses care-home boost not office', async () => {
    const { stockMotionQueries } = await import('../../../scripts/lib/generate-full-video.mjs');
    const q = stockMotionQueries('nursing home cameras abuse', false, { preferBright: true });
    expect(q.some((x) => /care home|nursing home hallway|elderly care/i.test(x))).toBe(true);
    expect(q.every((x) => !/bright office daylight/i.test(x))).toBe(true);
  });

  it('release cold families get topical motion packs not weak topic joins', async () => {
    const { stockMotionQueries } = await import('../../../scripts/lib/generate-full-video.mjs');
    const ambulance = stockMotionQueries(
      'Why rural ambulance GPS routes send crews to demolished houses',
      false,
      { faceSeek: true },
    );
    expect(ambulance.some((x) => /ambulance|demolished|paramedic|gps/i.test(x))).toBe(true);
    expect(ambulance.some((x) => /face|worried|stressed|dispatcher/i.test(x))).toBe(true);
    const zoning = stockMotionQueries(
      'The city zoning map that erased flood-risk neighborhoods',
      false,
      { faceSeek: true },
    );
    expect(zoning.some((x) => /zoning|flood risk|map/i.test(x))).toBe(true);
    expect(zoning.every((x) => !/tornado storm damage/i.test(x))).toBe(true);
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
