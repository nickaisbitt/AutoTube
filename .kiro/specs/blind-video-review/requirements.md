# Requirements Document

## Introduction

After the AutoTube pipeline assembles a final video, the app sends extracted key frames, the script text, and the thumbnail to the `rekaai/reka-edge` vision model via OpenRouter for a "blind" quality review. The model evaluates the video as a real viewer would — with no context about what was intended — and produces a structured quality report card. This report is surfaced in the UI and stored on the project for later reference. The feature runs automatically on every video given the negligible cost (~$0.001 per review).

## Glossary

- **Blind_Review_Service**: The service module responsible for extracting key frames from the rendered video, sending them along with the script and thumbnail to the Reka Edge model via OpenRouter, and parsing the structured quality report from the response.
- **Quality_Report**: A structured object containing category scores (visual quality, pacing, narrative clarity, thumbnail effectiveness, overall production value), a letter grade, written feedback per category, and an overall summary — produced by the Blind_Review_Service.
- **Review_Step_UI**: The UI component that displays the Quality_Report as a report card, shown between video assembly completion and the final preview/export screen.
- **Pipeline_Orchestrator**: The Zustand-based state management layer (`useVideoProject` hook in `store.ts`) that coordinates pipeline step transitions, status tracking, and abort handling.
- **Video_Project**: The central data object (`VideoProject` type in `types.ts`) that stores all project state including script, media, narration, and now the Quality_Report.
- **OpenRouter_Client**: The existing HTTP client pattern used to call OpenRouter's chat completions API, as established in `src/services/llm.ts`.
- **Key_Frame**: A single image frame extracted from the rendered video blob at an evenly-spaced interval, encoded as a base64 data URL for inclusion in the vision model request.

## Requirements

### Requirement 1: Key Frame Extraction

**User Story:** As a video creator, I want the system to automatically extract representative frames from my rendered video, so that the blind reviewer can evaluate the visual quality of the final output.

#### Acceptance Criteria

1. WHEN a rendered video blob is available after assembly, THE Blind_Review_Service SHALL extract between 10 and 15 Key_Frames at evenly-spaced intervals across the video duration.
2. THE Blind_Review_Service SHALL encode each extracted Key_Frame as a base64 JPEG data URL with a maximum resolution of 1280x720 pixels.
3. IF the video blob cannot be decoded or frame extraction fails, THEN THE Blind_Review_Service SHALL return an error result with a descriptive message and allow the pipeline to continue to the preview step without a Quality_Report.
4. THE Blind_Review_Service SHALL complete frame extraction within 30 seconds for videos up to 10 minutes in duration.

### Requirement 2: Blind Review API Call

**User Story:** As a video creator, I want the system to send my video frames to an AI vision model for unbiased evaluation, so that I get feedback from the perspective of a real viewer.

#### Acceptance Criteria

1. WHEN Key_Frames have been extracted, THE Blind_Review_Service SHALL send them along with the script text and thumbnail image to the `rekaai/reka-edge` model via the OpenRouter_Client at the `https://openrouter.ai/api/v1/chat/completions` endpoint.
2. THE Blind_Review_Service SHALL construct the prompt without any information about the intended topic, style, or target audience, limiting context to: "Review this YouTube video based on the frames, script, and thumbnail provided."
3. THE Blind_Review_Service SHALL request a JSON-formatted response containing scores for each review category (visual quality, pacing, narrative clarity, thumbnail effectiveness, overall production value) on a 1–10 scale, written feedback per category, and an overall summary.
4. THE Blind_Review_Service SHALL use the existing `fetchWithTimeout` utility with a 60-second timeout and 2 retries for the API call.
5. IF the OpenRouter API returns an error or the response cannot be parsed, THEN THE Blind_Review_Service SHALL log the error and allow the pipeline to continue to the preview step without a Quality_Report.
6. THE Blind_Review_Service SHALL include the `Authorization`, `HTTP-Referer`, and `X-Title` headers consistent with the existing OpenRouter_Client pattern in `src/services/llm.ts`.

### Requirement 3: Quality Report Structure

