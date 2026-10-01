export interface ThumbnailVariant {
  imageUrl: string
  textOverlay: string
  colorScheme: string
  contrastScore: number
  saliencyScore: number
  predictedCTR: number
}

export function computeContrastScore(imageData: Uint8ClampedArray, w: number, h: number): number {
  if (imageData.length === 0 || w === 0 || h === 0) return 0

  const gridCols = 16
  const gridRows = 16
  const cellW = Math.max(1, Math.floor(w / gridCols))
  const cellH = Math.max(1, Math.floor(h / gridRows))
  const luminances: number[] = []

  for (let gy = 0; gy < gridRows; gy++) {
    for (let gx = 0; gx < gridCols; gx++) {
      let sum = 0
      let count = 0
      const startX = gx * cellW
      const startY = gy * cellH
      const endX = Math.min(startX + cellW, w)
      const endY = Math.min(startY + cellH, h)

      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          const idx = (y * w + x) * 4
          if (idx + 2 >= imageData.length) continue
          const r = imageData[idx]
          const g = imageData[idx + 1]
          const b = imageData[idx + 2]
          sum += 0.2126 * r + 0.7152 * g + 0.0722 * b
          count++
        }
      }

      luminances.push(count > 0 ? sum / count : 0)
    }
  }

  if (luminances.length === 0) return 0

  const mean = luminances.reduce((a, b) => a + b, 0) / luminances.length
  const variance = luminances.reduce((a, b) => a + (b - mean) ** 2, 0) / luminances.length
  const maxVariance = 255 * 255 / 4
  const normalized = Math.min(100, (variance / maxVariance) * 100)

  return Math.round(normalized * 100) / 100
}

export function computeSaliencyScore(imageData: Uint8ClampedArray, w: number, h: number): number {
  if (imageData.length === 0 || w === 0 || h === 0) return 0

  const gridCols = 16
  const gridRows = 16
  const cellW = Math.max(1, Math.floor(w / gridCols))
  const cellH = Math.max(1, Math.floor(h / gridRows))

  interface RegionColor { r: number; g: number; b: number }
  const regions: RegionColor[] = []

  let totalR = 0
  let totalG = 0
  let totalB = 0
  let totalRegions = 0

  for (let gy = 0; gy < gridRows; gy++) {
    for (let gx = 0; gx < gridCols; gx++) {
      let rSum = 0
      let gSum = 0
      let bSum = 0
      let count = 0
      const startX = gx * cellW
      const startY = gy * cellH
      const endX = Math.min(startX + cellW, w)
      const endY = Math.min(startY + cellH, h)

      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          const idx = (y * w + x) * 4
          if (idx + 2 >= imageData.length) continue
          rSum += imageData[idx]
          gSum += imageData[idx + 1]
          bSum += imageData[idx + 2]
          count++
        }
      }

      if (count > 0) {
        const region = { r: rSum / count, g: gSum / count, b: bSum / count }
        regions.push(region)
        totalR += region.r
        totalG += region.g
        totalB += region.b
        totalRegions++
      }
    }
  }

  if (totalRegions === 0) return 0

  const avgR = totalR / totalRegions
  const avgG = totalG / totalRegions
  const avgB = totalB / totalRegions

  let deviationSum = 0

  for (const region of regions) {
    const dr = region.r - avgR
    const dg = region.g - avgG
    const db = region.b - avgB
    deviationSum += Math.sqrt(dr * dr + dg * dg + db * db)
  }

  const avgDeviation = deviationSum / regions.length
  const maxDeviation = Math.sqrt(3 * 255 * 255)
  const normalized = Math.min(100, (avgDeviation / maxDeviation) * 100 * 3)

  return Math.round(normalized * 100) / 100
}

