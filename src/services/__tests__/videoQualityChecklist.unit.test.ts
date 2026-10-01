import { describe, it, expect } from 'vitest';
import {
  checkGenericHook,
  checkConcreteHookStakes,
  checkClicheMedia,
  checkMinDuration,
  checkMinScriptSegments,
  runVideoQualityChecklist,
  checklistCriticalFailures,
} from '../videoQualityChecklist';
import { validateVideoQualityChecklist } from '../qualityScorer';

describe('videoQualityChecklist', () => {
  it('flags generic hook phrases', () => {
    const result = checkGenericHook([
      { id: '1', type: 'intro', title: 'Intro', narration: 'Hey guys, welcome back!', duration: 10 },
    ]);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('generic phrase');
  });

  it('passes hook with concrete stakes', () => {
    const result = checkConcreteHookStakes([
      { id: '1', type: 'intro', title: 'Intro', narration: 'Your bank account could be drained tonight.', duration: 10 },
    ]);
    expect(result.ok).toBe(true);
  });

  it('detects cliché media in alt text', () => {
    const result = checkClicheMedia([
      {
        id: 'm1',
        segmentId: 's1',
        type: 'image',
        url: 'https://example.com/a.jpg',
        alt: 'hooded hacker typing on keyboard',
        source: 'test',
      },
    ]);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Cliché media');
  });

  it('enforces minimum duration', () => {
    expect(checkMinDuration(200, 180).ok).toBe(true);
    expect(checkMinDuration(37, 180).ok).toBe(false);
  });

  it('validateVideoQualityChecklist surfaces critical failures', () => {
    const { passed, failures } = validateVideoQualityChecklist({
      actualDurationSec: 60,
      minDurationSec: 180,
      project: {
        script: [
          { id: '1', type: 'intro', title: 'Intro', narration: 'In this video we explore AI.', duration: 10 },
        ],
        media: [],
      },
    });
    expect(passed).toBe(false);
    expect(failures.map((f) => f.id)).toContain('min_duration');
    expect(failures.map((f) => f.id)).toContain('generic_hook');
  });

  it('runVideoQualityChecklist returns five checks with duration + project', () => {
    const results = runVideoQualityChecklist({
      actualDurationSec: 200,
      project: {
        script: Array.from({ length: 6 }, (_, i) => ({
          id: String(i),
          type: i === 0 ? 'intro' : 'section',
          title: `Seg ${i}`,
          narration: i === 0 ? 'Your files could be locked by ransomware.' : 'More context.',
          duration: 15,
        })),
        media: [{ id: 'm', segmentId: '0', type: 'image', url: 'https://x/y.jpg', alt: 'office worker', source: 'test' }],
      },
    });
    expect(results).toHaveLength(5);
    expect(checklistCriticalFailures(results)).toHaveLength(0);
    expect(checkMinScriptSegments(Array(6).fill({})).ok).toBe(true);
  });
});
