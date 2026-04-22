import {
  EntityKind,
  NarrativeBeat,
  ScriptSegment,
  SegmentVisualPlan,
  TopicContext,
} from '../types';
import { generateAIPlan } from './llmVisualDirector';

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
    const osUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=5&namespace=0&format=json&origin=*`;
    let title: string | undefined;
    try {
      const r = await fetch(osUrl);
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
      const r = await fetch(fsUrl);
      if (r.ok) {
        const d = await r.json();
        const hits = d?.query?.search || [];
        if (hits.length) title = hits[0].title;
      }
    }

    if (!title) return null;

    const sumUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    const sr = await fetch(sumUrl);
    if (!sr.ok) return { title, matchedQuery: query };
    const sum = await sr.json();
    if (sum.type === 'disambiguation') return null;
    
    // If no thumbnail, try a broader term as a property
    if (!sum.thumbnail && query.includes(' ')) {
      const broader = query.split(' ').slice(0, -1).join(' ');
      const broaderSum = await fetchWikiSummary(broader, depth + 1);
      if (broaderSum?.thumbnail) {
        return {
          ...sum,
          thumbnail: broaderSum.thumbnail
        };
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

export async function resolveTopicContext(topic: string): Promise<TopicContext> {
  const candidates = parseTitleCandidates(topic);
  let summary: WikiSummary | null = null;

  for (const c of candidates) {
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

function generateQueries(beat: NarrativeBeat, entities: string[], ctx: TopicContext, _narration: string): string[] {
  const topic = ctx.coreSubject;
  const queries: string[] = [];
  const anchor = topic.split(' ').slice(0, 2).join(' ');
  const queryPrefix = (q: string) => q.toLowerCase().includes(anchor.toLowerCase()) ? q : `${anchor} ${q}`;

  switch (beat) {
    case 'hook':
      queries.push(`${topic} cinematic photo`);
      queries.push(`${topic} news`);
      break;
    case 'data':
      queries.push(`${topic} financial chart`);
      queries.push(`${topic} stock market`);
      break;
    case 'quote':
      if (entities[0]) queries.push(`${entities[0]} speaking`);
      queries.push(`${topic} press conference`);
      break;
    default:
      queries.push(queryPrefix(entities[0] || topic));
  }
  return Array.from(new Set(queries));
}

export async function planSegmentVisuals(
  segment: ScriptSegment,
  topicContext: TopicContext,
  openRouterKey?: string,
): Promise<SegmentVisualPlan> {
  const beat = detectBeat(segment.narration);
  const entities = extractCapitalizedEntities(segment.narration);

  if (openRouterKey) {
    const aiPlan = await generateAIPlan(segment.narration, topicContext, openRouterKey);
    return {
      segmentId: segment.id,
      beat,
      entities,
      visualAction: aiPlan.intent,
      queries: aiPlan.queries,
      visualConcept: aiPlan.visualConcept as any,
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

  const queries = generateQueries(beat, entities, topicContext, segment.narration);
  return {
    segmentId: segment.id,
    beat,
    entities,
    visualAction: `Show ${beat} for ${entities[0] || topicContext.topic}`,
    queries,
    visualConcept: 'professional-editorial' as any,
    reasoning: `Beat detected: ${beat}. Targeting entities: ${entities.join(', ') || 'none'}.`,
    concepts: queries.map((q) => ({
      description: q,
      queries: [q],
      priority: 100,
      visualType: 'concept',
    })),
  };
}
