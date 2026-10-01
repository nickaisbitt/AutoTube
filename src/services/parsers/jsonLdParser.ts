export interface JsonLdMedia {
  url: string
  type: 'image' | 'video'
  width?: number
  height?: number
  thumbnail?: string
  duration?: string
}

export interface JsonLdVideo {
  url: string
  thumbnail?: string
  width?: number
  height?: number
  duration?: string
}

export function extractJsonLd(html: string): unknown[] {
  const results: unknown[] = []
  const regex = /<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let match: RegExpExecArray | null

  while ((match = regex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim())
      results.push(parsed)
    } catch {
      continue
    }
  }

  return results
}

function extractFromObject(obj: Record<string, unknown>): JsonLdMedia[] {
  const media: JsonLdMedia[] = []
  const type = obj['@type']

  if (type === 'VideoObject' || type === 'VideoObject') {
    const url = obj.contentUrl ?? obj.url ?? obj.embedUrl
    if (typeof url === 'string') {
      media.push({
        url,
        type: 'video',
        width: typeof obj.width === 'number' ? obj.width : undefined,
        height: typeof obj.height === 'number' ? obj.height : undefined,
        thumbnail: typeof obj.thumbnailUrl === 'string'
          ? obj.thumbnailUrl
          : Array.isArray(obj.thumbnailUrl) && typeof obj.thumbnailUrl[0] === 'string'
            ? obj.thumbnailUrl[0]
            : typeof obj.thumbnail === 'object' && obj.thumbnail !== null
              ? (obj.thumbnail as Record<string, unknown>).url as string | undefined
              : undefined,
        duration: typeof obj.duration === 'string' ? obj.duration : undefined,
      })
    }
  }

  if (type === 'ImageObject') {
    const url = obj.contentUrl ?? obj.url
    if (typeof url === 'string') {
      media.push({
        url,
        type: 'image',
        width: typeof obj.width === 'number' ? obj.width : undefined,
        height: typeof obj.height === 'number' ? obj.height : undefined,
      })
    }
  }

  if (type === 'Article' || type === 'NewsArticle' || type === 'BlogPosting' || type === 'WebPage') {
    const image = obj.image
    if (typeof image === 'string') {
      media.push({ url: image, type: 'image' })
    } else if (Array.isArray(image)) {
      for (const img of image) {
        if (typeof img === 'string') {
          media.push({ url: img, type: 'image' })
        } else if (img && typeof img === 'object') {
          const imgObj = img as Record<string, unknown>
          const imgUrl = imgObj.url ?? imgObj.contentUrl
          if (typeof imgUrl === 'string') {
            media.push({
              url: imgUrl,
              type: 'image',
              width: typeof imgObj.width === 'number' ? imgObj.width : undefined,
              height: typeof imgObj.height === 'number' ? imgObj.height : undefined,
            })
          }
        }
      }
    } else if (image && typeof image === 'object') {
      const imgObj = image as Record<string, unknown>
      const imgUrl = imgObj.url ?? imgObj.contentUrl
      if (typeof imgUrl === 'string') {
        media.push({
          url: imgUrl,
          type: 'image',
          width: typeof imgObj.width === 'number' ? imgObj.width : undefined,
          height: typeof imgObj.height === 'number' ? imgObj.height : undefined,
        })
      }
    }

    const video = obj.video
    if (Array.isArray(video)) {
      for (const v of video) {
        if (v && typeof v === 'object') {
          media.push(...extractFromObject(v as Record<string, unknown>))
        }
      }
    } else if (video && typeof video === 'object') {
      media.push(...extractFromObject(video as Record<string, unknown>))
    }
  }

  if (typeof obj.thumbnailUrl === 'string' && !media.some(m => m.url === obj.thumbnailUrl)) {
    if (type !== 'VideoObject' && type !== 'ImageObject') {
      media.push({ url: obj.thumbnailUrl, type: 'image' })
    }
  }

  return media
}

export function extractMediaFromJsonLd(jsonLd: unknown): JsonLdMedia[] {
  const media: JsonLdMedia[] = []

  if (!jsonLd || typeof jsonLd !== 'object') return media

  if (Array.isArray(jsonLd)) {
    for (const item of jsonLd) {
      media.push(...extractMediaFromJsonLd(item))
    }
    return media
  }

  const obj = jsonLd as Record<string, unknown>

  if (Array.isArray(obj['@graph'])) {
    for (const item of obj['@graph']) {
      if (item && typeof item === 'object') {
        media.push(...extractFromObject(item as Record<string, unknown>))
      }
    }
  } else {
    media.push(...extractFromObject(obj))
  }

  return media
}

export function extractVideoFromJsonLd(html: string): JsonLdVideo[] {
  const jsonLdBlocks = extractJsonLd(html)
  const videos: JsonLdVideo[] = []

  for (const block of jsonLdBlocks) {
    const allMedia = extractMediaFromJsonLd(block)
    for (const m of allMedia) {
      if (m.type === 'video') {
        videos.push({
          url: m.url,
          thumbnail: m.thumbnail,
          width: m.width,
          height: m.height,
          duration: m.duration,
        })
      }
    }
  }

  return videos
}
