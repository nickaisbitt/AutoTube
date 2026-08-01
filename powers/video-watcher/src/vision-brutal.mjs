/**
 * Harsh YouTube vision reviews — raw scores (no inflation), hook-specific pass.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { extractFrames } from '../../../deploy/server-render/aiReviewer.mjs';
import {
  applyCappedFloor,
  averageScore,
  hasCriticalQualityIssues,
} from './score-honesty.mjs';

/** Cold-eval default watch model (independent of generation; keep in sync with costTracker). */
export const COLD_EVAL_DEFAULT_WATCH_MODEL = 'google/gemini-2.5-flash';

/** Generation vision/LLM model (what produced the video). */
function generationModel(env) {
  return env.OPENROUTER_VISION_MODEL || env.OPENROUTER_MODEL || 'xiaomi/mimo-v2.5';
}

function isColdEval(env) {
  return env.AUTOTUBE_EVAL_COLD === '1' || env.AUTOTUBE_EVAL_COLD === 'true';
}

/**
 * Watch model: AUTOTUBE_WATCH_MODEL → cold-eval default → generation model.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export function resolveWatchModel(env = process.env) {
  if (env.AUTOTUBE_WATCH_MODEL) return env.AUTOTUBE_WATCH_MODEL;
  const genModel = generationModel(env);
  if (isColdEval(env) && COLD_EVAL_DEFAULT_WATCH_MODEL !== genModel) {
    return COLD_EVAL_DEFAULT_WATCH_MODEL;
  }
  return genModel;
}

/** @param {NodeJS.ProcessEnv} [env] */
export function isIndependentWatchJudge(env = process.env) {
  return resolveWatchModel(env) !== generationModel(env);
}

function parseJSONResponse(raw) {
  let cleaned = raw.trim();
  const fence = /^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/i;
  const m = cleaned.match(fence);
  if (m) cleaned = m[1].trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}') + 1;
  if (start >= 0 && end > start) cleaned = cleaned.substring(start, end);
  return JSON.parse(cleaned);
}

async function callOpenRouterVision({ apiKey, systemPrompt, frames, extraText }) {
  const content = [{ type: 'text', text: extraText || 'Analyze these video frames.' }];
  for (const frame of frames) {
    content.push({ type: 'image_url', image_url: { url: frame } });
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://autotube.video',
      'X-Title': 'AutoTube Video Watcher',
    },
    body: JSON.stringify({
      model: resolveWatchModel(process.env),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content },
      ],
      temperature: 0.15,
      max_tokens: 4096,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`OpenRouter ${response.status}: ${response.statusText} ${errText.slice(0, 200)}`);
  }

  const data = await response.json();
  const message = data?.choices?.[0]?.message;
  const text = messageText(message);
  if (!text) throw new Error('Empty vision response');
  return parseJSONResponse(text);
}

/** Prefer message.content; fall back to reasoning. */
function messageText(message) {
  if (!message || typeof message !== 'object') return '';
  if (typeof message.content === 'string' && message.content.trim()) return message.content;
  if (typeof message.reasoning === 'string' && message.reasoning.trim()) return message.reasoning;
  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => (typeof part === 'string' ? part : part?.text || ''))
      .join('')
      .trim();
  }
  return '';
}

const BRUTAL_SYSTEM = [
  'You are a brutal YouTube retention auditor. Score like MrBeast\'s editor, not a friendly teacher.',
  'Penalize: weak hooks starting with years ("In 2024"), tiny captions, same stock clip repeated,',
  'tech B-roll without human faces, muddy dark footage, no pattern interrupts, generic corporate look.',
  'Do NOT inflate scores. 6 = mediocre. 8+ = genuinely upload-ready for a growth channel.',
  'Frame pack includes 0s,1s,2s,3s (hook) then denser first-30s samples — score hook from those early frames.',
  'No trait has a minimum score: rate only what is actually visible in the frames.',
  'Credit on-screen text, cuts, and pattern interrupts only when you can see them in the samples.',
  '',
  'Return ONLY JSON:',
  '{',
  '  "scores": { "hook": N, "visualVariety": N, "captionReadability": N, "pacing": N, "youtubeReadiness": N },',
  '  "feedback": { "hook": "...", "visualVariety": "...", "captionReadability": "...", "pacing": "...", "youtubeReadiness": "..." },',
  '  "onScreenTextSamples": ["text seen in frames"],',
  '  "topIssues": ["issue 1", "issue 2", "issue 3"],',
  '  "verdict": "one sentence — would you scroll past in 3s?",',
  '  "uploadReady": false',
  '}',
].join('\n');

