/**
 * Pinned comment generation — generates 3 pinned comment options from a script.
 */

import type { ScriptSegment } from '../../types';
import { logger } from '../logger';
import { fetchWithTimeout } from '../../utils/fetchWithTimeout';
import { openRouterMessageText } from '../../utils/openRouterMessageText';
import { sanitiseTopic } from './parsing';
import { DEFAULT_SCRIPT_MODEL } from './scriptGenerator';

const OPENROUTER_ENDPOINT = '/api/llm';

export interface PinnedComment {
  text: string;
  type: 'question_prompt' | 'controversial_take' | 'what_did_i_miss';
}

/**
 * Generates 3 pinned comment options from a script:
 * 1. Question prompt — asks viewers to engage with a specific question
 * 2. Controversial take — a provocative statement that provokes debate
 * 3. "What did I miss?" — invites viewers to add their knowledge
 */
export async function generatePinnedComments(
  segments: ScriptSegment[],
  topic: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<PinnedComment[]> {
  const scriptSummary = segments
    .map((s) => `[${s.type}] ${s.title}: ${s.narration.slice(0, 150)}`)
    .join('\n');

  const systemPrompt =
    'You are a YouTube engagement strategist. Generate 3 pinned comment options. Return ONLY a JSON array. No markdown, no preamble.';

  const userPrompt = `Here is a video script about "${sanitiseTopic(topic)}":\n\n${scriptSummary}\n\nGenerate exactly 3 pinned comment options:\n\n1. QUESTION PROMPT: A genuine question about the video topic that encourages viewers to share their experience or opinion. Must be specific to this video's content, not generic.\n2. CONTROVERSIAL TAKE: A bold, debatable opinion derived from the video's central argument. Should make viewers feel compelled to agree or disagree.\n3. WHAT DID I MISS?: An invitation for viewers to add information the video didn't cover. Should reference something specific from the video.\n\nEach comment should be 1-3 sentences, conversational, and feel like a real person wrote it — not AI. Include 1-2 relevant emojis per comment.\n\nReturn ONLY a JSON array of 3 objects with fields: "text", "type" (one of "question_prompt", "controversial_take", "what_did_i_miss").`;

  const fallback: PinnedComment[] = [
    { text: `What's your experience with ${topic}? Has it affected you or your business? Drop a comment below! 👇`, type: 'question_prompt' },
    { text: `Hot take: most people are completely underestimating how serious this ${topic} situation is. Change my mind. 🔥`, type: 'controversial_take' },
    { text: `What did I miss about ${topic}? There's so much more to cover — drop your knowledge below! 🧵`, type: 'what_did_i_miss' },
  ];

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
      logger.warn('OpenRouter', `Pinned comment generation failed (Status: ${response.status})`);
      return fallback;
    }

    const data = await response.json();
    const rawContent = openRouterMessageText(data?.choices?.[0]?.message);
  if (!rawContent) {
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
      : Array.isArray((parsed as Record<string, unknown>).comments)
        ? ((parsed as Record<string, unknown>).comments as unknown[])
        : [];

    if (rawArray.length === 0) return fallback;

    const validTypes = new Set(['question_prompt', 'controversial_take', 'what_did_i_miss']);
    const results: PinnedComment[] = [];
    const types: PinnedComment['type'][] = ['question_prompt', 'controversial_take', 'what_did_i_miss'];

    for (let i = 0; i < Math.min(3, rawArray.length); i++) {
      const item = rawArray[i] as Record<string, unknown>;
      const text = typeof item.text === 'string' ? item.text : fallback[i]?.text || '';
      const type = validTypes.has(String(item.type)) ? (item.type as PinnedComment['type']) : types[i];
      results.push({ text, type });
    }

    // Fill missing entries with fallback
    while (results.length < 3) {
      results.push(fallback[results.length]);
    }

    logger.success('OpenRouter', `Generated ${results.length} pinned comment options`);
    return results;
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    logger.warn('OpenRouter', 'Pinned comment generation failed, using fallback', err);
    return fallback;
  }
}
