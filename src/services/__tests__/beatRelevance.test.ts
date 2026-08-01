import { afterEach, describe, expect, it, vi } from 'vitest';
import { rankCandidatesWithBeatVision, scoreCandidateAgainstBeat } from '../beatRelevance';
import { bestBeatRelevanceForCandidate } from '../media';
import type { VisualBeat } from '../visualBeatSheet';

const beat = {
  intent: 'evidence: show school counseling records breach',
  searchableSubject: 'Parent reading phone at kitchen table at night',
  narrationExcerpt: 'Parents in Oakridge got a midnight email about counseling notes.',
  mustShow: ['Parent reading phone'],
  mustAvoid: ['puppet', 'insect macro'],
};

describe('beatRelevance', () => {
  afterEach(() => {
    delete process.env.AUTOTUBE_BEAT_VISION;
    sessionStorage.removeItem('autotube_beat_vision');
    sessionStorage.removeItem('autotube_eval_cold');
    vi.unstubAllGlobals();
  });

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

  it('uses the search query only as a prior, never as acceptance evidence', () => {
    const queryOnly = scoreCandidateAgainstBeat(
      {
        alt: 'Uncaptioned result',
        url: 'https://cdn.example.com/asset-123.jpg',
        source: 'DDG',
        query: 'Parent reading phone at kitchen table at night',
      },
      beat,
    );

    expect(queryOnly.score).toBeGreaterThan(0);
    expect(queryOnly.reasons).toContain('query-prior:6');
    expect(queryOnly.reject).toBe(true);

    const staleAvoidQuery = scoreCandidateAgainstBeat(
      {
        alt: 'Parent reading phone at kitchen table at night worried',
        url: 'https://cdn.example.com/parent.jpg',
        source: 'DDG',
        query: 'puppet stock footage',
      },
      beat,
    );
    expect(staleAvoidQuery.reject).toBe(false);
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

  it('visions each candidate against its strongest heuristic beat', async () => {
    const beats: VisualBeat[] = [
      {
        ...beat,
        id: 'parent',
        segmentId: 's1',
        sentenceIndex: 0,
        role: 'human_story',
        scale: 'personal',
        sourcePreference: 'news',
        evidence: 'parent narration',
      },
      {
        ...beat,
        id: 'server',
        segmentId: 's1',
        sentenceIndex: 1,
        role: 'mechanism',
        scale: 'institutional',
        searchableSubject: 'school district ransomware server room',
        narrationExcerpt: 'District servers encrypted overnight.',
        mustShow: ['server room'],
        sourcePreference: 'news',
        evidence: 'server narration',
      },
    ];
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: '{"relevant":true,"score":9,"reason":"server room"}' } }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    process.env.AUTOTUBE_BEAT_VISION = '1';

    await rankCandidatesWithBeatVision(
      [{ alt: 'school district ransomware server room locked doors', url: 'https://example.com/server.jpg' }],
      beats,
      'test-key',
      { budget: { remaining: 1 }, topN: 1 },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body.messages[1].content[0].text).toContain(
      'Subject: school district ransomware server room',
    );
    expect(body.messages[1].content[0].text).not.toContain(
      'Subject: Parent reading phone at kitchen table at night',
    );
  });
});
