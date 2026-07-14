import {
  EntityKind,
  NarrativeBeat,
  ScriptSegment,
  SegmentVisualPlan,
  TopicContext,
} from '../types';
import { generateAIPlan } from './llmVisualDirector';
import { logger } from './logger';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import { topicFamilyQueries } from './topicFamilyQueries';

// ---------------------------------------------------------------------------
// Weak Hook Detection (Requirement 7.1, 7.2)
// ---------------------------------------------------------------------------

export interface WeakHookResult {
  isWeak: boolean;
  reason: string;
  hasPersonalStakes: boolean;
  hasStatistic: boolean;
}

/**
 * Keywords that indicate the narration addresses the viewer's personal stakes.
 * If any of these appear in the first 2 sentences, the hook is considered strong
 * from a personal-stakes perspective.
 */
export const PERSONAL_STAKES_KEYWORDS = [
  'you', 'your', 'yourself', 'personally', 'family', 'home',
  'account', 'money', 'identity', 'password', 'phone',
];

/**
 * Pattern matching statistics: a number followed by a unit indicator.
 * Matches patterns like "50%", "3.5 billion", "100 million dollars", "2,000 victims", etc.
 */
export const STATISTIC_PATTERN = /\d+(?:[.,]\d+)?\s*(?:%|billion|million|trillion|dollars?|people|victims|attacks?)/i;

/**
 * Extracts the first N sentences from text using sentence-ending punctuation.
 * Used internally for hook analysis.
 */
function extractFirstSentences(text: string, count: number): string {
  const trimmed = text.trim();
  if (!trimmed) return '';

  const sentenceEndings = /([.!?])(?:\s|$)/g;
  const sentences: string[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = sentenceEndings.exec(trimmed)) !== null) {
    sentences.push(trimmed.slice(lastIndex, match.index + 1));
    lastIndex = match.index + match[0].length;
    if (sentences.length >= count) break;
  }

  // If we didn't find enough sentence endings, include the remaining text
  if (sentences.length < count && lastIndex < trimmed.length) {
    sentences.push(trimmed.slice(lastIndex));
  }

  return sentences.slice(0, count).join(' ').trim();
}

/**
 * Analyzes the first 2 sentences of a narration to detect whether the hook
 * contains personal-stakes language or a surprising statistic.
 *
 * Returns `{ isWeak: true }` if neither is found, indicating the hook may not
 * grab viewer attention effectively.
 *
 * @param narration - The full narration text (typically from the intro/first segment)
 * @returns WeakHookResult indicating hook strength and what was found/missing
 */
export function detectWeakHook(narration: string): WeakHookResult {
  const firstTwo = extractFirstSentences(narration, 2).toLowerCase();

  if (!firstTwo) {
    return {
      isWeak: true,
      reason: 'Narration is empty — no hook content found.',
      hasPersonalStakes: false,
      hasStatistic: false,
    };
  }

  const hasPersonalStakes = PERSONAL_STAKES_KEYWORDS.some(
    (keyword) => new RegExp(`\\b${keyword}\\b`, 'i').test(firstTwo)
  );

  const hasStatistic = STATISTIC_PATTERN.test(firstTwo);

  if (!hasPersonalStakes && !hasStatistic) {
    return {
      isWeak: true,
      reason: 'First 2 sentences lack personal-stakes language and statistical figures.',
      hasPersonalStakes: false,
      hasStatistic: false,
    };
  }

  return {
    isWeak: false,
    reason: '',
    hasPersonalStakes,
    hasStatistic,
  };
}

// ---------------------------------------------------------------------------
// Wikipedia resolution
// ---------------------------------------------------------------------------

interface WikiSummary {
  title: string;
  description?: string;
  extract?: string;
  thumbnail?: { source: string };
  matchedQuery?: string;
}

