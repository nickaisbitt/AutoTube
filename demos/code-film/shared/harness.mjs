/**
 * Shared code-film harness.
 *
 * Expects a film HTML that exposes:
 *   window.FILM = {
 *     ready, duration, fps, width, height,
 *     storyboard,          // optional JSON object matching storyboard.schema.json
 *     reset(),
 *     seek(t),             // pure: draw frame at time t (seconds) — preferred for speed
 *     seekPure?: true,     // hint: safe to parallelize (default inferred if seek && !nextFrame)
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
 *
 * Perf flags:
 *   --workers N          parallel Playwright pages (pure seek only; default auto)
 *   --jpeg-quality 0-100 pipe JPEG quality before x264 (default 80)
 *   --swiftshader        force SwiftShader (slow canvas readback; only for WebGL-on-CPU)
 *   --warm N             warm frames for stateful sims on --preview/--contact (ignored when seekPure)
 */
import { chromium } from 'playwright';
import { mkdir, writeFile, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const out = {
    film: null,
    preview: null,
    contact: false,
    check: false,
    render: false,
    all: false,
    warm: 0,
    workers: null,
    jpegQuality: 80,
    swiftshader: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--preview') out.preview = argv[++i];
    else if (a === '--contact') out.contact = true;
    else if (a === '--check') out.check = true;
    else if (a === '--render') out.render = true;
    else if (a === '--all') out.all = true;
    else if (a === '--warm') out.warm = Number(argv[++i] || 0);
    else if (a === '--workers') out.workers = Math.max(1, Number(argv[++i] || 1));
    else if (a === '--jpeg-quality') out.jpegQuality = Math.max(1, Math.min(100, Number(argv[++i] || 80)));
    else if (a === '--swiftshader') out.swiftshader = true;
    else if (!a.startsWith('-') && !out.film) out.film = a;
  }
  if (out.all) { out.contact = true; out.check = true; out.render = true; }
  return out;
}

