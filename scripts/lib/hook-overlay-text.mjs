/**
 * Shared text normalization for short hook overlays.
 */

function splitMergedWordAt(index) {
  return (word) => `${word.slice(0, index)} ${word.slice(index)}`;
}

export function preserveHookWordBoundaries(text) {
  return String(text || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\bcabinkeep\b/gi, splitMergedWordAt(5))
    .replace(/\bcabinkept\b/gi, splitMergedWordAt(5))
    .replace(/\bcabinpressure\b/gi, splitMergedWordAt(5))
    .replace(/\boxygenmask\b/gi, splitMergedWordAt(6))
    .replace(/\boxygenmasks\b/gi, splitMergedWordAt(6))
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeHookOverlayText(text, options = {}) {
  const allowColon = options.allowColon === true;
  const disallowed = allowColon ? /[^A-Z0-9\s:$%?]/g : /[^A-Z0-9\s$%?]/g;
  return preserveHookWordBoundaries(text)
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/:/g, allowColon ? ':' : ' ')
    .replace(disallowed, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function hookOverlayWords(text, options = {}) {
  const maxWords = Number.isFinite(options.maxWords) ? options.maxWords : Infinity;
  return normalizeHookOverlayText(text, options)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, maxWords);
}
