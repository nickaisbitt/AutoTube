#!/usr/bin/env node
/**
 * AutoTube code-film CLI (Track C product scaffold).
 *
 *   node scripts/code-film.mjs init <id>
 *   node scripts/code-film.mjs preview|contact|check|render|all <id> [-- extra harness args]
 *
 * `init` scaffolds demos/<id>/index.html. Other commands proxy to
 * demos/code-film/shared/harness.mjs without modifying the harness.
 */
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const HARNESS = path.join(ROOT, 'demos/code-film/shared/harness.mjs');
const DEMOS = path.join(ROOT, 'demos');

const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED = new Set([
  'code-film',
  'glass-keeper',
  'tide-ink',
  'tide-ink-v2',
  'salt-copper',
]);

const COMMANDS = new Set(['init', 'list', 'preview', 'contact', 'check', 'render', 'all', 'help']);

function usage(exitCode = 0) {
  const text = `Usage:
  node scripts/code-film.mjs init <id>
  node scripts/code-film.mjs list
  node scripts/code-film.mjs preview <id> [-- t1,t2,...]
  node scripts/code-film.mjs contact|check|render|all <id>

Examples:
  npm run code-film -- init hatch-demo
  npm run code-film -- list
  npm run code-film -- preview hatch-demo -- 2,8,16
  npm run code-film:check -- hatch-demo
  npm run code-film -- render hatch-demo

Shipped demos: tide-ink-v2, glass-keeper, tide-ink, salt-copper
Docs: docs/CODE_FILM_MODE.md
Harness: demos/code-film/shared/harness.mjs
`;
  if (exitCode === 0) console.log(text);
  else console.error(text);
  process.exit(exitCode);
}

function assertId(id) {
  if (!id || !ID_RE.test(id)) {
    console.error(`Invalid film id "${id || ''}". Use lowercase kebab-case: [a-z0-9-]+`);
    process.exit(1);
  }
}

function titleFromId(id) {
  return id
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function stubHtml(id) {
  const title = titleFromId(id);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} — code film stub</title>
  <style>
    :root { color-scheme: dark; --bg: #0c1210; --fg: #dce8e0; --accent: #7aab8c; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 100%; height: 100%; background: var(--bg); overflow: hidden;
      font-family: "Iowan Old Style", Palatino, "Book Antiqua", Georgia, serif; color: var(--fg); }
    #stage { position: fixed; inset: 0; display: grid; place-items: center;
      background: radial-gradient(ellipse 70% 55% at 50% 42%, #16241c 0%, #0c1210 72%); }
    canvas { width: min(96vw, 1280px); height: auto; max-height: 96vh; background: #0a100e;
      box-shadow: 0 0 0 1px rgba(220, 232, 224, 0.08); }
    #hud { position: fixed; left: 1rem; bottom: 1rem; display: flex; gap: 0.6rem; z-index: 2; opacity: 0.85; }
    button { appearance: none; border: 1px solid rgba(220,232,224,0.3); background: rgba(10,16,14,0.75);
      color: var(--fg); padding: 0.4rem 0.8rem; cursor: pointer; font: inherit; font-size: 0.72rem;
      letter-spacing: 0.06em; text-transform: uppercase; }
    button:hover { border-color: var(--accent); color: var(--accent); }
    #titlecard { position: fixed; top: 1rem; left: 1rem; z-index: 2; opacity: 0.7;
      font-size: 0.75rem; letter-spacing: 0.16em; text-transform: uppercase; }
    #titlecard span { display: block; opacity: 0.55; letter-spacing: 0.06em; text-transform: none;
      margin-top: 0.2rem; font-style: italic; }
    body.render #hud, body.render #titlecard { display: none; }
  </style>
</head>
<body>
  <div id="titlecard">${title}<span>code film stub — replace the technique</span></div>
  <div id="stage"><canvas id="c" width="1280" height="720"></canvas></div>
  <div id="hud">
    <button type="button" id="play">Play</button>
    <button type="button" id="pause">Pause</button>
  </div>
  <script>
