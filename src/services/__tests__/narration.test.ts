import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import fc from 'fast-check';
import { useVideoProject } from '../../store';
import type { ScriptSegment, VideoProject } from '../../types';

// ---------------------------------------------------------------------------
// Mocks — same pattern as storeAbortSignal.test.ts
// ---------------------------------------------------------------------------

vi.mock('../../services/llm', () => ({
  generateAIScript: vi.fn(),
  reviewAndImproveScript: vi.fn((segs: unknown) => Promise.resolve(segs)),
  generateVideoTitle: vi.fn(() => Promise.resolve('Test Title')),
}));

vi.mock('../../services/media', () => ({
  sourceSegmentMedia: vi.fn(),
  replaceMediaAsset: vi.fn(),
  resetUsedUrlsMap: vi.fn(),
}));

vi.mock('../../services/visualPlanner', () => ({
  resolveTopicContext: vi.fn(),
  planSegmentVisuals: vi.fn(),
}));

vi.mock('../../services/renderer', () => ({
  QUALITY_PRESETS: {
    draft: { width: 854, height: 480, fps: 24 },
    standard: { width: 1280, height: 720, fps: 30 },
    high: { width: 1920, height: 1080, fps: 30 },
  },
  renderVideoToBlob: vi.fn(),
}));

vi.mock('../../services/analytics', () => ({
  trackVideoGeneration: vi.fn(),
}));

vi.mock('../../services/segmentReorderer', () => ({
  reorderForHook: vi.fn((p: unknown) => p),
}));

vi.mock('../../services/captionUtils', () => ({
  CHART_KEYWORDS: [],
}));

