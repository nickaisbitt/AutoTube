#!/usr/bin/env node
/**
 * Generate Background Music Tracks for AutoTube
 *
 * Creates royalty-free ambient background music tracks using ffmpeg synthesis.
 * Output: public/audio/bg-{neutral,tense,uplifting}.aac (48kHz stereo, ~60s).
 */

import { spawnSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, unlinkSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, '..', 'public', 'audio');
const DURATION = 60;
const SAMPLE_RATE = 48000;

function runFfmpeg(label, filterComplex, outputFile) {
  const wavFile = outputFile.replace(/\.aac$/, '.wav');

  const gen = spawnSync('ffmpeg', [
    '-y',
    '-filter_complex', filterComplex,
    '-map', '[out]',
    '-t', String(DURATION),
    '-ar', String(SAMPLE_RATE),
    '-ac', '2',
    '-f', 'wav',
    wavFile,
  ], { encoding: 'utf8', timeout: 120000 });

  if (gen.status !== 0) {
    console.error(`  ✗ Failed to generate ${label}:`, gen.stderr?.slice(-600) || 'unknown error');
    try { unlinkSync(wavFile); } catch {}
    return false;
  }

  const conv = spawnSync('ffmpeg', [
    '-y',
    '-i', wavFile,
    '-c:a', 'aac',
    '-b:a', '192k',
    '-ar', String(SAMPLE_RATE),
    '-ac', '2',
    outputFile,
  ], { encoding: 'utf8', timeout: 120000 });

  try { unlinkSync(wavFile); } catch {}

  if (conv.status === 0) {
    console.log(`  ✓ Generated: ${outputFile}`);
    return true;
  }

  console.error(`  ✗ Failed to encode ${label}:`, conv.stderr?.slice(-600) || 'unknown error');
  return false;
}

const TRIM = `,atrim=0:${DURATION},asetpts=PTS-STARTPTS`;
const FADES = `,afade=t=in:st=0:d=1.5,afade=t=out:st=${DURATION - 1.5}:d=1.5`;

function generateNeutralTrack() {
  console.log('🎵 Generating neutral ambient background track...');
  const outputFile = join(OUTPUT_DIR, 'bg-neutral.aac');
  const filter = [
    `anoisesrc=color=pink:d=${DURATION}:r=${SAMPLE_RATE}`,
    'lowpass=f=700',
    'volume=0.45',
    'tremolo=f=0.18:d=0.35',
    'aformat=sample_rates=48000:channel_layouts=stereo',
    `${FADES.slice(1)}${TRIM}[out]`,
  ].join(',');
  return runFfmpeg('neutral', filter, outputFile);
}

function generateTenseTrack() {
  console.log('🎵 Generating tense/dramatic background track...');
  const outputFile = join(OUTPUT_DIR, 'bg-tense.aac');
  const filter = [
    `sine=frequency=55:duration=${DURATION}:sample_rate=${SAMPLE_RATE},volume=0.22[drone1]`,
    `sine=frequency=58:duration=${DURATION}:sample_rate=${SAMPLE_RATE},volume=0.18[drone2]`,
    `sine=frequency=110:duration=${DURATION}:sample_rate=${SAMPLE_RATE},volume=0.08[harm]`,
    '[drone1][drone2][harm]amix=inputs=3:duration=first:weights=1 0.85 0.5[mixed]',
    `[mixed]tremolo=f=0.12:d=0.55,volume=0.55,aformat=sample_rates=48000:channel_layouts=stereo${FADES}${TRIM}[out]`,
  ].join(';');
  return runFfmpeg('tense', filter, outputFile);
}

