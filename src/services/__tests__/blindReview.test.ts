import { describe, it, expect, vi } from 'vitest';
import {
  clampScore,
  computeFrameTimestamps,
  extractKeyFrames,
  buildBlindReviewPrompt,
  deriveLetterGrade,
  scoreColor,
  gradeColor,
  truncateString,
  parseJSONResponse,
  parseQualityReport,
  runBlindReview,
} from '../blindReview';

// ── computeFrameTimestamps ──

describe('computeFrameTimestamps', () => {
  it('returns 6 timestamps for videos < 30s', () => {
    const ts = computeFrameTimestamps(20);
    expect(ts).toHaveLength(6);
  });

  it('returns 10 timestamps for videos 30–120s', () => {
    expect(computeFrameTimestamps(30)).toHaveLength(10);
    expect(computeFrameTimestamps(60)).toHaveLength(10);
    expect(computeFrameTimestamps(120)).toHaveLength(10);
  });

  it('returns 12 timestamps for videos > 120s', () => {
    expect(computeFrameTimestamps(121)).toHaveLength(12);
    expect(computeFrameTimestamps(300)).toHaveLength(12);
  });

  it('returns evenly-spaced timestamps that avoid start and end', () => {
    const ts = computeFrameTimestamps(60);
    // 10 frames, interval = 60 / 11
    const interval = 60 / 11;
    for (let i = 0; i < ts.length; i++) {
      expect(ts[i]).toBeCloseTo(interval * (i + 1), 10);
    }
    // First timestamp > 0, last timestamp < duration
    expect(ts[0]).toBeGreaterThan(0);
    expect(ts[ts.length - 1]).toBeLessThan(60);
  });

  it('uses targetFrames when provided', () => {
    const ts = computeFrameTimestamps(60, 5);
    expect(ts).toHaveLength(5);
  });

  it('clamps targetFrames to [1, 30]', () => {
    expect(computeFrameTimestamps(60, 0)).toHaveLength(1);
    expect(computeFrameTimestamps(60, -5)).toHaveLength(1);
    expect(computeFrameTimestamps(60, 50)).toHaveLength(30);
  });

  it('returns empty array for zero or negative duration', () => {
    expect(computeFrameTimestamps(0)).toEqual([]);
    expect(computeFrameTimestamps(-10)).toEqual([]);
  });
});

// ── extractKeyFrames ──

describe('extractKeyFrames', () => {
  it('throws AbortError when signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const blob = new Blob(['test'], { type: 'video/webm' });

    try {
      await extractKeyFrames(blob, { signal: controller.signal });
      expect.fail('Expected extractKeyFrames to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(DOMException);
      expect((err as DOMException).name).toBe('AbortError');
    }
  });

  it('throws descriptive error for invalid video blob when DOM APIs are available', async () => {
    // Mock URL.createObjectURL so we get past the first step
    const revokeObjectURL = vi.fn();
    const createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });

    // Mock document.createElement to return a video element that fires an error
    const origCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreateElement(tag);
      if (tag === 'video') {
        // Override the src setter to fire an error event asynchronously
        let srcValue = '';
        Object.defineProperty(el, 'src', {
          get: () => srcValue,
          set: (val: string) => {
            srcValue = val;
            // Simulate a media error
            Object.defineProperty(el, 'error', {
              value: { code: 4, message: 'MEDIA_ERR_SRC_NOT_SUPPORTED' },
              configurable: true,
            });
            setTimeout(() => el.dispatchEvent(new Event('error')), 0);
          },
          configurable: true,
        });
      }
      return el;
    });

    const blob = new Blob(['not a video'], { type: 'video/webm' });

    await expect(extractKeyFrames(blob)).rejects.toThrow(/could not be decoded/i);

    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
});

// ── buildBlindReviewPrompt ──

