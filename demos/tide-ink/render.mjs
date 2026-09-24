#!/usr/bin/env node
// Usage:
//   node demos/tide-ink/render.mjs                 full MP4
//   node demos/tide-ink/render.mjs --preview 3,9,15 PNG stills at those seconds
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, 'out');
const artifactDir = process.env.ARTIFACT_DIR || '/opt/cursor/artifacts/tide-ink';
const args = process.argv.slice(2);
const previewArg = args.includes('--preview') ? args[args.indexOf('--preview') + 1] : null;

await mkdir(outDir, { recursive: true });
await mkdir(artifactDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
page.on('console', (m) => { if (m.type() === 'error') console.error('[page]', m.text()); });
page.on('pageerror', (e) => console.error('[pageerror]', e.message));
await page.goto(pathToFileURL(path.join(here, 'index.html')).href + '?render=1');
await page.evaluate(() => document.fonts.ready);
await page.waitForFunction(() => window.FILM && window.FILM.ready, null, { timeout: 120000 });
const { fps, duration } = await page.evaluate(() => ({ fps: window.FILM.fps, duration: window.FILM.duration }));

if (previewArg) {
  const times = previewArg.split(',').map(Number).sort((a, b) => a - b);
  for (const t of times) {
    const f = Math.round(t * fps);
    const started = Date.now();
    await page.evaluate((fr) => window.FILM.warmTo(fr), f);
    const url = await page.evaluate(() => window.FILM.out.toDataURL('image/png'));
    const file = path.join(artifactDir, `preview-${String(t).replace('.', '_')}s.png`);
    await writeFile(file, Buffer.from(url.split(',')[1], 'base64'));
    console.log(`t=${t}s -> ${file} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  }
  await browser.close();
  process.exit(0);
}

console.log('Rendering score…');
const wavB64 = await page.evaluate(() => window.FILM.renderAudio());
const wavPath = path.join(outDir, 'score.wav');
await writeFile(wavPath, Buffer.from(wavB64, 'base64'));

const mp4Path = path.join(outDir, 'tide-ink.mp4');
const ff = spawn('ffmpeg', [
  '-y', '-loglevel', 'error',
  '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
  '-i', wavPath,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-tune', 'grain', '-pix_fmt', 'yuv420p',
  '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
  '-c:a', 'aac', '-b:a', '256k', '-ar', '48000',
  '-shortest', '-movflags', '+faststart', mp4Path,
], { stdio: ['pipe', 'inherit', 'inherit'] });
const ffDone = once(ff, 'close');

const total = Math.round(duration * fps);
const started = Date.now();
await page.evaluate(() => window.FILM.reset());
for (let i = 0; i < total; i++) {
  const url = await page.evaluate(() => window.FILM.nextFrame(0.95));
  if (!ff.stdin.write(Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'))) await once(ff.stdin, 'drain');
  if (i % 60 === 0 || i === total - 1) {
    const el = (Date.now() - started) / 1000;
    console.log(`frame ${i + 1}/${total}  ${el.toFixed(0)}s elapsed, ~${((el / (i + 1)) * (total - i - 1)).toFixed(0)}s left`);
  }
}
ff.stdin.end();
const [code] = await ffDone;
await browser.close();
if (code !== 0) throw new Error(`ffmpeg exited ${code}`);
console.log(`Done: ${mp4Path}`);