async function fetchWikiSummary(query: string, depth = 0): Promise<WikiSummary | null> {
  if (depth >= 3) return null;
  try {
    const WIKI_TIMEOUT = { timeoutMs: 10_000, maxRetries: 1 };
    const osUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=5&namespace=0&format=json&origin=*`;
    let title: string | undefined;
    try {
      const r = await fetchWithTimeout(osUrl, {}, WIKI_TIMEOUT);
      if (r.ok) {
        const d = await r.json();
        const titles: string[] = d?.[1] || [];
        const descs: string[] = d?.[2] || [];
        for (let i = 0; i < titles.length; i++) {
          if (!/may refer to|disambiguation/i.test(descs[i] || '')) {
            title = titles[i];
            break;
          }
        }
      }
    } catch { /* fall through */ }

    if (!title) {
      const fsUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=3&format=json&origin=*`;
      const r = await fetchWithTimeout(fsUrl, {}, WIKI_TIMEOUT);
      if (r.ok) {
        const d = await r.json();
        const hits = d?.query?.search || [];
        if (hits.length) title = hits[0].title;
      }
    }

    if (!title) return null;

    const sumUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    const sr = await fetchWithTimeout(sumUrl, {}, WIKI_TIMEOUT);
    if (!sr.ok) return { title, matchedQuery: query };
    const sum = await sr.json();
    if (sum.type === 'disambiguation') return null;
    
    // If no thumbnail, try a broader term as a property
    if (!sum.thumbnail && query.includes(' ')) {
      const broader = query.split(' ').slice(0, -1).join(' ');
      const broaderSum = await fetchWikiSummary(broader, depth + 1);
      if (broaderSum?.thumbnail) {
        const broaderContent = `${broaderSum.title} ${broaderSum.description || ''} ${broaderSum.extract || ''}`.toLowerCase();
        const queryLower = query.toLowerCase();
        const isRelevant = broaderContent.includes(queryLower) || queryLower.includes(broaderSum.title.toLowerCase());
        if (isRelevant) {
          return {
            ...sum,
            thumbnail: broaderSum.thumbnail
          };
        }
      }
    }

    return {
      title: sum.title || title,
      description: sum.description,
      extract: sum.extract,
      thumbnail: sum.thumbnail,
      matchedQuery: query,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Entity kind inference
// ---------------------------------------------------------------------------

const KIND_PATTERNS: { kind: EntityKind; patterns: RegExp[] }[] = [
  {
    kind: 'company',
    patterns: [
      /\b(?:Inc|Corp|Ltd|LLC|Group|Bank|Holdings|Solutions|Technologies|Software|Aero|Auto)\b/i,
      /\b(?:Nvidia|Apple|Microsoft|Amazon|Google|Alphabet|Meta|Tesla|SpaceX|BlackRock|Goldman|JPMorgan|Netflix)\b/i,
    ],
  },
  {
    kind: 'conflict',
    patterns: [
      /\b(?:War|Crisis|Invasion|Battle|Conflict|Siege|Combat|Military|Army|Soldiers|Troops|Tensions)\b/i,
      /\b(?:Revolution|Shift|Transformation|Change)\b(?!.*(?:Tech|Digital|AI|Silicon|Computing|Industrial))/i,
    ],
  },
  {
    kind: 'technology',
    patterns: [
      /\b(?:AI|Artificial Intelligence|Machine Learning|GPU|Computing|Silicon|Quantum|Blockchain|Web3|Software|Digital|Internet|Revolution|Transformation)\b/i,
    ],
  },
  {
    kind: 'person',
    patterns: [
      /\b(?:Elon Musk|Jensen Huang|Sam Altman|Bill Gates|Steve Jobs|Tim Cook|Warren Buffett|CEO|Founder|Leader)\b/i,
    ],
  },
  {
    kind: 'place',
    patterns: [/\b(?:City|Country|Island|Region|State|Province|Sea|Mountain|River|Park)\b/i],
  },
];

const GENERIC_TOPIC_WORDS = new Set([
  'launch', 'event', 'story', 'rise', 'fall', 'truth', 'secret', 'history', 
  'future', 'end', 'death', 'making', 'inside', 'untold', 'real', 'meet', 
  'introducing', 'breaking', 'watch', 'see', 'explained', 'revealed', 
  'exposed', 'breakdown', 'analysis', 'deep', 'dive', 'minute', 'second',
  'video', 'documentary', 'short', 'movie', 'film', 'clip',
]);

// Words that should NEVER be used as search anchors — they produce garbage results
const USELESS_ANCHOR_WORDS = new Set([
  'the', 'real', 'true', 'actual', 'full', 'complete', 'whole', 'entire',
  'big', 'huge', 'massive', 'enormous', 'great', 'good', 'bad', 'new', 'old',
  'first', 'last', 'next', 'final', 'only', 'just', 'very', 'really',
  'look', 'looks', 'like', 'thing', 'things', 'way', 'ways', 'time', 'times',
  'now', 'then', 'here', 'there', 'where', 'when', 'what', 'who', 'how', 'why',
]);

function isUselessAnchor(word: string): boolean {
  return USELESS_ANCHOR_WORDS.has(word.toLowerCase()) || word.length < 3;
}

function parseTitleCandidates(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (s: string | null | undefined) => {
    if (!s) return;
    const t = s.trim().replace(/\s{2,}/g, ' ').replace(/^[,\-–—:]+|[,\-–—:?!.]+$/g, '').trim();
    if (t.length < 2) return;
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(t);
  };

  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^(how|why|what|when|where|who|the\s+(?:rise|fall|truth|secret|story|history|future|end|death|return|making|inside|untold\s+story)\s+(?:and\s+(?:fall|rise)\s+)?of|inside|behind|exposing|exposed|explained|revealed|the\s+real|meet|introducing|breaking|watch|see)\s+/i, '');
  cleaned = cleaned.replace(/\s+(?:explained|revealed|exposed|in\s+\d{4}|by\s+\d{4}|documentary|breakdown|analysis|deep\s+dive|story|in\s+\d+\s+(?:minutes?|seconds?))[.!?]*$/i, '');
  cleaned = cleaned.replace(/\$\s?\d[\d,.]*\s?(?:billion|million|trillion|thousand|bn|mn|k|m|b|t)?|\b\d+(?:[.,]\d+)?\s?%|\b\d{4,}\b|\b\d+(?:[.,]\d+)?\s?(?:billion|million|trillion|thousand|bn|mn)\b/gi, ' ');
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();

  const properRunRe = /\b([A-Z][a-zA-Z0-9&]*(?:[-/][A-Z][a-zA-Z0-9&]*)*(?:\s+(?:of|the|and|de|von|le|la|du|al|bin|el)\s+[A-Z][a-zA-Z0-9&]*|\s+[A-Z][a-zA-Z0-9]+(?:[-/][A-Z][a-zA-Z0-9]+)*)*)(\s+(?:War|Crisis|Scandal|Collapse|Deal|Treaty|Act|Plan|Policy|Index|Fund|Group|Corp|Inc|Ltd|LLC|Bank|Union|Party))?\b/g;
  const runs: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = properRunRe.exec(cleaned)) !== null) {
    const phrase = (m[1] + (m[2] || '')).trim();
    if (phrase.length < 2) continue;
    runs.push(phrase);
  }

  const ranked = runs
    .map((p) => {
      const wordCount = p.split(/\s+/).length;
      const score = (wordCount > 1 ? 50 : 0) + (p.length * 2) + (p.includes('-') ? 10 : 0);
      return { p, score };
    })
    .filter(({ p }) => !/^(a|an|the|and|or|but|is|are|was|were|be|been|to|of|in|on|at|for|with|about|from|by|as|this|that|these|those|it|its|really|actually|almost|truly|happened|happens|happening|years|year|months|month)$/i.test(p))
    .sort((a, b) => b.score - a.score);

  if (ranked[0]) push(ranked[0].p);
  if (cleaned && cleaned.split(/\s+/).length <= 6) push(cleaned);
  for (const { p } of ranked.slice(1, 4)) push(p);
  push(raw);

  return out;
}

