import { describe, it, expect } from 'vitest';
import {
  scriptTopicFidelityIssues,
  isHistoricalVictorianBeekeepingTopic,
} from '../scriptGenerator';
import { isLikelyHistoricalTopic } from '../topicContext';

const VICTORIAN_TOPIC =
  'Why Victorian beekeepers feared the silent hive';

describe('isHistoricalVictorianBeekeepingTopic', () => {
  it('matches historical Victorian beekeeping topics', () => {
    expect(isHistoricalVictorianBeekeepingTopic(VICTORIAN_TOPIC)).toBe(true);
    expect(
      isHistoricalVictorianBeekeepingTopic('Victorian era beekeeping and colony collapse'),
    ).toBe(true);
  });

  it('does not match explicit Australia Victoria topics', () => {
    expect(
      isHistoricalVictorianBeekeepingTopic('Victoria Australia beekeepers fight Varroa'),
    ).toBe(false);
  });

  it('does not match non-beekeeping Victorian topics', () => {
    expect(isHistoricalVictorianBeekeepingTopic('Victorian fashion in London')).toBe(false);
  });
});

describe('isLikelyHistoricalTopic', () => {
  it('flags Victorian / era / century topics', () => {
    expect(isLikelyHistoricalTopic(VICTORIAN_TOPIC)).toBe(true);
    expect(isLikelyHistoricalTopic('Medieval castle sieges')).toBe(true);
  });

  it('does not flag modern newsy topics', () => {
    expect(isLikelyHistoricalTopic('OpenAI GPT-5 launch')).toBe(false);
  });
});

describe('scriptTopicFidelityIssues', () => {
  it('flags Victoria Australia / Simon Mildren / modern Varroa-only drift', () => {
    const drifted = `
      In Victoria Australia, Simon Mildren warns that Varroa mites are wiping out hives.
      Melbourne commercial operations face collapse. No 19th-century Britain here.
    `;
    const issues = scriptTopicFidelityIssues(VICTORIAN_TOPIC, drifted);
    expect(issues.length).toBeGreaterThanOrEqual(2);
    expect(issues.some((i) => i.code === 'modern_relocation')).toBe(true);
    expect(issues.some((i) => i.code === 'anachronistic_entity')).toBe(true);
  });

  it('flags Varroa-only modern framing without historical anchors', () => {
    const modernOnly =
      'Varroa destructor is killing colonies across commercial apiaries this season. Beekeepers panic.';
    const issues = scriptTopicFidelityIssues(VICTORIAN_TOPIC, modernOnly);
    expect(issues.some((i) => i.code === 'era_geography_drift')).toBe(true);
  });

  it('flags modern presenter framing ("Meet …") on Victorian beekeeping topics', () => {
    const drifted = 'Meet James Lacey, a beekeeper who fears the silent hive in his apiary.';
    const issues = scriptTopicFidelityIssues(VICTORIAN_TOPIC, drifted);
    expect(issues.some((i) => i.code === 'fabricated_presenter')).toBe(true);
  });

  it('passes a faithful Victorian Britain script', () => {
    const faithful = `
      In 1850s England, Victorian beekeepers dreaded the silent hive.
      Queen Victoria's Britain saw apiaries empty overnight; London journals recorded the fear.
      19th-century Britain had no modern Varroa crisis — the dread was older and stranger.
    `;
    expect(scriptTopicFidelityIssues(VICTORIAN_TOPIC, faithful)).toEqual([]);
  });

  it('accepts segment arrays and ignores unrelated topics', () => {
    const segments = [
      {
        title: 'Varroa in Victoria',
        narration: 'Simon Mildren speaks in Melbourne about Varroa.',
        visualNote: 'Australia map',
      },
    ];
    expect(scriptTopicFidelityIssues('OpenAI and Nvidia race', segments)).toEqual([]);
    expect(scriptTopicFidelityIssues(VICTORIAN_TOPIC, segments).length).toBeGreaterThan(0);
  });
});
