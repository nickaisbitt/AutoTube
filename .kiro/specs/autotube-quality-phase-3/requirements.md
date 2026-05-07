# Requirements Document

## Introduction

AutoTube Quality Phase 3 targets A+ video output quality for the AutoTube AI video generator. Previous phases addressed render speed, YouTube metadata, thumbnails, procedural backgrounds, progress UI, and batch processing. Despite those improvements, the video output remains D-grade due to unreliable image loading in the server renderer, low frame rate (6 FPS at 720p), missing background music, lack of visual variety (every frame is a dark gradient with centered white text), title text clipping, inconsistent script depth, and VP9/WebM encoding instead of H.264/MP4. This phase fixes all Priority 1 issues across visuals, script quality, and production to reach broadcast-quality output.

## Glossary

- **Server_Renderer**: The Node.js server-side video rendering pipeline (`server-render.mjs`) that uses node-canvas and ffmpeg to produce video files from a VideoProject.
- **Browser_Renderer**: The browser-side video rendering pipeline (`src/services/videoRenderer.ts`) that renders video using HTML5 Canvas and MediaRecorder.
- **Image_Preloader**: The subsystem within the Server_Renderer responsible for fetching and caching all media images before rendering begins.
- **Proxy_Endpoint**: The Vite dev server endpoint at `/api/proxy-image` used by the Server_Renderer to fetch external images while avoiding CORS restrictions.
- **Resolution_Preset**: A named configuration (720p, 1080p, 4K) defining canvas dimensions, frame rate, and video bitrate, stored in `renderingShared.ts` and mirrored in `server-render.mjs`.
- **Title_Card**: The opening frame sequence displaying the video title, channel name, and topic with a typewriter animation effect.
- **Scene_Layout**: A visual composition template applied to a rendered frame, such as centered text, left-text-right-image split, lower-third overlay, stat card, or quote card.
- **Visual_Variety_Planner**: A subsystem that assigns diverse Scene_Layouts to consecutive segments to prevent visual monotony.
- **Script_Reviewer**: The `reviewAndImproveScript()` LLM pass in `llm.ts` that checks and rewrites weak script segments.
- **Background_Music_Mixer**: The audio subsystem (`server-render/audio.mjs`) that loops and mixes ambient music tracks underneath narration.
- **Safe_Zone**: The inner rectangular area of a video frame that avoids YouTube's UI overlay regions (progress bar, title, channel info, end screen elements).
- **Segment_Purpose_Tag**: A semantic label assigned to each script segment indicating its narrative role (e.g., "stat_hook", "history", "moat", "risk", "prediction").
- **Retention_Beat**: A scripted moment designed to re-engage the viewer, placed at regular intervals throughout the video.

## Requirements

### Requirement 1: Reliable Image Loading in Server Renderer

**User Story:** As a video creator, I want all sourced images to load reliably during server-side rendering, so that rendered frames show real photographs instead of procedural gradient fallbacks.

#### Acceptance Criteria

1. WHEN the Server_Renderer begins a render, THE Image_Preloader SHALL fetch all unique image URLs with a per-request timeout of 15 seconds and up to 3 retry attempts with exponential backoff before falling back to the procedural background.
2. WHEN an image fetch via the Proxy_Endpoint fails, THE Image_Preloader SHALL attempt a direct HTTPS fetch of the original image URL as a secondary fallback before using the procedural background.
3. WHEN the Image_Preloader completes preloading, THE Server_Renderer SHALL log the count of successfully loaded images and the count of failed images to the console.
4. THE Image_Preloader SHALL preload all images for every segment before the Server_Renderer begins writing any frames to the ffmpeg pipe.
5. WHEN an image fails all retry attempts and direct fetch, THE Server_Renderer SHALL use the procedural gradient background for that segment and log a warning identifying the failed URL.

### Requirement 2: Title Card Text Integrity

**User Story:** As a video creator, I want title text to never be clipped or cut off mid-word, so that the video opening looks professional.

#### Acceptance Criteria

1. WHEN rendering the Title_Card, THE Server_Renderer SHALL measure the title text width against the canvas width minus a horizontal Safe_Zone margin of 10% on each side.
2. WHEN the measured title text width exceeds the available Safe_Zone width, THE Server_Renderer SHALL wrap the title onto multiple lines at word boundaries rather than truncating mid-word.
3. WHEN the title text requires more than 3 lines after wrapping, THE Server_Renderer SHALL reduce the font size by 20% and re-wrap before rendering.
4. THE Browser_Renderer SHALL apply the same title text wrapping and Safe_Zone margin logic as the Server_Renderer for visual consistency.

### Requirement 3: Scene Layout Variety System

**User Story:** As a video creator, I want each segment to use a visually distinct layout based on its content type, so that the video has visual variety instead of 20 identical gradient-and-text frames.

#### Acceptance Criteria

