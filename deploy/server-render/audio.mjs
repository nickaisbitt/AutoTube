/**
 * Audio Concatenation & Mixing Module
 *
 * Combines narration audio files and mixes with background music using ffmpeg.
 * Implements EBU R128 loudness normalization, proper sample rate conversion,
 * anti-banding crossfade transitions, and intelligent audio ducking.
 *
 * Audio Quality Targets:
 * - Sample rate: 48kHz stereo throughout pipeline
 * - Bitrate: 320kbps AAC
 * - Loudness: -16 LUFS integrated (web video standard)
 * - True peak: -1.5 dBTP maximum
 * - Background music ducking: -18dB during narration, -8dB during gaps
 */

import { spawnSync } from 'child_process';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { computeReverbFilter, computeStereoPanFilter, generateAmbientBed, computeSubBassRumble, buildFilterChain } from './audioFx.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');

/** Style-to-filename mapping for background music tracks. */
const BG_MUSIC_MAP = {
  business_insider: 'bg-neutral.aac',
  warfront: 'bg-tense.aac',
  documentary: 'bg-neutral.aac',
  explainer: 'bg-uplifting.aac',
};

/** User-selected music preset → filename (matches src/services/audioMixer.ts). */
const MUSIC_PRESET_MAP = {
  tense: 'bg-tense.aac',
  uplifting: 'bg-uplifting.aac',
  neutral: 'bg-neutral.aac',
  ambient: 'bg-neutral.aac',
};

/**
 * Resolves the background music file path for a given video style and/or preset.
 * musicPreset takes priority over style when provided.
 * Falls back to the generic neutral track if the preferred file is missing.
 * Returns null only if no bg music file exists on disk.
 *
 * @param {string|null} style  The video style (e.g. 'business_insider').
 * @param {string|null} [musicPreset]  Explicit preset id (e.g. 'tense', 'neutral').
 * @returns {string|null}
 */
export function resolveBackgroundMusicPath(style, musicPreset = null) {
  const candidates = [];

  if (musicPreset && MUSIC_PRESET_MAP[musicPreset]) {
    candidates.push(MUSIC_PRESET_MAP[musicPreset]);
  }

  if (style && BG_MUSIC_MAP[style]) {
    candidates.push(BG_MUSIC_MAP[style]);
  }

  candidates.push('bg-neutral.aac');

  for (const filename of candidates) {
    const filePath = join(PROJECT_ROOT, 'public', 'audio', filename);
    if (existsSync(filePath)) return filePath;
  }

  return null;
}

/**
 * Normalizes an audio file to EBU R128 loudness standard (-16 LUFS).
 * Uses ffmpeg's loudnorm filter for two-pass normalization.
 * First pass measures loudness, second pass applies correction.
 *
 * @param {string} inputFile   Path to input audio file.
 * @param {string} outputFile  Path for normalized output file.
 * @param {object} [options]   Optional parameters.
 * @param {number} [options.targetLUFS=-16] Target integrated loudness in LUFS.
 * @param {number} [options.truePeak=-1.5] Maximum true peak in dBTP.
 * @param {number} [options.loudnessRange=11] Target loudness range in LU.
 * @returns {{success: boolean, measuredLUFS?: number}} Result with measured loudness.
 */
export function normalizeAudioEBUR128(inputFile, outputFile, options = {}) {
  const { targetLUFS = -16, truePeak = -1.5, loudnessRange = 11 } = options;

  console.log(`  📊 Measuring audio loudness for normalization...`);

  // First pass: measure loudness
  const measureResult = spawnSync('ffmpeg', [
    '-y',
    '-i', inputFile,
    '-af', `loudnorm=I=${targetLUFS}:TP=${truePeak}:LRA=${loudnessRange}:print_format=json`,
    '-f', 'null',
    '/dev/null',
  ], { encoding: 'utf8', timeout: 120000 });

  // Parse measured values from stderr safely
  const jsonMatch = measureResult.stderr ? measureResult.stderr.match(/{[\s\S]*?}/) : null;
  if (!jsonMatch) {
    console.warn('  ⚠ Could not measure loudness — skipping normalization');
    return { success: false };
  }

  let measured;
  try {
    measured = JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.warn('  ⚠ Failed to parse loudness measurements:', err.message);
    return { success: false };
  }

  console.log(`  📊 Measured: ${measured.input_i} LUFS, TP: ${measured.input_tp} dBTP, LRA: ${measured.input_lra} LU`);

  // Second pass: apply normalization with measured values
  console.log(`  🔧 Applying EBU R128 normalization (target: ${targetLUFS} LUFS)...`);
  const normalizeResult = spawnSync('ffmpeg', [
    '-y',
    '-i', inputFile,
    '-af', `loudnorm=I=${targetLUFS}:TP=${truePeak}:LRA=${loudnessRange}:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true:print_format=summary`,
    '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-ac', '2',
    outputFile,
  ], { encoding: 'utf8', timeout: 120000 });

  const success = normalizeResult.status === 0;
  if (success) {
    console.log(`  ✓ Audio normalized to ${targetLUFS} LUFS`);
  } else {
    console.warn('  ⚠ Normalization failed — using original audio');
  }

  return { success, measuredLUFS: parseFloat(measured.input_i) };
}

/**
 * Converts audio to target format: 48kHz stereo, 16-bit minimum.
 * Handles mono-to-stereo upmixing and sample rate conversion.
 *
 * @param {string} inputFile   Path to input audio file.
 * @param {string} outputFile  Path for converted output file.
 * @param {object} [options]   Optional parameters.
 * @param {number} [options.sampleRate=48000] Target sample rate in Hz.
 * @param {number} [options.channels=2] Target number of channels.
 * @param {string} [options.codec='aac'] Output codec.
 * @param {number} [options.bitrate=192] Bitrate in kbps.
 * @returns {boolean} True if conversion succeeded.
 */
