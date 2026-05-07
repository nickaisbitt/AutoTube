// ============================================================================
// Quality Scorer — Multi-Factor Image Quality Assessment via Reka Edge
// ============================================================================

import type { MediaCandidate } from './media';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import { repairTruncatedJson } from '../utils/jsonRepair';
import { logger } from './logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QualityFactors {
  sharpness: number;    // 0-10
  lighting: number;     // 0-10
  composition: number;  // 0-10
  vibrancy: number;     // 0-10
  relevance: number;    // 0-10
  // Content-quality dimensions
  clarity: number;              // 0-10: Is the message immediately understandable?
  urgency: number;              // 0-10: Does it create appropriate tension?
  emotionalSpecificity: number; // 0-10: Are emotions concrete, not generic?
  credibility: number;          // 0-10: Are claims sourced and balanced?
}

export interface QualityScorerResult {
  factors: QualityFactors;
  compositeScore: number; // 0-200 (weighted, scaled)
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const VISION_MODEL = 'rekaai/reka-edge';
const QUALITY_TIMEOUT_MS = 20_000;
const QUALITY_MAX_RETRIES = 2;
const DEFAULT_CONCURRENCY = 3;
const DEFAULT_TOP_N = 5;

/** Domains that Reka Edge cannot fetch (hotlink-blocking, paywalled, etc.). */
const REKA_UNFETCHABLE_DOMAINS = [
  'vecteezy.com', 'freepik.com', 'ftcdn.net', 'adobe.com',
  'usatoday.com', 'cnn.com', 'bbc.com', 'bbc.co.uk',
  'nytimes.com', 'sky.com', '365dm.com',
  'walmartimages.com', 'aimwellbeing.com',
  'spurprotocol.com', 'techgenyz.com', 'alphacoders.com',
  'aestheticwallpapers.io', 'quotefancy.com',
  'as2.ftcdn.net', 'assets-global.website-files.com',
  'imageio.forbes.com',
];

/** Weight configuration for composite score calculation. */
export const QUALITY_WEIGHTS = {
  sharpness: 0.25,
  lighting: 0.20,
  composition: 0.15,
  vibrancy: 0.15,
  relevance: 0.25,
} as const;

/** Default quality factors returned on parse failure. */
const DEFAULT_FACTORS: QualityFactors = {
  sharpness: 5,
  lighting: 5,
  composition: 5,
  vibrancy: 5,
  relevance: 5,
  clarity: 5,
  urgency: 5,
  emotionalSpecificity: 5,
  credibility: 5,
};

// ---------------------------------------------------------------------------
// Pure functions
// ---------------------------------------------------------------------------

/**
 * Compute the weighted composite score from quality factors.
 * Pure function: compositeScore = sum(factor × weight) × 20, scaled to 0-200.
 */
export function computeCompositeScore(factors: QualityFactors): number {
  const weighted =
    factors.sharpness * QUALITY_WEIGHTS.sharpness +
    factors.lighting * QUALITY_WEIGHTS.lighting +
    factors.composition * QUALITY_WEIGHTS.composition +
    factors.vibrancy * QUALITY_WEIGHTS.vibrancy +
    factors.relevance * QUALITY_WEIGHTS.relevance;

  return weighted * 20;
}

/**
 * Clamp a number to the integer range [0, 10].
 */
function clampFactor(value: unknown): number {
  if (typeof value !== 'number' || isNaN(value)) return 5;
  return Math.max(0, Math.min(10, Math.round(value)));
}

/**
 * Parse the raw JSON response from Reka Edge into validated QualityFactors.
 * Clamps each factor to [0, 10]. Returns default factors (all 5) on parse failure.
 */
export function parseQualityResponse(raw: unknown): QualityFactors {
  try {
    let obj: Record<string, unknown>;

    if (typeof raw === 'string') {
      // Strip markdown fences if present
      let cleaned = raw.trim();
      const fenceRegex = /^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/;
      const match = cleaned.match(fenceRegex);
      if (match) {
        cleaned = match[1].trim();
      }
      try {
        obj = JSON.parse(cleaned);
      } catch {
        obj = JSON.parse(repairTruncatedJson(cleaned));
      }
    } else if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      obj = raw as Record<string, unknown>;
    } else {
      return { ...DEFAULT_FACTORS };
    }

    return {
      sharpness: clampFactor(obj.sharpness),
      lighting: clampFactor(obj.lighting),
      composition: clampFactor(obj.composition),
      vibrancy: clampFactor(obj.vibrancy),
      relevance: clampFactor(obj.relevance),
      clarity: clampFactor(obj.clarity),
      urgency: clampFactor(obj.urgency),
      emotionalSpecificity: clampFactor(
        obj.emotionalSpecificity ?? obj.emotional_specificity,
      ),
      credibility: clampFactor(obj.credibility),
    };
  } catch {
    return { ...DEFAULT_FACTORS };
  }
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

/**
 * Strip query parameters from image URLs before sending to vision models.
 */
function cleanImageUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.search = '';
    return parsed.href;
  } catch {
    return url;
  }
}

