/**
 * Narration Generation Module
 *
 * Generates narration audio using a 3-tier fallback chain:
 *   1. xAI Grok TTS (when API key is provided) — high quality
 *   2. Cloudflare MeloTTS (when account ID + API token provided) — cheap fallback
 *   3. edge-tts (free) — browser-based fallback
 *   4. Silence (last resort)
 */

import { spawnSync } from 'child_process';
import { existsSync, writeFileSync } from 'fs';
import { join } from 'path';

const XAI_TTS_ENDPOINT = 'https://api.x.ai/v1/tts';
const DEFAULT_VOICE = 'Sal';

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
 * Generate narration audio for a single segment using xAI Grok TTS.
 * Returns true if the file was written successfully, false otherwise.
 *
 * @param {string} text       Narration text.
 * @param {string} outputPath Path to write the MP3 file.
 * @param {string} xaiKey     xAI API key.
 * @param {string} [voice]    Voice ID (default: 'Sal').
 * @returns {Promise<boolean>}
 */
async function generateGrokSegment(text, outputPath, xaiKey, voice = DEFAULT_VOICE) {
  try {
    const response = await fetch(XAI_TTS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${xaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        voice_id: voice,
        output_format: {
          codec: 'mp3',
          sample_rate: 44100,
          bit_rate: 128000,
        },
        language: 'en',
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.warn(`  ⚠ Grok TTS API returned ${response.status}: ${errText.substring(0, 100)}`);
      return false;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0) {
      console.warn('  ⚠ Grok TTS returned empty audio');
      return false;
    }

    writeFileSync(outputPath, buffer);
    return existsSync(outputPath);
  } catch (err) {
    console.warn(`  ⚠ Grok TTS request failed: ${err.message}`);
    return false;
  }
}

/**
 * Generate narration audio for a single segment using Cloudflare MeloTTS.
 * Returns true if the file was written successfully, false otherwise.
 *
 * @param {string} text       Narration text.
 * @param {string} outputPath Path to write the MP3 file.
 * @param {string} accountId  Cloudflare account ID.
 * @param {string} apiToken   Cloudflare API token.
 * @returns {Promise<boolean>}
 */
async function generateMeloSegment(text, outputPath, accountId, apiToken) {
  try {
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/myshell-ai/melotts`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt: text, lang: 'en' }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.warn(`  ⚠ MeloTTS API returned ${response.status}: ${errText.substring(0, 100)}`);
      return false;
    }

    const contentType = response.headers.get('content-type') || '';
    let buffer;

    if (contentType.includes('application/json')) {
      const data = await response.json();
      const base64Audio = data?.result?.audio;
      if (!base64Audio) {
        console.warn('  ⚠ MeloTTS: No audio in JSON response');
        return false;
      }
      buffer = Buffer.from(base64Audio, 'base64');
    } else {
      buffer = Buffer.from(await response.arrayBuffer());
    }

    if (buffer.length === 0) {
      console.warn('  ⚠ MeloTTS returned empty audio');
      return false;
    }

    writeFileSync(outputPath, buffer);
    return existsSync(outputPath);
  } catch (err) {
    console.warn(`  ⚠ MeloTTS request failed: ${err.message}`);
    return false;
  }
}

/**
 * Generate narration audio for a single segment using edge-tts (free fallback).
 * Returns true if the file was written successfully, false otherwise.
 *
 * @param {string} text       Narration text.
 * @param {string} outputPath Path to write the MP3 file.
 * @returns {boolean}
 */
function generateEdgeTtsSegment(text, outputPath) {
  const result = spawnSync('edge-tts', [
    '--voice', 'en-US-GuyNeural',
    '--rate', '+10%',
    '--text', text,
    '--write-media', outputPath,
  ], { encoding: 'utf8', timeout: 30000 });

  return result.status === 0 && existsSync(outputPath);
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
 * Generate narration audio for all segments using a 3-tier fallback chain:
 *   1. Grok TTS (if xaiKey provided)
 *   2. MeloTTS (if cfAccountId + cfApiToken provided)
 *   3. edge-tts (free)
 *   4. Silence (last resort)
 *
 * Includes silence gaps for cold open (5s) and segment title cards (1.5s each).
 *
 * @param {Array} segments   Script segments with narration text.
 * @param {string} outputDir Directory to write audio files.
 * @param {object} [options] Optional config.
 * @param {string} [options.xaiKey]       xAI API key for Grok TTS.
 * @param {string} [options.ttsVoice]     xAI voice ID (default: 'Sal').
 * @param {string} [options.cfAccountId]  Cloudflare account ID for MeloTTS.
 * @param {string} [options.cfApiToken]   Cloudflare API token for MeloTTS.
 * @returns {Promise<Array<{file: string, duration: number}>>}
 */
export async function generateNarration(segments, outputDir, options = {}) {
  const { xaiKey, ttsVoice, cfAccountId, cfApiToken } = options;
  const hasGrok = !!xaiKey;
  const hasMelo = !!cfAccountId && !!cfApiToken;
  const audioFiles = [];

  const engines = [];
  if (hasGrok) engines.push('Grok TTS');
  if (hasMelo) engines.push('MeloTTS');
  engines.push('edge-tts');
  console.log(`Generating narration audio (fallback chain: ${engines.join(' → ')})...`);
  if (hasGrok) console.log(`  Grok voice: ${ttsVoice || DEFAULT_VOICE}`);

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

    // Tier 1: Grok TTS
    if (hasGrok && !success) {
      success = await generateGrokSegment(seg.narration, audioFile, xaiKey, ttsVoice || DEFAULT_VOICE);
      if (!success) {
        console.warn(`\n  ⚠ Grok TTS failed for segment ${i + 1}, trying next engine`);
      }
    }

    // Tier 2: MeloTTS
    if (hasMelo && !success) {
      success = await generateMeloSegment(seg.narration, audioFile, cfAccountId, cfApiToken);
      if (!success) {
        console.warn(`\n  ⚠ MeloTTS failed for segment ${i + 1}, trying edge-tts`);
      }
    }

    // Tier 3: edge-tts
    if (!success) {
      success = generateEdgeTtsSegment(seg.narration, audioFile);
    }

    // Tier 4: Silence (last resort)
    if (success) {
      audioFiles.push({ file: audioFile, duration: seg.duration });
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
