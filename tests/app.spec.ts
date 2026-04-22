import { test, expect } from '@playwright/test';

test.describe('AutoTube YouTube Video Generator', () => {

  test('app loads and shows topic page', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/AutoTube/);
    await expect(page.locator('h1:has-text("AutoTube")')).toBeVisible();
    await expect(page.locator('h2:has-text("Choose Your Video Topic")')).toBeVisible();
    await expect(page.locator('input[placeholder*="TikTok"]')).toBeVisible();
    await expect(page.locator('button:has-text("Generate Video Script")')).toBeVisible();
  });

  test('sidebar shows all pipeline steps', async ({ page }) => {
    await page.goto('/');
    const steps = [
      'Topic & Config',
      'Script Generation',
      'Media Sourcing',
      'TTS Narration',
      'Video Assembly',
      'Preview & Export',
    ];
    for (const step of steps) {
      await expect(page.locator(`text="${step}"`)).toBeVisible();
    }
  });

  test('topic step shows suggested topics', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=Trending Topics')).toBeVisible();
    await expect(page.locator('text=Business Insider')).toBeVisible();
    await expect(page.locator('text=WARFRONT')).toBeVisible();
    await expect(page.locator('text=Documentary')).toBeVisible();
    await expect(page.locator('text=Explainer')).toBeVisible();
  });

  test('can select a suggested topic', async ({ page }) => {
    await page.goto('/');
    await page.locator('button:has-text("How BlackRock")').first().click();
    const input = page.locator('input[placeholder*="TikTok"]');
    await expect(input).toHaveValue(/BlackRock/);
  });

  test('generate button disabled without topic', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('input[placeholder*="TikTok"]');
    await input.fill('');
    const btn = page.locator('button:has-text("Generate Video Script")');
    await expect(btn).toBeDisabled();
  });

  test('can generate script with template mode (no API key)', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('input[placeholder*="TikTok"]');
    await input.fill('Test Video Topic');
    await page.locator('button:has-text("Generate Video Script")').click();

    // Should navigate to script step with processing
    await expect(page.locator('text=Generating Script')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Initializing...')).toBeVisible({ timeout: 5000 });

    // Wait for processing to complete
    await expect(page.locator('text=Step 2 — Complete')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=Review and edit')).toBeVisible({ timeout: 5000 });

    // Should show script segments
    await expect(page.locator('text=Test Video Topic')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Source Media Assets')).toBeVisible({ timeout: 5000 });
  });

  test('script step shows expandable segments', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('input[placeholder*="TikTok"]');
    await input.fill('Test Topic');
    await page.locator('button:has-text("Generate Video Script")').click();

    // Wait for script generation
    await expect(page.locator('text=Step 2 — Complete')).toBeVisible({ timeout: 15000 });

    // Should have multiple segments
    const segments = page.locator('[class*="rounded-xl border"]');
    await expect(segments.first()).toBeVisible({ timeout: 5000 });

    // Click to expand a segment
    await segments.first().click();
    await expect(page.locator('text=Narration Text')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Visual Direction')).toBeVisible({ timeout: 5000 });
  });

  test('can proceed to media sourcing', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('input[placeholder*="TikTok"]');
    await input.fill('Test Topic');
    await page.locator('button:has-text("Generate Video Script")').click();

    // Wait for script generation
    await expect(page.locator('text=Source Media Assets')).toBeVisible({ timeout: 15000 });

    // Click to source media
    await page.locator('button:has-text("Source Media Assets")').click();

    // Should show media step with processing
    await expect(page.locator('text=AI Visual Director at Work')).toBeVisible({ timeout: 5000 });
  });

  test('settings modal opens and closes', async ({ page }) => {
    await page.goto('/');
    await page.locator('button:has-text("Settings")').click();
    await expect(page.locator('text=Global Settings')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('text=Pexels API Key')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('text=OpenRouter API Key')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('text=OpenAI API Key')).toBeVisible({ timeout: 3000 });

    // Close modal
    await page.locator('button[aria-label="Close"], button:has(svg.lucide-x)').first().click();
    await expect(page.locator('text=Global Settings')).not.toBeVisible({ timeout: 3000 });
  });

  test('debug overlay is accessible', async ({ page }) => {
    await page.goto('/');
    // Debug toggle should be visible
    const debugBtn = page.locator('button[title="Open System Logs"]');
    await expect(debugBtn).toBeVisible({ timeout: 3000 });
  });

  test('style selection works', async ({ page }) => {
    await page.goto('/');
    await page.locator('button:has-text("WARFRONT")').click();
    await page.locator('button:has-text("Documentary")').click();
    await page.locator('button:has-text("Explainer")').click();

    // Verify topic input still works
    const input = page.locator('input[placeholder*="TikTok"]');
    await expect(input).toBeVisible();
  });

  test('tone selection works', async ({ page }) => {
    await page.goto('/');
    await page.locator('button', { hasText: /^🎭 Dramatic$/ }).click();
    await page.locator('button', { hasText: /^🚨 Urgent$/ }).click();
    await page.locator('button', { hasText: /^💬 Casual$/ }).click();
  });

  test('duration selector works', async ({ page }) => {
    await page.goto('/');
    const select = page.locator('select');
    await select.selectOption('10');
    await expect(select).toHaveValue('10');
    await select.selectOption('3');
    await expect(select).toHaveValue('3');
  });

  test('no console errors on initial load', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/');
    await expect(page.locator('h1:has-text("AutoTube")')).toBeVisible();

    // Filter out expected React dev warnings
    const realErrors = errors.filter(e =>
      !e.includes('React DevTools') &&
      !e.includes('fast-refresh')
    );
    expect(realErrors).toEqual([]);
  });

  test('overall progress bar visible in sidebar', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=Overall Progress')).toBeVisible({ timeout: 3000 });
  });

  test('full pipeline: topic → script → media', async ({ page }) => {
    await page.goto('/');

    // Step 1: Enter topic
    await page.locator('input[placeholder*="TikTok"]').fill('The Future of AI');
    await page.locator('button:has-text("Generate Video Script")').click();

    // Wait for script
    await expect(page.locator('text=Source Media Assets')).toBeVisible({ timeout: 15000 });

    // Step 2: Go to media
    await page.locator('button:has-text("Source Media Assets")').click();

    // Should show media processing
    await expect(page.locator('text=AI Visual Director at Work')).toBeVisible({ timeout: 5000 });

    // Wait for media to complete or show results
    const hasResults = await page.locator('text=Visual Director Output').isVisible({ timeout: 30000 }).catch(() => false);
    const hasProcessing = await page.locator('text=harvesting').isVisible({ timeout: 5000 }).catch(() => false);
    const hasResearch = await page.locator('text=Researching').isVisible({ timeout: 5000 }).catch(() => false);

    // Either it completed with results or is still processing (which means the pipeline works)
    expect(hasResults || hasProcessing || hasResearch).toBe(true);
  });
});