1. THE Visual_Variety_Planner SHALL support at least 5 distinct Scene_Layout types: centered-text, left-text-right-image, lower-third-overlay, stat-card, and quote-card.
2. WHEN assigning Scene_Layouts to segments, THE Visual_Variety_Planner SHALL ensure no two consecutive segments use the same Scene_Layout type.
3. WHEN a segment's visual note or Segment_Purpose_Tag contains statistical data (numbers, percentages, dollar amounts), THE Visual_Variety_Planner SHALL prefer the stat-card Scene_Layout for that segment.
4. WHEN a segment's type is "transition", THE Visual_Variety_Planner SHALL prefer the lower-third-overlay Scene_Layout for that segment.
5. THE Server_Renderer SHALL render each frame using the Scene_Layout assigned by the Visual_Variety_Planner instead of the current uniform centered-text layout.
6. THE Browser_Renderer SHALL render each frame using the same Scene_Layout assignments as the Server_Renderer for visual consistency.

### Requirement 4: Text Contrast and Readability

**User Story:** As a video creator, I want all on-screen text to be readable against its background, so that viewers can always read titles, captions, and overlays.

#### Acceptance Criteria

1. WHEN rendering text over an image background, THE Server_Renderer SHALL draw a semi-transparent dark gradient overlay behind the text area to ensure a minimum contrast ratio.
2. WHEN rendering text over a procedural gradient background, THE Server_Renderer SHALL verify that the text fill colour provides sufficient visual separation from the background gradient colours.
3. THE Browser_Renderer SHALL apply the same text contrast overlay logic as the Server_Renderer.

### Requirement 5: Safe Zone and Margin Validation

**User Story:** As a video creator, I want all important visual elements to stay within YouTube's safe zone, so that YouTube's UI elements do not obscure my content.

#### Acceptance Criteria

1. THE Server_Renderer SHALL reserve a bottom margin of at least 60 pixels at 1080p resolution (scaled proportionally for other resolutions) to avoid overlap with YouTube's progress bar and controls.
2. THE Server_Renderer SHALL reserve a top margin of at least 40 pixels at 1080p resolution (scaled proportionally for other resolutions) to avoid overlap with YouTube's title overlay.
3. WHEN placing caption text, segment titles, or overlay elements, THE Server_Renderer SHALL position them within the Safe_Zone boundaries.
4. THE Browser_Renderer SHALL apply the same Safe_Zone margins as the Server_Renderer.

### Requirement 6: Resolution and Frame Rate Upgrade

**User Story:** As a video creator, I want the default output to be 1080p at 24 FPS, so that the video meets YouTube's quality standards and looks smooth.

#### Acceptance Criteria

1. THE Resolution_Preset for 720p SHALL specify a frame rate of 24 FPS instead of 6 FPS.
2. THE Resolution_Preset for 1080p SHALL specify a frame rate of 24 FPS instead of 12 FPS.
3. THE Resolution_Preset for 4K SHALL retain a frame rate of 24 FPS.
4. WHEN no resolution is specified in the project export settings, THE Server_Renderer SHALL default to the 1080p Resolution_Preset.
5. WHEN no resolution is specified in the project export settings, THE Browser_Renderer SHALL default to the 1080p Resolution_Preset.
6. THE Server_Renderer SHALL update all frame-count calculations (title card frames, cold open frames, segment title frames) to use the configured FPS value dynamically rather than hardcoded values.

### Requirement 7: H.264/MP4 Encoding

**User Story:** As a video creator, I want the server renderer to produce H.264/MP4 files instead of VP9/WebM, so that the output is compatible with all platforms and has better quality at the same bitrate.

#### Acceptance Criteria

1. THE Server_Renderer SHALL encode video frames using the libx264 codec with the "fast" preset and CRF 23 instead of the libvpx-vp9 codec.
2. THE Server_Renderer SHALL output files with the `.mp4` container format instead of `.webm`.
3. THE Server_Renderer SHALL set the pixel format to yuv420p for broad playback compatibility.
4. THE Resolution_Preset for 1080p SHALL specify a video bitrate of at least 10 Mbps to ensure high visual quality at 24 FPS.
5. THE Resolution_Preset for 720p SHALL specify a video bitrate of at least 6 Mbps to ensure high visual quality at 24 FPS.

### Requirement 8: Background Music Audio Files

**User Story:** As a video creator, I want background music to play underneath narration, so that the video has professional ambient audio instead of silence between spoken segments.

#### Acceptance Criteria

1. THE system SHALL include at least one royalty-free ambient audio file in `public/audio/` that the Background_Music_Mixer can use.
2. WHEN the project style is "business_insider", "warfront", "documentary", or "explainer" and the style-specific audio file does not exist, THE Background_Music_Mixer SHALL fall back to the generic ambient audio file (`public/audio/ambient-bg.aac`) instead of producing silent output.
3. WHEN background music is enabled and narration is present, THE Background_Music_Mixer SHALL mix the music at 15% volume underneath the narration audio.
4. WHEN background music is enabled and no narration is present, THE Background_Music_Mixer SHALL play the music at 60% volume as the primary audio track.

