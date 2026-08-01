import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import NarrationStep from '../NarrationStep';
import type { VideoProject } from '../../types';

function makeProject(): VideoProject {
  return {
    version: 1,
    id: 'p1',
    title: 'T',
    topic: 'T',
    style: 'business_insider',
    targetDuration: 30,
    script: [
      { id: 'seg-1', type: 'intro', title: 'Intro', narration: 'Hello world narration text here', visualNote: 'v', duration: 5 },
    ],
    media: [],
    narration: [
      {
        id: 'clip-1',
        segmentId: 'seg-1',
        text: 'Hello world narration text here for the clip preview',
        voice: 'Leo',
        duration: 5,
        status: 'ready',
      },
    ],
    status: 'draft',
    createdAt: new Date(),
  };
}

describe('NarrationStep CTA', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('labels next step as Continue to AI Edit with unique testid', () => {
    const onNext = vi.fn();
    render(
      <NarrationStep
        project={makeProject()}
        status="complete"
        progress={100}
        message=""
        onGenerateNarration={vi.fn()}
        onNext={onNext}
      />,
    );

    const btn = screen.getByTestId('continue-to-ai-edit-button');
    expect(btn.textContent).toMatch(/Continue to AI Edit/i);
    expect(screen.queryByTestId('assemble-video-button')).toBeNull();

    fireEvent.click(btn);
    expect(onNext).toHaveBeenCalled();
  });
});
