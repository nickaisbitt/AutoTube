/**
 * Post-mux overlays for ffmpeg assembly (hook text + karaoke captions).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync, unlinkSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { isYouTubeExportMode, captionMetrics, hookFontPx } from './youtubeProfile.mjs';

function escapeDrawtext(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "'\\''")
    .replace(/:/g, '\\:')
    .replace(/%/g, '\\%')
    .replace(/;/g, '\\;');
}

/** Up to 3 lines, 3 words each — keeps drawtext within frame width at hook font sizes. */
function wrapHookLines(words, maxWordsPerLine = 3, maxLines = 3) {
  const lines = [];
  for (let i = 0; i < words.length && lines.length < maxLines; i += maxWordsPerLine) {
    lines.push(words.slice(i, i + maxWordsPerLine).join(' '));
  }
  return lines;
}

/** Shrink font when longest line would exceed ~90% of frame width (vision readability). */
function fitHookFontSize(lines, height, width) {
  let fontSize = hookFontPx(height);
  const longest = Math.max(...lines.map((l) => l.length), 1);
  const maxWidth = width * 0.90;
  while (longest * fontSize * 0.58 > maxWidth && fontSize > Math.round(height * 0.06)) {
    fontSize -= 4;
  }
  return fontSize;
}

function escapeAss(text) {
  return String(text || '').replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}');
}

function formatAssTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const cs = Math.floor((s % 1) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(Math.floor(s)).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

/**
 * Burn hook overlay for first N seconds (watcher 0–3s audit).
 * @param {string} videoPath
 * @param {object} project
 * @param {{ durationSec?: number }} [options]
 */
export function overlayHookText(videoPath, project, options = {}) {
  if (!existsSync(videoPath)) return { ok: false, error: 'video missing' };

  // Loop mode: fixState hook wins over stale UI kinetic overlays in project JSON.
  const hookText =
    (process.env.AUTOTUBE_LOOP_MODE === '1' && process.env.AUTOTUBE_HOOK_OVERLAY?.trim())
    || project.exportSettings?.hookOverlay
    || process.env.AUTOTUBE_HOOK_OVERLAY
    || project.hookLine
    || process.env.AUTOTUBE_HOOK_LINE
    || project.exportSettings?.hookLine;
  if (!hookText?.trim()) return { ok: false, error: 'no hook text' };

  const probe = spawnSync(
    'ffprobe',
    ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=height,width', '-of', 'csv=p=0', videoPath],
    { encoding: 'utf8' },
  );
  const [wStr, hStr] = (probe.stdout || '1280,720').trim().split(',');
  const w = parseInt(wStr, 10) || 1280;
  const h = parseInt(hStr, 10) || 720;
  const words = hookText.trim().toUpperCase().split(/\s+/).filter(Boolean);
  const lines = wrapHookLines(words);
  const fontSize = fitHookFontSize(lines, h, w);
  const durationSec = options.durationSec ?? 4.0;
  const border = Math.max(6, Math.round(fontSize * 0.10));
  const boxBorder = Math.round(fontSize * 0.30);
  const dtCommon = `fontsize=${fontSize}:fontcolor=white:borderw=${border}:bordercolor=black:box=1:boxcolor=black@0.65:boxborderw=${boxBorder}`;
  const lineCount = lines.length;
  const yStart = lineCount === 1 ? 0.38 : lineCount === 2 ? 0.28 : 0.22;
  const yStep = lineCount === 1 ? 0 : lineCount === 2 ? 0.14 : 0.12;
  const filters = lines.map((line, i) =>
    `drawtext=text='${escapeDrawtext(line)}':${dtCommon}:x=(w-text_w)/2:y=h*${yStart + i * yStep}:enable='between(t\\,0\\,${durationSec})'`,
  );
  const vf = filters.join(',');

  const tmpOut = videoPath.replace(/\.mp4$/, '-hooked.mp4');
  const r = spawnSync(
    'ffmpeg',
    ['-y', '-i', videoPath, '-vf', vf, '-c:a', 'copy', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', tmpOut],
    { encoding: 'utf8', timeout: 300_000 },
  );
  if (r.status !== 0 || !existsSync(tmpOut)) {
    const errMsg = (r.stderr || '').slice(-800);
    console.error(`  [ffmpeg] hook overlay FAILED (status=${r.status}): ${errMsg}`);
    return { ok: false, error: errMsg };
  }
  copyFileSync(tmpOut, videoPath);
  try {
    unlinkSync(tmpOut);
  } catch {
    /* ignore */
  }
  return { ok: true, hookText: hookText.trim() };
}

/**
 * Burn word-timed captions (YouTube-style, 4–6 words per phrase).
 * @param {string} videoPath
 * @param {Map<number, Array<{ word: string, start: number, end: number }>>} wordTimestampCache
 */
export function overlayKaraokeCaptions(videoPath, wordTimestampCache) {
  if (!existsSync(videoPath)) return { ok: false, error: 'video missing' };

  const probe = spawnSync(
    'ffprobe',
    ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=height,width', '-of', 'csv=p=0', videoPath],
    { encoding: 'utf8' },
  );
  const [wStr, hStr] = (probe.stdout || '1280,720').trim().split(',');
  const w = parseInt(wStr, 10) || 1280;
  const h = parseInt(hStr, 10) || 720;
  const cm = captionMetrics(h, w);
  const fontSize = cm.currentPx;

  const assPath = join(dirname(videoPath), 'captions-overlay.ass');
  const header = [
    '[Script Info]',
    'Title: AutoTube',
    'WrapStyle: 0',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Default,Arial Bold,${fontSize},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,${cm.strokePx},0,2,40,40,${cm.bottomPad},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];

  // Flatten all segments into a single word list so phrases carry across narration boundaries
  // without being cut at segment edges, preventing 2-word orphan captions.
  const allWords = [];
  for (const [, segWords] of wordTimestampCache) {
    allWords.push(...segWords);
  }

  const lines = [...header];
  let idx = 0;
  let buffer = [];
  let bufferStart = 0;
  let bufferEnd = 0;

  const flush = () => {
    if (!buffer.length) return;
    const text = escapeAss(buffer.join(' ').toUpperCase());
    lines.push(`Dialogue: 0,${formatAssTime(bufferStart)},${formatAssTime(bufferEnd)},Default,,0,0,0,,${text}`);
    idx += 1;
    buffer = [];
  };

  const hookEndSec = 3.2;
  const isPhraseEnd = (word) => /[.!?]$/.test(word) || /^[—–-]$/.test(word);
  // A word that should not start a new phrase alone: currency/numeric tokens or ALL-CAPS acronyms.
  const isBadSplit = (word) => /^\$?\d+$/.test(word) || /^[A-Z]{2,}$/.test(word);
  // Minimum words before flushing at a non-sentence boundary (prevents short orphan phrases).
  const minPhraseWords = 4;

  for (let wi = 0; wi < allWords.length; wi += 1) {
    const w = allWords[wi];
    if (w.end <= hookEndSec) continue;
    const start = Math.max(w.start, hookEndSec);
    if (!buffer.length) bufferStart = start;
    buffer.push(w.word);
    bufferEnd = w.end;

    const next = allWords[wi + 1];
    const atMax = buffer.length >= cm.maxWords;
    const phraseDone = isPhraseEnd(w.word);
    // Prevent splitting immediately before a number/currency token or ALL-CAPS acronym
    // so those words don't start the next phrase in isolation.
    const wouldSplitBad = next && isBadSplit(next.word);

    if (phraseDone && buffer.length >= minPhraseWords) {
      flush();
    } else if (atMax && !wouldSplitBad && buffer.length >= minPhraseWords) {
      flush();
    } else if (buffer.length >= cm.maxWords + 2) {
      // Force flush to prevent runaway buffer even when next word is a bad-split candidate.
      flush();
    }
  }
  // Flush tail — merge short orphans into previous line instead of 2-word gibberish captions.
  if (buffer.length >= minPhraseWords) {
    flush();
  } else if (buffer.length >= 2 && idx > 0) {
    const orphan = escapeAss(buffer.join(' ').toUpperCase());
    const lastIdx = lines.length - 1;
    lines[lastIdx] = `${lines[lastIdx]} ${orphan}`;
    idx += 1;
  } else if (buffer.length >= 2) {
    flush();
  }

  if (idx === 0) return { ok: false, error: 'no word timestamps' };

  writeFileSync(assPath, lines.join('\n'));
  const tmpOut = videoPath.replace(/\.mp4$/, '-captioned.mp4');
  const assEsc = assPath.replace(/'/g, "'\\''");
  const r = spawnSync(
    'ffmpeg',
    ['-y', '-i', videoPath, '-vf', `ass='${assEsc}'`, '-c:a', 'copy', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', tmpOut],
    { encoding: 'utf8', timeout: 600_000 },
  );
  if (r.status !== 0 || !existsSync(tmpOut)) {
    return { ok: false, error: (r.stderr || '').slice(-300) };
  }
  copyFileSync(tmpOut, videoPath);
  try {
    unlinkSync(assPath);
    unlinkSync(tmpOut);
  } catch {
    /* ignore */
  }
  return { ok: true, captionCount: idx };
}

/**
 * Apply YouTube overlays after ffmpeg assembly mux.
 */
export function applyFfmpegYoutubeOverlays(videoPath, project, wordTimestampCache) {
  const results = {};
  if (!isYouTubeExportMode(project)) return results;

  if (wordTimestampCache?.size) {
    const caps = overlayKaraokeCaptions(videoPath, wordTimestampCache);
    results.captions = caps;
    if (caps.ok) {
      console.log(`  [ffmpeg] captions: ${caps.captionCount} lines burned`);
    }
  }

  const hook = overlayHookText(videoPath, project);
  results.hook = hook;
  if (hook.ok) {
    console.log(`  [ffmpeg] hook overlay: "${hook.hookText?.slice(0, 48)}"`);
  } else {
    console.error(`  [ffmpeg] hook overlay FAILED: ${hook.error}`);
  }
  return results;
}
