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

describe('fetchProject', () => {
  let fetchProject: () => Promise<Record<string, unknown>>;
  let mockExistsSync: ReturnType<typeof vi.fn>;
  let mockReadFileSync: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    mockExistsSync = vi.fn();
    mockReadFileSync = vi.fn();

    vi.doMock('fs', () => ({
      existsSync: mockExistsSync,
      readFileSync: mockReadFileSync,
      mkdirSync: vi.fn(),
      writeFileSync: vi.fn(),
      unlinkSync: vi.fn(),
      rmSync: vi.fn(),
      statSync: vi.fn(),
      readdirSync: vi.fn(),
      default: {
existsSync: mockExistsSync,
      readFileSync: mockReadFileSync,
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
      spawnSync: vi.fn(),
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
        spawnSync: vi.fn(),
        execFileSync: vi.fn(),
      },
    }));

    // @ts-expect-error .mjs module has no declaration file
    const mod = await import('../../server-render.mjs');
    fetchProject = mod.fetchProject;
  });

  afterEach(() => {
    vi.doUnmock('fs');
    vi.doUnmock('child_process');
    vi.unstubAllGlobals();
  });

  it('loads from /tmp/autotube-project.json when it exists', async () => {
    const project = { title: 'Test Project', script: [], media: [] };
    mockExistsSync.mockImplementation((p: string) => p === '/tmp/autotube-project.json');
    mockReadFileSync.mockReturnValue(JSON.stringify(project));

    const result = await fetchProject();
    expect(result).toEqual(project);
    expect(mockExistsSync).toHaveBeenCalledWith('/tmp/autotube-project.json');
    expect(mockReadFileSync).toHaveBeenCalledWith('/tmp/autotube-project.json', 'utf8');
  });

  it('falls back to dev server API when project file is missing', async () => {
    mockExistsSync.mockReturnValue(false);
    const project = { title: 'API Project', script: [], media: [] };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue(''),
      json: vi.fn().mockResolvedValue(project),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchProject();
    expect(result).toEqual(project);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/export-project'));
  });

  it('throws when dev server returns an error', async () => {
    mockExistsSync.mockReturnValue(false);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: vi.fn().mockResolvedValue('Internal Server Error'),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchProject()).rejects.toThrow('Failed to fetch project: 500');
  });

  it('throws when the project file contains invalid JSON', async () => {
    mockExistsSync.mockImplementation((p: string) => p === '/tmp/autotube-project.json');
    mockReadFileSync.mockReturnValue('not valid json');

    await expect(fetchProject()).rejects.toThrow(SyntaxError);
  });
});
