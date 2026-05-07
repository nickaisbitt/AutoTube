# Requirements Document

## Introduction

AutoTube is an AI-powered video generator that harvests images and video clips from the web to use as visuals in generated YouTube videos. The current media acquisition pipeline accepts whatever image URL the search API returns — often a thumbnail or mid-resolution version — instead of the full-resolution original hosted on the source page. This results in blurry, low-quality visuals that look amateur compared to manually produced YouTube content.

The HD Media Acquisition feature upgrades the entire media sourcing pipeline to produce professional-grade visuals competitive with top YouTube creators. It introduces full-resolution URL resolution from source pages, parallel multi-source harvesting across six+ providers, intelligent 16:9 focal-point cropping, multi-factor image quality scoring, video clip enhancement, a caching layer to avoid redundant fetches, granular progress reporting, and a robust fallback chain that guarantees every segment has a visual.

## Glossary

- **Harvester**: The media acquisition subsystem that searches external sources, scores candidates, and selects the best visual assets for each video segment. Currently implemented in `src/services/media.ts`.
- **Resolver**: A new subsystem that takes a candidate image URL and its `sourceUrl`, fetches the original webpage, and extracts the highest-resolution version of the same image.
- **MediaCandidate**: An intermediate data structure representing a single image or video result from a search provider, carrying URL, dimensions, alt text, source attribution, and a base score. Defined in `src/services/media.ts`.
- **MediaAsset**: The final selected visual for a video segment, stored on the `VideoProject`. Defined in `src/types.ts`.
- **Vision_Check**: The existing Reka Edge-based image quality inspection that evaluates candidates for watermarks, low resolution, and other blocking criteria. Implemented in `src/services/visionCheck.ts`.
- **Quality_Scorer**: A new multi-factor scoring function that evaluates image sharpness, lighting, composition, color vibrancy, and relevance beyond the existing `scoreCandidate` function.
- **Focal_Point_Detector**: A subsystem that uses the Reka Edge vision model to identify the primary subject or focal point of an image for intelligent cropping.
- **Source_Provider**: An adapter that queries a specific external image/video API (e.g., DuckDuckGo, Wikimedia, Pexels, Pixabay, Flickr) and returns normalized `MediaCandidate` arrays.
- **Resolution_Cache**: A cache layer that stores resolved full-resolution URLs, vision check results, and downloaded image data to avoid redundant network requests across video generations.
- **Fallback_Chain**: An ordered sequence of progressively broader search strategies used when high-quality assets cannot be found for a segment.
- **Crop_Metadata**: The `{ x, y, width, height }` coordinates stored on a `MediaAsset` that instruct the video renderer how to crop the source image to 16:9.
- **Progress_Reporter**: A callback mechanism that emits structured status messages during media sourcing so the UI can display granular, real-time progress.

## Requirements

### Requirement 1: Full-Resolution URL Resolver

**User Story:** As a video creator, I want the system to find the highest-resolution version of each candidate image from its source webpage, so that my videos use sharp, professional-quality visuals instead of search-result thumbnails.

#### Acceptance Criteria

1. WHEN the Harvester selects a top-scoring MediaCandidate that has a `sourceUrl` property, THE Resolver SHALL fetch the HTML of the source page and extract the highest-resolution version of the image by parsing `<img>` tags, `<meta property="og:image">` tags, `srcset` attributes, and JSON-LD structured data.
2. WHEN the Resolver parses `srcset` attributes, THE Resolver SHALL select the image descriptor with the largest pixel width.
3. WHEN the Resolver encounters a WordPress-hosted page, THE Resolver SHALL detect and extract the full-resolution featured image URL by stripping dimension suffixes (e.g., `-1024x768`) from the image filename.
4. WHEN the Resolver encounters a news article page, THE Resolver SHALL extract the hero image URL from Open Graph meta tags or the first `<img>` element within the article body that has a width of at least 1200 pixels.
5. WHEN the source page contains a photo gallery or press release with multiple images, THE Resolver SHALL select the image with the largest dimensions that matches the original candidate URL pattern.
6. IF the Resolver cannot fetch the source page within 8 seconds, THEN THE Resolver SHALL fall back to the original candidate URL without blocking the pipeline.
7. IF the Resolver fetches the source page but cannot find a higher-resolution image, THEN THE Resolver SHALL return the original candidate URL unchanged.
8. WHILE resolving full-resolution URLs, THE Resolver SHALL respect `robots.txt` directives by checking the source domain's `robots.txt` before fetching the page.
9. WHILE resolving full-resolution URLs, THE Resolver SHALL enforce a rate limit of no more than 2 concurrent requests to the same domain.
10. WHEN the Resolver finds a higher-resolution URL, THE Resolver SHALL update the MediaCandidate's `url` property and set the `width` and `height` properties to the resolved image dimensions.
11. THE Resolver SHALL only attempt resolution for the top 10 scoring candidates per segment to limit network overhead.

