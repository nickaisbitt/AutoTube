/**
 * Patch generated project before server-render (loop fixes).
 */
import { STOCK_HEALTHCARE_IMAGES, STOCK_MEDIA_POOL, pickStockImages } from './stock-media-urls.mjs';
import { buildImpactBeatsForTopic, buildShockHookLine, hookClashesWithTopic } from '../../e2e/openRouterMock.mjs';
import { buildEditTimeline } from './build-edit-timeline.mjs';
import { aHashFromImage, isSimilarToRegistry } from './perceptual-hash.mjs';
import {
  isBankScamTopic,
  isHealthcareCyberTopic,
  isHeistTopic,
  isHousingTopic,
  isInsuranceFraudTopic,
  isNursingHomeTopic,
  isSchoolEducationTopic,
  isFertilityClinicTopic,
  isVeteransBenefitsTopic,
} from './topic-family.mjs';

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
  const t = (text || '').trim();
  return /^(replace|rewrite|start with|use|change|fix|try|make|update|swap)\b/i.test(t)
    || /\brewrite\s+line\b/i.test(t)
    || /\bas:\s*$/i.test(t)
    || /^(line\s*1|first\s+line)\b/i.test(t);
}

/** Pull the suggested hook text from watcher "Replace X with Y" fixes. */
export function extractOverlayFromVisionFix(visionFix) {
  if (!visionFix?.trim()) return null;
  let text = visionFix.trim();

  // Prefer the actual suggested hook in quotes or after like:/as:
  const quotedAny = text.match(/['"]([^'"]{8,})['"]/);
  const likeClause = text.match(/\blike[:\s]+['"]?([^'"\n.]{8,})['"]?/i);
  const asColon = text.match(/\b(?:rewrite\s+line\s*\d*\s*)?as[:\s]+['"]?(.+?)['"]?\s*$/i);
  if (quotedAny) text = quotedAny[1].trim();
  else if (likeClause) text = likeClause[1].trim();
  else if (asColon) text = asColon[1].trim();
  else {
    const withQuoted = text.match(/\bwith\s+['"]([^'"]+)['"]/i);
    const bare = text.match(/\bwith\s+(.+)$/i);
    if (withQuoted) text = withQuoted[1].trim();
    else if (bare) text = bare[1].trim();
    else {
      text = text
        .replace(/^Replace\s+.+?\s+with\s+/i, '')
        .replace(/^Rewrite\s+line\s*\d*\s*as[:\s]+/i, '')
        .replace(/^Start with[^:]*:\s*/i, '')
        .replace(/^Reveal[^:]*:\s*/i, '')
        .replace(/['"]/g, '')
        .trim();
    }
  }

  text = text.split(/[—–]/)[0].split(/[.!?]/)[0].trim();
  // Strip leftover instruction crumbs like "REWRITE LINE 1 AS" / "a concrete shock hook like"
  text = text
    .replace(/\brewrite\s+line\s*\d*\s*as\b[:\s]*/gi, '')
    .replace(/\breplace\s+the\s+first\s+line\s+with\b[:\s]*/gi, '')
    .replace(/^a\s+concrete\s+shock\s+hook\s+like\b[:\s]*/gi, '')
    .replace(/^a\s+shock\s+hook\s+like\b[:\s]*/gi, '')
    .trim();
  if (text.length < 5 || isInstructionOverlay(text)) return null;
  // Reject meta phrasing that still isn't a viewer-facing hook
  if (/\b(shock hook|concrete|rewrite|replace|templated?)\b/i.test(text) && text.split(/\s+/).length <= 6) {
    return null;
  }

  const words = text.split(/\s+/).filter(Boolean);
  return words.slice(0, 8).join(' ').toUpperCase();
}

/** Generic hash-template hooks from buildShockHookLine — not topic-specific enough for overlay. */
function isGenericTemplateHook(hookLine) {
  const h = (hookLine || '').trim();
  if (!h) return false;
  return (
    /^ordinary people are already paying the price\.?$/i.test(h)
    || /^they tried to hide this\b/i.test(h)
    || /^this is bigger than the headlines admit/i.test(h)
    || /^billions lost overnight:/i.test(h)
    || /^here'?s the proof\.?$/i.test(h)
  );
}

/** Urgent 4–8 word on-screen hook for watcher 0–3s frame audit. */
export function buildShortHookOverlay(topic, hookLine, options = {}) {
  const maxWords = 8;

  const trimDanglingTail = (words) => {
    const out = [...words];
    const dangling = /^(THE|A|AN|ARE|IS|WAS|FOR|TO|IN|ON|AT|WITH|YOUR|ALREADY|PAYING|WHO|THAT|THIS)$/i;
    while (out.length > 4 && dangling.test(out[out.length - 1])) out.pop();
    return out;
  };

  const clampWords = (text) => {
    const words = (text || '')
      .toUpperCase()
      .replace(/[^A-Z0-9\s:$%]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
    const clamped = trimDanglingTail(words.slice(0, maxWords));
    // A lone label with no payload (e.g. "BREAKING:" / "URGENT:") reads as a broken
    // overlay in the 0–3s frame audit — drop it so callers fall back to real stakes.
    if (clamped.length === 1 && /[:]$/.test(clamped[0])) return '';
    return clamped.join(' ');
  };

  const keywords = topicKeywords(topic);
  // Family classification uses TOPIC ONLY (same source of truth as impact beats +
  // shock hook line) so overlay, hook, and mid-video cards never disagree. Loose
  // keyword regexes still scan topic+hook for softer signals (disaster, tickets…).
  const topicOnly = String(topic || '');
  const t = `${topic || ''} ${hookLine || ''}`.toLowerCase();

  // Family short stakes FIRST — preferred overlays often dump the full topic title
  // (e.g. "URGENT NURSING HOME CAMERAS RECORDED") and get edge-clipped.
  if (/tornado|hurricane|flood|wildfire|earthquake/i.test(t)) {
    return clampWords('THIS WARNING CAME TOO LATE');
  }
  if (isNursingHomeTopic(topicOnly)) {
    return clampWords('CAMERAS CAUGHT THE ABUSE');
  }
  if (isVeteransBenefitsTopic(topicOnly)) {
    return clampWords('BENEFITS DATA FOR SALE');
  }
  if (isHousingTopic(topicOnly)) {
    return clampWords('THEY EVICTED YOU WITH AI');
  }

  const preferred = options.preferredOverlay?.trim();
  if (preferred && !isInstructionOverlay(preferred)) {
    const keys = keywords.map((k) => k.toLowerCase());
    const prefLower = preferred.toLowerCase();
    const overlapsTopic = keys.some((k) => k.length > 3 && prefLower.includes(k.toLowerCase()));
    // Stale overlays from a previous topic (e.g. bank hook on landlord video) must not stick
    if (overlapsTopic || options.forcePreferred === true) {
      return clampWords(preferred);
    }
  }

  const fromVision = extractOverlayFromVisionFix(options.visionFix);
  if (fromVision) return clampWords(fromVision);

  // Specific families BEFORE the generic leak/expose catch-all so e.g. a hospital
  // "patient data leak" gets PATIENT RECORDS EXPOSED, not HOSPITAL PATIENT EXPOSED.
  if (isInsuranceFraudTopic(topicOnly)) {
    return clampWords('FAKE CRASH SCAM EXPOSED');
  }
  if (isHeistTopic(topicOnly)) {
    // Matches the heist shock hook ("the diamonds were already gone").
    return clampWords('THE DIAMONDS ARE GONE');
  }
  if (isSchoolEducationTopic(topicOnly) && /hack|ransom|breach|cyber|leak|data|records/i.test(t)) {
    return clampWords('STUDENT RECORDS HELD HOSTAGE');
  }
  if (isFertilityClinicTopic(topicOnly) && /telegram|dark\s*web|sold|broker|leak|data|hack/i.test(t)) {
    return clampWords('FERTILITY DATA FOR SALE');
  }
  if (/library|overdue\s*book|municipal\s*fine|library\s*fine/i.test(t)) {
    return clampWords('LIBRARY FINES TRAP FAMILIES');
  }
  if (/coral|reef|restoration|marine\s*biology/i.test(t)) {
    return clampWords('THE REEF PROJECT COLLAPSED');
  }
  if (/olympic|relay|doping|drug\s*test|coach/i.test(t) && /forge|fake|test|doping|steroid/i.test(t)) {
    return clampWords('FORGED DRUG TESTS EXPOSED');
  }
  if (isHealthcareCyberTopic(topicOnly)) {
    return clampWords('PATIENT RECORDS EXPOSED');
  }
  if (
    /port|strike|container|shipping|supply\s*chain|cargo|dock|freight|maritime/i.test(t)
    && /hack|breach|track|cyber|ransom/i.test(t)
  ) {
    return clampWords('THE TRACKING HACK WAS LIVE');
  }
  if (/nuclear|radiation|meltdown|plant/i.test(t)) {
    return clampWords('EMERGENCY: THEY HID THE RISK');
  }
  // Only true bank/scam/voice-clone stories get the bank overlay.
  if (
    /bank|voice.?clone|otp|phish|wire\s*transfer|callback\s*scam/i.test(t)
    || (isBankScamTopic(topicOnly) && /bank|scam|fraud|voice|otp|phish|wire|callback/i.test(t))
  ) {
    return clampWords('YOUR BANK ACCOUNT IS EMPTY');
  }
  if (/ticket|bot|scalp|concert|fan/i.test(t)) {
    return clampWords('BOTS STOLE YOUR TICKETS');
  }
  if (/podcast|host misconduct|misconduct settlement|buried.*settlement/i.test(t)) {
    return clampWords('SETTLEMENTS WERE BURIED SILENTLY');
  }
  if (/observatory|near-earth|asteroid|astronomy/i.test(t)) {
    return clampWords('THE ASTEROID REPORT WAS LATE');
  }
  if (/gene-therapy|clinical trial|trial excluded|minority participants/i.test(t)) {
    return clampWords('THE TRIAL EXCLUDED THEM');
  }
  if (/ambulance|gps\s*route|demolished|paramedic|911\s*dispatch/i.test(t)) {
    return clampWords('GPS SENT CREWS TO RUINS');
  }
  if (/climate\s*sensor|sensor\s*calibrat|fake\s*climate|university\s*lab/i.test(t)) {
    return clampWords('THE LAB FAKED THE DATA');
  }
  if (/ferry|bridge\s*toll|tunnel\s*sensor|transit\s*app/i.test(t) && /hack|breach|outage|fail/i.test(t)) {
    return clampWords('THE FERRY SYSTEM WENT DARK');
  }
  if (/language.?learning|duolingo|vocab\s*app|language\s*app/i.test(t)) {
    return clampWords('THE APP SOLD YOUR VOICE');
  }
  if (/loyalty\s*card|grocery.*insurance|shopper.*pricing|insurance\s*pricing/i.test(t)) {
    return clampWords('LOYALTY CARDS SOLD YOU OUT');
  }
  if (/archival\s*film|film\s*reel|climate.?control.*archive|botched\s*climate/i.test(t)) {
    return clampWords('THE REELS DISSOLVED OVERNIGHT');
  }
  if (/bridge\s*inspection|photocopied|old\s*reports/i.test(t)) {
    return clampWords('INSPECTORS FAKED THE REPORTS');
  }
  if (/esports|betting\s*market|arena\s*blackout/i.test(t)) {
    return clampWords('THE BLACKOUT MOVED THE ODDS');
  }
  if (/shipwreck|stole\s*artifacts|protected\s*wreck/i.test(t)) {
    return clampWords('THE DIVER LOOTED THE WRECK');
  }
  if (/appliance\s*recall|apartment\s*renter/i.test(t)) {
    return clampWords('THE RECALL NEVER REACHED YOU');
  }
  if (/refugee\s*housing|housing\s*lottery|gamed\s*by\s*landlord/i.test(t)) {
    return clampWords('LANDLORDS GAMED THE LOTTERY');
  }

  const spoken = (hookLine || '').trim();
  if (spoken.length >= 12 && !isInstructionOverlay(spoken) && !isGenericTemplateHook(spoken)) {
    return clampWords(spoken);
  }

  if (/whistle|expose|leak|cover|hidden|secret|erase/i.test(t)) {
    // Short + no colon — long "EXPOSED: HOSPITAL HACK EXPOSED" was edge-clipped by drawtext
    const kw = keywords.filter((k) => !/^expos/i.test(k)).slice(0, 2).join(' ');
    return clampWords(kw ? `${kw} EXPOSED` : 'THE TRUTH EXPOSED');
  }
  if (/fire|attack|blackout|disaster|death|kill|crash|bomb/i.test(t)) {
    const kw = keywords.slice(0, 3).join(' ');
    return clampWords(kw ? `BREAKING: ${kw}` : 'BREAKING NEWS ALERT');
  }

  // Prefer stakes over "URGENT: keyword salad" for cold generic topics
  const core = keywords.slice(0, 3).join(' ');
  return clampWords(core ? `${core} EXPOSED` : 'THE COVER-UP EXPOSED');
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

/** Move the best face/motion video onto the intro segment for the 0–3s hook audit. */
export function promoteIntroFaceVideo(project) {
  if (!project?.script?.length || !project?.media?.length) return project;
  const intro = project.script[0];
  if (!intro?.id) return project;

  const faceScore = (asset) => {
    const blob = `${asset?.query || ''} ${asset?.alt || ''} ${asset?.url || ''}`.toLowerCase();
    const topic = String(project.topic || '').toLowerCase();
    if (/microphone|podcast|studio|asmr|cartoon|puppet|minecraft|beetle|insect/i.test(blob)) return -5;
    if (/architectural model|conference room|skyline|corporate office|empty park|people in a park/i.test(blob)) {
      return -4;
    }
    if (/camcorder|person holding camera|filming with phone|dslr camera/i.test(blob)
      && !/cctv|surveillance|podcast|recording/i.test(topic)) {
      return -3;
    }
    // Topic keyword overlap on intro assets beats generic faces
    const topicHits = topic.split(/\s+/).filter((w) => w.length > 4 && blob.includes(w)).length;
    if (/face|person|people|portrait|close.?up|worried|shocked|reaction|eyes|direct.?camera/i.test(blob)) {
      return 6 + Math.min(3, topicHits);
    }
    if (asset?.type === 'video') return 2 + Math.min(2, topicHits);
    return topicHits;
  };

  const videos = project.media.filter((m) => m.type === 'video');
  if (!videos.length) return project;
  const best = [...videos].sort((a, b) => faceScore(b) - faceScore(a))[0];
  if (!best || faceScore(best) < 2) return project;

  const bodySeg = project.script.find((s, i) => i > 0 && s.id !== intro.id)?.id;
  project.media = project.media.map((m) => {
    if (m.id === best.id) return { ...m, segmentId: intro.id };
    if (
      m.segmentId === intro.id
      && m.id !== best.id
      && m.type === 'video'
      && faceScore(m) < faceScore(best)
      && bodySeg
    ) {
      return { ...m, segmentId: bodySeg };
    }
    return m;
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
    // Orphans go to a body segment (not intro) so off-topic clips don't land on the hook
    const bodyId = segIds.find((id, idx) => idx > 0 && idx < segIds.length - 1) || segIds[Math.min(1, segIds.length - 1)] || segIds[0];
    const sid = segIds.includes(asset.segmentId) ? asset.segmentId : bodyId;
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

  // Intro must not hoard every video — body segments need unique motion for scene QA.
  const introId = segIds[0];
  const videoCount = project.media.filter((m) => m.type === 'video').length;
  const introCap = Math.max(
    effectiveMin + 1,
    Math.min(10, Math.ceil(videoCount / Math.max(2, segIds.length)) + 2),
  );
  if (introId && buckets[introId]?.length > introCap) {
    const bodyIds = segIds.slice(1).sort((a, b) => buckets[a].length - buckets[b].length);
    while (buckets[introId].length > introCap && bodyIds.length) {
      const needy = bodyIds.find((id) => buckets[id].length < effectiveMin + 1) || bodyIds[0];
      const moved = buckets[introId].pop();
      if (!moved) break;
      buckets[needy].push({
        ...moved,
        id: `${moved.id}-rebal-${needy.slice(0, 6)}-${buckets[needy].length}`,
        segmentId: needy,
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
  // skipMediaPatch = post-sanitize re-assert of hooks only — do not reshuffle B-roll onto intro
  if (!options.skipMediaPatch && !options.skipBalance) {
    balanceMediaAcrossSegments(project, Math.max(3, fixState.minAssetsPerSegment || 4));
    if (fixState.faceSeekBroll !== false) {
      promoteIntroFaceVideo(project);
    }
  }

  if (fixState.brollPlacement !== false && project.script?.length && project.media?.length) {
    project.editTimeline = buildEditTimeline(project, {
      cutIntervalSec: fixState.cutIntervalSec ?? 1.25,
      maxReusePerUrl: fixState.maxReusePerUrl ?? 1,
      reason: 'loop heuristic placement',
    });
  }

  if (fixState.shockHook !== false && project.script?.length) {
    // Always topic-match — rejects stale bank hooks left in FIX_STATE from prior topics
    const safeOverride =
      fixState.hookLine && hookClashesWithTopic(topic, fixState.hookLine)
        ? undefined
        : fixState.hookLine;
    const hook = buildShockHookLine(topic, safeOverride);
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
      impactBeatIntervalSec: fixState.impactBeatIntervalSec
        ?? (/nursing\s*home|elder\s*abuse|care\s*home/i.test(topic) ? 3.5 : 4),
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
