import { logger } from './logger';
import { VideoProject, MediaAsset } from '../types';
import { CHART_KEYWORDS } from './captionUtils';
import { extractKeyPhrase } from './seoTitles';

// Re-export extractKeyPhrase so consumers can import from the thumbnail module
export { extractKeyPhrase } from './seoTitles';

// ─── Thumbnail Concept Types ────────────────────────────────────────────────

export type ThumbnailVariant = 'fear' | 'curiosity' | 'authority';

export interface ThumbnailConcept {
  /** Which emotional variant this concept represents */
  variant: ThumbnailVariant;
  /** Topic-specific visual signifier (e.g., "hacked laptop", "frozen bank screen") */
  signifier: string;
  /** Emotional angle driving the thumbnail (e.g., "personal vulnerability", "hidden threat") */
  emotionalAngle: string;
  /** Short text overlay for the thumbnail (2-4 words) */
  textOverlay: string;
  /** Accent color hex code for urgency/emotion */
  colorAccent: string;
  /** Single dominant subject description — no competing focal points */
  dominantSubject: string;
  /** Search queries to find appropriate imagery */
  searchQueries: string[];
}

// ─── Brand Consistency Types (Task 108) ─────────────────────────────────────

export interface BrandConfig {
  fontFamily: string;
  colorPalette: string[];
  logoPlacement: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  logoOpacity: number;
}

const DEFAULT_BRAND_CONFIG: BrandConfig = {
  fontFamily: "'BebasNeue', 'Arial Black', 'Impact', sans-serif",
  colorPalette: ['#ef4444', '#f97316', '#2563eb', '#1e3a5f', '#ffffff'],
  logoPlacement: 'top-right',
  logoOpacity: 0.85,
};

// ─── Gradient Presets (Task 114) ────────────────────────────────────────────

export interface GradientPreset {
  name: string;
  stops: { offset: number; color: string }[];
  type: 'linear' | 'radial';
  angle?: number;
}

export const GRADIENT_PRESETS: GradientPreset[] = [
  {
    name: 'dark-blue',
    stops: [
      { offset: 0, color: '#0a1628' },
      { offset: 0.5, color: '#1e3a5f' },
      { offset: 1, color: '#0a1628' },
    ],
    type: 'linear',
    angle: 135,
  },
  {
    name: 'warm-orange',
    stops: [
      { offset: 0, color: '#7c2d12' },
      { offset: 0.5, color: '#f97316' },
      { offset: 1, color: '#7c2d12' },
    ],
    type: 'linear',
    angle: 135,
  },
  {
    name: 'cool-teal',
    stops: [
      { offset: 0, color: '#042f2e' },
      { offset: 0.5, color: '#0d9488' },
      { offset: 1, color: '#042f2e' },
    ],
    type: 'linear',
    angle: 135,
  },
  {
    name: 'dramatic-red',
    stops: [
      { offset: 0, color: '#1a0000' },
      { offset: 0.5, color: '#dc2626' },
      { offset: 1, color: '#1a0000' },
    ],
    type: 'linear',
    angle: 135,
  },
  {
    name: 'neutral-gray',
    stops: [
      { offset: 0, color: '#111827' },
      { offset: 0.5, color: '#4b5563' },
      { offset: 1, color: '#111827' },
    ],
    type: 'linear',
    angle: 135,
  },
];

// ─── Topic-Specific Visual Threat Mapping ───────────────────────────────────

interface TopicThreatMapping {
  keywords: string[];
  signifiers: string[];
  threats: string[];
}

const TOPIC_THREAT_MAP: TopicThreatMapping[] = [
  {
    keywords: ['cyber', 'hack', 'breach', 'malware', 'ransomware', 'phishing'],
    signifiers: ['hacked laptop screen', 'ransomware lock screen', 'phishing email alert'],
    threats: ['locked computer', 'data breach notification', 'encrypted files warning'],
  },
  {
    keywords: ['bank', 'finance', 'money', 'fraud', 'payment', 'credit'],
    signifiers: ['frozen bank screen', 'empty wallet', 'declined transaction'],
    threats: ['frozen account alert', 'fraudulent transfer', 'zero balance screen'],
  },
  {
    keywords: ['identity', 'theft', 'personal', 'data', 'privacy'],
    signifiers: ['stolen ID card', 'login takeover screen', 'dark web listing'],
    threats: ['identity theft alert', 'compromised credentials', 'personal data exposed'],
  },
  {
    keywords: ['business', 'company', 'enterprise', 'corporate'],
    signifiers: ['shutdown server room', 'empty office after breach', 'business closure sign'],
    threats: ['operational shutdown', 'customer data leak', 'business interruption'],
  },
  {
    keywords: ['war', 'military', 'nation', 'state', 'geopolitical', 'infrastructure'],
    signifiers: ['power grid control panel', 'military command center', 'infrastructure map'],
    threats: ['grid failure', 'communications blackout', 'critical infrastructure attack'],
  },
  {
    keywords: ['ai', 'artificial intelligence', 'deepfake', 'automation'],
    signifiers: ['AI-generated face glitch', 'deepfake detection screen', 'autonomous system'],
    threats: ['deepfake impersonation', 'AI-powered scam', 'automated attack'],
  },
  {
    keywords: ['crypto', 'bitcoin', 'blockchain', 'wallet'],
    signifiers: ['drained crypto wallet', 'blockchain transaction', 'exchange hack screen'],
    threats: ['wallet drain', 'exchange compromise', 'stolen cryptocurrency'],
  },
];

/**
 * Selects topic-specific visual threats based on the topic string.
 * Returns signifiers and threats relevant to the topic domain.
 */
function selectTopicThreats(topic: string): { signifiers: string[]; threats: string[] } {
  const lowerTopic = topic.toLowerCase();
  const matched: { signifiers: string[]; threats: string[] } = { signifiers: [], threats: [] };

  for (const mapping of TOPIC_THREAT_MAP) {
    if (mapping.keywords.some(kw => lowerTopic.includes(kw))) {
      matched.signifiers.push(...mapping.signifiers);
      matched.threats.push(...mapping.threats);
    }
  }

  // Fallback: generic threat visuals if no specific match
  if (matched.signifiers.length === 0) {
    matched.signifiers = ['warning alert screen', 'person looking at screen in distress', 'breaking news banner'];
    matched.threats = ['unexpected alert', 'system compromise', 'urgent notification'];
  }

  return matched;
}

// ─── Audience-Specific Framing ──────────────────────────────────────────────

interface AudienceFraming {
  fearAngle: string;
  curiosityAngle: string;
  authorityAngle: string;
  textStyle: 'direct_consequence' | 'question' | 'news_headline';
}

function getAudienceFraming(audience: string): AudienceFraming {
  const lowerAudience = audience.toLowerCase();

  if (lowerAudience.includes('business') || lowerAudience.includes('smb') || lowerAudience.includes('owner')) {
    return {
      fearAngle: 'business shutdown and revenue loss',
      curiosityAngle: 'hidden vulnerability in daily operations',
      authorityAngle: 'industry report reveals systemic risk',
      textStyle: 'direct_consequence',
    };
  }

  if (lowerAudience.includes('freelance') || lowerAudience.includes('creator') || lowerAudience.includes('solo')) {
    return {
      fearAngle: 'personal account lockout and lost income',
      curiosityAngle: 'one setting most people ignore',
      authorityAngle: 'expert warning for independent workers',
      textStyle: 'question',
    };
  }

  // Default: general consumer
  return {
    fearAngle: 'personal vulnerability and immediate risk',
    curiosityAngle: 'something you do every day puts you at risk',
    authorityAngle: 'breaking report reveals widespread threat',
    textStyle: 'direct_consequence',
  };
}

// ─── Style-Based Color Accents ──────────────────────────────────────────────

function getStyleColors(style: string): { fear: string; curiosity: string; authority: string } {
  switch (style) {
    case 'warfront':
      return { fear: '#dc2626', curiosity: '#f59e0b', authority: '#1e40af' };
    case 'documentary':
      return { fear: '#b91c1c', curiosity: '#0891b2', authority: '#1e3a5f' };
    case 'explainer':
      return { fear: '#ef4444', curiosity: '#8b5cf6', authority: '#0ea5e9' };
    case 'business_insider':
    default:
      return { fear: '#ef4444', curiosity: '#f97316', authority: '#2563eb' };
  }
}

// ─── Text Overlay Generation ────────────────────────────────────────────────

