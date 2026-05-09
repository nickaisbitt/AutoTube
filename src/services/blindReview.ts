import type { QualityReport, VideoProject } from '../types';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import { logger } from './logger';

// ── Frame Extraction ──

/**
 * Computes evenly-spaced timestamps for frame extraction.
 * Returns between 10 and 15 timestamps based on video duration.
 *
 * For videos < 30s: 10 frames
 * For videos 30s–120s: 12 frames
 * For videos > 120s: 15 frames
 *
 * If targetFrames is provided, it overrides the automatic selection
 * (clamped to [1, 30] for safety).
 *
 * Timestamps are spaced so they avoid the very start and end:
 *   interval = duration / (N + 1), timestamps at interval, 2*interval, ..., N*interval
 */
export function computeFrameTimestamps(
  durationSec: number,
  targetFrames?: number,
): number[] {
  if (durationSec <= 0) return [];

  let frameCount: number;
  if (targetFrames !== undefined) {
    frameCount = Math.max(1, Math.min(30, Math.round(targetFrames)));
  } else if (durationSec < 30) {
    frameCount = 6;
  } else if (durationSec <= 120) {
    frameCount = 10;
  } else {
    frameCount = 12;
  }

  const interval = durationSec / (frameCount + 1);
  const timestamps: number[] = [];
  for (let i = 1; i <= frameCount; i++) {
    timestamps.push(interval * i);
  }
  return timestamps;
}

/**
 * Extracts key frames from a video Blob using <video> + <canvas>.
 * Each frame is encoded as a base64 JPEG data URL at max 1280×720
 * (maintaining aspect ratio).
 *
 * @throws Error if the blob cannot be decoded or extraction fails
 * @throws DOMException (AbortError) if signal is aborted
 */
export async function extractKeyFrames(
  videoBlob: Blob,
  options?: { signal?: AbortSignal; maxWidth?: number; maxHeight?: number },
): Promise<string[]> {
  const signal = options?.signal;
  const maxWidth = options?.maxWidth ?? 1280;
  const maxHeight = options?.maxHeight ?? 720;

  // Check for early abort
  if (signal?.aborted) {
    throw new DOMException('Frame extraction aborted', 'AbortError');
  }

  const blobUrl = URL.createObjectURL(videoBlob);

  try {
    // Create video element and load metadata
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = blobUrl;

    const duration = await new Promise<number>((resolve, reject) => {
      const onAbort = () => {
        video.removeAttribute('src');
        video.load();
        reject(new DOMException('Frame extraction aborted', 'AbortError'));
      };

      if (signal?.aborted) {
        onAbort();
        return;
      }
      signal?.addEventListener('abort', onAbort, { once: true });

      video.addEventListener(
        'loadedmetadata',
        () => {
          signal?.removeEventListener('abort', onAbort);
          if (!isFinite(video.duration) || video.duration <= 0) {
            reject(new Error('Video blob could not be decoded: invalid duration'));
            return;
          }
          resolve(video.duration);
        },
        { once: true },
      );

      video.addEventListener(
        'error',
        () => {
          signal?.removeEventListener('abort', onAbort);
          const code = video.error?.code;
          const msg = video.error?.message ?? 'unknown error';
          reject(
            new Error(
              `Video blob could not be decoded: MediaError code=${code}, ${msg}`,
            ),
          );
        },
        { once: true },
      );
    });

    const timestamps = computeFrameTimestamps(duration);

    // Create canvas for frame capture
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to create canvas 2D context for frame extraction');
    }

    // Compute canvas dimensions maintaining aspect ratio
    const videoWidth = video.videoWidth || 1280;
    const videoHeight = video.videoHeight || 720;
    const scale = Math.min(maxWidth / videoWidth, maxHeight / videoHeight, 1);
    canvas.width = Math.round(videoWidth * scale);
    canvas.height = Math.round(videoHeight * scale);

    const frames: string[] = [];

    for (const timestamp of timestamps) {
      // Check abort before each seek
      if (signal?.aborted) {
        throw new DOMException('Frame extraction aborted', 'AbortError');
      }

      // Seek to timestamp
      await new Promise<void>((resolve, reject) => {
        const onAbort = () => {
          reject(new DOMException('Frame extraction aborted', 'AbortError'));
        };

        if (signal?.aborted) {
          onAbort();
          return;
        }
        signal?.addEventListener('abort', onAbort, { once: true });

        video.addEventListener(
          'seeked',
          () => {
            signal?.removeEventListener('abort', onAbort);
            resolve();
          },
          { once: true },
        );

        video.addEventListener(
          'error',
          () => {
            signal?.removeEventListener('abort', onAbort);
            reject(
              new Error(
                `Failed to seek to timestamp ${timestamp.toFixed(2)}s`,
              ),
            );
          },
          { once: true },
        );

        video.currentTime = timestamp;
      });

      // Draw frame to canvas and capture
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      frames.push(dataUrl);
    }

    return frames;
  } catch (err) {
    // Re-throw AbortError as-is
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err;
    }
    // Wrap unexpected errors with descriptive message
    if (err instanceof Error) {
      throw err;
    }
    throw new Error(`Frame extraction failed: ${String(err)}`);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

