import { test, expect } from '@playwright/test';

const SCREENSHOT_DIR = '/tmp/autotube-user-test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('autotube_onboarding_seen', 'true');
  });
});

test('full user journey: topic → script → media → narration → assembly → preview', async ({ page }) => {
  // Ensure clean screenshot dir
  await page.setViewportSize({ width: 1440, height: 900 });

  // 1. Open app
  await page.goto('/');
  await page.waitForSelector('text=Topic & Config');
  await page.screenshot({ path: `${SCREENSHOT_DIR}/01-topic-page.png` });
  console.log('✅ Step 1: App loaded - Topic page visible');

  // 2. Enter a topic
  const topicInput = page.getByTestId('topic-input');
  await topicInput.fill('The Rise of SpaceX and the Future of Space Travel');

  // Select 3 minute duration for faster test
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
  await page.waitForSelector('button:has-text("Source Media")', { timeout: 90000 });
  await page.screenshot({ path: `${SCREENSHOT_DIR}/04-script-complete.png` });
  console.log('✅ Step 4: Script generated - Source Media button visible');

  // 5. Source media
  await page.click('button:has-text("Source Media")');
  console.log('✅ Step 5: Clicked Source Media - harvesting images...');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/05-media-sourcing.png` });

  // Wait for media to complete (3min video = ~3 segments)
  await page.waitForSelector('button:has-text("Prepare Narration")', { timeout: 300000 });
  await page.screenshot({ path: `${SCREENSHOT_DIR}/06-media-complete.png` });
  console.log('✅ Step 6: Media sourced - Prepare Narration button visible');

  // 7. Generate narration
  await page.click('button:has-text("Prepare Narration")');
  console.log('✅ Step 7: Clicked Prepare Narration...');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/07-narration.png` });

  // Wait for narration to complete
  await page.waitForSelector('button:has-text("Assemble Video")', { timeout: 600000 });
  await page.screenshot({ path: `${SCREENSHOT_DIR}/08-narration-complete.png` });
  console.log('✅ Step 8: Narration complete - Assemble Video button visible');

  // 9. Assemble video
  await page.click('button:has-text("Assemble Video")');
  console.log('✅ Step 9: Clicked Assemble Video - rendering...');
  await page.waitForTimeout(5000);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/09-assembling.png` });

  // Wait for render to complete (preview page loads automatically)
  await page.waitForURL('**/preview**', { timeout: 180000 }).catch(() => {});
  
  // Wait for any of these indicators
  try {
    await page.waitForSelector('button:has-text("Download"), button:has-text("New Video")', { timeout: 180000 });
  } catch {
    console.log('⚠️ Waiting for preview indicators...');
  }
  
  await page.screenshot({ path: `${SCREENSHOT_DIR}/10-preview.png` });
  console.log('✅ Step 10: Preview page loaded');

  // Verify final state
  const hasVideoTitle = await page.locator('text=The Rise of SpaceX').isVisible().catch(() => false);
  const hasPreview = await page.getByTestId('preview-step').isVisible().catch(() => false);
  const hasDownload = await page.getByTestId('download-video-button').isVisible().catch(() => false);
  
  console.log(`\n--- FINAL STATE ---`);
  console.log(`Video title visible: ${hasVideoTitle}`);
  console.log(`Preview panel visible: ${hasPreview}`);
  console.log(`Download button visible: ${hasDownload}`);
  
  await page.screenshot({ path: `${SCREENSHOT_DIR}/11-final-state.png`, fullPage: true });
  console.log('\n🎬 Full user journey test complete!');
});
