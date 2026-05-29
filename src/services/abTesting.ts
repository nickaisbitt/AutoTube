import { logger } from './logger';
import { safeSetItem, safeGetItem } from '../utils/storage';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ABTestType = 'thumbnail' | 'title' | 'hook' | 'cta';

export interface ABTestVariant {
  id: string;
  label: string;
  value: string;
  impressions: number;
  clicks: number;
  views: number;
  watchTimeMinutes: number;
  ctr: number;
  engagementRate: number;
}

export interface ABTest {
  id: string;
  videoId: string;
  type: ABTestType;
  status: 'running' | 'completed' | 'cancelled';
  variants: ABTestVariant[];
  winnerId: string | null;
  confidence: number;
  createdAt: string;
  endedAt: string | null;
  minSamples: number;
}

export interface ABTestRecommendation {
  testId: string;
  type: ABTestType;
  winnerId: string;
  winnerLabel: string;
  confidence: number;
  improvementPercent: number;
  reason: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIN_SAMPLES_FOR_WINNER = 100;
const CONFIDENCE_THRESHOLD = 0.95;

// ---------------------------------------------------------------------------
// Test creation
// ---------------------------------------------------------------------------

export function createABTest(
  videoId: string,
  type: ABTestType,
  variants: Array<{ label: string; value: string }>,
  minSamples = MIN_SAMPLES_FOR_WINNER,
): ABTest {
  const test: ABTest = {
    id: `abtest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    videoId,
    type,
    status: 'running',
    variants: variants.map((v, i) => ({
      id: `var_${i}_${Math.random().toString(36).slice(2, 6)}`,
      label: v.label,
      value: v.value,
      impressions: 0,
      clicks: 0,
      views: 0,
      watchTimeMinutes: 0,
      ctr: 0,
      engagementRate: 0,
    })),
    winnerId: null,
    confidence: 0,
    createdAt: new Date().toISOString(),
    endedAt: null,
    minSamples,
  };

  persistTest(test);
  logger.success('ABTest', `Created ${type} test with ${variants.length} variants for video ${videoId}`);
  return test;
}

// ---------------------------------------------------------------------------
// Recording events
// ---------------------------------------------------------------------------

export function recordImpression(testId: string, variantId: string): void {
  const test = getTest(testId);
  if (!test || test.status !== 'running') return;
  const variant = test.variants.find(v => v.id === variantId);
  if (!variant) return;
  variant.impressions++;
  variant.ctr = variant.impressions > 0 ? (variant.clicks / variant.impressions) * 100 : 0;
  persistTest(test);
}

export function recordClick(testId: string, variantId: string): void {
  const test = getTest(testId);
  if (!test || test.status !== 'running') return;
  const variant = test.variants.find(v => v.id === variantId);
  if (!variant) return;
  variant.clicks++;
  variant.ctr = variant.impressions > 0 ? (variant.clicks / variant.impressions) * 100 : 0;
  persistTest(test);
}

export function recordView(testId: string, variantId: string, watchTimeMinutes: number): void {
  const test = getTest(testId);
  if (!test || test.status !== 'running') return;
  const variant = test.variants.find(v => v.id === variantId);
  if (!variant) return;
  variant.views++;
  variant.watchTimeMinutes += watchTimeMinutes;
  variant.engagementRate = variant.views > 0
    ? (variant.watchTimeMinutes / variant.views) * 100
    : 0;
  persistTest(test);
}

// ---------------------------------------------------------------------------
// Analysis & winner selection
// ---------------------------------------------------------------------------

export function analyzeTest(testId: string): ABTestRecommendation | null {
  const test = getTest(testId);
  if (!test) return null;

  // Check minimum sample size
  const totalImpressions = test.variants.reduce((s, v) => s + v.impressions, 0);
  if (totalImpressions < test.minSamples) {
    logger.info('ABTest', `Test ${testId} needs more samples (${totalImpressions}/${test.minSamples})`);
    return null;
  }

  // Calculate statistical significance using chi-squared approximation
  const bestVariant = [...test.variants].sort((a, b) => {
    const metricA = getTestMetric(a, test.type);
    const metricB = getTestMetric(b, test.type);
    return metricB - metricA;
  })[0];

  const worstCTR = Math.min(...test.variants.map(v => v.ctr));
  const bestCTR = bestVariant.ctr;
  const improvementPercent = worstCTR > 0 ? ((bestCTR - worstCTR) / worstCTR) * 100 : 0;

  // Simplified confidence calculation based on sample size and effect size
  const confidence = calculateConfidence(test.variants, test.type);

  if (confidence >= CONFIDENCE_THRESHOLD) {
    const recommendation: ABTestRecommendation = {
      testId: test.id,
      type: test.type,
      winnerId: bestVariant.id,
      winnerLabel: bestVariant.label,
      confidence,
      improvementPercent,
      reason: buildRecommendationReason(bestVariant, test.variants, test.type, improvementPercent),
    };

    // Mark test as completed
    test.winnerId = bestVariant.id;
    test.confidence = confidence;
    test.status = 'completed';
    test.endedAt = new Date().toISOString();
    persistTest(test);

    logger.success('ABTest', `Test ${testId} complete. Winner: "${bestVariant.label}" (${improvementPercent.toFixed(1)}% improvement, ${(confidence * 100).toFixed(1)}% confidence)`);
    return recommendation;
  }

  return null;
}

function getTestMetric(variant: ABTestVariant, type: ABTestType): number {
  switch (type) {
    case 'thumbnail':
    case 'title':
      return variant.ctr;
    case 'hook':
      return variant.engagementRate;
    case 'cta':
      return variant.views > 0 ? variant.clicks / variant.views : 0;
    default:
      return variant.ctr;
  }
}

function calculateConfidence(variants: ABTestVariant[], type: ABTestType): number {
  if (variants.length < 2) return 0;

  const totalSamples = variants.reduce((s, v) => s + v.impressions, 0);
  if (totalSamples < 10) return 0;

  // Pooled proportion
  const totalSuccesses = variants.reduce((s, v) => s + v.clicks, 0);
  const pooled = totalSuccesses / totalSamples;

  // Standard error for each variant (used for z-score calculation below)
  void variants.map(v => {
    if (v.impressions === 0) return 0;
    const p = type === 'hook' ? v.engagementRate / 100 : v.ctr / 100;
    return Math.sqrt((p * (1 - p)) / v.impressions);
  });

  // Z-score approximation (comparing best vs worst)
  const rates = variants.map(v => type === 'hook' ? v.engagementRate / 100 : v.ctr / 100);
  const maxRate = Math.max(...rates);
  const minRate = Math.min(...rates);
  const pooledSE = Math.sqrt(pooled * (1 - pooled) * (1 / variants[0].impressions + 1 / variants[1].impressions));

  if (pooledSE === 0) return 0;
  const z = (maxRate - minRate) / pooledSE;

  // Approximate confidence from z-score
  // z=1.96 -> 95%, z=2.58 -> 99%
  const confidence = Math.min(0.999, 0.5 * (1 + erf(z / Math.sqrt(2))));
  return confidence;
}

// Approximation of the error function
function erf(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x >= 0 ? 1 : -1;
  const absX = Math.abs(x);
  const t = 1 / (1 + p * absX);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
  return sign * y;
}

function buildRecommendationReason(
  winner: ABTestVariant,
  _allVariants: ABTestVariant[],
  type: ABTestType,
  improvementPercent: number,
): string {
  const typeLabel = type === 'thumbnail' ? 'thumbnail' :
    type === 'title' ? 'title' :
    type === 'hook' ? 'hook' : 'CTA';

  const metricLabel = type === 'hook' ? 'engagement rate' : 'CTR';

  return `${typeLabel} variant "${winner.label}" outperforms with ${winner.ctr.toFixed(1)}% ${metricLabel} ` +
    `(${improvementPercent.toFixed(1)}% improvement over lowest performer). ` +
    `Consider using this ${typeLabel} approach for future videos.`;
}

// ---------------------------------------------------------------------------
// Retrieval
// ---------------------------------------------------------------------------

export function getTest(testId: string): ABTest | null {
  try {
    const stored = safeGetItem('autotube_ab_tests');
    const all: ABTest[] = stored ? JSON.parse(stored) : [];
    return all.find(t => t.id === testId) ?? null;
  } catch {
    return null;
  }
}

export function getTestsForVideo(videoId: string): ABTest[] {
  try {
    const stored = safeGetItem('autotube_ab_tests');
    const all: ABTest[] = stored ? JSON.parse(stored) : [];
    return all.filter(t => t.videoId === videoId);
  } catch {
    return [];
  }
}

export function getAllTests(): ABTest[] {
  try {
    const stored = safeGetItem('autotube_ab_tests');
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function getRunningTests(): ABTest[] {
  return getAllTests().filter(t => t.status === 'running');
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export function cancelTest(testId: string): boolean {
  const test = getTest(testId);
  if (!test || test.status !== 'running') return false;
  test.status = 'cancelled';
  test.endedAt = new Date().toISOString();
  persistTest(test);
  logger.info('ABTest', `Cancelled test ${testId}`);
  return true;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function persistTest(test: ABTest): void {
  try {
    const stored = safeGetItem('autotube_ab_tests');
    const all: ABTest[] = stored ? JSON.parse(stored) : [];
    const idx = all.findIndex(t => t.id === test.id);
    if (idx >= 0) all[idx] = test;
    else all.push(test);
    safeSetItem('autotube_ab_tests', JSON.stringify(all.slice(-200)));
  } catch (err) {
    logger.error('ABTest', 'Failed to persist test', err);
  }
}
