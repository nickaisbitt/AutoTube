import { TopicConfig, ScriptSegment } from '../types';

const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
import { logger } from './logger';

/**
 * Generates a full video script using OpenRouter.
 * Returns a JSON array of ScriptSegment objects.
 */
export async function generateAIScript(config: TopicConfig, apiKey: string): Promise<ScriptSegment[]> {
  const systemPrompt = `You are a world-class YouTube scriptwriter for a channel similar to Business Insider, Vox, or Bloomberg Tech.
You produce high-engagement, punchy, and visually-driven scripts.

Output REQUIREMENT:
You must return only a valid JSON array of segments. No markdown formatting, no preamble.
Each segment object must follow this interface:
{
  "type": "intro" | "section" | "transition" | "outro",
  "title": "string (short header)",
  "narration": "string (prose to be spoken, STRICT MAX 20-25 words per segment for rapid pacing)",
  "visualNote": "string (detailed description of what to show on screen)",
  "duration": number (estimated duration in seconds, strictly 4-7 seconds)
}

Channel Style: ${config.style.replace('_', ' ')}
Tone: Journalistic, urgent, and high-velocity.
Target Total Duration: ${config.targetDuration} minutes

The script must have a rapid 'pattern interrupt' flow. Use short, impactful sentences.
Ensure the visual notes are concrete and harvestable.`;

  const userPrompt = `Write a rapid-paced video script about: "${config.topic}"
The script should be optimized for a ${config.targetDuration} minute video.
Break it down into at least ${Math.max(12, Math.min(24, config.targetDuration * 6))} segments to maximize visual velocity.`;

  try {
    const response = await fetch(OPENROUTER_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://autotube.video', // Optional for OpenRouter
        'X-Title': 'AutoTube AI Generator',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-001', // Fast and accurate for structure
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' }
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      logger.error('OpenRouter', `Script generation failed (Status: ${response.status})`, err);
      throw new Error(`OpenRouter Error: ${err}`);
    }

    const data = await response.json();
    logger.success('OpenRouter', 'Successfully generated script structure.');
    const rawContent = data.choices?.[0]?.message?.content;
    if (!rawContent) {
      logger.warn('OpenRouter', 'API returned no content in response');
      throw new Error('AI returned empty response');
    }
    let content = rawContent;
    
    // Some models wrap JSON in markdown blocks
    content = content.replace(/```json/g, '').replace(/```/g, '').trim();

    try {
      const parsed = JSON.parse(content);
      // Handle models that return { "segments": [...] } instead of raw array
      const segments = Array.isArray(parsed) ? parsed : (parsed.segments || []);
      
      return segments.map((s: any) => ({
        id: Math.random().toString(36).substring(2, 11),
        type: s.type || 'section',
        title: s.title || 'Untitled Segment',
        narration: s.narration || `${config.topic}: ${s.title || 'More details'}.`,
        visualNote: s.visualNote || 'Relevant B-roll',
        duration: s.duration || 10,
      }));
    } catch (parseErr) {
      console.error('Failed to parse AI script content:', content);
      throw new Error('AI returned invalid JSON structure');
    }
  } catch (error) {
    console.error('generateAIScript failed:', error);
    throw error;
  }
}
