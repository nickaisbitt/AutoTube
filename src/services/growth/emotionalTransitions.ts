export type EmotionalTone = 'neutral' | 'urgent' | 'calm' | 'dramatic' | 'hopeful' | 'ominous'

export const EMOTIONAL_KEYWORDS: Record<EmotionalTone, string[]> = {
  neutral: [
    'information', 'overview', 'summary', 'details', 'facts', 'data',
    'report', 'analysis', 'review', 'update', 'status', 'current',
    'general', 'standard', 'normal', 'typical', 'regular', 'common',
    'basic', 'simple', 'straightforward', 'plain', 'clear', 'noted',
  ],
  urgent: [
    'urgent', 'immediately', 'critical', 'emergency', 'alert', 'warning',
    'danger', 'breaking', 'now', 'hurry', 'fast', 'quick', 'rush',
    'deadline', 'crisis', 'threat', 'attack', 'breach', 'alarm',
    'serious', 'severe', 'pressing', 'vital', 'crucial', 'imminent',
  ],
  calm: [
    'peaceful', 'relax', 'gentle', 'quiet', 'steady', 'smooth',
    'easy', 'comfortable', 'safe', 'secure', 'stable', 'balanced',
    'tranquil', 'serene', 'soothing', 'restful', 'mild', 'moderate',
    'patient', 'composed', 'collected', 'unhurried', 'measured', 'thoughtful',
  ],
  dramatic: [
    'shocking', 'unbelievable', 'stunning', 'massive', 'enormous', 'devastating',
    'incredible', 'remarkable', 'extraordinary', 'explosive', 'catastrophic', 'unprecedented',
    'groundbreaking', 'revolutionary', 'dramatic', 'intense', 'powerful', 'overwhelming',
    'spectacular', 'jaw-dropping', 'mind-blowing', 'earth-shattering', 'monumental', 'historic',
  ],
  hopeful: [
    'hope', 'optimistic', 'bright', 'promising', 'positive', 'better',
    'improve', 'progress', 'growth', 'success', 'achieve', 'opportunity',
    'potential', 'future', 'advance', 'breakthrough', 'solution', 'recovery',
    'uplift', 'inspire', 'encourage', 'renew', 'revive', 'flourish',
  ],
  ominous: [
    'dark', 'threat', 'danger', 'fear', 'risk', 'looming',
    'shadow', 'sinister', 'menacing', 'foreboding', 'dread', 'worry',
    'concern', 'trouble', 'problem', 'worst', 'decline', 'collapse',
    'destroy', 'ruin', 'damage', 'harm', 'deadly', 'fatal',
  ],
}

const TONE_ADJACENCY: Record<EmotionalTone, EmotionalTone[]> = {
  neutral: ['calm', 'hopeful'],
  urgent: ['dramatic', 'ominous'],
  calm: ['neutral', 'hopeful'],
  dramatic: ['urgent', 'ominous'],
  hopeful: ['calm', 'neutral'],
  ominous: ['urgent', 'dramatic'],
}

export function detectEmotionalTone(text: string): EmotionalTone {
  if (!text.trim()) return 'neutral'

  const lower = text.toLowerCase()
  const words = lower.split(/\s+/)

  const scores: Record<EmotionalTone, number> = {
    neutral: 0,
    urgent: 0,
    calm: 0,
    dramatic: 0,
    hopeful: 0,
    ominous: 0,
  }

  for (const [tone, keywords] of Object.entries(EMOTIONAL_KEYWORDS) as [EmotionalTone, string[]][]) {
    for (const keyword of keywords) {
      for (const word of words) {
        if (word.includes(keyword) || keyword.includes(word)) {
          scores[tone]++
        }
      }
    }
  }

  if (lower.includes('!')) scores.urgent += 2
  if (lower.includes('...')) scores.ominous += 1
  if ((lower.match(/!/g) || []).length > 1) scores.dramatic += 2

  let maxTone: EmotionalTone = 'neutral'
  let maxScore = 0

  for (const [tone, score] of Object.entries(scores) as [EmotionalTone, number][]) {
    if (score > maxScore) {
      maxScore = score
      maxTone = tone
    }
  }

  if (maxScore === 0) return 'neutral'
  return maxTone
}

export function computeTransitionCurve(
  fromTone: EmotionalTone,
  toTone: EmotionalTone,
): { duration: number; easing: string } {
  if (fromTone === toTone) {
    return { duration: 0.5, easing: 'linear' }
  }

  const adjacent = TONE_ADJACENCY[fromTone]
  if (adjacent.includes(toTone)) {
    return { duration: 1.0, easing: 'ease-in-out' }
  }

  return { duration: 1.5, easing: 'ease-in-out' }
}
