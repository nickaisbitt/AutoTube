#!/usr/bin/env node
/**
 * Cache Memory Leak Fix Script
 * 
 * Applies comprehensive fixes to server-render.mjs to address Critical Issue C6
 */

import { readFileSync, writeFileSync } from 'fs';

const inputFile = 'server-render.mjs.backup';
const outputFile = 'server-render.mjs';

console.log('Reading original file...');
let content = readFileSync(inputFile, 'utf8');

console.log('Applying cache memory leak fixes...\n');

// Fix 1: Enhance LRUCache class with metrics and eviction callback
console.log('1. Enhancing LRUCache class...');
const oldLRUCache = `// ── Proper LRU Cache Implementation ────────────────────────────────────────
/**
 * Least Recently Used (LRU) cache that evicts the least recently accessed item
 * when capacity is reached. Uses a Map internally where iteration order reflects
 * access order (most recently used items are at the end).
 */
class LRUCache {
  constructor(maxSize) {
    this.maxSize = maxSize;
    this._cache = new Map();
  }

  /**
   * Get a value from the cache. If found, moves the entry to the end
   * (marking it as most recently used). Returns undefined if not found.
   */
  get(key) {
    if (!this._cache.has(key)) {
      return undefined;
    }
    // Move to end (most recently used)
    const value = this._cache.get(key);
    this._cache.delete(key);
    this._cache.set(key, value);
    return value;
  }

  /**
   * Set a value in the cache. If the key already exists, it is moved to the end.
   * If the cache is at capacity, the oldest entry (front of Map) is evicted first.
   */
  set(key, value) {
    // If key exists, delete and re-add to update access order
    if (this._cache.has(key)) {
      this._cache.delete(key);
    }
    // Evict oldest entries if at capacity
    while (this._cache.size >= this.maxSize) {
      const oldestKey = this._cache.keys().next().value;
      this._cache.delete(oldestKey);
    }
    this._cache.set(key, value);
  }

  /**
   * Check if a key exists in the cache. Does NOT update access order.
   */
  has(key) {
    return this._cache.has(key);
  }

  /**
   * Clear all entries from the cache.
   */
  clear() {
    this._cache.clear();
  }

  /**
   * Get the current number of entries in the cache.
   */
  get size() {
    return this._cache.size;
  }
}`;

const newLRUCache = `// ── Proper LRU Cache Implementation ────────────────────────────────────────
/**
 * Least Recently Used (LRU) cache that evicts the least recently accessed item
 * when capacity is reached. Uses a Map internally where iteration order reflects
 * access order (most recently used items are at the end).
 * 
 * Supports optional eviction callback for resource cleanup (e.g., deleting temp files).
 */
class LRUCache {
  constructor(maxSize, onEvict = null) {
    this.maxSize = maxSize;
    this._cache = new Map();
    this._onEvict = onEvict; // Optional callback: (key, value) => void
    
    // Metrics tracking
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  /**
   * Get a value from the cache. If found, moves the entry to the end
   * (marking it as most recently used). Returns undefined if not found.
   */
  get(key) {
    if (!this._cache.has(key)) {
      this.misses++;
      return undefined;
    }
    // Move to end (most recently used)
    const value = this._cache.get(key);
    this._cache.delete(key);
    this._cache.set(key, value);
    this.hits++;
    return value;
  }

  /**
   * Set a value in the cache. If the key already exists, it is moved to the end.
   * If the cache is at capacity, the oldest entry (front of Map) is evicted first.
   */
  set(key, value) {
    // If key exists, delete and re-add to update access order
    if (this._cache.has(key)) {
      this._cache.delete(key);
    }
    // Evict oldest entries if at capacity
    while (this._cache.size >= this.maxSize) {
      const oldestKey = this._cache.keys().next().value;
      const oldestValue = this._cache.get(oldestKey);
      this._cache.delete(oldestKey);
      this.evictions++;
      
      // Call eviction callback for resource cleanup
      if (this._onEvict) {
        try {
          this._onEvict(oldestKey, oldestValue);
        } catch (err) {
          console.warn(\`[LRUCache] Eviction callback error for key \${oldestKey}: \${err.message}\`);
        }
      }
    }
    this._cache.set(key, value);
  }

  /**
   * Check if a key exists in the cache. Does NOT update access order.
   */
  has(key) {
    return this._cache.has(key);
  }

  /**
   * Clear all entries from the cache. Calls eviction callback for each entry if provided.
   */
  clear() {
    if (this._onEvict) {
      for (const [key, value] of this._cache.entries()) {
        try {
          this._onEvict(key, value);
        } catch (err) {
          console.warn(\`[LRUCache] Clear callback error for key \${key}: \${err.message}\`);
        }
      }
    }
    this._cache.clear();
  }

  /**
   * Get the current number of entries in the cache.
   */
  get size() {
    return this._cache.size;
  }
  
  /**
   * Get cache hit rate as a percentage (0-100).
   */
  get hitRate() {
    const total = this.hits + this.misses;
    return total === 0 ? 0 : (this.hits / total) * 100;
  }
  
  /**
   * Get cache statistics object for monitoring.
   */
  getStats() {
    return {
      size: this.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      hitRate: this.hitRate.toFixed(2) + '%',
    };
  }
  
  /**
   * Reset metrics counters (useful between renders).
   */
  resetMetrics() {
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }
}`;

