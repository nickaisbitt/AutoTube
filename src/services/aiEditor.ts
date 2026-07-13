import type {
  VideoProject,
  EditPlan,
  SegmentEditEntry,
  KenBurnsParams,
  CaptionSettings,
  TransitionType,
  AIEditOptions,
} from '../types';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import { logger } from './logger';

// ── Pan direction presets for Ken Burns variety ──────────────────────────────
// Cycle through these to ensure consecutive assets get distinct motion.
const PAN_DIRECTIONS: { x: number; y: number }[] = [
  { x: -1, y: 0 },  // left
  { x: 1, y: 0 },   // right
  { x: 0, y: -1 },  // up
  { x: 0, y: 1 },   // down
  { x: -1, y: -1 }, // top-left
  { x: 1, y: 1 },   // bottom-right
];

/**
 * Generates default Ken Burns parameters for an asset at a given index.
 * Alternates pan directions for visual variety across consecutive assets.
 */
function defaultKenBurns(assetIndex: number): KenBurnsParams {
  const dir = PAN_DIRECTIONS[assetIndex % PAN_DIRECTIONS.length];
  return {
    zoomStart: 1.0,
    zoomEnd: 1.05,
    panDirectionX: dir.x,
    panDirectionY: dir.y,
  };
}

/** YouTube Hormozi-style caption cap (matches deploy/server-render/youtubeProfile.mjs). */
export const YOUTUBE_CAPTION_MAX_WORDS = 4;

/**
 * Computes default caption settings for YouTube-ready exports.
 *
 * Always caps at {@link YOUTUBE_CAPTION_MAX_WORDS} words per on-screen window.
 * displayDurationMs assumes ~3 words/sec reading pace.
 */
export function defaultCaptionSettings(narrationText: string): CaptionSettings {
  const wordsPerWindow = YOUTUBE_CAPTION_MAX_WORDS;
  const displayDurationMs = Math.round((wordsPerWindow / 3) * 1000);

  if (!narrationText || narrationText.trim().length === 0) {
    return { wordsPerWindow, displayDurationMs, isFastPaced: true };
  }

  const wordCount = narrationText.trim().split(/\s+/).filter(Boolean).length;
  // Fast-paced when narration would outrun a 4-word window (~3 wps → ~1.3s/window)
  const isFastPaced = wordCount > 40;

  return {
    wordsPerWindow,
    displayDurationMs,
    isFastPaced,
  };
}

/**
 * Pure function: applies an EditPlan to a VideoProject.
 *
 * 1. Deep-clones the project to avoid mutation.
 * 2. For each segment entry in the plan:
 *    a. Reorders the segment's media assets according to `shotOrder`.
 *    b. If `adjustedDuration` is not null, updates the segment's duration.
 * 3. After all adjustments, enforces total duration within 10% of original:
 *    if exceeded, scales all adjusted durations proportionally.
 * 4. Attaches the editPlan to the returned project.
 */
