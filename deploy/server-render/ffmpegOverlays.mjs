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
    .replace(/%/g, '\\%');
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

  const hookText =
    project.exportSettings?.hookOverlay
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
  const h = parseInt(hStr, 10) || 720;
  const words = hookText.trim().toUpperCase().split(/\s+/).filter(Boolean).slice(0, 6);
  const line1 = words.slice(0, 4).join(' ');
  const line2 = words.slice(4, 6).join(' ');
  // Larger + yellow fill so hook OCR / vision reliably sees on-screen text in 0–3s
  const fontSize = Math.min(Math.max(hookFontPx(h), Math.round(h * 0.095)), Math.round(h * 0.11));
  const durationSec = options.durationSec ?? 3.5;
  const border = Math.max(5, Math.round(fontSize * 0.08));
  const filters = [
    `drawtext=text='${escapeDrawtext(line1)}':fontsize=${fontSize}:fontcolor=yellow:borderw=${border}:bordercolor=black:x=(w-text_w)/2:y=h*0.26:enable='between(t\\,0\\,${durationSec})'`,
  ];
  if (line2) {
    filters.push(
      `drawtext=text='${escapeDrawtext(line2)}':fontsize=${fontSize}:fontcolor=yellow:borderw=${border}:bordercolor=black:x=(w-text_w)/2:y=h*0.38:enable='between(t\\,0\\,${durationSec})'`,
    );
  }
  const vf = filters.join(',');

  const tmpOut = videoPath.replace(/\.mp4$/, '-hooked.mp4');
  const r = spawnSync(
    'ffmpeg',
    ['-y', '-i', videoPath, '-vf', vf, '-c:a', 'copy', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', tmpOut],
    { encoding: 'utf8', timeout: 300_000 },
  );
  if (r.status !== 0 || !existsSync(tmpOut)) {
    return { ok: false, error: (r.stderr || '').slice(-300) };
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
 * Burn word-timed captions (YouTube-style, max 4 words per line).
 * VTT word times are segment-relative — offset by script segment durations or stacked.
 * @param {string} videoPath
 * @param {Map<number, Array<{ word: string, start: number, end: number }>>} wordTimestampCache
 * @param {{ project?: object }} [options]
 */
export function overlayKaraokeCaptions(videoPath, wordTimestampCache, options = {}) {
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
    'ScriptType: v4.00+',
    'WrapStyle: 0',
    `PlayResX: ${w}`,
    `PlayResY: ${h}`,
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Default,Arial Bold,${fontSize},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,${cm.strokePx},0,2,60,60,${cm.bottomPad},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];

  const lines = [...header];
  let idx = 0;
  let buffer = [];
  let bufferStart = 0;
  let bufferEnd = 0;
  let lastCaptionEnd = 0;

  const flush = () => {
    if (!buffer.length) return;
    // Prefer speech-synced times; only nudge if we'd overlap the previous line
    let start = bufferStart;
    let end = Math.max(bufferEnd, start + 0.4);
    if (start < lastCaptionEnd) start = lastCaptionEnd;
    if (end <= start) end = start + 0.45;
    // Cap line hold so captions stay punchy (≤4 words already)
    end = Math.min(end, start + 2.4);
    const text = escapeAss(buffer.join(' ').toUpperCase());
    lines.push(`Dialogue: 0,${formatAssTime(start)},${formatAssTime(end)},Default,,0,0,0,,${text}`);
    lastCaptionEnd = end;
    idx += 1;
    buffer = [];
  };

  const script = options.project?.script || [];
  const segOffsetFor = (segKey) => {
    const n = Number(segKey);
    if (!Number.isFinite(n) || n <= 0) return 0;
    let off = 0;
    for (let i = 0; i < n && i < script.length; i += 1) {
      off += Number(script[i]?.duration) || 0;
    }
    // Fallback when durations missing: stack by prior segment word ends
    if (off <= 0 && n > 0) {
      for (let i = 0; i < n; i += 1) {
        const prev = wordTimestampCache.get(i) || [];
        const maxEnd = prev.reduce((m, w) => Math.max(m, Number(w.end) || 0), 0);
        off += maxEnd;
      }
    }
    return off;
  };

  const hookEndSec = 3.2;
  const entries = [...wordTimestampCache.entries()].sort((a, b) => Number(a[0]) - Number(b[0]));
  for (const [segKey, words] of entries) {
    const segOffset = segOffsetFor(segKey);
    for (const w of words) {
      const absStart = (Number(w.start) || 0) + segOffset;
      const absEnd = (Number(w.end) || absStart + 0.3) + segOffset;
      if (absEnd <= hookEndSec) continue;
      const start = Math.max(absStart, hookEndSec);
      if (!buffer.length) bufferStart = start;
      buffer.push(w.word);
      bufferEnd = Math.max(absEnd, start + 0.3);
      if (buffer.length >= cm.maxWords) flush();
    }
    flush();
  }
  flush();

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

  const karaokeOff =
    process.env.AUTOTUBE_KARAOKE_CAPTIONS === '0'
    || process.env.AUTOTUBE_KARAOKE_CAPTIONS === 'false'
    || project?.exportSettings?.karaokeCaptions === false;

  if (wordTimestampCache?.size && !karaokeOff) {
    const caps = overlayKaraokeCaptions(videoPath, wordTimestampCache, { project });
    results.captions = caps;
    if (caps.ok) {
      console.log(`  [ffmpeg] captions: ${caps.captionCount} lines burned`);
    }
  } else if (karaokeOff) {
    console.log('  [ffmpeg] karaoke captions skipped (hook-only overlay mode)');
    results.captions = { ok: true, skipped: true };
  }

  const hook = overlayHookText(videoPath, project);
  results.hook = hook;
  if (hook.ok) {
    console.log(`  [ffmpeg] hook overlay: "${hook.hookText?.slice(0, 48)}..."`);
  }

  // Short mid-video impact cards (not full karaoke) — boosts perceived pacing/variety
  if (process.env.AUTOTUBE_IMPACT_BEATS !== '0') {
    const beats = overlayImpactBeats(videoPath, project);
    results.impactBeats = beats;
    if (beats.ok) {
      console.log(`  [ffmpeg] impact beats: ${beats.count} cards`);
    }
  }
  return results;
}

/**
 * Burn ≤3-word yellow impact cards every ~8s after the hook window.
 */
export function overlayImpactBeats(videoPath, project, options = {}) {
  if (!existsSync(videoPath)) return { ok: false, error: 'video missing' };
  const probe = spawnSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', videoPath],
    { encoding: 'utf8' },
  );
  const duration = parseFloat(probe.stdout || '0') || 0;
  if (duration < 12) return { ok: false, error: 'too short' };

  const defaults = [
    'VOICE CLONE SCAM',
    'THEY DRAINED IT',
    'CALL THEM BACK',
    'VERIFY FIRST',
    'STOP THE TRANSFER',
    'NOT YOUR MOM',
  ];
  const custom = Array.isArray(project?.exportSettings?.impactBeats)
    ? project.exportSettings.impactBeats
    : [];
  const beats = (custom.length ? custom : defaults)
    .map((t) => String(t || '').trim().toUpperCase().split(/\s+/).slice(0, 3).join(' '))
    .filter(Boolean);

  const times = [];
  for (let t = 8; t < duration - 2; t += 8) times.push(t);
  if (!times.length) return { ok: false, error: 'no beat times' };

  const hProbe = spawnSync(
    'ffprobe',
    ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=height', '-of', 'csv=p=0', videoPath],
    { encoding: 'utf8' },
  );
  const h = parseInt((hProbe.stdout || '1080').trim(), 10) || 1080;
  const fontSize = Math.round(h * 0.07);
  const border = Math.max(4, Math.round(fontSize * 0.08));
  const filters = [];
  for (let i = 0; i < times.length; i += 1) {
    const text = escapeDrawtext(beats[i % beats.length]);
    const start = times[i];
    const end = Math.min(duration - 0.05, start + 2.0);
    filters.push(
      `drawtext=text='${text}':fontsize=${fontSize}:fontcolor=yellow:borderw=${border}:bordercolor=black:x=(w-text_w)/2:y=h*0.42:enable='between(t\\,${start}\\,${end})'`,
    );
  }
  const tmpOut = videoPath.replace(/\.mp4$/, '-beats.mp4');
  const r = spawnSync(
    'ffmpeg',
    ['-y', '-i', videoPath, '-vf', filters.join(','), '-c:a', 'copy', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', tmpOut],
    { encoding: 'utf8', timeout: 300_000 },
  );
  if (r.status !== 0 || !existsSync(tmpOut)) {
    return { ok: false, error: (r.stderr || '').slice(-300) };
  }
  copyFileSync(tmpOut, videoPath);
  try {
    unlinkSync(tmpOut);
  } catch {
    /* ignore */
  }
  return { ok: true, count: times.length };
}
