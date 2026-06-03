import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let mockExistsSync: ReturnType<typeof vi.fn>;
let mockSpawnSync: ReturnType<typeof vi.fn>;
let mockSpawn: ReturnType<typeof vi.fn>;
let mockWriteFileSync: ReturnType<typeof vi.fn>;
let mockStatSync: ReturnType<typeof vi.fn>;
let generateNarration: (segments: Array<{ title: string; narration: string; duration: number }>, outputDir: string, options?: Record<string, unknown>) => Promise<Array<{ file: string; duration: number }>>;
let generateSilence: (outputPath: string, durationSec: number) => boolean;

describe('narration.mjs', () => {
  beforeEach(async () => {
    vi.resetModules();
    const narrationStatCalls = new Map<string, number>();
    mockExistsSync = vi.fn((path: string) => {
      if (typeof path === 'string' && path.includes('_kokoro/current.wav')) return true;
      if (typeof path === 'string' && path.endsWith('kokoro_generate.py')) return true;
      return true;
    });
    mockStatSync = vi.fn((path: string) => {
      if (typeof path === 'string' && /narration-\d+\.wav/.test(path)) {
        const n = (narrationStatCalls.get(path) || 0) + 1;
        narrationStatCalls.set(path, n);
        return { size: n === 1 ? 0 : 1024 };
      }
      return { size: 1024 };
    });
    mockSpawnSync = vi.fn().mockReturnValue({ status: 0 });
    mockSpawn = vi.fn().mockImplementation(() => ({
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn().mockImplementation((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 5);
        }
      }),
    }));
    mockWriteFileSync = vi.fn();

    vi.doMock('fs', () => ({
      existsSync: mockExistsSync,
      writeFileSync: mockWriteFileSync,
      unlinkSync: vi.fn(),
      readFileSync: vi.fn(),
      mkdirSync: vi.fn(),
      rmSync: vi.fn(),
      statSync: mockStatSync,
      readdirSync: vi.fn(),
      default: {
        existsSync: mockExistsSync,
        writeFileSync: mockWriteFileSync,
        unlinkSync: vi.fn(),
        readFileSync: vi.fn(),
        mkdirSync: vi.fn(),
        rmSync: vi.fn(),
        statSync: mockStatSync,
        readdirSync: vi.fn(),
      },
    }));

    vi.doMock('child_process', () => ({
      spawnSync: mockSpawnSync,
      spawn: mockSpawn,
      default: {
        spawnSync: mockSpawnSync,
        spawn: mockSpawn,
      },
    }));

    // @ts-expect-error .mjs module has no declaration file
    const narrationModule = await import('../../server-render/narration.mjs');
    generateNarration = narrationModule.generateNarration;
    generateSilence = narrationModule.generateSilence;
  });

  afterEach(() => {
    vi.doUnmock('fs');
    vi.doUnmock('child_process');
    vi.unstubAllGlobals();
  });

  describe('generateSilence', () => {
    it('spawns ffmpeg with anullsrc filter', () => {
      const result = generateSilence('/tmp/silence.mp3', 5);
      expect(result).toBe(true);
      expect(mockSpawnSync).toHaveBeenCalledOnce();
      const args = mockSpawnSync.mock.calls[0][1] as string[];
      expect(args).toContain('-f');
      expect(args).toContain('lavfi');
      expect(args.some(a => a.includes('anullsrc'))).toBe(true);
      expect(args).toContain('-t');
      expect(args).toContain('5');
    });

    it('returns false when ffmpeg fails to create file', () => {
      mockExistsSync.mockReturnValue(false);
      const result = generateSilence('/tmp/silence.mp3', 2);
      expect(result).toBe(false);
    });
  });

  describe('generateNarration fallback chain', () => {
    const segments = [
      { title: 'Intro', narration: 'Hello world', duration: 5 },
    ];

    it('uses Kokoro-82M by default (local TTS, tier 1)', async () => {
      const segments = [{ title: 'Test', narration: 'Hello world', duration: 5 }];
      await generateNarration(segments, '/tmp/audio');
      // Kokoro Python script should be called
      expect(mockSpawn).toHaveBeenCalled();
      const kokoroCall = mockSpawn.mock.calls.find(c =>
        Array.isArray(c[1]) && c[1].some(a => typeof a === 'string' && a.includes('kokoro_generate'))
      );
      expect(kokoroCall).toBeTruthy();
    });

    it('uses Kokoro-82M first regardless of options', async () => {
      const segments = [{ title: 'Test', narration: 'Hello world', duration: 5 }];
      await generateNarration(segments, '/tmp/audio', { xaiKey: 'test-key', ttsVoice: 'Leo' });
      // Kokoro is always tier 1
      const kokoroCalls = mockSpawn.mock.calls.filter(c =>
        Array.isArray(c[1]) && c[1].some(a => a.includes('kokoro_generate'))
      );
      expect(kokoroCalls.length).toBeGreaterThanOrEqual(1);
    });

    it('falls back to edge-tts when Kokoro fails and no API providers available', async () => {
      // Make Kokoro python generation fail (spawn returns non-zero)
      mockSpawn.mockImplementation(() => ({
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn().mockImplementation((event, callback) => {
          if (event === 'close') {
            setTimeout(() => callback(1), 5);
          }
        }),
      }));
      const result = await generateNarration(segments, '/tmp/audio', {});
      expect(result.length).toBeGreaterThan(0);
      expect(result.some(r => r.file.includes('narration-0'))).toBe(true);
    });

    it('includes intro silence and per-segment silence gaps', async () => {
      const result = await generateNarration(segments, '/tmp/audio', {});
      expect(result.some(r => r.file.includes('silence-intro'))).toBe(true);
      expect(result.some(r => r.file.includes('silence-0'))).toBe(true);
    });
  });

  describe('TTS configuration validation', () => {
    const singleSegment = [
      { title: 'Intro', narration: 'Hello world', duration: 5 },
    ];

    it('requires both cfAccountId and cfApiToken for MeloTTS', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(10)),
      });
      vi.stubGlobal('fetch', fetchMock);

      await generateNarration(singleSegment, '/tmp/audio', { cfAccountId: 'id' });
      const meloCalls = (fetchMock.mock.calls as unknown[][]).filter((call: unknown[]) => {
        const url = call[0] as string;
        return url.includes('cloudflare');
      });
      expect(meloCalls.length).toBe(0);
    });
  });
});
