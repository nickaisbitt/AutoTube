# Design Document: Video Quality Improvements

## Overview

This design covers eight areas of improvement to bring AutoTube's output to a competitive standard against top YouTube channels: script narrative quality, background music, thumbnail generation, motion graphics, YouTube SEO metadata, higher-resolution rendering, pipeline reliability, and dead code cleanup.

The changes span the full pipeline — from script generation (`llm.ts`) through media harvesting (`media.ts`), visual planning (`llmVisualDirector.ts`, `visualPlanner.ts`), rendering (`videoRenderer.ts`, `server-render.mjs`), and post-production (`thumbnail.ts`, `seoTitles.ts`, `chapters.ts`). All changes respect the existing constraints: OpenRouter-only paid API, system fonts only, and consistent behavior across both server-side and browser-side renderers.

### Key Design Decisions

1. **Shared rendering module**: Ken Burns, crossfade, and scaling logic will live in `src/services/renderingShared.ts` (already exists) and be imported by both renderers. The server renderer (`server-render.mjs`) will import the shared constants via a JSON config or duplicated constants (since it's ESM `.mjs` and can't import `.ts` directly).

2. **Pure function extraction**: All testable logic (tag generation, title enforcement, JSON repair, Ken Burns parameter computation, overlay scaling) is extracted into pure functions with no side effects, enabling property-based testing.

3. **Background music as static assets**: Audio loops are pre-bundled in `public/audio/` rather than generated at runtime. The server renderer uses ffmpeg `amix` for mixing; the browser renderer uses the Web Audio API.

4. **Resolution presets as a configuration object**: A single `RESOLUTION_PRESETS` constant defines 720p/1080p/4K dimensions, FPS, and bitrate, shared across both renderers.

---

## Architecture

```mermaid
graph TD
    subgraph "Script Generation"
        LLM[llm.ts] -->|ScriptSegment[]| VP[visualPlanner.ts]
        LLM -->|hook line| SEO[seoTitles.ts]
    end

    subgraph "Media Pipeline"
        VP -->|SegmentVisualPlan| VD[llmVisualDirector.ts]
        VD -->|LlmVisualPlan| MH[media.ts]
        MH -->|MediaAsset[]| QS[qualityScorer.ts]
        QS --> VC[visionCheck.ts]
    end

    subgraph "Rendering"
        RS[renderingShared.ts] -->|Ken Burns, Crossfade, Scaling| BR[videoRenderer.ts]
        RS -->|Constants exported| SR[server-render.mjs]
        BM[public/audio/*.aac] -->|Background Music| BR
        BM -->|ffmpeg amix| SR
    end

    subgraph "Post-Production"
        SEO -->|TitleOption[]| PREVIEW[PreviewStep UI]
        CH[chapters.ts] -->|Chapter markers| DESC[Description Generator]
        TG[Tag Generator] --> PREVIEW
        TH[thumbnail.ts] -->|PNG Blob| PREVIEW
    end

    subgraph "Export"
        BR -->|Blob| EXPORT[ExportModal]
        SR -->|.webm/.mp4| EXPORT
        EXPORT -->|Resolution Preset| RP[RESOLUTION_PRESETS]
    end
```

---

## Components and Interfaces

### 1. Script Narrative Quality (`src/services/llm.ts`)

**Changes**: Enhance the system prompt and user prompt in `generateAIScript()` to enforce:
- Hook-first intro structure (specific claim/statistic, not generic)
- Transition segments for scripts with >4 segments
- At least one data-driven segment with numeric content from `topicContext.extract`
- Narrative callback in the conclusion referencing the hook
- Tone-specific sentence length and voice rules

**New validation in `validateSegment()`**:
- Post-parse check: if script has >4 segments and none have `type: 'transition'`, inject a transition segment between the midpoint sections.

**Interface** (unchanged — backward compatible):
```typescript
function generateAIScript(config: TopicConfig, apiKey: string, model?: string, signal?: AbortSignal): Promise<ScriptSegment[]>
```

### 2. Background Music (`public/audio/`, `src/services/videoRenderer.ts`, `server-render.mjs`)

