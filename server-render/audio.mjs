/**
 * Audio Concatenation & Mixing Module
 *
 * Combines narration audio files and mixes with background music using ffmpeg.
 */

import { spawnSync } from 'child_process';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

/** Style-to-filename mapping for background music tracks. */
const BG_MUSIC_MAP = {
  business_insider: 'bg-business-insider.aac',
  warfront: 'bg-warfront.aac',
  documentary: 'bg-documentary.aac',
  explainer: 'bg-explainer.aac',
};

/**
 * Resolves the background music file path for a given video style.
 * Returns the absolute path if the style-specific file exists.
 * Falls back to the generic ambient track if the style-specific file is missing.
 * Returns null only if neither file exists on disk.
 *
 * @param {string} style  The video style (e.g. 'business_insider').
 * @returns {string|null}
 */
export function resolveBackgroundMusicPath(style) {
  const filename = BG_MUSIC_MAP[style];
  if (filename) {
    const stylePath = join(PROJECT_ROOT, 'public', 'audio', filename);
    if (existsSync(stylePath)) return stylePath;
  }
  // Fallback to generic ambient track
  const fallbackPath = join(PROJECT_ROOT, 'public', 'audio', 'ambient-bg.aac');
  return existsSync(fallbackPath) ? fallbackPath : null;
}

/**
 * Computes the background music volume level.
 * Returns 0.15 when narration is present, 0.60 when there is no narration.
 *
 * @param {boolean} hasNarration
 * @returns {number}
 */
export function computeBgMusicVolume(hasNarration) {
  return hasNarration ? 0.15 : 0.60;
}

/**
 * Concatenate multiple audio files into a single AAC file using ffmpeg concat.
 *
 * @param {Array<{file: string, duration: number}>} audioFiles  Audio segments to concatenate.
 * @param {string} outputFile  Path for the combined output file.
 * @returns {Promise<boolean>} True if concatenation succeeded.
 */
export async function concatenateAudio(audioFiles, outputFile) {
  const listFile = join(tmpdir(), `autotube-audio-list-${Date.now()}.txt`);
  const listContent = audioFiles.map(a => `file '${a.file}'`).join('\n');
  writeFileSync(listFile, listContent);

  const result = spawnSync('ffmpeg', [
    '-y', '-f', 'concat', '-safe', '0',
    '-i', listFile,
    '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11',
    '-c:a', 'aac', '-b:a', '192k',
    outputFile,
  ], { encoding: 'utf8', timeout: 60000 });

  try { unlinkSync(listFile); } catch {}
  return result.status === 0;
}

/**
 * Mix background music with narration audio into a single audio file.
 * Uses ffmpeg amix filter with -stream_loop -1 to seamlessly loop the
 * background track when it is shorter than the narration.
 *
 * @param {string} narrationFile  Path to the combined narration audio.
 * @param {string} bgMusicPath   Path to the background music file.
 * @param {string} outputFile    Path for the mixed output audio.
 * @param {number} bgVolume      Volume level for background music (0.0–1.0).
 * @returns {boolean} True if mixing succeeded.
 */
export function mixNarrationWithBgMusic(narrationFile, bgMusicPath, outputFile, bgVolume) {
  console.log(`  🎵 Mixing background music at volume ${bgVolume} (${bgMusicPath})`);
  const result = spawnSync('ffmpeg', [
    '-y',
    '-i', narrationFile,
    '-stream_loop', '-1',
    '-i', bgMusicPath,
    '-filter_complex',
    `[1:a]volume=${bgVolume}[bg];[0:a][bg]amix=inputs=2:duration=first`,
    '-c:a', 'aac', '-b:a', '128k',
    outputFile,
  ], { encoding: 'utf8', timeout: 120000 });
  return result.status === 0;
}

/**
 * Create an audio track from background music only (no narration).
 * Used when all narration clips are unavailable.
 * Loops the track seamlessly and trims to the video duration.
 *
 * @param {string} bgMusicPath   Path to the background music file.
 * @param {string} outputFile    Path for the output audio.
 * @param {number} duration      Target duration in seconds.
 * @param {number} bgVolume      Volume level for background music (0.0–1.0).
 * @returns {boolean} True if creation succeeded.
 */
export function createBgMusicOnlyTrack(bgMusicPath, outputFile, duration, bgVolume) {
  console.log(`  🎵 Using background music only at volume ${bgVolume} (no narration)`);
  const result = spawnSync('ffmpeg', [
    '-y',
    '-stream_loop', '-1',
    '-i', bgMusicPath,
    '-t', String(duration),
    '-filter_complex',
    `[0:a]volume=${bgVolume}[out]`,
    '-map', '[out]',
    '-c:a', 'aac', '-b:a', '128k',
    outputFile,
  ], { encoding: 'utf8', timeout: 120000 });
  return result.status === 0;
}

