import type { RenderContext2D } from '../renderingShared'

export interface EasterEgg {
  text: string
  x: number
  y: number
  alpha: number
  fontSize: number
  rotation: number
  segmentIndex: number
}

export const EASTER_EGG_MESSAGES: string[] = [
  'You found me!',
  'Nice eyes!',
  'Secret message here',
  'Easter egg unlocked',
  'You\'re paying attention',
  'Hidden gem found',
  'Sharp viewer detected',
  'This is a secret',
  'Not everyone sees this',
  'Congratulations, explorer',
  'The truth is out there',
  'You\'re one of the few',
  'Keep watching closely',
  'Rewind and rewatch',
  'Tell no one about this',
  'The cake is a lie',
  'Achievement unlocked',
  'Secret level accessed',
  'You have great taste',
  'Pause and screenshot this',
  'Only 1% find this',
  'Welcome to the club',
  'This frame is special',
  'You noticed something',
]

function seededRandom(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff
    return (s >>> 0) / 0xffffffff
  }
}

export function generateEasterEggs(topic: string, segmentCount: number): EasterEgg[] {
  if (segmentCount <= 0) return []

  const count = Math.min(4, Math.max(2, Math.floor(segmentCount / 3) + 1))
  const eggs: EasterEgg[] = []
  const rng = seededRandom(topic.length * 31 + segmentCount * 17)

  const usedMessages = new Set<number>()
  const usedSegments = new Set<number>()

  for (let i = 0; i < count; i++) {
    let msgIdx: number
    do {
      msgIdx = Math.floor(rng() * EASTER_EGG_MESSAGES.length)
    } while (usedMessages.has(msgIdx) && usedMessages.size < EASTER_EGG_MESSAGES.length)
    usedMessages.add(msgIdx)

    let segIdx: number
    do {
      segIdx = Math.floor(rng() * segmentCount)
    } while (usedSegments.has(segIdx) && usedSegments.size < segmentCount)
    usedSegments.add(segIdx)

    let x: number
    let y: number
    do {
      x = rng()
      y = rng()
    } while (x > 0.3 && x < 0.7 && y > 0.3 && y < 0.7)

    const alpha = 0.03 + rng() * 0.05
    const fontSize = 12 + Math.floor(rng() * 7)
    const rotation = (rng() - 0.5) * 0.3

    eggs.push({
      text: EASTER_EGG_MESSAGES[msgIdx],
      x,
      y,
      alpha: Math.round(alpha * 1000) / 1000,
      fontSize,
      rotation: Math.round(rotation * 1000) / 1000,
      segmentIndex: segIdx,
    })
  }

  return eggs
}

export function drawEasterEgg(
  ctx: RenderContext2D,
  egg: EasterEgg,
  w: number,
  h: number,
): void {
  ctx.save()
  ctx.globalAlpha = egg.alpha
  ctx.font = `${egg.fontSize}px monospace`
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.translate(egg.x * w, egg.y * h)
  ctx.fillText(egg.text, 0, 0)
  ctx.restore()
}
