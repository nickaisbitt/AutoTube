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
  let buildImageFetchSources: (url: string) => { fetchUrl: string; label: string; retries?: number }[];
  let imageCache: Map<string, unknown>;
  let cacheSet: (key: string, value: unknown) => void;
  let MAX_CACHE_SIZE: number;

  const jpegHeader = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]);
  const mockJpegBuf = Buffer.concat([jpegHeader, Buffer.alloc(51200 - jpegHeader.length)]);

  function successFetchResponse() {
    return {
      ok: true,
      headers: {
        get: vi.fn().mockImplementation((h: string) => {
          const key = h.toLowerCase();
          if (key === 'content-type') return 'image/jpeg';
          if (key === 'content-length') return '51200';
          return null;
        }),
      },
      arrayBuffer: vi.fn().mockResolvedValue(mockJpegBuf.buffer),
    };
  }

  function failureFetchResponse() {
    return {
      ok: false,
      status: 503,
      headers: { get: vi.fn().mockReturnValue(null) },
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
    };
  }

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
    buildImageFetchSources = mod.buildImageFetchSources;
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
    const fetchMock = vi.fn().mockResolvedValue(successFetchResponse());
    vi.stubGlobal('fetch', fetchMock);

    const img1 = await fetchImage('https://example.com/img.jpg');
    const img2 = await fetchImage('https://example.com/img.jpg');

    expect(img1).toBe(img2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('buildImageFetchSources includes proxy, weserv, corsproxy, and direct', () => {
    const url = 'https://example.com/photo.jpg';
    const sources = buildImageFetchSources(url);
    expect(sources.map(s => s.label)).toEqual(['proxy', 'weserv', 'corsproxy', 'direct']);
    expect(sources[0].fetchUrl).toContain('/api/proxy-image?url=');
    expect(sources[1].fetchUrl).toContain('images.weserv.nl');
    expect(sources[2].fetchUrl).toContain('corsproxy.io');
    expect(sources[3].fetchUrl).toBe(url);
  });

  it('constructs proxy URL with encoded image URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(successFetchResponse());
    vi.stubGlobal('fetch', fetchMock);

    const url = 'https://example.com/image with spaces.jpg';
    await fetchImage(url);

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain('/api/proxy-image?url=');
    expect(calledUrl).toContain(encodeURIComponent(url));
  });

  it('retries proxy then alternate sources before returning null', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(failureFetchResponse());
    vi.stubGlobal('fetch', fetchMock);

    const resultPromise = fetchImage('https://example.com/fail.jpg');
    await vi.advanceTimersByTimeAsync(15000);
    const result = await resultPromise;

    vi.useRealTimers();

    expect(result).toBeNull();
    // proxy×3 + weserv×2 + corsproxy×1 + direct×1
    expect(fetchMock).toHaveBeenCalledTimes(7);
  });

  it('falls back to direct HTTPS fetch when proxy and proxies fail', async () => {
    const directUrl = 'https://example.com/direct.jpg';
    const fetchMock = vi.fn().mockImplementation((fetchUrl: string) => {
      if (fetchUrl === directUrl) {
        return Promise.resolve(successFetchResponse());
      }
      return Promise.resolve(failureFetchResponse());
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchImage(directUrl);

    expect(result).not.toBeNull();
    const calls = fetchMock.mock.calls.map(c => c[0] as string);
    expect(calls.some(url => url.includes('proxy-image'))).toBe(true);
    expect(calls.some(url => url.includes('weserv.nl'))).toBe(true);
    expect(calls.some(url => url === directUrl)).toBe(true);
  }, 15000);

  it('falls back to weserv when proxy fails', async () => {
    const originalUrl = 'https://example.com/weserv.jpg';
    const fetchMock = vi.fn().mockImplementation((fetchUrl: string) => {
      if (fetchUrl.includes('weserv.nl')) {
        return Promise.resolve(successFetchResponse());
      }
      return Promise.resolve(failureFetchResponse());
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchImage(originalUrl);

    expect(result).not.toBeNull();
    expect(fetchMock.mock.calls.some(c => String(c[0]).includes('weserv.nl'))).toBe(true);
  }, 15000);

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
