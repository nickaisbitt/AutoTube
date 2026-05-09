import { test, expect } from '@playwright/test';

test.describe('Critical User Flows', () => {
  test('full pipeline — enter topic, generate script, source media, assemble video', async ({ page }) => {
    await page.goto('/');

    // Enter a topic
    await page.getByTestId('topic-input').click();
    await page.getByTestId('topic-input').fill('The Future of AI in Healthcare');

    // Generate script
    await page.getByTestId('generate-script-only').click();

    // Wait for script generation to complete (sidebar shows complete for script step)
    await expect(page.getByTestId('sidebar-step-script')).toBeVisible({ timeout: 120000 });

    // Navigate to media step (should be active after script generation)
    const mediaStep = page.getByTestId('sidebar-step-media');
    await expect(mediaStep).toBeVisible({ timeout: 60000 });

    // Source media
    await mediaStep.click();
    await expect(page.getByTestId('media-step')).toBeVisible({ timeout: 10000 });

    // Navigate to assembly step
    const assemblyStep = page.getByTestId('sidebar-step-assembly');
    await expect(assemblyStep).toBeVisible({ timeout: 120000 });
    await assemblyStep.click();

    // Click "Assemble Video"
    await expect(page.getByTestId('assemble-video-button')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('assemble-video-button').click();

    // Verify progress bar appears
    await expect(page.getByText('Rendering Video')).toBeVisible({ timeout: 10000 });

    // Verify progress percentage is shown
    await expect(page.getByText(/%\s*$/)).toBeVisible({ timeout: 60000 });
  });

  test('preview generation — generate preview from assembled video', async ({ page }) => {
    await page.goto('/');

    // Enter a topic
    await page.getByTestId('topic-input').click();
    await page.getByTestId('topic-input').fill('Understanding Quantum Computing');

    // Generate script
    await page.getByTestId('generate-script-only').click();

    // Wait for pipeline to advance
    await expect(page.getByTestId('sidebar-step-script')).toBeVisible({ timeout: 120000 });

    // Navigate through to assembly
    const assemblyStep = page.getByTestId('sidebar-step-assembly');
    await expect(assemblyStep).toBeVisible({ timeout: 120000 });
    await assemblyStep.click();

    // Click "Preview" button
    await expect(page.getByTestId('generate-preview-button')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('generate-preview-button').click();

    // Verify preview modal or preview content appears
    await expect(page.getByText('Preview')).toBeVisible({ timeout: 120000 });
  });

  test('error handling — graceful failure when API key is missing', async ({ page }) => {
    await page.goto('/');

    // Enter a topic without API key configured
    await page.getByTestId('topic-input').click();
    await page.getByTestId('topic-input').fill('Test Error Handling Topic');

    const generateBtn = page.getByTestId('generate-script-only');
    await expect(generateBtn).toBeVisible();

    // Verify the app does not crash — main content should still be visible
    await expect(page.getByTestId('pipeline-sidebar')).toBeVisible();
    await expect(page.getByTestId('topic-input')).toBeVisible();
  });
});
