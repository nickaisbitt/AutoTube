/**
 * Persisted fix state between improvement-loop iterations.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

export const DEFAULT_FIX_STATE = {
  cutIntervalSec: 1.25,
  showKineticText: false,
  useFastPacing: false,
  shockHook: true,
  hookLine: null,
  forceRealStock: true,
  mediaOffset: 0,
  topicRetryCount: 0,
  maxRetriesPerTopic: 4,
  pendingTopic: null,
  iteration: 0,
  appliedFixes: [],
};

/**
 * @param {string} loopDir
 */
export function loadFixState(loopDir) {
  const path = join(loopDir, 'FIX_STATE.json');
  if (!existsSync(path)) return { ...DEFAULT_FIX_STATE };
  try {
    return { ...DEFAULT_FIX_STATE, ...JSON.parse(readFileSync(path, 'utf8')) };
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
