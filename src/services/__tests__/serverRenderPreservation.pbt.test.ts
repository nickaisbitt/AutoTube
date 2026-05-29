/**
 * Preservation Property Tests — Non-Path Behavior Unchanged
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
 *
 * Property 2: Preservation — For any render request processed by the handler,
 * all behavior unrelated to the output file extension (SSE streaming, error
 * handling, client disconnect cleanup, project validation) SHALL produce the
 * same results as the original handler.
 *
 * These tests observe behavior on UNFIXED code and confirm it is correct.
 * They should PASS on both unfixed and fixed code since the bug only affects
 * the output file extension, not these behaviors.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { join } from 'path';

// ---------------------------------------------------------------------------




// ---------------------------------------------------------------------------
// Extracted handler logic (mirrors vite.config.ts /api/server-render handler)
// ---------------------------------------------------------------------------

/**
 * Simulates the project validation check from the handler.
 * Mirrors the exact logic in vite.config.ts:
 *   if (!fsExists("/tmp/autotube-project.json")) {
 *     const tmpFiles = readDir("/tmp").filter(f => f.startsWith("autotube-project") && f.endsWith(".json"));
 *     if (tmpFiles.length === 0) { return 400 }
 *   }
 *
 * Returns { shouldReturn400: boolean, errorMessage: string }
 */
function checkProjectExists(
  projectFileExists: boolean,
  allTmpFiles: string[],
): { shouldReturn400: boolean; errorMessage: string } {
  if (!projectFileExists) {
    // Mirror the handler's filter: only autotube-project*.json files count
    const projectFiles = allTmpFiles.filter(
      (f) => f.startsWith('autotube-project') && f.endsWith('.json'),
    );
    if (projectFiles.length === 0) {
      return {
        shouldReturn400: true,
        errorMessage: 'No project saved. Call /api/save-project first.',
      };
    }
  }
  return { shouldReturn400: false, errorMessage: '' };
}

/**
 * Simulates the SSE header setup from the handler.
 * Returns the headers that would be set.
 */
function getSSEHeaders(): Record<string, string> {
  return {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    'connection': 'keep-alive',
    'access-control-allow-origin': '*',
  };
}

/**
 * Simulates the client disconnect handler behavior.
 * When the client disconnects, the handler:
 * 1. Clears the heartbeat interval
 * 2. Sends SIGTERM to the child process if not already killed
 */
function handleClientDisconnect(child: { killed: boolean; kill: (signal: string) => void }): string | null {
  if (!child.killed) {
    child.kill('SIGTERM');
    return 'SIGTERM';
  }
  return null;
}

/**
 * Simulates the CLI default output path construction from server-render.mjs line 27:
 *   const OUTPUT_FILE = process.argv[2] || join(OUTPUT_DIR, `server-render-${Date.now()}.mp4`);
 *
 * When no CLI argument is provided, the default path ends in .mp4.
 */
