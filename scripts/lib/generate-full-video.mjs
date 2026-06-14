/**
 * Full product pipeline: topic → UI steps → server-render MP4.
 * Used by generate-full-video.mjs CLI and video-improvement-loop.mjs.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, existsSync, copyFileSync, readdirSync, unlinkSync, statSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { validateOutput, MIN_RENDER_OUTPUT_BYTES } from '../../server-render/pipelineReliability.mjs';
import { validateRenderManifest, MIN_BYTES as LOOP_MIN_RENDER_BYTES } from './validate-loop-video.mjs';
import { buildMockScriptForTopic, buildShockHookLine, mockOpenRouterHttpBody } from '../../e2e/openRouterMock.mjs';
import {
  patchProjectForLoop,
  stockSearchResults,
  buildShortHookOverlay,
  hookOverrideMatchesTopic,
} from './patch-project-for-loop.mjs';
import { validateEditTimeline, effectiveCutInterval } from './build-edit-timeline.mjs';
import { computeClipBudget, computeTimelineDiversityMetrics, shouldUseGlobalUrlDedup, TOP_UP_MAX_PASSES } from './assembly-system.mjs';
import { shouldUseModalRender, renderViaModal } from './modal-render.mjs';
import { dedupeMediaByPHash } from './perceptual-hash.mjs';
import { STOCK_HEALTHCARE_IMAGES, STOCK_CRIME_NEWS_IMAGES } from './stock-media-urls.mjs';
import { injectCuratedTopicPool, matchCuratedPoolKey } from './curated-topic-pools.mjs';
import {
  accumulateExcludedUrls,
  accumulateVisionRejectedUrls,
  harvestContextFromFixState,
  harvestSessionStoragePayload,
  loadLastProjectUrls,
  normalizeUrlKey,
} from './harvest-loop-context.mjs';
import { buildRenderEnvFromFixState, renderEnvJournalSnapshot } from './render-env-from-fix-state.mjs';
import {
  filterAssetsByRelevance,
  evaluateHarvestVolume,
  detectThinHarvest,
  loopMediaTimeoutMs,
  scoreAssetRelevance,
  passesTopUpRelevanceGate,
  extractKeywords,
  countSegmentVideos,
  countRealSegmentVideos,
  isVideoLikeAsset,
  isUnreliableVideoHost,
  isTrustedVideoHost,
  isCrimeNewsTopic,
  LOOP_MAX_MIN_ASSETS_PER_SEGMENT,
  dedupHarvestByUrl,
} from './harvest-quality.mjs';
import { filterAssetsByVision } from './harvest-vision.mjs';

export { loopMediaTimeoutMs } from './harvest-quality.mjs';

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

  // Wait for any in-progress spinners / loading overlays to clear before clicking.
  // This prevents a "click intercepted" failure when the harvest step is still finishing.
  try {
    await page.waitForFunction(
      () => !document.querySelector('[data-loading="true"], .loading-overlay, [aria-busy="true"]'),
      { timeout: 10_000 },
    );
  } catch {
    /* spinner check is best-effort */
  }

  if (settleMs > 0) await page.waitForTimeout(settleMs);

  // Attempt 1: normal click
  try {
    await locator.click({ timeout: 20_000 });
    return;
  } catch {
    /* fall through */
  }

  // Attempt 2: scroll into view then click
  try {
    await locator.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);
    await locator.click({ timeout: 15_000 });
    return;
  } catch {
    /* fall through */
  }

  // Attempt 3: force click
  try {
    await locator.click({ force: true, timeout });
    return;
  } catch {
    /* fall through */
  }

  // Attempt 4: JS dispatchEvent fallback
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
  if (isUnreliableVideoHost(url)) return false;
  return /(?:youtube\.com|youtu\.be|vimeo\.com|dailymotion\.com|player\.vimeo|archive\.org|videos\.pexels\.com|giphy)/i.test(url);
}

