import { describe, expect, it } from 'vitest';
import { gateProjectMediaAgainstBeats } from '../beatEvidenceGate';
import { buildVisualBeatSheetFromScript } from '../visualBeatSheet';
import type { MediaAsset, VideoProject } from '../../types';

const script = [
  {
    id: 's1',
    type: 'intro' as const,
    title: 'Hook',
    narration: 'Parents got a midnight email about counseling notes for sale.',
    visualNote: 'Parent reading phone at kitchen table',
    duration: 10,
  },
];

function asset(id: string, alt: string, query = 'unrelated', segmentId = 's1'): MediaAsset {
  return {
    id,
    segmentId,
    type: 'image',
    url: `https://example.com/${id}.jpg`,
    alt,
    source: 'DDG',
    query,
    score: 80,
  };
}

function projectWithMedia(media: MediaAsset[]): VideoProject {
  return {
    id: 'p1',
    topic: 'school ransomware',
    script,
    media,
    visualBeatSheet: buildVisualBeatSheetFromScript('school ransomware', script as never),
  } as unknown as VideoProject;
}

describe('beatEvidenceGate', () => {
  it('drops off-beat assets when the segment has enough good ones', () => {
    const project = projectWithMedia([
      asset('g1', 'Parent reading phone at kitchen table night', 'parent phone kitchen'),
      asset('g2', 'Parent reading counseling notice phone', 'parent counseling'),
      asset('b1', 'macro insect beetle close up stock photo', 'beetle'),
    ]);

    const gated = gateProjectMediaAgainstBeats(project);
    expect(gated.dropped).toBeGreaterThanOrEqual(1);
    expect(gated.project.media.every((m) => !/beetle/i.test(m.alt || ''))).toBe(true);
    expect(gated.project.media.length).toBeGreaterThanOrEqual(2);
  });

  it('drops and reports media assigned to a nonexistent script segment', () => {
    const project = projectWithMedia([
      asset('g1', 'Parent reading phone at kitchen table night'),
      asset('g2', 'Parent reading phone counseling notice'),
      asset('orphan', 'Parent reading phone at kitchen table', 'parent phone', 'missing-segment'),
    ]);

    const gated = gateProjectMediaAgainstBeats(project);

    expect(gated.project.media.map((item) => item.id)).not.toContain('orphan');
    expect(gated.dropped).toBe(1);
    expect(gated.warnings).toContain('orphan-segment:missing-segment:dropped-1-media');
  });

  it('signals reharvest instead of retaining rejected filler by default', () => {
    const project = projectWithMedia([
      asset('g1', 'Parent reading phone at kitchen table night'),
      asset(
        'query-only',
        'Uncaptioned unrelated result',
        'Parent reading phone at kitchen table',
      ),
    ]);

    const gated = gateProjectMediaAgainstBeats(project);

    expect(gated.project.media.map((item) => item.id)).toEqual(['g1']);
    expect(gated.dropped).toBe(1);
    expect(gated.demoted).toBe(0);
    expect(gated.needsReharvest).toBe(true);
    expect(gated.warnings.some((warning) => warning.includes('reharvest-needed'))).toBe(true);
  });

  it('counts and clearly marks only weak assets actually kept as fill', () => {
    const project = projectWithMedia([
      asset('g1', 'Parent reading phone at kitchen table night'),
      asset('b1', 'Unrelated ocean wave', 'Parent reading phone at kitchen table'),
      asset('b2', 'Unrelated mountain landscape', 'Parent reading phone at kitchen table'),
      asset('b3', 'Unrelated sports crowd', 'Parent reading phone at kitchen table'),
    ]);

    const gated = gateProjectMediaAgainstBeats(project, { keepWeakFill: true });
    const fill = gated.project.media.find((item) => item.id === 'b1');

    expect(gated.demoted).toBe(1);
    expect(gated.dropped).toBe(2);
    expect(fill?.isFallback).toBe(true);
    expect(fill?.trace).toContain('beat-evidence-gate:weak-fill');
    expect(gated.warnings).toContain('s1:kept-weak-fill=1:rejected-evidence');
    expect(gated.needsReharvest).toBe(true);
  });
});
