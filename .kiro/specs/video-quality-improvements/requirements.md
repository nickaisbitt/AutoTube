# Requirements Document

## Introduction

AutoTube is a browser-based AI video generator that takes a topic, generates a script (via Gemini Flash on OpenRouter), harvests media assets from free sources (DuckDuckGo, Wikimedia, Flickr, GovPress), generates narration (edge-tts), and assembles everything into a video using both a server-side renderer (`server-render.mjs` with node-canvas + ffmpeg) and a browser-side renderer (`src/services/videoRenderer.ts`).

This document specifies comprehensive quality improvements across eight areas: script quality, background music, thumbnail generation, motion graphics and visual variety, YouTube SEO metadata, higher-resolution rendering, pipeline reliability, and dead code cleanup. Together these improvements aim to bring AutoTube output to a competitive standard against top YouTube channels in the same topic space.

### Constraints

- OpenRouter is the only paid API (single key for Gemini Flash and Reka Edge).
- Flickr is optional (free tier). All other media sources must be free.
- System fonts only (no Google Fonts — content blocker environment).
- Both server-side and browser-side renderers must remain consistent.

---

## Glossary

- **Script_Generator**: The service in `src/services/llm.ts` that produces `ScriptSegment[]` via Gemini Flash on OpenRouter.
- **Segment**: A `ScriptSegment` object with fields `id`, `type`, `title`, `narration`, `visualNote`, `duration`, and optional `chapterLabel`.
- **Visual_Director**: The service in `src/services/llmVisualDirector.ts` that generates per-segment visual plans via Gemini Flash.
- **Visual_Planner**: The service in `src/services/visualPlanner.ts` that resolves topic context and plans segment visuals.
- **Media_Harvester**: The pipeline in `src/services/media.ts` that sources, scores, and selects media assets.
- **Provider_Registry**: The aggregator in `src/services/sourceProviders/index.ts` that queries all media source providers in parallel.
- **Quality_Scorer**: The service in `src/services/qualityScorer.ts` that uses Reka Edge for multi-factor image quality assessment.
- **Vision_Checker**: The service in `src/services/visionCheck.ts` that uses Reka Edge to validate image quality and relevance.
- **Video_Renderer**: The browser-side rendering pipeline in `src/services/videoRenderer.ts`.
- **Server_Renderer**: The server-side rendering pipeline in `server-render.mjs` using node-canvas + ffmpeg.
- **Thumbnail_Generator**: The service in `src/services/thumbnail.ts` that renders YouTube thumbnail images.
- **SEO_Title_Generator**: The service in `src/services/seoTitles.ts` that produces title options and extracts data points.
- **Chapter_Generator**: The service in `src/services/chapters.ts` that produces YouTube chapter markers.
- **TTS_Service**: The text-to-speech service in `src/services/tts.ts` using edge-tts.
- **Blind_Reviewer**: The post-render quality review service in `src/services/blindReview.ts` using Reka Edge.
- **Ken_Burns_Effect**: A slow zoom and pan animation applied to static images to create visual motion.
- **Crossfade_Transition**: A gradual blend between two consecutive segments where one fades out as the next fades in.
- **Background_Music**: Ambient audio that plays underneath the narration at a reduced volume throughout the video.
- **CORS_Proxy**: An intermediary service (e.g. `images.weserv.nl`) used to load cross-origin images into canvas.
- **Dead_Code**: Exported or module-level functions in `src/services/media.ts` that are no longer called by any code path.

---

## Requirements

### Requirement 1: Script Narrative Quality

**User Story:** As a video producer, I want the AI-generated scripts to have stronger narrative structure with engaging hooks, data-driven content, and clear story arcs, so that viewers stay engaged throughout the video.

#### Acceptance Criteria

1. WHEN the Script_Generator produces a script, THE Script_Generator SHALL structure the first Segment as a hook that opens with a specific, attention-grabbing claim, statistic, or question derived from the topic context — not a generic introduction like "Welcome to" or "In this video".
2. WHEN the Script_Generator produces a script with more than 4 Segments, THE Script_Generator SHALL include at least one Segment with `type` set to `'transition'` that bridges two thematic sections with a forward-looking statement.
3. WHEN the Script_Generator produces a script, THE Script_Generator SHALL include at least one Segment whose narration contains a specific numeric data point (dollar amount, percentage, date, or quantity) sourced from the topic context's `extract` or `description` fields.
4. WHEN the Script_Generator produces the final Segment, THE Script_Generator SHALL write a conclusion that references the hook from the first Segment, creating a narrative callback.
5. WHEN the Script_Generator receives a `tone` value of `'dramatic'`, THE Script_Generator SHALL use shorter sentences (averaging 12 words or fewer per sentence) and active voice throughout.
6. WHEN the Script_Generator receives a `tone` value of `'casual'`, THE Script_Generator SHALL use conversational phrasing including rhetorical questions and second-person address ("you").
7. IF the topic context's `extract` field is empty or unavailable, THEN THE Script_Generator SHALL still produce a hook Segment using the topic name and style-appropriate framing without fabricating specific statistics.