function isDirectGiphyCdnMp4(url = '') {
  return /^https?:\/\/media\d*\.giphy\.com\/.+\.mp4(?:[?#]|$)/i.test(url || '');
}

function isDirectVideoUrl(url = '') {
  return (
    isDirectGiphyCdnMp4(url)
    || /^https?:\/\/videos\.pexels\.com\/.+\.mp4/i.test(url || '')
    || /^https?:\/\/.+\.(mp4|webm|mov)(?:[?#]|$)/i.test(url || '')
  );
}

function isProxiedClipUrl(url = '') {
  return (url || '').includes('/api/download-clip');
}

function resolveVideoDownloadUrl(asset, devServer) {
  const pageUrl = asset.sourceUrl || asset.url;
  if (asset.url?.startsWith('/api/download-clip')) {
    return `${devServer}${asset.url}`;
  }
  if (isDirectGiphyCdnMp4(asset.url)) {
    return asset.url;
  }
  if (isDirectVideoUrl(asset.url) && !isLikelyVideoHost(pageUrl)) {
    return asset.url;
  }
  if (isLikelyVideoHost(pageUrl) || isLikelyVideoHost(asset.url) || !/\.(mp4|webm|mov)/i.test(asset.url || '')) {
    const target = isLikelyVideoHost(pageUrl) ? pageUrl : asset.url;
    return `${devServer}/api/download-clip?url=${encodeURIComponent(target)}`;
  }
  return asset.url;
}

function isGiphyAsset(asset = {}) {
  const blob = `${asset.url || ''} ${asset.sourceUrl || ''} ${asset.source || ''} ${asset.thumbnailUrl || ''}`;
  return /giphy/i.test(blob);
}

function giphyStillUrl(asset = {}) {
  if (asset.thumbnailUrl && /\.gif(?:[?#]|$)/i.test(asset.thumbnailUrl)) return asset.thumbnailUrl;
  const mp4 = asset.url || '';
  if (/giphy\.com\//i.test(mp4) && /\.mp4(?:[?#]|$)/i.test(mp4)) {
    return mp4.replace(/\.mp4(?=[?#]|$)/i, '.gif');
  }
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
        range: 'bytes=0-16383',
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
  if (isOvpThumbUrl(u)) return false;
  return (
    /\.(jpg|jpeg|png|gif|webp)(?:[?#]|$)/i.test(u)
    || /(?:upload\.wikimedia|images\.|pexels|pixabay|unsplash)/i.test(u)
  );
}

/** Bing OVP/OIP preview thumbs — not full editorial images. */
function isOvpThumbUrl(url = '') {
  const u = (url || '').toLowerCase();
  return (
    /tse\d\.mm\.bing\.net\/th[/?]id=(?:ovp|oip)/i.test(u)
    || /\/th\/id\/(?:ovp|oip)\./i.test(u)
    || /th\?id=(?:ovp|oip)\./i.test(u)
    || /th\.bing\.com\/th\/id\//i.test(u)
    || /[_-]\d{2,3}x\d{2,3}(?:\.|\/|$)/i.test(u)
    || /[?&]w=\d{1,3}(?:&|$)/i.test(u)
  );
}

/** Prefer full-size Bing pgurl over tiny murl/thumbnail. */
function resolveTopUpImageUrl(r = {}) {
  const pg = r.sourceUrl || r.pgurl || '';
  if (pg && isDirectImageCandidate(pg) && !isJunkHarvestUrl(pg)) return pg;
  const primary = r.url || r.thumbnailUrl || '';
  if (primary && isDirectImageCandidate(primary) && !isJunkHarvestUrl(primary)) return primary;
  return '';
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

/**
 * Build a topic-specific top-up query from segment keywords and topic keywords,
 * avoiding generic filler words that return unrelated results.
 */
function buildTopUpQuery(seg, topic, round) {
  const weak = new Set([
    'tiktok', 'live', 'stream', 'streamed', 'video', 'news', 'breaking', 'viral',
    'social', 'media', 'online', 'watch', 'footage', 'clip', 'trending', 'update',
  ]);
  const segKws = extractKeywords(`${seg.title || ''} ${seg.narration || ''}`, 8).filter((k) => !weak.has(k));
  const topicKws = extractKeywords(topic, 6).filter((k) => !weak.has(k));

  // Prioritise segment keywords first, then fill with topic keywords
  const combined = [...new Set([...segKws, ...topicKws])].slice(0, 5);

  // Round-specific suffixes that add context without drowning out the topic
  const suffixes = [
    '',               // round 0: just the keywords, no filler
    'photograph',     // round 1: editorial photo angle
    'footage',        // round 2: video/documentary angle
    'news image',     // round 3: press/editorial angle
    'documentary',    // round 4: archival angle
  ];
  const suffix = suffixes[round] || '';
  return `${combined.join(' ')}${suffix ? ' ' + suffix : ''}`.trim();
}

const TOP_UP_VIDEO_ENDPOINTS = [
  '/api/search-vimeo',
  '/api/search-videos',
  '/api/search-google-videos',
  '/api/search-bing-videos',
];
const VIDEO_TOP_UP_QUERY_SUFFIXES = ['footage', 'news footage', 'documentary clip', 'security camera', 'live stream'];
const TOP_UP_IMAGE_ENDPOINTS = [
  '/api/search-google-images',
  '/api/search-bing-images',
  '/api/search-duckduckgo-images',
  '/api/search-hybrid',
  '/api/search-unsplash',
];

/** News/archive endpoints for editorial crime/news topics — thumbnails are real press photos. */
const TOP_UP_NEWS_ENDPOINTS = [
  '/api/search-bing-news',
  '/api/search-archive',
  '/api/search-govpress',
];

async function fetchVideoSearchResults(devServer, endpoint, query) {
  try {
    const res = await fetch(`${devServer}${endpoint}?q=${encodeURIComponent(query)}`);
    if (!res.ok) return [];
    const data = await res.json();
    const rows = data.results || data;
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function buildVideoTopUpQueries(seg, topic, round = 0) {
  const base = buildTopUpQuery(seg, topic, round);
  const segKws = extractKeywords(`${seg.title || ''} ${seg.narration || ''}`, 4).join(' ');
  const topicKws = extractKeywords(topic, 4).join(' ');
  const core = `${segKws || seg.title} ${topicKws}`.trim();
  const queries = [
    base,
    ...VIDEO_TOP_UP_QUERY_SUFFIXES.map((suffix) => `${core} ${suffix}`.trim()),
    `${topic} ${seg.title} b-roll`.trim(),
  ];
  const ctx = `${topic} ${seg.title || ''} ${seg.type || ''}`.toLowerCase();
  if (/museum|louvre|heist|robbery|jewel/.test(ctx) && (seg.type === 'intro' || round === 0)) {
    queries.unshift(
      'museum heist security camera footage',
      'paris jewelry robbery news',
      'police crime scene news footage',
      'crown jewels stolen news report',
      'police chase robbery suspect arrest footage',
      'surveillance cctv caught crime news report',
    );
  }
  if (/cult|church|leader|empire|documentary|investigation/.test(ctx) && (seg.type === 'intro' || round === 0)) {
    queries.unshift(
      'cult documentary investigation footage',
      'news interview talking head serious',
      'crowd gathering news report',
      'police arrest news footage',
    );
  }
  return queries.filter((q, i, arr) => q && arr.indexOf(q) === i);
}

/** Visual-metaphor top-up queries (EditBuddy-style) — emotion/action, not literal transcript words. */
function buildMetaphorTopUpQueries(seg, topic) {
  const ctx = `${topic} ${seg.title || ''} ${seg.narration || ''}`.toLowerCase();
  const segType = (seg.type || '').toLowerCase();

  if (/museum|louvre|heist|robbery|jewel|crown|stolen|theft/.test(ctx)) {
    const coreHeist = [
      'security camera cctv museum interior footage',
      'police crime scene yellow tape investigation',
      'detective examining evidence stolen jewelry',
      'diamond necklace display case jewelry vault broken',
      'museum gallery empty shattered display case theft',
      'news anchor breaking heist report television studio',
      'paris police crime investigation scene louvre',
      'crown jewels display glass case museum security',
      // action / pursuit B-roll
      'police chase suspect robbery arrest news footage',
      'surveillance camera street caught crime suspect',
      'armed robbery cctv footage breaking news',
      'police perimeter crime scene crowd reporters',
      'louvre heist suspects arrested investigation news',
      'thief running getaway escape police pursuit',
      'art theft crown jewels heist documentary footage',
    ];
    if (/arrest|caught|suspect|charged|trial/.test(ctx)) {
      return [
        'police handcuff arrest suspect crime scene news',
        'detective interview investigation suspect footage news',
        'police car pursuit chase robbery suspect arrested',
        ...coreHeist,
      ];
    }
    if (/tiktok|live|stream|viral|broadcast/.test(ctx)) {
      return [
        'cctv security camera live footage crime viral',
        'viral crime news broadcast television report breaking',
        'surveillance camera robbery streamed live viral',
        ...coreHeist,
      ];
    }
    if (segType === 'intro' || /introduction|overview|start/.test(ctx)) {
      return [
        'museum heist security camera footage night robbery',
        'masked robber news report stolen jewels breaking news',
        'police chase suspect robbery fleeing news footage',
        ...coreHeist,
      ];
    }
    return coreHeist;
  }

  if (/cult|church|leader|empire|youtube|follower/.test(ctx)) {
    return [
      'documentary crowd gathering protest serious',
      'news anchor breaking story investigation',
      'courtroom gavel trial testimony footage',
      'protest crowd aerial news footage police',
      'religious leader followers documentary interview',
      'investigative journalism report footage expose',
    ];
  }

  if (/tiktok|live|stream/.test(ctx)) {
    return [
      'news reporter breaking story live television broadcast',
      'news anchor desk live report camera studio',
      'viral moment news coverage footage breaking story',
    ];
  }

  return [];
}

function toRelativeClipProxyUrl(devServer, pageUrl, durationSec = 10) {
  return `/api/download-clip?url=${encodeURIComponent(pageUrl)}&duration=${durationSec}`;
}

function buildVideoTopUpAsset(r, devServer, seg, query, sourceLabel) {
  const pageUrl = r.url || r.content || r.sourceUrl;
  if (!pageUrl || !/^https?:\/\//i.test(pageUrl)) return null;
  if (isUnreliableVideoHost(pageUrl)) return null;
  if (!isTrustedVideoHost(pageUrl)) return null;
  const clipUrl = toRelativeClipProxyUrl(devServer, pageUrl, 10);
  return {
    segmentId: seg.id,
    type: 'video',
    url: clipUrl,
    thumbnailUrl: r.thumbnailUrl || r.images?.large,
    alt: r.title || r.alt || `${seg.title} ${query}`,
    query,
    source: `${sourceLabel} (volume video top-up)`,
    duration: 10,
    sourceUrl: pageUrl,
    isFallback: false,
  };
}

function segmentUniqueCount(project, segmentId) {
  const keys = new Set(
    (project.media || [])
      .filter((m) => m.segmentId === segmentId)
      .map((a) => (a.url || '').split('?')[0])
      .filter(Boolean),
  );
  return keys.size;
}

/** Inject curated + stock crime pool until global unique URL target is met. */
function ensureEditorialPool(project, minPerSegment, report, options = {}) {
  const topic = project.topic || project.title || '';
  const poolKey = matchCuratedPoolKey(topic);
  if (!poolKey && !options.forceCurated && !isCrimeNewsTopic(topic)) return 0;

  const unique = new Set(
    (project.media || []).map((a) => normalizeUrlKey(a.url, a.sourceUrl)).filter(Boolean),
  ).size;
  const { requiredUniqueUrls } = computeClipBudget(project, options.cutIntervalSec ?? 1.25);
  const target = Math.max(requiredUniqueUrls, 30);
  if (unique >= target && !options.forceCurated) return 0;

  const added = injectCrimeFallbackPool(project, minPerSegment, report, {
    forceCurated: true,
  });
  if (added) {
    report.curatedPoolTopUp = (report.curatedPoolTopUp || 0) + added;
  }
  return added;
}

/** Inject curated editorial crime/museum stock when live harvest pool is below clip budget. */
function injectCrimeFallbackPool(project, minPerSegment, report, { forceCurated = false } = {}) {
  const topic = project.topic || project.title || '';
  let added = 0;
  if (forceCurated || isCrimeNewsTopic(topic)) {
    added += injectCuratedTopicPool(project, minPerSegment, report);
  }
  if (!isCrimeNewsTopic(topic) && !forceCurated) return added;

  const used = new Set(
    (project.media || []).map((a) => normalizeUrlKey(a.url, a.sourceUrl)).filter(Boolean),
  );
  let stockIdx = 0;
  const segments = project.script || [];

  for (const seg of segments) {
    let count = segmentUniqueCount(project, seg.id);
    while (count < minPerSegment && stockIdx < STOCK_CRIME_NEWS_IMAGES.length) {
      const stock = STOCK_CRIME_NEWS_IMAGES[stockIdx];
      stockIdx += 1;
      const key = normalizeUrlKey(stock.url);
      if (!key || used.has(key)) continue;
      used.add(key);
      project.media.push({
        id: `crime-fallback-${stockIdx}-${seg.id.slice(0, 8)}`,
        segmentId: seg.id,
        type: 'image',
        url: stock.url,
        thumbnailUrl: stock.url.replace('w=1920', 'w=400'),
        alt: stock.alt,
        source: 'crime-fallback-stock',
        query: topic,
      });
      count += 1;
      added += 1;
    }
  }

  if (added) {
    report.crimeFallbackInjected = added;
  }
  return added;
}

async function addImageTopUpCandidate(project, seg, r, q, endpoint, report, topic, topicKeywords, { relaxed = false } = {}) {
  if (isUnreliableVideoHost(`${r.url || ''} ${r.sourceUrl || ''}`)) return false;
  const imageUrl = resolveTopUpImageUrl(r);
  if (!imageUrl) return false;
  const key = imageUrl.split('?')[0];
  // Global URL dedup: reject if this URL already exists in ANY segment pool.
  const alreadyInProject = (project.media || []).some(
    (m) => (m.url || '').split('?')[0] === key,
  );
  if (alreadyInProject) return false;

  const asset = { url: imageUrl, alt: r.alt || '', query: q, type: 'image' };
  if (!relaxed && !passesTopUpRelevanceGate(asset, seg, topic, topicKeywords)) return false;
  if (relaxed) {
    const score = scoreAssetRelevance(asset, seg, topic, topicKeywords);
    if (score < 0.15) return false;
  }
  if (!(await canFetch(imageUrl, { timeoutMs: 8000, minBytes: 8192 }))) return false;

  const relevance = scoreAssetRelevance(asset, seg, topic, topicKeywords);
  const uniqueCount = segmentUniqueCount(project, seg.id);
  project.media.push({
    id: `topup-${seg.id}-${uniqueCount}`,
    segmentId: seg.id,
    type: 'image',
    url: imageUrl,
    alt: r.alt || `${seg.title} ${topic}`,
    query: q,
    source: `${r.source || 'Search'} (volume top-up)`,
    duration: 5,
    isFallback: false,
  });
  report.volumeTopUp = report.volumeTopUp || [];
  report.volumeTopUp.push({ segmentId: seg.id, url: imageUrl, endpoint, relevance });
  return true;
}

async function rebalanceFailingSegments(project, devServer, minPerSegment, report, topic, topicKeywords, options = {}) {
  let volume = evaluateHarvestVolume(project, minPerSegment);
  const needsVideoQuota = options.harvestVideoFirst && (options.minVideosPerSegment || 0) > 0;
  const videoShort = needsVideoQuota && (project.script || []).some(
    (s) => countSegmentVideos(project.media, s.id) < options.minVideosPerSegment,
  );
  if (volume.pass && !videoShort) return;

  const segments = Object.fromEntries((project.script || []).map((s) => [s.id, s]));

  if (needsVideoQuota && videoShort) {
    await ensureVideoQuotaPerSegment(
      project,
      devServer,
      report,
      topic,
      topicKeywords,
      options.minVideosPerSegment,
    );
    volume = evaluateHarvestVolume(project, minPerSegment);
    if (volume.pass && !(project.script || []).some(
      (s) => countSegmentVideos(project.media, s.id) < options.minVideosPerSegment,
    )) return;
  }
  const weak = new Set([
    'tiktok', 'live', 'stream', 'streamed', 'video', 'news', 'breaking', 'viral',
    'social', 'media', 'online', 'watch', 'footage', 'clip', 'trending', 'update',
  ]);

  for (const fail of volume.failing) {
    const seg = segments[fail.segmentId];
    if (!seg) continue;

    if (needsVideoQuota && countSegmentVideos(project.media, fail.segmentId) < options.minVideosPerSegment) {
      await ensureVideoQuotaPerSegment(
        project,
        devServer,
        report,
        topic,
        topicKeywords,
        options.minVideosPerSegment,
        [seg],
      );
    }

    const extraQueries = [
      buildTopUpQuery(seg, topic, 3),
      `${extractKeywords(seg.narration || '', 5).filter((k) => !weak.has(k)).join(' ')} press photo`.trim(),
      `${extractKeywords(topic, 4).filter((k) => !weak.has(k)).join(' ')} ${extractKeywords(seg.title || '', 3).filter((k) => !weak.has(k)).join(' ')}`.trim(),
    ].filter(Boolean);

    for (const q of extraQueries) {
      if (segmentUniqueCount(project, fail.segmentId) >= minPerSegment) break;
      for (const endpoint of TOP_UP_IMAGE_ENDPOINTS) {
        const results = await fetchImageSearchResults(devServer, endpoint, q);
        const candidates = results
          .map((r) => ({ url: r.url || r.thumbnailUrl, alt: r.alt || r.title || seg.title, source: r.source }))
          .filter((r) => r.url && isDirectImageCandidate(r.url) && !isJunkHarvestUrl(r.url));
        for (const r of candidates) {
          if (await addImageTopUpCandidate(project, seg, r, q, endpoint, report, topic, topicKeywords)) {
            if (segmentUniqueCount(project, fail.segmentId) >= minPerSegment) break;
          }
        }
        if (segmentUniqueCount(project, fail.segmentId) >= minPerSegment) break;
      }
    }

    let count = segmentUniqueCount(project, fail.segmentId);
    for (const donor of [...(project.media || [])]) {
      if (count >= minPerSegment) break;
      if (donor.segmentId === fail.segmentId) continue;
      const key = (donor.url || '').split('?')[0];
      const alreadyInSeg = project.media.some(
        (m) => m.segmentId === fail.segmentId && (m.url || '').split('?')[0] === key,
      );
      if (alreadyInSeg) continue;
      if (!passesTopUpRelevanceGate(donor, seg, topic, topicKeywords)) continue;
      project.media.push({
        ...donor,
        id: `topup-share-${fail.segmentId}-${count}`,
        segmentId: fail.segmentId,
        source: `${donor.source || 'Search'} (segment rebalance)`,
      });
      report.volumeTopUpShare = report.volumeTopUpShare || [];
      report.volumeTopUpShare.push({ from: donor.segmentId, to: fail.segmentId, url: donor.url });
      count += 1;
    }
  }

  volume = evaluateHarvestVolume(project, minPerSegment);
  if (!volume.pass) {
    // Last resort: relaxed relevance so thin segments don't abort the loop.
    for (const fail of volume.failing) {
      const seg = segments[fail.segmentId];
      if (!seg) continue;
      const fallbackQ = `${extractKeywords(seg.title || '', 4).join(' ')} ${extractKeywords(topic, 3).join(' ')} photo`.trim();
      for (const endpoint of TOP_UP_IMAGE_ENDPOINTS) {
        if (segmentUniqueCount(project, fail.segmentId) >= minPerSegment) break;
        const results = await fetchImageSearchResults(devServer, endpoint, fallbackQ);
        for (const r of results) {
          const url = r.url || r.thumbnailUrl;
          if (!url || !isDirectImageCandidate(url) || isJunkHarvestUrl(url)) continue;
          if (await addImageTopUpCandidate(
            project, seg, { url, alt: r.alt || r.title || seg.title, source: r.source },
            fallbackQ, endpoint, report, topic, topicKeywords, { relaxed: true },
          )) {
            if (segmentUniqueCount(project, fail.segmentId) >= minPerSegment) break;
          }
        }
      }
      let count = segmentUniqueCount(project, fail.segmentId);
      for (const donor of [...(project.media || [])]) {
        if (count >= minPerSegment) break;
        if (donor.segmentId === fail.segmentId) continue;
        const key = (donor.url || '').split('?')[0];
        if (project.media.some((m) => m.segmentId === fail.segmentId && (m.url || '').split('?')[0] === key)) continue;
        project.media.push({
          ...donor,
          id: `topup-relaxed-${fail.segmentId}-${count}`,
          segmentId: fail.segmentId,
          source: `${donor.source || 'Search'} (relaxed rebalance)`,
        });
        count += 1;
      }
    }
    volume = evaluateHarvestVolume(project, minPerSegment);
    if (!volume.pass) {
      report.volumeTopUpMiss = volume.failing.map((f) => ({
        segmentId: f.segmentId,
        count: f.count,
        need: minPerSegment,
      }));
    }
  }
}

async function topUpSegmentImages(project, devServer, seg, minPerSegment, report, topic, topicKeywords) {
  let uniqueCount = segmentUniqueCount(project, seg.id);

  for (let round = 0; round < TOP_UP_IMAGE_ENDPOINTS.length && uniqueCount < minPerSegment; round += 1) {
    const queries = round === 0
      ? [...buildMetaphorTopUpQueries(seg, topic), buildTopUpQuery(seg, topic, round)]
      : [buildTopUpQuery(seg, topic, round)];
    for (const q of queries) {
      if (uniqueCount >= minPerSegment) break;
      const results = await fetchImageSearchResults(devServer, TOP_UP_IMAGE_ENDPOINTS[round], q);
      const candidates = results
        .map((r) => ({
          url: resolveTopUpImageUrl(r),
          alt: r.alt || r.title || seg.title,
          source: r.source,
          sourceUrl: r.sourceUrl,
        }))
        .filter((r) => r.url && isDirectImageCandidate(r.url) && !isJunkHarvestUrl(r.url));

      for (const r of candidates) {
        if (await addImageTopUpCandidate(project, seg, r, q, TOP_UP_IMAGE_ENDPOINTS[round], report, topic, topicKeywords)) {
          uniqueCount = segmentUniqueCount(project, seg.id);
          if (uniqueCount >= minPerSegment) break;
        }
      }
    }
  }
  return uniqueCount;
}

async function topUpHarvestVolume(project, devServer, minPerSegment, report, options = {}) {
  const segments = project.script || [];
  const topic = project.topic || project.title || '';
  const topicKeywords = extractKeywords(topic, 12);
  let harvestVideoFirst = options.harvestVideoFirst !== false;
  const minVideosPerSegment = harvestVideoFirst ? Math.max(2, options.minVideosPerSegment || 2) : 0;

  const totalRealVideos = (segments || []).reduce(
    (sum, seg) => sum + countRealSegmentVideos(project.media, seg.id),
    0,
  );
  if (isCrimeNewsTopic(topic) && totalRealVideos === 0) {
    harvestVideoFirst = false;
    report.videoFirstRelaxed = true;
  }

  if (harvestVideoFirst && minVideosPerSegment > 0) {
    await ensureVideoQuotaPerSegment(project, devServer, report, topic, topicKeywords, minVideosPerSegment);
  }

  await Promise.all(
    segments.map((seg) => topUpSegmentImages(project, devServer, seg, minPerSegment, report, topic, topicKeywords)),
  );

  if (harvestVideoFirst && minVideosPerSegment > 0) {
    await ensureVideoQuotaPerSegment(project, devServer, report, topic, topicKeywords, minVideosPerSegment);
  }

  // For crime/news topics, supplement with news/archive endpoints using action-first metaphor queries.
  if (isCrimeNewsTopic(topic)) {
    await Promise.all(segments.map(async (seg) => {
      let uniqueCount = segmentUniqueCount(project, seg.id);
      if (uniqueCount >= minPerSegment) return;
      const metaphorQueries = buildMetaphorTopUpQueries(seg, topic);
      for (const q of metaphorQueries) {
        if (uniqueCount >= minPerSegment) break;
        for (const endpoint of TOP_UP_NEWS_ENDPOINTS) {
          if (uniqueCount >= minPerSegment) break;
          const results = await fetchImageSearchResults(devServer, endpoint, q);
          const candidates = results
            .map((r) => ({
              url: resolveTopUpImageUrl(r),
              alt: r.alt || r.title || seg.title,
              source: r.source || endpoint,
              sourceUrl: r.sourceUrl,
            }))
            .filter((r) => r.url && isDirectImageCandidate(r.url) && !isJunkHarvestUrl(r.url));
          for (const r of candidates) {
            if (await addImageTopUpCandidate(project, seg, r, q, endpoint, report, topic, topicKeywords)) {
              uniqueCount = segmentUniqueCount(project, seg.id);
              if (uniqueCount >= minPerSegment) break;
            }
          }
        }
      }
    }));
  }

  await rebalanceFailingSegments(project, devServer, minPerSegment, report, topic, topicKeywords, {
    minVideosPerSegment: harvestVideoFirst ? minVideosPerSegment : 0,
    harvestVideoFirst,
  });
}

function isJunkHarvestUrl(url) {
  const u = (url || '').toLowerCase();
  return (
    isUnreliableVideoHost(url) ||
    isOvpThumbUrl(u) ||
    /tiktokcdn\.com|tiktokpng\.com|tiktokv\.com|muscdn\.com|byteoversea\.com/i.test(u) ||
    u.includes('gravatar.com/avatar') ||
    /tse\d\.mm\.bing\.net\/th[/?]id=ovp/i.test(u) ||
    u.includes('/th/id/ovp.') ||
    u.includes('th?id=ovp.') ||
    /tse\d\.mm\.bing\.net\/th[/?]id=oip/i.test(u) ||
    u.includes('/th/id/oip.') ||
    u.includes('th?id=oip.') ||
    u.includes('pinterest.com') ||
    u.includes('pinimg.com') ||
    u.includes('pin.it/') ||
    /gettyimages|shutterstock|alamy|istockphoto/i.test(u) ||
    /i\.ytimg\.com\/vi\/|\/maxresdefault\.|\/hqdefault\.|\/oar\d*\.jpg/i.test(u) ||
    /watch\s+free\s+movies?\s+on\s+tiktok|free\s+movies?\s+on\s+tiktok/i.test(u) ||
    /whitehouse\.gov|search-govpress|govpress/i.test(u)
  );
}

function normalizeKeptVideoUrl(asset, devServer) {
  const pageUrl = asset.sourceUrl || asset.url || '';
  if (isLikelyVideoHost(pageUrl) || isLikelyVideoHost(asset.url)) {
    const target = isLikelyVideoHost(pageUrl) ? pageUrl : asset.url;
    return toRelativeClipProxyUrl(devServer, target, asset.duration || 10);
  }
  const downloadUrl = resolveVideoDownloadUrl(asset, devServer);
  if (isProxiedClipUrl(downloadUrl)) {
    const rel = downloadUrl.replace(devServer, '');
    return rel.startsWith('/api/') ? rel : downloadUrl;
  }
  return asset.url;
}

async function tryKeepVideoAsset(asset, devServer, sanitized, report, { loopMode = false } = {}) {
  const downloadUrl = resolveVideoDownloadUrl(asset, devServer);
  const proxied = isProxiedClipUrl(downloadUrl) || isLikelyVideoHost(asset.url) || isLikelyVideoHost(asset.sourceUrl);
  const direct = isDirectVideoUrl(asset.url) && !proxied;
  const reasonPrefix = loopMode ? 'loop mode: ' : '';
  const keepUrl = normalizeKeptVideoUrl(asset, devServer);

  if (proxied) {
    const hostBlob = `${asset.url || ''} ${asset.sourceUrl || ''}`;
    if (isUnreliableVideoHost(hostBlob)) {
      report.dropped.push({ url: asset.url, reason: 'unreliable video host (tiktok/instagram/x)' });
      return false;
    }
    if (!isTrustedVideoHost(hostBlob)) {
      report.dropped.push({ url: asset.url, reason: 'non-trusted video host (need youtube/vimeo/pexels)' });
      return false;
    }
    const probeUrl = downloadUrl.startsWith('http') ? downloadUrl : `${devServer}${keepUrl}`;
    const clipOk = await canFetch(probeUrl, { timeoutMs: 20000, minBytes: 512, expectVideo: false });
    if (!clipOk) {
      report.dropped.push({ url: asset.url, reason: 'proxy clip probe failed' });
      return false;
    }
    sanitized.push({ ...asset, type: 'video', url: keepUrl, sourceUrl: asset.sourceUrl || asset.url });
    report.keptVideo.push({ url: asset.url, reason: `${reasonPrefix}trusted host proxy` });
    return true;
  }

  if (direct) {
    const clipOk = await canFetch(downloadUrl, { timeoutMs: 15000, minBytes: 2048, expectVideo: true });
    if (clipOk) {
      sanitized.push({ ...asset, type: 'video', url: keepUrl, sourceUrl: asset.sourceUrl || asset.url });
      report.keptVideo.push({ url: asset.url, reason: `${reasonPrefix}direct video URL` });
      return true;
    }
  }

  const clipOk = await canFetch(downloadUrl, { timeoutMs: 15000, minBytes: 2048, expectVideo: true });
  if (clipOk) {
    sanitized.push({ ...asset, type: 'video', url: keepUrl, sourceUrl: asset.sourceUrl || asset.url });
    report.keptVideo.push({ url: asset.url, reason: `${reasonPrefix}clip probe OK` });
    return true;
  }
  return false;
}

async function addVideoTopUpCandidate(project, seg, draft, devServer, endpoint, report, topic, topicKeywords) {
  const key = (draft.sourceUrl || draft.url || '').split('?')[0];
  // Global URL dedup: reject if this source URL already exists in ANY segment pool.
  const alreadyInProject = (project.media || []).some(
    (m) => `${m.sourceUrl || m.url || ''}`.split('?')[0] === key,
  );
  if (alreadyInProject) return false;
  if (!passesTopUpRelevanceGate(draft, seg, topic, topicKeywords)) return false;

  const probeSanitized = [];
  const probeReport = { keptVideo: [], dropped: [] };
  if (!(await tryKeepVideoAsset(draft, devServer, probeSanitized, probeReport, { loopMode: true }))) return false;
  report.keptVideo.push(...probeReport.keptVideo);
  const kept = probeSanitized[0] || draft;
  const videoCount = countSegmentVideos(project.media, seg.id);

  project.media.push({
    ...kept,
    id: `topup-vid-${seg.id}-${videoCount}`,
  });
  report.volumeTopUp = report.volumeTopUp || [];
  report.volumeTopUp.push({
    segmentId: seg.id,
    url: kept.sourceUrl || kept.url,
    endpoint,
    relevance: scoreAssetRelevance(kept, seg, topic, topicKeywords),
    type: 'video',
  });
  return true;
}

async function ensureVideoQuotaPerSegment(
  project,
  devServer,
  report,
  topic,
  topicKeywords,
  minVideosPerSegment = 2,
  segmentsOverride = null,
) {
  const segments = segmentsOverride?.length ? segmentsOverride : (project.script || []);
  for (const seg of segments) {
    let videoCount = countSegmentVideos(project.media, seg.id);
    if (videoCount >= minVideosPerSegment) continue;

    const queries = buildVideoTopUpQueries(seg, topic, 0);
    let attempts = 0;
    const maxAttempts = TOP_UP_VIDEO_ENDPOINTS.length * queries.length;

    for (const q of queries) {
      if (videoCount >= minVideosPerSegment) break;
      for (const endpoint of TOP_UP_VIDEO_ENDPOINTS) {
        if (videoCount >= minVideosPerSegment || attempts >= maxAttempts) break;
        attempts += 1;
        const results = await fetchVideoSearchResults(devServer, endpoint, q);
        for (const r of results) {
          if (videoCount >= minVideosPerSegment) break;
          const draft = buildVideoTopUpAsset(r, devServer, seg, q, r.source || 'Video search');
          if (!draft) continue;
          if (await addVideoTopUpCandidate(project, seg, draft, devServer, endpoint, report, topic, topicKeywords)) {
            videoCount = countSegmentVideos(project.media, seg.id);
          }
        }
      }
    }
  }
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
    // Reject junk on primary URL or embedded source — proxy paths hide getty/stock hosts.
    if (isJunkHarvestUrl(asset.url) || isJunkHarvestUrl(asset.sourceUrl)) {
      report.dropped.push({ url: asset.url, reason: 'junk URL (avatar/video-thumb placeholder)' });
      continue;
    }

    if (asset.type !== 'video') {
      sanitized.push(asset);
      continue;
    }

    if (await tryKeepVideoAsset(asset, devServer, sanitized, report, { loopMode })) {
      continue;
    }

    const thumbnailUrl = asset.thumbnailUrl || (isImageLikeUrl(asset.url) ? asset.url : '') || giphyStillUrl(asset);
    if (thumbnailUrl && !isJunkHarvestUrl(thumbnailUrl) && await canFetch(thumbnailUrl, { timeoutMs: 8000 })) {
      sanitized.push({
        ...asset,
        type: 'image',
        url: thumbnailUrl,
        source: `${asset.source || 'Video'} still`,
        isFallback: false,
      });
      report.convertedVideoToImage.push({
        url: asset.url,
        thumbnailUrl,
        reason: loopMode ? 'loop mode: video→still (clip unavailable)' : 'clip unavailable/slow',
      });
      continue;
    }

    if (fallbackImage && !isImageLikeUrl(fallbackImage)) {
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

    report.dropped.push({
      url: asset.url,
      thumbnailUrl,
      reason: loopMode ? 'loop mode: video without usable clip or still' : 'clip and thumbnail unavailable',
    });
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

  // Loop mode: 0.28 keeps editorial press photos that score in the 0.25–0.35 range due to
  // sparse keyword metadata (e.g. museum images for TikTok-stream segments), while the
  // scoreAssetRelevance early-exit gate still rejects assets with zero keyword hits.
  const relevance = filterAssetsByRelevance(validated, project, {
    minScore: loopMode ? 0.28 : 0.25,
  });
  report.relevanceDropped = relevance.dropped;
  if (relevance.dropped.length) {
    report.beforeRelevance = validated.length;
    report.afterRelevance = relevance.media.length;
  }

  const prePhashBudget = computeClipBudget(
    { script: project.script, media: relevance.media },
    options.cutIntervalSec ?? 1.25,
  );
  const uniqueBeforePhash = new Set(
    relevance.media.map((a) => normalizeUrlKey(a.url, a.sourceUrl)).filter(Boolean),
  ).size;
  const skipPhashDedup = false;
  const thinPoolPhash = loopMode && uniqueBeforePhash < prePhashBudget.requiredUniqueUrls * 1.25;
  const deduped = dedupeMediaByPHash(relevance.media, {
    devServer,
    maxDistance: thinPoolPhash ? 8 : 10,
    onDrop: (item, reason) => report.phashDropped.push({ url: item.url, reason }),
  });
  if (thinPoolPhash) report.thinPoolPhashTight = true;
  report.phashHashCount = deduped.hashCount;

  // URL-level cross-segment dedup: prevent the same shot appearing in multiple segment pools.
  // This runs after phash dedup so that visually distinct but URL-identical assets are already
  // collapsed. First occurrence (original segment assignment) wins.
  // When the pool is thin relative to the clip budget, defer this dedup until after top-up so
  // we don't shrink an already-marginal pool before top-up has a chance to fill it.
  const uniqueUrlsPreDedup = new Set(
    deduped.media.map((a) => normalizeUrlKey(a.url, a.sourceUrl)).filter(Boolean),
  ).size;
  const _preTopUpBudget = computeClipBudget(
    { script: project.script, media: deduped.media },
    options.cutIntervalSec ?? 1.25,
  );
  if (shouldUseGlobalUrlDedup(uniqueUrlsPreDedup, _preTopUpBudget.requiredUniqueUrls)) {
    const urlDeduped = dedupHarvestByUrl(deduped.media);
    project.media = urlDeduped.media;
    if (urlDeduped.dupCount) {
      report.crossSegDupCount = urlDeduped.dupCount;
    }
  } else {
    project.media = deduped.media;
    report.deferredGlobalDedup = true;
  }

  const minPerSeg = loopMode ? minPerSegment : Math.min(4, minPerSegment);
  const bySegmentAfter = {};
  for (const asset of project.media) {
    bySegmentAfter[asset.segmentId] = (bySegmentAfter[asset.segmentId] || 0) + 1;
  }
  // Loop mode: never clone the same URL into segments — forces top-up instead of repeat montage.
  if (!loopMode) {
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
  }
  report.after = project.media.length;

  if (loopMode) {
    await topUpHarvestVolume(project, devServer, minPerSegment, report, {
      harvestVideoFirst: options.harvestVideoFirst !== false,
      minVideosPerSegment: options.minVideosPerSegment || 2,
    });
    // Re-apply URL dedup after top-up: top-up candidates pass per-segment uniqueness checks
    // but a URL could still appear in multiple segments if search returns the same result
    // for different segment queries.
    const topupDeduped = dedupHarvestByUrl(project.media);
    if (topupDeduped.dupCount) {
      report.topUpDupCount = topupDeduped.dupCount;
      project.media = topupDeduped.media;
    }
    report.afterTopUp = project.media.length;

    const topicForFallback = project.topic || project.title || '';
    ensureEditorialPool(project, minPerSegment, report, {
      forceCurated: options.useCuratedPool === true,
      cutIntervalSec: options.cutIntervalSec,
    });

    // Force-clear the stale browser-generated editTimeline so validateEditTimeline
    // always rebuilds a fresh timeline that includes top-up assets. Without this,
    // top-up assets are silently ignored when the old timeline's stale-ratio is < 10%.
    project.editTimeline = [];

    // Vision-screen harvested stills (browser vision is off in loop fast mode).
    if (options.visionHarvest !== false) {
      const apiKey = resolveOpenRouterKey();
      if (apiKey) {
        const vision = await filterAssetsByVision(project.media, project, { apiKey });
        report.visionRejectedUrls = vision.rejectedUrls || [];
        if (vision.dropped?.length) {
          report.visionDropped = vision.dropped;
          report.visionScanned = vision.scanned;
          project.media = vision.media;
          const uniqueAfterVision = new Set(
            (project.media || []).map((a) => normalizeUrlKey(a.url, a.sourceUrl)).filter(Boolean),
          ).size;
          const { requiredUniqueUrls: budgetAfterVision } = computeClipBudget(
            project,
            options.cutIntervalSec ?? 1.25,
          );
          if (uniqueAfterVision < budgetAfterVision) {
            await topUpHarvestVolume(project, devServer, minPerSegment, report, {
              harvestVideoFirst: options.harvestVideoFirst !== false,
              minVideosPerSegment: options.minVideosPerSegment || 2,
              visionTopUpPass: true,
            });
            const visionTopUpDedup = dedupHarvestByUrl(project.media);
            if (visionTopUpDedup.dupCount) {
              report.visionTopUpDupCount = visionTopUpDedup.dupCount;
              project.media = visionTopUpDedup.media;
            }
          }
        } else {
          report.visionScanned = vision.scanned;
          report.visionRejectedUrls = vision.rejectedUrls || [];
        }
      }
    }

    // Post-vision pHash dedup on full-res sources — catches same shot under different URLs.
    const uniqueBeforePostVision = new Set(
      (project.media || []).map((a) => normalizeUrlKey(a.url, a.sourceUrl)).filter(Boolean),
    ).size;
    const { requiredUniqueUrls: budgetPostVision } = computeClipBudget(project, options.cutIntervalSec ?? 1.25);
    const thinForPhash = uniqueBeforePostVision < Math.max(18, budgetPostVision);
    const postVisionDedup = dedupeMediaByPHash(project.media, {
      devServer,
      maxDistance: thinForPhash ? 8 : 10,
      onDrop: (item, reason) => report.postVisionPhashDropped = [
        ...(report.postVisionPhashDropped || []),
        { url: item.url, reason },
      ],
    });
    if ((report.postVisionPhashDropped || []).length) {
      project.media = postVisionDedup.media;
      report.postVisionPhashCount = report.postVisionPhashDropped.length;
      ensureEditorialPool(project, minPerSegment, report, {
        cutIntervalSec: options.cutIntervalSec,
      });
    }
  }

  let volume = evaluateHarvestVolume(project, minPerSegment);
  report.harvestQuality = volume;

  if (loopMode) {
    const uniqueUrls = new Set(
      (project.media || []).map((a) => normalizeUrlKey(a.url, a.sourceUrl)).filter(Boolean),
    );
    report.uniqueUrlCount = uniqueUrls.size;
    const { requiredUniqueUrls: minUnique } = computeClipBudget(project, options.cutIntervalSec ?? 1.25);

    // Last-chance per-segment fill: relaxed relevance for segments within 2 of quota.
    if (!volume.pass && volume.failing.every((f) => f.count >= minPerSegment - 2)) {
      const topic = project.topic || project.title || '';
      const topicKeywords = extractKeywords(topic, 12);
      const segmentsById = Object.fromEntries((project.script || []).map((s) => [s.id, s]));
      for (const fail of volume.failing) {
        const seg = segmentsById[fail.segmentId];
        if (!seg) continue;
        const rescueQueries = [
          buildTopUpQuery(seg, topic, 4),
          ...buildMetaphorTopUpQueries(seg, topic),
        ].filter(Boolean);
        for (const q of rescueQueries) {
          if (segmentUniqueCount(project, fail.segmentId) >= minPerSegment) break;
          for (const endpoint of [...TOP_UP_NEWS_ENDPOINTS, ...TOP_UP_IMAGE_ENDPOINTS]) {
            if (segmentUniqueCount(project, fail.segmentId) >= minPerSegment) break;
            const results = await fetchImageSearchResults(devServer, endpoint, q);
            const candidates = results
              .map((r) => ({ url: r.url || r.thumbnailUrl, alt: r.alt || r.title || seg.title, source: r.source || endpoint }))
              .filter((r) => r.url && isDirectImageCandidate(r.url) && !isJunkHarvestUrl(r.url));
            for (const r of candidates) {
              if (await addImageTopUpCandidate(project, seg, r, q, endpoint, report, topic, topicKeywords, { relaxed: true })) {
                if (segmentUniqueCount(project, fail.segmentId) >= minPerSegment) break;
              }
            }
          }
        }
      }
      volume = evaluateHarvestVolume(project, minPerSegment);
      report.harvestQuality = volume;
      for (const a of project.media || []) {
        const k = normalizeUrlKey(a.url, a.sourceUrl);
        if (k) uniqueUrls.add(k);
      }
      report.uniqueUrlCount = uniqueUrls.size;
    }

    // Final rebalance for any still-failing segments before soft-pass.
    if (!volume.pass) {
      const topic = project.topic || project.title || '';
      const topicKeywords = extractKeywords(topic, 12);
      await rebalanceFailingSegments(project, devServer, minPerSegment, report, topic, topicKeywords, {
        harvestVideoFirst: options.harvestVideoFirst !== false,
        minVideosPerSegment: options.minVideosPerSegment || 2,
      });
      volume = evaluateHarvestVolume(project, minPerSegment);
      report.harvestQuality = volume;
      for (const a of project.media || []) {
        const k = normalizeUrlKey(a.url, a.sourceUrl);
        if (k) uniqueUrls.add(k);
      }
      report.uniqueUrlCount = uniqueUrls.size;
    }

    // Soft-pass: thin per-segment counts when global pool satisfies clip budget.
    const minSegCount = Math.min(...Object.values(volume.perSegment || {}).map((v) => v.count), minPerSegment);
    if (!volume.pass && uniqueUrls.size >= minUnique && minSegCount >= Math.max(4, minPerSegment - 3)) {
      report.volumeSoftPass = true;
      volume = { ...volume, pass: true };
    }
  }

  report.volumePass = volume.pass;

  if (loopMode) {
    const uniqueUrls = new Set(
      (project.media || []).map((a) => normalizeUrlKey(a.url, a.sourceUrl)).filter(Boolean),
    );
    report.uniqueUrlCount = uniqueUrls.size;
    const { requiredUniqueUrls: minUnique } = computeClipBudget(project, options.cutIntervalSec ?? 1.25);

    if (uniqueUrls.size < minUnique) {
      // Escalating rescue: up to TOP_UP_MAX_PASSES aggressive top-up passes before abort.
      // For crime/news topics each pass searches news/archive endpoints; generic topics use
      // the relaxed rebalance path so thin segments don't block the whole batch.
      const topic = project.topic || project.title || '';
      const topicKeywords = extractKeywords(topic, 12);
      const segments = project.script || [];

      let rescueAdded = 0;
      for (let pass = 0; pass < TOP_UP_MAX_PASSES; pass++) {
        const currentUnique = new Set(
          (project.media || []).map((a) => normalizeUrlKey(a.url, a.sourceUrl)).filter(Boolean),
        );
        if (currentUnique.size >= minUnique) break;

        if (isCrimeNewsTopic(topic)) {
          for (const seg of segments) {
            let count = segmentUniqueCount(project, seg.id);
            const rescueQueries = buildMetaphorTopUpQueries(seg, topic);
            for (const q of rescueQueries) {
              if (count >= minUnique) break;
              for (const endpoint of [...TOP_UP_NEWS_ENDPOINTS, ...TOP_UP_IMAGE_ENDPOINTS]) {
                if (count >= minUnique) break;
                const results = await fetchImageSearchResults(devServer, endpoint, q);
                const candidates = results
                  .map((r) => ({ url: r.url || r.thumbnailUrl, alt: r.alt || r.title || seg.title, source: r.source || endpoint }))
                  .filter((r) => r.url && isDirectImageCandidate(r.url) && !isJunkHarvestUrl(r.url));
                for (const r of candidates) {
                  if (await addImageTopUpCandidate(project, seg, r, q, endpoint, report, topic, topicKeywords, { relaxed: true })) {
                    count = segmentUniqueCount(project, seg.id);
                  }
                }
              }
            }
          }
        } else {
          // Generic topics: relaxed rebalance pass to fill thin segments
          await rebalanceFailingSegments(project, devServer, minUnique, report, topic, topicKeywords, {});
        }

        const afterPass = new Set(
          (project.media || []).map((a) => normalizeUrlKey(a.url, a.sourceUrl)).filter(Boolean),
        );
        rescueAdded += afterPass.size - currentUnique.size;
        if (afterPass.size >= minUnique) break;
      }

      // Re-check after rescue rounds
      const uniqueUrlsAfterRescue = new Set(
        (project.media || []).map((a) => normalizeUrlKey(a.url, a.sourceUrl)).filter(Boolean),
      );
      report.uniqueUrlCount = uniqueUrlsAfterRescue.size;
      report.rescueRoundAdded = rescueAdded;

      if (uniqueUrlsAfterRescue.size < minUnique) {
        ensureEditorialPool(project, minPerSegment, report, {
          cutIntervalSec: options.cutIntervalSec,
          forceCurated: true,
        });
        const afterCurated = new Set(
          (project.media || []).map((a) => normalizeUrlKey(a.url, a.sourceUrl)).filter(Boolean),
        );
        report.uniqueUrlCount = afterCurated.size;
        report.curatedRescueInjected = afterCurated.size - uniqueUrlsAfterRescue.size;
      }

      const finalUnique = new Set(
        (project.media || []).map((a) => normalizeUrlKey(a.url, a.sourceUrl)).filter(Boolean),
      );
      if (finalUnique.size < minUnique) {
        report.thinPoolAbort = true;
        throw new Error(`Thin media pool (${finalUnique.size} unique URLs < ${minUnique}) — reharvest required`);
      }
    }
  }

  writeFileSync(join(outDir, 'harvest-quality.json'), JSON.stringify(volume, null, 2));
  report.after = project.media.length;
  report.uniqueUrlCount = new Set(
    (project.media || []).map((a) => normalizeUrlKey(a.url, a.sourceUrl)).filter(Boolean),
  ).size;
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

  if (fixState.shockHook !== false) {
    const hookOverride = hookOverrideMatchesTopic(fixState.hookLine, topic) ? fixState.hookLine?.trim() : null;
    const overlayOverride = hookOverrideMatchesTopic(fixState.hookOverlay, topic) ? fixState.hookOverlay?.trim() : null;
    fixState.hookLine = hookOverride || buildShockHookLine(topic);
    fixState.hookOverlay = overlayOverride || buildShortHookOverlay(topic, fixState.hookLine);
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
  const loopMinAssets = Math.max(
    2,
    Math.min(LOOP_MAX_MIN_ASSETS_PER_SEGMENT, fixState.minAssetsPerSegment || LOOP_MAX_MIN_ASSETS_PER_SEGMENT),
  );

  if (!(await checkDevServer(devServer))) {
    return { ok: false, error: `Dev server not reachable at ${devServer}`, topic, outDir };
  }

  log(`\n🎬 Generate: ${topic}`);
  log(`   Mode: ${realHarvest ? 'real harvest (OpenRouter + live search)' : 'mock (CI/e2e)'}`);
  if (realHarvest) log(`   Loop: ${loopMinAssets} assets/segment, ≤75s target`);
  if (fixState.hookLine) log(`   Hook: "${fixState.hookLine.slice(0, 72)}${fixState.hookLine.length > 72 ? '…' : ''}"`);
  if (fixState.hookOverlay) log(`   Overlay: "${fixState.hookOverlay}"`);
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
  const videoFirst = fixState.harvestVideoFirst !== false;
  const mediaTimeoutMs = loopMediaTimeoutMs({ realHarvest, videoFirst });
  const narrationTimeoutMs = realHarvest ? 900_000 : 600_000;

  try {
  // networkidle hangs when dev server is serving long harvest API streams
    await gotoDevServer();
    if (await page.getByTestId('onboarding-modal').isVisible({ timeout: 3000 }).catch(() => false)) {
      await page.getByTestId('onboarding-skip').click();
    }

    const fillTopic = async () => {
      const input = page.getByTestId('topic-input');
      const topicCheck = topic.slice(0, Math.min(12, topic.length));

      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          await input.waitFor({ state: 'visible', timeout: 45_000 });
        } catch (waitErr) {
          if (attempt === 3) throw waitErr;
          // If topic input isn't visible, try reloading the page
          await page.reload({ waitUntil: 'domcontentloaded' });
          if (await page.getByTestId('onboarding-modal').isVisible({ timeout: 3000 }).catch(() => false)) {
            await page.getByTestId('onboarding-skip').click().catch(() => {});
          }
          continue;
        }

        await input.click({ clickCount: 3, timeout: 10_000 }).catch(() => {});
        // Use explicit 30s timeout on fill so we never silently stall
        await input.fill(topic, { timeout: 45_000 });

        const value = await input.inputValue({ timeout: 5000 }).catch(() => '');
        if (value.includes(topicCheck)) return;

        // Value didn't stick — reload and try again
        if (attempt < 3) {
          await page.reload({ waitUntil: 'domcontentloaded' });
          if (await page.getByTestId('onboarding-modal').isVisible({ timeout: 3000 }).catch(() => false)) {
            await page.getByTestId('onboarding-skip').click().catch(() => {});
          }
        }
      }

      // Last chance: verify fill worked
      const finalValue = await input.inputValue({ timeout: 5000 }).catch(() => '');
      if (!finalValue.includes(topicCheck)) {
        throw new Error(`Topic fill failed after 3 attempts — got "${finalValue.slice(0, 40)}", expected "${topicCheck}"`);
      }
    };
    await fillTopic();
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

    const preNarrationProject = await page.evaluate(() => {
      const raw = localStorage.getItem('autotube_project');
      if (!raw) return null;
      try {
        return JSON.parse(raw).project ?? null;
      } catch {
        return null;
      }
    });
    if (realHarvest && preNarrationProject?.script?.length) {
      const volume = evaluateHarvestVolume(preNarrationProject, loopMinAssets);
      const thin = detectThinHarvest(preNarrationProject);
      const emptySegments = (preNarrationProject.script || []).filter((seg) => {
        const keys = new Set(
          (preNarrationProject.media || [])
            .filter((m) => m.segmentId === seg.id)
            .map((m) => (m.url || '').split('?')[0])
            .filter(Boolean),
        );
        return keys.size === 0;
      });
      if (!thin.pass) {
        for (const seg of thin.thin) {
          log(`   ⚠ Thin browser harvest: "${seg.title}" has ${seg.count} assets (< ${seg.need}/seg) — top-up runs after narration`);
        }
      }
      if (!volume.pass) {
        const detail = volume.failing.map((f) => `${f.title}: ${f.count}/${f.need}`).join('; ');
        log(`   ⚠ Browser below loop min (${loopMinAssets}/seg) before top-up: ${detail} — continuing`);
      }
      writeFileSync(
        join(outDir, 'thin-harvest-pre-narration.json'),
        JSON.stringify({ volume, thin, loopMinAssets, emptySegments: emptySegments.map((s) => s.title) }, null, 2),
      );
      const browserThinFlag = await page.evaluate(() => {
        try {
          return sessionStorage.getItem('autotube_thin_harvest') === 'true';
        } catch {
          return false;
        }
      });
      if (browserThinFlag) fixState.thinHarvest = true;
      if (emptySegments.length > 0) {
        const names = emptySegments.map((s) => s.title).join('; ');
        fixState.thinHarvest = true;
        log(`   ⚠ Empty browser segments (${names}) — continuing to narration; server top-up will fill pool`);
      }
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

    if (!project) {
      return { ok: false, error: 'No project after pipeline', topic, outDir };
    }
    if (!project.media?.length) {
      if (realHarvest) {
        project.media = [];
        log('   ⚠ No browser media after pipeline — server top-up will build pool');
      } else {
        return { ok: false, error: 'No project with media after pipeline', topic, outDir };
      }
    }

    await browser.close().catch(() => {});
    browser = null;

    patchProjectForLoop(project, topic, fixState, { skipMediaPatch: realHarvest });
    // Never keep hook/overlay overrides from a prior topic (watcher script/overlay drift).
    if (fixState.hookLine && !hookOverrideMatchesTopic(fixState.hookLine, topic)) {
      delete fixState.hookLine;
    }
    if (fixState.hookOverlay && !hookOverrideMatchesTopic(fixState.hookOverlay, topic)) {
      delete fixState.hookOverlay;
    }
    fixState.hookLine = project.hookLine || fixState.hookLine;
    const loopOverlay = buildShortHookOverlay(topic, fixState.hookLine, {
      preferredOverlay: fixState.hookOverlay,
    });
    fixState.hookOverlay = loopOverlay;
    project.exportSettings = {
      ...(project.exportSettings || {}),
      hookOverlay: loopOverlay,
      hookLine: fixState.hookLine,
    };
    project.hookLine = fixState.hookLine;
    if (realHarvest) {
      const mediaReport = await sanitizeRealHarvestMedia(project, devServer, outDir, {
        loopMode: true,
        minAssetsPerSegment: fixState.minAssetsPerSegment || 6,
        harvestVideoFirst: fixState.harvestVideoFirst !== false,
        minVideosPerSegment: fixState.minVideosPerSegment || 2,
        useCuratedPool: fixState.useCuratedPool === true,
        cutIntervalSec: fixState.cutIntervalSec ?? 1.4,
      });
      if (fixState.useCuratedPool) fixState.useCuratedPool = false;
      log(`🧹 Media sanitize: ${mediaReport.before} → ${mediaReport.after} assets (${mediaReport.convertedVideoToImage.length} video→image, ${mediaReport.dropped.length} dropped)`);
      if (mediaReport.relevanceDropped?.length) {
        log(`   🎯 Relevance filter: removed ${mediaReport.relevanceDropped.length} off-topic assets`);
      }
      if (mediaReport.phashDropped?.length) {
        log(`   🔍 pHash dedup: removed ${mediaReport.phashDropped.length} visually similar assets`);
      }
      if (mediaReport.visionRejectedUrls?.length) {
        accumulateVisionRejectedUrls(fixState, mediaReport.visionRejectedUrls);
      }
      const { requiredUniqueUrls: harvestBudget } = computeClipBudget(project, fixState.cutIntervalSec ?? 1.25);
      const postSanitizeUnique = mediaReport.uniqueUrlCount || new Set(
        (project.media || []).map((a) => normalizeUrlKey(a.url, a.sourceUrl)).filter(Boolean),
      ).size;
      if (postSanitizeUnique < harvestBudget) {
        fixState.mediaOffset = 0;
        fixState.harvestNonce = (fixState.harvestNonce || 0) + 1;
        log(`   ⚠ Thin pool (${postSanitizeUnique}/${harvestBudget} URLs) — reset mediaOffset, nonce ${fixState.harvestNonce}`);
      }
      // YouTube proxy clips fail often — prefer reliable editorial stills for assembly.
      if (postSanitizeUnique < Math.max(harvestBudget, 28) || fixState.fixStrategy === 'captions') {
        fixState.harvestVideoFirst = false;
        fixState.preferImageAssembly = true;
        log(`   🖼 Image-first assembly (${postSanitizeUnique} URLs, strategy=${fixState.fixStrategy || 'default'})`);
      }
      if (mediaReport.volumePass === false) {
        const failing = mediaReport.harvestQuality?.failing || [];
        const detail = failing.map((f) => `${f.title}: ${f.count}/${f.need}`).join('; ');
        fixState.reHarvestMedia = true;
        fixState.mediaOffset = 0;
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
    const timelineReport = validateEditTimeline(project, {
      cutIntervalSec: fixState.cutIntervalSec ?? 1.25,
      preferVideo: fixState.harvestVideoFirst !== false && !fixState.preferImageAssembly,
      minVideosFirst: fixState.renderTier === 'full' ? 3 : (fixState.minVideosPerSegment || 2),
      devServer,
    });
    if (timelineReport.rebuilt) {
      log(`   📐 Rebuilt editTimeline (${timelineReport.clipCount} clips, ${timelineReport.staleCount} stale IDs)`);
    }
    writeFileSync(
      join(outDir, 'timeline-diversity.json'),
      JSON.stringify(
        computeTimelineDiversityMetrics(project.editTimeline || [], project.media || [], project.script || []),
        null,
        2,
      ),
    );
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

    const renderEnv = buildRenderEnvFromFixState(fixState, { devServer, projectPath });
    const renderSnapshot = renderEnvJournalSnapshot(fixState);
    writeFileSync(join(outDir, 'render-env.json'), JSON.stringify(renderSnapshot, null, 2));

    const renderLogPath = join(root, 'test-recordings', 'latest-render.log');

    function resolveProducedOutput() {
      const finalMp4 = mp4Out.replace('.mp4', '-final.mp4');
      return existsSync(finalMp4) ? finalMp4 : existsSync(mp4Out) ? mp4Out : null;
    }

    function runServerRender(attemptLabel = 'render') {
      const render = spawnSync('node', ['server-render.mjs', mp4Out], {
        cwd: root,
        env: renderEnv,
        encoding: 'utf8',
        timeout: 1_800_000,
        stdio: ['inherit', 'pipe', 'pipe'],
      });
      const renderLogBody = `[${attemptLabel}]\n${render.stdout || ''}\n${render.stderr || ''}`;
      writeFileSync(renderLogPath, renderLogBody);
      writeFileSync(join(outDir, 'render.log'), renderLogBody);
      return render;
    }

    let renderRetried = false;
    let produced = null;
    let usedModalRender = false;

    if (shouldUseModalRender()) {
      log(`🎥 Render (Modal GPU — TTS local, ffmpeg on Modal) → ${mp4Out}`);
      const modalResult = await renderViaModal({
        project,
        mp4Out,
        renderEnv,
        devServer,
        outDir,
        log,
      });
      const modalRenderLogLine = modalResult.ok
        ? `modal-render OK ${modalResult.bytes} bytes in ${modalResult.elapsedMs}ms`
        : `modal-render FAIL: ${modalResult.error}`;
      writeFileSync(join(outDir, 'render.log'), modalRenderLogLine);
      writeFileSync(renderLogPath, modalRenderLogLine);
      if (!modalResult.ok) {
        return { ok: false, error: modalResult.error || 'Modal render failed', topic, outDir, projectPath };
      }
      usedModalRender = true;
      produced = modalResult.videoPath || resolveProducedOutput();
    } else {
      let render = runServerRender('render-1');
      if (render.status !== 0 && render.status !== null) {
        return { ok: false, error: `server-render exit ${render.status}`, topic, outDir, projectPath };
      }

      produced = resolveProducedOutput();
      if (!produced) {
        return { ok: false, error: 'No output MP4', topic, outDir };
      }

      const producedSize = statSync(produced).size;
      if (producedSize < LOOP_MIN_RENDER_BYTES) {
        log(`   ⚠️ Render output tiny (${(producedSize / 1024 / 1024).toFixed(2)} MB) — retrying once…`);
        render = runServerRender('render-retry');
        renderRetried = true;
        if (render.status !== 0 && render.status !== null) {
          return { ok: false, error: `server-render retry exit ${render.status}`, topic, outDir, projectPath };
        }
        produced = resolveProducedOutput();
        if (!produced) {
          return { ok: false, error: 'No output MP4 after render retry', topic, outDir };
        }
      }
    }

    const gate = validateOutput(produced, 'Render output', { minBytes: MIN_RENDER_OUTPUT_BYTES });
    if (!gate.valid) {
      return { ok: false, error: gate.error, topic, outDir, renderRetried };
    }

    const probe = spawnSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', produced],
      { encoding: 'utf8' },
    );
    const durationSec = probe.stdout ? parseFloat(probe.stdout.trim()) : NaN;

    const manifestGate = validateRenderManifest(produced, durationSec);
    if (!manifestGate.valid) {
      // Modal proxy manifest is rebuilt locally — spacing can diverge from remote encode.
      // Log and continue so contact-sheet assembly audit remains the ship gate.
      const manifest = manifestGate.manifest || {};
      const required = manifest.requiredUniqueUrls || 0;
      const withinBudget = required === 0 || (manifest.uniqueUrlsUsed || 0) >= required * 0.9;
      const adjacentFail = (manifest.adjacentRepeatCount || 0) > 0;
      const spacingOnlyProxy =
        usedModalRender
        && !adjacentFail
        && withinBudget
        && (manifest.uniqueUrlsUsed || 0) >= required
        && /spacing violation/i.test(manifestGate.error || '');
      if (spacingOnlyProxy) {
        log(`   ⚠ Modal diversity proxy: ${manifestGate.error} (continuing — vision audit is ship gate)`);
      } else {
        return {
          ok: false,
          error: `Render manifest gate FAIL — ${manifestGate.error}`,
          topic,
          outDir,
          projectPath,
          renderRetried,
          manifestGate,
        };
      }
    }

    if (statSync(produced).size < LOOP_MIN_RENDER_BYTES) {
      return {
        ok: false,
        error: `file too small (${(statSync(produced).size / 1024 / 1024).toFixed(2)} MB < ${(LOOP_MIN_RENDER_BYTES / 1024 / 1024).toFixed(0)} MB)`,
        topic,
        outDir,
        renderRetried,
      };
    }

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
      thinHarvest: fixState.thinHarvest === true,
      renderEnv: renderSnapshot,
      harvestNonce: fixState.harvestNonce || 0,
      renderRetried,
      manifestGate,
    };
  } catch (err) {
    return { ok: false, error: err.message, topic, outDir };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
