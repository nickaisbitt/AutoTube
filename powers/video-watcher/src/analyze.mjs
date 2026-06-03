/**
 * Video Watcher — extract frames, technical QA, optional vision critique.
 */
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractFrames,
  runServerAIReview,
} from '../../../deploy/server-render/aiReviewer.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = resolve(__dirname, '../../..');

const DEFAULT_CANDIDATES = [
  'docs/artifacts/FINAL-VIDEO-youtube-full.mp4',
  'docs/artifacts/FINAL-VIDEO-youtube-review.mp4',
  'test-recordings/FINAL-VIDEO-final.mp4',
  'test-recordings/FINAL-OUTPUT-final.mp4',
];

export function resolveVideoPath(input) {
  if (input) {
    const p = resolve(input.startsWith('/') ? input : join(PROJECT_ROOT, input));
    if (!existsSync(p)) throw new Error(`Video not found: ${p}`);
    return p;
  }
  for (const rel of DEFAULT_CANDIDATES) {
    const p = join(PROJECT_ROOT, rel);
    if (existsSync(p)) return p;
  }
  throw new Error(
    `No video path given and no default found. Pass video_path or render first.\nTried:\n${DEFAULT_CANDIDATES.map((c) => `  - ${c}`).join('\n')}`,
  );
}

export function probeVideo(videoPath) {
  const probe = spawnSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=codec_name,width,height,r_frame_rate',
      '-show_entries',
      'format=duration,size',
      '-of',
      'json',
      videoPath,
    ],
    { encoding: 'utf8', timeout: 30_000 },
  );
  if (probe.status !== 0) throw new Error(`ffprobe failed: ${probe.stderr?.slice(-500)}`);
  const p = JSON.parse(probe.stdout);
  const s = p.streams?.[0] || {};
  const f = p.format || {};
  const durationSec = parseFloat(f.duration || '0');
  let fps = 30;
  if (s.avg_frame_rate?.includes('/')) {
    const [num, den] = s.avg_frame_rate.split('/').map(Number);
    if (den) fps = num / den;
  }
  return {
    durationSec,
    width: s.width,
    height: s.height,
    codec: s.codec_name,
    fps: Math.round(fps * 100) / 100,
    sizeMb: (parseInt(f.size || '0', 10) / 1024 / 1024).toFixed(2),
  };
}

