import { describe, it, expect } from 'vitest';
import {
  isScriptComplete,
  detectScriptActivity,
  sawFreshActivity,
  chooseRecoveryAction,
  isDeadScriptGeneration,
} from '../script-wait-policy.mjs';

describe('isScriptComplete', () => {
  it('is true when stepStatuses.script is complete', () => {
    expect(isScriptComplete({ scriptStep: 'complete', scriptLen: 6 })).toBe(true);
  });

  it('is true when script has segments and projectStatus is complete', () => {
    expect(isScriptComplete({ scriptStep: '', scriptLen: 4, projectStatus: 'complete' })).toBe(true);
  });

  it('is false while generating (empty snapshot — project not yet persisted)', () => {
    expect(isScriptComplete({ scriptStep: '', scriptLen: 0, projectStatus: '' })).toBe(false);
  });

  it('is false when processing', () => {
    expect(isScriptComplete({ scriptStep: 'processing', scriptLen: 0 })).toBe(false);
  });
});

describe('detectScriptActivity', () => {
  it('detects the live "Generating Script" DOM signal even when the snapshot is blank', () => {
    const snap = { scriptStep: '', scriptLen: 0 };
    const prog = { generating: true, rotating: 'Building narrative arc...', pct: 15 };
    expect(detectScriptActivity(snap, prog)).toBe(true);
  });

  it('detects activity from a processing snapshot', () => {
    expect(detectScriptActivity({ scriptStep: 'processing', scriptLen: 0 }, {})).toBe(true);
  });

  it('detects activity once script segments exist', () => {
    expect(detectScriptActivity({ scriptStep: '', scriptLen: 3 }, {})).toBe(true);
  });

  it('reports no activity when nothing is happening (never started / stuck)', () => {
    const snap = { scriptStep: '', scriptLen: 0 };
    const prog = { generating: false, rotating: '', pct: null, onTopicStep: true };
    expect(detectScriptActivity(snap, prog)).toBe(false);
  });
});

describe('sawFreshActivity', () => {
  it('flags advancing progress percentage', () => {
    const prev = { scriptLen: 0, pct: 15, rotating: 'a' };
    expect(sawFreshActivity({ scriptLen: 0 }, { pct: 80, rotating: 'a' }, prev)).toBe(true);
  });

  it('flags a growing script length', () => {
    const prev = { scriptLen: 0, pct: null, rotating: '' };
    expect(sawFreshActivity({ scriptLen: 4 }, { pct: null, rotating: '' }, prev)).toBe(true);
  });

  it('flags a changing rotating status (page alive)', () => {
    const prev = { scriptLen: 0, pct: 15, rotating: 'Analyzing topic structure...' };
    expect(sawFreshActivity({ scriptLen: 0 }, { pct: 15, rotating: 'Optimizing pacing...' }, prev)).toBe(true);
  });

  it('reports no fresh activity when everything is unchanged', () => {
    const prev = { scriptLen: 0, pct: 15, rotating: 'same' };
    expect(sawFreshActivity({ scriptLen: 0 }, { pct: 15, rotating: 'same' }, prev)).toBe(false);
  });
});

describe('isDeadScriptGeneration', () => {
  it('is false while still actively generating', () => {
    expect(isDeadScriptGeneration({ everSawGenerating: true, active: true, idleMs: 120_000 })).toBe(false);
  });

  it('detects cancelled UI immediately', () => {
    expect(
      isDeadScriptGeneration({
        everSawGenerating: true,
        active: false,
        idleMs: 5_000,
        scriptLen: 0,
        bodyText: 'Script generation cancelled by user\nNo script generated yet.',
      }),
    ).toBe(true);
  });

  it('detects idle ≥90s after start with empty script', () => {
    expect(
      isDeadScriptGeneration({
        everSawGenerating: true,
        active: false,
        idleMs: 90_000,
        scriptLen: 0,
        bodyText: 'No script generated yet.',
      }),
    ).toBe(true);
  });

  it('is false when idle is still short and no cancel message', () => {
    expect(
      isDeadScriptGeneration({
        everSawGenerating: true,
        active: false,
        idleMs: 30_000,
        scriptLen: 0,
        bodyText: 'PROGRESS\n14%',
      }),
    ).toBe(false);
  });
});

describe('chooseRecoveryAction', () => {
  it('grants a grace window (no reload) while actively generating', () => {
    expect(chooseRecoveryAction({ active: true, onTopicStep: false })).toBe('grace');
  });

  it('re-clicks when still on the topic step (click missed)', () => {
    expect(chooseRecoveryAction({ active: false, onTopicStep: true })).toBe('reclick');
  });

  it('reloads when genuinely stuck (not generating, not on topic step)', () => {
    expect(chooseRecoveryAction({ active: false, onTopicStep: false })).toBe('reload');
  });

  it('grants grace when generation was live recently and idle is short', () => {
    expect(
      chooseRecoveryAction({
        active: false,
        onTopicStep: false,
        recentlyGenerating: true,
        idleMs: 30_000,
      }),
    ).toBe('grace');
  });

  it('reclicks when generation died after start (idle ≥90s)', () => {
    expect(
      chooseRecoveryAction({
        active: false,
        onTopicStep: true,
        everSawGenerating: true,
        idleMs: 90_000,
        scriptLen: 0,
        bodyText: 'No script generated yet.',
      }),
    ).toBe('reclick');
  });

  it('reclicks immediately on cancelled UI after start', () => {
    expect(
      chooseRecoveryAction({
        active: false,
        onTopicStep: false,
        everSawGenerating: true,
        idleMs: 10_000,
        scriptLen: 0,
        bodyText: 'Script generation cancelled by user',
      }),
    ).toBe('reclick');
  });

  it('prefers grace over reload even if somehow also on the topic step while active', () => {
    expect(chooseRecoveryAction({ active: true, onTopicStep: true })).toBe('grace');
  });
});
