#!/usr/bin/env node
/**
 * Generate Background Music Tracks for AutoTube
 * 
 * Creates royalty-free ambient background music tracks using ffmpeg's
 * synthesized audio capabilities. These replace the silent placeholder files.
 * 
 * Generates:
 * - bg-neutral.aac: Neutral/ambient mood (pink noise + soft sine waves)
 * - bg-tense.aac: Tense/dramatic mood (low drones + subtle tension)
 * - bg-uplifting.aac: Uplifting/positive mood (major key arpeggios)
 * 
 * All tracks are:
 * - 48kHz stereo AAC at 192kbps
 * - 60 seconds duration (will loop seamlessly)
 * - Normalized to -16 LUFS for consistent loudness
 * - Designed to sit well under narration when ducked to -18dB
 */

import { spawnSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, '..', 'public', 'audio');

/**
 * Generate a neutral ambient background track
 * Uses pink noise filtered through a low-pass filter with subtle modulation
 */
function generateNeutralTrack() {
  console.log('🎵 Generating neutral ambient background track...');
  const outputFile = join(OUTPUT_DIR, 'bg-neutral.aac');
  
  // Create ambient pad using filtered pink noise + slow sine modulation
  const ffmpegCmd = [
    '-y',
    '-f', 'lavfi',
    '-i', `
      # Pink noise base
      anoisesrc=color=pink:d=60:r=48000[noise];
      
      # Low-pass filter for warmth
      [noise]lowpass=f=800[filtered];
      
      # Slow sine wave modulation (0.2 Hz)
      sine=frequency=0.2:d=60:r=48000[mod];
      
      # Amplitude modulation
      [filtered][mod]amultiply[ambient];
      
      # Add subtle high-frequency sparkle
      sine=frequency=2000:d=60:r=48000:beep_factor=0.05[sparkle];
      [ambient][sparkle]amix=inputs=2:weights="1 0.05"[final]
    `,
    '-map', '[final]',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-ar', '48000',
    '-ac', '2',
    '-t', '60',
    outputFile,
  ];
  
  const result = spawnSync('ffmpeg', ffmpegCmd, { encoding: 'utf8', timeout: 30000 });
  
  if (result.status === 0) {
    console.log(`  ✓ Generated: ${outputFile}`);
    return true;
  } else {
    console.error('  ✗ Failed to generate neutral track:', result.stderr);
    return false;
  }
}

/**
 * Generate a tense/dramatic background track
 * Uses low-frequency drones and dissonant intervals
 */
function generateTenseTrack() {
  console.log('🎵 Generating tense/dramatic background track...');
  const outputFile = join(OUTPUT_DIR, 'bg-tense.aac');
  
  // Create tension using low drones and slow modulation
  const ffmpegCmd = [
    '-y',
    '-f', 'lavfi',
    '-i', `
      # Low drone at 55 Hz (A1)
      sine=frequency=55:d=60:r=48000[drone1];
      
      # Dissonant interval at 58 Hz (creates beating)
      sine=frequency=58:d=60:r=48000[drone2];
      
      # Sub-bass rumble at 30 Hz
      sine=frequency=30:d=60:r=48000[sub];
      
      # Mix drones
      [drone1][drone2]amix=inputs=2:weights="0.4 0.3"[drones];
      [drones][sub]amix=inputs=2:weights="1 0.5"[mixed];
      
      # Slow amplitude modulation for unease
      sine=frequency=0.15:d=60:r=48000[mod];
      [mixed][mod]amultiply[tense]
    `,
    '-map', '[tense]',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-ar', '48000',
    '-ac', '2',
    '-t', '60',
    outputFile,
  ];
  
  const result = spawnSync('ffmpeg', ffmpegCmd, { encoding: 'utf8', timeout: 30000 });
  
  if (result.status === 0) {
    console.log(`  ✓ Generated: ${outputFile}`);
    return true;
  } else {
    console.error('  ✗ Failed to generate tense track:', result.stderr);
    return false;
  }
}

/**
 * Generate an uplifting/positive background track
 * Uses major key arpeggios and brighter timbres
 */
function generateUpliftingTrack() {
  console.log('🎵 Generating uplifting/positive background track...');
  const outputFile = join(OUTPUT_DIR, 'bg-uplifting.aac');
  
  // Create uplifting progression using C major arpeggio pattern
  const ffmpegCmd = [
    '-y',
    '-f', 'lavfi',
    '-i', `
      # C major chord tones (C4=261.63, E4=329.63, G4=392.00)
      sine=frequency=261.63:d=60:r=48000[c];
      sine=frequency=329.63:d=60:r=48000[e];
      sine=frequency=392.00:d=60:r=48000[g];
      
      # Higher octave for brightness
      sine=frequency=523.25:d=60:r=48000[c2];
      
      # Mix with different weights
      [c][e]amix=inputs=2:weights="0.3 0.25"[ce];
      [ce][g]amix=inputs=2:weights="1 0.25"[ceg];
      [ceg][c2]amix=inputs=2:weights="1 0.15"[chord];
      
      # Gentle amplitude envelope (slow attack/release)
      aevalsrc='0.5+0.5*sin(2*PI*0.1*t)':d=60:r=48000[env];
      [chord][env]amultiply[uplifting]
    `,
    '-map', '[uplifting]',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-ar', '48000',
    '-ac', '2',
    '-t', '60',
    outputFile,
  ];
  
  const result = spawnSync('ffmpeg', ffmpegCmd, { encoding: 'utf8', timeout: 30000 });
  
  if (result.status === 0) {
    console.log(`  ✓ Generated: ${outputFile}`);
    return true;
  } else {
    console.error('  ✗ Failed to generate uplifting track:', result.stderr);
    return false;
  }
}

