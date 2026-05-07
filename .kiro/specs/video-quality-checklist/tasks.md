# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Pipeline Output Fails Quality Checklist Dimensions
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the pipeline produces output failing quality dimensions
  - **Scoped PBT Approach**: For any valid topic+style input, generate pipeline configuration and verify the prompts/scoring logic encode quality checklist requirements
  - Test that the script generator prompt enforces personal-stakes-first hooks (from Bug Condition: pipeline_output.hook.missing_personal_stakes)
  - Test that thumbnail generation produces >= 3 variants (from Bug Condition: pipeline_output.thumbnail.variant_count < 3)
  - Test that scoreCandidate includes emotional alignment scoring beyond keyword match (from Bug Condition: pipeline_output.visuals.keyword_only_scoring)
  - Test that pacing logic includes pattern interrupts (from Bug Condition: pipeline_output.pacing.missing_pattern_interrupts)
  - Test that quality scoring evaluates multiple dimensions (from Bug Condition: pipeline_output.quality_score.missing_multi_dimensional_validation)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists)
  - Document counterexamples found to understand which quality dimensions are missing
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1-1.225_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Existing Pipeline Functionality Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Observe: generateAIScript produces valid ScriptSegment[] with 6+ segments on unfixed code
  - Observe: sourceSegmentMedia returns media assets with scores on unfixed code
  - Observe: scoreCandidate returns numeric scores with keyword/resolution/source factors on unfixed code
  - Observe: generateTitleOptions returns titles within 40-70 char range on unfixed code
  - Observe: buildStoryboard produces frames with quality labels (strong/okay/weak) on unfixed code
  - Observe: validateVisualPlan produces valid LlmVisualPlan with shots on unfixed code
  - Observe: parseQualityResponse returns QualityFactors with 5 factors clamped to [0,10] on unfixed code
  - Write property-based tests: for all valid topic/style inputs, existing scoring functions return consistent numeric results
  - Write property-based tests: for all valid segments, storyboard builder produces frames with quality labels
  - Write property-based tests: for all valid media candidates, scoreCandidate returns deterministic scores based on same inputs
  - Write property-based tests: title generation respects 40-70 character bounds
  - Verify tests pass on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10_

- [x] 3. Enhance thumbnail generation for topic-specificity and multi-variant output

  - [x] 3.1 Add multi-variant thumbnail concept generation
    - Create `generateThumbnailConcepts(topic, style, audience)` function in `src/services/thumbnail.ts`
    - Generate at least 3 thumbnail concepts: "fear" variant, "curiosity" variant, "authority/news" variant
    - Each concept includes: topic-specific signifier, emotional angle, text overlay (2-5 words), color accent
    - Add topic-specific visual threat selection (e.g., hacked laptop for cybercrime, frozen bank for finance)
    - Enforce single dominant subject, no competing focal points
    - _Bug_Condition: isBugCondition(output) where output.thumbnail.variant_count < 3 AND output.thumbnail.lacks_topic_specificity_
    - _Expected_Behavior: expectedBehavior(output) where output.thumbnail.variant_count >= 3 AND output.thumbnail.has_topic_specific_signifier_
    - _Preservation: Existing generateThumbnail and generateSplitScreenThumbnail continue to work_
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.8, 2.11, 2.19, 2.20, 2.21, 2.22_

  - [x] 3.2 Add thumbnail text and readability validation
    - Enforce 2-5 word text limit on thumbnail overlays
    - Add mobile readability check (simulate 160×90px rendering)
    - Enforce bold contrast between foreground and background
    - Add visual hierarchy scoring (subject first, text second, branding third)
    - Test stronger wording variants for text overlays
    - _Bug_Condition: isBugCondition(output) where output.thumbnail.text_word_count > 5 OR output.thumbnail.mobile_unreadable_
    - _Expected_Behavior: expectedBehavior(output) where output.thumbnail.text_word_count in [2,5] AND output.thumbnail.mobile_readable_
    - _Requirements: 2.5, 2.6, 2.7, 2.13, 2.14, 2.15, 2.16, 2.17, 2.18, 2.23, 2.24, 2.25_

  - [x] 3.3 Verify bug condition exploration test now passes for thumbnail dimension
    - **Property 1: Expected Behavior** - Thumbnail Multi-Variant Generation
    - **IMPORTANT**: Re-run the SAME test from task 1 (thumbnail assertions) - do NOT write a new test
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Thumbnail-related assertions PASS (confirms fix works)
    - _Requirements: 2.1-2.25_

