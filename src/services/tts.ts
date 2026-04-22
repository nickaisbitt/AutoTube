import { logger } from './logger';

export async function generateOpenAITTS(
  text: string,
  apiKey: string,
  voice: string = 'alloy'
): Promise<string | null> {
  if (!apiKey) return null;

  try {
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice: voice,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      logger.error('OpenAI TTS', `Failed to generate audio (Status: ${response.status})`, err);
      return null;
    }

    const blob = await response.blob();
    logger.success('OpenAI TTS', `Successfully generated audio for segment (${Math.round(blob.size / 1024)} KB)`);
    return URL.createObjectURL(blob);
  } catch (err) {
    logger.error('OpenAI TTS', 'Exception during audio generation', err);
    return null;
  }
}

export const VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
