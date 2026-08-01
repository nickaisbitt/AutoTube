import { test, expect } from '@playwright/test';
import { installE2EFixtures } from './fixtures';

test.describe('Critical User Flows', () => {
  test.beforeEach(async ({ page }) => {
    await installE2EFixtures(page);
  });

  test('full pipeline — enter topic, generate script, advance pipeline state', async ({ page }) => {
    await page.goto('/');

    const modal = page.getByTestId('onboarding-modal');
    if (await modal.isVisible({ timeout: 2000 }).catch(() => false)) {
      await page.getByTestId('onboarding-skip').click();
    }

    await page.getByTestId('topic-input').fill('The Future of AI in Healthcare');
    await page.getByTestId('generate-script-only').click();

    const scriptStep = page.getByTestId('sidebar-step-script');
    await expect(scriptStep.locator('.bg-emerald-500')).toBeVisible({ timeout: 180000 });

    const mediaStep = page.getByTestId('sidebar-step-media');
    await expect(mediaStep).toBeEnabled({ timeout: 30000 });
  });

  test('script generation — produces a non-empty script panel', async ({ page }) => {
    await page.goto('/');

    if (await page.getByTestId('onboarding-modal').isVisible({ timeout: 2000 }).catch(() => false)) {
      await page.getByTestId('onboarding-skip').click();
    }

    await page.getByTestId('topic-input').fill('Understanding Quantum Computing');
    await page.getByTestId('generate-script-only').click();

    await expect(page.getByText('No script generated yet.')).toBeHidden({ timeout: 180000 });
    await expect(page.getByTestId('sidebar-step-script').locator('.bg-emerald-500')).toBeVisible({
      timeout: 180000,
    });
  });

  test('error handling — onboarding skip without key opens settings (no dead-start)', async ({ page }) => {
    await page.unroute('**/openrouter.ai/**');
    await page.addInitScript(() => {
      localStorage.removeItem('autotube_onboarding_seen');
      localStorage.removeItem('autotube_config_v2');
      sessionStorage.removeItem('autotube_config_session');
    });

    await page.goto('/');

    const modal = page.getByTestId('onboarding-modal');
    if (await modal.isVisible({ timeout: 5000 }).catch(() => false)) {
      await page.getByTestId('onboarding-skip').click();
      // Skip without key must open Settings (or show key required) — not persist empty forever
      const settingsVisible = await page.getByTestId('settings-modal').isVisible({ timeout: 3000 }).catch(() => false);
      const keyRequired = await page.getByTestId('onboarding-key-required').isVisible({ timeout: 1000 }).catch(() => false);
      expect(settingsVisible || keyRequired).toBeTruthy();
      if (settingsVisible) {
        await expect(modal).toBeHidden({ timeout: 5000 });
      }
    }

    await expect(page.getByTestId('pipeline-sidebar')).toBeVisible();
    await expect(page.getByTestId('topic-input')).toBeVisible();
  });
});
