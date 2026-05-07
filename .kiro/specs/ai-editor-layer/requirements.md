# Requirements Document

## Introduction

The AI Editor Layer is a new pipeline step that sits between narration generation and video assembly in the AutoTube pipeline. Currently, the renderer mechanically follows the plan — it takes the script segments, media assets, and narration clips and renders them in order with fixed Ken Burns parameters, uniform transitions, and static timing. The AI Editor Layer reviews the assembled plan (script + media + narration) and makes creative adjustments to improve visual flow, pacing, transitions, media quality, motion effects, and caption placement before the renderer executes. This transforms the pipeline from a mechanical assembler into an AI-directed editing suite.

## Glossary

- **Editor_Service**: The new `src/services/aiEditor.ts` service that orchestrates the AI editing pass over a VideoProject
- **Edit_Plan**: A structured JSON object returned by the LLM describing all creative adjustments to apply to the project
- **Segment**: A ScriptSegment from `src/types.ts` representing one section of the video (intro, section, transition, outro)
- **Media_Asset**: A MediaAsset from `src/types.ts` representing an image or video sourced for a segment
- **Narration_Clip**: A NarrationClip from `src/types.ts` representing the generated audio for a segment
- **Ken_Burns_Params**: Parameters controlling the zoom level, pan direction, and speed of the Ken Burns camera effect applied to each shot during rendering
- **Transition**: The visual effect used when switching between segments (e.g., crossfade, cut, dissolve)
- **Visual_Plan**: A SegmentVisualPlan from `src/types.ts` containing the AI-generated visual direction for a segment
- **Pipeline**: The sequential AutoTube workflow: topic → script → media → narration → **AI edit** → assembly → preview
- **Storyboard**: The frame-by-frame quality assessment produced by `src/services/storyboard.ts`
- **LLM_Service**: The existing OpenRouter integration in `src/services/llm.ts` used for AI calls

## Requirements

### Requirement 1: AI Edit Pipeline Step Integration

**User Story:** As a user, I want the AI editing pass to run automatically as a pipeline step between narration and assembly, so that every video benefits from creative adjustments without manual intervention.

#### Acceptance Criteria

1. WHEN narration generation completes successfully, THE Pipeline SHALL present an "AI Edit" step as the next active step before assembly
2. THE Pipeline SHALL include an "ai_edit" step in the PipelineStep type between "narration" and "assembly"
3. WHEN the "ai_edit" step is active, THE Editor_Service SHALL receive the complete VideoProject (script, media, narration, visualPlans) as input
4. WHEN the Editor_Service completes successfully, THE Pipeline SHALL store the edited VideoProject in the application state and advance to the assembly step
5. IF the Editor_Service encounters an error, THEN THE Pipeline SHALL log the error, preserve the original unedited VideoProject, and allow the user to proceed to assembly with the unedited plan
6. WHILE the "ai_edit" step is processing, THE Pipeline SHALL display a progress indicator showing the current editing phase (e.g., "Analyzing pacing...", "Optimizing transitions...")

### Requirement 2: Shot Reordering Within Segments

**User Story:** As a user, I want the AI to reorder shots within segments for better visual flow, so that the video feels more professionally edited.

#### Acceptance Criteria

1. THE Editor_Service SHALL analyze each Segment's media assets and reorder them to improve visual flow based on narrative context
2. WHEN the Editor_Service reorders shots within a Segment, THE Editor_Service SHALL preserve all original Media_Asset objects without modifying their content
3. WHEN the Editor_Service reorders shots, THE Editor_Service SHALL maintain the association between each Media_Asset and its parent Segment (segmentId remains unchanged)
4. THE Editor_Service SHALL include a human-readable rationale for each reordering decision in the Edit_Plan
5. IF a Segment contains fewer than two Media_Assets, THEN THE Editor_Service SHALL skip reordering for that Segment

### Requirement 3: Segment Timing Adjustment Based on Narration Pacing

**User Story:** As a user, I want the AI to adjust segment durations based on narration pacing, so that visuals stay synchronized with the spoken content.