describe('buildBlindReviewPrompt', () => {
  it('returns a system prompt and user message array', () => {
    const result = buildBlindReviewPrompt(['frame1', 'frame2'], 'Hello world', null);
    expect(typeof result.system).toBe('string');
    expect(Array.isArray(result.user)).toBe(true);
  });

  it('includes image_url parts for each frame', () => {
    const frames = ['data:image/jpeg;base64,abc', 'data:image/jpeg;base64,def'];
    const result = buildBlindReviewPrompt(frames, 'Script text', null);
    const imageParts = result.user.filter((p) => p.type === 'image_url');
    expect(imageParts).toHaveLength(2);
    expect(imageParts[0]).toEqual({ type: 'image_url', image_url: { url: frames[0] } });
    expect(imageParts[1]).toEqual({ type: 'image_url', image_url: { url: frames[1] } });
  });

  it('includes a text part with the script', () => {
    const result = buildBlindReviewPrompt(['frame1'], 'My narration script', null);
    const textParts = result.user.filter(
      (p) => p.type === 'text' && typeof p.text === 'string' && (p.text as string).startsWith('Script:'),
    );
    expect(textParts).toHaveLength(1);
    expect(textParts[0].text).toBe('Script:\nMy narration script');
  });

  it('includes thumbnail when provided', () => {
    const thumb = 'data:image/png;base64,thumb123';
    const result = buildBlindReviewPrompt(['frame1'], 'Script', thumb);
    const imageParts = result.user.filter((p) => p.type === 'image_url');
    // 1 frame + 1 thumbnail = 2 image parts
    expect(imageParts).toHaveLength(2);
    expect(imageParts[1]).toEqual({ type: 'image_url', image_url: { url: thumb } });
    // Should have a text label before the thumbnail
    const thumbLabel = result.user.find(
      (p) => p.type === 'text' && typeof p.text === 'string' && (p.text as string).toLowerCase().includes('thumbnail'),
    );
    expect(thumbLabel).toBeDefined();
  });

  it('does not include thumbnail parts when thumbnailDataUrl is null', () => {
    const result = buildBlindReviewPrompt(['frame1'], 'Script', null);
    const imageParts = result.user.filter((p) => p.type === 'image_url');
    expect(imageParts).toHaveLength(1); // only the frame
    const thumbLabel = result.user.find(
      (p) => p.type === 'text' && typeof p.text === 'string' && (p.text as string).toLowerCase().includes('thumbnail'),
    );
    expect(thumbLabel).toBeUndefined();
  });

  it('system prompt requests JSON with the 5 scoring categories', () => {
    const result = buildBlindReviewPrompt([], '', null);
    expect(result.system).toContain('visualQuality');
    expect(result.system).toContain('pacing');
    expect(result.system).toContain('narrativeClarity');
    expect(result.system).toContain('thumbnailEffectiveness');
    expect(result.system).toContain('overallProductionValue');
  });

  it('system prompt requests feedback and summary', () => {
    const result = buildBlindReviewPrompt([], '', null);
    expect(result.system).toContain('feedback');
    expect(result.system).toContain('summary');
  });

  it('system prompt does not contain project-specific context', () => {
    const result = buildBlindReviewPrompt([], '', null);
    // The system prompt should be generic — no topic/style/audience placeholders
    expect(result.system).not.toContain('${');
    expect(result.system).not.toContain('undefined');
  });
});

// ── clampScore ──

describe('clampScore', () => {
  it('returns the value for integers in [1, 10]', () => {
    expect(clampScore(1)).toBe(1);
    expect(clampScore(5)).toBe(5);
    expect(clampScore(10)).toBe(10);
  });

  it('rounds floats to nearest integer', () => {
    expect(clampScore(3.4)).toBe(3);
    expect(clampScore(3.5)).toBe(4);
    expect(clampScore(7.9)).toBe(8);
  });

  it('clamps values below 1 to 1', () => {
    expect(clampScore(0)).toBe(1);
    expect(clampScore(-5)).toBe(1);
    expect(clampScore(-100.7)).toBe(1);
  });

  it('clamps values above 10 to 10', () => {
    expect(clampScore(11)).toBe(10);
    expect(clampScore(999)).toBe(10);
    expect(clampScore(10.6)).toBe(10);
  });

  it('defaults non-numeric values to 5', () => {
    expect(clampScore(NaN)).toBe(5);
    expect(clampScore(undefined)).toBe(5);
    expect(clampScore(null)).toBe(5);
    expect(clampScore('hello')).toBe(5);
    expect(clampScore(true)).toBe(5);
    expect(clampScore({})).toBe(5);
  });
});

// ── deriveLetterGrade ──

