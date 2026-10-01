export interface CutdownConfig {
  trimPercent: number
  applyToSegments: number[]
  transitionType: 'hard_cut' | 'fade' | 'zoom_out'
}

export function detectIncompleteEnding(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false

  if (trimmed.endsWith('...') || trimmed.endsWith('…')) return true
  if (trimmed.endsWith('—') || trimmed.endsWith('--')) return true
  if (trimmed.endsWith(',') || trimmed.endsWith(';')) return true
  if (trimmed.endsWith(':')) return true

  const lastChar = trimmed[trimmed.length - 1]
  if (lastChar !== '.' && lastChar !== '!' && lastChar !== '?' && lastChar !== '"' && lastChar !== "'") {
    const words = trimmed.split(/\s+/)
    const lastWord = words[words.length - 1].toLowerCase()
    const connectors = ['and', 'but', 'or', 'so', 'because', 'while', 'when', 'if', 'that', 'which', 'who']
    if (connectors.includes(lastWord)) return true
    if (words.length > 3 && !lastChar.match(/[.!?]/)) return true
  }

  return false
}

export function computeCutdowns(
  segments: { narration: string; duration: number }[],
  intensity?: 'subtle' | 'moderate' | 'aggressive',
): CutdownConfig {
  const level = intensity ?? 'moderate'

  let trimPercent: number
  let segmentCount: number
  let transitionType: CutdownConfig['transitionType']

  switch (level) {
    case 'subtle':
      trimPercent = 5
      segmentCount = 2
      transitionType = 'fade'
      break
    case 'moderate':
      trimPercent = 10
      segmentCount = 3
      transitionType = 'hard_cut'
      break
    case 'aggressive':
      trimPercent = 15
      segmentCount = 4
      transitionType = 'zoom_out'
      break
  }

  if (segments.length === 0) {
    return { trimPercent, applyToSegments: [], transitionType }
  }

  const totalSegments = segments.length
  const startIdx = Math.max(0, totalSegments - segmentCount)
  const applyToSegments: number[] = []

  for (let i = startIdx; i < totalSegments; i++) {
    if (detectIncompleteEnding(segments[i].narration)) {
      applyToSegments.push(i)
    }
  }

  return { trimPercent, applyToSegments, transitionType }
}

export function applyCutdowns(
  segments: { duration: number }[],
  config: CutdownConfig,
): { duration: number }[] {
  if (segments.length === 0 || config.applyToSegments.length === 0) {
    return segments.map(s => ({ ...s }))
  }

  const trimFraction = config.trimPercent / 100
  const applySet = new Set(config.applyToSegments)

  return segments.map((seg, idx) => {
    if (applySet.has(idx)) {
      const trimmed = seg.duration * (1 - trimFraction)
      return { duration: Math.max(0.1, trimmed) }
    }
    return { ...seg }
  })
}
