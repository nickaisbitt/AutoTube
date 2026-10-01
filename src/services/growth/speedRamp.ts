export interface SpeedRampConfig {
  segments: { startTime: number; endTime: number; speed: number }[]
}

const MIN_SPEED = 0.5
const MAX_SPEED = 2.0
const LOOP_THRESHOLD = 0.25

export function computeSpeedRamp(clipDuration: number, targetDuration: number): SpeedRampConfig {
  if (clipDuration <= 0 || targetDuration <= 0) {
    return { segments: [] }
  }

  if (shouldLoopClip(clipDuration, targetDuration)) {
    const loops = Math.ceil(targetDuration / clipDuration)
    const segments: SpeedRampConfig['segments'] = []

    for (let i = 0; i < loops; i++) {
      const start = i * clipDuration
      const end = Math.min((i + 1) * clipDuration, targetDuration)
      segments.push({ startTime: start, endTime: end, speed: 1.0 })
    }

    return { segments }
  }

  const speed = clipDuration / targetDuration
  const clampedSpeed = Math.max(MIN_SPEED, Math.min(MAX_SPEED, speed))

  return {
    segments: [{
      startTime: 0,
      endTime: targetDuration,
      speed: Math.round(clampedSpeed * 1000) / 1000,
    }],
  }
}

export function computeSpeedRampFilter(config: SpeedRampConfig): string {
  if (config.segments.length === 0) return 'setpts=PTS-STARTPTS'

  if (config.segments.length === 1) {
    const speed = config.segments[0].speed
    const ptsFactor = 1 / speed
    return `setpts=${ptsFactor.toFixed(4)}*PTS`
  }

  const parts: string[] = []

  for (const seg of config.segments) {
    const ptsFactor = 1 / seg.speed
    const startPts = seg.startTime
    const endPts = seg.endTime
    parts.push(
      `between(t\\,${startPts.toFixed(3)}\\,${endPts.toFixed(3)})*${ptsFactor.toFixed(4)}*PTS`,
    )
  }

  return `setpts=${parts.join('+')}`
}

export function shouldLoopClip(clipDuration: number, targetDuration: number): boolean {
  if (clipDuration <= 0 || targetDuration <= 0) return false
  const ratio = clipDuration / targetDuration
  return ratio < LOOP_THRESHOLD
}
