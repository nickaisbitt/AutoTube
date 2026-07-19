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

  it('rejects B&W life-vest demos and dark cabin-window stock for airline topics', async () => {
    const {
      AIRPLANE_CABIN_WINDOW_RE,
      AIRLINE_SAFETY_DEMO_STOCK_RE,
      DARK_WINDOW_TONE_RE,
      MONOCHROME_STOCK_RE,
      filterAssetsByRelevance,
      genericStockJunkReason,
      isGenericStockJunk,
    } = await import('../../../scripts/lib/harvest-quality.mjs');

    const airlineTopic = 'How a regional airline hid recurring cabin-pressure failures';
    expect(MONOCHROME_STOCK_RE.test('black and white flight attendants')).toBe(true);
    expect(AIRLINE_SAFETY_DEMO_STOCK_RE.test('flight attendant life vest demo')).toBe(true);
    expect(AIRPLANE_CABIN_WINDOW_RE.test('airplane cabin window view')).toBe(true);
    expect(DARK_WINDOW_TONE_RE.test('dark night silhouette')).toBe(true);

    expect(
      genericStockJunkReason('black and white flight attendant life vest demo', airlineTopic),
    ).toMatch(/life-vest|safety-demo/i);
    expect(genericStockJunkReason('black and white airline cabin b-roll', airlineTopic)).toMatch(
      /black-and-white|monochrome/i,
    );
    expect(genericStockJunkReason('airplane cabin window dark night silhouette', airlineTopic)).toMatch(
      /dark.*window/i,
    );
    expect(isGenericStockJunk('covid masked couple passengers in airplane cabin', airlineTopic)).toBe(true);
    expect(
      isGenericStockJunk(
        'covid masked couple passengers in airplane cabin',
        'COVID mask mandate changed airline cabin rules',
      ),
    ).toBe(false);

    const project = {
      topic: airlineTopic,
      script: [
        {
          id: 's1',
          title: 'Cabin pressure failures',
          narration: 'airline cabin pressure failure cockpit mechanic oxygen inspection',
        },
      ],
      media: [],
    };
    const { media: kept, dropped } = filterAssetsByRelevance(
      [
        {
          id: 'vest',
          segmentId: 's1',
          type: 'video',
          url: 'https://example.com/vest.mp4',
          alt: 'black and white flight attendant life vest demo',
          query: 'airline cabin pressure safety',
        },
        {
          id: 'window',
          segmentId: 's1',
          type: 'video',
          url: 'https://example.com/window.mp4',
          alt: 'airplane cabin window dark night silhouette',
          query: 'airline cabin pressure failure',
        },
        {
          id: 'mechanic',
          segmentId: 's1',
          type: 'video',
          url: 'https://example.com/mechanic.mp4',
          alt: 'airline mechanic inspecting oxygen pressure gauge in cockpit',
          query: 'airline cabin pressure mechanic',
        },
      ],
      project,
      { minScore: 0.2 },
    );

    expect(dropped.some((d: { url?: string; reason?: string }) => d.url?.includes('vest') && /life-vest|safety-demo/i.test(d.reason || ''))).toBe(true);
    expect(dropped.some((d: { url?: string; reason?: string }) => d.url?.includes('window') && /dark.*window/i.test(d.reason || ''))).toBe(true);
    expect(kept.some((a: { id: string }) => a.id === 'mechanic')).toBe(true);
    expect(kept.some((a: { id: string }) => a.id === 'vest')).toBe(false);
    expect(kept.some((a: { id: string }) => a.id === 'window')).toBe(false);
  });

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
    expect(genericStockJunkReason('podcast microphone condenser mic', nursingTopic)).toMatch(
      /mic|podcast|press/i,
    );
    expect(isGenericStockJunk('empty podcast studio recording booth empty', nursingTopic)).toBe(true);
    expect(isGenericStockJunk('bright office daylight people coworking', nursingTopic)).toBe(true);
    // "company hid reports" must NOT exempt office pads.
    expect(
      isGenericStockJunk(
        'bright office daylight people open plan office',
        'How a regional airline hid recurring cabin-pressure failures at the company',
      ),
    ).toBe(true);

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

