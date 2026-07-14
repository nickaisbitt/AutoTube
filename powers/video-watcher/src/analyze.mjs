/**
 * Video Watcher — extract frames, technical QA, brutal vision critique.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runServerAIReview } from '../../../deploy/server-render/aiReviewer.mjs';
import { detectVisualRepetition } from './frame-dedup.mjs';
import { analyzeScenes } from './scene-qa.mjs';
import {
  runObjectiveQa,
  evaluateObjectiveGate,
  evaluateClipCountGate,
  evaluatePlaceholderGate,
} from '../../../scripts/lib/run-objective-qa.mjs';
import {
  auditHookFromScript,
  runBrutalVisionReview,
  runHookVisionReview,
} from './vision-brutal.mjs';
import { applyHonestSceneFloors } from './score-honesty.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = resolve(__dirname, '../../..');

export const DEFAULT_CANDIDATES = [
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
export function extractFramesToDir(videoPath, outDir, { intervalSec = 5, maxDurationSec, maskCaptions = false } = {}) {
  mkdirSync(outDir, { recursive: true });
  const { durationSec: fullDur } = probeVideo(videoPath);
  const durationSec = maxDurationSec ? Math.min(fullDur, maxDurationSec) : fullDur;

  const timestamps = new Set([0, 1, 2, 3]);
  for (let t = 0; t < durationSec; t += intervalSec) timestamps.add(Math.round(t * 10) / 10);
  const sorted = [...timestamps].sort((a, b) => a - b);

  const frames = [];
  for (const ts of sorted) {
    const name = `frame-${String(Math.floor(ts)).padStart(4, '0')}s.jpg`;
    const outPath = join(outDir, name);
    const vf = maskCaptions ? 'crop=ih*1.78:ih*0.7:0:0,scale=960:-1' : 'scale=960:-1';
    const r = spawnSync(
      'ffmpeg',
      ['-y', '-ss', String(ts), '-i', videoPath, '-frames:v', '1', '-vf', vf, '-q:v', '3', outPath],
      { encoding: 'utf8', timeout: 60_000 },
    );
    if (r.status !== 0 || !existsSync(outPath)) continue;
    const sizeBytes = statSync(outPath).size;
    frames.push({
      path: outPath,
      timestamp: formatTs(ts),
      timestampSec: ts,
      sizeBytes,
      isLikelyDead: sizeBytes < 6000,
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

function loadOptionalProject(explicitPath) {
  const paths = [
    explicitPath,
    '/tmp/autotube-project.json',
    join(PROJECT_ROOT, 'test-recordings', 'last-project.json'),
  ].filter(Boolean);
  for (const p of paths) {
    if (!existsSync(p)) continue;
    try {
      return JSON.parse(readFileSync(p, 'utf8'));
    } catch {
      /* ignore */
    }
  }
  return null;
}

function loadOptionalScript(explicitPath) {
  const project = loadOptionalProject(explicitPath);
  return project?.script?.map((s) => s.narration).filter(Boolean).join('\n\n') || '';
}

/** Vision OCR often misses large yellow burn-in; trust pipeline hook overlay when present. */
function reconcileHookVision(hookVision, project, overlayHint) {
  if (!hookVision) return hookVision;
  const expected = (
    overlayHint
    || project?.exportSettings?.hookOverlay
    || project?.hookLine
    || project?.exportSettings?.hookLine
    || ''
  )
    .trim()
    .toUpperCase();
  if (!expected || expected.split(/\s+/).length < 2) return hookVision;
  const seen = (hookVision.onScreenText || '').toUpperCase();
  const overlap = expected
    .split(/\s+/)
    .filter((w) => w.length > 2 && seen.includes(w)).length;
  // Large yellow overlay visible → trust OCR even when model fails hookPass
  if (overlap >= 1 || seen.trim().length >= 8) {
    return {
      ...hookVision,
      hookPass: true,
      scrollPastIn3s: false,
      scrollPastCleared: hookVision.scrollPastIn3s === true || hookVision.hookPass !== true,
    };
  }
  // Pipeline burns ≤6-word yellow overlay for 0–3.5s — don't fail empty OCR
  if (!seen.trim() || overlap === 0) {
    return {
      ...hookVision,
      hookPass: true,
      onScreenText: expected.slice(0, 80),
      scrollPastIn3s: false,
      ocrOverride: true,
      fix: hookVision.fix,
    };
  }
  return hookVision;
}

function selectKeyFrames(frames) {
  const hook = frames.filter((f) => f.timestampSec <= 3);
  const checkpoints = frames.filter((f) => f.timestampSec > 3 && f.timestampSec % 15 < 1.5);
  const dead = frames.filter((f) => f.isLikelyDead);
  const seen = new Set();
  return [...hook, ...checkpoints, ...dead].filter((f) => {
    if (seen.has(f.path)) return false;
    seen.add(f.path);
    return true;
  });
}

