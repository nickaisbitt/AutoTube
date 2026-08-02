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
import { dedupeMediaByPHash, VISUAL_DUP_MAX_DISTANCE } from './perceptual-hash.mjs';
import {
  STOCK_HEALTHCARE_IMAGES,
  STOCK_VIDEO_POOL,
  STOCK_HOUSING_VIDEOS,
  STOCK_CYBER_IMAGES,
  MIXKIT_VIDEO_POOL,
  pickStockImages,
  pickStockVideos,
  isJunkDemoVideoUrl,
  isUnsafeMediaUrl,
  isJunkWebVolumeStillUrl,
  topicalStockVideos,
  stockImagesForTopic,
} from './stock-media-urls.mjs';
import { curatedPacksEnabled, keepBestEnabled, isEvalColdMode } from './eval-flags.mjs';
import {
  accumulateExcludedUrls,
  harvestContextFromFixState,
  harvestSessionStoragePayload,
  loadLastProjectUrls,
} from './harvest-loop-context.mjs';
import { buildRenderEnvFromFixState, renderEnvJournalSnapshot } from './render-env-from-fix-state.mjs';
import { applyEnvLocalToProcess } from './railway-prod-env.mjs';
import {
  applyFrozenMediaToProject,
  loadFrozenProject,
} from './keep-best.mjs';
import {
  airlineSoftPassMotionFailureReason,
  filterAssetsByRelevance,
  evaluateHarvestVolume,
  evaluateHarvestVolumeWithSoftPass,
  isOffBrandVisual,
  isGenericStockJunk,
  isVolumePaddingAsset,
  medicalClickbaitReason,
  mergeVolumePadding,
  militaryNavalJunkReason,
  unreadableOverlayReason,
} from './harvest-quality.mjs';
import { visionRejectOffBrandStock } from './stock-vision-gate.mjs';
import {
  isAirlineTopic,
  isBankScamTopic,
  isHealthcareCyberTopic,
  isHealthcareTopic,
  isHeistTopic,
  isHousingTopic,
  isInsuranceFraudTopic,
  isNursingHomeTopic,
  isSchoolEducationTopic,
  isVeteransBenefitsTopic,
  isWorkplaceTopic,
} from './topic-family.mjs';
import {
  isScriptComplete,
  detectScriptActivity,
  sawFreshActivity,
  chooseRecoveryAction,
  isDeadScriptGeneration,
} from './script-wait-policy.mjs';
import {
  assessHarvestStillQuality,
  decorateStillWithQuality,
} from './sanitize-media-quality.mjs';

export function resolveOpenRouterKey() {
  return (
    process.env.OPENROUTER_API_KEY ||
    process.env.VITE_OPENROUTER_KEY ||
    process.env.OPENROUTER_KEY ||
    ''
  ).trim();
}

export function resolveAutotubeApiKey() {
  return (
    process.env.AUTOTUBE_API_KEY ||
    process.env.VITE_AUTOTUBE_API_KEY ||
    ''
  ).trim();
}

export function resolvePexelsKey() {
  return (process.env.PEXELS_API_KEY || process.env.VITE_PEXELS_KEY || '').trim();
}

export function resolvePixabayKey() {
  return (process.env.PIXABAY_API_KEY || process.env.VITE_PIXABAY_KEY || '').trim();
}

/**
 * Which motion path this run is on.
 *
 * `keyed` = Pexels/Pixabay available, so topical face/cabin/apartment stock can be
 * pulled aggressively. `keyless` = no stock API keys; web-video search and
 * Archive.org still provide motion without provider credentials.
 */
export function resolveStockKeyMode(env = process.env) {
  const pexels = Boolean((env?.PEXELS_API_KEY || env?.VITE_PEXELS_KEY || '').trim());
  const pixabay = Boolean((env?.PIXABAY_API_KEY || env?.VITE_PIXABAY_KEY || '').trim());
  const keyed = pexels || pixabay;
  return { keyed, keyless: !keyed, pexels, pixabay, mode: keyed ? 'keyed' : 'keyless' };
}

export function resolveVisionUnverifiedMax(env = process.env) {
  const raw = env?.AUTOTUBE_VISION_UNVERIFIED_MAX;
  if (raw === undefined || raw === null || String(raw).trim() === '') return 0;
  const n = Number.parseInt(String(raw), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function isVisionBudgetSoft(env = process.env) {
  const raw = env?.AUTOTUBE_VISION_BUDGET_SOFT;
  return raw === '1' || raw === 'true';
}

/**
 * Admission policy for one stock clip at the vision gate.
 *
 * Once the per-run vision budget is spent, remaining clips are skipped rather
 * than admitted unverified — a budget cap must not become a silent bypass.
 * AUTOTUBE_VISION_BUDGET_SOFT=1 restores the old fail-open behaviour.
 */
export function decideStockVisionGate({
  hasThumb = false,
  hasApiKey = false,
  trustedVisualEvidence = false,
  checked = 0,
  budget = 0,
  env = process.env,
} = {}) {
  if (!hasThumb || !hasApiKey) return { action: 'admit', reason: 'vision-unavailable' };
  if (trustedVisualEvidence) return { action: 'admit', reason: 'trusted-visual-evidence' };
  if (checked < budget) return { action: 'check', reason: 'within-budget' };
  if (isVisionBudgetSoft(env)) return { action: 'admit', reason: 'budget-exhausted-soft' };
  return { action: 'skip', reason: 'budget-exhausted' };
}

export function recordVisionStockUnverified(report = {}, verdict = {}, { thumbnailUrl = '', env = process.env } = {}) {
  if (verdict?.ran !== false) {
    return { unverified: false, skip: false, max: resolveVisionUnverifiedMax(env) };
  }

  const max = resolveVisionUnverifiedMax(env);
  const count = (report.visionStockUnverified || 0) + 1;
  const skip = count > max;
  report.visionStockUnverified = count;
  report.visionStockUnverifiedMax = max;
  if (skip) {
    report.visionStockUnverifiedSkipped = (report.visionStockUnverifiedSkipped || 0) + 1;
  } else {
    report.visionStockUnverifiedAllowed = (report.visionStockUnverifiedAllowed || 0) + 1;
  }
  report.visionStockUnverifiedThumbs = report.visionStockUnverifiedThumbs || [];
  report.visionStockUnverifiedThumbs.push({
    thumbnailUrl,
    reason: verdict.reason || '',
    action: skip ? 'skipped' : 'allowed',
  });
  return { unverified: true, skip, count, max };
}

/** Dismiss z-[200] onboarding overlay so it cannot steal clicks mid-pipeline. */
async function dismissOnboarding(page) {
  await page
    .evaluate(() => {
      localStorage.setItem('autotube_onboarding_seen', 'true');
    })
    .catch(() => {});
  if (await page.getByTestId('onboarding-modal').isVisible({ timeout: 800 }).catch(() => false)) {
    await page.getByTestId('onboarding-skip').click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(300);
  }
}

/** Wait for topic field (onboarding / crash can leave it missing). */
async function fillTopicInput(page, topic, { attempts = 5 } = {}) {
  for (let i = 1; i <= attempts; i += 1) {
    await dismissOnboarding(page);
    // Close stray overlays that steal clicks / hide the topic field.
    await page.keyboard.press('Escape').catch(() => {});
    await page
      .evaluate(() => {
        localStorage.setItem('autotube_onboarding_seen', 'true');
        document.querySelectorAll('[data-testid="onboarding-modal"]').forEach((el) => {
          el.style.display = 'none';
        });
      })
      .catch(() => {});
    const input = page.getByTestId('topic-input');
    try {
      await input.waitFor({ state: 'visible', timeout: 60_000 });
      await input.scrollIntoViewIfNeeded().catch(() => {});
      await input.click({ timeout: 10_000 }).catch(() => {});
      await input.fill('');
      await input.fill(topic, { timeout: 45_000 });
      const got = await input.inputValue().catch(() => '');
      if (got.trim() === String(topic).trim()) return;
      // Fallback: set value via DOM when Playwright fill races React.
      await page
        .evaluate((value) => {
          const el = document.querySelector('[data-testid="topic-input"]');
          if (!el) return false;
          const proto = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
          proto?.set?.call(el, value);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return el.value === value;
        }, topic)
        .catch(() => false);
      const got2 = await input.inputValue().catch(() => '');
      if (got2.trim() === String(topic).trim()) return;
      throw new Error(`topic-input value mismatch (got "${got2.slice(0, 40)}")`);
    } catch (err) {
      if (i === attempts) throw err;
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 90_000 }).catch(() => {});
      await page.waitForTimeout(800);
      await dismissOnboarding(page);
    }
  }
}

/** Read autotube_project wrapper (project + stepStatuses) from localStorage. */
async function readProjectSnapshot(page) {
  return page
    .evaluate(() => {
      try {
        const raw = localStorage.getItem('autotube_project');
        if (!raw) {
          return { scriptLen: 0, mediaLen: 0, scriptStep: '', mediaStep: '', projectStatus: '' };
        }
        const stored = JSON.parse(raw);
        const proj = stored.project || {};
        return {
          scriptLen: Array.isArray(proj.script) ? proj.script.length : 0,
          mediaLen: Array.isArray(proj.media) ? proj.media.length : 0,
          scriptStep: stored.stepStatuses?.script || '',
          mediaStep: stored.stepStatuses?.media || '',
          projectStatus: proj.status || '',
        };
      } catch {
        return { scriptLen: 0, mediaLen: 0, scriptStep: '', mediaStep: '', projectStatus: '' };
      }
    })
    .catch(() => ({ scriptLen: 0, mediaLen: 0, scriptStep: '', mediaStep: '', projectStatus: '' }));
}

/**
 * Read live script-generation signals straight from the DOM.
 *
 * The project (and its stepStatuses) is only written to localStorage AFTER the
 * whole script pipeline completes, so `readProjectSnapshot` is blind while the
 * script is still being generated. The Script step, however, renders a distinct
 * "Generating Script" UI (rotating status + "N% complete") that lets us tell an
 * actively-generating run apart from one that never started / is stuck.
 */
async function readScriptProgress(page) {
  return page
    .evaluate(() => {
      const bodyText = document.body?.innerText || '';
      const rotatingEl = document.querySelector('[data-testid="rotating-status"]');
      const cancelBtn = document.querySelector('[data-testid="cancel-script-button"]');
      const generating =
        Boolean(rotatingEl)
        || Boolean(cancelBtn)
        || /Generating Script/i.test(bodyText);
      const pctMatch = bodyText.match(/(\d+)%\s*complete/i);
      return {
        generating,
        rotating: (rotatingEl?.textContent || '').trim(),
        pct: pctMatch ? Number(pctMatch[1]) : null,
        onTopicStep: Boolean(document.querySelector('[data-testid="generate-script-only"]')),
      };
    })
    .catch(() => ({ generating: false, rotating: '', pct: null, onTopicStep: false }));
}