describe('deriveLetterGrade', () => {
  it('returns A for average >= 9', () => {
    expect(deriveLetterGrade([9, 9, 9, 9, 9])).toBe('A');
    expect(deriveLetterGrade([10, 10, 10, 10, 10])).toBe('A');
    expect(deriveLetterGrade([9, 10, 9, 10, 9])).toBe('A');
  });

  it('returns B for average >= 7 and < 9', () => {
    expect(deriveLetterGrade([7, 7, 7, 7, 7])).toBe('B');
    expect(deriveLetterGrade([8, 8, 8, 8, 8])).toBe('B');
  });

  it('returns C for average >= 5 and < 7', () => {
    expect(deriveLetterGrade([5, 5, 5, 5, 5])).toBe('C');
    expect(deriveLetterGrade([6, 6, 6, 6, 6])).toBe('C');
  });

  it('returns D for average >= 3 and < 5', () => {
    expect(deriveLetterGrade([3, 3, 3, 3, 3])).toBe('D');
    expect(deriveLetterGrade([4, 4, 4, 4, 4])).toBe('D');
  });

  it('returns F for average < 3', () => {
    expect(deriveLetterGrade([1, 1, 1, 1, 1])).toBe('F');
    expect(deriveLetterGrade([2, 2, 2, 2, 2])).toBe('F');
  });

  it('returns F for empty array', () => {
    expect(deriveLetterGrade([])).toBe('F');
  });
});

// ── scoreColor ──

describe('scoreColor', () => {
  it('returns red for scores 1–3', () => {
    expect(scoreColor(1)).toBe('red');
    expect(scoreColor(2)).toBe('red');
    expect(scoreColor(3)).toBe('red');
  });

  it('returns amber for scores 4–6', () => {
    expect(scoreColor(4)).toBe('amber');
    expect(scoreColor(5)).toBe('amber');
    expect(scoreColor(6)).toBe('amber');
  });

  it('returns green for scores 7–10', () => {
    expect(scoreColor(7)).toBe('green');
    expect(scoreColor(8)).toBe('green');
    expect(scoreColor(9)).toBe('green');
    expect(scoreColor(10)).toBe('green');
  });
});

// ── gradeColor ──

describe('gradeColor', () => {
  it('returns green for A and B', () => {
    expect(gradeColor('A')).toBe('green');
    expect(gradeColor('B')).toBe('green');
  });

  it('returns amber for C', () => {
    expect(gradeColor('C')).toBe('amber');
  });

  it('returns red for D and F', () => {
    expect(gradeColor('D')).toBe('red');
    expect(gradeColor('F')).toBe('red');
  });
});

// ── truncateString ──

describe('truncateString', () => {
  it('returns the string unchanged if within limit', () => {
    expect(truncateString('hello', 10)).toBe('hello');
    expect(truncateString('hello', 5)).toBe('hello');
  });

  it('truncates with ellipsis when over limit', () => {
    expect(truncateString('hello world', 5)).toBe('hell…');
    expect(truncateString('abcdef', 4)).toBe('abc…');
  });

  it('handles empty string', () => {
    expect(truncateString('', 10)).toBe('');
  });

  it('handles maxLength of 1', () => {
    expect(truncateString('ab', 1)).toBe('…');
  });
});

// ── parseJSONResponse ──

describe('parseJSONResponse', () => {
  it('parses plain JSON', () => {
    expect(parseJSONResponse('{"a": 1}')).toEqual({ a: 1 });
  });

  it('strips ```json fences', () => {
    const wrapped = '```json\n{"a": 1}\n```';
    expect(parseJSONResponse(wrapped)).toEqual({ a: 1 });
  });

  it('strips plain ``` fences', () => {
    const wrapped = '```\n{"a": 1}\n```';
    expect(parseJSONResponse(wrapped)).toEqual({ a: 1 });
  });

  it('handles leading/trailing whitespace', () => {
    expect(parseJSONResponse('  \n {"a": 1} \n  ')).toEqual({ a: 1 });
  });

  it('throws on invalid JSON', () => {
    expect(() => parseJSONResponse('not json')).toThrow();
  });

  it('parses arrays', () => {
    expect(parseJSONResponse('[1, 2, 3]')).toEqual([1, 2, 3]);
  });
});

// ── parseQualityReport ──

