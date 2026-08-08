import { describe, expect, it } from 'vitest';
import { harvestHomonymBlockReason } from '../harvest-quality.mjs';
import { shouldAdmitHarvestClip } from '../harvest-relevance-gate.mjs';

const BEE_TOPIC = 'Why Victorian beekeepers feared the silent hive';
const AIRLINE_TOPIC = 'The regional airline that hid cabin-pressure failures';

describe('harvestHomonymBlockReason', () => {
  it('blocks aerospace honeycomb on beekeepers topics', () => {
    const reason = harvestHomonymBlockReason(
      'honeycomb in aerospace composite structural engineering',
      BEE_TOPIC,
    );
    expect(reason).toMatch(/aerospace honeycomb/);
  });

  it('allows real honeycomb hive footage', () => {
    expect(
      harvestHomonymBlockReason(
        'close-up honeycomb frames in a working bee hive',
        BEE_TOPIC,
      ),
    ).toBeNull();
  });

  it('blocks beekeeper movie on beekeepers topics', () => {
    const reason = harvestHomonymBlockReason(
      'the beekeeper 2023 us jason statham action movie',
      BEE_TOPIC,
    );
    expect(reason).toMatch(/fiction\/movie/);
  });

  it('blocks Hindenburg and 707 promo mock-up on airline topics', () => {
    expect(harvestHomonymBlockReason('hindenburg disaster herb morrison', AIRLINE_TOPIC))
      .toMatch(/Hindenburg/);
    expect(
      harvestHomonymBlockReason(
        'boeing 707 stratoliner promotional film cabin mock up',
        AIRLINE_TOPIC,
      ),
    ).toMatch(/mock-up/);
  });
});

describe('shouldAdmitHarvestClip', () => {
  it('admits only KEEP verdicts', () => {
    expect(shouldAdmitHarvestClip('KEEP')).toBe(true);
    expect(shouldAdmitHarvestClip('WEAK')).toBe(false);
    expect(shouldAdmitHarvestClip('REJECT')).toBe(false);
    expect(shouldAdmitHarvestClip(null)).toBe(false);
  });
});
