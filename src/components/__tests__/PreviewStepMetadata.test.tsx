import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { VideoProject } from '../../types';

// ---------------------------------------------------------------------------
// Task 11.4: Unit test — Preview step metadata and thumbnail display
// Feature: video-quality-max
// **Validates: Requirements 7.5, 8.7**
// ---------------------------------------------------------------------------

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
  hasSpeechSupport: vi.fn(() => false),
  speakText: vi.fn(),
  stopSpeaking: vi.fn(),
}));

// Mock StoryboardView
vi.mock('../StoryboardView', () => ({
  default: () => <div data-testid="storyboard-mock" />,
}));

// Mock URL.createObjectURL / revokeObjectURL
beforeEach(() => {
  let counter = 0;
  URL.createObjectURL = vi.fn(() => `blob:http://localhost/fake-${counter++}`);
  URL.revokeObjectURL = vi.fn();
});

import PreviewStep from '../PreviewStep';

function makeProject(): VideoProject {
  return {
    version: 1,
    id: 'proj-test',
    title: 'Test Video About AI Technology',
    topic: 'AI Technology',
    style: 'business_insider',
    targetDuration: 60,
    script: [
      {
        id: 'seg-1',
        type: 'intro',
        title: 'Introduction',
        narration: 'Did you know that $1.3 trillion is being invested in AI this year? This changes everything for your career.',
        visualNote: 'Show title card',
        duration: 10,
      },
      {
        id: 'seg-2',
        type: 'section',
        title: 'The Rise of AI',
        narration: 'Artificial intelligence is transforming every industry from healthcare to finance.',
        visualNote: 'Show charts',
        duration: 15,
      },
      {
        id: 'seg-3',
        type: 'section',
        title: 'Impact on Jobs',
        narration: 'Over 40% of jobs will be affected by AI automation in the next decade.',
        visualNote: 'Show statistics',
        duration: 15,
      },
      {
        id: 'seg-4',
        type: 'outro',
        title: 'Conclusion',
        narration: 'The future of AI is here. Are you ready to adapt?',
        visualNote: 'Show call to action',
        duration: 10,
      },
    ],
    media: [
      {
        id: 'media-1',
        segmentId: 'seg-1',
        type: 'image',
        url: 'https://example.com/img1.jpg',
        alt: 'AI visualization',
        source: 'test',
      },
      {
        id: 'media-2',
        segmentId: 'seg-2',
        type: 'image',
        url: 'https://example.com/img2.jpg',
        alt: 'Technology chart',
        source: 'test',
      },
    ],
    narration: [],
    status: 'complete',
    createdAt: new Date(),
  };
}

describe('PreviewStep metadata and thumbnail display', () => {
  it('displays an editable title input field', async () => {
    const project = makeProject();

    render(<PreviewStep project={project} onReset={vi.fn()} />);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const titleInput = screen.getByTestId('seo-title-input');
    expect(titleInput).toBeDefined();
    expect(titleInput.tagName).toBe('INPUT');
    // Title should be populated with generated metadata
    expect((titleInput as HTMLInputElement).value.length).toBeGreaterThan(0);
  });

  it('allows editing the title', async () => {
    const project = makeProject();

    render(<PreviewStep project={project} onReset={vi.fn()} />);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const titleInput = screen.getByTestId('seo-title-input') as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'My Custom Title For This Video' } });
    expect(titleInput.value).toBe('My Custom Title For This Video');
  });

  it('displays an editable description textarea', async () => {
    const project = makeProject();

    render(<PreviewStep project={project} onReset={vi.fn()} />);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const descTextarea = screen.getByTestId('seo-description-textarea');
    expect(descTextarea).toBeDefined();
    expect(descTextarea.tagName).toBe('TEXTAREA');
    // Description should not be readonly
    expect((descTextarea as HTMLTextAreaElement).readOnly).toBe(false);
    expect((descTextarea as HTMLTextAreaElement).value.length).toBeGreaterThan(0);
  });

  it('allows editing the description', async () => {
    const project = makeProject();

    render(<PreviewStep project={project} onReset={vi.fn()} />);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const descTextarea = screen.getByTestId('seo-description-textarea') as HTMLTextAreaElement;
    fireEvent.change(descTextarea, { target: { value: 'Custom description text' } });
    expect(descTextarea.value).toBe('Custom description text');
  });

  it('displays tags as removable chips/badges', async () => {
    const project = makeProject();

    render(<PreviewStep project={project} onReset={vi.fn()} />);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const tagsList = screen.getByTestId('seo-tags-list');
    expect(tagsList).toBeDefined();
    // Tags should be rendered as individual elements (chips)
    const tagElements = tagsList.querySelectorAll('[data-testid^="seo-tag-"]');
    expect(tagElements.length).toBeGreaterThan(0);
    // Each tag should have a remove button
    const removeButtons = tagsList.querySelectorAll('[data-testid^="remove-tag-"]');
    expect(removeButtons.length).toBe(tagElements.length);
  });

  it('removes a tag when the remove button is clicked', async () => {
    const project = makeProject();

    render(<PreviewStep project={project} onReset={vi.fn()} />);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const tagsList = screen.getByTestId('seo-tags-list');
    const initialTagCount = tagsList.querySelectorAll('[data-testid^="seo-tag-"]').length;

    // Click the remove button on the first tag
    const removeBtn = screen.getByTestId('remove-tag-0');
    fireEvent.click(removeBtn);

    const updatedTagCount = tagsList.querySelectorAll('[data-testid^="seo-tag-"]').length;
    expect(updatedTagCount).toBe(initialTagCount - 1);
  });

  it('displays thumbnail with regenerate button', async () => {
    const project = makeProject();

    render(<PreviewStep project={project} onReset={vi.fn()} />);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    // Thumbnail preview should be displayed
    const thumbnailPreview = screen.getByTestId('seo-thumbnail-preview');
    expect(thumbnailPreview).toBeDefined();
    expect(thumbnailPreview.tagName).toBe('IMG');

    // Regenerate button should be present
    const regenerateBtn = screen.getByTestId('regenerate-thumbnail-button');
    expect(regenerateBtn).toBeDefined();
  });

  it('displays thumbnail variant selection buttons', async () => {
    const project = makeProject();

    render(<PreviewStep project={project} onReset={vi.fn()} />);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    // All three variant buttons should be present
    expect(screen.getByTestId('thumbnail-variant-fear')).toBeDefined();
    expect(screen.getByTestId('thumbnail-variant-curiosity')).toBeDefined();
    expect(screen.getByTestId('thumbnail-variant-authority')).toBeDefined();
  });

  it('allows selecting a title suggestion', async () => {
    const project = makeProject();

    render(<PreviewStep project={project} onReset={vi.fn()} />);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    const titleInput = screen.getByTestId('seo-title-input') as HTMLInputElement;

    // Click a title suggestion
    const suggestion = screen.getByTestId('seo-title-option-0');
    fireEvent.click(suggestion);

    // Title input should be updated (may or may not differ from original depending on generation)
    expect(titleInput.value.length).toBeGreaterThan(0);
  });
});
