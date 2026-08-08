/**
 * Harvest query rewrite — drop weak generic pads and prefer topic subject nouns.
 *
 * Cold-eval topics without a curated pack fall through to antiHud fillers
 * ("news interview worried person", "city street pedestrians") and lone era
 * adjectives ("victorian") that harvest neighbor junk instead of the story's
 * filmable subjects (bee, hive, honeycomb, …).
 */

/** Era / framing adjectives that are never enough alone as a primary search. */
export const ERA_ONLY_TOKENS = new Set([
  'victorian',
  'edwardian',
  'medieval',
  'ancient',
  'modern',
  'colonial',
  'industrial',
  'historic',
  'historical',
  'vintage',
  'antique',
  'retro',
]);

/**
 * Stock pads that match any topic and pull talking-heads / street B-roll.
 * When the topic already names concrete subjects, these must not lead the plan.
 */
const WEAK_GENERIC_RES = [
  /\bnews\s+interview\b/i,
  /\bworried\s+person\b/i,
  /\bcity\s+street\b/i,
  /\bpedestrians?\b/i,
  /\bdocumentary\s+handheld\b/i,
  /\bperson\s+reading\s+news\b/i,
  /\bpeople\s+using\s+technology\b/i,
  /\bperson\s+reacting\s+to\s+news\b/i,
  /\bsunny\s+city\b/i,
  /\bdaylight\s+documentary\b/i,
];

/**
 * Preferred filmable nouns, ordered strongest-first when several match a topic.
 * Patterns scan topicBlob + segment title.
 */
const SUBJECT_LEXICON = [
  { match: /\bvarroa\b/i, noun: 'varroa' },
  { match: /\bhoney\s*combs?\b/i, noun: 'honeycomb' },
  { match: /\bapiary|apiaries\b/i, noun: 'apiary' },
  { match: /\bbeekeepers?\b/i, noun: 'beekeeper' },
  { match: /\bbeekeeping\b/i, noun: 'beekeeping' },
  { match: /\bhives?\b/i, noun: 'hive' },
  { match: /\bbees?\b/i, noun: 'bee' },
];

/**
 * Strip host-scoped suffixes so judgment looks at the subject phrase only.
 * @param {string} query
 * @returns {string}
 */