**New files**:
- `public/audio/bg-business-insider.aac` — corporate ambient loop
- `public/audio/bg-warfront.aac` — tense cinematic loop
- `public/audio/bg-documentary.aac` — neutral atmospheric loop
- `public/audio/bg-explainer.aac` — upbeat educational loop

**New utility** in `src/services/renderingShared.ts`:
```typescript
/** Maps video style to background music file path. Returns null if file missing. */
function getBackgroundMusicPath(style: VideoProject['style']): string | null

/** Computes background music volume based on narration availability. */
function computeBgMusicVolume(hasNarration: boolean): number
// Returns 0.15 if narration present, 0.60 if no narration
```

**Browser renderer** (`videoRenderer.ts`): Use Web Audio API `GainNode` to mix background music at computed volume during `renderVideoToBlob()`.

**Server renderer** (`server-render.mjs`): Use ffmpeg `amix` filter:
```bash
ffmpeg -i narration.aac -i bg-music.aac -filter_complex "[1:a]volume=0.15[bg];[0:a][bg]amix=inputs=2:duration=first" output.aac
```

**UI toggle**: Add `backgroundMusic: boolean` field to `VideoProject.exportSettings` (optional, defaults to `true`). Render a toggle in `AssemblyStep.tsx`.

### 3. Thumbnail Generation (`src/services/thumbnail.ts`)

**Changes to `generateThumbnail()`**:
- Select highest-scored non-fallback `MediaAsset` as background image
- Apply dark gradient overlay: `rgba(0,0,0,0.4)` top → `rgba(0,0,0,0.8)` bottom
- Draw title in bold 56px `system-ui` with white fill and dark text shadow (blur 20px, offset 0,4)
- Use hook line key phrase (via `extractKeyPhrase()`) as overlay text when available
- Truncate overlay text to 80 characters with ellipsis

**New pure function**:
```typescript
/** Selects the highest-scored non-fallback MediaAsset from an array. */
function selectThumbnailBackground(assets: MediaAsset[]): MediaAsset | undefined

/** Truncates text to maxLength chars, appending '…' if truncated. */
function truncateOverlayText(text: string, maxLength: number): string
```

**Fallback chain**: CORS proxy → original URL → gradient-only background.

### 4. Motion Graphics (`src/services/renderingShared.ts`, both renderers)

**New pure functions in `renderingShared.ts`**:
```typescript
interface KenBurnsConfig {
  zoomStart: number;   // [1.0, 1.25]
  zoomEnd: number;     // [1.0, 1.25]
  panDirectionX: number; // [-1, 1]
  panDirectionY: number; // [-1, 1]
}

/** Deterministic Ken Burns params from segment index + asset ID. */
function computeKenBurnsParams(segmentIndex: number, assetId: string, prevPanX?: number, prevPanY?: number): KenBurnsConfig

/** Compute crossfade alpha for a given frame within the transition window. */
function computeCrossfadeAlpha(frameInTransition: number, totalTransitionFrames: number): number

/** Compute which asset index to show at a given time within a segment. */
function computeActiveAssetIndex(timeInSegment: number, assetCount: number, intervalSec: number): number

/** Scale a base dimension proportionally to a target resolution. */
function scaleToResolution(baseDimension: number, baseWidth: number, targetWidth: number): number
```

**Ken Burns determinism**: Use a seeded hash of `segmentIndex + assetId` to derive zoom and pan values. The same inputs always produce the same output, ensuring both renderers match.

**Pan direction variation**: `computeKenBurnsParams` accepts the previous segment's pan direction and ensures the new direction differs by at least 90°.

**Crossfade**: Both renderers use `computeCrossfadeAlpha()` to determine the blend ratio. Browser renderer uses `ctx.globalAlpha`; server renderer uses `ctx.globalAlpha` on node-canvas (same API).

### 5. YouTube SEO Metadata (`src/services/seoTitles.ts`, `src/services/chapters.ts`)

**Enhanced `generateTitleOptions()`** (backward compatible — existing 2-param signature preserved):
```typescript
function generateTitleOptions(topic: string, style?: string, dataPoints?: string[], hookLine?: string): TitleOption[]
```
Already returns ≥3 titles enforced to 40-70 chars via `enforceTitleLength()`.

