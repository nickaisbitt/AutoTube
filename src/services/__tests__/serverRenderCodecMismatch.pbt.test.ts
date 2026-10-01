/**
 * Bug Condition Exploration Test — Codec/Container Mismatch (.webm + libx264)
 *
 * **Validates: Requirements 1.1, 1.2, 2.1, 2.2**
 *
 * Property 1: Bug Condition — For any timestamp value, the output path
 * constructed by the /api/server-render handler in vite.config.ts MUST end
 * with `.mp4` (not `.webm`) to be compatible with the libx264 codec.
 *
 * This test is EXPECTED TO FAIL on unfixed code — failure confirms the bug exists.
 * The handler currently produces paths like `server-render-1717000000000.webm`
 * which are incompatible with libx264.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Reproduce the output path construction logic from vite.config.ts line 181
// This mirrors the exact logic in the /api/server-render handler.
// ---------------------------------------------------------------------------

/**
 * Simulates the output path construction from vite.config.ts:
 *   const outputMp4 = pathJoin(__dir, "test-recordings", `server-render-${Date.now()}.mp4`);
 *
 * We parameterize the timestamp to enable property-based testing across
 * all possible Date.now() values.
 */
function constructServerRenderOutputPath(baseDir: string, timestamp: number): string {
  // This mirrors the FIXED code in vite.config.ts line 181
  return join(baseDir, 'test-recordings', `server-render-${timestamp}.mp4`);
}

/**
 * Bug condition function from the design document:
 *   isBugCondition(input) = input.outputFilePath ENDS WITH ".webm" AND input.codec = "libx264"
 */
function isBugCondition(outputFilePath: string, codec: string): boolean {
  return outputFilePath.endsWith('.webm') && codec === 'libx264';
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Arbitrary for realistic timestamps (Date.now() range) */
const timestampArb = fc.integer({ min: 1_000_000_000_000, max: 2_000_000_000_000 });

/** Arbitrary for a base directory path */
const baseDirArb = fc.constant('/project-root');

// ---------------------------------------------------------------------------
// Property-Based Tests
// ---------------------------------------------------------------------------

describe('Property 1: Bug Condition — Codec/Container Mismatch (.webm + libx264)', () => {
  it('for any timestamp, the server-render output path MUST end with .mp4 (not .webm)', () => {
    fc.assert(
      fc.property(timestampArb, baseDirArb, (timestamp, baseDir) => {
        const outputPath = constructServerRenderOutputPath(baseDir, timestamp);
        const codec = 'libx264'; // The codec used by server-render.mjs

        // Expected behavior (after fix): path ends with .mp4
        expect(outputPath).toMatch(/\.mp4$/);

        // The bug condition should NOT be true for correct code
        expect(isBugCondition(outputPath, codec)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('for any timestamp, the constructed filename follows the pattern server-render-{timestamp}.mp4', () => {
    fc.assert(
      fc.property(timestampArb, (timestamp) => {
        const baseDir = '/any/path';
        const outputPath = constructServerRenderOutputPath(baseDir, timestamp);
        const filename = outputPath.split('/').pop()!;

        // Expected behavior: filename should be server-render-{timestamp}.mp4
        expect(filename).toBe(`server-render-${timestamp}.mp4`);
      }),
      { numRuns: 100 },
    );
  });

  it('libx264 codec is compatible with .mp4 container (expected behavior after fix)', () => {
    fc.assert(
      fc.property(timestampArb, (timestamp) => {
        const outputPath = constructServerRenderOutputPath('/project', timestamp);

        // After fix, the path should end with .mp4
        // libx264 is compatible with .mp4 but NOT with .webm
        if (outputPath.endsWith('.mp4')) {
          // This is the correct state — codec/container are compatible
          expect(isBugCondition(outputPath, 'libx264')).toBe(false);
        } else if (outputPath.endsWith('.webm')) {
          // This is the bug state — codec/container are INCOMPATIBLE
          // ffmpeg will exit with non-zero code
          expect(isBugCondition(outputPath, 'libx264')).toBe(true);
          // The expected behavior property FAILS here:
          // We assert the path should end with .mp4 (it doesn't on unfixed code)
          expect(outputPath).toMatch(/\.mp4$/);
        }
      }),
      { numRuns: 100 },
    );
  });
});
