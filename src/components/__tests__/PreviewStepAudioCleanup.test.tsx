import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act, fireEvent } from '@testing-library/react';
import type { VideoProject, NarrationClip } from '../../types';

// ---------------------------------------------------------------------------
// Task 6.3: Unit test — unmount PreviewStep during playback → verify audio
// is paused and src cleared on unmount.
// Feature: codebase-bug-sweep
// **Validates: Requirements 2.6**
// ---------------------------------------------------------------------------

// ── Track Audio instance lifecycle ──────────────────────────────────────────

let capturedAudioInstance: { pause: ReturnType<typeof vi.fn>; src: string; addEventListener: ReturnType<typeof vi.fn>; removeEventListener: ReturnType<typeof vi.fn>; load: ReturnType<typeof vi.fn>; play: ReturnType<typeof vi.fn> } | null = null;

// We need to intercept the Audio constructor to capture the instance created
// inside PreviewStep via `useState(() => new Audio())`.
beforeEach(() => {
  capturedAudioInstance = null;

  // Replace the global Audio constructor with a spy
  globalThis.Audio = vi.fn(() => {
    const instance = {
      pause: vi.fn(),
      play: vi.fn(() => Promise.resolve()),
      load: vi.fn(),
      src: '',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      currentTime: 0,
      volume: 1,
    };
    capturedAudioInstance = instance;
    return instance;
  }) as unknown as typeof Audio;

  URL.createObjectURL = vi.fn(() => 'blob:fake');
  URL.revokeObjectURL = vi.fn();
});

// Mock thumbnail service
vi.mock('../../services/thumbnail', () => ({
  generateSplitScreenThumbnail: vi.fn(() =>
    Promise.resolve(new Blob(['thumb'], { type: 'image/png' })),
  ),
  generateThumbnail: vi.fn(() =>
    Promise.resolve(new Blob(['thumb-fallback'], { type: 'image/png' })),
  ),
  getBestThumbnailOverlay: vi.fn((_project: unknown, hookLine?: string) => hookLine ?? 'Test overlay'),
  downloadThumbnail: vi.fn(),
}));

// Mock subtitles service
vi.mock('../../services/subtitles', () => ({
  generateSRTSubtitles: vi.fn(() => ''),
  generateVTTSubtitles: vi.fn(() => ''),
  downloadSubtitles: vi.fn(),
}));

// Mock youtube service
vi.mock('../../services/youtube', () => ({
  openYouTubeUpload: vi.fn(),
  generateYouTubeMetadata: vi.fn(() => ({})),
}));

// Mock speech utilities
vi.mock('../../utils/speech', () => ({
  hasSpeechSupport: vi.fn(() => true),
  speakText: vi.fn(() => Promise.resolve(null)),
  stopSpeaking: vi.fn(),
}));

// Mock StoryboardView
vi.mock('../StoryboardView', () => ({
  default: () => <div data-testid="storyboard-mock" />,
}));

// Now import the component after mocks are set up
import PreviewStep from '../PreviewStep';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeProject(): VideoProject {
  const segments = [
    {
      id: 'seg-0',
      type: 'intro' as const,
      title: 'Intro',
      narration: 'Welcome to the video.',
      visualNote: 'Title card',
      duration: 5,
    },
    {
      id: 'seg-1',
      type: 'section' as const,
      title: 'Section One',
      narration: 'This is section one content.',
      visualNote: 'Charts',
      duration: 5,
    },
  ];

  const narration: NarrationClip[] = segments.map((seg, i) => ({
    id: `nar-${i}`,
    segmentId: seg.id,
    text: seg.narration,
    voice: 'TestVoice',
    duration: seg.duration,
    status: 'ready' as const,
    audioUrl: 'https://example.com/narration.mp3',
  }));

  return {
    version: 1,
    id: 'proj-audio-cleanup-test',
    title: 'Audio Cleanup Test Video',
    topic: 'Testing',
    style: 'business_insider',
    targetDuration: 10,
    script: segments,
    media: segments.map((seg, i) => ({
      id: `media-${i}`,
      segmentId: seg.id,
      type: 'image' as const,
      url: `https://example.com/img${i}.jpg`,
      alt: `Image ${i}`,
      source: 'test',
    })),
    narration,
    status: 'complete',
    createdAt: new Date(),
  };
}

describe('PreviewStep audio cleanup on unmount', () => {
  beforeEach(() => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    vi.spyOn(performance, 'now').mockReturnValue(0);
  });

  it('6.3 — pauses audio and clears src when component unmounts during playback', async () => {
    const project = makeProject();

    const { unmount } = render(
      <PreviewStep project={project} onReset={vi.fn()} />,
    );

    // Wait for thumbnail generation to complete
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    // Verify the Audio instance was captured
    expect(capturedAudioInstance).not.toBeNull();

    // Start playback via Space key
    await act(async () => {
      fireEvent.keyDown(window, { key: ' ' });
    });

    // Reset the pause call count so we only track unmount-triggered calls
    capturedAudioInstance!.pause.mockClear();

    // Unmount the component while playback is active
    unmount();

    // The useEffect cleanup should have called audioRef.pause()
    expect(capturedAudioInstance!.pause).toHaveBeenCalled();

    // The useEffect cleanup should have cleared audioRef.src
    expect(capturedAudioInstance!.src).toBe('');
  });

  it('pauses audio and clears src on unmount even without active playback', async () => {
    const project = makeProject();

    const { unmount } = render(
      <PreviewStep project={project} onReset={vi.fn()} />,
    );

    // Wait for thumbnail generation
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(capturedAudioInstance).not.toBeNull();

    // Don't start playback — just unmount immediately
    capturedAudioInstance!.pause.mockClear();
    unmount();

    // Cleanup should still pause and clear src as a safety measure
    expect(capturedAudioInstance!.pause).toHaveBeenCalled();
    expect(capturedAudioInstance!.src).toBe('');
  });
});
