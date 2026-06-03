import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

vi.mock('canvas', () => ({
  createCanvas: vi.fn((w: number, h: number) => ({
    getContext: vi.fn(() => ({})),
    toBuffer: vi.fn(() => Buffer.alloc(w * h * 4)),
    width: w,
    height: h,
  })),
  loadImage: vi.fn(() => Promise.resolve({ width: 100, height: 100 })),
}));

describe('ffmpeg integration', () => {
  let mockSpawnSync: ReturnType<typeof vi.fn>;
  let mockExistsSync: ReturnType<typeof vi.fn>;
  let audioModuleConcatenateAudio: (audioFiles: Array<{ file: string; duration: number }>, outputFile: string) => Promise<boolean>;
  let mixNarrationWithBgMusic: (narrationFile: string, bgMusicPath: string, outputFile: string, bgVolume: number) => boolean;
  let createBgMusicOnlyTrack: (bgMusicPath: string, outputFile: string, duration: number, bgVolume: number) => boolean;
  let muxVideoWithAudio: (videoFile: string, narrationFile: string | null, outputFile: string, videoDuration: number, options?: Record<string, unknown>) => boolean;

  beforeEach(async () => {
    vi.resetModules();
    mockSpawnSync = vi.fn().mockReturnValue({ status: 0 });
    mockExistsSync = vi.fn().mockReturnValue(true);

    vi.doMock('fs', () => ({
      existsSync: mockExistsSync,
      writeFileSync: vi.fn(),
      unlinkSync: vi.fn(),
      readFileSync: vi.fn(),
      mkdirSync: vi.fn(),
      rmSync: vi.fn(),
      statSync: vi.fn(),
      readdirSync: vi.fn(),
      default: {
existsSync: mockExistsSync,
      writeFileSync: vi.fn(),
      unlinkSync: vi.fn(),
      readFileSync: vi.fn(),
      mkdirSync: vi.fn(),
      rmSync: vi.fn(),
      statSync: vi.fn(),
      readdirSync: vi.fn(),
      },
    }));

    vi.doMock('child_process', () => ({
      spawn: vi.fn(() => ({
        on: vi.fn(),
        once: vi.fn(),
        stdin: { write: vi.fn(), end: vi.fn(), once: vi.fn() },
        stdout: { on: vi.fn(), pipe: vi.fn() },
        stderr: { on: vi.fn(), pipe: vi.fn() },
        kill: vi.fn(),
      })),
      spawnSync: mockSpawnSync,
      execFileSync: vi.fn(),
      default: {
        spawn: vi.fn(() => ({
          on: vi.fn(),
          once: vi.fn(),
          stdin: { write: vi.fn(), end: vi.fn(), once: vi.fn() },
          stdout: { on: vi.fn(), pipe: vi.fn() },
          stderr: { on: vi.fn(), pipe: vi.fn() },
          kill: vi.fn(),
        })),
        spawnSync: mockSpawnSync,
        execFileSync: vi.fn(),
      },
    }));

    // @ts-expect-error .mjs module has no declaration file
    const mod = await import('../../server-render.mjs');

    // @ts-expect-error .mjs module has no declaration file
    const audioMod = await import('../../server-render/audio.mjs');
    audioModuleConcatenateAudio = audioMod.concatenateAudio;
    mixNarrationWithBgMusic = audioMod.mixNarrationWithBgMusic;
    createBgMusicOnlyTrack = audioMod.createBgMusicOnlyTrack;
    muxVideoWithAudio = audioMod.muxVideoWithAudio;
  });

  afterEach(() => {
    vi.doUnmock('fs');
    vi.doUnmock('child_process');
  });

  describe('concatenateAudio (local) edge cases', () => {
    it('handles empty audio file list by returning false early', async () => {
      const result = await audioModuleConcatenateAudio([], '/tmp/out.aac');
      expect(result).toBe(false);
      expect(mockSpawnSync).not.toHaveBeenCalled();
    });

    it('concatenates single file by converting format directly', async () => {
      const result = await audioModuleConcatenateAudio([{ file: '/tmp/solo.aac', duration: 10 }], '/tmp/out.aac');
      expect(result).toBe(true);
      const args = mockSpawnSync.mock.calls[0][1] as string[];
      expect(args).toContain('-i');
      expect(args).toContain('/tmp/solo.aac');
      expect(args).toContain('-c:a');
      expect(args).toContain('aac');
    });

    it('concatenates multiple files with premium exponential crossfades', async () => {
      const files = [
        { file: '/tmp/a.aac', duration: 5 },
        { file: '/tmp/b.aac', duration: 5 },
      ];
      const result = await audioModuleConcatenateAudio(files, '/tmp/out.aac');
      expect(result).toBe(true);
      
      // The last call to spawnSync will be the one merging files using filter_complex
      const lastCall = mockSpawnSync.mock.calls[mockSpawnSync.mock.calls.length - 1];
      const args = lastCall[1] as string[];
      expect(args).toContain('-filter_complex');
      expect(args.some(a => a.includes('acrossfade'))).toBe(true);
      expect(args).toContain('-c:a');
      expect(args).toContain('aac');
    });
  });

  describe('audio.mjs ffmpeg arguments', () => {
    it('concatenateAudio uses aac codec at 320k', async () => {
      const files = [
        { file: '/tmp/a.mp3', duration: 5 },
        { file: '/tmp/b.mp3', duration: 3 },
      ];
      await audioModuleConcatenateAudio(files, '/tmp/out.aac');
      const concatCall = mockSpawnSync.mock.calls.find((c: any) => c[1].includes('-filter_complex'));
      expect(concatCall).toBeDefined();
      const args = concatCall[1] as string[];
      expect(args).toContain('-c:a');
      expect(args).toContain('aac');
      expect(args).toContain('-b:a');
      expect(args).toContain('320k');
    });

    it('mixNarrationWithBgMusic uses amix filter', () => {
      mixNarrationWithBgMusic('/tmp/narration.aac', '/tmp/music.aac', '/tmp/out.aac', 0.15);
      const mixCall = mockSpawnSync.mock.calls.find((c: any) => c[1].includes('-filter_complex'));
      expect(mixCall).toBeDefined();
      const args = mixCall[1] as string[];
      expect(args.some(a => a.includes('amix'))).toBe(true);
      expect(args).toContain('-c:a');
      expect(args).toContain('aac');
    });

    it('createBgMusicOnlyTrack uses stream_loop and volume filter', () => {
      createBgMusicOnlyTrack('/tmp/music.aac', '/tmp/out.aac', 60, 0.6);
      const args = mockSpawnSync.mock.calls[0][1] as string[];
      expect(args).toContain('-stream_loop');
      expect(args).toContain('-1');
      expect(args).toContain('-t');
      expect(args).toContain('60');
      expect(args.some(a => a.includes('volume=0.6'))).toBe(true);
    });
  });

  describe('muxVideoWithAudio quality presets', () => {
    it('copies the video stream without re-encoding', () => {
      mockExistsSync.mockImplementation((p: string) => p.includes('narration'));
      muxVideoWithAudio('/tmp/video.mp4', '/tmp/narration.aac', '/tmp/out.mp4', 30, { backgroundMusic: false });
      const lastCall = mockSpawnSync.mock.calls[mockSpawnSync.mock.calls.length - 1];
      const args = lastCall[1] as string[];
      expect(args).toContain('-c:v');
      expect(args).toContain('copy');
    });

    it('uses aac audio at 320k bitrate', () => {
      mockExistsSync.mockImplementation((p: string) => p.includes('narration'));
      muxVideoWithAudio('/tmp/video.mp4', '/tmp/narration.aac', '/tmp/out.mp4', 30, { backgroundMusic: false });
      const lastCall = mockSpawnSync.mock.calls[mockSpawnSync.mock.calls.length - 1];
      const args = lastCall[1] as string[];
      expect(args).toContain('-c:a');
      expect(args).toContain('aac');
      expect(args).toContain('-b:a');
      expect(args).toContain('320k');
    });
  });

  describe('hardware encoding detection', () => {
    it('currently copies the video stream without re-encoding', () => {
      mockExistsSync.mockImplementation((p: string) => p.includes('narration'));
      muxVideoWithAudio('/tmp/video.mp4', '/tmp/narration.aac', '/tmp/out.mp4', 30, { backgroundMusic: false });
      const lastCall = mockSpawnSync.mock.calls[mockSpawnSync.mock.calls.length - 1];
      const args = lastCall[1] as string[];
      expect(args).toContain('copy');
      expect(args).not.toContain('libx264');
      expect(args).not.toContain('videotoolbox');
      expect(args).not.toContain('h264_nvenc');
      expect(args).not.toContain('h264_qsv');
    });
  });

  describe('ffmpeg error handling', () => {
    it('returns false when audio concat fails', async () => {
      mockSpawnSync.mockReturnValue({ status: 1, stderr: 'error' });
      const result = await audioModuleConcatenateAudio([{ file: '/tmp/a.mp3', duration: 5 }], '/tmp/out.aac');
      expect(result).toBe(false);
    });

    it('returns false when muxing fails', () => {
      mockExistsSync.mockImplementation((p: string) => p.includes('narration'));
      mockSpawnSync.mockReturnValue({ status: 1 });
      const result = muxVideoWithAudio('/tmp/video.mp4', '/tmp/narration.aac', '/tmp/out.mp4', 30, { backgroundMusic: false });
      expect(result).toBe(false);
    });

    it('returns false when background music track creation fails', () => {
      mockSpawnSync.mockReturnValue({ status: 1 });
      const result = createBgMusicOnlyTrack('/tmp/music.aac', '/tmp/out.aac', 60, 0.6);
      expect(result).toBe(false);
    });

    it('returns false when mix narration with bg music fails', () => {
      mockSpawnSync.mockReturnValue({ status: 1 });
      const result = mixNarrationWithBgMusic('/tmp/narration.aac', '/tmp/music.aac', '/tmp/out.aac', 0.15);
      expect(result).toBe(false);
    });
  });

  describe('render failure ffmpeg cleanup (module scope)', () => {
    const renderPaths = [
      join(process.cwd(), 'server-render.mjs'),
      join(process.cwd(), 'deploy/server-render.mjs'),
    ];

    for (const renderPath of renderPaths) {
      it(`${renderPath} uses module-scope activeFfmpeg for crash cleanup`, () => {
        const source = readFileSync(renderPath, 'utf8');

        expect(source).toMatch(/let activeFfmpeg = null;/);
        expect(source).toMatch(/let activeFfmpegExited = false;/);
        expect(source).toMatch(/activeFfmpeg = ffmpeg;/);
        expect(source).toMatch(/activeFfmpegExited = true;/);

        const failureHandler = source.match(
          /render\(\)\.catch\(err => \{[\s\S]*?\n  \}\);/
        )?.[0];
        expect(failureHandler).toBeDefined();
        expect(failureHandler).toMatch(/if \(activeFfmpeg && !activeFfmpegExited\)/);
        expect(failureHandler).toMatch(/activeFfmpeg\.kill\('SIGKILL'\)/);
        expect(failureHandler).not.toMatch(/if \(ffmpeg && !ffmpegExited\)/);
      });
    }
  });
});
