import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { act } from '@testing-library/react';
import type { VideoProject, QualityReport } from '../../types';

// ---------------------------------------------------------------------------
// Task 7.2: Unit tests for BlindReviewCard
// Feature: blind-video-review
// **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5**
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

vi.mock('../../services/seoTitles', () => ({
  extractHookLine: vi.fn(() => 'Hook line'),
  extractDataPoints: vi.fn(() => []),
  generateTitleOptions: vi.fn(() => [
    { title: 'Test Title Option One for the Video', style: 'clickbait', estimatedCTR: 8.5 },
    { title: 'Test Title Option Two for the Video', style: 'professional', estimatedCTR: 7.0 },
    { title: 'Test Title Option Three for Video', style: 'question', estimatedCTR: 6.5 },
  ]),
  generateVideoDescription: vi.fn(() => ({
    summary: 'Test summary.',
    chapters: '00:00 Intro\n00:05 Main',
    tags: ['test', 'video'],
    fullDescription: 'Test summary.\n\n00:00 Intro\n00:05 Main\n\nTags: test, video',
  })),
  generateFullMetadata: vi.fn(() => ({
    title: 'Test Title Option One for the Video That Is Long Enough',
    description: 'Test summary.\n\n0:00 Intro\n0:05 Main\n\nTags: test, video',
    tags: ['test', 'video', 'AI', 'technology', 'review', 'analysis', 'trending', 'news'],
    chapters: [{ timestamp: '0:00', title: 'Intro', segmentIndex: 0 }],
  })),
  generateChapterMarkersAligned: vi.fn(() => [
    { timestamp: '0:00', title: 'Intro', segmentIndex: 0 },
  ]),
}));

vi.mock('../../services/chapters', () => ({
  copyChaptersToClipboard: vi.fn(() => Promise.resolve()),
}));

// Stub URL.createObjectURL / revokeObjectURL
beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:http://localhost/fake-thumb');
  URL.revokeObjectURL = vi.fn();
});

