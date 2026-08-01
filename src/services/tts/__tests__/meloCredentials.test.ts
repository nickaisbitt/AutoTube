/**
 * Melo BYOK credential-validation and hard-deadline contract.
 *
 * The narration step calls Cloudflare's Melo endpoint once per segment when
 * VITE_CF_* BYOK credentials are present. Invalid credentials (a truncated
 * account id, a stub token) must be rejected *before* the request so headless
 * `generate:video` runs fail fast to browser/unavailable clips, and a hung
 * socket must still resolve to null on the direct-call deadline rather than
 * stalling the pipeline.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  generateMeloTts,
  isPlausibleCloudflareAccountId,
  isPlausibleCloudflareApiToken,
} from '../index';

vi.mock('../../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('isPlausibleCloudflareAccountId', () => {
  it('accepts a 32-char hex account id', () => {
    expect(isPlausibleCloudflareAccountId('0123456789abcdef0123456789abcdef')).toBe(true);
  });

  it('accepts an uppercase 32-char hex account id', () => {
    expect(isPlausibleCloudflareAccountId('0123456789ABCDEF0123456789ABCDEF')).toBe(true);
  });

  it('accepts a UUID-shaped account id', () => {
    expect(isPlausibleCloudflareAccountId('12345678-9abc-def0-1234-56789abcdef0')).toBe(true);
  });

  it('trims surrounding whitespace before validating', () => {
    expect(isPlausibleCloudflareAccountId('  0123456789abcdef0123456789abcdef  ')).toBe(true);
  });

  it('rejects a truncated 31-char id (the reported failure mode)', () => {
    expect(isPlausibleCloudflareAccountId('0123456789abcdef0123456789abcde')).toBe(false);
  });

  it('rejects non-hex and empty values', () => {
    expect(isPlausibleCloudflareAccountId('not-a-real-account-id-value-here')).toBe(false);
    expect(isPlausibleCloudflareAccountId('')).toBe(false);
    expect(isPlausibleCloudflareAccountId(undefined)).toBe(false);
    expect(isPlausibleCloudflareAccountId(null)).toBe(false);
  });
});

describe('isPlausibleCloudflareApiToken', () => {
  it('accepts a realistic ~40-char token', () => {
    expect(isPlausibleCloudflareApiToken('v1.0-abcdefghijklmnopqrstuvwxyz0123456789')).toBe(true);
  });

  it('rejects short/stub tokens and empties', () => {
    expect(isPlausibleCloudflareApiToken('short-token')).toBe(false);
    expect(isPlausibleCloudflareApiToken('')).toBe(false);
    expect(isPlausibleCloudflareApiToken(undefined)).toBe(false);
  });
});

describe('generateMeloTts hard deadline', () => {
  it('resolves null (never hangs) when the socket ignores abort', async () => {
    vi.useFakeTimers();
    // A fetch that never settles and ignores the abort signal — only the
    // internal deadline can rescue the per-segment narration call.
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));

    const pending = generateMeloTts(
      'Hello there.',
      '0123456789abcdef0123456789abcdef',
      'v1.0-abcdefghijklmnopqrstuvwxyz0123456789',
      { timeoutMs: 5_000 },
    );

    await vi.advanceTimersByTimeAsync(6_000);

    await expect(pending).resolves.toBeNull();
  });

  it('returns null on a non-ok Cloudflare response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 401 })),
    );

    await expect(
      generateMeloTts(
        'Hello there.',
        '0123456789abcdef0123456789abcdef',
        'v1.0-abcdefghijklmnopqrstuvwxyz0123456789',
      ),
    ).resolves.toBeNull();
  });
});
