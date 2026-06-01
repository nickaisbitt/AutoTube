import { TopicContext } from '../types';
import { logger } from './logger';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import { extractJson } from '../utils/extractJson';
import { sanitiseTopic } from './llm/index';

// Default model — matches the script generator for consistency.
export const DEFAULT_VISUAL_MODEL = 'openai/gpt-5.4-mini';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LlmShot {
  concept: string;
  queries: string[];
  vibe: string;
}

export type ScriptLineClassification = 'personal' | 'institutional' | 'geopolitical' | 'practical';

export interface LlmVisualPlan {
  intent: string;
  queries: string[];
  visualConcept: string;
  shots?: LlmShot[];
  /** Classification of the segment's narrative scope for visual scale selection. */
  classification?: ScriptLineClassification;
}

// ---------------------------------------------------------------------------
// Runtime validation
// ---------------------------------------------------------------------------

/* @internal */
export function validateShot(raw: unknown): LlmShot | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  const concept = typeof s.concept === 'string' ? s.concept.trim() : '';
  const vibe = typeof s.vibe === 'string' ? s.vibe.trim() : 'documentary';
  const queries = Array.isArray(s.queries)
    ? (s.queries as unknown[]).filter((q): q is string => typeof q === 'string' && q.trim().length > 0)
    : [];
  if (!concept) return null;
  return { concept, queries, vibe };
}

