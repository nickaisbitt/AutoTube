/**
 * Persisted fix state between improvement-loop iterations.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

export const FIX_STATE_VERSION = 3;

/** @typedef {'interval' | 'hard_cuts' | 'reharvest' | 'new_topic'} FixStrategy */

export const DEFAULT_FIX_STATE = {
  version: FIX_STATE_VERSION,
  cutIntervalSec: 1.25,
  showKineticText: false,
  useFastPacing: false,
  shockHook: true,
  hookLine: null,
  forceRealStock: false,
  mediaOffset: 0,
  harvestNonce: 0,
  excludedUrls: [],
  fixStrategy: 'interval',
  ffmpegHardCuts: true,
  topicRetryCount: 0,
  maxRetriesPerTopic: 4,
  pendingTopic: null,
  iteration: 0,
  appliedFixes: [],
  minAssetsPerSegment: 4,
  maxGenerateFailuresPerTopic: 2,
  reHarvestMedia: false,
  patternInterrupts: false,
  useFfmpegAssembly: true,
  renderTier: 'draft',
  harvestVideoFirst: true,
  whisperAlign: false,
  brollPlacement: true,
  suppressGiphy: false,
  minVideosPerSegment: 2,
};

/**
 * @param {string} loopDir
 */
export function loadFixState(loopDir) {
  const path = join(loopDir, 'FIX_STATE.json');
  if (!existsSync(path)) return { ...DEFAULT_FIX_STATE };
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    const loaded = { ...DEFAULT_FIX_STATE, ...raw };
    loaded.version = FIX_STATE_VERSION;
    loaded.forceRealStock = false;
    if (raw.useFfmpegAssembly === undefined) loaded.useFfmpegAssembly = true;
    if (raw.harvestVideoFirst === undefined) loaded.harvestVideoFirst = true;
    if (raw.brollPlacement === undefined) loaded.brollPlacement = true;
    if (raw.renderTier === undefined) loaded.renderTier = 'draft';
    if (raw.fixStrategy === undefined) loaded.fixStrategy = 'interval';
    if (
      raw.ffmpegHardCuts === undefined
      || (raw.version < FIX_STATE_VERSION && raw.ffmpegHardCuts === false)
      || (raw.ffmpegHardCuts === false && raw.fixStrategy === 'interval')
    ) {
      loaded.ffmpegHardCuts = true;
    }
    if (raw.harvestNonce === undefined) loaded.harvestNonce = 0;
    if (!Array.isArray(raw.excludedUrls)) loaded.excludedUrls = [];
    return loaded;
  } catch {
    return { ...DEFAULT_FIX_STATE };
  }
}

/**
 * @param {string} loopDir
 * @param {object} state
 */
export function saveFixState(loopDir, state) {
  mkdirSync(loopDir, { recursive: true });
  writeFileSync(join(loopDir, 'FIX_STATE.json'), JSON.stringify(state, null, 2));
}
