import { describe, expect, it } from 'vitest';
import { AV_DRIFT_TOLERANCE_SEC, evaluateAvDrift } from '../server-render.mjs';

describe('final A/V drift gate', () => {
  it('passes drift inside the tolerance', () => {
    const verdict = evaluateAvDrift(60.4, 60.0, { env: {} });
    expect(verdict.measured).toBe(true);
    expect(verdict.exceeded).toBe(false);
    expect(verdict.message).toBe('');
  });

  it('flags drift past the tolerance in both directions', () => {
    expect(evaluateAvDrift(60, 58.5, { env: {} }).exceeded).toBe(true);
    expect(evaluateAvDrift(58.5, 60, { env: {} }).exceeded).toBe(true);
    expect(evaluateAvDrift(60, 58.5, { env: {} }).message).toMatch(/exceeds 0.75s/);
  });

  it('does not allow the drift unless AUTOTUBE_ALLOW_AV_DRIFT=1', () => {
    expect(evaluateAvDrift(60, 58.5, { env: {} }).allowed).toBe(false);
    expect(evaluateAvDrift(60, 58.5, { env: { AUTOTUBE_ALLOW_AV_DRIFT: '1' } }).allowed).toBe(true);
  });

  it('reports unmeasurable streams instead of claiming a pass', () => {
    const verdict = evaluateAvDrift(60, null, { env: {} });
    expect(verdict.measured).toBe(false);
    expect(verdict.driftSec).toBeNull();
    expect(verdict.exceeded).toBe(false);
  });

  it('uses a 0.75s default tolerance', () => {
    expect(AV_DRIFT_TOLERANCE_SEC).toBe(0.75);
    expect(evaluateAvDrift(60, 59.25, { env: {} }).exceeded).toBe(false);
    expect(evaluateAvDrift(60, 59.24, { env: {} }).exceeded).toBe(true);
  });
});

describe('render flow enforcement', () => {
  it('throws on drift instead of only warning', async () => {
    const { readFileSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const root = join(dirname(fileURLToPath(import.meta.url)), '..');
    const src = readFileSync(join(root, 'server-render.mjs'), 'utf8');
    expect(src).toContain('if (avDriftFailure) {');
    expect(src).toContain('throw new Error(avDriftFailure);');
  });
});
