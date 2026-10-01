/**
 * Emotional arc mapping — maps script segments to emotional journey stages.
 *
 * Maps the viewer's emotional journey: curiosity → excitement → tension → relief → inspiration
 */

import type { ScriptSegment } from '../../types';

export type EmotionStage =
  | 'curiosity'
  | 'excitement'
  | 'tension'
  | 'relief'
  | 'inspiration'
  | 'surprise'
  | 'determination';

export interface EmotionalArcPoint {
  segmentIndex: number;
  segmentTitle: string;
  emotion: EmotionStage;
  intensity: number; // 0-10
  rationale: string;
}

const EMOTION_KEYWORDS: Record<EmotionStage, string[]> = {
  curiosity: ['what if', 'how', 'why', 'discover', 'reveal', 'hidden', 'secret', 'mystery', 'question', 'wonder'],
  excitement: ['breakthrough', 'amazing', 'incredible', 'revolutionary', 'game', 'massive', 'explosive', 'unprecedented'],
  tension: ['threat', 'danger', 'risk', 'fear', 'worry', 'alarming', 'devastating', 'terrifying', 'catastrophic', 'crisis'],
  relief: ['solution', 'protect', 'safe', 'fix', 'prevent', 'defense', 'shield', 'secure', 'action step', 'what you can do'],
  inspiration: ['empower', 'future', 'opportunity', 'hope', 'potential', 'change', 'transform', 'achieve', 'possibility'],
  surprise: ['but', 'however', 'actually', 'contrary', 'unexpected', 'shocking', 'nobody knew', 'twist', 'reality'],
  determination: ['must', 'need to', 'time is', 'act now', 'no choice', 'critical', 'urgent', 'immediately', 'tonight'],
};

/**
 * Maps each segment to an emotional stage based on content analysis.
 * Returns an ordered array of emotional arc points.
 */
export function mapEmotionalArc(segments: ScriptSegment[]): EmotionalArcPoint[] {
  const arc: EmotionalArcPoint[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const text = `${seg.title} ${seg.narration}`.toLowerCase();

    // Score each emotion stage based on keyword matches
    const scores: Record<EmotionStage, number> = {
      curiosity: 0, excitement: 0, tension: 0, relief: 0,
      inspiration: 0, surprise: 0, determination: 0,
    };

    for (const [stage, keywords] of Object.entries(EMOTION_KEYWORDS)) {
      for (const kw of keywords) {
        if (text.includes(kw)) {
          scores[stage as EmotionStage] += 1;
        }
      }
    }

    // Position-based bias: early segments lean curiosity, middle lean tension, end leans relief/inspiration
    const progress = i / Math.max(1, segments.length - 1);
    if (progress < 0.2) {
      scores.curiosity += 2;
      scores.surprise += 1;
    } else if (progress < 0.5) {
      scores.excitement += 1;
      scores.tension += 1;
    } else if (progress < 0.75) {
      scores.tension += 2;
      scores.surprise += 1;
    } else {
      scores.relief += 1;
      scores.inspiration += 2;
      scores.determination += 1;
    }

    // Pick the highest-scoring emotion
    let bestEmotion: EmotionStage = 'curiosity';
    let bestScore = 0;
    for (const [stage, score] of Object.entries(scores)) {
      if (score > bestScore) {
        bestScore = score;
        bestEmotion = stage as EmotionStage;
      }
    }

    // Compute intensity from pacing score and content density
    const pacingIntensity = seg.pacingScore ?? 3;
    const wordCount = seg.narration.split(/\s+/).length;
    const contentDensity = Math.min(10, Math.round(wordCount / 10));
    const intensity = Math.max(1, Math.min(10, Math.round((pacingIntensity + contentDensity) / 2)));

    arc.push({
      segmentIndex: i,
      segmentTitle: seg.title,
      emotion: bestEmotion,
      intensity,
      rationale: `Position ${i + 1}/${segments.length} (${(progress * 100).toFixed(0)}%), keywords match: ${bestScore}`,
    });
  }

  return arc;
}

/**
 * Returns a human-readable summary of the emotional arc.
 */
export function summarizeEmotionalArc(arc: EmotionalArcPoint[]): string {
  if (arc.length === 0) return 'No segments mapped.';

  const emotionSequence = arc.map((p) => p.emotion);
  const uniqueEmotions = [...new Set(emotionSequence)];

  const transitions: string[] = [];
  for (let i = 1; i < emotionSequence.length; i++) {
    if (emotionSequence[i] !== emotionSequence[i - 1]) {
      transitions.push(`${emotionSequence[i - 1]} → ${emotionSequence[i]}`);
    }
  }

  return `Emotional journey: ${emotionSequence.join(' → ')}\nTransitions: ${transitions.length > 0 ? transitions.join(', ') : 'none (consistent tone)'}\nUnique emotions: ${uniqueEmotions.join(', ')}`;
}