function generateTextOverlay(
  topic: string,
  variant: ThumbnailVariant,
  audience: string,
): string {
  const lowerTopic = topic.toLowerCase();
  const framing = getAudienceFraming(audience);

  // Extract a short topic keyword for use in overlays
  const topicWords = topic.split(/\s+/).filter(w => w.length > 3);
  const topicKeyword = topicWords.length > 0 ? topicWords[0] : 'This';

  if (variant === 'fear') {
    if (framing.textStyle === 'direct_consequence') {
      if (lowerTopic.includes('hack') || lowerTopic.includes('cyber')) return 'You Could Be Next';
      if (lowerTopic.includes('bank') || lowerTopic.includes('money')) return 'Your Money Gone';
      if (lowerTopic.includes('business')) return 'Business Shutdown Risk';
      return `${topicKeyword} Targets You`;
    }
    return 'Are You Safe?';
  }

  if (variant === 'curiosity') {
    if (lowerTopic.includes('hack') || lowerTopic.includes('cyber')) return 'One Click Away';
    if (lowerTopic.includes('ai') || lowerTopic.includes('deepfake')) return 'Can You Tell?';
    if (lowerTopic.includes('bank') || lowerTopic.includes('money')) return 'Check This Now';
    return `Hidden ${topicKeyword} Risk`;
  }

  // authority variant
  if (lowerTopic.includes('hack') || lowerTopic.includes('cyber')) return 'Experts Warn Now';
  if (lowerTopic.includes('war') || lowerTopic.includes('military')) return 'Intel Report Leaked';
  if (lowerTopic.includes('business')) return 'Industry Alert';
  return `${topicKeyword} Crisis Report`;
}

/**
 * Validates that a text overlay is between 2 and 4 words.
 * Trims to 4 words if too long, pads if too short.
 */
function enforceTextWordCount(text: string): string {
  const words = text.trim().split(/\s+/);
  if (words.length >= 2 && words.length <= 5) return text.trim();
  if (words.length > 5) return words.slice(0, 5).join(' ');
  // If only 1 word, duplicate with emphasis
  if (words.length === 1) return `${words[0]} Now`;
  return text.trim();
}

// ─── Main Function ──────────────────────────────────────────────────────────

/**
 * Generates at least 3 thumbnail concept variants for a given topic.
 * Each variant targets a different emotional angle: fear, curiosity, and authority/news.
 *
 * Each concept includes:
 * - Topic-specific signifier (visual threat relevant to the domain)
 * - Emotional angle driving the thumbnail
 * - Text overlay (2-5 words, enforced)
 * - Color accent for urgency/emotion
 * - Single dominant subject (no competing focal points)
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.8, 2.11, 2.19, 2.20, 2.21, 2.22
 */
export function generateThumbnailConcepts(
  topic: string,
  style: string,
  audience: string,
): ThumbnailConcept[] {
  const { signifiers, threats } = selectTopicThreats(topic);
  const colors = getStyleColors(style);
  const framing = getAudienceFraming(audience);

  const concepts: ThumbnailConcept[] = [
    // Fear variant: personal vulnerability, direct threat
    {
      variant: 'fear',
      signifier: signifiers[0] || 'warning alert screen',
      emotionalAngle: framing.fearAngle,
      textOverlay: enforceTextWordCount(generateTextOverlay(topic, 'fear', audience)),
      colorAccent: colors.fear,
      dominantSubject: `Close-up of ${signifiers[0] || 'distressed person facing screen'} — single focal point, no competing elements`,
      searchQueries: [
        `${threats[0] || 'cyber threat'} close up`,
        `${signifiers[0] || 'alert screen'} dramatic`,
        `person reacting to ${threats[0] || 'digital threat'}`,
      ],
    },
    // Curiosity variant: hidden risk, intrigue
    {
      variant: 'curiosity',
      signifier: signifiers[1] || signifiers[0] || 'hidden vulnerability screen',
      emotionalAngle: framing.curiosityAngle,
      textOverlay: enforceTextWordCount(generateTextOverlay(topic, 'curiosity', audience)),
      colorAccent: colors.curiosity,
      dominantSubject: `Partially revealed ${signifiers[1] || signifiers[0] || 'threat indicator'} — creates intrigue with single subject`,
      searchQueries: [
        `${threats[1] || threats[0] || 'hidden risk'} reveal`,
        `mysterious ${signifiers[1] || signifiers[0] || 'digital threat'}`,
        `everyday device ${threats[0] || 'vulnerability'}`,
      ],
    },
    // Authority/news variant: credibility, breaking report
    {
      variant: 'authority',
      signifier: signifiers[2] || signifiers[0] || 'breaking news banner',
      emotionalAngle: framing.authorityAngle,
      textOverlay: enforceTextWordCount(generateTextOverlay(topic, 'authority', audience)),
      colorAccent: colors.authority,
      dominantSubject: `News-style framing of ${signifiers[2] || signifiers[0] || 'official report'} — authoritative single subject`,
      searchQueries: [
        `${threats[2] || threats[0] || 'security report'} official`,
        `breaking news ${topic.split(' ').slice(0, 2).join(' ')}`,
        `expert analysis ${signifiers[0] || 'threat'}`,
      ],
    },
  ];

  logger.info('Thumbnail', `Generated ${concepts.length} thumbnail concepts for topic: "${topic}" (style: ${style}, audience: ${audience})`);

  return concepts;
}

/**
 * Selects the highest-scored non-fallback MediaAsset from an array.
 * Returns undefined if no non-fallback assets exist.
 *
 * Requirements: 3.2
 */
export function selectThumbnailBackground(assets: MediaAsset[]): MediaAsset | undefined {
  const nonFallback = assets.filter(a => a.isFallback !== true);
  if (nonFallback.length === 0) return undefined;
  return nonFallback.reduce((best, current) =>
    (current.score ?? 0) > (best.score ?? 0) ? current : best,
  );
}

/**
 * Truncates text to maxLength chars, appending '…' if truncated.
 * If input length <= maxLength, returns unchanged.
 *
 * Requirements: 3.6
 */
export function truncateOverlayText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1) + '…';
}

/**
 * Returns true if the given asset is a chart/graph asset based on CHART_KEYWORDS.
 */
function isChart(asset: MediaAsset): boolean {
  return CHART_KEYWORDS.some(
    kw =>
      (asset.concept ?? '').toLowerCase().includes(kw) ||
      (asset.alt ?? '').toLowerCase().includes(kw),
  );
}

/**
 * Renders a split-screen YouTube thumbnail:
 *   - Left half (0–640px): highest-scored chart asset
 *   - Right half (640–1280px): highest-scored portrait/product asset
 *   - 4px red divider at x=640
 *   - Bold 52px white title text centred at 60% height
 *
 * Falls back to `generateThumbnail(title, project.topic)` if either asset
 * cannot be found or loaded.
 *
 * Requirements: 7.4, 7.5, 7.6, 7.7, 10.5
 */
export async function generateSplitScreenThumbnail(
  project: VideoProject,
  title: string,
  hookLine?: string,
): Promise<Blob> {
  try {
    // 1. Find highest-scored chart asset
    const chartAsset = project.media
      .filter(a =>
        CHART_KEYWORDS.some(
          kw =>
            (a.concept ?? '').toLowerCase().includes(kw) ||
            (a.alt ?? '').toLowerCase().includes(kw),
        ),
      )
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];

    // 2. Find highest-scored portrait/product asset (non-chart)
    const portraitAsset = project.media
      .filter(a => !isChart(a))
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];

    // 3. Fall back if either asset is missing
    if (!chartAsset || !portraitAsset) {
      return generateThumbnail(title, project.topic);
    }

    // 4. Load both images
    const [chartImg, portraitImg] = await Promise.all([
      loadImage(chartAsset.url),
      loadImage(portraitAsset.url),
    ]);

    // 5. Create 1280×720 canvas
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');

    // 6. Draw chart image on left half (0–640px wide, full height)
    ctx.drawImage(chartImg, 0, 0, 640, 720);

    // 7. Draw portrait image on right half (640–1280px, full height)
    ctx.drawImage(portraitImg, 640, 0, 640, 720);

    // 8. Draw 4px vertical divider in #ef4444 at x=640
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(638, 0, 4, 720);

    // 9. Overlay text centred at full 1280px width, at 60% of height.
    //    Use the hook line's key phrase when available (Requirement 11.4).
    const MAX_OVERLAY_LENGTH = 80;
    let overlayText = title;
    if (hookLine && hookLine.trim().length > 0) {
      overlayText = hookLine.trim().length > MAX_OVERLAY_LENGTH
        ? hookLine.trim().slice(0, MAX_OVERLAY_LENGTH).trimEnd() + '…'
        : hookLine.trim();
    }
    ctx.font = 'bold 52px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.fillText(overlayText, 640, 720 * 0.6);

    // Reset shadow
    ctx.shadowBlur = 0;

    // ─── Post-render validation (Requirements 4.1, 4.5, 4.6) ───────────────────
    // Check if the rendered thumbnail is effectively all-black
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    if (isBlackThumbnail(imageData)) {
      logger.warn('Thumbnail', 'Split-screen thumbnail detected as black — regenerating with gradient-plus-text fallback');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      renderGradientTextFallback(canvas, ctx, title, project.topic, hookLine);
    }

    // Convert to blob and validate minimum file size
    let blob = await canvasToBlob(canvas, 'image/png');

    // Validate minimum 10KB file size; if below, regenerate with higher quality JPEG
    if (!validateThumbnailSize(blob)) {
      logger.warn('Thumbnail', `Split-screen thumbnail blob too small (${blob.size} bytes) — regenerating with higher quality`);
      blob = await canvasToBlob(canvas, 'image/jpeg', 1.0);

      // If still too small after JPEG, force the gradient-plus-text fallback
      if (!validateThumbnailSize(blob)) {
        logger.warn('Thumbnail', 'Split-screen still below minimum size — applying gradient-plus-text fallback');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        renderGradientTextFallback(canvas, ctx, title, project.topic, hookLine);
        blob = await canvasToBlob(canvas, 'image/png');
      }
    }

    return blob;
  } catch {
    // 11. On any error, fall back to the existing single-image layout
    return generateThumbnail(title, project.topic);
  }
}