/* @internal */
export function validateVisualPlan(raw: unknown, fallbackTopic: string): LlmVisualPlan {
  if (!raw || typeof raw !== 'object') {
    return { intent: 'Establish visual context', queries: [fallbackTopic], visualConcept: 'Neutral documentary' };
  }
  let p = raw as Record<string, unknown>;

  // Unwrap a nested "plan" wrapper object if present
  if (p.plan && typeof p.plan === 'object' && !Array.isArray(p.plan)) {
    p = p.plan as Record<string, unknown>;
  }

  const intent = typeof p.intent === 'string' && p.intent.trim() ? p.intent.trim() : 'Establish visual context';
  const visualConcept =
    typeof p.visualConcept === 'string' && p.visualConcept.trim()
      ? p.visualConcept.trim()
      : typeof p.visual_concept === 'string' && (p.visual_concept as string).trim()
        ? (p.visual_concept as string).trim()
        : 'High-quality documentary style';

  // Try all known key patterns for primary/secondary shots
  const primaryShot =
    validateShot(p.primaryShot) ||
    validateShot(p.primary_shot) ||
    validateShot(p.shot1) ||
    validateShot(p.primary);
  const secondaryShot =
    validateShot(p.secondaryShot) ||
    validateShot(p.secondary_shot) ||
    validateShot(p.shot2) ||
    validateShot(p.secondary);
  
  // Also check for a "shots" array (some models return this format)
  let extraShots: LlmShot[] = [];
  if (Array.isArray(p.shots)) {
    extraShots = (p.shots as unknown[])
      .map(s => validateShot(s))
      .filter((s): s is LlmShot => s !== null);
  }
  
  const allShots = [primaryShot, secondaryShot, ...extraShots].filter((s): s is LlmShot => s !== null);
  // Deduplicate by concept
  const seen = new Set<string>();
  const shots = allShots.filter(s => {
    if (seen.has(s.concept)) return false;
    seen.add(s.concept);
    return true;
  });

  const combinedQueries = [
    ...(primaryShot?.queries ?? []),
    ...(secondaryShot?.queries ?? []),
    ...extraShots.flatMap(s => s.queries),
  ];

  // If intent is the generic fallback and we have no shots, try harder:
  // scan all object values for anything that looks like a shot
  if (intent === 'Establish visual context' && shots.length === 0) {
    for (const value of Object.values(p)) {
      if (value && typeof value === 'object') {
        const maybeShot = validateShot(value);
        if (maybeShot && !seen.has(maybeShot.concept)) {
          shots.push(maybeShot);
          seen.add(maybeShot.concept);
          combinedQueries.push(...maybeShot.queries);
        }
        // Also check arrays of shot-like objects
        if (Array.isArray(value)) {
          for (const item of value) {
            const arrShot = validateShot(item);
            if (arrShot && !seen.has(arrShot.concept)) {
              shots.push(arrShot);
              seen.add(arrShot.concept);
              combinedQueries.push(...arrShot.queries);
            }
          }
        }
      }
    }
  }

  const queries = combinedQueries.length > 0 ? combinedQueries : [fallbackTopic];

  // Extract classification if present and valid
  const validClassifications: ScriptLineClassification[] = ['personal', 'institutional', 'geopolitical', 'practical'];
  const rawClassification = typeof p.classification === 'string' ? p.classification.trim().toLowerCase() : undefined;
  const classification = rawClassification && validClassifications.includes(rawClassification as ScriptLineClassification)
    ? (rawClassification as ScriptLineClassification)
    : undefined;

  const plan: LlmVisualPlan = { intent, queries, visualConcept, shots };
  if (classification) {
    plan.classification = classification;
  }
  return plan;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function generateAIPlan(
  segmentText: string,
  topicContext: TopicContext,
  apiKey: string,
  model = DEFAULT_VISUAL_MODEL,
  signal?: AbortSignal,
  segmentTitle?: string,
): Promise<LlmVisualPlan> {
  const topic = sanitiseTopic(topicContext.resolvedTitle || topicContext.topic);
  const fallbackTopic = topic;

  const titleLine = segmentTitle ? `\nSEGMENT TITLE: ${segmentTitle}` : '';
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const prompt = `You are a professional Creative Director and photo researcher.

ABSOLUTE RULE — READ THIS FIRST:
NEVER return generic concepts like "Establish visual context", "Supporting b-roll", "Visual representation", or any abstract phrase. If you return "Establish visual context" or any generic phrase, your response will be REJECTED. Every shot MUST name a specific person, place, object, or scene that can be image-searched.

IMPORTANT: Today is ${today}. The information in the following topic and narration may be based on your training data, which could be outdated. Use common sense — if the narration makes claims about events in 2025 or 2026, judge them against the current date.

Plan TWO DISTINCT SHOTS for this specific video segment. Each shot must have MULTIPLE diverse search queries targeting different source types.

TOPIC: ${topic}${titleLine}
DESCRIPTION: ${topicContext.description}
NARRATION: "${segmentText}"
${topicContext.recentNews && topicContext.recentNews.length > 0 ? `\nRECENT NEWS (live from web):\n${topicContext.recentNews.map((n, i) => `  ${i + 1}. [${n.source}] ${n.headline}${n.date ? ` (${n.date})` : ''} — ${n.snippet.substring(0, 200)}`).join('\n')}` : ''}
${topicContext.extract ? `\nWIKIPEDIA CONTEXT:\n${topicContext.extract.substring(0, 1000)}` : ''}

CRITICAL:
1. Your shots MUST be about the NARRATION above.
2. Provide TWO distinct shots (Primary and Secondary) to maintain visual velocity.
3. Your shots must be SPECIFIC and SEARCHABLE. Instead of "Establish visual context", say exactly what should be on screen: "Aerial shot of NCL Luna cruise ship at Port of Miami", "Close-up of Fincantieri shipyard construction".
4. For EACH shot, provide 3-4 diverse search queries targeting different source types:
   - A general web search query
   - An official/press source query (targeting company press rooms, news outlets)
   - A location or context query (maps, aerial views, related entities)
   - A detail or close-up query
5. CLASSIFY this segment as one of: personal, institutional, geopolitical, or practical.
   - "personal": Individual human stories, personal risk, identity, money, family impact → use INTIMATE visuals (close-ups, faces, hands, screens, personal spaces)
   - "institutional": Corporate/organizational threats, company systems, business operations → use MEDIUM-SCALE visuals (offices, servers, dashboards, teams, buildings)
   - "geopolitical": Nation-state actors, global infrastructure, international conflict → use WIDE-CONTEXT visuals (maps, infrastructure, satellite imagery, government buildings, military)
   - "practical": Advice, protection steps, actionable tips → use CLEAR/INSTRUCTIONAL visuals (checklists, UI screenshots, step-by-step, clean graphics)
6. Your shot choices MUST match the classification scale. Personal segments need intimate shots. Geopolitical segments need wide-context shots. When the story shifts scope, the visual language must shift too.

Return JSON:
{
  "intent": "Editorial goal for this segment",
  "classification": "personal | institutional | geopolitical | practical",
  "primaryShot": {
    "concept": "Specific visual focus — name a real person, place, object, or scene",
    "queries": ["General search for this shot", "Official/press source query", "Location or context query", "Detail or close-up query"],
    "vibe": "Visual mood"
  },
  "secondaryShot": {
    "concept": "Specific cutaway — name a real person, place, object, or scene",
    "queries": ["General search for this shot", "Official/press source query", "Location or context query", "Detail or close-up query"],
    "vibe": "Visual mood"
  },
  "visualConcept": "Overall vibe"
}`;

  try {
    const response = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      }),
    }, {
      timeoutMs: 20_000,
      maxRetries: 2,
      signal,
    });

    if (!response.ok) {
      logger.warn('VisualDirector', `AI Plan request failed (${response.status}), using fallback`);
      return { intent: 'Fallback visual', queries: [fallbackTopic], visualConcept: 'Neutral documentary' };
    }

    const data = await response.json();
    const rawContent: unknown = data?.choices?.[0]?.message?.content;

    if (typeof rawContent !== 'string' || !rawContent.trim()) {
      logger.warn('VisualDirector', 'AI Plan returned no content, using fallback');
      return { intent: 'Fallback visual', queries: [fallbackTopic], visualConcept: 'Neutral documentary' };
    }

    const parsed = extractJson(rawContent);
    if (parsed === null) {
      logger.warn('VisualDirector', 'JSON extraction failed for AI Plan, using fallback');
      return { intent: 'Fallback visual', queries: [fallbackTopic], visualConcept: 'Neutral documentary' };
    }

    const plan = validateVisualPlan(parsed, fallbackTopic);
    logger.info('VisualDirector', `Plan generated: "${plan.intent}" (${plan.shots?.length ?? 0} shots)`);
    return plan;
  } catch (error) {
    logger.error('VisualDirector', 'Exception during AI Plan generation', error);
    return { intent: 'Fallback visual', queries: [fallbackTopic, segmentText.slice(0, 30)], visualConcept: 'Neutral documentary' };
  }
}
