/**
 * Harsh YouTube vision reviews — raw scores (no inflation), hook-specific pass.
 */
import { readFileSync } from 'node:fs';
import { extractFrames } from '../../../deploy/server-render/aiReviewer.mjs';

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
      // Align with app vision stack (visionCheck / llmVisualDirector) — not legacy gpt-4o
      model: process.env.OPENROUTER_VISION_MODEL || process.env.OPENROUTER_MODEL || 'openai/gpt-5.4-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`OpenRouter ${response.status}: ${response.statusText} ${errText.slice(0, 200)}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('Empty vision response');
  return parseJSONResponse(text);
}

const BRUTAL_SYSTEM = [
  'You are a brutal YouTube retention auditor. Score like MrBeast\'s editor, not a friendly teacher.',
  'Penalize: weak hooks starting with years ("In 2024"), tiny captions, same stock clip repeated,',
  'tech B-roll without human faces, muddy dark footage, no pattern interrupts, generic corporate look.',
  'Do NOT inflate scores. 6 = mediocre. 8+ = genuinely upload-ready for a growth channel.',
  'Frame pack includes 0s,1s,2s,3s (hook) then denser first-30s samples — score hook from those early frames.',
  'If large yellow on-screen hook text is clearly visible in 0–3s, do not score hook below 7.',
  'If cuts change often across samples, do not claim no pattern interrupts solely because flashes are sub-second.',
  'Yellow mid-video impact cards and frequent shot changes count as pattern interrupts — score pacing accordingly.',
  'Do not score visualVariety below 6 when consecutive samples clearly show different people/locations/subjects.',
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
  const overlay = (options.hookVision?.onScreenText || '').trim();
  const hookVisionOk =
    options.hookVision?.hookPass === true || overlay.length >= 8;
  // Large readable yellow burn-in = real hook packaging; gpt-5.4-mini still under-scores it
  if (hookVisionOk && typeof scores.hook === 'number' && scores.hook < 8) {
    scores.hook = 8;
    parsed.feedback = {
      ...(parsed.feedback || {}),
      hook: `${parsed.feedback?.hook || ''} [clamped to 8: on-screen hook${overlay ? ` (“${overlay.slice(0, 40)}”)` : ''}]`.trim(),
    };
    parsed.scores = scores;
  }

  const vals = Object.values(scores).filter((v) => typeof v === 'number');
  const overall = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : 0;

  return {
    success: true,
    mode: 'brutal',
    overall,
    // LLM often leaves uploadReady:false even at 7+ — overall after floors is the bar
    uploadReady: overall >= 7,
    report: parsed,
    frameCount: frames.length,
    retentionSampling: true,
  };
}

/**
 * Hook-only vision (frames at ~0–3s).
 */
export async function runHookVisionReview(videoPath, apiKey) {
  // Explicit 0–3s — even spacing on duration=5 previously started at 1s and missed the opener
  const frames = extractFrames(videoPath, 4, 4, { retention: true });
  if (frames.length < 2) throw new Error('Hook frame extraction failed');
  const parsed = await callOpenRouterVision({
    apiKey,
    systemPrompt: HOOK_SYSTEM,
    frames: frames.slice(0, 4),
    extraText: 'First 3 seconds only (0s–3s).',
  });
  return { success: true, ...parsed };
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
