import type { SourceProvider, SourceProviderConfig } from './types';
import type { MediaCandidate } from '../media';

export class DeepHarvestProvider implements SourceProvider {
  readonly name = 'Deep Web Harvest';
  readonly requiresKey = false;

  isAvailable(): boolean {
    return true;
  }

  async search(query: string, config: SourceProviderConfig): Promise<MediaCandidate[]> {
    if (config.signal?.aborted) return [];

    try {
      const url = `/api/deep-harvest?q=${encodeURIComponent(query)}`;
      const res = await fetch(url, { signal: config.signal });

      if (!res.ok) {
        console.warn(`[DeepHarvest] HTTP ${res.status} for "${query}"`);
        return [];
      }

      const data = await res.json() as {
        images: Array<{
          url: string;
          alt?: string;
          title?: string;
          caption?: string;
          width?: number;
          height?: number;
          position: string;
          sourceUrl: string;
          sourceDomain: string;
          score: number;
        }>;
      };

      if (!data.images || data.images.length === 0) {
        console.log(`[DeepHarvest] No images found for "${query}"`);
        return [];
      }

      console.log(`[DeepHarvest] Found ${data.images.length} images for "${query}"`);

      return data.images.map((img) => ({
        url: img.url,
        alt: img.alt || img.title || img.caption || query,
        source: `Deep Harvest (${img.sourceDomain})`,
        baseScore: Math.min(200, img.score + 50),
        query,
        finalScore: 0,
        type: 'image' as const,
        width: img.width,
        height: img.height,
        sourceUrl: img.sourceUrl,
      }));
    } catch (err) {
      console.warn(`[DeepHarvest] Error for "${query}":`, err);
      return [];
    }
  }
}