### Requirement 9: Script Promise-Payoff Validation

**User Story:** As a video creator, I want the script reviewer to detect and fix empty hype transitions that promise depth but deliver surface-level content, so that the script maintains viewer trust.

#### Acceptance Criteria

1. WHEN reviewing a script, THE Script_Reviewer SHALL detect transition phrases that promise upcoming content (e.g., "But here's where it gets interesting", "And that's not even the worst part") and verify that the following segment delivers substantive new information.
2. WHEN a promise phrase is followed by a segment with fewer than 3 concrete details (names, numbers, dates, or specific events), THE Script_Reviewer SHALL flag the segment for enrichment and rewrite it with additional specifics.
3. IF the Script_Reviewer fails to improve a flagged segment after one rewrite attempt, THEN THE Script_Reviewer SHALL retain the original segment and log a warning.

### Requirement 10: Script Specificity and Enrichment

**User Story:** As a video creator, I want generic claims in the script to be replaced with concrete examples, so that the content feels researched and authoritative.

#### Acceptance Criteria

1. WHEN reviewing a script, THE Script_Reviewer SHALL identify segments where narration contains generic phrases without specific attribution (e.g., "many experts say", "some companies", "significant growth") and rewrite them with concrete names, numbers, or sources.
2. WHEN a segment contains a statistical claim without attribution, THE Script_Reviewer SHALL add an attribution phrase (e.g., "according to...", "data from X shows...").
3. THE Script_Reviewer SHALL preserve the original segment if the enrichment rewrite fails or produces a shorter result.

### Requirement 11: Segment Purpose Tagging

**User Story:** As a video creator, I want each script segment to be tagged with its narrative purpose, so that the visual system and pacing engine can make informed layout and timing decisions.

#### Acceptance Criteria

1. WHEN a script is generated or reviewed, THE system SHALL assign a Segment_Purpose_Tag to each segment from the set: "stat_hook", "history", "moat", "risk", "prediction", "human_story", "competitive_analysis", "transition_bridge", "conclusion".
2. THE Segment_Purpose_Tag SHALL be stored on the ScriptSegment type as an optional field.
3. WHEN the Visual_Variety_Planner assigns Scene_Layouts, THE Visual_Variety_Planner SHALL use the Segment_Purpose_Tag as a primary input for layout selection.

### Requirement 12: Rhetorical Variety in Scripts

**User Story:** As a video creator, I want the script reviewer to detect and fix overused rhetorical constructs, so that the narration sounds fresh and varied.

#### Acceptance Criteria

1. WHEN reviewing a script, THE Script_Reviewer SHALL count occurrences of each sentence-opening pattern across all segments.
2. WHEN any sentence-opening pattern (e.g., "But", "And", "The") appears more than 3 times across the full script, THE Script_Reviewer SHALL rewrite at least half of the duplicates to use different constructions.
3. THE Script_Reviewer SHALL preserve the meaning and tone of rewritten sentences while varying their structure.

### Requirement 13: Pacing and Energy Scoring

**User Story:** As a video creator, I want each segment to have a pacing score that reflects its energy level, so that the renderer can vary visual intensity and transition speed accordingly.

#### Acceptance Criteria

1. WHEN a script is generated, THE system SHALL compute a pacing score from 1 (calm/reflective) to 5 (urgent/high-energy) for each segment based on sentence length distribution, punctuation density, and word choice intensity.
2. THE pacing score SHALL be stored on the ScriptSegment type as an optional numeric field.
3. WHEN rendering a segment with a pacing score of 4 or 5, THE Server_Renderer SHALL use faster Ken Burns zoom speeds and shorter asset alternation intervals.
4. WHEN rendering a segment with a pacing score of 1 or 2, THE Server_Renderer SHALL use slower Ken Burns zoom speeds and longer asset alternation intervals.

### Requirement 14: Retention Beat Scheduling

**User Story:** As a video creator, I want a visual or textual hook placed every 15-25 seconds throughout the video, so that viewer attention is maintained and retention stays high.

#### Acceptance Criteria

1. WHEN the total video duration exceeds 30 seconds, THE system SHALL ensure that at least one Retention_Beat (a re-hook line, stat callout, or visual pattern break) occurs within every 25-second window of the video.
2. WHEN a 25-second window contains no Retention_Beat, THE Script_Reviewer SHALL insert a brief re-hook line or the Visual_Variety_Planner SHALL insert a visual pattern break (e.g., a stat-card overlay or kinetic text moment).
3. THE system SHALL log the placement of each Retention_Beat for debugging and quality review.