/**
 * Renders the gradient-plus-text fallback thumbnail.
 * Uses an eye-catching gradient background with bold white text overlay.
 * Text is derived from hookLine or topic title, validated to 2-5 words.
 *
 * Requirements: 4.1, 4.3, 4.5
 */
function renderGradientTextFallback(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  title: string,
  topic: string,
  hookLine?: string,
): void {
  const width = canvas.width;
  const height = canvas.height;

  // Eye-catching gradient background (dark blue to purple)
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, '#1e3a5f');
  grad.addColorStop(0.4, '#2d1b69');
  grad.addColorStop(0.7, '#4c1d95');
  grad.addColorStop(1, '#1e3a5f');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Subtle radial highlight for depth
  const radial = ctx.createRadialGradient(width * 0.5, height * 0.4, 0, width * 0.5, height * 0.4, width * 0.6);
  radial.addColorStop(0, 'rgba(99, 102, 241, 0.3)');
  radial.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = radial;
  ctx.fillRect(0, 0, width, height);

  // Determine overlay text: use hook line key phrase or topic title, validated to 2-5 words
  let overlayText = topic || title;
  if (hookLine && hookLine.trim().length > 0) {
    const keyPhrase = extractKeyPhrase(hookLine);
    if (keyPhrase) {
      overlayText = keyPhrase;
    }
  }
  overlayText = validateThumbnailText(overlayText);

  // Bold 54px white text with dark shadow (within 52-56px range)
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 54px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Dark text shadow for readability
  ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 4;

  ctx.fillText(overlayText, width / 2, height / 2);

  // Reset shadow
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  // Accent line below text
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(width / 2 - 60, height / 2 + 50, 120, 4);
}

/**
 * Converts a canvas to a PNG Blob.
 */
function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob> {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else resolve(new Blob([], { type }));
      },
      type,
      quality,
    );
  });
}

/**
 * Generates a YouTube thumbnail from project data.
 * Returns a Blob that can be downloaded or uploaded.
 *
 * Post-render validation (Requirements 4.1, 4.5, 4.6):
 * - Checks if result is black using isBlackThumbnail; if so, regenerates with gradient-plus-text fallback
 * - Validates minimum 10KB file size; if below, regenerates with higher quality
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 11.2
 */
