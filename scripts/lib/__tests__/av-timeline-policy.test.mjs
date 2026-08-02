import { describe, expect, it } from 'vitest';
import {
  AV_OVERSHOOT_EPSILON_SEC,
  DEFAULT_MAX_AUDIO_TRIM_SEC,
  MAX_FREEZE_PAD_SEC,
  resolveMuxAvGap,
} from '../../../deploy/server-render/avTimelinePolicy.mjs';

describe('mux A/V timeline policy (freeze-pad default-safe)', () => {
  it('exposes a 12s freeze-pad ceiling', () => {
    expect(MAX_FREEZE_PAD_SEC).toBe(12);
    expect(DEFAULT_MAX_AUDIO_TRIM_SEC).toBe(2);
    expect(AV_OVERSHOOT_EPSILON_SEC).toBe(0.15);
  });

  it('ignores sub-epsilon probe noise', () => {
    expect(resolveMuxAvGap(0).action).toBe('none');
    expect(resolveMuxAvGap(0.1).action).toBe('none');
  });

  it('prefers freeze-pad for healthcare-scale gaps without ALLOW_AUDIO_TRIM', () => {
    for (const gap of [0.16, 2.59, 5.2, 12]) {
      const d = resolveMuxAvGap(gap, { allowAudioTrim: false });
      expect(d.action).toBe('freeze-pad');
      expect(d.padSec).toBe(gap);
    }
  });

  it('fails closed above freeze-pad without trim override', () => {
    expect(resolveMuxAvGap(12.01, { allowAudioTrim: false }).action).toBe('fail');
  });

  it('allows explicit audio trim past freeze-pad ceiling', () => {
    expect(resolveMuxAvGap(15, { allowAudioTrim: true, maxTrimSec: 2 }).action).toBe('trim-audio');
  });
});
