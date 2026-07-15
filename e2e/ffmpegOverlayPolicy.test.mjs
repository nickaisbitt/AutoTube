import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildImpactBeatsForTopic } from '../scripts/lib/impactBeatsByTopic.mjs';
import { promoteIntroFaceVideo } from '../scripts/lib/patch-project-for-loop.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('ffmpeg overlay policy — less text spam', () => {
  it('skips impact beats when karaoke captions are on', () => {
    const src = readFileSync(join(root, 'deploy/server-render/ffmpegOverlays.mjs'), 'utf8');
    expect(src).toContain('!karaokeOn');
    expect(src).toContain("reason: 'karaoke-on'");
    expect(src).not.toMatch(/Rotate to an early impact beat/);
  });

  it('generic impact beats use readable phrases (not keyword mashups)', () => {
    const beats = buildImpactBeatsForTopic('obscure widget factory scandal cover up');
    expect(beats[0]).toMatch(/EXPOSED/);
    expect(beats.join(' ')).not.toMatch(/WHY WIDGET|FOLLOW THE WIDGET|WIDGET HIDING/);
  });
});

describe('promoteIntroFaceVideo', () => {
  it('moves the highest-scoring face video onto the intro segment', () => {
    const project = {
      script: [
        { id: 'intro', type: 'intro', duration: 8 },
        { id: 'body', type: 'body', duration: 20 },
      ],
      media: [
        { id: 'a', segmentId: 'body', type: 'video', url: 'https://x/a.mp4', alt: 'office skyline' },
        { id: 'b', segmentId: 'body', type: 'video', url: 'https://x/b.mp4', alt: 'worried person close up face' },
      ],
    };
    promoteIntroFaceVideo(project);
    expect(project.media.find((m) => m.id === 'b')?.segmentId).toBe('intro');
  });
});
