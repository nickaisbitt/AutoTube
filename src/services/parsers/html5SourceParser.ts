export interface VideoSource {
  url: string
  type?: string
  quality?: string
}

export interface AudioSource {
  url: string
  type?: string
}

function extractQuality(tag: string): string | undefined {
  const labelMatch = tag.match(/label=["']([^"']+)["']/i)
  if (labelMatch) return labelMatch[1]

  const resMatch = tag.match(/(?:res|resolution|quality)=["']?(\d+p?)/i)
  if (resMatch) return resMatch[1]

  const sizeMatch = tag.match(/data-size=["'](\d+x\d+)["']/i)
  if (sizeMatch) return sizeMatch[1]

  return undefined
}

function parseSourceTag(tag: string): { src: string; type?: string; quality?: string } | null {
  const srcMatch = tag.match(/src=["']([^"']+)["']/i)
  if (!srcMatch) return null

  const typeMatch = tag.match(/type=["']([^"']+)["']/i)
  const quality = extractQuality(tag)

  return {
    src: srcMatch[1],
    type: typeMatch?.[1],
    quality,
  }
}

export function extractVideoSources(html: string): VideoSource[] {
  const sources: VideoSource[] = []

  const videoRegex = /<video\b[^>]*>[\s\S]*?<\/video>|<video\b[^>]*\/>/gi
  let videoMatch: RegExpExecArray | null

  while ((videoMatch = videoRegex.exec(html)) !== null) {
    const videoBlock = videoMatch[0]

    const videoSrc = parseSourceTag(videoBlock)
    if (videoSrc) {
      sources.push({ url: videoSrc.src, type: videoSrc.type, quality: videoSrc.quality })
    }

    const sourceRegex = /<source\b[^>]*\/?>/gi
    let sourceMatch: RegExpExecArray | null

    while ((sourceMatch = sourceRegex.exec(videoBlock)) !== null) {
      const parsed = parseSourceTag(sourceMatch[0])
      if (parsed) {
        sources.push({ url: parsed.src, type: parsed.type, quality: parsed.quality })
      }
    }
  }

  const standaloneSourceRegex = /<source\b[^>]*\/?>/gi
  let standaloneMatch: RegExpExecArray | null
  const seenUrls = new Set(sources.map(s => s.url))

  while ((standaloneMatch = standaloneSourceRegex.exec(html)) !== null) {
    const parsed = parseSourceTag(standaloneMatch[0])
    if (parsed && !seenUrls.has(parsed.src)) {
      const type = parsed.type ?? ''
      if (type.startsWith('video/') || type === '') {
        sources.push({ url: parsed.src, type: parsed.type, quality: parsed.quality })
        seenUrls.add(parsed.src)
      }
    }
  }

  return sources
}

export function extractAudioSources(html: string): AudioSource[] {
  const sources: AudioSource[] = []

  const audioRegex = /<audio\b[^>]*>[\s\S]*?<\/audio>|<audio\b[^>]*\/>/gi
  let audioMatch: RegExpExecArray | null

  while ((audioMatch = audioRegex.exec(html)) !== null) {
    const audioBlock = audioMatch[0]

    const audioSrc = parseSourceTag(audioBlock)
    if (audioSrc) {
      sources.push({ url: audioSrc.src, type: audioSrc.type })
    }

    const sourceRegex = /<source\b[^>]*\/?>/gi
    let sourceMatch: RegExpExecArray | null

    while ((sourceMatch = sourceRegex.exec(audioBlock)) !== null) {
      const parsed = parseSourceTag(sourceMatch[0])
      if (parsed) {
        sources.push({ url: parsed.src, type: parsed.type })
      }
    }
  }

  return sources
}

export function selectBestSource(sources: VideoSource[]): string | null {
  if (sources.length === 0) return null
  if (sources.length === 1) return sources[0].url

  const typePriority = (type?: string): number => {
    if (!type) return 0
    if (type.includes('mp4')) return 3
    if (type.includes('webm')) return 2
    if (type.includes('ogg')) return 1
    return 0
  }

  const qualityPriority = (quality?: string): number => {
    if (!quality) return 0
    const match = quality.match(/(\d+)/)
    if (!match) return 0
    const res = parseInt(match[1], 10)
    if (res >= 2160) return 5
    if (res >= 1440) return 4
    if (res >= 1080) return 3
    if (res >= 720) return 2
    if (res >= 480) return 1
    return 0
  }

  const sorted = [...sources].sort((a, b) => {
    const qDiff = qualityPriority(b.quality) - qualityPriority(a.quality)
    if (qDiff !== 0) return qDiff
    return typePriority(b.type) - typePriority(a.type)
  })

  return sorted[0].url
}
