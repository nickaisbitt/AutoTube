import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
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
