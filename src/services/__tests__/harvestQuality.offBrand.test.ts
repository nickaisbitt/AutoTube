import { describe, expect, it } from 'vitest';

describe('off-brand visual harvest gate', () => {
  it('flags puppets/beetles/cartoons unless topic is about them', async () => {
    const { isOffBrandVisual, OFF_BRAND_VISUAL_RE } = await import(
      '../../../scripts/lib/harvest-quality.mjs'
    );
    expect(isOffBrandVisual('macro beetle close up', 'hospital hack')).toBe(true);
    expect(isOffBrandVisual('sock puppet show', 'ransomware schools')).toBe(true);
    expect(isOffBrandVisual('cartoon animation reel', 'bank fraud')).toBe(true);
    expect(isOffBrandVisual('hospital corridor night', 'hospital hack')).toBe(false);
    expect(OFF_BRAND_VISUAL_RE.test('beetle macro')).toBe(true);
  });

  it('drops off-brand assets in filterAssetsByRelevance', async () => {
    const { filterAssetsByRelevance } = await import('../../../scripts/lib/harvest-quality.mjs');
    const project = {
      topic: 'The hospital hack that exposed 10 million patient records overnight',
      script: [{ id: 's1', title: 'Breach', narration: 'Patient records leaked overnight.' }],
      media: [],
    };
    const media = [
      {
        id: 'a1',
        segmentId: 's1',
        type: 'video',
        url: 'https://example.com/beetle.mp4',
        alt: 'macro beetle insect close up',
        query: 'documentary footage',
      },
      {
        id: 'a2',
        segmentId: 's1',
        type: 'video',
        url: 'https://example.com/hospital.mp4',
        alt: 'hospital corridor empty hallway',
        query: 'hospital hack records',
      },
    ];
    const { media: kept, dropped } = filterAssetsByRelevance(media, project, { minScore: 0.2 });
    expect(dropped.some((d: { reason?: string }) => /off-brand/i.test(d.reason || ''))).toBe(true);
    expect(kept.some((a: { id: string }) => a.id === 'a2')).toBe(true);
    expect(kept.some((a: { id: string }) => a.id === 'a1')).toBe(false);
  });
});

describe('hook overlay layout + templates', () => {
  it('builds short expose overlays without EXPOSED: colon spam', async () => {
    const { buildShortHookOverlay } = await import('../../../scripts/lib/patch-project-for-loop.mjs');
    const overlay = buildShortHookOverlay(
      'The hospital hack that exposed 10 million patient records overnight',
      'This already emptied real bank accounts.',
    );
    expect(overlay).toMatch(/EXPOSED/);
    expect(overlay).not.toMatch(/EXPOSED:/);
    expect(overlay.split(/\s+/).length).toBeLessThanOrEqual(6);
  });

  it('splits long hooks so lines fit ~90% of 1920px width', async () => {
    const { layoutHookLines } = await import('../../../deploy/server-render/ffmpegOverlays.mjs');
    const words = ['EXPOSED', 'HOSPITAL', 'HACK', 'EXPOSED'];
    const { lines, fontSize } = layoutHookLines(words, 1920, 1080);
    expect(lines.length).toBeGreaterThanOrEqual(1);
    expect(lines.length).toBeLessThanOrEqual(2);
    expect(fontSize).toBeLessThanOrEqual(Math.round(1080 * 0.11));
    for (const line of lines) {
      expect(line.length * fontSize * 0.62).toBeLessThanOrEqual(1920 * 0.9 + 1);
    }
  });
});