describe('parseQualityReport', () => {
  it('parses a complete valid response object', () => {
    const raw = {
      scores: {
        visualQuality: 8,
        pacing: 7,
        narrativeClarity: 9,
        thumbnailEffectiveness: 6,
        overallProductionValue: 8,
      },
      feedback: {
        visualQuality: 'Great visuals.',
        pacing: 'Good pacing overall.',
        narrativeClarity: 'Very clear narrative.',
        thumbnailEffectiveness: 'Decent thumbnail.',
        overallProductionValue: 'Well produced.',
      },
      summary: 'A solid video with strong production values.',
    };

    const report = parseQualityReport(raw);
    expect(report.scores.visualQuality).toBe(8);
    expect(report.scores.pacing).toBe(7);
    expect(report.scores.narrativeClarity).toBe(9);
    expect(report.scores.thumbnailEffectiveness).toBe(6);
    expect(report.scores.overallProductionValue).toBe(8);
    expect(report.feedback.visualQuality).toBe('Great visuals.');
    expect(report.feedback.pacing).toBe('Good pacing overall.');
    expect(report.summary).toBe('A solid video with strong production values.');
    expect(report.letterGrade).toBe('B');
    expect(report.reviewedAt).toBeTruthy();
    // reviewedAt should be a valid ISO timestamp
    expect(new Date(report.reviewedAt).toISOString()).toBe(report.reviewedAt);
  });

  it('parses a JSON string with markdown fences', () => {
    const raw = '```json\n{"scores":{"visualQuality":7},"feedback":{},"summary":"Good."}\n```';
    const report = parseQualityReport(raw);
    expect(report.scores.visualQuality).toBe(7);
    // Missing scores default to 5
    expect(report.scores.pacing).toBe(5);
    expect(report.summary).toBe('Good.');
  });

  it('fills missing scores with default value of 5', () => {
    const raw = { scores: { visualQuality: 8 }, feedback: {}, summary: '' };
    const report = parseQualityReport(raw);
    expect(report.scores.visualQuality).toBe(8);
    expect(report.scores.pacing).toBe(5);
    expect(report.scores.narrativeClarity).toBe(5);
    expect(report.scores.thumbnailEffectiveness).toBe(5);
    expect(report.scores.overallProductionValue).toBe(5);
  });

  it('fills missing feedback with "No feedback provided."', () => {
    const raw = { scores: {}, feedback: { visualQuality: 'Nice.' }, summary: '' };
    const report = parseQualityReport(raw);
    expect(report.feedback.visualQuality).toBe('Nice.');
    expect(report.feedback.pacing).toBe('No feedback provided.');
    expect(report.feedback.narrativeClarity).toBe('No feedback provided.');
    expect(report.feedback.thumbnailEffectiveness).toBe('No feedback provided.');
    expect(report.feedback.overallProductionValue).toBe('No feedback provided.');
  });

  it('fills empty feedback strings with default', () => {
    const raw = { scores: {}, feedback: { visualQuality: '', pacing: '   ' }, summary: '' };
    const report = parseQualityReport(raw);
    expect(report.feedback.visualQuality).toBe('No feedback provided.');
    expect(report.feedback.pacing).toBe('No feedback provided.');
  });

  it('fills missing/empty summary with default', () => {
    const report1 = parseQualityReport({ scores: {}, feedback: {} });
    expect(report1.summary).toBe('No feedback provided.');

    const report2 = parseQualityReport({ scores: {}, feedback: {}, summary: '' });
    expect(report2.summary).toBe('No feedback provided.');
  });

  it('clamps out-of-range scores', () => {
    const raw = {
      scores: { visualQuality: 15, pacing: -3, narrativeClarity: 0, thumbnailEffectiveness: 10.6, overallProductionValue: 3.4 },
      feedback: {},
      summary: 'Test.',
    };
    const report = parseQualityReport(raw);
    expect(report.scores.visualQuality).toBe(10);
    expect(report.scores.pacing).toBe(1);
    expect(report.scores.narrativeClarity).toBe(1);
    expect(report.scores.thumbnailEffectiveness).toBe(10);
    expect(report.scores.overallProductionValue).toBe(3);
  });

  it('truncates feedback to 500 chars', () => {
    const longFeedback = 'x'.repeat(600);
    const raw = { scores: {}, feedback: { visualQuality: longFeedback }, summary: '' };
    const report = parseQualityReport(raw);
    expect(report.feedback.visualQuality.length).toBeLessThanOrEqual(500);
  });

  it('truncates summary to 1000 chars', () => {
    const longSummary = 'y'.repeat(1500);
    const raw = { scores: {}, feedback: {}, summary: longSummary };
    const report = parseQualityReport(raw);
    expect(report.summary.length).toBeLessThanOrEqual(1000);
  });

  it('derives letter grade from scores', () => {
    // All 10s → A
    const raw = {
      scores: { visualQuality: 10, pacing: 10, narrativeClarity: 10, thumbnailEffectiveness: 10, overallProductionValue: 10 },
      feedback: {},
      summary: '',
    };
    expect(parseQualityReport(raw).letterGrade).toBe('A');
  });

  it('returns all defaults for null input', () => {
    const report = parseQualityReport(null);
    expect(report.scores.visualQuality).toBe(5);
    expect(report.scores.pacing).toBe(5);
    expect(report.scores.narrativeClarity).toBe(5);
    expect(report.scores.thumbnailEffectiveness).toBe(5);
    expect(report.scores.overallProductionValue).toBe(5);
    expect(report.feedback.visualQuality).toBe('No feedback provided.');
    expect(report.summary).toBe('No feedback provided.');
    expect(report.letterGrade).toBe('C'); // mean of 5s = 5 → C
  });

  it('returns all defaults for undefined input', () => {
    const report = parseQualityReport(undefined);
    expect(report.scores.visualQuality).toBe(5);
    expect(report.letterGrade).toBe('C');
  });

  it('returns all defaults for invalid string input', () => {
    const report = parseQualityReport('not json at all');
    expect(report.scores.visualQuality).toBe(5);
    expect(report.letterGrade).toBe('C');
  });

  it('returns all defaults for array input', () => {
    const report = parseQualityReport([1, 2, 3]);
    expect(report.scores.visualQuality).toBe(5);
  });

  it('returns all defaults for number input', () => {
    const report = parseQualityReport(42);
    expect(report.scores.visualQuality).toBe(5);
  });

  it('handles scores as non-object gracefully', () => {
    const report = parseQualityReport({ scores: 'not an object', feedback: {}, summary: '' });
    expect(report.scores.visualQuality).toBe(5);
  });

  it('handles feedback as non-object gracefully', () => {
    const report = parseQualityReport({ scores: {}, feedback: 123, summary: '' });
    expect(report.feedback.visualQuality).toBe('No feedback provided.');
  });
});

