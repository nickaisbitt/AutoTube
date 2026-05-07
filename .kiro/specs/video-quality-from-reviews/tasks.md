# Tasks: Video Quality from Reviews

## Task 1: Add `chapterLabel` field and `stripPartLabels` utility
- [x] 1.1 Add optional `chapterLabel?: string` field to `ScriptSegment` interface in `src/types.ts`
- [x] 1.2 Implement `stripPartLabels(narration: string): string` function in `src/services/llm.ts` that removes "Part X of Y", "Section X of Y", "Segment X" patterns via regex
- [x] 1.3 Integrate `stripPartLabels()` into `validateSegment()` in `src/services/llm.ts` to sanitize the narration field, and validate `chapterLabel` (trim, cap at 50 chars)
- [x] 1.4 Write unit tests for `stripPartLabels()` covering: basic patterns, no-match passthrough, multiple matches, idempotency, edge cases (empty string, partial matches)
  - [x] 1.4.1 (PBT) Write a property-based test using fast-check that verifies `stripPartLabels` is idempotent: `stripPartLabels(stripPartLabels(text)) === stripPartLabels(text)` for arbitrary strings
  - [x] 1.4.2 (PBT) Write a property-based test that verifies the output of `stripPartLabels` never matches the part label regex pattern

## Task 2: Overhaul script generation prompts (improvements 1, 3–7)
- [x] 2.1 Update the `systemPrompt` in `generateAIScript()` in `src/services/llm.ts` to: (a) require the intro to open with the most compelling/alarming concrete fact first, (b) ban "Part X of Y" in narration and add `chapterLabel` to the JSON schema, (c) require human story cold open in first two segments, (d) require stakes escalation with explicit bridge lines between segments, (e) require sentence rhythm variation (mix of 2–5 word and 10–20 word sentences), (f) require at least 3 "you/your" direct viewer addresses, (g) strengthen the tech explanation rule to require metaphors/analogies
- [x] 2.2 Update the `userPrompt` in `generateAIScript()` to reinforce the new rules in the critical rules section and add any missing banned phrases

## Task 3: Update script review prompt (improvements 1–9 review pass)
- [x] 3.1 Update the `userPrompt` in `reviewAndImproveScript()` in `src/services/llm.ts` to check for: (a) hook opens with alarming fact not question, (b) no spoken part labels, (c) human story in first two segments, (d) escalation between segments, (e) rhythm variation in each segment, (f) "you/your" count ≥ 3, (g) metaphors for technical terms, (h) interactive binary CTA in outro, (i) specific episode teaser in outro (not generic sign-off)
- [x] 3.2 Add "more videos coming soon", "stay tuned", "find out what happens next" to the banned phrases list if not already present

## Task 4: Update outro requirements (improvements 8–9)
- [x] 4.1 Update the `systemPrompt` CLOSE section in `generateAIScript()` to require: (a) a binary question with two clear options (YES/NO, agree/disagree) for comments engagement, (b) a specific tease for a related next topic instead of generic sign-off
- [x] 4.2 Update the `userPrompt` critical rules to ban generic outros and require the specific CTA + teaser pattern

## Task 5: Implement visual pattern break system (improvement 10)
- [x] 5.1 Define and export `VisualStyleType = 'b-roll' | 'kinetic-text' | 'diagram'` type in `src/services/videoRenderer.ts`
- [x] 5.2 Implement `computeVisualStyle(frameTimeSec, segmentDurationSec, segmentType): VisualStyleType` in `src/services/videoRenderer.ts` with 7-second rotation interval, returning `'b-roll'` for intro/outro
- [x] 5.3 Implement `drawKineticTextOverlay(ctx, width, height, text, progress)` in `src/services/videoRenderer.ts` that draws large animated text overlay with save/restore
- [x] 5.4 Implement `drawDiagramOverlay(ctx, width, height, concept, progress)` in `src/services/videoRenderer.ts` that draws data-emphasis overlay with accent borders
- [x] 5.5 Integrate `computeVisualStyle()` into the main render loop in `renderVideoToBlob()` — call it per frame and apply the corresponding overlay after the base image draw
- [x] 5.6 Write unit tests for `computeVisualStyle()` covering: rotation boundaries (0s, 7s, 14s), intro/outro override, section/transition rotation, edge cases
  - [x] 5.6.1 (PBT) Write a property-based test that verifies `computeVisualStyle` always returns a valid `VisualStyleType` for any non-negative frameTime, positive segmentDuration, and valid segmentType
  - [x] 5.6.2 (PBT) Write a property-based test that verifies `computeVisualStyle` always returns `'b-roll'` when segmentType is `'intro'` or `'outro'`, regardless of frameTime

## Task 6: Implement thumbnail-title-hook alignment (improvement 11)
- [x] 6.1 Implement `extractHookLine(segments: ScriptSegment[]): string` in `src/services/seoTitles.ts` that returns the first sentence of the intro segment's narration
- [x] 6.2 Update `generateVideoTitle()` in `src/services/llm.ts` to accept and include the hook line in the prompt, instructing the LLM to echo the hook's core claim in the title
- [x] 6.3 Update `generateTitleOptions()` in `src/services/seoTitles.ts` to accept an optional `hookLine` parameter and generate at least one title that references the hook's key phrase
- [x] 6.4 Update `generateSplitScreenThumbnail()` in `src/services/thumbnail.ts` to use the hook line's key phrase as overlay text when available
- [x] 6.5 Write unit tests for `extractHookLine()` covering: normal sentences, no intro segment, empty array, narration without sentence boundaries, long narrations
  - [x] 6.5.1 (PBT) Write a property-based test that verifies `extractHookLine` always returns a string of length ≤ 100 for any array of segments

## Task 7: Add redundancy trimming to AI editor (improvement 12)
- [x] 7.1 Add "Redundancy Trimming" as editing dimension #7 in the `buildEditPrompt()` system prompt in `src/services/aiEditor.ts`, instructing the LLM to identify and trim repeated themes/warnings/statistics
- [x] 7.2 Update the constraints section of the AI editor prompt to note that trimmed content must be documented in the `rationale` field

## Task 8: Wire hook line through the pipeline
- [x] 8.1 Update `generateScript()` in `src/store.ts` to call `extractHookLine()` after script generation and pass the hook line to `generateVideoTitle()`
- [x] 8.2 Update the `assembleVideo()` flow in `src/store.ts` to pass the hook line to `generateSplitScreenThumbnail()` when generating thumbnails
