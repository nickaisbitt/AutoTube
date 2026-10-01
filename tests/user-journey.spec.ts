import { test, expect } from '@playwright/test';
import { mkdirSync } from 'fs';

const SCREENSHOT_DIR = '/tmp/autotube-user-test';

test.beforeAll(() => {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('autotube_onboarding_seen', 'true');
  });

  // Mock all visual sourcing APIs to run instantly in E2E tests and avoid slow external network timeouts
  await page.route(/\/api\/(?:search|search-bing-images|search-google-images|search-bing-videos|search-google-videos|search-videos|static-map|press-release|search-bing-news|proxy-page).*/, async (route) => {
    const url = route.request().url();
    if (url.includes('static-map')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          url: 'https://picsum.photos/id/20/800/600',
          thumbnailUrl: 'https://picsum.photos/id/20/200/150'
        }),
      });
    } else if (url.includes('press-release') || url.includes('search-bing-news') || url.includes('proxy-page')) {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '',
      });
    } else {
      // Return standard mock candidate array wrapped in results object with 1080p resolution
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          results: [
            {
              url: 'https://picsum.photos/id/10/1920/1080',
              image: 'https://picsum.photos/id/10/1920/1080',
              thumbnailUrl: 'https://picsum.photos/id/10/200/150',
              thumbnail: 'https://picsum.photos/id/10/200/150',
              source: 'Mock Source',
              title: 'Mock visual asset description',
              alt: 'Mock visual asset description',
              width: 1920,
              height: 1080,
              type: 'image'
            },
            {
              url: 'https://picsum.photos/id/11/1920/1080',
              image: 'https://picsum.photos/id/11/1920/1080',
              thumbnailUrl: 'https://picsum.photos/id/11/200/150',
              thumbnail: 'https://picsum.photos/id/11/200/150',
              source: 'Mock Source',
              title: 'Mock visual asset description 2',
              alt: 'Mock visual asset description 2',
              width: 1920,
              height: 1080,
              type: 'image'
            }
          ]
        }),
      });
    }
  });

  // Mock Wikipedia API to return empty or mock data instantly and avoid external HTTP delays
  await page.route(/.*wikipedia\.org.*/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        query: {
          pages: {
            "123": {
              title: "File:MockImage.jpg",
              imageinfo: [{
                url: "https://picsum.photos/id/10/1920/1080",
                descriptionshorturl: "https://commons.wikimedia.org/wiki/File:MockImage.jpg",
                width: 1920,
                height: 1080
              }]
            }
          }
        }
      })
    });
  });

  // Mock Wikimedia API to avoid external HTTP delays
  await page.route(/.*wikimedia\.org.*/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        query: {
          pages: {
            "123": {
              title: "File:MockImage.jpg",
              imageinfo: [{
                url: "https://picsum.photos/id/10/1920/1080",
                descriptionshorturl: "https://commons.wikimedia.org/wiki/File:MockImage.jpg",
                width: 1920,
                height: 1080
              }]
            }
          }
        }
      })
    });
  });

  // Mock Picsum / Unsplash image fetches to return an instant 1x1 transparent PNG
  await page.route(/.*picsum\.photos.*/, async (route) => {
    const transparentPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    await route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: Buffer.from(transparentPngBase64, 'base64')
    });
  });
});

