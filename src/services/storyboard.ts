import type { MediaAsset, ScriptSegment, SegmentVisualPlan, VideoProject } from '../types';

export type StoryboardQualityLabel = 'strong' | 'okay' | 'weak';

export interface StoryboardFrame {
  id: string;
  globalSecond: number;
  localSecond: number;
  timecode: string;
  segmentIndex: number;
  segmentId: string;
  segmentTitle: string;
  segmentType: ScriptSegment['type'];
  beat: SegmentVisualPlan['beat'] | 'unknown';
  narrationSnippet: string;
  visualCue: string;
  asset?: MediaAsset;
  shotIndex: number;
  shotLabel: string;
  qualityScore: number;
  qualityLabel: StoryboardQualityLabel;
  notes: string[];
}

export interface StoryboardSegmentBlock {
  segment: ScriptSegment;
  frames: StoryboardFrame[];
  summary: {
    frameCount: number;
    strongFrames: number;
    okayFrames: number;
    weakFrames: number;
    fallbackFrames: number;
    averageScore: number;
    distinctVisuals: number;
  };
}

export interface StoryboardTotals {
  totalFrames: number;
  strongFrames: number;
  okayFrames: number;
  weakFrames: number;
  fallbackFrames: number;
  videoFrames: number;
  imageFrames: number;
  averageScore: number;
  segmentCount: number;
}

/** Shot type categories for diversity scoring */
export type ShotTypeCategory = 'close-up' | 'medium' | 'interface' | 'map' | 'typography' | 'wide' | 'unknown';

/** Monotony risk analysis for a pair of sequential blocks */
export interface MonotonyRiskEntry {
  segmentIndexA: number;
  segmentIndexB: number;
  riskScore: number; // 0-100, higher = more monotonous
  reasons: string[];
}

/** Diversity score for shot type variation across the storyboard */
export interface ShotDiversityScore {
  overallScore: number; // 0-100, higher = more diverse
  shotTypeCounts: Record<ShotTypeCategory, number>;
  dominantType: ShotTypeCategory;
  dominanceRatio: number; // 0-1, how much the dominant type dominates
  recommendations: string[];
}

/** Midpoint impact reservation metadata */
export interface MidpointImpact {
  midpointSegmentIndex: number;
  reserved: boolean;
  impactScore: number; // 0-100
  reason: string;
}

/** Section continuation hooks */
export interface SectionHook {
  segmentIndex: number;
  hookType: 'visual' | 'textual' | 'cliffhanger';
  description: string;
}

/** Conceptual density analysis for shorter visual units */
export interface ConceptualDensityEntry {
  segmentIndex: number;
  isConceptual: boolean;
  recommendedUnitDuration: number; // seconds
  narrationWordCount: number;
}

/** Full pacing metadata added to the storyboard result */
export interface StoryboardPacingMetadata {
  monotonyRiskAnalyzed: boolean;
  midpointImpactReserved: boolean;
  monotonyRisks: MonotonyRiskEntry[];
  overallMonotonyScore: number; // 0-100
  shotDiversity: ShotDiversityScore;
  midpointImpact: MidpointImpact;
  sectionHooks: SectionHook[];
  conceptualDensity: ConceptualDensityEntry[];
  duplicatedLineWarnings: string[];
}

/** A segment flagged for visual plan regeneration due to diversity violations */
export interface DiversityViolation {
  segmentIndex: number;
  reason: string;
  currentShotType: ShotTypeCategory;
  suggestedAlternatives: ShotTypeCategory[];
}

/** Result of shot type diversity enforcement */
export interface ShotDiversityEnforcement {
  /** Whether any shot type exceeds 40% of frames */
  hasDominanceViolation: boolean;
  /** The dominant type that exceeds 40%, if any */
  dominantTypeViolation?: ShotTypeCategory;
  /** Ratio of the dominant type (0-1) */
  dominantRatio: number;
  /** Segments flagged for regeneration */
  segmentsFlaggedForRegeneration: DiversityViolation[];
  /** Whether the diversity score is below 50 */
  lowDiversityScore: boolean;
  /** Windows (of 5 consecutive segments) that violate the minimum 3 distinct types rule */
  windowViolations: { startIndex: number; endIndex: number; distinctTypes: number }[];
}

