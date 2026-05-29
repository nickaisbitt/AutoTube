import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('canvas', () => ({
  createCanvas: vi.fn((w: number, h: number) => ({
    getContext: vi.fn(() => ({})),
    toBuffer: vi.fn(() => Buffer.alloc(w * h * 4)),
    width: w,
    height: h,
  })),
  loadImage: vi.fn(() => Promise.resolve({ width: 100, height: 100 })),
}));

describe('fetchImage', () => {
  let fetchImage: (url: string) => Promise<unknown>;
  let imageCache: Map<string, unknown>;
  let cacheSet: (key: string, value: unknown) => void;
  let MAX_CACHE_SIZE: number;

  beforeEach(async () => {
    vi.resetModules();

    const mockFs = {
      existsSync: vi.fn(),
      readFileSync: vi.fn(),
      mkdirSync: vi.fn(),
      writeFileSync: vi.fn(),
      unlinkSync: vi.fn(),
      rmSync: vi.fn(),
      statSync: vi.fn(),
      readdirSync: vi.fn(),
    };
    vi.doMock('fs', () => ({
      ...mockFs,
      default: mockFs,
    }));

    const mockChildProcess = {
      spawn: vi.fn(() => ({
        on: vi.fn(),
        once: vi.fn(),
        stdin: { write: vi.fn(), end: vi.fn(), once: vi.fn() },
        stdout: { on: vi.fn(), pipe: vi.fn() },
        stderr: { on: vi.fn(), pipe: vi.fn() },
        kill: vi.fn(),
      })),
      spawnSync: vi.fn(),
      execFileSync: vi.fn(),
    };
    vi.doMock('child_process', () => ({
      ...mockChildProcess,
      default: mockChildProcess,
    }));

    // @ts-expect-error .mjs module has no declaration file
    const mod = await import('../../server-render.mjs');
    fetchImage = mod.fetchImage;
    imageCache = mod.imageCache;
    cacheSet = mod.cacheSet;
    MAX_CACHE_SIZE = mod.MAX_CACHE_SIZE;
  });

  afterEach(() => {
    vi.doUnmock('fs');
    vi.doUnmock('child_process');
    vi.unstubAllGlobals();
    imageCache.clear();
  });

  it('returns cached image on subsequent calls', async () => {
    const jpegHeader = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]);
    const mockBuf = Buffer.concat([jpegHeader, Buffer.alloc(51200 - jpegHeader.length)]);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: {
        get: vi.fn().mockImplementation((h: string) => h.toLowerCase() === 'content-type' ? 'image/jpeg' : '51200'),
      },
      arrayBuffer: vi.fn().mockResolvedValue(mockBuf.buffer),
    });
    vi.stubGlobal('fetch', fetchMock);

    const img1 = await fetchImage('https://example.com/img.jpg');
    const img2 = await fetchImage('https://example.com/img.jpg');

    expect(img1).toBe(img2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('constructs proxy URL with encoded image URL', async () => {
    const jpegHeader = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]);
    const mockBuf = Buffer.concat([jpegHeader, Buffer.alloc(51200 - jpegHeader.length)]);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: {
        get: vi.fn().mockImplementation((h: string) => h.toLowerCase() === 'content-type' ? 'image/jpeg' : '51200'),
      },
      arrayBuffer: vi.fn().mockResolvedValue(mockBuf.buffer),
    });
    vi.stubGlobal('fetch', fetchMock);

    const url = 'https://example.com/image with spaces.jpg';
    await fetchImage(url);

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain('/api/proxy-image?url=');
    expect(calledUrl).toContain(encodeURIComponent(url));
  });

  it('retries up to 3 times on proxy failure before returning null', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      headers: {
        get: vi.fn().mockReturnValue(null),
      },
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
    });
    vi.stubGlobal('fetch', fetchMock);

    const resultPromise = fetchImage('https://example.com/fail.jpg');
    // Advance timers to trigger retry delays
    await vi.advanceTimersByTimeAsync(5000);
    const result = await resultPromise;

    vi.useRealTimers();

    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('falls back to direct HTTPS fetch when proxy fails', async () => {
    let callCount = 0;
    const jpegHeader = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]);
    const mockBuf = Buffer.concat([jpegHeader, Buffer.alloc(51200 - jpegHeader.length)]);
    const fetchMock = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount <= 3) {
        // Proxy failures — throw non-ok response
        return Promise.resolve({
          ok: false,
          status: 503,
          headers: {
            get: vi.fn().mockReturnValue(null),
          },
          arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
        });
      }
      // Direct HTTPS fetch succeeds
      return Promise.resolve({
        ok: true,
        headers: {
          get: vi.fn().mockImplementation((h: string) => h.toLowerCase() === 'content-type' ? 'image/jpeg' : '51200'),
        },
        arrayBuffer: vi.fn().mockResolvedValue(mockBuf.buffer),
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchImage('https://example.com/direct.jpg');

    expect(result).not.toBeNull();
    const calls = fetchMock.mock.calls.map(c => c[0] as string);
    expect(calls.some(url => url.includes('proxy-image'))).toBe(true);
    expect(calls.some(url => url === 'https://example.com/direct.jpg')).toBe(true);
  }, 15000); // 15s timeout for retry delays

  it('evicts oldest cache entries when size exceeds MAX_CACHE_SIZE', () => {
    for (let i = 0; i <= MAX_CACHE_SIZE; i++) {
      cacheSet(`url-${i}`, { id: i });
    }
    expect(imageCache.has('url-0')).toBe(false);
    expect(imageCache.has('url-1')).toBe(true);
    expect(imageCache.has(`url-${MAX_CACHE_SIZE}`)).toBe(true);
    expect(imageCache.size).toBe(MAX_CACHE_SIZE);
  });

  it('updates access order on cache hit', () => {
    cacheSet('url-a', { id: 'a' });
    cacheSet('url-b', { id: 'b' });
    cacheSet('url-a', { id: 'a-new' });
    for (let i = 2; i < MAX_CACHE_SIZE; i++) {
      cacheSet(`url-${i}`, { id: i });
    }
    cacheSet('url-new', { id: 'new' });
    expect(imageCache.has('url-a')).toBe(true);
    expect(imageCache.has('url-b')).toBe(false);
  });
});
