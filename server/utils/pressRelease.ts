// ============================================================================
// Press Release Scraper — live web research during topic resolution
// ============================================================================

const SEARCH_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export interface PressReleaseResult {
  title: string;
  url: string;
  source: string;
  snippet: string;
  date?: string;
}

/**
 * Search for press releases about a topic entity.
 * Tries PRNewswire, BusinessWire, and general web search.
 */
export async function searchPressReleases(entity: string): Promise<PressReleaseResult[]> {
  const results: PressReleaseResult[] = [];
  const queries = [
    `${entity} press release`,
    `${entity} announces`,
    `${entity} unveils`,
    `${entity} launches`,
    `${entity} delivers`,
  ];

  for (const query of queries) {
    try {
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const res = await fetch(url, {
        headers: { "User-Agent": SEARCH_USER_AGENT },
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) continue;
      const html = await res.text();

      // Extract result links from DuckDuckGo HTML
      const linkRegex = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
      const snippetRegex = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
      const links = [...html.matchAll(linkRegex)];
      const snippets = [...html.matchAll(snippetRegex)];

      for (let i = 0; i < Math.min(links.length, 3); i++) {
        let href = links[i][1];
        // Parse DuckDuckGo redirect URLs to get the actual target URL
        if (href.includes('duckduckgo.com/l/?uddg=')) {
          try {
            const uddgMatch = href.match(/[?&]uddg=([^&]+)/);
            if (uddgMatch) href = decodeURIComponent(uddgMatch[1]);
          } catch { /* use original href */ }
        }
        const title = links[i][2]?.replace(/<[^>]+>/g, '').trim() || query;
        const snippet = snippets[i]?.[1]?.replace(/<[^>]+>/g, '').trim() || '';

        // Prioritize known press release domains
        const isPressDomain = /prnewswire|businesswire|globalnewswire|news?room/i.test(href);
        if (isPressDomain || title.toLowerCase().includes('press release')) {
          if (!results.some(r => r.url === href)) {
            results.push({ title, url: href, source: isPressDomain ? 'Press Release' : 'Web', snippet });
          }
        }
      }
    } catch (err) {
      // Timeout or fetch error — skip this query
      console.warn(`[PressRelease] Search failed for query "${query}":`, (err as Error).message);
    }
  }

  return results;
}

/**
 * Scrape the full text content from a press release URL.
 */
export async function scrapePressRelease(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": SEARCH_USER_AGENT },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;

    const html = await res.text();

    // Try to extract article text
    const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const content = articleMatch?.[1] || bodyMatch?.[1] || html;

    // Strip script and style blocks first
    let text = content
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '');

    // Extract text from common content containers
    const mainMatch = text.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
    const articleBodyMatch = text.match(/class="article-body"[^>]*>([\s\S]*?)<\/div>/i);
    const contentMatch = text.match(/class="content"[^>]*>([\s\S]*?)<\/div>/i);
    if (mainMatch) text = mainMatch[1];
    else if (articleBodyMatch) text = articleBodyMatch[1];
    else if (contentMatch) text = contentMatch[1];

    // Strip remaining HTML tags
    text = text
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<p[^>]*>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<li[^>]*>/gi, '\n- ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
      .replace(/\s+/g, ' ')
      .trim();

    // Keep first 2000 characters (enough for key facts)
    return text.substring(0, 2000);
  } catch (err) {
    console.warn(`[PressRelease] Scrape failed for ${url}:`, (err as Error).message);
    return null;
  }
}

/**
 * Extract key facts (dates, numbers, events) from text.
 */
export function extractKeyFacts(text: string): string[] {
  const facts: string[] = [];

  // Dates
  const datePatterns = [
    /(?:on|in|by)\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}/gi,
    /(?:in|by|during)\s+\d{4}/g,
    /(?:launched|delivered|unveiled|announced|released)\s+(?:in|on|by)\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)?\s*\d{4}/gi,
  ];

  for (const pattern of datePatterns) {
    const matches = text.match(pattern);
    if (matches) {
      for (const m of matches) {
        if (!facts.includes(m.trim())) facts.push(m.trim());
      }
    }
  }

  // Numbers (prices, percentages, counts)
  const numberPattern = /\$\s*\d[\d,.]*(?:\s*(?:billion|million|thousand|bn|mn))?|\d[\d,.]*\s*(?:billion|million|thousand|%)/gi;
  const numberMatches = text.match(numberPattern);
  if (numberMatches) {
    for (const m of numberMatches.slice(0, 5)) {
      if (!facts.includes(m.trim())) facts.push(m.trim());
    }
  }

  return facts.slice(0, 10);
}
