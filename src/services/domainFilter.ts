// ============================================================================
// Domain Filter — Blocklist / Allowlist for Media Candidate Sources
// ============================================================================

import type { MediaCandidate } from './media';

// ---------------------------------------------------------------------------
// Domain Blocklist — categorized patterns matched via hostname.includes()
// ---------------------------------------------------------------------------

export const DOMAIN_BLOCKLIST = new Map<string, string[]>([
  ['propaganda', ['sputniknews', 'sputnikglobe', 'sputnik', 'presstv', 'cgtn', 'tass', 'xinhua', 'globalresearch']],
  ['watermarked-stock', ['shutterstock', 'gettyimages', 'istockphoto', '123rf', 'dreamstime', 'depositphotos', 'alamy']],
  ['low-quality', ['9gag', 'imgur', 'memegenerator', 'knowyourmeme', 'ifunny', 'cheezburger', 'buzzfeed']],
  ['adult-content', ['pornhub', 'xvideos', 'xhamster', 'redtube', 'youporn']],
]);

// ---------------------------------------------------------------------------
// Trusted Domains — known high-quality editorial / stock sources
// ---------------------------------------------------------------------------

export const TRUSTED_DOMAINS: string[] = [
  'reuters', 'apnews', 'bbc', 'bloomberg', 'nytimes', 'wsj',
  'cnn', 'cnbc', 'forbes', 'wikimedia', 'unsplash', 'pexels',
];

// ---------------------------------------------------------------------------
// Utility: extract hostname from a URL string
// ---------------------------------------------------------------------------

export function extractHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch (err) {
    console.warn('Domain filter URL parse failed:', err);
    return '';
  }
}

// ---------------------------------------------------------------------------
// Check a single URL against the blocklist
// ---------------------------------------------------------------------------

export function isDomainBlocked(url: string): { blocked: boolean; pattern?: string; category?: string } {
  const hostname = extractHostname(url);
  if (!hostname) return { blocked: false };

  // Special case: RT (Russia Today) — hostname.includes('rt.com') has too many false positives
  // (walmartimages.com, iheart.com, etc.). Check for exact match or subdomain.
  if (hostname === 'rt.com' || hostname.endsWith('.rt.com') || hostname === 'www.rt.com' || hostname.includes('mrtl.ru')) {
    return { blocked: true, pattern: 'rt.com', category: 'propaganda' };
  }

  for (const [category, patterns] of DOMAIN_BLOCKLIST) {
    for (const pattern of patterns) {
      if (hostname.includes(pattern)) {
        return { blocked: true, pattern, category };
      }
    }
  }

  return { blocked: false };
}

// ---------------------------------------------------------------------------
// Filter an array of candidates, checking both sourceUrl and url
// ---------------------------------------------------------------------------

export function filterCandidates(
  candidates: MediaCandidate[],
): {
  accepted: MediaCandidate[];
  rejected: Array<{ candidate: MediaCandidate; pattern: string; category: string }>;
} {
  const accepted: MediaCandidate[] = [];
  const rejected: Array<{ candidate: MediaCandidate; pattern: string; category: string }> = [];

  for (const candidate of candidates) {
    // Check sourceUrl first, then url
    const sourceCheck = candidate.sourceUrl ? isDomainBlocked(candidate.sourceUrl) : { blocked: false };
    if (sourceCheck.blocked) {
      rejected.push({ candidate, pattern: sourceCheck.pattern!, category: sourceCheck.category! });
      continue;
    }

    const urlCheck = isDomainBlocked(candidate.url);
    if (urlCheck.blocked) {
      rejected.push({ candidate, pattern: urlCheck.pattern!, category: urlCheck.category! });
      continue;
    }

    accepted.push(candidate);
  }

  return { accepted, rejected };
}

// ---------------------------------------------------------------------------
// Domain trust tier for scoring adjustment
// ---------------------------------------------------------------------------

export function getDomainTrustTier(url: string): 'trusted' | 'unknown' {
  const hostname = extractHostname(url);
  if (!hostname) return 'unknown';

  for (const pattern of TRUSTED_DOMAINS) {
    if (hostname.includes(pattern)) {
      return 'trusted';
    }
  }

  return 'unknown';
}
