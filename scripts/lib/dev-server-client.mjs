/**
 * Dev-server HTTP helpers — attach AUTOTUBE_API_KEY when the Vite middleware requires it.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

export function resolveDevApiKey() {
  return (
    process.env.AUTOTUBE_API_KEY?.trim() ||
    process.env.VITE_AUTOTUBE_API_KEY?.trim() ||
    ''
  );
}

export function devApiHeaders(extra = {}) {
  const headers = {
    'user-agent': 'Mozilla/5.0 AutoTube/1.0',
    ...extra,
  };
  const key = resolveDevApiKey();
  if (key) headers['X-API-Key'] = key;
  return headers;
}

export async function devFetch(url, options = {}) {
  return fetch(url, {
    ...options,
    headers: devApiHeaders(options.headers || {}),
  });
}

function cachePathForUrl(url, cacheDir, isVideo, extHint = null) {
  const hash = createHash('sha1').update(url).digest('hex').slice(0, 16);
  let ext = extHint || '.jpg';
  if (!extHint) {
    try {
      ext = extname(new URL(url, 'http://local').pathname) || ext;
    } catch {
      /* ignore */
    }
  }
  if (isVideo) ext = '.mp4';
  if (!/^\.(jpe?g|png|webp|gif|mp4|webm|mov)$/i.test(ext)) ext = isVideo ? '.mp4' : '.jpg';
  return join(cacheDir, `${hash}${ext}`);
}

/** @returns {string|null} normalized ext including dot */
function imageExtFromBuffer(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8) return '.jpg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return '.png';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return '.gif';
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) return '.webp';
  return null;
}

async function fetchBytes(url, { expectVideo = false, timeoutMs = 60_000 } = {}) {
  const res = await devFetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 500) return null;
  const contentType = res.headers.get('content-type') || '';
  if (expectVideo && !/video|octet-stream/i.test(contentType) && buf.length > 12) {
    const sig = buf.slice(4, 8).toString('ascii');
    if (sig !== 'ftyp' && !buf.slice(0, 4).toString('hex').includes('1a45')) return null;
  }
  if (!expectVideo && /text\/html/i.test(contentType)) return null;
  if (!expectVideo) {
    const ext = imageExtFromBuffer(buf);
    if (!ext) return null;
    return { buf, ext };
  }
  return { buf, ext: '.mp4' };
}

/**
 * Download an asset to cacheDir and return local path (or null).
 * @param {object} asset
 * @param {string} devServer
 * @param {string} cacheDir
 */
export async function cacheAssetToDir(asset, devServer, cacheDir) {
  mkdirSync(cacheDir, { recursive: true });

  if (asset.localPath) {
    const abs = resolve(asset.localPath);
    if (existsSync(abs) && readFileSync(abs).length > 500) return abs;
  }

  const rawUrl = asset.url || '';
  const isVideo = asset.type === 'video' || /\.(mp4|webm|mov)/i.test(rawUrl);
  if (rawUrl && !rawUrl.startsWith('http') && !rawUrl.startsWith('/api/')) {
    const abs = resolve(rawUrl);
    return existsSync(abs) ? abs : null;
  }

  const candidates = [];
  if (rawUrl.startsWith('/api/') || rawUrl.includes('/api/download-clip') || rawUrl.includes('/api/proxy-image')) {
    const apiUrl = rawUrl.startsWith('http') ? rawUrl : `${devServer}${rawUrl.startsWith('/') ? '' : '/'}${rawUrl}`;
    candidates.push(apiUrl);
  } else if (rawUrl.startsWith('http')) {
    if (isVideo) {
      candidates.push(`${devServer}/api/download-clip?url=${encodeURIComponent(rawUrl)}`);
      candidates.push(rawUrl);
    }
    candidates.push(`${devServer}/api/proxy-image?url=${encodeURIComponent(rawUrl)}`);
    if (!isVideo) {
      candidates.push(
        `https://images.weserv.nl/?url=${encodeURIComponent(rawUrl)}&w=1280&h=720&fit=cover&output=jpg`,
      );
    }
    candidates.push(rawUrl);
  }

  for (const fetchUrl of candidates) {
    if (!fetchUrl.startsWith('http')) continue;
    const cached = cachePathForUrl(fetchUrl, cacheDir, isVideo);
    if (existsSync(cached) && readFileSync(cached).length > 500) {
      const buf = readFileSync(cached);
      if (isVideo || imageExtFromBuffer(buf)) return cached;
      try {
        unlinkSync(cached);
      } catch {
        /* ignore */
      }
    }
    try {
      const fetched = await fetchBytes(fetchUrl, {
        expectVideo: isVideo,
        timeoutMs: isVideo || fetchUrl.includes('/api/download-clip') ? 120_000 : 45_000,
      });
      if (!fetched) continue;
      const cached = cachePathForUrl(fetchUrl, cacheDir, isVideo, fetched.ext);
      writeFileSync(cached, fetched.buf);
      return cached;
    } catch {
      /* try next */
    }
  }
  return null;
}

/**
 * Cache all project media; sets asset.localPath on success.
 */
export async function cacheProjectMedia(project, devServer, cacheDir) {
  mkdirSync(cacheDir, { recursive: true });
  const report = { cached: 0, failed: 0, paths: [] };
  for (const asset of project.media || []) {
    const path = await cacheAssetToDir(asset, devServer, cacheDir);
    if (path) {
      asset.localPath = path;
      report.cached += 1;
      report.paths.push(path);
    } else {
      report.failed += 1;
    }
  }
  return report;
}
