export type PacingPattern = 'staccato' | 'flowing' | 'alternating' | 'crescendo' | 'decrescendo';

export function analyzePacingPattern(
  text: string,
): { pattern: PacingPattern; sentenceLengths: number[]; avgLength: number; variance: number } {
  if (!text || text.trim().length === 0) {
    return { pattern: 'staccato', sentenceLengths: [], avgLength: 0, variance: 0 };
  }

  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const sentenceLengths = sentences.map(s => s.trim().split(/\s+/).filter(w => w.length > 0).length);

  if (sentenceLengths.length === 0) {
    return { pattern: 'staccato', sentenceLengths: [], avgLength: 0, variance: 0 };
  }

  const avgLength = sentenceLengths.reduce((a, b) => a + b, 0) / sentenceLengths.length;

  const variance = sentenceLengths.reduce((sum, len) => {
    const diff = len - avgLength;
    return sum + diff * diff;
  }, 0) / sentenceLengths.length;

  const pattern = detectPattern(sentenceLengths, avgLength, variance);

  return { pattern, sentenceLengths, avgLength, variance };
}

function detectPattern(
  lengths: number[],
  avgLength: number,
  variance: number,
): PacingPattern {
  if (lengths.length < 2) return 'staccato';

  const stdDev = Math.sqrt(variance);
  const cv = avgLength > 0 ? stdDev / avgLength : 0;

  if (avgLength <= 6 && cv < 0.5) return 'staccato';
  if (avgLength >= 18 && cv < 0.4) return 'flowing';

  let alternatingCount = 0;
  for (let i = 1; i < lengths.length; i++) {
    const prevShort = lengths[i - 1] < avgLength;
    const currShort = lengths[i] < avgLength;
    if (prevShort !== currShort) alternatingCount++;
  }
  const alternatingRatio = alternatingCount / (lengths.length - 1);
  if (alternatingRatio > 0.6) return 'alternating';

  let increasingCount = 0;
  let decreasingCount = 0;
  for (let i = 1; i < lengths.length; i++) {
    if (lengths[i] > lengths[i - 1]) increasingCount++;
    else if (lengths[i] < lengths[i - 1]) decreasingCount++;
  }

  const trendTotal = lengths.length - 1;
  if (trendTotal > 0) {
    if (increasingCount / trendTotal > 0.6) return 'crescendo';
    if (decreasingCount / trendTotal > 0.6) return 'decrescendo';
  }

  return cv > 0.5 ? 'alternating' : 'flowing';
}

export function rewriteForAlternatingPacing(text: string): string {
  if (!text || text.trim().length === 0) return text;

  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  if (sentences.length === 0) return text;

  const rewritten: string[] = [];

  for (let i = 0; i < sentences.length; i++) {
    const words = sentences[i].trim().split(/\s+/).filter(w => w.length > 0);
    const isShortTurn = i % 2 === 0;

    if (isShortTurn) {
      const shortWords = words.slice(0, Math.min(5, words.length));
      rewritten.push(shortWords.join(' ') + '.');
    } else {
      if (words.length < 15 && i + 1 < sentences.length) {
        const nextWords = sentences[i + 1].trim().split(/\s+/).filter(w => w.length > 0);
        const combined = [...words, ...nextWords].slice(0, 20);
        rewritten.push(combined.join(' ') + '.');
        i++;
      } else {
        rewritten.push(words.join(' ') + '.');
      }
    }
  }

  return rewritten.join(' ');
}

export function computePacingVarietyScore(text: string): number {
  if (!text || text.trim().length === 0) return 0;

  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  if (sentences.length < 2) return 0;

  const lengths = sentences.map(s => s.trim().split(/\s+/).filter(w => w.length > 0).length);
  const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;

  if (avg === 0) return 0;

  const variance = lengths.reduce((sum, len) => {
    const diff = len - avg;
    return sum + diff * diff;
  }, 0) / lengths.length;

  const stdDev = Math.sqrt(variance);
  const cv = stdDev / avg;

  const uniqueLengths = new Set(lengths).size;
  const uniqueRatio = uniqueLengths / lengths.length;

  const shortCount = lengths.filter(l => l <= 7).length;
  const mediumCount = lengths.filter(l => l > 7 && l <= 16).length;
  const longCount = lengths.filter(l => l > 16).length;
  const categorySpread = (shortCount > 0 ? 1 : 0) + (mediumCount > 0 ? 1 : 0) + (longCount > 0 ? 1 : 0);
  const spreadScore = categorySpread / 3;

  const varietyRaw = (cv * 30) + (uniqueRatio * 40) + (spreadScore * 30);
  return Math.min(100, Math.max(0, Math.round(varietyRaw)));
}

export function injectPausesForEmphasis(text: string): string {
  if (!text || text.trim().length === 0) return text;

  const sentences = text.split(/(?<=[.!?])\s+/);
  const result: string[] = [];

  const emphasisPatterns = [
    /\b(but|however|yet|still)\b/i,
    /\b(importantly|crucially|significantly)\b/i,
    /\b(remember|notice|consider)\b/i,
    /\b(the key|the point|the truth|the secret)\b/i,
  ];

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];

    if (i > 0) {
      const hasEmphasis = emphasisPatterns.some(p => p.test(sentence));
      if (hasEmphasis) {
        result.push('[pause:300ms] ' + sentence);
        continue;
      }

      const prevWords = sentences[i - 1].split(/\s+/).length;
      const currWords = sentence.split(/\s+/).length;
      if (prevWords > 15 && currWords <= 8) {
        result.push('[pause:300ms] ' + sentence);
        continue;
      }
    }

    result.push(sentence);
  }

  return result.join(' ');
}