- [x] 4. Enhance hook generation and retention engineering in script prompts

  - [x] 4.1 Enhance script generator for personal-stakes-first hooks
    - Update system prompt in `src/services/llm/scriptGenerator.ts` to enforce:
      - First sentence must contain concrete personal risk (money, files, identity, business shutdown)
      - 3-5 fast visual beats before first full explanatory sentence
      - First line understandable by someone half-paying attention
      - Frame threat as immediate and familiar before scaling to global
      - Build curiosity with a reveal, not just alarm
    - Add hook variant generation (multiple hooks ranked by clarity, intensity, retention potential)
    - Ensure intro works with audio low/muted (on-screen text reinforces spoken hook)
    - _Bug_Condition: isBugCondition(output) where output.hook.missing_personal_stakes OR output.hook.missing_concrete_risks_
    - _Expected_Behavior: expectedBehavior(output) where output.hook.opens_with_personal_stakes AND output.hook.has_concrete_risks_
    - _Requirements: 2.26, 2.27, 2.28, 2.29, 2.30, 2.31, 2.32, 2.33, 2.34, 2.35, 2.36, 2.37, 2.38, 2.39, 2.40, 2.41, 2.42, 2.43, 2.44, 2.45_

  - [x] 4.2 Add retention engineering rules to script generation
    - Add curiosity loop injection at natural drop-off points in script reviewer
    - Enforce mini cliffhangers before transitions
    - Add "this could happen to you in one click" moment requirement
    - Alternate fear with clarity to prevent viewer fatigue
    - Ensure midpoint intensifies or reveals bigger implication
    - Add line necessity scoring (remove lines that don't improve retention/understanding)
    - Build comment triggers into ending
    - Ensure last 20 seconds reward viewers for staying
    - _Bug_Condition: isBugCondition(output) where output.retention.missing_curiosity_loops_
    - _Expected_Behavior: expectedBehavior(output) where output.retention.curiosity_loops_count >= 2 AND output.retention.midpoint_intensification_
    - _Requirements: 2.136, 2.137, 2.138, 2.139, 2.140, 2.141, 2.142, 2.143, 2.144, 2.145, 2.146, 2.147, 2.148, 2.149, 2.150_

  - [x] 4.3 Verify bug condition exploration test now passes for hook/retention dimension
    - **Property 1: Expected Behavior** - Hook and Retention Engineering
    - **IMPORTANT**: Re-run the SAME test from task 1 (hook/retention assertions) - do NOT write a new test
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Hook and retention assertions PASS
    - _Requirements: 2.26-2.45, 2.136-2.150_

- [x] 5. Enhance script-to-visual alignment with emotional scoring and classification

  - [x] 5.1 Add script line classification to visual director
    - Enhance `generateAIPlan()` prompt in `src/services/llmVisualDirector.ts` to classify each segment as personal/institutional/geopolitical/practical
    - Add classification field to `LlmVisualPlan` interface
    - Use classification to select appropriate visual scale (personal=intimate, geopolitical=wide context)
    - Ensure visual language shifts when story shifts
    - _Bug_Condition: isBugCondition(output) where output.visuals.missing_emotional_alignment_
    - _Expected_Behavior: expectedBehavior(output) where output.visuals.script_line_classification != null_
    - _Preservation: validateVisualPlan continues to produce valid plans with shots_
    - _Requirements: 2.46, 2.47, 2.48, 2.52, 2.55, 2.56, 2.57, 2.58, 2.201_

  - [x] 5.2 Add emotional alignment scoring to media candidate scoring
    - Enhance `scoreCandidate()` in `src/services/media.ts` to include emotional tone matching
    - Add scoring for: concrete visual translation of abstract lines (e.g., "bank account" → banking visuals)
    - Penalize visuals that are technically relevant but emotionally weak
    - Add duplicate image detection to prevent reuse of same stock image for unrelated concepts
    - Score image-to-line fit by emotional/contextual alignment, not just keyword match
    - _Bug_Condition: isBugCondition(output) where output.visuals.keyword_only_scoring_
    - _Expected_Behavior: expectedBehavior(output) where output.visuals.emotional_alignment_score > 0_
    - _Preservation: scoreCandidate continues to return numeric scores for all valid candidates_
    - _Requirements: 2.49, 2.50, 2.51, 2.53, 2.54, 2.59, 2.60_

  - [x] 5.3 Verify preservation tests still pass after visual alignment changes
    - **Property 2: Preservation** - Media Scoring Preservation
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions in scoring)
    - Confirm scoreCandidate still returns deterministic scores for same inputs