export function extractCapitalizedEntities(text: string): string[] {
  if (!text) return [];
  const found = new Set<string>();
  const re = /\b([A-Z][a-zA-Z0-9]*(?:\s+(?:of|the|and|de|von|le|la|du|al|bin|el)\s+[A-Z][a-zA-Z0-9]*|\s+[A-Z][a-zA-Z0-9]+)*)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const phrase = m[1].trim();
    if (phrase.length < 3) continue;
    if (/^(The|This|That|These|Those|And|But|Or|If|When|While|However|Meanwhile|Today|Yesterday|Tomorrow|Now|First|Second|Third|Last|Next|Some|Many|Most|All|One|Two|Three|It|Its|In|On|At|By|From|With|For|Of|To|Be|Is|Are|Was|Were|Has|Have|Had|Do|Does|Did|Not|No|Yes|So|But|Yet|Even|Just|Also|Then|Than|More|Less|Such|Each|Both|Few|Any|Our|Their|Your|His|Her|Its|We|They|You|He|She|I|A|An)$/i.test(phrase)) continue;
    found.add(phrase);
  }
  return Array.from(found);
}

export async function resolveTopicContext(topic: string, signal?: AbortSignal): Promise<TopicContext> {
  const candidates = parseTitleCandidates(topic);
  let summary: WikiSummary | null = null;

  for (const c of candidates) {
    if (signal?.aborted) break;
    summary = await fetchWikiSummary(c);
    if (summary?.title) {
      const topicLower = topic.toLowerCase();
      const topicWords = topicLower.split(/\s+/).filter(w => w.length > 3 && !GENERIC_TOPIC_WORDS.has(w));
      const summaryContent = `${summary.title} ${summary.description || ''} ${summary.extract || ''}`.toLowerCase();

      let matchCount = 0;
      for (const word of topicWords) {
        if (summaryContent.includes(word)) matchCount++;
      }

      const isGoodMatch = matchCount >= Math.min(2, topicWords.length) || summaryContent.includes(topicLower);
      if (isGoodMatch) break;
      summary = null;
    }
  }

  const coreSubject = summary?.title || candidates[0] || topic;
  let kind: EntityKind = 'organization';

  const textToMatch = `${coreSubject} ${summary?.description || ''}`.toLowerCase();
  for (const kp of KIND_PATTERNS) {
    if (kp.patterns.some((p) => p.test(textToMatch))) {
      kind = kp.kind;
      break;
    }
  }

  return {
    topic,
    resolvedTitle: summary?.title,
    coreSubject,
    description: summary?.description || '',
    extract: summary?.extract,
    thumbnailUrl: summary?.thumbnail?.source,
    kind,
    subjectCandidates: candidates,
    entities: extractCapitalizedEntities(summary?.extract || summary?.description || ''),
    parseReasoning: `Resolved core subject to "${coreSubject}" via ${summary ? 'Wikipedia' : 'title parsing'}.`,
  };
}

