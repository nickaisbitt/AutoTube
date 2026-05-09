import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import MediaStep, { MEDIA_STATUS_MESSAGES, parseMediaMessage } from '../../components/MediaStep';
import type { VideoProject } from '../../types';

// ---------------------------------------------------------------------------
// Task 3.6: Unit test verifying MediaStep rotating status messages,
//           dynamic message display, and parseMediaMessage function
// Feature: pipeline-reliability-fixes
// **Validates: Requirements 2.5**
// ---------------------------------------------------------------------------

function makeProject(): VideoProject {
  return {
    version: 1,
    id: 'proj-test',
    title: 'Test Video',
    topic: 'Test Topic',
    style: 'business_insider',
    targetDuration: 8,
    script: [],
    media: [],
    narration: [],
    status: 'draft',
    createdAt: new Date(),
  };
}

const defaultProps = {
  project: makeProject(),
  status: 'processing' as const,
  progress: 25,
  message: '',
  onNext: vi.fn(),
  onReplace: vi.fn(),
  onRetry: vi.fn(),
};

// ── Rotating status messages ────────────────────────────────────────────────

describe('MediaStep rotating status messages', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('displays the first status message initially when processing', () => {
    render(<MediaStep {...defaultProps} />);

    const el = screen.getByTestId('rotating-status');
    expect(el.textContent).toBe(MEDIA_STATUS_MESSAGES[0]);
  });

  it('rotates to the second message after 3 seconds', () => {
    render(<MediaStep {...defaultProps} />);

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    const el = screen.getByTestId('rotating-status');
    expect(el.textContent).toBe(MEDIA_STATUS_MESSAGES[1]);
  });

  it('rotates to the third message after 6 seconds', () => {
    render(<MediaStep {...defaultProps} />);

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    const el = screen.getByTestId('rotating-status');
    expect(el.textContent).toBe(MEDIA_STATUS_MESSAGES[2]);
  });

  it('wraps around after cycling through all messages', () => {
    render(<MediaStep {...defaultProps} />);

    for (let i = 0; i < MEDIA_STATUS_MESSAGES.length; i++) {
      act(() => {
        vi.advanceTimersByTime(3000);
      });
    }

    const el = screen.getByTestId('rotating-status');
    expect(el.textContent).toBe(MEDIA_STATUS_MESSAGES[0]);
  });
});

// ── Dynamic message display ─────────────────────────────────────────────────

describe('MediaStep dynamic message display', () => {
  it('displays parsed beat label, segment, and action for a valid message', () => {
    render(
      <MediaStep
        {...defaultProps}
        message="[HOOK] Tesla stock chart — harvesting…"
      />,
    );

    const el = screen.getByTestId('dynamic-message');
    expect(el.textContent).toContain('HOOK');
    expect(el.textContent).toContain('Tesla stock chart');
    expect(el.textContent).toContain('harvesting…');
  });

  it('displays fallback text when message is empty', () => {
    render(<MediaStep {...defaultProps} message="" />);

    const el = screen.getByTestId('dynamic-message');
    expect(el.textContent).toBe(
      'Planning visual concepts and harvesting matching imagery...',
    );
  });

  it('displays fallback text when message does not match the pattern', () => {
    render(<MediaStep {...defaultProps} message="just a plain message" />);

    const el = screen.getByTestId('dynamic-message');
    expect(el.textContent).toBe('just a plain message');
  });
});

// ── parseMediaMessage unit tests ────────────────────────────────────────────

