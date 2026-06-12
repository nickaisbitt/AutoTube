/**
 * Post-mux overlays for ffmpeg assembly (hook text + karaoke captions).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync, unlinkSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { isYouTubeExportMode, captionMetrics, hookFontPx } from './youtubeProfile.mjs';
import { MIN_CAPTION_WORDS } from './assembly-system.mjs';

/** Preferred minimum words per phrase, or phrase must end with punctuation. */
const PREFERRED_CAPTION_WORDS = 4;

/** Seconds before which words are skipped (hook zone — must clear hook drawtext burn-in). */
const HOOK_END_SEC = 4.5;

const isPhraseEnd = (word) => /[.!?;]$/.test(word) || /^[—–-]$/.test(word);

/** A word that should not start or continue a break point alone: currency/numeric tokens or ALL-CAPS acronyms. */
const isBadSplit = (word) => /^\$?\d[\d,.]*$/.test(word) || /^[A-Z]{2,}$/.test(word);

/** Words that read poorly as the first or last word of a standalone caption line. */
const isWeakLeadIn = (word) => /^(about|this|using|the|in|a|an|or|and|with|for|to|of|who|that|too|at|on|as|by|it|is|was|were|be)$/i.test(word);

/** Trailing comma with no sentence end — orphan fragment (e.g. "WHO,"). */
const isOrphanFragment = (word) => /^[a-z]{1,4},$/i.test(word) && !isPhraseEnd(word);

/**
 * A phrase is valid for emission when it is long enough and well-formed.
 * - Must have >= MIN_CAPTION_WORDS words.
 * - Must have >= PREFERRED_CAPTION_WORDS words OR end with punctuation.
 * - Must not start or end with a weak lead-in word.
 * - Must not have > 50% isBadSplit words.
 */
function phraseIsValid(buf) {
  if (buf.length < MIN_CAPTION_WORDS) return false;
  const endsWithPunct = isPhraseEnd(buf[buf.length - 1]);
  const loopMode = process.env.AUTOTUBE_LOOP_MODE === '1';
  const minWords = loopMode ? Math.max(PREFERRED_CAPTION_WORDS, 5) : PREFERRED_CAPTION_WORDS;
  if (buf.length < minWords && !endsWithPunct) return false;
  if (buf.length < PREFERRED_CAPTION_WORDS && !endsWithPunct) return false;
  if (isWeakLeadIn(buf[0])) return false;
  if (isWeakLeadIn(buf[buf.length - 1])) return false;
  if (buf.some((w) => isOrphanFragment(w))) return false;
  const badCount = buf.filter((w) => isBadSplit(w)).length;
  if (badCount / buf.length > 0.5) return false;
  return true;
}

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
 * Build phrase-grouped dialogue lines from flattened word timestamps.
 * Pure function — no file I/O. Returns ASS Dialogue lines and caption count.
 *
 * Phrase-quality rules:
 * 1. Punctuation-first: prefer breaking at sentence-end .!?; before forcing a maxWords flush.
 *    When at maxWords but punctuation is within 2 words ahead, extend the buffer.
 * 2. phraseIsValid gate: a phrase must be >=PREFERRED_CAPTION_WORDS OR end with punctuation,
 *    must not start/end with a weak lead-in word, and must not be >50% isBadSplit tokens.
 * 3. Segment boundary: discard short carry when it ends with isWeakLeadIn or isBadSplit.
 *
 * @param {Array<{word:string,start:number,end:number,segIdx:number}>} allWords
 * @param {{ maxWords: number }} cm  caption metrics (only maxWords used)
 * @returns {{ dialogueLines: string[], captionCount: number }}
 */
