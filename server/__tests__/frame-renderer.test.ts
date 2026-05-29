import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('canvas', () => ({
  createCanvas: vi.fn((w: number, h: number) => {
    const ctx = makeMockCtx();
    return {
      getContext: vi.fn(() => ctx),
      toBuffer: vi.fn(() => Buffer.alloc(w * h * 4)),
      width: w,
      height: h,
    };
  }),
  loadImage: vi.fn(() => Promise.resolve({ width: 100, height: 100 })),
}));

function makeMockCtx() {
  const state: Record<string, unknown> = {};
  const calls: string[] = [];

  const createGradient = () => ({
    addColorStop: vi.fn(),
  });

  const ctx = {
    save: vi.fn(() => calls.push('save')),
    restore: vi.fn(() => calls.push('restore')),
    fillRect: vi.fn(() => calls.push('fillRect')),
    fillText: vi.fn(() => calls.push('fillText')),
    strokeText: vi.fn(() => calls.push('strokeText')),
    fill: vi.fn(() => calls.push('fill')),
    stroke: vi.fn(() => calls.push('stroke')),
    beginPath: vi.fn(() => calls.push('beginPath')),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    arc: vi.fn(() => calls.push('arc')),
    clip: vi.fn(() => calls.push('clip')),
    translate: vi.fn(),
    scale: vi.fn(),
    drawImage: vi.fn(() => calls.push('drawImage')),
    measureText: vi.fn((text: string) => ({ width: (text || '').length * 10 })),
    createLinearGradient: vi.fn(() => createGradient()),
    createRadialGradient: vi.fn(() => createGradient()),
    clearRect: vi.fn(),
    strokeRect: vi.fn(() => calls.push('strokeRect')),
    roundRect: vi.fn(),
    getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(100) })),
    set fillStyle(val: string) { state.fillStyle = val; },
    get fillStyle() { return state.fillStyle as string; },
    set strokeStyle(val: string) { state.strokeStyle = val; },
    get strokeStyle() { return state.strokeStyle as string; },
    set font(val: string) { state.font = val; },
    get font() { return state.font as string; },
    set textAlign(val: string) { state.textAlign = val; },
    get textAlign() { return state.textAlign as string; },
    set textBaseline(val: string) { state.textBaseline = val; },
    get textBaseline() { return state.textBaseline as string; },
    set globalAlpha(val: number) { state.globalAlpha = val; },
    get globalAlpha() { return state.globalAlpha as number; },
    set lineWidth(val: number) { state.lineWidth = val; },
    get lineWidth() { return state.lineWidth as number; },
    set shadowColor(val: string) { state.shadowColor = val; },
    get shadowColor() { return state.shadowColor as string; },
    set shadowBlur(val: number) { state.shadowBlur = val; },
    get shadowBlur() { return state.shadowBlur as number; },
    set shadowOffsetX(val: number) { state.shadowOffsetX = val; },
    get shadowOffsetX() { return state.shadowOffsetX as number; },
    set shadowOffsetY(val: number) { state.shadowOffsetY = val; },
    get shadowOffsetY() { return state.shadowOffsetY as number; },
    set filter(val: string) { state.filter = val; },
    get filter() { return state.filter as string; },
    set letterSpacing(val: string) { state.letterSpacing = val; },
    get letterSpacing() { return state.letterSpacing as string; },
    _calls: calls,
    _state: state,
  };
  return ctx;
}

