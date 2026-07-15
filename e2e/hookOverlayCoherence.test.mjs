import { describe, it, expect } from 'vitest';
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
      expect(wordCount(overlay)).toBeLessThanOrEqual(6);
    }
  });

  it('rejects a preferred overlay that is only a label', () => {
    expect(buildShortHookOverlay('some topic', '', { preferredOverlay: 'BREAKING:', forcePreferred: true })).toBe('');
  });

  it('honors a topic-overlapping preferred overlay', () => {
    const overlay = buildShortHookOverlay('deepfake scandal', '', { preferredOverlay: 'DEEPFAKE FOOLED MILLIONS' });
    expect(overlay).toBe('DEEPFAKE FOOLED MILLIONS');
  });

  it('clamps every overlay to at most 6 words', () => {
    const topics = [
      'a very long winded topic about many different overlapping scandals happening',
      'hospital ransomware breach leaks patient records nationwide right now today',
    ];
    for (const topic of topics) {
      expect(wordCount(buildShortHookOverlay(topic, ''))).toBeLessThanOrEqual(6);
    }
  });

  it('prefers the spoken shock hook on generic topics (not keyword salad)', () => {
    const hook = 'Millions of passwords leaked before anyone noticed the breach.';
    const overlay = buildShortHookOverlay('massive password breach exposes millions', hook);
    expect(overlay).toBe('MILLIONS OF PASSWORDS LEAKED BEFORE ANYONE');
    expect(overlay).not.toMatch(/^URGENT:/);
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
