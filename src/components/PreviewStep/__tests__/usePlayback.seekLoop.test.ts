import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRef } from 'react';
import type { VideoProject } from '../../../types';
import { usePlayback } from '../usePlayback';

function makeProject(): VideoProject {
  return {
    version: 1,
    id: 'p1',
    title: 'T',
    topic: 'T',
    style: 'business_insider',
    targetDuration: 30,
    script: [
      { id: 'seg-1', type: 'intro', title: 'A', narration: 'a', visualNote: 'v', duration: 10 },
    ],
    media: [],
    narration: [],
    status: 'complete',
    createdAt: new Date(),
    thumbnail: 'blob:mock-video',
  };
}

describe('usePlayback seek loop prevention', () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  });

  it('does not assign video.currentTime when timeupdate-driven setCurrentTime runs', () => {
    const project = makeProject();
    const video = document.createElement('video');
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      get() { return this._ct ?? 0; },
      set(v: number) { this._ct = v; this._seekCount = (this._seekCount ?? 0) + 1; },
    });

    const { result } = renderHook(() => {
      const videoRef = useRef<HTMLVideoElement | null>(video);
      return usePlayback(project, 'rendered', videoRef);
    });

    const seeksBefore = (video as unknown as { _seekCount?: number })._seekCount ?? 0;

    act(() => {
      // Simulate VideoPlayer onTimeUpdate → setCurrentTime (playback progress)
      result.current.setCurrentTime(1.5);
    });
    act(() => {
      result.current.setCurrentTime(2.0);
    });

    const seeksAfter = (video as unknown as { _seekCount?: number })._seekCount ?? 0;
    expect(seeksAfter).toBe(seeksBefore);
    expect(result.current.currentTime).toBe(2.0);
  });

  it('seeks video only via jumpToTime', () => {
    const project = makeProject();
    const video = document.createElement('video');
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      get() { return this._ct ?? 0; },
      set(v: number) { this._ct = v; this._seekCount = (this._seekCount ?? 0) + 1; },
    });

    const { result } = renderHook(() => {
      const videoRef = useRef<HTMLVideoElement | null>(video);
      return usePlayback(project, 'rendered', videoRef);
    });

    act(() => {
      result.current.jumpToTime(4);
    });

    expect(video.currentTime).toBe(4);
    expect((video as unknown as { _seekCount?: number })._seekCount).toBeGreaterThan(0);
    expect(result.current.currentTime).toBe(4);
  });
});
