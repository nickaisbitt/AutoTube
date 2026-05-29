export interface SrcsetEntry {
  url: string
  width?: number
  density?: number
}

export function parseSrcset(srcset: string): SrcsetEntry[] {
  const entries: SrcsetEntry[] = []
  const parts = srcset.split(',').map(s => s.trim()).filter(Boolean)

  for (const part of parts) {
    const tokens = part.split(/\s+/)
    if (tokens.length === 0) continue

    const url = tokens[0]
    if (!url) continue

    const entry: SrcsetEntry = { url }

    if (tokens.length >= 2) {
      const descriptor = tokens[tokens.length - 1]
      const widthMatch = descriptor.match(/^(\d+)w$/)
      const densityMatch = descriptor.match(/^(\d+(?:\.\d+)?)x$/)

      if (widthMatch) {
        entry.width = parseInt(widthMatch[1], 10)
      } else if (densityMatch) {
        entry.density = parseFloat(densityMatch[1])
      }
    }

    entries.push(entry)
  }

  return entries
}

export function getLargestFromSrcset(srcset: string, minWidth?: number): string | null {
  const entries = parseSrcset(srcset)
  if (entries.length === 0) return null

  const threshold = minWidth ?? 1200

  const withWidth = entries.filter((e): e is SrcsetEntry & { width: number } => e.width !== undefined)

  if (withWidth.length > 0) {
    withWidth.sort((a, b) => b.width - a.width)
    const best = withWidth.find(e => e.width >= threshold)
    return (best ?? withWidth[0]).url
  }

  const withDensity = entries.filter((e): e is SrcsetEntry & { density: number } => e.density !== undefined)
  if (withDensity.length > 0) {
    withDensity.sort((a, b) => b.density - a.density)
    return withDensity[0].url
  }

  return entries[entries.length - 1].url
}

export function extractSrcsetFromHtml(html: string): string[] {
  const results: string[] = []
  const regex = /srcset=["']([^"']+)["']/gi
  let match: RegExpExecArray | null

  while ((match = regex.exec(html)) !== null) {
    const best = getLargestFromSrcset(match[1])
    if (best) {
      results.push(best)
    }
  }

  return results
}
