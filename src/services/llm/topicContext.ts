/**
 * Topic context helpers — Wikipedia and web search context fetching.
 */

import { fetchWithTimeout } from '../../utils/fetchWithTimeout';

/**
 * Lightweight Wikipedia summary fetch for script generation context.
 * Returns extract and description text, or empty strings on failure.
 */
export async function fetchWikiContext(topic: string): Promise<{ extract: string; description: string }> {
  const empty = { extract: '', description: '' };
  try {
    const WIKI_TIMEOUT = { timeoutMs: 8_000, maxRetries: 1 };
    // Step 1: find the best Wikipedia title via opensearch
    const osUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(topic)}&limit=5&namespace=0&format=json&origin=*`;
    let title: string | undefined;
    try {
      const r = await fetchWithTimeout(osUrl, {}, WIKI_TIMEOUT);
      if (r.ok) {
        const d = await r.json();
        const titles: string[] = d?.[1] || [];
        const descs: string[] = d?.[2] || [];
        for (let i = 0; i < titles.length; i++) {
          if (!/may refer to|disambiguation/i.test(descs[i] || '')) {
            title = titles[i];
            break;
          }
        }
      }
    } catch (err) { console.warn('Wikipedia search failed:', err); /* fall through */ }

    if (!title) return empty;

    // Step 2: fetch the summary page for extract + description
    const sumUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    const sr = await fetchWithTimeout(sumUrl, {}, WIKI_TIMEOUT);
    if (!sr.ok) return empty;
    const sum = await sr.json();
    if (sum.type === 'disambiguation') return empty;

    return {
      extract: typeof sum.extract === 'string' ? sum.extract : '',
      description: typeof sum.description === 'string' ? sum.description : '',
    };
  } catch (err) {
    console.warn('Wikipedia summary fetch failed:', err);
    return empty;
  }
}

/**
 * Fetch recent web context about a topic via the DDG search proxy.
 * Only works in dev mode (the /api/search proxy). In production it returns
 * an empty string and the script falls back to LLM training data.
 */
export async function fetchTopicContext(topic: string): Promise<string> {
  try {
    const res = await fetchWithTimeout(
      `/api/search?q=${encodeURIComponent(topic + ' news 2026')}`,
      {},
      { timeoutMs: 8_000, maxRetries: 1 },
    );
    if (!res.ok) return '';
    const data = await res.json();
    const results = (data as Record<string, unknown>)?.results;
    if (!Array.isArray(results)) return '';
    const context = (results as Array<Record<string, unknown>>)
      .slice(0, 5)
      .map((r) => `- ${r.title ?? ''}`)
      .filter((line) => line.length > 2)
      .join('\n');
    return context ? `\nCURRENT CONTEXT (from recent web search):\n${context}\n` : '';
  } catch (err) {
    console.warn('Topic context web search failed:', err);
    return '';
  }
}
