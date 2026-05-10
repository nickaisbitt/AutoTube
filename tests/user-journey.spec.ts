import { test, expect } from '@playwright/test';

const SCREENSHOT_DIR = '/tmp/autotube-user-test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('autotube_onboarding_seen', 'true');
  });
});

test('full user journey: topic → script → media → narration → assembly → preview', async ({ page }) => {
  test.setTimeout(900000); // 15 min — render takes ~9-10 min
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

  // Narration auto-completes via handleGenerateNarration and advances to AI Edit
  // Wait for AI Edit step to appear
  await page.waitForSelector('button:has-text("Skip AI Edit")', { timeout: 600000 });
  await page.screenshot({ path: `${SCREENSHOT_DIR}/08-narration-complete.png` });
  console.log('✅ Step 8: Narration complete - AI Edit step visible');

  // 9. Skip AI Edit to reach Assembly step
  await page.click('button:has-text("Skip AI Edit")');
  console.log('✅ Step 9: Skipped AI Edit - moving to Assembly...');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/09-assembly-ready.png` });

  // 10. Select draft quality for faster render
  await page.waitForSelector('[data-testid="quality-draft"]', { timeout: 30000 });
  await page.click('[data-testid="quality-draft"]');
  console.log('✅ Step 10: Selected draft quality');

  // 11. Click Assemble Video in AssemblyStep (starts the render)
  await page.waitForSelector('button:has-text("Assemble Video")', { timeout: 30000 });
  await page.click('button:has-text("Assemble Video")');
  console.log('✅ Step 11: Clicked Assemble Video (AssemblyStep) - rendering...');
  await page.waitForTimeout(5000);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/10-assembling.png` });

  // Wait for preview step to render (draft quality at 480p should render faster)
  await page.getByTestId('preview-step').waitFor({ timeout: 600000 });
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