content = content.replace(oldLRUCache, newLRUCache);

// Fix 2: Convert saturationCache to LRU
console.log('2. Converting saturationCache to LRU...');
content = content.replace(
  '// ── Saturation score cache (keyed by image URL) — Requirement 8.1 ──────────\nconst saturationCache = new Map();',
  '// ── Saturation score cache (keyed by image URL) — Requirement 8.1 ──────────\n// Converted to LRU cache to prevent unbounded growth across multiple renders\nconst MAX_SATURATION_CACHE_SIZE = 200; // Reasonable limit for typical projects\nconst saturationCache = new LRUCache(MAX_SATURATION_CACHE_SIZE);'
);

// Fix 3: Add eviction callback to clipFileCache
console.log('3. Adding eviction callback to clipFileCache...');
content = content.replace(
  'const MAX_VIDEO_FRAME_CACHE_SIZE = 50; // Prevent OOM with many video clips\nconst videoFrameCache = new LRUCache(MAX_VIDEO_FRAME_CACHE_SIZE);\nconst clipFileCache = new Map(); // Maps clip URLs → cached file paths on disk (bounded by disk space)',
  `const MAX_VIDEO_FRAME_CACHE_SIZE = 50; // Prevent OOM with many video clips
const videoFrameCache = new LRUCache(MAX_VIDEO_FRAME_CACHE_SIZE);
const MAX_CLIP_FILE_CACHE_SIZE = 30; // Limit concurrent cached video clips on disk

// Eviction callback for clipFileCache: delete temp file when entry is evicted
const clipFileCache = new LRUCache(MAX_CLIP_FILE_CACHE_SIZE, (key, filePath) => {
  try {
    if (filePath && existsSync(filePath)) {
      unlinkSync(filePath);
      console.log(\`  🗑️  Evicted clip cache: \${filePath.substring(0, 80)}...\`);
    }
  } catch (err) {
    console.warn(\`  ⚠ Failed to delete evicted clip file \${filePath}: \${err.message}\`);
  }
}); // Maps clip URLs → cached file paths on disk`
);

// Fix 4: Add animation state reset at render start
console.log('4. Adding animation state reset...');
content = content.replace(
  '// ── Main render ────────────────────────────────────────────────────────────\nasync function render() {\n  console.log(\'Fetching project from dev server...\');\n  const project = await fetchProject();\n  console.log(\`Project: "\${project.title}" | \${project.script.length} segments | \${project.media.length} media assets\`);',
  `// ── Main render ────────────────────────────────────────────────────────────
async function render() {
  console.log('Fetching project from dev server...');
  const project = await fetchProject();
  console.log(\`Project: "\${project.title}" | \${project.script.length} segments | \${project.media.length} media assets\`);

  // Reset animation state to prevent accumulation across multiple renders
  wordFirstAppearFrame.clear();
  globalFrameCounter = 0;
  console.log('  🔄 Animation state reset');`
);