- [x] 6. Enhance pacing and assembly logic with meaning-based cuts

  - [x] 6.1 Implement meaning-based cuts and wave pacing
    - Enhance `scheduleRetentionBeats()` in `src/services/renderingShared.ts` to cut on meaning shifts
    - Implement wave-based pacing: impact → explanation → escalation → relief → impact
    - Add faster cuts in opener, slower in explanation sections
    - Add pattern interrupt scheduling every 20-30 seconds (text slam, zoom, graphic switch)
    - Ensure every segment either escalates, clarifies, or rewards the viewer
    - _Bug_Condition: isBugCondition(output) where output.pacing.time_interval_cuts_only AND output.pacing.missing_pattern_interrupts_
    - _Expected_Behavior: expectedBehavior(output) where output.pacing.has_meaning_based_cuts AND output.pacing.pattern_interrupt_interval <= 30_
    - _Requirements: 2.61, 2.62, 2.63, 2.64, 2.65, 2.66, 2.67, 2.68, 2.69, 2.72, 2.78, 2.79, 2.80_

  - [x] 6.2 Add monotony risk analysis and midpoint impact
    - Enhance `buildStoryboard()` in `src/services/storyboard.ts` to analyze monotony risk in sequential clips
    - Add diversity scoring for shot type variation (close-up, medium, interface, map, typography)
    - Save one high-impact visual sequence for midpoint to prevent drop-off
    - End each section with a reason to continue (visual or textual hook)
    - Trim duplicated lines and repeated stakes
    - Use shorter visual units when script becomes conceptual
    - _Bug_Condition: isBugCondition(output) where output.pacing.missing_monotony_analysis_
    - _Expected_Behavior: expectedBehavior(output) where output.pacing.monotony_risk_analyzed AND output.pacing.midpoint_impact_reserved_
    - _Requirements: 2.70, 2.71, 2.73, 2.74, 2.75, 2.76, 2.77_

  - [x] 6.3 Verify preservation tests still pass after pacing changes
    - **Property 2: Preservation** - Storyboard and Pacing Preservation
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (storyboard still produces frames with quality labels)

- [x] 7. Add semantic color system and section-specific visual modes

  - [x] 7.1 Implement semantic color system in templates
    - Add color system constants to `src/services/templates.ts`: red=#ef4444 for threat, blue=#3b82f6 for explanation, green=#22c55e for action/safety
    - Add section visual mode types: personal, corporate, geopolitical, practical, advice
    - Each mode defines: color palette, motion style, typography weight, pacing preference
    - Add brand kit consistency (fonts, colors, transitions, lower-thirds)
    - _Bug_Condition: isBugCondition(output) where output.graphics.missing_semantic_color_system_
    - _Expected_Behavior: expectedBehavior(output) where output.graphics.semantic_color_system == true AND output.graphics.section_visual_modes != null_
    - _Requirements: 2.81, 2.82, 2.89, 2.90, 2.91, 2.97, 2.98, 2.99, 2.202_

  - [x] 7.2 Enhance subtitle and on-screen text generation
    - Update `src/services/subtitles.ts` to prevent subtitle/kinetic text competition
    - Add headline-style text cards for major reveals
    - Enforce short text phrases processable instantly
    - Apply emphasis on key nouns only, not every phrase
    - Add mobile readability scoring for text overlays
    - _Bug_Condition: isBugCondition(output) where output.graphics.subtitle_kinetic_competition_
    - _Expected_Behavior: expectedBehavior(output) where output.graphics.no_text_competition AND output.graphics.mobile_readable_
    - _Requirements: 2.83, 2.84, 2.85, 2.86, 2.88, 2.92, 2.93, 2.94, 2.95, 2.96, 2.100_

- [x] 8. Enhance story structure with personal→institutional→geopolitical arc

  - [x] 8.1 Add story arc enforcement to script generator
    - Enhance system prompt in `src/services/llm/scriptGenerator.ts` to enforce:
      - Open with immediate personal stakes
      - Move from individual threat to larger system threat
      - Use "this affects you because…" bridges when scaling up
      - Bring viewer back to themselves regularly
      - Place most relatable example early, before geopolitics
      - Transition into nation-state material with clear bridge (no jumping)
    - Limit big ideas per minute
    - Ensure each section answers one question before opening the next
    - _Bug_Condition: isBugCondition(output) where output.story.missing_personal_to_institutional_arc_
    - _Expected_Behavior: expectedBehavior(output) where output.story.has_personal_institutional_geopolitical_arc AND output.story.has_bridge_transitions_
    - _Requirements: 2.101, 2.102, 2.103, 2.104, 2.105, 2.106, 2.107, 2.108, 2.109, 2.110, 2.111_

  - [x] 8.2 Add ending and CTA enhancement
    - Ensure ending releases tension by giving agency (not pure fear)
    - Make practical advice section feel earned and useful
    - Make next-video teaser feel like irresistible continuation
    - Ensure the ending feels empowering, not only alarming
    - _Requirements: 2.112, 2.113, 2.114, 2.115, 2.224_