// ── Prompt Construction ──

/**
 * Builds the system and user prompts for the blind review.
 * The prompt deliberately excludes topic, style, and audience —
 * the model evaluates purely based on the frames, script, and thumbnail.
 */
export function buildBlindReviewPrompt(
  frames: string[],
  scriptText: string,
  thumbnailDataUrl: string | null,
): { system: string; user: Array<{ type: string; [key: string]: unknown }> } {
  const system = [
    'You are a ruthlessly honest YouTube video quality reviewer with expertise in retention, click-through optimization, and production quality.',
    'You will be shown key frames extracted from a video, the full narration script, and optionally a thumbnail.',
    'Evaluate as if you are a real viewer encountering this for the first time. Be specific and critical.',
    '',
    'EVALUATION CRITERIA:',
    '',
    'Visual Quality (1-10):',
    '- Are images high-resolution, relevant, and free of watermarks/logos?',
    '- Is there visual variety (not the same stock image repeated)?',
    '- Do visuals match what the narration is saying?',
    '- Are there concrete consequence visuals (not just generic tech imagery)?',
    '- Is the composition clean with clear focal points?',
    '',
    'Pacing (1-10):',
    '- Does the first 5 seconds grab attention with concrete stakes?',
    '- Are there pattern interrupts every 20-30 seconds?',
    '- Is there dead air or monotonous stretches?',
    '- Do cuts happen on meaning shifts, not just time intervals?',
    '- Does pacing build in waves (impact → explanation → escalation)?',
    '',
    'Narrative Clarity (1-10):',
    '- Can a non-technical adult follow the logic without specialist knowledge?',
    '- Does it open with personal stakes before scaling to bigger issues?',
    '- Is there a clear problem-to-solution arc?',
    '- Are statistics sourced or framed carefully?',
    '- Does the ending give agency (not just fear)?',
    '',
    'Thumbnail Effectiveness (1-10):',
    '- Does it communicate the topic in under 1 second?',
    '- Is text readable on mobile at small size (2-5 words max)?',
    '- Is there one dominant subject with clear hierarchy?',
    '- Does it create curiosity or urgency?',
    '- Would you click this over competing videos?',
    '',
    'Overall Production Value (1-10):',
    '- Does it feel professional and intentional?',
    '- Is there brand consistency (fonts, colors, transitions)?',
    '- Would this compete with top YouTube channels in this niche?',
    '- Does the video work with sound low (visual storytelling)?',
    '- Is there a reason to watch to the end?',
    '',
    'SCORING GUIDE:',
    '- 1-3: Unwatchable, major issues, would click away immediately',
    '- 4-5: Below average, notable weaknesses that hurt retention',
    '- 6-7: Decent but forgettable, won\'t go viral',
    '- 8-9: Strong, competitive with established channels',
    '- 10: Exceptional, would outperform most content in the niche',
    '',
    'BE BRUTALLY HONEST. A score of 5 means mediocre. Most AI-generated videos deserve 4-6 unless they are genuinely good.',
    'Give specific examples from the frames/script to justify each score.',
    '',
    'Return ONLY a JSON object:',
    '{',
    '  "scores": { "visualQuality": N, "pacing": N, "narrativeClarity": N, "thumbnailEffectiveness": N, "overallProductionValue": N },',
    '  "feedback": { "visualQuality": "...", "pacing": "...", "narrativeClarity": "...", "thumbnailEffectiveness": "...", "overallProductionValue": "..." },',
    '  "summary": "2-4 sentence overall verdict with the single biggest improvement that would most impact performance"',
    '}',
  ].join('\n');

  const user: Array<{ type: string; [key: string]: unknown }> = [];

  // Add a text label before the frames
  user.push({ type: 'text', text: 'Here are key frames extracted from the video:' });

  // Add each frame as an image_url content part
  for (const frame of frames) {
    user.push({ type: 'image_url', image_url: { url: frame } });
  }

  // Add the script text
  user.push({ type: 'text', text: 'Script:\n' + scriptText });

  // Add optional thumbnail
  if (thumbnailDataUrl) {
    user.push({ type: 'text', text: 'Thumbnail image:' });
    user.push({ type: 'image_url', image_url: { url: thumbnailDataUrl } });
  }

  return { system, user };
}

// ── API Call ──

const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const BLIND_REVIEW_MODEL = 'google/gemini-2.0-flash-001';
const BLIND_REVIEW_TIMEOUT_MS = 60_000;
const BLIND_REVIEW_MAX_RETRIES = 2;

