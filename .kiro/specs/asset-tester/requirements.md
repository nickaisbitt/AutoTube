# Requirements Document

## Introduction

AutoTube's media harvesting pipeline is a complex multi-stage system that searches multiple sources (DuckDuckGo, Wikimedia, Flickr, GovPress, Picsum), filters candidates by domain blocklist, runs vision checks via Reka Edge, scores quality on multiple factors, resolves full-resolution URLs from source pages, and applies focal cropping. Currently, the only way to observe this pipeline is by running a full video generation and inspecting the final selected assets — there is no way to test the harvester in isolation, see what gets rejected, understand score breakdowns, or diagnose why a particular image was or was not selected.

The Asset Tester feature adds a standalone developer/power-user tool that runs the full media acquisition pipeline for any search query and displays comprehensive results: every candidate found, every rejection with its reason, score breakdowns, vision check outcomes, resolution resolver results, quality factor scores, focal crop previews, and per-stage timing. This enables pipeline tuning without running full video generation.

## Glossary

- **Asset_Tester_Panel**: A standalone UI component accessible from the Settings modal that provides the interface for testing the media harvesting pipeline in isolation.
- **Harvester**: The media acquisition subsystem implemented in `src/services/media.ts` that searches external sources, scores candidates, and selects the best visual assets.
- **MediaCandidate**: An intermediate data structure representing a single image or video result from a search provider, carrying URL, dimensions, alt text, source attribution, base score, and final score. Defined in `src/services/media.ts`.
- **Domain_Filter**: The blocklist/allowlist system implemented in `src/services/domainFilter.ts` that rejects candidates from blocked domains (propaganda, watermarked stock, low-quality, adult content).
- **Vision_Check**: The Reka Edge-based image quality inspection implemented in `src/services/visionCheck.ts` that evaluates candidates for watermarks, low resolution, meme text, and other blocking criteria.
- **Quality_Scorer**: The multi-factor scoring system implemented in `src/services/qualityScorer.ts` that evaluates sharpness, lighting, composition, vibrancy, and relevance via Reka Edge.
- **Resolver**: The full-resolution URL resolver implemented in `src/services/fullResResolver.ts` that fetches source pages and extracts the highest-resolution version of candidate images.
- **Focal_Cropper**: The smart 16:9 cropping system implemented in `src/services/focalCropper.ts` that uses Reka Edge to detect focal points and compute crop rectangles.
- **Source_Provider**: An adapter that queries a specific external image/video API and returns normalized MediaCandidate arrays. Registered in `src/services/sourceProviders/index.ts`.
- **Pipeline_Timing**: A record of elapsed milliseconds for each stage of the harvesting pipeline (search, domain filtering, scoring, vision check, resolution, quality scoring).
- **Test_Run**: A single execution of the harvesting pipeline triggered from the Asset_Tester_Panel for a given search query.
- **Candidate_Result**: An enriched MediaCandidate that includes all pipeline metadata: domain filter status, vision check result, quality factors, resolver result, focal crop metadata, and selection status.

## Requirements

### Requirement 1: Asset Tester Panel Access

**User Story:** As a developer, I want to access an Asset Tester panel from the Settings area, so that I can test the media harvesting pipeline without running a full video generation.

#### Acceptance Criteria

1. WHEN the user opens the Settings modal, THE Settings modal SHALL display an "Asset Tester" button that opens the Asset_Tester_Panel.
2. WHEN the user clicks the "Asset Tester" button, THE Asset_Tester_Panel SHALL open as a full-screen modal overlaying the application.
3. THE Asset_Tester_Panel SHALL display a text input field for entering a search query and a "Test Harvest" button to initiate a Test_Run.
4. WHEN the Asset_Tester_Panel opens, THE Asset_Tester_Panel SHALL focus the search query input field for immediate typing.
5. WHEN the user presses the Enter key while the search query input is focused, THE Asset_Tester_Panel SHALL initiate a Test_Run with the current query text.
6. THE Asset_Tester_Panel SHALL be a standalone component that imports and calls Harvester functions directly without using the application store.

### Requirement 2: Pipeline Execution

**User Story:** As a developer, I want to run the full media acquisition pipeline for any search query, so that I can observe every stage of the harvesting process.

#### Acceptance Criteria

