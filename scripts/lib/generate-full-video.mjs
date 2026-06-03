/**
 * Full product pipeline: topic → UI steps → server-render MP4.
 * Used by generate-full-video.mjs CLI and video-improvement-loop.mjs.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, existsSync, copyFileSync, readdirSync, unlinkSync, readFileSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { validateOutput, MIN_RENDER_OUTPUT_BYTES } from '../../server-render/pipelineReliability.mjs';
import { MOCK_LONG_SCRIPT_SEGMENTS, mockOpenRouterHttpBody } from '../../e2e/openRouterMock.mjs';

export async function checkDevServer(devServer = process.env.DEV_SERVER_URL || 'http://localhost:5173') {
  try {
    const r = await fetch(devServer, { signal: AbortSignal.timeout(5000) });
    return r.ok;
  } catch {
    return false;
  }
}

/**
 * @param {object} options
 * @param {string} options.topic
 * @param {string} [options.devServer]
 * @param {number} [options.runId]
 * @param {boolean} [options.youtubeMode]
 * @param {boolean} [options.quiet]
 */
export async function generateFullVideo(options) {
  const topic = options.topic;
  if (!topic?.trim()) throw new Error('topic is required');

  const devServer = options.devServer || process.env.DEV_SERVER_URL || 'http://localhost:5173';
  const runId = options.runId ?? Date.now();
  const root = process.cwd();
  const outDir = join(root, 'test-recordings', `full-${runId}`);
  mkdirSync(outDir, { recursive: true });

  const log = (msg) => {
    if (!options.quiet) console.log(msg);
  };

  if (!(await checkDevServer(devServer))) {
    return { ok: false, error: `Dev server not reachable at ${devServer}`, topic, outDir };
  }

  log(`\n🎬 Generate: ${topic}`);
  log(`   Out: ${outDir}\n`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  await page.addInitScript(() => {
    localStorage.setItem('autotube_onboarding_seen', 'true');
    localStorage.removeItem('autotube_project');
    sessionStorage.setItem(
      'autotube_config_session',
      JSON.stringify({
        openRouterKey: 'sk-or-v1-e2e-full-pipeline',
        sourceType: 'stock',
        flickrKey: '',
        ttsVoice: 'Leo',
      }),
    );
  });

  await page.route('**/openrouter.ai/**', async (route) => {
    const post = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: mockOpenRouterHttpBody(post, MOCK_LONG_SCRIPT_SEGMENTS),
    });
  });

  await page.route(
    /\/api\/(?:search|search-bing-images|search-google-images|search-bing-videos|search-google-videos|search-videos|static-map|press-release|search-bing-news|proxy-page).*/,
    async (route) => {
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
        return;
      }
      if (url.includes('press-release') || url.includes('search-bing-news') || url.includes('proxy-page')) {
        await route.fulfill({ status: 200, contentType: 'text/html', body: '' });
        return;
      }
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
              title: topic.slice(0, 80),
              alt: topic.slice(0, 80),
              width: 1920,
              height: 1080,
              type: 'image',
            },
            {
              url: 'https://picsum.photos/id/11/1920/1080',
              image: 'https://picsum.photos/id/11/1920/1080',
              thumbnailUrl: 'https://picsum.photos/id/11/200/150',
              source: 'Mock',
              title: 'B-roll',
              alt: 'B-roll',
              width: 1920,
              height: 1080,
              type: 'image',
            },
          ],
        }),
      });
    },
  );

  await page.route(/https:\/\/www\.youtube\.com\/.*/, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<html></html>' }),
  );

  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  );
  await page.route(/.*picsum\.photos.*/, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: png }));
  await page.route(/.*wikipedia\.org.*|.*wikimedia\.org.*/, (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        extract: topic,
        description: topic,
        query: { pages: { '1': { title: 'Topic', extract: topic } } },
      }),
    }),
  );

  try {
    await page.goto(devServer, { waitUntil: 'networkidle', timeout: 60000 });
    if (await page.getByTestId('onboarding-modal').isVisible({ timeout: 3000 }).catch(() => false)) {
      await page.getByTestId('onboarding-skip').click();
    }

    await page.getByTestId('topic-input').fill(topic);
    await page.getByTestId('duration-select').selectOption('3').catch(() => {});
    await page.getByTestId('generate-script-only').click();
    log('⏳ Script...');
    await page.getByTestId('sidebar-step-script').locator('.bg-emerald-500').waitFor({ timeout: 180000 });

    await page.getByRole('button', { name: /Source Media Assets/i }).click();
    log('⏳ Media...');
    await page.getByRole('button', { name: /Prepare Narration/i }).waitFor({ timeout: 300000 });

    await page.getByRole('button', { name: /Prepare Narration/i }).click();
    log('⏳ Narration...');
    await page.getByTestId('skip-ai-edit-button').waitFor({ timeout: 600000 });
    await page.getByTestId('skip-ai-edit-button').click();
    await page.waitForTimeout(500);

    const project = await page.evaluate(() => {
      const raw = localStorage.getItem('autotube_project');
      if (!raw) return null;
      return JSON.parse(raw).project ?? null;
    });

    if (!project || !(project.media?.length > 0)) {
      return { ok: false, error: 'No project with media after pipeline', topic, outDir };
    }

    project.topic = topic;
    project.title = topic;
    project.exportSettings = {
      ...(typeof project.exportSettings === 'object' && project.exportSettings ? project.exportSettings : {}),
      quality: 'high',
      backgroundMusic: true,
      musicPreset: 'neutral',
      resolution: '1080p',
      youtubeMode: options.youtubeMode !== false,
    };

    try {
      for (const f of readdirSync('/tmp')) {
        if (f.startsWith('autotube-project') && f.endsWith('.json')) unlinkSync(`/tmp/${f}`);
      }
    } catch {
      /* ignore */
    }

    const projectPath = `/tmp/autotube-project.json`;
    writeFileSync(projectPath, JSON.stringify(project, null, 2));
    writeFileSync(join(outDir, 'project.json'), JSON.stringify(project, null, 2));
    writeFileSync(join(root, 'test-recordings', 'last-project.json'), JSON.stringify(project, null, 2));

    const scriptText =
      project.script?.map((s) => s.narration).filter(Boolean).join('\n\n') || '';

    const mp4Out = join(outDir, 'final-video.mp4');
    log(`🎥 Render → ${mp4Out}`);

    const renderEnv = {
      ...process.env,
      DEV_SERVER_URL: devServer,
      AUTOTUBE_FORCE_CPU: process.env.AUTOTUBE_FORCE_CPU || '1',
      AUTOTUBE_PROJECT_PATH: projectPath,
    };
    if (options.youtubeMode !== false) {
      renderEnv.AUTOTUBE_YOUTUBE_MODE = '1';
    }

    const render = spawnSync('node', ['server-render.mjs', mp4Out], {
      cwd: root,
      env: renderEnv,
      encoding: 'utf8',
      timeout: 1_800_000,
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    const renderLogPath = join(root, 'test-recordings', 'latest-render.log');
    const renderLogBody = `${render.stdout || ''}\n${render.stderr || ''}`;
    writeFileSync(renderLogPath, renderLogBody);
    writeFileSync(join(outDir, 'render.log'), renderLogBody);

    if (render.status !== 0 && render.status !== null) {
      return { ok: false, error: `server-render exit ${render.status}`, topic, outDir, projectPath };
    }

    const finalMp4 = mp4Out.replace('.mp4', '-final.mp4');
    const produced = existsSync(finalMp4) ? finalMp4 : existsSync(mp4Out) ? mp4Out : null;
    if (!produced) {
      return { ok: false, error: 'No output MP4', topic, outDir };
    }

    const gate = validateOutput(produced, 'Render output', { minBytes: MIN_RENDER_OUTPUT_BYTES });
    if (!gate.valid) {
      return { ok: false, error: gate.error, topic, outDir };
    }

    const probe = spawnSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', produced],
      { encoding: 'utf8' },
    );
    const durationSec = probe.stdout ? parseFloat(probe.stdout.trim()) : NaN;

    copyFileSync(produced, join(outDir, 'FINAL-VIDEO-final.mp4'));

    const finalize = spawnSync('node', ['scripts/finalize-ship-artifacts.mjs'], {
      cwd: root,
      stdio: options.quiet ? 'pipe' : 'inherit',
    });
    if (finalize.status !== 0) {
      return { ok: false, error: 'finalize-ship-artifacts failed', topic, outDir };
    }

    const canonicalPath = join(root, 'test-recordings', 'FINAL-VIDEO-final.mp4');

    return {
      ok: true,
      topic,
      outDir,
      projectPath,
      videoPath: produced,
      canonicalPath,
      scriptText,
      durationSec,
      sizeMb: (gate.size / 1024 / 1024).toFixed(2),
    };
  } catch (err) {
    return { ok: false, error: err.message, topic, outDir };
  } finally {
    await browser.close();
  }
}