export function harvestQueryBase(query = '') {
  return String(query || '')
    .replace(/\s+site:(?:vimeo\.com|dailymotion\.com)\s*$/i, '')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Concrete subject nouns present in the topic / segment beat.
 * @param {string} [topicBlob]
 * @param {string} [segmentTitle]
 * @returns {string[]}
 */
export function extractPreferredSubjectNouns(topicBlob = '', segmentTitle = '') {
  const blob = `${topicBlob || ''} ${segmentTitle || ''}`;
  const nouns = [];
  for (const { match, noun } of SUBJECT_LEXICON) {
    if (match.test(blob) && !nouns.includes(noun)) nouns.push(noun);
  }
  return nouns;
}

/**
 * True when `query` is a weak generic pad or a lone era adjective that should
 * not be a primary harvest search for this topic.
 *
 * @param {string} [query]
 * @param {string} [topicBlob]
 * @param {string} [segmentTitle]
 * @returns {boolean}
 */
export function isWeakGenericHarvestQuery(query = '', topicBlob = '', segmentTitle = '') {
  const base = harvestQueryBase(query).toLowerCase();
  if (!base) return true;

  const words = base.split(/\s+/).filter(Boolean);
  if (words.length === 1 && ERA_ONLY_TOKENS.has(words[0])) return true;

  const subjects = extractPreferredSubjectNouns(topicBlob, segmentTitle);
  if (subjects.length === 0) {
    // No preferred subjects — only reject pure era-only singles (handled above).
    return false;
  }

  if (WEAK_GENERIC_RES.some((re) => re.test(base))) return true;

  // Era adjective with no subject noun still harvests period junk ("victorians corruption").
  if (words.every((w) => ERA_ONLY_TOKENS.has(w) || w.length <= 3)) return true;

  return false;
}

/**
 * Whether the query already names at least one preferred subject noun.
 * @param {string} query
 * @param {string[]} subjects
 * @returns {boolean}
 */
function queryHasSubjectNoun(query = '', subjects = []) {
  const base = harvestQueryBase(query).toLowerCase();
  if (!base || !subjects.length) return false;
  return subjects.some((noun) => {
    const stem = String(noun).toLowerCase().replace(/s$/, '');
    return new RegExp(`\\b${stem}s?\\b`, 'i').test(base);
  });
}

/**
 * Build short subject-led queries from preferred nouns (bee/hive/…).
 * @param {string[]} subjects
 * @param {string} [topicBlob]
 * @param {string} [segmentTitle]
 * @returns {string[]}
 */
export function buildPreferredSubjectQueries(subjects = [], topicBlob = '', segmentTitle = '') {
  if (!subjects.length) return [];
  const set = new Set(subjects.map((s) => String(s).toLowerCase()));
  const out = [];
  const push = (q) => {
    const key = String(q || '').trim().toLowerCase();
    if (!key || out.some((x) => x.toLowerCase() === key)) return;
    out.push(String(q).trim());
  };

  if (
    set.has('hive')
    || set.has('bee')
    || set.has('beekeeper')
    || set.has('beekeeping')
    || set.has('apiary')
    || set.has('honeycomb')
    || set.has('varroa')
  ) {
    if (set.has('hive')) {
      push('bee hive');
      push('honeycomb hive');
      push('hive');
    }
    if (set.has('bee') || set.has('beekeeper') || set.has('beekeeping')) {
      push('beekeeper hive');
      push('bees honeycomb');
      push('bee');
    }
    if (set.has('honeycomb')) push('honeycomb');
    if (set.has('apiary')) {
      push('apiary bees');
      push('apiary');
    }
    if (set.has('beekeeper') || set.has('beekeeping')) {
      push('beekeeper');
      push('beekeeping');
    }
    if (set.has('varroa')) {
      push('varroa mite');
      push('varroa bee');
      push('varroa');
    }
  }

  // If lexicon matched but none of the bee-family builders fired, emit nouns as-is.
  if (out.length === 0) {
    for (const noun of subjects) push(noun);
  }

  // Optional era+subject when the topic names an era (keeps "victorian beekeeper").
  const blob = `${topicBlob || ''} ${segmentTitle || ''}`.toLowerCase();
  for (const era of ERA_ONLY_TOKENS) {
    if (!new RegExp(`\\b${era}\\b`, 'i').test(blob)) continue;
    if (set.has('beekeeper') || set.has('beekeeping')) push(`${era} beekeeper`);
    if (set.has('hive')) push(`${era} hive`);
    break;
  }

  return out;
}

/**
 * Rewrite one query: keep subject-grounded phrases, drop or replace weak pads.
 * Returns '' when the query should be removed from the plan.
 *
 * @param {string} query
 * @param {{ topicBlob?: string, segmentTitle?: string }} [opts]
 * @returns {string}
 */
export function rewriteHarvestQuery(query = '', opts = {}) {
  const topicBlob = opts.topicBlob || '';
  const segmentTitle = opts.segmentTitle || '';
  const raw = String(query || '').trim();
  if (!raw) return '';

  const subjects = extractPreferredSubjectNouns(topicBlob, segmentTitle);
  const base = harvestQueryBase(raw);
  const hostSuffix = raw.slice(base.length); // preserves " site:…"

  if (!isWeakGenericHarvestQuery(raw, topicBlob, segmentTitle)) {
    // Soft rewrite: lone era token already handled; keep subject-bearing queries.
    if (subjects.length && !queryHasSubjectNoun(base, subjects)) {
      return raw;
    }
    return raw;
  }

  if (!subjects.length) return '';

  // Replace weak pad with the strongest preferred subject query.
  const preferred = buildPreferredSubjectQueries(subjects, topicBlob, segmentTitle);
  const replacement = preferred[0] || subjects[0] || '';
  if (!replacement) return '';
  return `${replacement}${hostSuffix}`.trim();
}

/**
 * Filter + rewrite a query list. Preferred subject nouns lead the plan so
 * primary searches are bee/hive/… rather than news-interview pads.
 *
 * @param {string[]} queries
 * @param {{ topicBlob?: string, segmentTitle?: string }} [opts]
 * @returns {string[]}
 */
export function rewriteHarvestQueryPlan(queries = [], opts = {}) {
  const topicBlob = opts.topicBlob || '';
  const segmentTitle = opts.segmentTitle || '';
  const subjects = extractPreferredSubjectNouns(topicBlob, segmentTitle);
  const out = [];
  const seen = new Set();

  const push = (q) => {
    const key = String(q || '').trim().toLowerCase();
    if (!key || seen.has(key)) return;
    // Never admit a still-weak primary after rewrite.
    if (isWeakGenericHarvestQuery(q, topicBlob, segmentTitle)) return;
    seen.add(key);
    out.push(String(q).trim());
  };

  if (subjects.length) {
    for (const q of buildPreferredSubjectQueries(subjects, topicBlob, segmentTitle)) {
      push(q);
    }
  }

  for (const raw of queries) {
    const next = rewriteHarvestQuery(raw, { topicBlob, segmentTitle });
    if (!next) continue;
    if (isWeakGenericHarvestQuery(next, topicBlob, segmentTitle)) continue;
    push(next);
  }

  return out;
}
