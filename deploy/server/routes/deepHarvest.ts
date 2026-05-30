import type { IncomingMessage, ServerResponse } from "http";
import { validateURL } from "../utils/security.js";
import { fetchDDGImages } from "../utils/ddg.js";

interface ExtractedImage {
  url: string;
  alt?: string;
  title?: string;
  caption?: string;
  width?: number;
  height?: number;
  position: 'hero' | 'og' | 'json-ld' | 'inline' | 'sidebar' | 'footer';
  sourceUrl: string;
  sourceDomain: string;
  contextText?: string;
  score: number;
}

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0",
];

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function getStealthHeaders(referer?: string) {
  return {
    "User-Agent": getRandomUserAgent(),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    ...(referer && { "Referer": referer }),
  };
}

async function fetchPage(url: string): Promise<string | null> {
  try {
    const urlSafety = await validateURL(url);
    if (!urlSafety.valid) {
      console.warn(`[Deep Harvest] Blocked unsafe URL: ${urlSafety.error}`);
      return null;
    }

    const res = await fetch(url, {
      headers: getStealthHeaders(),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return null;
    
    const text = await res.text();
    return text.length > 1000 ? text : null;
  } catch (err) {
    console.warn(`[Deep Harvest] Failed to fetch ${url}:`, err);
    return null;
  }
}

function extractOgImage(html: string, baseUrl: string): ExtractedImage | null {
  const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
                  html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  
  if (!ogMatch) return null;

  const url = ogMatch[1];
  const absoluteUrl = new URL(url, baseUrl).toString();

  return {
    url: absoluteUrl,
    position: 'og',
    sourceUrl: baseUrl,
    sourceDomain: new URL(baseUrl).hostname,
    score: 100,
  };
}

function extractJsonLdImages(html: string, baseUrl: string): ExtractedImage[] {
  const images: ExtractedImage[] = [];
  const jsonLdMatches = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);

  for (const match of jsonLdMatches) {
    try {
      const json = JSON.parse(match[1]);
      const extractFromObject = (obj: any) => {
        if (!obj) return;
        
        if (typeof obj.image === 'string') {
          images.push({
            url: new URL(obj.image, baseUrl).toString(),
            position: 'json-ld',
            sourceUrl: baseUrl,
            sourceDomain: new URL(baseUrl).hostname,
            score: 95,
          });
        } else if (obj.image && typeof obj.image === 'object') {
          const imgUrl = obj.image.url || (Array.isArray(obj.image) && typeof obj.image[0] === 'string' ? obj.image[0] : null);
          if (imgUrl && typeof imgUrl === 'string') {
            images.push({
              url: new URL(imgUrl, baseUrl).toString(),
              position: 'json-ld',
              sourceUrl: baseUrl,
              sourceDomain: new URL(baseUrl).hostname,
              score: 95,
            });
          }
        }

        if (Array.isArray(obj)) {
          obj.forEach(extractFromObject);
        } else if (typeof obj === 'object') {
          Object.values(obj).forEach(extractFromObject);
        }
      };

      extractFromObject(json);
    } catch {}
  }

  return images;
}

function extractHeroImage(html: string, baseUrl: string): ExtractedImage | null {
  const heroPatterns = [
    /<header[^>]*>[\s\S]*?<img[^>]+src=["']([^"']+)["'][^>]*>/i,
    /<article[^>]*>[\s\S]{0,500}?<img[^>]+src=["']([^"']+)["'][^>]*>/i,
    /<div[^>]+class=["'][^"']*(?:hero|featured|lead|main)[^"']*["'][^>]*>[\s\S]{0,1000}?<img[^>]+src=["']([^"']+)["'][^>]*>/i,
  ];

  for (const pattern of heroPatterns) {
    const match = html.match(pattern);
    if (match) {
      const url = match[1];
      const absoluteUrl = new URL(url, baseUrl).toString();
      
      const imgTagMatch = html.substring(match.index!, match.index! + match[0].length + 200);
      const altMatch = imgTagMatch.match(/alt=["']([^"']+)["']/i);
      const titleMatch = imgTagMatch.match(/title=["']([^"']+)["']/i);

      return {
        url: absoluteUrl,
        alt: altMatch?.[1],
        title: titleMatch?.[1],
        position: 'hero',
        sourceUrl: baseUrl,
        sourceDomain: new URL(baseUrl).hostname,
        score: 90,
      };
    }
  }

  return null;
}

function extractInlineImages(html: string, baseUrl: string, query: string): ExtractedImage[] {
  const images: ExtractedImage[] = [];
  const imgMatches = html.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi);

  for (const match of imgMatches) {
    const imgTag = match[0];
    const url = match[1];
    
    if (url.startsWith('data:') || url.includes('placeholder') || url.includes('logo')) continue;
    if (url.match(/\.(svg|gif|ico)(\?|$)/i)) continue;
    if (url.includes('scorecardresearch.com') || url.includes('google-analytics.com') || url.includes('doubleclick.net')) continue;
    if (url.includes('/themes/') || url.includes('/assets/dist/') || url.includes('badge')) continue;

    const absoluteUrl = new URL(url, baseUrl).toString();
    
    const altMatch = imgTag.match(/alt=["']([^"']+)["']/i);
    const titleMatch = imgTag.match(/title=["']([^"']+)["']/i);
    const widthMatch = imgTag.match(/width=["']?(\d+)/i);
    const heightMatch = imgTag.match(/height=["']?(\d+)/i);

    const alt = altMatch?.[1] || '';
    const title = titleMatch?.[1] || '';

    const width = widthMatch ? parseInt(widthMatch[1]) : undefined;
    const height = heightMatch ? parseInt(heightMatch[1]) : undefined;

    if (width && height && (width < 400 || height < 300)) continue;

    const contextBefore = html.substring(Math.max(0, match.index! - 300), match.index!);
    const contextAfter = html.substring(match.index! + match[0].length, match.index! + match[0].length + 300);
    const contextText = (contextBefore + ' ' + contextAfter).replace(/<[^>]+>/g, ' ').trim();

    const queryWords = query.toLowerCase().split(/\s+/);
    const textToCheck = (alt + ' ' + title + ' ' + contextText).toLowerCase();
    const relevanceScore = queryWords.filter(w => textToCheck.includes(w)).length * 10;

    let position: ExtractedImage['position'] = 'inline';
    let baseScore = 50;

    if (match.index! < 2000) {
      position = 'hero';
      baseScore = 80;
    } else if (match.index! > html.length - 2000) {
      position = 'footer';
      baseScore = 30;
    }

    images.push({
      url: absoluteUrl,
      alt: alt || undefined,
      title: title || undefined,
      caption: contextText.substring(0, 200) || undefined,
      width,
      height,
      position,
      sourceUrl: baseUrl,
      sourceDomain: new URL(baseUrl).hostname,
      contextText: contextText.substring(0, 500),
      score: baseScore + relevanceScore,
    });
  }

  return images;
}

async function searchForArticles(query: string): Promise<string[]> {
  try {
    const data = await fetchDDGImages(query + ' news article') as { results?: Array<{ url: string; image: string; title: string }> };
    
    if (!data.results || data.results.length === 0) {
      console.log(`[Deep Harvest] DDG returned no results`);
      return [];
    }

    const urls: string[] = [];
    const seen = new Set<string>();
    
    for (const result of data.results) {
      if (result.url && !seen.has(result.url)) {
        seen.add(result.url);
        urls.push(result.url);
        if (urls.length >= 5) break;
      }
    }

    console.log(`[Deep Harvest] DDG returned ${urls.length} article URLs`);
    return urls;
  } catch (err) {
    console.warn(`[Deep Harvest] DDG search failed:`, err);
    return [];
  }
}

export async function handleDeepHarvest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(req.url!, `http://${req.headers.host}`);
  const query = url.searchParams.get("q");

  if (!query) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Missing q parameter" }));
    return;
  }

  try {
    console.log(`[Deep Harvest] Starting deep harvest for: "${query}"`);

    const articleUrls = await searchForArticles(query);
    console.log(`[Deep Harvest] Found ${articleUrls.length} article URLs:`, articleUrls);

    if (articleUrls.length === 0) {
      console.log(`[Deep Harvest] No articles found, returning empty result`);
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.end(JSON.stringify({
        query,
        articlesSearched: 0,
        imagesFound: 0,
        images: [],
      }));
      return;
    }

    const allImages: ExtractedImage[] = [];

    for (const articleUrl of articleUrls.slice(0, 3)) {
      console.log(`[Deep Harvest] Fetching: ${articleUrl}`);
      const html = await fetchPage(articleUrl);
      
      if (!html) {
        console.log(`[Deep Harvest] Failed to fetch ${articleUrl}`);
        continue;
      }

      console.log(`[Deep Harvest] Extracting images from ${articleUrl} (${html.length} bytes)`);

      const ogImage = extractOgImage(html, articleUrl);
      if (ogImage) {
        allImages.push(ogImage);
        console.log(`[Deep Harvest] Found og:image: ${ogImage.url}`);
      }

      const jsonLdImages = extractJsonLdImages(html, articleUrl);
      allImages.push(...jsonLdImages);
      if (jsonLdImages.length > 0) {
        console.log(`[Deep Harvest] Found ${jsonLdImages.length} JSON-LD images`);
      }

      const heroImage = extractHeroImage(html, articleUrl);
      if (heroImage) {
        allImages.push(heroImage);
        console.log(`[Deep Harvest] Found hero image: ${heroImage.url}`);
      }

      const inlineImages = extractInlineImages(html, articleUrl, query);
      allImages.push(...inlineImages);
      console.log(`[Deep Harvest] Found ${inlineImages.length} inline images`);
    }

    const uniqueImages = Array.from(
      new Map(allImages.map(img => [img.url, img])).values()
    );

    uniqueImages.sort((a, b) => b.score - a.score);

    console.log(`[Deep Harvest] Total: ${uniqueImages.length} unique images extracted`);

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.end(JSON.stringify({
      query,
      articlesSearched: articleUrls.length,
      imagesFound: uniqueImages.length,
      images: uniqueImages.slice(0, 20),
    }));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error("[Deep Harvest] Error:", err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ 
      error: "Internal server error",
      code: "HARVEST_ERROR",
      details: message
    }));
  }
}
