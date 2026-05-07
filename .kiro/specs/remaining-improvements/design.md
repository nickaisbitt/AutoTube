# Design Document: Remaining Improvements

## Overview

This design covers 7 improvements spanning UI enhancements, codebase architecture, and data management for the AutoTube AI video generator. The improvements are grouped into three tracks:

1. **UI Enhancements** (Requirements 1–3): Add a "Regenerate Script" button to ScriptStep, make the "Replace" button always visible on MediaStep asset cards, and verify TopicStep loading/error states.
2. **Codebase Architecture** (Requirements 4–5): Split the 1466-line `server-render.mjs` into focused modules and extract shared drawing logic into a common rendering module used by both browser and server renderers.
3. **Data Management** (Requirements 6–7): Support multiple concurrent projects via project-ID-scoped temp files and add a version field with a migration system to VideoProject.

All changes stay within the existing React + TypeScript + Vite stack. No new npm packages or external APIs are introduced.

## Architecture

### Current State

```
src/components/ScriptStep.tsx    ← No regenerate button
src/components/MediaStep.tsx     ← Replace button hidden behind hover
src/components/TopicStep.tsx     ← Loading states already implemented (verify)
server-render.mjs                ← 1466-line monolith
src/services/videoRenderer.ts    ← Browser renderer with duplicated drawing logic
src/services/captionUtils.ts     ← Shared pure helpers (saturation, captions)
src/store.ts                     ← Fixed /tmp/autotube-project.json path
src/types.ts                     ← VideoProject type without version field
```

### Target State

```
src/components/ScriptStep.tsx    ← + Regenerate Script button + onRegenerate prop
src/components/MediaStep.tsx     ← Replace button always visible (not hover-only)
src/components/TopicStep.tsx     ← Verified loading/error/no-key states (no changes expected)

server-render/                   ← New directory for split modules
  index.mjs                      ← Main orchestration (imports other modules)
  drawing.mjs                    ← Frame drawing helpers (imports from shared)
  narration.mjs                  ← edge-tts narration generation + silence
  audio.mjs                      ← Audio concatenation + background music mixing
  thumbnail.mjs                  ← Thumbnail generation

src/services/renderingShared.ts  ← NEW: Environment-agnostic shared drawing logic
src/services/captionUtils.ts     ← Unchanged (already shared pure helpers)
src/services/videoRenderer.ts    ← Imports from renderingShared.ts

src/store.ts                     ← Project-ID-scoped temp paths + version on create
src/types.ts                     ← + version: number on VideoProject
src/services/projectMigrations.ts ← NEW: Migration registry + sequential migration runner
```

### Architecture Diagram

```mermaid
graph TD
    subgraph UI Components
        SS[ScriptStep] -->|onRegenerate| Store
        MS[MediaStep] -->|onReplace| Store
        TS[TopicStep]
    end

    subgraph Store Layer
        Store[src/store.ts] -->|save project| API[/api/save-project]
        Store -->|load project| Migrations[projectMigrations.ts]
    end

    subgraph Shared Rendering
        RS[renderingShared.ts] -->|generic 2D context| BR[videoRenderer.ts]
        RS -->|generic 2D context| SR[server-render/drawing.mjs]
        CU[captionUtils.ts] --> BR
        CU --> SR
    end

    subgraph Server Renderer Modules
        SRI[server-render/index.mjs] --> SRD[server-render/drawing.mjs]
        SRI --> SRN[server-render/narration.mjs]
        SRI --> SRA[server-render/audio.mjs]
        SRI --> SRT[server-render/thumbnail.mjs]
    end

    API -->|project-ID path| TMP["/tmp/autotube-project-{id}.json"]
```

## Components and Interfaces

### 1. ScriptStep — Regenerate Button

Add an `onRegenerate` callback prop to `ScriptStep`. When `status === 'complete'`, render a "Regenerate Script" button in the header area next to the existing stats row.

