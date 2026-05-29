/**
 * Hashtag generation — produces 3-5 optimized hashtags for YouTube videos.
 */

import { logger } from '../logger';
import { fetchWithTimeout } from '../../utils/fetchWithTimeout';
import { sanitiseTopic } from './parsing';
import { DEFAULT_SCRIPT_MODEL } from './scriptGenerator';

const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * Generates 3-5 hashtags following the pattern:
 * #topic, #topicExplained, #topic2026, #style, #channelName
 */
export async function generateHashtags(
  topic: string,
  style: string,
  channelName: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const safeTopic = sanitiseTopic(topic);
  const currentYear = new Date().getFullYear();

  const systemPrompt =
    'You are a YouTube SEO expert. Generate exactly 3-5 hashtags for a video. Return ONLY a JSON array of strings. No markdown, no preamble.';

  const userPrompt = `Generate 3-5 YouTube hashtags for a video about "${safeTopic}" in the "${style}" style.\n\nHASHTAG FORMAT RULES:\n1. First hashtag: #topic (lowercase, no spaces) — e.g., #cybersecurity, #spacex, #ai\n2. Second hashtag: #topicExplained — e.g., #cybersecurityexplained\n3. Third hashtag: #topic${currentYear} — e.g., #cybersecurity${currentYear}\n4. Fourth hashtag (optional): #style category — e.g., #documentary, #business, #tech\n5. Fifth hashtag (optional): #channelName — use "${channelName || 'AutoTube'}"\n\nEach hashtag must be:\n- All lowercase\n- No spaces or special characters (only alphanumeric)\n- Max 30 characters each\n- Relevant to the video content\n\nReturn ONLY a JSON array of hashtag strings (with # prefix).`;

  const fallback = generateFallbackHashtags(safeTopic, currentYear, channelName);

  try {
    const response = await fetchWithTimeout(
      OPENROUTER_ENDPOINT,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://autotube.video',
          'X-Title': 'AutoTube AI Generator',
        },
        body: JSON.stringify({
          model: DEFAULT_SCRIPT_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          response_format: { type: 'json_object' },
        }),
      },
      {
        timeoutMs: 15_000,
        maxRetries: 2,
        signal,
      },
    );

    if (!response.ok) {
      return fallback;
    }

    const data = await response.json();
    const rawContent: unknown = data?.choices?.[0]?.message?.content;
    if (typeof rawContent !== 'string' || !rawContent.trim()) {
      return fallback;
    }

    const cleaned = rawContent.replace(/```json/g, '').replace(/```/g, '').trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
      if (!arrayMatch) return fallback;
      parsed = JSON.parse(arrayMatch[0]);
    }

    const rawArray: unknown[] = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as Record<string, unknown>).hashtags)
        ? ((parsed as Record<string, unknown>).hashtags as unknown[])
        : [];

    if (rawArray.length === 0) return fallback;

    const hashtags = rawArray
      .filter((h): h is string => typeof h === 'string')
      .map((h) => h.startsWith('#') ? h : `#${h}`)
      .filter((h) => h.length <= 31) // # + 30 chars
      .slice(0, 5);

    // Ensure minimum 3 hashtags
    if (hashtags.length < 3) {
      return fallback.slice(0, 5);
    }

    logger.success('OpenRouter', `Generated ${hashtags.length} hashtags`);
    return hashtags;
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    return fallback;
  }
}

/**
 * Generates fallback hashtags without LLM when API is unavailable.
 */
function generateFallbackHashtags(topic: string, year: number, channelName: string): string[] {
  const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 20);
  const hashtags: string[] = [
    `#${slug}`,
    `#${slug}explained`,
    `#${slug}${year}`,
  ];
  if (channelName) {
    hashtags.push(`#${channelName.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 20)}`);
  }
  return hashtags.slice(0, 5);
}