#### Acceptance Criteria

1. THE Editor_Service SHALL analyze each Narration_Clip's duration and word count to compute a words-per-second pacing metric
2. WHEN a Segment's duration differs from its Narration_Clip duration by more than 1 second, THE Editor_Service SHALL adjust the Segment duration to match the narration length plus a configurable padding value
3. THE Editor_Service SHALL ensure the total video duration after timing adjustments remains within 10% of the original total duration
4. WHEN the Editor_Service adjusts a Segment's duration, THE Editor_Service SHALL record the original duration and the adjusted duration in the Edit_Plan
5. IF no Narration_Clip exists for a Segment, THEN THE Editor_Service SHALL preserve the Segment's original duration

### Requirement 4: Transition Selection Between Segments

**User Story:** As a user, I want the AI to pick appropriate transitions between segments, so that the video flows naturally instead of using the same transition everywhere.

#### Acceptance Criteria

1. THE Editor_Service SHALL support at least four transition types: "crossfade", "cut", "dissolve", and "wipe"
2. WHEN analyzing adjacent Segments, THE Editor_Service SHALL select a transition type based on the narrative beat change (e.g., "cut" for dramatic shifts, "crossfade" for smooth continuations)
3. THE Editor_Service SHALL store the selected transition type and duration for each segment boundary in the Edit_Plan
4. THE Editor_Service SHALL avoid using the same transition type for more than three consecutive segment boundaries
5. WHEN the video style is "warfront" or "documentary", THE Editor_Service SHALL prefer "cut" transitions for segments with beat type "event" or "data"

### Requirement 5: Media Replacement Suggestions

**User Story:** As a user, I want the AI to flag poor visual matches and suggest replacement search queries, so that weak media can be improved before rendering.

#### Acceptance Criteria

1. THE Editor_Service SHALL evaluate each Media_Asset's relevance to its Segment's narration text and Visual_Plan
2. WHEN the Editor_Service detects a Media_Asset with a relevance score below a configurable threshold, THE Editor_Service SHALL flag the asset as a replacement candidate in the Edit_Plan
3. WHEN flagging a replacement candidate, THE Editor_Service SHALL provide at least two alternative search queries tailored to the Segment's narrative context
4. THE Editor_Service SHALL flag all Media_Assets where the isFallback property is true as replacement candidates
5. IF the Editor_Service flags more than 50% of a Segment's Media_Assets as replacement candidates, THEN THE Editor_Service SHALL generate a revised Visual_Plan for that Segment

### Requirement 6: Ken Burns Effect Parameter Optimization

**User Story:** As a user, I want the AI to vary the Ken Burns zoom and pan parameters per shot, so that the video has visual variety instead of repetitive camera motion.

#### Acceptance Criteria

1. THE Editor_Service SHALL generate Ken_Burns_Params (zoomStart, zoomEnd, panDirectionX, panDirectionY) for each Media_Asset in the project
2. THE Editor_Service SHALL ensure that no two consecutive shots within the same Segment share identical panDirectionX and panDirectionY values
3. WHEN a Media_Asset has shotType "secondary", THE Editor_Service SHALL apply a distinct Ken Burns motion profile compared to the preceding "primary" shot
4. THE Editor_Service SHALL constrain zoomStart and zoomEnd values to the range [1.0, 1.25] to prevent excessive zoom distortion
5. THE Editor_Service SHALL include the generated Ken_Burns_Params in the Edit_Plan for each Media_Asset

### Requirement 7: Caption Placement and Timing Optimization

**User Story:** As a user, I want the AI to optimize caption placement and timing, so that subtitles are readable and well-synchronized with the narration.

#### Acceptance Criteria

1. THE Editor_Service SHALL compute optimal caption window sizes (word count per visible window) based on each Segment's narration pacing
2. WHEN a Segment's narration contains more than 100 words, THE Editor_Service SHALL recommend a caption window of 8 to 12 words
3. WHEN a Segment's narration contains 50 words or fewer, THE Editor_Service SHALL recommend a caption window of 4 to 8 words
4. THE Editor_Service SHALL include caption timing recommendations (words per window, display duration per window) in the Edit_Plan
5. IF a Segment's narration pacing exceeds 4 words per second, THEN THE Editor_Service SHALL flag the Segment as "fast-paced" and recommend a reduced caption window size

