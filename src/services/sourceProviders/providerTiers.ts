/**
 * Provider tiers — web/raw harvest primary; stock APIs secondary fillers.
 *
 * Pexels/Pixabay/Unsplash are useful for B-roll variety but often win on
 * baseScore alone. When enough topic-relevant web results exist, demote stock.
 */

export function stockAsSecondaryEnabled(): boolean {
  const raw =
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_STOCK_AS_SECONDARY) ||
    (typeof process !== 'undefined' && process.env?.AUTOTUBE_STOCK_AS_SECONDARY);
  if (raw === '0' || raw === 'false') return false;
  return true;
}

/** Curated stock libraries — generic, query-loose matches. */
export function isSecondaryStockSource(source: string): boolean {
  const s = (source || '').toLowerCase();
  return (
    s.includes('pexels') ||
    s.includes('pixabay') ||
    s.includes('picsum') ||
    s === 'unsplash' ||
    s.startsWith('unsplash ·') ||
    (s.includes('unsplash') && !s.includes('fallback'))
  );
}

/** Article pages, search engines, encyclopedic sources — topic-specific. */
export function isPrimaryWebSource(source: string): boolean {
  const s = (source || '').toLowerCase();
  if (isSecondaryStockSource(source)) return false;
  return (
    s.includes('deep harvest') ||
    s.includes('duckduckgo') ||
    s.includes('wikimedia') ||
    s.includes('google') ||
    s.includes('bing') ||
    s.includes('startpage') ||
    s.includes('hybrid') ||
    s.includes('archive.org') ||
    s.includes('flickr') ||
    s.includes('gov') ||
    s.includes('nasa') ||
    s.includes('vimeo') ||
    s.includes('dailymotion') ||
    s.includes('giphy') ||
    s.includes('openstreetmap')
  );
}

export interface SecondaryStockPolicyOptions {
  minPrimaryCount?: number;
  minPrimaryScore?: number;
  demotePenalty?: number;
}

type ScoredCandidate = { source: string; finalScore: number };

/**
 * When enough relevant web results exist, push stock API hits down the ranking
 * so they only fill gaps — not replace Deep Harvest / DDG / Wikimedia.
 */
export function applySecondaryStockPolicy<T extends ScoredCandidate>(
  scored: T[],
  options: SecondaryStockPolicyOptions = {},
): T[] {
  if (!stockAsSecondaryEnabled()) return scored;

  const minPrimaryCount = options.minPrimaryCount ?? 2;
  const minPrimaryScore = options.minPrimaryScore ?? 100;
  const demotePenalty = options.demotePenalty ?? 280;

  const strongPrimary = scored.filter(
    (c) => isPrimaryWebSource(c.source) && c.finalScore >= minPrimaryScore,
  );

  if (strongPrimary.length < minPrimaryCount) return scored;

  for (const c of scored) {
    if (isSecondaryStockSource(c.source)) {
      c.finalScore -= demotePenalty;
    }
  }

  scored.sort((a, b) => b.finalScore - a.finalScore);
  return scored;
}
