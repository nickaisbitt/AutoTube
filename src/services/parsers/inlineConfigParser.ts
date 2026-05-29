const MEDIA_KEYS = new Set([
  'src',
  'url',
  'video_url',
  'videoUrl',
  'media_url',
  'mediaUrl',
  'poster',
  'thumbnail',
  'thumbnailUrl',
  'thumbnail_url',
  'file',
  'file_url',
  'fileUrl',
  'source',
  'source_url',
  'sourceUrl',
  'contentUrl',
  'content_url',
  'embedUrl',
  'embed_url',
  'streamUrl',
  'stream_url',
  'hls_url',
  'hlsUrl',
  'dash_url',
  'dashUrl',
  'mp4_url',
  'mp4Url',
  'poster_url',
  'posterUrl',
  'image',
  'image_url',
  'imageUrl',
  'img',
  'img_url',
  'imgUrl',
])

const MEDIA_URL_PATTERN = /^https?:\/\/.+\.(mp4|webm|ogg|mp3|wav|m3u8|mpd|jpg|jpeg|png|gif|webp|avif|svg)(\?.*)?$/i

function tryParseJson(str: string): unknown | null {
  try {
    return JSON.parse(str)
  } catch {
    return null
  }
}

function extractObjectLiteral(scriptContent: string, pattern: RegExp): string[] {
  const results: string[] = []
  let match: RegExpExecArray | null

  while ((match = pattern.exec(scriptContent)) !== null) {
    const start = match.index + match[0].length
    let depth = 0
    let inString = false
    let stringChar = ''
    let i = start

    while (i < scriptContent.length) {
      const ch = scriptContent[i]

      if (inString) {
        if (ch === '\\') {
          i += 2
          continue
        }
        if (ch === stringChar) {
          inString = false
        }
      } else {
        if (ch === '"' || ch === "'" || ch === '`') {
          inString = true
          stringChar = ch
        } else if (ch === '{') {
          depth++
        } else if (ch === '}') {
          depth--
          if (depth === 0) {
            results.push(scriptContent.slice(start, i + 1))
            break
          }
        }
      }
      i++
    }
  }

  return results
}

export function extractInlineConfigs(html: string): Record<string, unknown>[] {
  const configs: Record<string, unknown>[] = []
  const scriptRegex = /<script\b(?![^>]*type=["']application\/ld\+json["'])[^>]*>([\s\S]*?)<\/script>/gi
  let scriptMatch: RegExpExecArray | null

  const assignmentPatterns = [
    /window\.__config\s*=\s*/g,
    /window\.__INITIAL_STATE__\s*=\s*/g,
    /window\.__data\s*=\s*/g,
    /window\.playerConfig\s*=\s*/g,
    /var\s+config\s*=\s*/g,
    /let\s+config\s*=\s*/g,
    /const\s+config\s*=\s*/g,
    /playerConfig\s*=\s*/g,
    /__NEXT_DATA__\s*=\s*/g,
    /window\.__NUXT__\s*=\s*/g,
    /window\.__PRELOADED_STATE__\s*=\s*/g,
    /window\.YT_INITIAL_PLAYER_RESPONSE\s*=\s*/g,
  ]

  while ((scriptMatch = scriptRegex.exec(html)) !== null) {
    const content = scriptMatch[1]

    for (const pattern of assignmentPatterns) {
      const regex = new RegExp(pattern.source, pattern.flags)
      const literals = extractObjectLiteral(content, regex)

      for (const literal of literals) {
        const parsed = tryParseJson(literal)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          configs.push(parsed as Record<string, unknown>)
        }
      }
    }
  }

  return configs
}

function findMediaUrls(obj: unknown, visited: Set<unknown>): string[] {
  const urls: string[] = []

  if (!obj || typeof obj !== 'object' || visited.has(obj)) return urls
  visited.add(obj)

  if (Array.isArray(obj)) {
    for (const item of obj) {
      urls.push(...findMediaUrls(item, visited))
    }
    return urls
  }

  const record = obj as Record<string, unknown>

  for (const [key, value] of Object.entries(record)) {
    if (typeof value === 'string') {
      if (MEDIA_KEYS.has(key) && (value.startsWith('http') || value.startsWith('//'))) {
        urls.push(value)
      } else if (MEDIA_URL_PATTERN.test(value)) {
        urls.push(value)
      }
    } else if (typeof value === 'object' && value !== null) {
      urls.push(...findMediaUrls(value, visited))
    }
  }

  return urls
}

export function extractMediaFromConfigs(configs: Record<string, unknown>[]): string[] {
  const urls: string[] = []
  const seen = new Set<string>()
  const visited = new Set<unknown>()

  for (const config of configs) {
    const found = findMediaUrls(config, visited)
    for (const url of found) {
      if (!seen.has(url)) {
        seen.add(url)
        urls.push(url)
      }
    }
  }

  return urls
}

export function extractNextData(html: string): unknown | null {
  const regex = /<script\s+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/gi
  const match = regex.exec(html)

  if (!match) return null

  try {
    return JSON.parse(match[1].trim())
  } catch {
    return null
  }
}
