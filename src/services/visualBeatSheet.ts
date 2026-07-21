/**
 * Bounded Visual Beat Sheet — script-grounded visual units for generation.
 *
 * Enabled with AUTOTUBE_VISUAL_BEATS=1. Keeps a hard budget (~12–24 beats)
 * so we do not explode into per-sentence stock montages.
 */
import type { ScriptSegment } from '../types/script';

export type VisualBeatRole =
  | 'hook'
  | 'human_story'
  | 'evidence'
  | 'mechanism'
  | 'escalation'
  | 'payoff'
  | 'action';

export type VisualScale = 'personal' | 'institutional' | 'geopolitical' | 'instructional';

export interface VisualBeat {
  id: string;
  segmentId: string;
  sentenceIndex: number;
  role: VisualBeatRole;
  scale: VisualScale;
  /** What the viewer should understand from this beat. */
  intent: string;
  /** Concrete searchable subject (person/place/object/document). */
  searchableSubject: string;
  /** Exact narration excerpt this beat supports. */
  narrationExcerpt: string;
  mustShow: string[];
  mustAvoid: string[];
  sourcePreference: 'news' | 'official' | 'archive' | 'map' | 'stock' | 'generated_chart';
  /** Provenance string — script visualNote, narration entity, or topic context. */
  evidence: string;
  callbackToBeatId?: string;
}

export interface VisualBeatSheet {
  topic: string;
  beats: VisualBeat[];
  budget: { min: number; max: number; used: number };
  warnings: string[];
}

const DEFAULT_MIN = 12;
const DEFAULT_MAX = 24;

export function visualBeatsEnabled(): boolean {
  try {
    if (typeof sessionStorage !== 'undefined') {
      const ss = sessionStorage.getItem('autotube_visual_beats');
      if (ss === 'false') return false;
      if (ss === 'true') return true;
    }
    const env =
      (typeof process !== 'undefined' && process.env)
      || (typeof import.meta !== 'undefined' && (import.meta as { env?: Record<string, string> }).env)
      || {};
    // Explicit off
    if (
      env.AUTOTUBE_VISUAL_BEATS === '0'
      || env.AUTOTUBE_VISUAL_BEATS === 'false'
      || env.VITE_AUTOTUBE_VISUAL_BEATS === '0'
      || env.VITE_AUTOTUBE_VISUAL_BEATS === 'false'
    ) {
      return false;
    }
    // Explicit on
    if (
      env.AUTOTUBE_VISUAL_BEATS === '1'
      || env.AUTOTUBE_VISUAL_BEATS === 'true'
      || env.VITE_AUTOTUBE_VISUAL_BEATS === '1'
      || env.VITE_AUTOTUBE_VISUAL_BEATS === 'true'
    ) {
      return true;
    }
    // Default ON — generator readiness path (opt-out with =0)
    return true;
  } catch {
    return true;
  }
}

function splitSentences(text: string): string[] {
  return String(text || '')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12);
}

function inferRole(segment: ScriptSegment, sentenceIndex: number, totalInSeg: number): VisualBeatRole {
  const t = `${segment.type || ''} ${segment.title || ''}`.toLowerCase();
  if (segment.type === 'intro' || /hook/i.test(t)) return sentenceIndex === 0 ? 'hook' : 'human_story';
  if (segment.type === 'outro' || /cta|action|what to do/i.test(t)) return 'action';
  if (/how|mechanism|works|system/i.test(t)) return 'mechanism';
  if (/escalat|worse|spread|nation|global/i.test(t)) return 'escalation';
  if (/proof|evidence|data|leak|record|document/i.test(t)) return 'evidence';
  if (sentenceIndex >= totalInSeg - 1) return 'payoff';
  return sentenceIndex === 0 ? 'human_story' : 'evidence';
}

function inferScale(role: VisualBeatRole, excerpt: string): VisualScale {
  const e = excerpt.toLowerCase();
  if (role === 'action') return 'instructional';
  if (/government|nation|global|country|military|satellite/i.test(e)) return 'geopolitical';
  if (/company|hospital|school|district|agency|corporate|office/i.test(e)) return 'institutional';
  return 'personal';
}