/**
 * Sends frames + script + thumbnail to Reka Edge via OpenRouter.
 * Uses fetchWithTimeout with 60s timeout and 2 retries.
 * Returns the raw response content string, or null on failure.
 * If signal is aborted, re-throws the AbortError.
 */
export async function callBlindReviewAPI(
  frames: string[],
  scriptText: string,
  thumbnailDataUrl: string | null,
  apiKey: string,
  options?: { signal?: AbortSignal },
): Promise<string | null> {
  const signal = options?.signal;

  // Re-throw if already aborted
  if (signal?.aborted) {
    throw signal.reason ?? new DOMException('The operation was aborted.', 'AbortError');
  }

  const { system, user } = buildBlindReviewPrompt(frames, scriptText, thumbnailDataUrl);

  const body = JSON.stringify({
    model: BLIND_REVIEW_MODEL,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });

  try {
    const response = await fetchWithTimeout(
      OPENROUTER_ENDPOINT,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://autotube.video',
          'X-Title': 'AutoTube Blind Reviewer',
        },
        body,
      },
      {
        timeoutMs: BLIND_REVIEW_TIMEOUT_MS,
        maxRetries: BLIND_REVIEW_MAX_RETRIES,
        signal,
      },
    );

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      logger.warn('BlindReview', `API call failed (Status: ${response.status})`, errText);
      return null;
    }

    const data = await response.json();
    const content: unknown = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      logger.warn('BlindReview', 'API returned empty content in response');
      return null;
    }

    return content;
  } catch (err) {
    // Re-throw AbortError so callers can handle cancellation
    if (err instanceof Error && err.name === 'AbortError') {
      throw err;
    }
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err;
    }
    logger.warn('BlindReview', 'API call failed', err);
    return null;
  }
}

// ── Parsing & Validation (Pure Utility Functions) ──

/**
 * Clamps a value to an integer in [1, 10].
 * Non-numeric values (NaN, undefined, null, strings) default to 5.
 */
export function clampScore(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 5;
  }
  const rounded = Math.round(value);
  return Math.max(1, Math.min(10, rounded));
}

/**
 * Derives a letter grade from the arithmetic mean of an array of scores.
 * A (≥9), B (≥7), C (≥5), D (≥3), F (<3)
 */
export function deriveLetterGrade(scores: number[]): string {
  if (scores.length === 0) return 'F';
  const mean = scores.reduce((sum, s) => sum + s, 0) / scores.length;
  if (mean >= 9) return 'A';
  if (mean >= 7) return 'B';
  if (mean >= 5) return 'C';
  if (mean >= 3) return 'D';
  return 'F';
}

/**
 * Returns the color category for a numeric score.
 * 1–3 → 'red', 4–6 → 'amber', 7–10 → 'green'
 */
export function scoreColor(score: number): 'red' | 'amber' | 'green' {
  if (score <= 3) return 'red';
  if (score <= 6) return 'amber';
  return 'green';
}

/**
 * Returns the color category for a letter grade.
 * A/B → 'green', C → 'amber', D/F → 'red'
 */
export function gradeColor(grade: string): 'red' | 'amber' | 'green' {
  if (grade === 'A' || grade === 'B') return 'green';
  if (grade === 'C') return 'amber';
  return 'red';
}

/**
 * Truncates a string to the given max length, appending "…" if truncated.
 * If str.length <= maxLength, returns str unchanged.
 */
export function truncateString(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 1) + '…';
}

/**
 * Strips markdown code fences from a string and parses as JSON.
 * Handles ```json ... ```, ``` ... ```, and plain JSON.
 */
export function parseJSONResponse(raw: string): unknown {
  let cleaned = raw.trim();
  // Strip markdown code fences: ```json ... ``` or ``` ... ```
  const fenceRegex = /^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/;
  const match = cleaned.match(fenceRegex);
  if (match) {
    cleaned = match[1].trim();
  }
  return JSON.parse(cleaned);
}

// ── Report Parsing ──

const SCORE_CATEGORIES = [
  'visualQuality',
  'pacing',
  'narrativeClarity',
  'thumbnailEffectiveness',
  'overallProductionValue',
] as const;

const DEFAULT_SCORE = 5;
const DEFAULT_FEEDBACK = 'No feedback provided.';
const FEEDBACK_MAX_LENGTH = 500;
const SUMMARY_MAX_LENGTH = 1000;

/**
 * Parses raw LLM JSON output into a validated QualityReport.
 * - If raw is a string, parses it using parseJSONResponse (handles markdown fences)
 * - Clamps scores to integers in [1, 10]
 * - Fills missing scores with 5, missing text with "No feedback provided."
 * - Truncates feedback to 500 chars, summary to 1000 chars
 * - Derives letter grade from average scores
 * - Sets reviewedAt to current ISO timestamp
 *
 * Robust — handles any input without throwing. If the input is completely
 * invalid (not an object, null, etc.), returns a report with all defaults.
 */
