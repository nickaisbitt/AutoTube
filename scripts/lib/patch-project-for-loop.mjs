/**
 * Patch generated project before server-render (loop fixes).
 */
import { STOCK_HEALTHCARE_IMAGES } from './stock-media-urls.mjs';
import { buildShockHookLine } from '../../e2e/openRouterMock.mjs';

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'they', 'this', 'that', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
  'it', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'try', 'tried', 'hide', 'hiding',
  'reveal', 'shocking', 'truth', 'about', 'why', 'how', 'what', 'when', 'where', 'who',
  'start', 'your', 'here', 'proof', 'right', 'now', 'found', 'that', 'entire', 'into',
]);

function topicKeywords(topic) {
  return (topic || '')
    .replace(/^The /i, '')
    .split(/\s+/)
    .map((w) => w.replace(/[^a-zA-Z0-9]/g, ''))
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w.toLowerCase()))
    .slice(0, 4);
}

/** Urgent 4–7 word on-screen hook for watcher 0–3s frame audit. */
export function buildShortHookOverlay(topic, hookLine, options = {}) {
  if (options.preferredOverlay?.trim()) {
    return options.preferredOverlay.trim().toUpperCase();
  }

  const visionFix = options.visionFix?.trim();
  if (visionFix) {
    const clean = visionFix
      .replace(/['"]/g, '')
      .replace(/^Start with[^:]*:\s*/i, '')
      .replace(/^Reveal[^:]*:\s*/i, '')
      .trim();
    const words = clean.split(/\s+/).filter(Boolean).slice(0, 7);
    if (words.length >= 3) return words.join(' ').toUpperCase();
  }

  const keywords = topicKeywords(topic);
  const core = keywords.join(' ').toUpperCase() || 'CRISIS EXPOSED';
  const t = `${topic || ''} ${hookLine || ''}`.toLowerCase();

  if (/whistle|expose|leak|cover|hidden|secret|erase/i.test(t)) {
    return `EXPOSED: ${core}`;
  }
  if (/nuclear|radiation|meltdown|plant/i.test(t)) {
    return `EMERGENCY: ${core}`;
  }
  if (/fire|attack|blackout|disaster|death|kill|crash|bomb|hack/i.test(t)) {
    return `BREAKING: ${core}`;
  }
  return `BREAKING: ${core}`;
}

/** Cap loop iteration runtime so cuts can outpace duplication on limited assets. */
export function trimProjectForLoop(project, maxTotalSec = 75) {
  if (!project?.script?.length) return project;
  const segCount = project.script.length;
  const perSegSec = Math.max(15, Math.floor(maxTotalSec / segCount));
  const wordsPerSeg = Math.max(28, Math.floor((perSegSec / 60) * 130));

  project.script = project.script.map((seg) => {
    const words = (seg.narration || '').split(/\s+/).filter(Boolean);
    const trimmed = words.length > wordsPerSeg ? `${words.slice(0, wordsPerSeg).join(' ')}.` : seg.narration;
    return { ...seg, narration: trimmed, duration: perSegSec };
  });

  project.targetDuration = maxTotalSec / 60;
  if (project.narration?.length) {
    project.narration = project.narration.map((clip, i) => ({
      ...clip,
      duration: perSegSec,
      segmentId: project.script[i]?.id ?? clip.segmentId,
    }));
  }
  return project;
}

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

  trimProjectForLoop(project, options.maxTotalSec ?? 75);

  if (fixState.shockHook !== false && project.script?.length) {
    const hook = buildShockHookLine(topic, fixState.hookLine);
    const hookOverlay = buildShortHookOverlay(topic, hook, {
      preferredOverlay: fixState.hookOverlay,
      visionFix: fixState.hookOverlay,
    });
    project.hookLine = hook;
    project.exportSettings = {
      ...(project.exportSettings || {}),
      hookLine: hook,
      hookOverlay,
    };
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
    hookOverlay: project.exportSettings?.hookOverlay,
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