test('full user journey: topic → script → media → narration → assembly → preview', async ({ page }) => {
  test.setTimeout(600000); // 10 min — render takes ~9-10 min with mocks
  // Ensure clean screenshot dir
  await page.setViewportSize({ width: 1440, height: 900 });

  // 1. Open app
  await page.goto('/');
  await expect(page.getByText('Topic & Config')).toBeVisible({ timeout: 15000 });
  await page.screenshot({ path: `${SCREENSHOT_DIR}/01-topic-page.png` });
  console.log('✅ Step 1: App loaded - Topic page visible');

  // 2. Enter a topic
  const topicInput = page.getByTestId('topic-input');
  await topicInput.fill('The Rise of SpaceX and the Future of Space Travel');

  // Select 3 minute duration (shortest available)
  await page.getByTestId('duration-select').selectOption('3');
  
  await page.screenshot({ path: `${SCREENSHOT_DIR}/02-topic-filled.png` });
  console.log('✅ Step 2: Topic entered, duration set to 3min');

  // 3. Generate script
  const generateBtn = page.getByTestId('generate-script-only');
  await expect(generateBtn).toBeEnabled();
  await generateBtn.click();
  console.log('✅ Step 3: Clicked Generate - waiting for script...');
  await page.screenshot({ path: `${SCREENSHOT_DIR}/03-generating-script.png` });

  // Wait for script to complete (LLM can take up to 90s)
  await expect(page.getByRole('button', { name: /Source Media/i })).toBeVisible({ timeout: 90000 });
  await page.screenshot({ path: `${SCREENSHOT_DIR}/04-script-complete.png` });
  console.log('✅ Step 4: Script generated - Source Media button visible');

  // 5. Source media
  await page.getByRole('button', { name: /Source Media/i }).click();
  console.log('✅ Step 5: Clicked Source Media - harvesting images...');
  await expect(page.getByText('AI Visual Director at Work')).toBeVisible({ timeout: 15000 });
  await page.screenshot({ path: `${SCREENSHOT_DIR}/05-media-sourcing.png` });

  // Wait for media to complete (3min video = ~3 segments)
  await expect(page.getByRole('button', { name: /Prepare Narration/i })).toBeVisible({ timeout: 300000 });
  await page.screenshot({ path: `${SCREENSHOT_DIR}/06-media-complete.png` });
  console.log('✅ Step 6: Media sourced - Prepare Narration button visible');

  // 7. Generate narration
  await page.getByRole('button', { name: /Prepare Narration/i }).click();
  console.log('✅ Step 7: Clicked Prepare Narration...');
  await expect(page.getByText('Narration')).toBeVisible({ timeout: 15000 });
  await page.screenshot({ path: `${SCREENSHOT_DIR}/07-narration.png` });

  // Narration auto-completes via handleGenerateNarration and advances to AI Edit
  // Wait for AI Edit step to appear
  await expect(page.getByRole('button', { name: /Skip AI Edit/i })).toBeVisible({ timeout: 600000 });
  await page.screenshot({ path: `${SCREENSHOT_DIR}/08-narration-complete.png` });
  console.log('✅ Step 8: Narration complete - AI Edit step visible');

  // 9. Skip AI Edit to reach Assembly step
  await page.getByRole('button', { name: /Skip AI Edit/i }).click();
  console.log('✅ Step 9: Skipped AI Edit - moving to Assembly...');
  await expect(page.getByRole('button', { name: /Assemble Video/i })).toBeVisible({ timeout: 15000 });
  await page.screenshot({ path: `${SCREENSHOT_DIR}/09-assembly-ready.png` });

  // 10. Select draft quality for faster render
  await expect(page.getByTestId('quality-draft')).toBeVisible({ timeout: 30000 });
  await page.getByTestId('quality-draft').click();
  console.log('✅ Step 10: Selected draft quality');

  // 11. Click Assemble Video in AssemblyStep (starts the render)
  await expect(page.getByRole('button', { name: /Assemble Video/i })).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: /Assemble Video/i }).click();
  console.log('✅ Step 11: Clicked Assemble Video (AssemblyStep) - rendering...');
  await expect(page.getByText('Rendering Video')).toBeVisible({ timeout: 15000 });
  await page.screenshot({ path: `${SCREENSHOT_DIR}/10-assembling.png` });

  // Wait for preview step to render (draft quality at 480p should render faster)
  await expect(page.getByTestId('preview-step')).toBeVisible({ timeout: 600000 });
  await page.screenshot({ path: `${SCREENSHOT_DIR}/11-preview.png` });
  console.log('✅ Step 12: Preview loaded');

  // Verify final state with proper assertions
  await expect(page.getByTestId('preview-step')).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId('new-video-button')).toBeVisible({ timeout: 10000 });
  
  console.log('\n--- FINAL STATE ---');
  console.log('Preview panel visible: true');
  console.log('New Video button visible: true');
  
  await page.screenshot({ path: `${SCREENSHOT_DIR}/13-final-state.png`, fullPage: true });
  console.log('\n🎬 Full user journey test complete!');
});
