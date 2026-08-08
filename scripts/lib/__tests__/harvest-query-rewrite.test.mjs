import { describe, expect, it } from 'vitest';
import {
  buildPreferredSubjectQueries,
  extractPreferredSubjectNouns,
  isWeakGenericHarvestQuery,
  rewriteHarvestQuery,
  rewriteHarvestQueryPlan,
} from '../harvest-query-rewrite.mjs';
import { motionQueryPlan } from '../generate-full-video.mjs';

const BEEKEEPERS_TOPIC = 'Why Victorian beekeepers feared the silent hive';
const VARROA_SEGMENT = 'The Varroa Line in the Sand';

describe('harvest-query-rewrite — beekeepers topic', () => {
  it('extracts bee/hive/beekeeper subjects (and varroa from segment title)', () => {
    const fromTopic = extractPreferredSubjectNouns(BEEKEEPERS_TOPIC);
    expect(fromTopic).toEqual(expect.arrayContaining(['beekeeper', 'hive']));
    expect(fromTopic).not.toContain('victorian');

    const withSeg = extractPreferredSubjectNouns(BEEKEEPERS_TOPIC, VARROA_SEGMENT);
    expect(withSeg).toEqual(expect.arrayContaining(['beekeeper', 'hive', 'varroa']));
  });

  it('rejects lone victorian and news-interview pads as primary queries', () => {
    expect(isWeakGenericHarvestQuery('victorian', BEEKEEPERS_TOPIC)).toBe(true);
    expect(isWeakGenericHarvestQuery('news interview worried person', BEEKEEPERS_TOPIC)).toBe(true);
    expect(isWeakGenericHarvestQuery('news interview worried person outdoor', BEEKEEPERS_TOPIC)).toBe(true);
    expect(isWeakGenericHarvestQuery('city street pedestrians', BEEKEEPERS_TOPIC)).toBe(true);
    expect(isWeakGenericHarvestQuery('sunny city street pedestrians', BEEKEEPERS_TOPIC)).toBe(true);
    expect(isWeakGenericHarvestQuery('city street pedestrians daylight', BEEKEEPERS_TOPIC)).toBe(true);
  });

  it('accepts hive/bee/beekeeper queries', () => {
    expect(isWeakGenericHarvestQuery('bee hive', BEEKEEPERS_TOPIC)).toBe(false);
    expect(isWeakGenericHarvestQuery('hive', BEEKEEPERS_TOPIC)).toBe(false);
    expect(isWeakGenericHarvestQuery('beekeeper', BEEKEEPERS_TOPIC)).toBe(false);
    expect(isWeakGenericHarvestQuery('victorian beekeepers', BEEKEEPERS_TOPIC)).toBe(false);
    expect(isWeakGenericHarvestQuery('silent hive', BEEKEEPERS_TOPIC)).toBe(false);
    expect(isWeakGenericHarvestQuery('varroa mite', BEEKEEPERS_TOPIC, VARROA_SEGMENT)).toBe(false);
  });

  it('rewrites weak pads to subject nouns and drops lone victorian', () => {
    expect(rewriteHarvestQuery('victorian', { topicBlob: BEEKEEPERS_TOPIC })).toMatch(/bee|hive|beekeeper/i);
    expect(rewriteHarvestQuery('news interview worried person', { topicBlob: BEEKEEPERS_TOPIC }))
      .toMatch(/bee|hive|beekeeper/i);
    expect(rewriteHarvestQuery('city street pedestrians', { topicBlob: BEEKEEPERS_TOPIC }))
      .toMatch(/bee|hive|beekeeper/i);
    expect(rewriteHarvestQuery('silent hive', { topicBlob: BEEKEEPERS_TOPIC })).toBe('silent hive');
  });

  it('plan leads with subject nouns and excludes weak generics as primaries', () => {
    const input = [
      'victorian',
      'news interview worried person',
      'city street pedestrians',
      'victorian beekeepers',
      'silent hive',
    ];
    const plan = rewriteHarvestQueryPlan(input, {
      topicBlob: BEEKEEPERS_TOPIC,
      segmentTitle: VARROA_SEGMENT,
    });

    expect(plan[0]).toMatch(/bee|hive|beekeeper|honeycomb|apiary|varroa/i);
    expect(plan.some((q) => /\bhive\b/i.test(q) || /\bbee\b/i.test(q))).toBe(true);

    const primary = plan.slice(0, 5).map((q) => q.toLowerCase());
    expect(primary).not.toContain('victorian');
    expect(primary.some((q) => q === 'news interview worried person')).toBe(false);
    expect(primary.some((q) => /city street|pedestrians|news interview/i.test(q))).toBe(false);

    expect(plan).toEqual(expect.arrayContaining([
      expect.stringMatching(/\bhive\b/i),
    ]));
    expect(buildPreferredSubjectQueries(
      extractPreferredSubjectNouns(BEEKEEPERS_TOPIC, VARROA_SEGMENT),
      BEEKEEPERS_TOPIC,
      VARROA_SEGMENT,
    ).some((q) => /varroa/i.test(q))).toBe(true);
  });
});

describe('motionQueryPlan — beekeepers rewrite hook', () => {
  it('does not lead with victorian or news-interview pads', () => {
    const plan = motionQueryPlan(BEEKEEPERS_TOPIC, false, {
      stockKeyed: false,
      preferBright: true,
      segmentTitle: VARROA_SEGMENT,
    });
    const primary = plan.queries.slice(0, 6).map((q) => q.toLowerCase());

    expect(primary).not.toContain('victorian');
    expect(primary.some((q) => q.includes('news interview'))).toBe(false);
    expect(primary.some((q) => q.includes('city street') || q.includes('pedestrian'))).toBe(false);

    expect(plan.queries.some((q) => /\b(hive|bee|beekeeper|honeycomb|varroa)\b/i.test(q))).toBe(true);
    expect(plan.queries.filter((q) => q.toLowerCase() === 'victorian')).toHaveLength(0);
    expect(plan.queries.filter((q) => /news interview worried person/i.test(q))).toHaveLength(0);
  });
});