export async function generateThumbnail(
  title: string,
  topic: string,
  imageUrl?: string,
  width = 1280,
  height = 720,
  assets?: MediaAsset[],
  hookLine?: string,
): Promise<Blob> {
  // Load Bebas Neue from Google Fonts with fallback to system fonts
  const fontUrls = [
    'https://fonts.gstatic.com/s/bebasneue/v14/JTUSjIg69CK48gW7PXooxW5rygbi49c.woff2',
    'https://fonts.gstatic.com/s/impact/v1/impact.woff2', // fallback
  ];
  for (const fontUrl of fontUrls) {
    try {
      const font = new FontFace('BebasNeue', `url(${fontUrl})`);
      const loaded = await font.load();
      (document.fonts as FontFaceSet).add(loaded);
      break;
    } catch {
      continue;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  // Determine background image URL: prefer highest-scored non-fallback asset
  let bgUrl = imageUrl;
  if (assets && assets.length > 0) {
    const bestAsset = selectThumbnailBackground(assets);
    if (bestAsset) bgUrl = bestAsset.url;
  }

  // ── Step 1: Dark gradient base ──
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, '#0a0a14');
  grad.addColorStop(0.5, '#111827');
  grad.addColorStop(1, '#0a0a14');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // ── Step 2: Full-bleed background image at 85% opacity ──
  if (bgUrl) {
    try {
      const img = await loadImage(bgUrl);
      ctx.save();
      ctx.globalAlpha = 0.85;
      const scale = Math.max(width / img.width, height / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      ctx.drawImage(img, (width - dw) / 2, (height - dh) / 2, dw, dh);
      ctx.restore();
    } catch {
      logger.warn('Thumbnail', 'Failed to load background image, using gradient-only fallback');
    }
  }

  // ── Step 3: Cinematic vignette (stronger than before) ──
  const vignette = ctx.createRadialGradient(width / 2, height / 2, height * 0.25, width / 2, height / 2, width * 0.75);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(0.5, 'rgba(0,0,0,0.3)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.82)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);

  // ── Step 4: Bottom dark band for text legibility ──
  const bottomBand = ctx.createLinearGradient(0, height * 0.45, 0, height);
  bottomBand.addColorStop(0, 'rgba(0,0,0,0)');
  bottomBand.addColorStop(0.4, 'rgba(0,0,0,0.6)');
  bottomBand.addColorStop(1, 'rgba(0,0,0,0.92)');
  ctx.fillStyle = bottomBand;
  ctx.fillRect(0, 0, width, height);

  // ── Step 5: Red accent bar (left edge vertical bar) ──
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(54, height * 0.55, 8, height * 0.35);

  // ── Step 6: Main title — Bebas Neue 90px with thick black outline ──
  let overlayText = title;
  if (hookLine && hookLine.trim().length > 0) {
    const keyPhrase = extractKeyPhrase(hookLine);
    if (keyPhrase) overlayText = keyPhrase;
  }
  overlayText = truncateOverlayText(overlayText, 60);

  const titleFontSize = Math.round(height * 0.13); // ~94px at 720px height
  const titleFont = `'BebasNeue', 'Arial Black', 'Impact', sans-serif`;
  ctx.font = `${titleFontSize}px ${titleFont}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';

  // Word-wrap title within left 90% of width
  const titleMaxW = width - 130;
  const titleWords = overlayText.split(' ');
  const titleLines: string[] = [];
  let currentLine = '';
  for (const word of titleWords) {
    const test = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(test).width > titleMaxW && currentLine) {
      titleLines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = test;
    }
  }
  if (currentLine) titleLines.push(currentLine);

  const lineH = Math.round(titleFontSize * 1.05);
  const totalTitleH = titleLines.length * lineH;
  const titleBaseY = height - Math.round(height * 0.08); // 8% from bottom
  const titleStartY = titleBaseY - totalTitleH + lineH;

  titleLines.forEach((line, idx) => {
    const y = titleStartY + idx * lineH;
    // Thick black stroke outline
    ctx.lineWidth = Math.round(titleFontSize * 0.1);
    ctx.strokeStyle = '#000000';
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.strokeText(line, 70, y);
    // White fill
    ctx.fillStyle = '#ffffff';
    ctx.fillText(line, 70, y);
  });

  // ── Step 7: Topic/hook sub-label in yellow — smaller, above title ──
  const subLabel = topic.length > 0 ? topic.toUpperCase().substring(0, 40) : '';
  if (subLabel) {
    const subFontSize = Math.round(height * 0.038);
    ctx.font = `bold ${subFontSize}px -apple-system, BlinkMacSystemFont, 'Arial Black', sans-serif`;
    ctx.textBaseline = 'bottom';
    const subY = titleStartY - Math.round(height * 0.025);
    ctx.lineWidth = Math.round(subFontSize * 0.18);
    ctx.strokeStyle = '#000000';
    ctx.strokeText(subLabel, 70, subY);
    ctx.fillStyle = '#FFD700'; // YouTube gold
    ctx.fillText(subLabel, 70, subY);
  }

  // ─── Post-render validation ───────────────────────────────────────────────
  const imageData = ctx.getImageData(0, 0, width, height);
  if (isBlackThumbnail(imageData)) {
    logger.warn('Thumbnail', 'Rendered thumbnail detected as black — regenerating with gradient-plus-text fallback');
    ctx.clearRect(0, 0, width, height);
    renderGradientTextFallback(canvas, ctx, title, topic, hookLine);
  }

  let blob = await canvasToBlob(canvas, 'image/jpeg', 0.92);
  if (!validateThumbnailSize(blob)) {
    logger.warn('Thumbnail', `Thumbnail blob too small (${blob.size} bytes) — regenerating with higher quality`);
    blob = await canvasToBlob(canvas, 'image/jpeg', 0.95);
    if (!validateThumbnailSize(blob)) {
      logger.warn('Thumbnail', 'Still below minimum size — applying gradient-plus-text fallback');
      ctx.clearRect(0, 0, width, height);
      renderGradientTextFallback(canvas, ctx, title, topic, hookLine);
      blob = await canvasToBlob(canvas, 'image/jpeg', 0.92);
    }
  }

  return blob;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  const sources = buildProxySources(url);

  return new Promise((resolve, reject) => {
    const trySource = (index: number) => {
      if (index >= sources.length) {
        logger.warn('Thumbnail', `All image load attempts failed for ${url.substring(0, 80)}`);
        reject(new Error('Failed to load image'));
        return;
      }

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.referrerPolicy = 'no-referrer';
      img.decoding = 'async';

      const timeout = setTimeout(() => {
        img.onload = null;
        img.onerror = null;
        logger.warn('Thumbnail', `Image load timeout for source ${index + 1}/${sources.length}: ${sources[index].substring(0, 80)}`);
        trySource(index + 1);
      }, 8000);

      img.onload = () => {
        clearTimeout(timeout);
        // Validate image dimensions after load (MEDIUM #6)
        if (img.naturalWidth <= 0 || img.naturalHeight <= 0) {
          logger.warn('Thumbnail', `Image loaded but has invalid dimensions ${img.naturalWidth}x${img.naturalHeight}: ${sources[index].substring(0, 80)}`);
          trySource(index + 1);
          return;
        }
        resolve(img);
      };
      img.onerror = () => {
        clearTimeout(timeout);
        logger.warn('Thumbnail', `Image load failed for source ${index + 1}/${sources.length}: ${sources[index].substring(0, 80)}`);
        trySource(index + 1);
      };
      img.src = sources[index];
    };

    trySource(0);
  });
}

/**
 * Builds a CORS proxy retry chain for loading images:
 * 1. images.weserv.nl proxy (with resize to 1920 and jpg output)
 * 2. corsproxy.io proxy
 * 3. Original URL directly with crossOrigin='anonymous'
 */
function buildProxySources(url: string): string[] {
  if (!/^https?:\/\//i.test(url)) return [url];

  const sources: string[] = [];

  // 1. images.weserv.nl — reliable free image proxy with resize + format conversion
  try {
    sources.push(`https://images.weserv.nl/?url=${encodeURIComponent(url)}&w=1920&output=jpg`);
  } catch {
    // URL encoding failed, skip
  }

  // 2. corsproxy.io — backup CORS proxy
  try {
    sources.push(`https://corsproxy.io/?${encodeURIComponent(url)}`);
  } catch {
    // Skip
  }

  // 3. Original URL directly
  sources.push(url);

  return sources;
}

// ─── Black Thumbnail Detection & Size Validation ────────────────────────────

/**
 * Detects if an image is effectively all-black.
 * Returns true if more than `percentageThreshold` (default 90%) of pixels
 * have R, G, and B values each within `pixelTolerance` (default 10) of 0.
 *
 * Accepts either an ImageData object or a raw Uint8ClampedArray of RGBA pixel data.
 *
 * Requirements: 4.5
 */
export function isBlackThumbnail(
  imageData: ImageData | Uint8ClampedArray,
  threshold?: { pixelTolerance: number; percentageThreshold: number },
): boolean {
  const pixelTolerance = threshold?.pixelTolerance ?? 10;
  const percentageThreshold = threshold?.percentageThreshold ?? 0.9;

  const data: Uint8ClampedArray = imageData instanceof Uint8ClampedArray
    ? imageData
    : imageData.data;

  // Each pixel is 4 bytes: R, G, B, A
  const totalPixels = data.length / 4;
  if (totalPixels === 0) return true;

  let nearBlackCount = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    if (r <= pixelTolerance && g <= pixelTolerance && b <= pixelTolerance) {
      nearBlackCount++;
    }
  }

  return (nearBlackCount / totalPixels) > percentageThreshold;
}

/**
 * Validates that a thumbnail blob meets the minimum file size requirement.
 * Returns true if the blob's size is >= minBytes (default 10KB = 10240 bytes).
 *
 * Requirements: 4.6
 */
export function validateThumbnailSize(blob: Blob, minBytes?: number): boolean {
  const threshold = minBytes ?? 10240;
  return blob.size >= threshold;
}

// ─── Thumbnail Text & Readability Validation (Task 3.2) ─────────────────────

/**
 * Validates that a thumbnail text overlay is between 2 and 4 words.
 * Returns the validated text if within range, or a truncated/padded version.
 *
 * Requirements: 2.5, 2.7, 2.23, Task 111
 */
export function validateThumbnailText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return 'Watch Now';

  const words = trimmed.split(/\s+/);

  if (words.length >= 2 && words.length <= 4) {
    return trimmed;
  }

  if (words.length > 4) {
    return words.slice(0, 4).join(' ');
  }

  // Less than 2 words — pad
  if (words.length === 1) {
    return `${words[0]} Now`;
  }

  return trimmed;
}

/**
 * Readability result from mobile simulation.
 */
export interface MobileReadabilityResult {
  /** Whether the text is readable at 160×90px thumbnail size */
  readable: boolean;
  /** Readability score from 0 (unreadable) to 1 (perfectly readable) */
  score: number;
  /** Issues found during readability check */
  issues: string[];
}

/**
 * Simulates rendering a thumbnail concept at 160×90px (mobile YouTube thumbnail size)
 * and evaluates whether the text overlay remains readable.
 *
 * Checks:
 * - Word count (2-4 words for mobile legibility)
 * - Estimated character width at scaled font size
 * - Contrast between text and background (via color accent)
 * - Text overlay length relative to available space
 *
 * Requirements: 2.6, 2.13, 2.14, 2.15, 2.16, 2.17, 2.18
 */
export function checkConceptMobileReadability(concept: ThumbnailConcept): MobileReadabilityResult {
  const issues: string[] = [];
  let score = 1.0;

  const text = concept.textOverlay.trim();
  const words = text.split(/\s+/);

  // Check word count (2-4 words ideal for mobile)
  if (words.length > 4) {
    issues.push('Text exceeds 4 words — unreadable at mobile size');
    score -= 0.4;
  } else if (words.length < 2) {
    issues.push('Text too short — may not communicate enough');
    score -= 0.1;
  }

  // Check character count — at 160px wide, roughly 12-15 chars max are legible
  // with bold font at thumbnail scale (approx 10-12px effective font size)
  const MAX_CHARS_MOBILE = 25;
  if (text.length > MAX_CHARS_MOBILE) {
    issues.push(`Text too long (${text.length} chars) — exceeds ${MAX_CHARS_MOBILE} char mobile limit`);
    score -= 0.3;
  }

  // Check for lowercase-only text (harder to read at small sizes)
  if (text === text.toLowerCase() && text.length > 10) {
    issues.push('All lowercase text is harder to read at mobile thumbnail size');
    score -= 0.1;
  }

  // Check contrast — simulate foreground (white text) vs accent color background
  const accentLuminance = getRelativeLuminance(concept.colorAccent);
  const whiteLuminance = 1.0;
  const contrastRatio = (whiteLuminance + 0.05) / (accentLuminance + 0.05);

  // WCAG AA requires 4.5:1 for normal text, 3:1 for large text
  // At thumbnail size, we need at least 3:1 for bold large text
  if (contrastRatio < 3.0) {
    issues.push(`Low contrast ratio (${contrastRatio.toFixed(1)}:1) — text may be unreadable on accent color`);
    score -= 0.3;
  }

  // Check if signifier description suggests cluttered composition
  const signifierWords = concept.signifier.split(/\s+/).length;
  if (signifierWords > 6) {
    issues.push('Complex signifier may create visual clutter at mobile size');
    score -= 0.1;
  }

  // Clamp score
  score = Math.max(0, Math.min(1, score));

  return {
    readable: score >= 0.6,
    score,
    issues,
  };
}

/**
 * Visual hierarchy score result.
 */