```typescript
interface ScriptStepProps {
  project: VideoProject | null;
  status: StepStatus;
  progress: number;
  message: string;
  onNext: () => void;
  onUpdateNarration?: (segmentId: string, text: string) => void;
  onRegenerate?: () => void;  // NEW
}
```

The button:
- Appears only when `status === 'complete'` and `onRegenerate` is provided
- Uses the `RefreshCw` icon from lucide-react (already imported in other components)
- Has `aria-label="Regenerate script"` for accessibility
- Is disabled when `status === 'processing'`
- Calls `onRegenerate()` on click, which the parent (`App.tsx`) wires to `generateScript(topicConfig)`

**Design decision**: The regenerate action reuses the existing `generateScript` function in the store, which already resets downstream steps (media, narration, ai_edit, assembly, preview) to idle. No new store logic is needed.

### 2. MediaStep — Always-Visible Replace Button

The current MediaStep already has a Replace button, but it's hidden behind `opacity-0 group-hover:opacity-100` on the overlay. The change:

- Add a dedicated "Replace" button in the card's metadata area (below the image), always visible
- Keep the existing hover overlay button as a secondary interaction point
- The new button uses the same `handleReplace(asset.id)` handler
- Error display per-card is already implemented via `replaceError` state

**Design decision**: Rather than removing the hover overlay button (which provides a nice quick-action UX), we add a second always-visible button in the card body. This satisfies the "visible without requiring hover" requirement while preserving the existing interaction.

### 3. TopicStep — Loading State Verification

After reviewing the current `TopicStep.tsx` implementation, all three states are already implemented:

| State | Current Implementation | Status |
|-------|----------------------|--------|
| Loading (no topics yet) | `Loader2` spinner + "Generating fresh topic ideas..." | ✅ Present |
| No API key | `KeyRound` icon + instruction message | ✅ Present |
| Error | Error message + "Retry" button | ✅ Present |
| Refresh button | `RefreshCw` icon + "Refresh" / "Generating..." | ✅ Present |
| Success (8 topics) | 2-column grid with category icons | ✅ Present |
| Click to select | `onConfigChange` with topic label | ✅ Present |

**Design decision**: This requirement is a verification task. We write tests to confirm the existing behavior rather than adding new code. If any edge cases are found during testing (e.g., race conditions between refresh and initial load), they'll be fixed.

### 4. Server Renderer Module Split

Split `server-render.mjs` (1466 lines) into 5 focused modules:

#### `server-render/drawing.mjs` (~400 lines)
Exports:
- `drawProceduralBackground(ctx, seg, progress)` — procedural cinematic backgrounds
- `drawFrame(ctx, seg, asset, img, progress, project, globalProgress)` — main frame compositor
- `drawTitleCardFrame(ctx, title, topic, progress)` — intro title card
- `drawEndScreenFrame(ctx, title, progress)` — end screen
- `drawTechnicalLabel(ctx, asset, barH)` — technical product label badge

Imports shared logic from `src/services/renderingShared.ts` for Ken Burns calculations, letterbox bars, vignette overlay, and caption window computation.

#### `server-render/narration.mjs` (~80 lines)
Exports:
- `generateNarration(segments, outputDir)` — generates narration audio with edge-tts
- `generateSilence(outputPath, durationSec)` — generates silence segments with ffmpeg

#### `server-render/audio.mjs` (~50 lines)
Exports:
- `concatenateAudio(audioFiles, outputFile)` — combines audio files with ffmpeg concat
- `mixWithBackgroundMusic(videoFile, narrationFile, bgMusicPath, outputFile, duration)` — mixes narration + background music

#### `server-render/thumbnail.mjs` (~120 lines)
Exports:
- `generateThumbnail(project, imgCache, fetchImage, fetchVideoFrame, outputDir)` — generates thumbnail PNG

#### `server-render/index.mjs` (~300 lines)
The main orchestrator:
- `fetchProject()` — fetches project from dev server
- `fetchImage(url)` / `fetchVideoFrame(clipUrl, timestamp, thumbnailUrl)` — image loading
- `render()` — main render loop that coordinates all modules

