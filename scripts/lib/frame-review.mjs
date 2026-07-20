/**
 * Frame-by-frame video teardown for AutoTube QA.
 * Extracts dense JPEGs, optional project media linkage, heuristic flags,
 * and an HTML gallery for human review.
 */
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { probeVideo } from '../../powers/video-watcher/src/analyze.mjs';
import {
  UNSAFE_MEDIA_URL_RE,
  JUNK_WEB_STILL_HOST_RE,
  isUnsafeMediaUrl,
  isJunkWebVolumeStillUrl,
} from './stock-media-urls.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = resolve(__dirname, '../..');

const NSFW_URL_RE = UNSAFE_MEDIA_URL_RE;
const OFFTOPIC_URL_RE = JUNK_WEB_STILL_HOST_RE;
const AVIATION_RE =
  /\b(airplane|aircraft|aviation|airline|cabin|cockpit|hangar|runway|tarmac|airport|oxygen|pilot|fuselage|boarding)\b/i;

function formatTs(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.round((sec % 1) * 10);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${ms}`;
}

function formatTsFile(sec) {
  return `frame-${String(Math.floor(sec * 10)).padStart(5, '0')}d.jpg`;
}

function loadProject(projectPath) {
  if (!projectPath || !existsSync(projectPath)) return null;
  try {
    return JSON.parse(readFileSync(projectPath, 'utf8'));
  } catch {
    return null;
  }
}

function findSiblingProject(videoPath) {
  const dir = dirname(videoPath);
  for (const name of ['project.json', 'last-project.json']) {
    const p = join(dir, name);
    if (existsSync(p)) return p;
  }
  return null;
}

/**
 * Build a coarse timeline map: second → media asset on editTimeline.
 */
export function buildTimelineAssetMap(project) {
  const media = project?.media || [];
  const byId = new Map(media.map((m) => [m.id, m]));
  const map = [];
  for (const entry of project?.editTimeline || []) {
    const asset = byId.get(entry.assetId);
    if (!asset) continue;
    const start = Number(entry.startSec) || 0;
    const end = Number(entry.endSec) || start + 1;
    map.push({
      startSec: start,
      endSec: end,
      assetId: entry.assetId,
      type: asset.type,
      url: asset.url || '',
      query: asset.query || '',
      alt: asset.alt || '',
      source: asset.source || '',
      sourceUrl: asset.sourceUrl || '',
    });
  }
  // Segment-relative times need global offset — if timeline is per-segment, sum durations.
  // Many projects store segment-local start/end; recompute global if needed.
  const segs = project?.script || [];
  if (segs.length && map.length) {
    const maxEnd = Math.max(...map.map((e) => e.endSec));
    const totalDur = segs.reduce((s, seg) => s + (Number(seg.duration) || 0), 0);
    if (totalDur > 0 && maxEnd <= Math.max(...segs.map((s) => Number(s.duration) || 0)) + 0.5) {
      // Likely segment-local: rebuild with offsets
      const rebuilt = [];
      let offset = 0;
      for (const seg of segs) {
        const dur = Number(seg.duration) || 0;
        for (const entry of project.editTimeline || []) {
          if (entry.segmentId !== seg.id) continue;
          const asset = byId.get(entry.assetId);
          if (!asset) continue;
          rebuilt.push({
            startSec: offset + (Number(entry.startSec) || 0),
            endSec: offset + (Number(entry.endSec) || 0),
            assetId: entry.assetId,
            type: asset.type,
            url: asset.url || '',
            query: asset.query || '',
            alt: asset.alt || '',
            source: asset.source || '',
            sourceUrl: asset.sourceUrl || '',
            segmentId: seg.id,
            segmentTitle: seg.title || '',
          });
        }
        offset += dur;
      }
      if (rebuilt.length) return rebuilt;
    }
  }
  return map;
}

export function assetAtTime(timelineMap, t) {
  for (const e of timelineMap) {
    if (t >= e.startSec - 0.05 && t < e.endSec - 0.05) return e;
  }
  // fallback: nearest preceding
  let best = null;
  for (const e of timelineMap) {
    if (e.startSec <= t) best = e;
  }
  return best;
}

export function heuristicFlags(frameMeta = {}) {
  const flags = [];
  const blob = `${frameMeta.url || ''} ${frameMeta.query || ''} ${frameMeta.alt || ''} ${frameMeta.source || ''} ${frameMeta.sourceUrl || ''}`.toLowerCase();
  if (isUnsafeMediaUrl(frameMeta.url || '') || NSFW_URL_RE.test(blob)) {
    flags.push({ code: 'nsfw_url', severity: 'critical', note: 'Adult CDN / porn domain in media URL' });
  }
  if (isJunkWebVolumeStillUrl(frameMeta.url || '') || OFFTOPIC_URL_RE.test(blob)) {
    if (!flags.some((f) => f.code === 'nsfw_url')) {
      flags.push({ code: 'offtopic_url', severity: 'high', note: 'Known off-topic image host/path' });
    }
  }
  if (frameMeta.type === 'image' && /volume top-up|search \(volume/i.test(frameMeta.source || '')) {
    flags.push({ code: 'volume_still', severity: 'high', note: 'Volume top-up still (web scrape pad)' });
  }
  if (frameMeta.isLikelyDead) flags.push({ code: 'dead_frame', severity: 'high', note: 'Tiny JPEG — likely black/placeholder' });
  if (blob && !AVIATION_RE.test(blob) && frameMeta.url) {
    flags.push({ code: 'no_aviation_meta', severity: 'medium', note: 'No aviation tokens in asset meta' });
  }
  if (AVIATION_RE.test(blob)) flags.push({ code: 'aviation_meta', severity: 'info', note: 'Aviation tokens present in meta' });
  return flags;
}

/**
 * Extract frames at a fixed interval (dense teardown).
 */
export function extractDenseFrames(videoPath, outDir, { intervalSec = 1, maxDurationSec, scale = 640 } = {}) {
  mkdirSync(outDir, { recursive: true });
  const probe = probeVideo(videoPath);
  const durationSec = maxDurationSec ? Math.min(probe.durationSec, maxDurationSec) : probe.durationSec;
  const timestamps = [];
  for (let t = 0; t <= durationSec + 0.001; t += intervalSec) {
    timestamps.push(Math.round(t * 10) / 10);
  }
  if (timestamps[timestamps.length - 1] < durationSec - 0.2) {
    timestamps.push(Math.round(durationSec * 10) / 10);
  }

  const frames = [];
  for (const ts of timestamps) {
    const name = formatTsFile(ts);
    const outPath = join(outDir, name);
    const r = spawnSync(
      'ffmpeg',
      [
        '-y',
        '-ss',
        String(ts),
        '-i',
        videoPath,
        '-frames:v',
        '1',
        '-vf',
        `scale=${scale}:-1`,
        '-q:v',
        '3',
        outPath,
      ],
      { encoding: 'utf8', timeout: 60_000 },
    );
    if (r.status !== 0 || !existsSync(outPath)) continue;
    const sizeBytes = statSync(outPath).size;
    frames.push({
      path: outPath,
      file: name,
      timestampSec: ts,
      timestamp: formatTs(ts),
      sizeBytes,
      isLikelyDead: sizeBytes < 6000,
    });
  }

  const contactSheet = join(outDir, 'contact-sheet.jpg');
  const cols = 5;
  const rows = Math.min(8, Math.max(1, Math.ceil(frames.length / cols)));
  const fps = Math.max(intervalSec, 0.5);
  spawnSync(
    'ffmpeg',
    [
      '-y',
      '-i',
      videoPath,
      '-t',
      String(durationSec),
      '-vf',
      `fps=1/${fps},scale=240:-1,tile=${cols}x${rows}`,
      '-frames:v',
      '1',
      '-q:v',
      '4',
      contactSheet,
    ],
    { encoding: 'utf8', timeout: 180_000 },
  );

  return {
    probe,
    durationSec,
    frames,
    contactSheet: existsSync(contactSheet) ? contactSheet : null,
  };
}

function buildHtmlGallery({ title, videoRel, frames, outDir }) {
  const items = frames.map((f, i) => {
    const flags = (f.flags || []).map((x) => x.code).join(',');
    const sev = (f.flags || []).some((x) => x.severity === 'critical')
      ? 'critical'
      : (f.flags || []).some((x) => x.severity === 'high')
        ? 'high'
        : 'ok';
    return {
      i,
      file: f.file,
      t: f.timestamp,
      sec: f.timestampSec,
      flags,
      sev,
      query: f.asset?.query || '',
      alt: f.asset?.alt || '',
      url: f.asset?.url || '',
      source: f.asset?.source || '',
      type: f.asset?.type || '',
      notes: (f.flags || []).map((x) => x.note).join(' · '),
    };
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${title}</title>
<style>
  :root { --bg:#0f1115; --panel:#1a1e27; --text:#e8eaed; --muted:#9aa0a6; --crit:#ff4d4f; --high:#faad14; --ok:#52c41a; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: ui-sans-serif, system-ui, sans-serif; background:var(--bg); color:var(--text); }
  header { padding:12px 16px; border-bottom:1px solid #2a2f3a; display:flex; gap:16px; align-items:center; flex-wrap:wrap; }
  header h1 { font-size:16px; margin:0; font-weight:600; }
  header .meta { color:var(--muted); font-size:13px; }
  .layout { display:grid; grid-template-columns: 1fr 320px; min-height: calc(100vh - 56px); }
  .stage { padding:16px; display:flex; flex-direction:column; gap:12px; align-items:center; }
  .stage img { max-width:min(960px,100%); max-height:70vh; border-radius:8px; background:#000; }
  .nav { display:flex; gap:8px; align-items:center; }
  button { background:#2a3140; color:var(--text); border:1px solid #3a4254; border-radius:6px; padding:8px 12px; cursor:pointer; }
  button:hover { background:#343c4f; }
  .badge { padding:2px 8px; border-radius:999px; font-size:12px; font-weight:600; }
  .badge.critical { background:rgba(255,77,79,.2); color:var(--crit); }
  .badge.high { background:rgba(250,173,20,.2); color:var(--high); }
  .badge.ok { background:rgba(82,196,26,.15); color:var(--ok); }
  aside { border-left:1px solid #2a2f3a; background:var(--panel); padding:12px; overflow:auto; }
  .thumb { display:flex; gap:8px; padding:6px; border-radius:6px; cursor:pointer; border:1px solid transparent; }
  .thumb:hover, .thumb.active { background:#232836; border-color:#3a4254; }
  .thumb img { width:72px; height:40px; object-fit:cover; border-radius:4px; }
  .thumb .t { font-size:12px; color:var(--muted); }
  .detail { width:min(960px,100%); background:var(--panel); border-radius:8px; padding:12px 14px; font-size:13px; line-height:1.45; }
  .detail code { color:#9ecbff; word-break:break-all; }
  .filters { display:flex; gap:8px; flex-wrap:wrap; }
  .filters label { font-size:12px; color:var(--muted); display:flex; gap:4px; align-items:center; }
  kbd { background:#2a3140; border:1px solid #3a4254; border-radius:4px; padding:1px 5px; font-size:11px; }
</style>
</head>
<body>
<header>
  <h1>${title}</h1>
  <div class="meta">${items.length} frames · <code>${videoRel}</code></div>
  <div class="meta">Keys: <kbd>←</kbd>/<kbd>→</kbd> or <kbd>j</kbd>/<kbd>k</kbd> · <kbd>f</kbd> flag filter</div>
</header>
<div class="layout">
  <main class="stage">
    <div class="nav">
      <button id="prev" type="button">← Prev</button>
      <span id="pos"></span>
      <button id="next" type="button">Next →</button>
      <span id="sev" class="badge ok">ok</span>
    </div>
    <img id="main" alt="frame"/>
    <div class="detail" id="detail"></div>
    <div class="filters">
      <label><input type="checkbox" id="onlyBad"/> Critical/high only</label>
    </div>
  </main>
  <aside id="list"></aside>
</div>
<script>
const FRAMES = ${JSON.stringify(items)};
let idx = 0;
let onlyBad = false;
const list = document.getElementById('list');
const main = document.getElementById('main');
const detail = document.getElementById('detail');
const pos = document.getElementById('pos');
const sevEl = document.getElementById('sev');

function visible() {
  if (!onlyBad) return FRAMES;
  return FRAMES.filter(f => f.sev === 'critical' || f.sev === 'high');
}

function renderList() {
  const v = visible();
  list.innerHTML = v.map(f => \`
    <div class="thumb \${f.i===idx?'active':''}" data-i="\${f.i}">
      <img src="\${f.file}" alt=""/>
      <div>
        <div class="t">\${f.t}</div>
        <div class="badge \${f.sev}">\${f.sev}</div>
      </div>
    </div>\`).join('');
  list.querySelectorAll('.thumb').forEach(el => el.onclick = () => show(+el.dataset.i));
}

function show(i) {
  const v = visible();
  if (!v.length) return;
  if (!FRAMES[i] || (onlyBad && FRAMES[i].sev === 'ok')) {
    i = v[0].i;
  }
  idx = i;
  const f = FRAMES[i];
  main.src = f.file;
  pos.textContent = f.t + '  (' + (v.findIndex(x=>x.i===i)+1) + '/' + v.length + ')';
  sevEl.className = 'badge ' + f.sev;
  sevEl.textContent = f.sev;
  detail.innerHTML = \`
    <div><b>Flags:</b> \${f.flags || '(none)'}</div>
    <div><b>Notes:</b> \${f.notes || '—'}</div>
    <div><b>Asset type:</b> \${f.type || '—'}</div>
    <div><b>Source:</b> \${f.source || '—'}</div>
    <div><b>Query:</b> <code>\${(f.query||'').slice(0,160)}</code></div>
    <div><b>Alt:</b> <code>\${(f.alt||'').slice(0,160)}</code></div>
    <div><b>URL:</b> <code>\${(f.url||'').slice(0,220)}</code></div>
  \`;
  renderList();
}

function step(d) {
  const v = visible();
  if (!v.length) return;
  let at = v.findIndex(x => x.i === idx);
  if (at < 0) at = 0;
  at = (at + d + v.length) % v.length;
  show(v[at].i);
}

document.getElementById('prev').onclick = () => step(-1);
document.getElementById('next').onclick = () => step(1);
document.getElementById('onlyBad').onchange = (e) => { onlyBad = e.target.checked; step(0); };
window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight' || e.key === 'j') step(1);
  if (e.key === 'ArrowLeft' || e.key === 'k') step(-1);
  if (e.key === 'f') {
    const cb = document.getElementById('onlyBad');
    cb.checked = !cb.checked;
    onlyBad = cb.checked;
    step(0);
  }
});
show(0);
</script>
</body>
</html>`;
}

