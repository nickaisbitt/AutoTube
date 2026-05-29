export interface ReviewFeedback {
  category: 'brightness' | 'pacing' | 'audio' | 'visual' | 'narrative'
  severity: 'low' | 'medium' | 'high'
  message: string
  suggestion: string
}

const CATEGORY_PATTERNS: { category: ReviewFeedback['category']; patterns: RegExp[] }[] = [
  {
    category: 'brightness',
    patterns: [
      /bright(ness)?/i,
      /dark/i,
      /expos(ure|ed)/i,
      /light(ing)?/i,
      /dim/i,
      /visibility/i,
      /contrast/i,
      /shadow/i,
    ],
  },
  {
    category: 'pacing',
    patterns: [
      /pac(ing|e)/i,
      /slow/i,
      /fast/i,
      /rushed/i,
      /drag(ging)?/i,
      /timing/i,
      /tempo/i,
      /duration/i,
      /too (long|short)/i,
    ],
  },
  {
    category: 'audio',
    patterns: [
      /audio/i,
      /sound/i,
      /volume/i,
      /music/i,
      /voice/i,
      /duck(ing)?/i,
      /loud/i,
      /quiet/i,
      /noise/i,
      /mix/i,
    ],
  },
  {
    category: 'visual',
    patterns: [
      /visual/i,
      /image/i,
      /quality/i,
      /resolution/i,
      /blur(ry)?/i,
      /pixelat(ed|ion)/i,
      /asset/i,
      /graphic/i,
      /animation/i,
      /render/i,
    ],
  },
  {
    category: 'narrative',
    patterns: [
      /narrativ(e|e)/i,
      /script/i,
      /story/i,
      /flow/i,
      /coheren(ce|t)/i,
      /confus(ing|ed)/i,
      /unclear/i,
      /rewrite/i,
      /re-?script/i,
      /wording/i,
    ],
  },
]

const SEVERITY_PATTERNS: { severity: ReviewFeedback['severity']; patterns: RegExp[] }[] = [
  {
    severity: 'high',
    patterns: [
      /critical/i,
      /severe/i,
      /major/i,
      /urgent/i,
      /must fix/i,
      /broken/i,
      /unusable/i,
      /terrible/i,
      /very bad/i,
    ],
  },
  {
    severity: 'medium',
    patterns: [
      /should/i,
      /recommend/i,
      /improve/i,
      /better/i,
      /consider/i,
      /moderate/i,
      /noticeable/i,
      /somewhat/i,
    ],
  },
  {
    severity: 'low',
    patterns: [
      /minor/i,
      /slight(ly)?/i,
      /could/i,
      /nice to/i,
      /optional/i,
      /small/i,
      /barely/i,
      /trivial/i,
    ],
  },
]

export function parseAIReviewFeedback(reviewText: string): ReviewFeedback[] {
  if (!reviewText.trim()) return []

  const feedback: ReviewFeedback[] = []
  const lines = reviewText.split(/\n+/).filter(l => l.trim().length > 0)

  for (const line of lines) {
    const trimmed = line.replace(/^[\s\-\*\d.)]+/, '').trim()
    if (trimmed.length < 5) continue

    let detectedCategory: ReviewFeedback['category'] | null = null
    for (const { category, patterns } of CATEGORY_PATTERNS) {
      if (patterns.some(p => p.test(trimmed))) {
        detectedCategory = category
        break
      }
    }

    if (!detectedCategory) continue

    let detectedSeverity: ReviewFeedback['severity'] = 'medium'
    for (const { severity, patterns } of SEVERITY_PATTERNS) {
      if (patterns.some(p => p.test(trimmed))) {
        detectedSeverity = severity
        break
      }
    }

    const suggestion = extractSuggestion(trimmed, detectedCategory)

    feedback.push({
      category: detectedCategory,
      severity: detectedSeverity,
      message: trimmed,
      suggestion,
    })
  }

  return feedback
}

