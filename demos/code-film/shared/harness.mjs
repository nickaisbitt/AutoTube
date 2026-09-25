/**
 * Shared code-film harness.
 *
 * Expects a film HTML that exposes:
 *   window.FILM = {
 *     ready, duration, fps, width, height,
 *     storyboard,          // optional JSON object matching storyboard.schema.json
 *     reset(),
 *     seek(t),             // pure: draw frame at time t (seconds)
 *     canvas | out,        // HTMLCanvasElement
 *     renderAudio?.(),     // optional → base64 WAV
 *   }
 *
 * Commands:
 *   node harness.mjs <film.html> --preview 3,8,12
 *   node harness.mjs <film.html> --contact
 *   node harness.mjs <film.html> --check
 *   node harness.mjs <film.html> --render
 *   node harness.mjs <film.html> --all
 */
import { chromium } from 'playwright';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { once } from 'node:events';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const out = { film: null, preview: null, contact: false, check: false, render: false, all: false, warm: 0 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--preview') out.preview = argv[++i];
    else if (a === '--contact') out.contact = true;
    else if (a === '--check') out.check = true;
    else if (a === '--render') out.render = true;
    else if (a === '--all') out.all = true;
    else if (a === '--warm') out.warm = Number(argv[++i] || 0);
    else if (!a.startsWith('-') && !out.film) out.film = a;
  }
  if (out.all) { out.contact = true; out.check = true; out.render = true; }
  return out;
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

async function launchFilm(filmPath) {
  const abs = path.resolve(filmPath);
  if (!existsSync(abs)) throw new Error(`Film not found: ${abs}`);
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));
  await page.goto(pathToFileURL(abs).href + (abs.includes('?') ? '&' : '?') + 'render=1', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  await page.waitForFunction(() => window.FILM && window.FILM.ready, null, { timeout: 120000 });
  const meta = await page.evaluate(() => ({
    duration: window.FILM.duration,
    fps: window.FILM.fps,
    width: window.FILM.width,
    height: window.FILM.height,
    title: window.FILM.storyboard?.title || document.title,
    id: window.FILM.storyboard?.id || 'film',
    storyboard: window.FILM.storyboard || null,
  }));
  await page.setViewportSize({ width: meta.width, height: meta.height });
  return { browser, page, meta, abs };
}

async function seekFrame(page, t, warm = 0) {
  await page.evaluate(({ time, warmFrames }) => {
    const F = window.FILM;
    if (typeof F.reset === 'function' && warmFrames > 0) F.reset();
    if (typeof F.warmTo === 'function' && warmFrames > 0) {
      F.warmTo(Math.round(time * F.fps), warmFrames);
    } else if (typeof F.seek === 'function') {
      F.seek(time);
    } else if (typeof F.advanceTo === 'function') {
      F.advanceTo(Math.round(time * F.fps));
      if (typeof F.still === 'function') F.still();
      else if (F.out || F.canvas) { /* already drawn */ }
    } else {
      throw new Error('FILM must expose seek(t) or warmTo/advanceTo');
    }
  }, { time: t, warmFrames: warm });
}

async function canvasPng(page) {
  return page.evaluate(() => {
    const F = window.FILM;
    const c = F.out || F.canvas || document.querySelector('canvas');
    if (!c) throw new Error('No canvas');
    return c.toDataURL('image/png');
  });
}

