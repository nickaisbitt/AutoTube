export const MEDIA_EXTENSIONS: { image: string[]; video: string[]; audio: string[] } = {
  image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg', 'bmp', 'tiff', 'tif', 'ico', 'heic', 'heif', 'jxl'],
  video: ['mp4', 'webm', 'ogg', 'ogv', 'avi', 'mov', 'wmv', 'flv', 'mkv', 'm4v', '3gp', '3g2', 'ts', 'mpg', 'mpeg', 'vob'],
  audio: ['mp3', 'wav', 'ogg', 'oga', 'flac', 'aac', 'm4a', 'wma', 'opus', 'aiff', 'aif', 'mid', 'midi'],
}

const ALL_EXTENSIONS = new Map<string, 'image' | 'video' | 'audio'>()

for (const ext of MEDIA_EXTENSIONS.image) {
  ALL_EXTENSIONS.set(ext, 'image')
}
for (const ext of MEDIA_EXTENSIONS.video) {
  ALL_EXTENSIONS.set(ext, 'video')
}
for (const ext of MEDIA_EXTENSIONS.audio) {
  ALL_EXTENSIONS.set(ext, 'audio')
}

function stripQueryAndFragment(url: string): string {
  const qIndex = url.indexOf('?')
  const fIndex = url.indexOf('#')
  let endIndex = url.length

  if (qIndex !== -1) endIndex = Math.min(endIndex, qIndex)
  if (fIndex !== -1) endIndex = Math.min(endIndex, fIndex)

  return url.slice(0, endIndex)
}

function getExtension(url: string): string | null {
  const clean = stripQueryAndFragment(url)
  const lastDot = clean.lastIndexOf('.')
  if (lastDot === -1) return null

  const ext = clean.slice(lastDot + 1).toLowerCase()
  if (ext.length === 0 || ext.length > 5) return null

  return ext
}

export function isMediaUrl(url: string): { isMedia: boolean; type?: 'image' | 'video' | 'audio'; extension?: string } {
  const ext = getExtension(url)
  if (!ext) return { isMedia: false }

  const type = ALL_EXTENSIONS.get(ext)
  if (!type) return { isMedia: false }

  return { isMedia: true, type, extension: ext }
}

export function extractMediaHrefs(html: string, baseUrl?: string): { url: string; type: 'image' | 'video' | 'audio'; extension: string }[] {
  const results: { url: string; type: 'image' | 'video' | 'audio'; extension: string }[] = []
  const regex = /<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi
  let match: RegExpExecArray | null

  while ((match = regex.exec(html)) !== null) {
    let href = match[1].trim()
    if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) continue

    if (baseUrl) {
      try {
        href = new URL(href, baseUrl).href
      } catch {
        continue
      }
    }

    const check = isMediaUrl(href)
    if (check.isMedia && check.type && check.extension) {
      results.push({
        url: href,
        type: check.type,
        extension: check.extension,
      })
    }
  }

  return results
}
