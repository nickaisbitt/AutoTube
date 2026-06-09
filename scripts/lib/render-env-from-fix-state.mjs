/**
 * Map loop fixState → server-render environment (for generate + journal).
 * @param {object} fixState
 * @param {{ devServer?: string, projectPath?: string }} [base]
 */
export function buildRenderEnvFromFixState(fixState = {}, base = {}) {
  const renderTier = fixState.renderTier === 'full' ? 'full' : 'draft';
  const env = {
    ...process.env,
    DEV_SERVER_URL: base.devServer || process.env.DEV_SERVER_URL || 'http://localhost:5173',
    AUTOTUBE_FORCE_CPU: process.env.AUTOTUBE_FORCE_CPU || '1',
    AUTOTUBE_LOOP_MODE: '1',
    AUTOTUBE_YOUTUBE_MODE: process.env.AUTOTUBE_YOUTUBE_MODE || '1',
  };

  if (base.projectPath) env.AUTOTUBE_PROJECT_PATH = base.projectPath;
  if (fixState.cutIntervalSec) env.AUTOTUBE_CUT_INTERVAL_SEC = String(fixState.cutIntervalSec);
  if (fixState.showKineticText) env.AUTOTUBE_KINETIC_TEXT = '1';
  if (fixState.patternInterrupts || (fixState.cutIntervalSec ?? 1.25) <= 0.5) env.AUTOTUBE_PATTERN_INTERRUPTS = '1';
  if (fixState.useFastPacing) env.AUTOTUBE_FAST_PACING = '1';
  if (fixState.useFfmpegAssembly !== false) env.AUTOTUBE_RENDER_MODE = 'ffmpeg';
  if (fixState.harvestVideoFirst !== false) env.AUTOTUBE_HARVEST_VIDEO_FIRST = '1';
  if (fixState.brollPlacement !== false) env.AUTOTUBE_BROLL_PLACEMENT = '1';
  if (fixState.ffmpegHardCuts !== false) env.AUTOTUBE_FFMPEG_HARD_CUTS = '1';
  if (fixState.whisperAlign || renderTier === 'full') env.AUTOTUBE_WHISPER_ALIGN = '1';
  if (fixState.hookOverlay) env.AUTOTUBE_HOOK_OVERLAY = fixState.hookOverlay;
  if (fixState.hookLine) env.AUTOTUBE_HOOK_LINE = fixState.hookLine;

  if (renderTier === 'full') {
    env.AUTOTUBE_RENDER_QUALITY = 'high';
    env.AUTOTUBE_FFMPEG_PRESET = process.env.AUTOTUBE_FFMPEG_PRESET || 'fast';
    delete env.AUTOTUBE_DRAFT_NO_UPSCALE;
  } else {
    env.AUTOTUBE_RENDER_QUALITY = process.env.AUTOTUBE_RENDER_QUALITY || 'draft';
    env.AUTOTUBE_FFMPEG_PRESET = process.env.AUTOTUBE_FFMPEG_PRESET || 'ultrafast';
    env.AUTOTUBE_DRAFT_NO_UPSCALE = process.env.AUTOTUBE_DRAFT_NO_UPSCALE || '1';
  }

  env.AUTOTUBE_ENCODING_TIMEOUT_MS = process.env.AUTOTUBE_ENCODING_TIMEOUT_MS || '1800000';
  return env;
}

/** Keys safe to log in JOURNAL (no secrets). */
export function renderEnvJournalSnapshot(fixState = {}) {
  return {
    cutIntervalSec: fixState.cutIntervalSec,
    renderTier: fixState.renderTier || 'draft',
    fixStrategy: fixState.fixStrategy || 'interval',
    ffmpegHardCuts: fixState.ffmpegHardCuts !== false,
    reHarvestMedia: fixState.reHarvestMedia === true,
    harvestNonce: fixState.harvestNonce || 0,
    mediaOffset: fixState.mediaOffset || 0,
    minAssetsPerSegment: fixState.minAssetsPerSegment,
    useFfmpegAssembly: fixState.useFfmpegAssembly !== false,
    harvestVideoFirst: fixState.harvestVideoFirst !== false,
  };
}