### Requirement 2: Multi-Source Parallel Harvesting

**User Story:** As a video creator, I want the system to search multiple image and video sources simultaneously for each visual concept, so that I get the best possible match from the widest pool of candidates.

#### Acceptance Criteria

1. WHEN the Harvester searches for a visual concept, THE Harvester SHALL query DuckDuckGo Images, Wikimedia Commons, Pexels API, Pixabay API, and Flickr API in parallel.
2. WHEN a Pexels API key is configured in AppConfig, THE Pexels Source_Provider SHALL query the Pexels API and return up to 15 MediaCandidates per query with full image dimensions and photographer attribution.
3. WHEN a Pixabay API key is configured in AppConfig, THE Pixabay Source_Provider SHALL query the Pixabay API and return up to 15 MediaCandidates per query with full image dimensions.
4. WHEN a Flickr API key is configured in AppConfig, THE Flickr Source_Provider SHALL query the Flickr API filtered to Creative Commons licensed images and return up to 15 MediaCandidates per query with full image dimensions and license type.
5. THE Harvester SHALL query government press photo archives (whitehouse.gov, defense.gov, nato.int photo galleries) for topics related to politics, military, or international relations, returning public domain MediaCandidates.
6. WHEN a Serper API key is configured in AppConfig, THE Harvester SHALL include Google Image search via Serper as a paid fallback source, queried in parallel with free sources.
7. WHEN all parallel source queries complete, THE Harvester SHALL merge results into a single candidate pool and deduplicate by image URL, keeping the candidate with the highest base score for each unique URL.
8. IF a Source_Provider fails or times out within 10 seconds, THEN THE Harvester SHALL continue with results from the remaining providers without blocking the pipeline.
9. THE Harvester SHALL normalize all MediaCandidates from different providers into the same `MediaCandidate` interface with consistent `source`, `sourceUrl`, `width`, `height`, `alt`, and `baseScore` fields.
10. WHEN the Pexels Source_Provider returns results, THE Harvester SHALL set the `baseScore` to 170 to reflect the high quality of Pexels stock photography.
11. WHEN the Pixabay Source_Provider returns results, THE Harvester SHALL set the `baseScore` to 160 to reflect the quality of Pixabay stock photography.
12. WHEN the Flickr Source_Provider returns Creative Commons results, THE Harvester SHALL set the `baseScore` to 140 and include the license type in the `source` field for attribution compliance.

### Requirement 3: Smart Aspect Ratio Cropping

**User Story:** As a video creator, I want the system to intelligently crop non-16:9 images to 16:9 centered on the subject, so that my videos never have letterboxing, stretching, or cut-off faces.

#### Acceptance Criteria

1. WHEN a selected MediaAsset has an aspect ratio outside the range 1.6:1 to 1.9:1, THE Focal_Point_Detector SHALL analyze the image using the Reka Edge vision model to identify the primary subject coordinates (x, y) as a percentage of image dimensions.
2. WHEN the Focal_Point_Detector identifies a focal point, THE Harvester SHALL compute a 16:9 crop rectangle centered on the focal point, constrained to remain within the image boundaries.
3. WHEN the computed crop rectangle would cut off a detected face, THE Focal_Point_Detector SHALL adjust the crop to include the full face bounding box within the 16:9 frame.
4. WHEN the computed crop rectangle would cut off detected text regions, THE Focal_Point_Detector SHALL adjust the crop to include the text within the 16:9 frame where possible without excluding the primary subject.
5. THE Harvester SHALL store the Crop_Metadata (`{ x, y, width, height }` in pixels) on the MediaAsset for the video renderer to apply during assembly.
6. IF the Reka Edge vision model is unavailable or the API key is not configured, THEN THE Harvester SHALL fall back to center-cropping the image to 16:9.
7. WHEN a MediaAsset already has an aspect ratio between 1.6:1 and 1.9:1, THE Harvester SHALL skip focal-point detection and use the image as-is without cropping.
8. THE Focal_Point_Detector SHALL complete analysis of a single image within 5 seconds.

### Requirement 4: Multi-Factor Image Quality Scoring

**User Story:** As a video creator, I want the system to score images on sharpness, lighting, composition, color vibrancy, and relevance, so that only professional-looking visuals are selected for my videos.

#### Acceptance Criteria

