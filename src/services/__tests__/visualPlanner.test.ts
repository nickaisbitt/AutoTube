import { describe, it, expect, vi } from 'vitest';
import { extractCapitalizedEntities, planSegmentVisuals } from '../visualPlanner';
import type { ScriptSegment, TopicContext } from '../../types';

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

// Prevent any real network calls from leaking out
vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch should not be called in unit tests')));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSegment(narration: string): ScriptSegment {
  return {
    id: 'seg-1',
    type: 'section',
    title: 'Test Segment',
    narration,
    visualNote: '',
    duration: 10,
  };
}

function makeTopicContext(topic = 'Test Topic'): TopicContext {
  return {
    topic,
    coreSubject: topic,
    subjectCandidates: [topic],
    kind: 'organization',
    description: '',
    entities: [],
    parseReasoning: 'test',
  };
}

// ---------------------------------------------------------------------------
// extractCapitalizedEntities
// ---------------------------------------------------------------------------

describe('extractCapitalizedEntities', () => {
  it('5.2 returns single proper noun from simple sentence', () => {
    const result = extractCapitalizedEntities('Nvidia dominates the market');
    expect(result).toEqual(['Nvidia']);
  });

  it('5.3 returns multi-word proper noun (Jensen Huang)', () => {
    const result = extractCapitalizedEntities('Jensen Huang announced');
    expect(result).toEqual(['Jensen Huang']);
  });

  it('5.4 excludes common stop words (The is filtered)', () => {
    const result = extractCapitalizedEntities('The company grew');
    expect(result).toEqual([]);
  });

  it('5.5 returns empty array for empty string input', () => {
    const result = extractCapitalizedEntities('');
    expect(result).toEqual([]);
  });

  it('5.6 returns multiple entities from mixed sentence', () => {
    // Note: the regex groups "Apple and Microsoft" as a single phrase because
    // "and" is a recognised connector in the multi-word proper-noun pattern.
    // Use a sentence where the two proper nouns are separated by a non-connector
    // word so they are captured independently.
    const result = extractCapitalizedEntities('Apple competes with Microsoft');
    expect(result).toContain('Apple');
    expect(result).toContain('Microsoft');
    expect(result.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// planSegmentVisuals (fallback path — no API key)
// ---------------------------------------------------------------------------

describe('planSegmentVisuals', () => {
  it('5.7 returns beat: "data" for narration containing revenue keyword', async () => {
    const segment = makeSegment('The company reported strong revenue growth this quarter.');
    const ctx = makeTopicContext('Nvidia');
    const plan = await planSegmentVisuals(segment, ctx, undefined);
    expect(plan.beat).toBe('data');
  });

  it('5.8 returns beat: "hook" for narration containing welcome keyword', async () => {
    const segment = makeSegment('Welcome to our deep dive into the world of AI chips.');
    const ctx = makeTopicContext('Nvidia');
    const plan = await planSegmentVisuals(segment, ctx, undefined);
    expect(plan.beat).toBe('hook');
  });

  it('5.9 returns beat: "quote" for narration with quoted speech pattern', async () => {
    const segment = makeSegment('"We are at an inflection point" said the CEO during the keynote.');
    const ctx = makeTopicContext('Nvidia');
    const plan = await planSegmentVisuals(segment, ctx, undefined);
    expect(plan.beat).toBe('quote');
  });

  it('5.10 returns a plan with at least one shot when called without an API key', async () => {
    const segment = makeSegment('Nvidia has become the most valuable chip company in the world.');
    const ctx = makeTopicContext('Nvidia');
    const plan = await planSegmentVisuals(segment, ctx, undefined);
    expect(plan.shots).toBeDefined();
    expect(plan.shots!.length).toBeGreaterThanOrEqual(1);
  });
});