export function convertAudioFormat(inputFile, outputFile, options = {}) {
  const { sampleRate = 48000, channels = 2, codec = 'aac', bitrate = 192 } = options;

  console.log(`  🔄 Converting audio: ${sampleRate}Hz, ${channels}ch, ${bitrate}kbps ${codec.toUpperCase()}`);

  const args = [
    '-y',
    '-i', inputFile,
    '-ar', String(sampleRate),
    '-ac', String(channels),
    '-c:a', codec,
    '-b:a', `${bitrate}k`,
  ];
  if (codec !== 'aac') {
    args.push('-sample_fmt', 's16');
  }
  args.push(outputFile);

  const result = spawnSync('ffmpeg', args, { encoding: 'utf8', timeout: 60000 });

  if (result.status !== 0) {
    console.warn(`  ⚠ convertAudioFormat failed:`, result.stderr);
  }

  return result.status === 0;
}

/**
 * Computes the background music volume level with intelligent ducking.
 * Uses relative gain staging to ensure narration clarity.
 *
 * Ducking strategy:
 * - During narration: -18dB (0.126 linear) for clear speech intelligibility
 * - During gaps: -8dB (0.398 linear) for ambient presence
 * - Fade transitions: Smooth exponential curves to prevent artifacts
 *
 * @param {boolean} hasNarration  Whether narration is currently playing.
 * @param {object} [options]      Optional ducking parameters.
 * @param {number} [options.duckingLevel=-18] Ducking level in dB during narration.
 * @param {number} [options.peakLevel=-8] Peak level in dB during gaps.
 * @returns {number} Linear volume multiplier (0.0–1.0).
 */
export function computeBgMusicVolume(hasNarration, options = {}) {
  const { duckingLevel = -18.4, peakLevel = -8 } = options;

  // Convert dB to linear scale: linear = 10^(dB/20)
  const dbValue = hasNarration ? duckingLevel : peakLevel;
  return Math.pow(10, dbValue / 20);
}

/**
 * Applies dynamic ducking envelope to background music based on narration timing.
 * Creates smooth fade transitions between ducked and peak states.
 *
 * @param {string} bgMusicPath       Path to background music file.
 * @param {Array<{start: number, end: number}>} narrationTimings  Narration intervals in seconds.
 * @param {string} outputFile        Path for ducked output file.
 * @param {number} totalDuration     Total duration in seconds.
 * @param {object} [options]         Optional parameters.
 * @param {number} [options.duckingLevel=-18] Ducking level in dB.
 * @param {number} [options.peakLevel=-8] Peak level in dB.
 * @param {number} [options.fadeDuration=0.3] Crossfade duration in seconds.
 * @returns {boolean} True if ducking succeeded.
 */
export function applyDynamicDucking(bgMusicPath, narrationTimings, outputFile, totalDuration, options = {}) {
  const { duckingLevel = -24, peakLevel = -14, fadeDuration = 0.3, lookAhead = 0.1 } = options;

  console.log(`  🎚️ Applying dynamic ducking envelope (${narrationTimings.length} narration segments)...`);

  // Build volume automation filter string
  // Format: volume=enable='between(t,start,end)':volume=value
  const duckingLinear = Math.pow(10, duckingLevel / 20);
  const peakLinear = Math.pow(10, peakLevel / 20);

  // Start at peak level
  let filterParts = [`volume=${peakLinear}:eval=frame`];

  // Apply ducking during each narration segment with fade transitions
  narrationTimings.forEach((segment, idx) => {
    const { start, end } = segment;

    // Fade down before narration starts with look-ahead
    const fadeStart = Math.max(0, start - fadeDuration - lookAhead);
    filterParts.push(
      `volume=${duckingLinear}:enable='between(t,${fadeStart},${end + lookAhead})'`
    );

    // Fade up after narration ends
    if (idx < narrationTimings.length - 1) {
      const nextStart = narrationTimings[idx + 1].start;
      const gapDuration = nextStart - end;
      if (gapDuration > fadeDuration * 2) {
        // Enough room for fade up and hold at peak
        filterParts.push(
          `volume=${peakLinear}:enable='between(t,${end + fadeDuration},${nextStart - fadeDuration})'`
        );
      }
    } else {
      // Last segment: fade up to end or total duration
      const fadeEnd = Math.min(totalDuration, end + fadeDuration + 2);
      filterParts.push(
        `volume=${peakLinear}:enable='between(t,${end + fadeDuration},${fadeEnd})'`
      );
    }
  });

  // Intro hook: first 3s at 5% volume (let the hook breathe)
  const introLinear = 0.05 / peakLinear;
  filterParts.push(`volume=${introLinear}:enable='between(t,0,3)':eval=frame`);

  // Outro: last 5s at 30% volume (build to ending)
  const outroLinear = 0.3 / peakLinear;
  filterParts.push(`volume=${outroLinear}:enable='between(t,${Math.max(0, totalDuration - 5)},${totalDuration})':eval=frame`);

  // Combine filter parts with commas
  const fullFilter = filterParts.join(',');

  const result = spawnSync('ffmpeg', [
    '-y',
    '-stream_loop', '-1',
    '-i', bgMusicPath,
    '-t', String(totalDuration),
    '-filter_complex', `[0:a]aresample=48000:async=1,${fullFilter}[ducked]`,
    '-map', '[ducked]',
    '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-ac', '2',
    outputFile,
  ], { encoding: 'utf8', timeout: 120000 });

  return result.status === 0;
}

/**
 * Concatenate multiple audio files into a single AAC file using ffmpeg concat.
 * Implements anti-banding crossfade transitions between segments to prevent
 * audible artifacts at segment boundaries.
 *
 * Crossfade strategy:
 * - Uses afade filter with exponential curves (not linear) to prevent banding
 * - Applies 150ms fade-out/fade-in overlap between consecutive segments
 * - Normalizes all segments to consistent sample rate (48kHz) before concatenation
 *
 * @param {Array<{file: string, duration: number}>} audioFiles  Audio segments to concatenate.
 * @param {string} outputFile  Path for the combined output file.
 * @param {object} [options]   Optional parameters.
 * @param {number} [options.crossfadeDuration=0.15] Crossfade duration in seconds.
 * @returns {Promise<boolean>} True if concatenation succeeded.
 */