export function parseQualityReport(raw: unknown): QualityReport {
  let parsed: Record<string, unknown> = {};

  try {
    if (typeof raw === 'string') {
      const result = parseJSONResponse(raw);
      if (result && typeof result === 'object' && !Array.isArray(result)) {
        parsed = result as Record<string, unknown>;
      }
    } else if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      parsed = raw as Record<string, unknown>;
    }
  } catch (err) {
    console.warn('Blind review analysis parse failed:', err);
    // If parsing fails, use empty object — all defaults will apply
  }

  const rawScores = (parsed.scores && typeof parsed.scores === 'object' && !Array.isArray(parsed.scores))
    ? (parsed.scores as Record<string, unknown>)
    : {};

  const rawFeedback = (parsed.feedback && typeof parsed.feedback === 'object' && !Array.isArray(parsed.feedback))
    ? (parsed.feedback as Record<string, unknown>)
    : {};

  // Extract and clamp scores, defaulting missing ones to 5
  const scores = {} as QualityReport['scores'];
  for (const category of SCORE_CATEGORIES) {
    scores[category] = category in rawScores
      ? clampScore(rawScores[category])
      : DEFAULT_SCORE;
  }

  // Extract feedback, defaulting missing/empty to "No feedback provided."
  const feedback = {} as QualityReport['feedback'];
  for (const category of SCORE_CATEGORIES) {
    const rawValue = rawFeedback[category];
    if (typeof rawValue === 'string' && rawValue.trim().length > 0) {
      feedback[category] = truncateString(rawValue, FEEDBACK_MAX_LENGTH);
    } else {
      feedback[category] = DEFAULT_FEEDBACK;
    }
  }

  // Extract summary
  let summary: string;
  const rawSummary = parsed.summary;
  if (typeof rawSummary === 'string' && rawSummary.trim().length > 0) {
    summary = truncateString(rawSummary, SUMMARY_MAX_LENGTH);
  } else {
    summary = DEFAULT_FEEDBACK;
  }

  // Derive letter grade from the 5 scores
  const scoreValues = SCORE_CATEGORIES.map((c) => scores[c]);
  const letterGrade = deriveLetterGrade(scoreValues);

  return {
    scores,
    feedback,
    letterGrade,
    summary,
    reviewedAt: new Date().toISOString(),
  };
}

// ── Orchestration ──

/**
 * Runs the full blind review pipeline:
 * 1. Check for API key
 * 2. Extract key frames from the rendered video blob
 * 3. Build script text from project segments
 * 4. Call Reka Edge via OpenRouter
 * 5. Parse and validate the response
 *
 * Returns QualityReport on success, null on failure.
 * Non-throwing — all errors are caught and logged (except AbortError,
 * which is re-thrown for cancellation support).
 */
export async function runBlindReview(
  project: VideoProject,
  apiKey: string,
  options?: {
    signal?: AbortSignal;
    onProgress?: (pct: number, message: string) => void;
  },
): Promise<QualityReport | null> {
  const { signal, onProgress } = options ?? {};

  try {
    // 1. Check for API key — return null immediately if missing
    if (!apiKey) {
      return null;
    }

    // 2. Report progress: extracting frames
    onProgress?.(0, 'Extracting frames…');

    // 3. Get the video blob from project.thumbnail (a blob URL string)
    if (!project.thumbnail) {
      return null;
    }
    const response = await fetch(project.thumbnail);
    const videoBlob = await response.blob();

    // 4. Extract key frames from the video blob
    const frames = await extractKeyFrames(videoBlob, { signal });

    // 5. Report progress: reviewing video
    onProgress?.(40, 'Reviewing video…');

    // 6. Build script text from project.script segments
    const scriptText = project.script.map((s) => s.narration).join('\n\n');

    // 7. Call the blind review API (pass null for thumbnail since frames are the primary input)
    const rawResponse = await callBlindReviewAPI(frames, scriptText, null, apiKey, { signal });

    // 8. If API returns null, return null
    if (rawResponse === null) {
      return null;
    }

    // 9. Report progress: parsing results
    onProgress?.(80, 'Parsing results…');

    // 10. Parse the response into a validated QualityReport
    const report = parseQualityReport(rawResponse);

    // 11. Report progress: complete
    onProgress?.(100, 'Review complete');

    return report;
  } catch (err) {
    // Re-throw AbortError for cancellation support
    if (err instanceof Error && err.name === 'AbortError') {
      throw err;
    }
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err;
    }

    // All other errors: log and return null (non-throwing)
    logger.warn('BlindReview', 'Blind review failed', err);
    return null;
  }
}
