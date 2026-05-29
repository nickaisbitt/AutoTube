import { describe, it, expect } from 'vitest';
import { parseReviewFeedback } from '../../server-render/aiReviewer.mjs';

describe('parseReviewFeedback', () => {
  it('returns no actions for empty summary', () => {
    const result = parseReviewFeedback('');
    expect(result.actions).toEqual([]);
    expect(result.showDataOverlay).toBe(false);
    expect(result.showKineticText).toBe(false);
    expect(result.useFastPacing).toBe(false);
  });

  it('detects statistics/data needed', () => {
    const result = parseReviewFeedback('The video needs more statistics and data to support claims');
    expect(result.showDataOverlay).toBe(true);
    expect(result.showKineticText).toBe(false);
    expect(result.useFastPacing).toBe(false);
    expect(result.actions[0].flag).toBe('showDataOverlay');
  });

  it('detects generic visuals', () => {
    const result = parseReviewFeedback('The visuals are too generic, add more specific imagery');
    expect(result.showDataOverlay).toBe(false);
    expect(result.showKineticText).toBe(true);
    expect(result.useFastPacing).toBe(false);
    expect(result.actions[0].flag).toBe('showKineticText');
  });

  it('detects slow pacing', () => {
    const result = parseReviewFeedback('The pacing is too slow, the video drags');
    expect(result.showDataOverlay).toBe(false);
    expect(result.showKineticText).toBe(false);
    expect(result.useFastPacing).toBe(true);
    expect(result.actions[0].flag).toBe('useFastPacing');
  });

  it('detects multiple issues in one summary', () => {
    const result = parseReviewFeedback('Needs more statistics, visuals are generic, and pacing is too slow');
    expect(result.showDataOverlay).toBe(true);
    expect(result.showKineticText).toBe(true);
    expect(result.useFastPacing).toBe(true);
    expect(result.actions.length).toBe(3);
  });

  it('handles "add examples" as statistics/data', () => {
    const result = parseReviewFeedback('add specific examples to back up claims');
    expect(result.showDataOverlay).toBe(true);
  });

  it('handles null/undefined summary gracefully', () => {
    const result = parseReviewFeedback(null);
    expect(result.actions).toEqual([]);
    expect(result.showDataOverlay).toBe(false);
  });
});