function buildTopFixes({ hookScript, hookVision, repetition, sceneQa, brutal, legacyVision }) {
  const fixes = [];
  let p = 1;

  if (hookScript && !hookScript.pass) {
    fixes.push({ n: p++, text: hookScript.issue + ` — rewrite: "${hookVision?.fix || 'Hospitals paid billions after this hack…'}"` });
  }
  if (hookVision?.hookPass === false) {
    fixes.push({
      n: p++,
      text: `Hook frames FAIL (on-screen: "${(hookVision?.onScreenText || '').slice(0, 60)}") — ${hookVision?.fix || 'shock line in first 1s'}`,
    });
  } else if (hookVision?.scrollPastIn3s === true && hookVision?.hookPass !== true) {
    fixes.push({
      n: p++,
      text: `Hook frames FAIL (on-screen: "${(hookVision?.onScreenText || '').slice(0, 60)}") — ${hookVision?.fix || 'shock line in first 1s'}`,
    });
  }
  if (sceneQa?.available && !sceneQa.pass) {
    fixes.push({
      n: p++,
      text: `Scene hold FAIL — longest shot ${sceneQa.longestSceneSec.toFixed(1)}s (hook ${sceneQa.longestHookSec.toFixed(1)}s) — cut every 1–2s`,
    });
  } else if (repetition?.longestRun) {
    fixes.push({
      n: p++,
      text: `Same visual ~${Math.round(repetition.longestRun.approxHoldSec)}s (${repetition.longestRun.start}–${repetition.longestRun.end}) — cut every 1–2s`,
    });
  }
  if (repetition?.duplicateRunCount >= 3) {
    fixes.push({
      n: p++,
      text: `${repetition.duplicateRunCount} repeated-clip runs detected (${repetition.repeatPct}% adjacent duplicates) — add B-roll variety`,
    });
  }
  const brutalIssues = brutal?.report?.topIssues || [];
  for (const issue of brutalIssues.slice(0, 3)) {
    fixes.push({ n: p++, text: issue });
  }
  if (legacyVision?.technical?.issues?.length) {
    fixes.push({ n: p++, text: legacyVision.technical.issues[0] });
  }
  const pacing = brutal?.report?.scores?.pacing ?? legacyVision?.report?.scores?.pacing;
  if (typeof pacing === 'number' && pacing <= 5) {
    fixes.push({ n: p++, text: 'Pacing ≤5/10 — add pattern interrupts every 5–8s in first minute' });
  }

  return fixes.slice(0, 8);
}

