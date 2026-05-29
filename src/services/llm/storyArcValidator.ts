/**
 * Story arc validation — validates that scripts follow the proper narrative structure.
 *
 * Validates: Hook (0-15s) → Problem (15-60s) → Escalation (60-120s) → Solution (120-end) → CTA (last 15s)
 */

import type { ScriptSegment } from '../../types';

export interface StoryArcValidation {
  passed: boolean;
  phases: StoryArcPhase[];
  issues: string[];
  score: number; // 0-100
}

export interface StoryArcPhase {
  name: string;
  expectedTimeRange: [number, number]; // [startSec, endSec]
  actualSegments: number[];
  present: boolean;
  coverage: number; // 0-1 percentage of phase covered
}

/**
 * Validates that a script follows the story arc:
 * Hook (0-15s) → Problem (15-60s) → Escalation (60-120s) → Solution (120-end) → CTA (last 15s)
 */
export function validateStoryArc(segments: ScriptSegment[]): StoryArcValidation {
  const issues: string[] = [];
  const totalDuration = segments.reduce((sum, s) => sum + s.duration, 0);

  // Calculate cumulative times
  const segmentTimes: Array<{ start: number; end: number; index: number }> = [];
  let cumulative = 0;
  for (let i = 0; i < segments.length; i++) {
    segmentTimes.push({ start: cumulative, end: cumulative + segments[i].duration, index: i });
    cumulative += segments[i].duration;
  }

  // Define expected phases
  const hookEnd = Math.min(15, totalDuration * 0.1);
  const problemEnd = Math.min(60, totalDuration * 0.35);
  const escalationEnd = Math.min(120, totalDuration * 0.7);
  const solutionEnd = totalDuration;
  const ctaStart = Math.max(0, totalDuration - 15);

  const phases: StoryArcPhase[] = [
    { name: 'Hook', expectedTimeRange: [0, hookEnd], actualSegments: [], present: false, coverage: 0 },
    { name: 'Problem', expectedTimeRange: [hookEnd, problemEnd], actualSegments: [], present: false, coverage: 0 },
    { name: 'Escalation', expectedTimeRange: [problemEnd, escalationEnd], actualSegments: [], present: false, coverage: 0 },
    { name: 'Solution', expectedTimeRange: [escalationEnd, solutionEnd], actualSegments: [], present: false, coverage: 0 },
    { name: 'CTA', expectedTimeRange: [ctaStart, totalDuration], actualSegments: [], present: false, coverage: 0 },
  ];

  // Classify each segment into a phase based on timing
  for (const st of segmentTimes) {
    const seg = segments[st.index];
    const midTime = (st.start + st.end) / 2;

    // Intro segment is always Hook
    if (seg.type === 'intro') {
      phases[0].actualSegments.push(st.index);
      phases[0].present = true;
      continue;
    }

    // Outro segment is always CTA/Solution
    if (seg.type === 'outro') {
      phases[4].actualSegments.push(st.index);
      phases[4].present = true;
      phases[3].actualSegments.push(st.index); // Outro also counts as solution
      phases[3].present = true;
      continue;
    }

    // Classify by time position
    if (midTime <= hookEnd) {
      phases[0].actualSegments.push(st.index);
      phases[0].present = true;
    } else if (midTime <= problemEnd) {
      phases[1].actualSegments.push(st.index);
      phases[1].present = true;
    } else if (midTime <= escalationEnd) {
      phases[2].actualSegments.push(st.index);
      phases[2].present = true;
    } else if (midTime <= ctaStart) {
      phases[3].actualSegments.push(st.index);
      phases[3].present = true;
    } else {
      phases[4].actualSegments.push(st.index);
      phases[4].present = true;
      phases[3].actualSegments.push(st.index);
      phases[3].present = true;
    }
  }

  // Calculate coverage for each phase
  for (const phase of phases) {
    const [start, end] = phase.expectedTimeRange;
    const phaseDuration = end - start;
    if (phaseDuration <= 0) {
      phase.coverage = phase.present ? 1 : 0;
      continue;
    }

    let coveredTime = 0;
    for (const idx of phase.actualSegments) {
      const st = segmentTimes[idx];
      const overlapStart = Math.max(st.start, start);
      const overlapEnd = Math.min(st.end, end);
      if (overlapEnd > overlapStart) {
        coveredTime += overlapEnd - overlapStart;
      }
    }
    phase.coverage = Math.min(1, coveredTime / phaseDuration);
  }

  // Validate specific requirements
  // Hook must be present
  if (!phases[0].present) {
    issues.push('Hook phase (0-15s) is missing — intro segment must open within first 15 seconds');
  }

  // Problem must be present
  if (!phases[1].present) {
    issues.push('Problem phase (15-60s) is missing — must establish the problem early');
  }

  // Escalation must be present
  if (!phases[2].present) {
    issues.push('Escalation phase (60-120s) is missing — stakes must escalate');
  }

  // Solution must be present
  if (!phases[3].present) {
    issues.push('Solution phase (120s-end) is missing — must provide resolution');
  }

  // CTA must be present in last 15s
  if (!phases[4].present) {
    issues.push('CTA phase (last 15s) is missing — must have call-to-action at the end');
  }

  // Check that hook opens with personal stakes (first segment should have you/your)
  const introSeg = segments.find((s) => s.type === 'intro');
  if (introSeg) {
    const narration = introSeg.narration.toLowerCase();
    const hasPersonalStakes = /\b(you|your|you're|you've)\b/.test(narration);
    if (!hasPersonalStakes) {
      issues.push('Hook does not contain personal stakes (you/your language) — should address viewer directly');
    }
  }

  // Check escalation: each segment should feel heavier than the last
  const pacingScores = segments.map((s) => s.pacingScore ?? 3);
  let hasEscalation = false;
  for (let i = 1; i < pacingScores.length; i++) {
    if (pacingScores[i] > pacingScores[i - 1]) {
      hasEscalation = true;
      break;
    }
  }
  if (!hasEscalation && segments.length > 2) {
    issues.push('No pacing escalation detected — stakes should increase over time');
  }

  // Check CTA has action-oriented language
  const outroSeg = segments.find((s) => s.type === 'outro');
  if (outroSeg) {
    const narration = outroSeg.narration.toLowerCase();
    const hasCTA = /\b(subscribe|comment|like|check out|watch|follow|share)\b/.test(narration);
    if (!hasCTA) {
      issues.push('Outro lacks call-to-action language — should include subscribe/comment/watch prompt');
    }
  }

  // Calculate overall score
  const presentPhases = phases.filter((p) => p.present).length;
  const avgCoverage = phases.reduce((sum, p) => sum + p.coverage, 0) / phases.length;
  const score = Math.round(((presentPhases / 5) * 60) + (avgCoverage * 40));

  return {
    passed: issues.length === 0,
    phases,
    issues,
    score,
  };
}
