/**
 * Map generate-stage failures → fix state adjustments before retry.
 */
import { IMAGE_FIRST_CUT_FLOOR } from './apply-watch-fixes.mjs';
import { normalizeUrlKey, isEditorialHarvestKeep } from './harvest-loop-context.mjs';

function clampCut(s, floor) {
  const cur = typeof s.cutIntervalSec === 'number' ? s.cutIntervalSec : 1.25;
  s.cutIntervalSec = Math.max(floor, cur);
}

/**
 * @param {string} error
 * @param {object} fixState
 * @param {object} [extra]
 * @returns {{ applied: string[], fixState: object }}
 */
export function applyGenerateFailureFixes(error, fixState, extra = {}) {
  const applied = [];
  const s = { ...fixState };
  const msg = error || '';

  if (/diversity gate|adjacent same-url|spacing violation/i.test(msg)) {
    clampCut(s, IMAGE_FIRST_CUT_FLOOR);
    s.harvestVideoFirst = false;
    s.preferImageAssembly = true;
    s.useCuratedPool = true;
    s.reHarvestMedia = true;
    s.harvestNonce = (s.harvestNonce || 0) + 1;
    s.fixStrategy = 'reharvest';
    s.suppressGiphy = true;
    applied.push(
      `G1. Diversity gate FAIL → image-first curated reharvest, cuts ≥${s.cutIntervalSec}s, nonce ${s.harvestNonce}`,
    );

    const manifest = extra.manifestGate?.manifest || extra.manifest || {};
    if (manifest.uniqueUrlsUsed != null && manifest.uniqueUrlsUsed < 12) {
      clampCut(s, Math.max(IMAGE_FIRST_CUT_FLOOR, 1.4));
      applied.push(`G1b. Thin encode pool (${manifest.uniqueUrlsUsed} URLs) → cuts widened to ${s.cutIntervalSec}s`);
    }
  }

  if (/harvest volume gate/i.test(msg)) {
    s.reHarvestMedia = true;
    s.harvestNonce = (s.harvestNonce || 0) + 1;
    s.minAssetsPerSegment = Math.min(8, (s.minAssetsPerSegment || 4) + 1);
    s.fixStrategy = 'reharvest';
    applied.push(`G2. Harvest volume FAIL → reharvest nonce ${s.harvestNonce}, minAssets ${s.minAssetsPerSegment}`);
  }

  if (/caption overlay failed|no captions burned/i.test(msg)) {
    s.fixStrategy = 'captions';
    applied.push('G5. Caption burn FAIL → captions strategy retry');
  }

  if (/timeline short|no output mp4/i.test(msg)) {
    s.reHarvestMedia = true;
    s.harvestNonce = (s.harvestNonce || 0) + 1;
    clampCut(s, Math.max(IMAGE_FIRST_CUT_FLOOR, 1.8));
    s.preferImageAssembly = true;
    s.harvestVideoFirst = false;
    s.useCuratedPool = true;
    applied.push(`G3. Render encode FAIL → reharvest + widen cuts to ${s.cutIntervalSec}s, nonce ${s.harvestNonce}`);
  }

  const deadKeys = extra.deadUrlKeys || extra.preflightDeadIds || [];
  if (deadKeys.length) {
    const merged = new Set((s.excludedUrls || []).map((u) => normalizeUrlKey(u) || u).filter(Boolean));
    for (const key of deadKeys) {
      const norm = normalizeUrlKey(key) || key;
      if (norm && !isEditorialHarvestKeep(norm)) merged.add(norm);
    }
    s.excludedUrls = [...merged].slice(-400);
    applied.push(`G4. Excluded ${deadKeys.length} dead fetch URL(s) from next harvest`);
  }

  if (applied.length) {
    s.appliedFixes = [...(s.appliedFixes || []), ...applied.map((a) => `[${new Date().toISOString()}] ${a}`)];
  }

  return { applied, fixState: s };
}