// ── runBlindReview ──

describe('runBlindReview', () => {
  it('returns null immediately when apiKey is empty', async () => {
    const project = {
      version: 1,
      id: 'test',
      title: 'Test',
      topic: 'Test Topic',
      style: 'business_insider' as const,
      targetDuration: 60,
      script: [{ id: '1', type: 'intro' as const, title: 'Intro', narration: 'Hello', visualNote: '', duration: 5 }],
      media: [],
      narration: [],
      thumbnail: 'blob:http://localhost/video',
      status: 'complete' as const,
      createdAt: new Date(),
    };

    const result = await runBlindReview(project, '');
    expect(result).toBeNull();
  });

  it('returns null when project.thumbnail is falsy', async () => {
    const project = {
      version: 1,
      id: 'test',
      title: 'Test',
      topic: 'Test Topic',
      style: 'business_insider' as const,
      targetDuration: 60,
      script: [{ id: '1', type: 'intro' as const, title: 'Intro', narration: 'Hello', visualNote: '', duration: 5 }],
      media: [],
      narration: [],
      thumbnail: undefined,
      status: 'complete' as const,
      createdAt: new Date(),
    };

    const result = await runBlindReview(project, 'sk-test-key');
    expect(result).toBeNull();
  });

  it('re-throws AbortError when signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    const project = {
      version: 1,
      id: 'test',
      title: 'Test',
      topic: 'Test Topic',
      style: 'business_insider' as const,
      targetDuration: 60,
      script: [{ id: '1', type: 'intro' as const, title: 'Intro', narration: 'Hello', visualNote: '', duration: 5 }],
      media: [],
      narration: [],
      thumbnail: 'blob:http://localhost/video',
      status: 'complete' as const,
      createdAt: new Date(),
    };

    // Mock fetch to return a blob
    const mockFetch = vi.fn().mockResolvedValue({
      blob: () => Promise.resolve(new Blob(['video'], { type: 'video/webm' })),
    });
    vi.stubGlobal('fetch', mockFetch);

    await expect(
      runBlindReview(project, 'sk-test-key', { signal: controller.signal }),
    ).rejects.toThrow();

    try {
      await runBlindReview(project, 'sk-test-key', { signal: controller.signal });
    } catch (err) {
      expect((err as Error).name).toBe('AbortError');
    }

    vi.unstubAllGlobals();
  });

  it('calls onProgress at key phases', async () => {
    const progressCalls: Array<[number, string]> = [];
    const onProgress = (pct: number, message: string) => {
      progressCalls.push([pct, message]);
    };

    const project = {
      version: 1,
      id: 'test',
      title: 'Test',
      topic: 'Test Topic',
      style: 'business_insider' as const,
      targetDuration: 60,
      script: [{ id: '1', type: 'intro' as const, title: 'Intro', narration: 'Hello', visualNote: '', duration: 5 }],
      media: [],
      narration: [],
      thumbnail: 'blob:http://localhost/video',
      status: 'complete' as const,
      createdAt: new Date(),
    };

    // Mock fetch for the blob URL
    const mockFetch = vi.fn().mockResolvedValue({
      blob: () => Promise.resolve(new Blob(['video'], { type: 'video/webm' })),
    });
    vi.stubGlobal('fetch', mockFetch);

    // The extractKeyFrames call will fail because we can't create a real video element
    // in the test environment, but we should still see the first progress call
    const result = await runBlindReview(project, 'sk-test-key', { onProgress });

    // Should have reported at least the first progress phase before failing
    expect(progressCalls[0]).toEqual([0, 'Extracting frames…']);
    // Result should be null since frame extraction fails in test env
    expect(result).toBeNull();

    vi.unstubAllGlobals();
  });
});

