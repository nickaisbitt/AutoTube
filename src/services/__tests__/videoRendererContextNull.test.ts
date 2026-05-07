import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { cleanupRenderResources } from '../renderer';

/**
 * Tests for Bug 11 fix: Canvas context null error should not be obscured
 * by secondary errors in the finally cleanup block.
 *
 * Validates: Requirements 2.15, 3.15
 */

// Store originals for restoration
let originalCreateElement: typeof document.createElement;

beforeEach(() => {
  originalCreateElement = document.createElement.bind(document);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Canvas context null error handling (Bug 11)', () => {
  it('throws a clear error when getContext("2d") returns null, without secondary cleanup errors', async () => {
    // Mock document.createElement to return canvases whose getContext returns null
    const mockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue(null),
      captureStream: vi.fn(),
    };

    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') {
        // Return a fresh mock each time so width/height assignments work
        return {
          width: 0,
          height: 0,
          getContext: vi.fn().mockReturnValue(null),
          captureStream: vi.fn(),
        } as unknown as HTMLCanvasElement;
      }
      return originalCreateElement(tag);
    });

    // Mock fetch for the server render attempt (returns failure so we fall through to browser render)
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('No server'));

    // Import renderVideoToBlob dynamically to use the mocked environment
    const { renderVideoToBlob } = await import('../renderer');

    const project = {
      id: 'test-project',
      topic: 'Test',
      style: 'business_insider' as const,
      targetDuration: 3,
      script: [
        {
          id: 'seg-1',
          type: 'section' as const,
          title: 'Test Segment',
          narration: 'Test narration.',
          duration: 5,
          keywords: [],
        },
      ],
      media: [],
      narrationAudio: [],
      status: 'script' as const,
    };

    // The function should throw a clear error about the canvas context
    // and NOT throw a secondary error from the cleanup path
    let thrownError: Error | null = null;
    try {
      await renderVideoToBlob(project as any, { quality: 'draft' });
    } catch (err) {
      thrownError = err as Error;
    }

    expect(thrownError).not.toBeNull();
    expect(thrownError!.message).toContain('Canvas 2D context unavailable');
    // The error message should be clear and descriptive, not obscured
    expect(thrownError!.message).not.toContain('Cannot read properties of null');
    expect(thrownError!.message).not.toContain('undefined');
  });

  it('cleanupRenderResources handles all-null canvases without throwing', () => {
    // This verifies the finally block won't generate secondary errors
    // when canvas/context are null (e.g., when getContext returned null)
    expect(() => {
      cleanupRenderResources(null, null, null, null, [], []);
    }).not.toThrow();
  });

  it('cleanupRenderResources handles a mix of null and valid canvases', () => {
    // Simulates the case where the main canvas was created but offscreen wasn't
    const canvas = { width: 1280, height: 720 } as HTMLCanvasElement;
    expect(() => {
      cleanupRenderResources(canvas, null, null, null, [], []);
    }).not.toThrow();
    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);
  });

  it('cleanupRenderResources cleans up blob URLs even when canvases are null', () => {
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...globalThis.URL, revokeObjectURL });

    const blobUrls = ['blob:http://localhost/abc', 'blob:http://localhost/def'];
    cleanupRenderResources(null, null, null, null, blobUrls, []);

    expect(revokeObjectURL).toHaveBeenCalledTimes(2);
    expect(blobUrls).toHaveLength(0);
  });
});
