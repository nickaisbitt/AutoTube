/**
 * Full product pipeline: topic → UI steps → server-render MP4.
 * Used by generate-full-video.mjs CLI and video-improvement-loop.mjs.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, existsSync, copyFileSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { validateOutput, MIN_RENDER_OUTPUT_BYTES } from '../../server-render/pipelineReliability.mjs';
import { buildMockScriptForTopic, mockOpenRouterHttpBody } from '../../e2e/openRouterMock.mjs';
import { patchProjectForLoop, stockSearchResults } from './patch-project-for-loop.mjs';
import { STOCK_HEALTHCARE_IMAGES } from './stock-media-urls.mjs';

export function resolveOpenRouterKey() {
  return (
    process.env.OPENROUTER_API_KEY ||
    process.env.VITE_OPENROUTER_KEY ||
    process.env.OPENROUTER_KEY ||
    ''
  ).trim();
}

export async function checkDevServer(devServer = process.env.DEV_SERVER_URL || 'http://localhost:5173') {
  const timeoutMs = Number(process.env.DEV_SERVER_CHECK_TIMEOUT_MS) || 30_000;
  try {
    const r = await fetch(devServer, { signal: AbortSignal.timeout(timeoutMs) });
    return r.ok;
  } catch {
    return false;
  }
}

function isLikelyVideoHost(url = '') {
  return /(?:youtube\.com|youtu\.be|vimeo\.com|dailymotion\.com|player\.vimeo|archive\.org|giphy)/i.test(url);
}

function isImageLikeUrl(url = '') {
  return /\.(?:jpg|jpeg|png|webp|gif)(?:[?#].*)?$/i.test(url)
    || /(?:th\.bing\.com|tse\d*\.mm\.bing\.net|i\.vimeocdn\.com|images\.|img\.|cdn\.)/i.test(url);
}

async function canFetch(url, { timeoutMs = 6000, minBytes = 256, expectVideo = false } = {}) {
  if (!url || !/^https?:\/\//i.test(url)) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        range: expectVideo ? undefined : 'bytes=0-4095',
        'user-agent': 'Mozilla/5.0 AutoTube media validator',
      },
    });
    if (!res.ok) return false;
    const contentType = res.headers.get('content-type') || '';
    if (expectVideo && !/video|octet-stream|application\/octet/.test(contentType) && !contentType.includes('video')) {
      // still allow if body looks binary; fall through to size check
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (expectVideo && buf.length > 4) {
      // crude MP4/webm check
      const sig = buf.slice(0, 4).toString('hex');
      if (!sig.includes('66747970') && !contentType.includes('video')) {
        return false; // not video-like
      }
    }
    return buf.length >= minBytes;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function sanitizeRealHarvestMedia(project, devServer, outDir) {
  const report = {
    before: project.media?.length || 0,
    after: 0,
    convertedVideoToImage: [],
    dropped: [],
    keptVideo: [],
  };
  if (!project.media?.length) {
    writeFileSync(join(outDir, 'media-sanitization.json'), JSON.stringify(report, null, 2));
    return report;
  }

  const sanitized = [];
  const fallbackImage = project.topicContext?.thumbnailUrl || null;

  for (const asset of project.media) {
    if (asset.type !== 'video') {
      sanitized.push(asset);
      continue;
    }

    // Prefer sourceUrl (page) for proxying unreliable video hosts; fall back to url
    const pageUrl = asset.sourceUrl || asset.url;
    const thumbnailUrl = asset.thumbnailUrl || (isImageLikeUrl(asset.url) ? asset.url : '');

    // Always route video-host or non-direct through the server proxy for fetchability + caching
    let downloadUrl;
    if (asset.url?.startsWith('/api/download-clip')) {
      downloadUrl = `${devServer}${asset.url}`;
    } else if (isLikelyVideoHost(pageUrl) || isLikelyVideoHost(asset.url) || !/\.(mp4|webm|mov)/i.test(asset.url || '')) {
      const target = isLikelyVideoHost(pageUrl) ? pageUrl : asset.url;
      downloadUrl = `${devServer}/api/download-clip?url=${encodeURIComponent(target)}`;
    } else {
      downloadUrl = asset.url;
    }

    // For known flaky video hosts, be willing to accept a good thumbnail even if clip probe is slow/partial
    const preferThumbnailForHost = isLikelyVideoHost(pageUrl) || isLikelyVideoHost(asset.url);

    const thumbnailOk = thumbnailUrl ? await canFetch(thumbnailUrl, { timeoutMs: 8000 }) : false;
    const clipOk = downloadUrl ? await canFetch(downloadUrl, { timeoutMs: 30000, minBytes: 2048, expectVideo: true }) : false;

    if (clipOk && !preferThumbnailForHost) {
      sanitized.push(asset);
      report.keptVideo.push({ url: asset.url, thumbnailUrl, reason: 'clip fetchable' });
      continue;
    }

    if (thumbnailOk) {
      sanitized.push({
        ...asset,
        type: 'image',
        url: thumbnailUrl,
        source: `${asset.source || 'Video'} thumbnail`,
        isFallback: false,
        reasoning: `${asset.reasoning || ''} Converted video to fetchable thumbnail before render (clip probe ${clipOk ? 'passed but host prefers stable thumb' : 'failed or slow'}).`.trim(),
      });
      report.convertedVideoToImage.push({ url: asset.url, thumbnailUrl, reason: 'clip unavailable/slow or host prefers thumbnail' });
      continue;
    }

    if (fallbackImage && !isImageLikeUrl(fallbackImage)) {
      // last resort stable fallback to keep segment populated
      sanitized.push({
        ...asset,
        type: 'image',
        url: fallbackImage,
        source: 'topic-fallback',
        isFallback: true,
        reasoning: 'Video unavailable; fell back to topic thumbnail to avoid empty segment.',
      });
      report.dropped.push({ url: asset.url, thumbnailUrl, reason: 'clip+thumb failed; replaced with topic fallback' });
      continue;
    }

    report.dropped.push({ url: asset.url, thumbnailUrl, reason: 'clip and thumbnail unavailable' });
  }

  project.media = sanitized;
  report.after = sanitized.length;
  writeFileSync(join(outDir, 'media-sanitization.json'), JSON.stringify(report, null, 2));
  return report;
}

/**
 * @param {object} options
 * @param {string} options.topic
 * @param {string} [options.devServer]
 * @param {number} [options.runId]
 * @param {boolean} [options.youtubeMode]
 * @param {boolean} [options.quiet]
 * @param {boolean} [options.realHarvest] — use live OpenRouter + dev-server search APIs (no mocks)
 * @param {object} [options.fixState] — loop fix state from apply-watch-fixes
 */
