/**
 * Social video hosts that fail download-clip proxy and become render placeholders.
 * Shared by search routes, download-clip, and harvest sanitization.
 */

export const BLOCKED_SOCIAL_VIDEO_HOST_RE =
  /(?:tiktok\.com|vm\.tiktok|tiktokcdn\.com|instagram\.com|facebook\.com|fb\.watch|twitter\.com|x\.com)/i;

/** Image/CDN hosts that are TikTok app promos, not editorial B-roll. */
export const BLOCKED_SOCIAL_IMAGE_HOST_RE =
  /(?:tiktok\.com|vm\.tiktok|tiktokcdn\.com|tiktokpng\.com|tiktokv\.com|muscdn\.com|byteoversea\.com)/i;

export function isBlockedSocialVideoUrl(...urls: Array<string | undefined>): boolean {
  const blob = urls.filter(Boolean).join(' ');
  return BLOCKED_SOCIAL_VIDEO_HOST_RE.test(blob);
}

export function isBlockedSocialImageUrl(...urls: Array<string | undefined>): boolean {
  const blob = urls.filter(Boolean).join(' ');
  return BLOCKED_SOCIAL_IMAGE_HOST_RE.test(blob);
}

export function filterSocialVideoResults<T extends { url?: string; sourceUrl?: string; content?: string }>(
  rows: T[],
): T[] {
  return rows.filter((r) => !isBlockedSocialVideoUrl(r.url, r.sourceUrl, r.content));
}