export function applyEditPlan(project: VideoProject, plan: EditPlan): VideoProject {
  // Deep clone to avoid mutating inputs
  const result: VideoProject = structuredClone(project);
  const clonedPlan: EditPlan = structuredClone(plan);

  // Compute original total duration from the input project
  const originalTotalDuration = project.script.reduce(
    (sum, seg) => sum + seg.duration,
    0,
  );

  // Track which segments had their duration adjusted (by index in result.script)
  const adjustedSegmentIndices: number[] = [];

  for (const entry of clonedPlan.segments) {
    // ── Shot reordering ──
    // Find all media assets for this segment and reorder them according to shotOrder
    const segmentAssetIds = new Set(
      result.media
        .filter((a) => a.segmentId === entry.segmentId)
        .map((a) => a.id),
    );

    if (entry.shotOrder.length > 0 && segmentAssetIds.size > 0) {
      // Build a lookup of assets by ID for this segment
      const assetById = new Map(
        result.media
          .filter((a) => a.segmentId === entry.segmentId)
          .map((a) => [a.id, a]),
      );

      // Remove existing segment assets from the media array
      const otherAssets = result.media.filter(
        (a) => a.segmentId !== entry.segmentId,
      );

      // Reorder segment assets according to shotOrder
      const reorderedAssets = entry.shotOrder
        .filter((id) => assetById.has(id))
        .map((id) => assetById.get(id)!);

      // Find the original insertion point: where the first asset of this segment was
      // We insert reordered assets at the position of the first occurrence of this segment's assets
      let insertIndex = 0;
      for (let i = 0; i < result.media.length; i++) {
        if (result.media[i].segmentId === entry.segmentId) {
          // Count how many non-segment assets come before this index
          insertIndex = result.media
            .slice(0, i)
            .filter((a) => a.segmentId !== entry.segmentId).length;
          break;
        }
      }

      // Rebuild media array: other assets with reordered segment assets inserted at the right position
      result.media = [
        ...otherAssets.slice(0, insertIndex),
        ...reorderedAssets,
        ...otherAssets.slice(insertIndex),
      ];
    }

    // ── Timing adjustments ──
    if (entry.adjustedDuration !== null) {
      const segIdx = result.script.findIndex(
        (s) => s.id === entry.segmentId,
      );
      if (segIdx !== -1) {
        result.script[segIdx].duration = Math.max(1, entry.adjustedDuration);
        adjustedSegmentIndices.push(segIdx);
      }
    }
  }

  // ── Enforce total duration within 10% of original ──
  const newTotalDuration = result.script.reduce(
    (sum, seg) => sum + seg.duration,
    0,
  );

  const maxAllowed = originalTotalDuration * 1.1;
  const minAllowed = originalTotalDuration * 0.9;

  if (
    newTotalDuration > maxAllowed ||
    newTotalDuration < minAllowed
  ) {
    // Only scale segments that were adjusted
    if (adjustedSegmentIndices.length > 0) {
      // Compute the sum of unadjusted segment durations
      const unadjustedTotal = result.script.reduce((sum, seg, idx) => {
        if (!adjustedSegmentIndices.includes(idx)) {
          return sum + seg.duration;
        }
        return sum;
      }, 0);

      // The target total for adjusted segments: clamp to the nearest bound
      const targetTotal = newTotalDuration > maxAllowed ? maxAllowed : minAllowed;
      const adjustedBudget = targetTotal - unadjustedTotal;

      // Current sum of adjusted segments
      const currentAdjustedTotal = adjustedSegmentIndices.reduce(
        (sum, idx) => sum + result.script[idx].duration,
        0,
      );

      if (currentAdjustedTotal > 0 && adjustedBudget > 0) {
        const scaleFactor = adjustedBudget / currentAdjustedTotal;
        for (const idx of adjustedSegmentIndices) {
          result.script[idx].duration = Math.max(1, result.script[idx].duration * scaleFactor);
        }

        // Second pass: the Math.max(1, ...) floor may have pushed the total
        // above the target. Re-scale non-floored segments to compensate.
        const postScaleTotal = result.script.reduce((s, seg) => s + seg.duration, 0);
        if (postScaleTotal > maxAllowed || postScaleTotal < minAllowed) {
          const flooredIndices = new Set(
            adjustedSegmentIndices.filter((idx) => result.script[idx].duration === 1),
          );
          const nonFlooredIndices = adjustedSegmentIndices.filter((idx) => !flooredIndices.has(idx));
          if (nonFlooredIndices.length > 0) {
            const flooredTotal = flooredIndices.size; // each floored segment has duration 1
            const nonFlooredTotal = nonFlooredIndices.reduce(
              (s, idx) => s + result.script[idx].duration, 0,
            );
            const revisedTarget = (postScaleTotal > maxAllowed ? maxAllowed : minAllowed);
            const revisedBudget = revisedTarget - unadjustedTotal - flooredTotal;
            if (nonFlooredTotal > 0 && revisedBudget > 0) {
              const revisedScale = revisedBudget / nonFlooredTotal;
              for (const idx of nonFlooredIndices) {
                result.script[idx].duration = Math.max(1, result.script[idx].duration * revisedScale);
              }
            }
          }
        }
      }
    }
  }

  // ── Attach the edit plan ──
  result.editPlan = clonedPlan;

  return result;
}

/**
 * Generates a default no-op EditPlan that preserves the project unchanged.
 *
 * For each segment:
 * - Preserves original shot order
 * - Sets adjustedDuration to null (no change)
 * - First segment gets transition: null; others get crossfade at 500ms
 * - Generates default Ken Burns params per asset with alternating pan directions
 * - Sets default caption settings based on narration word count
 * - Empty replacement suggestions
 */