**Design decision**: The modules remain as `.mjs` files (not TypeScript) because `server-render.mjs` runs as a standalone Node.js script outside the Vite build pipeline. It uses `node-canvas` which has a different API from browser Canvas. The shared rendering logic bridge (in TypeScript) handles the abstraction.

### 5. Shared Rendering Module

Create `src/services/renderingShared.ts` containing environment-agnostic drawing logic.

```typescript
/**
 * Generic 2D rendering context interface.
 * Compatible with both browser CanvasRenderingContext2D and node-canvas's Context2d.
 */
export interface RenderContext2D {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  globalAlpha: number;
  lineWidth: number;
  filter: string;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;

  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number, maxWidth?: number): void;
  measureText(text: string): TextMetrics;
  beginPath(): void;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  fill(): void;
  stroke(): void;
  rect(x: number, y: number, w: number, h: number): void;
  clip(): void;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  scale(sx: number, sy: number): void;
  drawImage(image: unknown, dx: number, dy: number, dw?: number, dh?: number): void;
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): CanvasGradient;
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): CanvasGradient;
  arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void;
}

// Shared pure functions:
export function computeKenBurnsTransform(
  progress: number,
  imgW: number, imgH: number,
  canvasW: number, canvasH: number,
  kenBurns?: { zoomStart: number; zoomEnd: number; panDirectionX: number; panDirectionY: number },
  isSecondaryShot?: boolean,
): { zoom: number; panX: number; panY: number; scale: number; dw: number; dh: number };

export function drawLetterboxBars(
  ctx: RenderContext2D, w: number, h: number,
  segType: string, accentColors: Record<string, string>,
): number; // returns barH

export function drawVignette(ctx: RenderContext2D, w: number, h: number): void;

export function drawProgressBar(
  ctx: RenderContext2D, w: number, h: number,
  progress: number, accentColor: string,
): void;

export function wrapText(
  ctx: RenderContext2D, text: string,
  x: number, y: number, maxW: number, lineH: number,
): void;

export function roundRect(
  ctx: RenderContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void;

export function hexToRgba(hex: string, alpha: number): string;
```

**Design decision**: The shared module uses a `RenderContext2D` interface that covers the subset of `CanvasRenderingContext2D` methods used by both renderers. This avoids importing browser-specific types in the server renderer and node-canvas types in the browser renderer. The `drawImage` method accepts `unknown` because the image type differs between environments (HTMLImageElement vs node-canvas Image).

Functions that remain environment-specific (not shared):
- `drawProceduralBackground` — the server version uses fewer particles (60 vs 120) and different constants. The shared module provides the palette lookup and particle position calculations, but the actual drawing loop stays in each renderer.
- Image loading / caching — fundamentally different between `fetch` + `<img>` (browser) and `node-canvas loadImage` (server)
- Frame capture — `canvas.toDataURL()` (browser) vs `canvas.toBuffer('raw')` (server)

### 6. Project-ID-Scoped Temp Files

```typescript
// src/services/projectPaths.ts (NEW)
export function getProjectTempPath(projectId: string): string {
  return `/tmp/autotube-project-${projectId}.json`;
}
```

Changes to `src/store.ts`:
- `saveProjectForServer(project)` uses `getProjectTempPath(project.id)` instead of hardcoded path
- Pass project ID to the `/api/save-project` endpoint as a query parameter

Changes to `vite.config.ts`:
- `/api/save-project?id={projectId}` writes to `/tmp/autotube-project-{projectId}.json`
- `/api/export-project?id={projectId}` reads from the same path

Changes to `server-render/index.mjs`:
- Accept project file path as CLI argument or derive from project ID
- Clean up the project-specific temp file after render completes

**Design decision**: Using the existing `VideoProject.id` field (which is a `crypto.randomUUID()`) as the scoping key. This is already unique per project and doesn't require any new ID generation.