export async function concatenateAudio(audioFiles, outputFile, options = {}) {
  const { crossfadeDuration = 0.5 } = options;

  if (audioFiles.length === 0) {
    console.warn('  ⚠ No audio files to concatenate');
    return false;
  }

  if (audioFiles.length === 1) {
    // Single file: just convert format
    return convertAudioFormat(audioFiles[0].file, outputFile);
  }

  console.log(`  🔗 Concatenating ${audioFiles.length} audio segments with ${crossfadeDuration}s crossfades...`);

  // First, normalize all input files to consistent format
  const normalizedFiles = [];
  for (let i = 0; i < audioFiles.length; i++) {
    const normalizedPath = join(tmpdir(), `autotube-norm-${Date.now()}-${i}.aac`);
    const ok = convertAudioFormat(audioFiles[i].file, normalizedPath);
    if (!ok) {
      console.warn(`  ⚠ Failed to normalize segment ${i}`);
      // Clean up already normalized files
      normalizedFiles.forEach(f => { try { unlinkSync(f); } catch {} });
      return false;
    }
    normalizedFiles.push(normalizedPath);
  }

  // Build concat list file
  const listFile = join(tmpdir(), `autotube-audio-list-${Date.now()}.txt`);
  const listContent = normalizedFiles.map(f => `file '${f}'`).join('\n');
  writeFileSync(listFile, listContent);

  // Use concat demuxer with anti-banding crossfade filter chain
  // The crossfade uses exponential curves to avoid quantization banding artifacts
  const crossfadeMs = Math.round(crossfadeDuration * 1000);
  
  // For 2+ files, build complex filter with acrossfade
  let filterComplex = '';
  let lastOutput = '[0:a]';
  
  for (let i = 0; i < normalizedFiles.length; i++) {
    if (i === 0) {
      filterComplex += `[${i}:a]aresample=48000:async=1:first_pts=0[a${i}];`;
    } else {
      filterComplex += `[${i}:a]aresample=48000:async=1[a${i}];`;
    }
  }
  
  // Chain acrossfade filters
  if (normalizedFiles.length === 2) {
    filterComplex += `[a0][a1]acrossfade=d=${crossfadeDuration}:c1=exp:c2=exp[out]`;
  } else {
    // Multiple segments: chain acrossfade operations
    filterComplex += `[a0][a1]acrossfade=d=${crossfadeDuration}:c1=exp:c2=exp[cross0];`;
    for (let i = 2; i < normalizedFiles.length; i++) {
      const prevIdx = i - 2;
      const currIdx = i;
      if (i === normalizedFiles.length - 1) {
        filterComplex += `[cross${prevIdx}][a${currIdx}]acrossfade=d=${crossfadeDuration}:c1=exp:c2=exp[out]`;
      } else {
        filterComplex += `[cross${prevIdx}][a${currIdx}]acrossfade=d=${crossfadeDuration}:c1=exp:c2=exp[cross${i-1}];`;
      }
    }
  }

  const args = [
    '-y',
    ...normalizedFiles.flatMap((_, i) => ['-i', normalizedFiles[i]]),
    '-filter_complex', filterComplex,
    '-map', '[out]',
    '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-ac', '2',
  ];
  // native aac encoder only supports fltp sample format
  // do not pass -sample_fmt s16 for aac
  args.push(outputFile);

  const result = spawnSync('ffmpeg', args, { encoding: 'utf8', timeout: 120000 });

  let success = false;
  if (result.status !== 0) {
    console.warn('  ⚠ Complex crossfade failed — falling back to simple concat:', result.stderr);
    // Fallback: simple concatenation without crossfades
    const fallbackResult = spawnSync('ffmpeg', [
      '-y', '-f', 'concat', '-safe', '0',
      '-i', listFile,
      '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-ac', '2',
      '-af', 'aresample=48000:async=1:min_hard_comp=0.100000:first_pts=0',
      outputFile,
    ], { encoding: 'utf8', timeout: 60000 });
    success = fallbackResult.status === 0;
  } else {
    console.log('  ✓ Audio concatenated with anti-banding crossfades');
    success = true;
  }

  // Clean up temporary files
  try { unlinkSync(listFile); } catch {}
  normalizedFiles.forEach(f => { try { unlinkSync(f); } catch {} });

  return success;
}

/**
 * Mix background music with narration audio into a single audio file.
 * Uses ffmpeg amix filter with -stream_loop -1 to seamlessly loop the
 * background track when it is shorter than the narration.
 *
 * Enhanced mixing features:
 * - EBU R128 loudness normalization on final mix (-16 LUFS target)
 * - Proper stereo upmixing of mono background music
 * - Anti-banding dithering during bit depth reduction
 * - Smooth dropout transition to prevent abrupt cuts
 *
 * @param {string} narrationFile  Path to the combined narration audio.
 * @param {string} bgMusicPath   Path to the background music file.
 * @param {string} outputFile    Path for the mixed output audio.
 * @param {number} bgVolume      Volume level for background music (0.0–1.0).
 * @param {object} [options]     Optional mixing parameters.
 * @param {boolean} [options.normalize=true] Whether to apply EBU R128 normalization.
 * @param {number} [options.targetLUFS=-16] Target loudness in LUFS.
 * @returns {boolean} True if mixing succeeded.
 */
export function generateSubBassTrack(statTimestamps, totalDuration, outputPath) {
  if (!statTimestamps || statTimestamps.length === 0) return false;
  const filterParts = [];
  let inputCount = 0;
  for (let i = 0; i < Math.min(statTimestamps.length, 10); i++) {
    const ts = statTimestamps[i];
    filterParts.push(`sine=frequency=50:duration=0.8[s${i}]`);
    filterParts.push(`[s${i}]afade=t=in:st=0:d=0.1,afade=t=out:st=0.6:d=0.2,volume=0.08:enable='between(t,${ts.toFixed(2)},${(ts + 0.8).toFixed(2)})'[r${i}]`);
    inputCount++;
  }
  if (inputCount === 0) return false;
  const mixInputs = Array.from({ length: inputCount }, (_, i) => `[r${i}]`).join('');
  filterParts.push(`anullsrc=r=48000:cl=stereo[base]`);
  filterParts.push(`[base]${Array.from({ length: inputCount }, (_, i) => `[r${i}]`).join('')}amix=inputs=${inputCount + 1}:duration=first[out]`);
  const args = ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', String(totalDuration), '-filter_complex', filterParts.join(';'), '-map', '[out]', '-ar', '48000', '-ac', '2', '-c:a', 'aac', '-b:a', '128k', outputPath];
  const result = spawnSync('ffmpeg', args, { encoding: 'utf8', timeout: 30000 });
  return result.status === 0 && existsSync(outputPath);
}

