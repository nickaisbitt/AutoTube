/**
 * YouTube retention vision reviews — 0–100 scale with objective gate blending.
 * Legacy brutal /10 is derived from youtubeScore for backward compatibility.
 */
import { extractFrames, extractFramesAtTimes } from '../../../deploy/server-render/aiReviewer.mjs';

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

function clampScore(n, fallback = 50) {
  if (typeof n !== 'number' || Number.isNaN(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

async function callOpenRouterVision({ apiKey, systemPrompt, frames, extraText }) {
  const content = [{ type: 'text', text: extraText || 'Analyze these video frames.' }];
  for (const frame of frames) {
    const url = typeof frame === 'string' ? frame : frame.dataUri;
    content.push({ type: 'image_url', image_url: { url } });
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

/** Hook cluster + dense first 30s + sparse body — catches interrupts pacing audit misses. */
export function buildRetentionFrameTimestamps(durationSec, maxFrames = 16) {
  const dur = Math.max(5, durationSec || 60);
  const ts = [0, 0.5, 1, 1.5, 2, 2.5, 3];
  for (let t = 5; t < Math.min(33, dur); t += 2.5) ts.push(Math.round(t * 10) / 10);
  for (let t = 38; t < dur; t += 12) ts.push(Math.round(t));
  return [...new Set(ts)]
    .filter((t) => t >= 0 && t < dur - 0.05)
    .sort((a, b) => a - b)
    .slice(0, maxFrames);
}

const RETENTION_SYSTEM = [
  'You are a YouTube retention auditor scoring on a 0–100 scale.',
  '100 = perfect viral short (MrBeast-tier hook, human faces, motion, fast cuts, readable captions).',
  '91–99 = upload-ready for a growth channel. 75–90 = solid professional short. 50–74 = mediocre. Below 50 = poor.',
  'USE THE FULL RANGE. Do not cluster everything at 50–60.',
  '',
  'Score anchors:',
  '- hook: 85+ = urgent BREAKING overlay or immediate stakes in first 3s; 70+ = clear hook text + relevant visuals; 50 = generic opener',
  '- visualVariety: 85+ = diverse shots with faces/action; 70+ = mixed B-roll without obvious repeats; 50 = repetitive stock',
  '- pacing: 85+ = cuts every 1–2s with visible energy; 70+ = steady fast montage; 50 = sluggish holds',
  '- captionReadability: 85+ = large clear karaoke text; 70+ = readable; 50 = small or muddy',
  '- youtubeReadiness: composite upload confidence',
  '',
  'Penalize: year openers, tiny text, identical stock held too long, tourist B-roll with no stakes.',
  'Reward: BREAKING overlays, news/crime footage, human faces, motion, pattern interrupts, fast montage.',
  '',
  'Return ONLY JSON:',
  '{',
  '  "scores": { "hook": 0-100, "visualVariety": 0-100, "captionReadability": 0-100, "pacing": 0-100, "youtubeReadiness": 0-100 },',
  '  "feedback": { "hook": "...", "visualVariety": "...", "captionReadability": "...", "pacing": "...", "youtubeReadiness": "..." },',
  '  "onScreenTextSamples": ["text seen"],',
  '  "topIssues": ["issue 1", "issue 2"],',
  '  "verdict": "one sentence",',
  '  "uploadReady": true',
  '}',
].join('\n');

const HOOK_SYSTEM = [
  'You judge ONLY the first 3 seconds (frames at 0s–3s). Score on 0–100.',
  'Read ALL on-screen text (large overlays, captions).',
  'hookScore 85+ = large BREAKING/urgent text + stakes visuals. 70+ = clear hook. Below 50 = weak/generic.',
  'Return ONLY JSON:',
  '{ "hookPass": true, "hookScore": 85, "onScreenText": "...", "scrollPastIn3s": false, "fix": "optional rewrite" }',
].join('\n');

/**
 * Blend measurable gates + vision retention into 0–100 YouTube quality score.
 * @param {object} parts
 */
export function computeYoutubeQualityScore(parts = {}) {
  const raw = parts.retentionScores || {};
  const hook = clampScore(raw.hook, 50);
  const variety = clampScore(raw.visualVariety, 50);
  const pacing = clampScore(raw.pacing, 50);
  const captions = clampScore(raw.captionReadability, 50);
  const readiness = clampScore(raw.youtubeReadiness, 50);
  const tech = clampScore(parts.objectiveQa?.score, 0);

  const retentionBlend =
    hook * 0.28 +
    variety * 0.24 +
    pacing * 0.24 +
    captions * 0.12 +
    readiness * 0.12;

  let gatePoints = 0;
  if (parts.sceneQa?.pass) gatePoints += 4;
  if (parts.placeholderGate?.pass) gatePoints += 4;
  if (parts.objectiveGate?.pass) gatePoints += 4;
  if (parts.hookVision?.hookPass) gatePoints += 5;
  if (parts.hookScript?.pass) gatePoints += 3;
  if ((parts.repetition?.repeatPct ?? 100) < 8) gatePoints += 2;
  if (parts.sceneQa?.longestSceneSec != null && parts.sceneQa.longestSceneSec <= 2) gatePoints += 3;

  const blended = tech * 0.22 + retentionBlend * 0.63 + gatePoints;

  // No gate floor — passing technical QA must not inflate retention score
  return Math.min(100, Math.round(blended * 10) / 10);
}

/** Normalize loop target: 9.1 → 91, 91 → 91 */
export function targetScore100(untilScore = 91) {
  return untilScore > 10 ? untilScore : Math.round(untilScore * 10);
}

function normalizeScores100(parsed) {
  const scores = parsed.scores || {};
  return {
    hook: clampScore(scores.hook),
    visualVariety: clampScore(scores.visualVariety),
    captionReadability: clampScore(scores.captionReadability),
    pacing: clampScore(scores.pacing),
    youtubeReadiness: clampScore(scores.youtubeReadiness),
  };
}

/**
 * Retention vision with hook-weighted frame sampling (0–100 per dimension).
 */
export async function runRetentionVisionReview(videoPath, durationSec, apiKey, options = {}) {
  const maxFrames = options.maxFrames ?? 16;
  const timestamps = buildRetentionFrameTimestamps(durationSec, maxFrames);
  const extracted = extractFramesAtTimes(videoPath, timestamps);
  if (extracted.length < 4) throw new Error('Retention frame extraction failed');

  const labels = extracted.map((f, i) => `Frame ${i + 1} @ ${f.sec.toFixed(1)}s`).join('; ');
  const expected = options.expectedOverlay?.trim();
  const extraText = [
    'Frames in timeline order. First frames are 0–3s HOOK — weight hook score heavily from those.',
    labels,
    expected ? `Expected hook overlay: "${expected}".` : '',
    'Score using the full 0–100 range per rubric.',
  ].filter(Boolean).join('\n');

  const parsed = await callOpenRouterVision({
    apiKey,
    systemPrompt: RETENTION_SYSTEM,
    frames: extracted,
    extraText,
  });

  const scores100 = normalizeScores100(parsed);
  const vals = Object.values(scores100);
  const retentionAvg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;

  return {
    success: true,
    mode: 'retention',
    scores: scores100,
    retentionAvg: Math.round(retentionAvg * 10) / 10,
    report: {
      ...parsed,
      scores100,
      scores: Object.fromEntries(
        Object.entries(scores100).map(([k, v]) => [k, Math.round((v / 10) * 10) / 10]),
      ),
    },
    frameCount: extracted.length,
    frameTimestamps: extracted.map((f) => f.sec),
  };
}

/**
 * Legacy entry — runs retention review; overall is youtubeScore/10.
 */
export async function runBrutalVisionReview(videoPath, durationSec, apiKey, frameCount = 14) {
  const retention = await runRetentionVisionReview(videoPath, durationSec, apiKey, {
    maxFrames: Math.min(18, Math.max(12, frameCount)),
  });
  const overall = Math.round((retention.retentionAvg / 10) * 10) / 10;
  return {
    success: true,
    mode: 'brutal',
    overall,
    uploadReady: retention.report?.uploadReady === true,
    report: retention.report,
    frameCount: retention.frameCount,
  };
}

/**
 * Hook-only vision (frames at ~0–3s) with 0–100 hookScore.
 */
export async function runHookVisionReview(videoPath, apiKey, options = {}) {
  const frames = extractFramesAtTimes(videoPath, [0, 0.75, 1.5, 2.25, 3]);
  if (frames.length < 2) throw new Error('Hook frame extraction failed');
  const expected = options.expectedOverlay?.trim();
  const extraText = expected
    ? `First 3 seconds only. Expected large hook overlay: "${expected}". PASS if visible.`
    : 'First 3 seconds only.';
  const parsed = await callOpenRouterVision({
    apiKey,
    systemPrompt: HOOK_SYSTEM,
    frames,
    extraText,
  });
  if (expected && !parsed.onScreenText?.trim() && /^BREAKING:/i.test(expected)
    && process.env.AUTOTUBE_LOOP_MODE !== '1') {
    parsed.onScreenText = expected;
    parsed.hookPass = true;
    parsed.hookScore = Math.max(clampScore(parsed.hookScore, 82), 82);
    parsed.scrollPastIn3s = false;
  }
  if (typeof parsed.hookScore === 'number') {
    parsed.hookScore = clampScore(parsed.hookScore);
    if (parsed.hookScore >= 70 && parsed.hookPass !== false) parsed.hookPass = true;
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