export function createDefaultEditPlan(project: VideoProject): EditPlan {
  const segments: SegmentEditEntry[] = project.script.map((segment, segIndex) => {
    // Gather media assets for this segment in their original order
    const segmentAssets = project.media.filter((a) => a.segmentId === segment.id);

    // Build Ken Burns params keyed by asset ID
    const kenBurns: Record<string, KenBurnsParams> = {};
    segmentAssets.forEach((asset, assetIdx) => {
      kenBurns[asset.id] = defaultKenBurns(assetIdx);
    });

    // Find narration text for caption settings
    const narrationClip = project.narration.find((n) => n.segmentId === segment.id);
    const narrationText = narrationClip?.text ?? segment.narration ?? '';

    return {
      segmentId: segment.id,
      shotOrder: segmentAssets.map((a) => a.id),
      adjustedDuration: null,
      originalDuration: segment.duration,
      transition:
        segIndex === 0
          ? null
          : { type: 'crossfade' as const, durationMs: 500 },
      kenBurns,
      captionSettings: defaultCaptionSettings(narrationText),
      replacementSuggestions: [],
      rationale: 'Default plan — no AI modifications applied.',
    };
  });

  return {
    segments,
    summary: 'Default plan — no AI modifications applied.',
    isDefault: true,
  };
}

// ── Allowed transition types ─────────────────────────────────────────────────
const ALLOWED_TRANSITIONS = new Set<TransitionType>([
  'crossfade',
  'cut',
  'dissolve',
  'wipe',
  'slide',
  'zoom',
  'glitch',
  'flash',
  'push',
  'spin',
  'cross-dissolve',
]);

/**
 * Clamps a numeric value to the given [min, max] range.
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Validates and clamps Ken Burns parameters from raw LLM output.
 * Zoom values are clamped to [1.0, 1.25].
 * Pan direction values are clamped to [-1, 1].
 */
function validateKenBurns(raw: unknown, fallback: KenBurnsParams): KenBurnsParams {
  if (raw == null || typeof raw !== 'object') return fallback;
  const obj = raw as Record<string, unknown>;

  return {
    zoomStart: typeof obj.zoomStart === 'number' ? clamp(obj.zoomStart, 1.0, 1.25) : fallback.zoomStart,
    zoomEnd: typeof obj.zoomEnd === 'number' ? clamp(obj.zoomEnd, 1.0, 1.25) : fallback.zoomEnd,
    panDirectionX: typeof obj.panDirectionX === 'number' ? clamp(obj.panDirectionX, -1, 1) : fallback.panDirectionX,
    panDirectionY: typeof obj.panDirectionY === 'number' ? clamp(obj.panDirectionY, -1, 1) : fallback.panDirectionY,
  };
}

/**
 * Validates a transition entry from raw LLM output.
 * Invalid transition types are replaced with 'crossfade'.
 */
function validateTransition(
  raw: unknown,
  fallback: { type: TransitionType; durationMs: number } | null,
): { type: TransitionType; durationMs: number } | null {
  if (raw === null || raw === undefined) return fallback;
  if (typeof raw !== 'object') return fallback;

  const obj = raw as Record<string, unknown>;
  const type = ALLOWED_TRANSITIONS.has(obj.type as TransitionType)
    ? (obj.type as TransitionType)
    : 'crossfade';
  const durationMs =
    typeof obj.durationMs === 'number' && obj.durationMs > 0
      ? obj.durationMs
      : fallback?.durationMs ?? 500;

  return { type, durationMs };
}

/**
 * Validates caption settings from raw LLM output.
 * Clamps wordsPerWindow to [1, 20] and displayDurationMs to [500, 10000].
 */
function validateCaptionSettings(raw: unknown, fallback: CaptionSettings): CaptionSettings {
  if (raw == null || typeof raw !== 'object') return fallback;
  const obj = raw as Record<string, unknown>;

  const wordsPerWindow =
    typeof obj.wordsPerWindow === 'number'
      ? clamp(Math.round(obj.wordsPerWindow), 1, 20)
      : fallback.wordsPerWindow;

  const displayDurationMs =
    typeof obj.displayDurationMs === 'number'
      ? clamp(obj.displayDurationMs, 500, 10000)
      : fallback.displayDurationMs;

  const isFastPaced =
    typeof obj.isFastPaced === 'boolean' ? obj.isFastPaced : fallback.isFastPaced;

  return { wordsPerWindow, displayDurationMs, isFastPaced };
}

