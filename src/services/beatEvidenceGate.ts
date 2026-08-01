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
  needsReharvest: boolean;
  warnings: string[];
}

function beatsForSegment(sheet: VisualBeatSheet | undefined, segmentId: string): VisualBeat[] {
  return (sheet?.beats || []).filter((b) => b.segmentId === segmentId);
}

function assetFailsBeats(asset: MediaAsset, beats: VisualBeat[]): boolean {
  if (!beats.length) return false;
  let anyAccept = false;
  for (const beat of beats) {
    const r = scoreCandidateAgainstBeat(
      { alt: asset.alt, url: asset.url, query: asset.query, source: asset.source },
      beat,
    );
    if (!r.reject) anyAccept = true;
  }
  return !anyAccept;
}

/**
 * Gate project media against VisualBeatSheet.
 * By default, leaves under-filled segments for reharvest instead of retaining
 * rejected media. Callers that must render immediately can opt into clearly
 * marked weak fill with `keepWeakFill`.
 */
export function gateProjectMediaAgainstBeats(
  project: VideoProject,
  options: { minPerSegment?: number; keepWeakFill?: boolean } = {},
): BeatEvidenceGateResult {
  const sheet = project.visualBeatSheet as VisualBeatSheet | undefined;
  const warnings: string[] = [];
  const scriptSegmentIds = new Set((project.script || []).map((segment) => segment.id));
  const eligibleMedia: MediaAsset[] = [];
  const orphanCounts = new Map<string, number>();

  for (const asset of project.media || []) {
    if (scriptSegmentIds.has(asset.segmentId)) {
      eligibleMedia.push(asset);
    } else {
      orphanCounts.set(asset.segmentId, (orphanCounts.get(asset.segmentId) || 0) + 1);
    }
  }

  const orphanCount = [...orphanCounts.values()].reduce((sum, count) => sum + count, 0);
  for (const [segmentId, count] of orphanCounts) {
    warnings.push(`orphan-segment:${segmentId}:dropped-${count}-media`);
  }

  if (!sheet?.beats?.length) {
    warnings.push('no-beat-sheet');
    if (orphanCount) {
      logger.info('BeatEvidenceGate', `dropped=${orphanCount} demoted=0 warnings=${warnings.join(';')}`);
    }
    return {
      project: orphanCount ? { ...project, media: eligibleMedia } : project,
      dropped: orphanCount,
      demoted: 0,
      needsReharvest: orphanCount > 0,
      warnings,
    };
  }

  const minPer = options.minPerSegment ?? 2;
  const bySeg = new Map<string, MediaAsset[]>();
  for (const asset of eligibleMedia) {
    const list = bySeg.get(asset.segmentId) || [];
    list.push(asset);
    bySeg.set(asset.segmentId, list);
  }

  const kept: MediaAsset[] = [];
  let dropped = orphanCount;
  let demoted = 0;
  let needsReharvest = orphanCount > 0;

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
      needsReharvest = true;
      const missing = Math.max(0, minPer - good.length);
      // Slice before mapping/counting so rejected assets that are dropped do
      // not inflate the demoted metric.
      const fill = (options.keepWeakFill ? bad.slice(0, missing) : []).map((asset) => ({
        ...asset,
        isFallback: true,
        score: Math.min(asset.score ?? 40, 25),
        trace: [...(asset.trace || []), 'beat-evidence-gate:weak-fill'],
      }));
      demoted += fill.length;
      if (bad.length > fill.length) dropped += bad.length - fill.length;
      warnings.push(`${segment.id}:insufficient-good-assets=${good.length}<${minPer}:reharvest-needed`);
      if (fill.length) warnings.push(`${segment.id}:kept-weak-fill=${fill.length}:rejected-evidence`);
      kept.push(...good, ...fill);
    }
  }

  if (dropped || demoted || needsReharvest) {
    logger.info('BeatEvidenceGate', `dropped=${dropped} demoted=${demoted} warnings=${warnings.join(';')}`);
  }

  return {
    project: { ...project, media: kept },
    dropped,
    demoted,
    needsReharvest,
    warnings,
  };
}