**New function — description generator**:
```typescript
/** Generates a full YouTube description with summary, chapters, and tags. */
function generateVideoDescription(
  segments: ScriptSegment[],
  topic: string,
  topicContext: TopicContext,
  style: string,
): { summary: string; chapters: string; tags: string[]; fullDescription: string }
```

**New function — tag generator**:
```typescript
/** Generates 5-15 YouTube tags from topic context. Each tag 2-30 chars, alphanumeric + spaces + hyphens only. */
function generateTags(topicContext: TopicContext, style: string): string[]

/** Sanitizes a single tag: trims, removes invalid chars, enforces 2-30 char length. */
function sanitizeTag(raw: string): string | null
```

**Enhanced `copyChaptersToClipboard()`**: Accept the full description string (summary + chapters + tags) instead of just chapter markers.

### 6. Higher Resolution Rendering

**New constant in `renderingShared.ts`**:
```typescript
const RESOLUTION_PRESETS = {
  '720p':  { width: 1280, height: 720,  fps: 6,  videoBitsPerSecond: 5_000_000 },
  '1080p': { width: 1920, height: 1080, fps: 12, videoBitsPerSecond: 8_000_000 },
  '4K':    { width: 3840, height: 2160, fps: 24, videoBitsPerSecond: 20_000_000 },
} as const;
```

**Changes to `VideoProject.exportSettings`** (all optional for backward compat):
```typescript
exportSettings?: {
  quality: 'draft' | 'standard' | 'high';
  format: 'webm' | 'mp4';
  resolution?: '720p' | '1080p' | '4K';  // NEW — defaults to '720p'
  width: number;
  height: number;
  mimeType: string;
  fileName: string;
};
```

**Canvas allocation fallback**: Wrap `canvas.getContext('2d')` in a try-catch. If 4K allocation fails, fall back to 1080p and log a warning.

**Media scoring boost**: In `scoreCandidate()`, add resolution-aware scoring that boosts candidates whose `resolvedWidth` meets or exceeds the target resolution width.

### 7. Pipeline Reliability

**JSON repair consolidation**: Extract the `repairTruncatedJson()` function from `llm.ts` into a shared utility `src/utils/jsonRepair.ts` and import it in `visionCheck.ts`, `qualityScorer.ts`, `focalCropper.ts`, and `llmVisualDirector.ts`. All modules currently have their own copy.

```typescript
// src/utils/jsonRepair.ts
export function repairTruncatedJson(json: string): string
```

**Timeout increase**: Change `VISION_TIMEOUT_MS` and `QUALITY_TIMEOUT_MS` from 15,000 to 20,000 in `visionCheck.ts` and `qualityScorer.ts`.

**CORS proxy fallback in thumbnail/renderer**: Modify `loadImage()` in `thumbnail.ts` and `videoRenderer.ts` to try: (1) `images.weserv.nl` proxy, (2) original URL with `crossOrigin='anonymous'`, (3) procedural background fallback.

**Visual planner fallback**: In `planSegmentVisuals()` (`visualPlanner.ts`), when `aiPlan.shots` is empty or undefined, call `buildFallbackShots()` using the segment's narration text and topic context entities to produce at least 1 shot with concrete queries.

**Broadened query fallback**: In `harvestMediaWithSafetyNet()` (`media.ts`), when all providers return empty for the initial query, attempt a broadened query using `topicContext.coreSubject` before falling back to the Wikipedia thumbnail.

### 8. Dead Code Cleanup (`src/services/media.ts`)

**Remove**:
- `searchUnsplash()` function (lines ~470-485) — replaced by `PicsumAdapter` in provider registry
- `searchPicsum()` function (lines ~490-510) — replaced by `PicsumAdapter`
- `searchFirecrawl()` function (lines ~570-600) — Firecrawl not used, no `firecrawlKey` in `AppConfig`
- `searchSerper()` function (lines ~600-630) — Serper not used, no `serperKey` in `AppConfig`
- `SerperImage` interface
- `FirecrawlItem` interface
- Any `firecrawlKey` or `serperKey` references in config types

