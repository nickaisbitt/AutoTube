/**
 * Pre-render evidence gate: drop/demote assets that fail beat relevance
 * before assembly so stock filler does not survive into the MP4.
 */
import type { MediaAsset, VideoProject } from '../types';
import { scoreCandidateAgainstBeat } from './beatRelevance';
import type { VisualBeat, VisualBeatSheet } from './visualBeatSheet';
import { logger } from './logger';

export interface BeatEvidenceGateResult {
  project: VideoProject;
  dropped: number;
  demoted: number;
  warnings: string[];
}

function beatsForSegment(sheet: VisualBeatSheet | undefined, segmentId: string): VisualBeat[] {
  return (sheet?.beats || []).filter((b) => b.segmentId === segmentId);
}

function assetFailsBeats(asset: MediaAsset, beats: VisualBeat[]): boolean {
  if (!beats.length) return false;
  let anyAccept = false;
  let best = 0;
  for (const beat of beats) {
    const r = scoreCandidateAgainstBeat(
      { alt: asset.alt, url: asset.url, query: asset.query, source: asset.source },
      beat,
    );
    if (!r.reject) anyAccept = true;
    best = Math.max(best, r.score);
  }
  return !anyAccept && best < 0.2;
}

/**
 * Gate project media against VisualBeatSheet.
 * Keeps at least `minPerSegment` assets per segment (even if weak) so render can proceed.
 */
export function gateProjectMediaAgainstBeats(
  project: VideoProject,
  options: { minPerSegment?: number } = {},
): BeatEvidenceGateResult {
  const sheet = project.visualBeatSheet as VisualBeatSheet | undefined;
  const warnings: string[] = [];
  if (!sheet?.beats?.length) {
    return { project, dropped: 0, demoted: 0, warnings: ['no-beat-sheet'] };
  }

  const minPer = options.minPerSegment ?? 2;
  const bySeg = new Map<string, MediaAsset[]>();
  for (const asset of project.media || []) {
    const list = bySeg.get(asset.segmentId) || [];
    list.push(asset);
    bySeg.set(asset.segmentId, list);
  }

  const kept: MediaAsset[] = [];
  let dropped = 0;
  let demoted = 0;

  for (const segment of project.script || []) {
    const assets = bySeg.get(segment.id) || [];
    const beats = beatsForSegment(sheet, segment.id);
    if (!beats.length) {
      kept.push(...assets);
      continue;
    }

    const good: MediaAsset[] = [];
    const bad: MediaAsset[] = [];
    for (const asset of assets) {
      if (assetFailsBeats(asset, beats)) bad.push(asset);
      else good.push(asset);
    }

    if (good.length >= minPer) {
      dropped += bad.length;
      if (bad.length) {
        warnings.push(`${segment.id}:dropped-${bad.length}-off-beat`);
      }
      kept.push(...good);
    } else {
      // Keep good + fill with least-bad (demoted scores)
      const fill = bad
        .map((a) => {
          demoted += 1;
          return { ...a, score: Math.min(a.score ?? 40, 25) };
        })
        .slice(0, Math.max(0, minPer - good.length));
      if (bad.length > fill.length) dropped += bad.length - fill.length;
      warnings.push(`${segment.id}:kept-weak-fill=${fill.length}`);
      kept.push(...good, ...fill);
    }
  }

  if (dropped || demoted) {
    logger.info('BeatEvidenceGate', `dropped=${dropped} demoted=${demoted} warnings=${warnings.join(';')}`);
  }

  return {
    project: { ...project, media: kept },
    dropped,
    demoted,
    warnings,
  };
}