---

### Requirement 2: Background Music

**User Story:** As a video producer, I want ambient background music that matches the video style and plays underneath the narration, so that the video feels professionally produced and emotionally engaging.

#### Acceptance Criteria

1. THE System SHALL include a library of at least 4 royalty-free ambient audio loops stored in `public/audio/`, one for each video style (`business_insider`, `warfront`, `documentary`, `explainer`).
2. WHEN the Video_Renderer or Server_Renderer assembles a video, THE System SHALL mix the style-appropriate background music track underneath the narration audio.
3. WHEN background music is mixed with narration, THE System SHALL set the background music volume to no more than 15% of the narration volume so that speech remains clearly intelligible.
4. WHEN a video has no narration clips (all clips have status `'unavailable'`), THE System SHALL play the background music at 60% volume as the primary audio.
5. WHEN the background music loop is shorter than the total video duration, THE System SHALL seamlessly loop the track from the beginning without audible gaps or clicks.
6. WHEN the Server_Renderer assembles audio via ffmpeg, THE Server_Renderer SHALL use ffmpeg's `amix` or `amerge` filter to combine narration and background music into a single audio stream.
7. IF a background music file for the selected style is missing or unreadable, THEN THE System SHALL render the video with narration only, without throwing an error.
8. THE System SHALL provide a UI toggle in the assembly step that allows the user to enable or disable background music before rendering.

---

### Requirement 3: Thumbnail Generation Improvements

**User Story:** As a video producer, I want auto-generated thumbnails that are visually compelling with bold text overlays, high-contrast imagery, and style-appropriate design, so that the thumbnail maximises click-through rate on YouTube.

#### Acceptance Criteria

1. WHEN the Thumbnail_Generator renders a thumbnail, THE Thumbnail_Generator SHALL produce a 1280×720 pixel PNG image.
2. WHEN the Thumbnail_Generator renders a thumbnail and the project has media assets, THE Thumbnail_Generator SHALL select the highest-scored non-fallback MediaAsset as the background image.
3. WHEN the Thumbnail_Generator renders a thumbnail, THE Thumbnail_Generator SHALL apply a dark gradient overlay (`rgba(0,0,0,0.4)` to `rgba(0,0,0,0.8)` top-to-bottom) over the background image to ensure text readability.
4. WHEN the Thumbnail_Generator renders a thumbnail, THE Thumbnail_Generator SHALL draw the video title in bold 56px system-ui font with white fill and a dark text shadow (blur 20px, offset 0,4).
5. WHEN the Thumbnail_Generator renders a thumbnail and a hook line is available from the intro Segment, THE Thumbnail_Generator SHALL use the hook line's key phrase as the overlay text instead of the generic project title.
6. WHEN the overlay text exceeds 80 characters, THE Thumbnail_Generator SHALL truncate it to 80 characters with an ellipsis.
7. WHEN the Thumbnail_Generator cannot load the selected background image (network error, CORS failure), THE Thumbnail_Generator SHALL fall back to a gradient-only background without throwing an error.
8. THE Thumbnail_Generator SHALL use only system fonts (system-ui, sans-serif) and not reference any external font files.

---

### Requirement 4: Motion Graphics and Visual Variety

**User Story:** As a video producer, I want Ken Burns effects, smooth transitions between segments, and visual variety beyond static images, so that the video feels dynamic and maintains viewer attention.

#### Acceptance Criteria

1. WHEN the Video_Renderer or Server_Renderer renders a static image asset, THE System SHALL apply a Ken Burns effect with a zoom range of `[1.0, 1.25]` and a smooth pan in a randomised direction.
2. WHEN the Ken Burns effect parameters are generated for a Segment, THE System SHALL vary the pan direction between segments so that consecutive segments do not pan in the same direction.
3. WHEN transitioning between two consecutive Segments, THE Video_Renderer and Server_Renderer SHALL apply a crossfade transition lasting between 300ms and 800ms.
4. WHEN a Segment contains multiple media assets (primary and secondary shots), THE System SHALL alternate between them at intervals of 3–5 seconds to create visual velocity.
5. WHEN a MediaAsset is of type `'video'`, THE System SHALL render the video clip frames directly rather than applying Ken Burns to a static thumbnail.
6. WHEN the Video_Renderer draws a frame during a crossfade transition, THE Video_Renderer SHALL blend the outgoing segment's final frame with the incoming segment's first frame using canvas `globalAlpha`.
7. IF a MediaAsset fails to load during rendering, THEN THE System SHALL render a procedural background (gradient with topic text) for that segment without halting the render pipeline.
8. THE System SHALL apply consistent motion graphics logic in both `server-render.mjs` and `src/services/videoRenderer.ts`.