1. WHEN the user clicks "Test Harvest" with a non-empty query, THE Asset_Tester_Panel SHALL execute the full harvesting pipeline: source provider search, domain filtering, initial scoring, vision check, full-resolution URL resolution, quality scoring, and focal crop computation.
2. WHEN a Test_Run is in progress, THE Asset_Tester_Panel SHALL display a progress indicator showing the current pipeline stage.
3. WHEN a Test_Run is in progress, THE Asset_Tester_Panel SHALL disable the "Test Harvest" button and display a "Cancel" button.
4. WHEN the user clicks "Cancel" during a Test_Run, THE Asset_Tester_Panel SHALL abort all in-flight network requests using an AbortController signal and return to the idle state.
5. WHEN the pipeline queries Source_Providers, THE Asset_Tester_Panel SHALL use the `queryAllProviders` function from `src/services/sourceProviders/index.ts` with the current AppConfig.
6. WHEN the pipeline applies domain filtering, THE Asset_Tester_Panel SHALL use the `filterCandidates` function from `src/services/domainFilter.ts` and retain both accepted and rejected arrays.
7. WHEN the pipeline runs vision checks, THE Asset_Tester_Panel SHALL use the `batchVisionCheck` function from `src/services/visionCheck.ts` on the top-scoring accepted candidates.
8. WHEN the pipeline resolves full-resolution URLs, THE Asset_Tester_Panel SHALL use the `batchResolve` function from `src/services/fullResResolver.ts` on the top-scoring candidates.
9. WHEN the pipeline scores quality, THE Asset_Tester_Panel SHALL use the `batchScoreQuality` function from `src/services/qualityScorer.ts` on the top-scoring candidates.
10. WHEN the pipeline computes focal crops, THE Asset_Tester_Panel SHALL use the `focalCrop` function from `src/services/focalCropper.ts` for candidates that need cropping.
11. IF the OpenRouter API key is not configured, THEN THE Asset_Tester_Panel SHALL skip vision check, quality scoring, and focal crop detection stages and display a notice that these stages require an API key.

### Requirement 3: Candidate Results Display

**User Story:** As a developer, I want to see all harvested candidates with their full pipeline metadata, so that I can understand how each candidate was evaluated and why it was or was not selected.

#### Acceptance Criteria

1. WHEN a Test_Run completes, THE Asset_Tester_Panel SHALL display all accepted candidates in a results area showing: thumbnail preview, source name, source URL, image dimensions (width × height), base score, and final score.
2. WHEN displaying a candidate's scores, THE Asset_Tester_Panel SHALL show a score breakdown including: keyword relevance contribution, source authority contribution, resolution bonus, trust tier adjustment, and any penalty deductions.
3. WHEN a candidate has vision check results, THE Asset_Tester_Panel SHALL display the pass/fail status, detected issues, detected quality signals, and the quality score (1–10).
4. WHEN a candidate has quality factor scores, THE Asset_Tester_Panel SHALL display the five individual factor scores (sharpness, lighting, composition, vibrancy, relevance) and the composite quality score (0–200).
5. WHEN a candidate has a resolved URL different from its original URL, THE Asset_Tester_Panel SHALL display both the original URL and the resolved URL with a visual indicator that the URL was upgraded.
6. WHEN a candidate has crop metadata, THE Asset_Tester_Panel SHALL display a focal crop preview showing the 16:9 crop rectangle overlaid on the candidate thumbnail.
7. THE Asset_Tester_Panel SHALL visually distinguish the top-ranked candidate as the "primary shot" selection and the second-ranked candidate as the "secondary shot" selection.
8. THE Asset_Tester_Panel SHALL display the total number of accepted candidates and the total number of rejected candidates in a summary header.

### Requirement 4: Rejected Candidates Display

**User Story:** As a developer, I want to see all rejected candidates with their rejection reasons, so that I can diagnose domain filter and vision check behavior.

#### Acceptance Criteria

1. WHEN a Test_Run completes with rejected candidates, THE Asset_Tester_Panel SHALL display a separate "Rejected" section listing all candidates that were filtered out.
2. WHEN a candidate was rejected by the Domain_Filter, THE Asset_Tester_Panel SHALL display the rejection reason including the matched blocklist pattern and the blocklist category (propaganda, watermarked-stock, low-quality, adult-content).
3. WHEN a candidate was rejected by the Vision_Check, THE Asset_Tester_Panel SHALL display the detected blocking issues (watermarks, meme text, low resolution, state media branding, adult content, AI artifacts, social media screenshots).
4. WHEN displaying a rejected candidate, THE Asset_Tester_Panel SHALL show the candidate thumbnail, source name, source URL, and original base score alongside the rejection reason.
5. THE Asset_Tester_Panel SHALL display the count of rejected candidates grouped by rejection category (domain filter vs. vision check).

