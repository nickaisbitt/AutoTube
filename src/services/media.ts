// ============================================================================
// Media Harvester — Zero-Cost Pro Acquisition Pipeline (Observability 4.1)
// ============================================================================

import type {
  MediaAsset,
  ScriptSegment,
  SegmentVisualPlan,
  TopicContext,
  AppConfig,
} from '../types';

import { logger } from './logger';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import { filterCandidates, getDomainTrustTier } from './domainFilter';
import { batchVisionCheck, checkCandidateVision } from './visionCheck';
import { queryAllProviders } from './sourceProviders';
import {
  applySecondaryStockPolicy,
  isPrimaryWebSource,
  isSecondaryStockSource,
} from './sourceProviders/providerTiers';
import { batchResolve } from './fullResResolver';
import { MediaCache } from './mediaCache';
import { batchScoreQuality } from './qualityScorer';
import { focalCrop, needsCropping } from './focalCropper';
import { isWatermarked } from './sourceProviders/watermarkFilter';
import { determineLicense, isLicenseCompatible } from './licenseTracker';
import { computePaletteBonus } from './qualityValidation/colorPalette';
import { computeImageAHash, isSimilarToAny } from './perceptualHash';
import { scoreCandidateAgainstBeat } from './beatRelevance';
import type { VisualBeat } from './visualBeatSheet';

function isLoopFastMode(): boolean {
  return typeof sessionStorage !== 'undefined' && sessionStorage.getItem('autotube_loop_fast_mode') === 'true';
}