function computeColorWarmth(colorScheme: string): number {
  const warmColors = ['red', 'orange', 'yellow', '#ff', '#f0', '#e0', '#d0', 'warm', 'fire', 'sunset']
  const lower = colorScheme.toLowerCase()
  let warmth = 0.3

  for (const warm of warmColors) {
    if (lower.includes(warm)) {
      warmth += 0.15
    }
  }

  const hexMatch = colorScheme.match(/#([0-9a-f]{6})/i)
  if (hexMatch) {
    const r = parseInt(hexMatch[1].substring(0, 2), 16)
    const g = parseInt(hexMatch[1].substring(2, 4), 16)
    const b = parseInt(hexMatch[1].substring(4, 6), 16)
    if (r > g && r > b) warmth += 0.2
    if (r > 200 && g > 100 && b < 100) warmth += 0.2
  }

  return Math.min(1, warmth)
}

export function predictCTR(variant: ThumbnailVariant): number {
  const contrastComponent = (variant.contrastScore / 100) * 0.3
  const saliencyComponent = (variant.saliencyScore / 100) * 0.3

  const wordCount = variant.textOverlay.trim().split(/\s+/).filter(Boolean).length
  let textScore: number
  if (wordCount >= 2 && wordCount <= 4) {
    textScore = 1.0
  } else if (wordCount === 1 || wordCount === 5) {
    textScore = 0.6
  } else if (wordCount === 0) {
    textScore = 0.2
  } else {
    textScore = Math.max(0.1, 1.0 - (wordCount - 4) * 0.15)
  }
  const textComponent = textScore * 0.2

  const warmth = computeColorWarmth(variant.colorScheme)
  const warmthComponent = warmth * 0.2

  const ctr = (contrastComponent + saliencyComponent + textComponent + warmthComponent) * 100

  return Math.round(Math.min(100, Math.max(0, ctr)) * 100) / 100
}

function shiftHue(imageData: Uint8ClampedArray, _w: number, _h: number, hueShift: number): Uint8ClampedArray {
  const result = new Uint8ClampedArray(imageData.length)

  for (let i = 0; i < imageData.length; i += 4) {
    const r = imageData[i] / 255
    const g = imageData[i + 1] / 255
    const b = imageData[i + 2] / 255
    const a = imageData[i + 3]

    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const l = (max + min) / 2
    let hue = 0
    let s = 0

    if (max !== min) {
      const d = max - min
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

      if (max === r) hue = ((g - b) / d + (g < b ? 6 : 0)) / 6
      else if (max === g) hue = ((b - r) / d + 2) / 6
      else hue = ((r - g) / d + 4) / 6
    }

    hue = (hue + hueShift) % 1
    if (hue < 0) hue += 1

    const hue2rgb = (p: number, q: number, t: number): number => {
      let tAdj = t
      if (tAdj < 0) tAdj += 1
      if (tAdj > 1) tAdj -= 1
      if (tAdj < 1 / 6) return p + (q - p) * 6 * tAdj
      if (tAdj < 1 / 2) return q
      if (tAdj < 2 / 3) return p + (q - p) * (2 / 3 - tAdj) * 6
      return p
    }

    let newR: number
    let newG: number
    let newB: number

    if (s === 0) {
      newR = l
      newG = l
      newB = l
    } else {
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s
      const p = 2 * l - q
      newR = hue2rgb(p, q, hue + 1 / 3)
      newG = hue2rgb(p, q, hue)
      newB = hue2rgb(p, q, hue - 1 / 3)
    }

    result[i] = Math.round(newR * 255)
    result[i + 1] = Math.round(newG * 255)
    result[i + 2] = Math.round(newB * 255)
    result[i + 3] = a
  }

  return result
}

export function generateABVariants(
  baseImageData: Uint8ClampedArray,
  w: number,
  h: number,
  title: string,
): ThumbnailVariant[] {
  const words = title.trim().split(/\s+/).filter(Boolean)
  const shortText = words.slice(0, 3).join(' ')
  const altText = words.slice(0, 4).join(' ')

  const warmShifted = shiftHue(baseImageData, w, h, -0.05)
  const coolShifted = shiftHue(baseImageData, w, h, 0.15)

  const variantA: ThumbnailVariant = {
    imageUrl: '',
    textOverlay: shortText || 'Watch Now',
    colorScheme: 'warm_red_orange',
    contrastScore: 0,
    saliencyScore: 0,
    predictedCTR: 0,
  }
  variantA.contrastScore = computeContrastScore(warmShifted, w, h)
  variantA.saliencyScore = computeSaliencyScore(warmShifted, w, h)
  variantA.predictedCTR = predictCTR(variantA)

  const variantB: ThumbnailVariant = {
    imageUrl: '',
    textOverlay: altText || 'Watch Now',
    colorScheme: 'cool_blue_cyan',
    contrastScore: 0,
    saliencyScore: 0,
    predictedCTR: 0,
  }
  variantB.contrastScore = computeContrastScore(coolShifted, w, h)
  variantB.saliencyScore = computeSaliencyScore(coolShifted, w, h)
  variantB.predictedCTR = predictCTR(variantB)

  return [variantA, variantB]
}
