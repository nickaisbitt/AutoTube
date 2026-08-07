/**
 * Post-mux overlays for ffmpeg assembly (hook text + karaoke captions).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync, unlinkSync, copyFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { isYouTubeExportMode, captionMetrics, hookFontPx } from './youtubeProfile.mjs';
import { narrationSpeechIntervals } from './narration.mjs';
import {
  hookOverlayWords,
  preserveHookWordBoundaries,
  resolveHonestHookOverlay,
  spokenHookFromProject,
} from '../../scripts/lib/hook-overlay-text.mjs';
import { buildImpactBeatsForTopic } from '../../scripts/lib/impactBeatsByTopic.mjs';
import { impactBeatsMatchTopic, isAirlineTopic } from '../../scripts/lib/topic-family.mjs';

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

// Bold sans fonts we trust for drawtext burns, in priority order. drawtext with
// no explicit fontfile silently produces empty (invisible) burns on hosts that
// lack a fontconfig default, so we always resolve one of these and fail loudly
// if none exist instead of shipping a caption-less final.
const DRAWTEXT_FONT_CANDIDATES = ['LiberationSans-Bold.ttf', 'DejaVuSans-Bold.ttf', 'FreeSansBold.ttf'];
const FONT_SEARCH_ROOTS = ['/usr/share/fonts', '/usr/local/share/fonts'];

let cachedFontFile;

function findFontFileByName(root, name) {
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      const found = findFontFileByName(full, name);
      if (found) return found;
    } else if (entry.name === name) {
      return full;
    }
  }
  return null;
}

/**
 * Resolve an explicit bold sans font file for drawtext burns.
 * Probes {@link DRAWTEXT_FONT_CANDIDATES} under {@link FONT_SEARCH_ROOTS} in
 * priority order. Returns the absolute path, or null when none are installed.
 */
export function resolveDrawtextFontFile() {
  if (cachedFontFile !== undefined) return cachedFontFile;
  for (const name of DRAWTEXT_FONT_CANDIDATES) {
    for (const root of FONT_SEARCH_ROOTS) {
      const found = findFontFileByName(root, name);
      if (found) {
        cachedFontFile = found;
        return cachedFontFile;
      }
    }
  }
  cachedFontFile = null;
  return cachedFontFile;
}

// drawtext parses ':' as an option separator and '\' as an escape; the value is
// wrapped in single quotes, so a literal quote must break/rejoin the quoting.
function escapeFontfile(path) {
  return String(path || '')
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "'\\''");
}

function parsePpm(buf) {
  if (!buf || buf.length < 10 || buf[0] !== 0x50 || buf[1] !== 0x36) return null; // 'P6'
  let pos = 2;
  const isWs = (c) => c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d;
  const readToken = () => {
    while (pos < buf.length) {
      const c = buf[pos];
      if (c === 0x23) {
        while (pos < buf.length && buf[pos] !== 0x0a) pos += 1;
      } else if (isWs(c)) {
        pos += 1;
      } else {
        break;
      }
    }
    const start = pos;
    while (pos < buf.length && !isWs(buf[pos])) pos += 1;
    return buf.toString('ascii', start, pos);
  };
  const width = parseInt(readToken(), 10);
  const height = parseInt(readToken(), 10);
  const maxval = parseInt(readToken(), 10);
  if (!Number.isFinite(width) || !Number.isFinite(height) || !Number.isFinite(maxval)) return null;
  pos += 1; // single whitespace byte separating header from binary data
  return { width, height, maxval, pixels: buf.subarray(pos) };
}

/**
 * Verify the burned hook actually rendered visible yellow text in the hook band.
 * Extracts a frame inside the hook window, crops the band where the hook lines
 * sit (y≈0.26–0.38), and counts strongly-yellow pixels. Returns
 * { ok, yellowPixels, sampled } — or { inconclusive: true } when the probe
 * itself could not run (so a flaky probe never fails an otherwise-good burn).
 */