1. THE Quality_Scorer SHALL evaluate each top-scoring MediaCandidate on five factors: sharpness, lighting quality, composition, color vibrancy, and relevance to the visual concept.
2. WHEN the Quality_Scorer evaluates sharpness, THE Quality_Scorer SHALL assign a score from 0 to 10 where 0 indicates a heavily compressed or blurry image and 10 indicates a tack-sharp image.
3. WHEN the Quality_Scorer evaluates lighting quality, THE Quality_Scorer SHALL assign a score from 0 to 10 where 0 indicates severely underexposed or overexposed and 10 indicates well-balanced professional lighting.
4. WHEN the Quality_Scorer evaluates composition, THE Quality_Scorer SHALL assign a score from 0 to 10 considering rule-of-thirds alignment, leading lines, and visual balance.
5. WHEN the Quality_Scorer evaluates color vibrancy, THE Quality_Scorer SHALL assign a score from 0 to 10 where 0 indicates a washed-out or desaturated image and 10 indicates rich, vibrant colors.
6. WHEN the Quality_Scorer evaluates relevance, THE Quality_Scorer SHALL assign a score from 0 to 10 based on how closely the image content matches the visual concept description and search query.
7. THE Quality_Scorer SHALL compute a weighted composite score from the five factors: sharpness (25%), lighting (20%), composition (15%), vibrancy (15%), relevance (25%).
8. THE Quality_Scorer SHALL use the existing Reka Edge vision model to assess all five quality factors in a single API call per candidate to minimize latency.
9. THE Quality_Scorer SHALL only evaluate the top 5 candidates per segment after initial domain-based and resolution-based scoring to limit API costs.
10. WHEN the Quality_Scorer returns results, THE Harvester SHALL add the composite quality score (scaled to 0–200) to the candidate's `finalScore` before final ranking.
11. IF the Reka Edge API is unavailable, THEN THE Quality_Scorer SHALL fall back to the existing `scoreCandidate` function without quality factor adjustments.

### Requirement 5: Video Clip Enhancement

**User Story:** As a video creator, I want the system to select the best video clips by preferring clips with motion, without watermarks, and in landscape orientation, so that video segments feel dynamic and professional.

#### Acceptance Criteria

1. WHEN the Harvester evaluates video MediaCandidates, THE Harvester SHALL prefer clips that contain camera or subject motion over static shots by applying a +50 score bonus to clips classified as having motion.
2. WHEN the Harvester evaluates video MediaCandidates, THE Harvester SHALL penalize clips with detected burned-in text or watermarks by applying a -200 score penalty.
3. WHEN a video clip is longer than 15 seconds, THE Harvester SHALL extract the best 5-to-10-second segment by selecting the portion with the highest motion density.
4. WHEN the Harvester evaluates video MediaCandidates, THE Harvester SHALL penalize portrait-orientation clips (aspect ratio below 1.2:1) by applying a -150 score penalty.
5. WHEN the Harvester evaluates video MediaCandidates, THE Harvester SHALL prefer landscape clips with an aspect ratio between 1.6:1 and 1.9:1 by applying a +30 score bonus.
6. THE Harvester SHALL use the Reka Edge vision model to classify video thumbnails for motion, watermarks, and orientation when full video analysis is not feasible.
7. IF the Reka Edge API is unavailable for video analysis, THEN THE Harvester SHALL fall back to metadata-only scoring using duration, dimensions, and source authority.

### Requirement 6: Resolution Caching Layer

**User Story:** As a video creator, I want the system to cache resolved full-resolution URLs, vision check results, and downloaded images, so that repeated video generations on similar topics are faster and use less bandwidth.

#### Acceptance Criteria

1. WHEN the Resolver resolves a full-resolution URL for a source URL, THE Resolution_Cache SHALL store the mapping from original URL to resolved URL with a timestamp.
2. WHEN the Resolver is asked to resolve a URL that exists in the Resolution_Cache and the cache entry is less than 24 hours old, THE Resolver SHALL return the cached resolved URL without fetching the source page.
3. WHEN the Vision_Check completes for an image URL, THE Resolution_Cache SHALL store the VisionCheckResult keyed by image URL with a timestamp.
4. WHEN the Vision_Check is requested for an image URL that exists in the Resolution_Cache and the cache entry is less than 24 hours old, THE Vision_Check SHALL return the cached result without making an API call.
5. WHEN the Harvester downloads an image for the current session, THE Resolution_Cache SHALL store the image data in memory keyed by URL for reuse within the same video generation session.
6. WHEN a cache entry is older than 24 hours, THE Resolution_Cache SHALL treat the entry as expired and re-fetch the data on the next request.
7. THE Resolution_Cache SHALL use `localStorage` for URL resolution and vision check caches (persistent across sessions) and in-memory storage for downloaded image data (session-scoped).
8. IF `localStorage` is full or unavailable, THEN THE Resolution_Cache SHALL fall back to in-memory-only caching without throwing errors.

### Requirement 7: Granular Progress Reporting

**User Story:** As a video creator, I want to see detailed, real-time progress messages during media sourcing, so that I understand what the system is doing and how long it will take.

