/**
 * Node-side LLM B-roll placement (mirrors src/services/brollPlacement.ts for the loop).
 * Falls back to scripts/lib/build-edit-timeline.mjs heuristic.
 */
import { buildEditTimeline } from './build-edit-timeline.mjs';
import { openRouterMessageText } from './openRouterMessageText.mjs';

const MIN_CLIP_SEC = 1.5;
const MAX_HOOK_CLIP_SEC = 3;

/**
 * @param {object} project
 * @param {{ apiKey?: string, cutIntervalSec?: number }} [options]
 * @returns {Promise<{ entries: object[], source: 'heuristic' | 'llm' }>}
 */
export async function buildBrollPlacementPlanNode(project, options = {}) {
  const cutIntervalSec = options.cutIntervalSec ?? 1.25;
  const heuristic = () => ({
    entries: buildEditTimeline(project, {
      cutIntervalSec,
      reason: 'loop heuristic placement',
    }),
    source: 'heuristic',
  });

  if (process.env.AUTOTUBE_BROLL_PLACEMENT !== '1') {
    return heuristic();
  }

  const apiKey = options.apiKey || process.env.OPENROUTER_API_KEY || process.env.VITE_OPENROUTER_KEY;
  if (!apiKey) return heuristic();

  const segments = (project.script || []).map((s) => ({
    id: s.id,
    title: s.title,
    narration: (s.narration || '').slice(0, 400),
    duration: s.duration,
    type: s.type,
  }));
  const assets = (project.media || []).map((m) => ({
    id: m.id,
    segmentId: m.segmentId,
    alt: m.alt,
    type: m.type,
    url: (m.url || '').slice(0, 120),
  }));

  const system = [
    'You are a YouTube retention editor. Output a B-roll edit timeline as JSON only.',
    `Rules: min clip ${MIN_CLIP_SEC}s, opener clips max ${MAX_HOOK_CLIP_SEC}s, no same asset within 10s, cut on meaning shifts.`,
    'Schema: { "entries": [{ "segmentId", "startSec", "endSec", "assetId", "reason" }] }',
  ].join('\n');

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://autotube.video',
        'X-Title': 'AutoTube B-roll Placement',
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || 'xiaomi/mimo-v2.5',
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content: JSON.stringify({ segments, assets, cutIntervalSec }),
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_tokens: 2000,
      }),
    });
    if (!response.ok) throw new Error(`OpenRouter ${response.status}`);
    const data = await response.json();
    const raw = openRouterMessageText(data?.choices?.[0]?.message);
    if (!raw) throw new Error('empty response');
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}') + 1;
    const parsed = JSON.parse(start >= 0 ? raw.slice(start, end) : raw);
    const mediaIds = new Set((project.media || []).map((m) => m.id));
    const entries = (parsed.entries || []).filter(
      (e) => e?.segmentId && e?.assetId && mediaIds.has(e.assetId) && Number.isFinite(e.startSec),
    );
    if (!entries.length) throw new Error('no valid entries');
    return { entries, source: 'llm' };
  } catch {
    return heuristic();
  }
}