function extractSubject(excerpt: string, visualNote?: string): { subject: string; evidence: string } {
  if (visualNote?.trim()) {
    const note = visualNote.trim().slice(0, 120);
    return { subject: note, evidence: `visualNote:${note}` };
  }
  // Prefer capitalized entity-ish tokens
  const entities = excerpt.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}\b/g) || [];
  const filtered = entities.filter((w) => !/^(The|A|An|And|But|When|How|Why|This|That)$/.test(w));
  if (filtered[0]) {
    return { subject: filtered[0], evidence: `narration-entity:${filtered[0]}` };
  }
  const words = excerpt.split(/\s+/).slice(0, 8).join(' ');
  return { subject: words, evidence: `narration-excerpt:${words}` };
}

/**
 * Heuristic beat sheet from script — no LLM required.
 * Selects evenly spaced sentences under a hard budget.
 */
export function buildVisualBeatSheetFromScript(
  topic: string,
  script: ScriptSegment[],
  options: { min?: number; max?: number } = {},
): VisualBeatSheet {
  const min = options.min ?? DEFAULT_MIN;
  const max = options.max ?? DEFAULT_MAX;
  const warnings: string[] = [];
  const candidates: Omit<VisualBeat, 'id'>[] = [];

  for (const segment of script || []) {
    const sentences = splitSentences(segment.narration || '');
    const pool = sentences.length ? sentences : [String(segment.narration || segment.title || topic).slice(0, 160)];
    for (let i = 0; i < pool.length; i += 1) {
      const excerpt = pool[i];
      const role = inferRole(segment, i, pool.length);
      const scale = inferScale(role, excerpt);
      const { subject, evidence } = extractSubject(excerpt, segment.visualNote);
      const wantsChart = /chart|graph|diagram|infographic/i.test(segment.visualNote || '');
      candidates.push({
        segmentId: segment.id,
        sentenceIndex: i,
        role,
        scale,
        intent: `${role}: support narration with concrete visual`,
        searchableSubject: subject,
        narrationExcerpt: excerpt.slice(0, 220),
        mustShow: [subject],
        mustAvoid: ['puppet', 'cartoon', 'insect macro', 'minecraft'],
        sourcePreference: wantsChart ? 'generated_chart' : 'news',
        evidence,
      });
    }
  }

  if (!candidates.length) {
    warnings.push('empty-script');
    return { topic, beats: [], budget: { min, max, used: 0 }, warnings };
  }

  // Evenly sample into [min, max]
  const target = Math.min(max, Math.max(min, Math.min(candidates.length, max)));
  const picked: VisualBeat[] = [];
  if (candidates.length <= target) {
    candidates.forEach((c, i) => picked.push({ ...c, id: `beat-${i + 1}` }));
  } else {
    for (let i = 0; i < target; i += 1) {
      const idx = Math.round((i * (candidates.length - 1)) / (target - 1));
      picked.push({ ...candidates[idx], id: `beat-${i + 1}` });
    }
  }

  // Outro callback to first hook/human beat when possible
  const hook = picked.find((b) => b.role === 'hook' || b.role === 'human_story');
  const last = picked[picked.length - 1];
  if (hook && last && last.role === 'action') {
    last.callbackToBeatId = hook.id;
  }

  const roles = new Set(picked.map((b) => b.role));
  if (!roles.has('hook') && !roles.has('human_story')) warnings.push('missing-hook-role');
  if (!roles.has('evidence') && !roles.has('mechanism')) warnings.push('missing-evidence-role');
  if (picked.length < min) warnings.push(`under-budget:${picked.length}<${min}`);

  return {
    topic,
    beats: picked,
    budget: { min, max, used: picked.length },
    warnings,
  };
}

/**
 * Basic structural validation for tests and pre-render gates.
 */
export function validateVisualBeatSheet(sheet: VisualBeatSheet): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!sheet?.beats?.length) errors.push('no-beats');
  if (sheet.beats.length > sheet.budget.max) errors.push('over-budget');
  for (const b of sheet.beats || []) {
    if (!b.searchableSubject?.trim()) errors.push(`${b.id}:empty-subject`);
    if (!b.narrationExcerpt?.trim()) errors.push(`${b.id}:empty-excerpt`);
    if (!b.evidence?.trim()) errors.push(`${b.id}:empty-evidence`);
  }
  return { ok: errors.length === 0, errors };
}

/** Convert beats into search query strings for harvest (segment-compatible). */
export function queriesFromBeatSheet(sheet: VisualBeatSheet, segmentId?: string): string[] {
  return (sheet.beats || [])
    .filter((b) => !segmentId || b.segmentId === segmentId)
    .map((b) => b.searchableSubject)
    .filter(Boolean)
    .slice(0, 8);
}