- [x] 9. Add credibility checking and source attribution

  - [x] 9.1 Implement credibility validation in script reviewer
    - Enhance `reviewAndImproveScript()` in `src/services/llm/scriptReviewer.ts` to:
      - Flag unsourced statistics for review
      - Check and normalize large figures
      - Enforce "according to" language for major claims
      - Distinguish between verified claims, interpretive framing, and opinion
      - Detect unsupported claims or outdated statistics before render
    - Add credibility mode option (high drama vs high credibility)
    - Use strong authority framing for business-oriented audiences
    - _Bug_Condition: isBugCondition(output) where output.credibility.unsourced_statistics_
    - _Expected_Behavior: expectedBehavior(output) where output.credibility.all_statistics_sourced_
    - _Requirements: 2.116, 2.117, 2.118, 2.119, 2.120, 2.121, 2.122, 2.123, 2.124, 2.125, 2.204, 2.223_

- [x] 10. Add audience adaptation and language simplification

  - [x] 10.1 Implement audience-specific prompt variants
    - Add audience detection and adaptation in `src/services/llm/scriptGenerator.ts`
    - Create audience-specific prompt modifiers for: consumers, freelancers, small business owners
    - Enforce simple language and familiar visual examples for non-technical adults
    - Address audience-specific concerns (downtime, money loss, customer trust for SMBs)
    - Show consequences they recognize immediately (locked files, fake invoices, frozen POS)
    - Use audience-facing language ("your files," "your payroll," "your customer data")
    - Make protection steps look realistic and manageable
    - Ensure viewers feel concerned but not helpless (survival path alongside fear)
    - _Bug_Condition: isBugCondition(output) where output.audience.missing_audience_adaptation_
    - _Expected_Behavior: expectedBehavior(output) where output.audience.language_complexity <= "simple"_
    - _Requirements: 2.126, 2.127, 2.128, 2.129, 2.130, 2.131, 2.132, 2.133, 2.134, 2.135_

- [x] 11. Add audio direction metadata and section-appropriate sound design

  - [x] 11.1 Add audio direction to script segments and TTS pipeline
    - Add `audioDirection` field to ScriptSegment type in `src/types.ts`
    - Include: impact sound cues, sonic space markers, sound bed type (calm/tense/neutral)
    - Enhance script generator to output audio direction per segment
    - Implement section-appropriate sound bed selection in `src/services/renderingShared.ts`
    - Align SFX moments to retention-critical lines
    - Prevent "wall of tension" by varying audio intensity
    - Leave brief sonic space before major statements
    - _Bug_Condition: isBugCondition(output) where output.audio.missing_section_appropriate_sound_direction_
    - _Expected_Behavior: expectedBehavior(output) where output.audio.section_appropriate_direction == true_
    - _Requirements: 2.151, 2.152, 2.153, 2.154, 2.155, 2.156, 2.157, 2.158, 2.159, 2.160_

- [x] 12. Enhance scene selection with emotional clarity and diversity scoring

  - [x] 12.1 Add emotional clarity scoring to media pipeline
    - Enhance `scoreCandidate()` in `src/services/media.ts` to score for:
      - Clear human emotion in footage
      - Obvious cause-and-effect
      - Strong silhouette and immediate readability
      - Reject visually vague clips even if technically on-topic
    - Add preference for human-centered visuals over abstract tech backgrounds
    - Prefer consequences over "hackers typing" imagery
    - Match footage energy to narration energy
    - Use grounded footage in first half, conceptual only after trust built
    - _Bug_Condition: isBugCondition(output) where output.scenes.missing_emotional_clarity_scoring_
    - _Expected_Behavior: expectedBehavior(output) where output.scenes.emotional_clarity_score > 0_
    - _Preservation: scoreCandidate continues to return valid numeric scores_
    - _Requirements: 2.161, 2.162, 2.163, 2.164, 2.165, 2.167, 2.168, 2.169, 2.170, 2.172, 2.173, 2.206, 2.208, 2.209_

  - [x] 12.2 Add sequence-level diversity scoring
    - Add diversity scoring to `sourceSegmentMedia()` in `src/services/media.ts`
    - Track shot types used across segments and penalize repetition
    - Detect stock-footage fatigue risk
    - Enforce fresh shot every 15-20 seconds relative to previous
    - Actively diversify repetitive footage selections
    - _Bug_Condition: isBugCondition(output) where output.scenes.missing_diversity_scoring_
    - _Expected_Behavior: expectedBehavior(output) where output.scenes.diversity_score > threshold_
    - _Requirements: 2.166, 2.171, 2.174, 2.175, 2.200_

