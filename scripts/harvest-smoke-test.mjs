#!/usr/bin/env node
/**
 * Harvest layer smoke test — search APIs + download-clip (no full browser harvest).
 * Run: node scripts/harvest-smoke-test.mjs
 * Requires dev server with /api routes (npm run loop:serve).
 */
import { spawnSync } from 'node:child_process';
import { checkDevServer } from './lib/generate-full-video.mjs';
import { applyEnvLocalToProcess } from './lib/railway-prod-env.mjs';

applyEnvLocalToProcess();

const DEV = process.env.DEV_SERVER_URL || 'http://localhost:5173';
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

async function fetchJson(path, timeoutMs = 30_000) {
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

async function main() {
  console.log('\n🔬 Harvest smoke test\n');

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

  // Search: DDG images
  {
    const q = encodeURIComponent('louvre museum heist paris editorial');
    const { res, data } = await fetchJson(`/api/search-duckduckgo-images?q=${q}`);
    const rows = Array.isArray(data) ? data : (data.results || []);
    if (res.status === 200 && rows.length >= 10) {
      pass(`DDG images (${rows.length} results)`);
    } else {
      fail('DDG images', `status ${res.status}, count ${rows.length}`);
    }
  }

  // Search: Bing videos
  {
    const q = encodeURIComponent('louvre heist footage');
    const { res, data } = await fetchJson(`/api/search-bing-videos?q=${q}`);
    const rows = Array.isArray(data) ? data : (data.results || []);
    const tiktok = rows.filter((r) => /tiktok/i.test(r.url || r.content || '')).length;
    if (res.status === 200 && rows.length >= 5) {
      pass(`Bing videos (${rows.length} results, tiktok=${tiktok})`);
    } else {
      fail('Bing videos', `status ${res.status}, count ${rows.length}`);
    }
  }

  // download-clip: TikTok blocked
  {
    const clipUrl = `${DEV}/api/download-clip?url=${encodeURIComponent(TIKTOK_SAMPLE)}&duration=6`;
    const res = await fetch(clipUrl, { signal: AbortSignal.timeout(15_000) });
    if (res.status === 403) {
      pass('TikTok download-clip blocked (403)');
    } else {
      fail('TikTok download-clip blocked', `expected 403, got ${res.status}`);
    }
  }

  // download-clip: Pexels direct fetch
  {
    const clipUrl = `${DEV}/api/download-clip?url=${encodeURIComponent(PEXELS_SAMPLE)}&duration=6`;
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
