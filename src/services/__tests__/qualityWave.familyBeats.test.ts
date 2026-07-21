import { beforeEach, describe, expect, it } from 'vitest';

describe('topic family + impact beats', () => {
  beforeEach(() => {
    process.env.AUTOTUBE_TOPIC_FAMILY_TEMPLATES = '1';
    delete process.env.AUTOTUBE_EVAL_COLD;
  });

  it('resolves healthcare cyber family and query anchors', async () => {
    const { resolveTopicFamily, topicFamilyQueries } = await import('../topicFamilyQueries');
    expect(resolveTopicFamily('hospital hack patient records leaked')).toBe('healthcare_cyber');
    expect(resolveTopicFamily('landlord AI eviction')).toBe('landlord');
    const qs = topicFamilyQueries('The hospital hack that exposed patient records', 3);
    expect(qs.some((q) => /hospital|records|nurse|server/i.test(q))).toBe(true);
  });

  it('resolves airline family to safe stock-provider query anchors', async () => {
    const { isSafeStockProviderQuery, resolveTopicFamily, stockProviderQueriesForTopic } = await import(
      '../topicFamilyQueries'
    );
    const topic =
      'Meet Captain Sarah Jenkins Mesa Airlines How a regional airline hid recurring cabin-pressure failures from passengers';
    const qs = stockProviderQueriesForTopic(topic, 6);

    expect(resolveTopicFamily(topic)).toBe('airline');
    expect(qs).toContain('oxygen mask deploy airplane cabin');
    expect(qs.every(isSafeStockProviderQuery)).toBe(true);
    expect(qs.every((q) => !/captain sarah|sarah jenkins|mesa airlines|how a regional airline/i.test(q))).toBe(
      true,
    );
    expect(isSafeStockProviderQuery(topic)).toBe(false);
  });

  it('resolves nursing abuse family separately from hospital breach', async () => {
    const { resolveTopicFamily, topicFamilyQueries } = await import('../topicFamilyQueries');
    const topic = 'The nursing home cameras that recorded abuse for years';
    expect(resolveTopicFamily(topic)).toBe('nursing_abuse');
    const qs = topicFamilyQueries(topic, 4);
    expect(qs.some((q) => /camera|cctv|nursing|care|elderly|surveillance/i.test(q))).toBe(true);
    expect(qs.every((q) => !/server room|medical records laptop/i.test(q))).toBe(true);
  });

  it('resolves veterans benefits family separately from bank scam', async () => {
    const { resolveTopicFamily, topicFamilyQueries } = await import('../topicFamilyQueries');
    const topic = 'Why veterans benefits data leaked to dark web brokers';
    expect(resolveTopicFamily(topic)).toBe('veterans_benefits');
    expect(resolveTopicFamily('employee benefits open enrollment HR')).toBe('generic');
    const qs = topicFamilyQueries(topic, 3);
    expect(qs.some((q) => /veteran|credit|paperwork|government|identity/i.test(q))).toBe(true);
    expect(qs.every((q) => !/bank building|hacker typing|credit card payment/i.test(q))).toBe(true);
  });

  it('builds healthcare impact beats instead of bank OTP cards', async () => {
    const { buildImpactBeatsForTopic } = await import('../../../scripts/lib/impactBeatsByTopic.mjs');
    const beats = buildImpactBeatsForTopic(
      'The hospital hack that exposed 10 million patient records overnight',
    );
    expect(beats.join(' ')).toMatch(/RECORDS|PATIENT|HOSPITAL|HIPAA/i);
    expect(beats.join(' ')).not.toMatch(/OTP STOLEN|VOICE CLONE/i);
  });

  it('housing impact beats avoid AUTO SKIPPED overlay glitch text', async () => {
    const { buildImpactBeatsForTopic } = await import('../../../scripts/lib/impactBeatsByTopic.mjs');
    const beats = buildImpactBeatsForTopic('How landlords use AI to evict tenants faster');
    expect(beats.join(' ')).toMatch(/EVICT|LEASE|RENT/i);
    expect(beats.join(' ')).not.toMatch(/AUTO SKIPPED/i);
  });

  it('builds nursing impact beats instead of hospital breach cards', async () => {
    const { buildImpactBeatsForTopic } = await import('../../../scripts/lib/impactBeatsByTopic.mjs');
    const { impactBeatsMatchTopic } = await import('../../../scripts/lib/topic-family.mjs');
    const topic = 'The nursing home cameras that recorded abuse for years';
    const beats = buildImpactBeatsForTopic(topic);
    expect(beats.join(' ')).toMatch(/CAMERA|ABUSE|STAFF/i);
    expect(beats.join(' ')).not.toMatch(/HOSPITAL BREACH|CHARTS STOLEN|OTP/i);
    expect(impactBeatsMatchTopic(beats, topic)).toBe(true);
    expect(impactBeatsMatchTopic(['HOSPITAL BREACH', 'CHARTS STOLEN'], topic)).toBe(false);
  });

  it('builds insurance fraud impact beats instead of bank OTP cards', async () => {
    const { buildImpactBeatsForTopic } = await import('../../../scripts/lib/impactBeatsByTopic.mjs');
    const { resolveTopicFamily } = await import('../topicFamilyQueries');
    const topic = 'The insurance scam using fake car crash videos';
    expect(resolveTopicFamily(topic)).toBe('insurance_fraud');
    const beats = buildImpactBeatsForTopic(topic);
    expect(beats.join(' ')).toMatch(/CRASH|CLAIM|DASHCAM|WHIPLASH/i);
    expect(beats.join(' ')).not.toMatch(/OTP STOLEN|VOICE CLONE|LEASE DENIED/i);
  });

  it('caps per-URL reuse at 1 on housing body cuts when pool is large enough', async () => {
    const { buildEditTimeline } = await import('../../../scripts/lib/build-edit-timeline.mjs');
    const urls = Array.from({ length: 6 }, (_, i) => `https://videos.pexels.com/video-files/${i}/${i}.mp4`);
    const project = {
      topic: 'How landlords use AI to evict tenants faster',
      script: [{ id: 's2', type: 'body', duration: 6, narration: 'eviction story' }],
      media: urls.map((url, i) => ({
        id: `a${i}`,
        segmentId: 's2',
        type: 'video',
        url,
        alt: i % 2 ? 'eviction notice tenant worried' : 'landlord apartment door',
      })),
    };
    const tl = buildEditTimeline(project, { cutIntervalSec: 1, maxReusePerUrl: 1 });
    const uses = tl.map((e) => project.media.find((m) => m.id === e.assetId)?.url);
    for (const url of urls) {
      expect(uses.filter((u) => u === url).length).toBeLessThanOrEqual(1);
    }
  });

  it('rejects cross-topic hook overrides (healthcare hook on landlord)', async () => {
    const { buildShockHookLine, hookClashesWithTopic } = await import('../../../e2e/openRouterMock.mjs');
    const landlordTopic = 'How landlords use AI to evict tenants faster';
    const healthcareHook = 'Your medical chart was already in the breach dump.';
    expect(hookClashesWithTopic(landlordTopic, healthcareHook)).toBe(true);
    const hook = buildShockHookLine(landlordTopic, healthcareHook);
    expect(hook).toMatch(/evict|landlord|ai already filed/i);
    expect(hook).not.toMatch(/medical chart|breach dump/i);
  });

  it('avoids bank shock hooks on nursing-home / veterans topics', async () => {
    const { buildShockHookLine } = await import('../../../e2e/openRouterMock.mjs');
    const { buildShortHookOverlay } = await import('../../../scripts/lib/patch-project-for-loop.mjs');
    const nursing = buildShockHookLine('The nursing home cameras that recorded abuse for years');
    expect(nursing).not.toMatch(/bank|vanish before you hang/i);
    expect(nursing).toMatch(/camera|staff|hurt/i);
    expect(buildShortHookOverlay('nursing home cameras abuse', nursing)).toMatch(/CAMERAS|ABUSE/i);
    expect(
      buildShortHookOverlay('nursing home cameras abuse', nursing, {
        preferredOverlay: 'URGENT NURSING HOME CAMERAS RECORDED',
      }),
    ).toBe('CAMERAS CAUGHT THE ABUSE');
    const vet = buildShockHookLine('Why veterans benefits data leaked to dark web brokers');
    expect(vet).toMatch(/benefits|sale|file/i);
    expect(vet).not.toMatch(/emptied real bank/i);
  });

  it('spoken stakes for release cold families (not hash templates)', async () => {
    const { buildShockHookLine } = await import('../../../e2e/openRouterMock.mjs');
    const zoning = buildShockHookLine('The city zoning map that erased flood-risk neighborhoods');
    expect(zoning).toMatch(/flood|zoning|erased/i);
    expect(zoning).not.toMatch(/already trapped|ordinary people are already paying/i);
    const ambulance = buildShockHookLine(
      'Why rural ambulance GPS routes send crews to demolished houses',
    );
    expect(ambulance).toMatch(/gps|ambulance|gone/i);
    expect(ambulance).not.toMatch(/they tried to hide this|ordinary people are already paying/i);
    const airline = buildShockHookLine('How a regional airline hid recurring cabin-pressure failures');
    expect(airline).toMatch(/cabin|pressure/i);
  });

  it('nursing stock queries prefer CCTV/care over office/hospital cyber', async () => {
    const { stockMotionQueries } = await import('../../../scripts/lib/generate-full-video.mjs');
    const q = stockMotionQueries('The nursing home cameras that recorded abuse for years', false, {
      faceSeek: true,
      preferBright: true,
    });
    expect(q.some((x) => /cctv|camera|nursing|care home|elderly|surveillance/i.test(x))).toBe(true);
    expect(q.every((x) => !/bright office daylight|server room|hacker typing/i.test(x))).toBe(true);
  });

  it('vision prompt rejects cartoons/puppets/insects', async () => {
    const { buildVisionCheckPrompt } = await import('../visionCheck');
    const { system } = buildVisionCheckPrompt('https://example.com/x.jpg');
    expect(system).toMatch(/Cartoon|puppet|insect/i);
  });

  it('intro timeline prefers care/CCTV over architectural models for nursing topics', async () => {
    const { buildEditTimeline } = await import('../../../scripts/lib/build-edit-timeline.mjs');
    const project = {
      topic: 'The nursing home cameras that recorded abuse for years',
      script: [
        { id: 's1', type: 'intro', duration: 3, narration: 'cameras recorded nursing home abuse' },
        { id: 's2', type: 'body', duration: 4, narration: 'staff ignored complaints' },
        { id: 's3', type: 'outro', duration: 4, narration: 'protect them call for help' },
      ],
      media: [
        {
          id: 'arch',
          segmentId: 's1',
          type: 'video',
          url: 'https://x/arch.mp4',
          alt: 'architectural model office meeting',
          query: 'bright office daylight people',
        },
        {
          id: 'cctv',
          segmentId: 's1',
          type: 'video',
          url: 'https://x/cctv.mp4',
          alt: 'security camera cctv hallway nursing home',
          query: 'security camera cctv hallway',
        },
        {
          id: 'beetle',
          segmentId: 's3',
          type: 'video',
          url: 'https://x/beetle.mp4',
          alt: 'macro beetle insect',
        },
        {
          id: 'face',
          segmentId: 's3',
          type: 'video',
          url: 'https://x/face.mp4',
          alt: 'worried family visiting nursing home',
          query: 'worried family elderly care visit',
        },
      ],
    };
    const tl = buildEditTimeline(project, { cutIntervalSec: 1 });
    const intro = tl.filter((e) => e.segmentId === 's1');
    expect(intro.length).toBeGreaterThan(0);
    expect(intro[0].assetId).toBe('cctv');
    const outro = tl.filter((e) => e.segmentId === 's3');
    expect(outro.every((e) => e.assetId !== 'beetle')).toBe(true);
    expect(outro[0].assetId).toBe('face');
  });

  it('outro timeline prefers motion and demotes beetles', async () => {
    const { buildEditTimeline } = await import('../../../scripts/lib/build-edit-timeline.mjs');
    const project = {
      script: [
        { id: 's1', type: 'intro', duration: 3, narration: 'hook' },
        { id: 's2', type: 'body', duration: 4, narration: 'body' },
        { id: 's3', type: 'outro', duration: 4, narration: 'cta' },
      ],
      media: [
        { id: 'beetle', segmentId: 's3', type: 'video', url: 'https://x/beetle.mp4', alt: 'macro beetle insect' },
        { id: 'face', segmentId: 's3', type: 'video', url: 'https://x/face.mp4', alt: 'worried person face close up' },
        { id: 'still', segmentId: 's3', type: 'image', url: 'https://x/still.jpg', alt: 'document still' },
      ],
    };
    const tl = buildEditTimeline(project, { cutIntervalSec: 1 });
    const outro = tl.filter((e) => e.segmentId === 's3');
    expect(outro.length).toBeGreaterThan(0);
    expect(outro.every((e) => e.assetId !== 'still')).toBe(true);
    expect(outro[0].assetId).toBe('face');
  });

  it('intro timeline borrows motion when segment has a single asset', async () => {
    const { buildEditTimeline } = await import('../../../scripts/lib/build-edit-timeline.mjs');
    const project = {
      topic: 'The nursing home cameras that recorded abuse for years',
      script: [
        { id: 's1', type: 'intro', duration: 4, narration: 'cameras recorded nursing home abuse' },
        { id: 's2', type: 'body', duration: 4, narration: 'staff covered it up' },
      ],
      media: [
        {
          id: 'intro-only',
          segmentId: 's1',
          type: 'video',
          url: 'https://x/intro.mp4',
          alt: 'security camera cctv hallway nursing home',
          query: 'security camera cctv hallway',
        },
        {
          id: 'body-cctv',
          segmentId: 's2',
          type: 'video',
          url: 'https://x/body.mp4',
          alt: 'care home corridor wheelchair elderly',
          query: 'care home corridor wheelchair',
        },
      ],
    };
    const intro = buildEditTimeline(project, { cutIntervalSec: 1 }).filter((e) => e.segmentId === 's1');
    const ids = new Set(intro.map((e) => e.assetId));
    expect(intro.length).toBeGreaterThan(1);
    expect(ids.size).toBeGreaterThan(1);
  });

  it('edit timeline avoids reusing the same clip URL across body cuts when alternatives exist', async () => {
    const { buildEditTimeline } = await import('../../../scripts/lib/build-edit-timeline.mjs');
    const project = {
      topic: 'How landlords use AI to evict tenants faster',
      script: [
        { id: 's1', type: 'intro', duration: 3, narration: 'landlords use AI to evict tenants' },
        { id: 's2', type: 'body', duration: 12, narration: 'eviction notices filed automatically' },
      ],
      media: [
        { id: 'a1', segmentId: 's2', type: 'video', url: 'https://x/one.mp4', alt: 'eviction notice paper hands' },
        { id: 'a2', segmentId: 's2', type: 'video', url: 'https://x/two.mp4', alt: 'worried couple apartment kitchen' },
        { id: 'a3', segmentId: 's2', type: 'video', url: 'https://x/three.mp4', alt: 'apartment building exterior city' },
        { id: 'a4', segmentId: 's2', type: 'video', url: 'https://x/four.mp4', alt: 'court documents paperwork close up' },
      ],
    };
    const tl = buildEditTimeline(project, { cutIntervalSec: 1 });
    const body = tl.filter((e) => e.segmentId === 's2');
    const urls = body.map((e) => project.media.find((m) => m.id === e.assetId)?.url);
    const unique = new Set(urls.filter(Boolean));
    expect(body.length).toBeGreaterThan(2);
    expect(unique.size).toBeGreaterThanOrEqual(3);
    expect(unique.size).toBeLessThanOrEqual(project.media.length);
  });

  describe('diamond heist / fake airport family', () => {
    const topic = 'The diamond heist that used a fake airport';

    it('resolves heist_fraud family and airport/jewel query anchors', async () => {
      const { resolveTopicFamily, topicFamilyQueries } = await import('../topicFamilyQueries');
      expect(resolveTopicFamily(topic)).toBe('heist_fraud');
      const qs = topicFamilyQueries(topic, 4);
      expect(qs.some((q) => /airport|diamond|vault|security|jewel/i.test(q))).toBe(true);
      expect(qs.every((q) => !/bank building|hacker typing|credit card payment|otp/i.test(q))).toBe(true);
    });

    it('builds heist impact beats instead of bank OTP cards', async () => {
      const { buildImpactBeatsForTopic } = await import('../../../scripts/lib/impactBeatsByTopic.mjs');
      const { impactBeatsMatchTopic } = await import('../../../scripts/lib/topic-family.mjs');
      const beats = buildImpactBeatsForTopic(topic);
      expect(beats.join(' ')).toMatch(/FAKE AIRPORT|VAULT|DIAMOND|HEIST/i);
      expect(beats.join(' ')).not.toMatch(/OTP STOLEN|VOICE CLONE/i);
      expect(impactBeatsMatchTopic(beats, topic)).toBe(true);
      expect(impactBeatsMatchTopic(['OTP STOLEN', 'WIRE HIJACKED'], topic)).toBe(false);
    });

    it('heist stock queries prefer airport/vault over bank OTP', async () => {
      const { stockMotionQueries } = await import('../../../scripts/lib/generate-full-video.mjs');
      const q = stockMotionQueries(topic, false, { faceSeek: true, preferBright: true });
      expect(q.some((x) => /airport|diamond|vault|jewel|cargo|security/i.test(x))).toBe(true);
      expect(q.every((x) => !/bank building|hacker typing|credit card payment|smartphone banking/i.test(x))).toBe(
        true,
      );
    });
  });
});
