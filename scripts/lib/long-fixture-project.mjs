/**
 * Long-form fixture project (~3+ min) for strict Real Pass / merge gate.
 * Uses MOCK_LONG_SCRIPT_SEGMENTS from e2e/openRouterMock.mjs.
 */
import { MOCK_LONG_SCRIPT_SEGMENTS } from '../../e2e/openRouterMock.mjs';

const PICSUM_IDS = [10, 11, 20, 21, 22, 23, 24, 25];

/**
 * @param {object} [options]
 * @param {boolean} [options.backgroundMusic]
 * @param {string} [options.musicPreset]
 */
export function buildLongFixtureProject(options = {}) {
  const backgroundMusic = options.backgroundMusic !== false;
  const musicPreset = options.musicPreset ?? 'neutral';

  const script = MOCK_LONG_SCRIPT_SEGMENTS.map((seg, i) => ({
    ...seg,
    id: `seg-${i}`,
    duration: seg.duration ?? 32,
  }));

  const media = script.map((seg, i) => ({
    id: `m-${i}`,
    segmentId: seg.id,
    type: 'image',
    url: `https://picsum.photos/id/${PICSUM_IDS[i % PICSUM_IDS.length]}/1920/1080`,
    alt: seg.title,
    source: 'unsplash',
    concept: seg.visualNote ?? seg.title,
    score: 200 - i,
  }));

  const targetDuration = script.reduce((s, seg) => s + (seg.duration ?? 0), 0);

  return {
    version: 1,
    id: 'fixture-long-real-pass',
    title: 'Why AI Will Change Healthcare — Long Form',
    topic: 'Why AI will change healthcare and cybersecurity',
    style: 'business_insider',
    targetDuration,
    status: 'ready',
    createdAt: new Date().toISOString(),
    script,
    media,
    narration: [],
    exportSettings: {
      quality: 'high',
      format: 'mp4',
      resolution: '1080p',
      aspectRatio: '16:9',
      backgroundMusic,
      musicPreset,
    },
  };
}
