import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  computeKenBurnsTransform,
  hexToRgba,
  drawLetterboxBars,
  drawVignette,
  drawProgressBar,
  wrapText,
  roundRect,
  computeBgMusicVolume,
  computeCrossfadeAlpha,
  computeActiveAssetIndex,
  computeSafeZone,
  computePacingScore,
  assignPurposeTag,
  hasStatisticalContent,
  assignSceneLayouts,
} from '../renderingShared';
import type { RenderContext2D } from '../renderingShared';

function makeMockCtx(): RenderContext2D {
  return {
    fillStyle: '#000000',
    font: '16px sans-serif',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    globalAlpha: 1,
    filter: 'none',
    shadowColor: 'transparent',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    fillRect: () => {},
    fillText: () => {},
    measureText: () => ({ width: 0 }),
    beginPath: () => {},
    arc: () => {},
    moveTo: () => {},
    lineTo: () => {},
    closePath: () => {},
    fill: () => {},
    stroke: () => {},
    rect: () => {},
    clip: () => {},
    save: () => {},
    restore: () => {},
    translate: () => {},
    scale: () => {},
    drawImage: () => {},
    createRadialGradient: () =>
      ({ addColorStop: () => {} }) as unknown as CanvasGradient,
    createLinearGradient: () =>
      ({ addColorStop: () => {} }) as unknown as CanvasGradient,
    arcTo: () => {},
  };
}

describe('drawLetterboxBars does not throw for any valid inputs', () => {
  it('with valid width, height, and segment type', () => {
    const ctx = makeMockCtx();
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 4000 }),
        fc.integer({ min: 100, max: 4000 }),
        fc.string(),
        (w, h, segType) => {
          expect(() => drawLetterboxBars(ctx, w, h, segType)).not.toThrow();
        },
      ),
      { numRuns: 50 },
    );
  });
});

describe('drawVignette does not throw for any valid dimensions', () => {
  it('with valid width and height', () => {
    const ctx = makeMockCtx();
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 4000 }),
        fc.integer({ min: 100, max: 4000 }),
        (w, h) => {
          expect(() => drawVignette(ctx, w, h)).not.toThrow();
        },
      ),
      { numRuns: 50 },
    );
  });
});

describe('wrapText does not throw for valid text and dimensions', () => {
  it('with valid text, position, and maxWidth', () => {
    const ctx = makeMockCtx();
    fc.assert(
      fc.property(
        fc.string({ maxLength: 200 }),
        fc.integer({ min: 1, max: 4000 }),
        fc.integer({ min: 1, max: 4000 }),
        fc.integer({ min: 10, max: 100 }),
        (text, x, y, maxW) => {
          expect(() => wrapText(ctx, text, x, y, maxW, 20)).not.toThrow();
        },
      ),
      { numRuns: 50 },
    );
  });
});

describe('roundRect does not throw for valid dimensions', () => {
  it('with valid x, y, w, h, r', () => {
    const ctx = makeMockCtx();
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 4000 }),
        fc.integer({ min: 0, max: 4000 }),
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 0, max: 50 }),
        (x, y, w, h, r) => {
          expect(() => roundRect(ctx, x, y, w, h, r)).not.toThrow();
        },
      ),
      { numRuns: 50 },
    );
  });
});

describe('Ken Burns transform bounded output', () => {
  it('zoom is always >= 1.0', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 1, noNaN: true }),
        fc.integer({ min: 100, max: 4000 }),
        fc.integer({ min: 100, max: 4000 }),
        fc.integer({ min: 640, max: 3840 }),
        fc.integer({ min: 360, max: 2160 }),
        (progress, imgW, imgH, canvasW, canvasH) => {
          const result = computeKenBurnsTransform(progress, imgW, imgH, canvasW, canvasH);
          expect(result.zoom).toBeGreaterThanOrEqual(1.0);
        },
      ),
      { numRuns: 50 },
    );
  });

  it('panX and panY are bounded by 20px', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 1, noNaN: true }),
        fc.integer({ min: 100, max: 4000 }),
        fc.integer({ min: 100, max: 4000 }),
        fc.integer({ min: 640, max: 3840 }),
        fc.integer({ min: 360, max: 2160 }),
        (progress, imgW, imgH, canvasW, canvasH) => {
          const result = computeKenBurnsTransform(progress, imgW, imgH, canvasW, canvasH);
          expect(Math.abs(result.panX)).toBeLessThan(20);
          expect(Math.abs(result.panY)).toBeLessThan(20);
        },
      ),
      { numRuns: 50 },
    );
  });

  it('scale, dw, dh are always positive', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 1, noNaN: true }),
        fc.integer({ min: 100, max: 4000 }),
        fc.integer({ min: 100, max: 4000 }),
        fc.integer({ min: 640, max: 3840 }),
        fc.integer({ min: 360, max: 2160 }),
        (progress, imgW, imgH, canvasW, canvasH) => {
          const result = computeKenBurnsTransform(progress, imgW, imgH, canvasW, canvasH);
          expect(result.scale).toBeGreaterThan(0);
          expect(result.dw).toBeGreaterThan(0);
          expect(result.dh).toBeGreaterThan(0);
        },
      ),
      { numRuns: 50 },
    );
  });
});

