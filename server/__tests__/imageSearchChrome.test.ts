import { describe, expect, it, vi } from 'vitest';
import {
  chromeStaticCandidatesForPlatform,
  isBrowserClosedError,
  recoverFromClosedBrowserOnce,
  resolveChromeExecutablePath,
} from '../utils/imageSearch';

describe('resolveChromeExecutablePath', () => {
  it('prefers Linux static paths before macOS on linux hosts', () => {
    const order = chromeStaticCandidatesForPlatform('linux');
    expect(order[0]).toContain('/usr/bin/');
    expect(order.indexOf('/usr/bin/chromium')).toBeLessThan(
      order.indexOf('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
    );
  });

  it('prefers macOS app path first on darwin', () => {
    const order = chromeStaticCandidatesForPlatform('darwin');
    expect(order[0]).toContain('/Applications/Google Chrome');
  });

  it('honors env override when the binary exists', () => {
    const path = resolveChromeExecutablePath(
      (p) => p === '/custom/chrome',
      'linux',
      { PUPPETEER_EXECUTABLE_PATH: '/custom/chrome' },
      '/tmp/home',
    );
    expect(path).toBe('/custom/chrome');
  });

  it('falls through missing env to the first existing Linux binary', () => {
    const path = resolveChromeExecutablePath(
      (p) => p === '/usr/bin/chromium',
      'linux',
      {},
      '/tmp/home-missing-playwright',
    );
    expect(path).toBe('/usr/bin/chromium');
  });

  it('skips missing env paths and still probes Linux static binaries', () => {
    const seen: string[] = [];
    resolveChromeExecutablePath(
      (p) => {
        seen.push(p);
        return false;
      },
      'linux',
      { CHROME_PATH: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' },
      '/no-such-home',
    );
    expect(seen).toContain('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
    expect(seen).toContain('/usr/bin/chromium');
    expect(seen).toContain('/usr/bin/google-chrome-stable');
  });
});

describe('isBrowserClosedError', () => {
  it.each([
    'Target page, context or browser has been closed',
    'Protocol error (Runtime.callFunctionOn): Session closed',
    'Navigating frame was detached',
    'Execution context was destroyed',
    'browser has disconnected',
  ])('detects %s', (msg) => {
    expect(isBrowserClosedError(new Error(msg))).toBe(true);
  });

  it('ignores unrelated errors', () => {
    expect(isBrowserClosedError(new Error('net::ERR_CONNECTION_REFUSED'))).toBe(false);
    expect(isBrowserClosedError(new Error('Navigation timeout of 30000 ms exceeded'))).toBe(false);
  });
});

describe('recoverFromClosedBrowserOnce', () => {
  it('returns the first successful result', async () => {
    const runOnce = vi.fn(async (forceNew: boolean) => `ok-${forceNew}`);
    await expect(recoverFromClosedBrowserOnce(runOnce, [])).resolves.toBe('ok-false');
    expect(runOnce).toHaveBeenCalledTimes(1);
  });

  it('relaunches once on closed-browser then succeeds', async () => {
    const runOnce = vi
      .fn()
      .mockRejectedValueOnce(new Error('Target page, context or browser has been closed'))
      .mockResolvedValueOnce(['recovered']);
    const warn = vi.fn();
    await expect(recoverFromClosedBrowserOnce(runOnce, [], warn)).resolves.toEqual(['recovered']);
    expect(runOnce).toHaveBeenNthCalledWith(1, false);
    expect(runOnce).toHaveBeenNthCalledWith(2, true);
    expect(warn).toHaveBeenCalled();
  });

  it('returns fallback when relaunch also hits closed-browser (does not throw)', async () => {
    const closed = new Error('Target page, context or browser has been closed');
    const runOnce = vi.fn().mockRejectedValue(closed);
    await expect(recoverFromClosedBrowserOnce(runOnce, ['fallback'])).resolves.toEqual([
      'fallback',
    ]);
    expect(runOnce).toHaveBeenCalledTimes(2);
  });

  it('rethrows non-closed errors without retry', async () => {
    const runOnce = vi.fn().mockRejectedValue(new Error('Navigation timeout'));
    await expect(recoverFromClosedBrowserOnce(runOnce, [])).rejects.toThrow('Navigation timeout');
    expect(runOnce).toHaveBeenCalledTimes(1);
  });
});
