/**
 * Patch generated project before server-render (loop fixes).
 */
import { STOCK_HEALTHCARE_IMAGES, STOCK_MEDIA_POOL, pickStockImages } from './stock-media-urls.mjs';
import { buildImpactBeatsForTopic, buildShockHookLine } from '../../e2e/openRouterMock.mjs';
import { buildEditTimeline } from './build-edit-timeline.mjs';
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

/** Urgent 4–7 word on-screen hook for watcher 0–3s frame audit. */
export function buildShortHookOverlay(topic, hookLine, options = {}) {
  const maxWords = 6;

  const clampWords = (text) => {
    const words = (text || '')
      .toUpperCase()
      .replace(/[^A-Z0-9\s:$%]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
    return words.slice(0, maxWords).join(' ');
  };

  const preferred = options.preferredOverlay?.trim();
  if (preferred && !isInstructionOverlay(preferred)) {
    const keys = topicKeywords(topic).map((k) => k.toLowerCase());
    const prefLower = preferred.toLowerCase();
    const overlapsTopic = keys.some((k) => k.length > 3 && prefLower.includes(k.toLowerCase()));
    // Stale overlays from a previous topic (e.g. bank hook on landlord video) must not stick
    if (overlapsTopic || options.forcePreferred === true) {
      return clampWords(preferred);
    }
  }

  const fromVision = extractOverlayFromVisionFix(options.visionFix);
  if (fromVision) return clampWords(fromVision);

  const keywords = topicKeywords(topic);
  const t = `${topic || ''} ${hookLine || ''}`.toLowerCase();

  // Prefer short stakes phrases over dumping the full topic title on screen
  if (/tornado|hurricane|flood|wildfire|earthquake/i.test(t)) {
    return clampWords('THIS WARNING CAME TOO LATE');
  }
  if (/whistle|expose|leak|cover|hidden|secret|erase/i.test(t)) {
    return clampWords(`EXPOSED: ${keywords.slice(0, 3).join(' ')}`);
  }
  if (/nuclear|radiation|meltdown|plant/i.test(t)) {
    return clampWords('EMERGENCY: THEY HID THE RISK');
  }
  if (/landlord|tenant|evict|rent/i.test(t)) {
    return clampWords('THEY EVICTED YOU WITH AI');
  }
  if (/hack|stolen|breach|password|identity|bank|voice\s*clone|fraud|scam/i.test(t)) {
    return clampWords('YOUR BANK ACCOUNT IS EMPTY');
  }
  if (/fire|attack|blackout|disaster|death|kill|crash|bomb/i.test(t)) {
    return clampWords(`BREAKING: ${keywords.slice(0, 3).join(' ')}`);
  }
  if (/ticket|bot|scalp|concert|fan/i.test(t)) {
    return clampWords('BOTS STOLE YOUR TICKETS');
  }

  const core = keywords.slice(0, 4).join(' ') || 'CRISIS EXPOSED';
  return clampWords(`URGENT: ${core}`);
}

const DATE_OPENER_RE =
  /^(On\s+(?:\w+\s+)?\d{1,2},?\s+\d{4}|On\s+(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)|In\s+(?:late\s+|early\s+|mid-?)?\d{4}|In\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}|As\s+of\s+\w+\s+\d{4})/i;

/** Replace weak date/year openers with the shock hook line. */
export function rewriteIntroOpener(project, hookLine) {
  if (!project?.script?.length || !hookLine?.trim()) return project;
  const intro = project.script[0];
  const narration = intro.narration || '';
  const rest = narration.replace(/^[^.!?]+[.!?]\s*/, '').trim();
  const first = (narration.split(/(?<=[.!?])\s+/)[0] || narration).trim();
  const weak =
    DATE_OPENER_RE.test(narration.trim())
    || /^in\s+(?:late\s+|early\s+|mid-?)?\d{4}/i.test(first)
    || /^(in this video|today we|let me explain|welcome)\b/i.test(first)
    || /^in late\s+\d{4}/i.test(first);
  // Always force shock opener in loop mode when hook provided — vision bar demands stakes first
  intro.narration = rest ? `${hookLine.trim()} ${rest}`.trim() : hookLine.trim();
  if (weak) {
    /* already rewritten above */
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

/** Ensure every segment has B-roll; dedupe URLs; steal from over-filled segments. */
export function balanceMediaAcrossSegments(project, minPerSegment = 4) {
  if (!project?.script?.length || !project?.media?.length) return project;

  const segIds = project.script.map((s) => s.id);
  const buckets = Object.fromEntries(segIds.map((id) => [id, []]));
  const seenUrls = new Set();
  const visualRegistry = [];

  for (const asset of project.media) {
    const key = (asset.url || '').split('?')[0];
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
    const needUrls = () => new Set(buckets[needId].map((a) => (a.url || '').split('?')[0]).filter(Boolean));
    while (buckets[needId].length < effectiveMin) {
      const used = needUrls();
      const donorId = donors.find((id) => id !== needId && buckets[id].length > 1);
      if (!donorId) break;
      const donorIdx = buckets[donorId].findIndex((a) => {
        const key = (a.url || '').split('?')[0];
        return key && !used.has(key);
      });
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

  project.media = segIds.flatMap((id) => buckets[id]);
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
  balanceMediaAcrossSegments(project, Math.max(3, fixState.minAssetsPerSegment || 4));

  if (fixState.brollPlacement !== false && project.script?.length && project.media?.length) {
    project.editTimeline = buildEditTimeline(project, {
      cutIntervalSec: fixState.cutIntervalSec ?? 1.25,
      reason: 'loop heuristic placement',
    });
  }

  if (fixState.shockHook !== false && project.script?.length) {
    // Always topic-match — rejects stale bank hooks left in FIX_STATE from prior topics
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
      impactBeats: buildImpactBeatsForTopic(topic),
      impactBeatIntervalSec: 5,
    };
  }

  if (!options.skipMediaPatch && fixState.forceRealStock === true && project.media?.length) {
    const offset = fixState.mediaOffset || 0;
    project.media = project.media.map((m, i) => {
      const stock = STOCK_MEDIA_POOL[(i + offset) % STOCK_MEDIA_POOL.length];
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
  // Karaoke on by default in loop (reduced caption size in youtubeProfile)
  karaokeCaptions: fixState.karaokeCaptions !== false,
    hookOverlay: project.exportSettings?.hookOverlay ?? fixState.hookOverlay ?? undefined,
    hookLine: project.exportSettings?.hookLine ?? project.hookLine ?? fixState.hookLine ?? undefined,
  };

  return project;
}

/**
 * Mock search API results — real Unsplash (not picsum).
 */
export function stockSearchResults(topic, count = 8) {
  return pickStockImages(count, 0, STOCK_MEDIA_POOL).map((img, i) => ({
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