const HOOK_SYSTEM = [
  'You judge ONLY the first 3 seconds of a YouTube video (frames at 0s, 1s, 2s, 3s).',
  'FAIL if: starts with "In 2024" / "In January 2025", context-setting, tiny text, static single stock shot, no shock/curiosity.',
  'PASS if: immediate stakes, number, danger, or pattern interrupt — and large readable on-screen hook text is visible.',
  'Read any large centered overlay text into onScreenText (do not leave it empty when text is clearly burned in).',
  'Return ONLY JSON:',
  '{ "hookPass": false, "onScreenText": "...", "scrollPastIn3s": true, "fix": "one concrete rewrite for line 1" }',
].join('\n');

function frameBuffer(frame) {
  if (Buffer.isBuffer(frame)) return frame;
  if (typeof frame !== 'string') throw new TypeError('Unsupported hook frame');
  const dataUri = frame.match(/^data:image\/[a-z0-9.+-]+;base64,(.+)$/is);
  return dataUri ? Buffer.from(dataUri[1], 'base64') : readFileSync(frame);
}

function roundedMetric(value) {
  return Math.round(value * 10_000) / 10_000;
}

async function decodeHookFrameWithSharp(frame) {
  const { data, info } = await sharp(frameBuffer(frame), { failOn: 'none' })
    .resize({ width: 320, withoutEnlargement: true })
    .toColourspace('srgb')
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, ...info, decoder: 'sharp' };
}

function parsePpmRgb(buffer) {
  let offset = 0;
  const readToken = () => {
    while (offset < buffer.length) {
      const byte = buffer[offset];
      if (byte === 35) {
        while (offset < buffer.length && buffer[offset] !== 10) offset += 1;
      } else if (byte === 9 || byte === 10 || byte === 13 || byte === 32) {
        offset += 1;
      } else {
        break;
      }
    }
    const start = offset;
    while (offset < buffer.length) {
      const byte = buffer[offset];
      if (byte === 35 || byte === 9 || byte === 10 || byte === 13 || byte === 32) break;
      offset += 1;
    }
    return buffer.toString('ascii', start, offset);
  };

  if (readToken() !== 'P6') throw new Error('ffmpeg returned a non-RGB PPM frame');
  const width = Number(readToken());
  const height = Number(readToken());
  const maxValue = Number(readToken());
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error('ffmpeg returned invalid PPM dimensions');
  }
  if (maxValue !== 255) throw new Error('ffmpeg returned unsupported PPM depth');
  if (buffer[offset] === 13 && buffer[offset + 1] === 10) offset += 2;
  else if ([9, 10, 13, 32].includes(buffer[offset])) offset += 1;
  else throw new Error('ffmpeg returned an invalid PPM header');

  const expectedBytes = width * height * 3;
  if (buffer.length - offset < expectedBytes) throw new Error('ffmpeg returned a truncated PPM frame');
  return {
    data: buffer.subarray(offset, offset + expectedBytes),
    width,
    height,
    channels: 3,
    decoder: 'ffmpeg-ppm',
  };
}

