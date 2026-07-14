import { describe, expect, it } from 'vitest';

describe('topic family + impact beats', () => {
  it('resolves healthcare cyber family and query anchors', async () => {
    const { resolveTopicFamily, topicFamilyQueries } = await import('../topicFamilyQueries');
    expect(resolveTopicFamily('hospital hack patient records leaked')).toBe('healthcare_cyber');
    expect(resolveTopicFamily('landlord AI eviction')).toBe('landlord');
    const qs = topicFamilyQueries('The hospital hack that exposed patient records', 3);
    expect(qs.some((q) => /hospital|records|nurse|server/i.test(q))).toBe(true);
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
});