/**
 * Validates raw LLM JSON output against the EditPlan schema.
 *
 * - Returns null if `raw` is not an object or has no `segments` array.
 * - For each segment entry: validates segmentId exists in the project,
 *   validates shotOrder contains exactly the same asset IDs as the segment's media,
 *   clamps Ken Burns zoom values to [1.0, 1.25], validates transition types,
 *   and validates caption settings ranges.
 * - Merges valid fields with defaults for missing fields (partial JSON support).
 * - Adds default entries for project segments not covered by the raw response.
 * - Returns the validated/merged EditPlan with isDefault: false.
 */
export function validateEditPlanResponse(
  raw: unknown,
  project: VideoProject,
): EditPlan | null {
  // ── Reject completely invalid input ──
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const rawObj = raw as Record<string, unknown>;

  if (!Array.isArray(rawObj.segments)) {
    return null;
  }

  // Generate the default plan to use as fallback for missing fields
  const defaultPlan = createDefaultEditPlan(project);

  // Build a lookup of default entries by segmentId
  const defaultEntryBySegmentId = new Map<string, SegmentEditEntry>(
    defaultPlan.segments.map((entry) => [entry.segmentId, entry]),
  );

  // Build a set of valid segment IDs from the project
  const projectSegmentIds = new Set(project.script.map((s) => s.id));

  // Track which project segments are covered by the raw response
  const coveredSegmentIds = new Set<string>();

  const validatedSegments: SegmentEditEntry[] = [];

  for (const rawEntry of rawObj.segments as unknown[]) {
    if (rawEntry == null || typeof rawEntry !== 'object') continue;
    const entry = rawEntry as Record<string, unknown>;

    // ── Validate segmentId ──
    const segmentId = entry.segmentId;
    if (typeof segmentId !== 'string' || !projectSegmentIds.has(segmentId)) {
      continue; // Skip entries with invalid or non-existent segmentId
    }

    // Don't process duplicate segment entries
    if (coveredSegmentIds.has(segmentId)) continue;
    coveredSegmentIds.add(segmentId);

    const defaultEntry = defaultEntryBySegmentId.get(segmentId)!;

    // ── Validate shotOrder ──
    // Must contain exactly the same asset IDs as the segment's media
    const segmentAssetIds = new Set(
      project.media.filter((a) => a.segmentId === segmentId).map((a) => a.id),
    );
    let shotOrder: string[];

    if (
      Array.isArray(entry.shotOrder) &&
      entry.shotOrder.length === segmentAssetIds.size &&
      entry.shotOrder.every(
        (id: unknown) => typeof id === 'string' && segmentAssetIds.has(id),
      ) &&
      new Set(entry.shotOrder).size === segmentAssetIds.size
    ) {
      // Explicit per-element mapping instead of fragile `as string[]` cast
      shotOrder = (entry.shotOrder as unknown[]).map((id) => String(id));
    } else {
      // Fall back to default order from project media
      shotOrder = defaultEntry.shotOrder;
    }

    // ── Validate adjustedDuration ──
    const adjustedDuration =
      entry.adjustedDuration === null
        ? null
        : typeof entry.adjustedDuration === 'number' && entry.adjustedDuration > 0
          ? entry.adjustedDuration
          : defaultEntry.adjustedDuration;

    // ── Validate originalDuration ──
    // Always use the actual project segment duration for accuracy
    const segment = project.script.find((s) => s.id === segmentId)!;
    const originalDuration = segment.duration;

    // ── Validate transition ──
    // Determine the segment's index in the project to know if it's the first segment
    const segIndex = project.script.findIndex((s) => s.id === segmentId);
    let transition: { type: TransitionType; durationMs: number } | null;
    if (segIndex === 0) {
      transition = null; // First segment never has a transition
    } else if (entry.transition !== undefined) {
      transition = validateTransition(entry.transition, defaultEntry.transition);
    } else {
      transition = defaultEntry.transition;
    }

    // ── Validate Ken Burns params ──
    const kenBurns: Record<string, KenBurnsParams> = {};
    const rawKenBurns =
      entry.kenBurns != null && typeof entry.kenBurns === 'object' && !Array.isArray(entry.kenBurns)
        ? (entry.kenBurns as Record<string, unknown>)
        : {};

    for (const assetId of shotOrder) {
      const fallbackKB = defaultEntry.kenBurns[assetId] ?? defaultKenBurns(0);
      kenBurns[assetId] = validateKenBurns(rawKenBurns[assetId], fallbackKB);
    }

    // ── Validate caption settings ──
    const captionSettings = validateCaptionSettings(
      entry.captionSettings,
      defaultEntry.captionSettings,
    );

    // ── Validate replacement suggestions ──
    let replacementSuggestions = defaultEntry.replacementSuggestions;
    if (Array.isArray(entry.replacementSuggestions)) {
      replacementSuggestions = (entry.replacementSuggestions as unknown[])
        .filter((s): s is Record<string, unknown> => {
          if (s == null || typeof s !== 'object') return false;
          const suggestion = s as Record<string, unknown>;
          return (
            typeof suggestion.assetId === 'string' &&
            typeof suggestion.reason === 'string' &&
            Array.isArray(suggestion.alternativeQueries) &&
            (suggestion.alternativeQueries as unknown[]).every(
              (q) => typeof q === 'string',
            )
          );
        })
        .map((s) => ({
          assetId: s.assetId as string,
          reason: s.reason as string,
          alternativeQueries: s.alternativeQueries as string[],
        }));
    }

    // ── Validate rationale ──
    const rationale =
      typeof entry.rationale === 'string' && entry.rationale.length > 0
        ? entry.rationale
        : defaultEntry.rationale;

    validatedSegments.push({
      segmentId,
      shotOrder,
      adjustedDuration,
      originalDuration,
      transition,
      kenBurns,
      captionSettings,
      replacementSuggestions,
      rationale,
    });
  }

  // ── Add default entries for project segments not covered by the raw response ──
  for (const segment of project.script) {
    if (!coveredSegmentIds.has(segment.id)) {
      const defaultEntry = defaultEntryBySegmentId.get(segment.id);
      if (defaultEntry) {
        validatedSegments.push(defaultEntry);
      }
    }
  }

  // ── Sort segments to match project script order ──
  const segmentOrder = new Map(project.script.map((s, i) => [s.id, i]));
  validatedSegments.sort(
    (a, b) => (segmentOrder.get(a.segmentId) ?? 0) - (segmentOrder.get(b.segmentId) ?? 0),
  );

  // ── Build the validated EditPlan ──
  const summary =
    typeof rawObj.summary === 'string' && rawObj.summary.length > 0
      ? rawObj.summary
      : 'AI-generated edit plan.';

  return {
    segments: validatedSegments,
    summary,
    isDefault: false,
  };
}

