/**
 * YouTube-native export profile — full-bleed visuals, Hormozi-style captions, voice-first audio.
 */

export function isYouTubeExportMode(project) {
  if (process.env.AUTOTUBE_YOUTUBE_MODE === '1' || process.env.AUTOTUBE_YOUTUBE_MODE === 'true') {
    return true;
  }
  const es = project?.exportSettings;
  if (es?.youtubeMode === true || es?.format === 'youtube') return true;
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
