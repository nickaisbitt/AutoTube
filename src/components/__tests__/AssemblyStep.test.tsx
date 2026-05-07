import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AssemblyStep from '../AssemblyStep';
import type { VideoProject } from '../../types';
import { MUSIC_PRESETS } from '../../services/audioMixer';

// ---------------------------------------------------------------------------
// Task 11.2: Unit tests for AssemblyStep music controls
// Feature: video-quality-max
// **Validates: Requirements 3.5, 3.6**
// ---------------------------------------------------------------------------

function makeProject(overrides?: Partial<VideoProject>): VideoProject {
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
    ...overrides,
  };
}

const defaultProps = {
  status: 'idle' as const,
  progress: 0,
  message: '',
  onAssemble: vi.fn(),
  onNext: vi.fn(),
  onCancel: vi.fn(),
  onRetry: vi.fn(),
};

describe('AssemblyStep music controls', () => {
  it('renders background music toggle in ready state', () => {
    render(<AssemblyStep {...defaultProps} project={makeProject()} />);
    const toggle = screen.getByTestId('bg-music-toggle');
    expect(toggle).toBeTruthy();
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
  });

  it('toggles background music off and on', () => {
    render(<AssemblyStep {...defaultProps} project={makeProject()} />);
    const toggle = screen.getByTestId('bg-music-toggle');

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(toggle.textContent).toContain('Background Music OFF');

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(toggle.textContent).toContain('Background Music ON');
  });

  it('renders music mood preset selector when music is enabled', () => {
    render(<AssemblyStep {...defaultProps} project={makeProject()} />);
    const selector = screen.getByTestId('music-preset-selector');
    expect(selector).toBeTruthy();

    // All 3 presets should be visible
    for (const preset of MUSIC_PRESETS) {
      expect(screen.getByTestId(`music-preset-${preset.id}`)).toBeTruthy();
    }
  });

  it('hides music preset selector when music is disabled', () => {
    render(<AssemblyStep {...defaultProps} project={makeProject()} />);
    const toggle = screen.getByTestId('bg-music-toggle');

    fireEvent.click(toggle); // disable music
    expect(screen.queryByTestId('music-preset-selector')).toBeNull();
  });

  it('defaults to neutral preset', () => {
    render(<AssemblyStep {...defaultProps} project={makeProject()} />);
    const neutralBtn = screen.getByTestId('music-preset-neutral');
    expect(neutralBtn.getAttribute('aria-pressed')).toBe('true');
  });

  it('allows selecting different music presets', () => {
    render(<AssemblyStep {...defaultProps} project={makeProject()} />);

    const tenseBtn = screen.getByTestId('music-preset-tense');
    fireEvent.click(tenseBtn);
    expect(tenseBtn.getAttribute('aria-pressed')).toBe('true');

    const upliftingBtn = screen.getByTestId('music-preset-uplifting');
    fireEvent.click(upliftingBtn);
    expect(upliftingBtn.getAttribute('aria-pressed')).toBe('true');
    expect(tenseBtn.getAttribute('aria-pressed')).toBe('false');
  });

  it('passes backgroundMusic and musicPreset to onAssemble', () => {
    const onAssemble = vi.fn();
    render(<AssemblyStep {...defaultProps} project={makeProject()} onAssemble={onAssemble} />);

    // Select tense preset
    fireEvent.click(screen.getByTestId('music-preset-tense'));

    // Click assemble
    fireEvent.click(screen.getByTestId('assemble-video-button'));
    expect(onAssemble).toHaveBeenCalledWith({ backgroundMusic: true, musicPreset: 'tense' });
  });

  it('passes musicPreset as undefined when music is disabled', () => {
    const onAssemble = vi.fn();
    render(<AssemblyStep {...defaultProps} project={makeProject()} onAssemble={onAssemble} />);

    // Disable music
    fireEvent.click(screen.getByTestId('bg-music-toggle'));

    // Click assemble
    fireEvent.click(screen.getByTestId('assemble-video-button'));
    expect(onAssemble).toHaveBeenCalledWith({ backgroundMusic: false, musicPreset: undefined });
  });

  it('does not show music controls when video is already rendered', () => {
    const project = makeProject({ thumbnail: 'blob:http://localhost/thumb' });
    render(<AssemblyStep {...defaultProps} project={project} />);

    expect(screen.queryByTestId('bg-music-toggle')).toBeNull();
    expect(screen.queryByTestId('music-preset-selector')).toBeNull();
  });

  it('does not show music controls during processing', () => {
    render(<AssemblyStep {...defaultProps} project={makeProject()} status="processing" progress={50} message="Rendering segment 1/3" />);

    expect(screen.queryByTestId('bg-music-toggle')).toBeNull();
    expect(screen.queryByTestId('music-preset-selector')).toBeNull();
  });
});
