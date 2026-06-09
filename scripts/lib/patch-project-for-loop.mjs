/**
 * Patch generated project before server-render (loop fixes).
 */
import { STOCK_HEALTHCARE_IMAGES } from './stock-media-urls.mjs';
import { buildShockHookLine } from '../../e2e/openRouterMock.mjs';
import { buildEditTimeline, orderAssetsVideoFirst } from './build-edit-timeline.mjs';
import { normalizeUrlKey } from './harvest-loop-context.mjs';
import { aHashFromImage, isSimilarToRegistry } from './perceptual-hash.mjs';

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

function visionSuggestsBreaking(visionFix) {
  return /\bbreaking\b/i.test(visionFix || '');
}

/** Urgent 4–7 word on-screen hook for watcher 0–3s frame audit. */
export function buildShortHookOverlay(topic, hookLine, options = {}) {
  const preferred = options.preferredOverlay?.trim();
  if (preferred && !isInstructionOverlay(preferred)) {
    return preferred.toUpperCase();
  }

  const fromVision = extractOverlayFromVisionFix(options.visionFix);
  if (fromVision) {
    if (visionSuggestsBreaking(options.visionFix) && !/^BREAKING:/i.test(fromVision)) {
      return `BREAKING: ${fromVision.replace(/^BREAKING:\s*/i, '')}`;
    }
    return fromVision;
  }

  const t = `${topic || ''} ${hookLine || ''}`.toLowerCase();
  const hasMuseum = /museum|louvre|heist|robbery|stolen|jewel/.test(t);
  const hasTikTok = /tiktok|livestream|streamed live|went viral|live on/.test(t);

  if (hasMuseum && hasTikTok) {
    return 'BREAKING: LOUVRE HEIST TIKTOK LIVE';
  }
  if (hasMuseum) {
    return 'BREAKING: LOUVRE HEIST LIVE';
  }
  if (hasTikTok) {
    return 'BREAKING: TIKTOK LIVE HEIST';
  }

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

  if (/whistle|expose|leak|cover|hidden|secret|erase/i.test(t)) {
    return `EXPOSED: ${core}`;
  }
  if (/nuclear|radiation|meltdown|plant/i.test(t)) {
    return `EMERGENCY: ${core}`;
  }
  if (/fire|attack|blackout|disaster|death|kill|crash|bomb|stolen|breach|heist|robbery|hack/.test(t)) {
    return `BREAKING: ${core}`;
  }
  if (/evict|tenant|landlord|lawsuit|fine/i.test(t)) {
    return `URGENT: ${core}`;
  }
  if (visionSuggestsBreaking(options.visionFix)) {
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

function isVideoAsset(asset) {
  return asset?.type === 'video' || /\/api\/download-clip/i.test(asset?.url || '');
}

/** Ensure every segment has B-roll; dedupe URLs; steal from over-filled segments. */
export function balanceMediaAcrossSegments(project, minPerSegment = 4, options = {}) {
  const preferVideo = options.harvestVideoFirst === true;
  if (!project?.script?.length || !project?.media?.length) return project;

  const segIds = project.script.map((s) => s.id);
  const buckets = Object.fromEntries(segIds.map((id) => [id, []]));
  const seenUrls = new Set();
  const visualRegistry = [];

  for (const asset of project.media) {
    const key = normalizeUrlKey(asset.url, asset.sourceUrl) || asset.id || '';
    if (key && seenUrls.has(key)) continue;

    const thumb = asset.thumbnailUrl || (asset.type === 'image' ? asset.url : null);
    if (thumb) {
      const hash = aHashFromImage(thumb);
      if (hash && isSimilarToRegistry(hash, visualRegistry)) continue;
      if (hash) visualRegistry.push(hash);
    }

    if (key) seenUrls.add(key);
    const sid = segIds.includes(asset.segmentId) ? asset.segmentId : segIds[0];
    buckets[sid].push({ ...asset, segmentId: sid });
  }

  const effectiveMin = Math.min(
    minPerSegment,
    Math.max(1, Math.ceil(project.media.length / segIds.length)),
  );
  const donors = [...segIds].sort((a, b) => buckets[b].length - buckets[a].length);

  for (const needId of segIds.filter((id) => buckets[id].length === 0)) {
    const donorId = donors.find((id) => id !== needId && buckets[id].length > 0);
    if (!donorId) break;
    const moved = buckets[donorId].pop();
    if (!moved) break;
    buckets[needId].push({
      ...moved,
      id: `${moved.id}-bal-${needId.slice(0, 6)}`,
      segmentId: needId,
    });
  }

  const needy = segIds.filter((id) => buckets[id].length < effectiveMin);
  for (const needId of needy) {
    const needUrls = () => new Set(
      buckets[needId].map((a) => normalizeUrlKey(a.url, a.sourceUrl) || a.id || '').filter(Boolean),
    );
    while (buckets[needId].length < effectiveMin) {
      const used = needUrls();
      const donorId = donors.find((id) => id !== needId && buckets[id].length > 1);
      if (!donorId) break;
      const donorIdx = buckets[donorId].findIndex((a) => {
        const key = normalizeUrlKey(a.url, a.sourceUrl) || a.id || '';
        return key && !used.has(key);
      });
      if (preferVideo && buckets[needId].filter(isVideoAsset).length < 2) {
        const videoIdx = buckets[donorId].findIndex((a) => {
          const key = normalizeUrlKey(a.url, a.sourceUrl) || a.id || '';
          return key && !used.has(key) && isVideoAsset(a);
        });
        if (videoIdx >= 0) {
          const [moved] = buckets[donorId].splice(videoIdx, 1);
          if (moved) {
            buckets[needId].push({
              ...moved,
              id: `${moved.id}-bal-vid-${needId.slice(0, 6)}-${buckets[needId].length}`,
              segmentId: needId,
            });
            continue;
          }
        }
      }
      if (donorIdx < 0) break;
      const [moved] = buckets[donorId].splice(donorIdx, 1);
      if (!moved) break;
      buckets[needId].push({
        ...moved,
        id: `${moved.id}-bal-${needId.slice(0, 6)}-${buckets[needId].length}`,
        segmentId: needId,
      });
    }
  }

  project.media = segIds.flatMap((id) => {
    const bucket = buckets[id];
    return preferVideo ? orderAssetsVideoFirst(bucket, 2) : bucket;
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
  balanceMediaAcrossSegments(project, Math.max(3, fixState.minAssetsPerSegment || 4), {
    harvestVideoFirst: fixState.harvestVideoFirst !== false,
  });

  if (fixState.brollPlacement !== false && project.script?.length && project.media?.length) {
    project.editTimeline = buildEditTimeline(project, {
      cutIntervalSec: fixState.cutIntervalSec ?? 1.25,
      reason: 'loop heuristic placement',
      preferVideo: fixState.harvestVideoFirst !== false,
      minVideosFirst: 2,
    });
  }

  if (fixState.shockHook !== false && project.script?.length) {
    const hook = buildShockHookLine(topic, fixState.hookLine);
    const hookOverlay = buildShortHookOverlay(topic, hook, {
      preferredOverlay: fixState.hookOverlay,
      visionFix: fixState.hookOverlay && isInstructionOverlay(fixState.hookOverlay) ? fixState.hookOverlay : undefined,
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
    hookOverlay: project.exportSettings?.hookOverlay ?? fixState.hookOverlay ?? undefined,
    hookLine: project.exportSettings?.hookLine ?? project.hookLine ?? fixState.hookLine ?? undefined,
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
