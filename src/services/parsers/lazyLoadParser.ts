export const LAZY_LOAD_ATTRIBUTES: string[] = [
  'data-src',
  'data-lazy',
  'data-original',
  'data-bg',
  'data-srcset',
  'data-lazy-src',
  'data-lazyload',
  'data-bg-url',
  'data-image',
  'data-hi-res-src',
]

export function extractLazyLoadFromElement(elementHtml: string): string | null {
  for (const attr of LAZY_LOAD_ATTRIBUTES) {
    const escaped = attr.replace(/-/g, '\\-')
    const regex = new RegExp(`${escaped}=["']([^"']+)["']`, 'i')
    const match = elementHtml.match(regex)
    if (match && match[1]) {
      const value = match[1].trim()
      if (value && value !== 'true' && value !== 'false' && value !== '1' && value !== '0') {
        return value
      }
    }
  }

  return null
}

export function extractLazyLoadUrls(html: string): string[] {
  const urls: string[] = []
  const seen = new Set<string>()

  const elementRegex = /<(?:img|div|span|section|figure|picture|a|li|article|header|main)\b[^>]*>/gi
  let match: RegExpExecArray | null

  while ((match = elementRegex.exec(html)) !== null) {
    const tag = match[0]
    const url = extractLazyLoadFromElement(tag)
    if (url && !seen.has(url)) {
      seen.add(url)
      urls.push(url)
    }
  }

  for (const attr of LAZY_LOAD_ATTRIBUTES) {
    const escaped = attr.replace(/-/g, '\\-')
    const regex = new RegExp(`${escaped}=["']([^"']+)["']`, 'gi')

    while ((match = regex.exec(html)) !== null) {
      const value = match[1].trim()
      if (value && !seen.has(value) && value !== 'true' && value !== 'false' && value !== '1' && value !== '0') {
        seen.add(value)
        urls.push(value)
      }
    }
  }

  return urls
}
