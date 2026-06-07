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

function isInstructionOverlay(text) {
  return /^(replace|start with|use|change|fix|try)\b/i.test((text || '').trim());
}

/** Pull the suggested hook text from watcher "Replace X with Y" fixes. */
export function extractOverlayFromVisionFix(visionFix) {
  if (!visionFix?.trim()) return null;
  let text = visionFix.trim();

  const quoted = text.match(/\bwith\s+['"]([^'"]+)['"]/i);
  if (quoted) text = quoted[1].trim();
  else {
    const bare = text.match(/\bwith\s+(.+)$/i);
    if (bare) text = bare[1].trim();
    else {
      text = text
        .replace(/^Replace\s+.+?\s+with\s+/i, '')
        .replace(/^Start with[^:]*:\s*/i, '')
        .replace(/^Reveal[^:]*:\s*/i, '')
        .replace(/['"]/g, '')
        .trim();
    }
  }

  text = text.split(/[—–]/)[0].split(/[.!?]/)[0].trim();
  if (text.length < 5 || isInstructionOverlay(text)) return null;

  const words = text.split(/\s+/).filter(Boolean);
  return words.slice(0, 8).join(' ').toUpperCase();
}

/** Urgent 4–7 word on-screen hook for watcher 0–3s frame audit. */
export function buildShortHookOverlay(topic, hookLine, options = {}) {
  const preferred = options.preferredOverlay?.trim();
  if (preferred && !isInstructionOverlay(preferred)) {
    return preferred.toUpperCase();
  }

  const fromVision = extractOverlayFromVisionFix(options.visionFix);
  if (fromVision) return fromVision;

  const headline = (topic || '')
    .replace(/^How\s+/i, '')
    .replace(/^The\s+/i, '')
    .replace(/\?$/,'')
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .slice(0, 8)
    .join(' ')
    .toUpperCase() || topicKeywords(topic).join(' ').toUpperCase() || 'CRISIS EXPOSED';
  const core = headline;
  const t = `${topic || ''} ${hookLine || ''}`.toLowerCase();

  if (/whistle|expose|leak|cover|hidden|secret|erase/i.test(t)) {
    return `EXPOSED: ${core}`;
  }
  if (/nuclear|radiation|meltdown|plant/i.test(t)) {
    return `EMERGENCY: ${core}`;
  }
  if (/evict|tenant|landlord|lawsuit|fine|hack|stolen|breach/i.test(t)) {
    return `URGENT: ${core}`;
  }
  if (/fire|attack|blackout|disaster|death|kill|crash|bomb/i.test(t)) {
    return `BREAKING: ${core}`;
  }
  return `URGENT: ${core}`;
}

const DATE_OPENER_RE =
  /^(On\s+(?:\w+\s+)?\d{1,2},?\s+\d{4}|On\s+(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)|In\s+\d{4}|As\s+of\s+\w+\s+\d{4})/i;

/** Replace weak date/year openers with the shock hook line. */
export function rewriteIntroOpener(project, hookLine) {
  if (!project?.script?.length || !hookLine?.trim()) return project;
  const intro = project.script[0];
  const narration = intro.narration || '';
  const rest = narration.replace(/^[^.!?]+[.!?]\s*/, '');
  if (DATE_OPENER_RE.test(narration.trim()) || /^in \d{4}/i.test(narration.trim())) {
    intro.narration = `${hookLine.trim()} ${rest}`.trim();
  }
  return project;
}

/** Scene layouts render static slides — bypass in loop so cut intervals apply. */
export function stripSceneLayoutsForLoop(project) {
  if (!project?.script?.length) return project;
  project.script = project.script.map((seg) => {
    const { sceneLayout, ...rest } = seg;
    return rest;
  });
  return project;
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

  stripSceneLayoutsForLoop(project);

  if (fixState.shockHook !== false && project.script?.length) {
    const hook = buildShockHookLine(topic, fixState.hookLine);
    const hookOverlay = buildShortHookOverlay(topic, hook, {
      preferredOverlay: fixState.hookOverlay,
      visionFix: fixState.hookOverlay,
    });
    project.hookLine = hook;
    rewriteIntroOpener(project, hook);
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