describe('airline generic paperwork junk', () => {
  const airlineTopic = 'How a regional airline hid recurring cabin-pressure failures';

  it('rejects generic mail, magnifier, financial, and desk paperwork for airline topics', async () => {
    const {
      genericStockJunkReason,
      isGenericStockJunk,
      AIRLINE_FINANCIAL_PAPERWORK_RE,
      AIRLINE_GENERIC_DESK_PAPERWORK_RE,
      AIRLINE_MAGNIFYING_DOCUMENTS_RE,
      AIRLINE_MAIL_PAPERWORK_RE,
    } = await import('../../../scripts/lib/harvest-quality.mjs');

    expect(AIRLINE_MAIL_PAPERWORK_RE.test('U.S. Mail blue mail-box postal service')).toBe(true);
    expect(AIRLINE_MAGNIFYING_DOCUMENTS_RE.test('magnifying-glass over documents on desk')).toBe(
      true,
    );
    expect(AIRLINE_FINANCIAL_PAPERWORK_RE.test('financial reports pads and stock chart paperwork')).toBe(
      true,
    );
    expect(AIRLINE_GENERIC_DESK_PAPERWORK_RE.test('generic desk paperwork documents on office table')).toBe(
      true,
    );

    expect(genericStockJunkReason('U.S. Mail mailbox postal service post office box', airlineTopic)).toMatch(
      /mail|postal/i,
    );
    expect(genericStockJunkReason('magnifying-glass over documents on office desk', airlineTopic)).toMatch(
      /magnifying/i,
    );
    expect(
      genericStockJunkReason(
        'financial reports pads and stock chart paperwork on an accounting desk',
        airlineTopic,
      ),
    ).toMatch(/financial|report/i);
    expect(genericStockJunkReason('generic desk paperwork documents on office table', airlineTopic)).toMatch(
      /desk paperwork/i,
    );
    expect(isGenericStockJunk('redacted documents desk with no safety label', airlineTopic)).toBe(
      true,
    );
  });

  it('allows aviation-specific airline paperwork', async () => {
    const { genericStockJunkReason, isGenericStockJunk } = await import(
      '../../../scripts/lib/harvest-quality.mjs'
    );

    expect(genericStockJunkReason('FAA report paperwork close-up documents desk', airlineTopic)).toBeNull();
    expect(genericStockJunkReason('NTSB incident report files on desk', airlineTopic)).toBeNull();
    expect(genericStockJunkReason('aircraft maintenance log paperwork on clipboard', airlineTopic)).toBeNull();
    expect(genericStockJunkReason('cabin pressure gauge paperwork close-up', airlineTopic)).toBeNull();
    expect(genericStockJunkReason('redacted aviation documents on desk', airlineTopic)).toBeNull();
    expect(isGenericStockJunk('redacted aviation documents on desk', airlineTopic)).toBe(false);
  });

  it('drops generic paperwork but keeps FAA paperwork in relevance filtering', async () => {
    const { filterAssetsByRelevance } = await import('../../../scripts/lib/harvest-quality.mjs');
    const project = {
      topic: airlineTopic,
      script: [
        {
          id: 's1',
          title: 'Hidden reports',
          narration: 'FAA reports tracked cabin pressure oxygen failures and aircraft maintenance logs.',
        },
      ],
      media: [],
    };

    const { media: kept, dropped } = filterAssetsByRelevance(
      [
        {
          id: 'mail',
          segmentId: 's1',
          type: 'video',
          url: 'https://example.com/mailbox.mp4',
          alt: 'U.S. Mail blue mailbox postal service post office box',
          query: 'redacted paperwork documents desk',
        },
        {
          id: 'financial',
          segmentId: 's1',
          type: 'video',
          url: 'https://example.com/financial.mp4',
          alt: 'financial reports pads and stock chart paperwork on accounting desk',
          query: 'redacted paperwork documents desk',
        },
        {
          id: 'faa',
          segmentId: 's1',
          type: 'video',
          url: 'https://example.com/faa.mp4',
          alt: 'FAA report paperwork close-up documents desk',
          query: 'FAA report cabin pressure',
        },
      ],
      project,
      { minScore: 0.2 },
    );

    expect(dropped.some((d: { url?: string; reason?: string }) => d.url?.includes('mailbox') && /mail|postal/i.test(d.reason || ''))).toBe(true);
    expect(dropped.some((d: { url?: string; reason?: string }) => d.url?.includes('financial') && /financial|report/i.test(d.reason || ''))).toBe(true);
    expect(kept.some((a: { id: string }) => a.id === 'faa')).toBe(true);
    expect(kept.some((a: { id: string }) => a.id === 'mail')).toBe(false);
    expect(kept.some((a: { id: string }) => a.id === 'financial')).toBe(false);
  });

  it('vision prompt rejects airline paperwork stock junk but allows aviation documents', async () => {
    const { visionPromptForTopic } = await import('../../../scripts/lib/stock-vision-gate.mjs');
    const prompt = visionPromptForTopic(airlineTopic);

    expect(prompt).toMatch(/U\.S\. Mail|mailbox|postal service|post office box/i);
    expect(prompt).toMatch(/magnifying-glass-over-documents|financial report charts|accounting desk/i);
    expect(prompt).toMatch(/FAA\/NTSB reports|maintenance logs|cabin pressure gauge paperwork|redacted aviation documents/i);
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

  it('stockMotionQueries put faces first and keep anti-HUD as late fillers', async () => {
    const { stockMotionQueries } = await import('../../../scripts/lib/generate-full-video.mjs');
    const q = stockMotionQueries('bank fraud otp scam', true, { preferBright: true, faceSeek: true });
    expect(q.some((x) => /phone|worried|shocked|otp|bank/i.test(x))).toBe(true);
    // Generic anti-HUD / bright fillers must not crowd out topical heads.
    const faceIdx = q.findIndex((x) => /shocked|worried|phone/i.test(x));
    const fillerIdx = q.findIndex((x) => /news interview|pedestrians|bright office/i.test(x));
    expect(faceIdx).toBeGreaterThanOrEqual(0);
    if (fillerIdx >= 0) expect(faceIdx).toBeLessThan(fillerIdx);
  });

  it('airline stock queries stay short and lead with faces when faceSeek is enabled', async () => {
    const { stockMotionQueries, isSafeStockMotionQuery } = await import('../../../scripts/lib/generate-full-video.mjs');
    const topic =
      'Meet Captain Sarah Jenkins Mesa Airlines How a regional airline hid recurring cabin-pressure failures from passengers';
    const q = stockMotionQueries(topic, false, { preferBright: true, faceSeek: true });
    const wordCount = (query: string) => query.replace(/-/g, ' ').trim().split(/\s+/).length;

    expect(q.slice(0, 3)).toEqual([
      'airplane cabin passenger face worried',
      'pilot cockpit headset face close-up',
      'flight attendant airplane cabin face',
    ]);
    expect(q).toEqual(
      expect.arrayContaining([
        'oxygen mask deploy airplane cabin',
        'maintenance hangar night aircraft',
        'mechanic tools aircraft hangar',
        'redacted paperwork documents desk',
        'FAA report paperwork close-up',
        'cabin pressure gauge cockpit',
      ]),
    );
    expect(q.every((query) => wordCount(query) >= 3 && wordCount(query) <= 6)).toBe(true);
    expect(q.every((query) => query.length <= 64 && isSafeStockMotionQuery(query))).toBe(true);
    expect(q.every((query) => !query.toLowerCase().includes('regional airline cabin pressure cover up'))).toBe(
      true,
    );
    expect(q.every((query) => !/captain sarah|sarah jenkins|mesa airlines|how a regional airline/i.test(query))).toBe(
      true,
    );
    expect(isSafeStockMotionQuery(topic)).toBe(false);
    // Bare face queries without cabin/cockpit binding are banned (they return sports/hospital pads).
    expect(q.every((query) => !/^worried passenger face/i.test(query))).toBe(true);
  });

  it('airline junk filters reject mega-carriers and off-beat lifestyle clips', async () => {
    const { isCyberRelevantClip, isJunkStockClip, isAirlineRelevantClip } = await import(
      '../../../scripts/lib/generate-full-video.mjs'
    );
    const topic = 'The regional airline cabin-pressure cover-up that hid oxygen mask failures';

    expect(
      isJunkStockClip(
        { alt: 'Lufthansa aircraft on runway', url: 'https://videos.example/lufthansa-plane.mp4' },
        topic,
      ),
    ).toBe(true);
    expect(
      isJunkStockClip(
        { alt: 'Lufthansa cabin pressure report paperwork', url: 'https://videos.example/lufthansa-report.mp4' },
        'The Lufthansa cabin pressure cover-up',
      ),
    ).toBe(false);
    expect(isJunkStockClip({ alt: 'covid face mask couple walking street' }, topic)).toBe(true);
    expect(isCyberRelevantClip({ alt: 'mechanic tools hangar aircraft maintenance' }, topic)).toBe(true);
    expect(isCyberRelevantClip({ alt: 'woman in red hat lifestyle travel portrait' }, topic)).toBe(false);
    expect(isCyberRelevantClip({ alt: 'back of head only tourist watching plane behind fence' }, topic)).toBe(false);

    expect(
      isAirlineRelevantClip(
        { alt: 'oxygen, patient, medical attention, nurse', query: 'oxygen mask deploy airplane cabin' },
        topic,
      ),
    ).toBe(false);
    expect(
      isJunkStockClip(
        { alt: 'oxygen, patient, medical attention, nurse', query: 'oxygen mask deploy airplane cabin' },
        topic,
      ),
    ).toBe(true);
    expect(
      isAirlineRelevantClip(
        { alt: 'us mail mailbox', query: 'FAA report paperwork close-up' },
        topic,
      ),
    ).toBe(false);
    expect(
      isJunkStockClip(
        { alt: 'us mail mailbox', query: 'FAA report paperwork close-up' },
        topic,
      ),
    ).toBe(true);

    // Echoed search query must NOT count as aviation proof (football/hospital pads).
    expect(
      isAirlineRelevantClip(
        { alt: 'Pexels: worried passenger face', query: 'worried passenger face' },
        topic,
      ),
    ).toBe(false);
    expect(
      isAirlineRelevantClip(
        { alt: 'football player celebration stadium', query: 'worried passenger face' },
        topic,
      ),
    ).toBe(false);
    expect(
      isAirlineRelevantClip(
        { alt: 'hospital patient in bed icu', query: 'airplane cabin passenger face worried' },
        topic,
      ),
    ).toBe(false);
    expect(
      isAirlineRelevantClip(
        { alt: 'astronaut space suit floating', query: 'pilot face close-up' },
        topic,
      ),
    ).toBe(false);
    expect(
      isAirlineRelevantClip(
        {
          alt: '',
          query: 'oxygen mask deploy airplane cabin',
        },
        topic,
      ),
    ).toBe(true);
    expect(
      isAirlineRelevantClip(
        {
          alt: 'Pexels video',
          query: 'airplane cabin passenger face worried',
        },
        topic,
      ),
    ).toBe(true);
    expect(
      isAirlineRelevantClip(
        {
          alt: topic,
          query: topic,
        },
        topic,
      ),
    ).toBe(false);
    expect(
      isAirlineRelevantClip(
        {
          alt: 'Pexels video',
          query: 'Captain Sarah oxygen mask airplane cabin',
        },
        topic,
      ),
    ).toBe(false);
    expect(
      isAirlineRelevantClip(
        {
          alt: 'Pexels video',
          query: 'oxygen mask airplane cabin because Captain Sarah discovers hidden failures in a long scene title',
        },
        topic,
      ),
    ).toBe(false);
  });

  it('visionPromptForTopic mentions blurry/staged/overexposed junk on nursing topics', async () => {
    const { visionPromptForTopic } = await import('../../../scripts/lib/stock-vision-gate.mjs');
    const prompt = visionPromptForTopic('The nursing home cameras that recorded abuse for years');
    expect(prompt).toMatch(/blurry|overexposed|staged reenactment|produce/i);
  });

  it('visionPromptForTopic rejects disconnected airline pads and prefers cabin/cockpit motion', async () => {
    const { visionPromptForTopic } = await import('../../../scripts/lib/stock-vision-gate.mjs');
    const prompt = visionPromptForTopic(
      'The regional airline cabin-pressure cover-up that hid oxygen mask failures',
    );

    for (const rejectPattern of [
      /US Mail|USPS/i,
      /mailbox|letterbox/i,
      /magnifying glass/i,
      /financial report charts|spreadsheets/i,
      /hospital oxygen|patient|ICU/i,
      /football|soccer|sports/i,
      /astronaut/i,
      /crying stock portrait/i,
      /black-and-white|monochrome/i,
    ]) {
      expect(prompt).toMatch(rejectPattern);
    }

    for (const preferPattern of [
      /daylight airplane cabin aisle.*faces/i,
      /cockpit pilot with headset/i,
      /oxygen mask deployed in an airplane cabin/i,
      /hangar maintenance with aircraft visible/i,
      /runway\/tarmac with a plane visible/i,
    ]) {
      expect(prompt).toMatch(preferPattern);
    }
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
    expect(overlay.split(/\s+/).length).toBeLessThanOrEqual(8);
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
