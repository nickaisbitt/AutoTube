/**
 * Two-tier media cache: localStorage for persistent URL/vision data,
 * in-memory Map for session-scoped image data.
 */

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

/** 24-hour TTL for all cache entries. */
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export type CacheTier = 'persistent' | 'memory';

export class MediaCache {
  private memoryCache: Map<string, CacheEntry<unknown>>;
  private readonly storagePrefix: string;

  constructor(storagePrefix = 'atube_cache_') {
    this.memoryCache = new Map();
    this.storagePrefix = storagePrefix;
  }

  /**
   * Check if a cache entry exists and is not expired.
   */
  isValid(key: string, tier: CacheTier): boolean {
    const entry = this.getRawEntry(key, tier);
    if (!entry) return false;
    return Date.now() - entry.timestamp < CACHE_TTL_MS;
  }

  /**
   * Get a cached value. Returns null if missing or expired.
   */
  get<T>(key: string, tier: CacheTier): T | null {
    const entry = this.getRawEntry(key, tier);
    if (!entry) return null;
    if (Date.now() - entry.timestamp >= CACHE_TTL_MS) return null;
    return entry.data as T;
  }

  /**
   * Store a value in the specified tier.
   * For 'persistent': writes to localStorage (falls back to memory if full).
   * For 'memory': writes to in-memory Map only.
   */
  set<T>(key: string, value: T, tier: CacheTier): void {
    const entry: CacheEntry<T> = { data: value, timestamp: Date.now() };

    if (tier === 'persistent') {
      try {
        localStorage.setItem(
          this.storagePrefix + key,
          JSON.stringify(entry),
        );
      } catch {
        // localStorage quota exceeded or unavailable — fall back to memory
        this.memoryCache.set(key, entry);
      }
    } else {
      this.memoryCache.set(key, entry);
    }
  }

  /**
   * Remove expired entries from localStorage.
   */
  pruneExpired(): void {
    try {
      const now = Date.now();
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const storageKey = localStorage.key(i);
        if (!storageKey || !storageKey.startsWith(this.storagePrefix)) continue;
        try {
          const raw = localStorage.getItem(storageKey);
          if (!raw) continue;
          const entry: CacheEntry<unknown> = JSON.parse(raw);
          if (now - entry.timestamp >= CACHE_TTL_MS) {
            localStorage.removeItem(storageKey);
          }
        } catch {
          // Corrupted entry — remove it
          localStorage.removeItem(storageKey);
        }
      }
    } catch {
      // localStorage unavailable — nothing to prune
    }
  }

  /**
   * Clear all cache entries (both tiers).
   */
  clear(): void {
    this.memoryCache.clear();
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const storageKey = localStorage.key(i);
        if (storageKey && storageKey.startsWith(this.storagePrefix)) {
          localStorage.removeItem(storageKey);
        }
      }
    } catch {
      // localStorage unavailable — memory already cleared
    }
  }

  // ── Convenience methods ──────────────────────────────────────────────

  getCachedResolution(originalUrl: string): { resolvedUrl: string; width?: number; height?: number; changed: boolean } | null {
    return this.get(`res:${originalUrl}`, 'persistent');
  }

  setCachedResolution(originalUrl: string, result: { resolvedUrl: string; width?: number; height?: number; changed: boolean }): void {
    this.set(`res:${originalUrl}`, result, 'persistent');
  }

  getCachedVisionResult(imageUrl: string): unknown | null {
    return this.get(`vis:${imageUrl}`, 'persistent');
  }

  setCachedVisionResult(imageUrl: string, result: unknown): void {
    this.set(`vis:${imageUrl}`, result, 'persistent');
  }

  getCachedImageData(url: string): Blob | null {
    return this.get<Blob>(`img:${url}`, 'memory');
  }

  setCachedImageData(url: string, data: Blob): void {
    this.set(`img:${url}`, data, 'memory');
  }

  // ── Internal helpers ─────────────────────────────────────────────────

  private getRawEntry(key: string, tier: CacheTier): CacheEntry<unknown> | null {
    if (tier === 'memory') {
      return this.memoryCache.get(key) ?? null;
    }

    // persistent tier — try localStorage first
    try {
      const raw = localStorage.getItem(this.storagePrefix + key);
      if (!raw) return null;
      return JSON.parse(raw) as CacheEntry<unknown>;
    } catch {
      // JSON.parse failure or localStorage unavailable — treat as miss
      return null;
    }
  }
}
