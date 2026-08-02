import { describe, it, expect } from 'vitest';
import { repairMergedCaptionText, resolveRenderHookOverlay } from '../deploy/server-render/ffmpegOverlays.mjs';
import {
  hookOverlayWords,
  hookOverlayViolation,
  resolveHonestHookOverlay,
  spokenHookFromProject,
} from '../scripts/lib/hook-overlay-text.mjs';
import { buildShortHookOverlay } from '../scripts/lib/patch-project-for-loop.mjs';
import {
  rankStockImagesByTopic,
  stockImagesForTopic,
  STOCK_MEDIA_POOL,
  STOCK_HEIST_IMAGES,
  STOCK_HEALTHCARE_IMAGES,
  STOCK_CYBER_IMAGES,
} from '../scripts/lib/stock-media-urls.mjs';

const wordCount = (s) => s.split(/\s+/).filter(Boolean).length;

describe('buildShortHookOverlay — topic-matched, never nonsensical', () => {
  it.each([
    ['nursing home cameras caught staff abusing residents', 'CAMERAS CAUGHT THE ABUSE'],
    ['veterans benefits data sold on the dark web', 'BENEFITS DATA FOR SALE'],
    ['landlords use AI to evict tenants without a hearing', 'THEY EVICTED YOU WITH AI'],
    ['The housing crash they said would never happen', 'THE HOUSING CRASH THEY HID'],
    ['staged car crash insurance fraud ring exposed', 'FAKE CRASH SCAM EXPOSED'],
    ['fake airport diamond heist fooled the guards', 'THE DIAMONDS ARE GONE'],
    ['hospital ransomware breach leaks patient records', 'PATIENT RECORDS EXPOSED'],
    ['AI voice clone bank scam drains real accounts', 'YOUR BANK ACCOUNT IS EMPTY'],
    ['concert ticket bots scalp fans instantly', 'BOTS STOLE YOUR TICKETS'],
    ['nuclear plant radiation meltdown risk hidden', 'EMERGENCY: THEY HID THE RISK'],
    ['tornado warning came far too late', 'THIS WARNING CAME TOO LATE'],
  ])('maps %s → %s', (topic, expected) => {
    expect(buildShortHookOverlay(topic, '')).toBe(expected);
  });

  it('routes clinic ransomware to healthcare overlay, NOT the bank overlay (regression)', () => {
    // "clinic" + "ransomware" previously slipped past the hospital+records guard
    // and landed on YOUR BANK ACCOUNT IS EMPTY — a hook/visual disconnect.
    const overlay = buildShortHookOverlay('clinic ransomware locks patient files', '');
    expect(overlay).toBe('PATIENT RECORDS EXPOSED');
    expect(overlay).not.toBe('YOUR BANK ACCOUNT IS EMPTY');
  });

  it('does not slap the bank overlay on a generic hack/breach topic', () => {
    const overlay = buildShortHookOverlay('massive password breach exposes millions', '');
    expect(overlay).not.toBe('YOUR BANK ACCOUNT IS EMPTY');
    expect(overlay).toContain('EXPOSED');
  });

  it('never emits a dangling label with no payload', () => {
    const topics = [
      'the how why',
      'nursing home cameras caught staff abusing residents',
      'a crash',
      'fire attack blackout',
      'AI deepfakes spread online',
      'veterans benefits data sold on the dark web',
      '',
    ];
    for (const topic of topics) {
      const overlay = buildShortHookOverlay(topic, '');
      expect(overlay.length).toBeGreaterThan(3);
      // No lone "BREAKING:" / "URGENT:" style label
      expect(/^\S+:$/.test(overlay.trim())).toBe(false);
      expect(wordCount(overlay)).toBeLessThanOrEqual(8);
    }
  });

  it('rejects a label-only preferred overlay even when a caller tries to force it', () => {
    // forcePreferred was a self-attest bypass; it is no longer honored.
    const overlay = buildShortHookOverlay('some topic', '', { preferredOverlay: 'BREAKING:', forcePreferred: true });
    expect(overlay).not.toMatch(/BREAKING/);
    expect(overlay.length).toBeGreaterThan(3);
  });

  it('never uses a forced cross-topic preferred overlay', () => {
    const overlay = buildShortHookOverlay(
      'Why grocery loyalty cards tracked shoppers into insurance pricing',
      '',
      { preferredOverlay: 'PATIENT RECORDS EXPOSED', forcePreferred: true },
    );
    expect(overlay).not.toBe('PATIENT RECORDS EXPOSED');
    expect(overlay).toBe('LOYALTY CARDS SOLD YOU OUT');
  });

  it('honors a topic-overlapping preferred overlay', () => {
    const overlay = buildShortHookOverlay('deepfake scandal', '', { preferredOverlay: 'DEEPFAKE FOOLED MILLIONS' });
    expect(overlay).toBe('DEEPFAKE FOOLED MILLIONS');
  });

  it('clamps every overlay to at most 8 words', () => {
    const topics = [
      'a very long winded topic about many different overlapping scandals happening',
      'hospital ransomware breach leaks patient records nationwide right now today',
    ];
    for (const topic of topics) {
      expect(wordCount(buildShortHookOverlay(topic, ''))).toBeLessThanOrEqual(8);
    }
  });

  it('prefers the spoken shock hook on generic topics (not keyword salad)', () => {
    const hook = 'Millions of passwords leaked before anyone noticed the breach.';
    const overlay = buildShortHookOverlay('massive password breach exposes millions', hook);
    expect(overlay).toBe('BEFORE ANYONE NOTICED THE BREACH');
    expect(overlay).not.toMatch(/^URGENT:/);
  });

  it('does not slap bank overlay on port/supply-chain hack topics', () => {
    const topic = 'The port strike that hid a container-tracking hack';
    const overlay = buildShortHookOverlay(topic, '');
    expect(overlay).not.toBe('YOUR BANK ACCOUNT IS EMPTY');
    expect(overlay).toMatch(/TRACKING|HACK|STRIKE/i);
  });

  it('routes school ransomware to education overlay, not hospital cards', () => {
    const topic = 'How school districts lost student mental-health records to ransomware';
    const overlay = buildShortHookOverlay(topic, '');
    expect(overlay).not.toBe('PATIENT RECORDS EXPOSED');
    expect(overlay).toMatch(/STUDENT|RECORDS|SCHOOL/i);
  });

  it('routes library fine topics to a complete stakes overlay', () => {
    const topic = 'How a municipal library fine system trapped low-income families in debt';
    const overlay = buildShortHookOverlay(
      topic,
      'Ordinary people are already paying the price.',
    );
    expect(overlay).toBe('LIBRARY FINES TRAP FAMILIES');
    expect(overlay).not.toMatch(/\bTHE$/);
  });

  it('rejects generic template shock hooks in favor of topic stakes', () => {
    const overlay = buildShortHookOverlay(
      'massive password breach exposes millions',
      'Ordinary people are already paying the price.',
    );
    expect(overlay).toContain('EXPOSED');
    expect(overlay).not.toMatch(/\bTHE$/);
    expect(overlay).not.toBe('ORDINARY PEOPLE ARE ALREADY PAYING THE');
  });

  it('routes podcast misconduct to stakes overlay not keyword salad', () => {
    const topic = 'How a podcast network buried host misconduct settlements';
    const overlay = buildShortHookOverlay(
      topic,
      'Billions lost overnight: a podcast network buried host misconduct settlements.',
    );
    expect(overlay).toBe('SETTLEMENTS WERE BURIED SILENTLY');
    expect(overlay).not.toMatch(/^URGENT:/);
  });

  it('routes ambulance GPS topics to stakes overlay', () => {
    expect(
      buildShortHookOverlay('Why rural ambulance GPS routes send crews to demolished houses', ''),
    ).toBe('GPS SENT CREWS TO RUINS');
  });

  it('routes zoning flood-risk map to policy stakes not weather disaster', () => {
    expect(
      buildShortHookOverlay('The city zoning map that erased flood-risk neighborhoods', ''),
    ).toBe('THEY ERASED THE FLOOD MAP');
  });

  it('routes airline cabin-pressure to stakes overlay', () => {
    expect(
      buildShortHookOverlay('How a regional airline hid recurring cabin-pressure failures', ''),
    ).toBe('WHY DID THE CABIN KEEP FAILING?');
  });

  it('keeps cabin keep separated when hook text arrives glued', () => {
    const topic = 'How a regional airline hid recurring cabin-pressure failures';
    const overlay = buildShortHookOverlay(topic, 'Why did the cabinKeep fail?');
    expect(overlay).toBe('WHY DID THE CABIN KEEP FAILING?');
    expect(overlay).not.toContain('CABINKEEP');

    const words = hookOverlayWords('Why did the CABINKEEP fail?', { maxWords: 8 });
    expect(words.join(' ')).toBe('WHY DID THE CABIN KEEP FAIL?');
    expect(repairMergedCaptionText('Why did CABINKEEP fail?').toUpperCase()).not.toContain('CABINKEEP');
  });

  it('uses the airline narration question without leaking instructions', () => {
    const hook = 'The cabin kept losing pressure — and they hid every report.';
    expect(
      buildShortHookOverlay('How a regional airline hid recurring cabin-pressure failures', hook),
    ).toBe('WHY DID THE CABIN KEEP FAILING?');
    expect(
      buildShortHookOverlay('obscure municipal widget scandal', 'Rewrite line 1 as: Who got paid?'),
    ).not.toMatch(/REWRITE|LINE/);
  });

  it('routes indie cloud lockout to stakes overlay', () => {
    expect(
      buildShortHookOverlay('Why indie game studios are losing source code in cloud lockouts', ''),
    ).toBe('THEIR SOURCE CODE VANISHED');
  });

  it('does not use staged-crash overlay for grocery loyalty insurance pricing', () => {
    const overlay = buildShortHookOverlay(
      'Why grocery loyalty cards tracked shoppers into insurance pricing',
      '',
    );
    expect(overlay).toBe('LOYALTY CARDS SOLD YOU OUT');
    expect(overlay).not.toBe('FAKE CRASH SCAM EXPOSED');
  });

  it('avoids URGENT keyword salad fallback for generic topics', () => {
    const overlay = buildShortHookOverlay('obscure municipal widget scandal', '');
    expect(overlay).not.toMatch(/^URGENT:/);
  });
});

