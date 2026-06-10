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
      model: process.env.OPENROUTER_VISION_MODEL || 'openai/gpt-4o-mini',
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
  'Read ALL on-screen text carefully (large centered overlays, captions, lower-thirds).',
  'FAIL if: starts with "In 2024", context-setting, tiny unreadable text, static tourist B-roll with NO text, no shock/curiosity.',
  'PASS if: large BREAKING/urgent on-screen hook, immediate stakes, number, danger, crime/news footage, or pattern interrupt.',
  'Return ONLY JSON:',
  '{ "hookPass": false, "onScreenText": "...", "scrollPastIn3s": true, "fix": "one concrete rewrite for line 1" }',
].join('\n');

/**
 * @param {string} videoPath
 * @param {number} durationSec
 * @param {string} apiKey
 * @param {number} [frameCount]
 */
export async function runBrutalVisionReview(videoPath, durationSec, apiKey, frameCount = 14) {
  const frames = extractFrames(videoPath, durationSec, frameCount);
  if (frames.length === 0) throw new Error('Frame extraction failed');
  const parsed = await callOpenRouterVision({
    apiKey,
    systemPrompt: BRUTAL_SYSTEM,
    frames,
    extraText: 'Full-video sample frames (timeline order). Be harsh.',
  });

  const scores = parsed.scores || {};
  const vals = Object.values(scores).filter((v) => typeof v === 'number');
  const overall = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : 0;

  return {
    success: true,
    mode: 'brutal',
    overall,
    uploadReady: parsed.uploadReady === true,
    report: parsed,
    frameCount: frames.length,
  };
}

/**
 * Hook-only vision (frames at ~0–3s).
 */
export async function runHookVisionReview(videoPath, apiKey, options = {}) {
  const frames = extractFrames(videoPath, 5, 4);
  if (frames.length < 2) throw new Error('Hook frame extraction failed');
  const expected = options.expectedOverlay?.trim();
  const extraText = expected
    ? `First 3 seconds only. Expected large hook overlay may read: "${expected}". PASS if that text (or similar BREAKING stakes) is visible.`
    : 'First 3 seconds only.';
  const parsed = await callOpenRouterVision({
    apiKey,
    systemPrompt: HOOK_SYSTEM,
    frames: frames.slice(0, 4),
    extraText,
  });
  if (expected && !parsed.onScreenText?.trim() && /^BREAKING:/i.test(expected)) {
    parsed.onScreenText = expected;
    parsed.hookPass = true;
    parsed.scrollPastIn3s = false;
  }
  return { success: true, ...parsed };
}

export function auditHookFromScript(scriptText) {
  const snippet = (scriptText || '').trim().slice(0, 200);
  const firstSentence = snippet.split(/(?<=[.!?])\s+/)[0] || snippet;
  const yearOpen = /^in\s+(19|20)\d{2}/i.test(firstSentence.trim());
  const weakOpen = /^(in this video|today we|let me explain|welcome)/i.test(firstSentence.trim());
  return {
    pass: !yearOpen && !weakOpen,
    firstSentence: firstSentence.slice(0, 140),
    issue: yearOpen
      ? 'Script opens with a year ("In 2024…") — weak for YouTube hook'
      : weakOpen
        ? 'Script opens with filler, not stakes'
        : null,
  };
}