/**
 * Constructs the LLM prompt from a VideoProject.
 *
 * Returns a { system, user } pair:
 * - system: instructs the LLM to act as a professional video editor, describes
 *   the EditPlan JSON schema, lists all editing dimensions, and includes
 *   constraints (Ken Burns zoom range, transition variety, total duration).
 * - user: includes the full project data — script segments, media assets,
 *   narration clips, and visual plan summaries.
 */
export function buildEditPrompt(project: VideoProject): { system: string; user: string } {
  // ── Style-specific transition guidance ──
  const style = project.style ?? 'business_insider';
  let styleTransitionNote = '';
  if (style === 'warfront' || style === 'documentary') {
    styleTransitionNote =
      '\n- For segments with beat type "event" or "data", prefer "cut" transitions for immediacy and impact.';
  }

  const system = `You are a professional video editor reviewing a fully assembled video plan. Your job is to make creative editing decisions that improve pacing, visual flow, transitions, camera motion, caption readability, and media quality.

You will receive the complete project data: script segments, media assets, narration clips, and visual plans. Analyze the material and return a single JSON object conforming to the EditPlan schema below.

## EditPlan JSON Schema

{
  "segments": [
    {
      "segmentId": "string — must match a script segment ID from the input",
      "shotOrder": ["assetId1", "assetId2"] — reordered asset IDs for this segment (same set, no additions/removals),
      "adjustedDuration": number | null — adjusted segment duration in seconds (null = keep original),
      "originalDuration": number — the segment's original duration (copy from input),
      "transition": { "type": "crossfade" | "cut" | "dissolve" | "wipe", "durationMs": number } | null — transition BEFORE this segment (null for the first segment),
      "kenBurns": {
        "<assetId>": {
          "zoomStart": number,
          "zoomEnd": number,
          "panDirectionX": number,
          "panDirectionY": number
        }
      } — Ken Burns parameters keyed by asset ID,
      "captionSettings": {
        "wordsPerWindow": number,
        "displayDurationMs": number,
        "isFastPaced": boolean
      },
      "replacementSuggestions": [
        {
          "assetId": "string",
          "reason": "string",
          "alternativeQueries": ["query1", "query2"]
        }
      ],
      "rationale": "string — human-readable explanation of your editing decisions for this segment"
    }
  ],
  "summary": "string — global summary of all changes made",
  "isDefault": false
}

## Editing Dimensions

1. **Shot Reordering**: Reorder media assets within each segment for better visual flow. Preserve all asset IDs — do not add or remove any.
2. **Timing Adjustments**: Adjust segment durations to match narration pacing. If a segment's narration duration differs from the segment duration by more than 1 second, set adjustedDuration to the narration duration plus 0.5s padding. If no narration clip exists, set adjustedDuration to null.
3. **Transitions**: Select appropriate transitions between segments. Use "cut" for dramatic shifts, "crossfade" for smooth continuations, "dissolve" for emotional moments, "wipe" for topic changes. The first segment must have transition: null.${styleTransitionNote}
4. **Ken Burns Effect**: Vary zoom and pan parameters per shot for visual variety. Ensure consecutive shots within a segment have distinct pan directions.
5. **Caption Optimization**: Always set wordsPerWindow to 4 (YouTube Hormozi-style short captions). Flag segments as isFastPaced if narration exceeds 4 words/second.
6. **Media Replacement**: Flag assets with isFallback=true or low relevance scores (below 40) as replacement candidates. Provide at least 2 alternative search queries per suggestion.
7. **Redundancy Trimming**: Scan all segment narrations for repeated themes, warnings, statistics, or phrases. If the same point appears in more than one segment:
   - Keep the FIRST occurrence at full strength
   - For the second occurrence: either (a) shorten to a brief callback like "As we saw earlier..." or (b) remove entirely and adjust duration
   - Flag trimmed content in the rationale field
   - Goal: every mention of a theme should land HARDER because it's not diluted by repetition

## Constraints

- Ken Burns zoomStart and zoomEnd MUST be in the range [1.0, 1.25]. No excessive zoom.
- No more than 3 consecutive segment boundaries may use the same transition type.
- The total duration of all segments after adjustments MUST remain within 10% of the original total duration.
- Every segment in the input MUST have a corresponding entry in the output segments array.
- shotOrder arrays MUST contain exactly the same asset IDs as the input (same set, possibly reordered).
- When trimming redundant content (dimension 7), the \`rationale\` field of each affected segment entry MUST document what was trimmed and why.

Respond with ONLY the JSON object. No markdown fences, no commentary.`;

  // ── Build user prompt with project data ──
  const scriptLines = project.script.map((seg) => {
    const wordCount = seg.narration.trim().split(/\s+/).filter(Boolean).length;
    return `  - ID: "${seg.id}", type: "${seg.type}", title: "${seg.title}", duration: ${seg.duration}s, narration (${wordCount} words): "${seg.narration}"`;
  });

  const mediaLines = project.media.map((asset) => {
    const parts = [
      `ID: "${asset.id}"`,
      `segmentId: "${asset.segmentId}"`,
      `url: "${asset.url}"`,
      asset.shotType ? `shotType: "${asset.shotType}"` : null,
      asset.isFallback ? `isFallback: true` : null,
      asset.concept ? `concept: "${asset.concept}"` : null,
      asset.score != null ? `score: ${asset.score}` : null,
    ].filter(Boolean);
    return `  - ${parts.join(', ')}`;
  });

  const narrationLines = project.narration.map((clip) => {
    const wordCount = clip.text.trim().split(/\s+/).filter(Boolean).length;
    const wps = clip.duration > 0 ? (wordCount / clip.duration).toFixed(1) : 'N/A';
    return `  - segmentId: "${clip.segmentId}", duration: ${clip.duration}s, wordCount: ${wordCount}, wordsPerSec: ${wps}`;
  });

  const visualPlanLines: string[] = [];
  if (project.visualPlans) {
    for (const [segId, plan] of Object.entries(project.visualPlans)) {
      visualPlanLines.push(
        `  - segmentId: "${segId}", beat: "${plan.beat ?? ''}", visualConcept: "${plan.visualConcept ?? ''}", queries: [${(plan.queries ?? []).map((q) => `"${q}"`).join(', ')}]`,
      );
    }
  }

  const originalTotalDuration = project.script.reduce((sum, s) => sum + s.duration, 0);

  const user = `## Project: "${project.title}"
Style: ${project.style}
Total Duration: ${originalTotalDuration}s (target: ${project.targetDuration} min)

### Script Segments (${project.script.length})
${scriptLines.join('\n')}

### Media Assets (${project.media.length})
${mediaLines.join('\n')}

### Narration Clips (${project.narration.length})
${narrationLines.join('\n')}

### Visual Plans${visualPlanLines.length > 0 ? ` (${visualPlanLines.length})` : ' (none)'}
${visualPlanLines.length > 0 ? visualPlanLines.join('\n') : '  No visual plans available.'}

Analyze this project and return the EditPlan JSON.`;

  return { system, user };
}