function verifyHookYellowPixels(videoPath) {
  const bandTop = 0.2;
  const bandHeight = 0.32; // spans both hook lines at y=h*0.26 and y=h*0.38
  const ppm = spawnSync(
    'ffmpeg',
    [
      '-y', '-ss', '0.8', '-i', videoPath,
      '-vf', `crop=iw:ih*${bandHeight}:0:ih*${bandTop}`,
      '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'ppm', '-',
    ],
    { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024, timeout: 60_000 },
  );
  if (ppm.status !== 0 || !ppm.stdout || !ppm.stdout.length) return { inconclusive: true };
  const parsed = parsePpm(ppm.stdout);
  if (!parsed) return { inconclusive: true };
  const { width, height, pixels } = parsed;
  let yellow = 0;
  for (let i = 0; i + 2 < pixels.length; i += 3) {
    if (pixels[i] > 160 && pixels[i + 1] > 160 && pixels[i + 2] < 110) yellow += 1;
  }
  const sampled = width * height || 1;
  return { ok: yellow > Math.max(40, Math.round(sampled * 0.0002)), yellowPixels: yellow, sampled };
}

const MERGED_CAPTION_REPAIRS = [
  // Defensive ASS-path repair for upstream word builders that emit typo-hook tokens.
  [/\b(CABIN)(KEEP)\b/gi, '$1 $2'],
];

