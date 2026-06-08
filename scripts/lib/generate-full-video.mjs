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
import { validateEditTimeline } from './build-edit-timeline.mjs';
import { dedupeMediaByPHash } from './perceptual-hash.mjs';
import { STOCK_HEALTHCARE_IMAGES } from './stock-media-urls.mjs';
import {
  accumulateExcludedUrls,
  harvestContextFromFixState,
  harvestSessionStoragePayload,
  loadLastProjectUrls,
} from './harvest-loop-context.mjs';
import { buildRenderEnvFromFixState, renderEnvJournalSnapshot } from './render-env-from-fix-state.mjs';
import {
  filterAssetsByRelevance,
  evaluateHarvestVolume,
} from './harvest-quality.mjs';

export function resolveOpenRouterKey() {
  return (
    process.env.OPENROUTER_API_KEY ||
    process.env.VITE_OPENROUTER_KEY ||
    process.env.OPENROUTER_KEY ||
    ''
  ).trim();
}

export function resolvePexelsKey() {
  return (process.env.PEXELS_API_KEY || process.env.VITE_PEXELS_KEY || '').trim();
}

export function resolvePixabayKey() {
  return (process.env.PIXABAY_API_KEY || process.env.VITE_PIXABAY_KEY || '').trim();
}

async function clickPipelineButton(page, locator, { settleMs = 2000, timeout = 120_000 } = {}) {
  await locator.waitFor({ state: 'visible', timeout });
  if (settleMs > 0) await page.waitForTimeout(settleMs);
  try {
    await locator.click({ timeout: 20_000 });
    return;
  } catch {
    /* fall through */
  }
  try {
    await locator.click({ force: true, timeout });
    return;
  } catch {
    /* fall through */
  }
  const clicked = await page.evaluate(() => {
    const btn =
      document.querySelector('[data-testid="media-step-next"]') ||
      [...document.querySelectorAll('button')].find((b) => /Prepare Narration/i.test(b.textContent || ''));
    if (!btn) return false;
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return true;
  });
  if (!clicked) throw new Error('Pipeline button click failed (Prepare Narration)');
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

function isGiphyAsset(asset = {}) {
  const blob = `${asset.url || ''} ${asset.sourceUrl || ''} ${asset.source || ''} ${asset.thumbnailUrl || ''}`;
  return /giphy/i.test(blob);
}

function giphyStillUrl(asset = {}) {
  if (asset.thumbnailUrl && /\.gif(?:[?#]|$)/i.test(asset.thumbnailUrl)) return asset.thumbnailUrl;
  const mp4 = asset.url || '';
  if (/giphy\.mp4/i.test(mp4)) return mp4.replace(/giphy\.mp4/i, 'giphy.gif');
  return asset.thumbnailUrl || '';
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
      const head = buf.slice(0, Math.min(buf.length, 32));
      const hasFtyp = head.includes(Buffer.from('ftyp'));
      const hasWebm = head.slice(0, 4).toString('hex') === '1a45dfa3';
      if (!hasFtyp && !hasWebm && !contentType.includes('video') && !/giphy\.com/i.test(url)) {
        return false;
      }
    }
    return buf.length >= minBytes;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function isDirectImageCandidate(url = '') {
  const u = (url || '').toLowerCase();
  return (
    /\.(jpg|jpeg|png|gif|webp)(?:[?#]|$)/i.test(u)
    || /(?:th\d*\.bing\.net|upload\.wikimedia|images\.|pexels|pixabay|unsplash|gettyimages|alamy|shutterstock)/i.test(u)
  );
}

async function fetchImageSearchResults(devServer, endpoint, query) {
  try {
    const res = await fetch(`${devServer}${endpoint}?q=${encodeURIComponent(query)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.results || [];
  } catch {
    return [];
  }
}

async function topUpHarvestVolume(project, devServer, minPerSegment, report) {
  const segments = project.script || [];
  const topic = project.topic || project.title || '';
  const usedGlobal = new Set(
    (project.media || []).map((a) => (a.url || '').split('?')[0]).filter(Boolean),
  );
  const searchEndpoints = [
    '/api/search-google-images',
    '/api/search-bing-images',
    '/api/search-duckduckgo-images',
    '/api/search-hybrid',
    '/api/search-unsplash',
  ];

  for (const seg of segments) {
    const segAssets = (project.media || []).filter((m) => m.segmentId === seg.id);
    let uniqueCount = new Set(
      segAssets.map((a) => (a.url || '').split('?')[0]).filter(Boolean),
    ).size;

    for (let round = 0; round < searchEndpoints.length && uniqueCount < minPerSegment; round += 1) {
      const q = `${seg.title} ${topic} ${round > 0 ? 'news photo' : 'photo'}`;
      const results = await fetchImageSearchResults(devServer, searchEndpoints[round], q);
      const candidates = results
        .map((r) => ({ url: r.url || r.thumbnailUrl, alt: r.alt || r.title || seg.title, source: r.source }))
        .filter((r) => r.url && isDirectImageCandidate(r.url) && !isJunkHarvestUrl(r.url));

      let added = false;
      for (const r of candidates) {
        const key = r.url.split('?')[0];
        if (usedGlobal.has(key)) continue;
        if (!(await canFetch(r.url, { timeoutMs: 8000, minBytes: 512 }))) continue;

        project.media.push({
          id: `topup-${seg.id}-${uniqueCount}`,
          segmentId: seg.id,
          type: 'image',
          url: r.url,
          alt: `${seg.title} ${topic}`,
          query: q,
          source: `${r.source || 'Search'} (volume top-up)`,
          duration: 5,
          isFallback: false,
        });
        usedGlobal.add(key);
        uniqueCount += 1;
        added = true;
        report.volumeTopUp = report.volumeTopUp || [];
        report.volumeTopUp.push({ segmentId: seg.id, url: r.url, endpoint: searchEndpoints[round] });
        if (uniqueCount >= minPerSegment) break;
      }
      if (!added && round === searchEndpoints.length - 1) {
        report.volumeTopUpMiss = report.volumeTopUpMiss || [];
        report.volumeTopUpMiss.push({ segmentId: seg.id, count: uniqueCount, need: minPerSegment });
      }
    }
  }
}

function isJunkHarvestUrl(url) {
  const u = (url || '').toLowerCase();
  return (
    u.includes('gravatar.com/avatar') ||
    /tse\d\.mm\.bing\.net\/th[/?]id=ovp/i.test(u) ||
    u.includes('/th/id/ovp.') ||
    u.includes('th?id=ovp.') ||
    /\.webp(?:[?#]|$)/i.test(u) ||
    /\.avif(?:[?#]|$)/i.test(u)
  );
}

async function sanitizeRealHarvestMedia(project, devServer, outDir, options = {}) {
  const loopMode = options.loopMode === true;
  const minPerSegment = Math.max(3, options.minAssetsPerSegment || 6);
  const report = {
    before: project.media?.length || 0,
    after: 0,
    convertedVideoToImage: [],
    dropped: [],
    keptVideo: [],
    phashDropped: [],
    relevanceDropped: [],
    volumePass: true,
    harvestQuality: null,
  };
  if (!project.media?.length) {
    writeFileSync(join(outDir, 'media-sanitization.json'), JSON.stringify(report, null, 2));
    return report;
  }

  const sanitized = [];
  const fallbackImage = project.topicContext?.thumbnailUrl || null;

  for (const asset of project.media) {
    if (isJunkHarvestUrl(asset.url) || isJunkHarvestUrl(asset.thumbnailUrl)) {
      report.dropped.push({ url: asset.url, reason: 'junk URL (avatar/video-thumb placeholder)' });
      continue;
    }

    if (asset.type !== 'video') {
      sanitized.push(asset);
      continue;
    }

    if (loopMode && asset.type === 'video') {
      if (isGiphyAsset(asset)) {
        const stillUrl = giphyStillUrl(asset);
        if (stillUrl && !isJunkHarvestUrl(stillUrl) && await canFetch(stillUrl, { timeoutMs: 8000 })) {
          sanitized.push({
            ...asset,
            type: 'image',
            url: stillUrl,
            source: `${asset.source || 'Giphy'} still`,
            isFallback: false,
          });
          report.convertedVideoToImage.push({ url: asset.url, thumbnailUrl: stillUrl, reason: 'loop mode: giphy→gif still' });
          continue;
        }
      }

      const pageUrl = asset.sourceUrl || asset.url;
      let downloadUrl = asset.url;
      if (asset.url?.startsWith('/api/download-clip')) {
        downloadUrl = `${devServer}${asset.url}`;
      } else if (isLikelyVideoHost(pageUrl) || !/\.(mp4|webm|mov)/i.test(asset.url || '')) {
        downloadUrl = `${devServer}/api/download-clip?url=${encodeURIComponent(isLikelyVideoHost(pageUrl) ? pageUrl : asset.url)}`;
      }
      const clipOk = await canFetch(downloadUrl, { timeoutMs: 30000, minBytes: 2048, expectVideo: true });
      if (clipOk) {
        sanitized.push({ ...asset, url: downloadUrl.startsWith('http') ? downloadUrl : asset.url });
        report.keptVideo.push({ url: asset.url, reason: 'loop mode: ffmpeg assembly clip OK' });
        continue;
      }
      const thumbnailUrl = asset.thumbnailUrl || (isImageLikeUrl(asset.url) ? asset.url : '');
      if (thumbnailUrl && !isJunkHarvestUrl(thumbnailUrl) && await canFetch(thumbnailUrl, { timeoutMs: 8000 })) {
        sanitized.push({
          ...asset,
          type: 'image',
          url: thumbnailUrl,
          source: `${asset.source || 'Video'} still`,
          isFallback: false,
        });
        report.convertedVideoToImage.push({ url: asset.url, thumbnailUrl, reason: 'loop mode: video→still (clip failed)' });
        continue;
      }
      report.dropped.push({ url: asset.url, reason: 'loop mode: video without usable clip or still' });
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

  const validated = [];
  const urlOk = new Map();
  const reserve = [];

  for (const asset of sanitized) {
    if (asset.type !== 'image' || !asset.url) {
      validated.push(asset);
      continue;
    }
    const key = asset.url.split('?')[0];
    if (validated.some((a) => a.url?.split('?')[0] === key)) continue;

    let ok = urlOk.get(asset.url);
    if (ok === undefined) {
      ok = await canFetch(asset.url, { timeoutMs: 8000, minBytes: 512 });
      urlOk.set(asset.url, ok);
    }
    if (ok) {
      validated.push(asset);
      reserve.push(asset);
    } else {
      report.dropped.push({ url: asset.url, reason: 'image fetch failed pre-render' });
    }
  }

  const relevance = filterAssetsByRelevance(validated, project);
  report.relevanceDropped = relevance.dropped;
  if (relevance.dropped.length) {
    report.beforeRelevance = validated.length;
    report.afterRelevance = relevance.media.length;
  }

  const deduped = dedupeMediaByPHash(relevance.media, {
    devServer,
    onDrop: (item, reason) => report.phashDropped.push({ url: item.url, reason }),
  });
  project.media = [...deduped.media];
  report.phashHashCount = deduped.hashCount;

  const minPerSeg = loopMode ? minPerSegment : Math.min(4, minPerSegment);
  const bySegmentAfter = {};
  for (const asset of project.media) {
    bySegmentAfter[asset.segmentId] = (bySegmentAfter[asset.segmentId] || 0) + 1;
  }
  const usedUrls = new Set(project.media.map((a) => (a.url || '').split('?')[0]).filter(Boolean));
  for (const segId of [...new Set(project.media.map((a) => a.segmentId))]) {
    while ((bySegmentAfter[segId] || 0) < minPerSeg) {
      const replacement = deduped.media.find((r) => {
        const key = (r.url || '').split('?')[0];
        if (!key || usedUrls.has(key)) return false;
        return !project.media.some((v) => v.segmentId === segId && v.url === r.url);
      });
      if (!replacement) break;
      const key = (replacement.url || '').split('?')[0];
      if (key) usedUrls.add(key);
      project.media.push({
        ...replacement,
        segmentId: segId,
        id: `${replacement.id}-ph-${segId.slice(0, 6)}-${bySegmentAfter[segId]}`,
      });
      bySegmentAfter[segId] = (bySegmentAfter[segId] || 0) + 1;
    }
  }
  report.after = project.media.length;

  if (loopMode) {
    await topUpHarvestVolume(project, devServer, minPerSegment, report);
    report.afterTopUp = project.media.length;
  }

  const volume = evaluateHarvestVolume(project, minPerSegment);
  report.harvestQuality = volume;
  report.volumePass = volume.pass;
  writeFileSync(join(outDir, 'harvest-quality.json'), JSON.stringify(volume, null, 2));
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

  const fixState = { ...(options.fixState || {}) };
  if (fixState.reHarvestMedia) {
    fixState.harvestNonce = (fixState.harvestNonce || 0) + 1;
    fixState.reHarvestMedia = false;
    if (!options.quiet) {
      console.log(`   🔄 Re-harvest requested — nonce ${fixState.harvestNonce}, offset ${fixState.mediaOffset || 0}`);
    }
  }
  const priorUrls = loadLastProjectUrls(process.cwd());
  // Never seed excludes from stale last-project during re-harvest (nonce > 0) — that starves harvest.
  if (
    priorUrls.length &&
    (!fixState.excludedUrls || fixState.excludedUrls.length === 0) &&
    (fixState.harvestNonce || 0) === 0
  ) {
    fixState.excludedUrls = priorUrls.map((u) => (u || '').split('?')[0]).slice(-200);
  }
  const harvestCtx = harvestContextFromFixState(fixState);
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
  const loopMinAssets = Math.max(2, Math.min(8, fixState.minAssetsPerSegment || 6));

  if (!(await checkDevServer(devServer))) {
    return { ok: false, error: `Dev server not reachable at ${devServer}`, topic, outDir };
  }

  log(`\n🎬 Generate: ${topic}`);
  log(`   Mode: ${realHarvest ? 'real harvest (OpenRouter + live search)' : 'mock (CI/e2e)'}`);
  if (realHarvest) log(`   Loop: ${loopMinAssets} assets/segment, ≤75s target`);
  log(`   Out: ${outDir}\n`);

  const launchArgs = [
    '--disable-dev-shm-usage',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-gpu',
    '--disable-software-rasterizer',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-sync',
    '--mute-audio',
    '--no-first-run',
    '--no-zygote',
  ];
  let browser = await chromium.launch({ headless: true, args: launchArgs });
  const browserContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });

  const pexelsKey = resolvePexelsKey();
  const pixabayKey = resolvePixabayKey();

  const harvestStorage = harvestSessionStoragePayload(harvestCtx);
  await browserContext.addInitScript(
    ({ key, minAssets, pexels, pixabay, rawFirst, harvestStorage: hs }) => {
      localStorage.setItem('autotube_onboarding_seen', 'true');
      localStorage.removeItem('autotube_project');
      sessionStorage.setItem(
        'autotube_config_session',
        JSON.stringify({
          openRouterKey: key,
          sourceType: rawFirst ? 'raw' : 'stock',
          pexelsKey: pexels,
          pixabayKey: pixabay,
          flickrKey: '',
          ttsVoice: 'Leo',
        }),
      );
      sessionStorage.setItem('autotube_loop_fast_mode', 'true');
      sessionStorage.setItem('autotube_loop_min_assets', String(minAssets));
      sessionStorage.setItem('autotube_loop_broll_placement', 'true');
      if (rawFirst) sessionStorage.setItem('autotube_loop_video_first', 'true');
      for (const [k, v] of Object.entries(hs || {})) {
        sessionStorage.setItem(k, v);
      }
    },
    {
      key: realHarvest ? openRouterKey : 'sk-or-v1-e2e-full-pipeline',
      minAssets: loopMinAssets,
      pexels: pexelsKey,
      pixabay: pixabayKey,
      rawFirst: realHarvest,
      harvestStorage,
    },
  );

  const browserEvents = [];
  const recordBrowserEvent = (type, detail) => {
    browserEvents.push({ at: new Date().toISOString(), type, detail: String(detail).slice(0, 1000) });
    if (browserEvents.length > 200) browserEvents.shift();
  };

  const wireBrowserPage = async (targetPage) => {
    targetPage.on('console', (msg) => recordBrowserEvent(`console.${msg.type()}`, msg.text()));
    targetPage.on('pageerror', (err) => recordBrowserEvent('pageerror', err.message));
    targetPage.on('requestfailed', (request) => recordBrowserEvent('requestfailed', `${request.method()} ${request.url()} ${request.failure()?.errorText || ''}`));

  if (realHarvest) {
    await targetPage.route('**/openrouter.ai/**', async (route) => {
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
    await targetPage.route('**/openrouter.ai/**', async (route) => {
      const post = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: mockOpenRouterHttpBody(post, mockSegments),
      });
    });

    const stockResults = stockSearchResults(topic, STOCK_HEALTHCARE_IMAGES.length);

    await targetPage.route(
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
    await targetPage.route(/.*picsum\.photos.*/, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: png }));
    await targetPage.route(/.*wikipedia\.org.*|.*wikimedia\.org.*/, (r) =>
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
    await targetPage.route(/https:\/\/www\.youtube\.com\/.*/, (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<html></html>' }),
    );
  };

  let page = await browserContext.newPage();
  await wireBrowserPage(page);

  const gotoDevServer = async () => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await page.goto(devServer, { waitUntil: 'domcontentloaded', timeout: 90_000 });
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        recordBrowserEvent('goto.error', `attempt ${attempt}: ${msg}`);
        const recoverable = /crashed|closed|detached/i.test(msg);
        if (!recoverable || attempt === 3) throw err;
        try {
          await page.close();
        } catch {
          /* ignore */
        }
        page = await browserContext.newPage();
        await wireBrowserPage(page);
      }
    }
  };

  const scriptTimeoutMs = realHarvest ? 240_000 : 180_000;
  const mediaTimeoutMs = realHarvest ? 1_200_000 : 300_000;
  const narrationTimeoutMs = realHarvest ? 900_000 : 600_000;

  try {
  // networkidle hangs when dev server is serving long harvest API streams
    await gotoDevServer();
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
      try {
        mediaReady = await page
          .getByRole('button', { name: /Prepare Narration/i })
          .isVisible({ timeout: 10_000 });
      } catch {
        mediaReady = false;
      }
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

    await clickPipelineButton(
      page,
      page.getByTestId('media-step-next').or(page.locator('button:has-text("Prepare Narration")').first()),
    );
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
      const mediaReport = await sanitizeRealHarvestMedia(project, devServer, outDir, {
        loopMode: true,
        minAssetsPerSegment: fixState.minAssetsPerSegment || 6,
      });
      log(`🧹 Media sanitize: ${mediaReport.before} → ${mediaReport.after} assets (${mediaReport.convertedVideoToImage.length} video→image, ${mediaReport.dropped.length} dropped)`);
      if (mediaReport.relevanceDropped?.length) {
        log(`   🎯 Relevance filter: removed ${mediaReport.relevanceDropped.length} off-topic assets`);
      }
      if (mediaReport.phashDropped?.length) {
        log(`   🔍 pHash dedup: removed ${mediaReport.phashDropped.length} visually similar assets`);
      }
      if (mediaReport.volumePass === false) {
        const failing = mediaReport.harvestQuality?.failing || [];
        const detail = failing.map((f) => `${f.title}: ${f.count}/${f.need}`).join('; ');
        fixState.reHarvestMedia = true;
        fixState.mediaOffset = (fixState.mediaOffset || 0) + 2;
        return {
          ok: false,
          error: `Harvest volume gate FAIL — ${detail}`,
          harvestQualityFail: true,
          topic,
          outDir,
          fixState,
        };
      }
    }
    const timelineReport = validateEditTimeline(project, { cutIntervalSec: fixState.cutIntervalSec ?? 1.25 });
    if (timelineReport.rebuilt) {
      log(`   📐 Rebuilt editTimeline (${timelineReport.clipCount} clips, ${timelineReport.staleCount} stale IDs)`);
    }
    accumulateExcludedUrls(fixState, project);

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

    const renderEnv = buildRenderEnvFromFixState(fixState, { devServer, projectPath });
    const renderSnapshot = renderEnvJournalSnapshot(fixState);
    writeFileSync(join(outDir, 'render-env.json'), JSON.stringify(renderSnapshot, null, 2));

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
      env: {
        ...process.env,
        AUTOTUBE_LOOP_MODE: '1',
        AUTOTUBE_FINALIZE_SOURCE: produced,
        MIN_DURATION_SEC: process.env.MIN_DURATION_SEC || '30',
        REAL_PASS_FIXTURE: '1',
      },
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
      fixState,
      renderEnv: renderSnapshot,
      harvestNonce: fixState.harvestNonce || 0,
    };
  } catch (err) {
    return { ok: false, error: err.message, topic, outDir };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
