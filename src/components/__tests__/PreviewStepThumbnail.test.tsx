import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import type { VideoProject } from '../../types';

// ---------------------------------------------------------------------------
// Task 4.4: Unit test — mount/unmount PreviewStep → verify blob URL is revoked
// Feature: codebase-bug-sweep
// **Validates: Requirements 2.4**
// ---------------------------------------------------------------------------

// ── Mock all heavy dependencies before importing the component ──────────────

// Track blob URL lifecycle
const createdBlobUrls: string[] = [];
const revokedBlobUrls: string[] = [];

// Mock URL.createObjectURL / revokeObjectURL
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

beforeEach(() => {
  createdBlobUrls.length = 0;
  revokedBlobUrls.length = 0;

  URL.createObjectURL = vi.fn((blob: Blob) => {
    const url = `blob:http://localhost/fake-${createdBlobUrls.length}`;
    createdBlobUrls.push(url);
    return url;
  });

  URL.revokeObjectURL = vi.fn((url: string) => {
    revokedBlobUrls.push(url);
  });
});

// Mock thumbnail service — generateSplitScreenThumbnail resolves with a blob
vi.mock('../../services/thumbnail', () => ({
  generateSplitScreenThumbnail: vi.fn(() =>
    Promise.resolve(new Blob(['thumb'], { type: 'image/png' })),
  ),
  generateThumbnail: vi.fn(() =>
    Promise.resolve(new Blob(['thumb-fallback'], { type: 'image/png' })),
  ),
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
  hasSpeechSupport: vi.fn(() => false),
  speakText: vi.fn(),
  stopSpeaking: vi.fn(),
}));

// Mock StoryboardView
vi.mock('../StoryboardView', () => ({
  default: () => <div data-testid="storyboard-mock" />,
}));

// Now import the component after mocks are set up
import PreviewStep from '../PreviewStep';

function makeProject(): VideoProject {
  return {
    version: 1,
    id: 'proj-test',
    title: 'Test Video',
    topic: 'Test Topic',
    style: 'business_insider',
    targetDuration: 10,
    script: [
      {
        id: 'seg-1',
        type: 'intro',
        title: 'Intro',
        narration: 'Welcome to the video.',
        visualNote: 'Show title card',
        duration: 5,
      },
      {
        id: 'seg-2',
        type: 'section',
        title: 'Main',
        narration: 'Here is the main content.',
        visualNote: 'Show charts',
        duration: 5,
      },
    ],
    media: [
      {
        id: 'media-1',
        segmentId: 'seg-1',
        type: 'image',
        url: 'https://example.com/img1.jpg',
        alt: 'Image 1',
        source: 'test',
      },
      {
        id: 'media-2',
        segmentId: 'seg-2',
        type: 'image',
        url: 'https://example.com/img2.jpg',
        alt: 'Image 2',
        source: 'test',
      },
    ],
    narration: [],
    status: 'complete',
    createdAt: new Date(),
  };
}

describe('PreviewStep thumbnail blob URL lifecycle', () => {
  it('revokes the blob URL on unmount after thumbnail generation completes', async () => {
    const project = makeProject();

    const { unmount } = render(
      <PreviewStep project={project} onReset={vi.fn()} />,
    );

    // Wait for the async thumbnail generation to complete
    // The mock resolves immediately, but we need to flush microtasks
    await act(async () => {
      // Allow the generate() promise chain to resolve
      await new Promise((r) => setTimeout(r, 0));
    });

    // A blob URL should have been created
    expect(createdBlobUrls.length).toBeGreaterThanOrEqual(1);
    const createdUrl = createdBlobUrls[0];

    // Unmount the component — cleanup should revoke the blob URL
    unmount();

    // The blob URL that was created should now be revoked
    expect(revokedBlobUrls).toContain(createdUrl);
  });

  it('does not leak blob URLs across multiple mount/unmount cycles', async () => {
    const project = makeProject();

    // First mount/unmount cycle
    const { unmount: unmount1 } = render(
      <PreviewStep project={project} onReset={vi.fn()} />,
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    unmount1();

    // Second mount/unmount cycle
    const { unmount: unmount2 } = render(
      <PreviewStep project={project} onReset={vi.fn()} />,
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    unmount2();

    // Every created blob URL should have a corresponding revoke call
    for (const url of createdBlobUrls) {
      expect(revokedBlobUrls).toContain(url);
    }
  });
});
