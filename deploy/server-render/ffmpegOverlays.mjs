/**
 * Post-mux overlays for ffmpeg assembly (hook text + karaoke captions).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync, unlinkSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { isYouTubeExportMode, captionMetrics, hookFontPx } from './youtubeProfile.mjs';
import { buildImpactBeatsForTopic } from '../../scripts/lib/impactBeatsByTopic.mjs';
import { impactBeatsMatchTopic } from '../../scripts/lib/topic-family.mjs';

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
function isInstructionHookText(text) {
  const t = String(text || '').trim();
  return /^(replace|rewrite|start with|use|change|fix|try)\b/i.test(t)
    || /\brewrite\s+line\b/i.test(t)
    || /\bshock hook\b/i.test(t);
}

/**
 * Fit hook words into ≤2 lines that stay inside ~90% of frame width.
 * Prevents edge-clipping EXPOSED → EXPOSE / XPOSED when Impact-scale text is too wide.
 * @param {string[]} words
 * @param {number} videoW
 * @param {number} videoH
 */
export function layoutHookLines(words, videoW, videoH) {
  const tokens = (words || []).map((w) => String(w || '').trim()).filter(Boolean).slice(0, 8);
  if (!tokens.length) return { lines: [], fontSize: hookFontPx(videoH) };

  const maxLineW = Math.max(320, videoW * 0.9);
  // Impact-ish glyph width estimate (drawtext has no measure API here)
  const estWidth = (line, size) => String(line).length * size * 0.62;

  const pack = (size) => {
    const lines = [];
    let cur = [];
    for (const w of tokens) {
      const next = [...cur, w].join(' ');
      if (cur.length && estWidth(next, size) > maxLineW) {
        lines.push(cur.join(' '));
        cur = [w];
      } else {
        cur.push(w);
      }
    }
    if (cur.length) lines.push(cur.join(' '));
    // Prefer 2 short lines over one overlong line when we still overflow
    if (lines.length === 1 && tokens.length >= 3 && estWidth(lines[0], size) > maxLineW) {
      const mid = Math.ceil(tokens.length / 2);
      return [tokens.slice(0, mid).join(' '), tokens.slice(mid).join(' ')].filter(Boolean);
    }
    return lines.slice(0, 2);
  };

  let fontSize = Math.min(Math.max(hookFontPx(videoH), Math.round(videoH * 0.095)), Math.round(videoH * 0.11));
  const minSize = Math.round(videoH * 0.055);
  let lines = pack(fontSize);
  while (lines.some((l) => estWidth(l, fontSize) > maxLineW) && fontSize > minSize) {
    fontSize -= 4;
    lines = pack(fontSize);
  }
  return { lines, fontSize };
}