export async function generateFullVideo(options) {
  const topic = options.topic;
  if (!topic?.trim()) throw new Error('topic is required');

  const fixState = options.fixState || {};
  const openRouterKey = resolveOpenRouterKey();
  const realHarvest = options.realHarvest === true || (options.realHarvest !== false && Boolean(openRouterKey));

  if (realHarvest && !openRouterKey) {
    return {
      ok: false,
      error: 'realHarvest requires OPENROUTER_API_KEY (or VITE_OPENROUTER_KEY) in environment',
      topic,
      outDir: null,
    };
  }

  const mockSegments = buildMockScriptForTopic(topic, {
    hookLine: fixState.hookLine,
    loopShort: options.loopShort !== false && !realHarvest,
  });

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
  log(`   Mode: ${realHarvest ? 'real harvest (OpenRouter + live search)' : 'mock (CI/e2e)'}`);
  log(`   Out: ${outDir}\n`);

  let browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-dev-shm-usage',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--disable-software-rasterizer',
    ],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  await page.addInitScript(
    ({ key, harvest }) => {
      localStorage.setItem('autotube_onboarding_seen', 'true');
      localStorage.removeItem('autotube_project');
      sessionStorage.setItem(
        'autotube_config_session',
        JSON.stringify({
          openRouterKey: key,
          // Loop fast mode: stock (2 assets/segment) — raw (4/segment) exceeds 20min on worker
          sourceType: 'stock',
          flickrKey: '',
          ttsVoice: 'Leo',
        }),
      );
      sessionStorage.setItem('autotube_loop_fast_mode', 'true');
    },
    { key: realHarvest ? openRouterKey : 'sk-or-v1-e2e-full-pipeline', harvest: realHarvest },
  );

  const browserEvents = [];
  const recordBrowserEvent = (type, detail) => {
    browserEvents.push({ at: new Date().toISOString(), type, detail: String(detail).slice(0, 1000) });
    if (browserEvents.length > 200) browserEvents.shift();
  };
  page.on('console', (msg) => recordBrowserEvent(`console.${msg.type()}`, msg.text()));
  page.on('pageerror', (err) => recordBrowserEvent('pageerror', err.message));
  page.on('requestfailed', (request) => recordBrowserEvent('requestfailed', `${request.method()} ${request.url()} ${request.failure()?.errorText || ''}`));

  if (realHarvest) {
    await page.route('**/openrouter.ai/**', async (route) => {
      const request = route.request();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120_000);
      try {
        const upstream = await fetch(request.url(), {
          method: request.method(),
          headers: {
            'Authorization': `Bearer ${openRouterKey}`,
            'Content-Type': request.headers()['content-type'] || 'application/json',
            'HTTP-Referer': 'https://autotube.video',
            'X-Title': 'AutoTube AI Generator',
          },
          body: request.postData() || undefined,
          signal: controller.signal,
        });
        const body = await upstream.text();
        recordBrowserEvent('openrouter.proxy', `${upstream.status} ${request.postDataJSON()?.model || 'unknown-model'}`);
        await route.fulfill({
          status: upstream.status,
          contentType: upstream.headers.get('content-type') || 'application/json',
          body,
        });
      } catch (err) {
        recordBrowserEvent('openrouter.proxy.error', err instanceof Error ? err.message : String(err));
        await route.fulfill({
          status: 504,
          contentType: 'application/json',
          body: JSON.stringify({ error: { message: err instanceof Error ? err.message : String(err) } }),
        });
      } finally {
        clearTimeout(timeout);
      }
    });
  } else {
    await page.route('**/openrouter.ai/**', async (route) => {
      const post = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: mockOpenRouterHttpBody(post, mockSegments),
      });
    });

    const stockResults = stockSearchResults(topic, STOCK_HEALTHCARE_IMAGES.length);

    await page.route(
      /\/api\/(?:search|search-bing-images|search-google-images|search-bing-videos|search-google-videos|search-videos|static-map|press-release|search-bing-news|proxy-page).*/,
      async (route) => {
        const url = route.request().url();
        if (url.includes('static-map')) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              url: STOCK_HEALTHCARE_IMAGES[0].url,
              thumbnailUrl: STOCK_HEALTHCARE_IMAGES[0].url.replace('w=1920', 'w=400'),
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
          body: JSON.stringify({ results: stockResults }),
        });
      },
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
  }

  // Block YouTube embed fetches in headless (not needed for harvest)
  await page.route(/https:\/\/www\.youtube\.com\/.*/, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<html></html>' }),
  );

  const scriptTimeoutMs = realHarvest ? 240_000 : 180_000;
  const mediaTimeoutMs = realHarvest ? 1_200_000 : 300_000;
  const narrationTimeoutMs = realHarvest ? 900_000 : 600_000;

  try {
    await page.goto(devServer, { waitUntil: 'networkidle', timeout: 60000 });
    if (await page.getByTestId('onboarding-modal').isVisible({ timeout: 3000 }).catch(() => false)) {
      await page.getByTestId('onboarding-skip').click();
    }

    await page.getByTestId('topic-input').fill(topic);
    await page.getByTestId('duration-select').selectOption('3').catch(() => {});
    await page.getByTestId('generate-script-only').click();
    log('⏳ Script (live OpenRouter — fast loop mode)...');
    try {
      await page.getByRole('button', { name: /Source Media/i }).waitFor({ state: 'visible', timeout: scriptTimeoutMs });
    } catch (err) {
      writeFileSync(join(outDir, 'browser-events.json'), JSON.stringify(browserEvents, null, 2));
      const uiState = await page.evaluate(() => ({
        bodyText: document.body?.innerText?.slice(0, 4000) || '',
        projectRawLength: localStorage.getItem('autotube_project')?.length || 0,
        configRawLength: sessionStorage.getItem('autotube_config_session')?.length || 0,
        fastMode: sessionStorage.getItem('autotube_loop_fast_mode'),
      })).catch((e) => ({ error: e.message }));
      writeFileSync(join(outDir, 'ui-state-on-script-timeout.json'), JSON.stringify(uiState, null, 2));
      await page.screenshot({ path: join(outDir, 'script-timeout.png'), fullPage: true }).catch(() => {});
      throw err;
    }

    await page.getByRole('button', { name: /Source Media Assets/i }).click();
    log(`⏳ Media (${realHarvest ? 'live harvest' : 'mock harvest'})...`);

    const mediaDeadline = Date.now() + mediaTimeoutMs;
    const mediaStart = Date.now();
    let mediaReady = false;
    let lastLogMin = -1;
    while (Date.now() < mediaDeadline) {
      mediaReady = await page.getByRole('button', { name: /Prepare Narration/i }).isVisible().catch(() => false);
      if (mediaReady) break;
      const elapsedMin = Math.floor((Date.now() - mediaStart) / 60000);
      if (elapsedMin >= 1 && elapsedMin !== lastLogMin && elapsedMin % 2 === 0) {
        lastLogMin = elapsedMin;
        const msg = await page.locator('[data-testid="dynamic-message"]').textContent().catch(() => '');
        const progress = await page.evaluate(() => {
          const raw = localStorage.getItem('autotube_project');
          if (!raw) return { media: 0, segments: 0 };
          try {
            const p = JSON.parse(raw).project;
            return { media: p?.media?.length ?? 0, segments: p?.script?.length ?? 0 };
          } catch {
            return { media: 0, segments: 0 };
          }
        }).catch(() => ({ media: 0, segments: 0 }));
        log(`   … ${elapsedMin}min media harvest (${progress.media} assets / ${progress.segments} segments) ${msg ? `— ${msg.slice(0, 60)}` : ''}`);
      }
      await page.waitForTimeout(5000);
    }

    if (!mediaReady) {
      writeFileSync(join(outDir, 'browser-events.json'), JSON.stringify(browserEvents, null, 2));
      const uiState = await page.evaluate(() => ({
        bodyText: document.body?.innerText?.slice(0, 4000) || '',
        projectRawLength: localStorage.getItem('autotube_project')?.length || 0,
        mediaCount: (() => {
          try {
            return JSON.parse(localStorage.getItem('autotube_project') || '{}').project?.media?.length ?? 0;
          } catch {
            return 0;
          }
        })(),
        stepText: document.body?.innerText?.match(/Step \d+ — \w+/)?.[0] || '',
      })).catch((e) => ({ error: e.message }));
      writeFileSync(join(outDir, 'ui-state-on-media-timeout.json'), JSON.stringify(uiState, null, 2));
      await page.screenshot({ path: join(outDir, 'media-timeout.png'), fullPage: true }).catch(() => {});
      throw new Error(`Media harvest timed out after ${Math.round(mediaTimeoutMs / 60000)}min waiting for Prepare Narration`);
    }

    await page.getByRole('button', { name: /Prepare Narration/i }).click();
    log('⏳ Narration...');
    await page.getByTestId('skip-ai-edit-button').waitFor({ timeout: narrationTimeoutMs });
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

    patchProjectForLoop(project, topic, fixState, { skipMediaPatch: realHarvest });
    if (realHarvest) {
      const mediaReport = await sanitizeRealHarvestMedia(project, devServer, outDir);
      log(`🧹 Media sanitize: ${mediaReport.before} → ${mediaReport.after} assets (${mediaReport.convertedVideoToImage.length} video→image, ${mediaReport.dropped.length} dropped)`);
    }

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

    // Free Playwright/Chromium memory before server-render (4GB cgroup on worker).
    await browser.close().catch(() => {});
    browser = null;

    const renderEnv = {
      ...process.env,
      DEV_SERVER_URL: devServer,
      AUTOTUBE_FORCE_CPU: process.env.AUTOTUBE_FORCE_CPU || '1',
      AUTOTUBE_PROJECT_PATH: projectPath,
    };
    if (options.youtubeMode !== false) {
      renderEnv.AUTOTUBE_YOUTUBE_MODE = '1';
    }
    if (fixState.cutIntervalSec) {
      renderEnv.AUTOTUBE_CUT_INTERVAL_SEC = String(fixState.cutIntervalSec);
    }
    if (fixState.showKineticText) renderEnv.AUTOTUBE_KINETIC_TEXT = '1';
    if (fixState.useFastPacing) renderEnv.AUTOTUBE_FAST_PACING = '1';
    // Loop renders: draft quality + longer encode timeout (worker CPU is slow)
    renderEnv.AUTOTUBE_RENDER_QUALITY = process.env.AUTOTUBE_RENDER_QUALITY || 'draft';
    renderEnv.AUTOTUBE_ENCODING_TIMEOUT_MS = process.env.AUTOTUBE_ENCODING_TIMEOUT_MS || '1800000';
    renderEnv.AUTOTUBE_FFMPEG_PRESET = process.env.AUTOTUBE_FFMPEG_PRESET || 'ultrafast';
    renderEnv.AUTOTUBE_DRAFT_NO_UPSCALE = process.env.AUTOTUBE_DRAFT_NO_UPSCALE || '1';

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
      realHarvest,
    };
  } catch (err) {
    return { ok: false, error: err.message, topic, outDir };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
