export interface OgVideo {
  url: string
  type?: string
  width?: number
  height?: number
}

export interface OgImage {
  url: string
  width?: number
  height?: number
}

function extractMetaContent(html: string, property: string): string[] {
  const results: string[] = []
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  const pattern1 = new RegExp(
    `<meta\\s+[^>]*?property=["']${escaped}["'][^>]*?content=["']([^"']+)["']`,
    'gi'
  )
  const pattern2 = new RegExp(
    `<meta\\s+[^>]*?content=["']([^"']+)["'][^>]*?property=["']${escaped}["']`,
    'gi'
  )

  let match: RegExpExecArray | null
  while ((match = pattern1.exec(html)) !== null) {
    results.push(match[1])
  }
  while ((match = pattern2.exec(html)) !== null) {
    if (!results.includes(match[1])) {
      results.push(match[1])
    }
  }

  return results
}

export function extractOgVideo(html: string): OgVideo[] {
  const videos: OgVideo[] = []

  const secureUrls = extractMetaContent(html, 'og:video:secure_url')
  const urls = extractMetaContent(html, 'og:video:url')
  const fallbackUrls = extractMetaContent(html, 'og:video')
  const types = extractMetaContent(html, 'og:video:type')
  const widths = extractMetaContent(html, 'og:video:width')
  const heights = extractMetaContent(html, 'og:video:height')

  const allUrls = [...secureUrls, ...urls.filter(u => !secureUrls.includes(u)), ...fallbackUrls.filter(u => !secureUrls.includes(u) && !urls.includes(u))]

  for (let i = 0; i < allUrls.length; i++) {
    const url = allUrls[i]
    if (url.startsWith('http') || url.startsWith('//')) {
      videos.push({
        url,
        type: types[i] ?? types[0],
        width: widths[i] ? parseInt(widths[i], 10) : (widths[0] ? parseInt(widths[0], 10) : undefined),
        height: heights[i] ? parseInt(heights[i], 10) : (heights[0] ? parseInt(heights[0], 10) : undefined),
      })
    }
  }

  return videos
}

export function extractOgImage(html: string): OgImage[] {
  const images: OgImage[] = []

  const urls = extractMetaContent(html, 'og:image')
  const secureUrls = extractMetaContent(html, 'og:image:secure_url')
  const widths = extractMetaContent(html, 'og:image:width')
  const heights = extractMetaContent(html, 'og:image:height')

  const allUrls = [...secureUrls, ...urls.filter(u => !secureUrls.includes(u))]

  for (let i = 0; i < allUrls.length; i++) {
    const url = allUrls[i]
    if (url.startsWith('http') || url.startsWith('//')) {
      images.push({
        url,
        width: widths[i] ? parseInt(widths[i], 10) : (widths[0] ? parseInt(widths[0], 10) : undefined),
        height: heights[i] ? parseInt(heights[i], 10) : (heights[0] ? parseInt(heights[0], 10) : undefined),
      })
    }
  }

  return images
}