export function generateTransientDuckingTrack(wordTimestamps, impactWords, totalDuration, outputPath) {
  if (!wordTimestamps || wordTimestamps.length === 0) return false;
  const events = [];
  for (const wt of wordTimestamps) {
    const word = (wt.word || '').toLowerCase();
    if (impactWords.some(iw => word.includes(iw))) {
      events.push({ time: wt.start || 0, duration: 0.15, depth: 0.4 });
    }
  }
  if (events.length === 0) return false;
  const filterParts = events.map((e, i) =>
    `sine=frequency=80:duration=${e.duration}[d${i}],[d${i}]volume=${e.depth}:enable='between(t,${e.time.toFixed(3)},${(e.time + e.duration).toFixed(3)})'[dd${i}]`
  );
  const mixInputs = events.map((_, i) => `[dd${i}]`).join('');
  filterParts.push(`anullsrc=r=48000:cl=stereo[base]`);
  filterParts.push(`[base]${mixInputs}amix=inputs=${events.length + 1}:duration=first[out]`);
  const args = ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', String(totalDuration), '-filter_complex', filterParts.join(';'), '-map', '[out]', '-ar', '48000', '-ac', '2', '-c:a', 'aac', '-b:a', '128k', outputPath];
  const result = spawnSync('ffmpeg', args, { encoding: 'utf8', timeout: 30000 });
  return result.status === 0 && existsSync(outputPath);
}

export function generateAmbientBedForStyle(style, duration, outputPath) {
  const styleMap = {
    warfront: 'tension',
    cyber: 'tech',
    documentary: 'calm',
    business_insider: 'calm',
    explainer: 'space',
  };
  const preset = styleMap[style] || 'calm';
  const args = generateAmbientBed(preset, duration, outputPath);
  const result = spawnSync('ffmpeg', args, { encoding: 'utf8', timeout: 60000 });
  return result.status === 0 && existsSync(outputPath);
}