export interface StoryboardBuildResult {
  blocks: StoryboardSegmentBlock[];
  totals: StoryboardTotals;
  weakestFrames: StoryboardFrame[];
  /** Pacing analysis metadata — monotony risk, diversity, midpoint impact */
  pacing?: StoryboardPacingMetadata;
  /** Shot type diversity enforcement results */
  diversityEnforcement?: ShotDiversityEnforcement;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatTimecode(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;

  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function getNarrationSnippet(segment: ScriptSegment, localSecond: number): string {
  const words = segment.narration.split(/\s+/).filter(Boolean);
  if (words.length === 0) return segment.narration;

  const progress = localSecond / Math.max(1, segment.duration);
  const centerIndex = clamp(Math.floor(progress * words.length), 0, Math.max(0, words.length - 1));
  const start = clamp(centerIndex - 2, 0, Math.max(0, words.length - 1));
  const end = clamp(centerIndex + 5, start + 1, words.length);
  const snippet = words.slice(start, end).join(' ');

  return snippet.length > 2 ? snippet : segment.narration;
}

function getSegmentAsset(
  project: VideoProject,
  segment: ScriptSegment,
  localSecond: number,
): { asset?: MediaAsset; shotIndex: number; shotLabel: string } {
  const segmentMedia = project.media.filter((asset) => asset.segmentId === segment.id);
  const plan = project.visualPlans?.[segment.id];
  const shotCount = Math.max(1, segmentMedia.length || plan?.shots?.length || 1);
  const shotDuration = Math.max(segment.duration / shotCount, 1);
  const shotIndex = clamp(Math.floor(localSecond / shotDuration), 0, Math.max(0, shotCount - 1));

  const asset = segmentMedia[shotIndex] || segmentMedia[0] || project.media[0];
  const shotType = asset?.shotType || (shotIndex === 0 ? 'primary' : 'secondary');

  return {
    asset,
    shotIndex,
    shotLabel: `${shotType === 'primary' ? 'Primary' : 'Secondary'} shot ${shotIndex + 1}`,
  };
}

function assessFrame(
  project: VideoProject,
  segment: ScriptSegment,
  localSecond: number,
  asset: MediaAsset | undefined,
  shotIndex: number,
): { score: number; label: StoryboardQualityLabel; notes: string[] } {
  const plan = project.visualPlans?.[segment.id];
  const segmentMedia = project.media.filter((item) => item.segmentId === segment.id);
  const notes: string[] = [];

  let score = 55;

  if (asset) {
    score += asset.type === 'video' ? 15 : 8;
    score += asset.reasoning ? 4 : 0;
    if (asset.isFallback) {
      score -= 22;
      notes.push('Fallback visual');
    } else {
      score += 10;
      notes.push(asset.type === 'video' ? 'Motion shot' : 'Still frame');
    }

    if (asset.shotType === 'secondary') {
      score += 5;
      notes.push('Mid-segment cutaway');
    }
  } else {
    score -= 18;
    notes.push('No sourced asset');
  }

  if (plan?.shots && plan.shots.length > 1) {
    score += 8;
    notes.push('Planned cutaway available');
  }

  if (segmentMedia.length <= 1 && segment.duration >= 15) {
    score -= 10;
    notes.push('Low shot variety');
  }

  if (segment.type === 'intro' && localSecond < 4) {
    score += 8;
    notes.push('Cold open frame');
  }

  if (segment.type === 'transition') {
    score += 5;
    notes.push('Transition beat');
  }

  if (segment.type === 'outro') {
    score += 3;
  }

  if (shotIndex > 0) {
    score += 2;
  }

  const narrationWords = segment.narration.split(/\s+/).filter(Boolean).length;
  if (narrationWords < 8) {
    score -= 6;
  }

  if (asset?.concept) {
    score += 3;
  }

  score = clamp(score, 0, 100);

  const label: StoryboardQualityLabel = score >= 90 ? 'strong' : score >= 70 ? 'okay' : 'weak';
  if (label === 'weak') {
    notes.push('Needs attention');
  }

  return { score, label, notes };
}

function buildFrameForSecond(
  project: VideoProject,
  segment: ScriptSegment,
  segmentIndex: number,
  segmentStartSecond: number,
  localSecond: number,
): StoryboardFrame {
  const { asset, shotIndex, shotLabel } = getSegmentAsset(project, segment, localSecond);
  const assessment = assessFrame(project, segment, localSecond, asset, shotIndex);
  const plan = project.visualPlans?.[segment.id];
  const narrationSnippet = getNarrationSnippet(segment, localSecond);
  const visualCue = asset?.concept || plan?.visualConcept || segment.visualNote;
  const beat = plan?.beat || 'unknown';
  const globalSecond = segmentStartSecond + localSecond;
  const timecode = formatTimecode(globalSecond);

  const notes = [...assessment.notes];
  if (asset?.duration && segment.duration > asset.duration * 1.5) {
    notes.push('Long stretch on one asset');
  }
  if (asset?.source) {
    notes.push(asset.source);
  }

  return {
    id: `${segment.id}-${localSecond}`,
    globalSecond,
    localSecond,
    timecode,
    segmentIndex,
    segmentId: segment.id,
    segmentTitle: segment.title,
    segmentType: segment.type,
    beat,
    narrationSnippet,
    visualCue,
    asset,
    shotIndex,
    shotLabel,
    qualityScore: assessment.score,
    qualityLabel: assessment.label,
    notes,
  };
}

function summarizeFrames(frames: StoryboardFrame[]): StoryboardSegmentBlock['summary'] {
  const strongFrames = frames.filter((frame) => frame.qualityLabel === 'strong').length;
  const okayFrames = frames.filter((frame) => frame.qualityLabel === 'okay').length;
  const weakFrames = frames.filter((frame) => frame.qualityLabel === 'weak').length;
  const fallbackFrames = frames.filter((frame) => frame.asset?.isFallback).length;
  const averageScore = Math.round(frames.reduce((sum, frame) => sum + frame.qualityScore, 0) / Math.max(1, frames.length));
  const distinctVisuals = new Set(frames.map((frame) => frame.asset?.url || frame.asset?.thumbnailUrl || frame.visualCue)).size;

  return {
    frameCount: frames.length,
    strongFrames,
    okayFrames,
    weakFrames,
    fallbackFrames,
    averageScore,
    distinctVisuals,
  };
}

// ---------------------------------------------------------------------------
// Shot type classification
// ---------------------------------------------------------------------------

export function classifyShotType(frame: StoryboardFrame): ShotTypeCategory {
  const cue = (frame.visualCue || '').toLowerCase();
  const label = (frame.shotLabel || '').toLowerCase();
  const concept = frame.asset?.concept?.toLowerCase() || '';
  const combined = `${cue} ${label} ${concept}`;

  if (/close[- ]?up|portrait|face|intimate|detail/.test(combined)) return 'close-up';
  if (/map|globe|geographic|infrastructure|strategic/.test(combined)) return 'map';
  if (/interface|screen|ui|dashboard|app|software|alert|notification/.test(combined)) return 'interface';
  if (/text|typography|title|headline|card|overlay|lower[- ]third/.test(combined)) return 'typography';
  if (/wide|aerial|panoram|establishing|landscape/.test(combined)) return 'wide';
  if (/medium|mid[- ]?shot|office|room|person/.test(combined)) return 'medium';

  return 'unknown';
}

// ---------------------------------------------------------------------------
// Monotony risk analysis
// ---------------------------------------------------------------------------

/**
 * Analyzes monotony risk in sequential storyboard blocks.
 * Scores pairs of adjacent segments for repetition in shot types,
 * visual cues, and asset reuse.
 */
export function analyzeMonotonyRisk(blocks: StoryboardSegmentBlock[]): MonotonyRiskEntry[] {
  const risks: MonotonyRiskEntry[] = [];

  for (let i = 0; i < blocks.length - 1; i++) {
    const blockA = blocks[i];
    const blockB = blocks[i + 1];
    const reasons: string[] = [];
    let riskScore = 0;

    // Check shot type repetition between adjacent blocks
    const typesA = blockA.frames.map(classifyShotType);
    const typesB = blockB.frames.map(classifyShotType);
    const dominantA = getMostFrequent(typesA);
    const dominantB = getMostFrequent(typesB);

    if (dominantA === dominantB && dominantA !== 'unknown') {
      riskScore += 30;
      reasons.push(`Same dominant shot type "${dominantA}" in consecutive segments`);
    }

    // Check visual cue repetition
    const cuesA = new Set(blockA.frames.map((f) => f.visualCue).filter(Boolean));
    const cuesB = new Set(blockB.frames.map((f) => f.visualCue).filter(Boolean));
    const sharedCues = [...cuesA].filter((c) => cuesB.has(c));
    if (sharedCues.length > 0) {
      riskScore += 20;
      reasons.push(`Shared visual cues across segments: ${sharedCues.length}`);
    }

    // Check asset URL reuse
    const urlsA = new Set(blockA.frames.map((f) => f.asset?.url).filter(Boolean));
    const urlsB = new Set(blockB.frames.map((f) => f.asset?.url).filter(Boolean));
    const sharedUrls = [...urlsA].filter((u) => urlsB.has(u));
    if (sharedUrls.length > 0) {
      riskScore += 25;
      reasons.push(`Reused assets across segments: ${sharedUrls.length}`);
    }

    // Check similar quality scores (lack of contrast)
    const avgScoreA = blockA.summary.averageScore;
    const avgScoreB = blockB.summary.averageScore;
    if (Math.abs(avgScoreA - avgScoreB) < 5) {
      riskScore += 15;
      reasons.push('Similar intensity/quality scores — lacks contrast');
    }

    // Check segment type repetition
    if (blockA.segment.type === blockB.segment.type && blockA.segment.type === 'section') {
      riskScore += 10;
      reasons.push('Consecutive "section" types without transition');
    }

    risks.push({
      segmentIndexA: i,
      segmentIndexB: i + 1,
      riskScore: clamp(riskScore, 0, 100),
      reasons,
    });
  }

  return risks;
}

// ---------------------------------------------------------------------------
// Shot diversity scoring
// ---------------------------------------------------------------------------

/**
 * Evaluates shot type variation across all storyboard blocks.
 * Higher scores indicate more diverse visual language.
 */
export function scoreShotDiversity(blocks: StoryboardSegmentBlock[]): ShotDiversityScore {
  const allFrames = blocks.flatMap((b) => b.frames);
  const shotTypes = allFrames.map(classifyShotType);

  const counts: Record<ShotTypeCategory, number> = {
    'close-up': 0,
    'medium': 0,
    'interface': 0,
    'map': 0,
    'typography': 0,
    'wide': 0,
    'unknown': 0,
  };

  for (const t of shotTypes) {
    counts[t]++;
  }

  const total = shotTypes.length || 1;
  const categories: ShotTypeCategory[] = ['close-up', 'medium', 'interface', 'map', 'typography', 'wide', 'unknown'];
  const dominantType = categories.reduce((a, b) => (counts[a] >= counts[b] ? a : b));
  const dominanceRatio = counts[dominantType] / total;

  // Diversity score: penalize when one type dominates
  // Perfect diversity = each type equally represented
  const activeTypes = categories.filter((c) => counts[c] > 0).length;
  const maxTypes = categories.length;
  const typeVarietyScore = (activeTypes / maxTypes) * 50;
  const evenDistributionScore = (1 - dominanceRatio) * 50;
  const overallScore = clamp(Math.round(typeVarietyScore + evenDistributionScore), 0, 100);

  const recommendations: string[] = [];
  if (dominanceRatio > 0.6) {
    recommendations.push(`Over-reliance on "${dominantType}" shots — add variety`);
  }
  if (counts['close-up'] === 0) {
    recommendations.push('No close-up shots detected — add intimate framing');
  }
  if (counts['interface'] === 0 && counts['map'] === 0) {
    recommendations.push('No interface or map shots — consider adding data visuals');
  }
  if (activeTypes < 3) {
    recommendations.push('Low shot type variety — use at least 3 different shot categories');
  }

  return {
    overallScore,
    shotTypeCounts: counts,
    dominantType,
    dominanceRatio,
    recommendations,
  };
}

// ---------------------------------------------------------------------------
// Midpoint impact reservation
// ---------------------------------------------------------------------------

function reserveMidpointImpact(blocks: StoryboardSegmentBlock[]): MidpointImpact {
  if (blocks.length === 0) {
    return { midpointSegmentIndex: 0, reserved: false, impactScore: 0, reason: 'No segments' };
  }

  const midIndex = Math.floor(blocks.length / 2);

  // Find the highest-impact block near the midpoint (±1 segment)
  const candidates = [
    Math.max(0, midIndex - 1),
    midIndex,
    Math.min(blocks.length - 1, midIndex + 1),
  ];

  let bestIndex = midIndex;
  let bestScore = 0;

  for (const idx of candidates) {
    const block = blocks[idx];
    // Impact score based on: video frames, strong frames, distinct visuals
    const videoBonus = block.frames.filter((f) => f.asset?.type === 'video').length * 5;
    const strongBonus = block.summary.strongFrames * 10;
    const distinctBonus = block.summary.distinctVisuals * 8;
    const score = clamp(videoBonus + strongBonus + distinctBonus, 0, 100);

    if (score > bestScore) {
      bestScore = score;
      bestIndex = idx;
    }
  }

  return {
    midpointSegmentIndex: bestIndex,
    reserved: true,
    impactScore: bestScore,
    reason: bestScore > 0
      ? `High-impact visual sequence reserved at segment ${bestIndex} to prevent midpoint drop-off`
      : 'Midpoint reserved — consider adding stronger visuals here',
  };
}

// ---------------------------------------------------------------------------
// Section continuation hooks
// ---------------------------------------------------------------------------

function identifySectionHooks(blocks: StoryboardSegmentBlock[]): SectionHook[] {
  const hooks: SectionHook[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const lastFrame = block.frames[block.frames.length - 1];

    // Determine hook type based on segment characteristics
    if (lastFrame?.asset?.type === 'video' && lastFrame.qualityLabel === 'strong') {
      hooks.push({
        segmentIndex: i,
        hookType: 'visual',
        description: 'Strong visual at section end creates reason to continue',
      });
    } else if (block.segment.type === 'transition') {
      hooks.push({
        segmentIndex: i,
        hookType: 'cliffhanger',
        description: 'Transition segment bridges to next section',
      });
    } else {
      hooks.push({
        segmentIndex: i,
        hookType: 'textual',
        description: 'Section end — consider adding visual or textual hook',
      });
    }
  }

  return hooks;
}

// ---------------------------------------------------------------------------
// Conceptual density analysis
// ---------------------------------------------------------------------------

function analyzeConceptualDensity(blocks: StoryboardSegmentBlock[]): ConceptualDensityEntry[] {
  return blocks.map((block, index) => {
    const narrationWords = block.segment.narration.split(/\s+/).filter(Boolean).length;
    const wordsPerSecond = narrationWords / Math.max(1, block.segment.duration);

    // A segment is "conceptual" if it has high word density but few distinct visuals
    const isConceptual = wordsPerSecond > 3 && block.summary.distinctVisuals <= 1;

    // Recommend shorter visual units for conceptual segments
    const recommendedUnitDuration = isConceptual
      ? Math.max(2, Math.floor(block.segment.duration / 3))
      : block.segment.duration;

    return {
      segmentIndex: index,
      isConceptual,
      recommendedUnitDuration,
      narrationWordCount: narrationWords,
    };
  });
}

// ---------------------------------------------------------------------------
// Duplicated line detection
// ---------------------------------------------------------------------------

function detectDuplicatedLines(blocks: StoryboardSegmentBlock[]): string[] {
  const warnings: string[] = [];
  const seenNarrations = new Map<string, number>();

  for (let i = 0; i < blocks.length; i++) {
    const narration = blocks[i].segment.narration.trim().toLowerCase();
    // Split into sentences and check for repeated stakes/phrases
    const sentences = narration.split(/[.!?]+/).map((s) => s.trim()).filter((s) => s.length > 10);

    for (const sentence of sentences) {
      if (seenNarrations.has(sentence)) {
        const prevIndex = seenNarrations.get(sentence)!;
        warnings.push(`Repeated line in segments ${prevIndex} and ${i}: "${sentence.slice(0, 50)}..."`);
      } else {
        seenNarrations.set(sentence, i);
      }
    }
  }

  return warnings;
}

// ---------------------------------------------------------------------------
// Helper: get most frequent element
// ---------------------------------------------------------------------------

function getMostFrequent<T>(arr: T[]): T {
  const counts = new Map<T, number>();
  for (const item of arr) {
    counts.set(item, (counts.get(item) || 0) + 1);
  }
  let maxItem = arr[0];
  let maxCount = 0;
  for (const [item, count] of counts) {
    if (count > maxCount) {
      maxCount = count;
      maxItem = item;
    }
  }
  return maxItem;
}

// ---------------------------------------------------------------------------
// Shot type diversity enforcement
// ---------------------------------------------------------------------------

/** All known shot type categories (excluding 'unknown') */
const SHOT_TYPE_CATEGORIES: ShotTypeCategory[] = ['close-up', 'medium', 'interface', 'map', 'typography', 'wide'];

/**
 * Checks if any shot type exceeds 40% of frames and flags the segments
 * that contribute most to the dominant type for regeneration.
 */
export function checkShotTypeDominance(
  blocks: StoryboardSegmentBlock[],
): { hasDominanceViolation: boolean; dominantType?: ShotTypeCategory; dominantRatio: number; flaggedSegments: DiversityViolation[] } {
  const allFrames = blocks.flatMap((b) => b.frames);
  const total = allFrames.length;

  if (total === 0) {
    return { hasDominanceViolation: false, dominantRatio: 0, flaggedSegments: [] };
  }

  // Count shot types across all frames
  const counts: Record<ShotTypeCategory, number> = {
    'close-up': 0, 'medium': 0, 'interface': 0, 'map': 0, 'typography': 0, 'wide': 0, 'unknown': 0,
  };
  for (const frame of allFrames) {
    counts[classifyShotType(frame)]++;
  }

  // Find the dominant type (excluding 'unknown')
  const categories: ShotTypeCategory[] = [...SHOT_TYPE_CATEGORIES, 'unknown'];
  const dominantType = categories.reduce((a, b) => (counts[a] >= counts[b] ? a : b));
  const dominantRatio = counts[dominantType] / total;

  if (dominantRatio <= 0.4) {
    return { hasDominanceViolation: false, dominantRatio, flaggedSegments: [] };
  }

  // Flag segments that contribute most to the dominant type
  const segmentContributions = blocks.map((block, index) => {
    const segFrames = block.frames;
    const dominantCount = segFrames.filter((f) => classifyShotType(f) === dominantType).length;
    return { index, dominantCount, ratio: dominantCount / Math.max(1, segFrames.length) };
  });

  // Sort by contribution ratio (highest first) and flag top contributors
  const sorted = [...segmentContributions].sort((a, b) => b.ratio - a.ratio);
  const flagged: DiversityViolation[] = sorted
    .filter((s) => s.ratio > 0.5) // Only flag segments where dominant type is majority
    .slice(0, 5) // Limit to top 5
    .map((s) => ({
      segmentIndex: s.index,
      reason: `Shot type "${dominantType}" exceeds 40% of total frames (${Math.round(dominantRatio * 100)}%); this segment is ${Math.round(s.ratio * 100)}% "${dominantType}"`,
      currentShotType: dominantType,
      suggestedAlternatives: SHOT_TYPE_CATEGORIES.filter((c) => c !== dominantType),
    }));

  return { hasDominanceViolation: true, dominantType, dominantRatio, flaggedSegments: flagged };
}

/**
 * When scoreShotDiversity returns score < 50, identifies the 3 lowest-diversity
 * segments for visual plan regeneration.
 */
export function identifyLowestDiversitySegments(
  blocks: StoryboardSegmentBlock[],
  diversityScore: ShotDiversityScore,
): DiversityViolation[] {
  if (diversityScore.overallScore >= 50 || blocks.length === 0) {
    return [];
  }

  // Score each segment's internal diversity
  const segmentDiversityScores = blocks.map((block, index) => {
    const types = block.frames.map(classifyShotType);
    const distinctTypes = new Set(types).size;
    const dominant = getMostFrequent(types);
    const dominantRatio = types.filter((t) => t === dominant).length / Math.max(1, types.length);
    // Lower score = less diverse
    const score = distinctTypes * 20 - dominantRatio * 50;
    return { index, score, dominant, distinctTypes };
  });

  // Sort by diversity score (lowest first) and take 3
  const sorted = [...segmentDiversityScores].sort((a, b) => a.score - b.score);
  return sorted.slice(0, 3).map((s) => ({
    segmentIndex: s.index,
    reason: `Low diversity segment (${s.distinctTypes} distinct types, ${Math.round(s.score)} diversity score); overall storyboard diversity is ${diversityScore.overallScore}/100`,
    currentShotType: s.dominant,
    suggestedAlternatives: SHOT_TYPE_CATEGORIES.filter((c) => c !== s.dominant),
  }));
}

/**
 * Enforces minimum 3 distinct shot types across any 5 consecutive segments.
 * Returns windows that violate this constraint.
 */
export function enforceWindowDiversity(
  blocks: StoryboardSegmentBlock[],
): { windowViolations: { startIndex: number; endIndex: number; distinctTypes: number }[]; flaggedSegments: DiversityViolation[] } {
  const windowViolations: { startIndex: number; endIndex: number; distinctTypes: number }[] = [];
  const flaggedSegmentIndices = new Set<number>();

  if (blocks.length < 5) {
    return { windowViolations, flaggedSegments: [] };
  }

  for (let i = 0; i <= blocks.length - 5; i++) {
    const windowBlocks = blocks.slice(i, i + 5);
    const windowFrames = windowBlocks.flatMap((b) => b.frames);
    const types = windowFrames.map(classifyShotType);
    const distinctTypes = new Set(types.filter((t) => t !== 'unknown')).size;

    if (distinctTypes < 3) {
      windowViolations.push({ startIndex: i, endIndex: i + 4, distinctTypes });
      // Flag segments in this window that have the least diversity
      for (let j = i; j < i + 5; j++) {
        const segTypes = blocks[j].frames.map(classifyShotType);
        const segDistinct = new Set(segTypes.filter((t) => t !== 'unknown')).size;
        if (segDistinct <= 1) {
          flaggedSegmentIndices.add(j);
        }
      }
    }
  }

  const flaggedSegments: DiversityViolation[] = [...flaggedSegmentIndices].map((index) => {
    const dominant = getMostFrequent(blocks[index].frames.map(classifyShotType));
    return {
      segmentIndex: index,
      reason: `Part of a 5-segment window with fewer than 3 distinct shot types`,
      currentShotType: dominant,
      suggestedAlternatives: SHOT_TYPE_CATEGORIES.filter((c) => c !== dominant),
    };
  });

  return { windowViolations, flaggedSegments };
}

/**
 * Main orchestrator: runs all shot type diversity checks and returns
 * a combined enforcement result.
 */
export function enforceShotTypeDiversity(
  blocks: StoryboardSegmentBlock[],
  diversityScore: ShotDiversityScore,
): ShotDiversityEnforcement {
  const dominanceCheck = checkShotTypeDominance(blocks);
  const lowestDiversitySegments = identifyLowestDiversitySegments(blocks, diversityScore);
  const windowCheck = enforceWindowDiversity(blocks);

  // Combine all flagged segments, deduplicating by index
  const allFlagged = new Map<number, DiversityViolation>();
  for (const v of dominanceCheck.flaggedSegments) {
    allFlagged.set(v.segmentIndex, v);
  }
  for (const v of lowestDiversitySegments) {
    if (!allFlagged.has(v.segmentIndex)) {
      allFlagged.set(v.segmentIndex, v);
    }
  }
  for (const v of windowCheck.flaggedSegments) {
    if (!allFlagged.has(v.segmentIndex)) {
      allFlagged.set(v.segmentIndex, v);
    }
  }

  return {
    hasDominanceViolation: dominanceCheck.hasDominanceViolation,
    dominantTypeViolation: dominanceCheck.dominantType,
    dominantRatio: dominanceCheck.dominantRatio,
    segmentsFlaggedForRegeneration: [...allFlagged.values()],
    lowDiversityScore: diversityScore.overallScore < 50,
    windowViolations: windowCheck.windowViolations,
  };
}

// ---------------------------------------------------------------------------
// Build pacing metadata
// ---------------------------------------------------------------------------

function buildPacingMetadata(blocks: StoryboardSegmentBlock[]): StoryboardPacingMetadata {
  const monotonyRisks = analyzeMonotonyRisk(blocks);
  const overallMonotonyScore = monotonyRisks.length > 0
    ? Math.round(monotonyRisks.reduce((sum, r) => sum + r.riskScore, 0) / monotonyRisks.length)
    : 0;

  const shotDiversity = scoreShotDiversity(blocks);
  const midpointImpact = reserveMidpointImpact(blocks);
  const sectionHooks = identifySectionHooks(blocks);
  const conceptualDensity = analyzeConceptualDensity(blocks);
  const duplicatedLineWarnings = detectDuplicatedLines(blocks);

  return {
    monotonyRiskAnalyzed: true,
    midpointImpactReserved: midpointImpact.reserved,
    monotonyRisks,
    overallMonotonyScore,
    shotDiversity,
    midpointImpact,
    sectionHooks,
    conceptualDensity,
    duplicatedLineWarnings,
  };
}

export function buildStoryboard(project: VideoProject): StoryboardBuildResult {
  const blocks: StoryboardSegmentBlock[] = [];
  const allFrames: StoryboardFrame[] = [];
  let segmentStartSecond = 0;

  project.script.forEach((segment, segmentIndex) => {
    const segmentSeconds = Math.max(1, Math.ceil(segment.duration));
    const frames: StoryboardFrame[] = [];

    for (let localSecond = 0; localSecond < segmentSeconds; localSecond += 1) {
      const frame = buildFrameForSecond(project, segment, segmentIndex, segmentStartSecond, localSecond);
      frames.push(frame);
      allFrames.push(frame);
    }

    blocks.push({
      segment,
      frames,
      summary: summarizeFrames(frames),
    });

    segmentStartSecond += segmentSeconds;
  });

  const totals: StoryboardTotals = {
    totalFrames: allFrames.length,
    strongFrames: allFrames.filter((frame) => frame.qualityLabel === 'strong').length,
    okayFrames: allFrames.filter((frame) => frame.qualityLabel === 'okay').length,
    weakFrames: allFrames.filter((frame) => frame.qualityLabel === 'weak').length,
    fallbackFrames: allFrames.filter((frame) => frame.asset?.isFallback).length,
    videoFrames: allFrames.filter((frame) => frame.asset?.type === 'video').length,
    imageFrames: allFrames.filter((frame) => frame.asset?.type === 'image').length,
    averageScore: Math.round(allFrames.reduce((sum, frame) => sum + frame.qualityScore, 0) / Math.max(1, allFrames.length)),
    segmentCount: blocks.length,
  };

  const weakestFrames = [...allFrames]
    .sort((a, b) => a.qualityScore - b.qualityScore)
    .slice(0, Math.min(6, allFrames.length));

  const pacing = buildPacingMetadata(blocks);
  const diversityEnforcement = enforceShotTypeDiversity(blocks, pacing.shotDiversity);

  return { blocks, totals, weakestFrames, pacing, diversityEnforcement };
}

export function formatStoryboardTimecode(seconds: number): string {
  return formatTimecode(seconds);
}
