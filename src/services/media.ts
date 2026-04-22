// ============================================================================
// Media Harvester — Zero-Cost Pro Acquisition Pipeline (Observability 4.1)
// ============================================================================

import type {
  MediaAsset,
  ScriptSegment,
  SegmentVisualPlan,
  TopicContext,
  AppConfig,
} from '../types';
import { resolveTopicContext } from './visualPlanner';
import { logger } from './logger';

// ---------------------------------------------------------------------------
// Candidate type
// ---------------------------------------------------------------------------

export interface MediaCandidate {
  url: string;
  thumbnailUrl?: string;
  alt: string;
  source: string;
  sourceUrl?: string;
  width?: number;
  height?: number;
  baseScore: number;
  query: string;
  finalScore: number;
  type: 'image' | 'video';
}

// ---------------------------------------------------------------------------
// Advanced Scorer 2.0
// ---------------------------------------------------------------------------

function scoreCandidate(c: MediaCandidate, _topicContext: TopicContext, visualConcept?: string): number {
  let score = c.baseScore;

  // 1. Keyword Relevance
  const meta = (c.alt + ' ' + (c.sourceUrl || '')).toLowerCase();
  const queryWords = c.query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  for (const w of queryWords) {
    if (meta.includes(w)) score += 25;
  }

  // 2. Vibe Match
  if (visualConcept) {
    const vibeWords = visualConcept.toLowerCase().split(/[,\s]+/).filter(w => w.length > 3);
    for (const w of vibeWords) {
      if (meta.includes(w)) score += 15;
    }
  }

  // 3. Source Authority
  const highTrust = ['reuters', 'apnews', 'bloomberg', 'nytimes', 'wsj', 'cnn', 'bbc', 'theguardian', 'cnbc', 'forbes', 'getty', 'shutterstock', 'adobe', 'alamy'];
  const src = (c.sourceUrl || '').toLowerCase();
  if (highTrust.some(d => src.includes(d))) score += 100;
  
  if (c.source.includes('Pexels')) score += 30;
  if (c.source.includes('Google News')) score += 60;
  if (c.source.includes('DuckDuckGo')) score += 50;
  if (c.source === 'Wikimedia Commons') score += 80; // Highly preferred for educational content

  // 4. Resolution & Aspect Ratio
  if (c.width && c.height) {
    const ratio = c.width / c.height;
    if (ratio > 1.3 && ratio < 1.9) score += 30;
    if (ratio < 0.9) score -= 150;

    const pixels = c.width * c.height;
    if (pixels >= 1920 * 1080) score += 40;
    if (pixels < 640 * 480) score -= 80;
  }

  return score;
}

// ---------------------------------------------------------------------------
// Zero-Cost Harvesters
// ---------------------------------------------------------------------------

/**
 * Level 1: Local DDG Scraper (100% Free, High Intent)
 */
async function searchDDGLocal(query: string): Promise<MediaCandidate[]> {
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    if (!res.ok) {
      logger.warn('DDG Scraper', `Proxy search failed for "${query}" (Status: ${res.status})`);
      return [];
    }
    const data = await res.json();
    if (!data.results || !Array.isArray(data.results)) return [];

    const candidates: MediaCandidate[] = data.results.map((img: any) => {
      try {
        const hostname = img.url ? new URL(img.url).hostname : 'unknown';
        return {
          url: img.image,
          thumbnailUrl: img.thumbnail,
          alt: img.title || query,
          source: `DuckDuckGo · ${hostname}`,
          sourceUrl: img.url,
          width: img.width,
          height: img.height,
          baseScore: 180,
          query,
          finalScore: 0,
          type: 'image'
        };
      } catch {
        return null;
      }
    }).filter(Boolean) as MediaCandidate[];

    logger.info('DDG Scraper', `Found ${candidates.length} free images for "${query}"`);
    return candidates;
  } catch (err) {
    logger.error('DDG Scraper', `Exception for "${query}"`, err);
    return [];
  }
}

/**
 * Level 2: Wikimedia Commons (100% Free, High Authority)
 */
