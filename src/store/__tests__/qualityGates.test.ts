import { describe, it, expect } from 'vitest';
import {
  evaluateQualityGate,
  QUALITY_THRESHOLDS,
  type QualityGateResult,
} from '../pipeline/orchestrator';
import type { VideoProject, ScriptSegment, MediaAsset } from '../../types';

function makeSegment(overrides: Partial<ScriptSegment> = {}): ScriptSegment {
  return {
    id: crypto.randomUUID(),
    type: 'section',
    title: 'Test Segment',
    narration: 'Your personal files could be stolen by hackers targeting your bank account.',
    visualNote: 'hacker at laptop',
    duration: 15,
    ...overrides,
  };
}

function makeProject(overrides: Partial<VideoProject> = {}): VideoProject {
  return {
    version: 1,
    id: 'test-project',
    title: 'Test Video',
    topic: 'Cybersecurity',
    style: 'business_insider',
    targetDuration: 180,
    script: [
      makeSegment({ type: 'intro', narration: 'Your bank account could be drained in seconds by a single click.' }),
      makeSegment({ narration: 'Companies lose millions every year to ransomware attacks on their business infrastructure.' }),
      makeSegment({ narration: 'Government agencies across the globe are fighting state-sponsored cyber warfare.' }),
      makeSegment({ type: 'outro', narration: 'Here are three steps to protect yourself and prevent attacks.' }),
    ],
    media: [],
    narration: [],
    status: 'draft',
    createdAt: new Date(),
    ...overrides,
  };
}

