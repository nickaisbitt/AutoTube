import { describe, expect, it } from 'vitest';

describe('topic family + impact beats', () => {
  it('resolves healthcare cyber family and query anchors', async () => {
    const { resolveTopicFamily, topicFamilyQueries } = await import('../topicFamilyQueries');
    expect(resolveTopicFamily('hospital hack patient records leaked')).toBe('healthcare_cyber');
    expect(resolveTopicFamily('landlord AI eviction')).toBe('landlord');
    const qs = topicFamilyQueries('The hospital hack that exposed patient records', 3);
    expect(qs.some((q) => /hospital|records|nurse|server/i.test(q))).toBe(true);
  });

  it('builds healthcare impact beats instead of bank OTP cards', async () => {
    const { buildImpactBeatsForTopic } = await import('../../../scripts/lib/impactBeatsByTopic.mjs');
    const beats = buildImpactBeatsForTopic(
      'The hospital hack that exposed 10 million patient records overnight',
    );
    expect(beats.join(' ')).toMatch(/RECORDS|PATIENT|HOSPITAL|HIPAA/i);
    expect(beats.join(' ')).not.toMatch(/OTP STOLEN|VOICE CLONE/i);
  });

  it('vision prompt rejects cartoons/puppets/insects', async () => {
    const { buildVisionCheckPrompt } = await import('../visionCheck');
    const { system } = buildVisionCheckPrompt('https://example.com/x.jpg');
    expect(system).toMatch(/Cartoon|puppet|insect/i);
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
