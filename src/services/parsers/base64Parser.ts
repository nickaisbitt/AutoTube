export interface Base64Image {
  data: string
  mimeType: string
}

export interface Base64Buffer {
  buffer: Buffer
  mimeType: string
}

export function extractBase64Images(html: string): Base64Image[] {
  const results: Base64Image[] = []
  const regex = /data:image\/([a-zA-Z0-9+.-]+);base64,([A-Za-z0-9+/=\s]+)/gi
  let match: RegExpExecArray | null

  while ((match = regex.exec(html)) !== null) {
    const mimeType = `image/${match[1]}`
    const data = match[2].replace(/\s/g, '')
    results.push({ data, mimeType })
  }

  return results
}

export function isValidBase64Image(data: string, minSize?: number): boolean {
  const threshold = minSize ?? 1024

  try {
    const cleanData = data.includes(',') ? data.split(',')[1] : data
    const buffer = Buffer.from(cleanData, 'base64')

    if (buffer.length < threshold) return false

    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return true
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return true
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return true
    if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) return true
    if (buffer[0] === 0x42 && buffer[1] === 0x4D) return true
    if (buffer.length >= 12 && buffer[0] === 0x00 && buffer[1] === 0x00 && buffer[2] === 0x00 && (buffer[3] === 0x0C || buffer[3] === 0x14) && buffer[4] === 0x4A && buffer[5] === 0x58 && buffer[6] === 0x4C && buffer[7] === 0x20) return true
    if (buffer[0] === 0x3C && buffer[1] === 0x73 && buffer[2] === 0x76) return true

    return buffer.length >= threshold
  } catch {
    return false
  }
}

export function base64ToBuffer(dataUri: string): Base64Buffer | null {
  try {
    const match = dataUri.match(/^data:([^;,]+)(?:;base64)?,(.*)$/)
    if (!match) return null

    const mimeType = match[1]
    const encoded = match[2]

    const isBase64 = dataUri.includes(';base64,')
    const buffer = isBase64
      ? Buffer.from(encoded, 'base64')
      : Buffer.from(decodeURIComponent(encoded))

    return { buffer, mimeType }
  } catch {
    return null
  }
}