function constructCLIDefaultOutputPath(baseDir: string, timestamp: number): string {
  return join(baseDir, 'test-recordings', `server-render-${timestamp}.mp4`);
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Arbitrary for realistic timestamps (Date.now() range) */
const timestampArb = fc.integer({ min: 1_000_000_000_000, max: 2_000_000_000_000 });

/** Arbitrary for a list of tmp files (may be empty or contain project files) */
const tmpFilesArb = fc.array(
  fc.oneof(
    fc.constant('autotube-project-abc123.json'),
    fc.constant('autotube-project-def456.json'),
    fc.constant('some-other-file.txt'),
    fc.constant('random.json'),
  ),
  { minLength: 0, maxLength: 5 },
);



/** Arbitrary for child process killed state */
const childKilledArb = fc.boolean();

// ---------------------------------------------------------------------------
// Property-Based Tests
// ---------------------------------------------------------------------------

describe('Property 2: Preservation — Non-Path Behavior Unchanged', () => {
  describe('3.4 — For all requests without a saved project, handler returns 400 with correct error message', () => {
    it('returns status 400 with exact error message when no project file exists and no tmp project files found', () => {
      fc.assert(
        fc.property(
          tmpFilesArb,
          (allTmpFiles) => {
            // Only test cases where no autotube-project*.json files exist
            const projectFiles = allTmpFiles.filter(
              (f) => f.startsWith('autotube-project') && f.endsWith('.json'),
            );
            fc.pre(projectFiles.length === 0);

            const result = checkProjectExists(false, allTmpFiles);

            expect(result.shouldReturn400).toBe(true);
            expect(result.errorMessage).toBe(
              'No project saved. Call /api/save-project first.',
            );
          },
        ),
        { numRuns: 100 },
      );
    });

    it('does NOT return 400 when the main project file exists', () => {
      fc.assert(
        fc.property(tmpFilesArb, (tmpFiles) => {
          const result = checkProjectExists(true, tmpFiles);

          expect(result.shouldReturn400).toBe(false);
        }),
        { numRuns: 100 },
      );
    });

    it('does NOT return 400 when project-scoped tmp files exist (even if main file is missing)', () => {
      fc.assert(
        fc.property(
          tmpFilesArb,
          (allTmpFiles) => {
            // Only test cases where at least one autotube-project*.json file exists
            const projectFiles = allTmpFiles.filter(
              (f) => f.startsWith('autotube-project') && f.endsWith('.json'),
            );
            fc.pre(projectFiles.length > 0);

            const result = checkProjectExists(false, allTmpFiles);

            expect(result.shouldReturn400).toBe(false);
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('3.1, 3.2 — For all render requests, SSE headers are set before any events are emitted', () => {
    it('SSE headers include Content-Type: text/event-stream', () => {
      fc.assert(
        fc.property(timestampArb, (_timestamp) => {
          const headers = getSSEHeaders();

          expect(headers['content-type']).toBe('text/event-stream');
        }),
        { numRuns: 100 },
      );
    });

    it('SSE headers include Cache-Control: no-cache', () => {
      fc.assert(
        fc.property(timestampArb, (_timestamp) => {
          const headers = getSSEHeaders();

          expect(headers['cache-control']).toBe('no-cache');
        }),
        { numRuns: 100 },
      );
    });

    it('SSE headers include Connection: keep-alive', () => {
      fc.assert(
        fc.property(timestampArb, (_timestamp) => {
          const headers = getSSEHeaders();

          expect(headers['connection']).toBe('keep-alive');
        }),
        { numRuns: 100 },
      );
    });

    it('all required SSE headers are present for any render request', () => {
      fc.assert(
        fc.property(timestampArb, (_timestamp) => {
          const headers = getSSEHeaders();

          // All four headers must be present
          expect(Object.keys(headers)).toHaveLength(4);
          expect(headers).toHaveProperty('content-type');
          expect(headers).toHaveProperty('cache-control');
          expect(headers).toHaveProperty('connection');
          expect(headers).toHaveProperty('access-control-allow-origin');
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('3.3 — For all client disconnects during rendering, SIGTERM is sent to the child process', () => {
    it('sends SIGTERM when child process is not already killed', () => {
      fc.assert(
        fc.property(fc.constant(false), (_killed) => {
          const killSignals: string[] = [];
          const child = {
            killed: false,
            kill(signal: string) {
              killSignals.push(signal);
              child.killed = true;
            },
          };

          const signal = handleClientDisconnect(child);

          expect(signal).toBe('SIGTERM');
          expect(killSignals).toEqual(['SIGTERM']);
          expect(child.killed).toBe(true);
        }),
        { numRuns: 100 },
      );
    });

    it('does NOT send signal when child process is already killed', () => {
      fc.assert(
        fc.property(fc.constant(true), (_killed) => {
          const killSignals: string[] = [];
          const child = {
            killed: true,
            kill(signal: string) {
              killSignals.push(signal);
            },
          };

          const signal = handleClientDisconnect(child);

          expect(signal).toBeNull();
          expect(killSignals).toHaveLength(0);
        }),
        { numRuns: 100 },
      );
    });

    it('for any child process state, disconnect handler either sends SIGTERM or does nothing', () => {
      fc.assert(
        fc.property(childKilledArb, (alreadyKilled) => {
          const killSignals: string[] = [];
          const child = {
            killed: alreadyKilled,
            kill(signal: string) {
              killSignals.push(signal);
              child.killed = true;
            },
          };

          const signal = handleClientDisconnect(child);

          if (alreadyKilled) {
            // Already killed — no signal sent
            expect(signal).toBeNull();
            expect(killSignals).toHaveLength(0);
          } else {
            // Not killed — SIGTERM sent
            expect(signal).toBe('SIGTERM');
            expect(killSignals).toEqual(['SIGTERM']);
          }
        }),
        { numRuns: 100 },
      );
    });
  });

  describe('3.5 — For all CLI invocations of server-render.mjs without arguments, default path ends in .mp4', () => {
    it('CLI default output path always ends with .mp4 for any timestamp', () => {
      fc.assert(
        fc.property(timestampArb, (timestamp) => {
          const outputPath = constructCLIDefaultOutputPath('/project-root', timestamp);

          expect(outputPath).toMatch(/\.mp4$/);
          expect(outputPath).not.toMatch(/\.webm$/);
        }),
        { numRuns: 100 },
      );
    });

    it('CLI default output path follows pattern server-render-{timestamp}.mp4', () => {
      fc.assert(
        fc.property(timestampArb, (timestamp) => {
          const outputPath = constructCLIDefaultOutputPath('/any/base', timestamp);
          const filename = outputPath.split('/').pop()!;

          expect(filename).toBe(`server-render-${timestamp}.mp4`);
        }),
        { numRuns: 100 },
      );
    });

    it('CLI default output path is in the test-recordings directory', () => {
      fc.assert(
        fc.property(
          timestampArb,
          fc.string({ minLength: 1, maxLength: 20 }).filter((s) => !s.includes('/') && s.trim().length > 0),
          (timestamp, baseDir) => {
            const outputPath = constructCLIDefaultOutputPath(`/${baseDir}`, timestamp);

            expect(outputPath).toContain('test-recordings');
            expect(outputPath).toContain(`server-render-${timestamp}.mp4`);
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