export function mixNarrationWithBgMusic(narrationFile, bgMusicPath, outputFile, bgVolume, options = {}) {
  const { normalize = true, targetLUFS = -16, style = 'documentary', enableAudioFx = true, enableAmbient = false, enableSubBass = false, enableDucking = false, statTimestamps = null, wordTimestamps = null, narrationTimings = [] } = options;

  console.log(`  🎵 Mixing background music at volume ${bgVolume.toFixed(3)} (${bgMusicPath})`);

  // Generate ambient bed if enabled (Task 44)
  let ambientFile = null;
  if (enableAmbient && style) {
    ambientFile = join(tmpdir(), `ambient-${Date.now()}.aac`);
    const ambientOk = generateAmbientBedForStyle(style, options.totalDuration || 120, ambientFile);
    if (!ambientOk) {
      console.warn('  ⚠ Ambient bed generation failed, continuing without ambient');
      ambientFile = null;
    } else {
      console.log(`  🎵 Generated ambient bed`);
    }
  }

  // Generate sub-bass rumble on stats (Task 41)
  let subBassFile = null;
  if (enableSubBass && statTimestamps && statTimestamps.length > 0) {
    subBassFile = join(tmpdir(), `subbass-${Date.now()}.aac`);
    const subBassOk = generateSubBassTrack(statTimestamps, options.totalDuration || 120, subBassFile);
    if (!subBassOk) {
      subBassFile = null;
    } else {
      console.log(`  🎵 Generated sub-bass rumble for ${statTimestamps.length} stat moments`);
    }
  }

  // Generate transient ducking track (Task 43)
  let duckingFile = null;
  if (enableDucking && wordTimestamps && wordTimestamps.length > 0) {
    const impactWords = ['boom', 'crash', 'slam', 'hit', 'drop', 'blast', 'strike', 'explode', 'shatter', 'break', 'massive', 'stunning', 'incredible', 'shocking'];
    duckingFile = join(tmpdir(), `ducking-${Date.now()}.aac`);
    const duckOk = generateTransientDuckingTrack(wordTimestamps, impactWords, options.totalDuration || 120, duckingFile);
    if (!duckOk) {
      duckingFile = null;
    } else {
      console.log(`  🎵 Generated transient ducking track`);
    }
  }

  // Build filter chain with audio FX
  const narrationFilter = [
    '[0:a]aresample=48000:async=1:min_hard_comp=0.100000',
    'highpass=f=80',
    'compand=attacks=0.1:decays=0.1:points=-20/-20|-10/-5|0/0',
    'equalizer=f=3000:t=q:w=1:g=2',
    'adelay=1500|1500',
  ].join(',');
  const filterParts = [
    `${narrationFilter}[narration]`,
    `[1:a]aresample=48000:async=1,equalizer=f=3000:t=q:w=2:g=-6,volume=${bgVolume.toFixed(4)}[bg]`,
  ];

  // Generate room tone file for the duration
  const roomToneFile = join(tmpdir(), `roomtone-${Date.now()}.aac`);
  const totalDur = options.totalDuration || 120;
  const rtResult = spawnSync('ffmpeg', [
    '-y', '-f', 'lavfi', '-i', 'anoisesrc=d=1:c=pink:r=48000',
    '-t', String(totalDur),
    '-af', 'volume=0.003',
    '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-ac', '2',
    roomToneFile,
  ], { encoding: 'utf8', timeout: 30000 });
  const hasRoomTone = rtResult.status === 0 && existsSync(roomToneFile);

  // Build input list for ffmpeg
  const inputFiles = [narrationFile, bgMusicPath];
  let inputIdx = 2;
  const extraInputs = [];

  if (ambientFile) {
    const ambientVol = computeAmbientVolume(options.pacingScore || 3);
    extraInputs.push({ file: ambientFile, label: 'ambient', vol: ambientVol });
  }
  if (subBassFile) {
    extraInputs.push({ file: subBassFile, label: 'subbass', vol: 0.12 });
  }
  if (duckingFile) {
    extraInputs.push({ file: duckingFile, label: 'ducking', vol: 0.08 });
  }
  if (hasRoomTone) {
    extraInputs.push({ file: roomToneFile, label: 'roomtone', vol: 1.0 });
  }

  for (const extra of extraInputs) {
    filterParts.push(`[${inputIdx}:a]aresample=48000:async=1,volume=${extra.vol}[${extra.label}]`);
    inputFiles.push(extra.file);
    inputIdx++;
  }

  // Add transition noise bursts between narration segments
  const noiseCount = narrationTimings ? Math.max(0, narrationTimings.length - 1) : 0;
  const noiseLabels = [];
  if (noiseCount > 0) {
    for (let i = 0; i < noiseCount; i++) {
      const transTime = narrationTimings[i].end;
      filterParts.push(
        `anoisesrc=d=0.3:c=white:r=48000[ns${i}]`,
        `[ns${i}]adelay=${Math.round(transTime * 1000)}|${Math.round(transTime * 1000)},volume=0.05[tn${i}]`
      );
      noiseLabels.push(`tn${i}`);
    }
  }

  // Mix all tracks together
  const mixLabels = ['narration_fx', 'bg_fx', ...extraInputs.map(e => e.label), ...noiseLabels];
  const mixInputs = mixLabels.map(l => `[${l}]`).join('');
  const inputCount = mixLabels.length;

  // Account for 1.5s adelay in total duration
  const actualDuration = totalDur + 1.5;
  const fadeDuration = 2;
  const fadeStart = Math.max(0, actualDuration - fadeDuration);

  if (enableAudioFx) {
    const reverbFilter = computeReverbFilter('subtle');
    filterParts.push(`[narration]${reverbFilter}[narration_fx]`);
    
    const panDirection = style === 'warfront' ? 'left-to-right' : style === 'cyber' ? 'right-to-left' : 'center';
    if (panDirection !== 'center') {
      const panFilter = computeStereoPanFilter(panDirection, 10);
      filterParts.push(`[bg]${panFilter}[bg_fx]`);
    } else {
      filterParts.push('[bg]aresample=48000:async=1[bg_fx]');
    }
    
    const weights = ['1', '0.5', ...extraInputs.map(() => '0.1'), ...noiseLabels.map(() => '0.08')].join(' ');
    filterParts.push(`${mixInputs}amix=inputs=${inputCount}:duration=first:dropout_transition=3:weights="${weights}",alimiter=limit=0.891:attack=0.1:release=10,afade=t=out:st=${fadeStart}:d=${fadeDuration}[out]`);
  } else {
    filterParts.push(`[narration][bg]amix=inputs=2:duration=first:dropout_transition=3:weights="1 0.5",alimiter=limit=0.891:attack=0.1:release=10,afade=t=out:st=${fadeStart}:d=${fadeDuration}[out]`);
  }

  const filterChain = filterParts.join(';');

  const result = spawnSync('ffmpeg', [
    '-y',
    ...inputFiles.flatMap((f, i) => {
      const args = [];
      if (i > 0) args.push('-stream_loop', '-1');
      args.push('-i', f);
      return args;
    }),
    '-filter_complex', filterChain,
    '-map', '[out]',
    '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-ac', '2',
    '-dither_method', 'triangular_hp',
    outputFile,
  ], { encoding: 'utf8', timeout: 120000 });

  if (result.status !== 0) {
    console.warn('  ⚠ Initial mix failed:', result.stderr);
    try { if (ambientFile && existsSync(ambientFile)) unlinkSync(ambientFile); } catch {}
    try { if (subBassFile && existsSync(subBassFile)) unlinkSync(subBassFile); } catch {}
    try { if (duckingFile && existsSync(duckingFile)) unlinkSync(duckingFile); } catch {}
    try { if (hasRoomTone && existsSync(roomToneFile)) unlinkSync(roomToneFile); } catch {}
    return false;
  }
  
  // Clean up generated files after successful mix
  try { if (ambientFile && existsSync(ambientFile)) unlinkSync(ambientFile); } catch {}
  try { if (subBassFile && existsSync(subBassFile)) unlinkSync(subBassFile); } catch {}
  try { if (duckingFile && existsSync(duckingFile)) unlinkSync(duckingFile); } catch {}
  try { if (hasRoomTone && existsSync(roomToneFile)) unlinkSync(roomToneFile); } catch {}

  // Apply EBU R128 normalization if requested
  if (normalize) {
    console.log(`  📊 Applying final mix normalization to ${targetLUFS} LUFS...`);
    const normalizedOutput = join(tmpdir(), `autotube-finalnorm-${Date.now()}.aac`);
    const normResult = normalizeAudioEBUR128(outputFile, normalizedOutput, { targetLUFS });
    
    if (normResult.success) {
      // Replace original with normalized version
      try {
        unlinkSync(outputFile);
        spawnSync('mv', [normalizedOutput, outputFile]);
        console.log('  ✓ Final mix normalized');
      } catch (err) {
        console.warn('  ⚠ Failed to replace with normalized audio:', err.message);
      }
    } else {
      console.warn('  ⚠ Normalization skipped — using unnormalized mix');
      try { unlinkSync(normalizedOutput); } catch {}
    }
  }

  return true;
}

