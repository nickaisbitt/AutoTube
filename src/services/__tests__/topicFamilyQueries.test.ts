import { afterEach, describe, expect, it } from 'vitest';
import {
  stockProviderQueriesForTopic,
  topicFamilyQueries,
} from '../topicFamilyQueries';

describe('topicFamilyQueries flags', () => {
  afterEach(() => {
    delete process.env.AUTOTUBE_EVAL_COLD;
    delete process.env.AUTOTUBE_TOPIC_FAMILY_TEMPLATES;
  });

  it('applies the family-template flag and cold-eval override to stock queries', () => {
    const topic = 'regional airline cabin pressure failures';

    delete process.env.AUTOTUBE_TOPIC_FAMILY_TEMPLATES;
    expect(stockProviderQueriesForTopic(topic)).toEqual([]);

    process.env.AUTOTUBE_TOPIC_FAMILY_TEMPLATES = '1';
    expect(stockProviderQueriesForTopic(topic).length).toBeGreaterThan(0);

    process.env.AUTOTUBE_EVAL_COLD = '1';
    expect(topicFamilyQueries(topic)).toEqual([]);
    expect(stockProviderQueriesForTopic(topic)).toEqual([]);
  });
});
