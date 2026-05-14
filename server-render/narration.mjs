/**
 * Narration Generation Module
 *
 * Generates narration audio using a fallback chain:
 *   1. Kokoro-82M (local, free, 82M params) — GPU accelerated, RTF ~0.25
 *   2. Cloudflare MeloTTS (when account ID + API token provided) — cheap fallback
 *   3. Silence (last resort)
 *
 * Subtitles are generated from Kokoro's audio duration (word-level VTT) after audio success.
 */

import { spawnSync } from 'child_process';
import { existsSync, writeFileSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const KOKORO_SCRIPT = join(__dirname, 'kokoro_generate.py');
const KOKORO_PYTHON = '/tmp/tts-env/bin/python';
const DEFAULT_VOICE = 'af_heart';

// Map emotion label to Kokoro speed (only emotion control available)
const EMOTION_SPEED = {
  calm: 0.8,
  neutral: 1.0,
  excited: 1.2,
  urgent: 1.3,
  serious: 0.9,
  sad: 0.85,
  angry: 1.15,
};

/**
 * Generate a silence audio file of the given duration.
 * @param {string} outputPath  Path to write the silence file.
 * @param {number} durationSec Duration in seconds.
 * @returns {boolean} True if the file was created successfully.
 */
export function generateSilence(outputPath, durationSec) {
  spawnSync('ffmpeg', [
    '-y', '-f', 'lavfi', '-i', `anullsrc=r=44100:cl=stereo`,
    '-t', String(durationSec), outputPath,
  ], { encoding: 'utf8', timeout: 10000 });
  return existsSync(outputPath);
}

/**
 * Generate narration audio for a single segment using Kokoro-82M (local TTS).
 * Falls back gracefully if the model is not installed.
 * Pads audio with silence to match targetDuration so the video timeline stays consistent.
 *
 * @param {string} text           Narration text.
 * @param {string} outputPath     Path to write the MP3 file.
 * @param {object} [options]      Optional { speed, voice, targetDuration }.
 * @returns {boolean}
 */
function generateKokoroSegment(text, outputPath, options = {}) {
  const tmpDir = join(dirname(outputPath), '_kokoro');
  spawnSync('mkdir', ['-p', tmpDir]);

  // Map emotion to speed
  const emotion = options.emotion || null;
  const speed = emotion && EMOTION_SPEED[emotion] ? EMOTION_SPEED[emotion] : (options.speed || 1.0);
  const voice = options.voice || DEFAULT_VOICE;
  const targetDuration = options.targetDuration || null;

  // Create batch JSON
  const batchInput = join(tmpDir, 'batch.json');
  const config = {
    segments: [{ id: 'current', text, speed }],
    voice,
    output_dir: tmpDir,
  };
  writeFileSync(batchInput, JSON.stringify(config));

  // Generate audio via Kokoro Python wrapper
  const env = { ...process.env, PYTORCH_ENABLE_MPS_FALLBACK: '1' };
  const result = spawnSync(KOKORO_PYTHON, [
    KOKORO_SCRIPT, batchInput
  ], { encoding: 'utf8', timeout: 300000, env });

  // Read the generated WAV and convert to MP3
  const wavPath = join(tmpDir, 'current.wav');
  const vttPath = join(tmpDir, 'current.vtt');
  if (result.status === 0 && existsSync(wavPath)) {
    // Convert WAV to MP3, padding with silence to match target duration
    // so the video timeline stays consistent with seg.duration
    const ffmpegArgs = ['-y', '-i', wavPath];
    if (targetDuration) {
      ffmpegArgs.push('-af', `apad=whole_dur=${targetDuration}`);
    }
    ffmpegArgs.push('-c:a', 'libmp3lame', '-b:a', '128k', outputPath);
    const convertResult = spawnSync('ffmpeg', ffmpegArgs, { encoding: 'utf8', timeout: 30000 });

    if (convertResult.status === 0 && existsSync(outputPath)) {
      // Copy aligned subtitles from Kokoro's output (VTT timestamps stay as-is)
      if (existsSync(vttPath)) {
        const subtitlePath = outputPath.replace(/\.\w+$/, '.vtt');
        spawnSync('cp', [vttPath, subtitlePath]);
      }
      // Clean up temp files
      try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
      return true;
    }
  }

  return false;
}

/**
 * Generate a silence fallback for a segment.
 *
 * @param {string} outputPath  Path to write the silence file.
 * @param {number} durationSec Duration in seconds.
 * @returns {boolean}
 */
function generateSilenceFallback(outputPath, durationSec) {
  spawnSync('ffmpeg', [
    '-y', '-f', 'lavfi', '-i', `anullsrc=r=44100:cl=stereo`,
    '-t', String(durationSec), outputPath,
  ], { encoding: 'utf8', timeout: 10000 });
  return existsSync(outputPath);
}

/**
 * Generate narration audio for all segments using a fallback chain:
 *   1. Kokoro-82M (local, free, GPU accelerated)
 *   2. MeloTTS (if cfAccountId + cfApiToken provided)
 *   3. Silence (last resort)
 *
 * Includes silence gaps for cold open (5s) and segment title cards (1.5s each).
 *
 * @param {Array} segments   Script segments with narration text.
 * @param {string} outputDir Directory to write audio files.
 * @param {object} [options] Optional config.
 * @param {string} [options.cfAccountId]  Cloudflare account ID for MeloTTS.
 * @param {string} [options.cfApiToken]   Cloudflare API token for MeloTTS.
 * @returns {Promise<Array<{file: string, duration: number}>>}
 */
export async function generateNarration(segments, outputDir, options = {}) {
  const { cfAccountId, cfApiToken } = options;
  const hasMelo = !!cfAccountId && !!cfApiToken;
  const audioFiles = [];

  const engines = ['Kokoro-82M'];
  if (hasMelo) engines.push('MeloTTS');
  console.log(`Generating narration audio (fallback chain: ${engines.join(' → ')})...`);

  // Generate initial silence for cold open (2s) + title card (3s) = 5s
  const introSilenceFile = join(outputDir, 'silence-intro.mp3');
  if (generateSilence(introSilenceFile, 5)) {
    audioFiles.push({ file: introSilenceFile, duration: 5 });
  }

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];

    // Generate 1.5s silence for the segment title card
    const silenceFile = join(outputDir, `silence-${i}.mp3`);
    if (generateSilence(silenceFile, 1.5)) {
      audioFiles.push({ file: silenceFile, duration: 1.5 });
    }

    const audioFile = join(outputDir, `narration-${i}.mp3`);
    process.stdout.write(`\r  Segment ${i + 1}/${segments.length}: "${seg.title.substring(0, 30)}"...`);

    let success = false;

    // Tier 1: Kokoro-82M (local, free, GPU accelerated)
    if (!success) {
      success = generateKokoroSegment(seg.narration, audioFile, {
        emotion: seg.emotion || null,
        speed: seg.speed || 1.0,
        targetDuration: seg.duration,
      });
      if (!success) {
        console.warn(`\n  ⚠ Kokoro failed for segment ${i + 1}, trying next engine`);
      }
    }

    // Tier 2: MeloTTS (Cloudflare, cheap fallback)
    if (hasMelo && !success) {
      success = await generateMeloSegment(seg.narration, audioFile, cfAccountId, cfApiToken);
      if (!success) {
        console.warn(`\n  ⚠ MeloTTS failed for segment ${i + 1}, trying silence`);
      }
    }

    // Tier 3: Silence (last resort)
    if (success) {
      const subtitleFile = audioFile.replace(/\.\w+$/, '.vtt');
      audioFiles.push({
        file: audioFile,
        duration: seg.duration,
        subtitleFile: existsSync(subtitleFile) ? subtitleFile : null,
      });
    } else {
      console.warn(`\n  ⚠ All TTS engines failed for segment ${i + 1}, using silence`);
      if (generateSilenceFallback(audioFile, seg.duration)) {
        audioFiles.push({ file: audioFile, duration: seg.duration });
      }
    }
  }

  console.log(`\n  ✓ Generated ${audioFiles.length} audio segments (chain: ${engines.join(' → ')})`);
  return audioFiles;
}