function generateUpliftingTrack() {
  console.log('🎵 Generating uplifting/positive background track...');
  const outputFile = join(OUTPUT_DIR, 'bg-uplifting.aac');
  const filter = [
    `sine=frequency=261.63:duration=${DURATION}:sample_rate=${SAMPLE_RATE},volume=0.14[c]`,
    `sine=frequency=329.63:duration=${DURATION}:sample_rate=${SAMPLE_RATE},volume=0.12[e]`,
    `sine=frequency=392:duration=${DURATION}:sample_rate=${SAMPLE_RATE},volume=0.12[g]`,
    `sine=frequency=523.25:duration=${DURATION}:sample_rate=${SAMPLE_RATE},volume=0.08[c2]`,
    '[c][e][g][c2]amix=inputs=4:duration=first:weights=1 0.9 0.85 0.6[chord]',
    `[chord]tremolo=f=0.1:d=0.3,volume=0.5,aformat=sample_rates=48000:channel_layouts=stereo${FADES}${TRIM}[out]`,
  ].join(';');
  return runFfmpeg('uplifting', filter, outputFile);
}

function normalizeTrack(inputFile) {
  const tempFile = `${inputFile}.temp`;

  const result = spawnSync('ffmpeg', [
    '-y', '-i', inputFile,
    '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
    tempFile,
  ], { encoding: 'utf8', timeout: 60000 });

  if (result.status === 0) {
    spawnSync('mv', [tempFile, inputFile]);
    return true;
  }

  try { unlinkSync(tempFile); } catch {}
  return false;
}

function normalizeAllTracks() {
  console.log('\n📊 Normalizing all tracks to -16 LUFS...');
  for (const track of ['bg-neutral.aac', 'bg-tense.aac', 'bg-uplifting.aac']) {
    const inputFile = join(OUTPUT_DIR, track);
    if (!existsSync(inputFile)) {
      console.warn(`  ⚠ Skipping ${track} - file not found`);
      continue;
    }
    console.log(`  Processing ${track}...`);
    if (normalizeTrack(inputFile)) {
      console.log('    ✓ Normalized to -16 LUFS');
    } else {
      console.warn(`    ⚠ Normalization failed for ${track}`);
    }
  }
}

function verifyTracks() {
  console.log('\n✅ Verifying track quality...\n');
  for (const track of ['bg-neutral.aac', 'bg-tense.aac', 'bg-uplifting.aac']) {
    const filePath = join(OUTPUT_DIR, track);
    if (!existsSync(filePath)) {
      console.log(`❌ ${track}: MISSING`);
      continue;
    }

    const result = spawnSync('ffprobe', [
      '-v', 'error', '-show_format', '-show_streams', '-of', 'json', filePath,
    ], { encoding: 'utf8', timeout: 10000 });

    if (result.status !== 0) {
      console.log(`❌ ${track}: INVALID`);
      continue;
    }

    const info = JSON.parse(result.stdout);
    const stream = info.streams[0];
    const format = info.format;
    const checks = [
      { name: 'Sample Rate', pass: parseInt(stream.sample_rate, 10) === 48000, value: `${stream.sample_rate}Hz` },
      { name: 'Channels', pass: stream.channels === 2, value: `${stream.channels}ch` },
      { name: 'Duration', pass: Math.abs(parseFloat(format.duration) - DURATION) <= 1.5, value: `${parseFloat(format.duration).toFixed(1)}s` },
      { name: 'Bitrate', pass: parseInt(format.bit_rate, 10) > 150000, value: `${(parseInt(format.bit_rate, 10) / 1000).toFixed(0)}kbps` },
    ];

    const allPass = checks.every((c) => c.pass);
    console.log(`${allPass ? '✓' : '⚠'} ${track}:`);
    for (const check of checks) {
      console.log(`    ${check.pass ? '✓' : '✗'} ${check.name}: ${check.value}`);
    }
    console.log();
  }
}

async function main() {
  console.log('🎼 AutoTube Background Music Generator\n');

  if (!existsSync(OUTPUT_DIR)) {
    console.error(`❌ Output directory not found: ${OUTPUT_DIR}`);
    process.exit(1);
  }

  const results = [
    generateNeutralTrack(),
    generateTenseTrack(),
    generateUpliftingTrack(),
  ];

  if (!results.every(Boolean)) {
    console.error('\n❌ Some tracks failed to generate.');
    process.exit(1);
  }

  console.log('\n✨ All tracks generated successfully!\n');
  normalizeAllTracks();
  verifyTracks();
  console.log('\n🎉 Background music generation complete!');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
