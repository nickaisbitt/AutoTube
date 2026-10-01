import type { MediaCandidate } from '../media';

export const WATERMARK_DOMAINS: string[] = [
  'shutterstock.com',
  'gettyimages.com',
  'istockphoto.com',
  '123rf.com',
  'dreamstime.com',
  'depositphotos.com',
  'alamy.com',
  'adobestock.com',
  'stock.adobe.com',
  'fotolia.com',
  'pond5.com',
  'videoblocks.com',
  'storyblocks.com',
  'envato.com',
  'videohive.net',
  'motionelements.com',
  'bigstockphoto.com',
  'stockfresh.com',
  'canstockphoto.com',
  'freepik.com',
  'vecteezy.com',
  'ftcdn.net',
  'shutterstockusercontent.com',
  'gettyimagesusercontent.com',
  'alamyimages.com',
];

export const WATERMARK_URL_PATTERNS: RegExp[] = [
  /shutterstock\.com\/.*(?:preview|watermark|comp)/i,
  /gettyimages\.com\/.*(?:preview|watermark|comp)/i,
  /istockphoto\.com\/.*(?:preview|watermark|comp)/i,
  /123rf\.com\/.*(?:preview|watermark|sample)/i,
  /dreamstime\.com\/.*(?:preview|watermark|thumb)/i,
  /depositphotos\.com\/.*(?:preview|watermark|sample)/i,
  /alamy\.com\/.*(?:preview|watermark|comp)/i,
  /adobestock\.com\/.*(?:preview|watermark|sample)/i,
  /[?&]watermark=/i,
  /[?&]preview=true/i,
  /\/preview\//i,
  /\/watermark\//i,
  /\/sample\//i,
  /\/comp\//i,
  /-watermark\./i,
  /_watermark\./i,
  /\.preview\./i,
  /\.sample\./i,
  /stockphoto.*(?:preview|watermark)/i,
  /(?:shutterstock|gettyimages|istock|123rf|dreamstime|depositphotos|alamy|adobestock).*\/(?:thumb|preview|comp|sample|watermark)/i,
];

export const WATERMARK_ALT_PATTERNS: RegExp[] = [
  /\bstock\s*photo\b/i,
  /\broyalty[\s-]*free\b/i,
  /\bshutterstock\b/i,
  /\bgetty\s*images?\b/i,
  /\bistock\b/i,
  /\b123rf\b/i,
  /\bdreamstime\b/i,
  /\bdepositphotos\b/i,
  /\balamy\b/i,
  /\badobe\s*stock\b/i,
  /\bstock\s*image\b/i,
  /\bstock\s*photography\b/i,
  /\blicens(?:e|ed)\s*image\b/i,
  /\bwatermark(ed)?\b/i,
  /\bpreview\s*image\b/i,
  /\bcomp\s*image\b/i,
  /\bsample\s*image\b/i,
  /\bpond5\b/i,
  /\benvato\b/i,
  /\bfotolia\b/i,
  /\bstock\s*vector\b/i,
  /\bstock\s*illustration\b/i,
  /\bpremium\s*stock\b/i,
  /\beditorial\s*stock\b/i,
  /\bstock\s*footage\b/i,
];

function extractHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

export function isWatermarked(candidate: MediaCandidate): boolean {
  const sourceLower = (candidate.source || '').toLowerCase();

  const urlHostname = extractHostname(candidate.url);
  const sourceHostname = candidate.sourceUrl ? extractHostname(candidate.sourceUrl) : '';

  for (const domain of WATERMARK_DOMAINS) {
    if (urlHostname.includes(domain) || sourceHostname.includes(domain)) {
      return true;
    }
  }

  for (const pattern of WATERMARK_URL_PATTERNS) {
    if (pattern.test(candidate.url) || (candidate.sourceUrl && pattern.test(candidate.sourceUrl))) {
      return true;
    }
  }

  for (const pattern of WATERMARK_ALT_PATTERNS) {
    if (pattern.test(candidate.alt)) {
      return true;
    }
  }

  const sourceIndicators = ['shutterstock', 'gettyimages', 'istock', '123rf', 'dreamstime', 'depositphotos', 'alamy', 'adobe stock', 'adobestock'];
  for (const indicator of sourceIndicators) {
    if (sourceLower.includes(indicator)) {
      return true;
    }
  }

  return false;
}

export function filterWatermarked(candidates: MediaCandidate[]): MediaCandidate[] {
  return candidates.filter(c => !isWatermarked(c));
}