### 7. Project Format Versioning

```typescript
// src/types.ts — add to VideoProject
export interface VideoProject {
  version: number;  // NEW — current schema version
  // ... existing fields
}

// src/services/projectMigrations.ts (NEW)
export const CURRENT_PROJECT_VERSION = 1;

type MigrationFn = (project: Record<string, unknown>) => Record<string, unknown>;

const migrations: Map<number, MigrationFn> = new Map();

// Register a migration from version N to N+1
export function registerMigration(fromVersion: number, fn: MigrationFn): void {
  migrations.set(fromVersion, fn);
}

// Apply all migrations from project's version to current
export function migrateProject(project: Record<string, unknown>): VideoProject {
  let version = typeof project.version === 'number' ? project.version : 0;
  let current = { ...project };

  if (version > CURRENT_PROJECT_VERSION) {
    console.warn(`Project version ${version} is newer than current ${CURRENT_PROJECT_VERSION}`);
    return current as unknown as VideoProject;
  }

  while (version < CURRENT_PROJECT_VERSION) {
    const migrationFn = migrations.get(version);
    if (migrationFn) {
      current = migrationFn(current);
    }
    version++;
    current.version = version;
  }

  return current as unknown as VideoProject;
}

// Initial migration: v0 → v1 (add version field)
registerMigration(0, (project) => ({
  ...project,
  version: 1,
}));
```

Changes to `src/store.ts`:
- When creating a new `VideoProject`, set `version: CURRENT_PROJECT_VERSION`
- In `validateStoredProject`, call `migrateProject` on the loaded project data
- The migration runs before the existing validation logic

**Design decision**: The migration system uses a simple `Map<number, MigrationFn>` registry. Each migration transforms from version N to N+1. This is extensible — adding a new migration just requires calling `registerMigration(N, fn)` without modifying existing migrations. The initial v0→v1 migration is a no-op (just adds the version field) since the current schema is the baseline.

## Data Models

### VideoProject (Updated)

```typescript
export interface VideoProject {
  version: number;          // NEW — schema version (starts at 1)
  id: string;
  title: string;
  topic: string;
  style: 'business_insider' | 'warfront' | 'documentary' | 'explainer';
  targetDuration: number;
  script: ScriptSegment[];
  media: MediaAsset[];
  narration: NarrationClip[];
  thumbnail?: string;
  status: 'draft' | 'processing' | 'complete';
  createdAt: Date;
  exportSettings?: { /* unchanged */ };
  topicContext?: TopicContext;
  visualPlans?: Record<string, SegmentVisualPlan>;
  editPlan?: EditPlan;
  logs?: SystemLog[];
}
```

### Project Temp File Path

```
Before: /tmp/autotube-project.json                    (fixed, shared)
After:  /tmp/autotube-project-{uuid}.json             (per-project)
```

### Migration Registry

