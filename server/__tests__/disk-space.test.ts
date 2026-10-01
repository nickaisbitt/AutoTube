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

describe('disk space', () => {
  let getAvailableDiskSpace: (path?: string) => number | null;
  let validateDiskSpace: (project: Record<string, unknown>, outputPath: string) => void;
  let mockSpawnSync: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    mockSpawnSync = vi.fn();

    vi.doMock('fs', () => ({
      existsSync: vi.fn(),
      readFileSync: vi.fn(),
      mkdirSync: vi.fn(),
      writeFileSync: vi.fn(),
      unlinkSync: vi.fn(),
      rmSync: vi.fn(),
      statSync: vi.fn(),
      readdirSync: vi.fn(),
      default: {
existsSync: vi.fn(),
      readFileSync: vi.fn(),
      mkdirSync: vi.fn(),
      writeFileSync: vi.fn(),
      unlinkSync: vi.fn(),
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
    getAvailableDiskSpace = mod.getAvailableDiskSpace;
    validateDiskSpace = mod.validateDiskSpace;
  });

  afterEach(() => {
    vi.doUnmock('fs');
    vi.doUnmock('child_process');
  });

  describe('getAvailableDiskSpace', () => {
    it('parses df output and returns available bytes', () => {
      mockSpawnSync.mockReturnValue({
        status: 0,
        stdout: 'Filesystem  1K-blocks      Used Available Use% Mounted on\n/dev/disk1  488245288 100000000 388245288  21% /',
      });

      const result = getAvailableDiskSpace('/tmp');
      expect(result).toBe(388245288 * 1024);
      expect(mockSpawnSync).toHaveBeenCalledWith('df', ['-k', '/tmp'], { encoding: 'utf-8', timeout: 5000 });
    });

    it('returns null when df command fails', () => {
      mockSpawnSync.mockReturnValue({ status: 1, stdout: '' });
      const result = getAvailableDiskSpace('/tmp');
      expect(result).toBeNull();
    });

    it('returns null when df output is malformed', () => {
      mockSpawnSync.mockReturnValue({ status: 0, stdout: 'bad output' });
      const result = getAvailableDiskSpace('/tmp');
      expect(result).toBeNull();
    });

    it('returns null when available column is not a number', () => {
      mockSpawnSync.mockReturnValue({
        status: 0,
        stdout: 'Filesystem  1K-blocks      Used Available Use% Mounted on\n/dev/disk1  488245288 100000000     ???  21% /',
      });
      const result = getAvailableDiskSpace('/tmp');
      expect(result).toBeNull();
    });
  });

  describe('validateDiskSpace', () => {
    it('throws when disk space is insufficient', () => {
      mockSpawnSync.mockReturnValue({
        status: 0,
        stdout: 'Filesystem  1K-blocks      Used Available Use% Mounted on\n/dev/disk1  488245288 487000000   400000  99% /',
      });

      const project = {
        script: [{ durationSec: 60 }, { durationSec: 60 }],
        exportSettings: { resolution: '1080p' },
      };

      expect(() => validateDiskSpace(project, '/tmp/output.mp4')).toThrow('Insufficient disk space');
    });

    it('does not throw when sufficient space is available', () => {
      mockSpawnSync.mockReturnValue({
        status: 0,
        stdout: 'Filesystem  1K-blocks      Used Available Use% Mounted on\n/dev/disk1  488245288 100000000 388245288  21% /',
      });

      const project = {
        script: [{ durationSec: 10 }],
        exportSettings: { resolution: '720p' },
      };

      expect(() => validateDiskSpace(project, '/tmp/output.mp4')).not.toThrow();
    });

    it('warns and returns when disk space cannot be determined', () => {
      mockSpawnSync.mockReturnValue({ status: 1, stdout: '' });
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const project = {
        script: [{ durationSec: 10 }],
      };

      expect(() => validateDiskSpace(project, '/tmp/output.mp4')).not.toThrow();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Cannot verify disk space'));
      consoleSpy.mockRestore();
    });

    it('scales estimate by resolution multiplier', () => {
      mockSpawnSync.mockReturnValue({
        status: 0,
        stdout: 'Filesystem  1K-blocks      Used Available Use% Mounted on\n/dev/disk1  488245288 487000000   400000  99% /',
      });

      const project4K = {
        script: Array.from({ length: 10 }, () => ({ durationSec: 60 })),
        exportSettings: { resolution: '4K' },
      };

      expect(() => validateDiskSpace(project4K, '/tmp/output.mp4')).toThrow('Insufficient disk space');
    });
  });
});