/**
 * Build the Reka Edge prompt for multi-factor quality assessment.
 * Returns system + user message parts for the OpenRouter API call.
 */
export function buildQualityScorerPrompt(
  imageUrl: string,
  visualConcept: string,
): { system: string; user: Array<{ type: string; [key: string]: unknown }> } {
  const system = [
    'You are an image quality assessor for a professional video production pipeline.',
    'Evaluate the provided image on five quality factors.',
    '',
    'Score each factor from 0 to 10:',
    '',
    '1. **sharpness** (0-10): 0 = heavily compressed/blurry, 10 = tack-sharp',
    '2. **lighting** (0-10): 0 = severely under/overexposed, 10 = well-balanced professional lighting',
    '3. **composition** (0-10): Consider rule-of-thirds, leading lines, visual balance',
    '4. **vibrancy** (0-10): 0 = washed-out/desaturated, 10 = rich vibrant colors',
    `5. **relevance** (0-10): How closely the image matches this concept: "${visualConcept}"`,
    '',
    'Return ONLY a JSON object with these five keys and integer values:',
    '{"sharpness": N, "lighting": N, "composition": N, "vibrancy": N, "relevance": N}',
    '',
    'Return ONLY valid JSON, no markdown fences or extra text.',
  ].join('\n');

  const user: Array<{ type: string; [key: string]: unknown }> = [
    { type: 'text', text: `Evaluate this image for the concept: "${visualConcept}"` },
    { type: 'image_url', image_url: { url: cleanImageUrl(imageUrl) } },
  ];

  return { system, user };
}

// ---------------------------------------------------------------------------
// Single image scoring
// ---------------------------------------------------------------------------

/**
 * Score a single candidate image using Reka Edge.
 * Makes one API call that evaluates all five factors simultaneously.
 * Returns null if the API is unavailable or fails.
 */
