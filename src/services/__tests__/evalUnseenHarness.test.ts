import { describe, expect, it, afterEach } from 'vitest';

describe('unseen-topic eval harness foundations', () => {
  afterEach(() => {
    delete process.env.AUTOTUBE_EVAL_COLD;
    delete process.env.AUTOTUBE_CURATED_PACKS;
    delete process.env.AUTOTUBE_TOPIC_FAMILY_TEMPLATES;
    delete process.env.AUTOTUBE_KEEP_BEST;
  });

  it('rejects eval topics that overlap known proof prompts', async () => {
    const { validateEvalTopicSet, loadEvalTopicSet, findTopicLeak } = await import(
      '../../../scripts/lib/eval-topics.mjs'
    );
    const leak = findTopicLeak('How landlords use AI to evict tenants faster');
    expect(leak.leaked).toBe(true);

    const bad = validateEvalTopicSet([
      { id: 'x', topic: 'The nursing home cameras that recorded abuse for years' },
    ]);
    expect(bad.ok).toBe(false);

    const dev = loadEvalTopicSet('dev');
    const release = loadEvalTopicSet('release');
    expect(validateEvalTopicSet(dev.topics).ok).toBe(true);
    expect(validateEvalTopicSet(release.topics).ok).toBe(true);
    // Dev and release must not share ids/topics
    const releaseTopics = new Set(release.topics.map((t) => t.topic.toLowerCase()));
    expect(dev.topics.every((t) => !releaseTopics.has(t.topic.toLowerCase()))).toBe(true);
  });

  it('disables curated packs / keep-best / family templates in cold eval', async () => {
    process.env.AUTOTUBE_EVAL_COLD = '1';
    const flags = await import('../../../scripts/lib/eval-flags.mjs');
    expect(flags.isEvalColdMode()).toBe(true);
    expect(flags.curatedPacksEnabled()).toBe(false);
    expect(flags.keepBestEnabled()).toBe(false);
    expect(flags.topicFamilyTemplatesEnabled()).toBe(false);

    const { topicalStockVideos, STOCK_VIDEO_POOL } = await import(
      '../../../scripts/lib/stock-media-urls.mjs'
    );
    const housing = topicalStockVideos('How landlords use AI to evict tenants faster', STOCK_VIDEO_POOL);
    expect(housing.every((v) => !(v.tags || []).includes('housing') || /archive|mixkit/i.test(v.url))).toBe(true);

    const { topicFamilyQueries } = await import('../topicFamilyQueries');
    expect(topicFamilyQueries('hospital hack patient records', 4)).toEqual([]);
  });

  it('keeps curated packs and family templates off by default (opt-in)', async () => {
    delete process.env.AUTOTUBE_EVAL_COLD;
    delete process.env.AUTOTUBE_CURATED_PACKS;
    delete process.env.AUTOTUBE_TOPIC_FAMILY_TEMPLATES;
    const flags = await import('../../../scripts/lib/eval-flags.mjs');
    expect(flags.curatedPacksEnabled()).toBe(false);
    expect(flags.topicFamilyTemplatesEnabled()).toBe(false);
  });

  it('enables beat vision + eval cold in harvest session payload', async () => {
    process.env.AUTOTUBE_EVAL_COLD = '1';
    process.env.AUTOTUBE_BEAT_VISION = '1';
    const { harvestContextFromFixState, harvestSessionStoragePayload } = await import(
      '../../../scripts/lib/harvest-loop-context.mjs'
    );
    const ctx = harvestContextFromFixState({ beatVision: true, visualBeats: true });
    expect(ctx.beatVision).toBe(true);
    const payload = harvestSessionStoragePayload(ctx);
    expect(payload.autotube_beat_vision).toBe('true');
    expect(payload.autotube_eval_cold).toBe('true');
  });

  it('passes script visualNote into generateAIPlan signature', async () => {
    const { generateAIPlan } = await import('../llmVisualDirector');
    expect(typeof generateAIPlan).toBe('function');
    expect(generateAIPlan.toString()).toMatch(/visualNote/);
  });
});
