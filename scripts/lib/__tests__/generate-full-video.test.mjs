import { describe, expect, it } from 'vitest';
import {
  isAirlineRelevantClip,
  recordVisionStockUnverified,
  resolveVisionUnverifiedMax,
  spawnSyncFailureReason,
} from '../generate-full-video.mjs';

describe('isAirlineRelevantClip', () => {
  it('rejects opaque Archive.org clips that only match a trusted airline query', () => {
    expect(
      isAirlineRelevantClip(
        {
          source: 'Archive.org live',
          query: 'airplane',
          alt: 'opaque-newsreel-identifier',
          url: 'https://archive.org/download/random_collection/random_clip.mp4',
        },
        'airline cabin pressure safety investigation',
      ),
    ).toBe(false);
  });

  it('accepts trusted airline clips when visual metadata is present', () => {
    expect(
      isAirlineRelevantClip(
        {
          source: 'Archive.org live',
          query: 'airplane',
          alt: 'aircraft maintenance hangar with visible airplane',
          url: 'https://archive.org/download/random_collection/random_clip.mp4',
        },
        'airline cabin pressure safety investigation',
      ),
    ).toBe(true);
  });
});

describe('vision stock unverified gate', () => {
  it('defaults AUTOTUBE_VISION_UNVERIFIED_MAX to 0 (strict skip)', () => {
    expect(resolveVisionUnverifiedMax({})).toBe(0);
    expect(resolveVisionUnverifiedMax({ AUTOTUBE_VISION_UNVERIFIED_MAX: '2' })).toBe(2);
    expect(resolveVisionUnverifiedMax({ AUTOTUBE_VISION_UNVERIFIED_MAX: 'nope' })).toBe(0);
  });

  it('skips unverified clips for every topic when max is 0', () => {
    const report = {};
    const first = recordVisionStockUnverified(
      report,
      { ran: false, reason: 'http-500' },
      { thumbnailUrl: 'https://example.com/a.jpg', env: {} },
    );
    expect(first.unverified).toBe(true);
    expect(first.skip).toBe(true);
    expect(report.visionStockUnverified).toBe(1);
    expect(report.visionStockUnverifiedSkipped).toBe(1);
  });

  it('allows a bounded number of unverified clips when max > 0', () => {
    const report = {};
    const env = { AUTOTUBE_VISION_UNVERIFIED_MAX: '1' };
    const allowed = recordVisionStockUnverified(
      report,
      { ran: false, reason: 'http-500' },
      { thumbnailUrl: 'https://example.com/a.jpg', env },
    );
    const skipped = recordVisionStockUnverified(
      report,
      { ran: false, reason: 'http-500' },
      { thumbnailUrl: 'https://example.com/b.jpg', env },
    );
    expect(allowed.skip).toBe(false);
    expect(skipped.skip).toBe(true);
    expect(report.visionStockUnverifiedAllowed).toBe(1);
    expect(report.visionStockUnverifiedSkipped).toBe(1);
  });

  it('ignores verdicts that actually ran', () => {
    const report = {};
    const result = recordVisionStockUnverified(
      report,
      { ran: true, reject: false },
      { thumbnailUrl: 'https://example.com/a.jpg', env: {} },
    );
    expect(result.unverified).toBe(false);
    expect(report.visionStockUnverified || 0).toBe(0);
  });
});

describe('spawnSyncFailureReason', () => {
  it('treats null status from signal kill or timeout as a failure reason', () => {
    expect(spawnSyncFailureReason({ status: null, signal: 'SIGTERM' }, 'server-render')).toBe(
      'server-render killed or timed out (SIGTERM)',
    );
  });

  it('returns no failure reason for status zero', () => {
    expect(spawnSyncFailureReason({ status: 0 }, 'server-render')).toBe('');
  });
});