describe('hexToRgba unit tests', () => {
  it('converts 6-char hex correctly', () => {
    expect(hexToRgba('#ff0000', 0.5)).toBe('rgba(255, 0, 0, 0.5)');
  });

  it('converts 3-char hex correctly', () => {
    expect(hexToRgba('#f00', 0.75)).toBe('rgba(255, 0, 0, 0.75)');
  });

  it('converts lowercase hex correctly', () => {
    expect(hexToRgba('#aabbcc', 0.3)).toBe('rgba(170, 187, 204, 0.3)');
  });

  it('handles hex without hash prefix', () => {
    expect(hexToRgba('00ff00', 0.5)).toBe('rgba(0, 255, 0, 0.5)');
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

describe('computeCrossfadeAlpha', () => {
  it('returns 1.0 when totalTransitionFrames is 0', () => {
    expect(computeCrossfadeAlpha(5, 0)).toBe(1.0);
  });

  it('returns 0.0 at start of transition', () => {
    expect(computeCrossfadeAlpha(0, 10)).toBe(0.0);
  });

  it('returns 1.0 at end of transition', () => {
    expect(computeCrossfadeAlpha(10, 10)).toBe(1.0);
  });

  it('returns 0.5 at midpoint', () => {
    expect(computeCrossfadeAlpha(5, 10)).toBe(0.5);
  });

  it('clamps negative values to 0', () => {
    expect(computeCrossfadeAlpha(-5, 10)).toBe(0.0);
  });

  it('clamps values over 1 to 1', () => {
    expect(computeCrossfadeAlpha(15, 10)).toBe(1.0);
  });
});

describe('computeActiveAssetIndex', () => {
  it('returns 0 when assetCount <= 1', () => {
    expect(computeActiveAssetIndex(10, 0)).toBe(0);
    expect(computeActiveAssetIndex(10, 1)).toBe(0);
  });

  it('returns 0 when intervalSec <= 0', () => {
    expect(computeActiveAssetIndex(10, 3, 0)).toBe(0);
  });

  it('alternates correctly at 4-second intervals', () => {
    expect(computeActiveAssetIndex(0, 3)).toBe(0);
    expect(computeActiveAssetIndex(4, 3)).toBe(1);
    expect(computeActiveAssetIndex(8, 3)).toBe(2);
    expect(computeActiveAssetIndex(12, 3)).toBe(0);
  });
});

describe('computeSafeZone', () => {
  it('scales proportionally from 1080p reference', () => {
    const zone = computeSafeZone(1920, 1080);
    expect(zone.top).toBe(40);
    expect(zone.bottom).toBe(60);
    expect(zone.left).toBe(96);
    expect(zone.right).toBe(96);
  });

  it('scales down for 720p', () => {
    const zone = computeSafeZone(1280, 720);
    expect(zone.top).toBeLessThan(40);
    expect(zone.bottom).toBeLessThan(60);
  });
});

describe('computePacingScore', () => {
  it('returns 3 for empty or null input', () => {
    expect(computePacingScore('')).toBe(3);
    expect(computePacingScore('   ')).toBe(3);
  });

  it('returns a number between 1 and 5', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 300 }), (text) => {
        const score = computePacingScore(text);
        expect(score).toBeGreaterThanOrEqual(1);
        expect(score).toBeLessThanOrEqual(5);
      }),
      { numRuns: 50 },
    );
  });
});

describe('assignPurposeTag', () => {
  it('maps transition type to transition_bridge', () => {
    expect(assignPurposeTag({ type: 'transition', narration: 'test', title: 't' })).toBe('transition_bridge');
  });

  it('maps outro type to conclusion', () => {
    expect(assignPurposeTag({ type: 'outro', narration: 'test', title: 't' })).toBe('conclusion');
  });

  it('returns stat_hook as default', () => {
    expect(assignPurposeTag({ type: 'section', narration: 'hello world', title: 't' })).toBe('stat_hook');
  });
});

describe('hasStatisticalContent', () => {
  it('detects dollar amounts', () => {
    expect(hasStatisticalContent('$100 million')).toBe(true);
  });

  it('detects percentages', () => {
    expect(hasStatisticalContent('increased by 45%')).toBe(true);
  });

  it('detects large numbers', () => {
    expect(hasStatisticalContent('in 2024')).toBe(true);
  });

  it('returns false for plain text', () => {
    expect(hasStatisticalContent('hello world')).toBe(false);
  });
});

describe('assignSceneLayouts', () => {
  it('returns one layout per segment', () => {
    const segments = [
      { type: 'intro' },
      { type: 'section' },
      { type: 'outro' },
    ];
    const layouts = assignSceneLayouts(segments);
    expect(layouts.length).toBe(3);
  });

  it('no consecutive duplicate layouts', () => {
    const segments = Array.from({ length: 20 }, (_, i) => ({
      type: i % 3 === 0 ? 'intro' : i % 3 === 1 ? 'section' : 'outro',
      purposeTag: 'stat_hook',
    }));
    const layouts = assignSceneLayouts(segments);
    for (let i = 1; i < layouts.length; i++) {
      expect(layouts[i]).not.toBe(layouts[i - 1]);
    }
  });
});