7# Implementation Plan: Video Quality Max

## Overview

This plan implements 10 interconnected quality upgrades to the AutoTube pipeline, organized by component with incremental integration. Each task builds on the existing TypeScript codebase patterns (TTS registry, canvas renderer, service modules). Property-based tests validate correctness properties from the design using fast-check.

## Tasks

- [x] 1. Implement Kokoro TTS Engine and Pacing Controller
  - [x] 1.1 Create Kokoro TTS engine implementing TTSEngine interface
    - Create `src/services/tts/kokoroEngine.ts`
    - Implement `TTSEngine` interface: name, voices, generate, isAvailable
    - Expose 4 voice options: af_heart (female conversational), am_adam (male authoritative), af_sarah (female professional), am_michael (male dramatic)
    - Accept `kokoroServerUrl` from TTSConfig for server endpoint
    - Implement 10-second timeout on server requests returning null on failure
    - Wire into TTS registry with priority: Kokoro → Grok → Melo → Browser
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

  - [x] 1.2 Create Narration Pacing Controller
    - Create `src/services/tts/pacingController.ts`
    - Implement `applyPacing(text, config)` returning processed text with prosody markers
    - Implement `computeSegmentWpm(segmentType)`: intro → 170–180, outro/advice → 140–155, others → 120–200
    - Implement `insertDataPointPauses(text)` detecting dollar amounts, percentages, large numbers and inserting 300–500ms pauses before them
    - Calculate estimated WPM and duration for each segment
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 1.3 Write property tests for Kokoro TTS and Pacing (Properties 1, 2, 3)
    - Create `src/services/__tests__/kokoroEngine.property.test.ts`
    - **Property 1: TTS Registry Fallback Guarantees Audio Generation** — For any text input where preferred engine fails, registry attempts next engine in priority order
    - **Property 2: Segment-Type WPM Targeting** — For any segment, computed WPM falls within segment-type-appropriate range
    - **Property 3: Data Point Pause Insertion** — For any text with statistical patterns, pause markers of 300–500ms are inserted before each data point
    - **Validates: Requirements 1.5, 2.1, 2.2, 2.3, 2.5**

- [x] 2. Implement Background Music Mixer
  - [x] 2.1 Create Background Music Mixer service
    - Create `src/services/audioMixer.ts`
    - Implement `createAudioMixer(config)` using Web Audio API with GainNode-based volume control
    - Implement `computeDuckingEnvelope(narrationTimings)` producing gain automation: 0.15–0.20 during narration, 0.60–0.80 during gaps
    - Apply 200–400ms crossfade transitions between ducking states
    - Apply 500ms fade-in at video start and 2000ms fade-out at video end
    - Define 3 music presets: tense, uplifting, neutral
    - Support music disable toggle (narration-only output)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [x] 2.2 Write property test for Background Music Mixer (Property 4)
    - Create `src/services/__tests__/audioMixer.property.test.ts`
    - **Property 4: Background Music Ducking Levels** — For any time point with defined narration intervals, music volume is in [0.15, 0.20] during narration and [0.60, 0.80] during gaps, with 200–400ms transitions
    - **Validates: Requirements 3.2, 3.3, 3.7**

- [x] 3. Implement Hook Validator
  - [x] 3.1 Create Hook Validator service
    - Create `src/services/hookValidator.ts`
    - Implement `validateHook(introSegment)` returning HookValidationResult with pattern detection, word count, and target compliance
    - Implement `detectHookPattern(text)` identifying: surprising_statistic (numbers/percentages), provocative_question (question marks in first 2 sentences), personal_stakes (you/your language), counterintuitive_claim (but/however/actually patterns)
    - Implement `generateTemplateHook(topic, pattern)` producing template hooks containing the topic name
    - Enforce 40–60 word count for intro segments
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 3.2 Write property tests for Hook Validator (Properties 5, 6, 7)
    - Create `src/services/__tests__/hookValidator.property.test.ts`
    - **Property 5: Hook Validation and Pattern Detection** — For any intro segment, validator identifies a hook within first 2 sentences matching one of four valid patterns
    - **Property 6: Template Hook Contains Topic** — For any non-empty topic and valid pattern, template hook contains the topic name (case-insensitive)
    - **Property 7: Intro Segment Word Count** — For any valid intro segment, word count is between 40 and 60 inclusive
    - **Validates: Requirements 4.1, 4.2, 4.4, 4.5**

