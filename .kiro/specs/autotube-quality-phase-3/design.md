# Design Document

## Overview

This design addresses all Priority 1 quality issues to bring AutoTube's video output from D-grade to A+ grade. The changes span three domains: (1) visual system overhaul — reliable image loading, diverse scene layouts, proper resolution/encoding, and safe zone compliance; (2) script quality — purpose tagging, pacing scores, promise-payoff validation, and rhetorical variety; (3) production quality — background music fallback and H.264/MP4 encoding. All changes work within the existing codebase dependencies (no new external APIs).

## Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Pipeline Orchestration (store.ts)            │
│  generateScript → reviewAndImproveScript → sourceMedia → render    │
└──────┬──────────────────┬──────────────────┬───────────────────┬────┘
       │                  │                  │                   │
       ▼                  ▼                  ▼                   ▼
┌──────────────┐  ┌───────────────┐  ┌──────────────┐  ┌──────────────────┐
│  llm.ts      │  │ visualPlanner │  │ media.ts     │  │ Renderers        │
│              │  │ .ts (NEW)     │  │              │  │                  │
│ Script Gen   │  │               │  │ Image Fetch  │  │ server-render.mjs│
│ Script Review│  │ Layout Assign │  │ & Cache      │  │ videoRenderer.ts │
│ Purpose Tags │  │ Variety Check │  │              │  │                  │
│ Pacing Score │  │ Retention     │  │              │  │ Scene Layouts    │
│ Enrichment   │  │ Beat Schedule │  │              │  │ Safe Zones       │
│              │  │               │  │              │  │ Title Wrapping   │
└──────────────┘  └───────────────┘  └──────────────┘  └──────────────────┘
                                                              │
                                                              ▼
                                                       ┌──────────────┐
                                                       │ renderingShared│
                                                       │ .ts           │
                                                       │               │
                                                       │ Resolution    │
                                                       │ Presets       │
                                                       │ Safe Zone     │
                                                       │ Layout Funcs  │
                                                       │ Title Wrap    │
                                                       └──────┬───────┘
                                                              │
                                                              ▼
                                                       ┌──────────────┐
                                                       │ audio.mjs    │
                                                       │              │
                                                       │ BG Music     │
                                                       │ Fallback     │
                                                       │ Mixing       │
                                                       └──────────────┘