function loopMinAssetsPerSegment(): number {
  if (!isLoopFastMode() || typeof sessionStorage === 'undefined') return 0;
  const raw = sessionStorage.getItem('autotube_loop_min_assets');
  const parsed = raw ? parseInt(raw, 10) : 0;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function isLoopVideoFirst(): boolean {
  return (
    isLoopFastMode() &&
    typeof sessionStorage !== 'undefined' &&
    sessionStorage.getItem('autotube_loop_video_first') === 'true'
  );
}

function loopHarvestContext(): { offset: number; nonce: number; exclude: Set<string> } {
  if (!isLoopFastMode() || typeof sessionStorage === 'undefined') {
    return { offset: 0, nonce: 0, exclude: new Set() };
  }
  const offset = parseInt(sessionStorage.getItem('autotube_loop_media_offset') || '0', 10) || 0;
  const nonce = parseInt(sessionStorage.getItem('autotube_loop_harvest_nonce') || '0', 10) || 0;
  const exclude = new Set<string>();
  try {
    const raw = sessionStorage.getItem('autotube_loop_exclude_urls');
    if (raw) {
      for (const u of JSON.parse(raw) as string[]) {
        if (u) exclude.add(u.split('?')[0].toLowerCase());
      }
    }
  } catch {
    /* ignore */
  }
  return { offset, nonce, exclude };
}

const LOOP_DIVERSITY_TOKENS = ['news', 'documentary', 'archive', 'footage', 'investigation', 'report', 'leaked', 'official'];
const LOOP_CYBER_DIVERSITY_TOKENS = [
  'cybersecurity',
  'data breach',
  'news footage',
  'investigation',
  'hospital records',
  'security camera',
  'official report',
];

function diversifyLoopQuery(query: string, ctx: { offset: number; nonce: number }): string {
  if (ctx.offset === 0 && ctx.nonce === 0) return query;
  const q = query.toLowerCase();
  const cyberish = /hack|breach|ransom|cyber|hospital|patient|bank|fraud|scam|password|identity|leak|records?/.test(q);
  const tokens = cyberish ? LOOP_CYBER_DIVERSITY_TOKENS : LOOP_DIVERSITY_TOKENS;
  const token = tokens[ctx.offset % tokens.length];
  const variant = ctx.nonce > 0 ? ` take ${ctx.nonce}` : '';
  return `${query} ${token}${variant}`.trim();
}

// ---------------------------------------------------------------------------
// Watermark Detection Constants
// ---------------------------------------------------------------------------

export const WATERMARK_DOMAINS = [
  'shutterstock.com', 'gettyimages.com', 'istockphoto.com',
  '123rf.com', 'dreamstime.com', 'depositphotos.com',
  'alamy.com', 'ftcdn.net', 'adobestock.com', 'stock.adobe.com',
  'fotolia.com', 'pond5.com', 'videoblocks.com', 'storyblocks.com',
  'envato.com', 'videohive.net', 'motionelements.com', 'pexels.com',
  'pixabay.com', 'unsplash.com',
];

export const WATERMARK_INDICATORS = [
  'stock', 'watermark', 'preview', 'comp', 'sample', 'licensed',
  'shutterstock', 'gettyimages', 'alamy watermark', 'adobe stock',
];

const WATERMARK_DOMAIN_PENALTY = -500;
const WATERMARK_INDICATOR_PENALTY = -300;

// ---------------------------------------------------------------------------
// Copyright Claim Prevention (Task 178)
// ---------------------------------------------------------------------------

export interface CopyrightCheckResult {
  flagged: boolean;
  patterns: string[];
  source: string;
  licenseStatus: 'verified' | 'unverified' | 'blocked';
}

export const COPYRIGHT_PATTERNS: Record<string, string[]> = {
  'Getty Images': ['getty', 'gettyimages', 'istockphoto', 'getty images'],
  'Shutterstock': ['shutterstock', 'shutterstock.com'],
  'Adobe Stock': ['adobe stock', 'stock.adobe', 'adobestock', 'fotolia'],
  'Alamy': ['alamy', 'alamy stock'],
  '123RF': ['123rf', '123rf.com'],
  'Dreamstime': ['dreamstime', 'dreamstime.com'],
  'Depositphotos': ['depositphotos', 'depositphotos.com'],
  'Pond5': ['pond5', 'pond5.com'],
  'Envato': ['envato', 'videohive', 'motion elements'],
};

export const LICENSED_SOURCES: Record<string, string> = {
  'Wikimedia Commons': 'CC-BY-SA',
  'Unsplash': 'Unsplash License',
  'Picsum': 'Pexels/Pixabay-style',
  'Pexels': 'Pexels License',
  'Pixabay': 'Pixabay License',
  'OpenStreetMap': 'ODbL',
  'Wikipedia': 'Fair Use / CC-BY-SA',
};

// ---------------------------------------------------------------------------
// License Resolution (Task 179)
// ---------------------------------------------------------------------------

export function resolveLicense(source: string, sourceUrl?: string): { license: string; attribution: string } {
  const lowerSource = source.toLowerCase();

  for (const [name, license] of Object.entries(LICENSED_SOURCES)) {
    if (lowerSource.includes(name.toLowerCase())) {
      const attribution = `${name} (${license})`;
      return { license, attribution };
    }
  }

  if (sourceUrl) {
    const hostname = (() => {
      try { return new URL(sourceUrl).hostname; } catch { return ''; }
    })();
    if (hostname.includes('wikimedia.org') || hostname.includes('wikipedia.org')) {
      return { license: 'CC-BY-SA', attribution: 'Wikimedia Commons (CC-BY-SA)' };
    }
  }

  return { license: 'Unknown', attribution: 'Unknown source' };
}

export function logLicenseInfo(asset: MediaAsset): void {
  if (asset.license && asset.license.licenseType !== 'Unknown') {
    logger.info('License', `Asset "${asset.alt}" from ${asset.source}: ${asset.license.licenseType}`);
  } else {
    logger.warn('License', `Asset "${asset.alt}" from ${asset.source}: License unverified`);
  }
}

export const BLOCKED_COPYRIGHT_SOURCES = [
  'gettyimages.com',
  'shutterstock.com',
  'adobestock.com',
  'stock.adobe.com',
  'istockphoto.com',
  '123rf.com',
  'dreamstime.com',
  'depositphotos.com',
  'alamy.com',
  'pond5.com',
  'fotolia.com',
];

export function checkCopyright(c: MediaCandidate): CopyrightCheckResult {
  const meta = `${c.alt} ${c.url} ${c.sourceUrl || ''} ${c.source}`.toLowerCase();
  const hostname = (() => {
    try { return new URL(c.url).hostname; } catch { return ''; }
  })();
  const sourceHostname = (() => {
    try { return new URL(c.sourceUrl || '').hostname; } catch { return ''; }
  })();

  const matchedPatterns: string[] = [];

  for (const [name, patterns] of Object.entries(COPYRIGHT_PATTERNS)) {
    for (const pattern of patterns) {
      if (meta.includes(pattern) || hostname.includes(pattern) || sourceHostname.includes(pattern)) {
        matchedPatterns.push(`${name}: ${pattern}`);
      }
    }
  }

  const isBlocked = BLOCKED_COPYRIGHT_SOURCES.some(
    d => hostname.includes(d) || sourceHostname.includes(d)
  );

  const licenseStatus: CopyrightCheckResult['licenseStatus'] = isBlocked
    ? 'blocked'
    : matchedPatterns.length > 0
      ? 'unverified'
      : 'verified';

  const knownLicense = Object.entries(LICENSED_SOURCES).find(
    ([name]) => c.source.includes(name) || meta.includes(name.toLowerCase())
  );

  if (knownLicense) {
    return {
      flagged: false,
      patterns: [],
      source: knownLicense[0],
      licenseStatus: 'verified',
    };
  }

  return {
    flagged: isBlocked || matchedPatterns.length > 0,
    patterns: matchedPatterns,
    source: c.source,
    licenseStatus,
  };
}

// ---------------------------------------------------------------------------
// Relevance Scoring Constants
// ---------------------------------------------------------------------------

const RELEVANCE_LOW_MATCH_PENALTY = -100;
const CONTEXTUAL_MISMATCH_PENALTY = -250;

/**
 * Domain-specific term sets for contextual mismatch detection.
 * If a candidate's alt text contains terms from one of these domains
 * but the narration does NOT relate to that domain, a mismatch penalty applies.
 */
export const UNRELATED_DOMAIN_TERMS: Record<string, string[]> = {
  mathematics: ['equation', 'calculus', 'algebra', 'theorem', 'polynomial', 'integral', 'derivative', 'trigonometry'],
  cooking: ['recipe', 'ingredient', 'baking', 'cuisine', 'culinary', 'chef', 'cookbook', 'seasoning'],
  sports: ['touchdown', 'goalkeeper', 'batting', 'innings', 'referee', 'championship', 'playoff', 'quarterback'],
  medical: ['surgery', 'diagnosis', 'prescription', 'symptom', 'pathology', 'radiology', 'oncology', 'cardiology'],
  astronomy: ['constellation', 'nebula', 'supernova', 'asteroid', 'telescope', 'galaxy', 'pulsar', 'quasar'],
  fashion: ['runway', 'couture', 'designer', 'garment', 'textile', 'embroidery', 'hemline', 'silhouette'],
};

// ---------------------------------------------------------------------------
// Minimum image size filter
// ---------------------------------------------------------------------------

function meetsMinimumSize(c: { type: MediaCandidate['type']; width?: number; height?: number }): boolean {
  if (c.type !== 'image') return true;
  if (c.width !== undefined && c.height !== undefined) {
    return c.width >= 400 && c.height >= 300;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Resolution Minimum Filter (Task 149)
// ---------------------------------------------------------------------------

export const MIN_IMAGE_WIDTH = 1280;
export const MIN_IMAGE_HEIGHT = 720;
export const MIN_VIDEO_WIDTH = 1280;
export const MIN_VIDEO_HEIGHT = 720;

export const MIN_IMAGE_MEGAPIXELS = 0.9;

function meetsResolutionMinimum(c: MediaCandidate): boolean {
  if (c.type === 'image') {
    if (c.width === undefined || c.height === undefined) return true;
    return c.width >= MIN_IMAGE_WIDTH && c.height >= MIN_IMAGE_HEIGHT;
  }
  if (c.type === 'video') {
    if (c.width === undefined || c.height === undefined) return true;
    return (c.width ?? 0) >= MIN_VIDEO_WIDTH && (c.height ?? 0) >= MIN_VIDEO_HEIGHT;
  }
  return true;
}

function meetsMegapixelMinimum(c: MediaCandidate): boolean {
  if (c.type !== 'image') return true;
  if (c.width === undefined || c.height === undefined) return true;
  const megapixels = (c.width * c.height) / 1_000_000;
  return megapixels >= MIN_IMAGE_MEGAPIXELS;
}

// ---------------------------------------------------------------------------
// Aspect Ratio Validation (Task 150)
// ---------------------------------------------------------------------------

const MIN_ASPECT_RATIO = 1.3;
const MAX_ASPECT_RATIO = 2.5;

function meetsAspectRatio(c: MediaCandidate): boolean {
  if (!c.width || !c.height || c.height === 0) return true;
  const ratio = c.width / c.height;
  return ratio >= MIN_ASPECT_RATIO && ratio <= MAX_ASPECT_RATIO;
}

// ---------------------------------------------------------------------------
// Image Quality Gate (Task 147)
// ---------------------------------------------------------------------------

export interface QualityGateResult {
  passed: boolean;
  resolutionOk: boolean;
  contrastOk: boolean;
  brightnessOk: boolean;
  noWatermark: boolean;
  issues: string[];
}

/**
 * Validates an image candidate against minimum quality thresholds.
 */
export function passesQualityGate(c: MediaCandidate): QualityGateResult {
  const issues: string[] = [];

  // Resolution check
  const resolutionOk = (c.width ?? 0) >= MIN_IMAGE_WIDTH && (c.height ?? 0) >= MIN_IMAGE_HEIGHT;
  if (!resolutionOk) {
    issues.push(`Resolution ${c.width}x${c.height} below minimum ${MIN_IMAGE_WIDTH}x${MIN_IMAGE_HEIGHT}`);
  }

  // Watermark check (Task 148: verify watermark filter integration)
  const noWatermark = !isWatermarked(c);
  if (!noWatermark) {
    issues.push('Watermark detected — candidate rejected');
  }

  // Contrast/brightness: placeholder checks based on scoring
  // Full contrast analysis requires pixel data (done at render time)
  const contrastOk = true;
  const brightnessOk = true;

  return {
    passed: resolutionOk && noWatermark && contrastOk && brightnessOk,
    resolutionOk,
    contrastOk,
    brightnessOk,
    noWatermark,
    issues,
  };
}

// ---------------------------------------------------------------------------
// Face Detection for Thumbnails (Task 152)
// ---------------------------------------------------------------------------

/**
 * Brightness-based skin-tone detection for face regions.
 * Returns true if the region likely contains a face based on
 * skin-tone pixel ratio and brightness.
 */
export function detectFaceBySkinTone(
  imageData: Uint8ClampedArray,
  region: { x: number; y: number; width: number; height: number },
  imgWidth: number,
): { hasFace: boolean; confidence: number } {
  const { x: rx, y: ry, width: rw, height: rh } = region;
  if (rw <= 0 || rh <= 0) return { hasFace: false, confidence: 0 };

  let skinPixels = 0;
  let totalPixels = 0;
  let brightnessSum = 0;

  const xEnd = Math.min(rx + rw, imgWidth);
  const yEnd = Math.min(ry + rh, imageData.length / 4 / imgWidth);

  for (let y = ry; y < yEnd; y++) {
    for (let x = rx; x < xEnd; x++) {
      const idx = (y * imgWidth + x) * 4;
      if (idx + 2 >= imageData.length) break;
      const r = imageData[idx];
      const g = imageData[idx + 1];
      const b = imageData[idx + 2];
      totalPixels++;
      brightnessSum += (r + g + b) / 3;

      // Skin-tone heuristic: R > 95, G > 40, B > 20, R-G within 15-100
      if (r > 95 && g > 40 && b > 20 && (r - g) > 15 && (r - g) < 100) {
        skinPixels++;
      }
    }
  }

  if (totalPixels === 0) return { hasFace: false, confidence: 0 };

  const skinRatio = skinPixels / totalPixels;
  const avgBrightness = brightnessSum / totalPixels;

  // Face is likely present if skin ratio > 15% and brightness is in reasonable range
  const hasFace = skinRatio > 0.15 && avgBrightness > 60 && avgBrightness < 240;
  const confidence = hasFace ? Math.min(1, skinRatio * 2.5) : 0;

  return { hasFace, confidence };
}

// ---------------------------------------------------------------------------
// Color Palette Matching (Task 151)
// ---------------------------------------------------------------------------

/**
 * Scores how well a candidate image's dominant colors match given accent colors.
 * Uses the existing computePaletteBonus from qualityValidation.
 */
export function scoreColorPaletteMatch(
  candidateColors: { dominant: string; secondary: string; accent: string },
  videoAccentColors: string[],
): number {
  let totalBonus = 0;
  for (const accent of videoAccentColors) {
    const palette = {
      dominant: candidateColors.dominant,
      secondary: candidateColors.secondary,
      accent: candidateColors.accent,
      warmth: 'neutral' as const,
      saturation: 0.5,
      brightness: 0.5,
    };
    totalBonus += computePaletteBonus(palette, accent);
  }
  return totalBonus;
}

// ---------------------------------------------------------------------------
// Copyright Verification (Task 155)
// ---------------------------------------------------------------------------

/**
 * Verifies the license of a media candidate and returns compatibility info.
 */
export function verifyCopyright(c: MediaCandidate): { compatible: boolean; licenseType: string; attribution: string } {
  const license = determineLicense(c.source, c.sourceUrl);
  const compatible = isLicenseCompatible(license);
  const attribution = !license.attributionRequired ? '' : `${license.licenseType} via ${c.source}`;
  return { compatible, licenseType: license.licenseType, attribution };
}

// ---------------------------------------------------------------------------
// Candidate type
// ---------------------------------------------------------------------------

export interface MediaCandidate {
  url: string;
  thumbnailUrl?: string;
  alt: string;
  source: string;
  sourceUrl?: string;
  width?: number;
  height?: number;
  baseScore: number;
  query: string;
  finalScore: number;
  type: 'image' | 'video';
  /** Resolved full-resolution URL (from fullResResolver) */
  resolvedUrl?: string;
  /** Resolved width after full-res resolution */
  resolvedWidth?: number;
  /** Resolved height after full-res resolution */
  resolvedHeight?: number;
  /** Multi-factor quality scores from Reka Edge */
  qualityFactors?: { sharpness: number; lighting: number; composition: number; vibrancy: number; relevance: number };
  /** Composite quality score (0-200) */
  qualityCompositeScore?: number;
  /** Duration in seconds for video clips */
  duration?: number;
  /** Copyright check result (Task 178) */
  copyrightCheck?: CopyrightCheckResult;
  /** License type (Task 179) */
  license?: string;
  /** Attribution info (Task 179) */
  attribution?: string;
}

// ---------------------------------------------------------------------------
// Advanced Scorer 2.0
// ---------------------------------------------------------------------------

/* @internal */
export function scoreCandidate(
  c: MediaCandidate,
  _topicContext: TopicContext,
  visualConcept?: string,
  sourceType: AppConfig['sourceType'] = 'stock',
  narrationText?: string,
  segmentTitle?: string,
): number {
  let score = c.baseScore;

  if (c.type === 'video') {
    score += sourceType === 'stock' ? 150 : 100;
  }


  // 1. Keyword Relevance
  const meta = (c.alt + ' ' + (c.sourceUrl || '')).toLowerCase();
  const queryWords = c.query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  for (const w of queryWords) {
    if (meta.includes(w)) score += 25;
  }

  // 1b. Segment Title Relevance Boost
  if (segmentTitle) {
    const segmentWords = segmentTitle.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const candidateMeta = (c.alt + ' ' + c.url).toLowerCase();
    const hasSegmentWord = segmentWords.some(w => candidateMeta.includes(w));
    if (hasSegmentWord) {
      score += 20;
    }
  }

  // 2. Vibe Match
  if (visualConcept) {
    const vibeWords = visualConcept.toLowerCase().split(/[,\s]+/).filter(w => w.length > 3);
    for (const w of vibeWords) {
      if (meta.includes(w)) score += 15;
    }
  }

  // 3. Source Authority (consolidated — removed duplicate trust scoring)
  const highTrust = ['reuters', 'apnews', 'bloomberg', 'nytimes', 'wsj', 'cnn', 'bbc', 'theguardian', 'cnbc', 'forbes', 'getty', 'shutterstock', 'adobe', 'alamy'];
  const src = (c.sourceUrl || '').toLowerCase();
  
  // Single authority score — takes the best match, not cumulative
  let authorityScore = 0;
  if (highTrust.some(d => src.includes(d))) {
    authorityScore = 100;
  } else if (c.source === 'Wikimedia Commons') {
    authorityScore = 80;
  } else if (sourceType !== 'stock' && c.source.includes('Wikimedia')) {
    authorityScore = 80;
  } else if (c.source.includes('Google News')) {
    authorityScore = 60;
  } else if (sourceType !== 'stock' && c.source.includes('DuckDuckGo')) {
    authorityScore = 90;
  } else if (sourceType !== 'stock' && c.source.includes('Google')) {
    authorityScore = 80;
  } else if (sourceType === 'stock' && c.source.includes('Unsplash')) {
    authorityScore = 70;
  } else if (sourceType === 'stock' && c.source.includes('Picsum')) {
    authorityScore = 35;
  }
  score += authorityScore;

  // Trust-tier penalty for unknown domains
  if (getDomainTrustTier(c.sourceUrl || c.url) === 'unknown') {
    score -= 50;
  }

  // 4. Resolution & Aspect Ratio (consolidated — removed duplicate scoring)
  if (c.width && c.height) {
    const ratio = c.width / c.height;
    if (ratio > 1.3 && ratio < 1.9) score += 30;
    if (ratio < 0.9) score -= 150;

    // Single resolution tier scoring (replaced duplicate blocks at lines 156-174)
    if (c.width >= 3840 && c.height >= 2160) {
      score += 200; // 4K
    } else if (c.width >= 2560 && c.height >= 1440) {
      score += 100; // 1440p
    } else if (c.width >= 1920 && c.height >= 1080) {
      score += 50; // 1080p
    } else if (c.width >= 1280 && c.height >= 720) {
      score += 0; // 720p baseline
    } else if (c.width * c.height >= 640 * 480) {
      score -= 50; // Below 720p but usable
    } else {
      score -= 150; // Too small
    }
  }

  // 4b. Missing dimensions penalty — images without dimension data get penalized
  if (c.type === 'image' && (c.width === undefined || c.height === undefined)) {
    score -= 200;
  }

  // 4c. HD resolution bonus for images >= 1920x1080
  if (c.type === 'image' && c.width !== undefined && c.height !== undefined) {
    if (c.width >= 1920 && c.height >= 1080) {
      score += 100;
    }
  }

  // 5. Topic Relevance Gate — penalize assets with no keyword overlap with the topic
  const topicWords = (_topicContext.resolvedTitle || _topicContext.topic)
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 2);
  const hasTopicOverlap = topicWords.some(tw => meta.includes(tw));
  if (!hasTopicOverlap && topicWords.length > 0) {
    // Asset metadata has zero overlap with the topic — heavy penalty
    score -= 200;
  }

  // 6. Query Relevance Check — ensure the asset actually matches the search query
  const qWords = c.query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const qMatches = qWords.filter(w => meta.includes(w)).length;
  if (qWords.length >= 2 && qMatches < 2) {
    // Search query was e.g. "AI therapy VCs" but result is about something else
    score -= 100;
  }

  // 7. Negative Keyword Filter — penalize obviously wrong content
  if (!c.query.toLowerCase().includes('black hole') && meta.includes('black hole')) {
    score -= 300;
  }
  if (
    !c.query.toLowerCase().includes('crypto') &&
    !c.query.toLowerCase().includes('blockchain') &&
    (meta.includes('crypto') || meta.includes('blockchain'))
  ) {
    score -= 200;
  }
  // General check: if the alt contains none of the top 2 query words, penalize
  const topQWords = qWords.slice(0, 2);
  if (topQWords.length >= 2) {
    const altLower = c.alt.toLowerCase();
    const altHasAny = topQWords.some(w => altLower.includes(w));
    if (!altHasAny) {
      score -= 150;
    }
  }

  // 8. Entertainment/celebrity content penalty — penalize off-topic entertainment results
  const entertainmentKeywords = ['celebrity', 'traitor', 'winner', 'crowned', 'reality tv', 'love island', 'big brother'];
  if (entertainmentKeywords.some(kw => meta.includes(kw)) && !c.query.toLowerCase().includes('celebrity')) {
    score -= 250;
  }

  // 8b. Off-brand visuals (puppets/cartoons/insects) — tank serious news B-roll
  const offBrand =
    /\b(puppet|muppet|marionette|sock\s*puppet|claymation|stop[\s-]?motion|cartoon|anime|animated\s+character|minecraft|fortnite|gameplay|macro\s*insect|beetle|dung\s*beetle|insect|bug\s+macro|larva|caterpillar|spider\s+macro|wildlife\s+macro|hud\s+graphic|sci[\s-]?fi\s+hud)\b/i;
  if (offBrand.test(meta) && !offBrand.test(c.query)) {
    score -= 400;
  }

  // 8b2. Nursing abuse topics: demote office/architecture, boost CCTV/care
  const topicLower = `${_topicContext?.topic || ''} ${_topicContext?.resolvedTitle || ''} ${c.query || ''}`.toLowerCase();
  const nursingTopic = /nursing\s*home|elder\s*abuse|care\s*home/.test(topicLower);
  if (nursingTopic) {
    if (/\b(office|corporate|skyline|architectural|conference room|business district|glass building)\b/i.test(meta)) {
      score -= 350;
    }
    if (/\b(cctv|surveillance|camera|nursing|elderly|caregiver|care home|wheelchair|hallway)\b/i.test(meta)) {
      score += 200;
    }
  }

  // 8c. Prefer bright B-roll when loop flagged muddy/dark frames
  const preferBright =
    (typeof sessionStorage !== 'undefined'
      && sessionStorage.getItem('autotube_loop_prefer_bright') === 'true')
    || (typeof process !== 'undefined'
      && process.env?.AUTOTUBE_PREFER_BRIGHT_BROLL === '1');
  if (preferBright) {
    if (/\b(night|dark|silhouette|low.?light|underexposed|dimly|shadowy|black background)\b/i.test(meta)) {
      score -= 180;
    }
    if (/\b(daylight|sunny|bright|well.?lit|office daylight|window light)\b/i.test(meta)) {
      score += 80;
    }
  }

  // 9. Picsum Penalty — generic random photos should NEVER outrank real DDG/Wikimedia results
  if (c.source.includes('Picsum')) {
    score -= 200;
  }

  // 9a. Junk harvest URLs — video play-button thumbs, avatars, not real B-roll
  const urlLower = (c.url || '').toLowerCase();
  if (
    urlLower.includes('gravatar.com/avatar') ||
    /tse\d\.mm\.bing\.net\/th\/id\/ovp/i.test(urlLower) ||
    urlLower.includes('/th/id/ovp.') ||
    (!isLoopVideoFirst() && /\.webp(?:[?#]|$)/.test(urlLower)) ||
    (!isLoopVideoFirst() && /\.avif(?:[?#]|$)/.test(urlLower))
  ) {
    score -= 450;
  }

  // 9b. Curated stock API penalty — Pexels/Pixabay/Unsplash are secondary B-roll, not primary sourcing
  if (isSecondaryStockSource(c.source) && !c.source.includes('Picsum')) {
    score -= 90;
    // Extra hit when metadata doesn't match query terms (common with generic stock alts)
    const altHasQueryWord = qWords.some((w) => meta.includes(w));
    if (qWords.length >= 2 && !altHasQueryWord) {
      score -= 80;
    }
  }

  // 9c. Deep Harvest boost — images extracted from topic-specific article pages
  if (c.source.includes('Deep Harvest')) {
    score += 45;
  }

  // 9d. Primary web source boost when metadata matches the segment topic
  if (isPrimaryWebSource(c.source) && hasTopicOverlap) {
    score += 35;
  }

  // 10. Small image penalty — likely icons or thumbnails (#12)
  if (c.width && c.height && c.width < 200 && c.height < 200) {
    score -= 300;
  }

  // 11. SVG penalty — SVGs don't render well as video backgrounds (#12)
  if (c.url.toLowerCase().endsWith('.svg')) {
    score -= 200;
  }

  // 12. Video clip enhancement scoring (HD Media Acquisition)
  if (c.type === 'video') {
    if (isLoopVideoFirst()) {
      score += 120;
      if (isPrimaryWebSource(c.source) || /archive\.org|pexels|pixabay/i.test(c.source)) {
        score += 80;
      }
    }
    // +50 bonus for video clips with duration metadata (implies motion content)
    if (c.duration && c.duration > 0) {
      score += 50;
    }
    // -150 penalty for portrait-orientation clips (aspect ratio < 1.2:1)
    if (c.width && c.height && c.height > 0) {
      const videoRatio = c.width / c.height;
      if (videoRatio < 1.2) {
        score -= 150;
      }
      // +30 bonus for landscape clips with ideal aspect ratio (1.6:1 to 1.9:1)
      if (videoRatio >= 1.6 && videoRatio <= 1.9) {
        score += 30;
      }
    }
  }

  // 13. Emotional alignment scoring — contextual tone matching beyond keyword relevance
  // Scores image-to-line fit by emotional and contextual alignment, not just keyword match.
  // Rewards visuals that provide concrete translation of abstract concepts and penalizes
  // visuals that are technically relevant but emotionally weak.
  if (visualConcept) {
    const conceptLower = visualConcept.toLowerCase();
    const altLower = c.alt.toLowerCase();

    // Emotional tone keywords grouped by category
    const emotionalToneMap: Record<string, string[]> = {
      fear: ['distressed', 'fear', 'panic', 'worried', 'anxious', 'scared', 'alarmed', 'terrified', 'vulnerable'],
      urgency: ['urgent', 'emergency', 'critical', 'breaking', 'alert', 'warning', 'danger', 'crisis'],
      loss: ['loss', 'stolen', 'hacked', 'breach', 'destroyed', 'ruined', 'bankrupt', 'shutdown'],
      trust: ['secure', 'protected', 'safe', 'shield', 'verified', 'trusted', 'reliable'],
      human: ['person', 'people', 'face', 'hands', 'family', 'worker', 'employee', 'victim', 'owner'],
    };

    // Determine the emotional tone requested by the visual concept
    let emotionalAlignmentBonus = 0;
    for (const [_tone, keywords] of Object.entries(emotionalToneMap)) {
      const conceptHasTone = keywords.some(kw => conceptLower.includes(kw));
      const altHasTone = keywords.some(kw => altLower.includes(kw));
      if (conceptHasTone && altHasTone) {
        // Strong emotional alignment — visual matches the requested emotional tone
        emotionalAlignmentBonus += 20;
      }
    }
    score += emotionalAlignmentBonus;

    // Concrete visual translation scoring — reward visuals that translate abstract
    // concepts into tangible imagery (e.g., "bank account" → banking visuals)
    const concreteTranslations: Record<string, string[]> = {
      'bank': ['bank', 'money', 'cash', 'atm', 'wallet', 'payment', 'financial'],
      'identity': ['id', 'passport', 'login', 'credential', 'profile', 'personal'],
      'hack': ['screen', 'alert', 'warning', 'lock', 'breach', 'phishing', 'malware'],
      'business': ['office', 'company', 'workplace', 'desk', 'meeting', 'corporate'],
      'infrastructure': ['power', 'grid', 'pipeline', 'network', 'server', 'cable'],
    };

    let concreteTranslationBonus = 0;
    for (const [abstractConcept, concreteVisuals] of Object.entries(concreteTranslations)) {
      if (conceptLower.includes(abstractConcept)) {
        const hasConcreteVisual = concreteVisuals.some(cv => altLower.includes(cv));
        if (hasConcreteVisual) {
          concreteTranslationBonus += 15;
        }
      }
    }
    score += concreteTranslationBonus;

    // Penalize emotionally weak visuals — technically relevant but lacking emotional weight
    // These are generic/abstract visuals when the concept requests emotional content
    const conceptRequestsEmotion = Object.values(emotionalToneMap)
      .flat()
      .some(kw => conceptLower.includes(kw));
    if (conceptRequestsEmotion) {
      const weakVisualIndicators = ['abstract', 'pattern', 'texture', 'background', 'gradient', 'geometric', 'generic', 'stock'];
      const isEmotionallyWeak = weakVisualIndicators.some(ind => altLower.includes(ind));
      if (isEmotionallyWeak) {
        score -= 30; // Penalize emotionally weak visuals when emotional tone is requested
      }
    }
  }

  // 14. Duplicate image detection — penalize reuse of same URL or near-duplicates
  // Uses the module-level deduplicationRegistry to detect exact URL reuse (-400)
  // and near-duplicates with same domain+alt (-200)
  {
    const dedupPenalty = getDeduplicationPenalty(deduplicationRegistry, c);
    if (dedupPenalty !== 0) {
      score += dedupPenalty;
    }
  }

  // 15. Emotional clarity scoring — prioritize footage with clear human emotion,
  // cause-and-effect, strong silhouette/readability, and penalize visually vague clips.
  // Rewards consequence-focused imagery over process imagery (e.g., "hackers typing").
  {
    const altLower = (c.alt || '').toLowerCase();

    // 15a. Human emotion indicators — reward clips showing clear human emotion
    const humanEmotionKeywords = ['face', 'person', 'reaction', 'distressed', 'worried', 'crying',
      'shocked', 'angry', 'frustrated', 'relieved', 'smiling', 'fearful', 'concerned',
      'expression', 'emotion', 'people', 'victim', 'survivor'];
    const emotionMatches = humanEmotionKeywords.filter(kw => altLower.includes(kw)).length;
    score += Math.min(emotionMatches * 10, 30); // Cap at +30

    // 15b. Cause-and-effect imagery — reward visuals showing consequences/results
    const causeEffectKeywords = ['before', 'after', 'result', 'consequence', 'impact',
      'damage', 'destroyed', 'broken', 'collapsed', 'aftermath', 'effect', 'outcome',
      'loss', 'shutdown', 'frozen', 'locked', 'breach', 'stolen'];
    const causeEffectMatches = causeEffectKeywords.filter(kw => altLower.includes(kw)).length;
    score += Math.min(causeEffectMatches * 8, 24); // Cap at +24

    // 15c. Strong silhouette and immediate readability — reward clear subjects
    const readabilityKeywords = ['clear', 'close-up', 'closeup', 'portrait', 'silhouette',
      'contrast', 'bold', 'sharp', 'focused', 'isolated', 'prominent', 'dramatic'];
    const readabilityMatches = readabilityKeywords.filter(kw => altLower.includes(kw)).length;
    score += Math.min(readabilityMatches * 8, 16); // Cap at +16

    // 15d. Penalize visually vague imagery — reject clips that are technically on-topic
    // but lack emotional clarity
    const vagueKeywords = ['abstract', 'blurry', 'generic', 'pattern', 'texture',
      'gradient', 'background', 'wallpaper', 'decorative', 'conceptual art', 'digital art'];
    const vagueMatches = vagueKeywords.filter(kw => altLower.includes(kw)).length;
    score -= vagueMatches * 15; // -15 per vague indicator

    // 15e. Penalize "hackers typing" cliché imagery — prefer consequences over process
    const clicheKeywords = ['hacker typing', 'hackers typing', 'typing on keyboard',
      'hooded hacker', 'dark hoodie', 'code on screen', 'matrix code',
      'green text on black', 'binary code', 'hacker in hoodie'];
    const hasCliche = clicheKeywords.some(kw => altLower.includes(kw));
    if (hasCliche) {
      score -= 25; // Penalize cliché hacker imagery
    }

    // 15f. Reward consequence-focused imagery over process imagery
    // Human-centered visuals are preferred over abstract tech backgrounds
    const humanCenteredKeywords = ['office', 'workplace', 'employee', 'business owner',
      'customer', 'family', 'home', 'shop', 'hospital', 'school', 'bank'];
    const abstractTechKeywords = ['circuit board', 'motherboard', 'network diagram',
      'server rack', 'data center', 'fiber optic', 'digital network'];
    const hasHumanCentered = humanCenteredKeywords.some(kw => altLower.includes(kw));
    const hasAbstractTech = abstractTechKeywords.some(kw => altLower.includes(kw));
    if (hasHumanCentered && !hasAbstractTech) {
      score += 15; // Prefer human-centered visuals
    }
    if (hasAbstractTech && !hasHumanCentered) {
      score -= 10; // Penalize abstract tech when no human element present
    }
  }

  // 16. Watermark domain penalty — penalize candidates from known watermarked-stock domains
  {
    const candidateUrl = c.url || '';
    const candidateSourceUrl = c.sourceUrl || '';
    let hostname = '';
    try { hostname = new URL(candidateUrl).hostname; } catch { /* ignore */ }
    let sourceHostname = '';
    try { sourceHostname = new URL(candidateSourceUrl).hostname; } catch { /* ignore */ }

    const hasWatermarkDomain = WATERMARK_DOMAINS.some(
      domain => hostname.includes(domain) || sourceHostname.includes(domain)
    );
    if (hasWatermarkDomain) {
      score += WATERMARK_DOMAIN_PENALTY; // -500
    }
  }

  // 17. Watermark indicator string penalty — penalize candidates with watermark indicators in alt/URL
  {
    const altLower = (c.alt || '').toLowerCase();
    const urlLower = (c.url || '').toLowerCase();
    const hasWatermarkIndicator = WATERMARK_INDICATORS.some(
      indicator => altLower.includes(indicator) || urlLower.includes(indicator)
    );
    if (hasWatermarkIndicator) {
      score += WATERMARK_INDICATOR_PENALTY; // -300
    }
  }

  // 18. Keyword match relevance scoring — require at least 2 keyword matches between
  // candidate alt text and segment narration for a positive relevance contribution.
  // If narrationText is provided, count shared keywords (words > 2 chars).
  // If matches < 2, ensure relevance score component is non-positive.
  if (narrationText) {
    const altWords = new Set(
      (c.alt || '').toLowerCase().split(/\s+/).filter(w => w.length > 2)
    );
    const narrationWords = new Set(
      narrationText.toLowerCase().split(/\s+/).filter(w => w.length > 2)
    );
    let keywordMatches = 0;
    for (const word of altWords) {
      if (narrationWords.has(word)) {
        keywordMatches++;
      }
    }
    if (keywordMatches < 2) {
      // Relevance component is non-positive: apply penalty
      score += RELEVANCE_LOW_MATCH_PENALTY; // -100
    } else {
      // Positive relevance bonus for well-matched candidates
      score += keywordMatches * 15;
    }
  }

  // 19. Contextual mismatch penalty — penalize candidates whose alt text contains
  // domain-specific terms unrelated to the narration/topic context.
  {
    const altLower = (c.alt || '').toLowerCase();
    const contextText = (narrationText || _topicContext.topic || '').toLowerCase();
    for (const [_domain, terms] of Object.entries(UNRELATED_DOMAIN_TERMS)) {
      const altHasDomainTerm = terms.some(term => altLower.includes(term));
      if (altHasDomainTerm) {
        // Check if the narration/topic also relates to this domain
        const contextRelatesToDomain = terms.some(term => contextText.includes(term));
        if (!contextRelatesToDomain) {
          score += CONTEXTUAL_MISMATCH_PENALTY; // -250
          break; // Only apply once
        }
      }
    }
  }

  // 20. Copyright claim prevention — heavily penalize assets from known copyrighted sources
  {
    const copyrightResult = checkCopyright(c);
    if (copyrightResult.licenseStatus === 'blocked') {
      score -= 800; // Severe penalty for blocked copyrighted sources
    } else if (copyrightResult.licenseStatus === 'unverified') {
      score -= 200; // Moderate penalty for unverified sources
    }

    // Bonus for known free/CC sources
    const knownLicense = LICENSED_SOURCES[c.source];
    if (knownLicense) {
      score += 100; // Strong bonus for verified free sources
    }
  }

  return score;
}

// ---------------------------------------------------------------------------
// Zero-Cost Harvesters
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// DDG raw result shape (from the Vite dev-server proxy)
// ---------------------------------------------------------------------------
interface DDGImageResult {
  image?: string;
  thumbnail?: string;
  title?: string;
  url?: string;
  width?: number;
  height?: number;
}

/**
 * Attempt to upgrade a thumbnail/proxy URL to a full-size image URL.
 * Handles common CDN patterns to extract the actual source image.
 */
function upgradeToFullSize(url: string): string {
  try {
    const parsed = new URL(url);
    // Extract actual image URL from DuckDuckGo's proxy wrapper
    if (parsed.hostname.includes('duckduckgo.com') && parsed.searchParams.has('u')) {
      const u = parsed.searchParams.get('u');
      if (u) return u;
    }
  } catch {
    // ignore
  }

  // Strip WordPress-style dimension suffixes (-NNNxNNN before extension)
  url = url.replace(/-\d+x\d+(\.\w+)(?=[?#]|$)/, '$1');

  // Upgrade common thumbnail path patterns to full-size paths
  url = url.replace(/\/thumb\//, '/');
  url = url.replace(/\/thumbnail\//, '/');
  url = url.replace(/\/small\//, '/');
  url = url.replace(/\/medium\//, '/');

  return url;
}

/**
 * Level 1: Local DDG Scraper (100% Free, High Intent)
 *
 * This relies on the Vite dev-server proxy at /api/search.
 * In production (static single-file build) the proxy is unavailable, so
 * this function returns an empty array and the harvester falls back to
 * Wikimedia Commons, Unsplash, and Picsum automatically.
 */
/* @internal */
export async function searchDDGLocal(query: string, signal?: AbortSignal): Promise<MediaCandidate[]> {
  try {
    const res = await fetchWithTimeout(`/api/search?q=${encodeURIComponent(query + ' high resolution free')}`, {}, {
      timeoutMs: 15_000,
      maxRetries: 1,
      signal,
    });
    if (!res.ok) {
      // 404 in production (no proxy) or any other failure — silent fallback.
      if (res.status !== 404) {
        logger.warn('DDG Scraper', `Proxy search failed for "${query}" (Status: ${res.status})`);
      }
      return [];
    }
    const data: unknown = await res.json();
    if (!data || typeof data !== 'object') return [];
    const results = (data as Record<string, unknown>).results;
    if (!Array.isArray(results)) return [];

    const candidates: MediaCandidate[] = (results as DDGImageResult[])
      .map((img) => {
        try {
          if (!img.image) return null;
          const hostname = img.url ? new URL(img.url).hostname : 'unknown';
          const upgradedImage = upgradeToFullSize(img.image);
          return {
            url: upgradedImage,
            thumbnailUrl: img.thumbnail,
            alt: img.title || query,
            source: `DuckDuckGo · ${hostname}`,
            sourceUrl: img.url,
            width: img.width,
            height: img.height,
            baseScore: 180,
            query,
            finalScore: 0,
            type: 'image' as const,
          } satisfies MediaCandidate;
        } catch {
          return null;
        }
      })
      .filter((c) => c !== null) as MediaCandidate[];

    logger.info('DDG Scraper', `Found ${candidates.length} free images for "${query}"`);
    return candidates;
  } catch (err) {
    logger.warn('DDG Scraper', `Exception for "${query}" — likely production build without proxy`, err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// DDG Video result shape (from the Vite dev-server proxy at /api/search-videos)
// ---------------------------------------------------------------------------
interface DDGVideoResult {
  content?: string;
  title?: string;
  description?: string;
  images?: { large?: string };
  duration?: string;
  embed_url?: string;
}

/**
 * Parse a DDG duration string like "1:30" or "5:00" into total seconds.
 * Returns Infinity for unparseable strings so they get filtered out.
 */
export function parseDurationToSeconds(dur?: string): number {
  if (!dur) return Infinity;
  const parts = dur.split(':').map(Number);
  if (parts.some(isNaN)) return Infinity;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  return Infinity;
}

/**
 * Level 1b: DDG Video Search (100% Free, High Intent)
 *
 * Relies on the Vite dev-server proxy at /api/search-videos.
 * In production (static single-file build) the proxy is unavailable, so
 * this function returns an empty array and the harvester falls back to
 * image-only sources automatically.
 *
 * Filters out videos longer than 5 minutes and limits to top 3 results.
 */
/* @internal */
export async function searchDDGVideos(query: string, signal?: AbortSignal): Promise<MediaCandidate[]> {
  try {
    const res = await fetchWithTimeout(`/api/search-videos?q=${encodeURIComponent(query)}`, {}, {
      timeoutMs: 15_000,
      maxRetries: 1,
      signal,
    });
    if (!res.ok) {
      if (res.status !== 404) {
        logger.warn('DDG Video', `Proxy video search failed for "${query}" (Status: ${res.status})`);
      }
      return [];
    }
    const data: unknown = await res.json();
    if (!data || typeof data !== 'object') return [];
    const results = (data as Record<string, unknown>).results;
    if (!Array.isArray(results)) return [];

    const MAX_DURATION_SECONDS = 10 * 60; // 10 minutes (was 5 min — too restrictive)
    const MAX_RESULTS = 10; // Increased from 3 for better selection

    const candidates: MediaCandidate[] = (results as DDGVideoResult[])
      .filter((v) => {
        if (!v.content) return false;
        const seconds = parseDurationToSeconds(v.duration);
        return seconds <= MAX_DURATION_SECONDS;
      })
      .slice(0, MAX_RESULTS)
      .map((v) => {
        try {
          const clipUrl = `/api/download-clip?url=${encodeURIComponent(v.content!)}&duration=10`;
          return {
            url: clipUrl,
            thumbnailUrl: v.images?.large,
            alt: v.title || query,
            source: 'DuckDuckGo Video',
            sourceUrl: v.content,
            width: undefined,
            height: undefined,
            baseScore: 200,
            query,
            finalScore: 0,
            type: 'video' as const,
          } satisfies MediaCandidate;
        } catch {
          return null;
        }
      })
      .filter((c) => c !== null) as MediaCandidate[];

    logger.info('DDG Video', `Found ${candidates.length} video clips for "${query}"`);
    return candidates;
  } catch (err) {
    logger.warn('DDG Video', `Exception for "${query}" — likely production build without proxy`, err);
    return [];
  }
}



/**
 * Level 2: Wikimedia Commons (100% Free, High Authority)
 */
/* @internal */
export async function searchWikimedia(query: string, signal?: AbortSignal): Promise<MediaCandidate[]> {
  try {
    const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=10&gsrnamespace=6&iiprop=url|size|extlinks&iiurlwidth=3840&origin=*`;
    const res = await fetchWithTimeout(url, {}, {
      timeoutMs: 15_000,
      maxRetries: 1,
      signal,
    });
    if (!res.ok) return [];
    
    const data = await res.json();
    if (!data.query || !data.query.pages) return [];

    const candidates: MediaCandidate[] = Object.values(data.query.pages).map((page: unknown) => {
      const p = page as WikimediaPage;
      const info = p.imageinfo?.[0];
      if (!info || !info.url) return null;
      return {
        url: info.url,
        alt: p.title || query,
        source: 'Wikimedia Commons',
        sourceUrl: info.descriptionshorturl || info.url,
        width: info.width,
        height: info.height,
        baseScore: 160,
        query,
        finalScore: 0,
        type: 'image' as const,
      } satisfies MediaCandidate;
    }).filter((c) => c !== null) as MediaCandidate[];
    
    const finalCandidates = candidates.filter((c) => !c.url.toLowerCase().endsWith('.svg'));

    logger.info('Wikimedia', `Found ${finalCandidates.length} free assets for "${query}"`);
    return finalCandidates;
  } catch (err) {
    return [];
  }
}

export async function searchBingImages(query: string, signal?: AbortSignal): Promise<MediaCandidate[]> {
  try {
    const res = await fetchWithTimeout(`/api/search-bing-images?q=${encodeURIComponent(query)}`, {}, {
      timeoutMs: 15_000,
      maxRetries: 1,
      signal,
    });
    if (!res.ok) return [];
    const data: unknown = await res.json();
    if (!data || typeof data !== 'object') return [];
    const results = (data as Record<string, unknown>).results;
    if (!Array.isArray(results)) return [];

    const candidates: MediaCandidate[] = results.map((img: any) => {
      try {
        if (!img.url) return null;
        const hostname = new URL(img.url).hostname;
        return {
          url: img.url,
          thumbnailUrl: img.thumbnailUrl || img.url,
          alt: img.title || query,
          source: `Bing Images · ${hostname}`,
          sourceUrl: img.sourceUrl || img.url,
          width: img.width,
          height: img.height,
          baseScore: 170,
          query,
          finalScore: 0,
          type: 'image' as const,
        } satisfies MediaCandidate;
      } catch {
        return null;
      }
    }).filter((c) => c !== null) as MediaCandidate[];

    logger.info('Bing Images', `Found ${candidates.length} images for "${query}"`);
    return candidates;
  } catch (err) {
    logger.warn('Bing Images', `Exception for "${query}"`, err);
    return [];
  }
}

export async function searchGoogleImages(query: string, signal?: AbortSignal): Promise<MediaCandidate[]> {
  try {
    const res = await fetchWithTimeout(`/api/search-google-images?q=${encodeURIComponent(query)}`, {}, {
      timeoutMs: 15_000,
      maxRetries: 1,
      signal,
    });
    if (!res.ok) return [];
    const data: unknown = await res.json();
    if (!data || typeof data !== 'object') return [];
    const results = (data as Record<string, unknown>).results;
    if (!Array.isArray(results)) return [];

    const candidates: MediaCandidate[] = results.map((img: any) => {
      try {
        if (!img.url) return null;
        const hostname = new URL(img.url).hostname;
        return {
          url: img.url,
          thumbnailUrl: img.thumbnailUrl || img.url,
          alt: img.title || query,
          source: `Google Images · ${hostname}`,
          sourceUrl: img.sourceUrl || img.url,
          width: img.width,
          height: img.height,
          baseScore: 170,
          query,
          finalScore: 0,
          type: 'image' as const,
        } satisfies MediaCandidate;
      } catch {
        return null;
      }
    }).filter((c) => c !== null) as MediaCandidate[];

    logger.info('Google Images', `Found ${candidates.length} images for "${query}"`);
    return candidates;
  } catch (err) {
    logger.warn('Google Images', `Exception for "${query}"`, err);
    return [];
  }
}

export async function searchYandexImages(query: string, signal?: AbortSignal): Promise<MediaCandidate[]> {
  try {
    const res = await fetchWithTimeout(`/api/search-yandex-images?q=${encodeURIComponent(query)}`, {}, {
      timeoutMs: 15_000,
      maxRetries: 1,
      signal,
    });
    if (!res.ok) return [];
    const data: unknown = await res.json();
    if (!data || typeof data !== 'object') return [];
    const results = (data as Record<string, unknown>).results;
    if (!Array.isArray(results)) return [];

    const candidates: MediaCandidate[] = results.map((img: any) => {
      try {
        if (!img.url) return null;
        const hostname = new URL(img.url).hostname;
        return {
          url: img.url,
          thumbnailUrl: img.thumbnailUrl || img.url,
          alt: img.title || query,
          source: `Startpage Images · ${hostname}`,
          sourceUrl: img.sourceUrl || img.url,
          width: img.width,
          height: img.height,
          baseScore: 170,
          query,
          finalScore: 0,
          type: 'image' as const,
        } satisfies MediaCandidate;
      } catch {
        return null;
      }
    }).filter((c) => c !== null) as MediaCandidate[];

    logger.info('Startpage Images', `Found ${candidates.length} images for "${query}"`);
    return candidates;
  } catch (err) {
    logger.warn('Startpage Images', `Exception for "${query}"`, err);
    return [];
  }
}

export async function searchDuckDuckGoImages(query: string, signal?: AbortSignal): Promise<MediaCandidate[]> {
  try {
    const res = await fetchWithTimeout(`/api/search-duckduckgo-images?q=${encodeURIComponent(query)}`, {}, {
      timeoutMs: 15_000,
      maxRetries: 1,
      signal,
    });
    if (!res.ok) return [];
    const data: unknown = await res.json();
    if (!data || typeof data !== 'object') return [];
    const results = (data as Record<string, unknown>).results;
    if (!Array.isArray(results)) return [];

    const candidates: MediaCandidate[] = results.map((img: any) => {
      try {
        if (!img.url) return null;
        const hostname = new URL(img.url).hostname;
        const upgradedUrl = upgradeToFullSize(img.url);
        return {
          url: upgradedUrl,
          thumbnailUrl: img.thumbnailUrl || img.url,
          alt: img.title || query,
          source: `DuckDuckGo Images · ${hostname}`,
          sourceUrl: img.sourceUrl || img.url,
          width: img.width,
          height: img.height,
          baseScore: 170,
          query,
          finalScore: 0,
          type: 'image' as const,
        } satisfies MediaCandidate;
      } catch {
        return null;
      }
    }).filter((c) => c !== null) as MediaCandidate[];

    logger.info('DuckDuckGo Images', `Found ${candidates.length} images for "${query}"`);
    return candidates;
  } catch (err) {
    logger.warn('DuckDuckGo Images', `Exception for "${query}"`, err);
    return [];
  }
}

export async function searchStaticMap(query: string, signal?: AbortSignal): Promise<MediaCandidate[]> {
  try {
    const res = await fetchWithTimeout(`/api/static-map?q=${encodeURIComponent(query)}`, {}, {
      timeoutMs: 15_000,
      maxRetries: 1,
      signal,
    });
    if (!res.ok) return [];
    const data: unknown = await res.json();
    if (!data || typeof data !== 'object') return [];
    const results = (data as Record<string, unknown>).results;
    if (!Array.isArray(results)) return [];

    const candidates: MediaCandidate[] = results.map((img: any) => {
      try {
        if (!img.url) return null;
        return {
          url: img.url,
          thumbnailUrl: img.thumbnailUrl || img.url,
          alt: img.alt || query,
          source: img.source || 'OpenStreetMap',
          sourceUrl: img.sourceUrl || img.url,
          width: img.width,
          height: img.height,
          baseScore: 190,
          query,
          finalScore: 0,
          type: 'image' as const,
        } satisfies MediaCandidate;
      } catch {
        return null;
      }
    }).filter((c) => c !== null) as MediaCandidate[];

    logger.info('Static Map', `Found ${candidates.length} map candidates for "${query}"`);
    return candidates;
  } catch (err) {
    logger.warn('Static Map', `Exception for "${query}"`, err);
    return [];
  }
}

export async function searchBingVideos(query: string, signal?: AbortSignal): Promise<MediaCandidate[]> {
  try {
    const res = await fetchWithTimeout(`/api/search-bing-videos?q=${encodeURIComponent(query)}`, {}, {
      timeoutMs: 15_000,
      maxRetries: 1,
      signal,
    });
    if (!res.ok) return [];
    const data: unknown = await res.json();
    if (!data || typeof data !== 'object') return [];
    const results = (data as Record<string, unknown>).results;
    if (!Array.isArray(results)) return [];

    const candidates: MediaCandidate[] = results.map((v: any) => {
      try {
        if (!v.url) return null;
        const clipUrl = `/api/download-clip?url=${encodeURIComponent(v.url)}&duration=10`;
        return {
          url: clipUrl,
          thumbnailUrl: v.thumbnailUrl,
          alt: v.title || query,
          source: 'Bing Video',
          sourceUrl: v.url,
          width: undefined,
          height: undefined,
          baseScore: 200,
          query,
          finalScore: 0,
          type: 'video' as const,
        } satisfies MediaCandidate;
      } catch {
        return null;
      }
    }).filter((c) => c !== null) as MediaCandidate[];

    logger.info('Bing Video', `Found ${candidates.length} video clips for "${query}"`);
    return candidates;
  } catch (err) {
    logger.warn('Bing Video', `Exception for "${query}"`, err);
    return [];
  }
}

export async function searchGoogleVideos(query: string, signal?: AbortSignal): Promise<MediaCandidate[]> {
  try {
    const res = await fetchWithTimeout(`/api/search-google-videos?q=${encodeURIComponent(query)}`, {}, {
      timeoutMs: 15_000,
      maxRetries: 1,
      signal,
    });
    if (!res.ok) return [];
    const data: unknown = await res.json();
    if (!data || typeof data !== 'object') return [];
    const results = (data as Record<string, unknown>).results;
    if (!Array.isArray(results)) return [];

    const candidates: MediaCandidate[] = results.map((v: any) => {
      try {
        if (!v.url) return null;
        const clipUrl = `/api/download-clip?url=${encodeURIComponent(v.url)}&duration=10`;
        return {
          url: clipUrl,
          thumbnailUrl: v.thumbnailUrl,
          alt: v.title || query,
          source: 'Google Video',
          sourceUrl: v.url,
          width: undefined,
          height: undefined,
          baseScore: 200,
          query,
          finalScore: 0,
          type: 'video' as const,
        } satisfies MediaCandidate;
      } catch {
        return null;
      }
    }).filter((c) => c !== null) as MediaCandidate[];

    logger.info('Google Video', `Found ${candidates.length} video clips for "${query}"`);
    return candidates;
  } catch (err) {
    logger.warn('Google Video', `Exception for "${query}"`, err);
    return [];
  }
}


// ---------------------------------------------------------------------------
// Typed shapes for external API responses
// ---------------------------------------------------------------------------

interface WikimediaPage {
  title?: string;
  imageinfo?: { url?: string; descriptionshorturl?: string; width?: number; height?: number }[];
}



// ---------------------------------------------------------------------------
// Visual Deduplication Engine
// ---------------------------------------------------------------------------

/**
 * Registry tracking assigned media assets for deduplication within a video project.
 * Tracks exact URL matches and near-duplicates (same domain + normalized alt text).
 */
export interface DeduplicationRegistry {
  /** Exact URL matches */
  usedUrls: Set<string>;
  /** Near-duplicate detection: key is `${domain}::${normalizedAlt}`, value is segmentId */
  usedSignatures: Map<string, string>;
}

/**
 * Creates a fresh deduplication registry for a new video generation run.
 */
export function createDeduplicationRegistry(): DeduplicationRegistry {
  return {
    usedUrls: new Set<string>(),
    usedSignatures: new Map<string, string>(),
  };
}

/**
 * Extracts the domain from a URL, returning 'unknown' on failure.
 */
function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return 'unknown';
  }
}

/**
 * Normalizes alt text for near-duplicate signature comparison.
 * Lowercases, trims, and collapses whitespace.
 */
function normalizeAlt(alt: string): string {
  return (alt || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Registers a media asset in the deduplication registry after it has been assigned to a segment.
 */
export function registerAsset(registry: DeduplicationRegistry, asset: MediaAsset | { url: string; alt?: string; sourceUrl?: string }): void {
  const url = asset.url;
  registry.usedUrls.add(url);

  // Build near-duplicate signature: domain + normalized alt
  const sourceUrl = 'sourceUrl' in asset ? asset.sourceUrl : undefined;
  const domain = extractDomain(sourceUrl || url);
  const alt = 'alt' in asset ? (asset.alt || '') : '';
  const normalized = normalizeAlt(alt);
  if (normalized) {
    const signature = `${domain}::${normalized}`;
    registry.usedSignatures.set(signature, url);
  }
}

/**
 * Returns the deduplication penalty for a candidate based on the registry state.
 * - Returns -400 for exact URL match (already used)
 * - Returns -200 for near-duplicate (same domain + normalized alt text)
 * - Returns 0 if no duplication detected
 */
export function getDeduplicationPenalty(
  registry: DeduplicationRegistry,
  candidate: MediaCandidate,
): number {
  // Exact URL match — strongest penalty
  if (registry.usedUrls.has(candidate.url)) {
    return -400;
  }

  // Near-duplicate: same domain + normalized alt text
  const domain = extractDomain(candidate.sourceUrl || candidate.url);
  const normalized = normalizeAlt(candidate.alt);
  if (normalized) {
    const signature = `${domain}::${normalized}`;
    if (registry.usedSignatures.has(signature)) {
      return -200;
    }
  }

  return 0;
}

// Module-level registry instance (reset at start of each project run)
let deduplicationRegistry: DeduplicationRegistry = createDeduplicationRegistry();

/**
 * Returns the current module-level deduplication registry.
 * Useful for integration wiring and testing.
 */
export function getDeduplicationRegistry(): DeduplicationRegistry {
  return deduplicationRegistry;
}

// Legacy compatibility: usedUrlsMap is now backed by the deduplication registry
// but we keep the segment-index tracking for selectShotCandidate's proximity check
const usedUrlsMap = new Map<string, number>();

let acceptedVisualHashes: string[] = [];

export function resetVisualHashRegistry(): void {
  acceptedVisualHashes = [];
}

export function resetUsedUrlsMap() {
  usedUrlsMap.clear();
  deduplicationRegistry = createDeduplicationRegistry();
  resetVisualHashRegistry();
}

function thumbnailUrlForHash(candidate: MediaCandidate): string | null {
  if (candidate.thumbnailUrl) return candidate.thumbnailUrl;
  if (candidate.type === 'image') return candidate.url;
  return null;
}

function registerVisualHash(_candidate: MediaCandidate, hash: string | null): void {
  if (!hash || !isLoopFastMode()) return;
  acceptedVisualHashes.push(hash);
}

async function hashCandidateThumb(
  candidate: MediaCandidate,
  signal?: AbortSignal,
): Promise<string | null> {
  const thumb = thumbnailUrlForHash(candidate);
  if (!thumb) return null;
  return computeImageAHash(thumb, signal);
}

// ---------------------------------------------------------------------------
// Cascading Resilience Engine 4.1
// ---------------------------------------------------------------------------

async function harvestMediaWithSafetyNet(
  query: string,
  topicContext: TopicContext,
  config: AppConfig,
  visualConcept?: string,
  depth = 0,
  trace: string[] = [],
  signal?: AbortSignal,
  progressCallback?: (message: string, pct: number) => void,
  narrationText?: string,
  segmentTitle?: string,
): Promise<{ candidates: MediaCandidate[], trace: string[] }> {

  // Deduplicate repeated words in the query (e.g. "Boeing's Crisis Boeing" → "Boeing's Crisis")
  const words = query.split(/\s+/);
  const seen = new Set<string>();
  const deduped = words.filter(w => {
    const lower = w.toLowerCase();
    if (seen.has(lower) && lower.length > 3) return false;
    seen.add(lower);
    return true;
  }).join(' ');
  const cleanQuery = deduped || query;
  const loopCtx = isLoopFastMode() ? loopHarvestContext() : { offset: 0, nonce: 0, exclude: new Set<string>() };
  const searchQuery = isLoopFastMode() ? diversifyLoopQuery(cleanQuery, loopCtx) : cleanQuery;

  trace.push(`[S${depth+1}] Query: "${searchQuery}"`);

  // Check signal before starting provider calls
  if (signal?.aborted) {
    return { candidates: [], trace: [...trace, `[S${depth+1}] Aborted before provider calls`] };
  }

  // Task 13.1: Use queryAllProviders from the provider registry instead of inline calls
  progressCallback?.(`Searching sources for '${searchQuery}'...`, 5);
  let candidates = await queryAllProviders(searchQuery, config, signal);
  candidates = candidates.filter(meetsMinimumSize);
  if (loopCtx.exclude.size > 0) {
    const before = candidates.length;
    candidates = candidates.filter((c) => !loopCtx.exclude.has((c.url || '').split('?')[0].toLowerCase()));
    if (before !== candidates.length) {
      trace.push(`[S${depth+1}] Excluded ${before - candidates.length} prior-loop URLs`);
    }
  }

  // Check signal before triggering fallbacks
  if (signal?.aborted) {
    return { candidates: [], trace: [...trace, `[S${depth+1}] Aborted before fallback calls`] };
  }

  if (candidates.length < 5) {
     if (signal?.aborted) return { candidates: [], trace };
     trace.push(`[S${depth+1}] Insufficient free results (${candidates.length} found)`);
     // No paid fallbacks — rely on the fallback chain below instead
  }

  progressCallback?.(`Found ${candidates.length} candidates, filtering...`, 15);

  // Resolution minimum filter (Task 149)
  candidates = candidates.filter(meetsResolutionMinimum);

  // Megapixel minimum filter (ensure sufficient image resolution)
  candidates = candidates.filter(meetsMegapixelMinimum);

  // Aspect ratio validation (Task 150)
  candidates = candidates.filter(meetsAspectRatio);

  // Domain filtering — reject blocked domains before scoring
  const { accepted, rejected } = filterCandidates(candidates);
  for (const { candidate: rejCandidate, pattern, category } of rejected) {
    logger.warn('DomainFilter', `Rejected: ${rejCandidate.url} [${category}] matched pattern "${pattern}"`);
  }

  let scored = accepted.map(c => ({
    ...c,
    finalScore: scoreCandidate(c, topicContext, visualConcept, config.sourceType, narrationText, segmentTitle)
  })).sort((a, b) => b.finalScore - a.finalScore);

  scored = applySecondaryStockPolicy(scored);

  // Vision check — run on top 3 candidates if OpenRouter API key is available
  let visionRejectedAll = false;
  if (config.openRouterKey && scored.length > 0 && !isLoopFastMode()) {
    try {
      const top3Vision = scored.slice(0, 3);
      const visionResults = await batchVisionCheck(top3Vision, config.openRouterKey, { signal });

      if (visionResults.size > 0) {
        let visionRejectedCount = 0;
        for (const candidate of top3Vision) {
          const result = visionResults.get(candidate.url);
          if (!result) continue; // API failure for this candidate — keep as-is

          if (!result.pass) {
            // Remove failed candidates from scored array
            const idx = scored.findIndex(c => c.url === candidate.url);
            if (idx !== -1) {
              scored.splice(idx, 1);
              visionRejectedCount++;
              logger.warn('VisionCheck', `Rejected: ${candidate.url} — issues: ${result.issues.join(', ')}`);
            }
          } else {
            // Boost passing candidates with quality score (scaled to 0-200)
            const idx = scored.findIndex(c => c.url === candidate.url);
            if (idx !== -1) {
              scored[idx] = {
                ...scored[idx],
                finalScore: scored[idx].finalScore + (result.qualityScore * 20),
              };
            }
          }
        }

        // Track if vision check rejected all checked candidates
        if (visionRejectedCount > 0 && visionRejectedCount >= visionResults.size) {
          visionRejectedAll = true;
        }

        // Re-sort after vision adjustments
        scored.sort((a, b) => b.finalScore - a.finalScore);
      }
    } catch (err) {
      // Vision check is non-blocking — log and continue with domain-filtered results
      logger.warn('VisionCheck', 'Vision check failed — continuing with domain-only filtering', err);
    }
  }

  // Watermark/vision fallback: if vision check rejected all top candidates,
  // try dedicated Wikimedia Commons and Unsplash (Picsum) sources before
  // falling through to the general fallback chain.
  if (visionRejectedAll && scored.filter(c => c.finalScore > 100).length < 2 && !signal?.aborted) {
    trace.push(`[S${depth+1}] Vision rejected all top candidates — trying Wikimedia/Unsplash fallback`);
    logger.warn('VisionCheck', `All top candidates rejected — attempting Wikimedia/Unsplash fallback for "${cleanQuery}"`);

    // Step A: Broaden query for watermark-free sources
    const broadenedFallbackQuery = cleanQuery
      .split(/\s+/)
      .filter(w => w.length > 3)
      .slice(0, 3)
      .join(' ') || cleanQuery;

    // Step B: Try Wikimedia Commons directly
    const wikimediaResults = await searchWikimedia(broadenedFallbackQuery, signal);
    if (wikimediaResults.length > 0) {
      const wikiScored = wikimediaResults.map(c => ({
        ...c,
        finalScore: scoreCandidate(c, topicContext, visualConcept, config.sourceType, narrationText, segmentTitle),
      }));
      scored.push(...wikiScored);
      trace.push(`[S${depth+1}] Wikimedia fallback: found ${wikimediaResults.length} candidates`);
    }

    // Step C: Try Unsplash/Picsum as watermark-free source
    const seed = broadenedFallbackQuery.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 30);
    const unsplashFallbacks: MediaCandidate[] = [
      {
        url: `https://picsum.photos/seed/${seed}-wm-fallback/1920/1080`,
        alt: broadenedFallbackQuery,
        source: 'Picsum (Unsplash fallback)',
        baseScore: 30,
        query: cleanQuery,
        finalScore: 0,
        type: 'image',
        width: 1920,
        height: 1080,
      },
      {
        url: `https://picsum.photos/seed/${seed}-wm-fallback2/1280/720`,
        alt: broadenedFallbackQuery,
        source: 'Picsum (Unsplash fallback)',
        baseScore: 30,
        query: cleanQuery,
        finalScore: 0,
        type: 'image',
        width: 1280,
        height: 720,
      },
    ];
    const unsplashScored = unsplashFallbacks.map(c => ({
      ...c,
      finalScore: scoreCandidate(c, topicContext, visualConcept, config.sourceType, narrationText, segmentTitle),
    }));
    scored.push(...unsplashScored);
    trace.push(`[S${depth+1}] Unsplash fallback: added ${unsplashFallbacks.length} candidates`);

    scored.sort((a, b) => b.finalScore - a.finalScore);
  }

  // Resolution stage — resolve full-resolution URLs (with 15s timeout)
  if (scored.length > 0) {
    try {
      const allResolve = isLoopFastMode() ? scored.slice(0, 8) : scored;
      progressCallback?.(`Resolving full-resolution for ${allResolve.length} candidates...`, 35);
      const cache = new MediaCache();
      const resolveSignal = signal
        ? AbortSignal.any([signal, AbortSignal.timeout(15_000)])
        : AbortSignal.timeout(15_000);
      const resolveResults = await batchResolve(allResolve, { signal: resolveSignal, cache });

      for (const candidate of allResolve) {
        const result = resolveResults.get(candidate.url);
        if (result && result.changed) {
          const idx = scored.findIndex(c => c.url === candidate.url);
          if (idx !== -1) {
            scored[idx] = {
              ...scored[idx],
              resolvedUrl: result.resolvedUrl,
              resolvedWidth: result.width,
              resolvedHeight: result.height,
              width: result.width || scored[idx].width,
              height: result.height || scored[idx].height,
            };
          }
        }
      }

      scored.sort((a, b) => b.finalScore - a.finalScore);
    } catch (err) {
      logger.warn('Resolver', 'Batch resolution failed — continuing with original URLs', err);
    }
  }

  // Quality scoring stage — score top 3 candidates after resolution (with 15s timeout)
  if (config.openRouterKey && scored.length > 0 && !isLoopFastMode()) {
    try {
      const top3Quality = scored.slice(0, 3);
      progressCallback?.(`Vision-checking top ${top3Quality.length}...`, 55);
      const qualitySignal = signal
        ? AbortSignal.any([signal, AbortSignal.timeout(15_000)])
        : AbortSignal.timeout(15_000);
      const qualityResults = await batchScoreQuality(top3Quality, visualConcept || '', config.openRouterKey, { signal: qualitySignal });

      for (const candidate of top3Quality) {
        const result = qualityResults.get(candidate.url);
        if (result) {
          const idx = scored.findIndex(c => c.url === candidate.url);
          if (idx !== -1) {
            scored[idx] = {
              ...scored[idx],
              finalScore: scored[idx].finalScore + result.compositeScore,
              qualityFactors: result.factors,
              qualityCompositeScore: result.compositeScore,
            };
          }
        }
      }

      // Re-sort after quality scoring
      scored.sort((a, b) => b.finalScore - a.finalScore);
    } catch (err) {
      logger.warn('QualityScorer', 'Batch quality scoring failed — continuing with existing scores', err);
    }
  }

  // Copyright verification (Task 155): verify license for each candidate
  for (let i = 0; i < scored.length; i++) {
    const c = scored[i];
    const copyright = verifyCopyright(c);
    if (!copyright.compatible) {
      scored[i] = { ...c, finalScore: c.finalScore - 200 };
      logger.info('LicenseCheck', `Incompatible license for ${c.source}: ${copyright.licenseType} — penalized`);
    }
  }
  scored.sort((a, b) => b.finalScore - a.finalScore);

  // Quality gate (Task 147): apply quality gate to top candidates
  for (let i = 0; i < Math.min(scored.length, 5); i++) {
    const gate = passesQualityGate(scored[i]);
    if (!gate.passed) {
      scored[i] = { ...scored[i], finalScore: scored[i].finalScore - 300 };
      logger.info('QualityGate', `Candidate ${scored[i].url.substring(0, 60)} failed quality gate: ${gate.issues.join('; ')}`);
    }
  }
  scored.sort((a, b) => b.finalScore - a.finalScore);

  // Task 13.6: Structured fallback chain
  const viableCandidates = scored.filter(c => c.finalScore > 100);
  if (viableCandidates.length < 2 && depth === 0) {
    trace.push(`[S${depth+1}] Fallback: only ${viableCandidates.length} viable candidates (score > 100)`);

    // Step 1: Broaden query by stripping adjectives/modifiers
    const broadenedQuery = cleanQuery
      .split(/\s+/)
      .filter(w => w.length > 3) // Keep only substantive words
      .slice(0, 3) // Keep at most 3 core words
      .join(' ');

    if (broadenedQuery && broadenedQuery !== cleanQuery && !signal?.aborted) {
      trace.push(`[S${depth+1}] Fallback: broadening query to "${broadenedQuery}"`);
      logger.warn('MediaHarvester', `Fallback activated: broadening query from "${cleanQuery}" to "${broadenedQuery}"`);
      const broadened = await queryAllProviders(broadenedQuery, config, signal);
      const broadScored = broadened.map(c => ({
        ...c,
        finalScore: scoreCandidate(c, topicContext, visualConcept, config.sourceType, narrationText, segmentTitle),
      }));
      scored.push(...broadScored);
      scored.sort((a, b) => b.finalScore - a.finalScore);
    }

    // Step 1b: If broadened query also failed, try topicContext.coreSubject directly
    const stillViableCoreSubject = scored.filter(c => c.finalScore > 100);
    if (stillViableCoreSubject.length < 2 && topicContext.coreSubject && !signal?.aborted) {
      const coreSubjectQuery = topicContext.coreSubject.trim();
      if (coreSubjectQuery && coreSubjectQuery !== cleanQuery && coreSubjectQuery !== broadenedQuery) {
        trace.push(`[S${depth+1}] Fallback: using coreSubject "${coreSubjectQuery}"`);
        logger.warn('MediaHarvester', `Fallback activated: using coreSubject "${coreSubjectQuery}" after broadened query failed`);
        const coreResults = await queryAllProviders(coreSubjectQuery, config, signal);
        const coreScored = coreResults.map(c => ({
          ...c,
          finalScore: scoreCandidate(c, topicContext, visualConcept, config.sourceType, narrationText, segmentTitle),
        }));
        scored.push(...coreScored);
        scored.sort((a, b) => b.finalScore - a.finalScore);
      }
    }

    // Step 1c: Dedicated Wikimedia Commons / Unsplash fallback for watermark-free sources
    const stillViableWmFree = scored.filter(c => c.finalScore > 100);
    if (stillViableWmFree.length < 2 && !signal?.aborted) {
      const wmFreeQuery = broadenedQuery || cleanQuery;
      trace.push(`[S${depth+1}] Fallback: trying dedicated Wikimedia/Unsplash for "${wmFreeQuery}"`);
      logger.warn('MediaHarvester', `Fallback activated: dedicated Wikimedia/Unsplash search for "${wmFreeQuery}"`);

      // Try Wikimedia Commons directly with broadened query
      const wikiResults = await searchWikimedia(wmFreeQuery, signal);
      if (wikiResults.length > 0) {
        const wikiScored = wikiResults.map(c => ({
          ...c,
          finalScore: scoreCandidate(c, topicContext, visualConcept, config.sourceType, narrationText, segmentTitle),
        }));
        scored.push(...wikiScored);
        trace.push(`[S${depth+1}] Wikimedia fallback: found ${wikiResults.length} candidates`);
      }

      // Add Unsplash/Picsum watermark-free candidates
      const wmFreeSeed = wmFreeQuery.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 30);
      scored.push({
        url: `https://picsum.photos/seed/${wmFreeSeed}-clean/1920/1080`,
        alt: wmFreeQuery,
        source: 'Picsum (Fallback)',
        baseScore: 30,
        query: cleanQuery,
        finalScore: scoreCandidate({
          url: `https://picsum.photos/seed/${wmFreeSeed}-clean/1920/1080`,
          alt: wmFreeQuery,
          source: 'Picsum (Fallback)',
          baseScore: 30,
          query: cleanQuery,
          finalScore: 0,
          type: 'image',
          width: 1920,
          height: 1080,
        }, topicContext, visualConcept, config.sourceType, narrationText, segmentTitle),
        type: 'image',
        width: 1920,
        height: 1080,
      });

      scored.sort((a, b) => b.finalScore - a.finalScore);
    }

    // Step 2: Search related entities from TopicContext
    const stillViable = scored.filter(c => c.finalScore > 100);
    if (stillViable.length < 2 && topicContext.entities.length > 0 && !signal?.aborted) {
      const entityQuery = topicContext.entities.slice(0, 2).join(' ');
      trace.push(`[S${depth+1}] Fallback: searching entities "${entityQuery}"`);
      logger.warn('MediaHarvester', `Fallback activated: searching entities "${entityQuery}"`);
      const entityResults = await queryAllProviders(entityQuery, config, signal);
      const entityScored = entityResults.map(c => ({
        ...c,
        finalScore: scoreCandidate(c, topicContext, visualConcept, config.sourceType, narrationText, segmentTitle),
      }));
      scored.push(...entityScored);
      scored.sort((a, b) => b.finalScore - a.finalScore);
    }

    // Step 3: Use Wikipedia hero image
    const stillViable2 = scored.filter(c => c.finalScore > 100);
    if (stillViable2.length < 2 && topicContext.thumbnailUrl) {
      trace.push(`[S${depth+1}] Fallback: using Wikipedia hero image`);
      logger.warn('MediaHarvester', `Fallback activated: using Wikipedia hero image for "${cleanQuery}"`);
      scored.push({
        url: topicContext.thumbnailUrl,
        alt: `Wikipedia: ${topicContext.coreSubject}`,
        source: 'Wikipedia (Hero)',
        baseScore: 120,
        query: cleanQuery,
        finalScore: 120,
        type: 'image',
      });
    }

    // Step 4: Last resort — Picsum stock seeded by segment title
    const stillViable3 = scored.filter(c => c.finalScore > 100);
    if (stillViable3.length < 2) {
      trace.push(`[S${depth+1}] Fallback: using Picsum stock (last resort)`);
      logger.warn('MediaHarvester', `Fallback activated: using Picsum stock (last resort) for "${cleanQuery}"`);
      const seed = cleanQuery.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 30);
      scored.push({
        url: `https://picsum.photos/seed/${seed}-fallback/1920/1080`,
        alt: cleanQuery,
        source: 'Picsum (Fallback)',
        baseScore: 30,
        query: cleanQuery,
        finalScore: 30,
        type: 'image',
        width: 1920,
        height: 1080,
      });
    }
  }

  // Final size filter — remove any too-small images that slipped through fallbacks
  const filteredScored = scored.filter(meetsMinimumSize);
  return { candidates: filteredScored, trace };
}

/**
 * Best heuristic beat-relevance across a segment's beats.
 * Used to demote/reject off-brand stock when VisualBeatSheet is active.
 */
export function bestBeatRelevanceForCandidate(
  candidate: { alt?: string; url?: string; query?: string; source?: string },
  beats?: VisualBeat[] | null,
): { score: number; reject: boolean; reasons: string[] } | null {
  if (!beats?.length) return null;
  let best: { score: number; reject: boolean; reasons: string[] } | null = null;
  for (const beat of beats) {
    const r = scoreCandidateAgainstBeat(candidate, beat);
    if (
      !best
      || (!r.reject && best.reject)
      || (r.reject === best.reject && r.score > best.score)
    ) {
      best = r;
    }
  }
  return best;
}

function rankShotCandidates(
  candidates: MediaCandidate[],
  shot: { concept: string; queries: string[]; vibe: string },
  segmentIndex: number,
  excludedUrls: Set<string>,
  preferredType?: MediaCandidate['type'],
  blockedUrls?: Set<string>,
  beats?: VisualBeat[] | null,
): MediaCandidate[] {
  const shotMeta = `${shot.concept} ${shot.vibe} ${shot.queries.join(' ')}`.toLowerCase();
  const shotTerms = shotMeta.split(/\s+/).filter((word) => word.length > 2);

  return candidates
    .map((candidate) => {
      if (excludedUrls.has(candidate.url)) return null;
      if (blockedUrls?.has(candidate.url)) return null;
      const lastUsed = usedUrlsMap.get(candidate.url);
      if (lastUsed !== undefined && (segmentIndex - lastUsed) <= 3) return null;

      let score = candidate.finalScore;
      const meta = `${candidate.alt} ${(candidate.sourceUrl || '')}`.toLowerCase();

      for (const term of shotTerms) {
        if (meta.includes(term)) score += 10;
      }

      if (candidate.type === 'video') score += 20;
      // MR-2 fix: prefer the specified type (was inverted — rewarding wrong type)
      if (preferredType && candidate.type === preferredType) score += 18;
      if (preferredType && candidate.type !== preferredType) score -= 4;

      if (shot.concept.toLowerCase().includes('chart') && /(chart|graph|market|stock|numbers|data)/i.test(meta)) score += 25;
      if (shot.concept.toLowerCase().includes('portrait') && /(portrait|speaker|interview|person|people)/i.test(meta)) score += 25;
      if (shot.vibe.toLowerCase().includes('urgent') && candidate.type === 'video') score += 15;

      const beatRel = bestBeatRelevanceForCandidate(candidate, beats);
      if (beatRel) {
        if (beatRel.reject) {
          // Heavy demotion — still allow fill if nothing else survives
          score -= 450;
        } else {
          score += Math.round(beatRel.score * 140);
        }
      }

      return { candidate, score };
    })
    .filter((x): x is { candidate: MediaCandidate; score: number } => x != null)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const aPixels = (a.candidate.width ?? 0) * (a.candidate.height ?? 0);
      const bPixels = (b.candidate.width ?? 0) * (b.candidate.height ?? 0);
      return bPixels - aPixels;
    })
    .map((x) => x.candidate);
}

async function pickDistinctShotCandidate(
  candidates: MediaCandidate[],
  shot: { concept: string; queries: string[]; vibe: string },
  segmentIndex: number,
  excludedUrls: Set<string>,
  preferredType?: MediaCandidate['type'],
  blockedUrls?: Set<string>,
  signal?: AbortSignal,
  beats?: VisualBeat[] | null,
): Promise<MediaCandidate | undefined> {
  const ranked = rankShotCandidates(candidates, shot, segmentIndex, excludedUrls, preferredType, blockedUrls, beats);
  for (const candidate of ranked) {
    if (signal?.aborted) return undefined;
    if (!isLoopFastMode()) return candidate;
    if (loopMinAssetsPerSegment() > 0) return candidate;
    const hash = await hashCandidateThumb(candidate, signal);
    if (hash && isSimilarToAny(hash, acceptedVisualHashes)) {
      excludedUrls.add(candidate.url);
      continue;
    }
    registerVisualHash(candidate, hash);
    return candidate;
  }
  return undefined;
}

function buildSpecificQuery(baseQuery: string, topicContext: TopicContext): string {
  const topic = topicContext.topic || topicContext.coreSubject || '';
  let query = baseQuery;
  if (topic) {
    const baseLower = baseQuery.toLowerCase();
    const topicLower = topic.toLowerCase();
    if (!baseLower.includes(topicLower)) {
      query = `${baseQuery} ${topic}`;
    }
  }

  // A+++ Strategy: Automatically append high-fidelity B-roll modifiers to search queries for key themes
  const qLower = query.toLowerCase();
  if (qLower.includes('launch') || qLower.includes('rocket') || qLower.includes('spacex') || qLower.includes('starship') || qLower.includes('flight')) {
    query += ' launch footage archive';
  } else if (qLower.includes('presentation') || qLower.includes('ceo') || qLower.includes('keynote') || qLower.includes('unveil') || qLower.includes('office')) {
    query += ' keynote event stage';
  } else if (qLower.includes('test') || qLower.includes('engine') || qLower.includes('development') || qLower.includes('laboratory')) {
    query += ' close up slow motion';
  }
  return query;
}


export async function sourceSegmentMedia(
  segment: ScriptSegment,
  plan: SegmentVisualPlan,
  topicContext: TopicContext,
  _usedUrls: Set<string>,
  segmentIndex: number,
  config: AppConfig,
  signal?: AbortSignal,
  progressCallback?: (message: string, pct: number) => void,
  beats?: VisualBeat[] | null,
): Promise<{ assets: Omit<MediaAsset, 'id' | 'segmentId'>[]; plan: SegmentVisualPlan; segmentId: string }> {
  try {
    const finalAssets: Omit<MediaAsset, 'id' | 'segmentId'>[] = [];
    const segmentBeats = beats?.length ? beats : null;
    const shotsToHarvest = plan.shots && plan.shots.length > 0
      ? plan.shots
      : [{ concept: plan.visualAction, queries: plan.queries, vibe: plan.visualConcept }];
    const loopMin = loopMinAssetsPerSegment();
    const stockDefault = loopMin > 0 ? loopMin : 2;
    // Loop min must apply in raw mode too — raw≠4-cap when loop asks for 6–8 cuts/seg
    const rawFloor = config.sourceType === 'raw' ? 4 : 2;
    const targetAssetsPerSegment = Math.max(rawFloor, stockDefault);
    const shotCount = Math.max(targetAssetsPerSegment, shotsToHarvest.length);
    const rawPrimaryQuery = shotsToHarvest[0]?.queries[0] || segment.title;
    const primaryQuery = buildSpecificQuery(rawPrimaryQuery, topicContext);
    const { candidates, trace } = await harvestMediaWithSafetyNet(primaryQuery, topicContext, config, shotsToHarvest[0]?.vibe, 0, [], signal, progressCallback, segment.narration, segment.title);

    // Harvest a second batch with a variation query for visual variety
    const rawVariationQuery = shotsToHarvest[1]?.queries[0]
      || (plan.queries.length > 1 ? plan.queries[1] : null)
      || `${segment.title} ${topicContext.coreSubject}`;
    const variationQuery = rawVariationQuery && rawVariationQuery !== primaryQuery
      ? buildSpecificQuery(rawVariationQuery, topicContext)
      : rawVariationQuery;
    let secondaryCandidates: MediaCandidate[] = [];
    const skipVariationHarvest = isLoopFastMode() && loopMinAssetsPerSegment() <= 2;
    if (variationQuery && variationQuery !== primaryQuery && !signal?.aborted && !skipVariationHarvest) {
      try {
        const secondary = await harvestMediaWithSafetyNet(variationQuery, topicContext, config, shotsToHarvest[1]?.vibe || shotsToHarvest[0]?.vibe, 1, [...trace], signal, undefined, segment.narration, segment.title);
        secondaryCandidates = secondary.candidates;
        trace.push(...secondary.trace.filter(t => !trace.includes(t)));
      } catch {
        // Non-critical: if the second harvest fails, we still have the primary batch
      }
    }

    let allCandidates = [...candidates, ...secondaryCandidates];
    const countDistinct = (list: MediaCandidate[]) =>
      list.filter((candidate, index, arr) => arr.findIndex((item) => item.url === candidate.url) === index).length;

    let lastHarvestRound = 2;
    if (loopMin > 0 && !signal?.aborted) {
      const seenQueries = new Set(
        [primaryQuery, variationQuery].filter(Boolean).map((q) => q.toLowerCase()),
      );
      const extraQueryPool = [
        ...(plan.queries || []),
        ...shotsToHarvest.flatMap((shot) => shot.queries || []),
        segment.title,
        `${segment.title} ${topicContext.coreSubject}`,
        `${topicContext.coreSubject} news`,
        `${topicContext.coreSubject} documentary`,
        `${segment.title} b-roll`,
      ];
      let harvestRound = 2;
      const maxExtraRounds = 5;
      while (
        harvestRound < maxExtraRounds + 2 &&
        countDistinct(allCandidates) < targetAssetsPerSegment
      ) {
        const rawExtra = extraQueryPool.find((q) => q && !seenQueries.has(q.toLowerCase()));
        if (!rawExtra) break;
        seenQueries.add(rawExtra.toLowerCase());
        const extraQuery = buildSpecificQuery(rawExtra, topicContext);
        try {
          const extra = await harvestMediaWithSafetyNet(
            extraQuery,
            topicContext,
            config,
            shotsToHarvest[harvestRound % shotsToHarvest.length]?.vibe || shotsToHarvest[0]?.vibe,
            harvestRound,
            [...trace],
            signal,
            undefined,
            segment.narration,
            segment.title,
          );
          allCandidates = [...allCandidates, ...extra.candidates];
          trace.push(...extra.trace.filter((t) => !trace.includes(t)));
        } catch {
          // Non-critical: keep prior candidates if an extra harvest round fails
        }
        harvestRound += 1;
      }
      lastHarvestRound = harvestRound;
    }

    let uniqueCandidates = allCandidates.filter((candidate, index, arr) => arr.findIndex((item) => item.url === candidate.url) === index);
    const rebuildUniqueCandidates = () => {
      uniqueCandidates = allCandidates.filter((candidate, index, arr) => arr.findIndex((item) => item.url === candidate.url) === index);
    };
    const excludedUrls = new Set<string>();
    const blockedUrlsForPick = () => (
      loopMin > 0
        ? new Set([...excludedUrls, ...finalAssets.map((asset) => asset.url)])
        : deduplicationRegistry.usedUrls
    );

    const pushSelectedCandidate = (
      best: MediaCandidate,
      shot: { concept: string; queries: string[]; vibe: string },
      shotType: 'primary' | 'secondary',
      cropMetadata?: { x: number; y: number; width: number; height: number },
    ) => {
      finalAssets.push({
        type: best.type,
        url: best.url,
        thumbnailUrl: best.thumbnailUrl,
        alt: best.alt,
        source: best.source,
        duration: segment.duration / shotCount,
        query: best.query,
        sourceUrl: best.sourceUrl,
        isFallback: best.source.includes('Picsum') || best.source.includes('Fallback'),
        shotType,
        concept: shot.concept,
        reasoning: `Zero-Cost Harvester: ${shotType} shot matched at ${best.source}`,
        score: best.finalScore,
        trace: [...trace, `[S${segmentIndex + 1}] ${shotType} shot selected: ${shot.concept}`],
        cropMetadata,
        qualityFactors: best.qualityFactors,
        resolvedWidth: best.resolvedWidth,
        resolvedHeight: best.resolvedHeight,
        resolvedUrl: best.resolvedUrl,
        license: (() => {
          const lic = determineLicense(best.source, best.sourceUrl);
          return {
            source: lic.source,
            licenseType: lic.licenseType,
            attributionRequired: lic.attributionRequired,
            attributionText: lic.attributionText,
            commercialUse: lic.commercialUse,
          };
        })(),
      });
    };

    for (let i = 0; i < shotsToHarvest.length; i++) {
      const shot = shotsToHarvest[i];
      const shotType = i === 0 ? 'primary' : 'secondary';
      let best = await pickDistinctShotCandidate(
        uniqueCandidates,
        shot,
        segmentIndex,
        excludedUrls,
        i > 0 ? finalAssets[i - 1]?.type : undefined,
        blockedUrlsForPick(),
        signal,
        segmentBeats,
      );

      if (!best) {
        best = await pickDistinctShotCandidate(
          uniqueCandidates,
          shot,
          segmentIndex,
          excludedUrls,
          undefined,
          blockedUrlsForPick(),
          signal,
          segmentBeats,
        );
      }

      // Deduplication fallback: if all candidates were rejected (likely due to dedup penalties),
      // try an alternative query from the secondary shot concept before procedural fallback
      if (!best && shotsToHarvest.length > 1 && !signal?.aborted) {
        const alternativeShot = shotsToHarvest[i === 0 ? 1 : 0];
        const altQuery = alternativeShot.queries[0] || alternativeShot.concept;
        if (altQuery) {
          try {
            const altResult = await harvestMediaWithSafetyNet(altQuery, topicContext, config, alternativeShot.vibe, 1, [...trace], signal, undefined, segment.narration, segment.title);
            const altCandidates = altResult.candidates.filter(c => !excludedUrls.has(c.url) && !deduplicationRegistry.usedUrls.has(c.url));
            best = altCandidates.length > 0 ? altCandidates[0] : undefined;
            if (best) {
              trace.push(`[S${segmentIndex + 1}] Dedup fallback: found alternative via "${altQuery}"`);
            }
          } catch {
            // Non-critical: alternative query failed, proceed to heritage fallback
          }
        }
      }

      if (best) {
        // Final vision gate: scan the selected image before committing it
        if (config.openRouterKey && !signal?.aborted && best.type === 'image' && !isLoopFastMode()) {
          try {
            const visionResult = await checkCandidateVision(best.resolvedUrl || best.url, config.openRouterKey, { signal });
            if (visionResult && !visionResult.pass) {
              logger.warn('VisionGate', `Final check REJECTED ${best.url} — issues: ${visionResult.issues.join(', ')}`);
              excludedUrls.add(best.url);
              // Try next best candidate
              const fallback = await pickDistinctShotCandidate(
                uniqueCandidates,
                shot,
                segmentIndex,
                excludedUrls,
                undefined,
                blockedUrlsForPick(),
                signal,
                segmentBeats,
              );
              if (fallback) {
                best = fallback;
              }
              // If no fallback, proceed with original (better than nothing)
            }
          } catch {
            // Vision gate is non-blocking — if it fails, proceed with the candidate
          }
        }

        usedUrlsMap.set(best.url, segmentIndex);
        registerAsset(deduplicationRegistry, { url: best.url, alt: best.alt, sourceUrl: best.sourceUrl });
        excludedUrls.add(best.url);

        // Task 13.4: Focal cropping after final selection
        let cropMetadata: { x: number; y: number; width: number; height: number } | undefined;
        const assetWidth = best.resolvedWidth || best.width;
        const assetHeight = best.resolvedHeight || best.height;
        if (assetWidth && assetHeight && needsCropping(assetWidth, assetHeight) && config.openRouterKey && !signal?.aborted && !isLoopFastMode()) {
          try {
            const cropResult = await focalCrop(best.resolvedUrl || best.url, assetWidth, assetHeight, config.openRouterKey, { signal });
            cropMetadata = cropResult.crop;
          } catch (err) {
            logger.warn('FocalCropper', `Focal crop failed for ${best.url} — skipping crop`, err);
          }
        }

        pushSelectedCandidate(best, shot, shotType, cropMetadata);
      } else if (topicContext.thumbnailUrl && !deduplicationRegistry.usedUrls.has(topicContext.thumbnailUrl)) {
        finalAssets.push({
          type: 'image',
          url: topicContext.thumbnailUrl,
          alt: `Topic Hub: ${topicContext.coreSubject}`,
          source: 'Wikipedia (Heritage)',
          duration: segment.duration / shotCount,
          isFallback: false,
          shotType,
          concept: shot.concept,
          reasoning: 'Fallback to Subject Heritage.',
          score: 50,
          trace: [...trace, '[S4] Wiki Hero Fallback used.'],
          license: {
            source: 'wikimedia',
            licenseType: 'CC-BY-SA',
            attributionRequired: true,
            attributionText: 'Wikipedia (CC-BY-SA)',
            commercialUse: true,
          },
        });
        usedUrlsMap.set(topicContext.thumbnailUrl, segmentIndex);
        registerAsset(deduplicationRegistry, { url: topicContext.thumbnailUrl, alt: `Topic Hub: ${topicContext.coreSubject}` });
      }
    }

    // Raw harvest needs enough unique B-roll for sub-second cuts. Keep adding
    // distinct candidates so renderer pacing changes actual visuals, not just effects.
    const deficitQueryPool = [
      `${segment.title} stock photo`,
      `${topicContext.coreSubject} news photo`,
      `${segment.title} ${topicContext.coreSubject}`,
      `${topicContext.coreSubject} documentary`,
      `${segment.narration?.slice(0, 80) || segment.title} image`,
      `${segment.title} b-roll footage`,
    ];
    let deficitQueryRound = 0;
    const maxDeficitHarvests = loopMin > 0 ? 10 : 0;
    while (finalAssets.length < targetAssetsPerSegment && !signal?.aborted) {
      const fallbackShot = shotsToHarvest[1] || shotsToHarvest[0];
      const extra = await pickDistinctShotCandidate(
        uniqueCandidates,
        fallbackShot,
        segmentIndex,
        excludedUrls,
        undefined,
        blockedUrlsForPick(),
        signal,
        segmentBeats,
      );
      if (extra) {
        usedUrlsMap.set(extra.url, segmentIndex);
        registerAsset(deduplicationRegistry, { url: extra.url, alt: extra.alt, sourceUrl: extra.sourceUrl });
        excludedUrls.add(extra.url);
        pushSelectedCandidate(extra, fallbackShot, 'secondary');
        finalAssets[finalAssets.length - 1]!.reasoning = `Zero-Cost Harvester: bonus B-roll from ${extra.source}`;
        finalAssets[finalAssets.length - 1]!.trace = [
          ...trace,
          `[S${segmentIndex + 1}] bonus B-roll selected for visual variety`,
        ];
        continue;
      }
      if (deficitQueryRound >= maxDeficitHarvests) break;
      const rawDeficit = deficitQueryPool[deficitQueryRound % deficitQueryPool.length];
      deficitQueryRound += 1;
      const deficitQuery = buildSpecificQuery(`${rawDeficit} ${deficitQueryRound}`, topicContext);
      try {
        const harvested = await harvestMediaWithSafetyNet(
          deficitQuery,
          topicContext,
          config,
          fallbackShot?.vibe,
          lastHarvestRound + deficitQueryRound,
          [...trace],
          signal,
          progressCallback,
          segment.narration,
          segment.title,
        );
        if (!harvested.candidates.length) continue;
        allCandidates = [...allCandidates, ...harvested.candidates];
        rebuildUniqueCandidates();
        trace.push(...harvested.trace.filter((t) => !trace.includes(t)));
      } catch {
        // Non-critical: try the next deficit query
      }
    }

    if (loopMin > 0 && finalAssets.length < targetAssetsPerSegment && !signal?.aborted) {
      try {
        const wikiResults = await searchWikimedia(`${segment.title} ${topicContext.coreSubject}`, signal);
        for (const wiki of wikiResults) {
          if (finalAssets.length >= targetAssetsPerSegment) break;
          if (excludedUrls.has(wiki.url) || finalAssets.some((asset) => asset.url === wiki.url)) continue;
          const fallbackShot = shotsToHarvest[1] || shotsToHarvest[0];
          usedUrlsMap.set(wiki.url, segmentIndex);
          registerAsset(deduplicationRegistry, { url: wiki.url, alt: wiki.alt, sourceUrl: wiki.sourceUrl });
          excludedUrls.add(wiki.url);
          pushSelectedCandidate(
            { ...wiki, finalScore: wiki.finalScore || scoreCandidate(wiki, topicContext, fallbackShot?.vibe, config.sourceType, segment.narration, segment.title) },
            fallbackShot,
            'secondary',
          );
          const last = finalAssets[finalAssets.length - 1]!;
          last.reasoning = `Loop volume fill: Wikimedia heritage for ${segment.title}`;
          last.trace = [...trace, `[S${segmentIndex + 1}] Wikimedia volume top-off`];
        }
      } catch {
        // Non-critical: volume top-off is best-effort
      }
    }

    if (isLoopVideoFirst()) {
      const loopMinVideos = 2;
      let videoCount = finalAssets.filter((asset) => asset.type === 'video').length;
      const videoShot = shotsToHarvest[0];
      while (videoCount < loopMinVideos && !signal?.aborted) {
        const videoPick = await pickDistinctShotCandidate(
          uniqueCandidates,
          videoShot,
          segmentIndex,
          excludedUrls,
          'video',
          blockedUrlsForPick(),
          signal,
          segmentBeats,
        );
        if (!videoPick || videoPick.type !== 'video') break;
        usedUrlsMap.set(videoPick.url, segmentIndex);
        registerAsset(deduplicationRegistry, { url: videoPick.url, alt: videoPick.alt, sourceUrl: videoPick.sourceUrl });
        excludedUrls.add(videoPick.url);
        pushSelectedCandidate(videoPick, videoShot, 'secondary');
        const last = finalAssets[finalAssets.length - 1]!;
        last.reasoning = `Loop video-first: extra motion clip from ${videoPick.source}`;
        last.trace = [...trace, `[S${segmentIndex + 1}] video-first min clip ${videoCount + 1}/${loopMinVideos}`];
        videoCount += 1;
      }
    }

    if (finalAssets.length > 0) {
      const durationPerAsset = segment.duration / finalAssets.length;
      for (const asset of finalAssets) {
        asset.duration = durationPerAsset;
      }
    }

    // Emit progress after selection
    if (finalAssets.length > 0) {
      const selectedAsset = finalAssets[0];
      const selectedWidth = selectedAsset.resolvedWidth || (selectedAsset as unknown as { width?: number }).width;
      const selectedHeight = selectedAsset.resolvedHeight || (selectedAsset as unknown as { height?: number }).height;
      const dims = selectedWidth && selectedHeight ? `, ${selectedWidth}×${selectedHeight}` : '';
      progressCallback?.(`Selected: ${selectedAsset.source}${dims}`, 90);
    }

    // Visual variety pass: check last 3-4 segments to avoid repetition cycles (was only checking 1)
    const DIVERSITY_WINDOW = 4;
    if (segmentIndex > 0) {
      for (let ai = 0; ai < finalAssets.length; ai++) {
        const asset = finalAssets[ai];
        const prevSegUsed = usedUrlsMap.get(asset.url);
        if (prevSegUsed !== undefined && prevSegUsed >= segmentIndex - DIVERSITY_WINDOW && prevSegUsed < segmentIndex) {
          const diversityShot = shotsToHarvest[ai] || shotsToHarvest[0];
          const replacement = await pickDistinctShotCandidate(
            uniqueCandidates.filter(
              (c) =>
                !excludedUrls.has(c.url) &&
                !deduplicationRegistry.usedUrls.has(c.url) &&
                (usedUrlsMap.get(c.url) === undefined || usedUrlsMap.get(c.url)! < segmentIndex - DIVERSITY_WINDOW),
            ),
            diversityShot,
            segmentIndex,
            excludedUrls,
            undefined,
            deduplicationRegistry.usedUrls,
            signal,
            segmentBeats,
          );
          if (replacement) {
            usedUrlsMap.set(replacement.url, segmentIndex);
            registerAsset(deduplicationRegistry, { url: replacement.url, alt: replacement.alt, sourceUrl: replacement.sourceUrl });
            excludedUrls.add(replacement.url);
            finalAssets[ai] = {
              ...asset,
              type: replacement.type,
              url: replacement.url,
              thumbnailUrl: replacement.thumbnailUrl,
              alt: replacement.alt,
              source: replacement.source,
              query: replacement.query,
              sourceUrl: replacement.sourceUrl,
              score: replacement.finalScore,
              reasoning: `${asset.reasoning} → swapped for visual variety (used ${segmentIndex - prevSegUsed} segments ago)`,
            };
          }
        }
      }
    }

    return { segmentId: segment.id, plan, assets: finalAssets };
  } catch (err) {
    // sourceSegmentMedia must NEVER throw — return fallback result on any error
    logger.error('Media Harvester', `sourceSegmentMedia failed for segment "${segment.id}"`, err);
    return { segmentId: segment.id, plan, assets: [] };
  }
}

export async function replaceMediaAsset(
  segment: ScriptSegment,
  plan: SegmentVisualPlan,
  topicContext: TopicContext,
  excludeUrls: Set<string>,
  _segmentIndex: number,
  config: AppConfig,
): Promise<Omit<MediaAsset, 'id' | 'segmentId'>> {
  // Simple replacement logic for consistency
  const { candidates } = await harvestMediaWithSafetyNet(plan.queries[0], topicContext, config, undefined, 0, [], undefined, undefined, segment.narration, segment.title);
  const best = candidates.find(c => !excludeUrls.has(c.url)) || candidates[0];
  if (!best) {
    const fallbackUrl = topicContext.thumbnailUrl;
    return { type: 'image', url: fallbackUrl || '', alt: `Fallback: ${segment.title}`, source: fallbackUrl ? 'Wikipedia' : 'No results', duration: segment.duration / Math.max(1, plan.shots?.length || 1), query: plan.queries[0], isFallback: true, concept: plan.visualAction, reasoning: 'No candidates found for replacement.', score: 0, trace: [] };
  }
  return { type: best.type, url: best.url, thumbnailUrl: best.thumbnailUrl, alt: best.alt, source: best.source, duration: segment.duration / Math.max(1, plan.shots?.length || 1), query: best.query, sourceUrl: best.sourceUrl, isFallback: false, concept: plan.visualAction, reasoning: `Replaced from ${best.source}`, score: best.finalScore, trace: [] };
}

// ---------------------------------------------------------------------------
// Sequence-Level Diversity Scoring (Task 12.2)
// ---------------------------------------------------------------------------

/**
 * Represents the diversity analysis of a media sequence.
 * Used to evaluate whether selected media provides sufficient visual variety.
 */
export interface SequenceDiversityScore {
  /** Overall diversity score from 0 (highly repetitive) to 100 (highly diverse) */
  overallScore: number;
  /** Penalties applied for repeated shot types, sources, or alt-text patterns */
  repetitionPenalties: { reason: string; penalty: number }[];
  /** Risk level (0-1) that the sequence suffers from stock-footage fatigue */
  stockFatigueRisk: number;
  /** Average interval in seconds between fresh (non-repeated) shots */
  freshShotInterval: number;
}

/**
 * Scores the diversity of a sequence of selected media candidates.
 *
 * Evaluates:
 * - Shot type variety (image vs video mix)
 * - Alt-text/content pattern repetition across the sequence
 * - Stock-footage fatigue (same source or style repeated excessively)
 * - Fresh shot intervals (whether new visuals appear every 15-20 seconds)
 *
 * This is a standalone utility called after media selection to evaluate diversity.
 * It does NOT modify scoreCandidate or sourceSegmentMedia.
 *
 * @param selectedMedia - Array of MediaCandidate objects in sequence order
 * @returns SequenceDiversityScore with overall score and breakdown
 */
export function scoreSequenceDiversity(selectedMedia: MediaCandidate[]): SequenceDiversityScore {
  if (selectedMedia.length === 0) {
    return { overallScore: 100, repetitionPenalties: [], stockFatigueRisk: 0, freshShotInterval: 0 };
  }

  if (selectedMedia.length === 1) {
    return { overallScore: 100, repetitionPenalties: [], stockFatigueRisk: 0, freshShotInterval: 0 };
  }

  const penalties: { reason: string; penalty: number }[] = [];
  let totalPenalty = 0;

  // --- 1. Shot type repetition analysis ---
  // Track how often the same "shot type" (derived from alt text keywords) repeats consecutively
  const shotTypeCategories = categorizeShots(selectedMedia);
  const consecutiveRepeatPenalty = scoreConsecutiveRepetition(shotTypeCategories);
  if (consecutiveRepeatPenalty > 0) {
    penalties.push({ reason: 'Consecutive same shot-type repetition', penalty: consecutiveRepeatPenalty });
    totalPenalty += consecutiveRepeatPenalty;
  }

  // --- 2. Alt-text pattern similarity ---
  const altPatternPenalty = scoreAltTextSimilarity(selectedMedia);
  if (altPatternPenalty > 0) {
    penalties.push({ reason: 'Similar alt-text patterns across segments', penalty: altPatternPenalty });
    totalPenalty += altPatternPenalty;
  }

  // --- 3. Source repetition (stock-footage fatigue) ---
  const { fatiguePenalty, fatigueRisk } = scoreStockFatigue(selectedMedia);
  if (fatiguePenalty > 0) {
    penalties.push({ reason: 'Stock-footage fatigue (same source repeated)', penalty: fatiguePenalty });
    totalPenalty += fatiguePenalty;
  }

  // --- 4. Fresh shot interval analysis ---
  // Assume ~5 seconds per media item (typical segment duration / shots)
  const ASSUMED_SHOT_DURATION_SECONDS = 5;
  const freshInterval = calculateFreshShotInterval(selectedMedia, ASSUMED_SHOT_DURATION_SECONDS);
  // Penalize if fresh shots don't appear within 15-20 second window
  const FRESH_SHOT_TARGET_MAX = 20;
  if (freshInterval > FRESH_SHOT_TARGET_MAX) {
    const intervalPenalty = Math.min(25, Math.round((freshInterval - FRESH_SHOT_TARGET_MAX) * 2));
    penalties.push({ reason: `Fresh shot interval too long (${freshInterval.toFixed(1)}s > ${FRESH_SHOT_TARGET_MAX}s)`, penalty: intervalPenalty });
    totalPenalty += intervalPenalty;
  }

  // --- 5. Type diversity bonus/penalty ---
  // All same type (all images or all videos) gets a small penalty
  const types = new Set(selectedMedia.map(m => m.type));
  if (types.size === 1 && selectedMedia.length >= 4) {
    const typePenalty = 5;
    penalties.push({ reason: 'No media type variety (all same type)', penalty: typePenalty });
    totalPenalty += typePenalty;
  }

  const overallScore = Math.max(0, Math.min(100, 100 - totalPenalty));

  return {
    overallScore,
    repetitionPenalties: penalties,
    stockFatigueRisk: fatigueRisk,
    freshShotInterval: freshInterval,
  };
}

// ---------------------------------------------------------------------------
// Diversity scoring helpers (internal)
// ---------------------------------------------------------------------------

/** Categorize each media item into a shot type based on alt text content */
function categorizeShots(media: MediaCandidate[]): string[] {
  const categoryKeywords: Record<string, string[]> = {
    'portrait': ['person', 'face', 'portrait', 'people', 'interview', 'speaker', 'headshot'],
    'environment': ['office', 'building', 'city', 'street', 'landscape', 'room', 'interior'],
    'technology': ['screen', 'computer', 'phone', 'device', 'server', 'network', 'digital'],
    'data': ['chart', 'graph', 'data', 'numbers', 'statistics', 'dashboard', 'report'],
    'action': ['working', 'typing', 'meeting', 'walking', 'running', 'driving'],
    'abstract': ['abstract', 'pattern', 'texture', 'background', 'gradient', 'geometric'],
    'consequence': ['damage', 'broken', 'destroyed', 'locked', 'alert', 'warning', 'breach'],
  };

  return media.map(m => {
    const altLower = (m.alt || '').toLowerCase();
    for (const [category, keywords] of Object.entries(categoryKeywords)) {
      if (keywords.some(kw => altLower.includes(kw))) {
        return category;
      }
    }
    return 'other';
  });
}

/** Score penalty for consecutive repetition of the same shot type */
function scoreConsecutiveRepetition(categories: string[]): number {
  let penalty = 0;
  let consecutiveCount = 1;

  for (let i = 1; i < categories.length; i++) {
    if (categories[i] === categories[i - 1]) {
      consecutiveCount++;
      // Penalize increasingly for longer runs of same type
      if (consecutiveCount >= 3) {
        penalty += 8; // Heavy penalty for 3+ consecutive same type
      } else {
        penalty += 4; // Moderate penalty for 2 consecutive same type
      }
    } else {
      consecutiveCount = 1;
    }
  }

  return Math.min(30, penalty); // Cap at 30
}

/** Score penalty for similar alt-text patterns across the sequence */
function scoreAltTextSimilarity(media: MediaCandidate[]): number {
  // Extract significant words from each alt text
  const altWordSets = media.map(m => {
    const words = (m.alt || '').toLowerCase().split(/\s+/).filter(w => w.length > 3);
    return new Set(words);
  });

  let highSimilarityCount = 0;
  const totalPairs = Math.min(media.length * (media.length - 1) / 2, 50); // Cap comparisons

  for (let i = 0; i < media.length - 1; i++) {
    for (let j = i + 1; j < media.length && j < i + 5; j++) { // Compare within window of 5
      const setA = altWordSets[i];
      const setB = altWordSets[j];
      if (setA.size === 0 || setB.size === 0) continue;

      // Jaccard similarity
      let intersection = 0;
      for (const word of setA) {
        if (setB.has(word)) intersection++;
      }
      const union = setA.size + setB.size - intersection;
      const similarity = union > 0 ? intersection / union : 0;

      if (similarity > 0.5) {
        highSimilarityCount++;
      }
    }
  }

  // Penalize based on proportion of highly similar pairs
  if (totalPairs === 0) return 0;
  const similarityRatio = highSimilarityCount / Math.max(1, totalPairs);
  return Math.min(25, Math.round(similarityRatio * 50)); // Cap at 25
}

/** Score stock-footage fatigue and return fatigue risk (0-1) */
function scoreStockFatigue(media: MediaCandidate[]): { fatiguePenalty: number; fatigueRisk: number } {
  // Count source occurrences
  const sourceCounts = new Map<string, number>();
  for (const m of media) {
    // Normalize source to base provider (e.g., "DuckDuckGo · example.com" → "DuckDuckGo")
    const baseSource = (m.source || '').split('·')[0].trim().split(' ')[0];
    sourceCounts.set(baseSource, (sourceCounts.get(baseSource) || 0) + 1);
  }

  let fatiguePenalty = 0;
  let maxSourceRatio = 0;

  for (const [source, count] of sourceCounts) {
    const ratio = count / media.length;
    maxSourceRatio = Math.max(maxSourceRatio, ratio);

    // If more than 60% of media comes from same source, penalize
    if (ratio > 0.6 && media.length >= 3) {
      fatiguePenalty += Math.round((ratio - 0.6) * 40);
    }

    // Extra penalty for generic stock sources dominating
    if ((source === 'Picsum' || source === 'Unsplash') && ratio > 0.5 && media.length >= 3) {
      fatiguePenalty += 5;
    }
  }

  // Fatigue risk is the dominance of the most-used source
  const fatigueRisk = media.length >= 3 ? Math.min(1, maxSourceRatio) : 0;

  return { fatiguePenalty: Math.min(20, fatiguePenalty), fatigueRisk };
}

/**
 * Calculate the average interval (in seconds) between "fresh" shots.
 * A shot is "fresh" if its alt text is sufficiently different from the previous shot.
 */
function calculateFreshShotInterval(media: MediaCandidate[], shotDurationSeconds: number): number {
  if (media.length <= 1) return 0;

  let freshCount = 0;
  let lastFreshIndex = 0;
  let totalGapSeconds = 0;

  for (let i = 1; i < media.length; i++) {
    const prevAlt = (media[i - 1].alt || '').toLowerCase();
    const currAlt = (media[i].alt || '').toLowerCase();
    const prevSource = (media[i - 1].source || '');
    const currSource = (media[i].source || '');

    // A shot is "fresh" if it differs meaningfully from the previous
    const isFresh = currAlt !== prevAlt && currSource !== prevSource;

    if (isFresh) {
      const gapFromLastFresh = (i - lastFreshIndex) * shotDurationSeconds;
      totalGapSeconds += gapFromLastFresh;
      freshCount++;
      lastFreshIndex = i;
    }
  }

  if (freshCount === 0) {
    // No fresh shots found — entire sequence duration
    return media.length * shotDurationSeconds;
  }

  return totalGapSeconds / freshCount;
}