describe('parseMediaMessage', () => {
  it('parses a valid message into beat label, segment, and action', () => {
    const result = parseMediaMessage('[HOOK] Tesla stock chart — harvesting…');
    expect(result).toEqual({
      beatLabel: 'HOOK',
      segment: 'Tesla stock chart',
      action: 'harvesting…',
    });
  });

  it('returns null for a plain message without the expected format', () => {
    expect(parseMediaMessage('just a plain message')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(parseMediaMessage('')).toBeNull();
  });
});


// ---------------------------------------------------------------------------
// Task 2.2: MediaStep replace button visibility tests
// Feature: remaining-improvements
// **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6**
// ---------------------------------------------------------------------------

function makeProjectWithMedia(): VideoProject {
  return {
    version: 1,
    id: 'proj-media-test',
    title: 'Media Test Video',
    topic: 'Test Topic',
    style: 'business_insider',
    targetDuration: 8,
    script: [
      {
        id: 'seg-1',
        type: 'intro',
        title: 'Introduction',
        narration: 'This is the intro narration text.',
        visualNote: 'Show visuals',
        duration: 20,
      },
      {
        id: 'seg-2',
        type: 'section',
        title: 'Main Content',
        narration: 'This is the main content section.',
        visualNote: 'Show charts',
        duration: 30,
      },
    ],
    media: [
      {
        id: 'asset-1',
        segmentId: 'seg-1',
        url: 'https://example.com/image1.jpg',
        alt: 'Test image 1',
        type: 'image' as const,
        source: 'DuckDuckGo',
        isFallback: false,
        score: 85,
      },
      {
        id: 'asset-2',
        segmentId: 'seg-2',
        url: 'https://example.com/image2.jpg',
        alt: 'Test image 2',
        type: 'image' as const,
        source: 'Pexels',
        isFallback: true,
        score: 60,
      },
    ],
    narration: [],
    status: 'complete',
    createdAt: new Date(),
  };
}

describe('MediaStep replace button visibility', () => {
  it('renders the Replace button in the card body without hover interaction', () => {
    render(
      <MediaStep
        {...defaultProps}
        project={makeProjectWithMedia()}
        status="complete"
        onReplace={vi.fn()}
      />,
    );

    const bodyButtons = screen.queryAllByRole('button', { name: /replace visual for/i });
    expect(bodyButtons.length).toBeGreaterThan(0);
  });

it('calls onReplace with the correct asset ID when the Replace button is clicked', () => {
    const onReplace = vi.fn().mockResolvedValue(undefined);
    render(
      <MediaStep
        {...defaultProps}
        project={makeProjectWithMedia()}
        status="complete"
        onReplace={onReplace}
      />,
    );

    const replaceButtons = screen.getAllByRole('button', { name: /replace visual for/i });
    fireEvent.click(replaceButtons[0]);

    expect(onReplace).toHaveBeenCalledWith('asset-1');
  });

  it('shows loading state with spinner and disables button for the specific card being replaced', async () => {
    const onReplace = vi.fn().mockImplementation(() => new Promise<void>((r) => { setTimeout(r, 10); }));
    render(
      <MediaStep
        {...defaultProps}
        project={makeProjectWithMedia()}
        status="complete"
        onReplace={onReplace}
      />,
    );

    const replaceButtons = screen.getAllByRole('button', { name: /replace visual for/i });
    fireEvent.click(replaceButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Re-harvesting…')).toBeDefined();
    });
    expect(replaceButtons[0].disabled).toBe(true);
  });

  it('displays inline error message on the affected card when replace fails', async () => {
    const onReplace = vi.fn().mockRejectedValue(new Error('Network error'));
    render(
      <MediaStep
        {...defaultProps}
        project={makeProjectWithMedia()}
        status="complete"
        onReplace={onReplace}
      />,
    );

    const replaceButtons = screen.getAllByRole('button', { name: /replace visual for/i });
    fireEvent.click(replaceButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeDefined();
    });
  });

  it('shows spinner only on the specific card being replaced, not all cards', async () => {
    const onReplace = vi.fn().mockImplementation(() => new Promise<void>((r) => { setTimeout(r, 10); }));
    render(
      <MediaStep
        {...defaultProps}
        project={makeProjectWithMedia()}
        status="complete"
        onReplace={onReplace}
      />,
    );

    const replaceButtons = screen.getAllByRole('button', { name: /replace visual for/i });
    fireEvent.click(replaceButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Re-harvesting…')).toBeDefined();
    });

    const spinners = screen.getAllByText('Re-harvesting…');
    expect(spinners.length).toBe(1);
  });

  it('Replace button is re-enabled after replace completes', async () => {
    const onReplace = vi.fn().mockImplementation(() => new Promise<void>((r) => { setTimeout(r, 10); }));
    render(
      <MediaStep
        {...defaultProps}
        project={makeProjectWithMedia()}
        status="complete"
        onReplace={onReplace}
      />,
    );

    const replaceButtons = screen.getAllByRole('button', { name: /replace visual for/i });
    fireEvent.click(replaceButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Re-harvesting…')).toBeDefined();
    });

    await waitFor(() => {
      expect(screen.queryByText('Re-harvesting…')).toBeNull();
    });

    expect(replaceButtons[0].disabled).toBe(false);
  });

  it('shows loading state with spinner and disables button for the specific card being replaced', async () => {
    let resolveReplace: () => void;
    const onReplace = vi.fn().mockImplementation(() => new Promise<void>((r) => { resolveReplace = r; }));
    render(
      <MediaStep
        {...defaultProps}
        project={makeProjectWithMedia()}
        status="complete"
        onReplace={onReplace}
      />,
    );

    const replaceButtons = screen.getAllByRole('button', { name: /replace visual for/i });

    fireEvent.click(replaceButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Re-harvesting…')).toBeDefined();
    });
    expect(replaceButtons[0].disabled).toBe(true);
  });

  it('displays inline error message on the affected card when replace fails', async () => {
    const onReplace = vi.fn().mockRejectedValue(new Error('Network error'));
    render(
      <MediaStep
        {...defaultProps}
        project={makeProjectWithMedia()}
        status="complete"
        onReplace={onReplace}
      />,
    );

    const replaceButtons = screen.getAllByRole('button', { name: /replace visual for/i });
    fireEvent.click(replaceButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeDefined();
    });
  });

  it('shows spinner only on the specific card being replaced, not all cards', async () => {
    let resolveReplace: () => void;
    const onReplace = vi.fn().mockImplementation(() => new Promise<void>((r) => { resolveReplace = r; }));
    render(
      <MediaStep
        {...defaultProps}
        project={makeProjectWithMedia()}
        status="complete"
        onReplace={onReplace}
      />,
    );

    const replaceButtons = screen.getAllByRole('button', { name: /replace visual for/i });
    fireEvent.click(replaceButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Re-harvesting…')).toBeDefined();
    });

    const spinners = screen.getAllByText('Re-harvesting…');
    expect(spinners.length).toBe(1);
  });

  it('Replace button is re-enabled after replace completes', async () => {
    let resolveReplace: () => void;
    const onReplace = vi.fn().mockImplementation(() => new Promise<void>((r) => { resolveReplace = r; }));
    render(
      <MediaStep
        {...defaultProps}
        project={makeProjectWithMedia()}
        status="complete"
        onReplace={onReplace}
      />,
    );

    const replaceButtons = screen.getAllByRole('button', { name: /replace visual for/i });
    fireEvent.click(replaceButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Re-harvesting…')).toBeDefined();
    });

    resolveReplace!();

    await waitFor(() => {
      expect(screen.queryByText('Re-harvesting…')).toBeNull();
    });

    expect(replaceButtons[0].disabled).toBe(false);
  });
});