function decodeHookFrameWithFfmpeg(frame) {
  const decoded = spawnSync(
    'ffmpeg',
    [
      '-v',
      'error',
      '-i',
      'pipe:0',
      '-frames:v',
      '1',
      '-vf',
      "scale=w='min(320,iw)':h=-2",
      '-pix_fmt',
      'rgb24',
      '-f',
      'image2pipe',
      '-vcodec',
      'ppm',
      'pipe:1',
    ],
    {
      input: frameBuffer(frame),
      timeout: 20_000,
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  if (decoded.status !== 0 || !Buffer.isBuffer(decoded.stdout) || decoded.stdout.length === 0) {
    const detail = Buffer.isBuffer(decoded.stderr)
      ? decoded.stderr.toString('utf8').trim().slice(-300)
      : '';
    throw new Error(`ffmpeg hook-frame decode failed${detail ? `: ${detail}` : ''}`);
  }
  return parsePpmRgb(decoded.stdout);
}

async function inspectYellowHookFrame(frame, { forceFfmpeg = false } = {}) {
  let decoded;
  if (forceFfmpeg) {
    decoded = decodeHookFrameWithFfmpeg(frame);
  } else {
    try {
      decoded = await decodeHookFrameWithSharp(frame);
    } catch {
      // libvips/sharp can fail transiently under concurrent render/watch load.
      // Decode in an isolated ffmpeg process so local overlay proof still runs.
      decoded = decodeHookFrameWithFfmpeg(frame);
    }
  }
  const { data, width, height, channels, decoder } = decoded;
  if (width < 40 || height < 30 || channels < 3) return null;

  // Hook cards are rendered in the upper-middle safe area. Restricting the scan
  // avoids yellow lower-third captions, logos, and footage near the edges.
  const xStart = Math.floor(width * 0.05);
  const xEnd = Math.ceil(width * 0.95);
  const yStart = Math.floor(height * 0.1);
  const yEnd = Math.ceil(height * 0.65);
  const bandArea = Math.max(1, (xEnd - xStart) * (yEnd - yStart));
  const pixelOffset = (x, y) => (y * width + x) * channels;
  const isYellow = (x, y) => {
    const i = pixelOffset(x, y);
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    return r >= 165 && g >= 135 && b <= 135 && r - b >= 70 && g - b >= 45;
  };
  const isDark = (x, y) => {
    const i = pixelOffset(x, y);
    return Math.max(data[i], data[i + 1], data[i + 2]) <= 100;
  };

  let highContrastYellowPixels = 0;
  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;
  let activeRows = 0;
  let fragmentRuns = 0;

  for (let y = yStart; y < yEnd; y += 1) {
    let rowPixels = 0;
    let inRun = false;
    for (let x = xStart; x < xEnd; x += 1) {
      let darkNeighbor = false;
      if (isYellow(x, y)) {
        for (let dy = -2; dy <= 2 && !darkNeighbor; dy += 1) {
          for (let dx = -2; dx <= 2; dx += 1) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height && isDark(nx, ny)) {
              darkNeighbor = true;
              break;
            }
          }
        }
      }

      if (darkNeighbor) {
        highContrastYellowPixels += 1;
        rowPixels += 1;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        if (!inRun) fragmentRuns += 1;
        inRun = true;
      } else {
        inRun = false;
      }
    }
    if (rowPixels >= 4) activeRows += 1;
  }

  const coverage = highContrastYellowPixels / bandArea;
  const horizontalSpan = maxX >= minX ? (maxX - minX + 1) / width : 0;
  const verticalSpan = maxY >= minY ? (maxY - minY + 1) / height : 0;
  // Text produces many separated glyph runs; this rejects solid yellow objects
  // even when they happen to sit beside a dark background.
  const fragmentedLikeText =
    fragmentRuns >= Math.max(12, activeRows * 2);
  const detected =
    coverage >= 0.004
    && horizontalSpan >= 0.22
    && verticalSpan >= 0.035
    && activeRows >= 4
    && fragmentedLikeText;

  return {
    detected,
    decoder,
    coverage: roundedMetric(coverage),
    horizontalSpan: roundedMetric(horizontalSpan),
    verticalSpan: roundedMetric(verticalSpan),
    activeRows,
    fragmentRuns,
  };
}

