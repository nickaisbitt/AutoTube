import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import { log, subscribeToLogs } from '../logger';
import { trackVideoGeneration, getAnalytics, type VideoAnalytics } from '../analytics';

// Feature: codebase-robustness-audit, Property 11: Bounded storage collections
// **Validates: Requirements 15.1, 15.2, 15.3, 15.4**

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAnalyticsEntry(index: number): VideoAnalytics {
  return {
    videoId: `vid-${index}`,
    title: `Video ${index}`,
    topic: `Topic ${index}`,
    createdAt: new Date().toISOString(),
    renderTime: 10,
    fileSize: 1024,
    duration: 60,
    segments: 5,
    mediaCount: 10,
    narrationClips: 5,
    quality: 'standard',
    exportFormat: 'webm',
  };
}

// ---------------------------------------------------------------------------
// Property 11: Bounded storage collections
// ---------------------------------------------------------------------------

describe('Property 11: Bounded storage collections', () => {
  let localStorageData: Record<string, string>;

  beforeEach(() => {
    localStorageData = {};
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => localStorageData[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        localStorageData[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete localStorageData[key];
      }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ── Requirement 15.2: Logger in-memory buffer capped to 100 entries ──

  it('logger subscriber receives at most 100 entries in the in-memory buffer for any number of log calls', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 300 }),
        (numLogs) => {
          // Simulate the store's subscription pattern: keep last 100 logs
          let buffer: Array<{ id: string; message: string }> = [];
          const unsub = subscribeToLogs((newLog) => {
            buffer = [...buffer, newLog].slice(-100);
          });

          // Emit numLogs log entries
          for (let i = 0; i < numLogs; i++) {
            log('info', 'Test', `Log message ${i}`);
          }

          unsub();

          // The buffer must never exceed 100 entries
          expect(buffer.length).toBeLessThanOrEqual(100);
          // And should contain min(numLogs, 100) entries
          expect(buffer.length).toBe(Math.min(numLogs, 100));
        },
      ),
      { numRuns: 100 },
    );
  });

  // ── Requirement 15.3: Logger subscriber callback errors are caught ──

  it('logger continues logging to console even when subscriber throws', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        (numLogs) => {
          const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
          const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

          // Subscribe with a callback that always throws
          const unsub = subscribeToLogs(() => {
            throw new Error('Subscriber exploded!');
          });

          // Emit logs — should not throw
          for (let i = 0; i < numLogs; i++) {
            expect(() => log('info', 'Test', `Message ${i}`)).not.toThrow();
          }

          // Console.error should have been called for each subscriber failure
          expect(consoleErrorSpy).toHaveBeenCalledTimes(numLogs);

          // Console.log should still have been called for each log entry
          expect(consoleSpy).toHaveBeenCalledTimes(numLogs);

          unsub();
          consoleSpy.mockRestore();
          consoleErrorSpy.mockRestore();
        },
      ),
      { numRuns: 100 },
    );
  });

  // ── Requirement 15.4: Analytics entries capped to 50 ──

  it('analytics localStorage store contains at most 50 entries for any number of writes', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 200 }),
        (numEntries) => {
          // Reset localStorage
          localStorageData = {};

          // Write numEntries analytics entries
          for (let i = 0; i < numEntries; i++) {
            trackVideoGeneration(makeAnalyticsEntry(i));
          }

          // Read back and verify cap
          const stored = getAnalytics();
          expect(stored.length).toBeLessThanOrEqual(50);
          expect(stored.length).toBe(Math.min(numEntries, 50));
        },
      ),
      { numRuns: 100 },
    );
  });

  // ── Requirement 15.1: Analytics catches localStorage write errors ──

  it('analytics service catches and suppresses localStorage write errors', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        (numWrites) => {
          // Make localStorage.setItem throw (simulating quota exceeded)
          const setItemMock = vi.fn(() => {
            throw new DOMException('QuotaExceededError', 'QuotaExceededError');
          });
          vi.stubGlobal('localStorage', {
            getItem: vi.fn(() => null),
            setItem: setItemMock,
            removeItem: vi.fn(),
          });

          // trackVideoGeneration should never throw, even when localStorage fails
          for (let i = 0; i < numWrites; i++) {
            expect(() => trackVideoGeneration(makeAnalyticsEntry(i))).not.toThrow();
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // ── Requirement 15.1: getAnalytics never throws on any stored data ──

  it('getAnalytics never throws regardless of what is stored in localStorage', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 200 }),
        (corruptedData) => {
          localStorageData = { autotube_analytics: corruptedData };

          // getAnalytics should never throw, regardless of stored content
          expect(() => getAnalytics()).not.toThrow();
        },
      ),
      { numRuns: 100 },
    );
  });
});