#### Acceptance Criteria

1. WHEN the Harvester begins searching for a visual concept, THE Progress_Reporter SHALL emit a message in the format: "Searching N sources for '[query]'..." where N is the number of active Source_Providers.
2. WHEN all Source_Providers return results for a query, THE Progress_Reporter SHALL emit a message in the format: "Found N candidates, filtering..." where N is the total candidate count before deduplication.
3. WHEN the Resolver begins resolving full-resolution URLs, THE Progress_Reporter SHALL emit a message in the format: "Resolving full-resolution for top N..." where N is the number of candidates being resolved.
4. WHEN the Quality_Scorer begins evaluating candidates, THE Progress_Reporter SHALL emit a message in the format: "Vision-checking top N..." where N is the number of candidates being evaluated.
5. WHEN the Harvester selects the final asset for a segment, THE Progress_Reporter SHALL emit a message in the format: "Selected: [source description], [width]×[height]" with the actual source and dimensions of the chosen asset.
6. THE Progress_Reporter SHALL emit messages through the existing `setProcessingMessage` callback in the store so the MediaStep UI displays them in real time.
7. THE Progress_Reporter SHALL update the numeric progress percentage through the existing `setProcessingProgress` callback, incrementing smoothly across the search, resolve, score, and select phases for each segment.

### Requirement 8: Robust Fallback Chain

**User Story:** As a video creator, I want the system to guarantee that every video segment has a visual even when high-quality assets cannot be found, so that my video never has blank or missing frames.

#### Acceptance Criteria

1. WHEN the Harvester finds fewer than 2 candidates with a `finalScore` above 100 for a segment, THE Fallback_Chain SHALL broaden the search query by removing adjectives and modifiers, keeping only the core subject noun phrase.
2. WHEN the broadened query still yields fewer than 2 viable candidates, THE Fallback_Chain SHALL search for related entities extracted from the TopicContext (e.g., parent company, associated person, related event).
3. WHEN related entity searches yield fewer than 2 viable candidates, THE Fallback_Chain SHALL search for the topic's Wikipedia hero image using the `thumbnailUrl` from TopicContext.
4. WHEN all previous fallback strategies fail, THE Fallback_Chain SHALL use Picsum/Unsplash generic stock images as a last resort, marking the resulting MediaAsset with `isFallback: true`.
5. THE Fallback_Chain SHALL guarantee that every segment in the script has at least one MediaAsset after the sourcing phase completes.
6. WHEN the Fallback_Chain uses a broadened or related-entity query, THE Fallback_Chain SHALL log the fallback strategy used in the MediaAsset's `trace` array for debugging.
7. IF the Fallback_Chain exhausts all strategies and only generic stock is available, THEN THE Fallback_Chain SHALL select a stock image seeded by the segment title to ensure visual variety across segments.

### Requirement 9: New API Key Configuration

**User Story:** As a video creator, I want to configure API keys for Pexels, Pixabay, and Flickr in the settings modal, so that the system can access these additional high-quality image sources.

#### Acceptance Criteria

1. THE AppConfig interface SHALL include optional fields for `pexelsKey`, `pixabayKey`, and `flickrKey`.
2. WHEN the user opens the Settings modal, THE Settings modal SHALL display input fields for Pexels API key, Pixabay API key, and Flickr API key alongside the existing API key fields.
3. WHEN the user saves API keys in the Settings modal, THE Settings modal SHALL persist the new keys using the existing secure storage mechanism (session storage with optional PIN-encrypted localStorage).
4. WHEN a Source_Provider's API key is not configured, THE Harvester SHALL skip that provider silently without logging errors.

### Requirement 10: MediaAsset Schema Extensions

**User Story:** As a developer, I want the MediaAsset type to carry crop metadata, quality scores, and resolution details, so that downstream systems (renderer, UI) can use this information.

#### Acceptance Criteria

1. THE MediaAsset interface SHALL include an optional `cropMetadata` field of type `{ x: number; y: number; width: number; height: number }` representing the 16:9 crop rectangle in pixels.
2. THE MediaAsset interface SHALL include an optional `qualityFactors` field of type `{ sharpness: number; lighting: number; composition: number; vibrancy: number; relevance: number }` with each factor scored 0–10.
3. THE MediaAsset interface SHALL include optional `resolvedWidth` and `resolvedHeight` fields representing the dimensions of the full-resolution image after URL resolution.
4. THE MediaAsset interface SHALL include an optional `resolvedUrl` field containing the full-resolution URL if different from the original `url`.
5. WHEN the video renderer reads a MediaAsset with `cropMetadata`, THE video renderer SHALL apply the crop coordinates when rendering the image to the canvas.
6. FOR ALL valid MediaAsset objects, serializing to JSON then parsing back SHALL produce an equivalent object (round-trip property).
