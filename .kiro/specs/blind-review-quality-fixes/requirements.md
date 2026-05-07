# Requirements Document

## Introduction

This feature addresses critical quality issues identified in a blind review of the AutoTube video generation pipeline. The review scored the output poorly across visual quality (4/10), pacing (5/10), narrative clarity (6/10), thumbnail effectiveness (2/10), and overall production value (4/10). The primary deficiencies are: low-resolution watermarked stock images, monotonous pacing with static visuals, a completely black thumbnail, repeated/irrelevant imagery, and lack of dynamic editing. This spec targets the most impactful fixes to raise production quality to a competitive level.

## Glossary

- **Media_Sourcer**: The subsystem responsible for discovering, scoring, and selecting visual assets (images and video clips) for each script segment
- **Watermark_Detector**: A scoring mechanism that identifies and penalizes media candidates containing visible watermarks (e.g., Adobe Stock, Shutterstock, Getty) in their metadata or source domain
- **Visual_Deduplication_Engine**: The subsystem that tracks which media assets have been assigned across segments and prevents the same image from appearing in multiple segments
- **Thumbnail_Generator**: The subsystem that renders 1280×720 click-optimized thumbnail images with text overlays, dominant subjects, and emotional imagery
- **Pacing_Controller**: The subsystem that manages visual cut timing, motion effects, and pattern interrupts to maintain viewer engagement
- **Segment_Visual_Planner**: The subsystem that generates search queries and visual concepts for each script segment based on narrative beat analysis
- **Cut_Cadence**: The rhythm of visual changes in the video, measured as the average time between distinct visual transitions
- **Pattern_Interrupt**: A deliberate visual or audio change that resets viewer attention, occurring every 15–25 seconds in high-retention YouTube content
- **Ken_Burns_Effect**: A slow pan or zoom applied to static images to create the illusion of motion
- **Narrative_Beat**: The classification of a script segment's role (hook, data, quote, event, analysis, context, conclusion, transition)

## Requirements

### Requirement 1: Watermark Detection and Rejection

**User Story:** As a video creator, I want the media pipeline to detect and reject watermarked stock images, so that my videos look professional and avoid copyright-infringing visual artifacts.

#### Acceptance Criteria

1. THE Media_Sourcer SHALL reject candidates sourced from known watermarked-stock domains (shutterstock.com, gettyimages.com, istockphoto.com, 123rf.com, dreamstime.com, depositphotos.com, alamy.com, adobe stock via ftcdn.net) by assigning a score penalty of at least -500
2. WHEN a candidate's alt text or URL contains watermark indicator strings ("stock", "watermark", "preview", "comp", "sample", "licensed"), THE Media_Sourcer SHALL apply a score penalty of -300
3. WHEN the OpenRouter API key is available, THE Media_Sourcer SHALL use the vision check to detect visible watermark overlays on the top 3 candidates and reject any candidate where the vision model identifies a watermark
4. IF all candidates for a segment are rejected due to watermark detection, THEN THE Media_Sourcer SHALL broaden the search query and attempt sourcing from Wikimedia Commons and Unsplash before falling back to procedural backgrounds

### Requirement 2: Visual Deduplication Across Segments

**User Story:** As a video creator, I want each segment to display a unique visual, so that the video maintains variety and avoids the appearance of lazy repetition.

#### Acceptance Criteria

1. THE Visual_Deduplication_Engine SHALL maintain a registry of all media asset URLs assigned to segments within a single video project
2. WHEN scoring candidates for a segment, THE Media_Sourcer SHALL apply a penalty of -400 to any candidate whose URL matches an asset already assigned to a previous segment
3. WHEN scoring candidates for a segment, THE Media_Sourcer SHALL apply a penalty of -200 to any candidate whose source domain and alt text combination matches an asset already assigned to a previous segment (near-duplicate detection)
4. THE Visual_Deduplication_Engine SHALL reset its registry at the start of each new video generation run
5. WHEN deduplication causes all candidates for a segment to score below the acceptance threshold, THE Media_Sourcer SHALL generate an alternative search query using the segment's secondary shot concept before falling back to procedural backgrounds

### Requirement 3: Segment-Narration Visual Relevance Enforcement

**User Story:** As a video creator, I want each visual to directly illustrate what the narration is saying at that moment, so that viewers can follow the story visually without confusion.

#### Acceptance Criteria

1. WHEN scoring media candidates, THE Media_Sourcer SHALL require at least 2 keyword matches between the candidate's alt text and the segment's narration text for the candidate to receive a positive relevance score
2. WHEN the Segment_Visual_Planner generates search queries, THE Segment_Visual_Planner SHALL derive at least one query directly from the segment's narration noun phrases rather than relying solely on the topic title
3. WHEN a candidate's alt text contains terms from an unrelated domain (e.g., mathematical equations for a narrative about personal finance), THE Media_Sourcer SHALL apply a contextual mismatch penalty of -250
4. THE Segment_Visual_Planner SHALL include the segment title as a mandatory component in at least one search query to anchor results to the specific narrative point

### Requirement 4: Thumbnail Generation Fix

