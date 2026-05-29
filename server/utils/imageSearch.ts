// ============================================================================
// Web image search utilities — Bing Images scraper
// ============================================================================

import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
puppeteer.use(StealthPlugin());

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
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
    "Cache-Control": "max-age=0",
    ...(referer && { "Referer": referer }),
  };
}

// ---------------------------------------------------------------------------
// Fetched result shape
// ---------------------------------------------------------------------------

export interface WebImageResult {
  url: string;
  thumbnailUrl?: string;
  title?: string;
  sourceUrl?: string;
  width?: number;
  height?: number;
}

// ---------------------------------------------------------------------------
// Low-quality domain filter
// ---------------------------------------------------------------------------

const LOW_QUALITY_DOMAINS = [
  'placeholder.com', 'example.com', 'localhost',
  'via.placeholder.com', 'fpoimg.com', 'dummyimage.com',
  'placehold.it', 'placehold.co', 'placeholder.svg',
  'clipartpng.com', 'pngkey.com', 'pngtree.com',
  'kisspng.com', 'freepngimg.com', 'purepng.com',
  'similarpng.com', 'toppng.com', 'pnghut.com',
  'clipartmax.com', 'webstockreview.net', 'pinclipart.com',
  'clipart.me', 'pngaaa.com', 'freepnglogos.com',
  'seekpng.com', 'pngwing.com', 'pngplay.com',
  'cleanpng.com', 'imgpng.com', 'pngmart.com',
];

function isLowQualityDomain(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return LOW_QUALITY_DOMAINS.some((d) => hostname.includes(d));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Bing Image Search — parses HTML from www.bing.com/images/search
// ---------------------------------------------------------------------------

export async function fetchBingImages(query: string): Promise<WebImageResult[]> {
  const searchUrl = `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&form=HDRSC2&first=1&count=35`;

  const res = await fetch(searchUrl, {
    headers: getStealthHeaders("https://www.bing.com/"),
  });

  if (!res.ok) {
    console.warn(`[Bing Images] HTTP ${res.status} for "${query}"`);
    return [];
  }

  const html = await res.text();

  // Bing stores image data in <a class="iusc"> elements with a JSON m attribute
  // Format: m="{...json..."imgurl":"...","t":"...","purl":"...","d":"..."...}"
  const results: WebImageResult[] = [];
  const iuscRegex = /<a[^>]+class="iusc"[^>]+m="([^"]+)"[^>]*>/g;
  let match: RegExpExecArray | null;

  while ((match = iuscRegex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'"));
      const url: string | undefined = data.imgurl || data.murl;
      if (!url) continue;
      if (isLowQualityDomain(url)) continue;

      // Parse dimensions from metadata if available
      let width: number | undefined;
      let height: number | undefined;
      // Bing sometimes includes dimensions in the JSON
      if (typeof data.w === 'number') width = data.w;
      if (typeof data.h === 'number') height = data.h;
      // Also try common alternate field names
      if (width === undefined && typeof data.width === 'number') width = data.width;
      if (height === undefined && typeof data.height === 'number') height = data.height;
      if (width === undefined && typeof data.tw === 'number') width = data.tw;
      if (height === undefined && typeof data.th === 'number') height = data.th;

      // Extract source domain from purl when available
      let sourceUrl: string | undefined = data.purl || data.cid || data.imgurl;
      let title: string | undefined = data.t || query;

      // Attempt to parse dimensions from title (e.g. "1920 x 1080")
      if ((!width || !height) && title) {
        const dimMatch = title.match(/(\d+)\s*x\s*(\d+)/);
        if (dimMatch) {
          const parsedW = parseInt(dimMatch[1], 10);
          const parsedH = parseInt(dimMatch[2], 10);
          if (!isNaN(parsedW) && !isNaN(parsedH)) {
            width = parsedW;
            height = parsedH;
          }
        }
      }

      results.push({
        url,
        thumbnailUrl: data.turl,
        title,
        sourceUrl,
        width,
        height,
      });
    } catch {
      // Skip unparseable entries
    }
  }

  // Fallback: parse <img> tags if the iusc approach found nothing
  if (results.length === 0) {
    const imgRegex = /<img[^>]+src="([^"]+)"[^>]*alt="([^"]*)"[^>]*>/g;
    let imgMatch: RegExpExecArray | null;
    while ((imgMatch = imgRegex.exec(html)) !== null) {
      const src = imgMatch[1];
      const alt = imgMatch[2];
      if (src && !src.startsWith('data:') && !src.includes('bing.com/th?') && !isLowQualityDomain(src)) {
        results.push({
          url: src,
          thumbnailUrl: src,
          title: alt || query,
        });
      }
    }
  }

  // Second fallback: look for data-media attributes or other Bing-specific patterns
  if (results.length === 0) {
    const mediaRegex = /data-media=["']([^"']+)["']/g;
    let mediaMatch: RegExpExecArray | null;
    while ((mediaMatch = mediaRegex.exec(html)) !== null) {
      try {
        const media = JSON.parse(mediaMatch[1].replace(/&quot;/g, '"'));
        if (media.murl && !isLowQualityDomain(media.murl)) {
          results.push({
            url: media.murl,
            thumbnailUrl: media.turl,
            title: media.t || query,
            sourceUrl: media.purl,
            width: typeof media.w === 'number' ? media.w : undefined,
            height: typeof media.h === 'number' ? media.h : undefined,
          });
        }
      } catch {
        // Skip unparseable
      }
    }
  }

  console.log(`[Bing Images] Found ${results.length} images for "${query}"`);
  return results;
}

// ---------------------------------------------------------------------------
// DuckDuckGo Image Search — scrapes HTML and internal API
// ---------------------------------------------------------------------------

