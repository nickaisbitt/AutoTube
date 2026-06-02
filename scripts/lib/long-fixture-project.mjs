/**
 * Long-form fixture project (~3+ min) for strict Real Pass / merge gate.
 * Uses MOCK_LONG_SCRIPT_SEGMENTS from e2e/openRouterMock.mjs.
 */
import { MOCK_LONG_SCRIPT_SEGMENTS } from '../../e2e/openRouterMock.mjs';
import { STOCK_HEALTHCARE_IMAGES } from './stock-media-urls.mjs';

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

  const media = script.map((seg, i) => {
    const stock = STOCK_HEALTHCARE_IMAGES[i % STOCK_HEALTHCARE_IMAGES.length];
    return {
      id: `m-${i}`,
      segmentId: seg.id,
      type: 'image',
      url: stock.url,
      alt: stock.alt,
      source: 'unsplash',
      concept: seg.visualNote ?? seg.title,
      score: 200 - i,
    };
  });

  const targetDuration = script.reduce((s, seg) => s + (seg.duration ?? 0), 0);

  return {
    version: 1,
    id: 'fixture-long-real-pass',
    title: 'Why AI Will Change Healthcare — Long Form',
    topic: 'Why AI will change healthcare and cybersecurity',
    style: 'youtube_viral',
    targetDuration,
    status: 'ready',
    createdAt: new Date().toISOString(),
    script,
    media,
    narration: [],
    exportSettings: {
      quality: 'highest',
      youtubeMode: true,
      format: 'mp4',
      resolution: '1080p',
      aspectRatio: '16:9',
      backgroundMusic,
      musicPreset,
    },
  };
}
