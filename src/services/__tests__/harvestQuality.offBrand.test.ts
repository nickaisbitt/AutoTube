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

  it('rejects generic housing moving-box loops for landlord topics', async () => {
    const { filterAssetsByRelevance, isGenericStockJunk } = await import(
      '../../../scripts/lib/harvest-quality.mjs'
    );
    const topic = 'How landlords use AI to evict tenants faster';
    expect(isGenericStockJunk('moving boxes hallway apartment', topic)).toBe(true);
    const project = {
      topic,
      script: [{ id: 's1', title: 'Eviction', narration: 'landlords use AI to evict tenants faster' }],
      media: [],
    };
    const { media: kept, dropped } = filterAssetsByRelevance(
      [
        {
          id: 'boxes',
          segmentId: 's1',
          type: 'video',
          url: 'https://example.com/boxes.mp4',
          alt: 'moving boxes hallway apartment',
          query: 'tenant moving boxes',
        },
        {
          id: 'notice',
          segmentId: 's1',
          type: 'video',
          url: 'https://example.com/notice.mp4',
          alt: 'person holding eviction notice paper',
          query: 'eviction notice paper hands',
        },
      ],
      project,
      { minScore: 0.2 },
    );
    expect(dropped.some((d: { id?: string; url?: string }) => d.url?.includes('boxes'))).toBe(true);
    expect(kept.some((a: { id: string }) => a.id === 'notice')).toBe(true);
    expect(kept.some((a: { id: string }) => a.id === 'boxes')).toBe(false);
  });
});

describe('generic stock junk harvest gate', () => {
  const nursingTopic = 'The nursing home cameras that recorded abuse for years';

  it('rejects blurry, overexposed, staged reenactment, produce, and empty hospital bed filler', async () => {
    const {
      isGenericStockJunk,
      genericStockJunkReason,
      BLURRY_LOW_QUALITY_RE,
      OVEREXPOSED_STOCK_RE,
      STAGED_REENACT_RE,
      PRODUCE_GROCERY_JUNK_RE,
      EMPTY_HOSPITAL_BED_RE,
    } = await import('../../../scripts/lib/harvest-quality.mjs');

    expect(BLURRY_LOW_QUALITY_RE.test('blurry out of focus hallway')).toBe(true);
    expect(OVEREXPOSED_STOCK_RE.test('overexposed washed out window')).toBe(true);
    expect(STAGED_REENACT_RE.test('staged reenactment hospital scene')).toBe(true);
    expect(PRODUCE_GROCERY_JUNK_RE.test('vegetable crate farmers market')).toBe(true);
    expect(EMPTY_HOSPITAL_BED_RE.test('empty hospital bed close up')).toBe(true);

    expect(isGenericStockJunk('blurry generic stock hallway', nursingTopic)).toBe(true);
    expect(isGenericStockJunk('overexposed washed out office', nursingTopic)).toBe(true);
    expect(isGenericStockJunk('staged reenactment caregiver scene', nursingTopic)).toBe(true);
    expect(isGenericStockJunk('produce crate grocery stock', nursingTopic)).toBe(true);
    expect(isGenericStockJunk('empty hospital bed blurry bed', nursingTopic)).toBe(true);
    expect(genericStockJunkReason('architectural model conference room', nursingTopic)).toMatch(
      /nursing|corporate/i,
    );

    expect(isGenericStockJunk('worried family visiting nursing home', nursingTopic)).toBe(false);
    expect(isGenericStockJunk('security camera cctv hallway nursing home', nursingTopic)).toBe(false);
  });

  it('drops junk stock in filterAssetsByRelevance for nursing topics', async () => {
    const { filterAssetsByRelevance } = await import('../../../scripts/lib/harvest-quality.mjs');
    const project = {
      topic: nursingTopic,
      script: [{ id: 's1', title: 'Cameras', narration: 'cameras recorded nursing home abuse' }],
      media: [],
    };
    const media = [
      {
        id: 'produce',
        segmentId: 's1',
        type: 'video',
        url: 'https://example.com/produce.mp4',
        alt: 'vegetable crate farmers market produce',
        query: 'produce stock',
      },
      {
        id: 'bed',
        segmentId: 's1',
        type: 'video',
        url: 'https://example.com/bed.mp4',
        alt: 'empty hospital bed blurry bed',
        query: 'hospital bed',
      },
      {
        id: 'cctv',
        segmentId: 's1',
        type: 'video',
        url: 'https://example.com/cctv.mp4',
        alt: 'security camera cctv hallway nursing home',
        query: 'security camera cctv hallway',
      },
    ];
    const { media: kept, dropped } = filterAssetsByRelevance(media, project, { minScore: 0.2 });
    expect(dropped.some((d: { url?: string }) => d.url?.includes('produce'))).toBe(true);
    expect(dropped.some((d: { reason?: string }) => /produce|hospital bed|blurry/i.test(d.reason || ''))).toBe(
      true,
    );
    expect(kept.some((a: { id: string }) => a.id === 'cctv')).toBe(true);
    expect(kept.some((a: { id: string }) => a.id === 'produce')).toBe(false);
    expect(kept.some((a: { id: string }) => a.id === 'bed')).toBe(false);
  });
});

describe('isJunkStockClip + faceSeek relevance', () => {
  it('isJunkStockClip rejects generic filler patterns', async () => {
    const { isJunkStockClip } = await import('../../../scripts/lib/generate-full-video.mjs');
    const topic = 'The nursing home cameras that recorded abuse for years';
    expect(isJunkStockClip({ alt: 'blurry generic stock footage' }, topic)).toBe(true);
    expect(isJunkStockClip({ alt: 'overexposed washed out clip' }, topic, { preferBright: true })).toBe(
      true,
    );
    expect(isJunkStockClip({ alt: 'staged reenactment scene actors' }, topic)).toBe(true);
    expect(isJunkStockClip({ alt: 'produce crate grocery aisle' }, topic)).toBe(true);
    expect(isJunkStockClip({ alt: 'security camera cctv nursing home' }, topic)).toBe(false);
  });

  it('stockMotionQueries include anti-staged documentary anchors when faceSeek on', async () => {
    const { stockMotionQueries } = await import('../../../scripts/lib/generate-full-video.mjs');
    const q = stockMotionQueries('bank fraud otp scam', true, { preferBright: true, faceSeek: true });
    expect(q.some((x) => /documentary|real footage|not actors/i.test(x))).toBe(true);
  });

  it('visionPromptForTopic mentions blurry/staged/overexposed junk on nursing topics', async () => {
    const { visionPromptForTopic } = await import('../../../scripts/lib/stock-vision-gate.mjs');
    const prompt = visionPromptForTopic('The nursing home cameras that recorded abuse for years');
    expect(prompt).toMatch(/blurry|overexposed|staged reenactment|produce/i);
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
