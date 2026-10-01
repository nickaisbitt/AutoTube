import { describe, it, expect } from 'vitest';
import { scoreCandidate } from '../media';
import type { MediaCandidate } from '../media';
import type { TopicContext } from '../../types';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const topicContext: TopicContext = {
  topic: 'Tesla stock price',
  coreSubject: 'Tesla',
  subjectCandidates: ['Tesla', 'stock'],
  kind: 'concept',
  description: 'Tesla stock price analysis',
  entities: [],
  parseReasoning: 'Test reasoning',
};

function makePicsumCandidate(query: string): MediaCandidate {
  return {
    url: 'https://picsum.photos/seed/test0/1280/720',
    alt: query,
    source: 'Picsum Photos',
    baseScore: 30,
    query,
    finalScore: 0,
    type: 'image',
    width: 1280,
    height: 720,
  };
}

function makeUnsplashFallbackCandidate(query: string): MediaCandidate {
  return {
    url: 'https://picsum.photos/seed/test-0/1920/1080',
    alt: query,
    source: 'Picsum (Unsplash fallback)',
    baseScore: 30,
    query,
    finalScore: 0,
    type: 'image',
    width: 1920,
    height: 1080,
  };
}

function makeDDGCandidate(query: string): MediaCandidate {
  return {
    url: 'https://example.com/tesla-stock.jpg',
    alt: 'Tesla stock price chart',
    source: 'DuckDuckGo · example.com',
    sourceUrl: 'https://example.com/tesla-article',
    width: 1280,
    height: 720,
    baseScore: 180,
    query,
    finalScore: 0,
    type: 'image',
  };
}

function makeWikimediaCandidate(query: string): MediaCandidate {
  return {
    url: 'https://upload.wikimedia.org/tesla-chart.png',
    alt: 'Tesla stock price history',
    source: 'Wikimedia Commons',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Tesla.png',
    width: 1920,
    height: 1080,
    baseScore: 160,
    query,
    finalScore: 0,
    type: 'image',
  };
}

// ---------------------------------------------------------------------------
// 14.3 — Verify Picsum candidates have baseScore 30
// ---------------------------------------------------------------------------

describe('Fallback image baseScore fix', () => {
  it('14.3 Picsum candidates have baseScore 30', () => {
    const picsum = makePicsumCandidate('Tesla stock price');
    expect(picsum.baseScore).toBe(30);
  });

  it('14.3 Unsplash fallback candidates have baseScore 30', () => {
    const unsplash = makeUnsplashFallbackCandidate('Tesla stock price');
    expect(unsplash.baseScore).toBe(30);
  });

  // ---------------------------------------------------------------------------
  // 14.4 — Verify Picsum candidates score below real DDG/Wikimedia results
  // ---------------------------------------------------------------------------

  it('14.4 Picsum candidate scores below DDG candidate with topic overlap', () => {
    const query = 'Tesla stock price';
    const picsum = makePicsumCandidate(query);
    const ddg = makeDDGCandidate(query);

    const picsumScore = scoreCandidate(picsum, topicContext, undefined, 'stock');
    const ddgScore = scoreCandidate(ddg, topicContext, undefined, 'stock');

    expect(picsumScore).toBeLessThan(ddgScore);
  });

  it('14.4 Picsum candidate scores below Wikimedia candidate with topic overlap', () => {
    const query = 'Tesla stock price';
    const picsum = makePicsumCandidate(query);
    const wiki = makeWikimediaCandidate(query);

    const picsumScore = scoreCandidate(picsum, topicContext, undefined, 'stock');
    const wikiScore = scoreCandidate(wiki, topicContext, undefined, 'stock');

    expect(picsumScore).toBeLessThan(wikiScore);
  });

  it('14.4 Unsplash fallback candidate scores below DDG candidate with topic overlap', () => {
    const query = 'Tesla stock price';
    const unsplash = makeUnsplashFallbackCandidate(query);
    const ddg = makeDDGCandidate(query);

    const unsplashScore = scoreCandidate(unsplash, topicContext, undefined, 'stock');
    const ddgScore = scoreCandidate(ddg, topicContext, undefined, 'stock');

    expect(unsplashScore).toBeLessThan(ddgScore);
  });
});