describe('evaluateQualityGate', () => {
  describe('script phase', () => {
    it('passes when hook has personal stakes and arc is complete', () => {
      const project = makeProject();
      const result = evaluateQualityGate(project, 'script');
      expect(result.passed).toBe(true);
      expect(result.warnings.filter((w) => w.severity === 'critical')).toHaveLength(0);
    });

    it('fails with critical warning when hook uses generic phrasing', () => {
      const project = makeProject({
        script: [
          makeSegment({ type: 'intro', narration: 'Hey guys, welcome back to another video. In today\'s video we talk about hacking.' }),
          makeSegment({ narration: 'Companies face threats from hackers.' }),
        ],
      });
      const result = evaluateQualityGate(project, 'script');
      expect(result.passed).toBe(false);
      expect(result.warnings.some((w) => w.dimension === 'hook' && w.severity === 'critical')).toBe(true);
      expect(result.recommendations.some((r) => r.action === 'rewrite_hook')).toBe(true);
    });

    it('warns when story arc has insufficient phases', () => {
      const project = makeProject({
        script: [
          makeSegment({ type: 'intro', narration: 'Something happened recently that is interesting.' }),
          makeSegment({ narration: 'More details about the thing that happened.' }),
        ],
      });
      const result = evaluateQualityGate(project, 'script');
      expect(result.warnings.some((w) => w.dimension === 'story_arc')).toBe(true);
    });

    it('warns when problems exist without solutions', () => {
      const project = makeProject({
        script: [
          makeSegment({ type: 'intro', narration: 'Your files are at risk from dangerous malware threats.' }),
          makeSegment({ narration: 'The danger is growing every day with new threats emerging.' }),
        ],
      });
      const result = evaluateQualityGate(project, 'script');
      expect(result.warnings.some((w) => w.message.includes('without offering solutions'))).toBe(true);
    });

    it('returns empty warnings for empty script', () => {
      const project = makeProject({ script: [] });
      const result = evaluateQualityGate(project, 'script');
      expect(result.passed).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('media phase', () => {
    it('passes when media has good relevance scores', () => {
      const project = makeProject({
        media: [
          { id: '1', segmentId: 's1', type: 'image', url: 'http://a.com/1.jpg', alt: 'test', source: 'stock', qualityFactors: { sharpness: 8, lighting: 7, composition: 7, vibrancy: 6, relevance: 8 } } as MediaAsset,
          { id: '2', segmentId: 's2', type: 'image', url: 'http://a.com/2.jpg', alt: 'test', source: 'stock', qualityFactors: { sharpness: 7, lighting: 6, composition: 8, vibrancy: 7, relevance: 7 } } as MediaAsset,
        ],
      });
      const result = evaluateQualityGate(project, 'media');
      expect(result.passed).toBe(true);
    });

    it('fails when media relevance is below threshold', () => {
      const project = makeProject({
        media: [
          { id: '1', segmentId: 's1', type: 'image', url: 'http://a.com/1.jpg', alt: 'test', source: 'stock', qualityFactors: { sharpness: 3, lighting: 3, composition: 3, vibrancy: 3, relevance: 2 } } as MediaAsset,
          { id: '2', segmentId: 's2', type: 'image', url: 'http://a.com/2.jpg', alt: 'test', source: 'stock', qualityFactors: { sharpness: 4, lighting: 4, composition: 4, vibrancy: 4, relevance: 3 } } as MediaAsset,
        ],
      });
      const result = evaluateQualityGate(project, 'media');
      expect(result.passed).toBe(false);
      expect(result.recommendations.some((r) => r.action === 'regenerate_thumbnail')).toBe(true);
    });

    it('warns about repeated visual concepts', () => {
      const project = makeProject({
        media: [
          { id: '1', segmentId: 's1', type: 'image', url: 'http://a.com/1.jpg', alt: 'test', source: 'stock', concept: 'hacker typing' } as MediaAsset,
          { id: '2', segmentId: 's2', type: 'image', url: 'http://a.com/2.jpg', alt: 'test', source: 'stock', concept: 'hacker typing' } as MediaAsset,
          { id: '3', segmentId: 's3', type: 'image', url: 'http://a.com/3.jpg', alt: 'test', source: 'stock', concept: 'hacker typing' } as MediaAsset,
        ],
      });
      const result = evaluateQualityGate(project, 'media');
      expect(result.warnings.some((w) => w.dimension === 'visual_diversity')).toBe(true);
      expect(result.recommendations.some((r) => r.action === 'diversify_visuals')).toBe(true);
    });

    it('passes with empty media array', () => {
      const project = makeProject({ media: [] });
      const result = evaluateQualityGate(project, 'media');
      expect(result.passed).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('assembly phase', () => {
    it('fails when blind review thumbnail score is below threshold', () => {
      const project = makeProject({
        blindReview: {
          scores: { visualQuality: 7, pacing: 6, narrativeClarity: 7, thumbnailEffectiveness: 3, overallProductionValue: 6 },
          feedback: { visualQuality: '', pacing: '', narrativeClarity: '', thumbnailEffectiveness: '', overallProductionValue: '' },
          letterGrade: 'C',
          summary: 'Needs work',
          reviewedAt: new Date().toISOString(),
        },
      });
      const result = evaluateQualityGate(project, 'assembly');
      expect(result.passed).toBe(false);
      expect(result.recommendations.some((r) => r.action === 'regenerate_thumbnail')).toBe(true);
    });

    it('validates problem-to-solution arc structure', () => {
      const project = makeProject({
        script: [
          makeSegment({ narration: 'This is just a general overview of technology trends.' }),
          makeSegment({ narration: 'More general information about the topic at hand.' }),
        ],
      });
      const result = evaluateQualityGate(project, 'assembly');
      expect(result.warnings.some((w) => w.dimension === 'story_arc')).toBe(true);
    });

    it('passes when blind review scores are all above threshold', () => {
      const project = makeProject({
        blindReview: {
          scores: { visualQuality: 8, pacing: 7, narrativeClarity: 8, thumbnailEffectiveness: 7, overallProductionValue: 8 },
          feedback: { visualQuality: '', pacing: '', narrativeClarity: '', thumbnailEffectiveness: '', overallProductionValue: '' },
          letterGrade: 'B',
          summary: 'Good',
          reviewedAt: new Date().toISOString(),
        },
      });
      const result = evaluateQualityGate(project, 'assembly');
      expect(result.passed).toBe(true);
    });
  });

  describe('QUALITY_THRESHOLDS', () => {
    it('exports configurable thresholds', () => {
      expect(QUALITY_THRESHOLDS.thumbnailMinScore).toBe(5);
      expect(QUALITY_THRESHOLDS.hookMinScore).toBe(5);
      expect(QUALITY_THRESHOLDS.minArcPhases).toBe(2);
      expect(QUALITY_THRESHOLDS.clarityMinScore).toBe(4);
      expect(QUALITY_THRESHOLDS.credibilityMinScore).toBe(4);
      expect(QUALITY_THRESHOLDS.thumbnailMaxTextWords).toBe(5);
      expect(QUALITY_THRESHOLDS.thumbnailMinVariants).toBe(3);
    });
  });

  describe('QualityGateResult interface', () => {
    it('returns correct shape with passed, warnings, recommendations', () => {
      const project = makeProject();
      const result: QualityGateResult = evaluateQualityGate(project, 'script');
      expect(result).toHaveProperty('passed');
      expect(result).toHaveProperty('warnings');
      expect(result).toHaveProperty('recommendations');
      expect(typeof result.passed).toBe('boolean');
      expect(Array.isArray(result.warnings)).toBe(true);
      expect(Array.isArray(result.recommendations)).toBe(true);
    });
  });
});
