import { describe, expect, it } from 'vitest';
import {
  ensureTopicalVideoCoverage,
  keylessArchiveHumanPortraitScore,
  scoreAssetRelevance,
  VOLUME_PADDING_MIN_RELEVANCE,
} from '../harvest-quality.mjs';

const AIRLINE_TOPIC = 'Hidden cabin pressure failures at regional airlines';

describe('keyless archive human portrait topical boost', () => {
  const segment = {
    id: 'intro',
    title: 'The incident',
    narration: 'Passengers noticed something was wrong minutes after takeoff.',
  };

  const portraitArchive = {
    type: 'video',
    segmentId: 'intro',
    url: 'https://archive.org/download/reel_face/reel_face.mp4',
    source: 'Archive.org live',
    alt: '',
    query: 'worried passenger face close-up reaction',
  };

  const aviationArchive = {
    type: 'video',
    segmentId: 'intro',
    url: 'https://archive.org/download/cockpit_reel/cockpit_reel.mp4',
    source: 'Archive.org live',
    alt: 'pilot cockpit flight deck instruments',
    query: 'cockpit instruments',
  };

  it('floors keyless archive portrait/reaction clips above topical video minimum', () => {
    const score = keylessArchiveHumanPortraitScore(portraitArchive, segment, AIRLINE_TOPIC);
    expect(score).toBeGreaterThanOrEqual(VOLUME_PADDING_MIN_RELEVANCE);
    expect(scoreAssetRelevance(portraitArchive, segment, AIRLINE_TOPIC)).toBe(0);
  });

  it('does not boost non-archive portrait stock', () => {
    const pexelsPortrait = {
      ...portraitArchive,
      source: 'Pexels',
      url: 'https://videos.pexels.com/video-files/123/clip.mp4',
    };
    expect(keylessArchiveHumanPortraitScore(pexelsPortrait, segment, AIRLINE_TOPIC)).toBe(0);
  });

  it('still rejects archive junk even when the query asks for a face', () => {
    const hospitalJunk = {
      ...portraitArchive,
      query: 'hospital patient worried face close-up reaction',
      alt: 'hospital patient in bed worried face close-up',
    };
    expect(keylessArchiveHumanPortraitScore(hospitalJunk, segment, AIRLINE_TOPIC)).toBe(0);
  });

  it('keeps aviation archive evidence ahead of portrait-only archive clips on airline topics', () => {
    const aviationScore = scoreAssetRelevance(aviationArchive, segment, AIRLINE_TOPIC);
    const portraitScore = keylessArchiveHumanPortraitScore(portraitArchive, segment, AIRLINE_TOPIC);
    expect(aviationScore).toBeGreaterThan(portraitScore);
  });

  it('lets ensureTopicalVideoCoverage count portrait-only archive clips as topical video', () => {
    const project = {
      topic: AIRLINE_TOPIC,
      title: 'Hidden Failures',
      script: [segment],
      media: [portraitArchive],
    };
    const coverage = ensureTopicalVideoCoverage(project);
    expect(coverage.missingBefore).toEqual([]);
    expect(coverage.missing).toEqual([]);
  });
});
