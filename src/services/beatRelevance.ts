/**
 * Score media candidates against a VisualBeat (intent + narration excerpt).
 * Heuristic path is always available; multimodal vision is optional/top-N.
 */
import type { VisualBeat } from './visualBeatSheet';

export interface BeatRelevanceScore {
  score: number; // 0–1
  reasons: string[];
  reject: boolean;
}

function tokens(text: string): string[] {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

/**
 * Cheap, deterministic relevance between a candidate's metadata and a beat.
 * Rejects obvious off-brand filler when the beat is serious documentary.
 */
export function scoreCandidateAgainstBeat(
  candidate: { alt?: string; url?: string; query?: string; source?: string },
  beat: Pick<VisualBeat, 'intent' | 'searchableSubject' | 'narrationExcerpt' | 'mustShow' | 'mustAvoid'>,
): BeatRelevanceScore {
  const blob = `${candidate.alt || ''} ${candidate.query || ''} ${candidate.source || ''} ${candidate.url || ''}`.toLowerCase();
  const reasons: string[] = [];
  let score = 0;

  for (const avoid of beat.mustAvoid || []) {
    if (avoid && blob.includes(avoid.toLowerCase())) {
      return { score: 0, reasons: [`mustAvoid:${avoid}`], reject: true };
    }
  }

  const subjectTokens = tokens(beat.searchableSubject);
  const excerptTokens = tokens(beat.narrationExcerpt);
  const intentTokens = tokens(beat.intent);
  const mustShow = (beat.mustShow || []).map((s) => s.toLowerCase());

  let hits = 0;
  for (const t of subjectTokens) {
    if (blob.includes(t)) hits += 1;
  }
  if (subjectTokens.length) {
    const ratio = hits / subjectTokens.length;
    score += ratio * 0.5;
    if (ratio > 0) reasons.push(`subject:${hits}/${subjectTokens.length}`);
  }

  let excerptHits = 0;
  for (const t of excerptTokens.slice(0, 12)) {
    if (blob.includes(t)) excerptHits += 1;
  }
  if (excerptTokens.length) {
    const ratio = excerptHits / Math.min(12, excerptTokens.length);
    score += ratio * 0.3;
    if (excerptHits > 0) reasons.push(`excerpt:${excerptHits}`);
  }

  for (const t of intentTokens.slice(0, 6)) {
    if (blob.includes(t)) {
      score += 0.05;
      reasons.push(`intent:${t}`);
    }
  }

  for (const m of mustShow) {
    if (m && blob.includes(m)) {
      score += 0.15;
      reasons.push(`mustShow:${m}`);
    }
  }

  // Generic stock language without subject overlap → soft reject
  const generic = /stock photo|b-roll footage|establish visual|supporting b-roll|generic corporate/.test(blob);
  if (generic && hits === 0) {
    return { score: Math.min(score, 0.15), reasons: [...reasons, 'generic-stock'], reject: true };
  }

  score = Math.max(0, Math.min(1, score));
  return { score, reasons, reject: score < 0.12 && hits === 0 };
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