// ── OpenRouter configuration ────────────────────────────────────────────────
const OPENROUTER_ENDPOINT = '/api/llm';
const DEFAULT_EDIT_MODEL = 'openai/gpt-5.4-nano';

/**
 * Runs the full AI editing pass on a VideoProject.
 *
 * 1. Builds the edit prompt from the project data.
 * 2. Calls OpenRouter via `fetchWithTimeout` (30s timeout, 2 retries).
 * 3. Parses the LLM JSON response and validates it against the EditPlan schema.
 * 4. If validation fails, falls back to a default no-op EditPlan.
 * 5. Applies the validated plan to produce the edited project.
 *
 * Reports progress via `options.onProgress` at key phases.
 * Supports cancellation via `options.signal`.
 */
export async function runAIEditPass(
  project: VideoProject,
  apiKey: string,
  options?: AIEditOptions,
): Promise<{ editedProject: VideoProject; editPlan: EditPlan }> {
  const signal = options?.signal;
  const onProgress = options?.onProgress;
  const model = options?.model ?? DEFAULT_EDIT_MODEL;

  // ── Phase 1: Analyzing pacing ──
  onProgress?.(10, 'Analyzing pacing...');

  // Check cancellation before starting the LLM call
  if (signal?.aborted) {
    throw signal.reason ?? new DOMException('The operation was aborted.', 'AbortError');
  }

  const { system, user } = buildEditPrompt(project);

  // ── Phase 2: Optimizing transitions ──
  onProgress?.(30, 'Optimizing transitions...');

  let editPlan: EditPlan;

  try {
    const response = await fetchWithTimeout(OPENROUTER_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://autotube.video',
        'X-Title': 'AutoTube AI Editor',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        response_format: { type: 'json_object' },
      }),
    }, {
      timeoutMs: 30_000,
      maxRetries: 2,
      signal,
    });

    // ── Phase 3: Generating Ken Burns parameters ──
    onProgress?.(50, 'Generating Ken Burns parameters...');

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      logger.warn('AIEditor', `LLM request failed (${response.status}), using default plan`, errText);
      editPlan = createDefaultEditPlan(project);
    } else {
      const data = await response.json();
      const rawContent: unknown = data?.choices?.[0]?.message?.content;

      // ── Phase 4: Evaluating media quality ──
      onProgress?.(70, 'Evaluating media quality...');

      if (typeof rawContent !== 'string' || !rawContent.trim()) {
        logger.warn('AIEditor', 'LLM returned empty content, using default plan');
        editPlan = createDefaultEditPlan(project);
      } else {
        // Strip markdown code fences if present
        const cleaned = rawContent.replace(/```json/g, '').replace(/```/g, '').trim();

        let parsed: unknown;
        try {
          parsed = JSON.parse(cleaned);
        } catch {
          // Try to extract a JSON object from the string
          const objectMatch = cleaned.match(/\{[\s\S]*\}/);
          if (objectMatch) {
            try {
              parsed = JSON.parse(objectMatch[0]);
            } catch {
              parsed = null;
            }
          } else {
            parsed = null;
          }
        }

        if (parsed === null) {
          logger.warn('AIEditor', 'Failed to parse LLM response JSON, using default plan');
          editPlan = createDefaultEditPlan(project);
        } else {
          const validated = validateEditPlanResponse(parsed, project);
          if (validated === null) {
            logger.warn('AIEditor', 'LLM response failed validation, using default plan');
            editPlan = createDefaultEditPlan(project);
          } else {
            logger.success('AIEditor', `Validated edit plan: ${validated.segments.length} segments`);
            editPlan = validated;
          }
        }
      }
    }
  } catch (err: unknown) {
    // If the signal was aborted, re-throw the abort error
    if (signal?.aborted) {
      throw signal.reason ?? new DOMException('The operation was aborted.', 'AbortError');
    }

    const error = err instanceof Error ? err : new Error(String(err));
    logger.error('AIEditor', 'Exception during AI edit pass', error);
    editPlan = createDefaultEditPlan(project);
  }

  // ── Phase 5: Applying edit plan ──
  onProgress?.(90, 'Applying edit plan...');

  const editedProject = applyEditPlan(project, editPlan);

  logger.success('AIEditor', `AI edit pass complete (isDefault: ${editPlan.isDefault})`);

  return { editedProject, editPlan };
}