```

### Data Flow

1. **Script Generation** (`llm.ts`): `generateAIScript()` produces segments → `reviewAndImproveScript()` enriches them → new `assignPurposeTags()` labels each segment → new `computePacingScores()` scores each segment's energy level.

2. **Visual Planning** (enhanced `visualPlanner.ts` or new module in `renderingShared.ts`): `assignSceneLayouts()` takes segments with purpose tags and pacing scores → assigns one of 5 Scene_Layout types per segment → enforces no-consecutive-duplicate constraint → `scheduleRetentionBeats()` ensures hooks every 15-25 seconds.

3. **Image Preloading** (`server-render.mjs`): Enhanced `fetchImage()` with 15s timeout, 3 retries, exponential backoff, and direct HTTPS fallback. All images preloaded before any frame rendering begins.

4. **Frame Rendering** (both renderers): Each frame rendered using the assigned Scene_Layout. Title card uses word-boundary wrapping with safe zone margins. All text has contrast overlays. Safe zone margins enforced for all overlays.

5. **Encoding** (`server-render.mjs`): ffmpeg pipe uses libx264/MP4 instead of libvpx-vp9/WebM. Resolution presets updated to 24 FPS across the board. Default resolution is 1080p.

6. **Audio** (`server-render/audio.mjs`): Background music resolver falls back to `ambient-bg.aac` when style-specific files are missing.

## File Changes

### Modified Files

1. **`src/services/renderingShared.ts`**
   - Update `RESOLUTION_PRESETS`: 720p → 24fps/6Mbps, 1080p → 24fps/10Mbps, 4K stays 24fps
   - Add `SceneLayoutType` type and `SCENE_LAYOUTS` constant
   - Add `assignSceneLayouts(segments)` function that maps segments to layouts based on purpose tags, enforcing no-consecutive-duplicate constraint
   - Add `computeSafeZone(width, height)` function returning `{ top, bottom, left, right }` margins scaled to resolution
   - Add `wrapTitleText(ctx, title, maxWidth, fontSize)` function that wraps at word boundaries and reduces font size if >3 lines
   - Add `computePacingScore(narration)` pure function returning 1-5 based on sentence length variance, punctuation density, and intensity words
   - Add `assignPurposeTag(segment)` function that classifies a segment into one of the defined purpose tags based on content heuristics
   - Add `scheduleRetentionBeats(segments, fps)` function that identifies 25-second windows without hooks and marks insertion points

2. **`src/types.ts`**
   - Add optional `purposeTag?: SegmentPurposeTag` field to `ScriptSegment`
   - Add optional `pacingScore?: number` field to `ScriptSegment`
   - Add optional `sceneLayout?: SceneLayoutType` field to `ScriptSegment`
   - Add `SegmentPurposeTag` type union
   - Add `SceneLayoutType` type union

3. **`server-render.mjs`**
   - Update `RESOLUTION_PRESETS` to match `renderingShared.ts` (720p→24fps, 1080p→24fps)
   - Change default resolution from 720p to 1080p
   - Replace `fetchImage()` with enhanced version: 15s timeout, 3 retries with exponential backoff, direct HTTPS fallback
   - Change ffmpeg pipe from `libvpx-vp9` to `libx264 -preset fast -crf 23` with `.mp4` output
   - Update hardcoded frame counts (`SEGMENT_TITLE_FRAMES = 9`, `COLD_OPEN_FRAMES = 12`) to use `Math.round(seconds * FPS)` dynamically
   - Add scene layout rendering functions: `drawStatCard()`, `drawQuoteCard()`, `drawLeftTextRightImage()`, `drawLowerThirdOverlay()`, `drawCenteredText()`
   - Update `drawTitleCardFrame()` to use `wrapTitleText()` logic with safe zone margins
   - Add safe zone margin enforcement to all text/overlay positioning
   - Add contrast overlay behind all text rendered over image backgrounds

4. **`src/services/videoRenderer.ts`**
   - Update default resolution fallback to 1080p
   - Import and use `wrapTitleText()`, `computeSafeZone()`, and scene layout functions from `renderingShared.ts`
   - Add scene layout rendering to match server renderer

5. **`src/services/llm.ts`**
   - After `reviewAndImproveScript()`, call `assignPurposeTags()` and `computePacingScores()` on the returned segments
   - Enhance the review prompt to include promise-payoff validation, specificity enrichment, and rhetorical variety checking

6. **`src/store.ts`**
   - After script review, call `assignSceneLayouts()` on segments and store the layout assignments on the project
   - Call `scheduleRetentionBeats()` and log beat placements

7. **`server-render/audio.mjs`**
   - Update `resolveBackgroundMusicPath()` to fall back to `ambient-bg.aac` when the style-specific file doesn't exist

### New Files

None — all changes are modifications to existing files to keep the codebase cohesive.

## Detailed Design

### 1. Resolution Presets Update (Requirement 6, 7)

Update `RESOLUTION_PRESETS` in both `renderingShared.ts` and `server-render.mjs`:

```typescript
export const RESOLUTION_PRESETS = {
  '720p':  { width: 1280, height: 720,  fps: 24, videoBitsPerSecond: 6_000_000 },
  '1080p': { width: 1920, height: 1080, fps: 24, videoBitsPerSecond: 10_000_000 },
  '4K':    { width: 3840, height: 2160, fps: 24, videoBitsPerSecond: 20_000_000 },
} as const;
```

Default resolution changes from `'720p'` to `'1080p'` in both renderers.

### 2. H.264/MP4 Encoding (Requirement 7)

In `server-render.mjs`, replace the ffmpeg spawn args:

```javascript
// Before:
const ffmpeg = spawn('ffmpeg', [
  '-y', '-f', 'rawvideo', '-vcodec', 'rawvideo',
  '-s', `${WIDTH}x${HEIGHT}`, '-pix_fmt', 'rgba', '-r', String(FPS),
  '-i', 'pipe:0',
  '-c:v', 'libvpx-vp9', '-b:v', videoBitrate, '-pix_fmt', 'yuv420p',
  OUTPUT_FILE,  // .webm
]);

