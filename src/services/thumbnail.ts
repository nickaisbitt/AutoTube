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
  /** Short text overlay for the thumbnail (2-5 words) */
  textOverlay: string;
  /** Accent color hex code for urgency/emotion */
  colorAccent: string;
  /** Single dominant subject description — no competing focal points */
  dominantSubject: string;
  /** Search queries to find appropriate imagery */
  searchQueries: string[];
}

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
 * Validates that a text overlay is between 2 and 5 words.
 * Trims to 5 words if too long, pads if too short.
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
  } catch (err) {
    // 11. On any error, fall back to the existing single-image layout
    console.warn('Thumbnail multi-image layout failed, using fallback:', (err as Error).message);
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
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  // Determine background image URL: prefer highest-scored non-fallback asset
  let bgUrl = imageUrl;
  if (assets && assets.length > 0) {
    const bestAsset = selectThumbnailBackground(assets);
    if (bestAsset) {
      bgUrl = bestAsset.url;
    }
  }

  // Background gradient (fallback base)
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, '#0f172a');
  grad.addColorStop(0.5, '#1e293b');
  grad.addColorStop(1, '#0f172a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Try to load background image with fallback chain
  if (bgUrl) {
    try {
      const img = await loadImage(bgUrl);
      ctx.save();
      ctx.globalAlpha = 0.3;
      const scale = Math.max(width / img.width, height / img.height);
      const dw = img.width * scale;
      const dh = img.height * scale;
      ctx.drawImage(img, (width - dw) / 2, (height - dh) / 2, dw, dh);
      ctx.restore();
    } catch {
      // Fallback chain exhausted — gradient-only background (no error thrown)
      logger.warn('Thumbnail', 'Failed to load background image, using gradient-only fallback');
    }
  }

  // Dark gradient overlay for text readability: rgba(0,0,0,0.4) top → rgba(0,0,0,0.8) bottom
  const overlay = ctx.createLinearGradient(0, 0, 0, height);
  overlay.addColorStop(0, 'rgba(0,0,0,0.4)');
  overlay.addColorStop(1, 'rgba(0,0,0,0.8)');
  ctx.fillStyle = overlay;
  ctx.fillRect(0, 0, width, height);

  // Accent line
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(60, height / 2 - 80, 80, 4);

  // Determine overlay text: use hook line key phrase when available
  let overlayText = title;
  if (hookLine && hookLine.trim().length > 0) {
    const keyPhrase = extractKeyPhrase(hookLine);
    if (keyPhrase) {
      overlayText = keyPhrase;
    }
  }
  // Truncate overlay text to 80 characters with ellipsis
  overlayText = truncateOverlayText(overlayText, 80);

  // Title text — bold 56px system-ui with white fill
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 56px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  
  // Dark text shadow (blur 20px, offset 0,4)
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 20;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 4;
  
  wrapText(ctx, overlayText, 60, height / 2 - 60, width - 120, 68);
  
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  // Topic tag
  ctx.fillStyle = '#ef4444';
  roundRect(ctx, 60, height / 2 + 120, 120, 36, 6);
  ctx.fill();
  
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('AUTOTUBE', 120, height / 2 + 132);

  // ─── Post-render validation (Requirements 4.1, 4.5, 4.6) ───────────────────
  // Check if the rendered thumbnail is effectively all-black
  const imageData = ctx.getImageData(0, 0, width, height);
  if (isBlackThumbnail(imageData)) {
    logger.warn('Thumbnail', 'Rendered thumbnail detected as black — regenerating with gradient-plus-text fallback');
    // Clear canvas and render gradient-plus-text fallback
    ctx.clearRect(0, 0, width, height);
    renderGradientTextFallback(canvas, ctx, title, topic, hookLine);
  }

  // Convert to blob and validate minimum file size
  let blob = await canvasToBlob(canvas, 'image/png');

  // Validate minimum 10KB file size; if below, regenerate with higher quality JPEG
  if (!validateThumbnailSize(blob)) {
    logger.warn('Thumbnail', `Thumbnail blob too small (${blob.size} bytes) — regenerating with higher quality`);
    // Try JPEG at maximum quality for larger file size
    blob = await canvasToBlob(canvas, 'image/jpeg', 1.0);

    // If still too small after JPEG, force the gradient-plus-text fallback
    if (!validateThumbnailSize(blob)) {
      logger.warn('Thumbnail', 'Still below minimum size — applying gradient-plus-text fallback');
      ctx.clearRect(0, 0, width, height);
      renderGradientTextFallback(canvas, ctx, title, topic, hookLine);
      blob = await canvasToBlob(canvas, 'image/png');
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

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number): void {
  let line = '';
  let cy = y;
  for (const word of text.split(' ')) {
    const test = line + word + ' ';
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line.trim(), x, cy);
      line = word + ' ';
      cy += lineH;
    } else {
      line = test;
    }
  }
  ctx.fillText(line.trim(), x, cy);
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
 * Validates that a thumbnail text overlay is between 2 and 5 words.
 * Returns the validated text if within range, or a truncated/padded version.
 *
 * - If text has 2-5 words: returns trimmed text unchanged
 * - If text has >5 words: truncates to first 5 words
 * - If text has <2 words: pads with "Now" to reach 2 words
 *
 * Requirements: 2.5, 2.7, 2.23
 */
export function validateThumbnailText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return 'Watch Now';

  const words = trimmed.split(/\s+/);

  if (words.length >= 2 && words.length <= 5) {
    return trimmed;
  }

  if (words.length > 5) {
    return words.slice(0, 5).join(' ');
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
 * - Word count (2-5 words for mobile legibility)
 * - Estimated character width at scaled font size
 * - Contrast between text and background (via color accent)
 * - Text overlay length relative to available space
 *
 * Requirements: 2.6, 2.13, 2.14, 2.15, 2.16, 2.17, 2.18
 */
export function checkMobileReadability(concept: ThumbnailConcept): MobileReadabilityResult {
  const issues: string[] = [];
  let score = 1.0;

  const text = concept.textOverlay.trim();
  const words = text.split(/\s+/);

  // Check word count (2-5 words ideal for mobile)
  if (words.length > 5) {
    issues.push('Text exceeds 5 words — unreadable at mobile size');
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

  // 2-5 words is ideal
  if (textWords >= 2 && textWords <= 5) {
    textScore += 0.5;
  } else if (textWords > 5) {
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

  // Filter: ensure all variants are 2-5 words
  const validVariants = variants
    .map(v => v.trim())
    .filter(v => {
      const wordCount = v.split(/\s+/).length;
      return wordCount >= 2 && wordCount <= 5;
    });

  // Deduplicate and exclude the original text
  const originalLower = text.toLowerCase().trim();
  const unique = [...new Set(validVariants)].filter(
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