- [x] 13. Add section design templates and visual mode assignment

  - [x] 13.1 Implement section-specific visual templates
    - Add section design templates to `src/services/templates.ts` or new file:
      - Personal-risk: close shots, screens, alerts, intimate spaces, readable UI
      - Corporate-risk: offices, servers, dashboards, shutdown effects, team reactions
      - Geopolitical-risk: maps, infrastructure, communications, strategic overlays
      - Advice: clean checklists, calmer pacing, reassuring color balance
      - Story-example: mini beginning, disruption, aftermath structure
    - Assign visual mode to each section (not one style for entire video)
    - Add section cards/title slams for orientation when topic changes
    - Use repeated motif transitions for branded feel
    - Make practical-tips section feel like reward state
    - Connect final CTA emotionally and visually to opening problem
    - _Requirements: 2.176, 2.177, 2.178, 2.179, 2.180, 2.181, 2.182, 2.183, 2.184, 2.185_

- [x] 14. Enhance title generation and framing

  - [x] 14.1 Add stronger title generation with specificity ranking
    - Enhance `generateTitleOptions()` in `src/services/seoTitles.ts` to:
      - Generate 10-20 title variants (up from current 8)
      - Rank by specificity and curiosity score
      - Use stronger title families (loss, exposure, sabotage, shutdown, lockout, one-click disaster)
      - Replace vague labels with concrete outcomes
      - Use audience-facing language in titles
    - Add on-screen text rules: finish the thought (don't duplicate narration), headline-style for reveals
    - _Requirements: 2.186, 2.187, 2.188, 2.189, 2.190, 2.191, 2.192, 2.193, 2.194, 2.195_

- [x] 15. Add multi-dimensional quality scoring and validation gates

  - [x] 15.1 Implement comprehensive quality validation
    - Extend `src/services/qualityScorer.ts` or `src/services/blindReview.ts` to score on:
      - Clarity (is the message immediately understandable?)
      - Urgency (does it create appropriate tension?)
      - Emotional specificity (are emotions concrete, not generic?)
      - Credibility (are claims sourced and balanced?)
    - Add "must replace" warnings for weak thumbnails or generic openings
    - Add section-level retention risk measurement (repetition, abstraction, weak visual payoff)
    - Flag when sections become too abstract for intended audience
    - Generate assembly notes explaining why each clip was chosen
    - _Bug_Condition: isBugCondition(output) where output.quality_score.missing_multi_dimensional_validation_
    - _Expected_Behavior: expectedBehavior(output) where output.quality_score.dimensions >= 4_
    - _Preservation: Existing quality scoring (sharpness, lighting, composition, vibrancy, relevance) continues to work_
    - _Requirements: 2.196, 2.197, 2.198, 2.199, 2.200, 2.203, 2.204, 2.205, 2.210, 2.211, 2.213, 2.214, 2.215_

  - [x] 15.2 Integrate quality gates into pipeline orchestrator
    - Add quality validation step in `src/store/pipeline/orchestrator.ts` after each major phase
    - If thumbnail scores below threshold, auto-regenerate with different concept
    - If hook scores below threshold, flag for rewrite
    - Optimize for click-through and retention together
    - Build visible "problem to solution" arc validation
    - _Requirements: 2.196, 2.207, 2.212, 2.214, 2.216, 2.217, 2.218, 2.219, 2.220, 2.221, 2.222, 2.225_

  - [x] 15.3 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Multi-Dimensional Quality Validation
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms the expected behavior is satisfied
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms all quality dimensions are addressed)
    - _Requirements: Expected Behavior Properties from design_

  - [x] 15.4 Verify preservation tests still pass
    - **Property 2: Preservation** - Full Pipeline Preservation
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all existing functionality preserved after all changes

- [x] 16. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
  - Run full test suite to verify no regressions
  - Verify property-based tests for bug condition now pass
  - Verify property-based tests for preservation still pass
  - Confirm pipeline produces complete video output with enhanced quality
