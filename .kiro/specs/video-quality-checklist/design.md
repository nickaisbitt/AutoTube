# Design Document: Video Quality Checklist

## Overview

The AutoTube pipeline produces videos that fail a comprehensive 225-item quality checklist. The root cause is that the pipeline generates generic output without validating quality across multiple dimensions: thumbnails, hooks, script-to-visual alignment, pacing, graphics, story structure, credibility, audience fit, retention engineering, audio direction, scene selection, section design, titles, and AI tool rules.

The fix enhances LLM prompts, scoring logic, and pipeline flow to systematically address these quality gaps through prompt engineering, multi-dimensional scoring, and validation gates.

## Bug Condition

```
isBugCondition(pipeline_output):
  // The bug triggers when the pipeline produces output that fails quality checks
  // across any of the 14 quality dimensions
  return (
    pipeline_output.thumbnail.lacks_topic_specificity OR
    pipeline_output.thumbnail.variant_count < 3 OR
    pipeline_output.hook.missing_personal_stakes OR
    pipeline_output.hook.missing_concrete_risks OR
    pipeline_output.visuals.keyword_only_scoring OR
    pipeline_output.visuals.missing_emotional_alignment OR
    pipeline_output.pacing.time_interval_cuts_only OR
    pipeline_output.pacing.missing_pattern_interrupts OR
    pipeline_output.graphics.missing_semantic_color_system OR
    pipeline_output.story.missing_personal_to_institutional_arc OR
    pipeline_output.credibility.unsourced_statistics OR
    pipeline_output.audience.missing_audience_adaptation OR
    pipeline_output.retention.missing_curiosity_loops OR
    pipeline_output.audio.missing_section_appropriate_sound_direction OR
    pipeline_output.scenes.missing_emotional_clarity_scoring OR
    pipeline_output.scenes.missing_diversity_scoring OR
    pipeline_output.quality_score.missing_multi_dimensional_validation
  )
```

## Expected Behavior

```
expectedBehavior(pipeline_output):
  // After fix, the pipeline produces output that passes quality validation
  assert pipeline_output.thumbnail.variant_count >= 3
  assert pipeline_output.thumbnail.has_topic_specific_signifier == true
  assert pipeline_output.thumbnail.has_emotional_contrast == true
  assert pipeline_output.thumbnail.text_word_count in [2, 5]
  assert pipeline_output.hook.opens_with_personal_stakes == true
  assert pipeline_output.hook.has_concrete_risks == true
  assert pipeline_output.hook.visual_beats_before_explanation >= 3
  assert pipeline_output.visuals.emotional_alignment_score > 0
  assert pipeline_output.visuals.script_line_classification != null
  assert pipeline_output.pacing.has_meaning_based_cuts == true
  assert pipeline_output.pacing.pattern_interrupt_interval <= 30
  assert pipeline_output.pacing.wave_based_pacing == true
  assert pipeline_output.graphics.semantic_color_system == true
  assert pipeline_output.graphics.section_visual_modes != null
  assert pipeline_output.story.has_personal_institutional_geopolitical_arc == true
  assert pipeline_output.story.has_bridge_transitions == true
  assert pipeline_output.credibility.all_statistics_sourced == true
  assert pipeline_output.audience.language_complexity <= "simple"
  assert pipeline_output.retention.curiosity_loops_count >= 2
  assert pipeline_output.retention.midpoint_intensification == true
  assert pipeline_output.audio.section_appropriate_direction == true
  assert pipeline_output.scenes.emotional_clarity_score > 0
  assert pipeline_output.scenes.diversity_score > threshold
  assert pipeline_output.quality_score.dimensions >= 4
```

## Preservation Requirements