(function () {
  const W = 1280, H = 720, FPS = 30, DURATION = 24;
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');

  const storyboard = {
    id: ${JSON.stringify(id)},
    title: ${JSON.stringify(title)},
    logline: 'Stub film — implement one signature technique readable at thumbnail size.',
    technique: 'stub-hatch',
    duration: DURATION,
    fps: FPS,
    width: W,
    height: H,
    seed: 1,
    tempo: { bpm: 90, beatsPerBar: 4 },
    palette: { bg: '#0a100e', ink: '#dce8e0', accent: '#7aab8c' },
    sections: [
      { id: 'open', t0: 0, t1: 8, mood: 'quiet', harmony: 'Am' },
      { id: 'build', t0: 8, t1: 16, mood: 'rising', harmony: 'C' },
      { id: 'close', t0: 16, t1: 24, mood: 'resolve', harmony: 'Am' },
    ],
    shots: [
      { id: 's1', t0: 0, t1: 4, beat: 0, camera: { x: 0, y: 0, zoom: 1 }, subject: 'field', action: 'establish' },
      { id: 's2', t0: 4, t1: 8, beat: 4, camera: { x: 0, y: 0, zoom: 1.05 }, subject: 'mark', action: 'appear' },
      { id: 's3', t0: 8, t1: 12, beat: 8, camera: { x: 20, y: -10, zoom: 1.1 }, subject: 'mark', action: 'move' },
      { id: 's4', t0: 12, t1: 16, beat: 12, camera: { x: -10, y: 15, zoom: 1.15 }, subject: 'cluster', action: 'gather' },
      { id: 's5', t0: 16, t1: 20, beat: 16, camera: { x: 0, y: 0, zoom: 1.08 }, subject: 'cluster', action: 'settle' },
      { id: 's6', t0: 20, t1: 24, beat: 20, camera: { x: 0, y: 0, zoom: 1 }, subject: 'field', action: 'hold' },
    ],
    events: [
      { t: 0, kind: 'visual', id: 'open' },
      { t: 4, kind: 'whoosh', id: 'mark-in' },
      { t: 8, kind: 'impact', id: 'cut-build' },
      { t: 12, kind: 'pluck', id: 'gather' },
      { t: 16, kind: 'bell', id: 'settle' },
      { t: 20, kind: 'cut', id: 'hold' },
    ],
    acceptance: {
      maxDeadAirSec: 1.5,
      beatToleranceSec: 0.04,
      thumbnailReadable: true,
      zeroExternalAssets: true,
    },
  };

  function shotAt(t) {
    return storyboard.shots.find((s) => t >= s.t0 && t < s.t1) || storyboard.shots[storyboard.shots.length - 1];
  }

  function draw(t) {
    const shot = shotAt(t);
    const cam = shot.camera || { x: 0, y: 0, zoom: 1 };
    const zoom = cam.zoom || 1;
    ctx.save();
    ctx.fillStyle = storyboard.palette.bg;
    ctx.fillRect(0, 0, W, H);
    ctx.translate(W / 2 + (cam.x || 0), H / 2 + (cam.y || 0));
    ctx.scale(zoom, zoom);
    ctx.translate(-W / 2, -H / 2);

    // Placeholder craft: readable hatch + subject block (replace with your technique).
    ctx.strokeStyle = 'rgba(220,232,224,0.12)';
    ctx.lineWidth = 1;
    for (let x = -40; x < W + 40; x += 18) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + H * 0.35, H);
      ctx.stroke();
    }

    const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * (storyboard.tempo.bpm / 60));
    const size = 120 + 40 * pulse;
    ctx.fillStyle = storyboard.palette.accent;
    ctx.fillRect(W / 2 - size / 2, H / 2 - size / 2, size, size);
    ctx.strokeStyle = storyboard.palette.ink;
    ctx.lineWidth = 3;
    ctx.strokeRect(W / 2 - size / 2 - 8, H / 2 - size / 2 - 8, size + 16, size + 16);

    ctx.restore();
    ctx.fillStyle = 'rgba(220,232,224,0.55)';
    ctx.font = '20px Georgia, serif';
    ctx.fillText(shot.subject + ' · ' + shot.action, 48, H - 48);
  }

  let playing = false;
  let t0 = performance.now();
  let tPlay = 0;

  function tick(now) {
    if (!playing) return;
    const t = ((now - t0) / 1000 + tPlay) % DURATION;
    draw(t);
    requestAnimationFrame(tick);
  }

  function seek(t) {
    const clamped = Math.max(0, Math.min(DURATION, Number(t) || 0));
    tPlay = clamped;
    t0 = performance.now();
    draw(clamped);
  }

  if (new URLSearchParams(location.search).has('render')) {
    document.body.classList.add('render');
  }

  document.getElementById('play').onclick = () => {
    if (playing) return;
    playing = true;
    t0 = performance.now();
    requestAnimationFrame(tick);
  };
  document.getElementById('pause').onclick = () => { playing = false; };

  window.FILM = {
    ready: true,
    seekPure: true,
    duration: DURATION,
    fps: FPS,
    width: W,
    height: H,
    storyboard,
    canvas,
    seek,
    reset() { seek(0); },
  };

  seek(0);
})();
  </script>
