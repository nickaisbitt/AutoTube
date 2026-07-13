/**
 * YouTube-native export profile — full-bleed visuals, Hormozi-style captions, voice-first audio.
 */

export function isYouTubeExportMode(project) {
  if (process.env.AUTOTUBE_YOUTUBE_MODE === '0' || process.env.AUTOTUBE_YOUTUBE_MODE === 'false') {
    return false;
  }
  if (process.env.AUTOTUBE_YOUTUBE_MODE === '1' || process.env.AUTOTUBE_YOUTUBE_MODE === 'true') {
    return true;
  }
  const es = project?.exportSettings;
  if (es?.youtubeMode === false) return false;
  if (es?.youtubeMode === true || es?.format === 'youtube') return true;
  // Product default: YouTube-ready captions / hook / CTA / voice-first mix
  if (es && es.youtubeMode === undefined) return true;
  const style = (project?.style || '').toLowerCase();
  return style === 'youtube_viral' || style === 'mr_beast' || style === 'business_insider';
}

export function captionMetrics(height, width) {
  const basePx = Math.round(height * 0.078);
  const currentPx = Math.round(height * 0.092);
  const strokePx = Math.max(8, Math.round(height * 0.009));
  const bottomPad = Math.round(height * 0.14);
  return { basePx, currentPx, strokePx, bottomPad, maxWords: 4, barWidth: width * 0.94 };
}

export function hookFontPx(height) {
  return Math.round(height * 0.09);
}

/** Max seconds before switching B-roll within a segment (YouTube retention). */
export function assetCutIntervalSec(project) {
  if (!isYouTubeExportMode(project)) return null;
  const raw = process.env.AUTOTUBE_CUT_INTERVAL_SEC;
  const parsed = raw ? parseFloat(raw) : 1.0;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1.0;
}

/**
 * Best cold-open hook line: prefer sentences with numbers/stakes, not "In 2024…".
 * @param {string} narration
 */
export function buildRetentionHook(narration) {
  if (!narration || !narration.trim()) return 'Watch this before it\'s too late.';
  const sentences = narration
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12);
  const score = (s) => {
    let n = 0;
    if (/\d/.test(s)) n += 4;
    if (/\b(billion|million|thousand|%\d|\d+%)\b/i.test(s)) n += 3;
    if (/\b(hack|stolen|ransom|breach|exposed|died|lawsuit|fine)\b/i.test(s)) n += 2;
    if (/^in \d{4}/i.test(s)) n -= 3;
    if (/^in this video/i.test(s)) n -= 4;
    return n;
  };
  const ranked = [...sentences].sort((a, b) => score(b) - score(a));
  const pick = ranked[0] || sentences[0] || narration;
  return pick.length > 72 ? `${pick.slice(0, 69)}…` : pick;
}

/** Tokenize narration for captions (keeps punctuation attached to words). */
export function tokenizeCaptionWords(text) {
  if (!text) return [];
  return text.match(/[\w']+|[^\w\s]/g) || [];
}
