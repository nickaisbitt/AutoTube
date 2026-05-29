export interface CommentBaitConfig {
  text: string
  position: 'center' | 'lower_third'
  animation: 'fade' | 'slide' | 'typewriter'
  duration: number
  opacity: number
}

export const COMMENT_BAIT_TEMPLATES: string[] = [
  'What do you think? Comment below',
  'Agree or disagree?',
  'Did you know this? Let us know',
  'Drop a comment with your take',
  'Have you experienced this? Tell us',
  'What would you do? Comment below',
  'Share your thoughts in the comments',
  'Does this surprise you? Let us know',
  'What\'s your opinion? Drop a comment',
  'Have you seen this before? Comment below',
  'Do you agree with this take?',
  'What\'s the craziest part? Comment below',
  'Would you do the same? Let us know',
  'Tag someone who needs to see this',
  'Rate this from 1-10 in the comments',
  'What did you learn? Share below',
  'Is this the future? Tell us what you think',
  'Comment YES if you agree, NO if you don\'t',
]

export function selectCommentBait(topic: string, segmentIndex: number): string {
  const lowerTopic = topic.toLowerCase()
  const index = segmentIndex % COMMENT_BAIT_TEMPLATES.length

  if (lowerTopic.includes('tech') || lowerTopic.includes('ai') || lowerTopic.includes('cyber')) {
    const techBaits = [
      'Does this scare you? Comment below',
      'Is technology going too far? Share your take',
      'Would you use this? Let us know',
      'What\'s the risk here? Comment below',
    ]
    return techBaits[segmentIndex % techBaits.length]
  }

  if (lowerTopic.includes('money') || lowerTopic.includes('finance') || lowerTopic.includes('business')) {
    const financeBaits = [
      'Would you invest in this? Comment below',
      'Is this a good idea? Tell us',
      'How would this affect you? Share below',
      'What\'s your strategy? Drop a comment',
    ]
    return financeBaits[segmentIndex % financeBaits.length]
  }

  return COMMENT_BAIT_TEMPLATES[index]
}

export function computeMidpointTime(segments: { duration: number }[]): number {
  if (segments.length === 0) return 0

  const totalDuration = segments.reduce((sum, seg) => sum + seg.duration, 0)
  return totalDuration / 2
}

export function createCommentBaitOverlay(
  config: CommentBaitConfig,
  progress: number,
): { text: string; alpha: number; y: number } {
  const clampedProgress = Math.max(0, Math.min(1, progress))

  let alpha: number
  switch (config.animation) {
    case 'fade':
      if (clampedProgress < 0.2) {
        alpha = (clampedProgress / 0.2) * config.opacity
      } else if (clampedProgress > 0.8) {
        alpha = ((1 - clampedProgress) / 0.2) * config.opacity
      } else {
        alpha = config.opacity
      }
      break

    case 'slide':
      if (clampedProgress < 0.15) {
        alpha = (clampedProgress / 0.15) * config.opacity
      } else if (clampedProgress > 0.85) {
        alpha = ((1 - clampedProgress) / 0.15) * config.opacity
      } else {
        alpha = config.opacity
      }
      break

    case 'typewriter': {
      const charCount = Math.floor(clampedProgress * config.text.length)
      if (clampedProgress > 0.9) {
        alpha = ((1 - clampedProgress) / 0.1) * config.opacity
      } else {
        alpha = config.opacity
      }
      const visibleText = config.text.substring(0, charCount)
      return {
        text: visibleText,
        alpha: Math.max(0, Math.min(config.opacity, alpha)),
        y: config.position === 'center' ? 0.5 : 0.75,
      }
    }
  }

  let y: number
  if (config.animation === 'slide') {
    const slideProgress = Math.min(1, clampedProgress / 0.15)
    const baseY = config.position === 'center' ? 0.5 : 0.75
    y = baseY + (1 - slideProgress) * 0.1
  } else {
    y = config.position === 'center' ? 0.5 : 0.75
  }

  return {
    text: config.text,
    alpha: Math.max(0, Math.min(config.opacity, alpha)),
    y,
  }
}
