#!/usr/bin/env node
/** Quick probe of all /api/search-* endpoints */
import { applyEnvLocalToProcess } from './lib/railway-prod-env.mjs';
applyEnvLocalToProcess();

const DEV = process.env.DEV_SERVER_URL || 'http://localhost:5173';
const Q = encodeURIComponent('louvre museum paris');

const ENDPOINTS = [
  '/api/search-bing-images',
  '/api/search-google-images',
  '/api/search-yandex-images',
  '/api/search-duckduckgo-images',
  '/api/search-flickr',
  '/api/search-unsplash',
  '/api/search-hybrid',
  '/api/search-archive',
  '/api/search-nasa',
  '/api/search-govpress',
  '/api/search-bing-news',
  '/api/search-bing-videos',
  '/api/search-google-videos',
  '/api/search-videos',
  '/api/search-vimeo',
  '/api/search-dailymotion',
  '/api/search-giphy',
];

async function probe(path) {
  const t0 = Date.now();
  try {
    const res = await fetch(`${DEV}${path}?q=${Q}`, { signal: AbortSignal.timeout(45_000) });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text.slice(0, 80); }
    const rows = Array.isArray(data) ? data : (data?.results || []);
    const ms = Date.now() - t0;
    const status = res.status === 200 && rows.length >= 1 ? 'OK' : res.status === 200 ? 'THIN' : 'FAIL';
    console.log(`${status.padEnd(5)} ${path.padEnd(32)} status=${res.status} count=${rows.length} ${ms}ms`);
    if (status !== 'OK' && typeof data === 'object' && data?.error) console.log(`       error: ${data.error}`);
    return { path, status, http: res.status, count: rows.length, ms };
  } catch (e) {
    console.log(`ERR   ${path.padEnd(32)} ${e.message}`);
    return { path, status: 'ERR', http: 0, count: 0, ms: Date.now() - t0, error: e.message };
  }
}

console.log(`\nProbing ${DEV} q="louvre museum paris"\n`);
const results = [];
for (const ep of ENDPOINTS) {
  results.push(await probe(ep));
}
const ok = results.filter(r => r.status === 'OK').length;
const thin = results.filter(r => r.status === 'THIN').length;
const fail = results.filter(r => r.status === 'FAIL' || r.status === 'ERR').length;
console.log(`\nSummary: ${ok} OK, ${thin} THIN, ${fail} FAIL/ERR\n`);