---

### Requirement 5: YouTube SEO Metadata Generation

**User Story:** As a video producer, I want auto-generated YouTube metadata including optimised titles, descriptions with chapters, and relevant tags, so that I can publish videos with strong discoverability without manual SEO work.

#### Acceptance Criteria

1. WHEN the SEO_Title_Generator is invoked with a topic and extracted data points, THE SEO_Title_Generator SHALL return at least 3 title alternatives between 40 and 70 characters each.
2. WHEN the System generates a video description, THE System SHALL include a 2–3 sentence summary of the video content derived from the script's intro and conclusion Segments.
3. WHEN the System generates a video description, THE System SHALL append YouTube chapter markers generated by the Chapter_Generator with timestamps matching each Segment's start time.
4. WHEN the System generates tags, THE System SHALL produce between 5 and 15 tags derived from the topic context's `entities` array, `coreSubject`, and `kind` field.
5. WHEN the System generates tags, THE System SHALL ensure each tag is between 2 and 30 characters and contains no special characters other than spaces and hyphens.
6. THE System SHALL present the generated title options, description, and tags in the preview step UI so the user can review and copy them.
7. WHEN the user copies the description to clipboard via the Chapter_Generator's `copyChaptersToClipboard` function, THE System SHALL copy the full description (summary + chapters + tags) not just the chapter markers.
8. IF the topic context has no entities or the extract is empty, THEN THE System SHALL generate tags from the topic name and style keywords without fabricating entity names.

---

### Requirement 6: Higher Resolution Rendering

**User Story:** As a video producer, I want the option to render videos at 1080p and 4K resolution, so that the output meets YouTube's quality standards for HD and UHD content.

#### Acceptance Criteria

1. THE System SHALL support three resolution presets: 720p (1280×720), 1080p (1920×1080), and 4K (3840×2160).
2. WHEN the user selects a resolution preset in the export settings, THE Video_Renderer and Server_Renderer SHALL create a canvas at the selected resolution's width and height.
3. WHEN rendering at 1080p or 4K, THE System SHALL scale all overlay elements (captions, labels, progress bars, title text) proportionally to the canvas dimensions so they remain visually consistent with the 720p layout.
4. WHEN rendering at 4K, THE Server_Renderer SHALL increase the ffmpeg frame rate to at least 24 FPS (up from the current 6 FPS at 720p) to produce smooth playback.
5. WHEN rendering at 1080p or 4K, THE Media_Harvester SHALL prefer media assets with `resolvedWidth` >= the target resolution width, falling back to lower-resolution assets with upscaling if no high-resolution assets are available.
6. WHEN the user has not explicitly selected a resolution, THE System SHALL default to 720p (1280×720) to preserve backward compatibility.
7. IF the browser's canvas implementation cannot allocate a 4K canvas (memory constraints), THEN THE System SHALL fall back to 1080p and log a warning without crashing.
8. THE System SHALL display the selected resolution in the export settings UI alongside the existing quality and format options.

---

### Requirement 7: Pipeline Reliability Fixes

**User Story:** As a video producer, I want the pipeline to run reliably without timeouts, JSON parse failures, or missing media, so that I can generate videos consistently without manual intervention.

#### Acceptance Criteria

1. WHEN the Visual_Director generates a visual plan for a Segment and the LLM response does not contain valid JSON, THE Visual_Director SHALL attempt to repair the JSON by stripping markdown code fences, fixing trailing commas, and closing unclosed braces before falling back to the default plan.
2. WHEN the Visual_Director generates a visual plan and the response contains a nested wrapper object (e.g. `{ "plan": { ... } }`), THE Visual_Director SHALL unwrap the nested object and extract the plan fields.
3. WHEN the Quality_Scorer or Vision_Checker makes an API call to Reka Edge, THE System SHALL set a timeout of 20 seconds (increased from 15 seconds) with 2 retries to reduce timeout failures.
4. WHEN the Vision_Checker receives a response that is not valid JSON (garbled or truncated), THE Vision_Checker SHALL attempt JSON repair using the same `repairTruncatedJson` function used elsewhere in the pipeline, and fall back to a neutral score if repair fails.
5. WHEN the Video_Renderer or Thumbnail_Generator loads an image via the `images.weserv.nl` CORS proxy and receives a 404 or network error, THE System SHALL retry the image load using the original URL directly, then fall back to a procedural background if both attempts fail.
6. WHEN the Visual_Director returns 0 shots for a Segment (empty `shots` array), THE Visual_Planner SHALL generate fallback shots using the segment's `narration` text and the topic context's `entities` array, producing at least 1 shot with concrete search queries.
7. IF all media source providers return empty results for a query, THEN THE Media_Harvester SHALL attempt a broadened query using only the topic context's `coreSubject` before falling back to the Wikipedia thumbnail.
8. THE System SHALL log all timeout events, JSON repair attempts, and fallback activations via the `logger` service with level `'warn'` so that pipeline issues are diagnosable.

