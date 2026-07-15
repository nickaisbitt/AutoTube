import { describe, expect, it } from 'vitest';
import { gateProjectMediaAgainstBeats } from '../beatEvidenceGate';
import { buildVisualBeatSheetFromScript } from '../visualBeatSheet';
import type { VideoProject } from '../../types';

describe('beatEvidenceGate', () => {
  it('drops off-beat assets when the segment has enough good ones', () => {
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
    const sheet = buildVisualBeatSheetFromScript('school ransomware', script as never);
    const project = {
      id: 'p1',
      topic: 'school ransomware',
      script,
      media: [
        {
          id: 'g1',
          segmentId: 's1',
          type: 'image',
          url: 'https://example.com/good.jpg',
          alt: 'Parent reading phone at kitchen table night',
          source: 'DDG',
          query: 'parent phone kitchen',
          score: 80,
        },
        {
          id: 'g2',
          segmentId: 's1',
          type: 'image',
          url: 'https://example.com/good2.jpg',
          alt: 'Parent reading counseling notice phone',
          source: 'DDG',
          query: 'parent counseling',
          score: 75,
        },
        {
          id: 'b1',
          segmentId: 's1',
          type: 'image',
          url: 'https://example.com/beetle.jpg',
          alt: 'macro insect beetle close up stock photo',
          source: 'Picsum',
          query: 'beetle',
          score: 90,
        },
      ],
      visualBeatSheet: sheet,
    } as unknown as VideoProject;

    const gated = gateProjectMediaAgainstBeats(project);
    expect(gated.dropped).toBeGreaterThanOrEqual(1);
    expect(gated.project.media.every((m) => !/beetle/i.test(m.alt || ''))).toBe(true);
    expect(gated.project.media.length).toBeGreaterThanOrEqual(2);
  });
});
