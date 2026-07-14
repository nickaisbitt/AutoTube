/**
 * Title generation — YouTube-optimized video title generation via LLM.
 */

import type { ScriptSegment } from '../../types';
import { logger } from '../logger';
import { fetchWithTimeout } from '../../utils/fetchWithTimeout';
import { openRouterMessageText } from '../../utils/openRouterMessageText';
import { sanitiseTopic } from './parsing';
import { DEFAULT_SCRIPT_MODEL } from './scriptGenerator';

const OPENROUTER_ENDPOINT = '/api/llm';

export interface TitleVariants {
  /** Direct/factual title — straightforward, informational */
  direct: string;
  /** Curiosity gap title — creates a knowledge gap the viewer must fill */
  curiosityGap: string;
  /** Emotional/urgent title — creates urgency and emotional pull */
  emotionalUrgent: string;
}

/**
 * Generates 3 title variants: direct/factual, curiosity gap, emotional/urgent.
 * Returns the best overall title plus all 3 variants.
 */
export async function generateTitleVariants(
  segments: ScriptSegment[],
  topic: string,
  apiKey: string,
  hookLine?: string,
  signal?: AbortSignal,
): Promise<TitleVariants> {
  const scriptSummary = segments
    .map((s) => `[${s.type}] ${s.title}: ${s.narration}`)
    .join('\n');

  const systemPrompt =
    'You are a YouTube title optimization expert. Generate exactly 3 title variants for the given video script. Return ONLY a JSON object with keys "direct", "curiosityGap", "emotionalUrgent". No markdown, no preamble.';

  const hookInstruction = hookLine
    ? `\n\nHOOK ALIGNMENT: The video's opening hook line is: "${hookLine}". At least one title must reference the hook's core claim.`
    : '';

  const userPrompt = `Generate 3 YouTube-optimized title variants for this video about "${sanitiseTopic(topic)}".\n\nScript:\n${scriptSummary}\n\nTitle requirements:\n- Each title: 40-70 characters\n- "direct": Factual, straightforward, informational. State what the video covers clearly.\n- "curiosityGap": Creates a knowledge gap. Use "Why...", "How...", "The truth about...", "What happens when..."\n- "emotionalUrgent": Creates urgency and emotional pull. Use loss framing, urgency, or emotional stakes.\n- All 3 must match the script's actual angle, not just the raw topic\n- Avoid generic patterns like "The Full Story" or "Everything You Need to Know"${hookInstruction}\n\nReturn ONLY a JSON object with keys "direct", "curiosityGap", "emotionalUrgent".`;

  const fallback: TitleVariants = {
    direct: topic,
    curiosityGap: `Why ${topic} Changes Everything`,
    emotionalUrgent: `The ${topic} Crisis Nobody's Talking About`,
  };

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
    const rawContent = openRouterMessageText(data?.choices?.[0]?.message);
  if (!rawContent) {
      return fallback;
    }

    const cleaned = (rawContent as string).replace(/```json/g, '').replace(/```/g, '').trim();
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return fallback;
    }

    const direct = typeof parsed.direct === 'string' && parsed.direct.trim().length >= 20
      ? parsed.direct.trim()
      : fallback.direct;
    const curiosityGap = typeof parsed.curiosityGap === 'string' && parsed.curiosityGap.trim().length >= 20
      ? parsed.curiosityGap.trim()
      : fallback.curiosityGap;
    const emotionalUrgent = typeof parsed.emotionalUrgent === 'string' && parsed.emotionalUrgent.trim().length >= 20
      ? parsed.emotionalUrgent.trim()
      : fallback.emotionalUrgent;

    logger.success('OpenRouter', `Generated 3 title variants`);
    return { direct, curiosityGap, emotionalUrgent };
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    logger.warn('OpenRouter', 'Title variant generation failed, using fallback', err);
    return fallback;
  }
}

/**
 * Generates a YouTube-optimized video title from the script content.
 * Returns the best title option, or the raw topic as fallback.
 */
export async function generateVideoTitle(
  segments: ScriptSegment[],
  topic: string,
  apiKey: string,
  hookLine?: string,
  signal?: AbortSignal,
): Promise<string> {
  const scriptSummary = segments
    .map((s) => `[${s.type}] ${s.title}: ${s.narration}`)
    .join('\n');

  const systemPrompt =
    'You are a YouTube title optimization expert. Generate exactly 3 title options for the given video script. Return ONLY a JSON array of 3 strings. No markdown, no preamble.';

  const hookInstruction = hookLine
    ? `\n\nHOOK ALIGNMENT (CRITICAL):\nThe video's opening hook line is: "${hookLine}". The title MUST echo or reference the core claim from this hook line. At least one title must contain a key phrase, number, or named entity from the hook. The title and hook should feel like they belong to the same story — a viewer who reads the title should immediately recognize the hook when the video starts.`
    : '';

  const userPrompt = `Generate 3 YouTube-optimized title options for this video about "${sanitiseTopic(topic)}".\n\nScript:\n${scriptSummary}\n\nTitle requirements:\n- 40-70 characters each\n- Match the script's actual angle, not just the raw topic\n- Use curiosity, conflict, or specificity to drive clicks\n- Avoid generic patterns like "The Full Story" or "Everything You Need to Know"${hookInstruction}\n\nReturn ONLY a JSON array of 3 title strings.`;

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
      logger.warn('OpenRouter', `Title generation failed (Status: ${response.status})`);
      return topic;
    }

    const data = await response.json();
    const rawContent = openRouterMessageText(data?.choices?.[0]?.message);
  if (!rawContent) {
      logger.warn('OpenRouter', 'Title generation returned empty content');
      return topic;
    }

    // Parse the response — expect a JSON array of strings
    const cleaned = (rawContent as string).replace(/```json/g, '').replace(/```/g, '').trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
      if (!arrayMatch) {
        logger.warn('OpenRouter', 'Title generation returned unparseable content');
        return topic;
      }
      parsed = JSON.parse(arrayMatch[0]);
    }

    // Handle { "titles": [...] } wrapper or bare array
    const titles: unknown[] = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as Record<string, unknown>).titles)
        ? ((parsed as Record<string, unknown>).titles as unknown[])
        : [];

    if (titles.length > 0) {
      // Pick the shortest valid title (≥20 chars) — shorter titles tend to perform better on YouTube
      const validTitles = titles.filter(
        (t): t is string => typeof t === 'string' && t.trim().length >= 20,
      );
      const bestTitle = validTitles.length > 0
        ? validTitles.sort((a, b) => a.length - b.length)[0].trim()
        : typeof titles[0] === 'string' && titles[0].trim()
          ? titles[0].trim()
          : null;
      if (bestTitle) {
        logger.success('OpenRouter', `Generated title: "${bestTitle}"`);
        return bestTitle;
      }
    }

    logger.warn('OpenRouter', 'Title generation returned no valid titles');
    return topic;
  } catch (err) {
    // If aborted, re-throw so the caller can handle cancellation
    if ((err as Error).name === 'AbortError') throw err;
    logger.warn('OpenRouter', 'Title generation failed, using raw topic', err);
    return topic;
  }
}
