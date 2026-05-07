import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act, screen } from '@testing-library/react';
import type { VideoProject } from '../../types';

// ---------------------------------------------------------------------------
// Task 8.2: Unit test — mock both thumbnail generators to throw → verify
// thumbnailPreviewFailed is set
// Feature: codebase-bug-sweep
// **Validates: Requirements 2.8**
// ---------------------------------------------------------------------------

// ── Mock all heavy dependencies before importing the component ──────────────

// Mock thumbnail service — BOTH generators throw
vi.mock('../../services/thumbnail', () => ({
  generateSplitScreenThumbnail: vi.fn(() =>
    Promise.reject(new Error('Split screen failed')),
  ),
  generateThumbnail: vi.fn(() =>
    Promise.reject(new Error('Fallback thumbnail failed')),
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

describe('PreviewStep thumbnail generation error handling', () => {
  it('sets thumbnailPreviewFailed when both thumbnail generators throw', async () => {
    const project = makeProject();

    render(<PreviewStep project={project} onReset={vi.fn()} />);

    // Wait for the async generate() promise chain to settle.
    // Both generators reject, so the outer .catch sets thumbnailPreviewFailed = true.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // The fallback UI should show "Thumbnail preview unavailable" text
    expect(screen.getByText(/Thumbnail preview unavailab/i)).toBeTruthy();
  });

  it('does not show a thumbnail image when both generators fail', async () => {
    const project = makeProject();

    render(<PreviewStep project={project} onReset={vi.fn()} />);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // No thumbnail image should be rendered
    expect(screen.queryByAltText('Thumbnail preview')).toBeNull();
  });
});