describe('hook overlay honesty — spoken hook must match on-screen text', () => {
  const airlineTopic = 'How a regional airline hid recurring cabin-pressure failures';
  const airlineHook = 'The cabin kept losing pressure — and they hid every report.';

  it('bans a stale medical overlay on an airline topic', () => {
    expect(
      hookOverlayViolation('PATIENT RECORDS EXPOSED', { topic: airlineTopic, spokenHook: airlineHook }),
    ).toBeTruthy();
  });

  it('rejects an overlay that shares no words with the spoken hook or topic', () => {
    expect(
      hookOverlayViolation('YOUR BANK ACCOUNT IS EMPTY', { topic: airlineTopic, spokenHook: airlineHook }),
    ).toBeTruthy();
  });

  it('keeps the airline question overlay for the airline story', () => {
    expect(
      hookOverlayViolation('WHY DID THE CABIN KEEP FAILING?', { topic: airlineTopic, spokenHook: airlineHook }),
    ).toBeNull();
  });

  it('allows medical words only when the airline story itself is medical (medevac)', () => {
    const medevac = 'Why air ambulance patient transfer flights kept losing cabin pressure';
    expect(hookOverlayViolation('PATIENT FLIGHTS KEPT FAILING', { topic: medevac, spokenHook: '' })).toBeNull();
    expect(hookOverlayViolation('PATIENT RECORDS EXPOSED', { topic: airlineTopic, spokenHook: '' })).toBeTruthy();
  });

  it('rejects editor-instruction claims outright', () => {
    expect(
      hookOverlayViolation('Rewrite line 1 as: Why did the cabin keep failing?', {
        topic: airlineTopic,
        spokenHook: airlineHook,
      }),
    ).toBeTruthy();
  });

  it('resolveHonestHookOverlay falls back to the spoken hook when every claim is dishonest', () => {
    const { text, rejected } = resolveHonestHookOverlay({
      topic: airlineTopic,
      spokenHook: airlineHook,
      candidates: ['PATIENT RECORDS EXPOSED', 'YOUR BANK ACCOUNT IS EMPTY'],
    });
    expect(text).toBe(airlineHook);
    expect(rejected).toHaveLength(2);
  });

  it('spokenHookFromProject prefers the narrated first sentence over declared claims', () => {
    const project = {
      hookLine: 'A stale hook claim from fix state.',
      script: [{ narration: 'The cabin kept losing pressure. More body detail follows here.' }],
    };
    expect(spokenHookFromProject(project)).toBe('The cabin kept losing pressure.');
  });

  it('resolveRenderHookOverlay burns only overlays that match the narration', () => {
    const project = {
      topic: airlineTopic,
      hookLine: airlineHook,
      exportSettings: { hookOverlay: 'PATIENT RECORDS EXPOSED', hookLine: airlineHook },
      script: [{ narration: `${airlineHook} Stay with me — this gets worse.` }],
    };
    const { text, rejected } = resolveRenderHookOverlay(project, {});
    expect(text).not.toBe('PATIENT RECORDS EXPOSED');
    expect(text).toBe(airlineHook);
    expect(rejected.some((r) => r.source === 'exportSettings.hookOverlay')).toBe(true);
  });

  it('resolveRenderHookOverlay ignores a stale env overlay claim (no self-attest)', () => {
    const project = {
      topic: airlineTopic,
      hookLine: airlineHook,
      exportSettings: { hookOverlay: 'WHY DID THE CABIN KEEP FAILING?' },
      script: [{ narration: `${airlineHook} Stay with me — this gets worse.` }],
    };
    const honest = resolveRenderHookOverlay(project, { AUTOTUBE_HOOK_OVERLAY: 'PATIENT RECORDS EXPOSED' });
    expect(honest.text).toBe('WHY DID THE CABIN KEEP FAILING?');

    const staleOnly = resolveRenderHookOverlay(
      { ...project, exportSettings: {} },
      { AUTOTUBE_HOOK_OVERLAY: 'PATIENT RECORDS EXPOSED' },
    );
    expect(staleOnly.text).toBe(airlineHook);
    expect(staleOnly.rejected.some((r) => r.source === 'env AUTOTUBE_HOOK_OVERLAY')).toBe(true);
  });
});