- [x] 4. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement Media Quality Gate
  - [x] 5.1 Create Media Quality Gate service
    - Create `src/services/mediaQualityGate.ts`
    - Implement `evaluateCandidate(candidate, config)` with thresholds: accept above 100, broaden search below 100, procedural fallback below 80
    - Implement cliché pattern detection (hooded hacker, binary code, circuit boards) rejecting matches when alternatives score above 150
    - Implement `generateProceduralBackground(semanticColors)` rendering a canvas gradient with the segment's color palette
    - Enforce 1920×1080 minimum resolution preference
    - Track video clip sourcing: attempt ⌊N/3⌋ video clips for N segments
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [x] 5.2 Write property tests for Media Quality Gate (Properties 8, 9)
    - Create `src/services/__tests__/mediaQualityGate.property.test.ts`
    - **Property 8: Cliché Media Rejection** — For any candidate set with a cliché match AND an alternative scoring above 150, the cliché is not selected
    - **Property 9: Video Clip Sourcing Frequency** — For any segment count N ≥ 3, at least ⌊N/3⌋ video clips are attempted
    - **Validates: Requirements 5.4, 5.6**

- [x] 6. Implement Enhanced Transition Renderer and Editing Rhythm
  - [x] 6.1 Enhance Transition Renderer with section-aware transitions
    - Extend `src/services/renderer/canvas/transitions.ts`
    - Implement `renderSectionTransition(ctx, fromFrame, toFrame, progress, config)` using SECTION_DESIGN_TEMPLATES transitionOut field
    - Apply Ken Burns effect (slow zoom/pan) to static images during display
    - Render animated text cards (2–3 seconds) for segments with statistical content
    - Display section title cards (1200ms ±50ms) when section type changes between segments
    - Implement `computeVisualChangeCount(segmentDuration, assetCount)` ensuring ≥2 changes per 10-second window
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 6.2 Create Fast-Paced Editing Controller
    - Create `src/services/renderer/editingRhythm.ts`
    - Implement `planSegmentShots(segment, assets, config)` enforcing max 5s hold time per static image
    - Split visuals into ≥2 shots when narration exceeds 8 seconds
    - Implement `alternateFraming(segmentIndex)` alternating close_up/wide_angle across consecutive segments
    - Insert ≥2 animated text cards for videos with >5 segments
    - Enforce max 7 seconds per asset without motion/overlay change
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

  - [x] 6.3 Write property tests for Transitions (Properties 10, 11, 12, 13)
    - Create `src/services/__tests__/transitions.property.test.ts`
    - **Property 10: Section-Appropriate Transitions** — For consecutive segments with different section types, renderer applies the motif transition from outgoing segment's SECTION_DESIGN_TEMPLATES
    - **Property 11: Statistical Text Card Display** — For segments with statistical content, render plan includes animated text card (2–3 seconds)
    - **Property 12: Section Title Cards at Topic Changes** — For consecutive segments with section type change, title card scheduled at 1200ms ±50ms
    - **Property 13: Visual Change Density** — For segments ≥10 seconds, shot plan contains ≥2 visual changes per 10-second window
    - **Validates: Requirements 6.1, 6.2, 6.4, 6.5, 6.6**

  - [x] 6.4 Write property tests for Editing Rhythm (Properties 23, 24, 25, 26, 27)
    - Create `src/services/__tests__/editingRhythm.property.test.ts`
    - **Property 23: Maximum Visual Hold Time** — No static image shot exceeds 5 seconds without cut/zoom/transition
    - **Property 24: Shot Splitting for Long Narration** — Segments with narration >8 seconds produce ≥2 shots
    - **Property 25: Framing Alternation** — Consecutive segment indices produce different framing values
    - **Property 26: Animated Text Card Insertion** — Videos with >5 segments include ≥2 animated text cards
    - **Property 27: Maximum Asset Display Without Change** — No asset appears >7 seconds without motion/overlay change
    - **Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5**

- [x] 7. Implement YouTube Metadata Generator
  - [x] 7.1 Extend SEO Metadata Generator with full YouTube metadata
    - Extend `src/services/seoTitles.ts` with `generateFullMetadata(project, topicContext)`
    - Implement title generation: 40–70 characters, embed data points when available
    - Implement `generateVideoDescription` with summary, chapter markers (X:XX format), and tags line
    - Implement `generateTags` returning 8–15 tags, each 2–30 characters
    - Implement chapter marker generation aligned to segment cumulative start times (±1 second)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [x] 7.2 Write property tests for SEO Metadata (Properties 14, 15, 16, 17, 18)
    - Create `src/services/__tests__/seoMetadata.property.test.ts`
    - **Property 14: Title Length Enforcement** — All titles are 40–70 characters inclusive
    - **Property 15: Description Structure Completeness** — Description contains summary, chapter markers with "X:XX" format, and "Tags:" line
    - **Property 16: Tag Count and Length Constraints** — 8–15 tags, each 2–30 characters
    - **Property 17: Data Point Embedding in Titles** — Non-empty dataPoints array produces at least one title containing a data point
    - **Property 18: Chapter Marker Timing Alignment** — Chapter timestamps correspond to cumulative segment start times (±1 second)
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.6**