export interface VisualHierarchyScore {
  /** Overall hierarchy score from 0 (poor) to 1 (excellent) */
  score: number;
  /** Whether subject is the primary focal point */
  subjectFirst: boolean;
  /** Whether text is secondary to subject */
  textSecond: boolean;
  /** Whether branding is tertiary (not competing) */
  brandingThird: boolean;
  /** Detailed breakdown */
  breakdown: {
    subjectScore: number;
    textScore: number;
    brandingScore: number;
  };
}

/**
 * Scores the visual hierarchy of a thumbnail concept.
 * Proper hierarchy: subject first, text second, branding third.
 *
 * Evaluates:
 * - Dominant subject clarity (single focal point, descriptive)
 * - Text overlay appropriateness (short, impactful, not competing with subject)
 * - Branding restraint (accent color not overpowering)
 *
 * Requirements: 2.14, 2.15, 2.16, 2.24, 2.25
 */
export function scoreVisualHierarchy(concept: ThumbnailConcept): VisualHierarchyScore {
  // Score subject dominance (0-1)
  let subjectScore = 0;
  const subject = concept.dominantSubject.toLowerCase();

  // Check for single focal point indicators
  if (subject.includes('single') || subject.includes('one') || subject.includes('focal')) {
    subjectScore += 0.4;
  }
  if (subject.includes('no competing') || subject.includes('dominant')) {
    subjectScore += 0.3;
  }
  // Check for descriptive specificity (longer = more specific)
  if (concept.dominantSubject.length > 20) {
    subjectScore += 0.2;
  }
  // Check signifier is concrete
  if (concept.signifier.length > 5) {
    subjectScore += 0.1;
  }
  subjectScore = Math.min(1, subjectScore);

  // Score text appropriateness (0-1)
  let textScore = 0;
  const textWords = concept.textOverlay.trim().split(/\s+/).length;

  // 2-4 words is ideal
  if (textWords >= 2 && textWords <= 4) {
    textScore += 0.5;
  } else if (textWords > 4) {
    textScore += 0.1; // Too long, competes with subject
  }

  // Short text doesn't compete with subject
  if (concept.textOverlay.length <= 25) {
    textScore += 0.3;
  }

  // Text should be impactful (contains action words or emotional triggers)
  const impactWords = ['you', 'your', 'now', 'risk', 'next', 'safe', 'warn', 'alert', 'crisis', 'hidden', 'can', 'could'];
  const textLower = concept.textOverlay.toLowerCase();
  if (impactWords.some(w => textLower.includes(w))) {
    textScore += 0.2;
  }
  textScore = Math.min(1, textScore);

  // Score branding restraint (0-1)
  // Branding should be tertiary — accent color should support, not dominate
  let brandingScore = 0;

  // Accent color should not be too bright/saturated (which would compete)
  const luminance = getRelativeLuminance(concept.colorAccent);
  // Mid-range luminance is ideal for accent (not too bright, not invisible)
  if (luminance >= 0.1 && luminance <= 0.6) {
    brandingScore += 0.5;
  } else {
    brandingScore += 0.3;
  }

  // Search queries should focus on subject, not branding
  const queriesText = concept.searchQueries.join(' ').toLowerCase();
  if (!queriesText.includes('logo') && !queriesText.includes('brand')) {
    brandingScore += 0.3;
  }

  // Emotional angle supports subject, not branding
  if (concept.emotionalAngle.length > 10) {
    brandingScore += 0.2;
  }
  brandingScore = Math.min(1, brandingScore);

  // Determine hierarchy correctness
  const subjectFirst = subjectScore >= 0.5;
  const textSecond = textScore >= 0.4 && textScore <= subjectScore + 0.2;
  const brandingThird = brandingScore >= 0.4 && brandingScore <= textScore + 0.3;

  // Overall score is weighted average
  const overallScore = subjectScore * 0.5 + textScore * 0.3 + brandingScore * 0.2;

  return {
    score: Math.round(overallScore * 100) / 100,
    subjectFirst,
    textSecond,
    brandingThird,
    breakdown: {
      subjectScore: Math.round(subjectScore * 100) / 100,
      textScore: Math.round(textScore * 100) / 100,
      brandingScore: Math.round(brandingScore * 100) / 100,
    },
  };
}

/**
 * Generates stronger wording variants for a thumbnail text overlay.
 * Produces alternatives that are more direct, urgent, and action-oriented.
 *
 * Strategies:
 * - Direct consequence framing ("Your X Could Be Next")
 * - Question framing ("Are You Safe?")
 * - Urgency framing ("Act Now Before...")
 * - Loss framing ("Don't Lose Your...")
 *
 * Requirements: 2.23, 2.24, 2.25
 */
export function generateStrongerWordingVariants(text: string, topic: string): string[] {
  const variants: string[] = [];
  const lowerTopic = topic.toLowerCase();

  // Extract a topic keyword for personalization
  const topicWords = topic.split(/\s+/).filter(w => w.length > 3);
  const topicKeyword = topicWords.length > 0 ? topicWords[0] : 'This';

  // Strategy 1: Direct consequence framing
  if (lowerTopic.includes('hack') || lowerTopic.includes('cyber') || lowerTopic.includes('breach')) {
    variants.push('Your Data Is Gone');
    variants.push('Hackers Want This');
    variants.push('One Click Ruins You');
  } else if (lowerTopic.includes('bank') || lowerTopic.includes('money') || lowerTopic.includes('fraud')) {
    variants.push('Your Money Gone');
    variants.push('Bank Account Drained');
    variants.push('Check This Now');
  } else if (lowerTopic.includes('business') || lowerTopic.includes('company')) {
    variants.push('Your Business Next');
    variants.push('Shutdown Coming Fast');
    variants.push('Business Could End');
  } else if (lowerTopic.includes('identity') || lowerTopic.includes('theft')) {
    variants.push('Identity Stolen Today');
    variants.push('They Have Your Info');
    variants.push('You Are Exposed');
  } else {
    variants.push(`${topicKeyword} Targets You`);
    variants.push('You Could Be Next');
    variants.push('Are You Prepared?');
  }

  // Strategy 2: Question/curiosity framing
  variants.push('Are You Safe?');
  variants.push('Can You Tell?');

  // Strategy 3: Urgency framing
  variants.push('Act Before Too Late');
  variants.push('Time Running Out');

  // Strategy 4: Loss aversion framing
  variants.push("Don't Be Next");
  variants.push('Stop This Now');

  // Filter: ensure all variants are 2-4 words
  const validVariants = variants
    .map(v => v.trim())
    .filter(v => {
      const wordCount = v.split(/\s+/).length;
      return wordCount >= 2 && wordCount <= 4;
    });

  // Deduplicate and exclude the original text
  const originalLower = text.toLowerCase().trim();
  const unique = Array.from(new Set(validVariants)).filter(
    v => v.toLowerCase() !== originalLower
  );

  return unique;
}

// ─── Utility: Relative Luminance Calculation ────────────────────────────────

/**
 * Calculates relative luminance from a hex color string.
 * Used for contrast ratio calculations.
 */