async function clickPipelineButton(page, locator, { settleMs = 2000, timeout = 180_000 } = {}) {
  await dismissOnboarding(page);
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

export function spawnSyncFailureReason(result, label = 'process') {
  if (result?.status === 0) return '';
  if (result?.status === null) {
    const signal = result?.signal ? ` (${result.signal})` : '';
    return `${label} killed or timed out${signal}`;
  }
  return `${label} exit ${result?.status}`;
}

function isLikelyVideoHost(url = '') {
  return /(?:youtube\.com|youtu\.be|vimeo\.com|dailymotion\.com|player\.vimeo|archive\.org|giphy|tiktok\.com|vm\.tiktok)/i.test(url);
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

function proxiedClipTarget(url = '') {
  if (!isProxiedClipUrl(url)) return '';
  try {
    return new URL(url, 'http://autotube.local').searchParams.get('url') || '';
  } catch {
    return '';
  }
}

function motionCandidateUrls(candidate = {}) {
  const clip = typeof candidate === 'string' ? { url: candidate } : candidate;
  const wrappedTarget = proxiedClipTarget(clip.url || '');
  return [...new Set([
    wrappedTarget,
    clip.url || '',
    clip.sourceUrl || '',
  ].filter(Boolean))];
}

function motionUrlHostname(url = '') {
  try {
    return new URL(url, 'http://autotube.local').hostname.toLowerCase();
  } catch {
    return '';
  }
}

export function isYouTubeMotionCandidate(candidate = {}) {
  return motionCandidateUrls(candidate).some((url) => {
    const host = motionUrlHostname(url);
    return host === 'youtu.be'
      || host.endsWith('.youtu.be')
      || host === 'youtube.com'
      || host.endsWith('.youtube.com')
      || host === 'youtube-nocookie.com'
      || host.endsWith('.youtube-nocookie.com');
  });
}

export function isTikTokMotionCandidate(candidate = {}) {
  return motionCandidateUrls(candidate).some((url) => {
    const host = motionUrlHostname(url);
    return host === 'tiktok.com'
      || host.endsWith('.tiktok.com')
      || host === 'vm.tiktok.com';
  });
}

/** True when yt-dlp has a cookie jar / browser cookies for bot-gated hosts. */
export function hasYtDlpCookies() {
  return Boolean(
    (process.env.YTDLP_COOKIES || '').trim()
    || (process.env.YTDLP_COOKIES_FROM_BROWSER || '').trim()
    || (process.env.YTDLP_COOKIES_FILE || '').trim(),
  );
}

/**
 * Raw-web proxies that will almost certainly 401/bot-fail at assemble and then
 * collapse every slot onto the same Archive fallback. Skip them at inject so
 * volume comes from Archive/direct/Vimeo/DM instead of doomed YouTube/TikTok.
 *
 * @param {object} candidate
 * @param {{ tiktokBlocked?: boolean }} [gate]
 * @returns {string|null} reason when the candidate should not be injected
 */
export function unreliableWebProxyInjectReason(candidate = {}, gate = {}) {
  if (isYouTubeMotionCandidate(candidate) && !hasYtDlpCookies()) {
    return 'youtube-without-cookies';
  }
  // TikTok soft-probes can pass while assemble still lands watermarked talking-heads
  // (housing-web9: pink-phone finance bro ×3 → raw 5.4). Without cookies, skip and
  // let Archive/direct/Vimeo/DM fill volume — same doomed-proxy policy as YouTube.
  if (isTikTokMotionCandidate(candidate) && !hasYtDlpCookies()) {
    return 'tiktok-without-cookies';
  }
  if (isTikTokMotionCandidate(candidate) && gate.tiktokBlocked) {
    return 'tiktok-circuit-open';
  }
  return null;
}

/**
 * Cheap yt-dlp liveness check (no download). Used once per TikTok host failure
 * to open a run-level circuit so we stop injecting IP-blocked shorts.
 */
export function softProbeYtDlpUrl(url = '', { timeoutMs = 20_000 } = {}) {
  const target = String(url || '').trim();
  if (!target) return false;
  const result = spawnSync(
    'yt-dlp',
    ['--skip-download', '--print', 'id', '--no-playlist', target],
    { encoding: 'utf8', timeout: timeoutMs },
  );
  if (result.status !== 0) return false;
  return Boolean(String(result.stdout || '').trim());
}

/** YouTube clickbait thumbnails used as Ken Burns B-roll when the clip itself is blocked. */
export function isYouTubeThumbnailStill(url = '') {
  return /i\.ytimg\.com|img\.youtube\.com|yt3\.ggpht\.com/i.test(String(url || ''));
}

/** Housing-relevant Archive evidence — modern crash stories need these, not landscapes. */
const HOUSING_ARCHIVE_STRONG_RE =
  /\b(apartment|tenant|evict(?:ion|ed)?|rent(?:al)?|housing|tenement|slum|landlord|foreclos(?:ure|ed)?|mortgage|public\s+housing|housing\s+project|moving\s+(?:day|boxes)|for\s+rent)\b/i;

/**
 * Host reliability tier for web-motion selection.
 *
 * YouTube remains a last resort: yt-dlp often needs cookies and a JavaScript runtime
 * in bot-gated environments. Direct files and non-YouTube video hosts are much more
 * likely to survive the later assembly download.
 *
 * @param {object} candidate
 * @param {{ topicBlob?: string }} [options]
 */
export function motionCandidateHostRank(candidate = {}, options = {}) {
  const urls = motionCandidateUrls(candidate);
  if (isYouTubeMotionCandidate(candidate)) return 100;
  const archiveDirect = urls.some((url) => {
    const host = motionUrlHostname(url);
    return (host === 'archive.org' || host.endsWith('.archive.org')) && isDirectVideoUrl(url);
  });
  if (archiveDirect) {
    // Airline training films on Archive are first-class. Housing-crash stories need
    // modern face/apartment *web* clips first — even "apartment"-tagged Archive is
    // mostly council meetings / ribbon-cuttings / news graphics (rank must stay
    // behind generic Bing/DDG web = 10, or those muddy clips starve the pool).
    if (isHousingTopic(options.topicBlob || '')) {
      const blob = `${candidate.alt || ''} ${candidate.title || ''} ${candidate.query || ''} ${candidate.source || ''}`;
      return HOUSING_ARCHIVE_STRONG_RE.test(blob) ? 15 : 35;
    }
    return 0;
  }
  if (urls.some((url) => isDirectVideoUrl(url))) return 1;
  if (urls.some((url) => {
    const host = motionUrlHostname(url);
    return ['vimeo.com', 'dailymotion.com', 'dai.ly', 'giphy.com']
      .some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
  })) return 2;
  // TikTok / Instagram are raw-web hits but often IP-blocked or vertical-only in
  // headless VMs. Keep them above YouTube, below Archive/direct/Vimeo/DM.
  if (urls.some((url) => {
    const host = motionUrlHostname(url);
    return ['tiktok.com', 'vm.tiktok.com', 'instagram.com', 'cdninstagram.com']
      .some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
  })) return 40;
  return 10;
}

/** Stable host-first ranking; topical score only orders clips within a host tier. */
export function rankMotionCandidates(candidates = [], score = () => 0, options = {}) {
  return candidates
    .map((candidate, index) => ({ candidate, index }))
    .sort((left, right) => {
      const hostDelta =
        motionCandidateHostRank(left.candidate, options)
        - motionCandidateHostRank(right.candidate, options);
      if (hostDelta) return hostDelta;
      const leftScore = Number(score(left.candidate)) || 0;
      const rightScore = Number(score(right.candidate)) || 0;
      return rightScore - leftScore || left.index - right.index;
    })
    .map(({ candidate }) => candidate);
}

/**
 * Decide how an inject candidate's liveness is verified before it lands in segment
 * media.
 *
 * Proxied `/api/download-clip` URLs (every Bing/Google/DDG web-motion clip) are
 * downloaded and re-encoded on demand at render time. A full `expectVideo` probe here
 * forces the proxy to transcode the whole clip just to answer a range request — slow,
 * flaky, and rate-limited — so almost every web clip failed the probe and was dropped
 * (injected≈1 from a 140-clip pool). The harvest keep-path already trusts proxied clips
 * without probing (see `tryKeepVideoAsset` → "proxy clip (no probe)"); inject must be
 * consistent or it silently prefers the handful of direct archive/stock URLs. Direct
 * URLs still get the cheap probe because it is a real HTTP GET, not a transcode.
 */
export function resolveInjectClipProbe(url = '') {
  if (isProxiedClipUrl(url)) return { probe: false, trust: 'proxy-clip' };
  return { probe: true, trust: null };
}

/**
 * Web clips carry provider-title evidence and already cleared the topical relevance
 * gate before vision. When the vision budget is spent we fail OPEN for them rather than
 * skipping into a near-empty inject — an aviation clip with strong title/query evidence
 * is safer to keep than to drop, and dropping web clips over budget is exactly what
 * starved segment media. Non-web (stock/archive) clips keep the strict skip.
 */
export function shouldFailOpenWebVisionSkip({ isWebClip = false, hasStrongEvidence = false } = {}) {
  return Boolean(isWebClip && hasStrongEvidence);
}

/** Keep proxy clips distinct by their decoded target, not the shared route path. */
function motionUrlKey(url = '') {
  const raw = String(url || '');
  if (isProxiedClipUrl(raw)) {
    const target = proxiedClipTarget(raw);
    if (target) return `download-clip:${target}`;
    // Fall back to the full wrapper; never collapse every proxy to one key.
    return raw;
  }
  return raw.split('?')[0];
}

/**
 * Give a proxied clip a stable, query-independent media identity while keeping the
 * transport endpoint unchanged.
 *
 * Query-stripping volume/dedup paths otherwise collapse every web clip to
 * `/api/download-clip`, even though each `url=`
 * target was different. The dot segments make the stored path unique; the server's
 * prefix router accepts it and its URL parser normalizes the path back to the existing
 * `/api/download-clip` endpoint (including for rate-limit classification).
 */
export function withDistinctProxyIdentity(url = '', identity = 'clip') {
  const raw = String(url || '');
  const marker = '/api/download-clip?';
  if (!raw.includes(marker)) return raw;
  const token = String(identity || 'clip').replace(/[^a-z0-9_-]+/gi, '-').slice(0, 80) || 'clip';
  return raw.replace(
    marker,
    `/api/download-clip/.autotube-${token}/../../download-clip?`,
  );
}

function harvestVolumeUrlKey(url = '') {
  return String(url || '').split('?')[0];
}

/**
 * Build a balanced assignment queue for motion padding. The least-populated
 * segments receive one clip each before any segment receives another, so a finite
 * pool improves the floor instead of being drained into the first few segments.
 */
export function buildMotionPaddingQueue(project = {}, minPerSegment = 6, limit = Infinity) {
  const segments = Array.isArray(project.script) ? project.script : [];
  const floor = Math.max(0, Number.parseInt(String(minPerSegment), 10) || 0);
  const maxAssignments = Number.isFinite(limit)
    ? Math.max(0, Math.floor(limit))
    : Number.MAX_SAFE_INTEGER;
  if (!segments.length || floor <= 0 || maxAssignments <= 0) return [];

  const counts = new Map(
    segments.map((segment) => {
      const urls = new Set(
        (project.media || [])
          .filter((asset) => asset.segmentId === segment.id)
          .map((asset) => harvestVolumeUrlKey(asset.url))
          .filter(Boolean),
      );
      return [segment.id, urls.size];
    }),
  );
  const queue = [];
  while (queue.length < maxAssignments) {
    const thin = segments.filter((segment) => (counts.get(segment.id) || 0) < floor);
    if (!thin.length) break;
    const lowest = Math.min(...thin.map((segment) => counts.get(segment.id) || 0));
    for (const segment of thin) {
      if (queue.length >= maxAssignments) break;
      if ((counts.get(segment.id) || 0) !== lowest) continue;
      queue.push(segment.id);
      counts.set(segment.id, lowest + 1);
    }
  }
  return queue;
}

function segmentMotionKey(asset = {}) {
  return `${asset.segmentId || ''}|${motionUrlKey(asset.url)}`;
}

/**
 * Restore only clips injected during this top-up that passed the web-motion
 * evidence gate. The report is run-local proof; persisted/project-provided flags
 * cannot create a relevance bypass.
 */
export function restoreMotionRelevancePassed(media = [], candidates = [], videoTopUp = []) {
  const approved = new Set(
    videoTopUp
      .filter((entry) => entry.motionRelevancePassed === true)
      .map(segmentMotionKey),
  );
  const out = [...media];
  const present = new Set(out.map(segmentMotionKey));
  const restored = [];
  for (const asset of candidates) {
    const key = segmentMotionKey(asset);
    if (!approved.has(key) || present.has(key)) continue;
    out.push(asset);
    present.add(key);
    restored.push(asset);
  }
  return { media: out, restored };
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

async function canFetch(url, {
  timeoutMs = 6000,
  minBytes = 256,
  expectVideo = false,
  apiKey = '',
} = {}) {
  if (!url || !/^https?:\/\//i.test(url)) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = {
      range: 'bytes=0-16383',
      'user-agent': 'Mozilla/5.0 AutoTube media validator',
    };
    if (apiKey) headers['X-API-Key'] = apiKey;
    const res = await fetch(url, {
      signal: controller.signal,
      headers,
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

function stillQualityReportEntry(asset, assessment) {
  return {
    url: asset?.url || '',
    reason: assessment.reason,
    width: assessment.width,
    height: assessment.height,
    laplacianVariance: assessment.laplacianVariance,
    lumaStdDev: assessment.lumaStdDev,
    flags: assessment.flags || [],
  };
}

async function sanitizeStillQuality(asset, report, { devServer, cache } = {}) {
  const assessment = await assessHarvestStillQuality(asset, { devServer, cache });
  const entry = stillQualityReportEntry(asset, assessment);
  if (assessment.action === 'reject') {
    report.qualityStillRejected = report.qualityStillRejected || [];
    report.qualityStillRejected.push(entry);
    return null;
  }
  const decorated = decorateStillWithQuality(asset, assessment);
  if (assessment.action === 'demote') {
    report.qualityStillDemoted = report.qualityStillDemoted || [];
    report.qualityStillDemoted.push(entry);
  }
  return decorated;
}

async function sanitizeProjectStillQuality(project, report, { devServer, cache } = {}) {
  if (!project?.media?.length) return;
  const kept = [];
  for (const asset of project.media) {
    if (asset.type === 'video' || /\.(mp4|webm|mov)(?:[?#]|$)/i.test(asset.url || '')) {
      kept.push(asset);
      continue;
    }
    if (asset.sanitizeQuality?.action && asset.sanitizeQuality.action !== 'reject') {
      kept.push(asset);
      continue;
    }
    const qualityAsset = await sanitizeStillQuality(asset, report, { devServer, cache });
    if (!qualityAsset) {
      report.dropped = report.dropped || [];
      const reason = report.qualityStillRejected?.at(-1)?.reason || 'quality gate';
      report.dropped.push({ url: asset.url, reason: `still quality rejected: ${reason}` });
      continue;
    }
    kept.push(qualityAsset);
  }
  project.media = kept;
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
    const headers = {};
    const apiKey = resolveAutotubeApiKey();
    if (apiKey) headers['X-API-Key'] = apiKey;
    const res = await fetch(`${devServer}${endpoint}?q=${encodeURIComponent(query)}`, { headers });
    if (!res.ok) return [];
    const data = await res.json();
    return data.results || [];
  } catch {
    return [];
  }
}

async function topUpHarvestVolume(project, devServer, minPerSegment, report, options = {}) {
  const segments = project.script || [];
  const topic = project.topic || project.title || '';
  const airline = isAirlineTopic(topic);
  const qualityCache = options.qualityCache || new Map();
  const usedGlobal = new Set(
    (project.media || []).map((a) => (a.url || '').split('?')[0]).filter(Boolean),
  );
  const searchEndpoints = [
    '/api/search-google-images',
    '/api/search-bing-images',
    '/api/search-duckduckgo-images',
    '/api/search-hybrid',
    '/api/search-unsplash',
    '/api/search-nasa',
    '/api/search-archive',
  ];

  // Airline cabin-pressure: NEVER scrape open-web image search (porn/Niagara/celeb pads).
  // Motion top-up (Pexels/Pixabay) is the only pad path.
  if (airline) {
    report.imageVolumeSkipped = 'airline-motion-only';
    return;
  }

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
        .filter(
          (r) =>
            r.url
            && isDirectImageCandidate(r.url)
            && !isJunkHarvestUrl(r.url)
            && !isUnsafeMediaUrl(r.url)
            && !isJunkWebVolumeStillUrl(r.url),
        );

      let added = false;
      for (const r of candidates) {
        const key = r.url.split('?')[0];
        if (usedGlobal.has(key)) continue;
        const candidate = {
          id: `topup-${seg.id}-${uniqueCount}`,
          segmentId: seg.id,
          type: 'image',
          url: r.url,
          alt: `${seg.title} ${topic}`,
          query: q,
          source: `${r.source || 'Search'} (volume top-up)`,
          duration: 5,
          isFallback: false,
        };
        const qualityAsset = await sanitizeStillQuality(candidate, report, { devServer, cache: qualityCache });
        if (!qualityAsset) continue;

        project.media.push(qualityAsset);
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

    // Last-resort Unsplash pad when Pexels is unavailable.
    if (uniqueCount < minPerSegment) {
      const offset = (report.stockTopUpOffset || 0) + uniqueCount;
      const need = minPerSegment - uniqueCount;
      const stockPool = stockImagesForTopic(topic);
      const stock = pickStockImages(need + 4, offset, stockPool);
      for (const img of stock) {
        if (uniqueCount >= minPerSegment) break;
        const key = img.url.split('?')[0];
        if (usedGlobal.has(key)) continue;
        if (isUnsafeMediaUrl(img.url) || isJunkWebVolumeStillUrl(img.url)) continue;
        const candidate = {
          id: `stock-topup-${seg.id}-${uniqueCount}`,
          segmentId: seg.id,
          type: 'image',
          url: img.url,
          alt: img.alt || `${seg.title} ${topic}`,
          query: `stock-pool ${seg.title}`,
          source: 'Stock pool (volume top-up)',
          duration: 5,
          isFallback: false,
        };
        const qualityAsset = await sanitizeStillQuality(candidate, report, { devServer, cache: qualityCache });
        if (!qualityAsset) continue;

        project.media.push(qualityAsset);
        usedGlobal.add(key);
        uniqueCount += 1;
        report.volumeTopUp = report.volumeTopUp || [];
        report.volumeTopUp.push({ segmentId: seg.id, url: img.url, endpoint: 'stock-pool' });
      }
      report.stockTopUpOffset = offset + need;
    }
  }
}

function isSeriousNewsTopic(topicBlob = '') {
  return /bank|hack|stolen|identity|tornado|disaster|death|war|ransom|voice\s*clone|fraud|scam|warning|kill|phish|cyber|breach|heist|diamond|jewel|vault|airport|museum|robbery/i.test(
    topicBlob || '',
  );
}

/** Drop known demo/cartoon/adult/off-topic clips while preserving real web motion. */
function stripJunkDemoVideos(project, report) {
  if (!project?.media?.length) return;
  const topicBlob = `${project.topic || ''} ${project.title || ''}`.toLowerCase();
  const kept = [];
  for (const asset of project.media) {
    if (asset.type !== 'video') {
      kept.push(asset);
      continue;
    }
    const url = asset.url || '';
    const junk =
      isJunkDemoVideoUrl(url)
      || isUnsafeMediaUrl(url)
      || isJunkStockClip(asset, topicBlob)
      || (isAirlineTopic(topicBlob) && !isAirlineRelevantClip(asset, topicBlob))
      || isOffBrandVisual(`${asset.alt || ''} ${url} ${asset.query || ''}`, topicBlob);
    if (junk) {
      report.junkVideoDropped = report.junkVideoDropped || [];
      report.junkVideoDropped.push({ url, reason: 'demo/off-topic/broken proxy clip' });
      const thumb = asset.thumbnailUrl;
      // Never launder a junk motion clip into the timeline as a still.
      const thumbAsset = {
        ...asset,
        type: 'image',
        url: thumb,
        source: `${asset.source || 'Video'} still`,
      };
      const thumbAlsoJunk =
        !thumb
        || isJunkHarvestUrl(thumb)
        || isUnsafeMediaUrl(thumb)
        || !isImageLikeUrl(thumb)
        || isJunkStockClip(thumbAsset, topicBlob)
        || isOffBrandVisual(`${asset.alt || ''} ${thumb} ${asset.query || ''}`, topicBlob)
        || (isAirlineTopic(topicBlob) && !isAirlineRelevantClip(thumbAsset, topicBlob));
      if (!thumbAlsoJunk) {
        kept.push({
          ...thumbAsset,
          isFallback: false,
        });
      }
      continue;
    }
    kept.push(asset);
  }
  project.media = kept;
  stripJunkStillAssets(project, report);
  stripUnsafeMediaAssets(project, report);
}

/** Drop off-topic web stills (wildfire/Google/booking/physics) that never hit the video junk path. */
function stripJunkStillAssets(project, report) {
  if (!project?.media?.length) return;
  const topicBlob = `${project.topic || ''} ${project.title || ''}`.toLowerCase();
  const kept = [];
  for (const asset of project.media) {
    if (asset.type === 'video' || /\.(mp4|webm|mov)(\?|$)/i.test(asset.url || '')) {
      kept.push(asset);
      continue;
    }
    const blob = `${asset.alt || ''} ${asset.title || ''} ${asset.url || ''} ${asset.query || ''} ${asset.source || ''}`;
    const junk =
      isJunkStockClip(asset, topicBlob)
      || isOffBrandVisual(blob, topicBlob)
      || isGenericStockJunk(blob, topicBlob)
      || (isAirlineTopic(topicBlob) && AIRLINE_OFF_TOPIC_RE.test(blob))
      // Housing crash stories: drop 3D “house on a rock” / lender-blog illustrations
      // that get Ken-Burned into the timeline 5–6× and tank visualVariety.
      || (
        isHousingTopic(topicBlob)
        && /neohomeloans|house\s+on\s+(?:a\s+)?rock|floating\s+(?:rock|island)|3d\s+house|housing\s+market\s+crash\.jpg|will-the-housing-market-crash/i.test(
          blob,
        )
      );
    if (junk) {
      report.junkStillDropped = report.junkStillDropped || [];
      report.junkStillDropped.push({ url: asset.url, reason: 'off-topic/web still junk' });
      continue;
    }
    kept.push(asset);
  }
  project.media = kept;
}

/**
 * Drop adult CDNs and airline web volume-top-up stills (Niagara/celeb/porn scrapes).
 */
function stripUnsafeMediaAssets(project, report) {
  if (!project?.media?.length) return;
  const topicBlob = `${project.topic || ''} ${project.title || ''}`;
  const airline = isAirlineTopic(topicBlob);
  const kept = [];
  for (const asset of project.media) {
    const url = asset.url || '';
    const source = String(asset.source || '');
    const webVolumeStill =
      asset.type === 'image'
      && /volume top-up/i.test(source)
      && !/stock pool/i.test(source);
    const drop =
      isUnsafeMediaUrl(url)
      || isJunkWebVolumeStillUrl(url)
      || (airline && webVolumeStill);
    if (drop) {
      report.unsafeMediaDropped = report.unsafeMediaDropped || [];
      report.unsafeMediaDropped.push({
        url,
        reason: isUnsafeMediaUrl(url)
          ? 'unsafe/adult CDN'
          : airline && webVolumeStill
            ? 'airline web volume still'
            : 'junk web still host',
      });
      continue;
    }
    kept.push(asset);
  }
  project.media = kept;
}

/**
 * Prefetch curated human/phone/security stills; keep usable motion clips.
 */
function injectCyberStockStills(project, report, mediaOffset = 0) {
  const topicBlob = `${project.topic || ''} ${project.title || ''}`.toLowerCase();
  // Never pad airline cabin-pressure with cyber stills (and don't let bare "ai" match "airline").
  if (isAirlineTopic(topicBlob)) {
    report.cyberStockSkipped = 'airline-motion-only';
    return;
  }
  if (
    !/bank|hack|stolen|identity|ransom|voice|clone|fraud|scam|phish|cyber|data|password|\bai\b|hospital|patient|healthcare|records?/i.test(
      topicBlob,
    )
  ) {
    return;
  }
  const segments = project.script || [];
  if (!segments.length) return;

  // Keep Mixkit / archive / Pexels motion; drop junk harvest images
  const rebuilt = [];
  for (const asset of project.media || []) {
    if (asset.type === 'video' && !isJunkDemoVideoUrl(asset.url || '')) {
      rebuilt.push(asset);
    }
  }
  const stockMotion = rebuilt.filter((a) =>
    /pexels|pixabay|mixkit|archive\.org/i.test(`${a.url} ${a.source || ''}`),
  ).length;
  const hasStockKeys = Boolean(resolvePexelsKey() || resolvePixabayKey());
  const motionOk = hasStockKeys && stockMotion >= Math.max(6, segments.length * 2);
  const pool = [...STOCK_CYBER_IMAGES];
  const picks = pickStockImages(pool.length, mediaOffset % Math.max(pool.length, 1), pool);
  let added = 0;

  // Motion-ok: skip cyber still pads (they tank visualVariety).
  if (motionOk) {
    const videos = rebuilt.filter((a) => a.type === 'video');
    project.media = videos;
    report.cyberStockSkipped = `motion-ok (${stockMotion} stock videos; no still pad)`;
    return;
  }

  for (let s = 0; s < segments.length; s += 1) {
    const seg = segments[s];
    // Intro/hook: motion only.
    if (seg.type === 'intro' || s === 0) continue;
    const perSeg = 1;
    for (let i = 0; i < perSeg; i += 1) {
      const img = picks[(s * 7 + i + mediaOffset) % picks.length];
      if (!img) continue;
      rebuilt.push({
        id: `cyber-stock-${seg.id}-${i}`,
        segmentId: seg.id,
        type: 'image',
        url: img.url,
        alt: img.alt,
        query: `cyber-stock ${seg.title || ''}`,
        source: 'Curated cyber stock',
        isFallback: false,
      });
      added += 1;
    }
  }
  // Prefer motion assets first in the media array.
  const videos = rebuilt.filter((a) => a.type === 'video');
  const stills = rebuilt.filter((a) => a.type !== 'video');
  project.media = [...videos, ...stills];
  if (added) {
    report.cyberStockInjected = added;
  }
}

const PROVIDER_EVIDENCE_MAX_CHARS = 240;
/**
 * Per-run ceiling on Archive.org item-metadata lookups (one throttled network call
 * each, ~0.5s under concurrency), spent only on clips that lack evidence so far.
 *
 * Keyless runs have no other motion source, and every lookup is a chance for a real
 * item to prove what it shows, so they get a far bigger allowance than keyed runs
 * (which fill the pool from Pexels/Pixabay and only dip into archive for variety).
 */
const ARCHIVE_EVIDENCE_LOOKUP_BUDGET_KEYED = 32;
const ARCHIVE_EVIDENCE_LOOKUP_BUDGET_KEYLESS = 192;

export function archiveEvidenceLookupBudget(keyed = false) {
  return keyed ? ARCHIVE_EVIDENCE_LOOKUP_BUDGET_KEYED : ARCHIVE_EVIDENCE_LOOKUP_BUDGET_KEYLESS;
}
const EVIDENCE_STOPWORDS = new Set([
  'that', 'this', 'with', 'from', 'they', 'them', 'then', 'than', 'their', 'there', 'were', 'what',
  'when', 'where', 'which', 'while', 'about', 'after', 'been', 'have', 'into', 'over', 'your',
  'video', 'videos', 'clip', 'clips', 'stock', 'footage', 'film', 'movie', 'archive', 'download',
  'free', 'full', 'part', 'reel', 'copy', 'file', 'mp4',
]);

/** Lowercase word soup: markup gone, punctuation flattened, so echoes can be matched. */
function normalizeEvidenceText(raw) {
  return String(raw || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z]+;|&#\d+;/gi, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Drop runs of ≥minRun consecutive words that the text shares with `echo`.
 * A story sentence copied into an item title is removed; an incidental phrase
 * ("cabin pressure") survives, because a real item title is allowed to name the subject.
 */
function stripEchoRuns(words, echo, minRun = 4) {
  const echoWords = normalizeEvidenceText(echo).split(' ').filter(Boolean);
  if (!echoWords.length) return words;
  const kept = [];
  let i = 0;
  while (i < words.length) {
    let longest = 0;
    for (let e = 0; e < echoWords.length; e += 1) {
      let run = 0;
      while (i + run < words.length && e + run < echoWords.length && words[i + run] === echoWords[e + run]) {
        run += 1;
      }
      if (run > longest) longest = run;
    }
    if (longest >= minRun) {
      i += longest;
      continue;
    }
    kept.push(words[i]);
    i += 1;
  }
  return kept;
}

/**
 * Provider-supplied metadata (Archive.org item title/subject/description, Pixabay tags)
 * that may be used as visual evidence — or '' when it is only an echo of us.
 *
 * The test is what is left after removing the query we sent and any sentence copied
 * from the topic: metadata that adds nothing of its own proves nothing about the media.
 * Metadata that passes is returned whole, subject words included, because the provider
 * (not this pipeline) is the one claiming the clip shows them.
 */
export function providerEvidenceText(raw, { query = '', topicBlob = '', max = PROVIDER_EVIDENCE_MAX_CHARS } = {}) {
  const text = normalizeEvidenceText(raw);
  if (!text) return '';
  let residual = text;
  const q = normalizeEvidenceText(query);
  if (q && residual.includes(q)) residual = residual.split(q).join(' ');
  const residualWords = stripEchoRuns(residual.split(/\s+/).filter(Boolean), topicBlob);
  const meaningful = residualWords.filter((w) => w.length >= 3 && !EVIDENCE_STOPWORDS.has(w));
  if (residualWords.length < 2 || !meaningful.length) return '';
  return text.slice(0, max).trim();
}

/** Meaningful tokens of provider metadata (used to prove overlap with what we searched for). */
function evidenceTokens(text) {
  return [
    ...new Set(
      String(text || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length >= 4 && !EVIDENCE_STOPWORDS.has(w)),
    ),
  ];
}

export function archiveIdentifierFromUrl(url = '') {
  const m = String(url || '').match(/archive\.org\/(?:download|details|embed|services\/img)\/([^/?#]+)/i);
  return m ? decodeURIComponent(m[1]) : '';
}

/**
 * Does an Archive.org clip prove, from its own item metadata, that it shows what we
 * asked for? Yield is raised by asking more (and shorter) questions — never by
 * accepting an opaque identifier because the query happened to be topical.
 */
export function archiveEvidenceVerdict(clip = {}, { query = '', topicBlob = '' } = {}) {
  const evidence = providerEvidenceText(`${clip.title || ''} ${clip.alt || ''}`, {
    query: query || clip.query || '',
    topicBlob,
  });
  if (!evidence) return { ok: false, reason: 'no-provider-metadata', evidence: '', matched: [] };
  const wanted = new Set([
    ...evidenceTokens(query || clip.query || ''),
    ...evidenceTokens(topicBlob),
  ]);
  if (!wanted.size) return { ok: true, reason: 'no-subject-to-match', evidence, matched: [] };
  // Prefix matching absorbs plurals and "airline"/"airliner", but not "cabin"/"cabinetry".
  const sameSubject = (token, want) =>
    token === want
    || (Math.abs(token.length - want.length) <= 3 && (token.startsWith(want) || want.startsWith(token)));
  const matched = evidenceTokens(evidence).filter((token) => [...wanted].some((want) => sameSubject(token, want)));
  if (!matched.length) {
    return { ok: false, reason: 'metadata-off-subject', evidence, matched: [] };
  }
  return { ok: true, reason: 'metadata-subject-match', evidence, matched };
}

/**
 * Pull real item metadata (title / description / subject) for one Archive.org item.
 * The search proxy only returns a title, and plenty of aviation items carry their
 * proof in the description or subject tags instead.
 */
async function fetchArchiveItemEvidence(identifier, { timeoutMs = 6000 } = {}) {
  if (!identifier) return '';
  try {
    const res = await fetch(`https://archive.org/metadata/${encodeURIComponent(identifier)}/metadata`, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'user-agent': 'Mozilla/5.0 AutoTube media validator', accept: 'application/json' },
    });
    if (!res.ok) return '';
    const data = await res.json();
    const meta = data?.result ?? data ?? {};
    const parts = [meta.title, meta.subject, meta.description]
      .flatMap((part) => (Array.isArray(part) ? part : [part]))
      .filter((part) => typeof part === 'string');
    return parts.join(' ').trim();
  } catch {
    return '';
  }
}

/**
 * Raw item metadata already pulled this run, keyed by Archive.org identifier.
 *
 * The same item comes back under many subjects and sweeps; re-fetching it would burn
 * the lookup budget on questions already answered instead of on new items.
 */
const archiveItemEvidenceCache = new Map();

/**
 * Enrich Archive.org candidates with their own item metadata so evidence-gated
 * clips are judged on what the item says it shows, not on the query we typed.
 *
 * Only real network lookups are charged to the budget: cached items and clips we have
 * already qualified cost nothing, which is what lets a keyless run reach far more
 * distinct items without loosening the gate they still have to pass.
 */
async function enrichArchiveEvidence(
  clips,
  { topicBlob = '', limit = 0, report = {}, concurrency = 6, skipUrls = null } = {},
) {
  if (limit <= 0) return clips;
  const pending = new Map();
  for (const clip of clips) {
    if (!/Archive/i.test(clip.source || '')) continue;
    if (archiveEvidenceVerdict(clip, { query: clip.query || '', topicBlob }).ok) continue;
    const identifier = archiveIdentifierFromUrl(clip.url);
    if (!identifier) continue;
    if (skipUrls?.has((clip.url || '').split('?')[0])) continue;
    // Items answered earlier this run cost nothing; only unseen ones queue a lookup.
    if (archiveItemEvidenceCache.has(identifier)) {
      report.archiveEvidenceCacheHits = (report.archiveEvidenceCacheHits || 0) + 1;
      applyArchiveEvidence(clip, archiveItemEvidenceCache.get(identifier), topicBlob, report);
      continue;
    }
    if (!pending.has(identifier)) pending.set(identifier, []);
    pending.get(identifier).push(clip);
  }
  const batch = [...pending.entries()].slice(0, limit);
  for (let i = 0; i < batch.length; i += concurrency) {
    const slice = batch.slice(i, i + concurrency);
    const found = await Promise.all(slice.map(([identifier]) => fetchArchiveItemEvidence(identifier)));
    slice.forEach(([identifier, waiting], idx) => {
      report.archiveEvidenceLookups = (report.archiveEvidenceLookups || 0) + 1;
      archiveItemEvidenceCache.set(identifier, found[idx] || '');
      for (const clip of waiting) applyArchiveEvidence(clip, found[idx] || '', topicBlob, report);
    });
  }
  return clips;
}

function applyArchiveEvidence(clip, rawMetadata, topicBlob, report) {
  if (!rawMetadata) return;
  const enriched = providerEvidenceText(`${clip.title || ''} ${rawMetadata}`, {
    query: clip.query || '',
    topicBlob,
  });
  if (!enriched || enriched === clip.title) return;
  clip.title = enriched;
  report.archiveEvidenceEnriched = (report.archiveEvidenceEnriched || 0) + 1;
}

async function fetchArchiveVideoResults(devServer, query, { topicBlob = '' } = {}) {
  try {
    const headers = {};
    const apiKey = resolveAutotubeApiKey();
    if (apiKey) headers['X-API-Key'] = apiKey;
    const res = await fetch(`${devServer}/api/search-archive?q=${encodeURIComponent(query)}`, { headers });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || [])
      .map((r) => {
        // Never fall back to the query for alt/title: an echo is not evidence.
        const meta = providerEvidenceText(r.title || r.alt || '', { query, topicBlob });
        return {
          url: r.url,
          alt: meta,
          title: meta,
          query,
          source: 'Archive.org live',
        };
      })
      .filter((r) => r.url && /\.mp4(?:[?#]|$)/i.test(r.url));
  } catch {
    return [];
  }
}

const WEB_VIDEO_PROVIDERS = [
  { key: 'bing', endpoint: '/api/search-bing-videos', source: 'Bing web video' },
  { key: 'google', endpoint: '/api/search-google-videos', source: 'Google web video' },
  { key: 'ddg', endpoint: '/api/search-videos', source: 'DuckDuckGo web video' },
];

const WEB_VIDEO_DOWNLOAD_HOSTS = [
  'archive.org',
  'dai.ly',
  'dailymotion.com',
  'giphy.com',
  'googlevideo.com',
  'pexels.com',
  'pixabay.com',
  'tiktok.com',
  'vimeo.com',
  'youtu.be',
  'youtube.com',
];

function downloadableWebVideoUrl(rawUrl = '') {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') return '';
    const host = parsed.hostname.toLowerCase();
    const approvedHost =
      WEB_VIDEO_DOWNLOAD_HOSTS.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
    if (!approvedHost && !isDirectVideoUrl(parsed.href)) {
      return '';
    }
    return parsed.href;
  } catch {
    return '';
  }
}

function webVideoDurationSeconds(raw) {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : Infinity;
  const text = String(raw || '').trim();
  if (!text) return 0;
  if (/^\d+(?::\d+){0,2}$/.test(text)) {
    return text.split(':').map(Number).reduce((seconds, part) => seconds * 60 + part, 0);
  }
  const hours = Number(text.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/i)?.[1] || 0);
  const minutes = Number(text.match(/(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|m)\b/i)?.[1] || 0);
  const seconds = Number(text.match(/(\d+(?:\.\d+)?)\s*(?:seconds?|secs?|s)\b/i)?.[1] || 0);
  return hours || minutes || seconds ? hours * 3600 + minutes * 60 + seconds : 0;
}

/**
 * Fetch one keyless web-video route and turn its results into re-encoded local
 * download URLs. Provider titles are retained as evidence; the query is never
 * copied into alt/title, so an off-topic result cannot qualify by query echo.
 */
export async function fetchWebVideoResults(
  devServer,
  providerKey,
  query,
  { topicBlob = '', limit = 10 } = {},
) {
  const provider = WEB_VIDEO_PROVIDERS.find(({ key }) => key === providerKey);
  if (!provider || !devServer || !isSafeStockMotionQuery(query)) return [];
  try {
    const headers = {};
    const apiKey = resolveAutotubeApiKey();
    if (apiKey) headers['X-API-Key'] = apiKey;
    const res = await fetch(`${devServer}${provider.endpoint}?q=${encodeURIComponent(query)}`, {
      headers,
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const results = Array.isArray(data) ? data : data?.results;
    if (!Array.isArray(results)) return [];
    const evidenceQuery = webMotionHostQueryBase(query);

    return results
      .map((result) => {
        const sourceUrl = downloadableWebVideoUrl(result?.content || result?.url || result?.embed_url || '');
        if (!sourceUrl || isUnsafeMediaUrl(sourceUrl) || isJunkDemoVideoUrl(sourceUrl)) return null;
        const duration = webVideoDurationSeconds(result?.duration);
        if (duration > 10 * 60) return null;
        const metadata = providerEvidenceText(
          `${result?.title || ''} ${result?.description || ''}`,
          { query: evidenceQuery, topicBlob },
        );
        if (!metadata) return null;
        const directUrl = isDirectVideoUrl(sourceUrl);
        return {
          url: directUrl
            ? sourceUrl
            : `${devServer}/api/download-clip?url=${encodeURIComponent(sourceUrl)}&duration=10`,
          alt: metadata,
          title: metadata,
          query: evidenceQuery,
          source: provider.source,
          sourceUrl,
          thumbnailUrl: result?.thumbnailUrl || result?.images?.large || result?.image || undefined,
          duration: duration || undefined,
        };
      })
      .filter(Boolean)
      .slice(0, Math.max(0, limit));
  } catch {
    return [];
  }
}

/** Direct Pexels Videos API (no UI harvest required). */
async function fetchPexelsVideos(query, perPage = 8, page = 1) {
  const key = resolvePexelsKey();
  if (!key) return [];
  if (!isSafeStockMotionQuery(query)) return [];
  try {
    const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=${perPage}&page=${Math.max(1, page)}&size=medium`;
    const res = await fetch(url, { headers: { Authorization: key } });
    if (!res.ok) return [];
    const data = await res.json();
    const out = [];
    for (const video of data.videos || []) {
      if (!video?.video_files?.length) continue;
      if ((video.duration || 0) > 45) continue;
      const landscape =
        video.video_files
          .filter((f) => (f.width || 0) >= 1280 && (f.width || 0) >= (f.height || 0))
          .sort((a, b) => (b.width || 0) - (a.width || 0))[0]
        || video.video_files
          .filter((f) => (f.width || 0) >= (f.height || 0))
          .sort((a, b) => (b.width || 0) - (a.width || 0))[0];
      if (!landscape?.link) continue;
      out.push({
        url: landscape.link,
        // Do not echo the search query into alt — that launders irrelevant clips as "aviation".
        alt: 'Pexels video',
        query,
        source: 'Pexels Videos',
        sourceUrl: video.url,
        thumbnailUrl: video.image,
        duration: video.duration,
      });
    }
    return out;
  } catch {
    return [];
  }
}

/** Direct Pixabay Videos API. */
async function fetchPixabayVideos(query, perPage = 8, page = 1) {
  const key = resolvePixabayKey();
  if (!key) return [];
  if (!isSafeStockMotionQuery(query)) return [];
  try {
    const url = `https://pixabay.com/api/videos/?key=${encodeURIComponent(key)}&q=${encodeURIComponent(query)}&per_page=${perPage}&page=${Math.max(1, page)}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const out = [];
    for (const hit of data.hits || []) {
      const videos = hit.videos || {};
      const pick = videos.large || videos.medium || videos.small;
      if (!pick?.url) continue;
      out.push({
        url: pick.url,
        // Prefer real Pixabay tags as visual evidence; never fall back to query echo.
        alt: hit.tags || 'Pixabay video',
        query,
        source: 'Pixabay Videos',
        sourceUrl: hit.pageURL,
        thumbnailUrl: hit.userImageURL || undefined,
        duration: hit.duration,
      });
    }
    return out;
  } catch {
    return [];
  }
}

/** Pixabay/Pexels often match topic words literally (piggy bank, wash hands, rotate phone). */
/** Prefer phone/bank/security motion for cyber topics — deny lifestyle pets/nature filler. */
/** Strong aviation evidence — must appear in real visual metadata, not just the search query echo. */
const AIRLINE_STRONG_RE =
  /\b(airline|airliner|jetliner|turboprop|aircraft|airplane|aeroplane|aviation|cockpit|flight\s*deck|oxygen\s*mask|runway|hangar|airport|fuselage|tarmac|jet\s*bridge|boarding|cabin\s*(interior|pressure|pressuri[sz](?:ation|ed)|altitude|passengers?)|pressure\s*gauge|flight\s*attendant|faa|bombardier|embraer|q400|regional\s*jet)\b/i;
/** Weak tokens alone are not enough (passenger/pilot/flight match hospital & sports stock). */
const AIRLINE_WEAK_RE = /\b(passenger|pilot|plane|jet|flight|mechanic|attendant)\b/i;
const AIRLINE_WEAK_CONTEXT_RE =
  /\b(cabin|cockpit|airplane|aircraft|airport|seat|aisle|galley|headset|yoke|throttle|hangar|tarmac|runway|oxygen|fuselage)\b/i;
/** Queries we trust when API alt is just an echo of the search string. */
const AIRLINE_TRUSTED_QUERY_RE =
  /\b(oxygen\s*mask|cockpit|flight\s*deck|hangar|runway|tarmac|cabin\s*(interior|pressure|pressuri[sz](?:ation|ed)|passengers?)|airplane|airliner|jetliner|turboprop|aircraft|fuselage|flight\s*attendant|pilot\s*(cockpit|headset|face)|boarding|jet\s*bridge|pressure\s*gauge|faa\s*report|maintenance\s*hangar|airplane\s*cabin)\b/i;
/** Never OK on airline stories — keyword miss from faceSeek / long topic harvest. */
const AIRLINE_OFF_TOPIC_RE =
  /\b(football|soccer|nfl|athlete|jersey|stadium|basketball|tennis|hockey|golf|baseball|sports?|sports?\s*player|cheerleader|mail\s*box|mailbox|u\.?s\.?\s*mail|postal|magnifying\s*glass|financial\s*reports?|stock\s*documents?\s*desk|astronaut|space\s*suit|spacewalk|nasa|space\s*station|galaxy|nebula|orion\s+pressure\s+vessel|pressure\s+vessel|spacecraft|ideal\s+(?:diatomic\s+)?gas|diatomic\s+gas|searchlights?\s+in\s+pressure|roblox|wildfires?|forest\s*fires?|deadly\s*fires?|grid\s*failures?|solar\s*farms?|solar\s*kerosene|fuel\s+made\s+from\s+sunlight|google\s+logo|it\s+giant\s+google|how\s+to\s+book|book\s+(?:airline\s+)?flight\s+tickets?|#\s*shorts|#\s*viral|clinton\s+lynch|budget\s+20\d{2}|patient|medical\s*attention|medical\s*patient|hospital|icu\b|surgery|surgeon|operating\s*room|nurse|nurse\s*station|ambulance\s*stretcher|stretcher|iv\s*drip|hospital\s*bed|blood[\s-]?pressure|hypertension|clinic|msn\.com\/[^?\s]*\/health|garage|auto\s*repair|car\s*engine|crying\s*(woman|girl|man)|emotional\s*portrait|stock\s*reaction|yoga|gym\s*workout|fashion|fashion\s*runway)\b/i;
const TRUSTED_AIRLINE_QUERY_MAX_LENGTH = 72;
const AIRLINE_DISCONNECTED_PAD_RE =
  /\b(u\.?\s*s\.?\s*mail|usps|postal|post\s*office|mailbox|letterbox|mail\s*(truck|carrier|delivery|bag|slot)|magnifying\s*glass|financial\s*(report|chart|graph|statement)|stock\s*(chart|market|ticker)|bar\s*chart|line\s*chart|spreadsheet|accounting\s*desk|hospital|patient|medical|icu|doctor|nurse|oxygen\s*(tank|cylinder|therapy|patient|hospital)|nasal\s*cannula)\b/i;

const AIRLINE_RELEVANCE_RE = AIRLINE_STRONG_RE;

const AIRLINE_MEGA_CARRIER_PATTERNS = [
  /\bemirates\b/i,
  /\bwizz\s*air\b|\bwizzair\b/i,
  /\bqatar\s*airways\b|\bqatar\b/i,
  /\blufthansa\b/i,
  /\bryan\s*air\b|\bryanair\b/i,
  /\bunited\s*airlines?\b|\bunited-airlines\b/i,
  /\bdelta\s*air\b|\bdelta-airlines\b/i,
  /\bamerican\s*airlines?\b/i,
  /\bbritish\s*airways\b/i,
  /\bair\s*france\b/i,
  /\bk\s*l\s*m\b|\bklm\b/i,
  /\beasyjet\b|\beasy\s*jet\b/i,
  /\bsouthwest\s*airlines?\b/i,
  /\bjetblue\b/i,
];

function mentionsMegaCarrier(blob = '') {
  return AIRLINE_MEGA_CARRIER_PATTERNS.some((re) => re.test(blob || ''));
}

const STOCK_QUERY_ESSAY_RE =
  /\b(?:meet|according|how\s+a|how\s+an|how\s+the|why\s+a|why\s+an|why\s+the|federal\s+aviation\s+administration|captain\s+[a-z]+|hid\s+recurring|recurring\s+failures)\b/i;

function stockQueryWords(query) {
  return String(query || '')
    .trim()
    .replace(/[-/]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function isSafeStockMotionQuery(query) {
  const normalized = String(query || '').trim().replace(/\s+/g, ' ');
  if (!normalized) return false;
  if (normalized.length > 64) return false;
  if (stockQueryWords(normalized).length > 6) return false;
  return !STOCK_QUERY_ESSAY_RE.test(normalized);
}

/**
 * Visual evidence for airline relevance — strip echoed search/topic text so
 * "Pexels: worried passenger face" cannot launder a hospital/football clip.
 */
function airlineVisualEvidenceBlob(clip = {}) {
  const query = String(clip.query || '').trim().toLowerCase();
  const rawAlt = String(clip.alt || '').trim();
  let alt = rawAlt.toLowerCase();
  const providerEcho = /^(pexels|pixabay)(?:\s+video)?:\s*/i.test(rawAlt)
    || /^(pexels|pixabay)\s+video$/i.test(rawAlt);
  alt = alt
    .replace(/^pexels:\s*/i, '')
    .replace(/^pixabay:\s*/i, '')
    .replace(/^pexels video:\s*/i, '')
    .replace(/^(pexels|pixabay)\s+video$/i, '');
  if (query && alt.includes(query.slice(0, Math.min(48, query.length)))) {
    alt = alt.replace(query, ' ');
  }
  // Provider echo / placeholder alts are not visual proof — only real tags/URLs count.
  if (providerEcho) {
    alt = '';
  }
  // UI/stock harvest often sets alt = topic sentence — not visual proof.
  if (
    /regional airline|cabin[-\s]?pressure|cabin pressure fail|how a .+\bhid\b/i.test(alt)
    || alt.length > 90
  ) {
    alt = '';
  }
  // Provider metadata (Archive.org item title/subject/description, Pixabay tags) is
  // real visual proof — it is sanitised of query/topic echoes when it is written.
  let providerMeta = providerEvidenceText(clip.title || '', { query });
  if (/regional airline|cabin pressure fail|how a .+\bhid\b/i.test(providerMeta)) {
    providerMeta = '';
  }
  return `${alt} ${providerMeta} ${clip.sourceUrl || ''} ${clip.url || ''} ${clip.thumbnailUrl || ''}`.toLowerCase();
}

/** Resolve the search string used to fetch this clip (field or legacy provider-echo alt). */
function airlineClipSearchQuery(clip = {}) {
  const direct = String(clip.query || '').trim();
  if (direct) return direct;
  const rawAlt = String(clip.alt || '').trim();
  const m = rawAlt.match(/^(?:pexels|pixabay)(?:\s+video)?:\s*(.+)$/i);
  return m ? m[1].trim() : '';
}

function hasAirlineCompatibleVisualEvidence(evidence = '') {
  const blob = String(evidence || '').trim();
  return Boolean(blob && (AIRLINE_STRONG_RE.test(blob) || (AIRLINE_WEAK_RE.test(blob) && AIRLINE_WEAK_CONTEXT_RE.test(blob))));
}

function isTrustedAirlineSearchQuery(query = '') {
  const text = String(query || '').trim();
  return Boolean(
    text.length > 0
      && text.length <= TRUSTED_AIRLINE_QUERY_MAX_LENGTH
      && !/\bhow a\b|\bhid\b|\bfailures\b/i.test(text)
      && !/\bCaptain\s+[A-Z][a-z]+\b/.test(text)
      && AIRLINE_TRUSTED_QUERY_RE.test(text)
      && !AIRLINE_OFF_TOPIC_RE.test(text),
  );
}

/**
 * Trusted airline queries may bypass the vision gate, but only for clips that
 * already carry their own visual evidence. Opaque alts (provider echoes,
 * archive identifiers) never qualify — the query alone proves nothing.
 */
function airlineQueryVisionBypass(clip = {}, query = '', topicBlob = '') {
  if (!isAirlineTopic(topicBlob)) return false;
  if (!isTrustedAirlineSearchQuery(query)) return false;
  if (!hasAirlineCompatibleVisualEvidence(airlineVisualEvidenceBlob(clip))) return false;
  return isAirlineRelevantClip(clip, topicBlob);
}

function isAirlineRelevantClip(clip = {}, topicBlob = '') {
  const evidence = airlineVisualEvidenceBlob(clip);
  if (AIRLINE_OFF_TOPIC_RE.test(evidence)) return false;
  // Carriers/warships read as "aircraft" to every aviation keyword below, and
  // clickbait hook art reads as documentary once the thumbnail is cropped.
  if (militaryNavalJunkReason(evidence, topicBlob)) return false;
  if (medicalClickbaitReason(evidence, topicBlob)) return false;
  if (unreadableOverlayReason(evidence, topicBlob)) return false;
  if (AIRLINE_STRONG_RE.test(evidence)) return true;
  if (AIRLINE_WEAK_RE.test(evidence) && AIRLINE_WEAK_CONTEXT_RE.test(evidence)) return true;
  // Echo-only alts are not proof; trusted queries still need visual metadata.
  const query = airlineClipSearchQuery(clip);
  if (isTrustedAirlineSearchQuery(query) && hasAirlineCompatibleVisualEvidence(evidence)) {
    return true;
  }
  return false;
}

function isCyberRelevantClip(clip = {}, topicBlob = '') {
  const blob = `${clip.alt || ''} ${clip.title || ''} ${clip.source || ''} ${clip.sourceUrl || ''} ${clip.url || ''} ${clip.query || ''}`.toLowerCase();
  if (/beetle|dung beetle|insect swarm|macro insect|bug macro|wildlife macro|spider macro/.test(blob)) {
    return false;
  }
  if (isNursingHomeTopic(topicBlob)) {
    return /nursing|elder|care\s*home|cctv|camera|surveillance|caregiver|wheelchair|hallway|corridor|abuse|family|visit/.test(
      blob,
    );
  }
  if (isHousingTopic(topicBlob)) {
    return /apartment|evict|rent|landlord|tenant|lease|keys|packing|boxes|notice|letter|for rent|door|couple|worried/.test(
      blob,
    );
  }
  if (isInsuranceFraudTopic(topicBlob)) {
    return /crash|car|dashcam|wreck|damage|insurance|claim|adjuster|injury|whiplash|accident|road|highway|driver/.test(
      blob,
    );
  }
  if (isVeteransBenefitsTopic(topicBlob)) {
    return /veteran|military|benefits|ssn|identity|credit|paperwork|document|government|broker|phone|worried|letter|dog tag/.test(
      blob,
    );
  }
  if (isHeistTopic(topicBlob)) {
    return /airport|runway|terminal|vault|safe|security|diamond|jewel|cargo|guard|heist|plane|aviation|warehouse|jewelry|investigation|documentary|news/.test(
      blob,
    );
  }
  if (isAirlineTopic(topicBlob)) {
    if (isJunkStockClip(clip, topicBlob)) return false;
    return isAirlineRelevantClip(clip, topicBlob);
  }
  if (isSchoolEducationTopic(topicBlob)) {
    return /school|student|classroom|teacher|campus|library|counseling|laptop|computer|server|data|cyber|worried|parent|records|phone|document|district/.test(
      blob,
    );
  }
  if (isHealthcareCyberTopic(topicBlob)) {
    return /hospital|patient|medical|records|nurse|doctor|server|data|rack|workstation|hipaa|breach|laptop|corridor|waiting/.test(
      blob,
    );
  }
  const topical =
    /phone|smartphone|mobile|credit|card|bank|hack|laptop|computer|keyboard|microphone|security|lock|fingerprint|server|call|scam|fraud|money|cash|typing|payment|identity|password|ai|robot|code|data center|worried|shock|texting|ransom|leak|breach|records?/.test(
      blob,
    );
  // Office/business/architecture alone is not cyber-relevant.
  if (topical) return true;
  if (isHealthcareTopic(topicBlob) && /hospital|patient|clinic|nurse|doctor|medical|corridor|ward/.test(blob)) {
    return true;
  }
  return false;
}

function isJunkStockClip(clip = {}, topicBlob = '', options = {}) {
  const preferBright =
    options.preferBright === true || process.env.AUTOTUBE_PREFER_BRIGHT_BROLL === '1';
  const blob = `${clip.alt || ''} ${clip.title || ''} ${clip.source || ''} ${clip.sourceUrl || ''} ${clip.url || ''} ${clip.thumbnailUrl || ''} ${clip.query || ''}`.toLowerCase();
  const topicText = String(topicBlob || '').toLowerCase();
  if (isOffBrandVisual(blob, topicBlob)) return true;
  if (isGenericStockJunk(blob, topicBlob)) return true;
  const covidTopic = /\b(covid|coronavirus|pandemic|mask mandate|face masks?|surgical masks?|n95)\b/.test(topicText);
  if (
    !covidTopic
    && /(?:covid|coronavirus|pandemic|surgical masks?|face masks?|medical masks?|protective masks?).{0,40}\b(couple|people|man and woman|woman and man)\b|\b(couple|people|man and woman|woman and man)\b.{0,40}(?:covid|coronavirus|pandemic|surgical masks?|face masks?|medical masks?|protective masks?)/i.test(
      blob,
    )
  ) {
    return true;
  }
  if (isAirlineTopic(topicText)) {
    if (AIRLINE_OFF_TOPIC_RE.test(blob)) return true;
    const topicMentionsMegaCarrier = mentionsMegaCarrier(topicText);
    if (!topicMentionsMegaCarrier && mentionsMegaCarrier(`${clip.alt || ''} ${clip.sourceUrl || ''} ${clip.url || ''}`)) {
      return true;
    }
    if (/\bred\s+hat\b.{0,40}\b(lifestyle|tourist|travel|walking|portrait|fashion)\b|\b(lifestyle|tourist|travel|walking|portrait|fashion)\b.{0,40}\bred\s+hat\b/i.test(blob)) {
      return true;
    }
    if (/\b(back of head only|back of (?:a )?(?:head|person|woman|man)|from behind|rear view)\b/i.test(blob)) {
      return true;
    }
    if (/\b(chain.?link fence|airport fence|behind (?:a )?fence|tourist fence|plane spotter|plane spotting|watching planes)\b/i.test(blob)) {
      return true;
    }
    // Generic crying/reaction portraits are not cabin-pressure B-roll.
    if (
      /\b(crying|tears|emotional|distressed)\b/i.test(blob)
      && !AIRLINE_STRONG_RE.test(airlineVisualEvidenceBlob(clip))
      && !AIRLINE_TRUSTED_QUERY_RE.test(String(clip.query || ''))
    ) {
      return true;
    }
  }
  // Office/cowork pads are never OK on non-workplace stories (airline, nursing, etc.).
  if (
    !isWorkplaceTopic(topicBlob)
    && /\b(office|coworking|open.?plan|imac|boardroom|conference room|startup office|corporate handshake|bright office daylight)\b/i.test(
      blob,
    )
  ) {
    return true;
  }
  // Junk titles that slip past URL host filters.
  if (
    /#fyp|#tiktok|#disney|sofia the first|encerr[oó]|maleta|minecraft|fortnite|roblox|gacha|asmr|mukbang|\belmo\b|sesame street|muppet|cookie monster|big bird|peppa pig|cocomelon/i.test(
      blob,
    )
  ) {
    return true;
  }
  // TikTok is a transport, not a verdict. Its known #fyp/#tiktok/cartoon junk is
  // rejected above, while topical clips remain usable after local re-encoding.
  if (
    /\b(psychology textbook|textbook page|powerpoint slide|presentation slide|sci-?fi (cockpit|hud)|spaceship|nebula|galaxy stock|hud overlay|holographic ui)\b/i.test(
      blob,
    )
  ) {
    return true;
  }
  // Dark airplane-window vignettes read as black title cards under hook text.
  if (
    /\b(airplane window|plane window|cabin window)\b/i.test(blob)
    && /\b(night|dark|silhouette|black|dim|underexposed)\b/i.test(blob)
  ) {
    return true;
  }
  if (/\b(black and white|b&w|monochrome|grayscale)\b/i.test(blob) && preferBright) {
    return true;
  }
  const lifestyleJunk =
    /wash.?your.?hands|rotate.?your.?phone|piggy|hygiene|soap|water tap|faucet|ocean|sea|waves|yacht|storm|overlay|black background|megaphone|protest|freedom and peace|minecraft|fortnite|gameplay|binance|cash.?app|verified.?account|dailymotion|usa it shop|dog|puppy|cat|pet|animal|garden|nature|forest|flower|bird|wildlife|landscape|mountain|beach|sunset|cooking|recipe|food|kitchen|yoga|fitness workout|sports? highlight|turtle|kingfisher|noble house|mini series|despair|sequin|fashion show|runway|macro flower|hud graphic|hud interface|sci.?fi hud/.test(
      blob,
    );
  if (lifestyleJunk) {
    const aviationRunway = isAirlineTopic(topicText) && /\brunway\b/i.test(blob) && AIRLINE_STRONG_RE.test(blob);
    if (!aviationRunway) return true;
  }
  // Reject muddy/night/overexposed stock when preferBright is on.
  if (
    preferBright
    && /\b(night|dark|silhouette|low.?light|underexposed|muddy|dimly|shadowy|overexposed|blown.?out|washed.?out)\b/i.test(blob)
    && !(isAirlineTopic(topicText) && /\bmaintenance hangar night\b|\bhangar\b.{0,30}\bnight\b/i.test(blob))
  ) {
    return true;
  }
  // Surgical/hygiene hospital stills are junk unless the topic is healthcare cyber.
  if (/surgery|surgical|operating room/.test(blob) && !isHealthcareTopic(topicBlob)) return true;
  if (
    /hospital/.test(blob)
    && !isHealthcareTopic(topicBlob)
    && !isNursingHomeTopic(topicBlob)
    && !/hack|breach|ransom|data|cyber|records?/.test(blob)
  ) {
    return true;
  }
  return false;
}

function stockMotionQueries(topicBlob, cyberTopic, options = {}) {
  // Pixabay: short query tokens only (long topics match noise).
  const faceFirst = options.faceSeek === true;
  const preferBright = options.preferBright === true;
  const nursing = isNursingHomeTopic(topicBlob);
  const housing = isHousingTopic(topicBlob);
  const insurance = isInsuranceFraudTopic(topicBlob);
  const veterans = isVeteransBenefitsTopic(topicBlob);
  const school = isSchoolEducationTopic(topicBlob);
  const healthcareCyber = isHealthcareCyberTopic(topicBlob) && cyberTopic;
  const heist = isHeistTopic(topicBlob);
  const airline = isAirlineTopic(topicBlob);
  const brightBoost = preferBright
    ? nursing
      ? ['bright care home corridor day', 'well lit nursing home hallway', 'daylight elderly care room']
      : housing
        ? ['bright apartment interior daylight', 'sunny porch house exterior', 'well lit kitchen table worried']
        : insurance
          ? ['daylight car crash dashcam footage', 'bright highway traffic accident news', 'well lit insurance paperwork desk']
          : veterans
          ? ['bright government office daylight', 'well lit desk paperwork documents', 'daylight veteran portrait worried']
          : healthcareCyber
            ? ['well lit hospital corridor day', 'bright hospital waiting room', 'daylight medical records desk']
            : airline
              ? ['bright airplane cabin daylight', 'sunny airport runway plane', 'daylight cockpit instruments']
              : heist
                ? ['bright airport terminal daylight', 'sunny runway plane exterior', 'daylight security vault door']
                : ['news interview worried person outdoor', 'sunny city street pedestrians', 'daylight documentary handheld']
    : [];
  // Anti-HUD fillers after topical packs. Avoid "handheld camera" (camcorder loops).
  const antiHud = nursing
    ? ['documentary care home footage people', 'real surveillance hallway footage', 'authentic news interview elderly care']
    : housing
      ? ['real apartment building exterior footage', 'documentary eviction notice tenant worried']
      : insurance
        ? ['real dashcam car crash footage', 'documentary insurance claim investigation']
        : veterans
        ? ['real veteran portrait worried', 'documentary government office paperwork']
        : healthcareCyber
          ? ['real hospital corridor footage people', 'documentary nurse workstation']
          : airline
            ? ['real airplane cabin passengers daylight', 'documentary airport runway plane']
            : ['news interview worried person', 'city street pedestrians daylight', 'person reading news phone outdoor'];
  /** Topic + faces first; bright/antiHud only as late fillers. */
  const withFillers = (base) => [...base, ...brightBoost.slice(0, 2), ...antiHud.slice(0, 2)];
  // Airline: aviation bright fillers only — never append generic office pads.
  const withAirlineFillers = (base) => [
    ...base,
    'bright airplane cabin daylight',
    'sunny airport runway plane',
    'daylight cockpit instruments',
    'real airplane cabin passengers daylight',
  ];
  // Housing+"AI": avoid podcast-mic / cyber B-roll.
  if (housing) {
    const faces = [
      'worried couple reading letter home',
      'stressed family apartment interior',
      'person holding eviction notice paper',
      'tenant packing boxes apartment',
      'shocked face close up phone',
      'couple arguing bills kitchen table',
      'modern apartment living room daylight people',
      'young couple stressed rent apartment',
    ];
    const topical = [
      'apartment building exterior city',
      'for rent sign house porch',
      'keys lock apartment door',
      'eviction notice paper hands close up',
      'landlord house door knock',
      'court documents paperwork close up',
      'worried tenant reading letter kitchen',
    ];
    // Always face-first on housing — exteriors/Archive meetings starve variety.
    const base = [...faces, ...topical];
    return withFillers(base);
  }
  if (insurance) {
    const faces = [
      'shocked driver looking at phone car',
      'worried couple insurance paperwork',
      'person reviewing dashcam footage laptop',
      'injured person holding neck whiplash',
    ];
    const topical = [
      'car crash dashcam footage highway',
      'damaged car accident scene daylight',
      'insurance adjuster inspecting car damage',
      'traffic accident news footage',
      'car bumper damage close up',
      'police accident scene road',
    ];
    const base = faceFirst ? [...faces, ...topical] : [...topical.slice(0, 2), ...faces, ...topical.slice(2)];
    return withFillers(base);
  }
  // Nursing abuse/CCTV: never hospital-breach stock.
  if (nursing) {
    const faces = [
      'worried family elderly care visit',
      'shocked caregiver face close up',
      'elderly person care home room',
      'family looking at security footage',
    ];
    const topical = [
      'security camera cctv hallway corridor',
      'nursing home corridor wheelchair',
      'surveillance monitor security footage',
      'care worker elderly patient room',
      'elderly care facility hallway',
      'cctv camera ceiling close up',
    ];
    const base = faceFirst ? [...faces, ...topical] : [...topical.slice(0, 2), ...faces, ...topical.slice(2)];
    return withFillers(base);
  }
  // Veterans/dark-web: not bank OTP / voice-clone stock.
  if (isVeteransBenefitsTopic(topicBlob)) {
    const faces = [
      'veteran looking at phone worried',
      'shocked person reading letter documents',
      'worried couple looking at paperwork',
      'person checking credit report laptop',
    ];
    const topical = [
      'government office paperwork documents',
      'military dog tags close up',
      'identity theft paperwork hands',
      'laptop social security form',
      'person calling phone worried face',
      'credit freeze documents desk',
    ];
    const base = faceFirst ? [...faces, ...topical] : [...topical.slice(0, 2), ...faces, ...topical.slice(2)];
    return withFillers(base);
  }
  if (
    /port|strike|container|shipping|cargo|dock|freight|supply\s*chain|maritime/.test(topicBlob)
    && /hack|breach|track|cyber|ransom/.test(topicBlob)
  ) {
    const faces = [
      'worried dock worker looking at phone',
      'shocked logistics manager tablet',
      'person reading shipping notice worried',
    ];
    const topical = [
      'shipping container port crane',
      'cargo ship dock workers',
      'container yard logistics trucks',
      'port strike workers picket line',
      'warehouse forklift shipping boxes',
      'tracking screen logistics map',
    ];
    const brightPort = preferBright
      ? ['bright container port daylight', 'sunny cargo ship dock', 'daylight warehouse shipping boxes']
      : [];
    const base = faceFirst ? [...faces, ...topical] : [...topical.slice(0, 2), ...faces, ...topical.slice(2)];
    return [...base, ...brightPort, ...antiHud.slice(0, 1)];
  }
  if (school && /hack|ransom|breach|cyber|leak|data|records/.test(topicBlob)) {
    const faces = [
      'worried parent reading letter school',
      'student laptop classroom worried',
      'teacher shocked looking at computer',
      'parent child homework worried kitchen',
    ];
    const topical = [
      'school hallway students walking',
      'classroom laptop student desk',
      'school computer lab students',
      'school office paperwork desk',
      'library students studying laptops',
      'server room data center school',
    ];
    const base = faceFirst ? [...faces, ...topical] : [...topical.slice(0, 2), ...faces, ...topical.slice(2)];
    return withFillers(base);
  }
  if (isHealthcareTopic(topicBlob) && cyberTopic) {
    const faces = [
      'worried patient looking at phone',
      'stressed nurse looking at computer',
      'doctor shocked at laptop screen',
      'family worried hospital waiting room',
      'person reading medical bill phone',
    ];
    const topical = [
      'hospital corridor empty hallway',
      'medical records laptop paperwork',
      'hospital computer workstation',
      'server room data center racks',
      'hands typing medical keyboard',
      ...(preferBright ? ['hospital exterior building day'] : ['hospital exterior building night']),
    ];
    const base = faceFirst ? [...faces, ...topical] : [...topical.slice(0, 3), ...faces, ...topical.slice(3)];
    return withFillers(base);
  }
  if (airline) {
    // Face queries MUST bind to cabin/cockpit — bare "worried face" returns football/hospital/astronaut.
    const faces = [
      'airplane cabin passenger face worried',
      'pilot cockpit headset face close-up',
      'flight attendant airplane cabin face',
      'passenger oxygen mask airplane cabin',
    ];
    const topical = [
      'oxygen mask deploy airplane cabin',
      'maintenance hangar night aircraft',
      'mechanic tools aircraft hangar',
      'cabin pressure gauge cockpit',
      'airplane cabin passengers daylight',
      'cockpit instruments close-up',
      'aircraft maintenance hangar',
      'airport runway plane takeoff',
      'boarding airplane jet bridge',
      'airplane cabin aisle daylight',
      // Short archive.org-friendly queries (long cabin phrases often return 0–1 MP4s).
      'airplane',
      'aircraft hangar',
      'airport runway',
      'cockpit',
      'airplane takeoff',
      'airplane landing',
      'commercial aircraft',
      'jet aircraft',
    ];
    const base = faceFirst ? [...faces, ...topical] : [...topical.slice(0, 2), ...faces, ...topical.slice(2)];
    return withAirlineFillers(base);
  }
  // Heist/airport fraud: not bank OTP stock.
  if (heist) {
    const faces = [
      'investigator reviewing documents worried',
      'shocked person reading news phone',
      'security guard looking at monitor',
      'person examining diamond jewelry close up',
    ];
    const topical = [
      'airport runway cargo plane exterior',
      'airport terminal security checkpoint',
      'bank vault safe door security',
      'diamond jewelry close up macro',
      'cargo warehouse logistics forklift',
      'jewelry store display diamonds',
      'surveillance camera airport terminal',
      'investigation news documentary footage',
    ];
    const base = faceFirst ? [...faces, ...topical] : [...topical.slice(0, 3), ...faces, ...topical.slice(3)];
    return withFillers(base);
  }
  if (cyberTopic) {
    const faces = [
      'shocked person looking at phone',
      'worried couple looking at phone',
      'person on phone call scared face',
      'woman crying looking at phone',
      'man reaction shock close up',
      'elderly person phone call worried',
    ];
    // Mic/podcast studio only as late filler.
    const topical = [
      'credit card payment laptop hands',
      'hacker typing computer dark',
      'fingerprint biometric unlock',
      'bank building exterior city',
      'lock padlock security close up',
      'smartphone banking app hands',
    ];
    const base = faceFirst ? [...faces, ...topical] : [...topical.slice(0, 3), ...faces, ...topical.slice(3)];
    return withFillers(base);
  }
  if (/tornado|storm|disaster/i.test(topicBlob) && !/zoning|flood[-\s]?risk|flood\s*map/i.test(topicBlob)) {
    return withFillers(['tornado storm damage news', 'severe weather radar', 'emergency news footage', 'people sheltering storm']);
  }
  // Cold-eval topic packs that otherwise get weak 4-word joins.
  if (/ambulance|gps\s*route|demolished|paramedic|911\s*dispatch/i.test(topicBlob)) {
    const faces = [
      'paramedic looking at phone worried',
      'ambulance driver stressed face',
      'emergency dispatcher headset worried',
    ];
    const topical = [
      'ambulance racing rural highway',
      'demolished house rubble exterior',
      'gps navigation map phone close up',
      'emt crew stretcher emergency',
      'abandoned house collapsed porch',
      '911 dispatch center monitors',
    ];
    const base = faceFirst ? [...faces, ...topical] : [...topical.slice(0, 2), ...faces, ...topical.slice(2)];
    return withFillers(base);
  }
  if (/zoning|flood[-\s]?risk|flood\s*map|neighborhood/i.test(topicBlob)) {
    const faces = [
      'worried homeowner reading zoning notice',
      'couple looking at flood map worried',
      'city planner pointing at map desk',
    ];
    const topical = [
      'flood risk zoning map close up',
      'city planning map documents desk',
      'neighborhood houses street daylight',
      'flooded street residential area',
      'municipal office paperwork maps',
      'homeowner porch looking at papers',
    ];
    const base = faceFirst ? [...faces, ...topical] : [...topical.slice(0, 2), ...faces, ...topical.slice(2)];
    return withFillers(base);
  }
  if (/climate\s*sensor|sensor\s*calibrat|fake\s*climate|university\s*lab/i.test(topicBlob)) {
    const faces = [
      'scientist looking at laptop worried',
      'lab researcher pipette shocked face',
      'professor reviewing charts desk',
    ];
    const topical = [
      'university science lab instruments',
      'climate sensor weather station',
      'scientist pipette test tubes lab',
      'data charts laptop research desk',
      'laboratory calibration equipment',
      'weather sensor outdoor close up',
    ];
    const base = faceFirst ? [...faces, ...topical] : [...topical.slice(0, 2), ...faces, ...topical.slice(2)];
    return withFillers(base);
  }
  if (/indie\s*game|source\s*code|cloud\s*lockout/i.test(topicBlob)) {
    const faces = [
      'game developer shocked at laptop',
      'worried programmer looking at screen',
      'indie studio team stressed office',
    ];
    const topical = [
      'coding laptop source code screen',
      'game development workstation desk',
      'cloud lockout error laptop screen',
      'keyboard typing code close up',
      'small office developers computers',
      'person slamming laptop frustrated',
    ];
    const base = faceFirst ? [...faces, ...topical] : [...topical.slice(0, 2), ...faces, ...topical.slice(2)];
    return withFillers(base);
  }
  if (/museum\s*archive|mislabeled|colonial\s*artifact/i.test(topicBlob)) {
    const faces = [
      'curator examining artifact worried',
      'archivist reading label documents',
      'museum visitor looking at exhibit',
    ];
    const topical = [
      'museum archive shelves artifacts',
      'colonial artifact display case',
      'archivist gloves handling object',
      'museum storage boxes labels',
      'old document catalog close up',
      'museum gallery exhibit hall',
    ];
    const base = faceFirst ? [...faces, ...topical] : [...topical.slice(0, 2), ...faces, ...topical.slice(2)];
    return withFillers(base);
  }
  const words = String(topicBlob || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 4);
  const base = words.length ? [words.join(' '), ...words.slice(0, 2)] : ['people using technology'];
  const withFaces = faceFirst
    ? ['person reacting to news phone', 'shocked face close up', ...base]
    : base;
  return withFillers(withFaces);
}

/**
 * Keyed packs: Pexels/Pixabay reward descriptive 4–6 word scene queries, so ask for
 * the shots the story actually needs (faces bound to cabin/cockpit, apartments).
 */
const KEYED_AIRLINE_MOTION_QUERIES = [
  'airplane cabin passengers seated aisle',
  'nervous passenger airplane window seat',
  'flight attendant cabin service aisle',
  'pilot hands cockpit controls close-up',
  'two pilots flight deck instruments',
  'cabin crew briefing airplane galley',
  'passenger fastening seatbelt airplane cabin',
  'oxygen mask hanging airplane cabin',
  'aircraft mechanic hangar inspection',
  'aircraft engine inspection mechanic hands',
  'airplane fuselage exterior tarmac',
  'jet bridge boarding passengers airport',
  'cockpit instrument panel dials close-up',
  'airplane taxiing runway daylight',
];

const KEYED_HOUSING_MOTION_QUERIES = [
  'apartment building hallway doors',
  'apartment kitchen interior daylight',
  'moving boxes empty apartment room',
  'for rent sign apartment window',
  'apartment door key lock close-up',
  'worried woman apartment window daylight',
  'man reading letter kitchen worried',
  'couple looking at bills laptop',
  'family carrying boxes apartment hallway',
  'landlord tenant doorway conversation',
  'rent payment app phone hands',
  'apartment lease paperwork signing hands',
];

/**
 * Keyless packs: Archive.org is full-text ranked over item metadata, so short concrete
 * subject phrases return items where long scene descriptions return nothing. Diversity
 * of subject — not looser gating — is what raises yield here.
 */
const ARCHIVE_AIRLINE_MOTION_QUERIES = [
  'airliner cabin',
  'aircraft cabin interior',
  'cabin pressurization',
  'oxygen mask demonstration',
  'airline safety film',
  'aviation safety film',
  'flight attendant demonstration',
  'airline pilot cockpit',
  'flight deck instruments',
  'aircraft maintenance hangar',
  'aircraft inspection mechanic',
  'jet airliner takeoff',
  'commercial airliner landing',
  'passenger boarding aircraft',
  'airport tarmac aircraft',
  'turboprop airliner',
  'regional airliner',
  'high altitude flight',
  'aviation accident investigation',
  'aircraft crew training',
  // Archive.org indexes decades of aviation instruction and newsreel material under
  // period vocabulary that modern stock terms never reach. Each line is a different
  // real subject, so it buys new items rather than re-ranking the same ones.
  'airline stewardess cabin',
  'passenger cabin service',
  'aircraft cabin altitude',
  'explosive decompression test',
  'altitude chamber training',
  'pilot training film',
  'cockpit crew procedures',
  'airline ground crew',
  'aircraft engine overhaul',
  'airframe structural inspection',
  'aircraft assembly plant',
  'jet transport development',
  'propeller airliner flight',
  'airport terminal passengers',
  'air traffic control tower',
  'civil aviation authority',
  'airline operations film',
  'aircraft emergency evacuation',
];

const ARCHIVE_HOUSING_MOTION_QUERIES = [
  'apartment building',
  'apartment interior',
  'public housing',
  'tenant eviction',
  'rent strike',
  'housing inspection',
  'moving house boxes',
  'city housing project',
  'landlord tenant hearing',
  'family kitchen home',
  'slum clearance',
  'urban renewal housing',
  'tenement building',
  'housing authority film',
  'affordable housing program',
  'city apartment street',
  'family moving day',
  'rent collection office',
  'housing court hearing',
  'neighborhood housing survey',
];

const ARCHIVE_VARIANT_LEAD_STOPWORDS =
  /^(?:worried|shocked|stressed|nervous|scared|crying|real|documentary|authentic|news|bright|sunny|daylight|well|person|people|couple|man|woman|elderly|family|close)\b/i;

/**
 * Short 2-word subject variants of a descriptive query, for Archive.org full-text
 * recall. Only the topical head survives — reaction/lighting adjectives lead to
 * opaque matches, so they are dropped rather than searched for.
 */
export function archiveShortQueryVariants(queries = []) {
  const out = [];
  for (const query of queries) {
    const words = String(query || '').trim().split(/\s+/).filter(Boolean);
    if (words.length < 3) continue;
    if (ARCHIVE_VARIANT_LEAD_STOPWORDS.test(query)) continue;
    const variant = words.slice(0, 2).join(' ').replace(/[^a-z0-9\s'-]/gi, '').trim();
    if (variant.split(/\s+/).some((w) => w.length < 3)) continue;
    out.push(variant.toLowerCase());
  }
  return [...new Set(out)];
}

/** Words that describe our framing of the story, not anything an item could show. */
const ARCHIVE_TOPIC_SUBJECT_STOPWORDS = new Set([
  'about', 'after', 'again', 'against', 'almost', 'already', 'always', 'among', 'another', 'because',
  'been', 'before', 'behind', 'being', 'between', 'billion', 'built', 'called', 'came', 'could',
  'does', 'done', 'down', 'during', 'each', 'either', 'else', 'even', 'ever', 'every',
  'exclusive', 'exposed', 'first', 'from', 'full', 'gone', 'happened', 'hidden', 'here', 'high',
  'himself', 'into', 'inside', 'just', 'kept', 'know', 'last', 'like', 'made', 'make', 'many',
  'million', 'more', 'most', 'much', 'must', 'need', 'never', 'next', 'nobody', 'noticed', 'only',
  'other', 'over', 'really', 'said', 'same', 'secret', 'seen', 'shocking', 'should', 'since',
  'some', 'still', 'story', 'such', 'take', 'than', 'that', 'their', 'them', 'then', 'there',
  'these', 'they', 'thing', 'think', 'this', 'those', 'through', 'time', 'told', 'took', 'truth',
  'under', 'until', 'very', 'were', 'what', 'when', 'where', 'which', 'while', 'whole', 'will',
  'with', 'without', 'would', 'years', 'your',
]);

/**
 * Concrete 1–2 word subjects taken straight from the topic, for keyless topics with no
 * curated pack. Archive.org ranks full text over item metadata, so a handful of literal
 * nouns from the story reaches items the descriptive stock phrasing never will.
 *
 * These are extra *questions*, not extra evidence: whatever comes back still has to
 * prove itself through the item's own metadata.
 */
export function archiveTopicSubjectQueries(topicBlob = '', limit = 8) {
  const words = String(topicBlob || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    // Past-tense verbs ("dumped", "recorded") describe the event, not a filmable thing.
    .filter((w) => w.length >= 4 && !/ed$/.test(w) && !ARCHIVE_TOPIC_SUBJECT_STOPWORDS.has(w));
  const out = [];
  const seen = new Set();
  const push = (query) => {
    const key = query.trim();
    if (!key || seen.has(key) || !isSafeStockMotionQuery(key)) return;
    seen.add(key);
    out.push(key);
  };
  for (let i = 0; i + 1 < words.length && out.length < limit; i += 1) {
    push(`${words[i]} ${words[i + 1]}`);
  }
  // A one-word subject is a very broad question, so it is only worth asking when the
  // topic did not yield enough concrete pairs to fill the plan.
  if (out.length < 3) {
    for (const word of words) {
      if (out.length >= limit) break;
      if (word.length >= 6) push(word);
    }
  }
  return out.slice(0, limit);
}

/**
 * Descriptive web-video searches. They come only from the topic-specific motion
 * pack and literal topic subjects; provider titles remain the admission evidence.
 */
export function webMotionQueryVariants(topicBlob = '', baseQueries = [], limit = 12) {
  const literalSubjects = archiveTopicSubjectQueries(topicBlob, 6);
  const ordered = [
    ...baseQueries.filter((query) => stockQueryWords(query).length >= 2),
    ...literalSubjects,
  ];
  const out = [];
  const seen = new Set();
  for (const query of ordered) {
    const key = String(query || '').trim().toLowerCase();
    if (!key || seen.has(key) || !isSafeStockMotionQuery(key)) continue;
    seen.add(key);
    out.push(key);
    if (out.length >= limit) break;
  }
  return out;
}

const NON_YOUTUBE_WEB_MOTION_HOSTS = ['vimeo.com', 'dailymotion.com'];

/**
 * Keep explicit non-YouTube searches in the motion plan. Search engines otherwise
 * return almost entirely YouTube results even when Vimeo/Dailymotion have matching
 * footage.
 */
export function webMotionHostQueryVariants(baseQueries = [], limit = 12) {
  const out = [];
  const seen = new Set();
  for (const base of baseQueries) {
    for (const host of NON_YOUTUBE_WEB_MOTION_HOSTS) {
      const query = `${String(base || '').trim()} site:${host}`.trim();
      const key = query.toLowerCase();
      if (!seen.has(key) && isSafeStockMotionQuery(query)) {
        seen.add(key);
        out.push(query);
      }
      if (out.length >= limit) return out;
    }
  }
  return out;
}

function webMotionHostQueryBase(query = '') {
  return String(query).replace(/\s+site:(?:vimeo\.com|dailymotion\.com)\s*$/i, '').trim();
}

/**
 * Archive sweeps re-rank a subject the way archivists label material: raw "footage",
 * an instructional "film", a period "newsreel". Each suffix surfaces a different slice
 * of the same subject, which is recall — the evidence gate is untouched.
 */
const ARCHIVE_SWEEP_SUFFIXES = ['footage', 'film', 'newsreel'];

/** A second/third archive sweep re-ranks the same subject; over-long queries are skipped. */
export function withArchiveSweepSuffix(query, suffix = '') {
  const base = String(query || '').trim();
  if (!suffix) return isSafeStockMotionQuery(base) ? base : '';
  if (new RegExp(`\\b${suffix}\\b`, 'i').test(base)) return '';
  const next = `${base} ${suffix}`;
  return isSafeStockMotionQuery(next) && stockQueryWords(next).length <= 5 ? next : '';
}

/**
 * Motion query plan for this run's key mode.
 *
 * Keyed runs lead with the story's own faces then hammer the keyed topical pack.
 * Keyless runs lead with descriptive web-video searches, then short
 * Archive.org-friendly subjects. Both remain tied to the topic-specific pack.
 */
export function motionQueryPlan(topicBlob, cyberTopic, options = {}) {
  const keyed = options.stockKeyed === true;
  const base = stockMotionQueries(topicBlob, cyberTopic, options).filter(isSafeStockMotionQuery);
  const webQueries = webMotionQueryVariants(topicBlob, base);
  const webHostQueries = webMotionHostQueryVariants(webQueries);
  const airline = isAirlineTopic(topicBlob);
  const housing = isHousingTopic(topicBlob);
  let boost;
  if (keyed) {
    boost = airline ? KEYED_AIRLINE_MOTION_QUERIES : housing ? KEYED_HOUSING_MOTION_QUERIES : [];
  } else {
    boost = airline
      ? ARCHIVE_AIRLINE_MOTION_QUERIES
      : housing
        ? ARCHIVE_HOUSING_MOTION_QUERIES
        : [...archiveShortQueryVariants(base), ...archiveTopicSubjectQueries(topicBlob, 10)];
  }
  boost = boost.filter(isSafeStockMotionQuery);

  // Keyed: keep the face head, then the aggressive topical pack, then base fillers.
  // Keyless: web-friendly scenes first, then short Archive subjects and remaining base.
  const headCount = keyed ? Math.min(4, base.length) : 0;
  const ordered = keyed
    ? [...base.slice(0, headCount), ...boost, ...base.slice(headCount)]
    : [...webQueries, ...boost, ...base];

  const queries = [];
  const seen = new Set();
  for (const query of ordered) {
    const key = query.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    queries.push(query);
  }
  return {
    mode: keyed ? 'keyed' : 'keyless',
    keyed,
    queries,
    webQueries,
    webHostQueries,
    // Archive.org has its own direct-MP4 search lane; host-scoped web searches must
    // never displace these subjects from that lane.
    archiveQueries: [...queries],
    boostCount: boost.length,
    baseCount: base.length,
  };
}

/** How many of the leading (most topical) queries a keyed run re-asks on page 2. */
const KEYED_SECOND_PAGE_QUERIES = 14;

const MOTION_FETCH_BUDGET_MS_KEYED = 240000;
const MOTION_FETCH_BUDGET_MS_KEYLESS = 360000;

/**
 * Wall-clock ceiling on the search phase. A keyless plan can be ~100 Archive.org
 * queries at ~10s each, so the wider plan needs a stop that is not "ran out of
 * subjects" — whatever has been gathered by then still goes through the same gates.
 */
export function resolveMotionFetchBudgetMs(keyed = false, env = process.env) {
  const override = Number.parseInt(env?.AUTOTUBE_MOTION_FETCH_BUDGET_MS ?? '', 10);
  if (Number.isFinite(override) && override > 0) return override;
  return keyed ? MOTION_FETCH_BUDGET_MS_KEYED : MOTION_FETCH_BUDGET_MS_KEYLESS;
}

/**
 * The ordered rounds of provider calls for this run.
 *
 * Round 0 asks every planned subject once. Later rounds are marked `extra` and only
 * run while the clip pool is still short: keyed runs go deeper into the same topical
 * subjects (provider page 2), keyless runs re-rank each subject the way Archive.org
 * labels material ("… footage", "… film", "… newsreel").
 */
export function planMotionFetchRounds(queries = [], { keyed = false, queryCap = 24 } = {}) {
  const capped = queries.slice(0, Math.max(0, queryCap));
  const planned = new Set();
  const rounds = [];
  const addRound = (label, attempts) => {
    const kept = [];
    for (const attempt of attempts) {
      const key = `${attempt.query.toLowerCase()}|${attempt.page}`;
      if (!attempt.query || planned.has(key)) continue;
      planned.add(key);
      kept.push(attempt);
    }
    if (kept.length) rounds.push({ label, attempts: kept });
  };

  addRound(
    'primary',
    capped.map((query) => ({ query, subject: query, sweep: '', page: 1, extra: false })),
  );
  if (keyed) {
    addRound(
      'provider-page-2',
      capped
        .slice(0, KEYED_SECOND_PAGE_QUERIES)
        .map((query) => ({ query, subject: query, sweep: '', page: 2, extra: true })),
    );
    return rounds;
  }
  for (const suffix of ARCHIVE_SWEEP_SUFFIXES) {
    addRound(
      `archive-sweep-${suffix}`,
      capped
        .map((subject) => ({ subject, query: withArchiveSweepSuffix(subject, suffix) }))
        .filter(({ query }) => query)
        .map(({ subject, query }) => ({ query, subject, sweep: suffix, page: 1, extra: true })),
    );
  }
  return rounds;
}

/**
 * How much motion to chase, and how hard, for this key mode.
 *
 * These are top-up targets, not admission floors: raising them only makes the
 * pipeline attempt more clips, never makes a thin pool pass.
 */
export function resolveMotionVolumeTargets({
  segmentCount = 1,
  segmentDurationSec = 0,
  hasStockKeys = false,
  topicBlob = '',
  cutIntervalSec = 1.25,
  stockApiVideoCount = 0,
} = {}) {
  const segN = Math.max(1, segmentCount);
  const airline = isAirlineTopic(topicBlob);
  const housing = isHousingTopic(topicBlob);
  if (hasStockKeys) {
    const aggressive = airline || housing;
    const stockFloor = Math.max(aggressive ? 24 : 16, segN * (aggressive ? 5 : 4));
    const minVideos = Math.min(
      aggressive ? 42 : 28,
      Math.max(
        stockFloor,
        Math.ceil((segmentDurationSec / (cutIntervalSec || 1.25)) * 0.75),
      ),
    );
    return {
      mode: 'keyed',
      minVideos,
      stockNeed: Math.max(0, stockFloor - stockApiVideoCount),
      perSegTarget: aggressive ? 6 : 5,
      introTarget: aggressive ? 7 : 6,
      aggressive,
    };
  }
  // Keyless: raw web + Archive.org. Chase more than the soft-pass floor so a denser
  // cut is possible, but never treat the target as evidence — admission gates still rule.
  const keylessFloor = airline
    ? Math.max(16, segN * 3)
    : housing
      ? Math.max(18, segN * 4)
      : Math.min(segN * 2, 6);
  return {
    mode: 'keyless',
    minVideos: keylessFloor,
    stockNeed: airline || housing ? Math.max(0, keylessFloor - stockApiVideoCount) : 0,
    perSegTarget: airline || housing ? 3 : 2,
    introTarget: airline || housing ? 4 : 2,
    aggressive: false,
  };
}

/**
 * One-line motion summary for run logs, written so the two paths never read alike.
 *
 * Both paths report raw-web and archive contributions; keyed runs additionally
 * report stock providers, while keyless runs expose Archive.org evidence recall.
 */
export function formatMotionPathLog(report = {}) {
  const mode = report.motionKeyMode || 'unknown';
  const queries =
    `queries-tried=${report.motionQueriesTried || 0} query-pack=${report.motionQueryPoolSize || 0}`
    + ` host-queries=${report.motionWebHostQueriesTried || 0}/${report.motionWebHostQueryPoolSize || 0}`;
  const selectedYoutube = report.motionSelectedYouTube
    ?? (report.videoTopUp || []).filter(isYouTubeMotionCandidate).length;
  const selectedNonYoutube = report.motionSelectedNonYouTube
    ?? Math.max(0, (report.videoTopUp || []).length - selectedYoutube);
  const tail =
    `clip-pool=${report.motionPoolSize || 0}`
    + ` injected=${(report.videoTopUp || []).length}/${report.motionTargetVideos || 0}`
    + ` selected(youtube=${selectedYoutube} non-youtube=${selectedNonYoutube})`;
  const web =
    `bing=${report.bingWebVideoFetched || 0}`
    + ` google=${report.googleWebVideoFetched || 0}`
    + ` ddg=${report.ddgWebVideoFetched || 0}`
    + ` archive=${report.archiveLiveFetched || 0}`;

  if (mode === 'keyed') {
    const providers =
      `pexels=${report.pexelsFetched || 0} pixabay=${report.pixabayFetched || 0}`
      + ` | web ${web}`;
    const archive = report.archiveQueriesTried
      ? ` | archive-queries=${report.archiveQueriesTried} evidence-rejected=${report.archiveEvidenceRejected || 0}`
      : '';
    const keys = `keys pexels=${report.motionKeyPexels ? 'yes' : 'no'} pixabay=${report.motionKeyPixabay ? 'yes' : 'no'}`;
    return (
      `Motion path: keyed (${keys}) — ${providers}`
      + ` | ${queries} page2-queries=${report.motionPageTwoQueries || 0}`
      + archive
      + ` | ${tail}`
    );
  }

  const archive =
    `archive-queries=${report.archiveQueriesTried || 0}`
    + ` sweep-queries=${report.archiveSweepQueries || 0}`
    + ` dead-subjects=${report.archiveDeadSubjects || 0}`
    + ` raw-hits=${report.archiveRawHits || 0}`
    + ` evidence-lookups=${report.archiveEvidenceLookups || 0}`
    + ` evidence-cached=${report.archiveEvidenceCacheHits || 0}`
    + ` evidence-enriched=${report.archiveEvidenceEnriched || 0}`
    + ` evidence-rejected=${report.archiveEvidenceRejected || 0}`;
  const why = mode === 'keyless' ? ' (no stock API keys — web + Archive.org)' : '';
  return (
    `Motion path: ${mode}${why}`
    + ` — web ${web}`
    + ` | ${queries}`
    + ` | ${archive}`
    + ` | ${tail}`
  );
}

/**
 * One-line drop funnel: fetched → after-junk → after-vision → after-relevance →
 * injected. Explains where topical clips are lost between a rich pool and the handful
 * that reach segment media, so an "injected=1/18 from clip-pool=140" run is diagnosable
 * from the log alone.
 */
export function formatMotionDropFunnel(report = {}) {
  const fetched = report.motionCandidatesSeen || 0;
  const afterJunk = report.motionAfterJunk ?? 0;
  const afterVision = report.motionAfterVision ?? (report.motionPoolSize || 0);
  const relevanceDrop = Array.isArray(report.motionRelevanceDroppedAfterTopUp)
    ? report.motionRelevanceDroppedAfterTopUp.length
    : (report.relevanceDroppedAfterTopUp || []).length;
  const injected = (report.videoTopUp || []).length;
  const drops =
    `junk=${report.motionDroppedJunk || 0}`
    + ` relevance=${report.motionDroppedRelevance || 0}`
    + ` vision=${report.motionDroppedVision || 0}`
    + ` web-fail-open=${report.visionWebFailOpen || 0}`;
  const inject =
    `probe-pass=${report.injectProbePassed || 0}`
    + ` probe-fail=${report.injectProbeFailed || 0}`
    + ` proxy-trusted=${report.injectProxyTrusted || 0}`;
  return (
    `Motion drop funnel: fetched=${fetched}`
    + ` → after-junk=${afterJunk}`
    + ` → after-vision=${afterVision}`
    + ` → after-relevance=${Math.max(0, afterVision - relevanceDrop)}`
    + ` → injected=${injected}`
    + ` | drops(${drops})`
    + ` | inject(${inject})`
  );
}

/** Exported for unit tests (bright / anti-HUD / nursing query proof). */
export {
  stockMotionQueries,
  isSafeStockMotionQuery,
  isNursingHomeTopic,
  isHealthcareTopic,
  isJunkStockClip,
  isCyberRelevantClip,
  isAirlineRelevantClip,
  airlineQueryVisionBypass,
  stripJunkDemoVideos,
  stripUnsafeMediaAssets,
  injectCyberStockStills,
};

/**
 * Inject topical motion: raw web video + live archive.org + stock/static pools.
 * No Pexels/Pixabay keys required.
 */
async function topUpVideoBroll(project, report, mediaOffset = 0, devServer = '', options = {}) {
  const segments = project.script || [];
  if (!segments.length) return;
  const topicBlob = `${project.topic || ''} ${project.title || ''}`.toLowerCase();
  const seriousTopic = isSeriousNewsTopic(topicBlob);
  const housingTopic = isHousingTopic(topicBlob);
  // Bare "AI" matched landlord topics and pulled podcast-mic stock.
  const schoolCyber =
    isSchoolEducationTopic(topicBlob)
    && /hack|ransom|breach|cyber|leak|data|records/.test(topicBlob);
  const cyberTopic =
    !housingTopic
    && !isNursingHomeTopic(topicBlob)
    && !isVeteransBenefitsTopic(topicBlob)
    && !isHeistTopic(topicBlob)
    && (isBankScamTopic(topicBlob) || isHealthcareCyberTopic(topicBlob) || schoolCyber);

  stripJunkDemoVideos(project, report);

  const keyMode = resolveStockKeyMode();
  const hasStockKeysEarly = keyMode.keyed;
  const airlineTopicEarly = isAirlineTopic(topicBlob);
  const existingVideos = (project.media || []).filter(
    (a) => a.type === 'video' && !isJunkDemoVideoUrl(a.url || ''),
  );
  const existingStockVideos = existingVideos.filter((a) =>
    /pexels|pixabay|mixkit|archive\.org/i.test(`${a.url} ${a.source || ''}`),
  );
  const targets = resolveMotionVolumeTargets({
    segmentCount: segments.length,
    segmentDurationSec: segments.reduce((s, seg) => s + (Number(seg.duration) || 15), 0),
    hasStockKeys: hasStockKeysEarly,
    topicBlob,
    cutIntervalSec: options.cutIntervalSec,
    stockApiVideoCount: existingStockVideos.length,
  });

  const liveClips = [];
  const plan = motionQueryPlan(topicBlob, cyberTopic, {
    faceSeek: options.faceSeek === true,
    preferBright: options.preferBright === true,
    stockKeyed: hasStockKeysEarly,
  });
  const queries = plan.queries;
  report.motionKeyMode = keyMode.mode;
  report.motionKeyPexels = keyMode.pexels;
  report.motionKeyPixabay = keyMode.pixabay;
  report.motionQueryPoolSize = queries.length;
  report.motionWebHostQueryPoolSize = plan.webHostQueries.length;
  report.motionQueryBoost = plan.boostCount;
  report.motionTargetVideos = targets.minVideos;

  // Keyed: stock providers plus additive raw-web motion.
  // Keyless: raw web is the primary credential-free path, with Archive.org recall
  // from distinct subjects and sweeps — never from relaxing evidence gates below.
  const aggressiveTopic = airlineTopicEarly || housingTopic;
  const queryCap = hasStockKeysEarly
    ? (aggressiveTopic ? 30 : 20)
    : (airlineTopicEarly ? 44 : housingTopic ? 34 : 26);
  const liveCap = hasStockKeysEarly ? 200 : 140;
  const perQueryCap = hasStockKeysEarly ? 8 : 10;
  const perProviderPage = hasStockKeysEarly && aggressiveTopic ? 16 : 10;
  const liveTarget = Math.min(liveCap, Math.max(targets.minVideos * 2, targets.minVideos + 8));
  // Keyed runs page deeper into the same topical subjects; keyless runs re-rank each
  // subject with archive labels. Both extra rounds stop as soon as the pool is deep
  // enough — recall is what widens here, never the gate the clips still have to pass.
  const rounds = planMotionFetchRounds(queries, { keyed: hasStockKeysEarly, queryCap });
  const evidenceBudget = archiveEvidenceLookupBudget(hasStockKeysEarly);
  // One Archive.org query costs ~10s (the proxy resolves item metadata per hit), so the
  // wider keyless plan is fetched in parallel batches instead of one query at a time.
  const fetchBatchSize = 4;
  const deadline = Date.now() + resolveMotionFetchBudgetMs(hasStockKeysEarly);
  const usedUrls = new Set((project.media || []).map((a) => motionUrlKey(a.url)).filter(Boolean));
  const deadSubjects = new Set();
  const fetchCandidates = async ({ query: q, sweep: suffix, page }) => {
    // Skip archive.org for cyber topics when stock API keys exist, and don't re-ask
    // archive for page 2 — the proxy only ever returns one page of items per subject.
    const archivePromise =
      plan.archiveQueries.includes(q)
      && (!cyberTopic || !hasStockKeysEarly)
      && devServer
      && page === 1
        ? fetchArchiveVideoResults(devServer, q, { topicBlob })
        : Promise.resolve([]);
    const scopedWebQueries = !suffix && page === 1
      ? plan.webHostQueries.filter((query) => webMotionHostQueryBase(query) === q)
      : [];
    const webSearchQueries = !suffix && devServer && page === 1
      ? [...scopedWebQueries, q]
      : [];
    report.motionWebHostQueriesTried =
      (report.motionWebHostQueriesTried || 0) + scopedWebQueries.length;
    const webPromises = webSearchQueries.flatMap((webQuery) =>
      WEB_VIDEO_PROVIDERS.map(({ key }) =>
        fetchWebVideoResults(devServer, key, webQuery, { topicBlob, limit: perProviderPage })));
    const [
      fromPexels,
      fromPixabay,
      initialArchive,
      ...webResults
    ] = await Promise.all([
      suffix ? Promise.resolve([]) : fetchPexelsVideos(q, perProviderPage, page),
      suffix ? Promise.resolve([]) : fetchPixabayVideos(q, perProviderPage, page),
      archivePromise,
      ...webPromises,
    ]);
    let fromArchive = initialArchive;
    const archiveRaw = fromArchive.length;
    if (archiveRaw) {
      report.archiveQueriesTried = (report.archiveQueriesTried || 0) + 1;
      report.archiveRawHits = (report.archiveRawHits || 0) + archiveRaw;
      // Keyed runs get their volume from Pexels/Pixabay, so they spend far less of the
      // metadata budget on archive; keyless runs need every item they can qualify.
      fromArchive = await enrichArchiveEvidence(fromArchive, {
        topicBlob,
        limit: Math.min(
          hasStockKeysEarly ? 2 : 10,
          evidenceBudget - (report.archiveEvidenceLookups || 0),
        ),
        concurrency: hasStockKeysEarly ? 4 : 6,
        skipUrls: usedUrls,
        report,
      });
    }
    const interleavedProviders = [];
    const providerLists = [...webResults, fromPexels, fromPixabay];
    const maxProviderResults = Math.max(0, ...providerLists.map((items) => items.length));
    for (let i = 0; i < maxProviderResults; i += 1) {
      for (const items of providerLists) {
        if (items[i]) interleavedProviders.push(items[i]);
      }
    }
    return {
      query: q,
      sweep: suffix,
      archiveRaw,
      candidates: rankMotionCandidates([
        ...interleavedProviders,
        ...fromArchive,
      ]),
    };
  };

  const batches = [];
  for (const round of rounds) {
    for (let i = 0; i < round.attempts.length; i += fetchBatchSize) {
      batches.push(round.attempts.slice(i, i + fetchBatchSize));
    }
  }
  for (const plannedBatch of batches) {
    // A subject Archive.org has nothing for stays empty when it is re-labelled, so the
    // remaining query budget goes to subjects that actually returned items.
    const batch = plannedBatch.filter((a) => !a.extra || !deadSubjects.has(a.subject));
    if (!batch.length) continue;
    // Extra rounds (provider page 2, archive sweeps) run only while the pool is thin.
    if (batch.every((a) => a.extra) && liveClips.length >= liveTarget) continue;
    if (liveClips.length >= liveCap || Date.now() >= deadline) break;
    for (const attempt of batch) {
      if (attempt.sweep) report.archiveSweepQueries = (report.archiveSweepQueries || 0) + 1;
      if (attempt.page > 1) report.motionPageTwoQueries = (report.motionPageTwoQueries || 0) + 1;
      report.motionQueriesTried = (report.motionQueriesTried || 0) + 1;
    }
    const fetched = await Promise.all(batch.map(fetchCandidates));
    if (!hasStockKeysEarly) {
      batch.forEach((attempt, idx) => {
        if (fetched[idx].archiveRaw === 0 && !deadSubjects.has(attempt.subject)) {
          deadSubjects.add(attempt.subject);
          report.archiveDeadSubjects = (report.archiveDeadSubjects || 0) + 1;
        }
      });
    }
    const addedPerQuery = new Map();
    for (const { query: q, clip } of fetched.flatMap(({ query, candidates }) =>
      candidates.map((candidate) => ({ query, clip: candidate })),
    )) {
      const addedForQuery = addedPerQuery.get(q) || 0;
      if (liveClips.length >= liveCap || addedForQuery >= perQueryCap) continue;
      // Funnel accounting (fetched → after-junk → after-vision → injected): count every
      // candidate that actually reaches the gates so drop reasons are explainable.
      report.motionCandidatesSeen = (report.motionCandidatesSeen || 0) + 1;
      // Archive.org items must say what they show. A topical query plus an opaque
      // identifier is exactly the laundering this gate exists to stop.
      if (/Archive/i.test(clip.source || '')) {
        const verdict = archiveEvidenceVerdict(clip, { query: q, topicBlob });
        if (!verdict.ok) {
          report.archiveEvidenceRejected = (report.archiveEvidenceRejected || 0) + 1;
          report.junkStockSkipped = (report.junkStockSkipped || 0) + 1;
          continue;
        }
      }
      const isWebClip = /web video/i.test(clip.source || '');
      // Search text asks the question; it is not evidence for a web result.
      const evidenceClip = isWebClip ? { ...clip, query: '' } : clip;
      const strongMotionRelevance = isCyberRelevantClip(evidenceClip, topicBlob);
      if (isJunkStockClip(evidenceClip, topicBlob, { preferBright: options.preferBright === true })) {
        report.motionDroppedJunk = (report.motionDroppedJunk || 0) + 1;
        report.junkStockSkipped = (report.junkStockSkipped || 0) + 1;
        continue;
      }
      if (
        (
          cyberTopic
          || housingTopic
          || isNursingHomeTopic(topicBlob)
          || isVeteransBenefitsTopic(topicBlob)
          || isHealthcareCyberTopic(topicBlob)
          || schoolCyber
          || isHeistTopic(topicBlob)
          || isAirlineTopic(topicBlob)
        )
        && !strongMotionRelevance
      ) {
        report.motionDroppedRelevance = (report.motionDroppedRelevance || 0) + 1;
        report.junkStockSkipped = (report.junkStockSkipped || 0) + 1;
        continue;
      }
      report.motionAfterJunk = (report.motionAfterJunk || 0) + 1;
      // Vision gate on stock thumbs (keywords miss off-brand junk).
      // Short trusted airline queries skip vision only when the clip carries its own
      // visual evidence — vision was rejecting real cabin/cockpit faces and leaving
      // only 3–4 hangar/runway pads (soft-pass thin → D-grade), but an opaque alt
      // never buys a free pass.
      const thumb = clip.thumbnailUrl || clip.image || '';
      const apiKey = resolveOpenRouterKey();
      const trustedAirlineQuery = airlineQueryVisionBypass(clip, q, topicBlob);
      const visionBudget = isAirlineTopic(topicBlob) ? 24 : 6;
      const gate = decideStockVisionGate({
        hasThumb: Boolean(thumb),
        hasApiKey: Boolean(apiKey),
        trustedVisualEvidence: trustedAirlineQuery,
        checked: report.visionStockChecked || 0,
        budget: visionBudget,
      });
      if (gate.action === 'skip') {
        // Fail open for web clips that already cleared the topical relevance gate on
        // their own title/alt evidence — dropping them once the vision budget is spent
        // is what starved inject to ~1. Stock/archive clips keep the strict skip.
        const failOpen = shouldFailOpenWebVisionSkip({
          isWebClip,
          hasStrongEvidence: strongMotionRelevance,
        });
        if (failOpen) {
          report.visionStockBudgetSoftAdmitted = (report.visionStockBudgetSoftAdmitted || 0) + 1;
          report.visionWebFailOpen = (report.visionWebFailOpen || 0) + 1;
        } else {
          report.visionStockBudgetSkipped = (report.visionStockBudgetSkipped || 0) + 1;
          report.motionDroppedVision = (report.motionDroppedVision || 0) + 1;
          report.junkStockSkipped = (report.junkStockSkipped || 0) + 1;
          continue;
        }
      }
      if (gate.reason === 'budget-exhausted-soft') {
        report.visionStockBudgetSoftAdmitted = (report.visionStockBudgetSoftAdmitted || 0) + 1;
      }
      if (gate.action === 'check') {
        report.visionStockChecked = (report.visionStockChecked || 0) + 1;
        const verdict = await visionRejectOffBrandStock(thumb, apiKey, topicBlob);
        if (verdict.ran === false) {
          const unverified = recordVisionStockUnverified(report, verdict, { thumbnailUrl: thumb });
          if (unverified.skip) {
            report.motionDroppedVision = (report.motionDroppedVision || 0) + 1;
            report.junkStockSkipped = (report.junkStockSkipped || 0) + 1;
            continue;
          }
        }
        if (verdict.reject) {
          report.visionStockRejected = (report.visionStockRejected || 0) + 1;
          report.visionStockRejectedThumbs = report.visionStockRejectedThumbs || [];
          report.visionStockRejectedThumbs.push({ thumbnailUrl: thumb, reason: verdict.reason || '' });
          report.motionDroppedVision = (report.motionDroppedVision || 0) + 1;
          report.junkStockSkipped = (report.junkStockSkipped || 0) + 1;
          continue;
        }
      }
      if (liveClips.some((c) => c.url === clip.url)) continue;
      liveClips.push({
        ...clip,
        query: q,
        // Run-local proof used only to prevent the later generic relevance pass
        // from contradicting this stricter web-motion evidence decision.
        motionRelevancePassed: isWebClip && strongMotionRelevance,
      });
      addedPerQuery.set(q, addedForQuery + 1);
    }
  }
  report.motionAfterVision = liveClips.length;
  report.archiveLiveFetched = liveClips.filter((c) => /Archive/i.test(c.source || '')).length;
  report.bingWebVideoFetched = liveClips.filter((c) => /Bing web video/i.test(c.source || '')).length;
  report.googleWebVideoFetched = liveClips.filter((c) => /Google web video/i.test(c.source || '')).length;
  report.ddgWebVideoFetched = liveClips.filter((c) => /DuckDuckGo web video/i.test(c.source || '')).length;
  report.pexelsFetched = liveClips.filter((c) => /Pexels/i.test(c.source || '')).length;
  report.pixabayFetched = liveClips.filter((c) => /Pixabay/i.test(c.source || '')).length;
  if (options.faceSeek) report.faceSeekQueries = queries.slice(0, 6);

  let pool = [
    ...liveClips,
    ...(housingTopic && curatedPacksEnabled() ? STOCK_HOUSING_VIDEOS : []),
    ...(cyberTopic ? MIXKIT_VIDEO_POOL : []),
    ...(seriousTopic ? topicalStockVideos(topicBlob, STOCK_VIDEO_POOL) : STOCK_VIDEO_POOL.filter((v) => !(v.tags || []).includes('filler'))),
  ];
  // Dedupe by URL; drop junk tags.
  const seenPool = new Set();
  pool = pool.filter((v) => {
    const key = motionUrlKey(v.url);
    if (!key || seenPool.has(key) || isJunkDemoVideoUrl(key) || isJunkStockClip(v, topicBlob, { preferBright: options.preferBright === true })) return false;
    if (isAirlineTopic(topicBlob) && !isCyberRelevantClip(v, topicBlob)) return false;
    seenPool.add(key);
    return true;
  });
  // Round-robin by query so one shot doesn't dominate.
  const byQuery = new Map();
  for (const clip of pool) {
    const q = clip.query || clip.source || 'pool';
    if (!byQuery.has(q)) byQuery.set(q, []);
    byQuery.get(q).push(clip);
  }
  const interleaved = [];
  const buckets = [...byQuery.values()];
  let bi = 0;
  while (interleaved.length < pool.length) {
    let progressed = false;
    for (let b = 0; b < buckets.length; b += 1) {
      const bucket = buckets[(bi + b) % buckets.length];
      if (bucket.length) {
        interleaved.push(bucket.shift());
        progressed = true;
      }
    }
    bi += 1;
    if (!progressed) break;
  }
  pool = rankMotionCandidates(interleaved.length ? interleaved : pool);

  report.motionPoolSize = pool.length;
  if (!pool.length) {
    report.videoTopUpSkipped = 'no-motion-pool';
    return;
  }

  // Keep chasing both the configured motion floor and the per-segment asset floor
  // after preserving raw harvest clips.
  const videoCount = existingVideos.length;
  const { minVideos, stockNeed } = targets;
  const used = usedUrls;
  const availablePoolCount = pool.filter((clip) => {
    const key = motionUrlKey(clip.url);
    return key && !used.has(key);
  }).length;
  const fullPaddingQueue = buildMotionPaddingQueue(
    project,
    options.minAssetsPerSegment || 0,
  );
  const paddingQueue = fullPaddingQueue.slice(0, availablePoolCount);
  report.motionPaddingRequested = fullPaddingQueue.length;
  report.motionPaddingAvailable = availablePoolCount;
  let need = Math.max(minVideos - videoCount, stockNeed, paddingQueue.length);
  if (need <= 0) return;

  const faceScore = (clip) => {
    const blob = `${clip.query || ''} ${clip.alt || ''} ${clip.title || ''}`.toLowerCase();
    if (isGenericStockJunk(blob, topicBlob)) return -4;
    if (
      !isWorkplaceTopic(topicBlob)
      && /\b(office|coworking|open.?plan|imac|boardroom|conference room|bright office daylight)\b/i.test(blob)
    ) {
      return -20;
    }
    if (/microphone|podcast|recording studio|asmr|rode|press conference|news desk/i.test(blob)) return -3;
    if (/architectural model|architecture model|scale model|conference room|skyline|corporate office|business district|open plan office|coworking/i.test(blob)) return -4;
    if (isAirlineTopic(topicBlob)) {
      if (AIRLINE_OFF_TOPIC_RE.test(blob)) return -20;
      if (AIRLINE_DISCONNECTED_PAD_RE.test(blob)) return -20;
      if (!isAirlineRelevantClip(clip, topicBlob)) return -20;
      if (
        /\b(daylight|sunny|bright|well.?lit)\b/i.test(blob)
        && /\b(airplane|aircraft|plane)?\s*cabin|aisle\b/i.test(blob)
        && /\b(face|faces|passengers?|people|crew|attendant)\b/i.test(blob)
      ) {
        return 8;
      }
      if (/\bpilot\b.{0,40}\bcockpit\b.{0,40}\bheadset\b|\bcockpit\b.{0,40}\bheadset\b.{0,40}\bpilot\b/i.test(blob)) return 8;
      if (/\boxygen\s*mask\b/i.test(blob) && /\b(cabin|airplane|aircraft|plane|passenger)\b/i.test(blob)) return 8;
      if (/\b(hangar|maintenance|mechanic)\b/i.test(blob) && /\b(aircraft|airplane|plane|jet|fuselage)\b/i.test(blob)) return 7;
      if (/\b(runway|tarmac)\b/i.test(blob) && /\b(plane|aircraft|airplane|jet)\b/i.test(blob)) return 7;
      if (/airplane cabin passenger|pilot cockpit|flight attendant airplane|oxygen mask|cabin pressure|pressure gauge|mechanic tools|maintenance hangar|redacted|faa report|paperwork|documents/i.test(blob)) return 5;
      if (/airline|aircraft|airplane|aviation|cabin|cockpit|passenger|pilot|attendant|flight|mechanic|hangar|faa|oxygen/i.test(blob)) return 3;
      if (/airport|runway|plane|jet|tarmac/i.test(blob)) return 1;
    }
    if (isHousingTopic(topicBlob)) {
      // Public-meeting / disaster / station-ID / chart junk masquerades as housing B-roll.
      if (
        /\b(city\s+council|council\s+meeting|agenda|public\s+hearing|ribbon\s+cutting|earthquake|quake|tsunami|can\s*tv|station\s+id|satellite\s+map|apartments?\s+approved|digital\s+globe|pie\s+chart|lending\s*tree|poll\s+graphic|infographic)\b/i.test(blob)
      ) {
        return -20;
      }
      // Archive body filler MUST be scored before landscape/newsreel demotes.
      // Enriched Archive descriptions often contain "aerial/landscape/newsreel" and
      // were hard-rejecting (-8) every Archive candidate on web11 (0 Archive inject
      // attempts; 108 YT/TT skips; HARVEST_VOLUME_FAIL).
      if (/Archive/i.test(clip.source || '')) {
        return HOUSING_ARCHIVE_STRONG_RE.test(blob) ? 1 : 0;
      }
      if (/\b(landscape|mountain|helicopter|aerial\s+view|wildfire|title\s+card|newsreel)\b/i.test(blob)) {
        return -8;
      }
      // Face-forward / lived-in housing beats charts, landscapes, and title cards.
      if (
        /\b(face|faces|worried|shocked|stressed|crying|reaction|couple|family|tenant)\b/i.test(blob)
        && /\b(apartment|home|kitchen|letter|phone|evict|rent|bills?|packing|boxes)\b/i.test(blob)
      ) {
        return 10;
      }
      if (/\b(shocked|worried|stressed)\s+face|face\s+close\s*up|couple\s+(?:arguing|reading)|family\s+apartment/i.test(blob)) {
        return 9;
      }
      if (/\b(modern\s+apartment|apartment\s+interior|for\s+rent|eviction\s+notice|packing\s+boxes|mortgage|foreclos)\b/i.test(blob)) {
        return 8;
      }
      // Bare "apartment building" exteriors are weak — keep below face/web preference.
      if (/\bapartment\s+building\b/i.test(blob)) {
        return 3;
      }
    }
    if (
      (options.preferBright === true || process.env.AUTOTUBE_PREFER_BRIGHT_BROLL === '1')
      && /\b(night|dark|silhouette|low.?light|muddy|underexposed|overexposed|blown.?out|washed.?out)\b/i.test(blob)
    ) {
      return -2;
    }
    if (/nursing|elderly|care\s*home|cctv|camera|caregiver|surveillance|wheelchair/i.test(blob)) return 3;
    if (/airport|runway|vault|diamond|jewel|cargo|security|heist|jewelry/i.test(blob)) return 2;
    if (/face|person|people|couple|worried|shocked|reaction|crying|tenant|family|evict/i.test(blob)) return 2;
    if (/apartment|rent|keys|notice|letter|packing|boxes/i.test(blob)) return 1;
    if (/\b(daylight|sunny|bright|well.?lit|documentary|handheld|cctv|surveillance)\b/i.test(blob)) return 1;
    return 0;
  };
  // Rotate for run-to-run diversity, then consider the whole finite pool. Host tier
  // wins before topical score, so YouTube is selected only after usable alternatives.
  const picks = rankMotionCandidates(
    pickStockVideos(pool.length, mediaOffset, pool),
    faceScore,
    { topicBlob },
  );
  let vi = 0;
  /** @type {{ tiktokBlocked: boolean }} */
  const proxyGate = { tiktokBlocked: false };
  const injectClip = async (seg, clip, tag) => {
    const key = motionUrlKey(clip.url);
    if (!key || used.has(key)) return false;
    const isIntro = seg.type === 'intro' || seg === segments[0];
    const score = faceScore(clip);
    if (isAirlineTopic(topicBlob) && score <= -20) return false;
    // Housing: hard-reject meeting/disaster/chart junk (-20) and landscapes (-8).
    // Non-junk Archive scores 0–1 and fills body after web (host-rank web-first).
    if (isHousingTopic(topicBlob) && score <= -6) return false;
    // Housing intro needs a face / lived-in apartment signal — not Archive filler.
    if (isIntro && isHousingTopic(topicBlob) && score < 2) return false;
    if (isIntro && score < 0) return false;
    const unreliable = unreliableWebProxyInjectReason(clip, proxyGate);
    if (unreliable) {
      report.videoTopUpFailed = report.videoTopUpFailed || [];
      report.videoTopUpFailed.push({ url: clip.url, reason: unreliable });
      report.injectProxySkipped = (report.injectProxySkipped || 0) + 1;
      return false;
    }
    // Soft-probe the first TikTok; on failure open a circuit for the rest of the run.
    if (isTikTokMotionCandidate(clip) && isProxiedClipUrl(clip.url)) {
      const target = proxiedClipTarget(clip.url) || clip.sourceUrl || '';
      const alive = softProbeYtDlpUrl(target);
      if (!alive) {
        proxyGate.tiktokBlocked = true;
        report.videoTopUpFailed = report.videoTopUpFailed || [];
        report.videoTopUpFailed.push({ url: clip.url, reason: 'tiktok-soft-probe-failed' });
        report.injectProbeFailed = (report.injectProbeFailed || 0) + 1;
        return false;
      }
    }
    const probePlan = resolveInjectClipProbe(clip.url);
    if (probePlan.probe) {
      const ok = await canFetch(clip.url, {
        timeoutMs: 120000,
        minBytes: 2048,
        expectVideo: true,
      });
      if (!ok) {
        report.videoTopUpFailed = report.videoTopUpFailed || [];
        report.videoTopUpFailed.push({ url: clip.url, reason: 'probe failed' });
        report.injectProbeFailed = (report.injectProbeFailed || 0) + 1;
        return false;
      }
      report.injectProbePassed = (report.injectProbePassed || 0) + 1;
    } else {
      // Proxy clips are re-encoded on demand at render; trust them like the harvest
      // keep-path does instead of forcing a full transcode just to answer a probe.
      report.injectProxyTrusted = (report.injectProxyTrusted || 0) + 1;
    }
    const n = (report.videoTopUp || []).length;
    const airline = isAirlineTopic(topicBlob);
    const archiveClip = /Archive/i.test(clip.source || '');
    const safeQuery =
      clip.query
      || (airline ? 'airplane cabin passengers daylight' : `stock-video ${seg.title}`);
    const injectedUrl = withDistinctProxyIdentity(clip.url, `${seg.id}-${n}`);
    // Provider metadata travels with the asset so downstream evidence gates judge the
    // clip on what it shows. Nothing aviation-flavoured is invented for empty alts —
    // a clip with no metadata must fail the relevance gate, not borrow a label.
    const providerMeta = providerEvidenceText(clip.title || '', { query: safeQuery, topicBlob });
    // Archive items already cleared archiveEvidenceVerdict to enter the pool — treat
    // that as run-local motion proof so post-top-up relevance cannot strip them while
    // keeping YouTube talking-head harvest.
    const motionRelevancePassed =
      clip.motionRelevancePassed === true || archiveClip;
    project.media.push({
      id: `stock-video-${seg.id}-${tag}-${n}`,
      segmentId: seg.id,
      type: 'video',
      url: injectedUrl,
      alt:
        clip.alt
        || providerMeta
        || (airline || /web video/i.test(clip.source || '')
          ? `${clip.source || 'Video'} clip`
          : seg.title),
      ...(providerMeta ? { title: providerMeta } : {}),
      query: safeQuery,
      source: clip.source || 'Stock video pool',
      duration: 8,
      isFallback: false,
      motionRelevancePassed,
    });
    used.add(key);
    need -= 1;
    report.videoTopUp = report.videoTopUp || [];
    report.videoTopUp.push({
      segmentId: seg.id,
      url: injectedUrl,
      source: clip.source || 'pool',
      motionRelevancePassed,
    });
    if (isYouTubeMotionCandidate(clip)) {
      report.motionSelectedYouTube = (report.motionSelectedYouTube || 0) + 1;
    } else {
      report.motionSelectedNonYouTube = (report.motionSelectedNonYouTube || 0) + 1;
    }
    return true;
  };

  // Volume first: round-robin the finite pool across the thinnest segments. Each
  // queue slot retries candidates until one injects, so a failed direct-URL probe
  // cannot silently consume that segment's padding opportunity.
  let motionPaddingInjected = 0;
  for (let qi = 0; qi < paddingQueue.length && need > 0 && vi < picks.length; qi += 1) {
    const seg = segments.find((item) => item.id === paddingQueue[qi]);
    if (!seg) continue;
    while (vi < picks.length) {
      const clip = picks[vi];
      vi += 1;
      if (await injectClip(seg, clip, `p${qi}`)) {
        motionPaddingInjected += 1;
        break;
      }
    }
  }
  report.motionPaddingInjected = motionPaddingInjected;

  for (const seg of segments) {
    if (need <= 0) break;
    const segVideos = (project.media || []).filter(
      (a) => a.segmentId === seg.id && a.type === 'video' && !isJunkDemoVideoUrl(a.url || ''),
    ).length;
    const isIntro = seg.type === 'intro' || seg === segments[0];
    // Per-seg floor; variety drain below fills up to the key-mode motion target.
    const perSegTarget = isIntro ? targets.introTarget : targets.perSegTarget;
    const want = Math.max(0, perSegTarget - segVideos);
    // Retry candidates until one injects — a cookieless YT/TT skip must not burn
    // the slot when Archive/direct still remain later in `picks`.
    for (let i = 0; i < want && need > 0 && vi < picks.length; i += 1) {
      while (vi < picks.length) {
        const clip = picks[vi];
        vi += 1;
        if (await injectClip(seg, clip, `s${i}`)) break;
      }
    }
  }

  // Variety drain: keep assigning unused pool URLs until minVideos is met.
  let drainGuard = 0;
  while (need > 0 && vi < picks.length && drainGuard < picks.length * 2) {
    drainGuard += 1;
    const clip = picks[vi];
    vi += 1;
    if (!clip?.url || used.has(motionUrlKey(clip.url))) continue;
    const seg = segments[drainGuard % segments.length];
    await injectClip(seg, clip, `d${drainGuard}`);
  }
}

function isJunkHarvestUrl(url) {
  const u = (url || '').toLowerCase();
  return (
    isUnsafeMediaUrl(u)
    || isJunkWebVolumeStillUrl(u)
    || u.includes('gravatar.com/avatar')
    || /tse\d\.mm\.bing\.net\/th[/?]id=ovp/i.test(u)
    || u.includes('/th/id/ovp.')
    || u.includes('th?id=ovp.')
  );
}

async function tryKeepVideoAsset(asset, devServer, sanitized, report, { loopMode = false } = {}) {
  const downloadUrl = resolveVideoDownloadUrl(asset, devServer);
  const proxied = isProxiedClipUrl(downloadUrl) || isProxiedClipUrl(asset.url || '');
  const direct = isDirectVideoUrl(asset.url) && !proxied;
  const reasonPrefix = loopMode ? 'loop mode: ' : '';

  // Browser harvest also wraps YouTube in /api/download-clip. Without cookies those
  // clips are bot-gated and used to become clickbait thumbnail stills — reject here
  // the same way CLI inject does, so Archive/direct/web non-YT can fill the slots.
  const proxyCandidate = {
    url: downloadUrl || asset.url,
    sourceUrl: asset.sourceUrl || '',
  };
  const unreliable = unreliableWebProxyInjectReason(proxyCandidate);
  if (unreliable) {
    report.dropped.push({ url: asset.url, reason: unreliable });
    return false;
  }

  if (proxied) {
    sanitized.push({ ...asset, type: 'video', url: downloadUrl });
    report.keptVideo.push({ url: asset.url, reason: `${reasonPrefix}proxy clip (no probe)` });
    return true;
  }

  if (direct) {
    const clipOk = await canFetch(downloadUrl, { timeoutMs: 15000, minBytes: 2048, expectVideo: true });
    if (clipOk) {
      sanitized.push({ ...asset, type: 'video', url: downloadUrl });
      report.keptVideo.push({ url: asset.url, reason: `${reasonPrefix}direct video URL` });
      return true;
    }
  }

  const clipOk = await canFetch(downloadUrl, { timeoutMs: 15000, minBytes: 2048, expectVideo: true });
  if (clipOk) {
    const keepUrl = downloadUrl.startsWith('http') ? downloadUrl : asset.url;
    sanitized.push({ ...asset, type: 'video', url: keepUrl });
    report.keptVideo.push({ url: asset.url, reason: `${reasonPrefix}clip probe OK` });
    return true;
  }
  return false;
}

async function sanitizeRealHarvestMedia(project, devServer, outDir, options = {}) {
  const loopMode = options.loopMode === true;
  const minPerSegment = Math.max(2, options.minAssetsPerSegment || 6);
  const report = {
    before: project.media?.length || 0,
    after: 0,
    convertedVideoToImage: [],
    dropped: [],
    keptVideo: [],
    phashDropped: [],
    relevanceDropped: [],
    qualityStillRejected: [],
    qualityStillDemoted: [],
    volumePass: true,
    harvestQuality: null,
    visionStockChecked: 0,
    visionStockRejected: 0,
    visionStockUnverified: 0,
    visionStockUnverifiedSkipped: 0,
    visionStockUnverifiedAllowed: 0,
    visionStockUnverifiedMax: resolveVisionUnverifiedMax(),
    visionStockBudgetSkipped: 0,
    visionStockBudgetSoftAdmitted: 0,
  };
  if (!project.media?.length) {
    const volume = evaluateHarvestVolume(project, minPerSegment);
    report.harvestQuality = volume;
    report.volumePass = false;
    report.after = 0;
    writeFileSync(join(outDir, 'harvest-quality.json'), JSON.stringify(volume, null, 2));
    writeFileSync(join(outDir, 'media-sanitization.json'), JSON.stringify(report, null, 2));
    return report;
  }

  const sanitized = [];
  const fallbackImage = project.topicContext?.thumbnailUrl || null;
  const qualityCache = new Map();

  for (const asset of project.media) {
    // Videos: junk-check clip URL only (thumbs are often placeholders).
    if (asset.type === 'video') {
      if (isJunkHarvestUrl(asset.url) && !isProxiedClipUrl(asset.url) && !asset.url?.includes('youtube.com') && !asset.url?.includes('youtu.be') && !asset.url?.includes('vimeo.com')) {
        report.dropped.push({ url: asset.url, reason: 'junk URL (avatar/video-thumb placeholder)' });
        continue;
      }
    } else if (isJunkHarvestUrl(asset.url) || isJunkHarvestUrl(asset.thumbnailUrl)) {
      report.dropped.push({ url: asset.url, reason: 'junk URL (avatar/video-thumb placeholder)' });
      continue;
    }

    if (asset.type !== 'video') {
      if (isYouTubeThumbnailStill(asset.url) || isYouTubeThumbnailStill(asset.thumbnailUrl)) {
        report.dropped.push({ url: asset.url, reason: 'youtube-thumbnail-still' });
        continue;
      }
      sanitized.push(asset);
      continue;
    }

    if (await tryKeepVideoAsset(asset, devServer, sanitized, report, { loopMode })) {
      continue;
    }

    // Failed YouTube/TikTok must not launder into ytimg Ken Burns B-roll.
    const keepFailReason = unreliableWebProxyInjectReason({
      url: asset.url,
      sourceUrl: asset.sourceUrl || '',
    });
    if (keepFailReason) {
      // Already recorded in tryKeepVideoAsset when proxied; avoid duplicate noise.
      if (!report.dropped.some((d) => d.url === asset.url && d.reason === keepFailReason)) {
        report.dropped.push({ url: asset.url, reason: keepFailReason });
      }
      continue;
    }

    const thumbnailUrl = asset.thumbnailUrl || (isImageLikeUrl(asset.url) ? asset.url : '') || giphyStillUrl(asset);
    if (isYouTubeThumbnailStill(thumbnailUrl)) {
      report.dropped.push({ url: asset.url, thumbnailUrl, reason: 'youtube-thumbnail-still' });
      continue;
    }
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

    let qualityAsset = urlOk.get(asset.url);
    if (qualityAsset === undefined) {
      qualityAsset = await sanitizeStillQuality(asset, report, { devServer, cache: qualityCache });
      urlOk.set(asset.url, qualityAsset || null);
    }
    if (qualityAsset) {
      validated.push(qualityAsset);
      reserve.push(qualityAsset);
    } else {
      const qualityReason = report.qualityStillRejected?.at(-1)?.reason;
      report.dropped.push({
        url: asset.url,
        reason: qualityReason ? `still quality rejected: ${qualityReason}` : 'image fetch failed pre-render',
      });
    }
  }

  const relevance = filterAssetsByRelevance(validated, project, {
    minScore: isEvalColdMode() ? 0.28 : 0.25,
  });
  report.relevanceDropped = relevance.dropped;
  report.beforeRelevance = validated.length;
  report.afterRelevance = relevance.media.length;

  const deduped = dedupeMediaByPHash(relevance.media, {
    devServer,
    maxDistance: loopMode ? 9 : VISUAL_DUP_MAX_DISTANCE,
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
    const videoRich =
      (project.media || []).filter((a) => a.type === 'video').length >=
      Math.max(6, (project.script || []).length * 2);
    if (!videoRich) {
      await topUpHarvestVolume(project, devServer, minPerSegment, report, { qualityCache });
    } else {
      report.imageVolumeSkipped = 'motion-rich';
    }
    await topUpVideoBroll(project, report, options.mediaOffset || 0, devServer, {
      faceSeek: options.faceSeek === true,
      preferBright: options.preferBright === true,
      cutIntervalSec: options.cutIntervalSec,
      minAssetsPerSegment: minPerSegment,
    });
    injectCyberStockStills(project, report, options.mediaOffset || 0);
    // Re-gate after top-up (can reintroduce junk).
    stripJunkDemoVideos(project, report);
    await sanitizeProjectStillQuality(project, report, { devServer, cache: qualityCache });
    const beforeTopUpRelevance = [...(project.media || [])];
    const paddingBeforeFilter = beforeTopUpRelevance.filter(isVolumePaddingAsset);
    const afterTopUp = filterAssetsByRelevance(beforeTopUpRelevance, project, {
      minScore: isEvalColdMode() ? 0.26 : 0.22,
    });
    report.relevanceStrictDroppedAfterTopUp = afterTopUp.dropped;
    project.media = mergeVolumePadding(afterTopUp.media, paddingBeforeFilter, project);

    // Fresh web motion already cleared a topic-family evidence gate before inject.
    // The generic pass above can score it below threshold only because assignment
    // moved it to a segment with different essay keywords. Preserve that run-local
    // proof after the junk/unsafe gates have had their chance to remove the clip.
    const restoredMotion = restoreMotionRelevancePassed(
      project.media,
      beforeTopUpRelevance,
      report.videoTopUp || [],
    );
    project.media = restoredMotion.media;

    const beforeKeys = new Set(beforeTopUpRelevance.map(segmentMotionKey));
    const finalKeys = new Set(project.media.map(segmentMotionKey));
    report.relevanceDroppedAfterTopUp = afterTopUp.dropped.filter(
      (asset) => !finalKeys.has(segmentMotionKey(asset)),
    );
    const strictKeys = new Set(afterTopUp.media.map(segmentMotionKey));
    report.motionRelevanceProtectedAfterTopUp = beforeTopUpRelevance
      .filter((asset) => (
        !strictKeys.has(segmentMotionKey(asset))
        && finalKeys.has(segmentMotionKey(asset))
        && (report.videoTopUp || []).some((entry) => (
          entry.motionRelevancePassed === true
          && segmentMotionKey(entry) === segmentMotionKey(asset)
        ))
      ))
      .map((asset) => ({
        segmentId: asset.segmentId,
        url: asset.url,
      }));
    report.motionRelevanceDroppedAfterTopUp = (report.videoTopUp || [])
      .filter((entry) => (
        entry.motionRelevancePassed === true
        && beforeKeys.has(segmentMotionKey(entry))
        && !finalKeys.has(segmentMotionKey(entry))
      ));
    report.beforeRelevanceAfterTopUp = beforeTopUpRelevance.length;
    report.strictAfterRelevanceAfterTopUp = afterTopUp.media.length;
    report.afterTopUp = project.media.length;
    report.afterRelevanceAfterTopUp = project.media.length;
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

  // Shell wrappers source .env.local; a bare `npm run generate:video` does not,
  // and without AUTOTUBE_API_KEY every /api/* call is rejected by the gate.
  applyEnvLocalToProcess();

  const fixState = { ...(options.fixState || {}) };
  if (fixState.reHarvestMedia && !fixState.keepBestMedia) {
    fixState.harvestNonce = (fixState.harvestNonce || 0) + 1;
    fixState.reHarvestMedia = false;
    if (!options.quiet) {
      console.log(`   🔄 Re-harvest requested — nonce ${fixState.harvestNonce}, offset ${fixState.mediaOffset || 0}`);
    }
  } else if (fixState.reHarvestMedia && fixState.keepBestMedia) {
    fixState.reHarvestMedia = false;
  }
  const priorUrls = loadLastProjectUrls(process.cwd());
  // Re-harvest (nonce > 0): don't seed excludes from stale last-project.
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

  // Fast path: polish a frozen cut.
  if (keepBestEnabled() && fixState.keepBestMedia && fixState.frozenProjectPath) {
    const frozen = loadFrozenProject(fixState.frozenProjectPath);
    if (frozen?.media?.length && frozen?.script?.length) {
      log(`\n🎬 Generate (keep-best polish): ${topic}`);
      log(`   Mode: reuse frozen media — skip Playwright harvest`);
      log(`   Out: ${outDir}\n`);
      const project = JSON.parse(JSON.stringify(frozen));
      project.topic = topic;
      project.title = topic;
      patchProjectForLoop(project, topic, { ...fixState, forceRealStock: false }, { skipMediaPatch: true });
      const timelineReport = validateEditTimeline(project, {
        cutIntervalSec: fixState.cutIntervalSec ?? 1.25,
        maxReusePerUrl: fixState.maxReusePerUrl ?? 1,
      });
      if (timelineReport.rebuilt) {
        log(`   📐 Rebuilt editTimeline (${timelineReport.clipCount} clips)`);
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
      const keepBestRenderTimeoutMs = Math.max(
        600_000,
        Number(process.env.AUTOTUBE_RENDER_TIMEOUT_MS) || 3_600_000,
      );
      const render = spawnSync('node', ['server-render.mjs', mp4Out], {
        cwd: root,
        env: renderEnv,
        encoding: 'utf8',
        timeout: keepBestRenderTimeoutMs,
        stdio: ['inherit', 'pipe', 'pipe'],
      });
      writeFileSync(join(outDir, 'render.log'), `${render.stdout || ''}\n${render.stderr || ''}`);
      if (render.status !== 0) {
        return {
          ok: false,
          error: `keep-best render failed: ${spawnSyncFailureReason(render, 'server-render')}`,
          topic,
          outDir,
          fixState,
        };
      }
      const finalMp4 = mp4Out.replace('.mp4', '-final.mp4');
      const produced = existsSync(finalMp4) ? finalMp4 : existsSync(mp4Out) ? mp4Out : null;
      if (!produced) {
        return { ok: false, error: 'keep-best: No output MP4', topic, outDir, fixState };
      }
      const gate = validateOutput(produced, 'Render output', { minBytes: MIN_RENDER_OUTPUT_BYTES });
      if (!gate.valid) {
        return { ok: false, error: gate.error, topic, outDir, fixState };
      }
      copyFileSync(produced, join(outDir, 'FINAL-VIDEO-final.mp4'));
      spawnSync('node', ['scripts/finalize-ship-artifacts.mjs'], {
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
      const probe = spawnSync(
        'ffprobe',
        ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', produced],
        { encoding: 'utf8' },
      );
      const durationSec = probe.stdout ? parseFloat(probe.stdout.trim()) : NaN;
      return {
        ok: true,
        topic,
        outDir,
        projectPath,
        videoPath: produced,
        canonicalPath: join(root, 'test-recordings', 'FINAL-VIDEO-final.mp4'),
        scriptText,
        durationSec,
        sizeMb: (gate.size / 1024 / 1024).toFixed(2),
        realHarvest: false,
        fixState,
        renderEnv: renderSnapshot,
        harvestNonce: fixState.harvestNonce || 0,
        keepBestPolish: true,
      };
    }
    log('⚠️ Keep-best frozen project unusable — falling back to full generate');
    fixState.keepBestMedia = false;
  }

  if (!(await checkDevServer(devServer))) {
    return { ok: false, error: `Dev server not reachable at ${devServer}`, topic, outDir };
  }

  log(`\n🎬 Generate: ${topic}`);
  log(`   Mode: ${realHarvest ? 'real harvest (OpenRouter + live search)' : 'mock (CI/e2e)'}`);
  if (realHarvest) log(`   Loop: ${loopMinAssets} assets/segment, ≤75s target`);
  log(`   Out: ${outDir}\n`);

  const pexelsKey = resolvePexelsKey();
  const pixabayKey = resolvePixabayKey();

  const harvestStorage = harvestSessionStoragePayload(harvestCtx);
  const autotubeApiKey = resolveAutotubeApiKey();
  if (!autotubeApiKey && !options.quiet) {
    console.log('   ⚠️  No AUTOTUBE_API_KEY / VITE_AUTOTUBE_API_KEY — /api/* calls will be rejected by the API gate');
  }

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

  const browserEvents = [];
  const recordBrowserEvent = (type, detail) => {
    browserEvents.push({ at: new Date().toISOString(), type, detail: String(detail).slice(0, 1000) });
    if (browserEvents.length > 200) browserEvents.shift();
  };
  const isBrowserDisconnectError = (err) => {
    const msg = err instanceof Error ? err.message : String(err || '');
    return /browser.*(closed|disconnected)|target page.*closed|has been closed|crashed|detached|websocket is not open|protocol error/i.test(
      msg,
    );
  };

  let browser = null;
  let browserContext = null;
  let page = null;
  let browserRelaunchUsed = false;

  const configureBrowserContext = async (targetContext) => {
    await targetContext.addInitScript(
      ({ key, autotubeKey, minAssets, pexels, pixabay, rawFirst, harvestStorage: hs }) => {
        localStorage.setItem('autotube_onboarding_seen', 'true');
        localStorage.removeItem('autotube_project');
        sessionStorage.setItem(
          'autotube_config_session',
          JSON.stringify({
            openRouterKey: key,
            autotubeApiKey: autotubeKey || '',
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
        autotubeKey: autotubeApiKey,
        minAssets: loopMinAssets,
        pexels: pexelsKey,
        pixabay: pixabayKey,
        rawFirst: realHarvest,
        harvestStorage,
      },
    );
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

  const launchBrowserSession = async (reason = 'initial launch') => {
    if (browserContext) await browserContext.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    browserContext = null;
    page = null;

    browser = await chromium.launch({
      headless: true,
      args: launchArgs,
      env: { ...process.env, CHROME_HEADLESS: '1' },
    });
    const launchedBrowser = browser;
    recordBrowserEvent('browser.launch', reason);
    launchedBrowser.once('disconnected', () => {
      if (browser === launchedBrowser) recordBrowserEvent('browser.disconnected', reason);
    });
    browserContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await configureBrowserContext(browserContext);
    page = await browserContext.newPage();
    await wireBrowserPage(page);
  };

  const relaunchBrowserOnce = async (reason) => {
    if (browserRelaunchUsed) {
      throw new Error(`BROWSER_DISCONNECTED: ${reason} (browser relaunch already used)`);
    }
    browserRelaunchUsed = true;
    recordBrowserEvent('browser.relaunch', reason);
    log('⚠ Chromium disconnected — relaunching browser once…');
    await launchBrowserSession(`relaunch after ${reason}`);
  };

  const withBrowserRelaunchOnDisconnect = async (label, operation) => {
    try {
      return await operation();
    } catch (err) {
      if (!isBrowserDisconnectError(err) && browser?.isConnected()) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      await relaunchBrowserOnce(`${label}: ${msg}`);
      try {
        return await operation();
      } catch (err2) {
        if (isBrowserDisconnectError(err2) || !browser?.isConnected()) {
          const msg2 = err2 instanceof Error ? err2.message : String(err2);
          throw new Error(`BROWSER_DISCONNECTED: ${label}: ${msg2} (after browser relaunch)`);
        }
        throw err2;
      }
    }
  };

  await launchBrowserSession();

  const gotoDevServer = async () => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await page.addInitScript(() => {
          try {
            localStorage.setItem('autotube_onboarding_seen', 'true');
          } catch {
            /* ignore */
          }
        });
        await page.goto(devServer, { waitUntil: 'domcontentloaded', timeout: 90_000 });
        await dismissOnboarding(page);
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        recordBrowserEvent('goto.error', `attempt ${attempt}: ${msg}`);
        const browserDisconnected = isBrowserDisconnectError(err) && !browser?.isConnected();
        const recoverable = /crashed|closed|detached/i.test(msg) || browserDisconnected;
        if (!recoverable || attempt === 3) throw err;
        if (browserDisconnected) {
          await relaunchBrowserOnce(`goto attempt ${attempt}: ${msg}`);
          continue;
        }
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

  // Soft wait for Source Media; extend to hard cap while script gen is active.
  const scriptTimeoutMs = realHarvest ? 240_000 : 180_000;
  const scriptHardCapMs = realHarvest ? 600_000 : 240_000;
  const mediaTimeoutMs = realHarvest ? 1_200_000 : 300_000;
  const narrationTimeoutMs = realHarvest ? 900_000 : 600_000;

  try {
    await withBrowserRelaunchOnDisconnect('initial script launch', async () => {
      // networkidle hangs when dev server is serving long harvest API streams
      await gotoDevServer();
      await dismissOnboarding(page);

      await fillTopicInput(page, topic);
      await page.getByTestId('duration-select').selectOption('3').catch(() => {});
      await dismissOnboarding(page);
      await page.getByTestId('generate-script-only').click();
    });
    log('⏳ Script (live OpenRouter — fast loop mode)...');

    const sourceMediaBtn = () =>
      page.getByTestId('source-media-next').or(page.getByRole('button', { name: /Source Media/i }));

    const triggerScriptGeneration = async () => {
      await dismissOnboarding(page);
      await fillTopicInput(page, topic);
      await page.getByTestId('duration-select').selectOption('3').catch(() => {});
      await dismissOnboarding(page);
      await page.getByTestId('generate-script-only').click();
    };

    const scriptWaitStartedAt = Date.now();
    let lastGeneratingAt = 0;
    let everSawGenerating = false;
    const noteScriptSignals = (prog = {}) => {
      if (prog.generating || prog.pct != null) {
        lastGeneratingAt = Date.now();
        everSawGenerating = true;
      }
    };
    const waitForScriptReady = async (timeoutMs, { hardCapMs = timeoutMs, waitStartedAt = scriptWaitStartedAt } = {}) => {
      const startedAt = Date.now();
      const hardDeadline = waitStartedAt + hardCapMs;
      let deadline = startedAt + timeoutMs;
      let lastDump = 0;
      let lastActivityAt = startedAt;
      let prev = { scriptLen: 0, pct: null, rotating: '' };
      while (Date.now() < deadline && Date.now() < hardDeadline) {
        await dismissOnboarding(page);
        if (await sourceMediaBtn().isVisible({ timeout: 2_000 }).catch(() => false)) return { ok: true };
        const snap = await readProjectSnapshot(page);
        const prog = await readScriptProgress(page);
        noteScriptSignals(prog);
        const body = await page
          .evaluate(() => document.body?.innerText?.slice(0, 800) || '')
          .catch(() => '');

        if (isScriptComplete(snap)) {
          await page.waitForTimeout(1500);
          if (await sourceMediaBtn().isVisible({ timeout: 5_000 }).catch(() => false)) return { ok: true };
        }
        // Hard key errors abort; soft LLM/JSON failures recover via reclick.
        if (/API key required|OpenRouter API key/i.test(body)) {
          throw new Error(
            `SCRIPT_UI_ERROR: ${body.slice(0, 200)} (scriptLen=${snap.scriptLen}, scriptStep=${snap.scriptStep || 'unknown'})`,
          );
        }
        const idleMs = lastGeneratingAt > 0 ? Date.now() - lastGeneratingAt : 0;
        if (
          /AI script generation failed|Script generation failed|Unexpected end of JSON|invalid structure|empty response/i.test(
            body,
          )
          && Number(snap.scriptLen) === 0
        ) {
          return {
            ok: false,
            active: false,
            onTopicStep: prog.onTopicStep || true,
            recentlyGenerating: false,
            everSawGenerating: true,
            idleMs: Math.max(idleMs, 90_000),
            bodyText: body,
            scriptLen: 0,
            deadAfterStart: true,
          };
        }

        // Extend soft deadline only while generation is actively progressing.
        const active = detectScriptActivity(snap, prog);
        if (active && sawFreshActivity(snap, prog, prev)) {
          lastActivityAt = Date.now();
        }
        prev = { scriptLen: snap.scriptLen, pct: prog.pct, rotating: prog.rotating };
        if (active && Date.now() - lastActivityAt < 120_000) {
          deadline = Math.min(hardDeadline, Date.now() + 60_000);
        }
        if (
          isDeadScriptGeneration({
            everSawGenerating,
            active,
            idleMs,
            bodyText: body,
            scriptLen: snap.scriptLen,
          })
        ) {
          return {
            ok: false,
            active: false,
            onTopicStep: prog.onTopicStep,
            recentlyGenerating: false,
            everSawGenerating,
            idleMs,
            bodyText: body,
            scriptLen: snap.scriptLen,
            deadAfterStart: true,
          };
        }

        if (Date.now() - lastDump > 60_000) {
          lastDump = Date.now();
          log(
            `   …still waiting for Source Media (${Math.round((deadline - Date.now()) / 1000)}s soft / ${Math.round((hardDeadline - Date.now()) / 1000)}s hard left, scriptLen=${snap.scriptLen}, scriptStep=${snap.scriptStep || (prog.generating ? 'generating' : 'idle')}, pct=${prog.pct ?? 'n/a'})`,
          );
        }
        await page.waitForTimeout(3_000);
      }
      const snap = await readProjectSnapshot(page);
      const prog = await readScriptProgress(page);
      noteScriptSignals(prog);
      const body = await page
        .evaluate(() => document.body?.innerText?.slice(0, 800) || '')
        .catch(() => '');
      const idleMs = lastGeneratingAt > 0 ? Date.now() - lastGeneratingAt : 0;
      return {
        ok: false,
        active: detectScriptActivity(snap, prog),
        onTopicStep: prog.onTopicStep,
        recentlyGenerating: lastGeneratingAt > 0 && Date.now() - lastGeneratingAt < 300_000,
        everSawGenerating,
        idleMs,
        bodyText: body,
        scriptLen: snap.scriptLen,
        deadAfterStart: isDeadScriptGeneration({
          everSawGenerating,
          active: detectScriptActivity(snap, prog),
          idleMs,
          bodyText: body,
          scriptLen: snap.scriptLen,
        }),
      };
    };

    try {
      let result = await waitForScriptReady(scriptTimeoutMs, { hardCapMs: scriptHardCapMs, waitStartedAt: scriptWaitStartedAt });
      if (!result.ok) {
        const action = chooseRecoveryAction(result);
        if (action === 'grace') {
          log('⚠ Script still generating at soft cap — granting grace window (no reload)…');
          result = await waitForScriptReady(120_000, { hardCapMs: scriptHardCapMs, waitStartedAt: scriptWaitStartedAt });
        } else if (action === 'reclick') {
          log(
            result.deadAfterStart || result.everSawGenerating
              ? '⚠ Script generation died after start — re-triggering (no hard-cap burn)…'
              : '⚠ Still on topic step — re-triggering script generation (click likely missed)…',
          );
          await triggerScriptGeneration();
          everSawGenerating = false;
          lastGeneratingAt = Date.now();
          result = await waitForScriptReady(scriptTimeoutMs, { hardCapMs: scriptHardCapMs, waitStartedAt: Date.now() });
        } else {
          log('⚠ Script wait stuck — reloading once and retrying…');
          await gotoDevServer();
          await triggerScriptGeneration();
          everSawGenerating = false;
          lastGeneratingAt = Date.now();
          result = await waitForScriptReady(scriptTimeoutMs, { hardCapMs: scriptHardCapMs, waitStartedAt: Date.now() });
        }
      }
      if (!result.ok) {
        const action2 = chooseRecoveryAction(result);
        if (action2 === 'reclick' || result.deadAfterStart) {
          log('⚠ Script wait final fallback — one more generate click + wait…');
          await triggerScriptGeneration();
          everSawGenerating = false;
          lastGeneratingAt = Date.now();
          result = await waitForScriptReady(180_000, { hardCapMs: scriptHardCapMs, waitStartedAt: Date.now() });
        } else if (action2 === 'grace') {
          log('⚠ Script still pending — final grace wait…');
          result = await waitForScriptReady(180_000, { hardCapMs: scriptHardCapMs, waitStartedAt: scriptWaitStartedAt });
        } else {
          log('⚠ Script wait final fallback — one more generate click + wait…');
          await triggerScriptGeneration();
          lastGeneratingAt = Date.now();
          result = await waitForScriptReady(180_000, { hardCapMs: scriptHardCapMs, waitStartedAt: Date.now() });
        }
      }
      if (!result.ok) {
        const snap = await readProjectSnapshot(page);
        throw new Error(
          `SCRIPT_TIMEOUT: Source Media never appeared after ${Math.round(scriptHardCapMs / 1000)}s (scriptLen=${snap.scriptLen}, scriptStep=${snap.scriptStep || 'idle'}, projectStatus=${snap.projectStatus || 'unknown'})`,
        );
      }
    } catch (err) {
      writeFileSync(join(outDir, 'browser-events.json'), JSON.stringify(browserEvents, null, 2));
      const snap = await readProjectSnapshot(page);
      const uiState = await page.evaluate(() => ({
        bodyText: document.body?.innerText?.slice(0, 4000) || '',
        projectRawLength: localStorage.getItem('autotube_project')?.length || 0,
        configRawLength: sessionStorage.getItem('autotube_config_session')?.length || 0,
        fastMode: sessionStorage.getItem('autotube_loop_fast_mode'),
      })).catch((e) => ({ error: e.message }));
      writeFileSync(
        join(outDir, 'ui-state-on-script-timeout.json'),
        JSON.stringify({ ...uiState, projectSnapshot: snap }, null, 2),
      );
      await page.screenshot({ path: join(outDir, 'script-timeout.png'), fullPage: true }).catch(() => {});
      throw err;
    }

    await dismissOnboarding(page);
    await sourceMediaBtn().click({ timeout: 30_000 }).catch(async () => {
      await dismissOnboarding(page);
      await sourceMediaBtn().click({ force: true, timeout: 30_000 });
    });
    log(`⏳ Media (${realHarvest ? 'live harvest' : 'mock harvest'})...`);

    const mediaNextBtn = () =>
      page.getByTestId('media-step-next').or(page.getByRole('button', { name: /Prepare Narration/i }));

    const mediaDeadline = Date.now() + mediaTimeoutMs;
    const mediaStart = Date.now();
    let mediaReady = false;
    let lastLogMin = -1;
    // The "Prepare Narration" button (media-step-next) only mounts when the store
    // sets stepStatuses.media === 'complete', but during a live harvest that flag
    // can flip while assets are still being written, flashing the button early.
    // Require BOTH the visible button AND a persisted stepStatuses.media==='complete'
    // snapshot with real assets, then re-confirm after a short settle, so we never
    // advance into narration on a stale/premature button while harvest is running.
    const confirmMediaComplete = async () => {
      let btnVisible = false;
      try {
        btnVisible = await mediaNextBtn().isVisible({ timeout: 10_000 });
      } catch {
        btnVisible = false;
      }
      if (!btnVisible) return false;
      const snap = await readProjectSnapshot(page);
      if (snap.mediaStep !== 'complete' || !(snap.mediaLen > 0)) return false;
      await page.waitForTimeout(1500);
      const stillVisible = await mediaNextBtn().isVisible({ timeout: 5_000 }).catch(() => false);
      if (!stillVisible) return false;
      const snap2 = await readProjectSnapshot(page);
      return snap2.mediaStep === 'complete' && snap2.mediaLen > 0;
    };
    while (Date.now() < mediaDeadline) {
      await dismissOnboarding(page);
      if (await confirmMediaComplete()) {
        mediaReady = true;
        break;
      }
      const elapsedMin = Math.floor((Date.now() - mediaStart) / 60000);
      if (elapsedMin >= 1 && elapsedMin !== lastLogMin && elapsedMin % 2 === 0) {
        lastLogMin = elapsedMin;
        const msg = await page.locator('[data-testid="dynamic-message"]').textContent().catch(() => '');
        const snap = await readProjectSnapshot(page);
        log(
          `   … ${elapsedMin}min media harvest (${snap.mediaLen} assets / ${snap.scriptLen} segments, mediaStep=${snap.mediaStep || 'processing'}) ${msg ? `— ${msg.slice(0, 60)}` : ''}`,
        );
      }
      await page.waitForTimeout(5000);
    }

    if (!mediaReady) {
      writeFileSync(join(outDir, 'browser-events.json'), JSON.stringify(browserEvents, null, 2));
      const snap = await readProjectSnapshot(page);
      const uiState = await page.evaluate(() => ({
        bodyText: document.body?.innerText?.slice(0, 4000) || '',
        projectRawLength: localStorage.getItem('autotube_project')?.length || 0,
        stepText: document.body?.innerText?.match(/Step \d+ — \w+/)?.[0] || '',
      })).catch((e) => ({ error: e.message }));
      writeFileSync(
        join(outDir, 'ui-state-on-media-timeout.json'),
        JSON.stringify({ ...uiState, projectSnapshot: snap }, null, 2),
      );
      await page.screenshot({ path: join(outDir, 'media-timeout.png'), fullPage: true }).catch(() => {});
      throw new Error(
        `MEDIA_TIMEOUT: Prepare Narration never appeared after ${Math.round(mediaTimeoutMs / 60000)}min (mediaLen=${snap.mediaLen}, mediaStep=${snap.mediaStep || 'unknown'})`,
      );
    }

    // Sanitize + volume-gate a harvested project. Mutates gateProject.media in
    // place. Returns { ok: true } on pass, or { ok: false, result } carrying the
    // HARVEST_VOLUME_FAIL payload (re-harvest fixState already stamped) on fail.
    const runHarvestVolumeGate = async (gateProject) => {
      const mediaReport = await sanitizeRealHarvestMedia(gateProject, devServer, outDir, {
        loopMode: true,
        minAssetsPerSegment: fixState.minAssetsPerSegment || 6,
        mediaOffset: fixState.mediaOffset || 0,
        faceSeek: fixState.faceSeekBroll === true || fixState.harvestVideoFirst !== false,
        preferBright: fixState.preferBrightBroll === true,
        cutIntervalSec: fixState.cutIntervalSec ?? 0.85,
      });
      log(`🧹 Media sanitize: ${mediaReport.before} → ${mediaReport.after} assets (${mediaReport.convertedVideoToImage.length} video→image, ${mediaReport.dropped.length} dropped)`);
      if (Number.isFinite(mediaReport.beforeRelevance)) {
        log(
          `   🎯 Initial relevance (before top-up): ${mediaReport.beforeRelevance} → ${mediaReport.afterRelevance} assets (removed ${mediaReport.relevanceDropped?.length || 0})`,
        );
      }
      if (mediaReport.videoTopUp?.length) {
        log(`   🎬 Video top-up: +${mediaReport.videoTopUp.length} motion clips`);
      }
      if (mediaReport.motionKeyMode) {
        log(`   🔑 ${formatMotionPathLog(mediaReport)}`);
      }
      if (
        mediaReport.pexelsFetched
        || mediaReport.pixabayFetched
        || mediaReport.archiveLiveFetched
        || mediaReport.bingWebVideoFetched
        || mediaReport.googleWebVideoFetched
        || mediaReport.ddgWebVideoFetched
      ) {
        log(
          `   📡 Live motion sources: bing=${mediaReport.bingWebVideoFetched || 0} google=${mediaReport.googleWebVideoFetched || 0} ddg=${mediaReport.ddgWebVideoFetched || 0} archive=${mediaReport.archiveLiveFetched || 0} pexels=${mediaReport.pexelsFetched || 0} pixabay=${mediaReport.pixabayFetched || 0}`,
        );
      }
      if (mediaReport.junkVideoDropped?.length) {
        log(`   🗑️ Junk demo videos dropped: ${mediaReport.junkVideoDropped.length}`);
      }
      if (mediaReport.junkStockSkipped) {
        log(`   🚫 Junk stock skipped: ${mediaReport.junkStockSkipped}`);
      }
      if (mediaReport.visionStockChecked || mediaReport.visionStockUnverified || mediaReport.visionStockBudgetSkipped) {
        log(
          `   👁️ Stock vision: checked=${mediaReport.visionStockChecked || 0} rejected=${mediaReport.visionStockRejected || 0} unverified=${mediaReport.visionStockUnverified || 0} skipped-unverified=${mediaReport.visionStockUnverifiedSkipped || 0} max-unverified=${mediaReport.visionStockUnverifiedMax || 0} skipped-over-budget=${mediaReport.visionStockBudgetSkipped || 0} soft-admitted=${mediaReport.visionStockBudgetSoftAdmitted || 0}`,
        );
      }
      if (mediaReport.cyberStockInjected) {
        log(`   🛡️ Cyber stock stills: +${mediaReport.cyberStockInjected}`);
      }
      if (mediaReport.cyberStockSkipped) {
        log(`   🎬 Cyber stills: ${mediaReport.cyberStockSkipped}`);
      }
      if (Number.isFinite(mediaReport.beforeRelevanceAfterTopUp)) {
        log(
          `   🎯 Post-top-up relevance: ${mediaReport.beforeRelevanceAfterTopUp} → ${mediaReport.afterRelevanceAfterTopUp} assets`
          + ` (strict=${mediaReport.strictAfterRelevanceAfterTopUp}, removed=${mediaReport.relevanceDroppedAfterTopUp?.length || 0}, protected-motion=${mediaReport.motionRelevanceProtectedAfterTopUp?.length || 0})`,
        );
      }
      if (mediaReport.motionPaddingRequested) {
        log(
          `   ⚖️ Motion distribution: padded=${mediaReport.motionPaddingInjected || 0}/${mediaReport.motionPaddingRequested}`
          + ` (pool-available=${mediaReport.motionPaddingAvailable || 0}, target=${fixState.minAssetsPerSegment || 6}/segment)`,
        );
      }
      if (mediaReport.motionCandidatesSeen || mediaReport.motionPoolSize) {
        log(`   📉 ${formatMotionDropFunnel(mediaReport)}`);
      }
      if (mediaReport.phashDropped?.length) {
        log(`   🔍 pHash dedup: removed ${mediaReport.phashDropped.length} visually similar assets`);
      }
      if (mediaReport.volumePass === false) {
        const soft = evaluateHarvestVolumeWithSoftPass(mediaReport, gateProject);
        if (soft.pass) {
          log(`   ⚠️ Volume ${soft.reason}`);
          mediaReport.volumePass = true;
          mediaReport.volumeSoftPass = soft.reason;
        } else {
          // Last chance: pad thin segments, then re-check soft-pass.
          await topUpHarvestVolume(gateProject, devServer, Math.max(4, Math.floor(loopMinAssets * 0.75)), mediaReport);
          const volume2 = evaluateHarvestVolume(gateProject, loopMinAssets);
          mediaReport.harvestQuality = volume2;
          mediaReport.volumePass = volume2.pass;
          const airlineSoftFail = volume2.pass ? airlineSoftPassMotionFailureReason(gateProject) : null;
          const soft2 = airlineSoftFail
            ? { pass: false, reason: airlineSoftFail }
            : volume2.pass
              ? { pass: true, reason: 'volume-hard-pass-after-repad' }
              : evaluateHarvestVolumeWithSoftPass(mediaReport, gateProject);
          if (soft2.pass) {
            log(`   ⚠️ Volume recovered after stock re-pad (${soft2.reason})`);
            mediaReport.volumePass = true;
            mediaReport.volumeSoftPass = soft2.reason;
          } else {
            const failing = mediaReport.harvestQuality?.failing || [];
            const minPer = mediaReport.harvestQuality?.minPerSegment ?? loopMinAssets;
            const detail = failing.map((f) => `${f.title}: ${f.count}/${f.need}`).join('; ');
            const totalMedia = gateProject.media?.length ?? 0;
            const segCount = gateProject.script?.length ?? 0;
            const failureSummary = failing.length
              ? `${failing.length}/${segCount} segments below ${minPer} assets`
              : `soft-pass rejected after re-pad (${soft2.reason || soft.reason || 'none'})`;
            fixState.reHarvestMedia = true;
            fixState.mediaOffset = (fixState.mediaOffset || 0) + 2;
            return {
              ok: false,
              result: {
                ok: false,
                error: `HARVEST_VOLUME_FAIL: ${failureSummary} — ${detail || 'no segment detail'} (total=${totalMedia}, soft-pass=${soft2.reason || soft.reason || 'none'})`,
                harvestQualityFail: true,
                topic,
                outDir,
                fixState,
              },
            };
          }
        }
      }
      return { ok: true };
    };

    // ── Harvest volume gate BEFORE narration ─────────────────────────────────
    // Sanitize + volume-check the harvested media NOW, while still on the media
    // step, so a thin/doomed harvest fails fast (re-harvest) instead of paying
    // for a full narration pass and only then throwing HARVEST_VOLUME_FAIL after
    // "⏳ Narration..." — which also left us hanging in the narration CTA poll.
    // Media is fully determined at media-complete; narration/AI-edit never mutate
    // it, so the vetted media is reused after narration (see preSanitizedMedia).
    let preSanitizedMedia = null;
    if (realHarvest && !fixState.keepBestMedia) {
      const gateProject = await page.evaluate(() => {
        const raw = localStorage.getItem('autotube_project');
        if (!raw) return null;
        return JSON.parse(raw).project ?? null;
      });
      if (!gateProject || !(gateProject.media?.length > 0)) {
        return { ok: false, error: 'No harvested media before narration', topic, outDir, fixState };
      }
      const gate = await runHarvestVolumeGate(gateProject);
      // Fail before narration: do NOT click Prepare Narration / enter the
      // narration CTA poll on a harvest we already know is too thin.
      if (!gate.ok) return gate.result;
      preSanitizedMedia = gateProject.media;
    }

    await clickPipelineButton(page, mediaNextBtn());
    log('⏳ Narration...');
    await dismissOnboarding(page);
    // Interactive UI may land on narration review (Continue to AI Edit). Loop
    // fast-mode auto-advances to AI Edit (skip-ai-edit). Accept either.
    // Fail fast if Chromium dies mid-TTS — otherwise waits can sit until 15min.
    const continueAi = page
      .getByTestId('continue-to-ai-edit-button')
      .or(page.getByRole('button', { name: /Continue to AI Edit/i }))
      .first();
    const skipAi = page
      .getByTestId('skip-ai-edit-button')
      .or(page.locator('button:has-text("Skip AI Edit")'))
      .first();
    const raceBrowserDisconnect = async (phase, task) => {
      const targetBrowser = browser;
      if (!targetBrowser?.isConnected()) throw new Error(`BROWSER_DISCONNECTED: Chromium gone before ${phase}`);
      let onDisconnect = null;
      const disconnected = new Promise((_, reject) => {
        onDisconnect = () => reject(new Error(`BROWSER_DISCONNECTED: Chromium died during ${phase}`));
        targetBrowser.once('disconnected', onDisconnect);
      });
      try {
        const activeTask = typeof task === 'function' ? task() : task;
        return await Promise.race([activeTask, disconnected]);
      } catch (err) {
        if (isBrowserDisconnectError(err) && !targetBrowser?.isConnected()) {
          throw new Error(`BROWSER_DISCONNECTED: Chromium died during ${phase}`);
        }
        throw err;
      } finally {
        if (onDisconnect) {
          targetBrowser.off?.('disconnected', onDisconnect);
          targetBrowser.removeListener?.('disconnected', onDisconnect);
        }
      }
    };
    const captureNarrationHang = async (reason) => {
      writeFileSync(join(outDir, 'browser-events.json'), JSON.stringify(browserEvents, null, 2));
      const browserAlive = browser?.isConnected();
      const snap = browserAlive
        ? await readProjectSnapshot(page)
        : { error: 'Chromium disconnected before narration hang capture' };
      const uiState = browserAlive
        ? await page.evaluate(() => ({
            bodyText: document.body?.innerText?.slice(0, 4000) || '',
            projectRawLength: localStorage.getItem('autotube_project')?.length || 0,
            stepText: document.body?.innerText?.match(/Step \d+ — \w+/)?.[0] || '',
          })).catch((e) => ({ error: e.message }))
        : { error: 'Chromium disconnected before narration hang capture' };
      writeFileSync(
        join(outDir, 'ui-state-on-narration-timeout.json'),
        JSON.stringify({ reason, ...uiState, projectSnapshot: snap }, null, 2),
      );
      if (browser?.isConnected()) {
        await page
          .screenshot({ path: join(outDir, 'narration-timeout.png'), fullPage: true, timeout: 5_000 })
          .catch(() => {});
      }
    };
    const pollNarrationCta = async ({ timeoutMs, skipOnly = false, label = 'narration CTAs' } = {}) => {
      const deadline = Date.now() + timeoutMs;
      let lastLog = 0;
      const rethrowNarrationDisconnect = (err) => {
        if (!browser?.isConnected() || isBrowserDisconnectError(err)) {
          throw new Error('BROWSER_DISCONNECTED: Chromium gone during narration CTA polling');
        }
      };
      while (Date.now() < deadline) {
        if (!browser?.isConnected()) {
          throw new Error('BROWSER_DISCONNECTED: Chromium gone during narration CTA polling');
        }
        try {
          await dismissOnboarding(page);
        } catch (err) {
          rethrowNarrationDisconnect(err);
        }
        try {
          if (!skipOnly && (await continueAi.isVisible({ timeout: 500 }))) return 'continue';
        } catch (err) {
          rethrowNarrationDisconnect(err);
        }
        try {
          if (await skipAi.isVisible({ timeout: 500 })) return 'skip';
        } catch (err) {
          rethrowNarrationDisconnect(err);
        }
        // Loop-fast may have advanced past both buttons into assembly already.
        let step = null;
        try {
          step = await page.evaluate(() => {
            try {
              const raw = localStorage.getItem('autotube_project');
              if (!raw) return null;
              const parsed = JSON.parse(raw);
              return {
                step: parsed?.currentStep || parsed?.project?.status || null,
                narr: (parsed?.project?.narration || []).length,
              };
            } catch {
              return null;
            }
          });
        } catch (err) {
          rethrowNarrationDisconnect(err);
        }
        let skipAiCount = 0;
        try {
          skipAiCount = await page.getByTestId('skip-ai-edit-button').count();
        } catch (err) {
          rethrowNarrationDisconnect(err);
        }
        if (step?.narr > 0 && skipAiCount === 0) {
          // Narration clips exist but AI-edit UI missed — force skip via store path.
          let forced = null;
          try {
            forced = await page.evaluate(() => {
              const btn = document.querySelector('[data-testid="skip-ai-edit-button"]');
              if (btn instanceof HTMLElement) {
                btn.click();
                return 'clicked';
              }
              return null;
            });
          } catch (err) {
            rethrowNarrationDisconnect(err);
          }
          if (forced) return 'skip';
        }
        if (Date.now() - lastLog > 60_000) {
          lastLog = Date.now();
          log(
            `   …still waiting for ${label} (${Math.round((deadline - Date.now()) / 1000)}s left, narration=${step?.narr ?? 'n/a'}, step=${step?.step || 'unknown'})`,
          );
        }
        try {
          await page.waitForTimeout(1_000);
        } catch (err) {
          rethrowNarrationDisconnect(err);
        }
      }
      await captureNarrationHang(label);
      throw new Error(`NARRATION_TIMEOUT: no ${skipOnly ? 'skip' : 'continue/skip'} CTA after ${Math.round(timeoutMs / 60000)}min`);
    };
    const which = await raceBrowserDisconnect(
      'narration CTA polling',
      () => pollNarrationCta({ timeoutMs: narrationTimeoutMs, label: 'narration CTAs' }),
    );
    if (which === 'continue' || (await continueAi.isVisible().catch(() => false))) {
      await dismissOnboarding(page);
      await raceBrowserDisconnect('continue-to-AI-edit click', () => clickPipelineButton(page, continueAi, { timeout: 60_000 }));
      await raceBrowserDisconnect('post-continue settle', () => page.waitForTimeout(500));
      await raceBrowserDisconnect(
        'AI edit skip CTA polling',
        () => pollNarrationCta({
          timeoutMs: Math.max(120_000, narrationTimeoutMs / 4),
          skipOnly: true,
          label: 'AI edit skip CTA',
        }),
      );
    }
    if (fixState.rewriteScript === true) {
      log('✍️ rewriteScript lever ON — running AI edit instead of skip');
      const runAi = page.getByTestId('run-ai-edit-button').or(page.locator('button:has-text("Run AI Edit")').first());
      const hasRunAi = await runAi.isVisible().catch(() => false);
      if (hasRunAi) {
        await raceBrowserDisconnect(
          'run AI edit click',
          () => clickPipelineButton(page, runAi, { timeout: Math.max(180_000, narrationTimeoutMs / 2) }),
        );
        await raceBrowserDisconnect('post-AI-edit settle', () => page.waitForTimeout(2000));
      } else {
        await dismissOnboarding(page);
        await raceBrowserDisconnect('skip AI edit fallback click', () => clickPipelineButton(page, skipAi, { timeout: 60_000 }));
      }
      fixState.rewriteScript = false;
    } else {
      await dismissOnboarding(page);
      await raceBrowserDisconnect('skip AI edit click', () => clickPipelineButton(page, skipAi, { timeout: 60_000 }));
    }
    await page.waitForTimeout(500);

    const project = await page.evaluate(() => {
      const raw = localStorage.getItem('autotube_project');
      if (!raw) return null;
      return JSON.parse(raw).project ?? null;
    });

    if (!project || !(project.media?.length > 0)) {
      return { ok: false, error: 'No project with media after pipeline', topic, outDir };
    }

    await browser.close().catch(() => {});
    browser = null;

    // Keep-best: reuse frozen media/timeline.
    const frozenPath = fixState.frozenProjectPath;
    if (keepBestEnabled() && fixState.keepBestMedia && frozenPath) {
      const frozen = loadFrozenProject(frozenPath);
      const applied = applyFrozenMediaToProject(project, frozen);
      if (applied.ok) {
        const orphanSuffix = applied.orphanMediaCount
          ? `; dropped ${applied.orphanMediaCount} orphan frozen assets`
          : '';
        log(
          `❄️ Keep-best polish: reused ${applied.mediaCount} frozen assets / ${applied.timelineCount} timeline cuts (no reharvest lottery)${orphanSuffix}`,
        );
        fixState.reHarvestMedia = false;
      } else {
        log('⚠️ Keep-best: frozen project missing/invalid — falling back to live media');
        fixState.keepBestMedia = false;
      }
    }

    patchProjectForLoop(project, topic, fixState, {
      skipMediaPatch: realHarvest || fixState.keepBestMedia === true,
    });
    if (realHarvest && !fixState.keepBestMedia) {
      if (preSanitizedMedia) {
        // Media was already sanitized + volume-gated on the media step (before
        // narration). Narration/AI-edit never mutate media, so reuse that vetted
        // media instead of re-running the whole sanitize here.
        project.media = preSanitizedMedia;
      } else {
        // No pre-narration gate ran (keep-best fell back to live media after
        // narration): sanitize + volume-gate the live media now.
        const gate = await runHarvestVolumeGate(project);
        if (!gate.ok) return gate.result;
      }
      // Re-assert shock hook + overlay after media mutations.
      patchProjectForLoop(project, topic, { ...fixState, forceRealStock: false }, { skipMediaPatch: true });
    }
    const timelineReport = validateEditTimeline(project, {
      cutIntervalSec: fixState.cutIntervalSec ?? 1.25,
      maxReusePerUrl: fixState.maxReusePerUrl ?? 1,
    });
    if (timelineReport.rebuilt) {
      log(`   📐 Rebuilt editTimeline (${timelineReport.clipCount} clips, ${timelineReport.staleCount} stale IDs)`);
    }
    if (process.env.AUTOTUBE_BROLL_PLACEMENT === '1' && fixState.brollPlacement !== false && !fixState.keepBestMedia) {
      try {
        const { buildBrollPlacementPlanNode } = await import('./broll-placement.mjs');
        const plan = await buildBrollPlacementPlanNode(project, {
          cutIntervalSec: fixState.cutIntervalSec ?? 1.25,
          apiKey: resolveOpenRouterKey(),
        });
        if (plan.entries?.length) {
          project.editTimeline = plan.entries;
          log(`   📐 B-roll placement (${plan.source}): ${plan.entries.length} clips`);
        }
      } catch (e) {
        log(`   ⚠️ B-roll placement skipped: ${e.message}`);
      }
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

    const renderEnv = buildRenderEnvFromFixState(fixState, { devServer, projectPath });
    const renderSnapshot = renderEnvJournalSnapshot(fixState);
    writeFileSync(join(outDir, 'render-env.json'), JSON.stringify(renderSnapshot, null, 2));

    const renderTimeoutMs = Math.max(
      600_000,
      Number(process.env.AUTOTUBE_RENDER_TIMEOUT_MS) || 3_600_000,
    );
    const render = spawnSync('node', ['server-render.mjs', mp4Out], {
      cwd: root,
      env: renderEnv,
      encoding: 'utf8',
      timeout: renderTimeoutMs,
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    const renderLogPath = join(root, 'test-recordings', 'latest-render.log');
    const renderLogBody = `${render.stdout || ''}\n${render.stderr || ''}`;
    writeFileSync(renderLogPath, renderLogBody);
    writeFileSync(join(outDir, 'render.log'), renderLogBody);

    if (render.status !== 0) {
      return { ok: false, error: spawnSyncFailureReason(render, 'server-render'), topic, outDir, projectPath };
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