async function searchWikimedia(query: string): Promise<MediaCandidate[]> {
  try {
    const url = `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=10&gsrnamespace=6&iiprop=url|size|extlinks&origin=*`;
    const res = await fetch(url);
    if (!res.ok) return [];
    
    const data = await res.json();
    if (!data.query || !data.query.pages) return [];

    const candidates: MediaCandidate[] = Object.values(data.query.pages).map((page: any) => {
      const info = page.imageinfo?.[0];
      if (!info || !info.url) return null;
      return {
        url: info.url,
        alt: page.title || query,
        source: 'Wikimedia Commons',
        sourceUrl: info.descriptionshorturl || info.url,
        width: info.width,
        height: info.height,
        baseScore: 160,
        query,
        finalScore: 0,
        type: 'image'
      };
    }).filter(Boolean) as MediaCandidate[];

    logger.info('Wikimedia', `Found ${candidates.length} free assets for "${query}"`);
    return candidates;
  } catch (err) {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Existing Source Wrappers
// ---------------------------------------------------------------------------

async function searchFirecrawl(query: string, config: AppConfig, count = 5): Promise<MediaCandidate[]> {
  if (!config.firecrawlKey) return [];
  try {
    // Attempt V2 Search if possible, else fallback to scraping
    const res = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: { "Authorization": `Bearer ${config.firecrawlKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, limit: count, sources: ["images"] })
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.success || !data.data) return [];
    
    const candidates: MediaCandidate[] = [];
    // Handle V2 "images" response or V1 "data[].images" response
    const results = data.data.images || data.data;
    for (const item of results) {
       if (item.imageUrl) {
         candidates.push({ url: item.imageUrl, alt: item.title || query, source: `Firecrawl Search`, sourceUrl: item.url, baseScore: 190, query, finalScore: 0, type: 'image' });
       }
    }
    return candidates;
  } catch { return []; }
}

async function searchSerper(query: string, config: AppConfig, type: 'images' | 'news' | 'videos'): Promise<MediaCandidate[]> {
  if (!config.serperKey) return [];
  try {
    const res = await fetch(`https://google.serper.dev/${type}`, {
      method: 'POST',
      headers: { 'X-API-KEY': config.serperKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, num: 20 }),
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (type === 'images') {
      return (data.images || []).map((img: any) => ({ url: img.imageUrl, alt: img.title || query, source: `Google · ${img.source || 'Web'}`, sourceUrl: img.link, width: img.width, height: img.height, baseScore: 150, query, finalScore: 0, type: 'image' }));
    }
    return [];
  } catch { return []; }
}

async function searchPexels(query: string, apiKey: string, type: 'images' | 'videos'): Promise<MediaCandidate[]> {
  if (!apiKey) return [];
  try {
    const endpoint = type === 'images' ? 'v1/search' : 'videos/search';
    const res = await fetch(`https://api.pexels.com/${endpoint}?query=${encodeURIComponent(query)}&per_page=15`, { headers: { Authorization: apiKey } });
    if (!res.ok) return [];
    const data = await res.json();
    if (type === 'images') {
      return (data.photos || []).map((p: any) => ({ url: p.src.large2x || p.src.original, alt: p.alt || query, source: 'Pexels Stock', sourceUrl: p.url, width: p.width, height: p.height, baseScore: 140, query, finalScore: 0, type: 'image' }));
    } else {
      return (data.videos || []).filter((v: any) => v.video_files?.length > 0).map((v: any) => ({ url: v.video_files[0].link, thumbnailUrl: v.image, alt: query, source: 'Pexels Footage', sourceUrl: v.url, width: v.width, height: v.height, baseScore: 190, query, finalScore: 0, type: 'video' }));
    }
  } catch { return []; }
}

// ---------------------------------------------------------------------------
// Cascading Resilience Engine 4.1
// ---------------------------------------------------------------------------

const usedUrlsMap = new Map<string, number>();

export function resetUsedUrlsMap() {
  usedUrlsMap.clear();
}

async function harvestMediaWithSafetyNet(
  query: string,
  topicContext: TopicContext,
  config: AppConfig,
  visualConcept?: string,
  depth = 0,
  trace: string[] = []
): Promise<{ candidates: MediaCandidate[], trace: string[] }> {
  
  trace.push(`[S${depth+1}] Query: "${query}"`);
  
  const tasks: Promise<MediaCandidate[]>[] = [
    searchDDGLocal(query),     // FREE #1
    searchWikimedia(query),    // FREE #2
  ];

  // Only add paid sources as fallbacks if free results are sparse
  const results = await Promise.all(tasks);
  let candidates = results.flat();

  if (candidates.length < 5) {
     trace.push(`[S${depth+1}] Insufficient free results. Triggering fallbacks...`);
     const fallbacks = await Promise.all([
       searchFirecrawl(query, config),
       searchSerper(query, config, 'images'), // Still kept as secondary
       searchPexels(query, config.pexelsKey, 'images')
     ]);
     candidates.push(...fallbacks.flat());
  }

  const scored = candidates.map(c => ({
    ...c,
    finalScore: scoreCandidate(c, topicContext, visualConcept)
  })).sort((a, b) => b.finalScore - a.finalScore);

  return { candidates: scored, trace };
}

export async function sourceSegmentMedia(
  segment: ScriptSegment,
  plan: SegmentVisualPlan,
  topicContext: TopicContext,
  _usedUrls: Set<string>,
  segmentIndex: number,
  config: AppConfig,
): Promise<{ assets: Omit<MediaAsset, 'id' | 'segmentId'>[]; plan: SegmentVisualPlan; segmentId: string }> {
  
  const finalAssets: Omit<MediaAsset, 'id' | 'segmentId'>[] = [];
  const shotsToHarvest = plan.shots && plan.shots.length > 0 
    ? plan.shots 
    : [{ concept: plan.visualAction, queries: plan.queries, vibe: plan.visualConcept }];

  for (let i = 0; i < shotsToHarvest.length; i++) {
    const shot = shotsToHarvest[i];
    const shotType = i === 0 ? 'primary' : 'secondary';
    const query = shot.queries[0] || segment.title;
    
    const { candidates, trace } = await harvestMediaWithSafetyNet(query, topicContext, config, shot.vibe);

    const best = candidates.find(c => {
      const lastUsed = usedUrlsMap.get(c.url);
      return lastUsed === undefined || (segmentIndex - lastUsed) > 8;
    });

    if (best) {
      usedUrlsMap.set(best.url, segmentIndex);
      finalAssets.push({
        type: best.type,
        url: best.url,
        alt: best.alt,
        source: best.source,
        duration: segment.duration / shotsToHarvest.length,
        query: best.query,
        sourceUrl: best.sourceUrl,
        isFallback: false,
        shotType,
        concept: shot.concept,
        reasoning: `Zero-Cost Harvester: Found at ${best.source}`,
        score: best.finalScore,
        trace
      });
    } else if (topicContext.thumbnailUrl) {
      finalAssets.push({
        type: 'image',
        url: topicContext.thumbnailUrl,
        alt: `Topic Hub: ${topicContext.coreSubject}`,
        source: 'Wikipedia (Heritage)',
        duration: segment.duration / shotsToHarvest.length,
        isFallback: false,
        shotType,
        concept: shot.concept,
        reasoning: 'Fallback to Subject Heritage.',
        score: 50,
        trace: [...trace, '[S4] Wiki Hero Fallback used.']
      });
    }
  }

  return { segmentId: segment.id, plan, assets: finalAssets };
}

export async function replaceMediaAsset(
  segment: ScriptSegment,
  plan: SegmentVisualPlan,
  topicContext: TopicContext,
  excludeUrls: Set<string>,
  _segmentIndex: number,
  config: AppConfig,
): Promise<Omit<MediaAsset, 'id' | 'segmentId'>> {
  // Simple replacement logic for consistency
  const { candidates } = await harvestMediaWithSafetyNet(plan.queries[0], topicContext, config);
  const best = candidates.find(c => !excludeUrls.has(c.url)) || candidates[0];
  if (!best) {
    const fallbackUrl = topicContext.thumbnailUrl;
    return { type: 'image', url: fallbackUrl || '', alt: `Fallback: ${segment.title}`, source: fallbackUrl ? 'Wikipedia' : 'No results', duration: segment.duration, query: plan.queries[0], isFallback: true, concept: plan.visualAction, reasoning: 'No candidates found for replacement.', score: 0, trace: [] };
  }
  return { type: best.type, url: best.url, alt: best.alt, source: best.source, duration: segment.duration, query: best.query, sourceUrl: best.sourceUrl, isFallback: false, concept: plan.visualAction, reasoning: `Replaced from ${best.source}`, score: best.finalScore, trace: [] };
}

export async function resolveTopic(topic: string) {
  return await resolveTopicContext(topic);
}
