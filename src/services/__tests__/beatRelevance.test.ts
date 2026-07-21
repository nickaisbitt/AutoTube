import { describe, expect, it } from 'vitest';
import { scoreCandidateAgainstBeat } from '../beatRelevance';
import { bestBeatRelevanceForCandidate } from '../media';

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

  it('rejects camcorder and corporate filler without beat context', () => {
    const camcorder = scoreCandidateAgainstBeat(
      { alt: 'person holding camcorder filming', query: 'camcorder stock' },
      beat,
    );
    expect(camcorder.reject).toBe(true);

    const corporate = scoreCandidateAgainstBeat(
      { alt: 'corporate handshake team meeting smiling', query: 'generic corporate' },
      beat,
    );
    expect(corporate.reject).toBe(true);
  });

  it('bestBeatRelevanceForCandidate picks the strongest segment beat', () => {
    const beats = [
      { ...beat, id: 'a', segmentId: 's1', sentenceIndex: 0, role: 'evidence' as const, scale: 'personal' as const, sourcePreference: 'news' as const, evidence: 't' },
      {
        ...beat,
        id: 'b',
        segmentId: 's1',
        sentenceIndex: 1,
        role: 'mechanism' as const,
        scale: 'institutional' as const,
        searchableSubject: 'school district ransomware server room',
        narrationExcerpt: 'District servers encrypted overnight.',
        mustShow: ['server room'],
        sourcePreference: 'news' as const,
        evidence: 't2',
      },
    ];
    const ranked = bestBeatRelevanceForCandidate(
      { alt: 'school district ransomware server room locked doors', query: 'ransomware servers' },
      beats,
    );
    expect(ranked).not.toBeNull();
    expect(ranked!.reject).toBe(false);
    expect(ranked!.score).toBeGreaterThan(0.3);
  });
});
