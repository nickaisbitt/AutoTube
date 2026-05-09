import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import ScriptStep, { SCRIPT_STATUS_MESSAGES } from '../../components/ScriptStep';
import type { VideoProject } from '../../types';

// ---------------------------------------------------------------------------
// Task 3.5: Unit test verifying ScriptStep rotating status messages
// Feature: pipeline-reliability-fixes
// **Validates: Requirements 2.4**
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

describe('ScriptStep rotating status messages', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('displays the first status message initially when processing', () => {
    render(
      <ScriptStep
        project={makeProject()}
        status="processing"
        progress={25}
        message="Generating..."
        onNext={vi.fn()}
      />,
    );

    const el = screen.getByTestId('rotating-status');
    expect(el.textContent).toBe(SCRIPT_STATUS_MESSAGES[0]);
  });

  it('rotates to the second message after 3 seconds', () => {
    render(
      <ScriptStep
        project={makeProject()}
        status="processing"
        progress={25}
        message="Generating..."
        onNext={vi.fn()}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    const el = screen.getByTestId('rotating-status');
    expect(el.textContent).toBe(SCRIPT_STATUS_MESSAGES[1]);
  });

  it('rotates to the third message after 6 seconds', () => {
    render(
      <ScriptStep
        project={makeProject()}
        status="processing"
        progress={25}
        message="Generating..."
        onNext={vi.fn()}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    const el = screen.getByTestId('rotating-status');
    expect(el.textContent).toBe(SCRIPT_STATUS_MESSAGES[2]);
  });

  it('wraps around after cycling through all messages', () => {
    render(
      <ScriptStep
        project={makeProject()}
        status="processing"
        progress={25}
        message="Generating..."
        onNext={vi.fn()}
      />,
    );

    // Advance through all messages (length * 3000ms)
    for (let i = 0; i < SCRIPT_STATUS_MESSAGES.length; i++) {
      act(() => {
        vi.advanceTimersByTime(3000);
      });
    }

    // After a full cycle, it should wrap back to the first message
    const el = screen.getByTestId('rotating-status');
    expect(el.textContent).toBe(SCRIPT_STATUS_MESSAGES[0]);
  });
});


// ---------------------------------------------------------------------------
// Task 11.3: Hook highlighting in ScriptStep
// Feature: video-quality-max
// **Validates: Requirements 4.6**
// ---------------------------------------------------------------------------

function makeProjectWithIntro(narration: string): VideoProject {
  return {
    version: 1,
    id: 'proj-hook-test',
    title: 'Hook Test Video',
    topic: 'AI Revolution',
    style: 'business_insider',
    targetDuration: 8,
    script: [
      {
        id: 'seg-intro',
        type: 'intro',
        title: 'Introduction',
        narration,
        visualNote: 'Show dramatic visuals',
        duration: 20,
      },
      {
        id: 'seg-section',
        type: 'section',
        title: 'Main Content',
        narration: 'This is the main content section with details about the topic.',
        visualNote: 'Show charts',
        duration: 30,
      },
    ],
    media: [],
    narration: [],
    status: 'complete',
    createdAt: new Date(),
  };
}

describe('ScriptStep hook highlighting', () => {
  it('displays a hook badge for intro segments with a detected hook pattern', () => {
    // Narration with a surprising statistic (contains percentage)
    const narration =
      'In the last year alone, AI adoption has surged by 300%, transforming industries across the globe. ' +
      'Most companies are scrambling to keep up with this unprecedented wave of technological change. ' +
      'The implications for workers and businesses are staggering and far-reaching in ways few anticipated.';

    const project = makeProjectWithIntro(narration);
    render(
      <ScriptStep
        project={project}
        status="complete"
        progress={100}
        message=""
        onNext={vi.fn()}
      />,
    );

    const badge = screen.getByTestId('hook-badge');
    expect(badge).toBeDefined();
    expect(badge.textContent).toContain('Hook:');
    expect(badge.textContent).toContain('Surprising Statistic');
  });

  it('applies distinct visual highlighting (amber border) to intro hook segments', () => {
    const narration =
      'What if everything you believed about artificial intelligence was completely wrong? ' +
      'The truth behind the hype is far more nuanced than most people realize today. ' +
      'In this video we explore the hidden reality that challenges conventional wisdom about machine learning.';

    const project = makeProjectWithIntro(narration);
    render(
      <ScriptStep
        project={project}
        status="complete"
        progress={100}
        message=""
        onNext={vi.fn()}
      />,
    );

    const hookSegment = screen.getByTestId('hook-segment');
    expect(hookSegment.className).toContain('border-amber');
  });

  it('shows word count warning when intro is outside 40-60 word target', () => {
    // Short narration (under 40 words)
    const narration = 'AI is growing fast. It will change everything. You need to pay attention now.';

    const project = makeProjectWithIntro(narration);
    render(
      <ScriptStep
        project={project}
        status="complete"
        progress={100}
        message=""
        onNext={vi.fn()}
      />,
    );

    // Expand the intro segment to see the feedback
    const buttons = screen.getAllByRole('button');
    const introButton = buttons.find((btn) => btn.textContent?.includes('Introduction'));
    expect(introButton).toBeDefined();
    fireEvent.click(introButton!);

    const warning = screen.getByTestId('hook-word-count-warning');
    expect(warning).toBeDefined();
    expect(warning.textContent).toContain('Word count:');
    expect(warning.textContent).toContain('target: 40–60');
  });

  it('does not show word count warning when intro is within 40-60 word target', () => {
    // Exactly within range (about 50 words)
    const narration =
      'In the last year alone, AI adoption has surged by 300%, transforming industries across the globe. ' +
      'Most companies are scrambling to keep up with this unprecedented wave of technological change. ' +
      'The implications for workers and businesses are staggering and far-reaching in ways few anticipated.';

    const project = makeProjectWithIntro(narration);
    render(
      <ScriptStep
        project={project}
        status="complete"
        progress={100}
        message=""
        onNext={vi.fn()}
      />,
    );

    // Expand the intro segment
    const buttons = screen.getAllByRole('button');
    const introButton = buttons.find((btn) => btn.textContent?.includes('Introduction'));
    fireEvent.click(introButton!);

    expect(screen.queryByTestId('hook-word-count-warning')).toBeNull();
  });

  it('does not show hook badge for non-intro segments', () => {
    const narration =
      'In the last year alone, AI adoption has surged by 300%, transforming industries across the globe. ' +
      'Most companies are scrambling to keep up with this unprecedented wave of change.';

    const project = makeProjectWithIntro(narration);
    render(
      <ScriptStep
        project={project}
        status="complete"
        progress={100}
        message=""
        onNext={vi.fn()}
      />,
    );

    // There should be exactly one hook badge (for the intro), not for the section segment
    const badges = screen.getAllByTestId('hook-badge');
    expect(badges.length).toBe(1);
  });

  it('shows hook feedback panel when intro segment is expanded', () => {
    const narration =
      'In the last year alone, AI adoption has surged by 300%, transforming industries across the globe. ' +
      'Most companies are scrambling to keep up with this unprecedented wave of technological change. ' +
      'The implications for workers and businesses are staggering and far-reaching in ways few anticipated.';

    const project = makeProjectWithIntro(narration);
    render(
      <ScriptStep
        project={project}
        status="complete"
        progress={100}
        message=""
        onNext={vi.fn()}
      />,
    );

    // Expand the intro segment
    const buttons = screen.getAllByRole('button');
    const introButton = buttons.find((btn) => btn.textContent?.includes('Introduction'));
    fireEvent.click(introButton!);

    const feedback = screen.getByTestId('hook-feedback');
    expect(feedback).toBeDefined();
    expect(feedback.textContent).toContain('Hook Analysis');
    expect(feedback.textContent).toContain('Pattern detected');
  });
});


// ---------------------------------------------------------------------------
// Task 1.3: ScriptStep regenerate button unit tests
// Feature: remaining-improvements
// **Validates: Requirements 1.1, 1.2, 1.3, 1.5, 1.6**
// ---------------------------------------------------------------------------

describe('ScriptStep regenerate button', () => {
  it('renders the Regenerate button only when status is complete and onRegenerate is provided', () => {
    const { rerender } = render(
      <ScriptStep
        project={makeProjectWithIntro('Test narration content that is in the right word range.')}
        status="complete"
        progress={100}
        message=""
        onNext={vi.fn()}
        onRegenerate={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: /regenerate script/i })).toBeDefined();

    rerender(
      <ScriptStep
        project={makeProjectWithIntro('Test narration content that is in the right word range.')}
        status="complete"
        progress={100}
        message=""
        onNext={vi.fn()}
        onRegenerate={undefined}
      />,
    );

    expect(screen.queryByRole('button', { name: /regenerate script/i })).toBeNull();
  });

  it('renders the Regenerate button only when status is complete, not when processing', () => {
    render(
      <ScriptStep
        project={makeProject()}
        status="processing"
        progress={50}
        message="Generating..."
        onNext={vi.fn()}
        onRegenerate={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: /regenerate script/i })).toBeNull();
  });

  it('calls onRegenerate when the Regenerate button is clicked', () => {
    const onRegenerate = vi.fn();
    render(
      <ScriptStep
        project={makeProjectWithIntro('Test narration content that is in the right word range.')}
        status="complete"
        progress={100}
        message=""
        onNext={vi.fn()}
        onRegenerate={onRegenerate}
      />,
    );

    const button = screen.getByRole('button', { name: /regenerate script/i });
    fireEvent.click(button);

    expect(onRegenerate).toHaveBeenCalledTimes(1);
  });

  it('renders the Regenerate button with the RefreshCw icon and correct text', () => {
    render(
      <ScriptStep
        project={makeProjectWithIntro('Test narration content that is in the right word range.')}
        status="complete"
        progress={100}
        message=""
        onNext={vi.fn()}
        onRegenerate={vi.fn()}
      />,
    );

    const button = screen.getByRole('button', { name: /regenerate script/i });
    expect(button).toBeDefined();
    expect(button.textContent).toContain('Regenerate');
  });

  it('is disabled when status is processing', () => {
    render(
      <ScriptStep
        project={makeProject()}
        status="processing"
        progress={50}
        message="Generating..."
        onNext={vi.fn()}
        onRegenerate={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: /regenerate script/i })).toBeNull();
  });
});
