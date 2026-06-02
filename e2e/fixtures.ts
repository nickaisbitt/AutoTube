import type { Page, Route } from '@playwright/test';

/** Dummy key so generateScript passes; OpenRouter is mocked in tests. */
export const E2E_OPENROUTER_KEY = 'sk-or-v1-e2e-test-key-not-real';

/** Compact script fixture — 3 segments for fast E2E / renders. */
export const MOCK_SCRIPT_SEGMENTS = [
  {
    type: 'intro',
    title: 'Introduction',
    narration:
      'In 2024, hospitals paid $2.3 billion in ransomware settlements. Your bank account could be drained in seconds by a single phishing click. In this video we break down how AI is changing healthcare — and what it means for your money, your records, and your family.',
    visualNote: 'Worried person at laptop, hospital corridor',
    duration: 22,
  },
  {
    type: 'section',
    title: 'The Threat',
    narration:
      'Epic Systems and UnitedHealth lost patient data access during major cyber incidents. AI tools can spot attacks 40% faster than humans — but criminals also use ChatGPT to target your identity and medical files at scale.',
    visualNote: 'Hospital data breach headline, security dashboard',
    duration: 24,
  },
  {
    type: 'outro',
    title: 'Protect Yourself',
    narration:
      'Here are three steps to protect your medical records starting today: enable two-factor authentication, audit app permissions, and ask your provider what AI tools touch your data. The FDA cleared 950 AI medical devices in 2025.',
    visualNote: 'Checklist on screen, person relieved',
    duration: 20,
  },
];

export async function dismissOnboarding(page: Page): Promise<void> {
  await page.addInitScript((key: string) => {
    localStorage.setItem('autotube_onboarding_seen', 'true');
    localStorage.removeItem('autotube_project');
    try {
      sessionStorage.setItem(
        'autotube_config_session',
        JSON.stringify({ openRouterKey: key, sourceType: 'stock', flickrKey: '', ttsVoice: 'Leo' }),
      );
    } catch {
      /* ignore */
    }
  }, E2E_OPENROUTER_KEY);
}

function openRouterCompletion(content: string, model = 'openai/gpt-5.4-nano') {
  return JSON.stringify({
    id: `mock-${Date.now()}`,
    model,
    choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }],
  });
}

/** Context-aware OpenRouter mock for script, refine, titles, visual director, blind review. */
export async function installOpenRouterMock(page: Page): Promise<void> {
  await page.route('**/openrouter.ai/**', async (route: Route) => {
    let body = '';
    try {
      const post = route.request().postDataJSON() as {
        model?: string;
        messages?: { role: string; content: string }[];
      } | null;
      const text = (post?.messages ?? []).map((m) => m.content).join('\n').toLowerCase();
      const model = post?.model ?? 'openai/gpt-5.4-nano';

      let content = JSON.stringify({ segments: MOCK_SCRIPT_SEGMENTS });

      if (text.includes('youtube title optimization expert')) {
        content = JSON.stringify({
          direct: 'AI Healthcare: What You Must Know',
          curiosityGap: 'The AI Healthcare Risk Nobody Warns You About',
          emotionalUrgent: 'Your Medical Records Are Not Safe',
        });
      } else if (text.includes('pinned comment') && text.includes('json')) {
        content = JSON.stringify({
          comments: [{ text: 'What surprised you most?', type: 'question_prompt' }],
        });
      } else if (text.includes('hashtag') && (text.includes('generate') || text.includes('seo expert'))) {
        content = JSON.stringify({ hashtags: ['#AI', '#Healthcare', '#CyberSecurity'] });
      } else if (text.includes('playlist strategist') || text.includes('series metadata')) {
        content = JSON.stringify({
          seriesName: 'Healthcare AI Deep Dive',
          episodeNumber: 1,
          playlistDescription: 'Exploring AI in modern healthcare.',
          episodeTitle: 'Ep. 1: AI Healthcare Risks',
        });
      } else if (text.includes('blind review') && text.includes('thumbnaileffectiveness')) {
        content = JSON.stringify({
          scores: {
            visualQuality: 8,
            pacing: 8,
            narrativeClarity: 8,
            thumbnailEffectiveness: 8,
            overallProductionValue: 8,
          },
          feedback: {
            visualQuality: 'Strong',
            pacing: 'Good',
            narrativeClarity: 'Clear',
            thumbnailEffectiveness: 'Effective',
            overallProductionValue: 'Professional',
          },
          letterGrade: 'B+',
          summary: 'Solid explainer with clear hook.',
        });
      } else if (text.includes('visual director') || text.includes('segment visual plan')) {
        content = JSON.stringify({
          beat: 'hook',
          concepts: [{ description: 'Hospital security breach', searchTerms: ['hospital cybersecurity'] }],
          classification: 'personal',
        });
      } else if (
        text.includes('return only a valid json array') ||
        text.includes('json array of segments') ||
        text.includes('polish this script') ||
        text.includes('trim this script') ||
        text.includes('specificity issues')
      ) {
        content = JSON.stringify(MOCK_SCRIPT_SEGMENTS);
      }

      body = openRouterCompletion(content, model);
    } catch {
      body = openRouterCompletion(JSON.stringify({ segments: MOCK_SCRIPT_SEGMENTS }));
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body });
  });
}

/** Fast media / Wikipedia / image mocks (from user-journey.spec.ts). */
export async function installMediaMocks(page: Page): Promise<void> {
  await page.route(/\/api\/(?:search|search-bing-images|search-google-images|search-bing-videos|search-google-videos|search-videos|static-map|press-release|search-bing-news|proxy-page).*/, async (route) => {
    const url = route.request().url();
    if (url.includes('static-map')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          url: 'https://picsum.photos/id/20/1920/1080',
          thumbnailUrl: 'https://picsum.photos/id/20/200/150',
        }),
      });
    } else if (url.includes('press-release') || url.includes('search-bing-news') || url.includes('proxy-page')) {
      await route.fulfill({ status: 200, contentType: 'text/html', body: '' });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          results: [
            {
              url: 'https://picsum.photos/id/10/1920/1080',
              image: 'https://picsum.photos/id/10/1920/1080',
              thumbnailUrl: 'https://picsum.photos/id/10/200/150',
              source: 'Mock',
              title: 'Healthcare technology',
              alt: 'Healthcare technology',
              width: 1920,
              height: 1080,
              type: 'image',
            },
            {
              url: 'https://picsum.photos/id/11/1920/1080',
              image: 'https://picsum.photos/id/11/1920/1080',
              thumbnailUrl: 'https://picsum.photos/id/11/200/150',
              source: 'Mock',
              title: 'Medical data security',
              alt: 'Medical data security',
              width: 1920,
              height: 1080,
              type: 'image',
            },
          ],
        }),
      });
    }
  });

  await page.route(/.*wikipedia\.org.*|.*wikimedia\.org.*/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        query: {
          pages: {
            '1': {
              title: 'Healthcare',
              extract: 'Healthcare and technology.',
            },
          },
        },
      }),
    });
  });

  await page.route(/https:\/\/www\.youtube\.com\/.*/, async (route) => {
    await route.fulfill({ status: 200, contentType: 'text/html', body: '<html></html>' });
  });

  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  );
  await page.route(/.*picsum\.photos.*/, async (route) => {
    await route.fulfill({ status: 200, contentType: 'image/png', body: png });
  });
}

export async function installE2EFixtures(page: Page): Promise<void> {
  await dismissOnboarding(page);
  await installOpenRouterMock(page);
  await installMediaMocks(page);
}