```typescript
// Conceptual model
Map<number, (project: object) => object>
// Key: source version number
// Value: function that transforms project from version N to N+1
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Shared drawing functions accept any valid generic context

*For any* valid `RenderContext2D`-compatible mock object and any valid `ScriptSegment` with progress in [0, 1], calling the shared drawing functions (`drawLetterboxBars`, `drawVignette`, `drawProgressBar`, `wrapText`, `roundRect`, `hexToRgba`, `computeKenBurnsTransform`) should execute without throwing errors.

**Validates: Requirements 5.5**

### Property 2: Ken Burns transform produces bounded output

*For any* valid image dimensions (w > 0, h > 0), canvas dimensions (w > 0, h > 0), progress in [0, 1], and optional KenBurnsParams, `computeKenBurnsTransform` should produce a zoom value ≥ 1.0, and pan offsets within reasonable bounds (|panX| < canvasWidth, |panY| < canvasHeight).

**Validates: Requirements 5.7**

### Property 3: Project-ID-scoped temp paths are unique and well-formed

*For any* two distinct non-empty project ID strings, `getProjectTempPath` should produce two different file paths, each containing its respective project ID and matching the pattern `/tmp/autotube-project-{id}.json`.

**Validates: Requirements 6.1, 6.2, 6.5**

### Property 4: Migration system brings any older version to current

*For any* valid VideoProject-like object with a version field in [0, CURRENT_PROJECT_VERSION), `migrateProject` should produce an object with `version === CURRENT_PROJECT_VERSION` and preserve all existing fields that are not modified by migrations.

**Validates: Requirements 7.3, 7.4**

## Error Handling

### ScriptStep Regeneration
- If `generateScript` throws, the store sets `script` step status to `'error'` and populates `processingMessage` with the error. The ScriptStep displays this message and re-enables the Regenerate button.
- If the user cancels (AbortSignal), the step resets to `'active'` with no error message.

### MediaStep Replace
- If `replaceMediaAsset` throws, the `handleReplace` function in MediaStep catches the error and stores it in `replaceError[assetId]`. An inline error message appears on the affected card.
- Other cards remain unaffected — the error state is per-asset.

### TopicStep Loading
- If `generateTopicIdeas` throws, `topicError` is set and a Retry button is shown.
- If the API key is missing, a static message is shown (no API call attempted).

### Server Renderer Module Split
- Each module validates its inputs and throws descriptive errors.
- The main orchestrator catches module-level errors and reports them via stdout (for SSE progress streaming).
- If a module fails, the orchestrator logs the error and continues with remaining modules where possible (e.g., thumbnail failure doesn't block video output).

### Project Migration
- If a migration function throws, the error is caught and the project is returned at its current version with a warning logged.
- If the project version is higher than `CURRENT_PROJECT_VERSION`, a warning is logged and the project is loaded as-is (forward compatibility).
- If the project has no `version` field, it's treated as version 0.

### Concurrent Project Files
- If two projects write to the same temp path (impossible with UUID-based IDs, but defensive), the last write wins. The server renderer reads the file atomically.
- If the temp file is missing when the server renderer starts, it returns a clear error message.

## Testing Strategy

### Property-Based Tests (fast-check, minimum 100 iterations each)

| Property | Test File | What It Tests |
|----------|-----------|---------------|
| Property 1: Generic context acceptance | `renderingShared.pbt.test.ts` | Shared drawing functions work with mock contexts |
| Property 2: Ken Burns bounded output | `renderingShared.pbt.test.ts` | Transform calculations stay within bounds |
| Property 3: Temp path uniqueness | `projectPaths.pbt.test.ts` | Project-ID-scoped paths are unique and well-formed |
| Property 4: Migration correctness | `projectMigrations.pbt.test.ts` | Migration system brings any version to current |

Each property test will:
- Use `fast-check` for input generation
- Run minimum 100 iterations
- Tag with: `Feature: remaining-improvements, Property {N}: {description}`

### Unit Tests (vitest)

| Area | Test File | What It Tests |
|------|-----------|---------------|
| ScriptStep regenerate button | `ScriptStep.test.tsx` | Button renders when complete, calls onRegenerate, disabled during processing |
| MediaStep replace button visibility | `MediaStep.test.tsx` | Replace button always visible, not just on hover |
| TopicStep loading states | `TopicStep.test.tsx` | Loading spinner, no-key message, error + retry, success grid |
| Server renderer module exports | `server-render.test.mjs` | Each module exports expected functions |
| Project migrations | `projectMigrations.test.ts` | v0→v1 migration, future version warning, extensibility |
| Project temp paths | `projectPaths.test.ts` | Path construction, edge cases (empty ID, special chars) |
| hexToRgba | `renderingShared.test.ts` | Correct RGBA string output |

### Integration Tests

| Area | What It Tests |
|------|---------------|
| Server renderer end-to-end | Split modules produce valid video output |
| Save/export endpoints | Project-ID-scoped file paths work correctly |
| Store + migrations | Loading a legacy project triggers migration before validation |