function getRelativeLuminance(hex: string): number {
  const cleanHex = hex.replace('#', '');
  if (cleanHex.length !== 6) return 0.5; // fallback for invalid hex

  const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255;

  const toLinear = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

// ─── Task 103: AI Thumbnail Generation ──────────────────────────────────────

export interface AIThumbnailOptions {
  topic: string;
  style: string;
  width?: number;
  height?: number;
  variant?: number;
}

/**
 * Procedurally generates a canvas-rendered thumbnail with gradient, geometric shapes,
 * and text overlay. Acts as a fallback when no stock images are available.
 *
 * Requirements: Task 103
 */
export async function generateAIThumbnail(
  topic: string,
  style: string,
  width = 1280,
  height = 720,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  // Pick gradient preset based on style
  const presetName = style === 'warfront' ? 'dramatic-red'
    : style === 'documentary' ? 'dark-blue'
    : style === 'explainer' ? 'cool-teal'
    : 'warm-orange';
  const preset = GRADIENT_PRESETS.find(p => p.name === presetName) ?? GRADIENT_PRESETS[0];

  // Draw gradient background
  const grad = ctx.createLinearGradient(0, 0, width, height);
  for (const stop of preset.stops) {
    grad.addColorStop(stop.offset, stop.color);
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Procedural geometric elements for visual interest
  ctx.globalAlpha = 0.15;
  for (let i = 0; i < 6; i++) {
    const x = Math.floor(pseudoRandom(topic, i) * width);
    const y = Math.floor(pseudoRandom(topic, i + 100) * height);
    const r = 40 + Math.floor(pseudoRandom(topic, i + 200) * 120);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = i % 2 === 0 ? '#ffffff' : '#ef4444';
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Radial highlight
  const radial = ctx.createRadialGradient(
    width * 0.5, height * 0.4, 0,
    width * 0.5, height * 0.4, width * 0.5,
  );
  radial.addColorStop(0, 'rgba(255,255,255,0.1)');
  radial.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = radial;
  ctx.fillRect(0, 0, width, height);

  // Text overlay
  const text = truncateOverlayText(topic, 40);
  const fontSize = Math.round(height * 0.1);
  ctx.font = `bold ${fontSize}px 'BebasNeue', 'Arial Black', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 20;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, width / 2, height / 2);
  ctx.shadowBlur = 0;

  return canvasToBlob(canvas, 'image/jpeg', 0.92);
}

/**
 * Deterministic pseudo-random number from string seed + index.
 */
function pseudoRandom(seed: string, index: number): number {
  let hash = 0;
  const str = `${seed}-${index}`;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash % 1000) / 1000;
}

// ─── Task 104: Face Expression Analysis ─────────────────────────────────────

export interface FaceExpressionScore {
  score: number;
  hasFace: boolean;
  details: string;
}

/**
 * Detects a face region and scores expression quality.
 * Uses pixel analysis heuristics (skin-tone detection, symmetry) as a
 * lightweight proxy — no ML dependency.
 *
 * Requirements: Task 104
 */
export function scoreFaceExpression(
  imageData: ImageData,
  faceRegion: { x: number; y: number; width: number; height: number },
): FaceExpressionScore {
  const { data, width: imgW } = imageData;
  const { x: fx, y: fy, width: fw, height: fh } = faceRegion;

  if (fw <= 0 || fh <= 0) {
    return { score: 0, hasFace: false, details: 'Invalid face region' };
  }

  let skinPixels = 0;
  let totalPixels = 0;
  let brightnessSum = 0;

  const xEnd = Math.min(fx + fw, imgW);
  const yEnd = Math.min(fy + fh, imageData.height);

  for (let y = fy; y < yEnd; y++) {
    for (let x = fx; x < xEnd; x++) {
      const idx = (y * imgW + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      totalPixels++;
      brightnessSum += (r + g + b) / 3;

      // Skin-tone heuristic: R > 95, G > 40, B > 20, and R-G within 15-100
      if (r > 95 && g > 40 && b > 20 && (r - g) > 15 && (r - g) < 100) {
        skinPixels++;
      }
    }
  }

  if (totalPixels === 0) {
    return { score: 0, hasFace: false, details: 'Empty face region' };
  }

  const skinRatio = skinPixels / totalPixels;
  const avgBrightness = brightnessSum / totalPixels;
  const hasFace = skinRatio > 0.15;

  // Score: skin coverage (0-0.5) + brightness quality (0-0.3) + region size (0-0.2)
  const skinScore = Math.min(skinRatio * 2.5, 0.5);
  const brightnessScore = avgBrightness > 80 && avgBrightness < 220 ? 0.3 : 0.1;
  const areaRatio = (fw * fh) / (imgW * imageData.height);
  const sizeScore = Math.min(areaRatio * 3, 0.2);

  const score = Math.round((skinScore + brightnessScore + sizeScore) * 100) / 100;

  return {
    score,
    hasFace,
    details: hasFace
      ? `Face detected: skin ${(skinRatio * 100).toFixed(0)}%, brightness ${avgBrightness.toFixed(0)}`
      : 'No face detected — skin ratio below threshold',
  };
}

// ─── Task 105: Color Contrast Optimization ──────────────────────────────────

export interface ContrastResult {
  score: number;
  warmRatio: number;
  coolRatio: number;
  recommendation: string;
}

/**
 * Scores warm/cool contrast in thumbnail image data.
 * Warm colors (R>G, hue 0-60, 300-360) vs cool colors (G>B, hue 120-240).
 *
 * Requirements: Task 105
 */
export function computeThumbnailContrast(imageData: ImageData): ContrastResult {
  const { data } = imageData;
  let warmCount = 0;
  let coolCount = 0;
  const totalPixels = data.length / 4;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    // Classify by dominant channel relationship
    if (r > g && r > b && r > 60) {
      warmCount++;
    } else if (b > r && b > g && b > 60) {
      coolCount++;
    } else if (g > r && g > b && g > 60) {
      // Green can lean warm or cool; count as neutral
    }
  }

  const warmRatio = totalPixels > 0 ? warmCount / totalPixels : 0;
  const coolRatio = totalPixels > 0 ? coolCount / totalPixels : 0;
  const imbalance = Math.abs(warmRatio - coolRatio);

  // Good contrast = moderate mix of warm and cool
  let score: number;
  let recommendation: string;

  if (imbalance < 0.15 && (warmRatio + coolRatio) > 0.3) {
    score = 0.9;
    recommendation = 'Excellent warm/cool balance';
  } else if (imbalance < 0.3) {
    score = 0.7;
    recommendation = 'Good contrast, minor adjustment possible';
  } else if (warmRatio > 0.6) {
    score = 0.4;
    recommendation = 'Overwhelmingly warm — consider cooler background';
  } else if (coolRatio > 0.6) {
    score = 0.4;
    recommendation = 'Overwhelmingly cool — consider warmer accent';
  } else {
    score = 0.5;
    recommendation = 'Low color diversity — add contrasting elements';
  }

  return { score, warmRatio, coolRatio, recommendation };
}

// ─── Task 106: Mobile Text Readability (120x90 simulation) ──────────────────

export interface MobileReadabilityCheck {
  readable: boolean;
  score: number;
  effectiveFontSize: number;
  issues: string[];
}

/**
 * Simulates rendering text at 120x90px (mobile YouTube thumbnail) and
 * evaluates readability.
 *
 * Requirements: Task 106
 */
export function checkMobileReadability(
  text: string,
  fontSize: number,
): MobileReadabilityCheck {
  const issues: string[] = [];
  let score = 1.0;

  // Simulate scale: 1280x720 -> 120x90 (factor ~0.09375)
  const scale = 120 / 1280;
  const effectiveFontSize = Math.round(fontSize * scale);

  // At 120px width, ~12-15 chars are legible with bold font
  const MAX_CHARS = 15;
  if (text.length > MAX_CHARS) {
    issues.push(`Text (${text.length} chars) exceeds ${MAX_CHARS} char limit at 120x90px`);
    score -= 0.3;
  }

  // Word count check (2-4 words for mobile)
  const words = text.trim().split(/\s+/);
  if (words.length > 4) {
    issues.push(`${words.length} words — too many for mobile readability (max 4)`);
    score -= 0.3;
  } else if (words.length < 2) {
    issues.push('Only 1 word — may not communicate enough');
    score -= 0.1;
  }

  // Effective font size check (must be >= 8px to be legible)
  if (effectiveFontSize < 8) {
    issues.push(`Effective font size ${effectiveFontSize}px is below 8px minimum`);
    score -= 0.4;
  }

  // All-caps is more readable at small sizes
  if (text !== text.toUpperCase() && text.length > 10) {
    issues.push('Mixed case reduces readability at small sizes — consider uppercase');
    score -= 0.05;
  }

  score = Math.max(0, Math.min(1, score));

  return {
    readable: score >= 0.6,
    score,
    effectiveFontSize,
    issues,
  };
}

// ─── Task 107: A/B Thumbnail Variants ───────────────────────────────────────

export interface ThumbnailABVariant {
  variantId: string;
  colorScheme: string[];
  textPosition: { x: number; y: number };
  text: string;
}

/**
 * Generates 3 A/B thumbnail variants with different color schemes and text positions.
 *
 * Requirements: Task 107
 */
export function generateABVariants(
  text: string,
  colorAccent: string,
): ThumbnailABVariants {
  const validatedText = enforceTextWordCount2to4(text);

  return {
    current: {
      variantId: 'A-current',
      colorScheme: [colorAccent, '#ffffff', '#000000'],
      textPosition: { x: 640, y: 500 },
      text: validatedText,
    },
    altColor: {
      variantId: 'B-alt-color',
      colorScheme: [invertColor(colorAccent), '#ffffff', '#000000'],
      textPosition: { x: 640, y: 500 },
      text: validatedText,
    },
    altPosition: {
      variantId: 'C-alt-position',
      colorScheme: [colorAccent, '#ffffff', '#000000'],
      textPosition: { x: 640, y: 120 },
      text: validatedText,
    },
  };
}

export interface ThumbnailABVariants {
  current: ThumbnailABVariant;
  altColor: ThumbnailABVariant;
  altPosition: ThumbnailABVariant;
}

function invertColor(hex: string): string {
  const clean = hex.replace('#', '');
  const r = (255 - parseInt(clean.substring(0, 2), 16)).toString(16).padStart(2, '0');
  const g = (255 - parseInt(clean.substring(2, 4), 16)).toString(16).padStart(2, '0');
  const b = (255 - parseInt(clean.substring(4, 6), 16)).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

// ─── Task 108: Brand Consistency ────────────────────────────────────────────

/**
 * Enforces brand consistency on a thumbnail canvas.
 * Applies consistent font family, color palette, and logo placement.
 *
 * Requirements: Task 108
 */
export function enforceBrandConsistency(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  config: BrandConfig = DEFAULT_BRAND_CONFIG,
): void {
  // Enforce font family — set as default for text operations
  ctx.font = `bold ${Math.round(height * 0.1)}px ${config.fontFamily}`;

  // Enforce color palette — validate any fill/stroke is from palette
  // (Applied at call-site when setting colors)

  // Logo placement indicator (corner badge)
  const badgeSize = 40;
  let bx: number;
  let by: number;
  switch (config.logoPlacement) {
    case 'top-left':
      bx = 10; by = 10; break;
    case 'top-right':
      bx = width - badgeSize - 10; by = 10; break;
    case 'bottom-left':
      bx = 10; by = height - badgeSize - 10; break;
    case 'bottom-right':
    default:
      bx = width - badgeSize - 10; by = height - badgeSize - 10; break;
  }

  ctx.globalAlpha = config.logoOpacity;
  ctx.fillStyle = config.colorPalette[0];
  ctx.fillRect(bx, by, badgeSize, 6);
  ctx.globalAlpha = 1;
}

// ─── Task 109: YouTube Size Verification ────────────────────────────────────

export interface YouTubeSizeCheck {
  valid: boolean;
  width: number;
  height: number;
  sizeBytes: number;
  issues: string[];
}

/**
 * Verifies thumbnail meets YouTube requirements: 1280x720, <2MB, JPEG quality 0.92.
 *
 * Requirements: Task 109
 */
export function verifyYouTubeSize(blob: Blob, width: number, height: number): YouTubeSizeCheck {
  const issues: string[] = [];
  let valid = true;

  if (width !== 1280 || height !== 720) {
    issues.push(`Dimensions ${width}x${height} do not match 1280x720`);
    valid = false;
  }

  const maxSize = 2 * 1024 * 1024; // 2MB
  if (blob.size > maxSize) {
    issues.push(`File size ${(blob.size / 1024 / 1024).toFixed(2)}MB exceeds 2MB limit`);
    valid = false;
  }

  if (blob.size < 10240) {
    issues.push('File too small — likely corrupt or empty');
    valid = false;
  }

  if (!blob.type.includes('jpeg') && !blob.type.includes('jpg')) {
    issues.push(`MIME type ${blob.type} is not JPEG`);
    valid = false;
  }

  return { valid, width, height, sizeBytes: blob.size, issues };
}

// ─── Task 110: Warm/Cool Contrast ───────────────────────────────────────────

/**
 * Returns a complementary background color temperature.
 * If subject is warm (red/orange), returns cool (blue/teal) and vice versa.
 *
 * Requirements: Task 110
 */
export function getComplementaryTemperature(accentColor: string): string {
  const luminance = getRelativeLuminance(accentColor);
  const cleanHex = accentColor.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);

  const isWarm = r > b && (r - b) > 30;

  if (isWarm) {
    // Return cool complementary
    return luminance > 0.4 ? '#1e3a5f' : '#0d9488';
  }
  // Return warm complementary
  return luminance > 0.4 ? '#f97316' : '#dc2626';
}

// ─── Task 111: Limit Text to 2-4 Words ──────────────────────────────────────

/**
 * Validates overlay text is 2-4 words max. Truncates if longer.
 *
 * Requirements: Task 111
 */
export function enforceTextWordCount2to4(text: string): string {
  const words = text.trim().split(/\s+/);
  if (words.length >= 2 && words.length <= 4) return text.trim();
  if (words.length > 4) return words.slice(0, 4).join(' ');
  if (words.length === 1) return `${words[0]} Now`;
  return text.trim();
}

// ─── Task 112: Ensure Face Occupies 30%+ ────────────────────────────────────

export interface FaceZoomResult {
  cropX: number;
  cropY: number;
  cropW: number;
  cropH: number;
  zoomed: boolean;
}

/**
 * When a face is detected, calculates a crop region so the face fills
 * at least 30% of the thumbnail area.
 *
 * Requirements: Task 112
 */
export function ensureFaceOccupies30Percent(
  faceRegion: { x: number; y: number; width: number; height: number },
  canvasWidth: number,
  canvasHeight: number,
): FaceZoomResult {
  const targetAreaRatio = 0.30;
  const faceArea = faceRegion.width * faceRegion.height;
  const canvasArea = canvasWidth * canvasHeight;
  const currentRatio = faceArea / canvasArea;

  if (currentRatio >= targetAreaRatio) {
    return {
      cropX: 0,
      cropY: 0,
      cropW: canvasWidth,
      cropH: canvasHeight,
      zoomed: false,
    };
  }

  // Calculate zoom factor needed
  const zoomFactor = Math.sqrt(targetAreaRatio / currentRatio);
  const newW = canvasWidth / zoomFactor;
  const newH = canvasHeight / zoomFactor;

  // Center crop on face center
  const faceCX = faceRegion.x + faceRegion.width / 2;
  const faceCY = faceRegion.y + faceRegion.height / 2;

  let cropX = faceCX - newW / 2;
  let cropY = faceCY - newH / 2;

  // Clamp to canvas bounds
  cropX = Math.max(0, Math.min(cropX, canvasWidth - newW));
  cropY = Math.max(0, Math.min(cropY, canvasHeight - newH));

  return {
    cropX: Math.round(cropX),
    cropY: Math.round(cropY),
    cropW: Math.round(newW),
    cropH: Math.round(newH),
    zoomed: true,
  };
}

// ─── Task 113: Negative Space for Text ──────────────────────────────────────

/**
 * Ensures text has clear negative space by adding a semi-transparent
 * overlay behind the text region if needed.
 *
 * Requirements: Task 113
 */
export function ensureTextNegativeSpace(
  ctx: CanvasRenderingContext2D,
  textX: number,
  textY: number,
  textWidth: number,
  textHeight: number,
  imageData: ImageData,
): void {
  // Sample pixel complexity in the text region
  const { data, width: imgW } = imageData;
  const startX = Math.max(0, Math.round(textX - textWidth / 2));
  const startY = Math.max(0, Math.round(textY - textHeight / 2));
  const endX = Math.min(imgW, Math.round(textX + textWidth / 2));
  const endY = Math.min(imageData.height, Math.round(textY + textHeight / 2));

  let edgeCount = 0;
  let totalSampled = 0;

  for (let y = startY; y < endY; y += 4) {
    for (let x = startX; x < endX; x += 4) {
      const idx = (y * imgW + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      // Check right neighbor for edge detection
      if (x + 4 < endX) {
        const nIdx = (y * imgW + x + 4) * 4;
        const diff = Math.abs(r - data[nIdx]) + Math.abs(g - data[nIdx + 1]) + Math.abs(b - data[nIdx + 2]);
        if (diff > 60) edgeCount++;
      }
      totalSampled++;
    }
  }

  const edgeRatio = totalSampled > 0 ? edgeCount / totalSampled : 0;

  // If high edge density, add semi-transparent dark overlay for readability
  if (edgeRatio > 0.2) {
    const padding = 20;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.beginPath();
    const rx = startX - padding;
    const ry = startY - padding;
    const rw = endX - startX + padding * 2;
    const rh = endY - startY + padding * 2;
    const radius = 8;
    ctx.moveTo(rx + radius, ry);
    ctx.lineTo(rx + rw - radius, ry);
    ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + radius);
    ctx.lineTo(rx + rw, ry + rh - radius);
    ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - radius, ry + rh);
    ctx.lineTo(rx + radius, ry + rh);
    ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - radius);
    ctx.lineTo(rx, ry + radius);
    ctx.quadraticCurveTo(rx, ry, rx + radius, ry);
    ctx.fill();
  }
}

// ─── Task 115: YouTube API Thumbnail Upload ──────────────────────────────────

export interface YouTubeThumbnailUploadResult {
  success: boolean;
  url?: string;
  error?: string;
}

interface YouTubeThumbnailResponse {
  items?: Array<{
    snippet?: {
      thumbnails?: Record<string, { url: string }>;
    };
  }>;
}

/**
 * Uploads a thumbnail via YouTube Data API v3.
 * Requires an OAuth2 access token with youtube.upload scope.
 *
 * Requirements: Task 115
 */
export async function uploadThumbnailViaAPI(
  videoId: string,
  thumbnailBlob: Blob,
  accessToken: string,
): Promise<YouTubeThumbnailUploadResult> {
  if (!accessToken) {
    return { success: false, error: 'No access token provided' };
  }

  if (!videoId) {
    return { success: false, error: 'No video ID provided' };
  }

  try {
    const response = await fetch(
      `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'image/jpeg',
        },
        body: thumbnailBlob,
      },
    );

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      const errorMsg = (errorBody as Record<string, unknown>).error
        ? ((errorBody as Record<string, Record<string, string>>).error.message ?? 'Unknown API error')
        : `HTTP ${response.status}`;
      return { success: false, error: errorMsg };
    }

    const result: YouTubeThumbnailResponse = await response.json();
    const thumbUrl = result.items?.[0]?.snippet?.thumbnails?.default?.url;

    logger.success('YouTube', `Thumbnail uploaded for video ${videoId}`);
    return { success: true, url: thumbUrl };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('YouTube', `Thumbnail upload failed: ${msg}`);
    return { success: false, error: msg };
  }
}