function extractSuggestion(message: string, category: ReviewFeedback['category']): string {
  const suggestionMatch = message.match(/(?:should|recommend|try|suggest|fix(?:\s+by)?|instead)[\s:]+(.+)/i)
  if (suggestionMatch) return suggestionMatch[1].trim()

  switch (category) {
    case 'brightness':
      return 'Increase global brightness boost by 0.1'
    case 'pacing':
      return 'Increase retention beat frequency'
    case 'audio':
      return 'Adjust audio ducking levels'
    case 'visual':
      return 'Mark low-quality assets as fallback'
    case 'narrative':
      return 'Flag segments for re-scripting'
  }
}

export function applyFeedbackCorrections(
  project: Record<string, unknown>,
  feedback: ReviewFeedback[],
): Record<string, unknown> {
  const result = { ...project }

  for (const fb of feedback) {
    switch (fb.category) {
      case 'brightness': {
        const current = typeof result.globalBrightnessBoost === 'number' ? result.globalBrightnessBoost : 0
        const boost = fb.severity === 'high' ? 0.15 : fb.severity === 'medium' ? 0.1 : 0.05
        result.globalBrightnessBoost = Math.min(1, current + boost)
        break
      }

      case 'pacing': {
        const currentFreq = typeof result.retentionBeatFrequency === 'number' ? result.retentionBeatFrequency : 15
        const increase = fb.severity === 'high' ? 5 : fb.severity === 'medium' ? 3 : 1
        result.retentionBeatFrequency = Math.max(5, currentFreq - increase)
        break
      }

      case 'audio': {
        const currentDucking = typeof result.duckingLevel === 'number' ? result.duckingLevel : 0.5
        const adjustment = fb.severity === 'high' ? 0.15 : fb.severity === 'medium' ? 0.1 : 0.05
        result.duckingLevel = Math.max(0, Math.min(1, currentDucking - adjustment))
        break
      }

      case 'visual': {
        const qualityThreshold = typeof result.qualityThreshold === 'number' ? result.qualityThreshold : 0.3
        const increase = fb.severity === 'high' ? 0.2 : fb.severity === 'medium' ? 0.1 : 0.05
        result.qualityThreshold = Math.min(1, qualityThreshold + increase)
        result.markLowQualityAsFallback = true
        break
      }

      case 'narrative': {
        const flaggedSegments = Array.isArray(result.flaggedSegments) ? [...result.flaggedSegments as number[]] : []
        const segments = Array.isArray(result.segments) ? result.segments as Record<string, unknown>[] : []
        for (let i = 0; i < segments.length; i++) {
          if (!flaggedSegments.includes(i)) {
            flaggedSegments.push(i)
          }
        }
        result.flaggedSegments = flaggedSegments
        result.needsRescript = true
        break
      }
    }
  }

  return result
}

export function computeRetryConfig(
  feedback: ReviewFeedback[],
): { brightnessBoost: number; qualityThreshold: number; maxRetries: number } {
  let brightnessBoost = 0
  let qualityThreshold = 0.3
  let maxRetries = 1

  for (const fb of feedback) {
    if (fb.category === 'brightness') {
      brightnessBoost += fb.severity === 'high' ? 0.15 : fb.severity === 'medium' ? 0.1 : 0.05
    }

    if (fb.category === 'visual') {
      qualityThreshold += fb.severity === 'high' ? 0.2 : fb.severity === 'medium' ? 0.1 : 0.05
    }

    if (fb.severity === 'high') {
      maxRetries = Math.max(maxRetries, 3)
    } else if (fb.severity === 'medium') {
      maxRetries = Math.max(maxRetries, 2)
    }
  }

  return {
    brightnessBoost: Math.min(0.5, brightnessBoost),
    qualityThreshold: Math.min(1, qualityThreshold),
    maxRetries: Math.min(5, maxRetries),
  }
}
