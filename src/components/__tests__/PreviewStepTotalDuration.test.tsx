import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { VideoProject, EditPlan, SegmentEditEntry } from '../../types';

// ---------------------------------------------------------------------------
// Task 7.4 & 7.5: Unit tests for totalDuration with/without editPlan
// Feature: codebase-bug-sweep
// **Validates: Requirements 2.7, 3.7**
// ---------------------------------------------------------------------------

// ── Mock all heavy dependencies before importing the component ──────────────

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

vi.mock('../../services/subtitles', () => ({
  generateSRTSubtitles: vi.fn(() => ''),
  generateVTTSubtitles: vi.fn(() => ''),
  downloadSubtitles: vi.fn(),
}));

vi.mock('../../services/youtube', () => ({
  openYouTubeUpload: vi.fn(),
  generateYouTubeMetadata: vi.fn(() => ({})),
}));

vi.mock('../../utils/speech', () => ({
  hasSpeechSupport: vi.fn(() => false),
  speakText: vi.fn(),
  stopSpeaking: vi.fn(),
}));

vi.mock('../StoryboardView', () => ({
  default: () => <div data-testid="storyboard-mock" />,
}));

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:http://localhost/fake-thumb');
  URL.revokeObjectURL = vi.fn();
});

import PreviewStep from '../PreviewStep';

function makeSegmentEditEntry(
  segmentId: string,
  originalDuration: number,
  adjustedDuration: number | null,
): SegmentEditEntry {
  return {
    segmentId,
    shotOrder: [],
    adjustedDuration,
    originalDuration,
    transition: null,
    kenBurns: {},
    captionSettings: { wordsPerWindow: 8, displayDurationMs: 2667, isFastPaced: false },
    replacementSuggestions: [],
    rationale: 'test',
  };
}

function makeProject(editPlan?: EditPlan): VideoProject {
  return {
    version: 1,
    id: 'proj-test',
    title: 'Test Video',
    topic: 'Test Topic',
    style: 'business_insider',
    targetDuration: 30,
    script: [
      {
        id: 'seg-1',
        type: 'intro',
        title: 'Intro',
        narration: 'Welcome to the video.',
        visualNote: 'Show title card',
        duration: 10,
      },
      {
        id: 'seg-2',
        type: 'section',
        title: 'Main',
        narration: 'Here is the main content.',
        visualNote: 'Show charts',
        duration: 15,
      },
      {
        id: 'seg-3',
        type: 'outro',
        title: 'Outro',
        narration: 'Thanks for watching.',
        visualNote: 'Show credits',
        duration: 5,
      },
    ],
    media: [
      { id: 'media-1', segmentId: 'seg-1', type: 'image', url: 'https://example.com/img1.jpg', alt: 'Image 1', source: 'test' },
      { id: 'media-2', segmentId: 'seg-2', type: 'image', url: 'https://example.com/img2.jpg', alt: 'Image 2', source: 'test' },
      { id: 'media-3', segmentId: 'seg-3', type: 'image', url: 'https://example.com/img3.jpg', alt: 'Image 3', source: 'test' },
    ],
    narration: [],
    status: 'complete',
    createdAt: new Date(),
    editPlan,
  };
}

describe('PreviewStep totalDuration with editPlan', () => {
  // Task 7.4: project with editPlan adjustments → verify totalDuration reflects adjusted values
  it('uses adjustedDuration from editPlan when available', () => {
    const editPlan: EditPlan = {
      segments: [
        makeSegmentEditEntry('seg-1', 10, 8),   // adjusted from 10 → 8
        makeSegmentEditEntry('seg-2', 15, 12),   // adjusted from 15 → 12
        makeSegmentEditEntry('seg-3', 5, null),   // no adjustment, keep 5
      ],
      summary: 'Test edit plan',
      isDefault: false,
    };

    const project = makeProject(editPlan);
    // Expected total: 8 + 12 + 5 = 25
    render(<PreviewStep project={project} onReset={vi.fn()} />);

    // The formatted time display shows the duration as "M:SS.ms"
    // 25 seconds = "0:25.00" — displayed in multiple places (quality info + export settings)
    const timeDisplays = screen.getAllByText(/0:25\.00/);
    expect(timeDisplays.length).toBeGreaterThanOrEqual(1);
  });

  it('uses adjustedDuration for some segments and falls back for others', () => {
    const editPlan: EditPlan = {
      segments: [
        makeSegmentEditEntry('seg-1', 10, 7),   // adjusted from 10 → 7
        // seg-2 not in editPlan at all — should fall back to script duration 15
      ],
      summary: 'Partial edit plan',
      isDefault: false,
    };

    const project = makeProject(editPlan);
    // Expected total: 7 + 15 + 5 = 27
    render(<PreviewStep project={project} onReset={vi.fn()} />);

    const timeDisplays = screen.getAllByText(/0:27\.00/);
    expect(timeDisplays.length).toBeGreaterThanOrEqual(1);
  });

  // Task 7.5: project without editPlan → verify totalDuration unchanged
  it('calculates totalDuration from script durations when no editPlan exists', () => {
    const project = makeProject(); // no editPlan
    // Expected total: 10 + 15 + 5 = 30
    render(<PreviewStep project={project} onReset={vi.fn()} />);

    const timeDisplays = screen.getAllByText(/0:30\.00/);
    expect(timeDisplays.length).toBeGreaterThanOrEqual(1);
  });

  it('calculates totalDuration from script durations when editPlan has no adjustments', () => {
    const editPlan: EditPlan = {
      segments: [
        makeSegmentEditEntry('seg-1', 10, null),  // no adjustment
        makeSegmentEditEntry('seg-2', 15, null),  // no adjustment
        makeSegmentEditEntry('seg-3', 5, null),   // no adjustment
      ],
      summary: 'Default edit plan',
      isDefault: true,
    };

    const project = makeProject(editPlan);
    // Expected total: 10 + 15 + 5 = 30 (all fall back to script durations)
    render(<PreviewStep project={project} onReset={vi.fn()} />);

    const timeDisplays = screen.getAllByText(/0:30\.00/);
    expect(timeDisplays.length).toBeGreaterThanOrEqual(1);
  });
});
