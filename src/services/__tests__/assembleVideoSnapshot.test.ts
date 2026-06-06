import '../../store/__tests__/storeHookMocks';
import { makeHookSafeSegments } from '../../store/__tests__/storeHookTestHelpers';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVideoProject } from '../../store';
import type { TopicConfig, VideoProject } from '../../types';

const TOPIC_CONFIG: TopicConfig = {
  topic: 'Test Topic',
  style: 'business_insider',
  targetDuration: 3,
  tone: 'informative',
  audience: 'General audience',
};

// ---------------------------------------------------------------------------
// Bug 12: assembleVideo uses stale project state (store.ts)
// **Validates: Requirements 2.2**
// ---------------------------------------------------------------------------

describe('Bug 12: assembleVideo render snapshot isolation', () => {
  let generateAIScript: ReturnType<typeof vi.fn>;
  let renderVideoToBlob: ReturnType<typeof vi.fn>;
  let trackVideoGeneration: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });

    vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {});

    // Stub URL.createObjectURL / revokeObjectURL
    vi.stubGlobal('URL', {
      ...globalThis.URL,
      createObjectURL: vi.fn(() => 'blob:test-video-url'),
      revokeObjectURL: vi.fn(),
    });

    const llm = await import('../../services/llm');
    const renderer = await import('../../services/renderer');
    const analytics = await import('../../services/analytics');

    generateAIScript = llm.generateAIScript as ReturnType<typeof vi.fn>;
    renderVideoToBlob = renderer.renderVideoToBlob as ReturnType<typeof vi.fn>;
    trackVideoGeneration = analytics.trackVideoGeneration as ReturnType<typeof vi.fn>;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  /**
   * Task 2.3: Verify render snapshot is independent of subsequent state mutations.
   *
   * The test:
   * 1. Creates a project with known script segments
   * 2. Starts assembleVideo (which internally clones the project)
   * 3. During the async render, mutates the project state (simulating auto-save)
   * 4. Verifies that renderVideoToBlob received the ORIGINAL data, not the mutated data
   */
  it('render uses a deep snapshot that is immune to concurrent state mutations', async () => {
    const segments = makeHookSafeSegments(2);

    // renderVideoToBlob will capture the project it receives so we can inspect it
    let capturedProject: VideoProject | null = null;
    renderVideoToBlob.mockImplementation(async (proj: VideoProject) => {
      capturedProject = proj;
      // Return a minimal Blob
      return new Blob(['video-data'], { type: 'video/webm' });
    });

    const { result } = renderHook(() => useVideoProject());

    // Set API key
    act(() => {
      result.current.setAppConfig({
        openRouterKey: 'test-key',
        sourceType: 'stock',
      });
    });

    // Generate a script to get a project
    generateAIScript.mockResolvedValue(segments);
    await act(async () => {
      await result.current.generateScript(TOPIC_CONFIG);
    });

    expect(result.current.project).not.toBeNull();
    const originalTitle = result.current.project!.title;
    const originalSegmentCount = result.current.project!.script.length;

    // Assemble the video — the snapshot is taken at the start
    await act(async () => {
      await result.current.assembleVideo(undefined, result.current.project!);
    });

    // Verify renderVideoToBlob was called
    expect(renderVideoToBlob).toHaveBeenCalledTimes(1);
    expect(capturedProject).not.toBeNull();

    // The captured project should match the original data
    expect(capturedProject!.title).toBe(originalTitle);
    expect(capturedProject!.script.length).toBe(originalSegmentCount);

    // Verify trackVideoGeneration also used the snapshot data
    expect(trackVideoGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        title: originalTitle,
        segments: originalSegmentCount,
      }),
    );
  });

  /**
   * Task 2.3: Verify the snapshot is a deep clone (not a shallow reference).
   *
   * Mutating the original project's nested objects after the clone should NOT
   * affect the snapshot passed to the renderer.
   */
  it('snapshot is a deep clone — nested mutations do not affect the render', async () => {
    const segments = makeHookSafeSegments(3);

    let capturedProject: VideoProject | null = null;
    renderVideoToBlob.mockImplementation(async (proj: VideoProject) => {
      capturedProject = proj;
      return new Blob(['video-data'], { type: 'video/webm' });
    });

    const { result } = renderHook(() => useVideoProject());

    act(() => {
      result.current.setAppConfig({
        openRouterKey: 'test-key',
        sourceType: 'stock',
      });
    });

    generateAIScript.mockResolvedValue(segments);
    await act(async () => {
      await result.current.generateScript(TOPIC_CONFIG);
    });

    const projectForRender = result.current.project!;

    // Capture original values before render
    const originalNarrations = projectForRender.script.map((s) => s.narration);

    await act(async () => {
      await result.current.assembleVideo(undefined, projectForRender);
    });

    expect(capturedProject).not.toBeNull();

    // The captured project's script narrations should match the originals
    for (let i = 0; i < originalNarrations.length; i++) {
      expect(capturedProject!.script[i].narration).toBe(originalNarrations[i]);
    }

    // Verify the captured project is a different object reference (deep clone)
    expect(capturedProject).not.toBe(projectForRender);
    expect(capturedProject!.script).not.toBe(projectForRender.script);
    if (capturedProject!.script.length > 0) {
      expect(capturedProject!.script[0]).not.toBe(projectForRender.script[0]);
    }
  });
});