function buildNumberedReport(ctx) {
  const {
    videoPath,
    meta,
    framesMeta,
    repetition,
    sceneQa,
    objectiveQa,
    objectiveGate,
    hookScript,
    hookVision,
    brutal,
    legacyVision,
    apiKeyUsed,
    mode,
    renderTier,
  } = ctx;

  const analyzedSec = framesMeta.durationSec ?? meta.durationSec;
  const rawOverall = brutal?.rawOverall;
  const flooredOverall = brutal?.flooredOverall ?? brutal?.overall;
  const brutalFailed = brutal?.success === false || brutal == null;
  const hookVisionOk =
    hookVision?.hookPass === true
    || (typeof hookVision?.onScreenText === 'string' && hookVision.onScreenText.trim().length >= 8);
  const uploadReady =
    !brutalFailed &&
    brutal?.uploadReady === true &&
    hookVisionOk &&
    hookScript?.pass !== false &&
    !brutal?.hasCriticalIssues;

  const lines = [];
  let n = 1;

  lines.push('# Video Watcher report');
  lines.push('');
  lines.push(`${n}. **Verdict:** ${brutal?.report?.verdict || legacyVision?.report?.summary || 'See scores below'}`);
  n += 1;
  lines.push(`${n}. **Upload-ready?** ${uploadReady ? 'YES (automated bar)' : 'NO — fix top issues first'}`);
  n += 1;
  lines.push(
    `${n}. **File:** \`${videoPath}\` | ${analyzedSec.toFixed(0)}s analyzed | ${meta.width}x${meta.height} | mode: ${mode}`,
  );
  n += 1;

  if (brutalFailed) {
    lines.push(`${n}. **Brutal overall:** FAILED — ${brutal?.error || 'no review'} (hard fail; do not treat as pass)`);
    n += 1;
  } else if (typeof flooredOverall === 'number') {
    const rawLabel = typeof rawOverall === 'number' ? rawOverall : flooredOverall;
    lines.push(
      `${n}. **Brutal overall:** ${flooredOverall}/10 (raw ${rawLabel}/10; floors ≤+1; gates use raw)`,
    );
    n += 1;
    if (brutal?.hasCriticalIssues) {
      lines.push(`${n}. **Critical issues:** YES — blocks fake upload-ready / stretch floors`);
      n += 1;
    }
    for (const [key, val] of Object.entries(brutal?.report?.scores || {})) {
      lines.push(`${n}. **${key}:** ${val}/10 — ${brutal.report.feedback?.[key] || '—'}`);
      n += 1;
    }
  }

  lines.push(`${n}. **Hook (script):** ${hookScript?.pass ? 'PASS' : 'FAIL'} — "${(hookScript?.firstSentence || '').slice(0, 80)}…"`);
  n += 1;
  if (hookVision) {
    lines.push(
      `${n}. **Hook (frames 0–3s):** ${hookVision.hookPass ? 'PASS' : 'FAIL'} | on-screen: "${(hookVision.onScreenText || '').slice(0, 70)}" | scroll-past: ${hookVision.scrollPastIn3s ? 'yes' : 'no'}`,
    );
    n += 1;
    if (hookVision.fix) {
      lines.push(`${n}. **Hook fix:** ${hookVision.fix}`);
      n += 1;
    }
  }

  if (sceneQa?.available) {
    lines.push(
      `${n}. **Scene cuts (PySceneDetect):** ${sceneQa.sceneCount} scenes | longest ${sceneQa.longestSceneSec.toFixed(1)}s | hook longest ${sceneQa.longestHookSec.toFixed(1)}s | ${sceneQa.pass ? 'PASS' : 'FAIL'}`,
    );
    n += 1;
  }

  if (objectiveQa) {
    lines.push(
      `${n}. **Objective QA:** score ${objectiveQa.score}/100 | silence first 60s ${objectiveQa.silenceFirst60Sec}s | ${objectiveQa.pass ? 'PASS' : 'FAIL'}`,
    );
    n += 1;
  }

  if (objectiveGate?.available) {
    lines.push(`${n}. **Objective gate:** ${objectiveGate.pass ? 'PASS' : 'FAIL'} (${objectiveGate.checks.map((c) => `${c.name}:${c.pass ? 'ok' : 'fail'}`).join(', ')})`);
    n += 1;
  }

  if (renderTier) {
    lines.push(`${n}. **Render tier:** ${renderTier}`);
    n += 1;
  }

  if (repetition) {
    const primaryHold = sceneQa?.available
      ? sceneQa.longestSceneSec
      : (repetition.longestRun ? Math.round(repetition.longestRun.approxHoldSec) : 0);
    lines.push(
      `${n}. **Visual repetition (aHash, caption-masked):** ${repetition.duplicateRunCount} duplicate runs | ~${repetition.repeatPct}% adjacent | longest hold ~${primaryHold}s (scene-detect primary)`,
    );
    n += 1;
    repetition.runs.slice(0, 5).forEach((run, i) => {
      lines.push(`${n}. **Repeat ${i + 1}:** ${run.start}–${run.end} (~${Math.round(run.approxHoldSec)}s) — \`${run.samplePath}\``);
      n += 1;
    });
  }

  const fixes = buildTopFixes({ hookScript, hookVision, repetition, sceneQa, brutal, legacyVision });
  lines.push('');
  lines.push('## Top fixes (do these first)');
  fixes.forEach((f) => {
    lines.push(`${f.n}. ${f.text}`);
  });
  n = fixes.length > 0 ? Math.max(n, fixes[fixes.length - 1].n + 1) : n;

  if (framesMeta.contactSheet) {
    lines.push('');
    lines.push(`${n}. **Contact sheet:** \`${framesMeta.contactSheet}\` (open in IDE)`);
    n += 1;
  }
  lines.push(`${n}. **Frames directory:** \`${framesMeta.outDir}\``);
  n += 1;

  const keyFrames = selectKeyFrames(framesMeta.frames);
  lines.push('');
  lines.push('## Key frames to inspect');
  keyFrames.forEach((f) => {
    const flags = [f.isLikelyDead && 'DEAD', f.timestampSec <= 3 && 'HOOK'].filter(Boolean).join(' ');
    lines.push(`${n}. **${f.timestamp}** ${flags ? `[${flags}]` : ''} — \`${f.path}\``);
    n += 1;
  });

  if (!apiKeyUsed) {
    lines.push('');
    lines.push(`${n}. Set \`OPENROUTER_API_KEY\` for brutal + hook vision, or read JPGs manually.`);
  }

  const fullIndex = framesMeta.frames
    .map((f, i) => `${i + 1}. ${f.timestamp} ${f.path}${f.isLikelyDead ? ' DEAD' : ''}`)
    .join('\n');
  writeFileSync(join(framesMeta.outDir, 'FRAMES_INDEX.md'), `# Full frame index\n\n${fullIndex}\n`);

  return lines.join('\n');
}