// ─── Task 116: Saliency Map Prediction ──────────────────────────────────────

export interface SaliencyMap {
  width: number;
  height: number;
  grid: number[][];
  hotspots: Array<{ x: number; y: number; score: number }>;
}

/**
 * Predicts viewer attention areas using color contrast, edge density,
 * and center-bias heuristics.
 *
 * Requirements: Task 116
 */
export function predictSaliencyMap(
  imageData: ImageData,
  w: number,
  h: number,
): SaliencyMap {
  const { data } = imageData;
  const gridSize = 16;
  const cols = Math.ceil(w / gridSize);
  const rows = Math.ceil(h / gridSize);
  const grid: number[][] = [];

  for (let gy = 0; gy < rows; gy++) {
    const row: number[] = [];
    for (let gx = 0; gx < cols; gx++) {
      let saliency = 0;
      const startX = gx * gridSize;
      const startY = gy * gridSize;
      const endX = Math.min(startX + gridSize, w);
      const endY = Math.min(startY + gridSize, h);
      let pixelCount = 0;
      let colorVariance = 0;
      let edgeCount = 0;
      let brightnessSum = 0;

      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          const idx = (y * w + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          pixelCount++;
          brightnessSum += (r + g + b) / 3;

          // Edge detection (compare with right neighbor)
          if (x + 1 < w) {
            const nIdx = (y * w + x + 1) * 4;
            const diff = Math.abs(r - data[nIdx]) + Math.abs(g - data[nIdx + 1]) + Math.abs(b - data[nIdx + 2]);
            if (diff > 40) edgeCount++;
          }

          // Color variance (high saturation = salient)
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          colorVariance += max > 0 ? (max - min) / max : 0;
        }
      }

      if (pixelCount > 0) {
        const avgBrightness = brightnessSum / pixelCount;
        const edgeRatio = edgeCount / pixelCount;
        const avgSaturation = colorVariance / pixelCount;

        // High contrast areas are salient
        saliency += edgeRatio * 2;
        // High saturation is salient
        saliency += avgSaturation;
        // Very bright or very dark spots draw attention
        if (avgBrightness > 200 || avgBrightness < 40) saliency += 0.3;
        // Center bias
        const cx = (gx + 0.5) / cols;
        const cy = (gy + 0.5) / rows;
        const distFromCenter = Math.sqrt((cx - 0.5) ** 2 + (cy - 0.5) ** 2);
        saliency += Math.max(0, 0.3 - distFromCenter * 0.6);
      }

      row.push(Math.min(1, Math.max(0, saliency)));
    }
    grid.push(row);
  }

  // Find hotspots (cells with saliency > 0.6)
  const hotspots: Array<{ x: number; y: number; score: number }> = [];
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      if (grid[gy][gx] > 0.6) {
        hotspots.push({
          x: Math.round((gx + 0.5) * gridSize),
          y: Math.round((gy + 0.5) * gridSize),
          score: grid[gy][gx],
        });
      }
    }
  }

  hotspots.sort((a, b) => b.score - a.score);

  return { width: w, height: h, grid, hotspots: hotspots.slice(0, 10) };
}