/**
 * Run full frame review teardown.
 */
export async function reviewFrames({
  videoPath,
  projectPath,
  outDir,
  intervalSec = 1,
  maxDurationSec,
  openRouterKey,
} = {}) {
  const resolvedVideo = resolve(videoPath);
  if (!existsSync(resolvedVideo)) throw new Error(`Video not found: ${resolvedVideo}`);

  const stamp = Date.now();
  const dir = outDir
    ? resolve(outDir)
    : join(PROJECT_ROOT, 'test-recordings', `frame-review-${stamp}`);
  mkdirSync(dir, { recursive: true });
  const framesDir = join(dir, 'frames');

  const extracted = extractDenseFrames(resolvedVideo, framesDir, {
    intervalSec,
    maxDurationSec,
  });

  const projPath = projectPath || findSiblingProject(resolvedVideo);
  const project = loadProject(projPath);
  const timelineMap = project ? buildTimelineAssetMap(project) : [];

  const annotated = extracted.frames.map((f) => {
    const asset = timelineMap.length ? assetAtTime(timelineMap, f.timestampSec) : null;
    const flags = heuristicFlags({
      ...f,
      url: asset?.url,
      query: asset?.query,
      alt: asset?.alt,
      source: asset?.source,
      sourceUrl: asset?.sourceUrl,
      type: asset?.type,
    });
    return { ...f, asset: asset || null, flags };
  });

  // Pool-wide audit (unsafe assets may exist even if not currently on editTimeline).
  const poolFlags = [];
  for (const asset of project?.media || []) {
    const flags = heuristicFlags({
      url: asset.url,
      query: asset.query,
      alt: asset.alt,
      source: asset.source,
      sourceUrl: asset.sourceUrl,
      type: asset.type,
    });
    const bad = flags.filter((x) => x.severity === 'critical' || x.code === 'nsfw_url' || x.code === 'offtopic_url');
    if (!bad.length) continue;
    const onTimeline = timelineMap.some((e) => e.assetId === asset.id || e.url === asset.url);
    poolFlags.push({
      id: asset.id,
      type: asset.type,
      url: asset.url,
      source: asset.source,
      onTimeline,
      flags: bad,
    });
  }

  // Optional per-frame vision triage (budgeted).
  let visionChecked = 0;
  if (openRouterKey) {
    const { visionRejectOffBrandStock } = await import('./stock-vision-gate.mjs');
    const topic = project?.topic || '';
    const budget = Math.min(24, annotated.length);
    for (const f of annotated) {
      if (visionChecked >= budget) break;
      // Prefer suspicious frames first
      const suspicious = f.flags.some((x) => x.severity === 'critical' || x.severity === 'high')
        || f.isLikelyDead
        || (f.asset?.type === 'image');
      if (!suspicious && visionChecked > 8) continue;
      visionChecked += 1;
      try {
        if (/^https?:/i.test(f.asset?.url || '')) {
          const verdict = await visionRejectOffBrandStock(f.asset.url, openRouterKey, topic);
          if (verdict.reject) {
            f.flags.push({
              code: 'vision_reject',
              severity: 'high',
              note: `Vision: ${verdict.reason || 'rejected'}`,
            });
          }
        }
      } catch {
        /* ignore vision errors */
      }
    }
  }

  const summary = {
    videoPath: resolvedVideo,
    projectPath: projPath || null,
    outDir: dir,
    durationSec: extracted.durationSec,
    intervalSec,
    frameCount: annotated.length,
    critical: annotated.filter((f) => f.flags.some((x) => x.severity === 'critical')).length,
    high: annotated.filter((f) => f.flags.some((x) => x.severity === 'high')).length,
    nsfwUrlHits: annotated.filter((f) => f.flags.some((x) => x.code === 'nsfw_url')).length,
    volumeStills: annotated.filter((f) => f.flags.some((x) => x.code === 'volume_still')).length,
    poolNsfw: poolFlags.filter((p) => p.flags.some((x) => x.code === 'nsfw_url')).length,
    poolUnsafe: poolFlags.length,
    visionChecked,
    contactSheet: extracted.contactSheet,
    createdAt: new Date().toISOString(),
  };

  const jsonlPath = join(dir, 'FRAMES.jsonl');
  writeFileSync(
    jsonlPath,
    annotated.map((f) => JSON.stringify({
      timestampSec: f.timestampSec,
      timestamp: f.timestamp,
      file: f.file,
      sizeBytes: f.sizeBytes,
      flags: f.flags,
      asset: f.asset
        ? {
            id: f.asset.assetId,
            type: f.asset.type,
            url: f.asset.url,
            query: f.asset.query,
            alt: f.asset.alt,
            source: f.asset.source,
          }
        : null,
    })).join('\n') + '\n',
  );

  writeFileSync(join(dir, 'SUMMARY.json'), JSON.stringify({ ...summary, poolFlags }, null, 2));

  const md = [
    '# Frame-by-frame review',
    '',
    `- **Video:** \`${resolvedVideo}\``,
    `- **Project:** \`${projPath || '(none)'}\``,
    `- **Duration:** ${extracted.durationSec.toFixed(1)}s · interval ${intervalSec}s · ${annotated.length} frames`,
    `- **Critical flags (on timeline):** ${summary.critical} · **High:** ${summary.high} · **NSFW URL on timeline:** ${summary.nsfwUrlHits}`,
    `- **Volume stills on timeline:** ${summary.volumeStills}`,
    `- **Unsafe assets in media pool:** ${summary.poolUnsafe} (NSFW in pool: ${summary.poolNsfw})`,
    `- **Gallery:** [index.html](./index.html)`,
    `- **Contact sheet:** ${extracted.contactSheet ? '[contact-sheet.jpg](./frames/contact-sheet.jpg)' : '—'}`,
    '',
    '## Media pool hazards (even if not on editTimeline)',
    '',
  ];
  if (!poolFlags.length) {
    md.push('_None flagged._', '');
  } else {
    md.push('| On TL? | Sev | Flags | URL |', '|--------|-----|-------|-----|');
    for (const p of poolFlags) {
      const sev = p.flags.some((x) => x.severity === 'critical') ? 'critical' : 'high';
      md.push(
        `| ${p.onTimeline ? 'yes' : 'no'} | ${sev} | ${p.flags.map((x) => x.code).join(', ')} | \`${String(p.url || '').slice(0, 90)}\` |`,
      );
    }
    md.push('');
  }
  md.push('## Flagged frames (critical/high)');
  md.push('');
  md.push('| Time | Sev | Flags | Asset |');
  md.push('|------|-----|-------|-------|');
  for (const f of annotated) {
    const bad = f.flags.filter((x) => x.severity === 'critical' || x.severity === 'high');
    if (!bad.length) continue;
    const sev = bad.some((x) => x.severity === 'critical') ? 'critical' : 'high';
    md.push(
      `| ${f.timestamp} | ${sev} | ${bad.map((x) => x.code).join(', ')} | \`${(f.asset?.url || '').slice(0, 80)}\` |`,
    );
  }
  md.push('');
  md.push('## Workflow');
  md.push('1. Open `index.html` in a browser (or Cursor Simple Browser).');
  md.push('2. Use ←/→ to step; press `f` to show critical/high only.');
  md.push('3. For each flagged frame, confirm visual vs meta URL/query.');
  md.push('4. Check **Media pool hazards** for NSFW/off-topic assets that may still render via fallback.');
  md.push('5. Feed confirmed issues into harvest/timeline fixes.');
  writeFileSync(join(dir, 'REVIEW.md'), md.join('\n'));

  const videoRel = relative(dir, resolvedVideo);
  const html = buildHtmlGallery({
    title: `Frame review — ${basename(resolvedVideo)}`,
    videoRel,
    frames: annotated.map((f) => ({
      ...f,
      file: `frames/${f.file}`,
    })),
    outDir: dir,
  });
  writeFileSync(join(dir, 'index.html'), html);

  // Copy contact sheet to review root for convenience
  if (extracted.contactSheet && existsSync(extracted.contactSheet)) {
    try {
      writeFileSync(join(dir, 'contact-sheet.jpg'), readFileSync(extracted.contactSheet));
    } catch {
      /* ignore */
    }
  }

  return { ...summary, frames: annotated, jsonlPath, reviewMd: join(dir, 'REVIEW.md'), gallery: join(dir, 'index.html') };
}