describe('stock selection — connects B-roll to the topic', () => {
  it('rankStockImagesByTopic keeps the full pool (no drops) and length', () => {
    const ranked = rankStockImagesByTopic('bank credit card fraud', STOCK_MEDIA_POOL);
    expect(ranked.length).toBe(STOCK_MEDIA_POOL.length);
    const urls = new Set(ranked.map((i) => i.url));
    for (const img of STOCK_MEDIA_POOL) expect(urls.has(img.url)).toBe(true);
  });

  it('ranks a topic-relevant caption above generic corporate stock', () => {
    const ranked = rankStockImagesByTopic('bank credit card fraud', STOCK_MEDIA_POOL);
    // Top image should mention the money/payment theme, not "typing on laptop"
    expect(/credit|payment|card|checkout|shopping|security/i.test(ranked[0].alt)).toBe(true);
  });

  it('returns the pool unchanged when the topic carries no signal', () => {
    const ranked = rankStockImagesByTopic('', STOCK_MEDIA_POOL);
    expect(ranked.map((i) => i.url)).toEqual(STOCK_MEDIA_POOL.map((i) => i.url));
  });

  it('leads with the heist subset for a heist topic', () => {
    const pool = stockImagesForTopic('fake airport diamond heist');
    const heistUrls = new Set(STOCK_HEIST_IMAGES.map((i) => i.url));
    expect(pool.slice(0, 3).some((i) => heistUrls.has(i.url))).toBe(true);
  });

  it('leads with healthcare stock for a hospital breach topic', () => {
    const pool = stockImagesForTopic('hospital ransomware breach leaks patient records');
    const healthUrls = new Set(STOCK_HEALTHCARE_IMAGES.map((i) => i.url));
    expect(pool.slice(0, 4).some((i) => healthUrls.has(i.url))).toBe(true);
  });

  it('leads with cyber stock for a bank scam topic', () => {
    const pool = stockImagesForTopic('AI voice clone bank scam drains accounts');
    const cyberUrls = new Set(STOCK_CYBER_IMAGES.map((i) => i.url));
    expect(pool.slice(0, 4).some((i) => cyberUrls.has(i.url))).toBe(true);
  });

  it('dedupes URLs even when lead pool overlaps the broad pool', () => {
    const pool = stockImagesForTopic('AI voice clone bank scam drains accounts');
    const keys = pool.map((i) => (i.url || '').split('?')[0]);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
