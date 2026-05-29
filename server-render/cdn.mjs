/**
 * CDN Module — Local HTTP Server for Cached Media Assets
 *
 * Serves cached media (images, audio, video clips) via a local HTTP server
 * with an LRU eviction cache to reduce disk I/O and improve render throughput.
 */

import { createServer } from 'http';
import { readFileSync, existsSync, statSync } from 'fs';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const MIME_TYPES = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

/**
 * LRU Cache for media files.
 * Stores file contents in memory with size limits and eviction.
 */
class LRUMediaCache {
  constructor(maxSizeBytes = 256 * 1024 * 1024) { // 256MB default
    this.maxSizeBytes = maxSizeBytes;
    this.currentSize = 0;
    this.cache = new Map(); // key → { data, mimeType, size, lastAccess }
  }

  get(key) {
    if (!this.cache.has(key)) return null;
    const entry = this.cache.get(key);
    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, { ...entry, lastAccess: Date.now() });
    return entry;
  }

  set(key, data, mimeType) {
    const size = Buffer.byteLength(data);

    // Evict if necessary
    while (this.currentSize + size > this.maxSizeBytes && this.cache.size > 0) {
      const oldestKey = this.cache.keys().next().value;
      const oldest = this.cache.get(oldestKey);
      this.currentSize -= oldest.size;
      this.cache.delete(oldestKey);
    }

    // Don't cache items larger than 50% of max
    if (size > this.maxSizeBytes * 0.5) return false;

    this.cache.set(key, { data, mimeType, size, lastAccess: Date.now() });
    this.currentSize += size;
    return true;
  }

  has(key) {
    return this.cache.has(key);
  }

  getStats() {
    return {
      entries: this.cache.size,
      sizeBytes: this.currentSize,
      sizeMB: Math.round(this.currentSize / (1024 * 1024) * 10) / 10,
      maxSizeMB: Math.round(this.maxSizeBytes / (1024 * 1024)),
      hitRate: this._hits / (this._hits + this._misses || 1),
    };
  }

  _hits = 0;
  _misses = 0;
}

/**
 * Create and start a local CDN server for media assets.
 *
 * @param {Object} options - { port, cacheSizeMB, mediaRoot }
 * @returns {{ server, port, cache, baseUrl, stop }}
 */
export function createMediaCDN(options = {}) {
  const port = options.port || 0; // auto-assign if 0
  const cacheSizeBytes = (options.cacheSizeMB || 256) * 1024 * 1024;
  const mediaRoot = options.mediaRoot || join(__dirname, '..', '..');

  const cache = new LRUMediaCache(cacheSizeBytes);

  const server = createServer((req, res) => {
    const url = new URL(req.url, `http://localhost`);

    // Health check
    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', cache: cache.getStats() }));
      return;
    }

    // Cache stats
    if (url.pathname === '/stats') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(cache.getStats(), null, 2));
      return;
    }

    // Serve media file
    const filePath = url.searchParams.get('path') || url.pathname.slice(1);
    if (!filePath) {
      res.writeHead(400);
      res.end('Missing path parameter');
      return;
    }

    // Check LRU cache first
    const cacheKey = filePath;
    const cached = cache.get(cacheKey);
    if (cached) {
      cache._hits++;
      res.writeHead(200, {
        'Content-Type': cached.mimeType,
        'Content-Length': cached.size,
        'X-Cache': 'HIT',
      });
      res.end(cached.data);
      return;
    }

    cache._misses++;

    // Read from disk
    const fullPath = filePath.startsWith('/') ? filePath : join(mediaRoot, filePath);
    if (!existsSync(fullPath)) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    try {
      const stats = statSync(fullPath);
      const data = readFileSync(fullPath);
      const ext = extname(fullPath).toLowerCase();
      const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

      // Cache the file
      cache.set(cacheKey, data, mimeType);

      res.writeHead(200, {
        'Content-Type': mimeType,
        'Content-Length': stats.size,
        'X-Cache': 'MISS',
      });
      res.end(data);
    } catch (err) {
      res.writeHead(500);
      res.end(`Error: ${err.message}`);
    }
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const actualPort = server.address().port;
      const baseUrl = `http://127.0.0.1:${actualPort}`;

      console.log(`  🌐 Media CDN server started: ${baseUrl}`);
      console.log(`     Cache: ${options.cacheSizeMB || 256}MB LRU`);

      resolve({
        server,
        port: actualPort,
        cache,
        baseUrl,
        stop: () => {
          server.close();
          console.log('  🌐 Media CDN server stopped');
        },
      });
    });
  });
}

/**
 * Create a CDN-backed fetch function that uses the local cache.
 */
export function createCachedFetcher(cdnBaseUrl) {
  return async function cachedFetch(url) {
    const cacheUrl = `${cdnBaseUrl}/?path=${encodeURIComponent(url)}`;
    const response = await fetch(cacheUrl);
    if (!response.ok) throw new Error(`CDN fetch failed: ${response.status}`);
    const arrayBuf = await response.arrayBuffer();
    return Buffer.from(arrayBuf);
  };
}