export function overlayHookText(videoPath, project, options = {}) {
  if (!existsSync(videoPath)) return { ok: false, error: 'video missing' };

  let hookText =
    project.exportSettings?.hookOverlay
    || process.env.AUTOTUBE_HOOK_OVERLAY
    || project.hookLine
    || process.env.AUTOTUBE_HOOK_LINE
    || project.exportSettings?.hookLine;
  // Never burn editor instructions onto the frame (watcher sometimes suggests "Rewrite line 1 as…")
  if (hookText && isInstructionHookText(hookText)) {
    hookText = project.hookLine || project.exportSettings?.hookLine || '';
    if (isInstructionHookText(hookText)) hookText = '';
  }
  if (!hookText?.trim()) return { ok: false, error: 'no hook text' };

  const probe = spawnSync(
    'ffprobe',
    ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', videoPath],
    { encoding: 'utf8' },
  );
  const [wStr, hStr] = (probe.stdout || '1280,720').trim().split(',');
  const w = parseInt(wStr, 10) || 1280;
  const h = parseInt(hStr, 10) || 720;
  const words = hookText
    .trim()
    .toUpperCase()
    .replace(/:/g, ' ') // avoid ffmpeg drawtext option-separator footguns
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8);
  const { lines, fontSize } = layoutHookLines(words, w, h);
  const line1 = lines[0] || '';
  const line2 = lines[1] || '';
  if (!line1) return { ok: false, error: 'no hook text' };
  // Hook window ≤3s (watcher audits 0–3s). One stable overlay — rotating into impact
  // beats at 1.5s stacked with karaoke captions read as nonsensical text spam.
  const durationSec = options.durationSec ?? 3.0;
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
  // Muxed audio starts with INTRO_SILENCE_SECONDS (narration.mjs) before segment 0 speech
  const INTRO_SILENCE_SEC = Number(process.env.AUTOTUBE_INTRO_SILENCE_SEC || 3.5);
  const segOffsetFor = (segKey) => {
    const n = Number(segKey);
    if (!Number.isFinite(n) || n < 0) return INTRO_SILENCE_SEC;
    let off = INTRO_SILENCE_SEC;
    for (let i = 0; i < n && i < script.length; i += 1) {
      off += Number(script[i]?.duration) || 0;
    }
    // Fallback when durations missing: stack by prior segment word ends
    if (off <= INTRO_SILENCE_SEC && n > 0) {
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
 * Decide which text overlays to burn. Impact beats are hook-only-mode cards;
 * skip them whenever karaoke captions are requested (even if word timestamps
 * failed to load — otherwise we still spam hook + impact + nothing).
 */
export function overlayTextPolicy(project, wordTimestampCache) {
  const karaokeOff =
    process.env.AUTOTUBE_KARAOKE_CAPTIONS === '0'
    || process.env.AUTOTUBE_KARAOKE_CAPTIONS === 'false'
    || project?.exportSettings?.karaokeCaptions === false;
  const karaokeRequested = !karaokeOff;
  const karaokeActive = karaokeRequested && Boolean(wordTimestampCache?.size);
  return {
    karaokeRequested,
    karaokeActive,
    burnImpactBeats: process.env.AUTOTUBE_IMPACT_BEATS !== '0' && !karaokeRequested,
  };
}

/**
 * Apply YouTube overlays after ffmpeg assembly mux.
 */
export function applyFfmpegYoutubeOverlays(videoPath, project, wordTimestampCache) {
  const results = {};
  if (!isYouTubeExportMode(project)) return results;

  const { karaokeRequested, karaokeActive, burnImpactBeats } = overlayTextPolicy(project, wordTimestampCache);

  if (karaokeActive) {
    const caps = overlayKaraokeCaptions(videoPath, wordTimestampCache, { project });
    results.captions = caps;
    if (caps.ok) {
      console.log(`  [ffmpeg] captions: ${caps.captionCount} lines burned`);
    }
  } else if (!karaokeRequested) {
    console.log('  [ffmpeg] karaoke captions skipped (hook-only overlay mode)');
    results.captions = { ok: true, skipped: true };
  } else {
    console.log('  [ffmpeg] karaoke captions skipped (no word timestamps)');
    results.captions = { ok: false, skipped: true, reason: 'no-timestamps' };
  }

  const hook = overlayHookText(videoPath, project);
  results.hook = hook;
  if (hook.ok) {
    console.log(`  [ffmpeg] hook overlay: "${hook.hookText?.slice(0, 48)}..."`);
  }

  // Impact cards only when karaoke is off — burning both reads as fragmented text spam.
  if (burnImpactBeats) {
    const beats = overlayImpactBeats(videoPath, project);
    results.impactBeats = beats;
    if (beats.ok) {
      console.log(`  [ffmpeg] impact beats: ${beats.count} cards`);
    }
  } else if (karaokeRequested) {
    results.impactBeats = { ok: true, skipped: true, reason: karaokeActive ? 'karaoke-on' : 'karaoke-requested' };
    console.log('  [ffmpeg] impact beats skipped (karaoke captions requested)');
  }
  return results;
}

/**
 * Burn ≤3-word yellow impact cards every ~5s after the hook window.
 * Topic-matched beats (exportSettings.impactBeats) beat bank-scam defaults.
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

  const topic = String(project?.topic || project?.title || '');
  const defaults = buildImpactBeatsForTopic(topic);

  const custom = Array.isArray(project?.exportSettings?.impactBeats)
    ? project.exportSettings.impactBeats
    : [];
  // Prefer project beats only when they match the topic family (hospital cards must not stick on nursing)
  const customOnTopic = impactBeatsMatchTopic(custom, topic);
  const beats = (customOnTopic ? custom : defaults)
    .map((t) => String(t || '').trim().toUpperCase().split(/\s+/).slice(0, 3).join(' '))
    .filter(Boolean);
  // Prefer unique cards across the timeline — repetition tanks captionReadability
  const uniqueBeats = [...new Set(beats)];

  const hookEndSec = Number(options.hookEndSec ?? 3) || 3;
  const interval = Math.max(
    3.5,
    Number(project?.exportSettings?.impactBeatIntervalSec || options.intervalSec || 4) || 4,
  );
  // Start right after hook window — avoid 3–5s dead zone of static / empty text
  const times = [];
  for (let t = hookEndSec; t < duration - 2; t += interval) times.push(t);
  if (!times.length) return { ok: false, error: 'no beat times' };

  const hProbe = spawnSync(
    'ffprobe',
    ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=height', '-of', 'csv=p=0', videoPath],
    { encoding: 'utf8' },
  );
  const h = parseInt((hProbe.stdout || '1080').trim(), 10) || 1080;
  const fontSize = Math.round(h * 0.095);
  const border = Math.max(5, Math.round(fontSize * 0.09));
  const yFracs = [0.36, 0.44, 0.52];
  const filters = [];
  for (let i = 0; i < times.length; i += 1) {
    const text = escapeDrawtext(uniqueBeats[i % uniqueBeats.length]);
    const start = times[i];
    const end = Math.min(duration - 0.05, start + 1.4);
    const y = `h*${yFracs[i % yFracs.length]}`;
    filters.push(
      `drawtext=text='${text}':fontsize=${fontSize}:fontcolor=yellow:borderw=${border}:bordercolor=black:x=(w-text_w)/2:y=${y}:enable='between(t\\,${start}\\,${end})'`,
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
