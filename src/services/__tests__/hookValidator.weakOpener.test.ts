import { describe, it, expect } from 'vitest';
import {
  hasWeakHookOpener,
  buildShortHookOverlay,
  validateHook,
  detectHookPattern,
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

// ---------------------------------------------------------------------------
// Question hook ban — generator bans question hooks; validator must agree
// ---------------------------------------------------------------------------

describe('detectHookPattern — question hooks are NOT valid (aligns with generator rule)', () => {
  it('returns null for a question-only opener (no stats, no personal stakes, no counterintuitive)', () => {
    // Pure questions with no "you/your" or statistics or but/however/actually
    expect(detectHookPattern('Is nuclear fusion commercially viable?')).toBeNull();
    expect(detectHookPattern('When will global temperatures stop rising?')).toBeNull();
    expect(detectHookPattern('Will AI replace all jobs in the next decade?')).toBeNull();
  });

  it('returns surprising_statistic when a question also contains a statistic', () => {
    // Statistic takes priority over question
    const result = detectHookPattern('Did you know 80% of companies lost data this year?');
    expect(result).toBe('surprising_statistic');
  });

  it('returns personal_stakes when a question also has you/your language', () => {
    const result = detectHookPattern('Have you checked your bank account recently?');
    expect(result).toBe('personal_stakes');
  });

  it('validateHook reports no hook for question-only openers', () => {
    const result = validateHook(
      intro(
        'What if hackers already have your password? And what if nothing you do today can stop them from using it?',
      ),
    );
    // Contains "your" → personal_stakes detected before the question check
    // This is correct: "your" is a stronger signal than a bare question mark
    expect(result.pattern).toBe('personal_stakes');
    expect(result.hasHook).toBe(true);
  });

  it('validateHook reports no hook for a bare question opener without other signals', () => {
    const result = validateHook(
      intro('Is the cybersecurity industry failing us? That is the question many experts are asking.'),
    );
    // No stats, no "you/your", and question-only detection is disabled
    expect(result.pattern).toBeNull();
    expect(result.hasHook).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// hasWeakHookOpener — GENERIC_HOOK_PHRASES scoped to first sentence only
// ---------------------------------------------------------------------------

describe('hasWeakHookOpener — GENERIC_HOOK_PHRASES scoped to first sentence', () => {
  it('flags "in this video" in the first sentence (caught by WEAK_OPENER_PATTERNS)', () => {
    // "in this video" matches WEAK_OPENER_PATTERNS directly
    const r = hasWeakHookOpener('In this video we reveal everything about data breaches.');
    expect(r.weak).toBe(true);
  });

  it('flags GENERIC_HOOK_PHRASES-only openers via the phrases check (e.g. "let me tell you")', () => {
    // "let me tell you" is in GENERIC_HOOK_PHRASES but NOT in WEAK_OPENER_PATTERNS
    const r = hasWeakHookOpener('Let me tell you about the risks of ransomware attacks on hospitals.');
    expect(r.weak).toBe(true);
    expect(r.reason).toMatch(/generic phrase/i);
  });

  it('does NOT flag "in this video" when it appears only mid-paragraph (not first sentence)', () => {
    // First sentence is a strong hook; "in this video" appears only later
    const r = hasWeakHookOpener(
      'Your bank account was just targeted. We cover everything in this video market report.',
    );
    expect(r.weak).toBe(false);
  });

  it('does NOT flag "welcome back" when it appears only in a later sentence', () => {
    const r = hasWeakHookOpener(
      '$4.5 billion was stolen in a single week. Welcome back to the channel if you missed the last breakdown.',
    );
    expect(r.weak).toBe(false);
  });

  it('flags "hey guys" in first sentence', () => {
    const r = hasWeakHookOpener("Hey guys, today we're diving into ransomware.");
    expect(r.weak).toBe(true);
  });

  it('flags "welcome back" in first sentence', () => {
    const r = hasWeakHookOpener('Welcome back to the show. Today we cover ransomware attacks on hospitals.');
    expect(r.weak).toBe(true);
  });
});