**Verification**: `tsc --noEmit` passes, all existing tests pass.

---

## Data Models

### Extended `VideoProject.exportSettings`
```typescript
exportSettings?: {
  quality: 'draft' | 'standard' | 'high';
  format: 'webm' | 'mp4';
  resolution?: '720p' | '1080p' | '4K';       // NEW
  backgroundMusic?: boolean;                    // NEW — defaults to true
  width: number;
  height: number;
  mimeType: string;
  fileName: string;
};
```

### New `VideoDescription` type
```typescript
interface VideoDescription {
  summary: string;      // 2-3 sentences from intro + conclusion
  chapters: string;     // YouTube chapter markers with timestamps
  tags: string[];       // 5-15 tags, each 2-30 chars
  fullDescription: string; // Combined: summary + chapters + tags block
}
```

### Resolution Preset type
```typescript
interface ResolutionPreset {
  width: number;
  height: number;
  fps: number;
  videoBitsPerSecond: number;
}
```

All new fields on `VideoProject` are optional, ensuring existing projects in localStorage load without migration errors.

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Title generation returns valid titles with correct length bounds

*For any* topic string and style string, `generateTitleOptions(topic, style)` SHALL return an array of at least 3 `TitleOption` objects where each title is between 40 and 70 characters inclusive.

**Validates: Requirements 5.1, 11.1**

### Property 2: Chapter timestamps are cumulative sums of segment durations

*For any* array of `ScriptSegment` objects with positive durations, `generateChapterMarkers(segments)` SHALL produce timestamps where each segment's timestamp equals the sum of all preceding segments' durations.

**Validates: Requirements 5.3**

### Property 3: Tag generation produces valid tags within count and character bounds

*For any* `TopicContext` object and style string, `generateTags(topicContext, style)` SHALL return between 5 and 15 tags, where each tag is between 2 and 30 characters and contains only alphanumeric characters, spaces, and hyphens.

**Validates: Requirements 5.4, 5.5**

### Property 4: JSON repair produces parseable JSON

*For any* valid JSON string that has been truncated (trailing characters removed), `repairTruncatedJson(truncated)` SHALL produce a string that `JSON.parse()` can parse without throwing.

**Validates: Requirements 7.1, 7.4**

### Property 5: Visual plan unwrapping extracts fields from nested wrappers

*For any* visual plan object wrapped in `{ "plan": { ...fields } }`, `validateVisualPlan(wrapped, fallbackTopic)` SHALL return a plan with the same `intent` and `visualConcept` values as the inner object.

**Validates: Requirements 7.2**

### Property 6: Fallback shots always produce at least one shot with non-empty queries

*For any* `NarrativeBeat`, entity array, and `TopicContext`, `buildFallbackShots(beat, entities, ctx, queries)` SHALL return at least 1 shot object where `queries` is a non-empty array of non-empty strings.

**Validates: Requirements 7.6**

### Property 7: Ken Burns zoom parameters stay within [1.0, 1.25]

*For any* segment index and asset ID string, `computeKenBurnsParams(segmentIndex, assetId)` SHALL return `zoomStart` and `zoomEnd` values both within the range [1.0, 1.25].

**Validates: Requirements 4.1**

### Property 8: Ken Burns parameters are deterministic

*For any* segment index and asset ID string, calling `computeKenBurnsParams(segmentIndex, assetId)` twice with the same inputs SHALL return identical `KenBurnsConfig` objects.

**Validates: Requirements 10.1**

### Property 9: Consecutive segments have different Ken Burns pan directions

