// ============================================================================
// Fact Verification — checks generated narration against live web data
// ============================================================================

import type { TopicContext, ScriptSegment } from '../types';

export interface FactCheckResult {
  segmentId: string;
  issues: FactIssue[];
  passed: boolean;
}

export interface FactIssue {
  type: 'date_contradiction' | 'number_mismatch' | 'missing_attribution' | 'stale_claim';
  severity: 'error' | 'warning';
  claim: string;
  evidence: string;
  suggestion: string;
}

/**
 * Check a generated script against live web data for factual issues.
 */
export function verifyScriptFacts(
  segments: ScriptSegment[],
  topicContext: TopicContext,
): FactCheckResult[] {
  if (!topicContext.recentNews || topicContext.recentNews.length === 0) {
    return segments.map(s => ({
      segmentId: s.id,
      issues: [],
      passed: true,
    }));
  }

  const today = new Date();
  const results: FactCheckResult[] = [];

  for (const seg of segments) {
    const issues: FactIssue[] = [];
    const narration = seg.narration || '';

    // 1. Check for future dates mentioned as "upcoming" or "next" when they've passed
    const futurePatterns = [
      /next\s+(spring|summer|fall|winter|year|month|week)/gi,
      /(launching|arriving|coming|releasing|debuting)\s+(next|in\s+\d+\s+months)/gi,
      /scheduled\s+(?:for|in)\s+(?:the\s+)?(?:first|second|third|fourth)?\s*(quarter|half)\s+of\s+\d{4}/gi,
      /will\s+(?:be\s+)?(?:launched|delivered|released|unveiled)\s+(?:in|by|during)\s+\d{4}/gi,
    ];

    for (const pattern of futurePatterns) {
      const match = narration.match(pattern);
      if (match) {
        // Check if news indicates this event already happened
        const pastIndicators = topicContext.recentNews.filter(n =>
          /(?:launched|delivered|unveiled|announced|released|opened|began)/i.test(n.snippet) &&
          !/will|planned|scheduled|expected|future|upcoming/i.test(n.snippet)
        );
        if (pastIndicators.length > 0) {
          issues.push({
            type: 'stale_claim',
            severity: 'error',
            claim: match[0],
            evidence: pastIndicators[0].snippet.substring(0, 200),
            suggestion: `This appears to have already occurred. Check: ${pastIndicators[0].url}`,
          });
        }
      }
    }

    // 2. Check for "this year" references — insert current year for clarity
    const thisYearMatch = narration.match(/\bthis\s+year\b/gi);
    if (thisYearMatch && !narration.includes(String(today.getFullYear()))) {
      issues.push({
        type: 'missing_attribution',
        severity: 'warning',
        claim: 'this year',
        evidence: `Current year is ${today.getFullYear()}`,
        suggestion: `Replace "this year" with "${today.getFullYear()}" for clarity`,
      });
    }

    results.push({
      segmentId: seg.id,
      issues,
      passed: issues.every(i => i.severity !== 'error'),
    });
  }

  return results;
}
