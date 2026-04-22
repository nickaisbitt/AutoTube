import { TopicContext } from '../types';

interface LlmVisualPlan {
  intent: string;
  queries: string[];
  visualConcept: string;
  shots?: {
    concept: string;
    queries: string[];
    vibe: string;
  }[];
}

export async function generateAIPlan(
  segmentText: string,
  topicContext: TopicContext,
  apiKey: string,
): Promise<LlmVisualPlan> {
  const model = 'google/gemini-2.0-flash-001';
  const topic = topicContext.resolvedTitle || topicContext.topic;
  
  const prompt = `
You are a professional Creative Director. Plan TWO DISTINCT SHOTS for this specific video segment.

TOPIC: ${topic}
DESCRIPTION: ${topicContext.description}
NARRATION: "${segmentText}"

CRITICAL: 
1. Your shots MUST be about the NARRATION above. 
2. DO NOT include "Nvidia" or "Blackwell" unless they are part of the topic above. 
3. Provide TWO distinct shots (Primary and Secondary) to maintain visual velocity.

Return JSON:
{
  "intent": "Editorial goal for this segment",
  "primaryShot": {
    "concept": "Specific visual focus",
    "queries": ["Search term 1", "Search term 2"],
    "vibe": "Visual mood"
  },
  "secondaryShot": {
    "concept": "Supporting b-roll",
    "queries": ["Search term 1", "Search term 2"],
    "vibe": "Visual mood"
  },
  "visualConcept": "Overall vibe"
}
`;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) throw new Error('OpenRouter AI Plan request failed');
    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content;
    if (!rawContent) throw new Error('AI Plan returned no content');
    let contentStr = rawContent;
    
    // Clean markdown blocks
    contentStr = contentStr.replace(/```json/g, '').replace(/```/g, '').trim();
    const content = JSON.parse(contentStr);

    // Map the dual shot structure back to the expected queries list for the harvester
    const combinedQueries = [
      ...(content.primaryShot?.queries || []),
      ...(content.secondaryShot?.queries || [])
    ];

    return {
      intent: content.intent || 'Establish visual context',
      queries: combinedQueries,
      visualConcept: content.visualConcept || 'High-quality documentary style',
      shots: [content.primaryShot, content.secondaryShot].filter(Boolean)
    } as any;
  } catch (error) {
    console.error('Failed to generate AI visual plan:', error);
    // Fallback to minimal plan
    return {
      intent: 'Fallback visual',
      queries: [topic, segmentText.slice(0, 30)],
      visualConcept: 'Neutral documentary',
    };
  }
}