export async function fetchDuckDuckGoImages(query: string): Promise<WebImageResult[]> {
  const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`;

  const res = await fetch(searchUrl, {
    headers: getStealthHeaders("https://duckduckgo.com/"),
  });

  if (!res.ok) {
    console.warn(`[DuckDuckGo Images] HTTP ${res.status} for "${query}"`);
    return [];
  }

  const html = await res.text();
  const results: WebImageResult[] = [];

  // Pattern 1: Extract vqd token from HTML and use DDG internal image API
  const vqdMatch = html.match(/vqd=([a-zA-Z0-9\-]+)/);
  if (vqdMatch) {
    const vqd = vqdMatch[1];
    try {
      const apiUrl = `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(query)}&vqd=${vqd}`;
      const apiRes = await fetch(apiUrl, {
        headers: {
          ...getStealthHeaders(searchUrl),
          "Accept": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
      });
      if (apiRes.ok) {
        const data: unknown = await apiRes.json();
        if (data && typeof data === 'object') {
          const apiResults = (data as Record<string, unknown>).results;
          if (Array.isArray(apiResults)) {
            for (const item of apiResults) {
              const img = item as Record<string, unknown>;
              const imageUrl = typeof img.image === 'string' ? img.image : undefined;
              if (imageUrl && !isLowQualityDomain(imageUrl)) {
                results.push({
                  url: imageUrl,
                  thumbnailUrl: typeof img.thumbnail === 'string' ? img.thumbnail : undefined,
                  title: typeof img.title === 'string' ? img.title : query,
                  sourceUrl: typeof img.url === 'string' ? img.url : undefined,
                  width: typeof img.width === 'number' ? img.width : undefined,
                  height: typeof img.height === 'number' ? img.height : undefined,
                });
              }
            }
          }
        }
      }
    } catch {
      // Fall through to HTML parsing
    }
  }

  // Pattern 2: Parse image tiles directly from HTML
  if (results.length === 0) {
    const tileRegex = /<a[^>]+class="[^"]*tile--img__link[^"]*"[^>]*>\s*<img[^>]+class="[^"]*tile--img__img[^"]*"[^>]+src="([^"]+)"[^>]*>\s*(?:<span[^>]+class="[^"]*tile--img__title[^"]*"[^>]*>([^<]*)<\/span>)?/g;
    let tileMatch: RegExpExecArray | null;
    while ((tileMatch = tileRegex.exec(html)) !== null) {
      const src = tileMatch[1];
      const title = tileMatch[2]?.trim();
      if (src && !src.startsWith('data:') && !isLowQualityDomain(src)) {
        results.push({
          url: src,
          thumbnailUrl: src,
          title: title || query,
        });
      }
    }
  }

  // Pattern 3: Generic img tags with data-src
  if (results.length === 0) {
    const imgRegex = /<img[^>]+data-src="([^"]+)"[^>]*alt="([^"]*)"[^>]*>/g;
    let imgMatch: RegExpExecArray | null;
    while ((imgMatch = imgRegex.exec(html)) !== null) {
      const src = imgMatch[1];
      const alt = imgMatch[2];
      if (src && !src.startsWith('data:') && !isLowQualityDomain(src)) {
        results.push({
          url: src,
          thumbnailUrl: src,
          title: alt || query,
        });
      }
    }
  }

  console.log(`[DuckDuckGo Images] Found ${results.length} images for "${query}"`);
  return results;
}

// ---------------------------------------------------------------------------
// Google Images — fetches from google.com/search?tbm=isch by looking for
// image data embedded in the page HTML.
// Google embeds image data in a script block with AF_initDataCallback or
// similar patterns. This is more fragile than Bing but worth trying.
// ---------------------------------------------------------------------------

export async function fetchGoogleImages(query: string): Promise<WebImageResult[]> {
  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&udm=2`;

  const res = await fetch(searchUrl, {
    headers: getStealthHeaders("https://www.google.com/"),
    redirect: 'follow',
  });

  if (!res.ok) {
    console.warn(`[Google Images] HTTP ${res.status} for "${query}"`);
    return [];
  }

  const html = await res.text();
  const results: WebImageResult[] = [];
  const seenUrls = new Set<string>();

  const addResult = (result: WebImageResult) => {
    if (!result.url || seenUrls.has(result.url)) return;
    if (result.url.startsWith('data:') || isLowQualityDomain(result.url)) return;
    if (result.url.includes('gstatic.com/images') || result.url.includes('google.com/images')) return;
    seenUrls.add(result.url);
    results.push(result);
  };

  const scriptBlocks = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || [];

  for (const block of scriptBlocks) {
    if (!block.includes('AF_initDataCallback')) continue;

    const dataRegex = /data:function\(\)\{return\s+([\s\S]*?)\}\}/g;
    let dataMatch;
    while ((dataMatch = dataRegex.exec(block)) !== null) {
      try {
        const jsonStr = dataMatch[1].trim();
        if (!jsonStr.startsWith('[')) continue;

        const parsed = JSON.parse(jsonStr);
        const images = extractGoogleImageData(parsed, 0);
        images.forEach(addResult);
      } catch {
        continue;
      }
    }

    const altDataRegex = /data:([\s\S]*?)[,\}]\s*sideChannel/g;
    let altMatch;
    while ((altMatch = altDataRegex.exec(block)) !== null) {
      try {
        const jsonStr = altMatch[1].trim();
        if (!jsonStr.startsWith('[')) continue;

        const parsed = JSON.parse(jsonStr);
        const images = extractGoogleImageData(parsed, 0);
        images.forEach(addResult);
      } catch {
        continue;
      }
    }
  }

  if (results.length === 0) {
    const urlRegex = /\["(https?:\/\/[^"]+\.(?:jpg|jpeg|png|gif|webp)(?:\?[^"]*)?)",(\d+),(\d+)\]/g;
    let match;
    while ((match = urlRegex.exec(html)) !== null) {
      const [, url, height, width] = match;
      addResult({
        url,
        width: parseInt(width, 10),
        height: parseInt(height, 10),
        title: query,
      });
    }
  }

  if (results.length === 0) {
    const imgRegex = /<img[^>]+src="([^"]+)"[^>]*>/gi;
    let imgMatch;
    while ((imgMatch = imgRegex.exec(html)) !== null) {
      const src = imgMatch[1];
      if (src && !src.startsWith('data:') && !src.includes('gstatic.com') && !isLowQualityDomain(src)) {
        const altMatch = imgMatch[0].match(/alt="([^"]*)"/i);
        addResult({
          url: src,
          title: altMatch?.[1] || query,
        });
      }
    }
  }

  if (results.length === 0) {
    const dataSrcRegex = /data-(?:src|deferred-src)="([^"]+)"/gi;
    let dataMatch;
    while ((dataMatch = dataSrcRegex.exec(html)) !== null) {
      const src = dataMatch[1];
      if (src && !src.startsWith('data:') && !isLowQualityDomain(src)) {
        addResult({
          url: src,
          title: query,
        });
      }
    }
  }

  if (results.length === 0) {
    const httpUrlRegex = /"(https?:\/\/[^"]+\.(?:jpg|jpeg|png|gif|webp)(?:\?[^"]*)?)"/gi;
    let httpMatch;
    while ((httpMatch = httpUrlRegex.exec(html)) !== null) {
      const url = httpMatch[1];
      if (!isLowQualityDomain(url) && !url.includes('gstatic.com') && !url.includes('google.com/images')) {
        addResult({
          url,
          title: query,
        });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // HEADLESS BROWSER FALLBACK — Puppeteer renders the JS-heavy Google Images
  // page and extracts actual image URLs from the DOM.
  // ---------------------------------------------------------------------------
  if (results.length === 0) {
    try {
      const headlessResults = await fetchGoogleImagesHeadless(query);
      for (const r of headlessResults) addResult(r);
    } catch (err) {
      console.warn('[Google Images] Headless fallback failed:', err);
    }
  }

  if (results.length === 0 && process.env.SERPER_API_KEY) {
    try {
      const serperRes = await fetch('https://google.serper.dev/images', {
        method: 'POST',
        headers: {
          'X-API-KEY': process.env.SERPER_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ q: query, num: 20 }),
      });

      if (serperRes.ok) {
        const serperData = await serperRes.json() as { images?: Array<{ imageUrl?: string; thumbnailUrl?: string; title?: string; source?: string; imageWidth?: number; imageHeight?: number }> };
        if (serperData.images && Array.isArray(serperData.images)) {
          for (const img of serperData.images) {
            if (img.imageUrl && !isLowQualityDomain(img.imageUrl)) {
              addResult({
                url: img.imageUrl,
                thumbnailUrl: img.thumbnailUrl,
                title: img.title || query,
                sourceUrl: img.source,
                width: img.imageWidth,
                height: img.imageHeight,
              });
            }
          }
        }
      }
    } catch (err) {
      console.warn('[Google Images] Serper API fallback failed:', err);
    }
  }

  console.log(`[Google Images] Found ${results.length} images for "${query}"`);
  return results;
}

/**
 * Headless browser scraper for Google Images using Puppeteer.
 * Renders the full JS page and extracts image URLs from the DOM.
 */
async function fetchGoogleImagesHeadless(query: string): Promise<WebImageResult[]> {
  const CHROME_PATH = process.env.PUPPETEER_EXECUTABLE_PATH
    || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    || "/usr/bin/google-chrome"
    || "/usr/bin/chromium";

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: CHROME_PATH,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--window-size=1920,1080',
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&udm=2`;
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30_000 });

    // Wait for any image results to appear - use a very generous timeout
    // and catch timeout errors gracefully
    try {
      await page.waitForSelector('img', { timeout: 15_000 });
    } catch {
      console.warn('[Google Images Headless] No img tags found, trying anyway...');
    }

    // Scroll down to trigger lazy loading
    for (let i = 0; i < 4; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await new Promise(r => setTimeout(r, 1000));
    }

    // Give extra time for lazy-loaded images
    await new Promise(r => setTimeout(r, 2000));

    // Extract image URLs from the rendered DOM
    const imageData = await page.evaluate(() => {
      const results: Array<{ url: string; title: string; width?: number; height?: number }> = [];
      const seen = new Set<string>();

      const addUrl = (url: string, title = '', width?: number, height?: number) => {
        if (!url || !url.startsWith('http') || seen.has(url)) return;
        if (url.includes('gstatic.com') || url.includes('google.com/images')) return;
        if (url.includes('data:image')) return;
        if (url.includes('google.com/logos') || url.includes('google.com/favicon')) return;
        seen.add(url);
        results.push({ url, title, width, height });
      };

      // Strategy 1: Find links that contain imgurl parameter (actual source URLs)
      const links = document.querySelectorAll('a[href*="imgurl"]');
      for (const a of links) {
        const href = a.getAttribute('href');
        if (!href) continue;
        const match = href.match(/[?&]imgurl=([^&]+)/);
        if (match) {
          try {
            const url = decodeURIComponent(match[1]);
            const title = a.getAttribute('title')
              || a.querySelector('img')?.getAttribute('alt')
              || '';
            addUrl(url, title);
          } catch {
            // ignore decode errors
          }
        }
      }

      // Strategy 2: Find img tags with data-src or src
      const imgs = document.querySelectorAll('img');
      for (const img of imgs) {
        const src = img.getAttribute('data-src') || img.getAttribute('src');
        if (src) {
          const title = img.getAttribute('alt') || '';
          const width = img.naturalWidth || undefined;
          const height = img.naturalHeight || undefined;
          addUrl(src, title, width, height);
        }
      }

      // Strategy 3: Look for elements with data-ved containing images
      const vedElements = document.querySelectorAll('[data-ved]');
      for (const el of vedElements) {
        const img = el.querySelector('img');
        if (img) {
          const src = img.getAttribute('data-src') || img.getAttribute('src');
          if (src) {
            const title = img.getAttribute('alt') || '';
            addUrl(src, title);
          }
        }
      }

      // Strategy 4: Look for any a tags with href containing image URLs
      const allLinks = document.querySelectorAll('a[href*=".jpg"], a[href*=".png"], a[href*=".webp"]');
      for (const a of allLinks) {
        const href = a.getAttribute('href');
        if (href && href.startsWith('http')) {
          const title = a.getAttribute('title') || a.textContent || '';
          addUrl(href, title);
        }
      }

      return results;
    });

    console.log(`[Google Images Headless] Extracted ${imageData.length} images from DOM`);
    return imageData;
  } finally {
    await browser.close();
  }
}

function extractGoogleImageData(data: unknown, depth = 0): WebImageResult[] {
  const results: WebImageResult[] = [];
  const MAX_DEPTH = 15;
  const seenUrls = new Set<string>();

  function isImageUrl(url: string): boolean {
    if (!url || typeof url !== 'string') return false;
    if (!url.startsWith('http')) return false;
    if (url.includes('gstatic.com/images') || url.includes('google.com/images/branding')) return false;
    if (url.includes('/logos/') || url.includes('/icons/')) return false;
    
    return /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i.test(url)
      || /(?:imgurl|image|photo|picture|thumbnail)/i.test(url)
      || /encrypted-tbn/i.test(url);
  }

  function walk(node: unknown, currentDepth: number): void {
    if (currentDepth > MAX_DEPTH) return;
    if (!Array.isArray(node)) return;

    for (let i = 0; i < node.length; i++) {
      const item = node[i];
      
      if (typeof item === 'string' && isImageUrl(item) && !seenUrls.has(item)) {
        seenUrls.add(item);
        
        let width: number | undefined;
        let height: number | undefined;
        
        if (typeof node[i + 1] === 'number' && typeof node[i + 2] === 'number') {
          height = node[i + 1];
          width = node[i + 2];
        } else if (typeof node[i - 1] === 'number' && typeof node[i - 2] === 'number') {
          width = node[i - 1];
          height = node[i - 2];
        }
        
        results.push({
          url: item,
          width,
          height,
        });
      }
      
      if (Array.isArray(item)) {
        if (item.length >= 1 && typeof item[0] === 'string' && isImageUrl(item[0]) && !seenUrls.has(item[0])) {
          seenUrls.add(item[0]);
          results.push({
            url: item[0],
            width: typeof item[2] === 'number' ? item[2] : typeof item[1] === 'number' ? item[1] : undefined,
            height: typeof item[1] === 'number' ? item[1] : typeof item[2] === 'number' ? item[2] : undefined,
          });
        }
        
        walk(item, currentDepth + 1);
      }
    }
  }

  walk(data, depth);
  return results;
}

// ---------------------------------------------------------------------------
// Yandex Images — scrapes yandex.com/images/search which embeds image data
// as JSON in the page HTML (much more scraper-friendly than Google Images).
// ---------------------------------------------------------------------------

export async function fetchYandexImages(query: string): Promise<WebImageResult[]> {
  // NOTE: Using Startpage Images under the hood because Yandex
  // aggressively fingerprinted server requests and now returns
  // a JavaScript shell with no image data. Startpage returns
  // Google-quality results via proxy URLs with simple HTML.
  const searchUrl = `https://www.startpage.com/sp/search?query=${encodeURIComponent(query)}&cat=images`;

  const res = await fetch(searchUrl, {
    headers: getStealthHeaders("https://www.startpage.com/"),
    redirect: 'follow',
  });

  if (!res.ok) {
    console.warn(`[Startpage Images] HTTP ${res.status} for "${query}"`);
    return [];
  }

  const html = await res.text();
  const results: WebImageResult[] = [];
  const seenUrls = new Set<string>();

  const addResult = (result: WebImageResult) => {
    if (!result.url || seenUrls.has(result.url)) return;
    if (result.url.startsWith('data:')) return;
    if (result.url.includes('startpage.com/sp/cdn/') && result.url.includes('favicon')) return;
    if (result.url.includes('startpage.com/sp/cdn/') && result.url.includes('icon')) return;
    if (isLowQualityDomain(result.url)) return;
    seenUrls.add(result.url);
    results.push(result);
  };

  // Startpage returns image results via proxy URLs like:
  // https://us2-browse.startpage.com/av/anon-image?piurl=https%3A%2F%2F...
  // We extract the actual source URL from the piurl parameter.
  const proxyRegex = /anon-image\?piurl=([^"'\s<>]+)/g;
  let match: RegExpExecArray | null;
  while ((match = proxyRegex.exec(html)) !== null) {
    try {
      const encodedUrl = match[1];
      // Strip Startpage signature param if present (&sp=...)
      const cleanEncoded = encodedUrl.split('&sp=')[0];
      const decodedUrl = decodeURIComponent(cleanEncoded);
      if (decodedUrl.startsWith('http')) {
        addResult({ url: decodedUrl, title: query });
      }
    } catch {
      // ignore decode errors
    }
  }

  // Fallback: also extract any direct image URLs in the page.
  if (results.length < 10) {
    const directRegex = /"(https?:\/\/[^"]+\.(?:jpg|jpeg|png|gif|webp)(?:\?[^"]*)?)"/gi;
    while ((match = directRegex.exec(html)) !== null) {
      const url = match[1];
      if (!url.includes('startpage.com/sp/cdn/')) {
        addResult({ url, title: query });
      }
    }
  }

  console.log(`[Startpage Images] Found ${results.length} images for "${query}"`);
  return results;
}

// ---------------------------------------------------------------------------
// Flickr Image Search — scrapes www.flickr.com/search for CC images
// ---------------------------------------------------------------------------

export async function fetchFlickrImages(query: string): Promise<WebImageResult[]> {
  const searchUrl = `https://www.flickr.com/search/?text=${encodeURIComponent(query)}&license=1%2C2%2C3%2C4%2C5%2C6%2C9%2C10&sort=relevance`;

  const res = await fetch(searchUrl, {
    headers: getStealthHeaders("https://www.google.com/"),
    redirect: 'follow',
  });

  if (!res.ok) {
    console.warn(`[Flickr] HTTP ${res.status} for "${query}"`);
    return [];
  }

  const html = await res.text();
  const results: WebImageResult[] = [];
  const seenIds = new Set<string>();

  const cdnRegex = /(?:https?:)?\/\/live\.staticflickr\.com\/(\d+)\/(\d+)_([a-f0-9]+)(?:_([a-z]))?\.(?:jpg|png|gif)/g;
  let match: RegExpExecArray | null;

  while ((match = cdnRegex.exec(html)) !== null) {
    const [, server, id, secret, sizeSuffix] = match;
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    const highResUrl = `https://live.staticflickr.com/${server}/${id}_${secret}_b.jpg`;
    const thumbnailUrl = `https://live.staticflickr.com/${server}/${id}_${secret}_q.jpg`;

    results.push({
      url: highResUrl,
      thumbnailUrl,
      title: `${query} - Flickr`,
      sourceUrl: `https://www.flickr.com/photos/${id}`,
      width: 1024,
      height: 768,
    });
  }

  if (results.length === 0) {
    const modelExportRegex = /modelExport["\s:=]+["']?(\{[\s\S]*?\})["']?/g;
    let meMatch: RegExpExecArray | null;
    while ((meMatch = modelExportRegex.exec(html)) !== null) {
      try {
        const data = JSON.parse(meMatch[1].replace(/&quot;/g, '"'));
        if (data && typeof data === 'object') {
          for (const key of Object.keys(data)) {
            const item = data[key];
            if (item && typeof item === 'object' && item.url) {
              const url: string = item.url;
              if (url.includes('staticflickr.com') && !seenIds.has(url)) {
                seenIds.add(url);
                results.push({
                  url: url.replace(/_[a-z]\./, '_b.'),
                  thumbnailUrl: url.replace(/_[a-z]\./, '_q.'),
                  title: item.title || query,
                  width: typeof item.width === 'number' ? item.width : 1024,
                  height: typeof item.height === 'number' ? item.height : 768,
                });
              }
            }
          }
        }
      } catch {
        // skip unparseable
      }
    }
  }

  console.log(`[Flickr] Found ${results.length} images for "${query}"`);
  return results;
}

// ---------------------------------------------------------------------------
// Bing Video Search — scrapes www.bing.com/videos/search
// ---------------------------------------------------------------------------

export interface WebVideoResult {
  url: string;
  title?: string;
  sourceUrl?: string;
  duration?: string;
  thumbnailUrl?: string;
}

export async function fetchBingVideos(query: string): Promise<WebVideoResult[]> {
  const searchUrl = `https://www.bing.com/videos/search?q=${encodeURIComponent(query)}&FORM=HDRSC3`;

  const res = await fetch(searchUrl, {
    headers: getStealthHeaders("https://www.bing.com/"),
  });

  if (!res.ok) {
    console.warn(`[Bing Videos] HTTP ${res.status} for "${query}"`);
    return [];
  }

  const html = await res.text();
  const results: WebVideoResult[] = [];
  const seenUrls = new Set<string>();

  const vrhmRegex = /vrhm="([^"]+)"/g;
  let vrhmMatch: RegExpExecArray | null;
  while ((vrhmMatch = vrhmRegex.exec(html)) !== null) {
    try {
      const raw = vrhmMatch[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
      const data = JSON.parse(raw);
      const murl: string | undefined = data.murl || data.pgurl;
      if (!murl || seenUrls.has(murl)) continue;
      seenUrls.add(murl);

      let thumbnailUrl: string | undefined = data.smturl;
      if (!thumbnailUrl && data.thid) {
        thumbnailUrl = `https://th.bing.com/th/id/${data.thid}`;
      }

      results.push({
        url: murl,
        title: data.vt || query,
        duration: data.du,
        thumbnailUrl,
        sourceUrl: data.pgurl || murl,
      });
    } catch {
    }
  }

  if (results.length === 0) {
    const ariaRegex = /<a[^>]+class="[^"]*mc_vtvc_link[^"]*"[^>]+aria-label="([^"]*)"[^>]+href="([^"]+)"[^>]*>/g;
    let ariaMatch: RegExpExecArray | null;
    while ((ariaMatch = ariaRegex.exec(html)) !== null) {
      const ariaLabel = ariaMatch[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
      const href = ariaMatch[2].replace(/&amp;/g, '&');

      let title = query;
      let duration: string | undefined;
      const titleMatch = ariaLabel.match(/^(.+?)\s+from\s+/);
      if (titleMatch) title = titleMatch[1];
      const durMatch = ariaLabel.match(/Duration:\s+([\d:]+\s*(?:minutes?|seconds?|hours?)?[\d\s]*)/i);
      if (durMatch) duration = durMatch[1].trim();

      const churlMatch = href.match(/churl=([^&]+)/);
      let url: string;
      if (churlMatch) {
        url = decodeURIComponent(churlMatch[1]);
      } else {
        url = href.startsWith('http') ? href : `https://www.bing.com${href}`;
      }

      if (!seenUrls.has(url)) {
        seenUrls.add(url);
        results.push({ url, title, duration });
      }
    }
  }

  console.log(`[Bing Videos] Found ${results.length} videos for "${query}"`);
  return results;
}

// ---------------------------------------------------------------------------
// Google Video Search — scrapes google.com/search?tbm=vid
// ---------------------------------------------------------------------------

export async function fetchGoogleVideos(query: string): Promise<WebVideoResult[]> {
  const results: WebVideoResult[] = [];
  const seenUrls = new Set<string>();

  function addResult(url: string, title?: string, thumbnailUrl?: string, duration?: string) {
    if (!url || seenUrls.has(url)) return;
    seenUrls.add(url);
    results.push({ url, title: title || query, thumbnailUrl, duration, sourceUrl: url });
  }

  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&tbm=vid&hl=en&gl=us&safe=off`;

  const res = await fetch(searchUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      "Connection": "keep-alive",
      "Upgrade-Insecure-Requests": "1",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Cache-Control": "max-age=0",
    },
    redirect: 'follow',
  });

  if (!res.ok) {
    console.warn(`[Google Videos] HTTP ${res.status} for "${query}"`);
    return [];
  }

  const html = await res.text();

  if (html.includes('trouble accessing Google Search') || html.includes('enablejs')) {
    console.log(`[Google Videos] Google blocked request, falling back to Bing Videos for "${query}"`);
    const bingResults = await fetchBingVideos(query);
    return bingResults;
  }

  const VIDEO_DOMAINS = /(?:youtube\.com|youtu\.be|vimeo\.com|dailymotion\.com|cnn\.com|bbc\.com|nbcnews\.com|abcnews\.go\.com|foxnews\.com|reuters\.com|bloomberg\.com|ted\.com|tiktok\.com|instagram\.com|facebook\.com|twitter\.com|x\.com)/i;

  const urlQRegex = /\/url\?q=(https?[^"&]+)/g;
  let urlMatch: RegExpExecArray | null;
  while ((urlMatch = urlQRegex.exec(html)) !== null) {
    try {
      const decoded = decodeURIComponent(urlMatch[1]);
      if (VIDEO_DOMAINS.test(decoded)) {
        addResult(decoded);
      }
    } catch { /* skip */ }
  }

  const afRegex = /AF_initDataCallback\s*\(\s*\{[\s\S]*?data\s*:\s*([\s\S]*?)\s*\}\s*\)\s*;/g;
  let afMatch: RegExpExecArray | null;
  while ((afMatch = afRegex.exec(html)) !== null) {
    try {
      const dataStr = afMatch[1];
      const urlExtractRegex = /"(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=[^"&]+|youtu\.be\/[^"&]+|vimeo\.com\/\d+|dailymotion\.com\/video\/[^"&]+)[^"]*)"/g;
      let extractMatch: RegExpExecArray | null;
      while ((extractMatch = urlExtractRegex.exec(dataStr)) !== null) {
        try {
          const decoded = extractMatch[1].replace(/\\u003d/g, '=').replace(/\\u0026/g, '&').replace(/\\\//g, '/');
          addResult(decoded);
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }

  const directLinkRegex = /<a[^>]+href="(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=[^"&]+|youtu\.be\/[^"&]+|vimeo\.com\/\d+|dailymotion\.com\/video\/[^"&]+)[^"]*)"[^>]*>/g;
  let directMatch: RegExpExecArray | null;
  while ((directMatch = directLinkRegex.exec(html)) !== null) {
    try {
      const decoded = decodeURIComponent(directMatch[1].replace(/&amp;/g, '&'));
      addResult(decoded);
    } catch { /* skip */ }
  }

  const genericLinkRegex = /<a[^>]+href="([^"]+)"[^>]*>/g;
  let genericMatch: RegExpExecArray | null;
  while ((genericMatch = genericLinkRegex.exec(html)) !== null) {
    try {
      let href = genericMatch[1];
      if (href.startsWith('/url?q=')) {
        href = href.substring(7);
        const ampIdx = href.indexOf('&');
        if (ampIdx > 0) href = href.substring(0, ampIdx);
      }
      href = decodeURIComponent(href);
      if (href.startsWith('http') && VIDEO_DOMAINS.test(href) && !href.includes('google.com')) {
        addResult(href);
      }
    } catch { /* skip */ }
  }

  const scriptUrlRegex = /"(https?:\\\/\\\/(?:www\\.)?(?:youtube\\.com\\\/watch\\?v=[^"\\]+|youtu\\.be\\\/[^"\\]+|vimeo\\.com\\\/\d+|dailymotion\\.com\\\/video\\\/[^"\\]+)[^"]*)"/g;
  let scriptMatch: RegExpExecArray | null;
  while ((scriptMatch = scriptUrlRegex.exec(html)) !== null) {
    try {
      const decoded = scriptMatch[1].replace(/\\\//g, '/').replace(/\\u003d/g, '=').replace(/\\u0026/g, '&');
      addResult(decoded);
    } catch { /* skip */ }
  }

  if (results.length === 0) {
    console.log(`[Google Videos] No results from Google, falling back to Bing Videos for "${query}"`);
    const bingResults = await fetchBingVideos(query);
    return bingResults;
  }

  console.log(`[Google Videos] Found ${results.length} videos for "${query}"`);
  return results;
}

// ---------------------------------------------------------------------------
// Bing News Search — scrapes www.bing.com/news/search for recent headlines
// ---------------------------------------------------------------------------

export interface NewsResult {
  title: string;
  url: string;
  source: string;
  date?: string;
  snippet: string;
}

// ---------------------------------------------------------------------------
// Vimeo Search — fetches vimeo.com/search server-side to avoid CORS
// ---------------------------------------------------------------------------

export interface VimeoSearchResult {
  url: string;
  thumbnailUrl?: string;
  title?: string;
  duration?: string;
}

export async function fetchVimeoVideos(query: string): Promise<VimeoSearchResult[]> {
  const results: VimeoSearchResult[] = [];
  const seenIds = new Set<string>();

  const searchSources = [
    { url: `https://www.bing.com/videos/search?q=${encodeURIComponent(`site:vimeo.com ${query}`)}&FORM=HDRSC3`, referer: "https://www.bing.com/" },
    { url: `https://duckduckgo.com/html/?q=${encodeURIComponent(`site:vimeo.com ${query}`)}`, referer: "https://duckduckgo.com/" },
    { url: `https://www.google.com/search?q=${encodeURIComponent(`site:vimeo.com ${query}`)}&tbm=vid`, referer: "https://www.google.com/" },
  ];

  const fetchPromises = searchSources.map(async (source) => {
    try {
      const res = await fetch(source.url, { headers: getStealthHeaders(source.referer) });
      if (!res.ok) return null;
      return await res.text();
    } catch {
      return null;
    }
  });

  const htmlSources = await Promise.allSettled(fetchPromises);

  for (const result of htmlSources) {
    if (result.status === 'fulfilled' && result.value) {
      const html = result.value;
      const vimeoUrlRegex = /vimeo\.com\/(\d{6,})/g;
      let match: RegExpExecArray | null;
      while ((match = vimeoUrlRegex.exec(html)) !== null) {
        seenIds.add(match[1]);
      }

      const linkRegex = /href="[^"]*vimeo\.com\/(\d{6,})[^"]*"/g;
      while ((match = linkRegex.exec(html)) !== null) {
        seenIds.add(match[1]);
      }
    }
  }

  const fetches = Array.from(seenIds).slice(0, 10).map(async (id) => {
    try {
      const oembedUrl = `https://vimeo.com/api/oembed.json?url=https://vimeo.com/${id}`;
      const oembedRes = await fetch(oembedUrl, {
        headers: getStealthHeaders("https://vimeo.com/"),
      });

      if (!oembedRes.ok) return null;

      const oembed: {
        title?: string;
        thumbnail_url?: string;
        duration?: number;
      } = await oembedRes.json();

      const configUrl = `https://player.vimeo.com/video/${id}/config`;
      const configRes = await fetch(configUrl, {
        headers: {
          ...getStealthHeaders("https://vimeo.com/"),
          "Referer": `https://vimeo.com/${id}`,
        },
      });

      let videoUrl = `https://player.vimeo.com/video/${id}`;
      if (configRes.ok) {
        const data: {
          request?: { files?: { progressive?: Array<{ url: string; width: number; height: number; quality: string }> } };
        } = await configRes.json();

        const progressive = data.request?.files?.progressive;
        if (progressive && progressive.length > 0) {
          const best = progressive.reduce((a, b) => {
            const qualityMap: Record<string, number> = { '1080p': 4, '720p': 3, '540p': 2, '360p': 1 };
            return (qualityMap[b.quality] ?? 0) > (qualityMap[a.quality] ?? 0) ? b : a;
          });
          videoUrl = best.url;
        }
      }

      const durationSec = oembed.duration;
      const duration = durationSec ? `${Math.floor(durationSec / 60)}:${String(durationSec % 60).padStart(2, '0')}` : undefined;

      return {
        url: videoUrl,
        thumbnailUrl: oembed.thumbnail_url,
        title: oembed.title || query,
        duration,
      } satisfies VimeoSearchResult;
    } catch {
      return null;
    }
  });

  const settled = await Promise.allSettled(fetches);
  for (const r of settled) {
    if (r.status === 'fulfilled' && r.value) {
      results.push(r.value);
    }
  }

  console.log(`[Vimeo] Found ${results.length} videos for "${query}"`);
  return results;
}

export async function fetchBingNews(query: string): Promise<NewsResult[]> {
  const searchUrl = `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&FORM=HDRSC7`;

  const res = await fetch(searchUrl, {
    headers: getStealthHeaders("https://www.bing.com/"),
  });

  if (!res.ok) {
    console.warn(`[Bing News] HTTP ${res.status} for "${query}"`);
    return [];
  }

  const html = await res.text();
  const results: NewsResult[] = [];

  // Bing news cards use <a class="title"> or data-title attributes
  const cardRegex = /<a[^>]+class="[^"]*title[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<div[^>]+class="[^"]*snippet[^"]*"[^>]*>([\s\S]*?)<\/div>[\s\S]*?(?:<span[^>]+class="[^"]*date[^"]*"[^>]*>([^<]+)<\/span>)?/g;
  let cardMatch: RegExpExecArray | null;
  while ((cardMatch = cardRegex.exec(html)) !== null) {
    const href = cardMatch[1];
    const title = cardMatch[2]?.replace(/<[^>]+>/g, '').trim() || '';
    const snippet = cardMatch[3]?.replace(/<[^>]+>/g, '').trim() || '';
    const dateStr = cardMatch[4]?.trim() || '';

    if (title && href && !results.some(r => r.url === href)) {
      const fullUrl = href.startsWith('http') ? href : `https://www.bing.com${href}`;
      // Try to extract source name from URL
      let source = 'News';
      try { source = new URL(fullUrl).hostname.replace('www.', ''); } catch { /* use default */ }
      results.push({ title, url: fullUrl, source, date: dateStr, snippet });
    }
  }

  // Fallback: simpler extraction
  if (results.length === 0) {
    const fallbackCardRegex = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/g;
    let fallbackMatch: RegExpExecArray | null;
    while ((fallbackMatch = fallbackCardRegex.exec(html)) !== null) {
      const href = fallbackMatch[1];
      const title = fallbackMatch[2]?.replace(/<[^>]+>/g, '').trim() || '';
      const snippet = fallbackMatch[3]?.replace(/<[^>]+>/g, '').trim() || '';
      if (title && href && href.includes('http') && !results.some(r => r.url === href)) {
        const fullUrl = href.startsWith('http') ? href : `https://www.bing.com${href}`;
        let source = 'News';
        try { source = new URL(fullUrl).hostname.replace('www.', ''); } catch { /* use default */ }
        results.push({ title, url: fullUrl, source, snippet });
      }
    }
  }

  console.log(`[Bing News] Found ${results.length} news items for "${query}"`);
  return results;
}

// ---------------------------------------------------------------------------
// Dailymotion Search — uses public api.dailymotion.com API to avoid CORS
// ---------------------------------------------------------------------------

export interface DailymotionSearchResult {
  url: string;
  thumbnailUrl?: string;
  title?: string;
  duration?: number;
}

interface DailymotionStreamMeta {
  title?: string;
  thumbnail_url?: string;
  thumbnail_720_url?: string;
  duration?: number;
  qualities?: {
    auto?: Array<{ url: string; type?: string }>;
    hd?: Array<{ url: string; type?: string }>;
    '1080'?: Array<{ url: string; type?: string }>;
    '720'?: Array<{ url: string; type?: string }>;
    '480'?: Array<{ url: string; type?: string }>;
    '380'?: Array<{ url: string; type?: string }>;
    '240'?: Array<{ url: string; type?: string }>;
  };
}

const DM_QUALITY_KEYS = ['1080', '720', 'hd', 'auto', '480', '380', '240'] as const;

function selectBestDailymotionStream(qualities: DailymotionStreamMeta['qualities']): { url: string; type?: string } | null {
  if (!qualities) return null;
  for (const key of DM_QUALITY_KEYS) {
    const streams = qualities[key];
    if (streams && streams.length > 0) {
      const mp4 = streams.find((s) => s.type?.includes('mp4') || s.url?.includes('.mp4'));
      return mp4 || streams[0];
    }
  }
  return null;
}

export async function fetchDailymotionVideos(query: string): Promise<DailymotionSearchResult[]> {
  const apiUrl = `https://api.dailymotion.com/videos?search=${encodeURIComponent(query)}&fields=id,title,url,thumbnail_720_url,duration&limit=10`;

  const res = await fetch(apiUrl, {
    headers: getStealthHeaders("https://www.dailymotion.com/"),
  });

  if (!res.ok) {
    console.warn(`[Dailymotion] HTTP ${res.status} for "${query}"`);
    return [];
  }

  const data = await res.json() as { list?: Array<{ id: string; title?: string; url?: string; thumbnail_720_url?: string; duration?: number }> };

  // Fetch metadata for each video to get the actual stream URL
  const fetches = (data.list || []).slice(0, 10).map(async (item) => {
    try {
      const metaRes = await fetch(`https://www.dailymotion.com/player/metadata/video/${item.id}`, {
        headers: getStealthHeaders("https://www.dailymotion.com/"),
      });
      if (!metaRes.ok) return null;

      const meta: DailymotionStreamMeta = await metaRes.json();
      const stream = selectBestDailymotionStream(meta.qualities);
      if (!stream?.url) return null;

      return {
        url: stream.url,
        thumbnailUrl: meta.thumbnail_720_url || meta.thumbnail_url || item.thumbnail_720_url,
        title: meta.title || item.title || query,
        duration: meta.duration || item.duration,
      } satisfies DailymotionSearchResult;
    } catch {
      return null;
    }
  });

  const settled = await Promise.allSettled(fetches);
  const results: DailymotionSearchResult[] = [];
  for (const r of settled) {
    if (r.status === 'fulfilled' && r.value) {
      results.push(r.value);
    }
  }

  console.log(`[Dailymotion] Found ${results.length} videos for "${query}"`);
  return results;
}

// ---------------------------------------------------------------------------
// Unsplash — server-side fetch via internal napi to avoid CORS issues
// ---------------------------------------------------------------------------

export async function fetchUnsplashImages(query: string): Promise<WebImageResult[]> {
  const apiUrl = `https://unsplash.com/napi/search/photos?query=${encodeURIComponent(query)}&per_page=20`;

  const res = await fetch(apiUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      "Accept": "application/json, text/plain, */*",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      "Referer": `https://unsplash.com/s/photos/${encodeURIComponent(query)}`,
      "sec-ch-ua": '"Google Chrome";v="125"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"macOS"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
    },
  });

  if (!res.ok) {
    console.warn(`[Unsplash] HTTP ${res.status} for "${query}"`);
    return [];
  }

  const data: {
    results?: Array<{
      urls?: { raw?: string; full?: string; regular?: string; small?: string };
      alt_description?: string;
      width?: number;
      height?: number;
    }>;
  } = await res.json();

  const results: WebImageResult[] = [];

  for (const item of data.results ?? []) {
    if (!item.urls?.regular) continue;

    results.push({
      url: item.urls.full || item.urls.regular,
      thumbnailUrl: item.urls.small,
      title: item.alt_description || query,
      width: item.width,
      height: item.height,
    });
  }

  console.log(`[Unsplash] Found ${results.length} images for "${query}"`);
  return results;
}

// ---------------------------------------------------------------------------
// Giphy — scrapes giphy.com/search/{query} for GIF IDs
// ---------------------------------------------------------------------------

export interface NasaImageResult {
  url: string;
  title?: string;
  nasaId?: string;
  sourceUrl?: string;
}

export async function fetchNASAImages(query: string): Promise<NasaImageResult[]> {
  const apiUrl = `https://images-api.nasa.gov/search?q=${encodeURIComponent(query)}&media_type=image&page_size=10`;

  const res = await fetch(apiUrl, {
    headers: {
      "User-Agent": getRandomUserAgent(),
      "Accept": "application/json",
    },
  });

  if (!res.ok) {
    console.warn(`[NASA] HTTP ${res.status} for "${query}"`);
    return [];
  }

  const data = await res.json() as {
    collection?: {
      items?: Array<{
        data?: Array<{ title?: string; nasa_id?: string }>;
        href?: string;
      }>;
    };
  };

  const items = data.collection?.items;
  if (!items || !Array.isArray(items)) return [];

  const results: NasaImageResult[] = [];

  const fetches = items.map(async (item) => {
    const meta = item.data?.[0];
    if (!meta) return null;

    const nasaId = meta.nasa_id;
    const title = meta.title || query;
    let imageUrl: string | null = null;

    if (item.href) {
      try {
        const manifestRes = await fetch(item.href, {
          headers: { "User-Agent": getRandomUserAgent(), "Accept": "application/json" },
        });
        if (manifestRes.ok) {
          const manifest = await manifestRes.json() as Array<{ href?: string }>;
          const origFile = manifest.find((f) => f.href?.includes('~orig.jpg'));
          const largeFile = manifest.find((f) => f.href?.includes('~large.jpg'));
          const chosen = origFile || largeFile;
          if (chosen?.href) {
            imageUrl = chosen.href;
          }
        }
      } catch {
      }
    }

    if (!imageUrl && nasaId) {
      imageUrl = `https://images-assets.nasa.gov/image/${nasaId}/${nasaId}~orig.jpg`;
    }

    if (!imageUrl) return null;

    return {
      url: imageUrl,
      title,
      nasaId,
      sourceUrl: nasaId ? `https://images.nasa.gov/details/${nasaId}` : undefined,
    } satisfies NasaImageResult;
  });

  const settled = await Promise.allSettled(fetches);
  for (const r of settled) {
    if (r.status === 'fulfilled' && r.value) {
      results.push(r.value);
    }
  }

  console.log(`[NASA] Found ${results.length} images for "${query}"`);
  return results;
}

export async function fetchHybridScraperImages(query: string): Promise<WebImageResult[]> {
  const [bing, ddg, google] = await Promise.allSettled([
    fetchBingImages(query),
    fetchDuckDuckGoImages(query),
    fetchGoogleImages(query),
  ]);

  const seen = new Set<string>();
  const results: WebImageResult[] = [];

  for (const group of [bing, ddg, google]) {
    if (group.status !== 'fulfilled') continue;
    for (const item of group.value) {
      if (seen.has(item.url)) continue;
      seen.add(item.url);
      results.push(item);
    }
  }

  console.log(`[HybridScraper] Found ${results.length} images for "${query}"`);
  return results;
}

export async function fetchGovPressImages(query: string): Promise<WebImageResult[]> {
  const GOV_DOMAINS = ['.gov', '.mil', '.gov.uk', '.gov.au', '.gc.ca'];

  function isGovDomain(url: string): boolean {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      return GOV_DOMAINS.some(d => hostname.endsWith(d));
    } catch {
      return false;
    }
  }

  const results: WebImageResult[] = [];
  const seenUrls = new Set<string>();

  const searchQueries = [
    `site:gov ${query} official photo`,
    `site:mil ${query} official photo`,
    `${query} whitehouse.gov OR defense.gov OR state.gov photo`,
  ];

  const allFetches = searchQueries.map(async (searchQuery) => {
    const searchUrl = `https://www.bing.com/images/search?q=${encodeURIComponent(searchQuery)}&form=HDRSC2&first=1&count=35`;

    try {
      const res = await fetch(searchUrl, {
        headers: getStealthHeaders("https://www.bing.com/"),
      });

      if (!res.ok) {
        console.warn(`[GovPress] HTTP ${res.status} for query`);
        return [];
      }

      const html = await res.text();
      const queryResults: WebImageResult[] = [];
      const iuscRegex = /<a[^>]+class="iusc"[^>]+m="([^"]+)"[^>]*>/g;
      let match: RegExpExecArray | null;

      while ((match = iuscRegex.exec(html)) !== null) {
        try {
          const data = JSON.parse(match[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'"));
          const imageUrl: string | undefined = data.imgurl || data.murl;
          const pageUrl: string | undefined = data.purl;
          if (!imageUrl) continue;
          if (isLowQualityDomain(imageUrl)) continue;
          if (seenUrls.has(imageUrl)) continue;

          const sourceDomain = pageUrl || imageUrl;
          if (!isGovDomain(sourceDomain)) continue;

          seenUrls.add(imageUrl);

          queryResults.push({
            url: imageUrl,
            thumbnailUrl: data.turl,
            title: data.t || query,
            sourceUrl: pageUrl || imageUrl,
            width: typeof data.w === 'number' ? data.w : undefined,
            height: typeof data.h === 'number' ? data.h : undefined,
          });
        } catch {
          // Skip unparseable
        }
      }

      return queryResults;
    } catch (err) {
      console.warn(`[GovPress] Error fetching query`, err);
      return [];
    }
  });

  const settled = await Promise.allSettled(allFetches);
  for (const result of settled) {
    if (result.status === 'fulfilled') {
      results.push(...result.value);
    }
  }

  console.log(`[GovPress] Found ${results.length} government press images for "${query}"`);
  return results;
}

export async function fetchGiphyGifs(query: string): Promise<WebVideoResult[]> {
  const searchUrl = `https://giphy.com/search/${encodeURIComponent(query)}`;

  const res = await fetch(searchUrl, {
    headers: {
      "User-Agent": getRandomUserAgent(),
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      "Referer": "https://www.google.com/",
    },
  });

  if (!res.ok) {
    console.warn(`[Giphy] HTTP ${res.status} for "${query}"`);
    return [];
  }

  const html = await res.text();
  const results: WebVideoResult[] = [];
  const seenIds = new Set<string>();

  // Pattern 1: Extract GIF IDs from /gifs/...-{id}? links
  const slugIdRegex = /\/gifs\/[^"'\s]*?-(\w{8,})(?:\?|")/g;
  let match: RegExpExecArray | null;
  while ((match = slugIdRegex.exec(html)) !== null) {
    const id = match[1];
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    results.push({
      url: `https://media.giphy.com/media/${id}/giphy.mp4`,
      title: query,
      thumbnailUrl: `https://media.giphy.com/media/${id}/giphy.gif`,
      sourceUrl: `https://giphy.com/gifs/${id}`,
    });
  }

  // Pattern 2: data-gif-id attributes
  const dataIdRegex = /data-gif-id="(\w+)"/g;
  while ((match = dataIdRegex.exec(html)) !== null) {
    const id = match[1];
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    results.push({
      url: `https://media.giphy.com/media/${id}/giphy.mp4`,
      title: query,
      thumbnailUrl: `https://media.giphy.com/media/${id}/giphy.gif`,
      sourceUrl: `https://giphy.com/gifs/${id}`,
    });
  }

  // Pattern 3: media.giphy.com/media/{id}/ URLs in the HTML
  const mediaIdRegex = /media\.giphy\.com\/media\/(\w+)\//g;
  while ((match = mediaIdRegex.exec(html)) !== null) {
    const id = match[1];
    if (seenIds.has(id)) continue;
    seenIds.add(id);

    results.push({
      url: `https://media.giphy.com/media/${id}/giphy.mp4`,
      title: query,
      thumbnailUrl: `https://media.giphy.com/media/${id}/giphy.gif`,
      sourceUrl: `https://giphy.com/gifs/${id}`,
    });
  }

  console.log(`[Giphy] Found ${results.length} GIFs for "${query}"`);
  return results;
}
