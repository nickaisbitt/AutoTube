import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { installFullPipelineFixtures } from './fixtures';
import {
  getMinDurationSec,
  verifyFinalMp4Gates,
  MIN_MP4_BYTES,
} from './mp4-gates';

const RECORDINGS_DIR = join(process.cwd(), 'test-recordings');

test.describe('Full pipeline — topic → -final.mp4', () => {
  test.beforeAll(() => {
    mkdirSync(RECORDINGS_DIR, { recursive: true });
  });

  test.beforeEach(async ({ page }) => {
    await installFullPipelineFixtures(page);
  });

  test('topic → MP4 with mocks — file exists, size > 1 MB, duration ≥ MIN', async ({ page }) => {
    test.setTimeout(1_800_000);

    const minDurationSec = getMinDurationSec();
    const runId = Date.now();

    await page.goto('/');
    await expect(page.getByTestId('topic-input')).toBeVisible({ timeout: 15_000 });

    if (await page.getByTestId('onboarding-modal').isVisible({ timeout: 2000 }).catch(() => false)) {
      await page.getByTestId('onboarding-skip').click();
    }

    await page.getByTestId('topic-input').fill('The Future of AI in Healthcare and Cybersecurity');
    await page.getByTestId('duration-select').selectOption('3');
    await page.getByTestId('generate-script-only').click();

    await expect(page.getByRole('button', { name: /Source Media/i })).toBeVisible({ timeout: 180_000 });

    await page.getByRole('button', { name: /Source Media/i }).click();
    await expect(page.getByText('AI Visual Director at Work')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /Prepare Narration/i })).toBeVisible({ timeout: 600_000 });

    await page.getByRole('button', { name: /Prepare Narration/i }).click();
    await expect(page.getByTestId('skip-ai-edit-button')).toBeVisible({ timeout: 900_000 });

    await page.getByTestId('skip-ai-edit-button').click();
    await expect(page.getByTestId('assemble-video-button')).toBeVisible({ timeout: 30_000 });

    const project = await page.evaluate(() => {
      const raw = localStorage.getItem('autotube_project');
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { project?: Record<string, unknown> };
      const p = parsed.project;
      if (!p) return null;
      p.exportSettings = {
        ...(typeof p.exportSettings === 'object' && p.exportSettings ? p.exportSettings : {}),
        quality: 'draft',
        backgroundMusic: false,
        resolution: '720p',
      };
      return p;
    });

    expect(project?.media && Array.isArray(project.media) && project.media.length > 0).toBeTruthy();
    expect(project?.script && Array.isArray(project.script) && project.script.length > 0).toBeTruthy();

    const projectPath = `/tmp/autotube-project-e2e-${runId}.json`;
    const mp4Out = join(RECORDINGS_DIR, `e2e-full-${runId}.mp4`);
    writeFileSync(projectPath, JSON.stringify(project, null, 2));

    console.log(`⏭ UI pipeline complete — server-render → ${mp4Out}`);

    const render = spawnSync('node', ['server-render.mjs', mp4Out], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DEV_SERVER_URL: process.env.DEV_SERVER_URL ?? 'http://localhost:5173',
        AUTOTUBE_FORCE_CPU: process.env.AUTOTUBE_FORCE_CPU ?? '1',
      },
      encoding: 'utf8',
      timeout: 1_800_000,
    });

    if (render.stdout) console.log(render.stdout.slice(-4000));
    if (render.stderr) console.error(render.stderr.slice(-2000));

    const finalMp4 = mp4Out.replace('.mp4', '-final.mp4');
    const produced = existsSync(finalMp4) ? finalMp4 : existsSync(mp4Out) ? mp4Out : null;

    expect(render.status, `server-render exited ${render.status}`).toBe(0);

    const gates = verifyFinalMp4Gates(produced);

    expect(gates.path).toMatch(/-final\.mp4$/);
    expect(gates.sizeBytes).toBeGreaterThan(MIN_MP4_BYTES);
    expect(gates.durationSec).toBeGreaterThanOrEqual(minDurationSec);

    console.log(
      `✅ Full pipeline MP4: ${gates.path} (${(gates.sizeBytes / 1024 / 1024).toFixed(2)} MB, ${gates.durationSec.toFixed(1)}s, min ${minDurationSec}s)`,
    );
  });
});