function formatTs(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Extract JPEG frames on a timeline (hook zone gets extra samples).
 */
export function extractFramesToDir(videoPath, outDir, { intervalSec = 5, maxDurationSec } = {}) {
  mkdirSync(outDir, { recursive: true });
  const { durationSec: fullDur } = probeVideo(videoPath);
  const durationSec = maxDurationSec
    ? Math.min(fullDur, maxDurationSec)
    : fullDur;

  const timestamps = new Set([0, 1, 2, 3]);
  for (let t = 0; t < durationSec; t += intervalSec) timestamps.add(Math.round(t * 10) / 10);
  const sorted = [...timestamps].sort((a, b) => a - b);

  const frames = [];
  for (const ts of sorted) {
    const name = `frame-${String(Math.floor(ts)).padStart(4, '0')}s.jpg`;
    const outPath = join(outDir, name);
    const r = spawnSync(
      'ffmpeg',
      ['-y', '-ss', String(ts), '-i', videoPath, '-frames:v', '1', '-vf', 'scale=960:-1', '-q:v', '3', outPath],
      { encoding: 'utf8', timeout: 60_000 },
    );
    if (r.status !== 0 || !existsSync(outPath)) continue;
    const sizeBytes = statSync(outPath).size;
    const isLikelyDead = sizeBytes < 6000;
    frames.push({
      path: outPath,
      timestamp: formatTs(ts),
      timestampSec: ts,
      sizeBytes,
      isLikelyDead,
    });
  }

  const contactSheet = join(outDir, 'contact-sheet.jpg');
  const cols = 4;
  const rows = Math.min(8, Math.max(1, Math.ceil(frames.length / cols)));
  spawnSync(
    'ffmpeg',
    [
      '-y',
      '-i',
      videoPath,
      '-t',
      String(durationSec),
      '-vf',
      `fps=1/${Math.max(2, intervalSec)},scale=320:-1,tile=${cols}x${rows}`,
      '-frames:v',
      '1',
      '-q:v',
      '4',
      contactSheet,
    ],
    { encoding: 'utf8', timeout: 120_000 },
  );

  return {
    durationSec,
    frames,
    contactSheet: existsSync(contactSheet) ? contactSheet : null,
    deadCount: frames.filter((f) => f.isLikelyDead).length,
  };
}

function loadOptionalScript() {
  const paths = ['/tmp/autotube-project.json', join(PROJECT_ROOT, 'test-recordings', 'last-project.json')];
  for (const p of paths) {
    if (!existsSync(p)) continue;
    try {
      const project = JSON.parse(readFileSync(p, 'utf8'));
      return project.script?.map((s) => s.narration).filter(Boolean).join('\n\n') || '';
    } catch {
      /* ignore */
    }
  }
  return '';
}

function buildNumberedReport({ videoPath, meta, framesMeta, vision, apiKeyUsed }) {
  const lines = [];
  lines.push('# Video Watcher report');
  lines.push('');
  lines.push(`1. **File:** \`${videoPath}\``);
  const analyzedSec = framesMeta.durationSec ?? meta.durationSec;
  lines.push(
    `2. **Technical:** ${analyzedSec.toFixed(1)}s analyzed (${meta.durationSec.toFixed(1)}s file) | ${meta.width}x${meta.height} | ${meta.codec} | ${meta.fps}fps | ${meta.sizeMb} MB`,
  );
  lines.push(
    `3. **Frames extracted:** ${framesMeta.frames.length} (interval ~${framesMeta.intervalSec}s) | dead/static heuristic: ${framesMeta.deadCount}`,
  );
  if (framesMeta.contactSheet) {
    lines.push(`4. **Contact sheet (open in IDE):** \`${framesMeta.contactSheet}\``);
  }
  lines.push(`5. **Frames directory:** \`${framesMeta.outDir}\``);
  lines.push('');

  lines.push('## Frame index (reference by timestamp)');
  framesMeta.frames.forEach((f, i) => {
    const n = i + 6;
    const flag = f.isLikelyDead ? ' ⚠ likely dead/blank' : '';
    lines.push(`${n}. **${f.timestamp}** — \`${f.path}\`${flag}`);
  });

  let n = 6 + framesMeta.frames.length;
  lines.push('');
  lines.push('## Vision + retention scores');

  if (!vision?.success) {
    lines.push(`${n}. **Vision audit:** skipped or failed${vision?.error ? ` — ${vision.error}` : ''}.`);
    n += 1;
    if (!apiKeyUsed) {
      lines.push(
        `${n}. **To enable AI watch:** set \`OPENROUTER_API_KEY\` in Cursor MCP env, or open the contact sheet / frames above and inspect visually in the agent.`,
      );
    }
  } else {
    const { report, score, passed, technical } = vision;
    lines.push(`${n}. **Overall score:** ${score}/10 (${passed ? 'PASS' : 'FAIL'} vs threshold 6)`);
    n += 1;
    const dims = report?.scores || {};
    for (const [key, val] of Object.entries(dims)) {
      lines.push(`${n}. **${key}:** ${val}/10 — ${report?.feedback?.[key] || '—'}`);
      n += 1;
    }
    if (report?.summary) {
      lines.push(`${n}. **Summary:** ${report.summary}`);
      n += 1;
    }
    if (technical?.issues?.length) {
      lines.push(`${n}. **Technical issues:** ${technical.issues.join('; ')}`);
      n += 1;
    }
  }

  lines.push('');
  lines.push('## YouTube brutality checklist (fix in order)');
  const checklist = [
    'Hook 0–3s: shock line visible + audible — no "In 2024…" opener',
    'Cuts: new visual every 1–2s in first 30s',
    'Captions: ≤4 words, huge, high contrast',
    'Audio: voice clearly above music; no muddy mix',
    'B-roll: human stakes (faces, ER, patients) not only tech stock',
    'End screen: Subscribe + Watch Next',
    'Packaging: custom thumbnail + curiosity title (not descriptive)',
  ];
  checklist.forEach((item, i) => {
    lines.push(`${i + 1}. ${item}`);
  });

  return lines.join('\n');
}

/**
 * Full watch pipeline.
 * @param {object} options
 * @param {string} [options.video_path]
 * @param {number} [options.interval_sec]
 * @param {number} [options.max_duration_sec] — analyze first N seconds only
 * @param {number} [options.vision_frames]
 * @param {boolean} [options.skip_vision]
 */
export async function watchVideo(options = {}) {
  const videoPath = resolveVideoPath(options.video_path);
  const meta = probeVideo(videoPath);
  const intervalSec = options.interval_sec ?? 5;
  const maxDurationSec = options.max_duration_sec;
  const runId = Date.now();
  const outDir = join(PROJECT_ROOT, 'test-recordings', `video-watch-${runId}`);
  const framesMeta = extractFramesToDir(videoPath, outDir, { intervalSec, maxDurationSec });
  framesMeta.outDir = outDir;
  framesMeta.intervalSec = intervalSec;

  const scriptText = options.script_text || loadOptionalScript();
  const apiKey = options.api_key || process.env.OPENROUTER_API_KEY || '';
  const skipVision = options.skip_vision === true;

  let vision = null;
  if (!skipVision && apiKey) {
    const dur = framesMeta.durationSec;
    vision = await runServerAIReview(videoPath, dur, scriptText, apiKey, 6);
  } else if (!skipVision && !apiKey) {
    vision = { success: false, error: 'OPENROUTER_API_KEY not set' };
  }

  const reportText = buildNumberedReport({
    videoPath,
    meta,
    framesMeta,
    vision,
    apiKeyUsed: Boolean(apiKey) && !skipVision,
  });

  const reportPath = join(outDir, 'WATCH_REPORT.md');
  writeFileSync(reportPath, reportText);

  // Vision API uses separate frame extraction; save count for agent
  const visionFrameCount = apiKey && !skipVision
    ? extractFrames(videoPath, framesMeta.durationSec, options.vision_frames ?? 12).length
    : 0;

  return {
    videoPath,
    reportPath,
    reportText,
    outDir,
    contactSheet: framesMeta.contactSheet,
    frames: framesMeta.frames,
    meta,
    vision,
    visionFrameCount,
  };
}