const WEAK_CAPTION_END_WORDS = new Set(['THE', 'A', 'AN', 'OF', 'TO', 'FOR', 'AND', 'WHAT', 'IS']);
const PHRASE_END_RE = /[.?!,;]["')\]]*$/;

export function repairMergedCaptionText(text) {
  const original = String(text || '');
  let repaired = preserveHookWordBoundaries(text)
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .replace(/(\d)([A-Za-z])/g, '$1 $2');

  for (const [pattern, replacement] of MERGED_CAPTION_REPAIRS) {
    repaired = repaired.replace(pattern, replacement);
  }

  repaired = repaired.replace(/\s+/g, ' ').trim();
  if (/[A-Z]/.test(original) && !/[a-z]/.test(original)) {
    return repaired.toUpperCase();
  }
  return repaired;
}

function normalizedCaptionWord(word) {
  return repairMergedCaptionText(word)
    .toUpperCase()
    .replace(/^[^A-Z0-9']+|[^A-Z0-9']+$/g, '');
}

function isWeakCaptionEndWord(word) {
  const normalized = normalizedCaptionWord(word);
  return Boolean(normalized) && WEAK_CAPTION_END_WORDS.has(normalized);
}

function hasPhraseBoundary(word) {
  return PHRASE_END_RE.test(String(word || '').trim());
}

function formatAssTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const cs = Math.floor((s % 1) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(Math.floor(s)).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

/**
 * Pick the hook text to burn. Every candidate — exportSettings, env vars,
 * declared hook lines — is validated against the topic and the spoken hook;
 * dishonest claims fall through to the spoken hook itself (no self-attest).
 * @param {object} project
 * @param {NodeJS.ProcessEnv} [env]
 */
export function resolveRenderHookOverlay(project, env = process.env) {
  const topic = [
    project?.topic,
    project?.title,
    project?.exportSettings?.topic,
    project?.exportSettings?.title,
  ].filter(Boolean).join(' ');
  return resolveHonestHookOverlay({
    topic,
    spokenHook: spokenHookFromProject(project),
    candidates: [
      { text: project?.exportSettings?.hookOverlay, source: 'exportSettings.hookOverlay' },
      { text: env.AUTOTUBE_HOOK_OVERLAY, source: 'env AUTOTUBE_HOOK_OVERLAY' },
      { text: project?.hookLine, source: 'project.hookLine' },
      { text: env.AUTOTUBE_HOOK_LINE, source: 'env AUTOTUBE_HOOK_LINE' },
      { text: project?.exportSettings?.hookLine, source: 'exportSettings.hookLine' },
    ],
  });
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
  // Glyph width estimate (drawtext has no measure API).
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
    // Prefer 2 short lines over one overlong line.
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

/**
 * Burn hook overlay for first N seconds (watcher 0–3s audit).
 * @param {string} videoPath
 * @param {object} project
 * @param {{ durationSec?: number }} [options]
 */
export function overlayHookText(videoPath, project, options = {}) {
  if (!existsSync(videoPath)) return { ok: false, error: 'video missing' };

  const { text: hookText, rejected: rejectedHookClaims } = resolveRenderHookOverlay(project);
  for (const claim of rejectedHookClaims) {
    console.warn(
      `  [ffmpeg] hook overlay claim rejected (${claim.source}) — ${claim.reason}: "${claim.text.slice(0, 60)}"`,
    );
  }
  if (!hookText?.trim()) return { ok: false, error: 'no honest hook text (all overlay claims rejected)' };

  const fontFile = resolveDrawtextFontFile();
  if (!fontFile) {
    return {
      ok: false,
      error: `no drawtext font found (looked for ${DRAWTEXT_FONT_CANDIDATES.join(', ')} under ${FONT_SEARCH_ROOTS.join(', ')})`,
    };
  }
  const fontOpt = `fontfile='${escapeFontfile(fontFile)}':`;

  const probe = spawnSync(
    'ffprobe',
    ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', videoPath],
    { encoding: 'utf8' },
  );
  const [wStr, hStr] = (probe.stdout || '1280,720').trim().split(',');
  const w = parseInt(wStr, 10) || 1280;
  const h = parseInt(hStr, 10) || 720;
  const words = hookOverlayWords(hookText, { maxWords: 8 });
  const { lines, fontSize } = layoutHookLines(words, w, h);
  const line1 = lines[0] || '';
  const line2 = lines[1] || '';
  if (!line1) return { ok: false, error: 'no hook text' };
  // Hook window ≤3s: one stable overlay (don't stack with impact/karaoke).
  const durationSec = options.durationSec ?? 3.0;
  const border = Math.max(5, Math.round(fontSize * 0.08));
  const filters = [
    `drawtext=${fontOpt}text='${escapeDrawtext(line1)}':fontsize=${fontSize}:fontcolor=yellow:borderw=${border}:bordercolor=black:x=(w-text_w)/2:y=h*0.26:enable='between(t\\,0\\,${durationSec})'`,
  ];
  if (line2) {
    filters.push(
      `drawtext=${fontOpt}text='${escapeDrawtext(line2)}':fontsize=${fontSize}:fontcolor=yellow:borderw=${border}:bordercolor=black:x=(w-text_w)/2:y=h*0.38:enable='between(t\\,0\\,${durationSec})'`,
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
  // Reject truncated/corrupt outputs (moov missing) so we don't ship caption-less finals.
  const probeOk = spawnSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', tmpOut],
    { encoding: 'utf8', timeout: 30_000 },
  );
  const dur = parseFloat(probeOk.stdout || '');
  if (probeOk.status !== 0 || !Number.isFinite(dur) || dur < 1) {
    try { unlinkSync(tmpOut); } catch { /* ignore */ }
    return { ok: false, error: 'hook overlay produced corrupt/truncated mp4' };
  }
  // Confirm the burn is actually visible (guards silent empty burns from a bad
  // font/glyph even when ffmpeg exits 0). Inconclusive probes don't block.
  const verify = verifyHookYellowPixels(tmpOut);
  if (verify.ok === false) {
    try { unlinkSync(tmpOut); } catch { /* ignore */ }
    return {
      ok: false,
      error: `hook overlay burned no visible yellow text (font=${fontFile}, yellowPixels=${verify.yellowPixels}/${verify.sampled})`,
    };
  }
  copyFileSync(tmpOut, videoPath);
  try {
    unlinkSync(tmpOut);
  } catch {
    /* ignore */
  }
  return {
    ok: true,
    hookText: hookText.trim(),
    fontFile,
    yellowPixels: verify.yellowPixels,
    yellowVerified: verify.ok === true,
  };
}

/**
 * Burn word-timed captions (YouTube-style, max 4 words per line).
 * VTT word times are segment-relative — offset to absolute mix time via
 * `options.audioFiles` (exact cumulative audio durations, including intro
 * silence and inter-segment gap/breath pads) or, as a legacy fallback, by
 * stacking script segment durations.
 * @param {string} videoPath
 * @param {Map<number, Array<{ word: string, start: number, end: number }>>} wordTimestampCache
 * @param {{ project?: object, audioFiles?: Array<{duration: number, kind?: string, segmentIndex?: number}> }} [options]
 */
export function overlayKaraokeCaptions(videoPath, wordTimestampCache, options = {}) {
  if (!existsSync(videoPath)) return { ok: false, error: 'video missing' };

  const project = options.project || {};
  const probe = spawnSync(
    'ffprobe',
    ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=height,width', '-of', 'csv=p=0', videoPath],
    { encoding: 'utf8' },
  );
  const [wStr, hStr] = (probe.stdout || '1280,720').trim().split(',');
  const w = parseInt(wStr, 10) || 1280;
  const h = parseInt(hStr, 10) || 720;
  const durationProbe = spawnSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', videoPath],
    { encoding: 'utf8', timeout: 30_000 },
  );
  const videoDuration = Number(String(durationProbe.stdout || '').trim());
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
    // Yellow + black outline — white-on-light frames were unreadable on cold watches.
    `Style: Default,Arial Bold,${fontSize},&H0000FFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,${cm.strokePx},0,2,60,60,${cm.bottomPad},1`,
    `Style: CTA,Arial Bold,${Math.round(fontSize * 1.12)},&H0000FFFF,&H000000FF,&H00000000,&H90000000,1,0,0,0,100,100,0,0,1,${Math.max(cm.strokePx + 1, 5)},1,5,90,90,0,1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];

  const lines = [...header];
  let idx = 0;
  let buffer = [];
  let lastCaptionEnd = 0;
  let lastCaptionText = '';

  const captionTextFor = (words) => words
    .map((item) => repairMergedCaptionText(item.word))
    .filter(Boolean)
    .join(' ')
    .toUpperCase();
  const flush = (count = buffer.length) => {
    if (!buffer.length) return;
    const flushWords = buffer.slice(0, count);
    if (!flushWords.length) return;
    // Prefer speech-synced times; nudge only on overlap.
    let start = flushWords[0].start;
    let end = Math.max(flushWords.reduce((max, item) => Math.max(max, item.end), start), start + 0.4);
    if (start < lastCaptionEnd) start = lastCaptionEnd;
    if (end <= start) end = start + 0.45;
    // Cap line hold so captions stay punchy.
    end = Math.min(end, start + 2.4);
    const rawText = captionTextFor(flushWords);
    if (rawText !== lastCaptionText) {
      const text = escapeAss(rawText);
      lines.push(`Dialogue: 0,${formatAssTime(start)},${formatAssTime(end)},Default,,0,0,0,,${text}`);
      lastCaptionText = rawText;
      idx += 1;
    }
    lastCaptionEnd = end;
    buffer = buffer.slice(count);
  };

  const flushableCaptionWordCount = () => {
    let count = buffer.length;
    while (count > 1 && isWeakCaptionEndWord(buffer[count - 1].word)) count -= 1;
    return count;
  };

  const maybeFlushCaptionBuffer = (word) => {
    if (!buffer.length) return;
    const flushableCount = flushableCaptionWordCount();
    const phraseEnded = hasPhraseBoundary(word);
    if (phraseEnded && flushableCount === buffer.length) {
      flush();
      return;
    }
    if (buffer.length >= cm.maxWords && flushableCount === buffer.length) {
      flush();
      return;
    }
    if (buffer.length > cm.maxWords && flushableCount > 0) {
      flush(flushableCount);
    }
  };

  const resolveEndCtaText = () => {
    const custom = project?.exportSettings?.ctaText || process.env.AUTOTUBE_END_CTA;
    if (custom?.trim()) return custom.trim();

    const topic = [
      project?.topic,
      project?.title,
      project?.exportSettings?.topic,
      project?.exportSettings?.title,
    ].filter(Boolean).join(' ');
    if (isAirlineTopic(topic)) return 'VERIFY BEFORE YOU FLY';
    return '';
  };

  const addEndCta = () => {
    const ctaText = resolveEndCtaText();
    if (!ctaText || !Number.isFinite(videoDuration) || videoDuration < 4) return null;
    const start = Math.max(lastCaptionEnd + 0.12, videoDuration - 3);
    const end = Math.min(videoDuration - 0.05, start + 2.4);
    if (end - start < 0.55) return null;
    const text = repairMergedCaptionText(ctaText).toUpperCase();
    lines.push(`Dialogue: 1,${formatAssTime(start)},${formatAssTime(end)},CTA,,0,0,0,,${escapeAss(text)}`);
    return ctaText;
  };

  const script = project.script || [];
  // Muxed audio starts with INTRO_SILENCE_SECONDS before segment 0 speech.
  const INTRO_SILENCE_SEC = Number(process.env.AUTOTUBE_INTRO_SILENCE_SEC || 3.5);
  // Preferred: exact speech-start offsets from the actual narration audio timeline
  // (cumulative audioFiles durations include intro silence + gap/breath pads that
  // generateNarration inserts between segments).
  const speechIntervals = options.audioFiles?.length
    ? narrationSpeechIntervals(options.audioFiles)
    : null;
  const segOffsetFor = (segKey) => {
    const n = Number(segKey);
    const exact = speechIntervals?.get(n);
    if (exact) return exact.start;
    if (!Number.isFinite(n) || n < 0) return INTRO_SILENCE_SEC;
    // Legacy fallback: stack script durations (post-TTS these include the folded
    // inter-segment pauses, so they approximate the audio timeline).
    let off = INTRO_SILENCE_SEC;
    for (let i = 0; i < n && i < script.length; i += 1) {
      off += Number(script[i]?.duration) || 0;
    }
    // Fallback: stack by prior segment word ends.
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
      const word = String(w.word || '').trim();
      if (!word) continue;
      const absStart = (Number(w.start) || 0) + segOffset;
      const absEnd = (Number(w.end) || absStart + 0.3) + segOffset;
      if (absEnd <= hookEndSec) continue;
      const start = Math.max(absStart, hookEndSec);
      buffer.push({
        word,
        start,
        end: Math.max(absEnd, start + 0.3),
      });
      maybeFlushCaptionBuffer(word);
    }
    flush();
  }
  flush();

  if (idx === 0) return { ok: false, error: 'no word timestamps' };
  const ctaText = addEndCta();

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
  const probeOk = spawnSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', tmpOut],
    { encoding: 'utf8', timeout: 30_000 },
  );
  const dur = parseFloat(probeOk.stdout || '');
  if (probeOk.status !== 0 || !Number.isFinite(dur) || dur < 1) {
    try { unlinkSync(tmpOut); } catch { /* ignore */ }
    return { ok: false, error: 'caption overlay produced corrupt/truncated mp4' };
  }
  copyFileSync(tmpOut, videoPath);
  try {
    unlinkSync(assPath);
    unlinkSync(tmpOut);
  } catch {
    /* ignore */
  }
  return { ok: true, captionCount: idx, ctaText };
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
 * Pass `options.audioFiles` (from generateNarration) so caption offsets are derived
 * from the actual audio timeline instead of script duration estimates.
 */
export function applyFfmpegYoutubeOverlays(videoPath, project, wordTimestampCache, options = {}) {
  const results = {};
  if (!isYouTubeExportMode(project)) return results;

  const { karaokeRequested, karaokeActive, burnImpactBeats } = overlayTextPolicy(project, wordTimestampCache);

  if (karaokeActive) {
    const caps = overlayKaraokeCaptions(videoPath, wordTimestampCache, { project, audioFiles: options.audioFiles });
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
    console.log(
      `  [ffmpeg] hook overlay: "${hook.hookText?.slice(0, 48)}..." (font=${hook.fontFile}, yellowPixels=${hook.yellowPixels})`,
    );
  } else {
    console.warn(`  [ffmpeg] hook overlay failed: ${hook.error}`);
  }

  // Impact cards only when karaoke is off.
  if (burnImpactBeats) {
    const beats = overlayImpactBeats(videoPath, project);
    results.impactBeats = beats;
    if (beats.ok) {
      console.log(`  [ffmpeg] impact beats: ${beats.count} cards (font=${beats.fontFile})`);
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
 * Karaoke-OFF (airline/housing/healthcare): larger cards, longer hold, denser
 * cadence — replaces weak white word-captions that get lost on dark B-roll
 * (airline-web8 captionReadability 7).
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
  const airlineTopic = isAirlineTopic(topic);
  const defaults = buildImpactBeatsForTopic(topic);

  const custom = Array.isArray(project?.exportSettings?.impactBeats)
    ? project.exportSettings.impactBeats
    : [];
  // Prefer project beats only when they match the topic family.
  const customOnTopic = impactBeatsMatchTopic(custom, topic);
  const weakWordRe = /^(THE|A|AN|OF|TO|IN|ON|AT|IS|ARE|WAS|AND|OR|FOR|BY)$/;
  const beats = (customOnTopic ? custom : defaults)
    .map((t) => String(t || '').trim().toUpperCase().split(/\s+/)
      .filter((w) => w && !weakWordRe.test(w))
      .slice(0, 3)
      .join(' '))
    .filter((t) => t && t.replace(/\s+/g, '').length >= 4);
  // Prefer unique cards across the timeline.
  const uniqueBeats = [...new Set(beats)];
  if (!uniqueBeats.length) return { ok: false, error: 'no strong beats' };

  const hookEndSec = Number(options.hookEndSec ?? 3) || 3;
  const defaultInterval = airlineTopic ? 3.5 : 4;
  const interval = Math.max(
    airlineTopic ? 3.2 : 3.5,
    Number(project?.exportSettings?.impactBeatIntervalSec || options.intervalSec || defaultInterval) || defaultInterval,
  );
  // Start right after hook window.
  const times = [];
  for (let t = hookEndSec; t < duration - 2; t += interval) times.push(t);
  if (!times.length) return { ok: false, error: 'no beat times' };

  const hProbe = spawnSync(
    'ffprobe',
    ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=height', '-of', 'csv=p=0', videoPath],
    { encoding: 'utf8' },
  );
  const h = parseInt((hProbe.stdout || '1080').trim(), 10) || 1080;
  const fontFile = resolveDrawtextFontFile();
  if (!fontFile) {
    return {
      ok: false,
      error: `no drawtext font found (looked for ${DRAWTEXT_FONT_CANDIDATES.join(', ')} under ${FONT_SEARCH_ROOTS.join(', ')})`,
    };
  }
  const fontOpt = `fontfile='${escapeFontfile(fontFile)}':`;
  // Karaoke-OFF: larger yellow cards (airline stretch toward caption ≥9).
  const fontFrac = airlineTopic ? 0.115 : 0.105;
  const fontSize = Math.round(h * fontFrac);
  const border = Math.max(6, Math.round(fontSize * 0.1));
  const holdSec = airlineTopic ? 1.75 : 1.55;
  const yFracs = [0.34, 0.42, 0.50];
  const filters = [];
  for (let i = 0; i < times.length; i += 1) {
    const text = escapeDrawtext(uniqueBeats[i % uniqueBeats.length]);
    const start = times[i];
    const end = Math.min(duration - 0.05, start + holdSec);
    const y = `h*${yFracs[i % yFracs.length]}`;
    filters.push(
      `drawtext=${fontOpt}text='${text}':fontsize=${fontSize}:fontcolor=yellow:borderw=${border}:bordercolor=black:x=(w-text_w)/2:y=${y}:enable='between(t\\,${start}\\,${end})'`,
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
  return { ok: true, count: times.length, fontFile, fontSize, holdSec };
}
