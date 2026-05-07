# Bugfix Requirements Document

## Introduction

The AutoTube video generation pipeline runs end-to-end but has three reliability issues discovered during QA testing with browser automation. These bugs degrade the user experience and the quality of automated test recordings:

1. **Narration timeout** — The narration step times out at 60 seconds because browser TTS is inherently slow for multi-segment scripts (8–10 segments). The pipeline continues but narration may be incomplete, producing silent sections in the final video.
2. **Assembly progress feedback gap** — While the `AssemblyStep` component has progress UI, the initial phase of the render (server-render attempt + fallback decision + image preloading) can take significant time with no meaningful progress updates. The `onProgress` callback is not invoked during the server-render probe or during the preload phase, leaving the user staring at "Trying server-side render..." or "Preloading images..." with 0–1% progress for extended periods.
3. **Dead frames during script/media phases** — The first ~110 seconds of the pipeline (script generation at ~14s + media sourcing at ~20s + waiting periods) show static loading screens with generic spinners. The `ScriptStep` and `MediaStep` processing views lack dynamic, visually engaging content, resulting in 37% dead/static frames in browser recordings.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the narration step processes a script with 8 or more segments using browser TTS THEN the system exceeds the 60-second implicit timeout and the pipeline proceeds with incomplete narration clips, resulting in silent sections in the assembled video

1.2 WHEN the video renderer begins the assembly phase and attempts a server-side render probe THEN the system displays a static message ("Trying server-side render...") at 0% progress with no incremental updates until the probe completes or fails (typically 5–15 seconds)

1.3 WHEN the video renderer falls back to browser rendering and begins preloading images THEN the system displays "Preloading images..." at 1% progress with no per-image progress updates during the preload phase (which can take 10–30 seconds for 8–10 images)

1.4 WHEN the script generation step is processing THEN the system displays a static spinner with a generic progress bar and three fixed phase labels ("Researching", "Structuring", "Writing") that provide no dynamic visual content, producing static frames in browser recordings for ~14 seconds

1.5 WHEN the media sourcing step is processing THEN the system displays a static spinner with a generic progress bar and three fixed info cards ("Research", "Plan", "Harvest & score") that provide no dynamic visual content, producing static frames in browser recordings for ~20 seconds

### Expected Behavior (Correct)

2.1 WHEN the narration step processes a script with 8 or more segments using browser TTS THEN the system SHALL use a per-segment timeout that scales with the segment's word count (rather than a single global timeout), and SHALL allow at least 120 seconds total for narration generation to complete all segments without truncation

2.2 WHEN the video renderer begins the assembly phase and attempts a server-side render probe THEN the system SHALL display incremental progress updates during the probe phase (e.g., "Connecting to render server..." at 1%, "Waiting for server response..." at 2%) so the user sees activity rather than a frozen state

2.3 WHEN the video renderer falls back to browser rendering and begins preloading images THEN the system SHALL report per-image preload progress (e.g., "Preloading image 3/10...") with the progress percentage incrementing as each image loads, covering the range from 1% to approximately 10% of overall render progress

2.4 WHEN the script generation step is processing THEN the system SHALL display dynamic visual content such as animated status messages that update as the LLM processes the request, showing the current phase with changing text so that browser recordings capture visually distinct frames rather than a static spinner

2.5 WHEN the media sourcing step is processing THEN the system SHALL display dynamic visual content such as the current segment name being sourced, a live count of images found so far, and animated transitions between sourcing phases so that browser recordings capture visually distinct frames rather than a static spinner

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the narration step processes a script with fewer than 8 segments and browser TTS is available THEN the system SHALL CONTINUE TO generate narration clips for all segments and mark them as "ready" for live browser playback

3.2 WHEN the video renderer successfully completes a server-side render THEN the system SHALL CONTINUE TO return the server-rendered blob without falling back to browser rendering

3.3 WHEN the video renderer completes browser-side rendering with all segments THEN the system SHALL CONTINUE TO capture frames, assemble them via ffmpeg or MediaRecorder, and produce a valid video blob

3.4 WHEN the script generation step completes successfully THEN the system SHALL CONTINUE TO display the full script with all segments, stats, and the "Source Media Assets" button

3.5 WHEN the media sourcing step completes successfully THEN the system SHALL CONTINUE TO display all sourced visuals with their scores, sources, beat labels, and the "Prepare Narration" button

3.6 WHEN the user cancels any pipeline step via the abort mechanism THEN the system SHALL CONTINUE TO reset that step's status to "active" and clear progress state without crashing
