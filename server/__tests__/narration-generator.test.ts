import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let mockExistsSync: ReturnType<typeof vi.fn>;
let mockSpawnSync: ReturnType<typeof vi.fn>;
let mockWriteFileSync: ReturnType<typeof vi.fn>;
let generateNarration: (segments: Array<{ title: string; narration: string; duration: number }>, outputDir: string, options?: Record<string, unknown>) => Promise<Array<{ file: string; duration: number }>>;
let generateSilence: (outputPath: string, durationSec: number) => boolean;

describe('narration.mjs', () => {
  beforeEach(async () => {
    vi.resetModules();
    mockExistsSync = vi.fn().mockReturnValue(true);
    mockSpawnSync = vi.fn().mockReturnValue({ status: 0 });
    mockWriteFileSync = vi.fn();

    vi.doMock('fs', () => ({
      existsSync: mockExistsSync,
      writeFileSync: mockWriteFileSync,
      unlinkSync: vi.fn(),
      readFileSync: vi.fn(),
      mkdirSync: vi.fn(),
      rmSync: vi.fn(),
      statSync: vi.fn(),
      readdirSync: vi.fn(),
      default: {
existsSync: mockExistsSync,
      writeFileSync: mockWriteFileSync,
      unlinkSync: vi.fn(),
      readFileSync: vi.fn(),
      mkdirSync: vi.fn(),
      rmSync: vi.fn(),
      statSync: vi.fn(),
      readdirSync: vi.fn(),
      },
    }));

    vi.doMock('child_process', () => ({
      spawnSync: mockSpawnSync,
      default: {
        spawnSync: mockSpawnSync,
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

    it('uses edge-tts by default (free, tier 1)', async () => {
      const segments = [{ title: 'Test', narration: 'Hello world', duration: 5 }];
      await generateNarration(segments, '/tmp/audio');
      // edge-tts is called since no API key provided
      expect(mockSpawnSync).toHaveBeenCalled();
      const lastCall = mockSpawnSync.mock.calls[mockSpawnSync.mock.calls.length - 1];
      expect(lastCall[0]).toBe('edge-tts');
    });

    it('still tries edge-tts first even when xaiKey is provided', async () => {
      const segments = [{ title: 'Test', narration: 'Hello world', duration: 5 }];
      await generateNarration(segments, '/tmp/audio', { xaiKey: 'test-key', ttsVoice: 'Leo' });
      // When edge-tts succeeds (mock returns status 0), Grok should NOT be called
      const edgeTtsCalls = mockSpawnSync.mock.calls.filter(c => c[0] === 'edge-tts');
      expect(edgeTtsCalls.length).toBeGreaterThanOrEqual(1);
    });

    it('falls back to Grok TTS when edge-tts fails', async () => {
      // Make edge-tts fail so we test the fallback
      mockSpawnSync.mockImplementation((cmd: string, _args: string[]) => {
        if (cmd === 'edge-tts') return { status: 1, stdout: '' };
        return { status: 0 };
      });

      const fetchMock = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(10)),
        });
      vi.stubGlobal('fetch', fetchMock);

      const result = await generateNarration(segments, '/tmp/audio', {
        xaiKey: 'test-key',
        ttsVoice: 'Leo',
      });
      expect(result.length).toBeGreaterThan(0);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('falls back to silence when edge-tts fails and no API providers available', async () => {
      mockSpawnSync.mockImplementation((cmd: string, _args: string[]) => {
        if (cmd === 'edge-tts') return { status: 1, stdout: '' };
        return { status: 0 };
      });

      const result = await generateNarration(segments, '/tmp/audio', {});
      expect(result.length).toBeGreaterThan(0);
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