/**
 * Mux video + audio (narration, optionally mixed with background music) into a final MP4.
 *
 * When backgroundMusic is enabled (default), the function:
 * 1. Resolves the style-appropriate bg music file from public/audio/bg-{style}.aac
 * 2. Mixes narration + bg music using amix with -stream_loop -1 for seamless looping
 * 3. Sets bg music volume to 15% with narration, 60% without narration
 * 4. Falls back to narration-only if the bg music file is missing
 *
 * @param {string} videoFile       Path to the video-only file.
 * @param {string|null} narrationFile  Path to the combined narration audio (null if no narration).
 * @param {string} outputFile      Path for the final muxed MP4.
 * @param {number} videoDuration   Total video duration in seconds.
 * @param {object} [options]       Additional options.
 * @param {string} [options.style] Video style for bg music selection.
 * @param {boolean} [options.backgroundMusic=true] Whether to include background music.
 * @returns {boolean} True if muxing succeeded.
 */
export function muxVideoWithAudio(videoFile, narrationFile, outputFile, videoDuration, options = {}) {
  const { style = null, backgroundMusic = true } = options;
  const hasNarration = narrationFile && existsSync(narrationFile);

  // Resolve background music path based on style
  let bgMusicPath = null;
  if (backgroundMusic && style) {
    bgMusicPath = resolveBackgroundMusicPath(style);
  }

  // Case 1: No narration and no bg music — mux video only (silent)
  if (!hasNarration && !bgMusicPath) {
    console.log('  ℹ No narration or background music — producing silent video');
    const mux = spawnSync('ffmpeg', [
      '-y',
      '-i', videoFile,
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
      '-pix_fmt', 'yuv420p',
      outputFile,
    ], { encoding: 'utf8', timeout: 300000 });
    return mux.status === 0;
  }

  // Case 2: No narration but bg music available — use bg music at 60% as primary audio
  if (!hasNarration && bgMusicPath) {
    const bgVolume = computeBgMusicVolume(false);
    const bgOnlyAudio = join(tmpdir(), `autotube-bgonly-${Date.now()}.aac`);
    const bgOk = createBgMusicOnlyTrack(bgMusicPath, bgOnlyAudio, videoDuration, bgVolume);
    if (!bgOk) {
      console.warn('  ⚠ Background music creation failed — producing silent video');
      const mux = spawnSync('ffmpeg', [
        '-y', '-i', videoFile,
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
        '-pix_fmt', 'yuv420p',
        outputFile,
      ], { encoding: 'utf8', timeout: 300000 });
      return mux.status === 0;
    }
    const mux = spawnSync('ffmpeg', [
      '-y',
      '-i', videoFile,
      '-i', bgOnlyAudio,
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
      '-c:a', 'aac', '-b:a', '192k',
      '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11',
      '-shortest',
      '-pix_fmt', 'yuv420p',
      outputFile,
    ], { encoding: 'utf8', timeout: 300000 });
    try { unlinkSync(bgOnlyAudio); } catch {}
    return mux.status === 0;
  }

  // Case 3: Narration + bg music — mix them together
  if (hasNarration && bgMusicPath) {
    const bgVolume = computeBgMusicVolume(true);
    const mixedAudio = join(tmpdir(), `autotube-mixed-${Date.now()}.aac`);
    const mixOk = mixNarrationWithBgMusic(narrationFile, bgMusicPath, mixedAudio, bgVolume);

    if (!mixOk) {
      console.warn('  ⚠ Background music mixing failed — using narration only');
      // Fall through to narration-only mux below
    } else {
      const mux = spawnSync('ffmpeg', [
        '-y',
        '-i', videoFile,
        '-i', mixedAudio,
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
        '-c:a', 'aac', '-b:a', '192k',
        '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11',
        '-shortest',
        '-pix_fmt', 'yuv420p',
        outputFile,
      ], { encoding: 'utf8', timeout: 300000 });
      try { unlinkSync(mixedAudio); } catch {}
      return mux.status === 0;
    }
  }

  // Case 4: Narration only (no bg music, or bg music mixing failed)
  console.log('  ℹ Using narration only (no background music)');
  const mux = spawnSync('ffmpeg', [
    '-y',
    '-i', videoFile,
    '-i', narrationFile,
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
    '-c:a', 'aac', '-b:a', '192k',
    '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11',
    '-shortest',
    '-pix_fmt', 'yuv420p',
    outputFile,
  ], { encoding: 'utf8', timeout: 300000 });
  return mux.status === 0;
}
