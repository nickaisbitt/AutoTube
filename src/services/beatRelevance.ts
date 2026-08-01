/**
 * Score media candidates against a VisualBeat (intent + narration excerpt).
 * Heuristic path is always available; multimodal vision is optional/top-N.
 */
import type { VisualBeat } from './visualBeatSheet';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import { extractJson } from '../utils/extractJson';
import { openRouterMessageText } from '../utils/openRouterMessageText';
import { logger } from './logger';

export interface BeatRelevanceScore {
  score: number; // 0–1
  reasons: string[];
  reject: boolean;
}

const OPENROUTER_ENDPOINT = '/api/llm';
const BEAT_VISION_MODEL = 'xiaomi/mimo-v2.5';
const BEAT_VISION_TIMEOUT_MS = 18_000;
/** Hard budget: vision calls per segment harvest. */
export const BEAT_VISION_MAX_PER_SEGMENT = 8;
/** Top-N candidates to vision-rank per shot pick. */
export const BEAT_VISION_TOP_N = 3;

function tokens(text: string): string[] {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

/** Mirrors scripts/lib/harvest-quality.mjs generic junk rules for beat scoring. */
function isGenericBeatJunk(blob: string, contextBlob: string): boolean {
  const ctx = contextBlob.toLowerCase();
  const genericRe =
    /\b(camcorder|handheld camcorder|person holding (a )?camera|corporate handshake|empty office|architecture model|conference room|skyline timelapse|stadium crowd|sports crowd|band playing|orchestra|stock footage loop|b-roll footage|stock photo|generic corporate|lab technician pipette|ferry timelapse|port crane timelapse)\b/i;
  if (!genericRe.test(blob)) return false;
  if (/\b(camcorder|cctv|surveillance)\b/i.test(blob) && /\b(cctv|surveillance|camera|recorded)\b/i.test(ctx)) {
    return false;
  }
  if (/\b(port|ferry|shipping|maritime|cargo|container)\b/i.test(blob) && /\b(port|ferry|shipping|maritime|cargo|container)\b/i.test(ctx)) {
    return false;
  }
  if (/\b(lab|science|research|experiment)\b/i.test(blob) && /\b(lab|science|research|biology|chemistry)\b/i.test(ctx)) {
    return false;
  }
  if (/\b(office|corporate|business|company)\b/i.test(blob) && /\b(office|corporate|business|company)\b/i.test(ctx)) {
    return false;
  }
  return true;
}

export function beatVisionEnabled(): boolean {
  try {
    if (typeof sessionStorage !== 'undefined') {
      const evalCold = sessionStorage.getItem('autotube_eval_cold') === 'true';
      const ss = sessionStorage.getItem('autotube_beat_vision');
      if (ss === 'true') return true;
      if (ss === 'false' && !evalCold) return false;
    }
    const env =
      (typeof process !== 'undefined' && process.env)
      || (typeof import.meta !== 'undefined' && (import.meta as { env?: Record<string, string> }).env)
      || {};
    if (env.AUTOTUBE_EVAL_COLD === '1' || env.AUTOTUBE_EVAL_COLD === 'true') {
      if (env.AUTOTUBE_BEAT_VISION === '0' || env.AUTOTUBE_BEAT_VISION === 'false') return false;
      return true;
    }
    if (env.AUTOTUBE_BEAT_VISION === '0' || env.AUTOTUBE_BEAT_VISION === 'false') return false;
    if (env.AUTOTUBE_BEAT_VISION === '1' || env.AUTOTUBE_BEAT_VISION === 'true') return true;
    if (env.VITE_AUTOTUBE_BEAT_VISION === '1' || env.VITE_AUTOTUBE_BEAT_VISION === 'true') return true;
    // Default: on when visual beats are on and not loop-fast (loop-fast needs explicit flag)
    const loopFast =
      typeof sessionStorage !== 'undefined'
      && sessionStorage.getItem('autotube_loop_fast_mode') === 'true';
    const evalColdSession =
      typeof sessionStorage !== 'undefined'
      && sessionStorage.getItem('autotube_eval_cold') === 'true';
    if (loopFast && !evalColdSession) return false;
    return env.AUTOTUBE_VISUAL_BEATS !== '0' && env.AUTOTUBE_VISUAL_BEATS !== 'false';
  } catch {
    return false;
  }
}

/**
 * Cheap, deterministic relevance between a candidate's metadata and a beat.
 * Rejects obvious off-brand filler when the beat is serious documentary.
 */
export function scoreCandidateAgainstBeat(
  candidate: { alt?: string; url?: string; query?: string; source?: string },
  beat: Pick<VisualBeat, 'intent' | 'searchableSubject' | 'narrationExcerpt' | 'mustShow' | 'mustAvoid'>,
): BeatRelevanceScore {
  // The query is chosen from the beat before a result is fetched, so treating it
  // as evidence would make every result look relevant. Only fetched-result
  // metadata can satisfy the heuristic acceptance gate.
  const evidenceBlob = `${candidate.alt || ''} ${candidate.source || ''} ${candidate.url || ''}`.toLowerCase();
  const queryBlob = String(candidate.query || '').toLowerCase();
  const reasons: string[] = [];
  let score = 0;
  const beatContext = `${beat.searchableSubject || ''} ${beat.narrationExcerpt || ''} ${beat.intent || ''}`;

  for (const avoid of beat.mustAvoid || []) {
    if (avoid && evidenceBlob.includes(avoid.toLowerCase())) {
      return { score: 0, reasons: [`mustAvoid:${avoid}`], reject: true };
    }
  }

  const subjectTokens = tokens(beat.searchableSubject);
  const excerptTokens = tokens(beat.narrationExcerpt);
  const intentTokens = tokens(beat.intent);
  const mustShow = (beat.mustShow || []).map((s) => s.toLowerCase());

  let hits = 0;
  for (const t of subjectTokens) {
    if (evidenceBlob.includes(t)) hits += 1;
  }
  if (subjectTokens.length) {
    const ratio = hits / subjectTokens.length;
    score += ratio * 0.5;
    if (ratio > 0) reasons.push(`subject:${hits}/${subjectTokens.length}`);
  }

  let excerptHits = 0;
  for (const t of excerptTokens.slice(0, 12)) {
    if (evidenceBlob.includes(t)) excerptHits += 1;
  }
  if (excerptTokens.length) {
    const ratio = excerptHits / Math.min(12, excerptTokens.length);
    score += ratio * 0.3;
    if (excerptHits > 0) reasons.push(`excerpt:${excerptHits}`);
  }

  for (const t of intentTokens.slice(0, 6)) {
    if (evidenceBlob.includes(t)) {
      score += 0.05;
      reasons.push(`intent:${t}`);
    }
  }

  for (const m of mustShow) {
    if (m && evidenceBlob.includes(m)) {
      score += 0.15;
      reasons.push(`mustShow:${m}`);
    }
  }

  // Generic stock language without subject overlap → soft reject
  if (isGenericBeatJunk(evidenceBlob, beatContext)) {
    return { score: Math.min(score, 0.1), reasons: [...reasons, 'generic-stock-junk'], reject: true };
  }
  const generic = /stock photo|b-roll footage|establish visual|supporting b-roll|generic corporate/.test(evidenceBlob);
  if (generic && hits === 0) {
    return { score: Math.min(score, 0.15), reasons: [...reasons, 'generic-stock'], reject: true };
  }

  const evidenceScore = Math.max(0, Math.min(1, score));

  // Query overlap is useful only as a small ranking prior. It cannot change
  // acceptance: reject is determined entirely from alt/url/source evidence.
  const priorTokens = [...subjectTokens, ...excerptTokens.slice(0, 12), ...intentTokens.slice(0, 6)];
  const queryHits = new Set(priorTokens.filter((t) => queryBlob.includes(t))).size;
  const queryPrior = Math.min(0.08, queryHits * 0.015);
  if (queryPrior > 0) reasons.push(`query-prior:${queryHits}`);

  score = Math.max(0, Math.min(1, evidenceScore + queryPrior));
  return { score, reasons, reject: evidenceScore < 0.12 && hits === 0 };
}

export function buildBeatRelevancePrompt(beat: VisualBeat, imageUrl: string): {
  system: string;
  user: Array<{ type: string; [key: string]: unknown }>;
} {
  const system = [
    'You score whether an image supports a specific video beat.',
    'Reject images that are only vaguely related stock.',
    'Return JSON: {"relevant":true|false,"score":0-10,"reason":"..."}',
  ].join(' ');
  const user = [
    {
      type: 'text',
      text: `Beat intent: ${beat.intent}\nSubject: ${beat.searchableSubject}\nNarration: ${beat.narrationExcerpt}\nMust show: ${(beat.mustShow || []).join(', ')}\nMust avoid: ${(beat.mustAvoid || []).join(', ')}`,
    },
    { type: 'image_url', image_url: { url: imageUrl } },
  ];
  return { system, user };
}

/**
 * Multimodal top-N: ask vision whether the image supports the beat.
 * Returns null on failure (caller falls back to heuristic).
 */
export async function scoreImageAgainstBeatVision(
  imageUrl: string,
  beat: VisualBeat,
  apiKey: string,
  options?: { signal?: AbortSignal },
): Promise<BeatRelevanceScore | null> {
  if (!apiKey || !imageUrl) return null;
  if (imageUrl.startsWith('blob:') || imageUrl.startsWith('data:') || imageUrl.startsWith('/')) {
    return null;
  }
  try {
    const { system, user } = buildBeatRelevancePrompt(beat, imageUrl);
    const response = await fetchWithTimeout(
      OPENROUTER_ENDPOINT,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://autotube.video',
          'X-Title': 'AutoTube Beat Relevance',
        },
        body: JSON.stringify({
          model: BEAT_VISION_MODEL,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      },
      {
        timeoutMs: BEAT_VISION_TIMEOUT_MS,
        maxRetries: 1,
        signal: options?.signal,
      },
    );
    if (!response.ok) {
      logger.warn('BeatVision', `API ${response.status}`);
      return null;
    }
    const data = await response.json();
    const text = openRouterMessageText(data?.choices?.[0]?.message);
    const parsed = extractJson(text) as { relevant?: boolean; score?: number; reason?: string } | null;
    if (!parsed || typeof parsed.score !== 'number') return null;
    const score01 = Math.max(0, Math.min(1, parsed.score / 10));
    const reject = parsed.relevant === false || parsed.score < 4;
    return {
      score: score01,
      reasons: [parsed.reason || `vision:${parsed.score}`],
      reject,
    };
  } catch (err) {
    logger.warn('BeatVision', 'vision score failed', err);
    return null;
  }
}

/**
 * Rank a shortlist with heuristic + optional vision (budgeted).
 * Mutates nothing; returns preferred order (best first).
 */
export async function rankCandidatesWithBeatVision<T extends { alt?: string; url?: string; query?: string; source?: string; resolvedUrl?: string }>(
  candidates: T[],
  beats: VisualBeat[] | null | undefined,
  apiKey: string | undefined,
  options?: { signal?: AbortSignal; budget?: { remaining: number }; topN?: number },
): Promise<T[]> {
  if (!candidates.length) return candidates;
  if (!beats?.length) return candidates;

  const topN = options?.topN ?? BEAT_VISION_TOP_N;
  const shortlist = candidates.slice(0, topN);
  const rest = candidates.slice(topN);

  const scored = await Promise.all(
    shortlist.map(async (c) => {
      let best = scoreCandidateAgainstBeat(c, beats[0]);
      let bestBeat = beats[0];
      for (const beat of beats.slice(1)) {
        const h = scoreCandidateAgainstBeat(c, beat);
        if (
          (!h.reject && best.reject)
          || (h.reject === best.reject && h.score > best.score)
        ) {
          best = h;
          bestBeat = beat;
        }
      }

      let vision: BeatRelevanceScore | null = null;
      if (
        apiKey
        && beatVisionEnabled()
        && options?.budget
        && options.budget.remaining > 0
        && !options.signal?.aborted
      ) {
        options.budget.remaining -= 1;
        vision = await scoreImageAgainstBeatVision(
          c.resolvedUrl || c.url || '',
          bestBeat,
          apiKey,
          { signal: options.signal },
        );
      }

      const combined = vision
        ? {
            score: vision.reject ? vision.score * 0.3 : (best.score * 0.35 + vision.score * 0.65),
            reject: vision.reject && best.reject,
          }
        : best;

      return { c, score: combined.reject ? combined.score - 1 : combined.score };
    }),
  );

  scored.sort((a, b) => b.score - a.score);
  return [...scored.map((s) => s.c), ...rest];
}