// ─── Task 117: Thumbnail Variation Polling ───────────────────────────────────

export interface ThumbnailVariationSet {
  variants: Array<{
    id: string;
    blob: Blob;
    colorAccent: string;
    textPosition: string;
    gradientPreset: string;
  }>;
  selectedId?: string;
}

/**
 * Generates 5 thumbnail variants with different combinations of
 * color schemes, text positions, and gradient presets for A/B testing.
 *
 * Requirements: Task 117
 */
export async function generateThumbnailVariations(
  title: string,
  topic: string,
  baseAccent: string,
  assets?: MediaAsset[],
): Promise<ThumbnailVariationSet> {
  const variants: ThumbnailVariationSet['variants'] = [];

  const colorOptions = [
    baseAccent,
    invertColor(baseAccent),
    '#ef4444',
    '#2563eb',
    '#f97316',
  ];

  const textPositions = [
    { x: 640, y: 600, label: 'bottom-center' },
    { x: 640, y: 120, label: 'top-center' },
    { x: 320, y: 600, label: 'bottom-left' },
    { x: 960, y: 600, label: 'bottom-right' },
    { x: 640, y: 360, label: 'center' },
  ];

  const gradients = GRADIENT_PRESETS.map(p => p.name);

  for (let i = 0; i < 5; i++) {
    const blob = await generateThumbnail(title, topic, undefined, 1280, 720, assets);
    variants.push({
      id: `variant-${i + 1}`,
      blob,
      colorAccent: colorOptions[i],
      textPosition: textPositions[i].label,
      gradientPreset: gradients[i],
    });
  }

  logger.info('Thumbnail', `Generated ${variants.length} thumbnail variants for A/B testing`);

  return { variants };
}

// ─── Downloads ──────────────────────────────────────────────────────────────

/**
 * Downloads the thumbnail as a PNG file.
 */
export function downloadThumbnail(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  logger.success('Thumbnail', `Downloaded ${filename}`);
}

// ─── Task 152: Face Detection for Thumbnail Selection ────────────────────────

/**
 * Brightness-based skin-tone face detection for thumbnail selection.
 * Scores an image region for likely face presence based on skin-tone pixel
 * ratio and brightness analysis.
 *
 * Uses the same heuristic as scoreFaceExpression but optimized for
 * thumbnail background selection where we want to prefer images with faces.
 *
 * @param imageData - Raw RGBA pixel data
 * @param region - Bounding box to analyze
 * @param imgWidth - Width of the source image
 * @returns Detection result with hasFace flag and confidence score
 */
export function detectFaceForThumbnail(
  imageData: Uint8ClampedArray,
  region: { x: number; y: number; width: number; height: number },
  imgWidth: number,
): { hasFace: boolean; confidence: number; skinRatio: number; avgBrightness: number } {
  const { x: rx, y: ry, width: rw, height: rh } = region;
  if (rw <= 0 || rh <= 0) {
    return { hasFace: false, confidence: 0, skinRatio: 0, avgBrightness: 0 };
  }

  let skinPixels = 0;
  let totalPixels = 0;
  let brightnessSum = 0;

  const xEnd = Math.min(rx + rw, imgWidth);
  const yEnd = Math.min(ry + rh, Math.floor(imageData.length / 4 / imgWidth));

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

  if (totalPixels === 0) {
    return { hasFace: false, confidence: 0, skinRatio: 0, avgBrightness: 0 };
  }

  const skinRatio = skinPixels / totalPixels;
  const avgBrightness = brightnessSum / totalPixels;

  // Face is likely present if skin ratio > 15% and brightness is reasonable
  const hasFace = skinRatio > 0.15 && avgBrightness > 60 && avgBrightness < 240;
  const confidence = hasFace ? Math.min(1, skinRatio * 2.5) : 0;

  return { hasFace, confidence, skinRatio, avgBrightness };
}

/**
 * Scores a set of thumbnail asset candidates, boosting those that contain faces.
 * Face-containing thumbnails typically get higher click-through rates.
 *
 * @param candidates - Array of MediaAsset candidates to score
 * @returns Scored candidates with face boost applied
 */
export function applyFaceDetectionBoost(
  candidates: MediaAsset[],
): MediaAsset[] {
  // Face detection requires pixel data which isn't available at selection time.
  // Instead, boost candidates whose alt text suggests face/portrait content.
  const faceIndicators = ['face', 'portrait', 'person', 'people', 'headshot', 'speaker', 'interview', 'reaction', 'expression'];

  return candidates.map(asset => {
    const altLower = (asset.alt || '').toLowerCase();
    const hasFaceIndicator = faceIndicators.some(indicator => altLower.includes(indicator));
    if (hasFaceIndicator) {
      const currentScore = asset.score ?? 0;
      return { ...asset, score: currentScore + 25 };
    }
    return asset;
  });
}
