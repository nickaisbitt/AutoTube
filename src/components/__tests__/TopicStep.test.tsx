import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import TopicStep from '../../components/TopicStep';
import type { TopicConfig } from '../../types';

const defaultConfig: TopicConfig = {
  topic: '',
  style: 'business_insider',
  tone: 'informative',
  targetDuration: 8,
  audience: '',
};

const defaultProps = {
  config: defaultConfig,
  onConfigChange: vi.fn(),
  onGenerate: vi.fn(),
};

describe('TopicStep loading, error, and no-key states', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(global, 'fetch').mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows loading spinner with "Generating fresh topic ideas..." text when fetching', async () => {
    vi.spyOn(global, 'fetch').mockImplementation(() => new Promise(() => {}));
    render(
      <TopicStep
        {...defaultProps}
        config={defaultConfig}
        apiKey="test-key"
      />,
    );

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    expect(screen.getByText('Generating fresh topic ideas...')).toBeDefined();
  });

  it('shows no-API-key state with instruction message', () => {
    render(
      <TopicStep
        {...defaultProps}
        config={defaultConfig}
        apiKey={undefined}
      />,
    );

    expect(screen.getByText(/add an openrouter api key in settings/i)).toBeDefined();
  });

  it('shows error message and Retry button when topic generation fails', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
    } as unknown as Response);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <TopicStep
        {...defaultProps}
        config={defaultConfig}
        apiKey="test-key"
      />,
    );

    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByText(/failed to generate ideas/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /retry/i })).toBeDefined();
  });

  it('clicking Refresh re-invokes topic generation with loading spinner', async () => {
    let resolveCount = 0;
    vi.spyOn(global, 'fetch').mockImplementation(() => {
      resolveCount++;
      if (resolveCount === 1) {
        return Promise.resolve({
          ok: false,
          status: 500,
        } as unknown as Response);
      }
      return new Promise(() => {});
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <TopicStep
        {...defaultProps}
        config={defaultConfig}
        apiKey="test-key"
      />,
    );

    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    const refreshBtn = screen.getByRole('button', { name: /refresh/i });
    fireEvent.click(refreshBtn);

    expect(screen.getByText('Generating...')).toBeDefined();
  });

  it('successful load displays up to 8 topic buttons', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [
            {
              message: {
                content:
                  '```json\n' +
                  JSON.stringify({
                    topics: [
                      { label: 'Topic 1', category: 'Technology' },
                      { label: 'Topic 2', category: 'Finance' },
                      { label: 'Topic 3', category: 'Science' },
                      { label: 'Topic 4', category: 'Environment' },
                      { label: 'Topic 5', category: 'Geopolitics' },
                      { label: 'Topic 6', category: 'Security' },
                      { label: 'Topic 7', category: 'Health' },
                      { label: 'Topic 8', category: 'Culture' },
                    ],
                  }) +
                  '\n```',
              },
            },
          ],
        }),
    } as unknown as Response);

    render(
      <TopicStep
        {...defaultProps}
        config={defaultConfig}
        apiKey="test-key"
      />,
    );

    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    const topicButtons = screen.getAllByTestId(/^suggested-topic-/);
    expect(topicButtons.length).toBe(8);
  });

  it('clicking a suggested topic populates the topic input field', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  topics: [{ label: 'AI Revolution', category: 'Technology' }],
                }),
              },
            },
          ],
        }),
    } as unknown as Response);

    const onConfigChange = vi.fn();
    render(
      <TopicStep
        config={defaultConfig}
        onConfigChange={onConfigChange}
        onGenerate={vi.fn()}
        apiKey="test-key"
      />,
    );

    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    const topicButton = screen.getByTestId('suggested-topic-0');
    fireEvent.click(topicButton);

    expect(onConfigChange).toHaveBeenCalledWith(
      expect.objectContaining({ topic: 'AI Revolution' }),
    );
  });

  it('shows Generate buttons with correct disabled/enabled states', () => {
    const { rerender } = render(
      <TopicStep
        {...defaultProps}
        config={{ ...defaultConfig, topic: '' }}
      />,
    );

    expect(screen.getByTestId('generate-script-only').disabled).toBe(true);

    rerender(
      <TopicStep
        {...defaultProps}
        config={{ ...defaultConfig, topic: 'AI Revolution' }}
      />,
    );

    expect(screen.getByTestId('generate-script-only').disabled).toBe(false);
  });

  it('calls onGenerate when Generate Script Only button is clicked', () => {
    const onGenerate = vi.fn();
    render(
      <TopicStep
        {...defaultProps}
        config={{ ...defaultConfig, topic: 'AI Revolution' }}
        onGenerate={onGenerate}
      />,
    );

    fireEvent.click(screen.getByTestId('generate-script-only'));
    expect(onGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ topic: 'AI Revolution' }),
    );
  });

  it('calls onGenerateFull when Generate Full Video button is clicked', () => {
    const onGenerate = vi.fn();
    const onGenerateFull = vi.fn();
    render(
      <TopicStep
        {...defaultProps}
        config={{ ...defaultConfig, topic: 'AI Revolution' }}
        onGenerate={onGenerate}
        onGenerateFull={onGenerateFull}
      />,
    );

    fireEvent.click(screen.getByTestId('generate-full-video'));
    expect(onGenerateFull).toHaveBeenCalledWith(
      expect.objectContaining({ topic: 'AI Revolution' }),
    );
  });
});