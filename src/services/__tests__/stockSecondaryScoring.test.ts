import { describe, it, expect } from 'vitest';
import { scoreCandidate } from '../media';
import type { MediaCandidate } from '../media';
import type { TopicContext } from '../../types';

const topicContext: TopicContext = {
  topic: 'landlords AI eviction tenants',
  coreSubject: 'eviction',
  subjectCandidates: ['landlords', 'tenants'],
  kind: 'concept',
  description: 'AI eviction tools',
  entities: [],
  parseReasoning: 'test',
};

describe('stock vs web harvest scoring', () => {
  it('Deep Harvest outranks Pexels when both match topic loosely', () => {
    const query = 'landlords AI eviction tenants';
    const deep: MediaCandidate = {
      url: 'https://example.com/eviction.jpg',
      alt: 'landlords filing eviction notices with software dashboard',
      source: 'Deep Harvest (theguardian.com)',
      sourceUrl: 'https://theguardian.com/eviction-article',
      baseScore: 180,
      query,
      finalScore: 0,
      type: 'image',
      width: 1920,
      height: 1080,
    };
    const pexels: MediaCandidate = {
      url: 'https://images.pexels.com/generic-office.jpg',
      alt: 'modern office building exterior',
      source: 'Pexels · Stock Photographer',
      baseScore: 95,
      query,
      finalScore: 0,
      type: 'image',
      width: 1920,
      height: 1080,
    };

    const deepScore = scoreCandidate(deep, topicContext, undefined, 'raw', undefined, 'Eviction crisis');
    const pexelsScore = scoreCandidate(pexels, topicContext, undefined, 'raw', undefined, 'Eviction crisis');

    expect(deepScore).toBeGreaterThan(pexelsScore);
  });
});
