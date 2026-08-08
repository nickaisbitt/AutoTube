/**
 * Cheap text (optional thumb) relevance gate for harvested motion clips.
 * Default model: qwen/qwen3.7-flash with reasoning disabled so content is JSON.
 */
import { openRouterMessageText } from './openRouterMessageText.mjs';

export const DEFAULT_RELEVANCE_MODEL = 'qwen/qwen3.7-flash';

/**
 * System prompt for the harvest relevance judge.
 * Exported for unit tests that assert policy wording.
 */
export const RELEVANCE_SYSTEM_PROMPT = [
  'You judge whether ONE stock/web video clip belongs in a serious news YouTube segment.',
  'Use the topic, segment beat, clip title/alt, and search query. Thumbnail is optional supporting evidence.',
  'Reply ONLY JSON: {"decision":"KEEP"|"WEAK"|"REJECT","reason":"short"}',
  'KEEP = real footage of the topic\'s subject matter (same visual family as the beat), even when era, brand, location, or packaging does not match the scripted scandal.',
  'Examples: beekeeping/hive beats → KEEP bees, hives, honeycomb, apiary, beekeepers at work (modern or historic is fine); aviation/cabin-pressure → KEEP cabin interior, oxygen masks, cockpit, pressurization, passengers in flight, or aircraft maintenance — wrong airline name is OK.',
  'Do NOT REJECT solely because footage looks modern, generic stock, or from a different decade/place than the beat — that is still KEEP when the subject is correct, or WEAK when it is only loosely related establishing.',
  'WEAK = vaguely related establishing (airport/hangar with no cabin stakes; countryside with no bees/hives), neighbor topics without beat visuals, or historic training film with no topical subject stakes.',
  'Era or brand mismatch alone is WEAK, never REJECT, when the clip still shows the topic\'s real subject.',
  'REJECT = fiction/music video/movie trailer, chyron/logo/title-card only, clearly wrong industry (hospital, sports, postal for a hive/aviation story), meme/cartoon, or training-slide graphic with no real scene.',
].join(' ');

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function relevanceGateEnabled(env = process.env) {
  const raw = env?.HARVEST_RELEVANCE_GATE;
  if (raw === '0' || raw === 'false') return false;
  return true;
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {number}
 */
export function relevanceGateBudget(env = process.env) {
  const n = Number.parseInt(String(env?.HARVEST_RELEVANCE_BUDGET ?? '48'), 10);
  return Number.isFinite(n) && n > 0 ? n : 48;
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export function relevanceModelId(env = process.env) {
  return (
    env?.OPENROUTER_RELEVANCE_MODEL
    || env?.OPENROUTER_MODEL
    || DEFAULT_RELEVANCE_MODEL
  ).trim();
}

/**
 * @param {'KEEP'|'WEAK'|'REJECT'|string|null|undefined} decision
 * @param {{ isIntro?: boolean }} [opts]
 * @returns {boolean}
 */
export function shouldRejectRelevanceDecision(decision, { isIntro = false } = {}) {
  if (decision === 'REJECT') return true;
  if (decision === 'WEAK' && isIntro) return true;
  return false;
}

/**
 * @param {object} input
 * @param {string} [input.topic]
 * @param {string} [input.segmentTitle]
 * @param {string} [input.segmentType]
 * @param {string} [input.clipTitle]
 * @param {string} [input.clipAlt]
 * @param {string} [input.query]
 * @param {string} [input.source]
 * @returns {string}
 */
export function buildRelevanceUserText(input = {}) {
  const lines = [
    `Topic: ${(input.topic || '').trim() || '(none)'}`,
    `Segment type: ${(input.segmentType || '').trim() || 'body'}`,
    `Segment beat: ${(input.segmentTitle || '').trim() || '(none)'}`,
    `Clip title: ${(input.clipTitle || '').trim() || '(none)'}`,
    `Clip alt: ${(input.clipAlt || '').trim() || '(none)'}`,
    `Search query: ${(input.query || '').trim() || '(none)'}`,
    `Source: ${(input.source || '').trim() || '(none)'}`,
    'Decide KEEP, WEAK, or REJECT for this segment beat.',
  ];
  return lines.join('\n');
}

/**
 * @param {string} raw
 * @returns {{ decision: 'KEEP'|'WEAK'|'REJECT'|null, reason: string }}
 */
export function parseRelevanceDecision(raw) {
  if (!raw || typeof raw !== 'string') return { decision: null, reason: 'empty' };
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}') + 1;
  if (start < 0 || end <= start) return { decision: null, reason: 'no-json' };
  let parsed;
  try {
    parsed = JSON.parse(raw.slice(start, end));
  } catch {
    return { decision: null, reason: 'malformed' };
  }
  const decision = String(parsed?.decision || '').toUpperCase();
  if (decision !== 'KEEP' && decision !== 'WEAK' && decision !== 'REJECT') {
    return { decision: null, reason: 'bad-decision' };
  }
  return { decision, reason: String(parsed.reason || '').slice(0, 240) };
}

/**
 * @param {object} input
 * @param {string} input.apiKey
 * @param {string} [input.topic]
 * @param {string} [input.segmentTitle]
 * @param {string} [input.segmentType]
 * @param {string} [input.clipTitle]
 * @param {string} [input.clipAlt]
 * @param {string} [input.query]
 * @param {string} [input.source]
 * @param {string} [input.thumbnailUrl]
 * @param {string} [input.model]
 * @returns {Promise<{ ran: boolean, decision: 'KEEP'|'WEAK'|'REJECT'|null, reason: string }>}
 */
export async function judgeHarvestRelevance(input = {}) {
  const apiKey = (input.apiKey || '').trim();
  if (!apiKey) return { ran: false, decision: null, reason: 'missing-key' };

  const userText = buildRelevanceUserText(input);
  /** @type {Array<object>} */
  const userContent = [{ type: 'text', text: userText }];
  const thumb = (input.thumbnailUrl || '').trim();
  if (thumb && /^https?:\/\//i.test(thumb)) {
    userContent.push({ type: 'image_url', image_url: { url: thumb } });
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://autotube.video',
        'X-Title': 'AutoTube Harvest Relevance Gate',
      },
      body: JSON.stringify({
        model: (input.model || relevanceModelId()).trim() || DEFAULT_RELEVANCE_MODEL,
        // Qwen flash otherwise dumps CoT into `reasoning` and leaves content null.
        reasoning: { effort: 'none' },
        messages: [
          { role: 'system', content: RELEVANCE_SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
        temperature: 0,
        max_tokens: 120,
        response_format: { type: 'json_object' },
      }),
    });
    if (!response.ok) {
      return { ran: false, decision: null, reason: `http-${response.status}` };
    }
    const data = await response.json();
    const raw = openRouterMessageText(data?.choices?.[0]?.message);
    if (!raw) return { ran: false, decision: null, reason: 'empty' };
    const parsed = parseRelevanceDecision(raw);
    if (!parsed.decision) {
      return { ran: false, decision: null, reason: parsed.reason || 'malformed' };
    }
    return { ran: true, decision: parsed.decision, reason: parsed.reason };
  } catch (e) {
    return { ran: false, decision: null, reason: `error:${e?.message || e}` };
  }
}