function chromeArgs(swiftshader) {
  const args = ['--autoplay-policy=no-user-gesture-required', '--ignore-gpu-blocklist'];
  // SwiftShader makes 1080p canvas→JPEG readback ~10× slower. Only enable when
  // a film needs software WebGL and no host GPU/ANGLE path works.
  if (swiftshader) {
    args.push('--use-angle=swiftshader', '--enable-unsafe-swiftshader');
  }
  return args;
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

function defaultWorkers(seekPure) {
  // Parallel Chromium at 1080p repeatedly OOM/crashes here. Opt in with --workers N.
  if (!seekPure) return 1;
  return 1;
}

async function launchBrowser(swiftshader) {
  return chromium.launch({
    headless: true,
    args: chromeArgs(swiftshader),
  });
}

async function openFilmPage(browser, filmPath, viewport) {
  const abs = path.resolve(filmPath);
  const page = await browser.newPage({
    viewport: viewport || { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));
  await page.goto(pathToFileURL(abs).href + (abs.includes('?') ? '&' : '?') + 'render=1', {
    waitUntil: 'domcontentloaded',
  });
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  await page.waitForFunction(() => window.FILM && window.FILM.ready, null, { timeout: 120000 });
  return page;
}

async function readMeta(page) {
  return page.evaluate(() => ({
    duration: window.FILM.duration,
    fps: window.FILM.fps,
    width: window.FILM.width,
    height: window.FILM.height,
    title: window.FILM.storyboard?.title || document.title,
    id: window.FILM.storyboard?.id || 'film',
    storyboard: window.FILM.storyboard || null,
    seekPure: window.FILM.seekPure === true
      || (typeof window.FILM.seek === 'function' && typeof window.FILM.nextFrame !== 'function'),
    hasSeek: typeof window.FILM.seek === 'function',
    hasNextFrame: typeof window.FILM.nextFrame === 'function',
    hasWarmTo: typeof window.FILM.warmTo === 'function',
    hasAudio: typeof window.FILM.renderAudio === 'function',
  }));
}

async function launchFilm(filmPath, { swiftshader = false } = {}) {
  const abs = path.resolve(filmPath);
  if (!existsSync(abs)) throw new Error(`Film not found: ${abs}`);
  const browser = await launchBrowser(swiftshader);
  const page = await openFilmPage(browser, abs);
  const meta = await readMeta(page);
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

/** Capture canvas as a JPEG Buffer (binary). Prefer canvas.toDataURL — fastest path. */
async function canvasJpegBuffer(page, quality = 80) {
  const q = Math.max(0.01, Math.min(1, quality / 100));
  const dataUrl = await page.evaluate((jpegQ) => {
    const F = window.FILM;
    const c = F.out || F.canvas || document.querySelector('canvas');
    if (!c) throw new Error('No canvas');
    return c.toDataURL('image/jpeg', jpegQ);
  }, q);
  const i = dataUrl.indexOf(',');
  return Buffer.from(dataUrl.slice(i + 1), 'base64');
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

/** Effective warm: skip when seek is pure (seek(t) redraws from scratch). */
function effectiveWarm(meta, warm) {
  if (meta.seekPure) return 0;
  return warm;
}

async function preview(page, meta, dirs, times, warm) {
  await mkdir(dirs.review, { recursive: true });
  await mkdir(dirs.artifact, { recursive: true });
  const w = effectiveWarm(meta, warm);
  for (const t of times) {
    const started = Date.now();
    await seekFrame(page, t, w);
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
  const w0 = effectiveWarm(meta, warm);
  console.log(`contact sheet: ${times.length} stills @ ${interval}s`);
  for (let i = 0; i < times.length; i++) {
    await seekFrame(page, times[i], i === 0 ? w0 : Math.min(w0, 4));
    const url = await canvasPng(page);
    const f = path.join(dirs.review, `cs-${String(i).padStart(4, '0')}.png`);
    await writeDataUrl(f, url);
    frameFiles.push(f);
    if (i % 10 === 0) console.log(`  ${i + 1}/${times.length}`);
  }
  const cols = 4;
  const rows = Math.ceil(frameFiles.length / cols);
  const sheet = path.join(dirs.review, 'contact-sheet.jpg');
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
  if (assetAudit.imgs.some((u) => /^https?:/i.test(u)) || assetAudit.scripts.some((u) => /^https?:/i.test(u))) {
    report.pass = false;
    report.failures.push({ code: 'external-assets', detail: assetAudit });
  } else {
    report.stats.zeroAssets = true;
  }

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

    if (Math.abs((sb.duration || 0) - meta.duration) > 0.05) {
      report.warnings.push({ code: 'duration-mismatch', storyboard: sb.duration, runtime: meta.duration });
    }
  }

  await seekFrame(page, Math.min(meta.duration * 0.4, meta.duration - 0.1), meta.seekPure ? 0 : 8);
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
  report.stats.seekPure = !!meta.seekPure;
  const lum = (rgb) => 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  if (lum(sample.center) < 2 && sample.corners.every((c) => lum(c) < 2)) {
    report.pass = false;
    report.failures.push({ code: 'blank-frame', detail: sample });
  }

  await mkdir(dirs.review, { recursive: true });
  await mkdir(dirs.artifact, { recursive: true });
  const reportPath = path.join(dirs.review, 'CHECK_REPORT.json');
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  await writeFile(path.join(dirs.artifact, 'CHECK_REPORT.json'), JSON.stringify(report, null, 2));
  console.log(`check ${report.pass ? 'PASS' : 'FAIL'} → ${reportPath}`);
  if (report.failures.length) console.log(JSON.stringify(report.failures, null, 2));
  if (report.warnings.length) console.log('warnings:', JSON.stringify(report.warnings, null, 2));
  return report;
}

/** Min JPEG size that counts as a real captured frame (reject empty/corrupt stubs). */
const MIN_FRAME_BYTES = 800;

function framePath(framesDir, i) {
  return path.join(framesDir, `f-${String(i).padStart(6, '0')}.jpg`);
}

async function frameExists(framesDir, i) {
  try {
    const s = await stat(framePath(framesDir, i));
    return s.size >= MIN_FRAME_BYTES;
  } catch {
    return false;
  }
}

async function countExistingFrames(framesDir, total) {
  if (!existsSync(framesDir)) return 0;
  let n = 0;
  for (let i = 0; i < total; i++) {
    if (await frameExists(framesDir, i)) n += 1;
    else break; // contiguous from 0 required for resume
  }
  return n;
}

async function captureFrameToDisk(page, frameIndex, file, { jpegQuality, stateful }) {
  await mkdir(path.dirname(file), { recursive: true });
  if (stateful) {
    const dataUrl = await page.evaluate((frame) => {
      const F = window.FILM;
      if (typeof F.nextFrame === 'function') return F.nextFrame(0.92);
      if (typeof F.seek === 'function') F.seek(frame / F.fps);
      else if (typeof F.advanceTo === 'function') F.advanceTo(frame);
      const c = F.out || F.canvas || document.querySelector('canvas');
      return c.toDataURL('image/jpeg', 0.92);
    }, frameIndex);
    await writeFile(file, Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64'));
    return;
  }
  await page.evaluate((frame) => {
    window.FILM.seek(frame / window.FILM.fps);
  }, frameIndex);
  const buf = await canvasJpegBuffer(page, jpegQuality);
  await writeFile(file, buf);
}

/**
 * Capture frames to disk, restarting Chromium every `restartEvery` frames so
 * long 1080p toDataURL loops do not OOM/crash mid-film. Resumes from the first
 * missing contiguous frame. Encodes only after all frames exist and verify.
 */
async function renderMp4(browser, page, meta, dirs, abs, opts) {
  await mkdir(dirs.out, { recursive: true });
  await mkdir(dirs.artifact, { recursive: true });

  let wavPath = path.join(dirs.out, 'score.wav');
  if (meta.hasAudio) {
    if (!existsSync(wavPath) || (await stat(wavPath)).size < 1000) {
      console.log('Rendering score…');
      const b64 = await page.evaluate(() => window.FILM.renderAudio());
      await writeFile(wavPath, Buffer.from(b64, 'base64'));
    } else {
      console.log(`Reusing score ${wavPath}`);
    }
  } else {
    wavPath = null;
  }

  const previewPath = path.join(dirs.out, `${meta.id}-preview.mp4`);
  const webPath = path.join(dirs.out, `${meta.id}-web.mp4`);
  const framesDir = path.join(dirs.out, 'frames');
  await mkdir(framesDir, { recursive: true });

  const total = Math.round(meta.duration * meta.fps);
  const stateful = !meta.seekPure || meta.hasNextFrame;
  const jpegQuality = opts.jpegQuality ?? 80;
  const restartEvery = opts.restartEvery ?? 240;
  const expectedDur = meta.duration;

  console.log(
    `Rendering ${total} frames @ ${meta.fps}fps → disk` +
    ` jpeg=${jpegQuality} restartEvery=${restartEvery}` +
    ` seekPure=${!!meta.seekPure} stateful=${stateful}`,
  );

  let startAt = stateful ? 0 : await countExistingFrames(framesDir, total);
  if (startAt > 0) console.log(`Resuming from frame ${startAt}/${total}`);
  if (stateful && startAt === 0) {
    // Clear any partial frames — stateful capture cannot skip.
    await rm(framesDir, { recursive: true, force: true });
    await mkdir(framesDir, { recursive: true });
  }

  let browserRef = browser;
  let pageRef = page;
  const started = Date.now();
  let capturedThisRun = 0;

  async function relaunch() {
    console.log('  restarting browser…');
    await browserRef.close().catch(() => {});
    browserRef = await launchBrowser(!!opts.swiftshader);
    pageRef = await openFilmPage(browserRef, abs, { width: meta.width, height: meta.height });
    await pageRef.setViewportSize({ width: meta.width, height: meta.height });
    await pageRef.evaluate(() => { if (window.FILM.reset) window.FILM.reset(); });
  }

  await pageRef.evaluate(() => { if (window.FILM.reset) window.FILM.reset(); });

  for (let i = startAt; i < total; i++) {
    const file = framePath(framesDir, i);
    let ok = false;
    let lastErr;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        await captureFrameToDisk(pageRef, i, file, { jpegQuality, stateful });
        const s = await stat(file);
        if (s.size < MIN_FRAME_BYTES) throw new Error(`tiny frame ${s.size}b`);
        ok = true;
        break;
      } catch (err) {
        lastErr = err;
        const msg = String(err?.message || err);
        console.warn(`frame ${i} attempt ${attempt + 1}: ${msg.slice(0, 140)}`);
        await relaunch();
        // For stateful films after crash, must restart from 0 (no resume).
        if (stateful) {
          await rm(framesDir, { recursive: true, force: true });
          await mkdir(framesDir, { recursive: true });
          i = -1; // loop will ++ to 0
          ok = true; // break attempt loop; outer continues from 0
          capturedThisRun = 0;
          break;
        }
      }
    }
    if (!ok) throw lastErr || new Error(`failed frame ${i}`);
    if (i < 0) continue;

    capturedThisRun += 1;
    if ((i + 1) % 60 === 0 || i === total - 1) {
      const el = (Date.now() - started) / 1000;
      const done = i + 1 - startAt;
      const per = el / Math.max(done, 1);
      console.log(
        `frame ${i + 1}/${total}  ${el.toFixed(0)}s  ${(per * 1000).toFixed(0)}ms/f` +
        `  ~${(per * (total - i - 1)).toFixed(0)}s left`,
      );
    }

    // Periodic browser restart before Chromium OOM (skip on last frame).
    if (!stateful && capturedThisRun > 0 && capturedThisRun % restartEvery === 0 && i < total - 1) {
      await relaunch();
    }
  }

  // Verify contiguous frame set before encode.
  const have = await countExistingFrames(framesDir, total);
  if (have < total) {
    throw new Error(`incomplete frames: ${have}/${total} — refusing to encode`);
  }
  console.log(`All ${total} frames on disk. Encoding…`);

  const ffArgs = [
    '-y', '-loglevel', 'error',
    '-framerate', String(meta.fps),
    '-i', path.join(framesDir, 'f-%06d.jpg'),
  ];
  if (wavPath) ffArgs.push('-i', wavPath);
  ffArgs.push(
    '-c:v', 'libx264', '-profile:v', 'high', '-level:v', '4.1',
    '-preset', 'medium', '-crf', '20',
    '-maxrate', '6M', '-bufsize', '12M',
    '-pix_fmt', 'yuv420p',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
  );
  if (wavPath) ffArgs.push('-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2', '-shortest');
  else ffArgs.push('-an');
  ffArgs.push('-movflags', '+faststart', webPath);

  await run('ffmpeg', ffArgs);

  // Hard duration gate — never claim success on a truncated encode.
  const probe = await new Promise((resolve, reject) => {
    const p = spawn('ffprobe', [
      '-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'stream=nb_frames,duration,width,height,level',
      '-show_entries', 'format=duration',
      '-of', 'json', webPath,
    ], { stdio: ['ignore', 'pipe', 'inherit'] });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve(JSON.parse(out)) : reject(new Error(`ffprobe ${code}`))));
  });
  const dur = Number(probe.format?.duration || probe.streams?.[0]?.duration || 0);
  const nb = Number(probe.streams?.[0]?.nb_frames || 0);
  const level = Number(probe.streams?.[0]?.level || 0);
  if (Math.abs(dur - expectedDur) > 0.35) {
    throw new Error(`duration mismatch: got ${dur}s expected ~${expectedDur}s (frames=${nb})`);
  }
  if (nb > 0 && Math.abs(nb - total) > 2) {
    throw new Error(`frame count mismatch: got ${nb} expected ${total}`);
  }
  if (level > 41) {
    throw new Error(`H.264 level ${level} > 4.1 — not widely playable`);
  }
  console.log(`ffprobe OK: ${dur.toFixed(3)}s  frames=${nb || total}  level=${level}`);

  const previewArgs = [
    '-y', '-v', 'error', '-i', webPath,
    '-vf', 'scale=1280:720:flags=lanczos,format=yuv420p',
    '-c:v', 'libx264', '-profile:v', 'high', '-level:v', '4.0',
    '-preset', 'medium', '-crf', '26', '-maxrate', '1100k', '-bufsize', '2200k',
  ];
  if (wavPath) previewArgs.push('-c:a', 'aac', '-b:a', '128k');
  else previewArgs.push('-an');
  previewArgs.push('-movflags', '+faststart', previewPath);
  await run('ffmpeg', previewArgs);

  await run('cp', [webPath, path.join(dirs.artifact, path.basename(webPath))]);
  await run('cp', [previewPath, path.join(dirs.artifact, path.basename(previewPath))]);

  const elapsed = (Date.now() - started) / 1000;
  console.log(`render → ${webPath}\n       → ${previewPath}  (${elapsed.toFixed(0)}s)`);

  // Keep frames by default for resume/debug; opt-in cleanup.
  if (opts.cleanFrames) {
    await rm(framesDir, { recursive: true, force: true });
  }

  // Hand ownership of browser back — we may have replaced it.
  return { webPath, previewPath, elapsed, total, browser: browserRef };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.film) {
    console.error('Usage: node harness.mjs <film.html> [--preview t,t] [--contact] [--check] [--render] [--all]');
    console.error('       [--workers N] [--jpeg-quality 1-100] [--swiftshader] [--warm N]');
    process.exit(1);
  }
  try { require('playwright'); } catch { console.error('playwright required'); process.exit(1); }

  let { browser, page, meta, abs } = await launchFilm(args.film, { swiftshader: args.swiftshader });
  const dirs = filmDirs(abs, meta);
  await mkdir(dirs.out, { recursive: true });
  await mkdir(dirs.review, { recursive: true });
  await mkdir(dirs.artifact, { recursive: true });

  if (meta.storyboard) {
    await writeFile(path.join(dirs.out, 'storyboard.json'), JSON.stringify(meta.storyboard, null, 2));
  }

  console.log(
    `film ${meta.id} ${meta.width}x${meta.height} ${meta.duration}s@${meta.fps}fps` +
    ` seekPure=${!!meta.seekPure}`,
  );

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
    if (args.render) {
      const result = await renderMp4(browser, page, meta, dirs, abs, {
        workers: args.workers,
        jpegQuality: args.jpegQuality,
        swiftshader: args.swiftshader,
        restartEvery: 200,
      });
      // renderMp4 may have replaced the browser after mid-run restarts
      if (result?.browser) browser = result.browser;
    }
    if (!args.preview && !args.contact && !args.check && !args.render) {
      console.log('Meta:', { ...meta, storyboard: meta.storyboard ? '[…]' : null });
      console.log('Pass --preview / --contact / --check / --render / --all');
    }
  } finally {
    await browser.close().catch(() => {});
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
