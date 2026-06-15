/**
 * Probe harvested assets for fetch/encode viability before ffmpeg assembly.
 * Dead CDN URLs are the #1 cause of alternate-asset ping-pong (2–8 URLs across 60+ clips).
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ensureLocalAsset } from '../../deploy/server-render/ffmpegAssembly.mjs';
import { validateEditTimeline, effectiveCutInterval } from './build-edit-timeline.mjs';
import { computeClipBudget } from './assembly-system.mjs';
import { normalizeUrlKey } from './harvest-loop-context.mjs';

const PROBE_CONCURRENCY = 6;

/**
 * @param {object[]} assets
 * @param {string} devServer
 * @param {string} cacheDir
 * @returns {Promise<Set<string>>} asset IDs that fetched successfully
 */
async function probeAssets(assets, devServer, cacheDir) {
  const fetchable = new Set();
  const queue = [...assets];
  async function worker() {
    while (queue.length) {
      const asset = queue.shift();
      if (!asset?.id) continue;
      const local = await ensureLocalAsset(asset, devServer, cacheDir);
      if (local) fetchable.add(asset.id);
    }
  }
  await Promise.all(Array.from({ length: Math.min(PROBE_CONCURRENCY, assets.length || 1) }, () => worker()));
  return fetchable;
}

/**
 * Drop media that cannot be fetched; rebuild editTimeline from survivors.
 *
 * @param {object} project
 * @param {{ devServer?: string, cutIntervalSec?: number, preferVideo?: boolean, minVideosFirst?: number, log?: (msg: string) => void }} [options]
 * @returns {Promise<{ removed: number, fetchable: number, widenedCut: boolean, cutIntervalSec: number }>}
 */
export async function preflightTimelineMedia(project, options = {}) {
  const devServer = options.devServer || 'http://localhost:5173';
  const log = options.log || (() => {});
  const cutIntervalSec = options.cutIntervalSec ?? 1.25;
  const media = project.media || [];
  if (!media.length) {
    return { removed: 0, fetchable: 0, widenedCut: false, cutIntervalSec };
  }

  const cacheDir = join(tmpdir(), `autotube-preflight-${Date.now()}`);
  mkdirSync(cacheDir, { recursive: true });

  const timelineIds = new Set((project.editTimeline || []).map((e) => e.assetId).filter(Boolean));
  const toProbe = timelineIds.size
    ? media.filter((m) => timelineIds.has(m.id))
    : media;
  const fetchableIds = await probeAssets(toProbe, devServer, cacheDir);

  const removedIds = new Set();
  const deadUrlKeys = [];
  for (const asset of media) {
    if (fetchableIds.has(asset.id)) continue;
    removedIds.add(asset.id);
    const key = normalizeUrlKey(asset.url, asset.sourceUrl);
    if (key) deadUrlKeys.push(key);
  }

  if (removedIds.size) {
    project.media = media.filter((m) => !removedIds.has(m.id));
    log(`   🔍 Preflight: ${removedIds.size}/${media.length} assets dead (fetch failed) — rebuilding timeline`);
    validateEditTimeline(project, {
      cutIntervalSec,
      preferVideo: options.preferVideo === true,
      minVideosFirst: options.minVideosFirst ?? 0,
      devServer,
    });
  }

  const uniqueAfter = new Set(
    (project.media || []).map((a) => normalizeUrlKey(a.url, a.sourceUrl)).filter(Boolean),
  ).size;
  const { requiredUniqueUrls: budget } = computeClipBudget(project, cutIntervalSec);
  let widenedCut = false;
  let nextCut = cutIntervalSec;

  if (uniqueAfter < budget && nextCut < 1.15) {
    nextCut = 1.15;
    widenedCut = true;
    validateEditTimeline(project, {
      cutIntervalSec: nextCut,
      preferVideo: options.preferVideo === true,
      minVideosFirst: options.minVideosFirst ?? 0,
      devServer,
    });
    log(`   📐 Preflight widened cuts to ${nextCut}s (fetchable pool ${uniqueAfter}/${budget} URLs)`);
  }

  const effective = effectiveCutInterval(project, nextCut);
  if (effective > nextCut + 0.01) {
    nextCut = Math.round(effective * 100) / 100;
    widenedCut = true;
    validateEditTimeline(project, {
      cutIntervalSec: nextCut,
      preferVideo: options.preferVideo === true,
      minVideosFirst: options.minVideosFirst ?? 0,
      devServer,
    });
    log(`   📐 Preflight pool-aware cut ${nextCut}s (effective widen)`);
  }

  const fetchableCount = (project.media || []).length;
  const probedCount = toProbe.length;
  const fetchableRatio = probedCount ? fetchableIds.size / probedCount : 1;

  return {
    removed: removedIds.size,
    fetchable: fetchableCount,
    fetchableRatio,
    probedCount,
    requiredUniqueUrls: budget,
    needsTopUp: fetchableCount < budget || fetchableRatio < 0.8,
    widenedCut,
    cutIntervalSec: nextCut,
    deadAssetIds: [...removedIds],
    deadUrlKeys,
  };
}
