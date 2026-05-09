import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let mockExistsSync: ReturnType<typeof vi.fn>;
let mockSpawnSync: ReturnType<typeof vi.fn>;
let mockWriteFileSync: ReturnType<typeof vi.fn>;
let mockUnlinkSync: ReturnType<typeof vi.fn>;
let concatenateAudio: (audioFiles: Array<{ file: string; duration: number }>, outputFile: string) => Promise<boolean>;
let createBgMusicOnlyTrack: (bgMusicPath: string, outputFile: string, duration: number, bgVolume: number) => boolean;
let mixNarrationWithBgMusic: (narrationFile: string, bgMusicPath: string, outputFile: string, bgVolume: number) => boolean;
let muxVideoWithAudio: (videoFile: string, narrationFile: string | null, outputFile: string, videoDuration: number, options?: Record<string, unknown>) => boolean;
let resolveBackgroundMusicPath: (style: string, musicPreset?: string) => string | null;
let computeBgMusicVolume: (hasNarration: boolean) => number;

describe('audio.mjs', () => {
  beforeEach(async () => {
    vi.resetModules();
    mockExistsSync = vi.fn().mockReturnValue(true);
    mockSpawnSync = vi.fn().mockReturnValue({ status: 0 });
    mockWriteFileSync = vi.fn();
    mockUnlinkSync = vi.fn();

    vi.doMock('fs', () => ({
      existsSync: mockExistsSync,
      writeFileSync: mockWriteFileSync,
      unlinkSync: mockUnlinkSync,
      readFileSync: vi.fn(),
      mkdirSync: vi.fn(),
      rmSync: vi.fn(),
      statSync: vi.fn(),
      default: {
existsSync: mockExistsSync,
      writeFileSync: mockWriteFileSync,
      unlinkSync: mockUnlinkSync,
      readFileSync: vi.fn(),
      mkdirSync: vi.fn(),
      rmSync: vi.fn(),
      statSync: vi.fn(),
      },
    }));

    vi.doMock('child_process', () => ({
      spawnSync: mockSpawnSync,
      default: {
        spawnSync: mockSpawnSync,
      },
    }));

    // @ts-expect-error .mjs module has no declaration file
    const audioModule = await import('../../server-render/audio.mjs');
    concatenateAudio = audioModule.concatenateAudio;
    createBgMusicOnlyTrack = audioModule.createBgMusicOnlyTrack;
    mixNarrationWithBgMusic = audioModule.mixNarrationWithBgMusic;
    muxVideoWithAudio = audioModule.muxVideoWithAudio;
    resolveBackgroundMusicPath = audioModule.resolveBackgroundMusicPath;
    computeBgMusicVolume = audioModule.computeBgMusicVolume;
  });

  afterEach(() => {
    vi.doUnmock('fs');
    vi.doUnmock('child_process');
  });

  describe('concatenateAudio', () => {
    it('writes concat list file and spawns ffmpeg', async () => {
      const files = [
        { file: '/tmp/a.mp3', duration: 5 },
        { file: '/tmp/b.mp3', duration: 3 },
      ];
      const result = await concatenateAudio(files, '/tmp/out.aac');
      expect(result).toBe(true);
      expect(mockWriteFileSync).toHaveBeenCalledOnce();
      const listContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(listContent).toContain("file '/tmp/a.mp3'");
      expect(listContent).toContain("file '/tmp/b.mp3'");
      expect(mockSpawnSync).toHaveBeenCalledOnce();
      const args = mockSpawnSync.mock.calls[0][1] as string[];
      expect(args).toContain('-f');
      expect(args).toContain('concat');
      expect(args).toContain('-c:a');
      expect(args).toContain('aac');
    });

    it('returns false when ffmpeg fails', async () => {
      mockSpawnSync.mockReturnValue({ status: 1, stderr: 'error' });
      const result = await concatenateAudio([{ file: '/tmp/a.mp3', duration: 5 }], '/tmp/out.aac');
      expect(result).toBe(false);
    });

    it('handles empty file list gracefully', async () => {
      const result = await concatenateAudio([], '/tmp/out.aac');
      expect(result).toBe(true);
      expect(mockWriteFileSync).toHaveBeenCalledOnce();
      const listContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(listContent).toBe('');
    });

    it('handles single file', async () => {
      const result = await concatenateAudio([{ file: '/tmp/solo.mp3', duration: 10 }], '/tmp/out.aac');
      expect(result).toBe(true);
      expect(mockSpawnSync).toHaveBeenCalledOnce();
    });
  });

  describe('createBgMusicOnlyTrack', () => {
    it('spawns ffmpeg with stream_loop and volume filter', () => {
      const result = createBgMusicOnlyTrack('/tmp/music.aac', '/tmp/out.aac', 60, 0.6);
      expect(result).toBe(true);
      const args = mockSpawnSync.mock.calls[0][1] as string[];
      expect(args).toContain('-stream_loop');
      expect(args).toContain('-1');
      expect(args).toContain('-t');
      expect(args).toContain('60');
      expect(args.some(a => a.includes('volume=0.6'))).toBe(true);
      expect(args).toContain('-c:a');
      expect(args).toContain('aac');
    });

    it('returns false when ffmpeg fails', () => {
      mockSpawnSync.mockReturnValue({ status: 1 });
      const result = createBgMusicOnlyTrack('/tmp/music.aac', '/tmp/out.aac', 60, 0.6);
      expect(result).toBe(false);
    });
  });

  describe('mixNarrationWithBgMusic', () => {
    it('spawns ffmpeg with amix filter', () => {
      const result = mixNarrationWithBgMusic('/tmp/narration.aac', '/tmp/music.aac', '/tmp/out.aac', 0.15);
      expect(result).toBe(true);
      const args = mockSpawnSync.mock.calls[0][1] as string[];
      expect(args).toContain('-i');
      expect(args).toContain('/tmp/narration.aac');
      expect(args).toContain('-stream_loop');
      expect(args).toContain('-1');
      expect(args).toContain('-i');
      expect(args).toContain('/tmp/music.aac');
      expect(args.some(a => a.includes('amix'))).toBe(true);
    });
  });

  describe('muxVideoWithAudio', () => {
    it('produces silent video when no narration and no bg music', () => {
      mockExistsSync.mockReturnValue(false);
      const result = muxVideoWithAudio('/tmp/video.mp4', null, '/tmp/out.mp4', 30, { style: 'documentary', backgroundMusic: true });
      expect(result).toBe(true);
      const args = mockSpawnSync.mock.calls[0][1] as string[];
      expect(args).toContain('-c:v');
      expect(args).toContain('libx264');
    });

    it('uses background music only when narration is missing', () => {
      mockExistsSync.mockImplementation((p: string) => p.includes('ambient-bg.aac'));
      const result = muxVideoWithAudio('/tmp/video.mp4', null, '/tmp/out.mp4', 30, { style: 'documentary', backgroundMusic: true });
      expect(result).toBe(true);
      const calls = mockSpawnSync.mock.calls;
      expect(calls.length).toBeGreaterThanOrEqual(1);
    });

    it('uses narration only when bg music is disabled', () => {
      mockExistsSync.mockImplementation((p: string) => p.includes('narration'));
      const result = muxVideoWithAudio('/tmp/video.mp4', '/tmp/narration.aac', '/tmp/out.mp4', 30, { backgroundMusic: false });
      expect(result).toBe(true);
      const args = mockSpawnSync.mock.calls[0][1] as string[];
      expect(args).toContain('-i');
      expect(args).toContain('/tmp/narration.aac');
    });

    it('mixes narration and bg music when both are available', () => {
      mockExistsSync.mockImplementation((p: string) => {
        return p.includes('narration') || p.includes('ambient-bg.aac');
      });
      const result = muxVideoWithAudio('/tmp/video.mp4', '/tmp/narration.aac', '/tmp/out.mp4', 30, { style: 'documentary', backgroundMusic: true });
      expect(result).toBe(true);
      const calls = mockSpawnSync.mock.calls;
      expect(calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('computeBgMusicVolume', () => {
    it('returns 0.15 when narration is present', () => {
      expect(computeBgMusicVolume(true)).toBe(0.15);
    });

    it('returns 0.60 when no narration', () => {
      expect(computeBgMusicVolume(false)).toBe(0.60);
    });
  });

  describe('resolveBackgroundMusicPath', () => {
    it('returns null when no music files exist', () => {
      mockExistsSync.mockReturnValue(false);
      expect(resolveBackgroundMusicPath('business_insider')).toBeNull();
    });
  });
});
