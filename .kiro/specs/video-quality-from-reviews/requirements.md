# Requirements: Video Quality from Reviews

## Requirement 1: Stronger Script Hooks

### 1.1 The `generateAIScript()` system prompt MUST instruct the LLM to open the intro segment with the single most compelling or alarming concrete fact/consequence, not a question, backstory, or structure label.

### 1.2 The `reviewAndImproveScript()` review prompt MUST check that the intro segment's first sentence is a concrete consequence or alarming fact and rewrite it if it opens with a question or vague tease.

### 1.3 The intro segment's narration, after generation and review, MUST begin with a declarative statement containing a specific fact, number, or named entity — not a question or hypothetical.

## Requirement 2: Remove Spoken Part Labels

### 2.1 A `stripPartLabels(narration: string): string` function MUST be implemented in `llm.ts` that removes all patterns matching "Part X of Y", "Section X of Y", "Segment X", and similar structural labels from narration text using regex.

### 2.2 `stripPartLabels()` MUST be called inside `validateSegment()` on the narration field so that every segment is sanitized regardless of whether the LLM followed the prompt instruction.

### 2.3 `stripPartLabels()` MUST be idempotent: applying it twice yields the same result as applying it once.

### 2.4 The `generateAIScript()` system prompt MUST explicitly ban "Part X of Y" labels in narration text and instruct the LLM to use a separate `chapterLabel` field for internal structure.

### 2.5 The `ScriptSegment` type in `types.ts` MUST gain an optional `chapterLabel?: string` field (max 50 characters) for on-screen chapter text that is not spoken.

### 2.6 `validateSegment()` MUST validate the `chapterLabel` field: if present, trim it and cap at 50 characters; if absent, leave as undefined.

## Requirement 3: Human Story Cold Open

### 3.1 The `generateAIScript()` system prompt MUST instruct the LLM to lead the first two segments (intro + first section) with a named person's story or real human example before diving into the broader topic.

### 3.2 The `reviewAndImproveScript()` review prompt MUST check that the intro or first section segment references a named individual and flag scripts that jump straight into abstract analysis.

## Requirement 4: Stakes Escalation

### 4.1 The `generateAIScript()` system prompt MUST instruct the LLM to escalate stakes across segments — each segment should feel heavier than the last, with explicit escalation signals in the narration (e.g., "But it gets worse", "And that's just the beginning").

### 4.2 The `reviewAndImproveScript()` review prompt MUST check for escalation between segments and add escalation bridge lines at segment boundaries if missing.

## Requirement 5: Sentence Rhythm Variation

### 5.1 The `generateAIScript()` system prompt MUST instruct the LLM to mix short punchy sentences (2–5 words, e.g., "That's terrifying.", "Full stop.") with medium-length explanatory sentences (10–20 words) in every segment's narration.

### 5.2 The `reviewAndImproveScript()` review prompt MUST check that each segment contains at least one sentence of ≤ 5 words and at least one sentence of ≥ 12 words, and rewrite segments with uniform sentence length.

## Requirement 6: More "You" Language

### 6.1 The `generateAIScript()` system prompt MUST instruct the LLM to address the viewer directly at least 3 times across the full script using "you", "your", "you're" (e.g., "your data", "your privacy", "this affects you").

### 6.2 The `reviewAndImproveScript()` review prompt MUST count "you/your" occurrences and add direct viewer addresses if the count is below 3.

## Requirement 7: Simpler Tech Explanations

### 7.1 The `generateAIScript()` system prompt MUST instruct the LLM to include a plain-language metaphor or analogy immediately after every technical term, acronym, or jargon word introduced in the narration.

### 7.2 The existing "Translate EVERY technical term" rule in the system prompt MUST be strengthened to require a metaphor or analogy (not just a parenthetical definition).

## Requirement 8: Interactive CTA Closing

### 8.1 The `generateAIScript()` system prompt MUST instruct the LLM to end the outro segment with a binary question that presents two clear options (e.g., "Do you think X or Y? Drop YES or NO in the comments.") rather than a generic "more videos coming soon" or "thanks for watching".

### 8.2 The `reviewAndImproveScript()` review prompt MUST check that the outro contains a binary question pattern and rewrite generic sign-offs.

## Requirement 9: Episode Teaser Ending

### 9.1 The `generateAIScript()` system prompt MUST instruct the LLM to end with a specific tease for a related next topic (e.g., "Next time, we're looking at how X connects to Y") rather than a generic sign-off.

### 9.2 The `reviewAndImproveScript()` review prompt MUST check that the outro references a specific future topic and replace generic endings like "stay tuned" or "more videos coming soon".

### 9.3 The banned phrases list in the user prompt MUST include "more videos coming soon", "stay tuned", "find out what happens next", and "thanks for watching" (some already present, ensure completeness).

## Requirement 10: Visual Pattern Breaks

### 10.1 A `computeVisualStyle(frameTimeSec, segmentDurationSec, segmentType): VisualStyleType` function MUST be implemented in `videoRenderer.ts` that returns one of `'b-roll' | 'kinetic-text' | 'diagram'` based on a 7-second rotation interval.

### 10.2 `computeVisualStyle()` MUST return `'b-roll'` for intro and outro segment types regardless of frame time.

### 10.3 For section and transition segment types, `computeVisualStyle()` MUST cycle through `['b-roll', 'kinetic-text', 'diagram']` every 7 seconds.

### 10.4 A `drawKineticTextOverlay(ctx, width, height, text, progress)` function MUST be implemented that draws a large animated text overlay on the canvas, using save/restore to avoid polluting canvas state.

### 10.5 A `drawDiagramOverlay(ctx, width, height, concept, progress)` function MUST be implemented that draws a data-emphasis overlay with accent borders and a concept label.

### 10.6 The main render loop in `renderVideoToBlob()` MUST call `computeVisualStyle()` for each frame and apply the corresponding overlay function when the style is `'kinetic-text'` or `'diagram'`.

### 10.7 The `VisualStyleType` type MUST be exported from `videoRenderer.ts`.

## Requirement 11: Thumbnail-Title-Hook Alignment

### 11.1 An `extractHookLine(segments: ScriptSegment[]): string` function MUST be implemented that returns the first sentence of the intro segment's narration (up to the first `.!?`), or the first 100 characters if no sentence boundary exists.

### 11.2 The `generateVideoTitle()` prompt in `llm.ts` MUST include the hook line and instruct the LLM to produce a title that echoes the hook's core claim or key phrase.

### 11.3 `generateTitleOptions()` in `seoTitles.ts` MUST accept an optional `hookLine` parameter and, when provided, generate at least one title option that references the hook's key phrase.

### 11.4 `generateSplitScreenThumbnail()` in `thumbnail.ts` MUST use the hook line's key phrase as the overlay text instead of the generic video title when a hook line is available.

### 11.5 `extractHookLine()` MUST return an empty string when the segments array is empty or contains no intro segment.

## Requirement 12: Trim Redundancy via AI Editor

### 12.1 The `buildEditPrompt()` function in `aiEditor.ts` MUST add a "Redundancy Trimming" editing dimension to the system prompt that instructs the LLM to identify repeated themes, warnings, statistics, or phrases across segments.

### 12.2 The redundancy trimming instruction MUST tell the LLM to keep the first occurrence at full strength and either shorten subsequent occurrences to brief callbacks or remove them entirely.

### 12.3 The redundancy trimming instruction MUST require the LLM to document trimmed content in the `rationale` field of each affected `SegmentEditEntry`.

### 12.4 The redundancy trimming MUST NOT require an additional LLM API call — it is added to the existing AI editor prompt and processed in the same request.