### Requirement 5: Filtering and Sorting Controls

**User Story:** As a developer, I want to sort and filter the results by various criteria, so that I can quickly find specific candidates and analyze scoring patterns.

#### Acceptance Criteria

1. THE Asset_Tester_Panel SHALL provide sort controls allowing the user to sort accepted candidates by: final score (descending, default), base score (descending), resolution (width × height, descending), and source name (alphabetical).
2. THE Asset_Tester_Panel SHALL provide filter controls allowing the user to filter accepted candidates by: source name (DuckDuckGo, Wikimedia, Flickr, GovPress, Picsum), and media type (image, video).
3. THE Asset_Tester_Panel SHALL provide a toggle to switch between grid view (thumbnail cards) and list view (detailed table rows).
4. WHEN the user selects grid view, THE Asset_Tester_Panel SHALL display candidates as thumbnail cards showing the image preview, source badge, final score, and dimensions.
5. WHEN the user selects list view, THE Asset_Tester_Panel SHALL display candidates as table rows showing all metadata fields: thumbnail, source, URL, dimensions, base score, final score, vision status, quality composite, resolver status, and selection status.
6. WHEN the user applies a source filter, THE Asset_Tester_Panel SHALL show only candidates from the selected source and update the candidate count in the summary header.

### Requirement 6: Pipeline Timing Display

**User Story:** As a developer, I want to see how long each pipeline stage took, so that I can identify performance bottlenecks in the harvesting process.

#### Acceptance Criteria

1. WHEN a Test_Run completes, THE Asset_Tester_Panel SHALL display a Pipeline_Timing breakdown showing elapsed milliseconds for each stage: search, domain filtering, initial scoring, vision check, resolution, quality scoring, and focal cropping.
2. THE Asset_Tester_Panel SHALL display the total elapsed time for the entire Test_Run in milliseconds.
3. WHEN a pipeline stage was skipped (due to missing API key or zero candidates), THE Asset_Tester_Panel SHALL display "Skipped" for that stage instead of a timing value.
4. THE Asset_Tester_Panel SHALL measure each stage timing using `performance.now()` for sub-millisecond accuracy.

### Requirement 7: Re-run and Query Editing

**User Story:** As a developer, I want to modify the search query and re-run the pipeline without leaving the panel, so that I can iteratively test different queries.

#### Acceptance Criteria

1. WHEN a Test_Run completes, THE Asset_Tester_Panel SHALL keep the search query input editable and the "Test Harvest" button enabled for immediate re-runs.
2. WHEN the user initiates a new Test_Run, THE Asset_Tester_Panel SHALL clear the previous results and display the new results when the pipeline completes.
3. WHEN the user modifies the query and presses Enter or clicks "Test Harvest", THE Asset_Tester_Panel SHALL execute a new Test_Run with the updated query.
4. THE Asset_Tester_Panel SHALL preserve the current sort order, filter selections, and view mode (grid/list) across re-runs.

### Requirement 8: Export Results

**User Story:** As a developer, I want to copy the full test results as JSON, so that I can share them for debugging or save them for comparison.

#### Acceptance Criteria

1. THE Asset_Tester_Panel SHALL display an "Export JSON" button that is enabled when results are available.
2. WHEN the user clicks "Export JSON", THE Asset_Tester_Panel SHALL copy the complete Test_Run results to the clipboard as a formatted JSON string.
3. WHEN the JSON is exported, THE exported data SHALL include: the search query, all accepted candidates with full metadata (scores, vision results, quality factors, resolver results, crop metadata), all rejected candidates with rejection reasons, and the Pipeline_Timing breakdown.
4. WHEN the JSON is successfully copied to the clipboard, THE Asset_Tester_Panel SHALL display a brief confirmation message ("Copied to clipboard") that auto-dismisses after 2 seconds.
5. IF the clipboard API is unavailable, THEN THE Asset_Tester_Panel SHALL fall back to displaying the JSON in a read-only text area that the user can manually select and copy.