---

### Requirement 8: Dead Code Cleanup

**User Story:** As a developer, I want unused functions removed from the codebase, so that the code is maintainable and does not confuse future contributors.

#### Acceptance Criteria

1. WHEN the dead code cleanup is applied, THE System SHALL remove the `searchUnsplash` function from `src/services/media.ts` since it is replaced by the Provider_Registry's `PicsumAdapter`.
2. WHEN the dead code cleanup is applied, THE System SHALL remove the `searchPicsum` function from `src/services/media.ts` since it is replaced by the Provider_Registry's `PicsumAdapter`.
3. WHEN the dead code cleanup is applied, THE System SHALL remove the `searchFirecrawl` function from `src/services/media.ts` since Firecrawl is not used and no `firecrawlKey` exists in `AppConfig`.
4. WHEN the dead code cleanup is applied, THE System SHALL remove the `searchSerper` function from `src/services/media.ts` since Serper is not used and no `serperKey` exists in `AppConfig`.
5. WHEN the dead code functions are removed, THE System SHALL also remove any imports, type references, or configuration fields (e.g. `firecrawlKey`, `serperKey`) that are only used by the removed functions.
6. WHEN the dead code cleanup is complete, THE System SHALL pass TypeScript compilation (`tsc --noEmit`) with zero errors related to the removed functions.
7. WHEN the dead code cleanup is complete, THE System SHALL pass all existing tests without regressions.

---

## Non-Functional Requirements

### Requirement 9: Rendering Performance

**User Story:** As a video producer, I want the quality improvements to add minimal overhead to the rendering pipeline, so that render times remain acceptable for iterative use.

#### Acceptance Criteria

1. WHEN the System renders a 5-minute video at 720p, THE System SHALL complete rendering within 120 seconds on a machine with 8GB RAM and a modern CPU.
2. WHEN the System renders at 1080p, THE System SHALL complete rendering within 3× the 720p render time for the same video.
3. WHEN background music is mixed with narration, THE Server_Renderer SHALL complete the audio mixing step within 10 seconds for a 10-minute video.
4. WHEN the SEO metadata generation is invoked, THE System SHALL complete title, description, and tag generation within 2 seconds without making any network requests.

### Requirement 10: Renderer Consistency

**User Story:** As a developer, I want all visual improvements to work identically in both the server-side and browser-side renderers, so that the output is consistent regardless of which renderer is used.

#### Acceptance Criteria

1. THE Ken Burns effect parameters SHALL be deterministic given the same segment index and asset ID, so that both renderers produce identical motion for the same input.
2. THE crossfade transition logic SHALL use the same alpha blending formula in both `server-render.mjs` and `src/services/videoRenderer.ts`.
3. THE caption rendering, colour grading, and overlay logic SHALL produce visually identical output in both renderers for the same input project.

### Requirement 11: Backward Compatibility

**User Story:** As a developer, I want all existing pipeline behaviour and API signatures to remain unchanged after these improvements, so that no regressions are introduced.

#### Acceptance Criteria

1. WHEN the `generateTitleOptions(topic, style?)` function is called with the existing two-parameter signature, THE SEO_Title_Generator SHALL return results compatible with the existing `TitleOption[]` interface.
2. WHEN the `generateThumbnail(title, topic, imageUrl?, width?, height?)` function is called with the existing signature, THE Thumbnail_Generator SHALL return a valid PNG Blob.
3. WHEN the dead code cleanup removes functions from `media.ts`, THE System SHALL verify that no other module imports or references the removed functions.
4. WHEN all existing Playwright E2E tests are run after these changes, THE System SHALL pass all tests that currently pass.
5. WHEN the `VideoProject` type is extended with new optional fields, THE System SHALL ensure all existing projects stored in localStorage can still be loaded without migration errors.