// Fix 5: Enhanced cache stats logging during render
console.log('5. Enhancing cache stats logging...');
content = content.replace(
  '    // ── Cache Stats Logging (every 100 segments) ──────────────────────────\n    if ((si + 1) % 100 === 0 || si === project.script.length - 1) {\n      console.log(\`  [Cache Stats] imageCache: \${imageCache.size}/\${MAX_CACHE_SIZE}, videoFrameCache: \${videoFrameCache.size}/\${MAX_VIDEO_FRAME_CACHE_SIZE}\`);\n    }',
  `    // ── Cache Stats Logging (every 50 segments) ──────────────────────────
    if ((si + 1) % 50 === 0 || si === project.script.length - 1) {
      const memUsage = process.memoryUsage();
      console.log(\`  [Cache Stats] img:\${imageCache.size}/\${MAX_CACHE_SIZE} (\${imageCache.hitRate.toFixed(0)}% hit), \` +
                  \`vid:\${videoFrameCache.size}/\${MAX_VIDEO_FRAME_CACHE_SIZE}, \` +
                  \`sat:\${saturationCache.size}/\${MAX_SATURATION_CACHE_SIZE}, \` +
                  \`clip:\${clipFileCache.size}/\${MAX_CLIP_FILE_CACHE_SIZE}, \` +
                  \`heap:\${(memUsage.heapUsed / 1024 / 1024).toFixed(0)}MB\`);
    }`
);

// Fix 6: Simplify clip cleanup (LRU now handles deletion)
console.log('6. Simplifying clip file cleanup...');
content = content.replace(
  `    // Clean up downloaded video clips from temp directory (prevent disk space waste)
    try {
      for (const [, clipPath] of clipFileCache) {
        if (existsSync(clipPath)) {
          unlinkSync(clipPath);
        }
      }
      clipFileCache.clear();
      videoFrameCache.clear();
      console.log('   Cleaned up video clip cache');
    } catch (cleanupErr) {
      console.warn(\`   Failed to clean up video clips: \${cleanupErr.message}\`);
    }
  }`,
  `    // Clean up downloaded video clips from temp directory (prevent disk space waste)
    try {
      // LRUCache.clear() now handles file deletion via eviction callback
      clipFileCache.clear();
      videoFrameCache.clear();
      console.log('   Cleaned up video clip cache');
    } catch (cleanupErr) {
      console.warn(\`   Failed to clean up video clips: \${cleanupErr.message}\`);
    }
  }

  // ── Cache Metrics & Statistics Logging ───────────────────────────────────
  console.log('\\n📊 Cache Performance Summary:');
  console.log(\`  Image Cache:        \${JSON.stringify(imageCache.getStats())}\`);
  console.log(\`  Video Frame Cache:  \${JSON.stringify(videoFrameCache.getStats())}\`);
  console.log(\`  Saturation Cache:   \${JSON.stringify(saturationCache.getStats())}\`);
  console.log(\`  Clip File Cache:    \${JSON.stringify(clipFileCache.getStats())}\`);
  
  // Memory usage summary
  const memUsage = process.memoryUsage();
  console.log(\`\\n💾 Memory Usage:\`);
  console.log(\`  Heap Used:     \${(memUsage.heapUsed / 1024 / 1024).toFixed(2)} MB\`);
  console.log(\`  Heap Total:    \${(memUsage.heapTotal / 1024 / 1024).toFixed(2)} MB\`);
  console.log(\`  RSS:           \${(memUsage.rss / 1024 / 1024).toFixed(2)} MB\`);
  console.log(\`  External:      \${(memUsage.external / 1024 / 1024).toFixed(2)} MB\`);

  // Reset cache metrics for next render (if running in long-lived process)
  imageCache.resetMetrics();
  videoFrameCache.resetMetrics();
  saturationCache.resetMetrics();
  clipFileCache.resetMetrics();`
);

// Fix 7: Add cache stats to progress updates
console.log('7. Adding cache stats to progress updates...');
content = content.replace(
  `    sendRenderProgress({
      status: 'rendering',
      currentFrame: totalFrames,
      totalFrames: totalExpectedFrames,
      fps: fps.toFixed(1),
      etaSeconds: parseInt(eta) || 0,
      memoryMB: process.memoryUsage().heapUsed / (1024 * 1024),
    });`,
  `    sendRenderProgress({
      status: 'rendering',
      currentFrame: totalFrames,
      totalFrames: totalExpectedFrames,
      fps: fps.toFixed(1),
      etaSeconds: parseInt(eta) || 0,
      memoryMB: process.memoryUsage().heapUsed / (1024 * 1024),
      cacheStats: {
        imageCacheSize: imageCache.size,
        videoFrameCacheSize: videoFrameCache.size,
        saturationCacheSize: saturationCache.size,
        clipFileCacheSize: clipFileCache.size,
      },
    });`
);

// Write the fixed file
console.log('\nWriting fixed file...');
writeFileSync(outputFile, content);

console.log('✅ All fixes applied successfully!');
console.log(`\nFixed file: ${outputFile}`);
console.log(`Original backup: ${inputFile}`);