### Requirement 8: Edit Plan Structure and Serialization

**User Story:** As a developer, I want the Edit Plan to be a well-defined TypeScript type, so that the renderer and UI can consume AI editing decisions reliably.

#### Acceptance Criteria

1. THE Editor_Service SHALL produce an Edit_Plan conforming to a defined TypeScript interface exported from `src/types.ts`
2. THE Edit_Plan SHALL contain per-segment entries including: shot order, adjusted duration, transition type, Ken_Burns_Params per asset, caption settings, and replacement suggestions
3. THE Editor_Service SHALL validate the LLM response against the Edit_Plan schema before applying changes
4. IF the LLM response fails validation, THEN THE Editor_Service SHALL fall back to a default Edit_Plan that preserves the original project unchanged
5. FOR ALL valid VideoProject inputs, serializing the Edit_Plan to JSON and deserializing it back SHALL produce an equivalent Edit_Plan object (round-trip property)

### Requirement 9: Edit Plan Application to VideoProject

**User Story:** As a developer, I want a pure function that applies an Edit Plan to a VideoProject, so that the transformation is testable and predictable.

#### Acceptance Criteria

1. THE Editor_Service SHALL export a pure function `applyEditPlan(project: VideoProject, plan: EditPlan): VideoProject` that returns a new VideoProject with all edits applied
2. THE applyEditPlan function SHALL NOT mutate the input VideoProject or Edit_Plan objects
3. WHEN applyEditPlan applies shot reordering, THE resulting VideoProject SHALL contain the same set of Media_Assets as the input (no assets added or removed)
4. WHEN applyEditPlan applies timing adjustments, THE resulting VideoProject's total duration SHALL remain within 10% of the input project's total duration
5. FOR ALL valid VideoProject and EditPlan pairs, applying a default (no-op) Edit_Plan SHALL produce a VideoProject equivalent to the input

### Requirement 10: LLM Prompt Construction and Response Parsing

**User Story:** As a developer, I want the AI editor to construct structured prompts and parse LLM responses reliably, so that the editing decisions are consistent and recoverable from malformed output.

#### Acceptance Criteria

1. THE Editor_Service SHALL construct a prompt containing the full script structure, media asset metadata, narration clip durations, and visual plan summaries
2. THE Editor_Service SHALL request a JSON response format from the LLM_Service using the `response_format: { type: 'json_object' }` parameter
3. WHEN the LLM returns valid JSON matching the Edit_Plan schema, THE Editor_Service SHALL parse and apply the plan
4. IF the LLM returns invalid JSON, THEN THE Editor_Service SHALL log a warning and return a default no-op Edit_Plan
5. IF the LLM returns JSON that partially matches the Edit_Plan schema, THEN THE Editor_Service SHALL merge valid fields with defaults for missing fields
6. THE Editor_Service SHALL use the existing `fetchWithTimeout` utility with a timeout of 30 seconds and 2 retries for the LLM call

### Requirement 11: UI Feedback for AI Editing Step

**User Story:** As a user, I want to see what the AI editor changed, so that I understand the creative decisions and can trust the output.

#### Acceptance Criteria

1. WHEN the AI edit step completes, THE Pipeline SHALL display a summary of changes made (e.g., "Reordered 3 segments, adjusted 5 timings, suggested 2 media replacements")
2. THE Pipeline SHALL display the Edit_Plan rationale for each modified Segment in the storyboard view
3. WHEN the user views the storyboard after AI editing, THE Storyboard SHALL visually distinguish AI-edited segments from unmodified segments
4. THE Pipeline SHALL allow the user to skip the AI edit step and proceed directly to assembly with the original plan
5. IF the AI edit step is skipped, THEN THE Pipeline SHALL not modify the VideoProject and SHALL advance directly to assembly