/**
 * Cheap local proof that one or more hook frames contain a large yellow,
 * dark-bordered overlay in the hook safe area. This detects pixels, not words.
 * @param {Array<string | Buffer>} frames
 * @param {{ forceFfmpeg?: boolean }} [options]
 */
export async function detectYellowHookOverlay(frames = [], options = {}) {
  const measurements = [];
  let failedFrames = 0;
  for (const frame of frames.slice(0, 4)) {
    try {
      const measurement = await inspectYellowHookFrame(frame, options);
      if (measurement) measurements.push(measurement);
      else failedFrames += 1;
    } catch {
      // A corrupt frame should not turn an uncertain hook into a pass.
      failedFrames += 1;
    }
  }
  const matches = measurements.filter((measurement) => measurement.detected);
  const strongest = measurements.reduce(
    (best, measurement) =>
      !best || measurement.coverage > best.coverage ? measurement : best,
    null,
  );
  return {
    detected: matches.length > 0,
    inspectedFrames: measurements.length,
    matchingFrames: matches.length,
    failedFrames,
    fallbackFrames: measurements.filter((measurement) => measurement.decoder === 'ffmpeg-ppm').length,
    strongest,
  };
}

/**
 * Apply already-inspected local pixel evidence to a hook review.
 */
export function applyLocalHookOverlayEvidence(hookVision, overlayText, evidence) {
  const current = hookVision && typeof hookVision === 'object' ? hookVision : {};
  const seenText =
    typeof current.onScreenText === 'string' ? current.onScreenText.trim() : '';
  const claim =
    typeof overlayText === 'string' ? overlayText.replace(/\s+/g, ' ').trim().slice(0, 140) : '';
  const hasUsableClaim = claim.length >= 8 && claim.split(/\s+/).length >= 2;
  const normalizedEvidence = {
    detected: evidence?.detected === true,
    inspectedFrames: Number.isFinite(evidence?.inspectedFrames) ? evidence.inspectedFrames : 0,
    matchingFrames: Number.isFinite(evidence?.matchingFrames) ? evidence.matchingFrames : 0,
    failedFrames: Number.isFinite(evidence?.failedFrames) ? evidence.failedFrames : 0,
    fallbackFrames: Number.isFinite(evidence?.fallbackFrames) ? evidence.fallbackFrames : 0,
    strongest: evidence?.strongest || null,
  };
  const ocrWasEmpty = seenText.length < 8;
  const applied = normalizedEvidence.detected && ocrWasEmpty && hasUsableClaim;
  if (hasUsableClaim && !normalizedEvidence.detected) {
    console.warn(
      `[video-watcher] local hook overlay not detected for pipeline claim (${normalizedEvidence.inspectedFrames} inspected, ${normalizedEvidence.failedFrames} failed)`,
    );
  }
  return {
    ...current,
    ...(applied ? { onScreenText: claim, hookPass: true } : {}),
    localOverlayFallback: {
      method: 'yellow-dark-pixel-overlay',
      applied,
      ...normalizedEvidence,
    },
  };
}

/**
 * Recover an OCR false-empty only when pipeline text and local pixel evidence
 * agree that a large hook overlay exists. A non-empty qualitative vision FAIL
 * remains a fail; the detector cannot judge whether correctly read copy is good.
 */
export async function applyLocalHookOverlayFallback(hookVision, frames, overlayText) {
  const evidence = await detectYellowHookOverlay(frames);
  return applyLocalHookOverlayEvidence(hookVision, overlayText, evidence);
}

/**
 * @param {string} videoPath
 * @param {number} durationSec
 * @param {string} apiKey
 * @param {number} [frameCount]
 * @param {{ hookVision?: { hookPass?: boolean, onScreenText?: string } }} [options]
 */