/**
 * Create an audio track from background music only (no narration).
 * Used when all narration clips are unavailable.
 * Loops the track seamlessly and trims to the video duration.
 *
 * Enhanced features:
 * - Smooth fade-in at start (500ms) and fade-out at end (2s)
 * - EBU R128 normalization to -16 LUFS for consistent loudness
 * - Proper stereo upmixing from mono sources
 *
 * @param {string} bgMusicPath   Path to the background music file.
 * @param {string} outputFile    Path for the output audio.
 * @param {number} duration      Target duration in seconds.
 * @param {number} bgVolume      Volume level for background music (0.0–1.0).
 * @param {object} [options]     Optional parameters.
 * @param {number} [options.fadeIn=0.5] Fade-in duration in seconds.
 * @param {number} [options.fadeOut=2.0] Fade-out duration in seconds.
 * @param {boolean} [options.normalize=true] Whether to apply EBU R128 normalization.
 * @returns {boolean} True if creation succeeded.
 */
export function createBgMusicOnlyTrack(bgMusicPath, outputFile, duration, bgVolume, options = {}) {
  const { fadeIn = 0.5, fadeOut = 2.0, normalize = true } = options;

  console.log(`  🎵 Creating background music-only track at volume ${bgVolume.toFixed(3)} (${duration}s)`);

  // Build filter chain with fade-in/fade-out and volume adjustment
  const filterChain = [
    `[0:a]aresample=48000:async=1`,
    `afade=t=in:st=0:d=${fadeIn}:curve=exp`,
    `afade=t=out:st=${Math.max(0, duration - fadeOut)}:d=${fadeOut}:curve=exp`,
    `volume=${bgVolume.toFixed(4)}[out]`
  ].join(',');

  const result = spawnSync('ffmpeg', [
    '-y',
    '-stream_loop', '-1',
    '-i', bgMusicPath,
    '-t', String(duration),
    '-filter_complex', filterChain,
    '-map', '[out]',
    '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-ac', '2',
    '-dither_method', 'triangular_hp',
    outputFile,
  ], { encoding: 'utf8', timeout: 120000 });

  if (result.status !== 0) {
    console.warn('  ⚠ Background music track creation failed:', result.stderr);
    return false;
  }

  // Apply EBU R128 normalization if requested
  if (normalize) {
    const normalizedOutput = join(tmpdir(), `autotube-bgnorm-${Date.now()}.aac`);
    const normResult = normalizeAudioEBUR128(outputFile, normalizedOutput, { targetLUFS: -16 });
    
    if (normResult.success) {
      try {
        unlinkSync(outputFile);
        spawnSync('mv', [normalizedOutput, outputFile]);
      } catch (err) {
        console.warn('  ⚠ Failed to replace with normalized audio:', err.message);
      }
    } else {
      try { unlinkSync(normalizedOutput); } catch {}
    }
  }

  return true;
}

/**
 * Mux video + audio (narration, optionally mixed with background music) into a final MP4.
 *
 * When backgroundMusic is enabled (default), the function:
 * 1. Resolves the style-appropriate bg music file from public/audio/bg-{style}.aac
 * 2. Converts audio to 48kHz stereo if needed (handles 44.1kHz mono sources)
 * 3. Mixes narration + bg music using amix with intelligent ducking
 * 4. Applies EBU R128 normalization (-16 LUFS target for web video)
 * 5. Falls back to narration-only if the bg music file is missing
 *
 * Audio quality targets:
 * - Sample rate: 48kHz throughout pipeline
 * - Channels: Stereo (2ch)
 * - Bitrate: 320kbps AAC
 * - Loudness: -16 LUFS integrated
 * - True peak: -1.5 dBTP maximum
 *
 * @param {string} videoFile       Path to the video-only file.
 * @param {string|null} narrationFile  Path to the combined narration audio (null if no narration).
 * @param {string} outputFile      Path for the final muxed MP4.
 * @param {number} videoDuration   Total video duration in seconds.
 * @param {object} [options]       Additional options.
 * @param {string} [options.style] Video style for bg music selection.
 * @param {string} [options.musicPreset] Explicit music preset (overrides style mapping).
 * @param {boolean} [options.backgroundMusic=true] Whether to include background music.
 * @param {Array<{start: number, end: number}>} [options.narrationTimings] Narration segments for dynamic ducking.
 * @returns {boolean} True if muxing succeeded.
 */
