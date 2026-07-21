import { beforeEach, describe, expect, it } from 'vitest';
import {
  shouldKeepBest,
  KEEP_BEST_RAW_FLOOR,
  applyFrozenMediaToProject,
  enterPolishMode,
} from '../../../scripts/lib/keep-best.mjs';
import { STOCK_HOUSING_VIDEOS, topicalStockVideos } from '../../../scripts/lib/stock-media-urls.mjs';

describe('keep-best + housing pack', () => {
  beforeEach(() => {
    process.env.AUTOTUBE_CURATED_PACKS = '1';
    delete process.env.AUTOTUBE_EVAL_COLD;
  });
  it(`keeps best when upload-ready or raw ≥ ${KEEP_BEST_RAW_FLOOR}`, () => {
    expect(
      shouldKeepBest({
        uploadReady: true,
        brutal: { rawOverall: 7.0, hasCriticalIssues: false },
      }),
    ).toBe(true);
    expect(
      shouldKeepBest({
        uploadReady: false,
        brutal: { rawOverall: 7.4, hasCriticalIssues: false },
      }),
    ).toBe(true);
    expect(
      shouldKeepBest({
        uploadReady: false,
        brutal: { rawOverall: 7.2, hasCriticalIssues: false },
      }),
    ).toBe(false);
    expect(
      shouldKeepBest({
        uploadReady: true,
        brutal: { rawOverall: 8, hasCriticalIssues: true },
      }),
    ).toBe(false);
  });

  it('enterPolishMode disables reharvest', () => {
    const s = { reHarvestMedia: true, fixStrategy: 'reharvest', rewriteScript: true };
    const applied = [];
    enterPolishMode(s, { rawOverall: 7.4, frozenProjectPath: '/tmp/frozen.json' }, applied);
    expect(s.keepBestMedia).toBe(true);
    expect(s.reHarvestMedia).toBe(false);
    expect(s.fixStrategy).toBe('polish');
    expect(s.rewriteScript).toBe(false);
    expect(s.frozenProjectPath).toBe('/tmp/frozen.json');
    expect(applied[0]).toMatch(/keep-best/);
  });

  it('applyFrozenMediaToProject remaps segment ids', () => {
    const frozen = {
      script: [
        { id: 'old-intro', type: 'intro' },
        { id: 'old-body', type: 'body' },
      ],
      media: [
        { id: 'm1', segmentId: 'old-intro', type: 'video', url: 'https://x/a.mp4', alt: 'eviction notice' },
        { id: 'm2', segmentId: 'old-body', type: 'video', url: 'https://x/b.mp4', alt: 'apartment' },
      ],
      editTimeline: [
        { segmentId: 'old-intro', startSec: 0, endSec: 1, assetId: 'm1' },
        { segmentId: 'old-body', startSec: 0, endSec: 1, assetId: 'm2' },
      ],
    };
    const project = {
      script: [
        { id: 'new-intro', type: 'intro' },
        { id: 'new-body', type: 'body' },
      ],
      media: [],
    };
    const r = applyFrozenMediaToProject(project, frozen);
    expect(r.ok).toBe(true);
    expect(project.media).toHaveLength(2);
    expect(project.media[0].segmentId).toBe('new-intro');
    expect(project.media[1].segmentId).toBe('new-body');
    expect(project.editTimeline[0].segmentId).toBe('new-intro');
  });

  it('housing topics prefer curated STOCK_HOUSING_VIDEOS pack', () => {
    expect(STOCK_HOUSING_VIDEOS.length).toBeGreaterThanOrEqual(10);
    expect(STOCK_HOUSING_VIDEOS.every((v) => /pexels\.com/i.test(v.url))).toBe(true);
    const pack = topicalStockVideos('How landlords use AI to evict tenants faster');
    expect(pack.some((v) => /eviction|apartment|couple|tenant/i.test(v.alt))).toBe(true);
  });
});