- [x] 8. Implement Enhanced Thumbnail Generator
  - [x] 8.1 Extend Thumbnail Generator with hook-derived overlays
    - Extend `src/services/thumbnail.ts`
    - Implement `selectThumbnailBackground(assets)` selecting highest-scored non-fallback asset
    - Implement `extractKeyPhrase(hookLine)` extracting currency amounts, percentages, numbers with context, named entities, or significant words
    - Ensure `generateThumbnailConcepts` returns exactly 3 variants: fear, curiosity, authority
    - Derive text overlay from hook key phrase instead of generic title
    - Maintain existing gradient overlay (40%→80%), font (52–56px bold), and shadow (16–20px) implementations
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [x] 8.2 Write property tests for Thumbnail (Properties 19, 20, 21)
    - Create `src/services/__tests__/thumbnail.property.test.ts`
    - **Property 19: Thumbnail Background Asset Selection** — For non-empty assets with at least one non-fallback, returns highest-scored non-fallback asset
    - **Property 20: Hook Key Phrase Extraction** — For any non-empty hook line, returns a non-empty string (currency, percentage, number, entity, or significant words)
    - **Property 21: Thumbnail Variant Generation** — For any topic/style/audience, returns exactly 3 concepts with variants fear, curiosity, authority
    - **Validates: Requirements 8.2, 8.5, 8.6**

- [x] 9. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Implement Narration Audio Export
  - [x] 10.1 Create Narration Audio Export service
    - Create `src/services/tts/audioExport.ts`
    - Implement `exportNarrationClip(audioBlob, segmentId)` storing audio as blob URL with timing metadata (startOffset, duration, segmentId, format)
    - Implement `validateNarrationTiming(clips, targetDuration)` checking total duration within ±20% of target
    - Return `withinTolerance=true` only when within range; provide suggestion when exceeding by >20%
    - Calculate cumulative start offsets for each clip
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [x] 10.2 Write property test for Narration Timing (Property 22)
    - Create `src/services/__tests__/narrationTiming.property.test.ts`
    - **Property 22: Narration Duration Validation** — For any clip durations and target, `withinTolerance=true` iff total is within ±20%, and suggestion is non-null when exceeding by >20%
    - **Validates: Requirements 9.3, 9.4**

- [x] 11. Wire components into pipeline UI
  - [x] 11.1 Update NarrationStep component
    - Display estimated WPM for each generated clip
    - Add playback button for each clip that plays actual Kokoro-generated audio (not browser TTS)
    - Show Kokoro engine selection in TTS settings
    - _Requirements: 2.6, 9.5_

  - [x] 11.2 Update AssemblyStep component with music controls
    - Add music mood preset selector (tense, uplifting, neutral)
    - Add background music enable/disable toggle
    - Integrate Background Music Mixer into assembly output
    - _Requirements: 3.5, 3.6_

  - [x] 11.3 Update ScriptStep component with hook highlighting
    - Visually highlight the hook section with a distinct badge or color indicator
    - Integrate hook validation feedback into the script display
    - _Requirements: 4.6_

  - [x] 11.4 Update Preview step with metadata and thumbnail display
    - Display generated title, description, and tags for user review and editing
    - Display generated thumbnail with option to regenerate or select a different variant
    - _Requirements: 7.5, 8.7_

- [x] 12. Add bundled music assets and final integration
  - [x] 12.1 Add royalty-free music tracks
    - Add at least 3 royalty-free music tracks to `public/audio/` directory (bg-tense.aac, bg-uplifting.aac, bg-neutral.aac)
    - _Requirements: 3.8_

  - [x] 12.2 Wire editing rhythm into renderer orchestrator
    - Integrate `planSegmentShots` into the rendering pipeline in `src/services/renderer/orchestrator.ts`
    - Connect transition renderer with section-aware transitions
    - Ensure shot plans feed into canvas draw calls
    - _Requirements: 6.1, 6.2, 10.1, 10.2_

- [x] 13. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Property-based tests use `fast-check` with minimum 100 iterations per property
- Checkpoints at tasks 4, 9, and 13 ensure incremental validation
- The project uses vitest (`npm run test:unit`) for all unit and property tests
- All new services follow existing patterns: TypeScript modules with exported functions, no class-based architecture unless matching existing code