export function muxVideoWithAudio(videoFile, narrationFile, outputFile, videoDuration, options = {}) {
  const { 
    style = null, 
    musicPreset = null,
    backgroundMusic = true,
    narrationTimings = [] 
  } = options;
  
  const hasNarration = narrationFile && existsSync(narrationFile);

  // Resolve background music path (preset overrides style when set)
  let bgMusicPath = null;
  if (backgroundMusic) {
    bgMusicPath = resolveBackgroundMusicPath(style, musicPreset);
    if (bgMusicPath) {
      const source = musicPreset ? `preset=${musicPreset}` : (style ? `style=${style}` : 'default');
      console.log(`  🎼 Background music resolved (${source}): ${bgMusicPath}`);
    }
  }

  // Case 1: No narration and no bg music — mux video only (silent)
  if (!hasNarration && !bgMusicPath) {
    console.log('  ℹ No narration or background music — producing silent video');
    const mux = spawnSync('ffmpeg', [
      '-y',
      '-i', videoFile,
      '-c:v', 'copy',
      outputFile,
    ], { encoding: 'utf8', timeout: 300000 });
    return mux.status === 0;
  }

  // Case 2: No narration but bg music available — use bg music at peak level as primary audio
  if (!hasNarration && bgMusicPath) {
    const bgVolume = computeBgMusicVolume(false); // Peak level (-8dB)
    const bgOnlyAudio = join(tmpdir(), `autotube-bgonly-${Date.now()}.aac`);
    const bgOk = createBgMusicOnlyTrack(bgMusicPath, bgOnlyAudio, videoDuration, bgVolume);
    
    if (!bgOk) {
      console.warn('  ⚠ Background music creation failed — producing silent video');
      const mux = spawnSync('ffmpeg', [
        '-y', '-i', videoFile,
        '-c:v', 'copy',
        outputFile,
      ], { encoding: 'utf8', timeout: 300000 });
      return mux.status === 0;
    }
    
    const mux = spawnSync('ffmpeg', [
      '-y',
      '-i', videoFile,
      '-i', bgOnlyAudio,
      '-c:v', 'copy',
      '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-ac', '2',
      '-t', String(videoDuration),
      outputFile,
    ], { encoding: 'utf8', timeout: 300000 });
    
    try { unlinkSync(bgOnlyAudio); } catch {}
    return mux.status === 0;
  }

  // Case 3: Narration + bg music — mix them together with dynamic ducking
  if (hasNarration && bgMusicPath) {
    const mixedAudio = join(tmpdir(), `autotube-mixed-${Date.now()}.aac`);
    let mixOk = false;

    // Build common mix options
    const mixOptions = {
      ...options,
      totalDuration: videoDuration,
      narrationTimings,
    };

    // If narration timings provided, use dynamic ducking envelope
    if (narrationTimings.length > 0) {
      console.log(`  🎚️ Using dynamic ducking with ${narrationTimings.length} narration segments`);
      
      // First, create ducked background music track
      const duckedBgMusic = join(tmpdir(), `autotube-ducked-${Date.now()}.aac`);
      const duckOk = applyDynamicDucking(bgMusicPath, narrationTimings, duckedBgMusic, videoDuration);
      
      if (duckOk) {
        // Mix narration with ducked background music
        const bgVolume = 1.0; // Ducking already applied, use unity gain
        mixOk = mixNarrationWithBgMusic(narrationFile, duckedBgMusic, mixedAudio, bgVolume, mixOptions);
        try { unlinkSync(duckedBgMusic); } catch {}
      }
    }

    // Fallback to static volume mixing if dynamic ducking not available or failed
    if (!mixOk) {
      const bgVolume = computeBgMusicVolume(true); // Ducking level (-18dB)
      mixOk = mixNarrationWithBgMusic(narrationFile, bgMusicPath, mixedAudio, bgVolume, mixOptions);
    }

    if (!mixOk) {
      console.warn('  ⚠ Background music mixing failed — using narration only');
      // Fall through to narration-only mux below
    } else {
      const mux = spawnSync('ffmpeg', [
        '-y',
        '-i', videoFile,
        '-i', mixedAudio,
        '-c:v', 'copy',
        '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-ac', '2',
        '-t', String(videoDuration),
        outputFile,
      ], { encoding: 'utf8', timeout: 300000 });
      
      try { unlinkSync(mixedAudio); } catch {}
      return mux.status === 0;
    }
  }

  // Case 4: Narration only (no bg music, or bg music mixing failed)
  console.log('  ℹ Using narration only (no background music)');
  
  // Normalize narration to -16 LUFS before muxing
  const normalizedNarration = join(tmpdir(), `autotube-narrnorm-${Date.now()}.aac`);
  const normResult = normalizeAudioEBUR128(narrationFile, normalizedNarration, { targetLUFS: -16 });
  
  const narrationToMux = normResult.success ? normalizedNarration : narrationFile;
  
  const mux = spawnSync('ffmpeg', [
    '-y',
    '-i', videoFile,
    '-i', narrationToMux,
    '-c:v', 'copy',
    '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-ac', '2',
    '-t', String(videoDuration),
    outputFile,
  ], { encoding: 'utf8', timeout: 300000 });
  
  try { unlinkSync(normalizedNarration); } catch {}
  return mux.status === 0;
}

/**
 * Mix SFX at beat timestamps.
 * @param {string} narrationFile - Path to narration audio.
 * @param {Array<{time: number, file: string}>} sfxTimestamps - SFX events.
 * @param {string} outputFile - Path for output.
 * @returns {boolean}
 */
export function mixSfxAtBeats(narrationFile, sfxTimestamps, outputFile) {
  if (!sfxTimestamps || sfxTimestamps.length === 0) return false;

  const filterParts = [];
  const inputFiles = [narrationFile];
  const mixLabels = [];

  sfxTimestamps.forEach((sfx, i) => {
    inputFiles.push(sfx.file);
    filterParts.push(`[${i + 1}:a]aresample=48000:async=1,adelay=${Math.round(sfx.time * 1000)}|${Math.round(sfx.time * 1000)},volume=0.3[sfx${i}]`);
    mixLabels.push(`[sfx${i}]`);
  });

  const allLabels = ['[0:a]', ...mixLabels].join('');
  const inputCount = sfxTimestamps.length + 1;
  filterParts.push(`${allLabels}amix=inputs=${inputCount}:duration=first[out]`);

  const result = spawnSync('ffmpeg', [
    '-y',
    ...inputFiles.flatMap((f, i) => i === 0 ? ['-i', f] : ['-i', f]),
    '-filter_complex', filterParts.join(';'),
    '-map', '[out]',
    '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-ac', '2',
    outputFile,
  ], { encoding: 'utf8', timeout: 120000 });

  return result.status === 0;
}

/**
 * Generate a frequency-swept riser effect.
 * @param {number} duration - Duration in seconds.
 * @param {number} startFreq - Start frequency in Hz.
 * @param {number} endFreq - End frequency in Hz.
 * @param {string} outputPath - Output file path.
 * @returns {boolean}
 */
export function generateRiser(duration, startFreq, endFreq, outputPath) {
  const filter = `sine=frequency=${startFreq}:duration=${duration},aecho=0.8:0.8:60:0.3,afade=t=in:st=0:d=${duration * 0.5},afade=t=out:st=${duration * 0.8}:d=${duration * 0.2}`;
  const result = spawnSync('ffmpeg', [
    '-y', '-f', 'lavfi', '-i', filter,
    '-t', String(duration),
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
    outputPath,
  ], { encoding: 'utf8', timeout: 30000 });
  return result.status === 0 && existsSync(outputPath);
}

/**
 * Detect beats in an audio file using ffmpeg ebur128 analysis.
 * @param {string} audioFile - Path to audio file.
 * @returns {Array<number>} Array of beat timestamps in seconds.
 */
export function detectBeats(audioFile) {
  const result = spawnSync('ffmpeg', [
    '-i', audioFile,
    '-af', 'ebur128=peak=true',
    '-f', 'null', '/dev/null',
  ], { encoding: 'utf8', timeout: 60000 });

  const timestamps = [];
  if (result.stderr) {
    const lines = result.stderr.split('\n');
    for (const line of lines) {
      const match = line.match(/\[\s*E\s*\]\s*(\d+:\d+:\d+\.\d+)/);
      if (match) {
        const parts = match[1].split(':');
        const seconds = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2]);
        timestamps.push(seconds);
      }
    }
  }
  return timestamps;
}