// After:
const ffmpeg = spawn('ffmpeg', [
  '-y', '-f', 'rawvideo', '-vcodec', 'rawvideo',
  '-s', `${WIDTH}x${HEIGHT}`, '-pix_fmt', 'rgba', '-r', String(FPS),
  '-i', 'pipe:0',
  '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
  '-b:v', videoBitrate, '-pix_fmt', 'yuv420p',
  OUTPUT_FILE,  // .mp4
]);
```

The default output filename changes from `.webm` to `.mp4`.

### 3. Enhanced Image Loading (Requirement 1)

Replace the current `fetchImage()` in `server-render.mjs`:

```javascript
async function fetchImage(url, retries = 3, timeoutMs = 15000) {
  if (imageCache.has(url)) return imageCache.get(url);

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Attempt 1: proxy fetch
      const proxyUrl = `http://localhost:5173/api/proxy-image?url=${encodeURIComponent(url)}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const img = await loadImage(proxyUrl);
      clearTimeout(timer);
      imageCache.set(url, img);
      return img;
    } catch (err) {
      if (attempt < retries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  // Secondary fallback: direct HTTPS fetch (bypasses proxy)
  if (url.startsWith('https://')) {
    try {
      const img = await loadImage(url);
      imageCache.set(url, img);
      return img;
    } catch (err) {
      console.warn(`  ⚠ Direct fetch also failed: ${url.substring(0, 60)} — ${err.message}`);
    }
  }

  console.warn(`  ⚠ All attempts failed for: ${url.substring(0, 60)}`);
  return null;
}
```

### 4. Title Card Text Wrapping (Requirement 2)

Add to `renderingShared.ts`:

```typescript
export interface WrappedTitleResult {
  lines: string[];
  fontSize: number;
}

export function wrapTitleText(
  ctx: RenderContext2D,
  title: string,
  canvasWidth: number,
  baseFontSize: number,
): WrappedTitleResult {
  const safeMargin = canvasWidth * 0.1; // 10% each side
  const maxWidth = canvasWidth - safeMargin * 2;
  let fontSize = baseFontSize;

  for (let pass = 0; pass < 2; pass++) {
    ctx.font = `bold ${fontSize}px sans-serif`;
    const words = title.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      if (ctx.measureText(testLine).width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);

    if (lines.length <= 3 || pass === 1) {
      return { lines, fontSize };
    }

    // Reduce font size by 20% and retry
    fontSize = Math.round(baseFontSize * 0.8);
  }

  // Fallback (should not reach here)
  return { lines: [title], fontSize };
}
```

### 5. Scene Layout System (Requirement 3)

Add to `renderingShared.ts`:

```typescript
export type SceneLayoutType =
  | 'centered-text'
  | 'left-text-right-image'
  | 'lower-third-overlay'
  | 'stat-card'
  | 'quote-card';

export function assignSceneLayouts(
  segments: Array<{ type: string; purposeTag?: string; narration?: string }>,
): SceneLayoutType[] {
  const layouts: SceneLayoutType[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const prevLayout = i > 0 ? layouts[i - 1] : null;

    // Content-aware preference
    let preferred: SceneLayoutType = 'centered-text';
    if (seg.purposeTag === 'stat_hook' || hasStatisticalContent(seg.narration || '')) {
      preferred = 'stat-card';
    } else if (seg.type === 'transition' || seg.purposeTag === 'transition_bridge') {
      preferred = 'lower-third-overlay';
    } else if (seg.purposeTag === 'human_story') {
      preferred = 'quote-card';
    } else if (seg.type === 'section') {
      preferred = 'left-text-right-image';
    }

    // No-consecutive-duplicate constraint
    if (preferred === prevLayout) {
      const alternatives: SceneLayoutType[] = [
        'centered-text', 'left-text-right-image', 'lower-third-overlay',
        'stat-card', 'quote-card',
      ].filter(l => l !== prevLayout);
      preferred = alternatives[i % alternatives.length];
    }

    layouts.push(preferred);
  }

  return layouts;
}

function hasStatisticalContent(text: string): boolean {
  return /\$[\d,.]+|\d+%|\d{4}|\d+\s*(billion|million|trillion)/i.test(text);
}
```

### 6. Safe Zone Computation (Requirement 5)

Add to `renderingShared.ts`:

```typescript
export interface SafeZone {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export function computeSafeZone(width: number, height: number): SafeZone {
  // Reference: 1080p = 1920×1080, top=40px, bottom=60px
  const scale = height / 1080;
  return {
    top: Math.round(40 * scale),
    bottom: Math.round(60 * scale),
    left: Math.round(width * 0.05),
    right: Math.round(width * 0.05),
  };
}
```

### 7. Pacing Score Computation (Requirement 13)

Add to `renderingShared.ts`:

```typescript
export function computePacingScore(narration: string): number {
  if (!narration || narration.trim().length === 0) return 3;

  const sentences = narration.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const avgWordCount = sentences.reduce((sum, s) => sum + s.trim().split(/\s+/).length, 0) / Math.max(1, sentences.length);

  // Punctuation density (! and ? per 100 chars)
  const punctDensity = ((narration.match(/[!?]/g) || []).length / narration.length) * 100;

  // Intensity words
  const intensityWords = /\b(urgent|critical|breaking|shocking|devastating|explosive|catastrophic|terrifying|alarming|unprecedented)\b/gi;
  const intensityCount = (narration.match(intensityWords) || []).length;

  let score = 3; // baseline
  if (avgWordCount < 8) score += 1;   // short sentences = higher energy
  if (avgWordCount > 15) score -= 1;  // long sentences = lower energy
  if (punctDensity > 2) score += 1;   // lots of ! and ?
  if (intensityCount >= 2) score += 1; // intense language

  return Math.max(1, Math.min(5, score));
}
```

### 8. Purpose Tag Assignment (Requirement 11)

Add to `renderingShared.ts`:

```typescript
export type SegmentPurposeTag =
  | 'stat_hook'
  | 'history'
  | 'moat'
  | 'risk'
  | 'prediction'
  | 'human_story'
  | 'competitive_analysis'
  | 'transition_bridge'
  | 'conclusion';

export function assignPurposeTag(
  segment: { type: string; narration: string; title: string },
): SegmentPurposeTag {
  const text = `${segment.title} ${segment.narration}`.toLowerCase();

  if (segment.type === 'transition') return 'transition_bridge';
  if (segment.type === 'outro') return 'conclusion';

  // Content heuristics
  if (/\$[\d,.]+|\d+%|\d+\s*(billion|million|trillion)/i.test(text)) return 'stat_hook';
  if (/\b(risk|threat|danger|warning|concern|vulnerability)\b/i.test(text)) return 'risk';
  if (/\b(predict|forecast|future|will\s+be|by\s+20\d{2})\b/i.test(text)) return 'prediction';
  if (/\b(history|founded|began|started|origin|early\s+days)\b/i.test(text)) return 'history';
  if (/\b(compet|rival|versus|vs\.|alternative|challenger)\b/i.test(text)) return 'competitive_analysis';
  if (/\b(moat|advantage|dominan|monopol|barrier)\b/i.test(text)) return 'moat';
  if (/[A-Z][a-z]+ [A-Z][a-z]+/.test(segment.narration)) return 'human_story';

  return 'stat_hook'; // default for section segments
}
```

### 9. Retention Beat Scheduling (Requirement 14)

Add to `renderingShared.ts`:

```typescript
export interface RetentionBeat {
  segmentIndex: number;
  timeOffsetSec: number;
  type: 'visual_break' | 'stat_callout' | 'rehook_line';
}

export function scheduleRetentionBeats(
  segments: Array<{ duration: number; narration?: string }>,
): RetentionBeat[] {
  const beats: RetentionBeat[] = [];
  let cumulativeTime = 0;
  let lastBeatTime = 0;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const segEnd = cumulativeTime + seg.duration;

    // Check if this segment contains a natural hook (question, stat, dramatic phrase)
    const hasNaturalHook = seg.narration && (
      /\?/.test(seg.narration) ||
      /\$[\d,.]+|\d+%/.test(seg.narration) ||
      /but (here's|that's not|wait)|and it gets worse/i.test(seg.narration)
    );

    if (hasNaturalHook) {
      lastBeatTime = cumulativeTime + seg.duration / 2;
    }

    // If we've gone >25 seconds without a beat, insert one
    if (segEnd - lastBeatTime > 25) {
      beats.push({
        segmentIndex: i,
        timeOffsetSec: cumulativeTime + seg.duration / 2,
        type: 'visual_break',
      });
      lastBeatTime = cumulativeTime + seg.duration / 2;
    }

    cumulativeTime = segEnd;
  }

  return beats;
}
```

### 10. Background Music Fallback (Requirement 8)

Update `resolveBackgroundMusicPath()` in `server-render/audio.mjs`:

```javascript
export function resolveBackgroundMusicPath(style) {
  const filename = BG_MUSIC_MAP[style];
  if (filename) {
    const stylePath = join(PROJECT_ROOT, 'public', 'audio', filename);
    if (existsSync(stylePath)) return stylePath;
  }
  // Fallback to generic ambient track
  const fallbackPath = join(PROJECT_ROOT, 'public', 'audio', 'ambient-bg.aac');
  return existsSync(fallbackPath) ? fallbackPath : null;
}
```

### 11. Dynamic Frame Count Calculations (Requirement 6.6)

In `server-render.mjs`, replace hardcoded frame counts:

```javascript
// Before:
const SEGMENT_TITLE_FRAMES = 9;  // 1.5 seconds at 6fps
const COLD_OPEN_FRAMES = 12;     // 2 seconds at 6fps

// After:
const SEGMENT_TITLE_SECONDS = 1.5;
const COLD_OPEN_SECONDS = 2;
const SEGMENT_TITLE_FRAMES = Math.round(SEGMENT_TITLE_SECONDS * FPS);
const COLD_OPEN_FRAMES = Math.round(COLD_OPEN_SECONDS * FPS);
```

## Correctness Properties

### Property 1: Title Text Never Exceeds Safe Zone Width (Requirement 2.1, 2.2)

For all title strings and canvas widths, every line produced by `wrapTitleText()` must have a measured width ≤ the available safe zone width (canvas width minus 20% margins).

**Test approach:** Property-based test generating random title strings (1-200 characters) and canvas widths (640-3840). For each, call `wrapTitleText()` and verify every returned line measures within bounds using a mock context.

### Property 2: No Consecutive Scene Layouts Are Identical (Requirement 3.2)

For all segment arrays of length ≥ 2, `assignSceneLayouts()` must never return the same layout for adjacent indices.

**Test approach:** Property-based test generating random segment arrays (2-20 segments) with random types and purpose tags. Verify `layouts[i] !== layouts[i+1]` for all valid i.

### Property 3: Stat-Heavy Segments Prefer Stat-Card Layout (Requirement 3.3)

For any segment whose narration contains a dollar amount, percentage, or large number, `assignSceneLayouts()` should assign `'stat-card'` unless prevented by the no-consecutive-duplicate constraint.

**Test approach:** Property-based test generating segments where at least one has statistical content. Verify that segment gets `'stat-card'` when the previous segment has a different layout.

### Property 4: Safe Zone Scales Proportionally With Resolution (Requirement 5.1, 5.2)

For all resolution heights, `computeSafeZone()` must return margins that scale linearly from the 1080p reference values (top=40, bottom=60).

**Test approach:** Property-based test generating random heights (360-4320). Verify `safeZone.bottom === Math.round(60 * height / 1080)` and `safeZone.top === Math.round(40 * height / 1080)`.

### Property 5: All Resolution Presets Specify 24 FPS (Requirement 6.1, 6.2, 6.3)

All entries in `RESOLUTION_PRESETS` must have `fps === 24`.

**Test approach:** Example test iterating over all preset keys and asserting `fps === 24`.

### Property 6: Pacing Score Is Always In [1, 5] (Requirement 13.1)

For all narration strings, `computePacingScore()` must return an integer in the range [1, 5].

**Test approach:** Property-based test generating random narration strings (0-2000 characters, including edge cases like empty strings, all punctuation, single words). Verify result is an integer in [1, 5].

### Property 7: Purpose Tags Are From Valid Set (Requirement 11.1)

For all segments, `assignPurposeTag()` must return a value from the defined `SegmentPurposeTag` union.

**Test approach:** Property-based test generating random segments with various types, titles, and narration content. Verify the returned tag is in the valid set.

### Property 8: Dynamic Frame Counts Equal Duration Times FPS (Requirement 6.6)

For all FPS values and segment durations, computed frame counts must equal `Math.round(duration * fps)`.

**Test approach:** Property-based test generating random FPS (1-60) and duration (0.1-30) values. Verify `Math.round(duration * fps)` matches the computed frame count.

### Property 9: Retention Beats Cover Every 25-Second Window (Requirement 14.1)

For all segment arrays with total duration > 30 seconds, `scheduleRetentionBeats()` must ensure no 25-second window is without a beat (either natural or inserted).

**Test approach:** Property-based test generating random segment arrays (3-15 segments, 5-25 seconds each). Verify that for every 25-second window in the timeline, at least one beat exists.

### Property 10: Scene Layout Assignment Produces Exactly One Layout Per Segment (Requirement 3.5)

For all segment arrays, `assignSceneLayouts()` must return an array of the same length as the input, with each element being a valid `SceneLayoutType`.

**Test approach:** Property-based test generating random segment arrays (1-20 segments). Verify output length matches input length and all values are valid layout types.