import PreviewStep from '../PreviewStep';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeReport(overrides?: Partial<QualityReport>): QualityReport {
  return {
    scores: {
      visualQuality: 8,
      pacing: 6,
      narrativeClarity: 9,
      thumbnailEffectiveness: 3,
      overallProductionValue: 5,
    },
    feedback: {
      visualQuality: 'Great visuals.',
      pacing: 'Decent pacing.',
      narrativeClarity: 'Very clear narrative.',
      thumbnailEffectiveness: 'Thumbnail needs work.',
      overallProductionValue: 'Average production.',
    },
    letterGrade: 'B',
    summary: 'Overall a solid video with room for improvement.',
    reviewedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeProject(blindReview?: QualityReport | null): VideoProject {
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
    blindReview: blindReview === null ? undefined : blindReview,
  };
}

async function renderPreview(project: VideoProject) {
  let result: ReturnType<typeof render>;
  await act(async () => {
    result = render(<PreviewStep project={project} onReset={vi.fn()} />);
    await new Promise((r) => setTimeout(r, 0));
  });
  return result!;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('BlindReviewCard', () => {
  describe('Requirement 5.1: All 5 score categories render when report is present', () => {
    it('renders all 5 category sections with correct test IDs', async () => {
      const project = makeProject(makeReport());
      await renderPreview(project);

      expect(screen.getByTestId('blind-review-card')).toBeTruthy();
      expect(screen.getByTestId('blind-review-category-visualQuality')).toBeTruthy();
      expect(screen.getByTestId('blind-review-category-pacing')).toBeTruthy();
      expect(screen.getByTestId('blind-review-category-narrativeClarity')).toBeTruthy();
      expect(screen.getByTestId('blind-review-category-thumbnailEffectiveness')).toBeTruthy();
      expect(screen.getByTestId('blind-review-category-overallProductionValue')).toBeTruthy();
    });

    it('displays score values and feedback text for each category', async () => {
      const report = makeReport();
      const project = makeProject(report);
      await renderPreview(project);

      // Check score labels are rendered
      expect(screen.getByText('8/10')).toBeTruthy();
      expect(screen.getByText('6/10')).toBeTruthy();
      expect(screen.getByText('9/10')).toBeTruthy();
      expect(screen.getByText('3/10')).toBeTruthy();
      expect(screen.getByText('5/10')).toBeTruthy();

      // Check feedback text is rendered
      expect(screen.getByText('Great visuals.')).toBeTruthy();
      expect(screen.getByText('Decent pacing.')).toBeTruthy();
      expect(screen.getByText('Very clear narrative.')).toBeTruthy();
      expect(screen.getByText('Thumbnail needs work.')).toBeTruthy();
      expect(screen.getByText('Average production.')).toBeTruthy();
    });

    it('displays the summary text', async () => {
      const report = makeReport();
      const project = makeProject(report);
      await renderPreview(project);

      expect(screen.getByTestId('blind-review-summary')).toBeTruthy();
      expect(screen.getByText('Overall a solid video with room for improvement.')).toBeTruthy();
    });
  });

  describe('Requirement 5.4: "No review" message when report is null', () => {
    it('shows "No blind review available" when blindReview is undefined', async () => {
      const project = makeProject(null);
      await renderPreview(project);

      expect(screen.getByTestId('blind-review-card')).toBeTruthy();
      expect(screen.getByText('No blind review available for this project.')).toBeTruthy();
    });

    it('does not render category sections when report is null', async () => {
      const project = makeProject(null);
      await renderPreview(project);

      expect(screen.queryByTestId('blind-review-details')).toBeNull();
      expect(screen.queryByTestId('blind-review-grade')).toBeNull();
    });
  });

  describe('Requirement 5.5: Collapse/expand toggle', () => {
    it('starts expanded and collapses on toggle click', async () => {
      const project = makeProject(makeReport());
      await renderPreview(project);

      // Initially expanded — details should be visible
      expect(screen.getByTestId('blind-review-details')).toBeTruthy();

      // Click the toggle button to collapse
      const toggle = screen.getByTestId('blind-review-toggle');
      await act(async () => {
        fireEvent.click(toggle);
      });

      // Details should be hidden after collapse
      expect(screen.queryByTestId('blind-review-details')).toBeNull();
    });

    it('expands again after a second toggle click', async () => {
      const project = makeProject(makeReport());
      await renderPreview(project);

      const toggle = screen.getByTestId('blind-review-toggle');

      // Collapse
      await act(async () => {
        fireEvent.click(toggle);
      });
      expect(screen.queryByTestId('blind-review-details')).toBeNull();

      // Expand
      await act(async () => {
        fireEvent.click(toggle);
      });
      expect(screen.getByTestId('blind-review-details')).toBeTruthy();
    });

    it('toggle button shows correct label text', async () => {
      const project = makeProject(makeReport());
      await renderPreview(project);

      const toggle = screen.getByTestId('blind-review-toggle');
      expect(toggle.textContent).toContain('Hide');

      await act(async () => {
        fireEvent.click(toggle);
      });
      expect(toggle.textContent).toContain('Show');
    });
  });

  describe('Requirement 5.2: Correct color classes for score ranges', () => {
    it('applies red color classes for scores 1–3', async () => {
      const report = makeReport({
        scores: {
          visualQuality: 1,
          pacing: 2,
          narrativeClarity: 3,
          thumbnailEffectiveness: 1,
          overallProductionValue: 2,
        },
      });
      const project = makeProject(report);
      await renderPreview(project);

      // All scores are 1-3, so all should have red color classes
      const vqCategory = screen.getByTestId('blind-review-category-visualQuality');
      const scoreLabel = vqCategory.querySelector('.text-red-400');
      expect(scoreLabel).toBeTruthy();
      expect(scoreLabel!.textContent).toBe('1/10');

      // Check that the progress bar uses red background
      const progressBar = vqCategory.querySelector('.bg-red-500');
      expect(progressBar).toBeTruthy();
    });

    it('applies amber color classes for scores 4–6', async () => {
      const report = makeReport({
        scores: {
          visualQuality: 4,
          pacing: 5,
          narrativeClarity: 6,
          thumbnailEffectiveness: 4,
          overallProductionValue: 5,
        },
      });
      const project = makeProject(report);
      await renderPreview(project);

      const pacingCategory = screen.getByTestId('blind-review-category-pacing');
      const scoreLabel = pacingCategory.querySelector('.text-amber-400');
      expect(scoreLabel).toBeTruthy();
      expect(scoreLabel!.textContent).toBe('5/10');

      const progressBar = pacingCategory.querySelector('.bg-amber-500');
      expect(progressBar).toBeTruthy();
    });

    it('applies green color classes for scores 7–10', async () => {
      const report = makeReport({
        scores: {
          visualQuality: 7,
          pacing: 8,
          narrativeClarity: 9,
          thumbnailEffectiveness: 10,
          overallProductionValue: 7,
        },
      });
      const project = makeProject(report);
      await renderPreview(project);

      const ncCategory = screen.getByTestId('blind-review-category-narrativeClarity');
      const scoreLabel = ncCategory.querySelector('.text-emerald-400');
      expect(scoreLabel).toBeTruthy();
      expect(scoreLabel!.textContent).toBe('9/10');

      const progressBar = ncCategory.querySelector('.bg-emerald-500');
      expect(progressBar).toBeTruthy();
    });

    it('applies mixed colors when scores span different ranges', async () => {
      // Default report has: visualQuality=8(green), pacing=6(amber), thumbnailEffectiveness=3(red)
      const report = makeReport();
      const project = makeProject(report);
      await renderPreview(project);

      // visualQuality=8 → green
      const vqCategory = screen.getByTestId('blind-review-category-visualQuality');
      expect(vqCategory.querySelector('.text-emerald-400')).toBeTruthy();

      // pacing=6 → amber
      const pacingCategory = screen.getByTestId('blind-review-category-pacing');
      expect(pacingCategory.querySelector('.text-amber-400')).toBeTruthy();

      // thumbnailEffectiveness=3 → red
      const teCategory = screen.getByTestId('blind-review-category-thumbnailEffectiveness');
      expect(teCategory.querySelector('.text-red-400')).toBeTruthy();
    });
  });

  describe('Requirement 5.3: Letter grade with correct color', () => {
    it('displays grade A with green color', async () => {
      const report = makeReport({ letterGrade: 'A' });
      const project = makeProject(report);
      await renderPreview(project);

      const grade = screen.getByTestId('blind-review-grade');
      expect(grade.textContent).toBe('A');
      expect(grade.classList.contains('text-emerald-400')).toBe(true);
    });

    it('displays grade B with green color', async () => {
      const report = makeReport({ letterGrade: 'B' });
      const project = makeProject(report);
      await renderPreview(project);

      const grade = screen.getByTestId('blind-review-grade');
      expect(grade.textContent).toBe('B');
      expect(grade.classList.contains('text-emerald-400')).toBe(true);
    });

    it('displays grade C with amber color', async () => {
      const report = makeReport({ letterGrade: 'C' });
      const project = makeProject(report);
      await renderPreview(project);

      const grade = screen.getByTestId('blind-review-grade');
      expect(grade.textContent).toBe('C');
      expect(grade.classList.contains('text-amber-400')).toBe(true);
    });

    it('displays grade D with red color', async () => {
      const report = makeReport({ letterGrade: 'D' });
      const project = makeProject(report);
      await renderPreview(project);

      const grade = screen.getByTestId('blind-review-grade');
      expect(grade.textContent).toBe('D');
      expect(grade.classList.contains('text-red-400')).toBe(true);
    });

    it('displays grade F with red color', async () => {
      const report = makeReport({ letterGrade: 'F' });
      const project = makeProject(report);
      await renderPreview(project);

      const grade = screen.getByTestId('blind-review-grade');
      expect(grade.textContent).toBe('F');
      expect(grade.classList.contains('text-red-400')).toBe(true);
    });
  });
});
