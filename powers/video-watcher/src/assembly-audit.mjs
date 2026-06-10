/**
 * Strict assembly audit — catches what automated gates miss:
 * off-topic B-roll, repeated clips, caption gibberish, incoherent montage.
 */
import { readFileSync, existsSync } from 'node:fs';
import { extractFramesAtTimes } from '../../../deploy/server-render/aiReviewer.mjs';

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

function imageToDataUri(path) {
  const buf = readFileSync(path);
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
}

const ASSEMBLY_SYSTEM = [
  'You audit how well a YouTube short is ASSEMBLED — not just technical gates.',
  'Score 0–100. 100 = professional editor cut this. Below 50 = embarrassing to upload.',
  'USE THE FULL RANGE. Be harsh. Do not inflate.',
  '',
  'FAIL hard for:',
  '- Identical or near-identical frames repeated in a row (same couple, same room, etc.)',
  '- Off-topic stock (moving boxes, selfies, random lifestyle) when story is crime/news/heist',
  '- Caption text that is gibberish fragments ("THE $120", "WATCHING LIKE IT", single words)',
  '- Tourist/architecture B-roll with BREAKING overlay but no action or faces',
  '- Visual collage that makes no narrative sense (crown + soldier + TikTok phone with no thread)',
  '',
  'Score anchors:',
  '- 90+: every shot on-story, captions readable phrases, no repeats, faces/action in hook',
  '- 70–89: minor off-topic shots or 1 weak stretch',
  '- 50–69: noticeable repeats or off-topic block',
  '- Below 50: repeated wrong footage, gibberish captions, or slideshow energy',
  '',
  'Return ONLY JSON:',
  '{',
  '  "assemblyScore": 0-100,',
  '  "topicRelevance": 0-100,',
  '  "captionCoherence": 0-100,',
  '  "visualCohesion": 0-100,',
  '  "repeatPenalty": 0-100,',
  '  "issues": ["specific issue 1", "issue 2", "issue 3"],',
  '  "bestMoments": ["what works"],',
  '  "verdict": "one honest sentence — would you post this?",',
  '  "uploadReady": false',
  '}',
].join('\n');

async function callVision({ apiKey, frames, extraText }) {
  const content = [{ type: 'text', text: extraText }];
  for (const frame of frames) {
    content.push({ type: 'image_url', image_url: { url: frame } });
  }
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://autotube.video',
      'X-Title': 'AutoTube Assembly Audit',
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_VISION_MODEL || 'openai/gpt-4o-mini',
      messages: [
        { role: 'system', content: ASSEMBLY_SYSTEM },
        { role: 'user', content },
      ],
    }),
  });
  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`OpenRouter ${response.status}: ${errText.slice(0, 200)}`);
  }
  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('Empty assembly audit response');
  return parseJSONResponse(text);
}

/**
 * @param {object} options
 * @param {string} options.videoPath
 * @param {string} [options.contactSheetPath]
 * @param {string[]} [options.framePaths] — hook + sample frames
 * @param {string} options.apiKey
 * @param {string} [options.topic]
 */
export async function runAssemblyAudit(options) {
  const frames = [];
  if (options.contactSheetPath && existsSync(options.contactSheetPath)) {
    frames.push(imageToDataUri(options.contactSheetPath));
  }
  for (const p of options.framePaths || []) {
    if (existsSync(p)) frames.push(imageToDataUri(p));
  }
  if (frames.length === 0 && options.videoPath) {
    const extracted = extractFramesAtTimes(options.videoPath, [0, 1, 2, 3, 8, 15, 22, 30, 38, 45]);
    for (const f of extracted) frames.push(f.dataUri);
  }
  if (!frames.length) throw new Error('No frames for assembly audit');

  const topic = options.topic || 'unknown topic';
  const parsed = await callVision({
    apiKey: options.apiKey,
    frames,
    extraText: [
      `Topic: "${topic}"`,
      'Image 1 is usually a contact sheet grid (timeline left-to-right, top-to-bottom).',
      'Judge ASSEMBLY: do shots match the story? Any repeats? Caption gibberish? Would a human editor ship this?',
      'Be harsh — automated gates already passed but human viewers will scroll.',
    ].join('\n'),
  });

  const assemblyScore = Math.max(0, Math.min(100, Math.round(parsed.assemblyScore ?? 0)));
  return {
    success: true,
    assemblyScore,
    topicRelevance: parsed.topicRelevance,
    captionCoherence: parsed.captionCoherence,
    visualCohesion: parsed.visualCohesion,
    repeatPenalty: parsed.repeatPenalty,
    issues: parsed.issues || [],
    bestMoments: parsed.bestMoments || [],
    verdict: parsed.verdict || '',
    uploadReady: parsed.uploadReady === true && assemblyScore >= 85,
    frameCount: frames.length,
  };
}

/** Final score: retention composite capped by assembly audit (assembly veto). */
export function blendWithAssemblyAudit(youtubeScore, assemblyAudit) {
  if (!assemblyAudit?.success || typeof assemblyAudit.assemblyScore !== 'number') {
    return youtubeScore;
  }
  const assembly = assemblyAudit.assemblyScore;
  // Assembly is a hard cap — bad montage cannot score 90+ regardless of gates
  const capped = Math.min(youtubeScore, assembly + 15);
  const blended = Math.round((youtubeScore * 0.45 + assembly * 0.55) * 10) / 10;
  return Math.min(capped, blended);
}