/**
 * Analyze audio channel for loudness, true peak, and dynamic range.
 * @param {string} file - Path to audio file.
 * @returns {object} Analysis metrics.
 */
export function analyzeAudioChannel(file) {
  const result = spawnSync('ffmpeg', [
    '-i', file,
    '-af', 'ebur128=peak=true',
    '-f', 'null', '/dev/null',
  ], { encoding: 'utf8', timeout: 60000 });

  const metrics = { loudness: 0, truePeak: 0, dynamicRange: 0 };
  if (result.stderr) {
    const loudMatch = result.stderr.match(/Integrated loudness:\s*([-\d.]+)/);
    const peakMatch = result.stderr.match(/True peak:\s*([-\d.]+)/);
    const lraMatch = result.stderr.match(/LRA:\s*([-\d.]+)/);
    if (loudMatch) metrics.loudness = parseFloat(loudMatch[1]);
    if (peakMatch) metrics.truePeak = parseFloat(peakMatch[1]);
    if (lraMatch) metrics.dynamicRange = parseFloat(lraMatch[1]);
  }
  return metrics;
}

/**
 * Scale ambient volume based on pacing score.
 * @param {number} pacingScore - Pacing score from 1-5.
 * @returns {number} Volume multiplier (0.0-1.0).
 */
export function computeAmbientVolume(pacingScore) {
  if (pacingScore <= 2) return 0.02;
  if (pacingScore === 3) return 0.04;
  return 0.06;
}

/**
 * Generate a subtle whoosh transition sound effect.
 * Uses a sine sweep with fade-in/fade-out envelope.
 *
 * @param {number} duration - Duration in seconds (default: 0.3).
 * @param {number} startFreq - Start frequency in Hz (default: 400).
 * @param {number} endFreq - End frequency in Hz (default: 1200).
 * @param {string} outputPath - Output file path.
 * @returns {boolean} True if generation succeeded.
 */
export function generateTransitionWhoosh(duration = 0.3, startFreq = 400, endFreq = 1200, outputPath) {
  const fadeDur = duration * 0.3;
  const filter = [
    `sine=frequency=${startFreq}:duration=${duration}`,
    `aeval='val(0)*((2*PI*(${startFreq}+(${endFreq}-${startFreq})*t/${duration})*t))':c=s`,
    `lowpass=f=2000`,
    `afade=t=in:st=0:d=${fadeDur}:curve=exp`,
    `afade=t=out:st=${duration - fadeDur}:d=${fadeDur}:curve=exp`,
    `volume=0.15`,
  ].join(',');

  const result = spawnSync('ffmpeg', [
    '-y', '-f', 'lavfi', '-i', filter,
    '-t', String(duration),
    '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2',
    outputPath,
  ], { encoding: 'utf8', timeout: 15000 });

  return result.status === 0 && existsSync(outputPath);
}

/**
 * Generate a subtle click/transition pop sound.
 *
 * @param {number} duration - Duration in seconds (default: 0.1).
 * @param {number} frequency - Frequency in Hz (default: 1000).
 * @param {string} outputPath - Output file path.
 * @returns {boolean} True if generation succeeded.
 */
export function generateTransitionClick(duration = 0.1, frequency = 1000, outputPath) {
  const filter = [
    `sine=frequency=${frequency}:duration=${duration}`,
    `afade=t=in:st=0:d=0.005`,
    `afade=t=out:st=0.02:d=${duration - 0.02}`,
    `volume=0.08`,
  ].join(',');

  const result = spawnSync('ffmpeg', [
    '-y', '-f', 'lavfi', '-i', filter,
    '-t', String(duration),
    '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2',
    outputPath,
  ], { encoding: 'utf8', timeout: 15000 });

  return result.status === 0 && existsSync(outputPath);
}

/**
 * Mix transition SFX at specified timestamps into an existing audio track.
 *
 * @param {string} baseAudioFile - Path to the base audio file.
 * @param {Array<{time: number, type: string}>} transitionSfx - SFX events.
 * @param {string} outputFile - Path for output.
 * @returns {boolean} True if mixing succeeded.
 */
export function mixTransitionSfx(baseAudioFile, transitionSfx, outputFile) {
  if (!transitionSfx || transitionSfx.length === 0) return false;

  const inputFiles = [baseAudioFile];
  const filterParts = [];
  const mixLabels = [];

  transitionSfx.forEach((sfx, i) => {
    const tmpFile = join(tmpdir(), `transition-sfx-${Date.now()}-${i}.aac`);
    let ok;
    if (sfx.type === 'click') {
      ok = generateTransitionClick(0.1, 1000, tmpFile);
    } else {
      ok = generateTransitionWhoosh(0.3, 400, 1200, tmpFile);
    }

    if (ok) {
      inputFiles.push(tmpFile);
      const delayMs = Math.round(sfx.time * 1000);
      filterParts.push(`[${i + 1}:a]aresample=48000:async=1,adelay=${delayMs}|${delayMs},volume=0.3[tsfx${i}]`);
      mixLabels.push(`[tsfx${i}]`);
    }
  });

  if (mixLabels.length === 0) return false;

  const allLabels = ['[0:a]', ...mixLabels].join('');
  const inputCount = mixLabels.length + 1;
  filterParts.push(`${allLabels}amix=inputs=${inputCount}:duration=first[out]`);

  const result = spawnSync('ffmpeg', [
    '-y',
    ...inputFiles.flatMap((f, i) => ['-i', f]),
    '-filter_complex', filterParts.join(';'),
    '-map', '[out]',
    '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-ac', '2',
    outputFile,
  ], { encoding: 'utf8', timeout: 120000 });

  inputFiles.forEach((f) => {
    if (f !== baseAudioFile) {
      try { unlinkSync(f); } catch {}
    }
  });

  return result.status === 0;
}