```
preservationRequirement(pipeline_input, pipeline_output):
  // For all valid inputs, the pipeline must continue to:
  assert pipeline_output.is_complete_video == true  // 3.1
  assert pipeline_output.script.segments.length >= 6  // 3.2
  assert pipeline_output.media.length > 0  // 3.3
  assert pipeline_output.visual_plans.has_two_shots == true  // 3.4
  assert pipeline_output.quality_scorer.evaluates_5_factors == true  // 3.5
  assert pipeline_output.titles.length_in_range(40, 70) == true  // 3.6
  assert pipeline_output.storyboard.has_quality_labels == true  // 3.7
  assert pipeline_output.hook_reorder.works == true  // 3.8
  assert pipeline_output.render.produces_valid_file == true  // 3.9
  assert pipeline_output.batch.error_isolation == true  // 3.10
```

## Implementation Strategy

### Phase 1: Thumbnail Enhancement (Requirements 2.1–2.25)

**Target files:** `src/services/thumbnail.ts`, `src/services/llmVisualDirector.ts`

**Approach:**
- Add a `generateThumbnailConcepts()` function that produces 3+ thumbnail concept variants per video (fear, curiosity, authority/news)
- Enhance thumbnail generation prompts to require topic-specific signifiers, emotional contrast, mobile readability, and 2-5 word text limits
- Add thumbnail scoring that validates: single focal point, bold contrast, visual hierarchy, mobile legibility
- Generate multiple thumbnail variants with different emotional angles

### Phase 2: Hook & Retention Engineering (Requirements 2.26–2.45, 2.136–2.150)

**Target files:** `src/services/llm/scriptGenerator.ts`, `src/services/llm/scriptReviewer.ts`

**Approach:**
- Enhance the script generator system prompt to enforce personal-stakes-first opening, concrete risks in first sentence, 3-5 fast visual beats before explanation
- Add retention engineering rules: curiosity loops at drop-off points, mini cliffhangers before transitions, midpoint intensification
- Add a hook scoring/ranking system that evaluates clarity, intensity, and retention potential
- Enforce "every second has purpose" density scoring in the script reviewer

### Phase 3: Script-to-Visual Alignment (Requirements 2.46–2.60)

**Target files:** `src/services/llmVisualDirector.ts`, `src/services/visualPlanner.ts`, `src/services/media.ts`

**Approach:**
- Add script line classification (personal/institutional/geopolitical/practical) to the visual director prompt
- Enhance `scoreCandidate()` to include emotional alignment scoring beyond keyword matching
- Add visual-scale matching: personal lines get intimate visuals, geopolitical lines get larger-context visuals
- Add duplicate detection to reject reuse of same stock image for unrelated concepts

### Phase 4: Pacing & Assembly Logic (Requirements 2.61–2.80)

**Target files:** `src/services/storyboard.ts`, `src/services/renderingShared.ts`

**Approach:**
- Enhance `scheduleRetentionBeats()` to implement meaning-based cuts instead of time-interval cuts
- Add pattern interrupt scheduling every 20-30 seconds (text slam, zoom, graphic switch)
- Implement wave-based pacing (impact → explanation → escalation → relief → impact)
- Add monotony risk analysis for sequential clips
- Implement faster cuts in opener, slower in explanation sections

### Phase 5: Graphics & Motion Design Direction (Requirements 2.81–2.100)

**Target files:** `src/services/subtitles.ts`, `src/services/llmVisualDirector.ts`, `src/services/templates.ts`

**Approach:**
- Add semantic color system to templates: red=threat, blue=explanation, green=action/safety
- Add section-specific visual mode assignment (personal, corporate, geopolitical, practical)
- Enhance subtitle generation to prevent kinetic text competing with subtitles
- Add mobile readability scoring for text overlays

### Phase 6: Story Structure Enhancement (Requirements 2.101–2.115)

**Target files:** `src/services/llm/scriptGenerator.ts`, `src/services/llm/scriptReviewer.ts`

**Approach:**
- Enhance script generator to enforce personal→institutional→geopolitical arc with explicit bridge transitions
- Add "this affects you because…" bridge requirement when story scales up
- Enforce one-question-per-section rule and limit big ideas per minute
- Ensure ending releases tension by giving agency (not pure fear)

