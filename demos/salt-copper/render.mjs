#!/usr/bin/env node
/**
 * Headless renderer for demos/salt-copper
 * Captures canvas frames via Playwright, encodes MP4 with ffmpeg.
 */
import { chromium } from 'playwright';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const FILM_HTML = path.join(__dirname, 'index.html');
const FRAMES_DIR = path.join(__dirname, '.frames');
const OUT_DIR = path.join(__dirname, 'out');
const ARTIFACT_DIR = '/opt/cursor/artifacts/salt-copper-film';

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited ${code}`));
    });
  });
}

/** Tiny procedural WAV: ocean drone + Morse for HELLO synced to the film. */
function writeScoreWav(filePath, durationSec, sampleRate = 44100) {
  const n = Math.floor(durationSec * sampleRate);
  const data = Buffer.alloc(44 + n * 2);

  // WAV header
  data.write('RIFF', 0);
  data.writeUInt32LE(36 + n * 2, 4);
  data.write('WAVE', 8);
  data.write('fmt ', 12);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20); // PCM
  data.writeUInt16LE(1, 22); // mono
  data.writeUInt32LE(sampleRate, 24);
  data.writeUInt32LE(sampleRate * 2, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write('data', 36);
  data.writeUInt32LE(n * 2, 40);

  const MORSE = { H: '....', E: '.', L: '.-..', O: '---' };
  const unit = 0.18;
  let cursor = 14.2;
  const marks = [];
  for (const ch of 'HELLO') {
    const code = MORSE[ch];
    for (const sym of code) {
      const len = sym === '-' ? unit * 3 : unit;
      marks.push([cursor, cursor + len]);
      cursor += len + unit;
    }
    cursor += unit * 2;
  }

  function markAt(t) {
    for (const [a, b] of marks) if (t >= a && t <= b) return true;
    if (t > 22 && t < 34) {
      const cycle = (t - 22) % 1.6;
      return cycle < 0.12 || (cycle > 0.22 && cycle < 0.34);
    }
    return false;
  }

  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const drone = Math.sin(2 * Math.PI * 48 * t) * 0.18
      + Math.sin(2 * Math.PI * 72.5 * t) * 0.05;
    const shimmer = Math.sin(2 * Math.PI * 186 * t) * 0.02
      * (0.5 + 0.5 * Math.sin(t * 0.7));
    let beep = 0;
    if (markAt(t)) {
      const env = 0.55;
      beep = Math.sin(2 * Math.PI * 620 * t) * env
        + Math.sin(2 * Math.PI * 1240 * t) * 0.08;
    }
    // Fade in/out
    const fade = Math.min(1, t / 1.2) * Math.min(1, (durationSec - t) / 2.2);
    const sample = Math.max(-1, Math.min(1, (drone + shimmer + beep) * fade));
    data.writeInt16LE((sample * 32767) | 0, 44 + i * 2);
  }

  return writeFile(filePath, data);
}

async function main() {
  await mkdir(FRAMES_DIR, { recursive: true });
  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(ARTIFACT_DIR, { recursive: true });

  // Ensure Chromium is available
  const require = createRequire(import.meta.url);
  try {
    require('playwright');
  } catch {
    console.error('playwright missing');
    process.exit(1);
  }

  console.log('Launching Chromium…');
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-web-security'],
  });
  const page = await browser.newPage({
    viewport: { width: 720, height: 720 },
    deviceScaleFactor: 1,
  });

  const url = pathToFileURL(FILM_HTML).href + '?render=1';
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__FILM__);

  const meta = await page.evaluate(() => ({
    duration: window.__FILM__.duration,
    fps: window.__FILM__.fps,
  }));

  const totalFrames = Math.floor(meta.duration * meta.fps);
  console.log(`Rendering ${totalFrames} frames @ ${meta.fps}fps (${meta.duration}s)…`);

  // Clear old frames
  if (existsSync(FRAMES_DIR)) {
    await rm(FRAMES_DIR, { recursive: true, force: true });
    await mkdir(FRAMES_DIR, { recursive: true });
  }

  const started = Date.now();
  for (let i = 0; i < totalFrames; i++) {
    const t = i / meta.fps;
    await page.evaluate((time) => window.__FILM__.seek(time), t);
    const buf = await page.locator('canvas#c').screenshot({ type: 'png' });
    const name = path.join(FRAMES_DIR, `frame-${String(i).padStart(5, '0')}.png`);
    await writeFile(name, buf);
    if (i % 30 === 0 || i === totalFrames - 1) {
      const pct = ((i + 1) / totalFrames * 100).toFixed(1);
      const elapsed = ((Date.now() - started) / 1000).toFixed(1);
      console.log(`  ${i + 1}/${totalFrames} (${pct}%) · ${elapsed}s`);
    }
  }

  await browser.close();

  const wavPath = path.join(OUT_DIR, 'score.wav');
  const mp4Path = path.join(OUT_DIR, 'salt-copper.mp4');
  const artifactMp4 = path.join(ARTIFACT_DIR, 'salt-copper.mp4');
  const posterPath = path.join(ARTIFACT_DIR, 'poster.png');

  console.log('Writing score…');
  await writeScoreWav(wavPath, meta.duration);

  // Copy a mid-film frame as poster
  const posterFrame = path.join(FRAMES_DIR, `frame-${String(Math.floor(totalFrames * 0.45)).padStart(5, '0')}.png`);
  await run('cp', [posterFrame, posterPath]);

  console.log('Encoding MP4…');
  await run('ffmpeg', [
    '-y',
    '-framerate', String(meta.fps),
    '-i', path.join(FRAMES_DIR, 'frame-%05d.png'),
    '-i', wavPath,
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-crf', '18',
    '-preset', 'medium',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-shortest',
    '-movflags', '+faststart',
    mp4Path,
  ]);

  await run('cp', [mp4Path, artifactMp4]);
  console.log(`Done.\n  ${mp4Path}\n  ${artifactMp4}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
