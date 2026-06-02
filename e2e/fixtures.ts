import type { Page, Route } from '@playwright/test';
import {
  MOCK_SCRIPT_SEGMENTS,
  MOCK_LONG_SCRIPT_SEGMENTS,
  mockOpenRouterHttpBody,
} from './openRouterMock.mjs';

/** Dummy key so generateScript passes; OpenRouter is mocked in tests. */
export const E2E_OPENROUTER_KEY = 'sk-or-v1-e2e-test-key-not-real';

export { MOCK_SCRIPT_SEGMENTS, MOCK_LONG_SCRIPT_SEGMENTS };

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

/**
 * Context-aware OpenRouter mock — routing rules documented in e2e/openRouterMock.mjs.
 * Signatures mirror production prompts; blind/title routes require full system phrases
 * to avoid false positives from segment titles or visualNote fields.
 */
export async function installOpenRouterMock(
  page: Page,
  scriptSegments: typeof MOCK_SCRIPT_SEGMENTS = MOCK_SCRIPT_SEGMENTS,
): Promise<void> {
  await page.route('**/openrouter.ai/**', async (route: Route) => {
    let body: string;
    try {
      const post = route.request().postDataJSON() as {
        model?: string;
        messages?: { role: string; content: string }[];
      } | null;
      body = mockOpenRouterHttpBody(post, scriptSegments);
    } catch {
      body = mockOpenRouterHttpBody(null, scriptSegments);
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

/** Long-form mocks for full topic → -final.mp4 pipeline (Real Pass #6). */
export async function installFullPipelineFixtures(page: Page): Promise<void> {
  await dismissOnboarding(page);
  await installOpenRouterMock(page, MOCK_LONG_SCRIPT_SEGMENTS);
  await installMediaMocks(page);
}