describe('frame-renderer', () => {
  let drawFrame: (ctx: any, seg: any, asset: any, img: any, progress: number, project: any, globalProgress: number, segmentIndex: number) => Promise<void>;
  let detectAspectRatioFromTopic: (topic: string) => string;
  let RESOLUTION_PRESETS: Record<string, { width: number; height: number; fps: number; videoBitsPerSecond: number }>;
  let ASPECT_RATIOS: Record<string, { width: number; height: number; label: string }>;

  beforeEach(async () => {
    vi.resetModules();

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
    drawFrame = mod.drawFrame;
    detectAspectRatioFromTopic = mod.detectAspectRatioFromTopic;
    RESOLUTION_PRESETS = mod.RESOLUTION_PRESETS;
    ASPECT_RATIOS = mod.ASPECT_RATIOS;
  });

  afterEach(() => {
    vi.doUnmock('fs');
    vi.doUnmock('child_process');
  });

  describe('drawFrame', () => {
    function makeSeg(type: string) {
      return {
        id: `seg-${type}`,
        type,
        title: 'Test Segment',
        narration: 'This is a test narration for the segment.',
        duration: 5,
        visualNote: '',
      };
    }

    function makeProject() {
      return {
        title: 'Test Project',
        topic: 'Testing',
        script: [],
        media: [],
        exportSettings: {},
      };
    }

    it('draws procedural background for intro segment', async () => {
      const ctx = makeMockCtx();
      const seg = makeSeg('intro');
      await drawFrame(ctx, seg, null, null, 0.5, makeProject(), 0.5, 0);
      expect(ctx.fillRect).toHaveBeenCalled();
      expect(ctx._calls).toContain('fillRect');
    });

    it('draws procedural background for section segment', async () => {
      const ctx = makeMockCtx();
      const seg = makeSeg('section');
      await drawFrame(ctx, seg, null, null, 0.5, makeProject(), 0.5, 0);
      expect(ctx.fillRect).toHaveBeenCalled();
    });

    it('draws procedural background for outro segment', async () => {
      const ctx = makeMockCtx();
      const seg = makeSeg('outro');
      await drawFrame(ctx, seg, null, null, 0.5, makeProject(), 0.5, 0);
      expect(ctx.fillRect).toHaveBeenCalled();
    });

    it('draws image when img is provided', async () => {
      const ctx = makeMockCtx();
      const seg = makeSeg('section');
      const img = { width: 1920, height: 1080 };
      await drawFrame(ctx, seg, { id: 'a1', url: 'https://example.com/img.jpg', type: 'image' }, img, 0.5, makeProject(), 0.5, 0);
      expect(ctx.drawImage).toHaveBeenCalled();
    });

    it('applies letterbox bars', async () => {
      const ctx = makeMockCtx();
      const seg = makeSeg('section');
      await drawFrame(ctx, seg, null, null, 0.5, makeProject(), 0.5, 0);
      const fillRectCalls = (ctx.fillRect as ReturnType<typeof vi.fn>).mock.calls;
      expect(fillRectCalls.length).toBeGreaterThanOrEqual(2);
    });

    it('draws segment title text', async () => {
      const ctx = makeMockCtx();
      const seg = makeSeg('section');
      await drawFrame(ctx, seg, null, null, 0.5, makeProject(), 0.5, 0);
      expect(ctx.fillText).toHaveBeenCalled();
      const texts = (ctx.fillText as ReturnType<typeof vi.fn>).mock.calls.map((c: unknown[]) => c[0]);
      expect(texts.some((t: unknown) => typeof t === 'string' && t.includes('Test Segment'))).toBe(true);
    });

    it('draws progress bar when globalProgress is provided', async () => {
      const ctx = makeMockCtx();
      const seg = makeSeg('section');
      await drawFrame(ctx, seg, null, null, 0.5, makeProject(), 0.5, 0);
      const fillRectCalls = (ctx.fillRect as ReturnType<typeof vi.fn>).mock.calls;
      // Progress bar is a thin rect at the bottom
      const progressBarCalls = fillRectCalls.filter((c: unknown[]) => {
        const height = c[3] as number;
        return height === 6;
      });
      expect(progressBarCalls.length).toBeGreaterThanOrEqual(1);
    });

    it('draws vignette overlay', async () => {
      const ctx = makeMockCtx();
      const seg = makeSeg('section');
      await drawFrame(ctx, seg, null, null, 0.5, makeProject(), 0.5, 0);
      expect(ctx.fillRect).toHaveBeenCalled();
    });
  });

  describe('detectAspectRatioFromTopic', () => {
    it('detects 9:16 for shorts topics', () => {
      expect(detectAspectRatioFromTopic('My Shorts Video')).toBe('9:16');
      expect(detectAspectRatioFromTopic('TikTok compilation')).toBe('9:16');
    });

    it('defaults to 16:9 for regular topics', () => {
      expect(detectAspectRatioFromTopic('Tech news update')).toBe('16:9');
      expect(detectAspectRatioFromTopic('')).toBe('16:9');
      expect(detectAspectRatioFromTopic(undefined as unknown as string)).toBe('16:9');
    });
  });

  describe('RESOLUTION_PRESETS', () => {
    it('contains 720p preset', () => {
      expect(RESOLUTION_PRESETS['720p']).toEqual({
        width: 1280,
        height: 720,
        fps: 24,
        videoBitsPerSecond: 6_000_000,
      });
    });

    it('contains 1080p preset', () => {
      expect(RESOLUTION_PRESETS['1080p']).toEqual({
        width: 1920,
        height: 1080,
        fps: 24,
        videoBitsPerSecond: 12_000_000,
      });
    });

    it('contains 4K preset', () => {
      expect(RESOLUTION_PRESETS['4K']).toEqual({
        width: 3840,
        height: 2160,
        fps: 24,
        videoBitsPerSecond: 20_000_000,
      });
    });
  });

  describe('ASPECT_RATIOS', () => {
    it('contains YouTube 16:9', () => {
      expect(ASPECT_RATIOS['16:9']).toEqual({
        width: 1920,
        height: 1080,
        label: 'YouTube',
      });
    });

    it('contains Shorts/TikTok 9:16', () => {
      expect(ASPECT_RATIOS['9:16']).toEqual({
        width: 1080,
        height: 1920,
        label: 'Shorts/TikTok',
      });
    });

    it('contains Instagram 1:1', () => {
      expect(ASPECT_RATIOS['1:1']).toEqual({
        width: 1080,
        height: 1080,
        label: 'Instagram',
      });
    });

    it('contains Facebook 4:5', () => {
      expect(ASPECT_RATIOS['4:5']).toEqual({
        width: 1080,
        height: 1350,
        label: 'Facebook',
      });
    });
  });
});