/**
 * Enrich a topic context with live press release + news data (non-blocking).
 */
export async function enrichWithPressReleases(ctx: TopicContext, signal?: AbortSignal): Promise<TopicContext> {
  if (!ctx.coreSubject || signal?.aborted) return ctx;
  try {
    // Fetch press releases
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const [pressRes, newsRes] = await Promise.allSettled([
      fetch(`${baseUrl}/api/press-release?q=${encodeURIComponent(ctx.coreSubject)}`, { signal }),
      fetch(`${baseUrl}/api/search-bing-news?q=${encodeURIComponent(ctx.coreSubject)}`, { signal }),
    ]);

    const allNews: { source: string; headline: string; snippet: string; url: string; date?: string }[] = [];

    if (pressRes.status === 'fulfilled' && pressRes.value.ok) {
      const data = await pressRes.value.json();
      if (data.releases && Array.isArray(data.releases)) {
        for (const r of data.releases) {
          allNews.push({ source: r.source || 'Press Release', headline: r.title, snippet: (r.snippet || '').substring(0, 300), url: r.url, date: r.date });
        }
      }
    }

    if (newsRes.status === 'fulfilled' && newsRes.value.ok) {
      const data = await newsRes.value.json();
      if (data.results && Array.isArray(data.results)) {
        for (const r of data.results) {
          if (!allNews.some(n => n.url === r.url)) {
            allNews.push({ source: r.source || 'News', headline: r.title, snippet: (r.snippet || '').substring(0, 300), url: r.url, date: r.date });
          }
        }
      }
    }

    if (allNews.length > 0) {
      return { ...ctx, recentNews: allNews.slice(0, 8) };
    }
  } catch {
    // Non-blocking
  }
  return ctx;
}