import fc from 'fast-check';

// ── Property-Based Tests ──

describe('PBT Properties', () => {
  // Feature: blind-video-review, Property 1: Frame extraction count and spacing
  it('Property 1: For any video duration > 0, computeFrameTimestamps(duration) returns between 6 and 12 timestamps with equal intervals', () => {
    // **Validates: Requirements 1.1**
    fc.assert(
      fc.property(fc.float({ min: Math.fround(0.1), max: Math.fround(600), noNaN: true }), (duration) => {
        const timestamps = computeFrameTimestamps(duration);

        // Count must be between 6 and 12 inclusive
        expect(timestamps.length).toBeGreaterThanOrEqual(6);
        expect(timestamps.length).toBeLessThanOrEqual(12);

        // First timestamp must be > 0 and last must be < duration
        expect(timestamps[0]).toBeGreaterThan(0);
        expect(timestamps[timestamps.length - 1]).toBeLessThan(duration);

        // All intervals between consecutive timestamps must be equal within floating-point tolerance
        if (timestamps.length >= 2) {
          const expectedInterval = timestamps[1] - timestamps[0];
          for (let i = 2; i < timestamps.length; i++) {
            const interval = timestamps[i] - timestamps[i - 1];
            expect(Math.abs(interval - expectedInterval)).toBeLessThan(1e-10);
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  // Feature: blind-video-review, Property 2: Blind prompt excludes project context
  it('Property 2: For any project with arbitrary topic, style, and audience strings, the prompt text from buildBlindReviewPrompt does not contain those strings', () => {
    // **Validates: Requirements 2.2**

    // Build the fixed prompt template once to check for substring collisions
    const templatePrompt = buildBlindReviewPrompt([], '', null);
    const templateText = [
      templatePrompt.system,
      ...templatePrompt.user
        .filter((p) => p.type === 'text' && typeof p.text === 'string')
        .map((p) => p.text as string),
    ]
      .join(' ')
      .toLowerCase();

    fc.assert(
      fc.property(
        fc.string({ minLength: 3, maxLength: 50 }),
        fc.string({ minLength: 3, maxLength: 50 }),
        fc.string({ minLength: 3, maxLength: 50 }),
        (topic, style, audience) => {
          // Filter out strings that are substrings of the fixed prompt template
          fc.pre(!templateText.includes(topic.toLowerCase()));
          fc.pre(!templateText.includes(style.toLowerCase()));
          fc.pre(!templateText.includes(audience.toLowerCase()));

          // Use dummy frames and script that do NOT contain topic/style/audience
          const dummyFrames = ['data:image/jpeg;base64,AAAA', 'data:image/jpeg;base64,BBBB'];
          const dummyScript = 'This is a dummy narration script for testing purposes.';

          const result = buildBlindReviewPrompt(dummyFrames, dummyScript, null);

          // System prompt must not contain topic, style, or audience
          expect(result.system).not.toContain(topic);
          expect(result.system).not.toContain(style);
          expect(result.system).not.toContain(audience);

          // All text content parts must not contain topic, style, or audience
          const textParts = result.user.filter(
            (p) => p.type === 'text' && typeof p.text === 'string',
          );
          for (const part of textParts) {
            const text = part.text as string;
            expect(text).not.toContain(topic);
            expect(text).not.toContain(style);
            expect(text).not.toContain(audience);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: blind-video-review, Property 3: Score clamping
  it('Property 3: For any numeric value (including floats, negatives, values > 10), clampScore(value) returns an integer in [1, 10]', () => {
    // **Validates: Requirements 3.1, 3.5**
    const arbitraryValue = fc.oneof(
      fc.integer(),
      fc.float(),
      fc.constant(NaN),
      fc.constant(undefined),
      fc.constant(null),
    );

    fc.assert(
      fc.property(arbitraryValue, (value) => {
        const result = clampScore(value);
        expect(Number.isInteger(result)).toBe(true);
        expect(result).toBeGreaterThanOrEqual(1);
        expect(result).toBeLessThanOrEqual(10);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: blind-video-review, Property 4: Letter grade derivation
  it('Property 4: For any array of 5 integers each in [1, 10], deriveLetterGrade(scores) returns the correct grade based on arithmetic mean', () => {
    // **Validates: Requirements 3.3**
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 10 }), { minLength: 5, maxLength: 5 }),
        (scores) => {
          const mean = scores.reduce((sum, s) => sum + s, 0) / scores.length;
          let expectedGrade: string;
          if (mean >= 9) expectedGrade = 'A';
          else if (mean >= 7) expectedGrade = 'B';
          else if (mean >= 5) expectedGrade = 'C';
          else if (mean >= 3) expectedGrade = 'D';
          else expectedGrade = 'F';

          expect(deriveLetterGrade(scores)).toBe(expectedGrade);
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: blind-video-review, Property 5: Score-to-color mapping
  it('Property 5: For any integer score in [1, 10], scoreColor(score) returns red for 1–3, amber for 4–6, green for 7–10', () => {
    // **Validates: Requirements 5.2**
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10 }), (score) => {
        const result = scoreColor(score);
        let expectedColor: 'red' | 'amber' | 'green';
        if (score <= 3) expectedColor = 'red';
        else if (score <= 6) expectedColor = 'amber';
        else expectedColor = 'green';

        expect(result).toBe(expectedColor);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: blind-video-review, Property 6: Grade-to-color mapping
  it('Property 6: For any letter grade in {A, B, C, D, F}, gradeColor(grade) returns green for A/B, amber for C, red for D/F', () => {
    // **Validates: Requirements 5.3**
    fc.assert(
      fc.property(fc.constantFrom('A', 'B', 'C', 'D', 'F'), (grade) => {
        const result = gradeColor(grade);
        let expectedColor: 'red' | 'amber' | 'green';
        if (grade === 'A' || grade === 'B') expectedColor = 'green';
        else if (grade === 'C') expectedColor = 'amber';
        else expectedColor = 'red';

        expect(result).toBe(expectedColor);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: blind-video-review, Property 9: Markdown fence stripping
  it('Property 9: For any valid JSON string wrapped in markdown code fences, parseJSONResponse(wrapped) returns the same parsed object as JSON.parse(original)', () => {
    // **Validates: Requirements 7.1**
    fc.assert(
      fc.property(fc.json(), (jsonStr) => {
        const expected = JSON.parse(jsonStr);

        // Variant 1: wrapped in ```json ... ```
        const wrappedJson = '```json\n' + jsonStr + '\n```';
        expect(parseJSONResponse(wrappedJson)).toEqual(expected);

        // Variant 2: wrapped in ``` ... ```
        const wrappedPlain = '```\n' + jsonStr + '\n```';
        expect(parseJSONResponse(wrappedPlain)).toEqual(expected);

        // Variant 3: no fences (plain JSON)
        expect(parseJSONResponse(jsonStr)).toEqual(expected);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: blind-video-review, Property 7: QualityReport JSON round-trip
  it('Property 7: For any valid QualityReport object, JSON.parse(JSON.stringify(report)) produces a deeply equal object', () => {
    const qualityReportArb = fc.record({
      scores: fc.record({
        visualQuality: fc.integer({ min: 1, max: 10 }),
        pacing: fc.integer({ min: 1, max: 10 }),
        narrativeClarity: fc.integer({ min: 1, max: 10 }),
        thumbnailEffectiveness: fc.integer({ min: 1, max: 10 }),
        overallProductionValue: fc.integer({ min: 1, max: 10 }),
      }),
      feedback: fc.record({
        visualQuality: fc.string({ minLength: 1, maxLength: 500 }),
        pacing: fc.string({ minLength: 1, maxLength: 500 }),
        narrativeClarity: fc.string({ minLength: 1, maxLength: 500 }),
        thumbnailEffectiveness: fc.string({ minLength: 1, maxLength: 500 }),
        overallProductionValue: fc.string({ minLength: 1, maxLength: 500 }),
      }),
      letterGrade: fc.constantFrom('A', 'B', 'C', 'D', 'F'),
      summary: fc.string({ minLength: 1, maxLength: 1000 }),
      reviewedAt: fc.integer({ min: 0, max: 4102444800000 }).map((ms) => new Date(ms).toISOString()),
    });

    fc.assert(
      fc.property(qualityReportArb, (report) => {
        const roundTripped = JSON.parse(JSON.stringify(report));
        expect(roundTripped).toEqual(report);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: blind-video-review, Property 8: Missing field defaults
  it('Property 8: For any raw response object with an arbitrary subset of score and feedback fields omitted, parseQualityReport(raw) produces a complete QualityReport where every missing score is 5 and every missing feedback is "No feedback provided."', () => {
    // **Validates: Requirements 7.2**
    const categories = [
      'visualQuality',
      'pacing',
      'narrativeClarity',
      'thumbnailEffectiveness',
      'overallProductionValue',
    ] as const;

    // Generate a partial scores object where each category may or may not be present
    const partialScores = fc.record(
      {
        visualQuality: fc.integer({ min: 1, max: 10 }),
        pacing: fc.integer({ min: 1, max: 10 }),
        narrativeClarity: fc.integer({ min: 1, max: 10 }),
        thumbnailEffectiveness: fc.integer({ min: 1, max: 10 }),
        overallProductionValue: fc.integer({ min: 1, max: 10 }),
      },
      { requiredKeys: [] },
    );

    // Generate a partial feedback object where each category may or may not be present
    const partialFeedback = fc.record(
      {
        visualQuality: fc.string({ minLength: 1, maxLength: 100 }),
        pacing: fc.string({ minLength: 1, maxLength: 100 }),
        narrativeClarity: fc.string({ minLength: 1, maxLength: 100 }),
        thumbnailEffectiveness: fc.string({ minLength: 1, maxLength: 100 }),
        overallProductionValue: fc.string({ minLength: 1, maxLength: 100 }),
      },
      { requiredKeys: [] },
    );

    fc.assert(
      fc.property(partialScores, partialFeedback, (scores, feedback) => {
        const raw = { scores, feedback, summary: 'Test summary.' };
        const report = parseQualityReport(raw);

        // All 5 score fields must be present in the output
        for (const cat of categories) {
          expect(report.scores[cat]).toBeDefined();
          expect(Number.isInteger(report.scores[cat])).toBe(true);
          expect(report.scores[cat]).toBeGreaterThanOrEqual(1);
          expect(report.scores[cat]).toBeLessThanOrEqual(10);

          if (cat in scores) {
            // Score was present — should be clamped to [1, 10]
            expect(report.scores[cat]).toBe(
              Math.max(1, Math.min(10, Math.round(scores[cat as keyof typeof scores]!))),
            );
          } else {
            // Score was missing — should default to 5
            expect(report.scores[cat]).toBe(5);
          }
        }

        // All 5 feedback fields must be present in the output
        for (const cat of categories) {
          expect(typeof report.feedback[cat]).toBe('string');
          expect(report.feedback[cat].length).toBeGreaterThan(0);

          if (cat in feedback && (feedback[cat as keyof typeof feedback] ?? '').trim().length > 0) {
            // Feedback was present and non-empty — should be in output (possibly truncated)
            const inputFeedback = feedback[cat as keyof typeof feedback]!;
            if (inputFeedback.length <= 500) {
              expect(report.feedback[cat]).toBe(inputFeedback);
            } else {
              expect(report.feedback[cat].length).toBeLessThanOrEqual(500);
            }
          } else {
            // Feedback was missing — should default
            expect(report.feedback[cat]).toBe('No feedback provided.');
          }
        }

        // Output must have all required top-level fields
        expect(report.scores).toBeDefined();
        expect(report.feedback).toBeDefined();
        expect(typeof report.letterGrade).toBe('string');
        expect(['A', 'B', 'C', 'D', 'F']).toContain(report.letterGrade);
        expect(typeof report.summary).toBe('string');
        expect(typeof report.reviewedAt).toBe('string');
        // reviewedAt should be a valid ISO timestamp
        expect(new Date(report.reviewedAt).toISOString()).toBe(report.reviewedAt);
      }),
      { numRuns: 100 },
    );
  });

  // Feature: blind-video-review, Property 10: Feedback and summary truncation
  it('Property 10: For any string of arbitrary length, truncateString(str, maxLength) returns a string of length ≤ maxLength; if input ≤ maxLength, output equals input', () => {
    // **Validates: Requirements 7.4**
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 2000 }),
        fc.integer({ min: 1, max: 1000 }),
        (str, maxLength) => {
          const result = truncateString(str, maxLength);
          // Output length must never exceed maxLength
          expect(result.length).toBeLessThanOrEqual(maxLength);
          // If input fits within maxLength, output must equal input
          if (str.length <= maxLength) {
            expect(result).toBe(str);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
