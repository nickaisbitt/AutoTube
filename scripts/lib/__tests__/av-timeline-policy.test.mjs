import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  AV_OVERSHOOT_EPSILON_SEC,
  DEFAULT_MAX_AUDIO_TRIM_SEC,
  MAX_FREEZE_PAD_SEC,
  resolveMuxAvGap,
} from '../../../deploy/server-render/avTimelinePolicy.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('mux A/V timeline policy (freeze-pad default-safe)', () => {
  it('exposes a 12s freeze-pad ceiling (healthcare/housing encode drift)', () => {
    expect(MAX_FREEZE_PAD_SEC).toBe(12);
    expect(DEFAULT_MAX_AUDIO_TRIM_SEC).toBe(2);
    expect(AV_OVERSHOOT_EPSILON_SEC).toBe(0.15);
  });

  it('ignores sub-epsilon probe noise', () => {
    expect(resolveMuxAvGap(0).action).toBe('none');
    expect(resolveMuxAvGap(0.1).action).toBe('none');
    expect(resolveMuxAvGap(AV_OVERSHOOT_EPSILON_SEC).action).toBe('none');
  });

  it('prefers freeze-pad for healthcare-scale gaps without ALLOW_AUDIO_TRIM', () => {
    // Observed fails: 2.59s and 5.20s — previously required AUTOTUBE_ALLOW_AUDIO_TRIM=1
    for (const gap of [0.16, 0.64, 2.59, 5.2, 12]) {
      const d = resolveMuxAvGap(gap, { allowAudioTrim: false });
      expect(d.action).toBe('freeze-pad');
      expect(d.padSec).toBe(gap);
    }
  });

  it('does not freeze-pad gaps above the quality floor', () => {
    const d = resolveMuxAvGap(12.01, { allowAudioTrim: false });
    expect(d.action).toBe('fail');
    expect(d.maxFreezePadSec).toBe(MAX_FREEZE_PAD_SEC);
  });

  it('allows explicit audio trim only past freeze-pad ceiling', () => {
    const denied = resolveMuxAvGap(15, { allowAudioTrim: false, maxTrimSec: 2 });
    expect(denied.action).toBe('fail');

    const allowed = resolveMuxAvGap(15, { allowAudioTrim: true, maxTrimSec: 2 });
    expect(allowed.action).toBe('trim-audio');
    expect(allowed.trimSec).toBe(15);
  });

  it('allows trim when overshoot exceeds freeze-pad but is within maxTrimSec', () => {
    const d = resolveMuxAvGap(12.5, { allowAudioTrim: false, maxTrimSec: 13 });
    expect(d.action).toBe('trim-audio');
  });
});

describe('assembly + loop validator wire-up', () => {
  it('shares MAX_FREEZE_PAD_SEC with validate-loop-video', () => {
    const src = readFileSync(join(root, 'scripts/lib/validate-loop-video.mjs'), 'utf8');
    expect(src).toContain('MAX_FREEZE_PAD_SEC');
    expect(src).toContain('avTimelinePolicy.mjs');
  });

  it('ffmpeg assembly prefers resolveMuxAvGap freeze-pad before trim gate', () => {
    const src = readFileSync(join(root, 'deploy/server-render/ffmpegAssembly.mjs'), 'utf8');
    expect(src).toContain('resolveMuxAvGap');
    expect(src).toContain('padVideoViaLastFrame');
    expect(src).toContain("decision.action === 'freeze-pad'");
    expect(src).toContain('MAX_FREEZE_PAD_SEC');
  });
});