*For any* sequence of two consecutive segment indices with different asset IDs, `computeKenBurnsParams` called for the second segment (with the first segment's pan direction as `prevPanX`/`prevPanY`) SHALL return a pan direction that differs from the first segment's pan direction in at least one axis.

**Validates: Requirements 4.2**

### Property 10: Overlay text truncation

*For any* string, `truncateOverlayText(text, 80)` SHALL return a string of at most 80 characters. If the input exceeds 80 characters, the output SHALL end with '…' and have length exactly 80.

**Validates: Requirements 3.6**

### Property 11: Overlay element scaling is proportional to resolution

*For any* base dimension > 0, base width > 0, and target width > 0, `scaleToResolution(baseDimension, baseWidth, targetWidth)` SHALL return `baseDimension * (targetWidth / baseWidth)`.

**Validates: Requirements 6.3**

### Property 12: Thumbnail background selection picks highest-scored non-fallback asset

*For any* non-empty array of `MediaAsset` objects where at least one has `isFallback !== true`, `selectThumbnailBackground(assets)` SHALL return the asset with the highest `score` among those where `isFallback` is not `true`.

**Validates: Requirements 3.2**

### Property 13: extractKeyPhrase returns a non-empty substring of the input

*For any* non-empty hook line string, `extractKeyPhrase(hookLine)` SHALL return a non-empty string.

**Validates: Requirements 3.5**

### Property 14: Crossfade alpha is monotonically increasing from 0 to 1

*For any* total transition frame count > 0, the sequence `computeCrossfadeAlpha(0, total)` through `computeCrossfadeAlpha(total, total)` SHALL be monotonically non-decreasing, starting at 0.0 and ending at 1.0.

**Validates: Requirements 4.3**

---

## Error Handling

| Scenario | Handling Strategy |
|---|---|
| LLM returns invalid/truncated JSON | `repairTruncatedJson()` attempts repair; falls back to default plan/segments |
| Reka Edge API timeout | 20s timeout with 2 retries; returns `null` on failure, pipeline continues |
| CORS proxy (`images.weserv.nl`) fails | Retry with original URL; fall back to procedural gradient background |
| Background music file missing | Render with narration only; log warning |
| 4K canvas allocation fails | Fall back to 1080p; log warning |
| All media providers return empty | Broaden query to `coreSubject`; fall back to Wikipedia thumbnail; last resort Picsum |
| Visual Director returns 0 shots | `buildFallbackShots()` generates 2 shots from narration + entities |
| Vision check returns garbled JSON | `repairTruncatedJson()` attempts repair; neutral score on failure |
| MediaAsset fails to load during render | Procedural background (gradient + topic text) for that segment |
| Tag generation with empty entities | Generate tags from topic name and style keywords |

All error paths log via the `logger` service at `'warn'` level for diagnosability.

---

## Testing Strategy

### Property-Based Tests (fast-check)

The project uses Vitest. Property-based tests will use [fast-check](https://github.com/dubzzz/fast-check) with a minimum of 100 iterations per property.

Each property test references its design document property:
```typescript
// Feature: video-quality-improvements, Property 1: Title generation returns valid titles with correct length bounds
```

**Properties to test** (14 total — see Correctness Properties section above):
1. Title generation length bounds
2. Chapter timestamp cumulative sums
3. Tag generation count and character constraints
4. JSON repair produces parseable output
5. Visual plan nested unwrapping
6. Fallback shots non-empty queries
7. Ken Burns zoom range [1.0, 1.25]
8. Ken Burns determinism
9. Consecutive pan direction variation
10. Overlay text truncation
11. Overlay scaling proportionality
12. Thumbnail background selection
13. extractKeyPhrase non-empty result
14. Crossfade alpha monotonicity

### Unit Tests (example-based)

- Background music volume computation (15% with narration, 60% without)
- ffmpeg `amix` command construction
- Resolution preset defaults (720p when unspecified)
- UI toggle state management
- Dead code removal verification (grep for removed function names)
- Backward compatibility: `generateTitleOptions(topic, style)` 2-param call
- Backward compatibility: `generateThumbnail(title, topic)` existing signature

### Integration Tests

- Full pipeline run with mocked LLM responses
- Server renderer audio mixing with ffmpeg
- Renderer consistency: same project → same Ken Burns params in both renderers

### Smoke Tests

- 4 audio files exist in `public/audio/`
- `tsc --noEmit` passes after dead code removal
- All existing tests pass after changes
- Timeout constants set to 20,000ms
- Resolution presets contain 720p, 1080p, 4K

### Test Configuration

- Library: fast-check (already available or to be added as dev dependency)
- Minimum iterations: 100 per property test
- Tag format: `Feature: video-quality-improvements, Property {N}: {title}`
