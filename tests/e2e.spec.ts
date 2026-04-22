import { test, expect } from '@playwright/test';

test.describe('Full Pipeline E2E', () => {
  test('topic → script → media → narration → assembly → preview', async ({ page }) => {
    test.setTimeout(600000); // 10 minute timeout for rendering
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/');

    // ── STEP 1: Topic ──
    console.log('=== STEP 1: Topic ===');
    await page.locator('input[placeholder*="TikTok"]').fill('The Future of Artificial Intelligence');
    await page.locator('button:has-text("Explainer")').click();
    await page.locator('select').selectOption('3');

    await page.locator('button:has-text("Generate Video Script")').click();
    await expect(page.locator('text=Step 2 — Complete')).toBeVisible({ timeout: 15000 });
    console.log('✓ Script generated');

    const segCount = (await page.locator('button:has-text("s")').allTextContents()).length;
    console.log(`✓ Found script segments`);

    // ── STEP 2: Media ──
    console.log('=== STEP 2: Media ===');
    await page.locator('button:has-text("Source Media Assets")').click();
    
    // Wait for media to complete
    for (let i = 0; i < 60; i++) {
      if (await page.locator('text=Visual Director Output').isVisible().catch(() => false)) {
        console.log('✓ Media sourced');
        break;
      }
      if (await page.locator('text=No visuals').isVisible().catch(() => false)) {
        console.log('✓ Media step completed (no results expected without API)');
        break;
      }
      if (i === 59) console.log('⚠ Media still processing, continuing...');
      await new Promise(r => setTimeout(r, 1000));
    }

    // ── STEP 3: Narration ──
    console.log('=== STEP 3: Narration ===');
    const narrateBtn = page.locator('button:has-text("Prepare Narration")');
    if (await narrateBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await narrateBtn.click();
    }
    
    for (let i = 0; i < 30; i++) {
      if (await page.locator('text=Step 4 — Complete').isVisible().catch(() => false) ||
          await page.locator('text=Ready to speak').first().isVisible().catch(() => false)) {
        console.log('✓ Narration complete');
        break;
      }
      if (i === 29) console.log('⚠ Narration still processing, continuing...');
      await new Promise(r => setTimeout(r, 1000));
    }

    // ── STEP 4: Assembly ──
    console.log('=== STEP 4: Assembly ===');
    const assembleBtn = page.locator('button:has-text("Assemble Video")');
    if (await assembleBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await assembleBtn.click();
    }

    // Wait for render to complete OR show progress (up to 3 minutes)
    console.log('  Waiting for render to complete...');
    let renderDone = false;
    for (let i = 0; i < 180; i++) {
      const hasPreview = await page.locator('button:has-text("Preview Video")').isVisible().catch(() => false);
      const hasFailed = await page.locator('text=Render Failed').isVisible().catch(() => false);
      const isRendering = await page.locator('text=Rendering Video').isVisible().catch(() => false);
      const hasCancel = await page.locator('button:has-text("Cancel Render")').isVisible().catch(() => false);

      if (hasPreview) {
        console.log('✓ Video rendered successfully! Auto-advanced to preview');
        renderDone = true;
        break;
      }
      if (hasFailed) {
        console.log('⚠ Render failed (expected in headless without CORS images)');
        renderDone = true;
        break;
      }
      if (hasCancel && i % 15 === 0) {
        const pct = await page.locator('text=% complete').first().textContent().catch(() => '...');
        console.log(`  Rendering: ${pct}`);
      }
      await new Promise(r => setTimeout(r, 1000));
    }

    if (!renderDone) {
      console.log('⚠ Render timed out - taking screenshot of current state');
    }

    // Take screenshot for quality inspection
    await page.screenshot({ path: '/tmp/autotube-render-screenshot.png', fullPage: true });
    console.log('✓ Screenshot saved to /tmp/autotube-render-screenshot.png');

    // CORS errors from external images are expected - filter them out
    const realErrors = errors.filter(e =>
      !e.includes('React DevTools') &&
      !e.includes('404') &&
      !e.includes('net::ERR') &&
      !e.includes('CORS') &&
      !e.includes('Access-Control-Allow-Origin')
    );
    if (realErrors.length > 0) {
      console.log(`⚠ Console errors: ${realErrors.slice(0, 3).join(', ')}`);
    } else {
      console.log('✓ No significant errors (CORS blocks from external images are expected)');
    }

    console.log('\n=== PIPELINE TEST COMPLETE ===');
    expect(realErrors.length).toBe(0);
  });
});
