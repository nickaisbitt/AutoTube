import { describe, it, expect } from 'vitest';
import { getBackgroundMusicPath, computeBgMusicVolume } from '../renderingShared';

describe('getBackgroundMusicPath', () => {
  it('maps business_insider to the correct path', () => {
    expect(getBackgroundMusicPath('business_insider')).toBe('/audio/bg-business-insider.aac');
  });

  it('maps warfront to the correct path', () => {
    expect(getBackgroundMusicPath('warfront')).toBe('/audio/bg-warfront.aac');
  });

  it('maps documentary to the correct path', () => {
    expect(getBackgroundMusicPath('documentary')).toBe('/audio/bg-documentary.aac');
  });

  it('maps explainer to the correct path', () => {
    expect(getBackgroundMusicPath('explainer')).toBe('/audio/bg-explainer.aac');
  });

  it('returns null for unknown styles', () => {
    expect(getBackgroundMusicPath('unknown_style')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(getBackgroundMusicPath('')).toBeNull();
  });
});

describe('computeBgMusicVolume', () => {
  it('returns 0.15 when narration is present', () => {
    expect(computeBgMusicVolume(true)).toBe(0.15);
  });

  it('returns 0.60 when no narration', () => {
    expect(computeBgMusicVolume(false)).toBe(0.60);
  });
});