export async function runBrutalVisionReview(videoPath, durationSec, apiKey, frameCount = 14, options = {}) {
  const frames = extractFrames(videoPath, durationSec, frameCount, { retention: true });
  if (frames.length === 0) throw new Error('Frame extraction failed');
  const parsed = await callOpenRouterVision({
    apiKey,
    systemPrompt: BRUTAL_SYSTEM,
    frames,
    extraText:
      'Retention sample frames in timeline order (includes 0–3s hook). Be harsh but score hook from early frames.',
  });

  const scores = { ...(parsed.scores || {}) };
  for (const key of ['hook', 'visualVariety', 'captionReadability', 'pacing', 'youtubeReadiness']) {
    const v = scores[key];
    if (typeof v === 'boolean') scores[key] = v ? 7 : 5;
    else if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) scores[key] = Number(v);
    else if (typeof v !== 'number' || !Number.isFinite(v)) delete scores[key];
    else scores[key] = Math.max(0, Math.min(10, v));
  }
  parsed.scores = scores;
  const modelRawScores = { ...scores };
  const modelRawOverall = averageScore(modelRawScores);
  const overlay = (options.hookVision?.onScreenText || '').trim();
  const hookVisionOk =
    options.hookVision?.hookPass === true || overlay.length >= 8;
  // Hook floor from readable yellow burn-in (≤ +1 over raw).
  if (hookVisionOk && typeof scores.hook === 'number') {
    const feedback = { ...(parsed.feedback || {}) };
    applyCappedFloor(
      scores,
      feedback,
      'hook',
      8,
      `on-screen hook${overlay ? ` (“${overlay.slice(0, 40)}”)` : ''}`,
    );
    parsed.feedback = feedback;
    parsed.scores = scores;
  }

  const overall = averageScore(scores) ?? 0;
  const critical = hasCriticalQualityIssues(parsed.topIssues, parsed.verdict);

  return {
    success: true,
    mode: 'brutal',
    overall,
    rawOverall: modelRawOverall ?? overall,
    flooredOverall: overall,
    rawScores: modelRawScores,
    hasCriticalIssues: critical,
    uploadReady: (modelRawOverall ?? overall) >= 7 && !critical,
    report: parsed,
    frameCount: frames.length,
    retentionSampling: true,
  };
}

/**
 * Hook-only vision (frames at ~0–3s).
 */
export async function runHookVisionReview(videoPath, apiKey, options = {}) {
  // Hook frames at 0–3s (retention sampling).
  const frames = extractFrames(videoPath, 4, 4, { retention: true });
  if (frames.length < 2) throw new Error('Hook frame extraction failed');
  const parsed = await callOpenRouterVision({
    apiKey,
    systemPrompt: HOOK_SYSTEM,
    frames: frames.slice(0, 4),
    extraText: 'First 3 seconds only (0s–3s).',
  });
  const reconciled = await applyLocalHookOverlayFallback(
    parsed,
    frames.slice(0, 4),
    options.overlayText,
  );
  return { success: true, ...reconciled };
}

export function auditHookFromScript(scriptText) {
  const snippet = (scriptText || '').trim().slice(0, 200);
  const firstSentence = snippet.split(/(?<=[.!?])\s+/)[0] || snippet;
  const first = firstSentence.trim();
  const yearOpen = /^in\s+(?:late\s+|early\s+|mid-?)?(19|20)\d{2}/i.test(first);
  const monthYearOpen =
    /^in\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+(19|20)\d{2}/i.test(
      first,
    );
  const dateOpen = /^(on\s+(?:\w+\s+)?\d{1,2},?\s+\d{4}|as\s+of\s+\w+\s+\d{4})/i.test(first);
  const weakOpen = /^(in this video|today we|let me explain|welcome)/i.test(first);
  const bad = yearOpen || monthYearOpen || dateOpen || weakOpen;
  return {
    pass: !bad,
    firstSentence: firstSentence.slice(0, 140),
    issue: yearOpen || monthYearOpen || dateOpen
      ? 'Script opens with a date/year ("In January 2025…") — weak for YouTube hook'
      : weakOpen
        ? 'Script opens with filler, not stakes'
        : null,
  };
}
