import { afterEach, describe, expect, it, vi } from 'vitest';
import { visionRejectOffBrandStock } from '../stock-vision-gate.mjs';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('visionRejectOffBrandStock', () => {
  it('reports missing API key as not run, not as a clean pass', async () => {
    await expect(visionRejectOffBrandStock('https://example.test/thumb.jpg', '', 'airline')).resolves.toMatchObject({
      ran: false,
      reject: false,
      reason: 'missing-key',
    });
  });

  it('reports HTTP failures as not verified', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503 })));

    await expect(
      visionRejectOffBrandStock('https://example.test/thumb.jpg', 'key', 'airline'),
    ).resolves.toMatchObject({
      ran: false,
      reject: false,
      reason: 'http-503',
    });
  });

  it('reports parse failures as not verified', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'not json' } }],
      }),
    })));

    const verdict = await visionRejectOffBrandStock('https://example.test/thumb.jpg', 'key', 'airline');
    expect(verdict.ran).toBe(false);
    expect(verdict.reject).toBe(false);
    expect(verdict.reason).toMatch(/^error:/);
  });

  it('marks valid model JSON as run', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"reject":true,"reason":"postal truck"}' } }],
      }),
    })));

    await expect(
      visionRejectOffBrandStock('https://example.test/thumb.jpg', 'key', 'airline'),
    ).resolves.toEqual({
      ran: true,
      reject: true,
      reason: 'postal truck',
    });
  });
});