### Phase 7: Credibility & Accuracy Checking (Requirements 2.116–2.125)

**Target files:** `src/services/llm/scriptReviewer.ts`, `src/services/llm/scriptGenerator.ts`

**Approach:**
- Add unsourced statistic detection in the script reviewer
- Enhance the reviewer to flag large figures for normalization
- Add "according to" language enforcement for major claims
- Add credibility mode option (high drama vs high credibility)

### Phase 8: Audience Adaptation (Requirements 2.126–2.135)

**Target files:** `src/services/llm/scriptGenerator.ts`, `src/services/templates.ts`

**Approach:**
- Add audience-specific prompt variants for consumers, freelancers, and small business owners
- Enforce simple language and familiar visual examples for non-technical adults
- Add audience-facing language rules ("your files," "your payroll," "your customer data")
- Ensure protection steps look realistic and manageable

### Phase 9: Audio Direction Enhancement (Requirements 2.151–2.160)

**Target files:** `src/services/tts/index.ts`, `src/services/renderingShared.ts`

**Approach:**
- Add audio direction metadata to script segments (impact sounds, sonic space, sound bed type)
- Implement section-appropriate sound bed selection (calmer for advice, tenser for threat)
- Add SFX moment alignment to retention-critical lines
- Prevent "wall of tension" by varying audio intensity across sections

### Phase 10: Scene Selection Enhancement (Requirements 2.161–2.175)

**Target files:** `src/services/media.ts`, `src/services/qualityScorer.ts`

**Approach:**
- Add emotional clarity scoring to `scoreCandidate()` (human emotion, cause-and-effect, silhouette readability)
- Add sequence-level diversity scoring to prevent repetitive footage
- Implement stock-footage fatigue detection
- Add preference for human-centered visuals over abstract tech backgrounds
- Enforce fresh shot every 15-20 seconds

### Phase 11: Quality Scoring & Validation (Requirements 2.196–2.215)

**Target files:** `src/services/qualityScorer.ts`, `src/services/blindReview.ts`

**Approach:**
- Extend quality scoring to multi-dimensional: clarity, urgency, emotional specificity, credibility
- Add "must replace" warnings for weak thumbnails or generic openings
- Add section-level retention risk measurement
- Add mobile readability validation gate before final output

## Affected Services

| Service | Changes |
|---------|---------|
| `src/services/thumbnail.ts` | Multi-variant generation, topic-specific concepts, emotional contrast, mobile readability |
| `src/services/llm/scriptGenerator.ts` | Hook enhancement, story structure, audience adaptation, retention engineering |
| `src/services/llm/scriptReviewer.ts` | Credibility checking, density scoring, repetition removal |
| `src/services/llmVisualDirector.ts` | Script line classification, emotional alignment, section visual modes |
| `src/services/visualPlanner.ts` | Scale matching, section-aware planning |
| `src/services/media.ts` | Emotional clarity scoring, diversity scoring, duplicate detection |
| `src/services/qualityScorer.ts` | Multi-dimensional scoring, retention risk, mobile readability |
| `src/services/storyboard.ts` | Meaning-based cuts, wave pacing, monotony analysis |
| `src/services/renderingShared.ts` | Pattern interrupts, audio direction, pacing waves |
| `src/services/subtitles.ts` | Anti-competition with kinetic text, headline-style cards |
| `src/services/templates.ts` | Semantic color system, section visual modes, audience variants |
| `src/services/tts/index.ts` | Audio direction metadata, section-appropriate sound beds |
| `src/services/seoTitles.ts` | Stronger title families, 10-20 variants, specificity ranking |
| `src/services/blindReview.ts` | Multi-dimensional validation, must-replace warnings |
| `src/store/pipeline/orchestrator.ts` | Quality gate integration, multi-variant generation |