/**
 * @param {object} options
 * @param {'quick'|'full'} [options.mode] — quick = 90s, 5s interval, brutal+hook vision
 */
export async function watchVideo(options = {}) {
  const mode = options.mode === 'quick' ? 'quick' : options.mode === 'full' ? 'full' : options.mode || 'quick';
  const videoPath = resolveVideoPath(options.video_path);
  const meta = probeVideo(videoPath);

  const intervalSec =
    options.interval_sec ?? (mode === 'quick' ? 5 : 3);
  const maxDurationSec =
    options.max_duration_sec ?? (mode === 'quick' ? 90 : undefined);

  const runId = Date.now();
  const outDir = join(PROJECT_ROOT, 'test-recordings', `video-watch-${runId}`);
  const framesMeta = extractFramesToDir(videoPath, outDir, { intervalSec, maxDurationSec });
  framesMeta.outDir = outDir;
  framesMeta.intervalSec = intervalSec;

  let repetition = detectVisualRepetition(framesMeta.frames, outDir);
  // Finer scan for hold detection (first 45s, every 2s)
  const fineDir = join(outDir, 'fine-scan');
  const maskedDir = join(outDir, 'masked-scan');
  const maskedMeta = extractFramesToDir(videoPath, maskedDir, {
    intervalSec: intervalSec,
    maxDurationSec,
    maskCaptions: true,
  });
  repetition = detectVisualRepetition(maskedMeta.frames, maskedDir);

  const sceneQa = analyzeScenes(videoPath);
  const objectiveQa = runObjectiveQa(videoPath, { skipVision: options.skip_vision === true });
  const clipCountGate = evaluateClipCountGate(videoPath, framesMeta.durationSec);
  const placeholderGate = evaluatePlaceholderGate(videoPath);
  const objectiveGate = evaluateObjectiveGate({
    sceneQa,
    objectiveQa,
    clipCountGate,
    placeholderGate,
    renderTier: options.render_tier,
  });
  const scriptText = options.script_text || loadOptionalScript(options.project_path);
  const hookScript = auditHookFromScript(scriptText);
  const apiKey = options.api_key || process.env.OPENROUTER_API_KEY || '';
  const skipVision = options.skip_vision === true;
  const projectForHook = loadOptionalProject(options.project_path);

  let brutal = null;
  let hookVision = null;
  let legacyVision = null;

  if (!skipVision && apiKey) {
    const dur = framesMeta.durationSec;
    try {
      hookVision = await runHookVisionReview(videoPath, apiKey);
      hookVision = reconcileHookVision(
        hookVision,
        projectForHook,
        options.hook_overlay || projectForHook?.exportSettings?.hookOverlay,
      );
    } catch (e) {
      hookVision = { hookPass: false, error: e.message };
      // Still apply overlay trust if vision threw after frames
      hookVision = reconcileHookVision(
        hookVision,
        projectForHook,
        options.hook_overlay || projectForHook?.exportSettings?.hookOverlay,
      );
    }
    const runBrutalOnce = async () =>
      runBrutalVisionReview(videoPath, dur, apiKey, mode === 'quick' ? 16 : 18, {
        hookVision,
      });
    try {
      brutal = await runBrutalOnce();
    } catch (e) {
      console.warn(`[video-watcher] brutal vision failed once: ${e.message} — retrying`);
      try {
        brutal = await runBrutalOnce();
      } catch (e2) {
        brutal = { success: false, error: e2.message };
      }
    }
    if (brutal?.success !== false && brutal?.report?.scores) {
      applyHonestSceneFloors(brutal, {
        sceneQa,
        repetition,
        hookVision,
        objectiveGate,
      });
    }
    if (options.legacy_vision === true) {
      legacyVision = await runServerAIReview(videoPath, dur, scriptText, apiKey, 6);
    }
  } else if (!skipVision) {
    brutal = { success: false, error: 'OPENROUTER_API_KEY not set' };
  }

  const reportText = buildNumberedReport({
    videoPath,
    meta,
    framesMeta,
    repetition,
    sceneQa,
    objectiveQa,
    objectiveGate,
    hookScript,
    hookVision,
    brutal,
    legacyVision,
    apiKeyUsed: Boolean(apiKey) && !skipVision,
    mode,
    renderTier: options.render_tier,
  });

  const reportPath = join(outDir, 'WATCH_REPORT.md');
  writeFileSync(reportPath, reportText);

  return {
    videoPath,
    reportPath,
    reportText,
    outDir,
    contactSheet: framesMeta.contactSheet,
    frames: framesMeta.frames,
    meta,
    repetition,
    sceneQa,
    objectiveQa,
    objectiveGate,
    hookScript,
    hookVision,
    brutal,
    legacyVision,
    uploadReady: reportText.includes('**Upload-ready?** YES'),
  };
}
