export type ReorderStrategy = 'drama_first' | 'chronological' | 'impact_pyramid' | 'contrast_alternate';

interface SegmentInput {
  narration: string;
  media: { baseScore: number; type?: string }[];
}

const STATISTICAL_PATTERNS = /\$[\d,.]+|\d+%|\d+\s*(billion|million|trillion)/i;
const NAMED_PERSON_PATTERN = /[A-Z][a-z]+ [A-Z][a-z]+/;
const QUESTION_PATTERN = /\?/;
const URGENCY_KEYWORDS = /\b(urgent|critical|breaking|shocking|devastating|explosive|catastrophic|terrifying|alarming|unprecedented|emergency|crisis)\b/i;
const SHORT_SENTENCE_MAX_WORDS = 8;

export function computeDramaScore(segment: SegmentInput): number {
  let score = 0;
  const narration = segment.narration || '';

  if (STATISTICAL_PATTERNS.test(narration)) {
    score += 30;
  }

  if (NAMED_PERSON_PATTERN.test(narration)) {
    score += 20;
  }

  if (QUESTION_PATTERN.test(narration)) {
    score += 15;
  }

  if (URGENCY_KEYWORDS.test(narration)) {
    score += 25;
  }

  const highScoredMedia = segment.media.filter(m => m.baseScore > 150);
  if (highScoredMedia.length > 0) {
    score += 20;
  }

  const sentences = narration.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const shortSentences = sentences.filter(s => s.trim().split(/\s+/).length <= SHORT_SENTENCE_MAX_WORDS);
  if (shortSentences.length > 0 && shortSentences.length / Math.max(1, sentences.length) > 0.5) {
    score += 10;
  }

  return score;
}

export function reorderSegments(segments: unknown[], strategy: ReorderStrategy): unknown[] {
  if (segments.length === 0) return [];

  const typedSegments = segments as SegmentInput[];

  switch (strategy) {
    case 'chronological':
      return [...segments];

    case 'drama_first': {
      const scored = typedSegments.map((seg, idx) => ({
        segment: seg,
        originalIndex: idx,
        dramaScore: computeDramaScore(seg),
      }));
      scored.sort((a, b) => b.dramaScore - a.dramaScore);
      return scored.map(s => s.segment);
    }

    case 'impact_pyramid': {
      const scored = typedSegments.map((seg, idx) => ({
        segment: seg,
        originalIndex: idx,
        dramaScore: computeDramaScore(seg),
      }));
      scored.sort((a, b) => a.dramaScore - b.dramaScore);
      return scored.map(s => s.segment);
    }

    case 'contrast_alternate': {
      const scored = typedSegments.map((seg, idx) => ({
        segment: seg,
        originalIndex: idx,
        dramaScore: computeDramaScore(seg),
      }));
      scored.sort((a, b) => b.dramaScore - a.dramaScore);

      const high = scored.filter(s => s.dramaScore >= 40);
      const low = scored.filter(s => s.dramaScore < 40);

      const result: SegmentInput[] = [];
      let highIdx = 0;
      let lowIdx = 0;

      while (highIdx < high.length || lowIdx < low.length) {
        if (highIdx < high.length) {
          result.push(high[highIdx].segment);
          highIdx++;
        }
        if (lowIdx < low.length) {
          result.push(low[lowIdx].segment);
          lowIdx++;
        }
      }

      return result;
    }

    default:
      return [...segments];
  }
}

export function selectColdOpenSegment(segments: SegmentInput[]): number {
  if (segments.length === 0) return 0;

  let bestIndex = 0;
  let bestScore = -1;

  for (let i = 0; i < segments.length; i++) {
    const score = computeDramaScore(segments[i]);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  return bestIndex;
}
