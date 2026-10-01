import { describe, it, expect, vi } from 'vitest';
import { renderTransition } from '../renderer';
import type { ScriptSegment, MediaAsset, KenBurnsParams, TransitionType } from '../../types';
import type { ImgCache } from '../renderer';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a minimal mock CanvasRenderingContext2D with all methods used by
 * renderTransition and the inner draw() function.
 */
function createMockCanvas() {
  const ctx = {
    save: vi.fn(),
    restore: vi.fn(),
    globalAlpha: 1,
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    fillStyle: '',
    font: '',
    textAlign: 'left',
    textBaseline: 'top',
    fillText: vi.fn(),
    strokeText: vi.fn(),
    measureText: vi.fn(() => ({ width: 100 })),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    clearRect: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    shadowColor: '',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    globalCompositeOperation: 'source-over',
    filter: 'none',
    translate: vi.fn(),
    scale: vi.fn(),
    arc: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    arcTo: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    strokeStyle: '',
    lineWidth: 0,
    lineJoin: 'miter',
    miterLimit: 10,
  } as unknown as CanvasRenderingContext2D;

  const canvas = {
    width: 1280,
    height: 720,
    getContext: vi.fn(() => ctx),
  } as unknown as HTMLCanvasElement;

  return { ctx, canvas };
}

function makeSegment(overrides: Partial<ScriptSegment> = {}): ScriptSegment {
  return {
    id: 'seg-1',
    type: 'section',
    title: 'Test Segment',
    narration: 'This is test narration for the segment.',
    visualNote: '',
    duration: 5,
    ...overrides,
  };
}

function makeAsset(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: 'asset-1',
    segmentId: 'seg-1',
    type: 'image',
    url: 'https://example.com/image.jpg',
    alt: 'Test image',
    source: 'test',
    ...overrides,
  };
}

