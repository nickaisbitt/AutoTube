import { describe, expect, it } from 'vitest';
import { scoreCandidateAgainstBeat } from '../beatRelevance';

const beat = {
  intent: 'evidence: show school counseling records breach',
  searchableSubject: 'Parent reading phone at kitchen table at night',
  narrationExcerpt: 'Parents in Oakridge got a midnight email about counseling notes.',
  mustShow: ['Parent reading phone'],
  mustAvoid: ['puppet', 'insect macro'],
};

describe('beatRelevance', () => {
  it('scores matching metadata highly and rejects off-brand', () => {
    const good = scoreCandidateAgainstBeat(
      { alt: 'Parent reading phone at kitchen table at night worried', query: 'parent phone kitchen' },
      beat,
    );
    expect(good.reject).toBe(false);
    expect(good.score).toBeGreaterThan(0.4);

    const bad = scoreCandidateAgainstBeat(
      { alt: 'macro insect beetle close up', query: 'beetle' },
      beat,
    );
    expect(bad.reject).toBe(true);

    const generic = scoreCandidateAgainstBeat(
      { alt: 'generic corporate stock photo office', query: 'stock photo' },
      beat,
    );
    expect(generic.reject).toBe(true);
  });
});
