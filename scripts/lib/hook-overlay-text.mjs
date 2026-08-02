/**
 * Shared text normalization + honesty gates for short hook overlays.
 *
 * Honesty contract (audit blockers):
 *  1. The burned-in overlay must match what the video actually says (spoken
 *     hook / topic anchors) — never a stale claim from a previous topic.
 *  2. Airline topics never get medical/unrelated family overlays.
 *  3. There is no self-attest bypass: every candidate (exportSettings, env,
 *     fix-state, watcher suggestion) goes through the same violation check.
 */

import { isAirlineTopic } from './topic-family.mjs';

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
    // Strip apostrophes without inserting a space so HERE'S → HERES (not HERE S).
    .replace(/[''`´‘’]/g, '')
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

/** Editor/watcher instructions must never be burned onto the frame. */
export function isInstructionHookText(text) {
  const t = String(text || '').trim();
  return /^(replace|rewrite|start with|use|change|fix|try|make|update|swap)\b/i.test(t)
    || /\brewrite\s+line\b/i.test(t)
    || /\bshock hook\b/i.test(t)
    || /\bas:\s*$/i.test(t)
    || /^(line\s*1|first\s+line)\b/i.test(t);
}

// Hype/filler tokens don't count as evidence that an overlay matches the story.
const HOOK_ANCHOR_STOP_WORDS = new Set([
  'THE', 'AND', 'ARE', 'WAS', 'WERE', 'THIS', 'THAT', 'THESE', 'THOSE', 'THEY', 'THEM',
  'YOU', 'YOUR', 'OUR', 'ITS', 'FOR', 'WITH', 'FROM', 'WHY', 'HOW', 'WHAT', 'WHO',
  'WHEN', 'WHERE', 'DID', 'DOES', 'HAS', 'HAD', 'HAVE', 'NOT', 'BEFORE', 'AFTER',
  'WHILE', 'UNTIL', 'ALREADY', 'STILL', 'JUST', 'NOW', 'HERE', 'THERE', 'EVERY',
  'INTO', 'ABOUT', 'GET', 'GOT', 'ONE', 'TWO', 'ALL', 'OUT', 'TOO', 'VERY',
  'BREAKING', 'URGENT', 'ALERT', 'NEWS', 'EXPOSED', 'SHOCKING', 'TRUTH',
]);

function stemHookAnchor(word) {
  let w = word;
  if (w.length > 5 && w.endsWith('ING')) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith('ED')) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith('ES')) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith('S')) w = w.slice(0, -1);
  return w;
}

/** Meaningful stemmed story words — the anchors an honest overlay must share. */
export function hookAnchorWords(text) {
  return hookOverlayWords(text)
    .map((w) => w.replace(/[^A-Z0-9]/g, ''))
    .filter((w) => w.length > 2 && !HOOK_ANCHOR_STOP_WORDS.has(w))
    .map(stemHookAnchor);
}

function anchorsMatch(a, b) {
  if (a === b) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  return shorter.length >= 4 && longer.startsWith(shorter);
}

/** True when overlay and reference share at least one meaningful anchor word. */
export function sharesHookAnchor(overlayText, referenceText) {
  const overlayAnchors = hookAnchorWords(overlayText);
  const refAnchors = hookAnchorWords(referenceText);
  if (!overlayAnchors.length || !refAnchors.length) return false;
  return overlayAnchors.some((o) => refAnchors.some((r) => anchorsMatch(o, r)));
}

/** Medical / other-family vocabulary that is off-limits on airline stories. */
export const AIRLINE_UNRELATED_OVERLAY_RE =
  /\b(patients?|hospitals?|medical|medicine|clinics?|nurses?|nursing|doctors?|surgeons?|surgery|icu|hipaa|ransomware|prescriptions?|diagnosis|bank|accounts?|landlords?|tenants?|evict(?:ed|ion)?|diamonds?|heist|tickets?|students?|fertility)\b/gi;

/**
 * Why an overlay candidate may not be burned for this video, or null when honest.
 * Reference = topic + spoken hook; when neither exists nothing can be validated.
 *
 * @param {string} overlayText
 * @param {{ topic?: string, spokenHook?: string }} [context]
 * @returns {string | null}
 */
export function hookOverlayViolation(overlayText, context = {}) {
  const text = String(overlayText || '').trim();
  if (!text) return 'empty overlay';
  if (isInstructionHookText(text)) return 'editor instruction, not viewer-facing hook text';
  if (!hookAnchorWords(text).length) return 'label-only overlay with no story words';

  const topic = String(context.topic || '').trim();
  const spokenHook = String(context.spokenHook || '').trim();
  const reference = `${topic} ${spokenHook}`.trim();
  if (!reference) return null;

  if (!sharesHookAnchor(text, reference)) {
    return 'overlay shares no words with the spoken hook or topic';
  }

  if (isAirlineTopic(topic)) {
    const banned = [...new Set((text.match(AIRLINE_UNRELATED_OVERLAY_RE) || []).map((m) => m.toUpperCase()))];
    for (const token of banned) {
      // Allowed only when the story itself motivates the word (e.g. medevac).
      if (!sharesHookAnchor(token, reference)) {
        return `medical/unrelated overlay word "${token}" on an airline topic`;
      }
    }
  }

  return null;
}

/**
 * The hook the viewer actually hears: first sentence of the intro narration,
 * falling back to the declared hook line. Narration is ground truth — declared
 * hook fields are claims and are validated against it.
 */
export function spokenHookFromProject(project) {
  const narration = String(project?.script?.[0]?.narration || '').trim();
  const firstSentence = (narration.match(/^[^.!?\n]+[.!?]?/) || [''])[0].trim();
  if (firstSentence.length >= 12 && !isInstructionHookText(firstSentence)) return firstSentence;
  return String(project?.hookLine || project?.exportSettings?.hookLine || '').trim();
}

/**
 * Walk overlay candidates in precedence order and return the first honest one.
 * Falls back to the spoken hook itself (which trivially matches what is said).
 * No candidate — env var, exportSettings, fix-state — can self-attest past the
 * violation check.
 *
 * @param {{ topic?: string, spokenHook?: string, candidates?: Array<string | { text?: string, source?: string }> }} params
 * @returns {{ text: string, source: string | null, rejected: Array<{ text: string, source: string, reason: string }> }}
 */
export function resolveHonestHookOverlay({ topic = '', spokenHook = '', candidates = [] } = {}) {
  const rejected = [];
  const seen = new Set();

  const tryCandidate = (raw, source) => {
    const text = String((raw && typeof raw === 'object' ? raw.text : raw) || '').trim();
    if (!text || seen.has(text)) return null;
    seen.add(text);
    const reason = hookOverlayViolation(text, { topic, spokenHook });
    if (!reason) return { text, source };
    rejected.push({ text, source, reason });
    return null;
  };

  for (const raw of candidates) {
    const source = raw && typeof raw === 'object' && raw.source ? raw.source : 'claim';
    const hit = tryCandidate(raw, source);
    if (hit) return { ...hit, rejected };
  }

  const spokenFallback = tryCandidate(spokenHook, 'spoken-hook');
  if (spokenFallback) return { ...spokenFallback, rejected };

  return { text: '', source: null, rejected };
}