**User Story:** As a video creator, I want a structured quality report with clear scores and actionable feedback, so that I can understand what works and what to improve.

#### Acceptance Criteria

1. THE Quality_Report SHALL contain numeric scores (1–10 integer scale) for each of the following categories: visual quality, pacing, narrative clarity, thumbnail effectiveness, and overall production value.
2. THE Quality_Report SHALL contain a written feedback string (1–3 sentences) for each scored category.
3. THE Quality_Report SHALL contain an overall letter grade derived from the average of all category scores: A (9–10), B (7–8), C (5–6), D (3–4), F (1–2).
4. THE Quality_Report SHALL contain an overall summary string (2–4 sentences) describing the video's strengths and areas for improvement.
5. THE Blind_Review_Service SHALL validate that all parsed scores are integers between 1 and 10 inclusive, clamping out-of-range values to the nearest bound.

### Requirement 4: Pipeline Integration

**User Story:** As a video creator, I want the blind review to run automatically after assembly without requiring any extra action from me, so that I always get quality feedback on my videos.

#### Acceptance Criteria

1. WHEN video assembly completes successfully, THE Pipeline_Orchestrator SHALL automatically trigger the Blind_Review_Service before transitioning to the preview step.
2. WHILE the blind review is in progress, THE Pipeline_Orchestrator SHALL display a processing status with progress messages (e.g., "Extracting frames…", "Reviewing video…").
3. IF the user cancels the blind review, THEN THE Pipeline_Orchestrator SHALL abort the review API call and transition to the preview step without a Quality_Report.
4. IF the blind review fails for any reason, THEN THE Pipeline_Orchestrator SHALL log the failure and transition to the preview step, treating the review as a non-blocking step.
5. THE Pipeline_Orchestrator SHALL store the completed Quality_Report on the Video_Project object so it persists with the project data.

### Requirement 5: Quality Report UI Display

**User Story:** As a video creator, I want to see the quality report as a visual report card in the preview screen, so that I can quickly assess my video's strengths and weaknesses.

#### Acceptance Criteria

1. WHEN a Video_Project has a Quality_Report, THE Review_Step_UI SHALL display a report card section in the preview screen showing all category scores, feedback, the letter grade, and the overall summary.
2. THE Review_Step_UI SHALL display each category score as a labeled progress bar or numeric indicator with a color scale (red for 1–3, amber for 4–6, green for 7–10).
3. THE Review_Step_UI SHALL display the overall letter grade prominently with appropriate color coding (green for A/B, amber for C, red for D/F).
4. WHEN a Video_Project does not have a Quality_Report, THE Review_Step_UI SHALL display a message indicating that no blind review is available for this project.
5. THE Review_Step_UI SHALL be collapsible so the user can minimize the report card when focusing on other preview actions.

### Requirement 6: Project Data Persistence

**User Story:** As a video creator, I want the quality report stored with my project, so that I can reference it later when deciding whether to publish or re-edit.

#### Acceptance Criteria

1. THE Video_Project type SHALL include an optional `blindReview` field of type Quality_Report.
2. WHEN the Pipeline_Orchestrator saves project state to localStorage, THE Pipeline_Orchestrator SHALL include the Quality_Report in the serialized project data.
3. WHEN a project is loaded from localStorage, THE Pipeline_Orchestrator SHALL restore the Quality_Report if present in the stored data.

### Requirement 7: Quality Report Parsing

**User Story:** As a developer, I want robust parsing of the AI model's response into a structured Quality_Report, so that malformed responses do not break the UI.

#### Acceptance Criteria

1. WHEN the Reka Edge model returns a response, THE Blind_Review_Service SHALL parse the response content as JSON, stripping markdown code fences if present.
2. IF the response JSON is missing required fields, THEN THE Blind_Review_Service SHALL fill missing score fields with a default value of 5 and missing text fields with "No feedback provided."
3. FOR ALL valid Quality_Report objects, parsing the report to JSON and back SHALL produce an equivalent object (round-trip property).
4. THE Blind_Review_Service SHALL truncate individual feedback strings to 500 characters and the overall summary to 1000 characters to prevent UI overflow.