export async function scoreImageQuality(
  imageUrl: string,
  visualConcept: string,
  apiKey: string,
  options?: { signal?: AbortSignal },
): Promise<QualityScorerResult | null> {
  // Skip URLs that Reka Edge cannot fetch
  const cleaned = cleanImageUrl(imageUrl);
  if (!cleaned.startsWith('http')) return null;

  // Skip domains that Reka Edge cannot access (hotlink-blocking, paywalled, etc.)
  try {
    const hostname = new URL(cleaned).hostname.toLowerCase();
    if (REKA_UNFETCHABLE_DOMAINS.some(d => hostname.includes(d))) return null;
  } catch {
    return null;
  }

  try {
    const { system, user } = buildQualityScorerPrompt(imageUrl, visualConcept);

    const body = JSON.stringify({
      model: VISION_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });

    const response = await fetchWithTimeout(
      OPENROUTER_ENDPOINT,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://autotube.video',
          'X-Title': 'AutoTube Quality Scorer',
        },
        body,
      },
      {
        timeoutMs: QUALITY_TIMEOUT_MS,
        maxRetries: QUALITY_MAX_RETRIES,
        signal: options?.signal,
      },
    );

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      logger.warn('QualityScorer', `API call failed (Status: ${response.status})`, errText);
      return null;
    }

    const data = await response.json();
    const content: unknown = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      logger.warn('QualityScorer', 'API returned empty content');
      return null;
    }

    const factors = parseQualityResponse(content);
    const compositeScore = computeCompositeScore(factors);

    return { factors, compositeScore };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw err;
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    logger.warn('QualityScorer', `Quality scoring failed for ${imageUrl}`, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Batch scoring
// ---------------------------------------------------------------------------

/**
 * Batch-score the top N candidates. Processes in parallel with concurrency limit.
 * Falls back to existing scoreCandidate() if Reka Edge is unavailable.
 */
export async function batchScoreQuality(
  candidates: MediaCandidate[],
  visualConcept: string,
  apiKey: string,
  options?: { signal?: AbortSignal; concurrency?: number },
): Promise<Map<string, QualityScorerResult>> {
  const concurrency = options?.concurrency ?? DEFAULT_CONCURRENCY;
  const results = new Map<string, QualityScorerResult>();

  // Only score top N candidates
  const toScore = candidates.slice(0, DEFAULT_TOP_N);

  // Process in batches of `concurrency`
  for (let i = 0; i < toScore.length; i += concurrency) {
    if (options?.signal?.aborted) break;

    const batch = toScore.slice(i, i + concurrency);
    const settled = await Promise.allSettled(
      batch.map((c) =>
        scoreImageQuality(c.url, visualConcept, apiKey, { signal: options?.signal }),
      ),
    );

    for (let j = 0; j < settled.length; j++) {
      const result = settled[j];
      const candidate = batch[j];
      if (result.status === 'fulfilled' && result.value !== null) {
        results.set(candidate.url, result.value);
      }
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Multi-dimensional quality validation
// ---------------------------------------------------------------------------

export interface MustReplaceWarning {
  section: string;
  reason: string;
  severity: 'critical' | 'warning';
}

export interface RetentionRisk {
  sectionIndex: number;
  sectionTitle: string;
  riskLevel: 'low' | 'medium' | 'high';
  reasons: string[];
}

export interface AssemblyNote {
  segmentIndex: number;
  clipUrl: string;
  reason: string;
}

/**
 * Generate "must replace" warnings for weak thumbnails or generic openings.
 * Analyzes quality factors and flags sections that need replacement.
 */
export function generateMustReplaceWarnings(
  factors: QualityFactors,
  thumbnailScore?: number,
  openingNarration?: string,
): MustReplaceWarning[] {
  const warnings: MustReplaceWarning[] = [];

  // Weak thumbnail warning
  if (thumbnailScore !== undefined && thumbnailScore < 4) {
    warnings.push({
      section: 'thumbnail',
      reason: 'Thumbnail scores below threshold — lacks visual impact or topic specificity',
      severity: 'critical',
    });
  }

  // Generic opening warning
  if (openingNarration) {
    const genericPhrases = [
      'in today\'s video',
      'welcome back',
      'hey guys',
      'what\'s up',
      'in this video',
      'let me tell you',
    ];
    const lower = openingNarration.toLowerCase();
    const isGeneric = genericPhrases.some((p) => lower.includes(p));
    if (isGeneric) {
      warnings.push({
        section: 'opening',
        reason: 'Opening uses generic YouTube phrasing — replace with personal-stakes hook',
        severity: 'critical',
      });
    }
  }

  // Low clarity warning
  if (factors.clarity < 4) {
    warnings.push({
      section: 'script',
      reason: 'Message clarity is low — audience may not understand the core point',
      severity: 'warning',
    });
  }

  // Low credibility warning
  if (factors.credibility < 4) {
    warnings.push({
      section: 'script',
      reason: 'Credibility score is low — claims may appear unsourced or unbalanced',
      severity: 'warning',
    });
  }

  return warnings;
}

/**
 * Measure section-level retention risk based on repetition, abstraction,
 * and weak visual payoff.
 */
export function measureRetentionRisk(
  sections: Array<{ title: string; narration: string; visualNote: string }>,
): RetentionRisk[] {
  const risks: RetentionRisk[] = [];

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const reasons: string[] = [];

    // Check for abstraction (too many abstract words without concrete examples)
    const abstractWords = ['concept', 'framework', 'paradigm', 'methodology', 'infrastructure', 'ecosystem', 'landscape', 'synergy'];
    const words = section.narration.toLowerCase().split(/\s+/);
    const abstractCount = words.filter((w) => abstractWords.includes(w)).length;
    if (abstractCount >= 3) {
      reasons.push('Section is too abstract — lacks concrete examples');
    }

    // Check for repetition with previous section
    if (i > 0) {
      const prevWords = new Set(sections[i - 1].narration.toLowerCase().split(/\s+/));
      const currentWords = section.narration.toLowerCase().split(/\s+/);
      const overlap = currentWords.filter((w) => w.length > 4 && prevWords.has(w)).length;
      const overlapRatio = currentWords.length > 0 ? overlap / currentWords.length : 0;
      if (overlapRatio > 0.3) {
        reasons.push('High word overlap with previous section — feels repetitive');
      }
    }

    // Check for weak visual payoff
    const weakVisualIndicators = ['generic', 'stock', 'abstract', 'placeholder', 'tbd'];
    const visualLower = section.visualNote.toLowerCase();
    if (weakVisualIndicators.some((ind) => visualLower.includes(ind))) {
      reasons.push('Visual note suggests weak payoff — needs concrete imagery');
    }

    let riskLevel: 'low' | 'medium' | 'high' = 'low';
    if (reasons.length >= 2) riskLevel = 'high';
    else if (reasons.length === 1) riskLevel = 'medium';

    risks.push({
      sectionIndex: i,
      sectionTitle: section.title,
      riskLevel,
      reasons,
    });
  }

  return risks;
}

/**
 * Flag sections that become too abstract for the intended audience.
 * Returns indices of sections that need simplification.
 */
export function flagAbstractSections(
  sections: Array<{ narration: string }>,
  audienceLevel: 'general' | 'technical' = 'general',
): number[] {
  const abstractThreshold = audienceLevel === 'general' ? 2 : 4;
  const abstractWords = [
    'paradigm', 'methodology', 'infrastructure', 'ecosystem',
    'synergy', 'framework', 'ontology', 'heuristic',
    'epistemological', 'axiom', 'taxonomy', 'dialectic',
  ];

  const flagged: number[] = [];

  for (let i = 0; i < sections.length; i++) {
    const words = sections[i].narration.toLowerCase().split(/\s+/);
    const abstractCount = words.filter((w) => abstractWords.includes(w)).length;
    if (abstractCount >= abstractThreshold) {
      flagged.push(i);
    }
  }

  return flagged;
}

/**
 * Generate assembly notes explaining why each clip was chosen for a segment.
 */
export function generateAssemblyNotes(
  segments: Array<{ visualNote: string; narration: string }>,
  clips: Array<{ url: string; alt: string; query: string }>,
): AssemblyNote[] {
  const notes: AssemblyNote[] = [];

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const clip = clips[i];
    if (!clip) continue;

    // Generate reason based on visual note and clip metadata
    const reason = buildClipReason(segment, clip);
    notes.push({
      segmentIndex: i,
      clipUrl: clip.url,
      reason,
    });
  }

  return notes;
}

/**
 * Build a human-readable reason for why a clip was chosen for a segment.
 */
function buildClipReason(
  segment: { visualNote: string; narration: string },
  clip: { alt: string; query: string },
): string {
  const parts: string[] = [];

  // Match visual note to clip
  if (segment.visualNote && clip.alt) {
    const noteWords = segment.visualNote.toLowerCase().split(/\s+/);
    const altWords = clip.alt.toLowerCase().split(/\s+/);
    const matches = noteWords.filter((w) => w.length > 3 && altWords.includes(w));
    if (matches.length > 0) {
      parts.push(`Matches visual direction: "${matches.slice(0, 3).join(', ')}"`);
    }
  }

  // Query alignment
  if (clip.query) {
    parts.push(`Selected via query: "${clip.query}"`);
  }

  // Narration context
  const firstWords = segment.narration.split(/\s+/).slice(0, 6).join(' ');
  parts.push(`Supports narration: "${firstWords}…"`);

  return parts.join('. ');
}
