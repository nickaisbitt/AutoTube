import { describe, it, expect } from 'vitest';
import { planFallbackAssembly } from '../renderingShared';

// ---------------------------------------------------------------------------
// planFallbackAssembly
//
// Guards against shipping a silent video when the server render fails and the
// browser falls back. The server /api/render-video ffmpeg path is video-only,
// so it must not be used when the project has audio; and when there is no audio
// at all, silent output must be refused unless ALLOW_SILENT is set.
// ---------------------------------------------------------------------------

describe('planFallbackAssembly', () => {
  it('routes projects with audio to the audio-capable MediaRecorder path', () => {
    expect(planFallbackAssembly(true, false)).toBe('mediarecorder-with-audio');
    // ALLOW_SILENT has no effect when audio is present — we still want audio.
    expect(planFallbackAssembly(true, true)).toBe('mediarecorder-with-audio');
  });

  it('refuses silent video-only output when there is no audio and silent is not allowed', () => {
    expect(planFallbackAssembly(false, false)).toBe('refuse');
  });

  it('permits the fast video-only ffmpeg path only when silent output is explicitly allowed', () => {
    expect(planFallbackAssembly(false, true)).toBe('video-only-ffmpeg');
  });

  it('never returns video-only when audio is available (would drop narration)', () => {
    for (const allowSilent of [true, false]) {
      expect(planFallbackAssembly(true, allowSilent)).not.toBe('video-only-ffmpeg');
    }
  });
});