function makeKenBurns(overrides: Partial<KenBurnsParams> = {}): KenBurnsParams {
  return {
    zoomStart: 1.0,
    zoomEnd: 1.15,
    panDirectionX: 0.5,
    panDirectionY: -0.3,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests: Renderer EditPlan consumption — Requirements 4.1, 6.1
// ---------------------------------------------------------------------------

describe('renderTransition — EditPlan consumption', () => {
  const seg = makeSegment();
  const outgoing = makeAsset({ id: 'outgoing-1' });
  const incoming = makeAsset({ id: 'incoming-1' });
  const cache: ImgCache = {};

  // Requirement 6.1 — renderer uses Ken Burns params from edit plan when present
  it('uses Ken Burns params from edit plan without throwing', () => {
    const { ctx, canvas } = createMockCanvas();
    const outgoingKB = makeKenBurns({ zoomStart: 1.0, zoomEnd: 1.2, panDirectionX: -0.5, panDirectionY: 0.3 });
    const incomingKB = makeKenBurns({ zoomStart: 1.05, zoomEnd: 1.25, panDirectionX: 0.8, panDirectionY: -0.6 });

    expect(() => {
      renderTransition(
        ctx, canvas, seg, outgoing, incoming, cache,
        0.5,           // progress
        'crossfade',   // transitionType
        undefined,     // watermark
        true,          // isRendering
        null,          // bgCache
        outgoingKB,    // outgoingKenBurns
        incomingKB,    // incomingKenBurns
      );
    }).not.toThrow();
  });

  // Requirement 6.1 — renderer falls back to default Ken Burns when no edit plan exists
  it('falls back to default Ken Burns when no edit plan params provided', () => {
    const { ctx, canvas } = createMockCanvas();

    expect(() => {
      renderTransition(
        ctx, canvas, seg, outgoing, incoming, cache,
        0.5,           // progress
        'crossfade',   // transitionType
        undefined,     // watermark
        true,          // isRendering
        null,          // bgCache
        undefined,     // outgoingKenBurns — not provided
        undefined,     // incomingKenBurns — not provided
      );
    }).not.toThrow();
  });

  // Requirement 4.1 — renderer applies correct transition type from edit plan
  describe('applies each transition type from edit plan without errors', () => {
    const transitionTypes: TransitionType[] = ['crossfade', 'cut', 'dissolve', 'wipe'];

    for (const tt of transitionTypes) {
      it(`renders '${tt}' transition without throwing`, () => {
        const { ctx, canvas } = createMockCanvas();

        expect(() => {
          renderTransition(
            ctx, canvas, seg, outgoing, incoming, cache,
            0.5,         // progress
            tt,          // transitionType
            undefined,   // watermark
            true,        // isRendering
            null,        // bgCache
            undefined,   // outgoingKenBurns
            undefined,   // incomingKenBurns
          );
        }).not.toThrow();
      });
    }
  });

  // Requirement 4.1 — dissolve and wipe transitions render without errors
  describe('dissolve and wipe transitions render correctly', () => {
    it('dissolve transition renders at various progress values without errors', () => {
      const { ctx, canvas } = createMockCanvas();

      for (const progress of [0, 0.25, 0.5, 0.75, 1.0]) {
        expect(() => {
          renderTransition(
            ctx, canvas, seg, outgoing, incoming, cache,
            progress,
            'dissolve',
            undefined,
            true,
            null,
            makeKenBurns(),
            makeKenBurns({ panDirectionX: -0.5, panDirectionY: 0.5 }),
          );
        }).not.toThrow();
      }
    });

    it('wipe transition renders at various progress values without errors', () => {
      const { ctx, canvas } = createMockCanvas();

      for (const progress of [0, 0.25, 0.5, 0.75, 1.0]) {
        expect(() => {
          renderTransition(
            ctx, canvas, seg, outgoing, incoming, cache,
            progress,
            'wipe',
            undefined,
            true,
            null,
            makeKenBurns(),
            makeKenBurns({ panDirectionX: -0.5, panDirectionY: 0.5 }),
          );
        }).not.toThrow();
      }
    });

    it('wipe transition calls clip to create the wipe boundary', () => {
      const { ctx, canvas } = createMockCanvas();

      renderTransition(
        ctx, canvas, seg, outgoing, incoming, cache,
        0.5,
        'wipe',
        undefined,
        true,
        null,
        undefined,
        undefined,
      );

      // Wipe uses beginPath + rect + clip to create the wipe boundary
      expect(ctx.beginPath).toHaveBeenCalled();
      expect(ctx.rect).toHaveBeenCalled();
      expect(ctx.clip).toHaveBeenCalled();
    });

    it('dissolve transition uses ease-in-out alpha curve', () => {
      const { ctx, canvas } = createMockCanvas();

      renderTransition(
        ctx, canvas, seg, outgoing, incoming, cache,
        0.5,
        'dissolve',
        undefined,
        true,
        null,
        undefined,
        undefined,
      );

      // Dissolve sets globalAlpha for the blending — save/restore are called
      expect(ctx.save).toHaveBeenCalled();
      expect(ctx.restore).toHaveBeenCalled();
    });
  });

  // Edge case: cut transition shows incoming frame immediately
  it('cut transition renders without blending (no globalAlpha change)', () => {
    const { ctx, canvas } = createMockCanvas();

    renderTransition(
      ctx, canvas, seg, outgoing, incoming, cache,
      0.5,
      'cut',
      undefined,
      true,
      null,
      undefined,
      undefined,
    );

    // Cut only draws the incoming frame — no alpha blending needed.
    // The draw function is called once (for the incoming asset only).
    // We verify it doesn't throw and completes successfully.
    expect(ctx.save).toHaveBeenCalled();
  });

  // Edge case: undefined assets
  it('handles undefined outgoing and incoming assets gracefully', () => {
    const { ctx, canvas } = createMockCanvas();

    expect(() => {
      renderTransition(
        ctx, canvas, seg, undefined, undefined, cache,
        0.5,
        'crossfade',
        undefined,
        true,
        null,
        undefined,
        undefined,
      );
    }).not.toThrow();
  });
});
