import { describe, it, expect } from 'vitest';
import {
  hasWeakHookOpener,
  buildShortHookOverlay,
  validateHook,
  MAX_HOOK_OVERLAY_WORDS,
} from '../hookValidator';
import type { ScriptSegment } from '../../types';

function intro(narration: string): ScriptSegment {
  return {
    id: 'intro-1',
    type: 'intro',
    title: 'Intro',
    narration,
    visualNote: '',
    duration: 15,
  };
}

describe('hasWeakHookOpener', () => {
  it('flags month+year openers like In January 2025', () => {
    const r = hasWeakHookOpener('In January 2025, banks warned that AI voice clones emptied accounts.');
    expect(r.weak).toBe(true);
    expect(r.reason).toMatch(/month|year|January/i);
  });

  it('flags year openers like Video Watcher', () => {
    const r = hasWeakHookOpener('In 2024, ransomware hit 40% of hospitals.');
    expect(r.weak).toBe(true);
    expect(r.reason).toMatch(/year/i);
  });

  it('flags filler openers', () => {
    expect(hasWeakHookOpener('Welcome to another episode about security.').weak).toBe(true);
    expect(hasWeakHookOpener('In this video we explain phishing.').weak).toBe(true);
  });

  it('flags checklist generic phrases', () => {
    const r = hasWeakHookOpener("Hey guys, today's deep dive into identity theft.");
    expect(r.weak).toBe(true);
  });

  it('allows stakes-first openers', () => {
    const r = hasWeakHookOpener('Your bank account can vanish overnight. Here is why.');
    expect(r.weak).toBe(false);
  });
});

describe('buildShortHookOverlay', () => {
  it('caps overlay at MAX_HOOK_OVERLAY_WORDS', () => {
    const long = 'Your money disappears in sixty seconds if this attack lands';
    const overlay = buildShortHookOverlay(long);
    expect(overlay.split(/\s+/).length).toBeLessThanOrEqual(MAX_HOOK_OVERLAY_WORDS);
  });
});

describe('validateHook weak openers', () => {
  it('rejects year-open even when a statistic pattern is present', () => {
    const result = validateHook(
      intro(
        'In 2024, over 80% of companies lost money to phishing attacks that drained payroll accounts before anyone noticed the wires.',
      ),
    );
    expect(result.weakOpener).toBe(true);
    expect(result.hasHook).toBe(false);
    expect(result.pattern).toBeNull();
  });

  it('accepts personal-stakes hooks without filler', () => {
    const result = validateHook(
      intro(
        'Your identity can be stolen in under ten minutes. Your bank account, your files, and your password vault are all at risk right now if you ignore this warning.',
      ),
    );
    expect(result.weakOpener).toBe(false);
    expect(result.hasHook).toBe(true);
  });
});