const BEAT_SIGNALS: { beat: NarrativeBeat; test: (t: string) => boolean }[] = [
  { beat: 'hook', test: (t) => /\b(?:welcome|today|intro|imagine|ever wonder|meet)\b/i.test(t) },
  { beat: 'data', test: (t) => /\d+(?:[.,]\d+)?\s?(?:%|billion|million|trillion|dollars|bn|mn)|(?:\$|€|£)\s?\d+/i.test(t) || /\b(?:revenue|earnings|stock|market cap|growth|increase|decrease|rate|statistics|numbers)\b/i.test(t) },
  { beat: 'quote', test: (t) => /["'].+["']\s*(?:said|stated|argued|claimed|noted|warned|predicted|according to)/i.test(t) || /\b(?:quoted|remarked|observed|pointed out|emphasized)\b/i.test(t) },
  { beat: 'event', test: (t) => /\b(?:launched|announced|unveiled|started|began|occurred|happened|revealed|unlocked|founded|created)\b/i.test(t) },
  { beat: 'analysis', test: (t) => /\b(?:experts?|analysts?|economists?|researchers?|insiders?|officials?)\s+(?:say|believe|warn|fear|predict|argue|note|suggest|estimate)\b/i.test(t) || /\b(?:could|may|might|likely to|expected to|projected to|forecast(?:ed)? to)\b/i.test(t) },
];

function detectBeat(text: string): NarrativeBeat {
  for (const { beat, test } of BEAT_SIGNALS) {
    if (test(text)) return beat;
  }
  return 'context';
}

/**
 * Extract key noun phrases from narration text.
 * Filters out stop words and generic terms to find meaningful multi-word phrases.
 */
export function extractNounPhrases(narration: string): string[] {
  const STOP_WORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be',
    'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'could', 'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
    'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as',
    'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between',
    'out', 'off', 'over', 'under', 'again', 'further', 'then', 'once', 'here',
    'there', 'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both',
    'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only',
    'own', 'same', 'so', 'than', 'too', 'very', 'just', 'because', 'about',
    'this', 'that', 'these', 'those', 'what', 'which', 'who', 'whom', 'its',
    'his', 'her', 'their', 'our', 'your', 'my', 'it', 'he', 'she', 'they',
    'we', 'you', 'them', 'him', 'us', 'me', 'also', 'still', 'even', 'much',
  ]);

  // Remove punctuation except hyphens within words, then split
  const cleaned = narration.replace(/["""''.,!?;:()\[\]{}]/g, ' ');
  const words = cleaned.split(/\s+/).filter(w => w.length > 0);

  // Build noun phrases: sequences of non-stop, non-generic words
  const phrases: string[] = [];
  let current: string[] = [];

  for (const word of words) {
    const lower = word.toLowerCase();
    if (STOP_WORDS.has(lower) || GENERIC_TOPIC_WORDS.has(lower) || word.length <= 2) {
      if (current.length > 0) {
        phrases.push(current.join(' '));
        current = [];
      }
    } else {
      current.push(word);
    }
  }
  if (current.length > 0) phrases.push(current.join(' '));

  // Prefer multi-word phrases, then single meaningful words
  return phrases
    .filter(p => p.length > 2)
    .sort((a, b) => b.split(/\s+/).length - a.split(/\s+/).length);
}

export function generateQueries(beat: NarrativeBeat, entities: string[], ctx: TopicContext, narration: string, segmentTitle?: string, visualNote?: string): string[] {
  const queries: string[] = [];

  const nounPhrases = extractNounPhrases(narration);
  const topNounPhrase = nounPhrases[0] || '';

  const topicTitle = ctx.resolvedTitle || ctx.coreSubject || ctx.topic;
  const topicEntities = extractCapitalizedEntities(topicTitle);
  const originalEntities = extractCapitalizedEntities(ctx.topic);
  const allEntities = [...new Set([...originalEntities, ...topicEntities, ...entities])];
  const meaningfulEntities = allEntities.filter(e => !isUselessAnchor(e));

  const primaryEntity = meaningfulEntities[0] || topicTitle;
  const secondaryEntity = meaningfulEntities[1] || '';
  const thirdEntity = meaningfulEntities[2] || '';

  const cleanedTitle = segmentTitle
    ? segmentTitle.replace(/^(the|a|an)\s+/i, '').trim()
    : '';

  // === STRATEGY 0: Topic-family anchors (healthcare/bank/landlord) ===
  for (const q of topicFamilyQueries(ctx.topic || topicTitle, 4)) {
    if (!queries.includes(q)) queries.push(q);
  }

  // === STRATEGY 1: Core entity queries (bread & butter) ===
  if (cleanedTitle) queries.push(cleanedTitle);
  if (primaryEntity && !queries.includes(primaryEntity)) queries.push(primaryEntity);
  if (secondaryEntity) queries.push(`${primaryEntity} ${secondaryEntity}`);
  if (thirdEntity) queries.push(`${primaryEntity} ${thirdEntity}`);

  // === STRATEGY 2: Beat-specific themed queries ===
  switch (beat) {
    case 'hook':
      queries.push(`${primaryEntity} cinematic`);
      queries.push(`${primaryEntity} aerial view`);
      if (secondaryEntity) queries.push(`${primaryEntity} ${secondaryEntity} launch`);
      break;
    case 'data':
      queries.push(`${primaryEntity} chart graph`);
      queries.push(`${primaryEntity} data visualization`);
      if (topNounPhrase) queries.push(`${topNounPhrase} chart`);
      break;
    case 'quote':
      queries.push(`${primaryEntity} portrait`);
      queries.push(`${primaryEntity} press conference`);
      if (secondaryEntity) queries.push(`${secondaryEntity} interview`);
      break;
    case 'event':
      queries.push(`${primaryEntity} event launch`);
      queries.push(`${primaryEntity} construction`);
      queries.push(`${primaryEntity} unveiling`);
      break;
    case 'analysis':
      queries.push(`${primaryEntity} analysis report`);
      queries.push(`${primaryEntity} expert`);
      if (topNounPhrase) queries.push(topNounPhrase);
      break;
    default:
      if (topNounPhrase) queries.push(topNounPhrase);
      queries.push(`${primaryEntity} overview`);
  }

  // === STRATEGY 3: Official & press release searches ===
  if (primaryEntity) {
    // Try company/org press rooms
    queries.push(`${primaryEntity} press release`);
    queries.push(`${primaryEntity} official announcement`);
    queries.push(`${primaryEntity} news 2025`);
    queries.push(`${primaryEntity} news 2026`);

    // Site-specific searches (work with DDG/Bing/Google indexes)
    const domainGuess = guessDomain(primaryEntity);
    if (domainGuess) {
      queries.push(`site:${domainGuess} ${primaryEntity}`);
      queries.push(`site:${domainGuess} press`);
    }

    // Broad press release sources
    queries.push(`${primaryEntity} prnewswire`);
    queries.push(`${primaryEntity} businesswire`);
  }

  // === STRATEGY 4: Related entity & context queries ===
  if (ctx.kind) {
    queries.push(`${primaryEntity} ${ctx.kind}`);
  }
  if (ctx.extract) {
    const extractEntities = extractCapitalizedEntities(ctx.extract);
    for (const ee of extractEntities) {
      if (ee !== primaryEntity && !isUselessAnchor(ee) && !queries.some(q => q.toLowerCase().includes(ee.toLowerCase()))) {
        queries.push(`${primaryEntity} ${ee}`);
        if (queries.length > 14) break; // cap at 15 total
      }
    }
  }

  // === STRATEGY 5: Map/location queries (for geographic topics) ===
  // Check if the topic or narration mentions a place
  const locationIndicators = ['city', 'port', 'harbor', 'bay', 'coast', 'beach', 'island', 'mountain',
    'river', 'lake', 'ocean', 'sea', 'gulf', 'street', 'avenue', 'road', 'highway', 'route',
    'park', 'museum', 'stadium', 'airport', 'station', 'terminal', 'port', 'shipyard'];
  const allContextText = `${narration} ${ctx.extract || ''} ${ctx.description || ''} ${topicTitle}`.toLowerCase();
  if (locationIndicators.some(li => allContextText.includes(li))) {
    queries.push(`${primaryEntity} location map`);
    queries.push(`${primaryEntity} aerial`);
    if (secondaryEntity) queries.push(`${secondaryEntity} port`);
    if (ctx.coreSubject && ctx.coreSubject !== primaryEntity) {
      queries.push(`${ctx.coreSubject} map`);
    }
  }

  // === STRATEGY 6: Narration-driven noun phrase queries ===
  if (topNounPhrase) {
    if (!queries.some(q => q.toLowerCase().includes(topNounPhrase.toLowerCase()))) {
      queries.push(`${primaryEntity} ${topNounPhrase}`);
    }
    if (topNounPhrase.includes(' ') && !queries.some(q => q.toLowerCase() === topNounPhrase.toLowerCase())) {
      queries.push(topNounPhrase);
    }
  }

  // === STRATEGY 7: Visual note integration ===
  if (visualNote) {
    const isCustomGraphic = /animated|screenshot|diagram|infographic|split.screen/i.test(visualNote);
    if (!isCustomGraphic) {
      const visualNotePhrases = extractNounPhrases(visualNote);
      let vnAdded = 0;
      for (const phrase of visualNotePhrases) {
        if (vnAdded >= 2) break;
        if (!queries.some(q => q.toLowerCase().includes(phrase.toLowerCase()))) {
          queries.push(phrase);
          vnAdded++;
        }
      }
    }
  }

  // === STRATEGY 8: Ensure segment title appears ===
  if (segmentTitle && segmentTitle.length > 2) {
    const titleSignificantWords = segmentTitle
      .replace(/^(the|a|an)\s+/i, '')
      .split(/\s+/)
      .filter(w => w.length > 2 && !GENERIC_TOPIC_WORDS.has(w.toLowerCase()) && !isUselessAnchor(w));
    const titleInQuery = queries.some(q => {
      const qLower = q.toLowerCase();
      return titleSignificantWords.some(w => qLower.includes(w.toLowerCase()));
    });
    if (!titleInQuery && titleSignificantWords.length > 0) {
      queries.push(`${primaryEntity} ${titleSignificantWords.join(' ')}`);
    }
  }

  // === STRATEGY 9: Full topic as ultimate fallback ===
  if (!queries.includes(ctx.topic)) {
    queries.push(ctx.topic);
  }

  return Array.from(new Set(queries.filter(q => q.length > 2)));
}

/** Guess a likely domain for an entity name (e.g. "NCL" → "ncl.com") */
function guessDomain(entity: string): string | null {
  const entityLower = entity.toLowerCase().trim();
  // Known mappings for common entities
  const knownDomains: Record<string, string> = {
    'ncl': 'ncl.com',
    'ncl luna': 'ncl.com',
    'norwegian cruise line': 'ncl.com',
    'fincantieri': 'fincantieri.com',
    'boeing': 'boeing.com',
    'airbus': 'airbus.com',
    'tesla': 'tesla.com',
    'spacex': 'spacex.com',
    'microsoft': 'microsoft.com',
    'apple': 'apple.com',
    'google': 'google.com',
    'meta': 'meta.com',
    'amazon': 'amazon.com',
    'netflix': 'netflix.com',
    'wework': 'wework.com',
    'nvidia': 'nvidia.com',
    'openai': 'openai.com',
    'twitter': 'twitter.com',
    'x': 'x.com',
    'youtube': 'youtube.com',
    'instagram': 'instagram.com',
    'tiktok': 'tiktok.com',
    'snapchat': 'snapchat.com',
    'pinterest': 'pinterest.com',
    'reddit': 'reddit.com',
    'linkedin': 'linkedin.com',
    'uber': 'uber.com',
    'lyft': 'lyft.com',
    'airbnb': 'airbnb.com',
    'stripe': 'stripe.com',
    'shopify': 'shopify.com',
    'square': 'square.com',
    'paypal': 'paypal.com',
    'robinhood': 'robinhood.com',
    'coinbase': 'coinbase.com',
    'disney': 'disney.com',
    'warner bros': 'warnerbros.com',
    'paramount': 'paramount.com',
    'sony': 'sony.com',
    'nintendo': 'nintendo.com',
    'samsung': 'samsung.com',
    'huawei': 'huawei.com',
    'intel': 'intel.com',
    'amd': 'amd.com',
    'ibm': 'ibm.com',
    'oracle': 'oracle.com',
    'salesforce': 'salesforce.com',
    'adobe': 'adobe.com',
    'vmware': 'vmware.com',
    'cisco': 'cisco.com',
    'p&g': 'pg.com',
    'coca-cola': 'cocacola.com',
    'pepsi': 'pepsi.com',
    'nike': 'nike.com',
    'adidas': 'adidas.com',
    'mcdonalds': 'mcdonalds.com',
    'starbucks': 'starbucks.com',
    'walmart': 'walmart.com',
    'target': 'target.com',
    'costco': 'costco.com',
    'pfizer': 'pfizer.com',
    'moderna': 'moderna.com',
    'johnson & johnson': 'jnj.com',
    'united airlines': 'united.com',
    'delta': 'delta.com',
    'american airlines': 'aa.com',
    'southwest airlines': 'southwest.com',
    'royal caribbean': 'royalcaribbean.com',
    'carnival': 'carnival.com',
    'msc': 'msccruises.com',
    'princess cruises': 'princess.com',
    'holland america': 'hollandamerica.com',
    'celebrity cruises': 'celebritycruises.com',
    'virgin voyages': 'virginvoyages.com',
  };

  if (knownDomains[entityLower]) return knownDomains[entityLower];

  // For multi-word entities, try the last word as domain
  const words = entityLower.split(/\s+/);
  const lastWord = words[words.length - 1];
  if (lastWord && lastWord.length > 2) {
    return `${lastWord}.com`;
  }

  return null;
}

export function buildFallbackShots(
  beat: NarrativeBeat,
  entities: string[],
  ctx: TopicContext,
  queries: string[],
): { concept: string; queries: string[]; vibe: string }[] {
  const topicTitle = ctx.resolvedTitle || ctx.coreSubject || ctx.topic;
  const primaryEntity = entities.find((entity) => !isUselessAnchor(entity)) || topicTitle;
  const secondaryEntity = entities.find((entity) => !isUselessAnchor(entity) && entity !== primaryEntity) || ctx.coreSubject || topicTitle;
  const primaryQueries = queries.slice(0, 5);
  const secondaryQueries = queries.slice(3, 10);

  const shotMap: Record<NarrativeBeat, { primary: string; secondary: string; primaryVibe: string; secondaryVibe: string }> = {
    hook: {
      primary: 'Trailer-style cold open',
      secondary: 'Fast supporting cutaway',
      primaryVibe: 'bold, urgent, attention-grabbing',
      secondaryVibe: 'cinematic, punchy, contextual',
    },
    context: {
      primary: 'Establishing backdrop',
      secondary: 'Detail-focused cutaway',
      primaryVibe: 'clear, editorial, grounded',
      secondaryVibe: 'clean, specific, informative',
    },
    data: {
      primary: 'Chart or stat close-up',
      secondary: 'Supporting evidence cutaway',
      primaryVibe: 'data-driven, sharp, readable',
      secondaryVibe: 'analytical, calm, precise',
    },
    quote: {
      primary: 'Portrait or speaker moment',
      secondary: 'Reaction or press coverage cutaway',
      primaryVibe: 'human, direct, credible',
      secondaryVibe: 'editorial, observational, clean',
    },
    event: {
      primary: 'Action or launch moment',
      secondary: 'Crowd, venue, or aftermath cutaway',
      primaryVibe: 'kinetic, live, energetic',
      secondaryVibe: 'busy, atmospheric, contextual',
    },
    analysis: {
      primary: 'Analyst or boardroom visual',
      secondary: 'Evidence, screen, or newsroom cutaway',
      primaryVibe: 'investigative, focused, serious',
      secondaryVibe: 'technical, evidence-led, detailed',
    },
    conclusion: {
      primary: 'Final takeaway visual',
      secondary: 'Future-facing callback shot',
      primaryVibe: 'resolute, clear, reflective',
      secondaryVibe: 'forward-looking, polished, calm',
    },
    transition: {
      primary: 'Pattern-interrupt reset',
      secondary: 'Contrasting bridge shot',
      primaryVibe: 'snappy, attention-resetting',
      secondaryVibe: 'contrastive, transitional, smooth',
    },
  };

  const map = shotMap[beat];
  return [
    {
      concept: `${map.primary} for ${primaryEntity}`,
      queries: primaryQueries.length ? primaryQueries : [primaryEntity],
      vibe: map.primaryVibe,
    },
    {
      concept: `${map.secondary} for ${secondaryEntity}`,
      queries: secondaryQueries.length ? secondaryQueries : [secondaryEntity, topicTitle].filter(Boolean),
      vibe: map.secondaryVibe,
    },
  ];
}

export async function planSegmentVisuals(
  segment: ScriptSegment,
  topicContext: TopicContext,
  openRouterKey?: string,
  signal?: AbortSignal,
): Promise<SegmentVisualPlan> {
  const beat = detectBeat(segment.narration);
  const entities = extractCapitalizedEntities(segment.narration);
  const loopFastMode =
    typeof sessionStorage !== 'undefined' && sessionStorage.getItem('autotube_loop_fast_mode') === 'true';

  if (openRouterKey && !loopFastMode) {
    const aiPlan = await generateAIPlan(segment.narration, topicContext, openRouterKey, undefined, signal, segment.title);
    // If AI returned a useful plan with shots, use it
    if (aiPlan.shots && aiPlan.shots.length > 0) {
      return {
        segmentId: segment.id,
        beat,
        entities,
        visualAction: aiPlan.intent,
        queries: aiPlan.queries,
        visualConcept: aiPlan.visualConcept,
        reasoning: `AI Director Intent: ${aiPlan.intent}\nConcept: ${aiPlan.visualConcept}`,
        shots: aiPlan.shots,
        concepts: aiPlan.queries.map((q) => ({
          description: q,
          queries: [q],
          priority: 100,
          visualType: 'concept',
        })),
      };
    }
    // Otherwise, fall back to query-based planning
    logger.warn('VisualPlanner', `AI plan for "${segment.title}" had no shots, using fallback`);
  }

  const queries = generateQueries(beat, entities, topicContext, segment.narration, segment.title, segment.visualNote);
  const shots = buildFallbackShots(beat, entities, topicContext, queries);
  return {
    segmentId: segment.id,
    beat,
    entities,
    visualAction: `Show ${beat} for ${entities[0] || topicContext.topic}`,
    queries,
    visualConcept: 'professional-editorial',
    reasoning: `Beat detected: ${beat}. Built a two-shot fallback to keep the cut pace moving.`,
    shots,
    concepts: shots.map((shot, index) => ({
      description: shot.concept,
      queries: shot.queries,
      priority: index === 0 ? 100 : 90,
      visualType: 'concept',
    })),
  };
}
