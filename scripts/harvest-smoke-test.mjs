#!/usr/bin/env node
/**
 * Harvest layer smoke test — all search APIs + download-clip (no full browser harvest).
 * Run: npm run harvest:smoke
 * Requires dev server with /api routes (npm run loop:serve).
 */
import { spawnSync } from 'node:child_process';
import { checkDevServer } from './lib/generate-full-video.mjs';
import { applyEnvLocalToProcess } from './lib/railway-prod-env.mjs';

applyEnvLocalToProcess();

const DEV = process.env.DEV_SERVER_URL || 'http://localhost:5173';
const QUERY = 'louvre museum paris';
const Q = encodeURIComponent(QUERY);
const PEXELS_SAMPLE =
  'https://videos.pexels.com/video-files/7431862/7431862-uhd_4096_2160_30fps.mp4';
const TIKTOK_SAMPLE = 'https://www.tiktok.com/@user/video/7642540102207524126';

let passed = 0;
let failed = 0;
let warned = 0;

function pass(label) {
  console.log(`  ✅ ${label}`);
  passed += 1;
}

function fail(label, detail = '') {
  console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`);
  failed += 1;
}

function warn(label, detail = '') {
  console.log(`  ⚠️  ${label}${detail ? ` — ${detail}` : ''}`);
  warned += 1;
}

async function fetchJson(path, timeoutMs = 45_000) {
  const res = await fetch(`${DEV}${path}`, { signal: AbortSignal.timeout(timeoutMs) });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { res, data };
}

function extractRows(data) {
  return Array.isArray(data) ? data : (data?.results || []);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {string} label
 * @param {string} path - e.g. /api/search-bing-images
 * @param {number} minCount
 * @param {{ optional?: boolean, validate?: (rows: unknown[]) => string | null }} [opts]
 */
async function testSearch(label, path, minCount, opts = {}) {
  const { optional = false, validate, timeoutMs = 45_000 } = opts;
  let res;
  let data;
  try {
    ({ res, data } = await fetchJson(`${path}?q=${Q}`, timeoutMs));
  } catch (e) {
    const detail = e.cause?.message || e.message;
    if (optional) warn(label, detail);
    else fail(label, detail);
    return [];
  }

  const rows = extractRows(data);
  const validationErr = validate?.(rows) ?? null;

  if (res.status !== 200) {
    const detail = `status ${res.status}, count ${rows.length}`;
    if (optional) warn(label, detail);
    else fail(label, detail);
    return rows;
  }

  if (validationErr) {
    if (optional) warn(label, validationErr);
    else fail(label, validationErr);
    return rows;
  }

  if (rows.length >= minCount) {
    pass(`${label} (${rows.length} results)`);
  } else if (optional) {
    warn(label, `count ${rows.length} < ${minCount} (topic-dependent)`);
  } else {
    fail(label, `status ${res.status}, count ${rows.length} < ${minCount}`);
  }
  await sleep(300);
  return rows;
}

async function main() {
  console.log('\n🔬 Harvest smoke test\n');
  console.log(`Query: "${QUERY}"\n`);

  if (!(await checkDevServer(DEV))) {
    fail('Dev server reachable', `start: npm run loop:serve (${DEV})`);
    console.log(`\nResults: ${passed} passed, ${failed} failed, ${warned} warnings\n`);
    process.exit(1);
  }
  pass(`Dev server reachable (${DEV})`);

  const ytdlp = spawnSync('which', ['yt-dlp'], { encoding: 'utf8' });
  if (ytdlp.status === 0) {
    pass('yt-dlp on PATH');
  } else {
    warn('yt-dlp missing — YouTube clip proxy will fail', 'pip install yt-dlp');
  }

  console.log('\n— Image search —');
  await testSearch('Bing images', '/api/search-bing-images', 5);
  await testSearch('Google images', '/api/search-google-images', 3);
  await testSearch('Yandex images', '/api/search-yandex-images', 3);
  await testSearch('DuckDuckGo images', '/api/search-duckduckgo-images', 10);
  await testSearch('Flickr', '/api/search-flickr', 5);
  await testSearch('Unsplash', '/api/search-unsplash', 3);
  await testSearch('Hybrid', '/api/search-hybrid', 10, { optional: true, timeoutMs: 90_000 });
  await testSearch('Archive', '/api/search-archive', 1);
  await testSearch('NASA', '/api/search-nasa', 1, { optional: true });
  await testSearch('GovPress', '/api/search-govpress', 1, { optional: true });

  console.log('\n— News —');
  await testSearch('Bing news', '/api/search-bing-news', 3);

  console.log('\n— Video search —');
  await testSearch('Bing videos', '/api/search-bing-videos', 5, {
    validate(rows) {
      const tiktok = rows.filter((r) => /tiktok/i.test(r.url || r.content || '')).length;
      if (tiktok > 0) return `${tiktok} tiktok result(s) — expected none`;
      return null;
    },
  });
  const noTikTokInRows = (rows) => {
    const tiktok = rows.filter((r) =>
      /tiktok/i.test(`${r.url || ''} ${r.sourceUrl || ''} ${r.content || ''}`),
    ).length;
    if (tiktok > 0) return `${tiktok} tiktok result(s) — expected none`;
    return null;
  };
  await testSearch('Google videos', '/api/search-google-videos', 5, { validate: noTikTokInRows });
  await testSearch('Videos (aggregate)', '/api/search-videos', 10, { validate: noTikTokInRows });
  await testSearch('Vimeo', '/api/search-vimeo', 1);
  await testSearch('Dailymotion', '/api/search-dailymotion', 3);
  await testSearch('Giphy', '/api/search-giphy', 5);

  console.log('\n— Download clip —');
  // download-clip: TikTok blocked
  {
    const clipUrl = `${DEV}/api/download-clip?url=${encodeURIComponent(TIKTOK_SAMPLE)}&duration=6`;
    try {
      const res = await fetch(clipUrl, { signal: AbortSignal.timeout(15_000) });
      if (res.status === 403) {
        pass('TikTok download-clip blocked (403)');
      } else {
        fail('TikTok download-clip blocked', `expected 403, got ${res.status}`);
      }
    } catch (e) {
      fail('TikTok download-clip blocked', e.cause?.message || e.message);
    }
  }

  // download-clip: Pexels direct fetch
  {
    const clipUrl = `${DEV}/api/download-clip?url=${encodeURIComponent(PEXELS_SAMPLE)}&duration=6`;
    try {
      const t0 = Date.now();
      const res = await fetch(clipUrl, { signal: AbortSignal.timeout(180_000) });
      const buf = Buffer.from(await res.arrayBuffer());
      const ms = Date.now() - t0;
      const ct = res.headers.get('content-type') || '';
      if (res.status === 200 && buf.length > 50_000 && ct.includes('video')) {
        pass(`Pexels download-clip (${(buf.length / 1024).toFixed(0)} KB in ${(ms / 1000).toFixed(1)}s)`);
      } else if (res.status === 200 && buf.length > 50_000) {
        pass(`Pexels download-clip (${(buf.length / 1024).toFixed(0)} KB, type ${ct})`);
      } else {
        const err = buf.length < 300 ? buf.toString() : `bytes=${buf.length}`;
        fail('Pexels download-clip', `status ${res.status}, ${err}`);
      }
    } catch (e) {
      fail('Pexels download-clip', e.cause?.message || e.message);
    }
  }

  // download-clip: YouTube (optional — often bot-blocked on headless servers)
  {
    const yt = 'https://www.youtube.com/watch?v=jNQXAC9IVRw';
    const clipUrl = `${DEV}/api/download-clip?url=${encodeURIComponent(yt)}&duration=6`;
    try {
      const res = await fetch(clipUrl, { signal: AbortSignal.timeout(120_000) });
      const buf = Buffer.from(await res.arrayBuffer());
      if (res.status === 200 && buf.length > 50_000) {
        pass(`YouTube download-clip (${(buf.length / 1024).toFixed(0)} KB)`);
      } else {
        const detail = buf.length < 300 ? buf.toString() : `status ${res.status}`;
        warn('YouTube download-clip', `${detail} (expected on prod with cookies)`);
      }
    } catch (e) {
      warn('YouTube download-clip', e.message);
    }
  }

  console.log(`\n════════════════════════════════`);
  console.log(`Results: ${passed} passed, ${failed} failed, ${warned} warnings`);
  if (failed > 0) {
    console.log('Harvest smoke FAILED\n');
    process.exit(1);
  }
  console.log('Harvest smoke OK ✅\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