**User Story:** As a video creator, I want a visible, compelling thumbnail generated for every video, so that the video has a non-zero click-through rate on YouTube.

#### Acceptance Criteria

1. THE Thumbnail_Generator SHALL produce a non-black thumbnail image for every completed video project by rendering at minimum a gradient background with text overlay when no suitable media asset is available
2. WHEN the highest-scored media asset is available, THE Thumbnail_Generator SHALL use that asset as the background image with a dark gradient overlay for text readability
3. THE Thumbnail_Generator SHALL render a text overlay of 2–5 words derived from the script's hook line or topic title, using bold 52–56px white font with a dark shadow
4. THE Thumbnail_Generator SHALL include a single dominant visual subject that communicates the video's topic within 1 second of viewing
5. IF the Thumbnail_Generator produces an image where more than 90% of pixels are within 10 RGB values of black, THEN THE Thumbnail_Generator SHALL regenerate using the gradient-plus-text fallback
6. THE Thumbnail_Generator SHALL validate that the rendered thumbnail has a minimum file size of 10KB to ensure non-trivial content was rendered

### Requirement 5: Dynamic Cut Pacing

**User Story:** As a video creator, I want the video to maintain a fast, engaging cut rhythm, so that viewers stay engaged rather than clicking away during long static stretches.

#### Acceptance Criteria

1. THE Pacing_Controller SHALL enforce a maximum visual hold time of 4 seconds for any single static image before applying a cut, zoom, or transition
2. WHEN a segment's duration exceeds 6 seconds, THE Pacing_Controller SHALL split the visual presentation into at least 2 distinct shots using the primary and secondary shot concepts from the visual plan
3. THE Pacing_Controller SHALL align visual cuts with meaning shifts in the narration (sentence boundaries, topic transitions) rather than using fixed time intervals
4. THE Pacing_Controller SHALL insert a pattern interrupt (text card, zoom change, or transition effect) at least once every 20 seconds of video duration
5. WHEN consecutive segments share the same narrative beat classification, THE Pacing_Controller SHALL insert a contrasting visual transition between them to prevent monotony
6. THE Pacing_Controller SHALL apply Ken Burns motion (pan or zoom at 2–5% per second) to all static images during their display duration to eliminate fully static frames

### Requirement 6: Visual Variety Through Shot Type Diversity

**User Story:** As a video creator, I want the video to use diverse shot types (close-ups, wide shots, data visuals, maps), so that the visual language feels intentional and professional.

#### Acceptance Criteria

1. THE Segment_Visual_Planner SHALL ensure no single shot type category (close-up, medium, wide, interface, map, typography) accounts for more than 40% of all frames in the video
2. WHEN the storyboard's shot diversity score falls below 50, THE Segment_Visual_Planner SHALL regenerate visual plans for the 3 lowest-diversity segments using alternative shot type categories
3. THE Segment_Visual_Planner SHALL assign at least 3 distinct shot type categories across any 5 consecutive segments
4. WHEN a segment's narrative beat is "data", THE Segment_Visual_Planner SHALL prioritize chart, graph, or data visualization imagery over generic stock photos
5. WHEN a segment's narrative beat is "quote", THE Segment_Visual_Planner SHALL prioritize portrait or speaker imagery over abstract backgrounds

### Requirement 7: First-Five-Seconds Impact

**User Story:** As a video creator, I want the opening 5 seconds to immediately communicate stakes and grab attention, so that viewers do not click away before the content begins.

#### Acceptance Criteria

1. THE Pipeline SHALL ensure the first segment's visual is the highest-scored non-fallback media asset in the entire project, selected specifically for visual impact
2. WHEN the first segment's narration does not contain a personal-stakes statement or surprising statistic within the first 2 sentences, THE Pipeline SHALL flag this as a "weak hook" warning in the quality report
3. THE Pacing_Controller SHALL apply a faster cut cadence (maximum 3-second holds) during the first 10 seconds of the video to establish energy
4. THE first segment's visual plan SHALL use the "hook" narrative beat classification regardless of content, triggering dramatic and attention-grabbing search queries
5. WHEN the first segment uses a fallback or procedural background, THE Pipeline SHALL attempt re-sourcing with broadened queries up to 2 additional times before accepting the fallback

### Requirement 8: Narration-to-Cut Synchronization

**User Story:** As a video creator, I want visual cuts to happen at natural speech boundaries, so that the editing feels intentional and professional rather than random.

#### Acceptance Criteria

1. WHEN narration audio is available for a segment, THE Pacing_Controller SHALL place visual cuts at sentence boundaries detected in the narration text
2. THE Pacing_Controller SHALL avoid placing a visual cut within 0.5 seconds of a narration emphasis point (data citation, proper noun, or key phrase)
3. WHEN a segment contains multiple sentences, THE Pacing_Controller SHALL assign distinct visual shots to each sentence where the segment has multiple shot concepts available
4. THE Pacing_Controller SHALL synchronize the display of animated text cards (statistics, quotes) with the corresponding narration timestamp within a 0.5-second tolerance