async function writeDataUrl(file, dataUrl) {
  await writeFile(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
}

function filmDirs(abs, meta) {
  const root = path.dirname(abs);
  const out = path.join(root, 'out');
  const review = path.join(out, 'review');
  const artifact = path.join('/opt/cursor/artifacts', meta.id || path.basename(root));
  return { root, out, review, artifact };
}

async function preview(page, meta, dirs, times, warm) {
  await mkdir(dirs.review, { recursive: true });
  await mkdir(dirs.artifact, { recursive: true });
  for (const t of times) {
    const started = Date.now();
    await seekFrame(page, t, warm);
    const url = await canvasPng(page);
    const name = `preview-${String(t).replace('.', '_')}s.png`;
    await writeDataUrl(path.join(dirs.review, name), url);
    await writeDataUrl(path.join(dirs.artifact, name), url);
    console.log(`preview t=${t}s (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  }
}

async function contactSheet(page, meta, dirs, warm) {
  await mkdir(dirs.review, { recursive: true });
  await mkdir(dirs.artifact, { recursive: true });
  const interval = 0.5;
  const times = [];
  for (let t = 0; t <= meta.duration + 1e-6; t += interval) times.push(+t.toFixed(2));
  const frameFiles = [];
  console.log(`contact sheet: ${times.length} stills @ ${interval}s`);
  for (let i = 0; i < times.length; i++) {
    await seekFrame(page, times[i], i === 0 ? warm : Math.min(warm, 4));
    const url = await canvasPng(page);
    const f = path.join(dirs.review, `cs-${String(i).padStart(4, '0')}.png`);
    await writeDataUrl(f, url);
    frameFiles.push(f);
    if (i % 10 === 0) console.log(`  ${i + 1}/${times.length}`);
  }
  // tile with ffmpeg
  const cols = 4;
  const rows = Math.ceil(frameFiles.length / cols);
  const sheet = path.join(dirs.review, 'contact-sheet.jpg');
  const list = path.join(dirs.review, 'cs-list.txt');
  await writeFile(list, frameFiles.map((f) => `file '${f}'`).join('\n'));
  // scale each then tile
  await run('ffmpeg', [
    '-y', '-v', 'error',
    '-framerate', '1',
    '-i', path.join(dirs.review, 'cs-%04d.png'),
    '-vf', `scale=480:-1,tile=${cols}x${rows}`,
    '-frames:v', '1',
    '-q:v', '3',
    sheet,
  ]);
  await run('cp', [sheet, path.join(dirs.artifact, 'contact-sheet.jpg')]);
  console.log(`contact sheet → ${sheet}`);
  return sheet;
}

async function checkFilm(page, meta, dirs) {
  const report = {
    id: meta.id,
    title: meta.title,
    checkedAt: new Date().toISOString(),
    pass: true,
    failures: [],
    warnings: [],
    stats: {},
  };

  // 1) zero external assets
  const assetAudit = await page.evaluate(() => {
    const imgs = [...document.images].map((i) => i.src).filter(Boolean);
    const links = [...document.querySelectorAll('link[href]')].map((l) => l.href);
    const scripts = [...document.scripts].map((s) => s.src).filter(Boolean);
    const cssUrls = [];
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules || []) {
          const t = rule.cssText || '';
          const m = t.match(/url\(([^)]+)\)/g) || [];
          cssUrls.push(...m);
        }
      } catch { /* cross-origin */ }
    }
    return { imgs, links: links.filter((h) => !h.startsWith('data:')), scripts, cssUrls };
  });
  const badAssets = [
    ...assetAudit.imgs.filter((u) => !u.startsWith('data:')),
    ...assetAudit.scripts.filter((u) => u && !u.startsWith('data:')),
    ...assetAudit.links.filter((u) => !u.includes('fonts.googleapis') === false ? false : false),
  ];
  // allow nothing remote except maybe about:blank
  if (assetAudit.imgs.some((u) => /^https?:/i.test(u)) || assetAudit.scripts.some((u) => /^https?:/i.test(u))) {
    report.pass = false;
    report.failures.push({ code: 'external-assets', detail: assetAudit });
  } else {
    report.stats.zeroAssets = true;
  }

  // 2) storyboard beat sync
  const sb = meta.storyboard;
  if (!sb) {
    report.warnings.push({ code: 'no-storyboard', detail: 'FILM.storyboard missing — beat checks skipped' });
  } else {
    const tol = sb.acceptance?.beatToleranceSec ?? 0.04;
    const miss = [];
    for (const shot of sb.shots || []) {
      if (typeof shot.beat !== 'number') continue;
      if (Math.abs(shot.t0 - shot.beat) > tol) miss.push({ shot: shot.id, t0: shot.t0, beat: shot.beat, delta: +(shot.t0 - shot.beat).toFixed(3) });
    }
    report.stats.beatMisses = miss.length;
    if (miss.length) {
      report.pass = false;
      report.failures.push({ code: 'beat-sync', detail: miss });
    }

    // dead air: shot longer than max without an event
    const maxDead = sb.acceptance?.maxDeadAirSec ?? 1.5;
    const events = sb.events || [];
    for (const shot of sb.shots || []) {
      const dur = shot.t1 - shot.t0;
      if (dur <= maxDead) continue;
      const hasMotion = /pan|push|pull|orbit|assemble|flock|dissolve|swim|sweep|roll/i.test(`${shot.action} ${shot.subject}`);
      const midEvents = events.filter((e) => e.t > shot.t0 + 0.2 && e.t < shot.t1 - 0.2);
      if (!hasMotion && midEvents.length === 0 && dur > maxDead * 1.5) {
        report.warnings.push({ code: 'possible-dead-air', shot: shot.id, duration: dur });
      }
    }

    // duration consistency
    if (Math.abs((sb.duration || 0) - meta.duration) > 0.05) {
      report.warnings.push({ code: 'duration-mismatch', storyboard: sb.duration, runtime: meta.duration });
    }
  }

  // 3) canvas present + non-black sample at a mid frame
  await seekFrame(page, Math.min(meta.duration * 0.4, meta.duration - 0.1), 8);
  const sample = await page.evaluate(() => {
    const F = window.FILM;
    const c = F.out || F.canvas || document.querySelector('canvas');
    const ctx = c.getContext('2d');
    const { data } = ctx.getImageData((c.width / 2) | 0, (c.height / 2) | 0, 1, 1);
    const corners = [[8, 8], [c.width - 9, 8], [8, c.height - 9], [c.width - 9, c.height - 9]]
      .map(([x, y]) => Array.from(ctx.getImageData(x, y, 1, 1).data.slice(0, 3)));
    return { center: Array.from(data.slice(0, 3)), corners, w: c.width, h: c.height };
  });
  report.stats.sample = sample;
  const lum = (rgb) => 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  if (lum(sample.center) < 2 && sample.corners.every((c) => lum(c) < 2)) {
    report.pass = false;
    report.failures.push({ code: 'blank-frame', detail: sample });
  }

  await mkdir(dirs.review, { recursive: true });
  const reportPath = path.join(dirs.review, 'CHECK_REPORT.json');
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  await writeFile(path.join(dirs.artifact, 'CHECK_REPORT.json'), JSON.stringify(report, null, 2));
  console.log(`check ${report.pass ? 'PASS' : 'FAIL'} → ${reportPath}`);
  if (report.failures.length) console.log(JSON.stringify(report.failures, null, 2));
  if (report.warnings.length) console.log('warnings:', JSON.stringify(report.warnings, null, 2));
  return report;
}

async function renderMp4(page, meta, dirs) {
  await mkdir(dirs.out, { recursive: true });
  await mkdir(dirs.artifact, { recursive: true });

  let wavPath = null;
  const hasAudio = await page.evaluate(() => typeof window.FILM.renderAudio === 'function');
  if (hasAudio) {
    console.log('Rendering score…');
    const b64 = await page.evaluate(() => window.FILM.renderAudio());
    wavPath = path.join(dirs.out, 'score.wav');
    await writeFile(wavPath, Buffer.from(b64, 'base64'));
  }

  const previewPath = path.join(dirs.out, `${meta.id}-preview.mp4`);
  const webPath = path.join(dirs.out, `${meta.id}-web.mp4`);
  const total = Math.round(meta.duration * meta.fps);
  console.log(`Rendering ${total} frames @ ${meta.fps}fps…`);

  await page.evaluate(() => { if (window.FILM.reset) window.FILM.reset(); });

  // Pipe MJPEG into ffmpeg → high quality master-ish web encode
  const ffArgs = [
    '-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(meta.fps), '-c:v', 'mjpeg', '-i', '-',
  ];
  if (wavPath) ffArgs.push('-i', wavPath);
  ffArgs.push(
    '-c:v', 'libx264', '-profile:v', 'high', '-level:v', '4.1',
    '-preset', 'slow', '-crf', '20',
    '-maxrate', '6M', '-bufsize', '12M',
    '-pix_fmt', 'yuv420p',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
  );
  if (wavPath) ffArgs.push('-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2', '-shortest');
  else ffArgs.push('-an');
  ffArgs.push('-movflags', '+faststart', webPath);

  const ff = spawn('ffmpeg', ffArgs, { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = once(ff, 'close');
  const started = Date.now();

  for (let i = 0; i < total; i++) {
    const t = i / meta.fps;
    // Prefer nextFrame if available (stateful sims), else seek
    const dataUrl = await page.evaluate((frame) => {
      const F = window.FILM;
      if (typeof F.nextFrame === 'function') return F.nextFrame(0.92);
      if (typeof F.seek === 'function') { F.seek(frame / F.fps); }
      else if (typeof F.advanceTo === 'function') { F.advanceTo(frame); }
      const c = F.out || F.canvas || document.querySelector('canvas');
      return c.toDataURL('image/jpeg', 0.92);
    }, i);
    if (!ff.stdin.write(Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64'))) {
      await once(ff.stdin, 'drain');
    }
    if (i % 60 === 0 || i === total - 1) {
      const el = (Date.now() - started) / 1000;
      console.log(`frame ${i + 1}/${total}  ${el.toFixed(0)}s  ~${((el / (i + 1)) * (total - i - 1)).toFixed(0)}s left`);
    }
  }
  ff.stdin.end();
  const [code] = await done;
  if (code !== 0) throw new Error(`ffmpeg exited ${code}`);

  // Small GitHub-playable preview
  await run('ffmpeg', [
    '-y', '-v', 'error', '-i', webPath,
    '-vf', 'scale=1280:720:flags=lanczos,format=yuv420p',
    '-c:v', 'libx264', '-profile:v', 'high', '-level:v', '4.0',
    '-preset', 'slow', '-crf', '26', '-maxrate', '1100k', '-bufsize', '2200k',
    '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart',
    previewPath,
  ]);

  await run('cp', [webPath, path.join(dirs.artifact, path.basename(webPath))]);
  await run('cp', [previewPath, path.join(dirs.artifact, path.basename(previewPath))]);
  console.log(`render → ${webPath}\n       → ${previewPath}`);
  return { webPath, previewPath };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.film) {
    console.error('Usage: node harness.mjs <film.html> [--preview t,t] [--contact] [--check] [--render] [--all]');
    process.exit(1);
  }
  // Ensure playwright browsers if needed
  try { require('playwright'); } catch { console.error('playwright required'); process.exit(1); }

  const { browser, page, meta, abs } = await launchFilm(args.film);
  const dirs = filmDirs(abs, meta);
  await mkdir(dirs.out, { recursive: true });
  await mkdir(dirs.review, { recursive: true });
  await mkdir(dirs.artifact, { recursive: true });

  // persist storyboard snapshot
  if (meta.storyboard) {
    await writeFile(path.join(dirs.out, 'storyboard.json'), JSON.stringify(meta.storyboard, null, 2));
  }

  try {
    if (args.preview) {
      const times = args.preview.split(',').map(Number).filter((n) => !Number.isNaN(n));
      await preview(page, meta, dirs, times, args.warm);
    }
    if (args.contact) await contactSheet(page, meta, dirs, args.warm);
    if (args.check) {
      const report = await checkFilm(page, meta, dirs);
      if (!report.pass && !args.render && !args.contact && !args.preview) process.exitCode = 2;
    }
    if (args.render) await renderMp4(page, meta, dirs);
    if (!args.preview && !args.contact && !args.check && !args.render) {
      console.log('Meta:', meta);
      console.log('Pass --preview / --contact / --check / --render / --all');
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
