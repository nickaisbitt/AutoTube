export function computePHash(
  imageData: Uint8ClampedArray,
  w: number,
  h: number,
): string {
  const size = 8;
  const grayscale = new Float64Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const srcX0 = Math.floor((x / size) * w);
      const srcX1 = Math.floor(((x + 1) / size) * w);
      const srcY0 = Math.floor((y / size) * h);
      const srcY1 = Math.floor(((y + 1) / size) * h);

      let sum = 0;
      let count = 0;

      for (let sy = srcY0; sy < srcY1; sy++) {
        for (let sx = srcX0; sx < srcX1; sx++) {
          const idx = (sy * w + sx) * 4;
          sum += 0.299 * imageData[idx] + 0.587 * imageData[idx + 1] + 0.114 * imageData[idx + 2];
          count++;
        }
      }

      grayscale[y * size + x] = count > 0 ? sum / count : 0;
    }
  }

  let totalSum = 0;
  for (let i = 0; i < size * size; i++) {
    totalSum += grayscale[i];
  }
  const mean = totalSum / (size * size);

  let bits = 0n;
  for (let i = 0; i < size * size; i++) {
    bits <<= 1n;
    if (grayscale[i] > mean) {
      bits |= 1n;
    }
  }

  return bits.toString(16).padStart(16, '0');
}

export function hammingDistance(hash1: string, hash2: string): number {
  const len = Math.max(hash1.length, hash2.length);
  const h1 = hash1.padStart(len, '0');
  const h2 = hash2.padStart(len, '0');

  let distance = 0;

  for (let i = 0; i < len; i++) {
    const b1 = parseInt(h1[i], 16);
    const b2 = parseInt(h2[i], 16);
    let xor = b1 ^ b2;

    while (xor > 0) {
      distance += xor & 1;
      xor >>= 1;
    }
  }

  return distance;
}

export function isDuplicate(
  hash1: string,
  hash2: string,
  threshold: number = 10,
): boolean {
  return hammingDistance(hash1, hash2) <= threshold;
}

export class PhashRegistry {
  private entries: Map<string, string> = new Map();

  register(hash: string, url: string): void {
    this.entries.set(hash, url);
  }

  findDuplicate(hash: string, threshold: number = 10): string | null {
    for (const [existingHash, url] of this.entries) {
      if (hammingDistance(hash, existingHash) <= threshold) {
        return url;
      }
    }
    return null;
  }

  size(): number {
    return this.entries.size;
  }
}
