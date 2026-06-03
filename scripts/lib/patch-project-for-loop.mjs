/**
 * Patch generated project before server-render (loop fixes).
 */
import { STOCK_HEALTHCARE_IMAGES } from './stock-media-urls.mjs';
import { buildShockHookLine } from '../../e2e/openRouterMock.mjs';

/**
 * @param {object} project
 * @param {string} topic
 * @param {object} fixState
 */
export function patchProjectForLoop(project, topic, fixState = {}, options = {}) {
  if (!project) return project;

  project.topic = topic;
  project.title = topic;
  project.style = 'youtube_viral';

  if (fixState.shockHook !== false && project.script?.length) {
    const hook = buildShockHookLine(topic, fixState.hookLine);
    const first = project.script[0];
    const rest = first.narration?.split(/(?<=[.!?])\s+/).slice(1).join(' ') || '';
    first.narration = `${hook} ${rest}`.trim();
    if (project.script.length > 1) {
      project.script[0].narration = `${hook} Stay with me — this gets worse. ${project.script[0].narration.split(' ').slice(0, 40).join(' ')}…`;
    }
  }

  if (!options.skipMediaPatch && fixState.forceRealStock !== false && project.media?.length) {
    const offset = fixState.mediaOffset || 0;
    project.media = project.media.map((m, i) => {
      const stock = STOCK_HEALTHCARE_IMAGES[(i + offset) % STOCK_HEALTHCARE_IMAGES.length];
      return {
        ...m,
        url: stock.url,
        alt: stock.alt,
        source: 'unsplash',
        isFallback: false,
      };
    });
  }

  project.exportSettings = {
    ...(project.exportSettings || {}),
    quality: 'high',
    backgroundMusic: true,
    musicPreset: 'neutral',
    resolution: '1080p',
    youtubeMode: true,
  };

  return project;
}

/**
 * Mock search API results — real Unsplash (not picsum).
 */
export function stockSearchResults(topic, count = 8) {
  return STOCK_HEALTHCARE_IMAGES.slice(0, count).map((img, i) => ({
    url: img.url,
    image: img.url,
    thumbnailUrl: img.url.replace('w=1920', 'w=400'),
    source: 'Unsplash',
    title: topic.slice(0, 80),
    alt: img.alt,
    width: 1920,
    height: 1080,
    type: 'image',
  }));
}