function buildDialogueLines(allWords, cm) {
  const dialogueLines = [];
  let captionCount = 0;
  let buffer = [];
  let bufferStart = 0;
  let bufferEnd = 0;

  const flush = () => {
    if (buffer.length < MIN_CAPTION_WORDS) {
      buffer = [];
      return;
    }
    const text = escapeAss(buffer.join(' ').toUpperCase());
    dialogueLines.push(
      `Dialogue: 0,${formatAssTime(bufferStart)},${formatAssTime(bufferEnd)},Default,,0,0,0,,${text}`,
    );
    captionCount += 1;
    buffer = [];
  };

  // At a segment boundary: flush if buffer is phrase-length; discard carry if it ends
  // with a weak lead-in or bad-split token (don't pollute the next segment's phrase).
  const flushAtBoundary = () => {
    if (buffer.length > 0) {
      const lastWord = buffer[buffer.length - 1];
      if (isWeakLeadIn(lastWord) || isBadSplit(lastWord)) {
        buffer = [];
        return;
      }
    }
    if (buffer.length >= MIN_CAPTION_WORDS) {
      flush();
    }
    // buffer.length < MIN_CAPTION_WORDS and clean tail → carry forward into next segment.
  };

  for (let wi = 0; wi < allWords.length; wi += 1) {
    const w = allWords[wi];
    if (w.end <= HOOK_END_SEC) continue;
    const start = Math.max(w.start, HOOK_END_SEC);

    if (buffer.length > 0 && wi > 0 && allWords[wi - 1].segIdx !== w.segIdx) {
      flushAtBoundary();
    }

    if (!buffer.length) bufferStart = start;
    buffer.push(w.word);
    bufferEnd = w.end;

    const next = allWords[wi + 1];
    const atMax = buffer.length >= cm.maxWords;
    const phraseDone = isPhraseEnd(w.word);

    // Punctuation-first: when at maxWords but not yet at punctuation, look ahead ≤2 words
    // within the same segment. If punctuation is near, extend the buffer to reach it.
    const nearPunctuation = atMax && !phraseDone && (() => {
      for (let k = wi + 1; k <= wi + 2 && k < allWords.length; k++) {
        if (allWords[k].segIdx !== w.segIdx) break;
        if (isPhraseEnd(allWords[k].word)) return true;
      }
      return false;
    })();

    // Prevent splitting immediately before a number/currency token or ALL-CAPS acronym
    // so those tokens don't start the next phrase in isolation.
    const wouldSplitBad = next && next.segIdx === w.segIdx
      && (isBadSplit(next.word) || isWeakLeadIn(next.word));

    if (phraseDone && phraseIsValid(buffer) && !wouldSplitBad) {
      flush();
    } else if (atMax && !nearPunctuation && phraseIsValid(buffer) && !wouldSplitBad) {
      flush();
    } else if (buffer.length >= cm.maxWords + 2) {
      // Runaway buffer — emit only if phrase-valid, otherwise discard orphans.
      if (phraseIsValid(buffer)) flush();
      else buffer = [];
    }
  }

  // Emit remainder only when phrase passes validity gate.
  if (phraseIsValid(buffer)) {
    flush();
  } else {
    buffer = [];
  }

  const filtered = dialogueLines.filter((line) => {
    const text = line.split(',,').pop() || '';
    const words = text.trim().split(/\s+/).filter(Boolean);
    return words.length >= MIN_CAPTION_WORDS;
  });

  return { dialogueLines: filtered, captionCount: filtered.length };
}

/**
 * Build a complete ASS subtitle file from word timestamps.
 * Pure function — no file I/O, no ffmpeg calls. Suitable for unit tests.
 *
 * @param {Map<number, Array<{ word: string, start: number, end: number }>>} wordTimestampCache
 * @param {number[]} [segmentStartTimes]
 * @param {number} [h]
 * @param {number} [w]
 * @returns {string} Full ASS file content
 */
export function buildCaptionAss(wordTimestampCache, segmentStartTimes = [], h = 720, w = 1280) {
  const cm = captionMetrics(h, w);
  const fontSize = cm.currentPx;

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

  // Flatten all segments into a single word list with absolute video timestamps.
  const allWords = [];
  for (const [segIdx, segWords] of wordTimestampCache) {
    const offset = segmentStartTimes[segIdx] ?? 0;
    for (const word of segWords) {
      allWords.push({ word: word.word, start: word.start + offset, end: word.end + offset, segIdx });
    }
  }
  allWords.sort((a, b) => a.start - b.start);

  const { dialogueLines } = buildDialogueLines(allWords, cm);
  return [...header, ...dialogueLines].join('\n');
}

/**
 * Burn word-timed captions (YouTube-style, 4–6 words per phrase).
 * @param {string} videoPath
 * @param {Map<number, Array<{ word: string, start: number, end: number }>>} wordTimestampCache
 * @param {number[]} [segmentStartTimes] - Absolute video start time (seconds) for each segment,
 *   indexed by the Map key. When provided, segment-relative word timestamps are offset to
 *   absolute video timeline positions so captions land on the correct frame.
 *   Without this, all segments overlap at t=0 producing orphan/gibberish captions.
 */
export function overlayKaraokeCaptions(videoPath, wordTimestampCache, segmentStartTimes = []) {
  if (!existsSync(videoPath)) return { ok: false, error: 'video missing' };

  const probe = spawnSync(
    'ffprobe',
    ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=height,width', '-of', 'csv=p=0', videoPath],
    { encoding: 'utf8' },
  );
  const [wStr, hStr] = (probe.stdout || '1280,720').trim().split(',');
  const w = parseInt(wStr, 10) || 1280;
  const h = parseInt(hStr, 10) || 720;

  const assContent = buildCaptionAss(wordTimestampCache, segmentStartTimes, h, w);
  const captionCount = (assContent.match(/^Dialogue:/mg) || []).length;

  if (captionCount === 0) return { ok: false, error: 'no word timestamps' };

  const assPath = join(dirname(videoPath), 'captions-overlay.ass');
  writeFileSync(assPath, assContent);

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
  return { ok: true, captionCount };
}

/**
 * Apply YouTube overlays after ffmpeg assembly mux.
 * @param {string} videoPath
 * @param {object} project
 * @param {Map<number, Array<{ word: string, start: number, end: number }>>} wordTimestampCache
 * @param {number[]} [segmentStartTimes] - Absolute start times per segment (see overlayKaraokeCaptions)
 */
export function applyFfmpegYoutubeOverlays(videoPath, project, wordTimestampCache, segmentStartTimes = []) {
  const results = {};
  if (!isYouTubeExportMode(project)) return results;

  if (wordTimestampCache?.size) {
    const caps = overlayKaraokeCaptions(videoPath, wordTimestampCache, segmentStartTimes);
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