/**
 * Summarizes an EditPlan into a human-readable change summary.
 *
 * Counts:
 * - Segments with reordered shots (shotOrder differs from original media order)
 * - Segments with adjusted timing (adjustedDuration is not null)
 * - Total media replacement suggestions across all segments
 * - Segments with non-default transitions (differs from crossfade for non-first segments)
 *
 * Returns "No changes — default plan applied." for default/no-op plans.
 */
export function summarizeEditPlan(plan: EditPlan, project: VideoProject): string {
  if (plan.isDefault) {
    return 'No changes — default plan applied.';
  }

  let reorderedCount = 0;
  let timingCount = 0;
  let replacementCount = 0;
  let transitionCount = 0;

  for (const entry of plan.segments) {
    // ── Count reordered segments ──
    // Compare shotOrder against the original media order in the project
    const originalOrder = project.media
      .filter((a) => a.segmentId === entry.segmentId)
      .map((a) => a.id);

    if (
      originalOrder.length > 0 &&
      entry.shotOrder.length === originalOrder.length &&
      !entry.shotOrder.every((id, i) => id === originalOrder[i])
    ) {
      reorderedCount++;
    }

    // ── Count timing adjustments ──
    if (entry.adjustedDuration !== null) {
      timingCount++;
    }

    // ── Count replacement suggestions ──
    replacementCount += entry.replacementSuggestions.length;

    // ── Count non-default transitions ──
    // First segment's default is null; non-first segments default to crossfade
    const segIndex = project.script.findIndex((s) => s.id === entry.segmentId);
    if (segIndex === 0) {
      // First segment: any non-null transition is a change
      if (entry.transition !== null) {
        transitionCount++;
      }
    } else if (segIndex > 0) {
      // Non-first segments: default is crossfade
      if (
        entry.transition === null ||
        entry.transition.type !== 'crossfade'
      ) {
        transitionCount++;
      }
    }
  }

  // ── Build summary parts ──
  const parts: string[] = [];

  if (reorderedCount > 0) {
    parts.push(`Reordered ${reorderedCount} segment${reorderedCount !== 1 ? 's' : ''}`);
  }
  if (timingCount > 0) {
    parts.push(`adjusted ${timingCount} timing${timingCount !== 1 ? 's' : ''}`);
  }
  if (replacementCount > 0) {
    parts.push(`suggested ${replacementCount} media replacement${replacementCount !== 1 ? 's' : ''}`);
  }
  if (transitionCount > 0) {
    parts.push(`changed ${transitionCount} transition${transitionCount !== 1 ? 's' : ''}`);
  }

  if (parts.length === 0) {
    return 'No changes detected.';
  }

  // Capitalize the first part, join with commas
  parts[0] = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  return parts.join(', ') + '.';
}