vi.mock('../../services/logger', () => ({
  subscribeToLogs: vi.fn(() => () => {}),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('../../utils/speech', () => ({
  hasSpeechSupport: vi.fn(() => true),
  loadSpeechVoices: vi.fn(async () => [
    { name: 'Google US English', lang: 'en-US', default: false, localService: true, voiceURI: 'Google US English' },
  ]),
  pickPreferredVoice: vi.fn(() => ({
    name: 'Google US English',
    lang: 'en-US',
    default: false,
    localService: true,
    voiceURI: 'Google US English',
  })),
  stopSpeaking: vi.fn(),
}));

vi.mock('../../services/aiEditor', () => ({
  runAIEditPass: vi.fn(),
}));

vi.mock('../../services/projectMigrations', () => ({
  CURRENT_PROJECT_VERSION: 1,
  migrateProject: vi.fn((p: unknown) => p),
}));

vi.mock('../../services/tts', () => ({
  kokoroEngine: {
    name: 'kokoro',
    voices: [{ id: 'af_heart', description: 'Female conversational' }],
    isAvailable: vi.fn(() => true),
    generate: vi.fn(() => Promise.resolve(null)),
  },
  generateMeloTts: vi.fn(),
}));

vi.mock('../../services/blindReview', () => ({
  runBlindReview: vi.fn(),
}));

vi.mock('../../services/seoTitles', () => ({
  extractHookLine: vi.fn(),
}));

vi.mock('../../utils/secureStorage', () => ({
  hasEncryptedConfig: vi.fn(() => false),
  loadEncryptedBlob: vi.fn(() => null),
  loadConfigFromSession: vi.fn(() => null),
  saveConfigToSession: vi.fn(),
  clearEncryptedConfig: vi.fn(),
  clearSessionConfig: vi.fn(),
  persistEncryptedConfig: vi.fn(),
  decryptConfig: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSegments(count: number): ScriptSegment[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `seg-${i}`,
    type: (i === 0 ? 'intro' : i === count - 1 ? 'outro' : 'section') as ScriptSegment['type'],
    title: `Segment ${i + 1}`,
    narration: Array.from(
      { length: 20 + i * 5 },
      (__, w) => `word${w}`,
    ).join(' '),
    visualNote: `Visual note for segment ${i + 1}`,
    duration: 10 + i,
  }));
}

function makeProject(segmentCount: number): VideoProject {
  return {
    version: 1,
    id: `proj-${segmentCount}`,
    title: `Test Video ${segmentCount} segments`,
    topic: 'Test Topic',
    style: 'business_insider',
    targetDuration: 8,
    script: makeSegments(segmentCount),
    media: [],
    narration: [],
    status: 'draft',
    createdAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Task 1.4: Unit test verifying generateNarration produces exactly N clips
// for scripts with 1, 5, 8, 10, and 15 segments
// Feature: pipeline-reliability-fixes
// **Validates: Requirements 2.1, 3.1**
// ---------------------------------------------------------------------------

describe('generateNarration produces exactly N clips for N segments', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Stub localStorage to avoid side effects
    vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {});
  });

  it.each([1, 5, 8, 10, 15])(
    'produces exactly %i narration clips for a %i-segment script',
    async (segmentCount) => {
      const testProject = makeProject(segmentCount);

      const { result } = renderHook(() => useVideoProject());

      // Call generateNarration with the test project
      let narrationResult: VideoProject | null = null;
      await act(async () => {
        narrationResult = await result.current.generateNarration(testProject);
      });

      // Verify the returned project has exactly segmentCount narration clips
      expect(narrationResult).not.toBeNull();
      expect(narrationResult!.narration).toHaveLength(segmentCount);

      // Verify each clip maps to a segment
      for (let i = 0; i < segmentCount; i++) {
        const clip = narrationResult!.narration[i];
        expect(clip.segmentId).toBe(testProject.script[i].id);
        expect(clip.text).toBe(testProject.script[i].narration);
        expect(clip.status).toBe('ready');
        expect(clip.voice).toBe('Google US English');
        expect(clip.duration).toBeGreaterThan(0);
        expect(clip.id).toBeTruthy();
      }

      // Verify the store's project state also has the correct narration count
      expect(result.current.project?.narration).toHaveLength(segmentCount);

      // Verify narration step completed
      expect(result.current.stepStatuses.narration).toBe('complete');
      expect(result.current.stepStatuses.ai_edit).toBe('active');
    },
  );
});


// ---------------------------------------------------------------------------
// Task 1.5: Property-based test with fast-check generating random script
// arrays (1–15 segments, 10–300 words) and asserting clip count equals
// segment count.
// Feature: pipeline-reliability-fixes
// **Validates: Requirements 2.1**
// ---------------------------------------------------------------------------

/**
 * Arbitrary that generates a single ScriptSegment with a random narration
 * containing between 10 and 300 words.
 */
const segmentArb = (index: number, total: number): fc.Arbitrary<ScriptSegment> =>
  fc
    .integer({ min: 10, max: 300 })
    .chain((wordCount) =>
      fc.array(fc.stringMatching(/^[a-z]{1,12}$/), { minLength: wordCount, maxLength: wordCount }).map(
        (words): ScriptSegment => ({
          id: `seg-${index}`,
          type: index === 0 ? 'intro' : index === total - 1 ? 'outro' : 'section',
          title: `Segment ${index + 1}`,
          narration: words.join(' '),
          visualNote: `Visual note ${index}`,
          duration: 10 + index,
        }),
      ),
    );

/**
 * Arbitrary that generates a random ScriptSegment array with 1–15 segments.
 * Each segment has a narration of 10–300 random words.
 */
const scriptArb: fc.Arbitrary<ScriptSegment[]> = fc
  .integer({ min: 1, max: 15 })
  .chain((count) => fc.tuple(...Array.from({ length: count }, (_, i) => segmentArb(i, count))));

describe('generateNarration — property-based: clip count equals segment count', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Stub localStorage to avoid side effects
    vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {});
  });

  it('always produces exactly segments.length narration clips for any random script', { timeout: 60_000 }, async () => {
    await fc.assert(
      fc.asyncProperty(scriptArb, async (segments) => {
        const testProject: VideoProject = {
          version: 1,
          id: `proj-pbt-${segments.length}`,
          title: 'PBT Test Video',
          topic: 'Property Test Topic',
          style: 'business_insider',
          targetDuration: 8,
          script: segments,
          media: [],
          narration: [],
          status: 'draft',
          createdAt: new Date(),
        };

        const { result } = renderHook(() => useVideoProject());

        let narrationResult: VideoProject | null = null;
        await act(async () => {
          narrationResult = await result.current.generateNarration(testProject);
        });

        // Core property: clip count must equal segment count
        expect(narrationResult).not.toBeNull();
        expect(narrationResult!.narration).toHaveLength(segments.length);

        // Each clip must map to its corresponding segment
        for (let i = 0; i < segments.length; i++) {
          expect(narrationResult!.narration[i].segmentId).toBe(segments[i].id);
          expect(narrationResult!.narration[i].text).toBe(segments[i].narration);
          expect(narrationResult!.narration[i].status).toBe('ready');
          expect(narrationResult!.narration[i].duration).toBeGreaterThan(0);
        }
      }),
      { numRuns: 20 },
    );
  });
});
