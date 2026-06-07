/**
 * LLM-driven B-roll placement timeline for loop / ffmpeg assembly.
 */
import type { MediaAsset, ScriptSegment, VideoProject } from '../types';
import { logger } from './logger';

export interface EditTimelineEntry {
  segmentId: string;
  startSec: number;
  endSec: number;
  assetId: string;
  reason?: string;
}

export interface BrollPlacementPlan {
  entries: EditTimelineEntry[];
  source: 'heuristic' | 'llm';
}

const MIN_CLIP_SEC = 1.5;
const MAX_HOOK_CLIP_SEC = 3;

function isLoopBrollPlacement(): boolean {
  return typeof sessionStorage !== 'undefined' && sessionStorage.getItem('autotube_loop_broll_placement') === 'true';
}

/**
 * Heuristic placement when LLM unavailable — cycles assets on meaning boundaries.
 */
export function buildHeuristicEditTimeline(project: VideoProject, cutIntervalSec = 1.25): BrollPlacementPlan {
  const entries: EditTimelineEntry[] = [];

  for (const seg of project.script || []) {
    const assets = (project.media || []).filter((m) => m.segmentId === seg.id);
    if (!assets.length) continue;

    const duration = seg.duration || 20;
    const isIntro = seg.type === 'intro';
    const interval = isIntro ? Math.min(cutIntervalSec, MAX_HOOK_CLIP_SEC) : cutIntervalSec;
    let t = 0;
    let ai = 0;
    while (t < duration - 0.05) {
      const end = Math.min(duration, t + interval);
      entries.push({
        segmentId: seg.id,
        startSec: t,
        endSec: end,
        assetId: assets[ai % assets.length].id,
        reason: 'heuristic cut interval',
      });
      t = end;
      ai += 1;
    }
  }

  return { entries, source: 'heuristic' };
}

/**
 * @param project Full project with script + media
 * @param apiKey OpenRouter key
 * @param cutIntervalSec fallback interval
 */
export async function buildBrollPlacementPlan(
  project: VideoProject,
  apiKey: string | undefined,
  cutIntervalSec = 1.25,
): Promise<BrollPlacementPlan> {
  if (!isLoopBrollPlacement() && !process.env.AUTOTUBE_BROLL_PLACEMENT) {
    return buildHeuristicEditTimeline(project, cutIntervalSec);
  }

  if (!apiKey) {
    logger.warn('BrollPlacement', 'No API key — using heuristic timeline');
    return buildHeuristicEditTimeline(project, cutIntervalSec);
  }

  const segments = (project.script || []).map((s: ScriptSegment) => ({
    id: s.id,
    title: s.title,
    narration: (s.narration || '').slice(0, 400),
    duration: s.duration,
    type: s.type,
  }));

  const assets = (project.media || []).map((m: MediaAsset) => ({
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
        model: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content: JSON.stringify({ segments, assets, cutIntervalSec }),
          },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) throw new Error(`OpenRouter ${response.status}`);
    const data = await response.json();
    const raw = data?.choices?.[0]?.message?.content;
    if (!raw) throw new Error('empty response');

    const parsed = JSON.parse(raw) as { entries?: EditTimelineEntry[] };
    if (!parsed.entries?.length) throw new Error('no entries');

    return { entries: parsed.entries, source: 'llm' };
  } catch (err) {
    logger.warn('BrollPlacement', `LLM placement failed: ${err instanceof Error ? err.message : String(err)}`);
    return buildHeuristicEditTimeline(project, cutIntervalSec);
  }
}
