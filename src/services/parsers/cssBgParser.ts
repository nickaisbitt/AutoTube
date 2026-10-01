export function resolveCssUrl(url: string, baseUrl: string): string {
  const trimmed = url.trim()
  if (!trimmed) return trimmed

  if (trimmed.startsWith('data:') || trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('//')) {
    return trimmed
  }

  try {
    return new URL(trimmed, baseUrl).href
  } catch {
    return trimmed
  }
}

function extractUrlValues(cssValue: string): string[] {
  const urls: string[] = []
  const regex = /url\(\s*["']?([^"')]+)["']?\s*\)/gi
  let match: RegExpExecArray | null

  while ((match = regex.exec(cssValue)) !== null) {
    const url = match[1].trim()
    if (url && !url.startsWith('data:')) {
      urls.push(url)
    }
  }

  return urls
}

export function extractCssBgImages(html: string): string[] {
  const urls: string[] = []
  const seen = new Set<string>()

  const inlineStyleRegex = /style=["']([^"']*background-image\s*:[^"']*)["']/gi
  let match: RegExpExecArray | null

  while ((match = inlineStyleRegex.exec(html)) !== null) {
    const styleValue = match[1]
    const extracted = extractUrlValues(styleValue)
    for (const url of extracted) {
      if (!seen.has(url)) {
        seen.add(url)
        urls.push(url)
      }
    }
  }

  const styleBlockRegex = /<style\b[^>]*>([\s\S]*?)<\/style>/gi

  while ((match = styleBlockRegex.exec(html)) !== null) {
    const block = match[1]
    const bgRegex = /background(?:-image)?\s*:[^;]*url\(\s*["']?([^"')]+)["']?\s*\)/gi
    let bgMatch: RegExpExecArray | null

    while ((bgMatch = bgRegex.exec(block)) !== null) {
      const url = bgMatch[1].trim()
      if (url && !url.startsWith('data:') && !seen.has(url)) {
        seen.add(url)
        urls.push(url)
      }
    }
  }

  const cssInJsRegex = /(?:background(?:Image)?|bgImage|bg)\s*[:=]\s*["'`]([^"'`]*url\([^"'`]*\)[^"'`]*)["'`]/gi

  while ((match = cssInJsRegex.exec(html)) !== null) {
    const extracted = extractUrlValues(match[1])
    for (const url of extracted) {
      if (!seen.has(url)) {
        seen.add(url)
        urls.push(url)
      }
    }
  }

  const templateLiteralRegex = /url\(\s*["']?([^"')]+)["']?\s*\)/gi

  while ((match = templateLiteralRegex.exec(html)) !== null) {
    const url = match[1].trim()
    if (url && !url.startsWith('data:') && !seen.has(url)) {
      const isInsideStyle = /(?:style=["']|<style|background)/i.test(html.slice(Math.max(0, match.index - 200), match.index))
      if (isInsideStyle) {
        seen.add(url)
        urls.push(url)
      }
    }
  }

  return urls
}