</body>
</html>
`;
}

function cmdList() {
  const entries = readdirSync(DEMOS)
    .filter((name) => {
      if (name === 'code-film') return false;
      try {
        return statSync(path.join(DEMOS, name)).isDirectory()
          && existsSync(path.join(DEMOS, name, 'index.html'));
      } catch {
        return false;
      }
    })
    .sort();
  if (!entries.length) {
    console.log('No films under demos/. Scaffold with: npm run code-film -- init <id>');
    return;
  }
  console.log('Code films:');
  for (const id of entries) {
    const out = path.join(DEMOS, id, 'out');
    const web = existsSync(path.join(out, `${id}-web.mp4`))
      || [...(existsSync(out) ? readdirSync(out) : [])].some((f) => f.endsWith('-web.mp4'));
    const preview = existsSync(out)
      && readdirSync(out).some((f) => f.endsWith('-preview.mp4'));
    const flags = [web ? 'web' : null, preview ? 'preview' : null].filter(Boolean).join('+') || 'source';
    console.log(`  ${id.padEnd(16)} ${flags}`);
  }
}

async function cmdInit(id) {
  assertId(id);
  if (RESERVED.has(id)) {
    console.error(`Refusing to scaffold reserved id "${id}". Pick another film id.`);
    process.exit(1);
  }
  const dir = path.join(DEMOS, id);
  const htmlPath = path.join(dir, 'index.html');
  if (existsSync(htmlPath)) {
    console.error(`Already exists: ${path.relative(ROOT, htmlPath)}`);
    process.exit(1);
  }
  await mkdir(path.join(dir, 'out', 'review'), { recursive: true });
  await writeFile(htmlPath, stubHtml(id), 'utf8');
  const gitkeep = path.join(dir, 'out', '.gitkeep');
  if (!existsSync(gitkeep)) await writeFile(gitkeep, '', 'utf8');
  console.log(`Scaffolded ${path.relative(ROOT, htmlPath)}`);
  console.log(`Next:
  npm run code-film -- preview ${id} -- 2,8,16
  npm run code-film -- contact ${id}
  npm run code-film:check -- ${id}
  # implement signature technique, then:
  npm run code-film -- render ${id}
See docs/CODE_FILM_MODE.md`);
}

function filmHtml(id) {
  assertId(id);
  const htmlPath = path.join(DEMOS, id, 'index.html');
  if (!existsSync(htmlPath)) {
    console.error(`Film not found: ${path.relative(ROOT, htmlPath)}`);
    console.error(`Scaffold with: node scripts/code-film.mjs init ${id}`);
    process.exit(1);
  }
  return htmlPath;
}

function runHarness(htmlPath, harnessArgs) {
  if (!existsSync(HARNESS)) {
    console.error(`Harness missing: ${path.relative(ROOT, HARNESS)}`);
    process.exit(1);
  }
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [HARNESS, htmlPath, ...harnessArgs], {
      stdio: 'inherit',
      cwd: ROOT,
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else process.exit(code ?? 1);
    });
  });
}

function splitExtra(argv) {
  const dash = argv.indexOf('--');
  if (dash === -1) return { rest: argv, extra: [] };
  return { rest: argv.slice(0, dash), extra: argv.slice(dash + 1) };
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === 'help' || argv[0] === '-h' || argv[0] === '--help') {
    usage(0);
  }

  const cmd = argv[0];
  if (!COMMANDS.has(cmd)) {
    console.error(`Unknown command: ${cmd}`);
    usage(1);
  }

  if (cmd === 'init') {
    await cmdInit(argv[1]);
    return;
  }
  if (cmd === 'list') {
    cmdList();
    return;
  }

  const { rest, extra } = splitExtra(argv.slice(1));
  const id = rest[0];
  if (!id) {
    console.error(`Missing film id for "${cmd}".`);
    usage(1);
  }

  const htmlPath = filmHtml(id);
  const harnessArgs = [];

  switch (cmd) {
    case 'preview': {
      const times = extra[0] || rest[1] || '2,8,16,24';
      harnessArgs.push('--preview', times);
      if (extra.includes('--warm') || rest.includes('--warm')) {
        const src = extra.includes('--warm') ? extra : rest;
        const i = src.indexOf('--warm');
        harnessArgs.push('--warm', src[i + 1] || '0');
      }
      break;
    }
    case 'contact':
      harnessArgs.push('--contact');
      break;
    case 'check':
      harnessArgs.push('--check');
      break;
    case 'render':
      harnessArgs.push('--render');
      break;
    case 'all':
      harnessArgs.push('--all');
      break;
    default: {
      const _exhaustive = cmd;
      console.error(`Unhandled command: ${_exhaustive}`);
      process.exit(1);
    }
  }

  // Pass through remaining unknown flags after -- (except preview times already consumed).
  for (let i = cmd === 'preview' && extra[0] && !extra[0].startsWith('-') ? 1 : 0; i < extra.length; i++) {
    const a = extra[i];
    if (a === '--warm') {
      harnessArgs.push('--warm', extra[++i] || '0');
      continue;
    }
    if (!harnessArgs.includes(a)) harnessArgs.push(a);
  }

  console.log(`→ harness ${path.relative(ROOT, htmlPath)} ${harnessArgs.join(' ')}`);
  await runHarness(htmlPath, harnessArgs);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