/**
 * Normalize all generated tracks to -16 LUFS
 */
function normalizeAllTracks() {
  console.log('\n📊 Normalizing all tracks to -16 LUFS...');
  
  const tracks = ['bg-neutral.aac', 'bg-tense.aac', 'bg-uplifting.aac'];
  
  tracks.forEach(track => {
    const inputFile = join(OUTPUT_DIR, track);
    const tempFile = join(OUTPUT_DIR, `${track}.temp`);
    
    if (!existsSync(inputFile)) {
      console.warn(`  ⚠ Skipping ${track} - file not found`);
      return;
    }
    
    console.log(`  Processing ${track}...`);
    
    // First pass: measure loudness
    const measureResult = spawnSync('ffmpeg', [
      '-y',
      '-i', inputFile,
      '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json',
      '-f', 'null',
      '/dev/null',
    ], { encoding: 'utf8', timeout: 15000 });
    
    const jsonMatch = measureResult.stderr.match(/{[\s\S]*?}/);
    if (!jsonMatch) {
      console.warn(`  ⚠ Could not measure ${track}`);
      return;
    }
    
    const measured = JSON.parse(jsonMatch[0]);
    console.log(`    Measured: ${measured.input_i} LUFS`);
    
    // Second pass: apply normalization
    const normalizeResult = spawnSync('ffmpeg', [
      '-y',
      '-i', inputFile,
      '-af', `loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true`,
      '-c:a', 'aac',
      '-b:a', '192k',
      '-ar', '48000',
      '-ac', '2',
      tempFile,
    ], { encoding: 'utf8', timeout: 15000 });
    
    if (normalizeResult.status === 0) {
      // Replace original with normalized version
      spawnSync('mv', [tempFile, inputFile]);
      console.log(`    ✓ Normalized to -16 LUFS`);
    } else {
      console.warn(`    ⚠ Normalization failed for ${track}`);
      try { require('fs').unlinkSync(tempFile); } catch {}
    }
  });
}

/**
 * Verify generated tracks meet quality standards
 */
function verifyTracks() {
  console.log('\n✅ Verifying track quality...\n');
  
  const tracks = ['bg-neutral.aac', 'bg-tense.aac', 'bg-uplifting.aac'];
  
  tracks.forEach(track => {
    const filePath = join(OUTPUT_DIR, track);
    
    if (!existsSync(filePath)) {
      console.log(`❌ ${track}: MISSING`);
      return;
    }
    
    const result = spawnSync('ffprobe', [
      '-v', 'error',
      '-show_format',
      '-show_streams',
      '-of', 'json',
      filePath,
    ], { encoding: 'utf8', timeout: 5000 });
    
    if (result.status !== 0) {
      console.log(`❌ ${track}: INVALID`);
      return;
    }
    
    const info = JSON.parse(result.stdout);
    const stream = info.streams[0];
    const format = info.format;
    
    const sampleRate = parseInt(stream.sample_rate, 10);
    const channels = stream.channels;
    const duration = parseFloat(format.duration);
    const bitrate = parseInt(format.bit_rate, 10);
    
    const checks = [
      { name: 'Sample Rate', pass: sampleRate === 48000, value: `${sampleRate}Hz` },
      { name: 'Channels', pass: channels === 2, value: `${channels}ch` },
      { name: 'Duration', pass: duration >= 55 && duration <= 65, value: `${duration.toFixed(1)}s` },
      { name: 'Bitrate', pass: bitrate > 150000 && bitrate < 250000, value: `${(bitrate/1000).toFixed(0)}kbps` },
    ];
    
    const allPass = checks.every(c => c.pass);
    const status = allPass ? '✓' : '⚠';
    
    console.log(`${status} ${track}:`);
    checks.forEach(check => {
      const icon = check.pass ? '  ✓' : '  ✗';
      console.log(`    ${icon} ${check.name}: ${check.value}`);
    });
    console.log();
  });
}

// Main execution
async function main() {
  console.log('🎼 AutoTube Background Music Generator\n');
  console.log('Generating royalty-free ambient tracks for video pipeline...\n');
  
  // Ensure output directory exists
  if (!existsSync(OUTPUT_DIR)) {
    console.error(`❌ Output directory not found: ${OUTPUT_DIR}`);
    process.exit(1);
  }
  
  // Generate tracks
  const results = [
    generateNeutralTrack(),
    generateTenseTrack(),
    generateUpliftingTrack(),
  ];
  
  if (results.every(r => r)) {
    console.log('\n✨ All tracks generated successfully!\n');
    
    // Normalize to consistent loudness
    normalizeAllTracks();
    
    // Verify quality
    verifyTracks();
    
    console.log('\n🎉 Background music generation complete!');
    console.log('\nUsage in pipeline:');
    console.log('  - business_insider → bg-neutral.aac');
    console.log('  - warfront → bg-tense.aac');
    console.log('  - documentary → bg-neutral.aac');
    console.log('  - explainer → bg-uplifting.aac');
    console.log('\nAudio ducking levels:');
    console.log('  - During narration: -18dB (0.126 linear)');
    console.log('  - During gaps: -8dB (0.398 linear)');
    console.log('  - Target loudness: -16 LUFS integrated\n');
  } else {
    console.error('\n❌ Some tracks failed to generate. Check error messages above.');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
