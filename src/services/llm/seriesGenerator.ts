/**
 * Series metadata generation — produces playlist and series metadata for a video.
 */

import type { ScriptSegment } from '../../types';
import { logger } from '../logger';
import { fetchWithTimeout } from '../../utils/fetchWithTimeout';
import { openRouterMessageText } from '../../utils/openRouterMessageText';
import { sanitiseTopic } from './parsing';
import { DEFAULT_SCRIPT_MODEL } from './scriptGenerator';

const OPENROUTER_ENDPOINT = '/api/llm';

export interface SeriesMetadata {
  seriesName: string;
  episodeNumber: number;
  playlistDescription: string;
  episodeTitle: string;
}

/**
 * Generates playlist/series metadata for a video.
 * Produces a series name, episode number, playlist description, and episode title.
 */
export async function generateSeriesMetadata(
  segments: ScriptSegment[],
  topic: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<SeriesMetadata> {
  const scriptSummary = segments
    .map((s) => `[${s.type}] ${s.title}: ${s.narration.slice(0, 100)}`)
    .join('\n');

  const systemPrompt =
    'You are a YouTube playlist strategist. Generate series metadata for this video episode. Return ONLY a JSON object. No markdown, no preamble.';

  const userPrompt = `Here is a video script about "${sanitiseTopic(topic)}":\n\n${scriptSummary}\n\nGenerate series metadata:\n1. "seriesName": A catchy, brandable series name (max 40 chars) that groups videos on this topic\n2. "episodeNumber": 1 (this is the first episode)\n3. "playlistDescription": A 2-3 sentence description for the playlist this video belongs to\n4. "episodeTitle": A specific episode title with episode number format like "Ep. 1: [Title]"\n\nReturn ONLY a JSON object with these 4 fields.`;

  const fallback: SeriesMetadata = {
    seriesName: `Deep Dive: ${topic}`,
    episodeNumber: 1,
    playlistDescription: `A series exploring ${topic} in depth. Each episode covers a different angle.`,
    episodeTitle: `Ep. 1: ${topic}`,
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
      logger.warn('OpenRouter', `Series metadata generation failed (Status: ${response.status})`);
      return fallback;
    }

    const data = await response.json();
    const rawContent = openRouterMessageText(data?.choices?.[0]?.message);
  if (!rawContent) {
      return fallback;
    }

    const cleaned = rawContent.replace(/```json/g, '').replace(/```/g, '').trim();
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return fallback;
    }

    return {
      seriesName: typeof parsed.seriesName === 'string' ? parsed.seriesName.slice(0, 40) : fallback.seriesName,
      episodeNumber: typeof parsed.episodeNumber === 'number' ? parsed.episodeNumber : 1,
      playlistDescription: typeof parsed.playlistDescription === 'string' ? parsed.playlistDescription : fallback.playlistDescription,
      episodeTitle: typeof parsed.episodeTitle === 'string' ? parsed.episodeTitle : fallback.episodeTitle,
    };
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    logger.warn('OpenRouter', 'Series metadata generation failed, using fallback', err);
    return fallback;
  }
}
