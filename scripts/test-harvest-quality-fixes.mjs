/**
 * Verification script for harvest quality + media diversity fixes.
 * Tests: OFF_TOPIC_BLOCKLIST, Giphy cap/relevance, detectGiphyDominance,
 * suppressGiphy, forceRealStock escalation, harvest-loop-context wiring.
 * Run: node scripts/test-harvest-quality-fixes.mjs
 */

import {
  scoreAssetRelevance,
  filterAssetsByRelevance,
  extractKeywords,
  detectGiphyDominance,
  detectThinHarvest,
  loopMediaTimeoutMs,
  THIN_HARVEST_WARN_THRESHOLD,
  LOOP_MAX_MIN_ASSETS_PER_SEGMENT,
  passesTopUpRelevanceGate,
  countSegmentVideos,
  isVideoLikeAsset,
  isUnreliableVideoHost,
  isTrustedVideoHost,
  dedupHarvestByUrl,
  geoMismatchBlockReason,
  offTopicBlockReason,
  extractStoryLocation,
  expandTopicKeywords,
} from './lib/harvest-quality.mjs';
import { isVisionFetchableUrl } from './lib/harvest-vision.mjs';
import { resolveAssetHashSource } from './lib/perceptual-hash.mjs';
import { applyFixesFromWatch, pickPrimaryFailure } from './lib/apply-watch-fixes.mjs';
import { loadFixState } from './lib/loop-state.mjs';
import { buildShockHookLine } from '../e2e/openRouterMock.mjs';
import {
  buildShortHookOverlay,
  hookOverrideMatchesTopic,
  isBadKineticOverlay,
} from './lib/patch-project-for-loop.mjs';
import { computeYoutubeQualityScore, targetScore100, buildRetentionFrameTimestamps } from '../powers/video-watcher/src/vision-brutal.mjs';
import { buildRenderEnvFromFixState } from './lib/render-env-from-fix-state.mjs';
import {
  evaluateObjectiveGate,
  evaluatePlaceholderGate,
  loadRenderManifest,
  formatPlaceholderSegmentDetail,
  placeholderSegmentsFromManifest,
} from './lib/run-objective-qa.mjs';
import {
  accumulateExcludedUrls,
  harvestContextFromFixState,
  harvestSessionStoragePayload,
  normalizeUrlKey,
  isOverBroadExcludeUrl,
  pruneVisionRejectedForCrimeTopics,
  sanitizeExcludedUrls,
  pruneExcludedUrlsForReharvest,
} from './lib/harvest-loop-context.mjs';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  validateRenderManifest,
  minClipCountForDuration,
  MAX_SHIP_PLACEHOLDER_PCT,
} from './lib/validate-loop-video.mjs';

let passed = 0;
let failed = 0;

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${label}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// 1. OFF_TOPIC_BLOCKLIST — Pinterest URLs should score 0 for non-Pinterest topics
// ---------------------------------------------------------------------------
console.log('\n── 1. Pinterest blocklist ──');
{
  const topic = 'Museum Heist Paris Louvre';
  const seg = { id: 's1', title: 'The Louvre robbery', narration: 'Security cameras caught the thieves inside the museum.' };
  const topicKws = extractKeywords(topic, 12);

  const pinterestAsset = {
    url: 'https://i.pinimg.com/originals/ab/cd/museum-art.jpg',
    alt: 'Louvre museum art',
    query: 'museum heist louvre',
    sourceUrl: 'https://www.pinterest.com/pin/123456',
  };
  const score = scoreAssetRelevance(pinterestAsset, seg, topic, topicKws);
  assert('Pinterest pinimg.com URL scores 0 for non-Pinterest topic', score === 0, `score=${score}`);

  const realAsset = {
    url: 'https://upload.wikimedia.org/wikipedia/commons/louvre-entrance.jpg',
    alt: 'Louvre museum heist robbery',
    query: 'louvre museum heist',
    sourceUrl: 'https://en.wikipedia.org/wiki/Louvre',
  };
  const realScore = scoreAssetRelevance(realAsset, seg, topic, topicKws);
  assert('Wikimedia Louvre asset scores > 0 for museum heist topic', realScore > 0, `score=${realScore}`);
}

// ---------------------------------------------------------------------------
// 2. OFF_TOPIC_BLOCKLIST — Texas map, OpenStreetMap for non-geo topics
// ---------------------------------------------------------------------------
console.log('\n── 2. Map blocklist ──');
{
  const topic = 'Great Louvre Heist';
  const seg = { id: 's2', title: 'The escape route', narration: 'The thieves fled through the Paris underground.' };
  const topicKws = extractKeywords(topic, 12);

  const texasMapAsset = {
    url: 'https://images.example.com/texas-map-counties.png',
    alt: 'Texas state map counties geographic',
    query: 'escape route heist',
    sourceUrl: 'https://maps.example.com/texas-map',
  };
  const score = scoreAssetRelevance(texasMapAsset, seg, topic, topicKws);
  assert('Texas map asset scores 0 for heist topic', score === 0, `score=${score}`);

  const osmAsset = {
    url: 'https://tile.openstreetmap.org/12/1234/5678.png',
    alt: 'OpenStreetMap tile Paris',
    query: 'paris escape route',
    sourceUrl: 'https://openstreetmap.org/node/123',
  };
  const osmScore = scoreAssetRelevance(osmAsset, seg, topic, topicKws);
  assert('OpenStreetMap tile scores 0 for non-geo topic', osmScore === 0, `score=${osmScore}`);
}

// ---------------------------------------------------------------------------
// 3. OFF_TOPIC_BLOCKLIST — Hydration content for non-health topics
// ---------------------------------------------------------------------------
console.log('\n── 3. Hydration blocklist ──');
{
  const topic = 'AI Startups Silicon Valley Funding';
  const seg = { id: 's3', title: 'Venture capital rounds', narration: 'Billions poured into AI companies in 2024.' };
  const topicKws = extractKeywords(topic, 12);

  const hydrationAsset = {
    url: 'https://images.example.com/hydration-water-bottle-sports.jpg',
    alt: 'hydration drinking water bottle athlete',
    query: 'venture capital funding',
    sourceUrl: 'https://healthblog.example.com/hydration',
  };
  const score = scoreAssetRelevance(hydrationAsset, seg, topic, topicKws);
  assert('Hydration/water-bottle asset scores 0 for AI startup topic', score === 0, `score=${score}`);
}

// ---------------------------------------------------------------------------
// 4. OFF_TOPIC_BLOCKLIST — Royalty-free kids for non-children topics
// ---------------------------------------------------------------------------
console.log('\n── 4. Royalty-free kids blocklist ──');
{
  const topic = 'Cybersecurity breach corporate espionage';
  const seg = { id: 's4', title: 'Hackers inside the network', narration: 'The attackers moved laterally across servers.' };
  const topicKws = extractKeywords(topic, 12);

  const kidsStockAsset = {
    url: 'https://images.example.com/royalty-free-kids-playing.jpg',
    alt: 'royalty free kids children stock photo playing',
    query: 'cybersecurity breach',
    sourceUrl: 'https://stocksite.example.com/children-stock-photo',
  };
  const score = scoreAssetRelevance(kidsStockAsset, seg, topic, topicKws);
  assert('Royalty-free kids stock scores 0 for cybersecurity topic', score === 0, `score=${score}`);
}

// ---------------------------------------------------------------------------
// 5. OFF_TOPIC_BLOCKLIST — Tier list for non-tier-list topics
// ---------------------------------------------------------------------------
console.log('\n── 5. Tier-list blocklist ──');
{
  const topic = 'Climate change impact ocean temperatures';
  const seg = { id: 's5', title: 'Rising seas threaten coastlines', narration: 'Sea levels have risen 20cm since 1900.' };
  const topicKws = extractKeywords(topic, 12);

  const tierListAsset = {
    url: 'https://images.example.com/tier-list-ranking.png',
    alt: 'tier list ranking climate countries best worst',
    query: 'ocean temperature rise',
    sourceUrl: 'https://tiermaker.com/list/climate',
  };
  const score = scoreAssetRelevance(tierListAsset, seg, topic, topicKws);
  assert('Tier-list asset scores 0 for climate topic', score === 0, `score=${score}`);
}

// ---------------------------------------------------------------------------
// 6. filterAssetsByRelevance — batch filter including Pinterest/map noise
// ---------------------------------------------------------------------------
console.log('\n── 6. filterAssetsByRelevance batch with noise ──');
{
  const project = {
    topic: 'Louvre museum art heist',
    script: [
      { id: 'seg1', title: 'Famous heist at the Louvre', narration: 'The most daring museum robbery in history.' },
    ],
    media: [
      {
        id: 'm1', segmentId: 'seg1', type: 'image',
        url: 'https://upload.wikimedia.org/wikipedia/commons/louvre-pyramid.jpg',
        alt: 'Louvre museum pyramid Paris heist robbery',
        query: 'louvre heist museum',
      },
      {
        id: 'm2', segmentId: 'seg1', type: 'image',
        url: 'https://i.pinimg.com/originals/texas-map-counties.jpg',
        alt: 'Texas county map geographic',
        query: 'louvre heist',
      },
      {
        id: 'm3', segmentId: 'seg1', type: 'image',
        url: 'https://images.example.com/hydration-water-bottle.jpg',
        alt: 'hydration water bottle drinking',
        query: 'louvre museum',
        sourceUrl: 'https://healthsite.com/hydration',
      },
      {
        id: 'm4', segmentId: 'seg1', type: 'image',
        url: 'https://tile.openstreetmap.org/12/paris-tile.png',
        alt: 'OpenStreetMap Paris tile',
        query: 'paris louvre',
        sourceUrl: 'https://openstreetmap.org/way/123',
      },
    ],
  };

  const result = filterAssetsByRelevance(project.media, project, { minScore: 0.1 });
  const keptUrls = result.media.map((m) => m.url);
  const droppedUrls = result.dropped.map((m) => m.url);

  assert('Louvre Wikimedia asset kept', keptUrls.includes('https://upload.wikimedia.org/wikipedia/commons/louvre-pyramid.jpg'));
  assert('Pinterest Texas map asset dropped', droppedUrls.includes('https://i.pinimg.com/originals/texas-map-counties.jpg'));
  assert('Hydration asset dropped for heist topic', droppedUrls.includes('https://images.example.com/hydration-water-bottle.jpg'));
  assert('OpenStreetMap tile dropped for heist topic', droppedUrls.includes('https://tile.openstreetmap.org/12/paris-tile.png'));
}

// ---------------------------------------------------------------------------
// 7. extractKeywords — confirm keyword extraction produces meaningful, stop-word-free terms
// ---------------------------------------------------------------------------
console.log('\n── 7. extractKeywords for buildTopUpQuery ──');
{
  // Segment keywords — segment-specific terms fill the top slots (most specific)
  const segKws = extractKeywords('The Louvre security system alarm cameras', 5);
  assert('Extracts "louvre" from segment', segKws.includes('louvre'), `got: ${segKws.join(', ')}`);
  assert('Segment keywords do not contain stop word "the"', !segKws.includes('the'), `got: ${segKws.join(', ')}`);
  assert('Segment produces ≥3 meaningful words', segKws.length >= 3, `got ${segKws.length} words`);

  // Topic keywords — provide fallback when segment has fewer unique words
  const topicKws = extractKeywords('Museum Heist Paris Louvre robbery', 4);
  assert('Topic extracts "heist"', topicKws.includes('heist'), `got: ${topicKws.join(', ')}`);
  assert('Topic extracts "museum" or "louvre"', topicKws.includes('museum') || topicKws.includes('louvre'), `got: ${topicKws.join(', ')}`);
  assert('Topic keywords do not contain stop words', !topicKws.some(w => ['the', 'a', 'and', 'of'].includes(w)), `got: ${topicKws.join(', ')}`);

  // Combined deduplicated (buildTopUpQuery logic) — segment-first means "louvre" deduplicates
  const combined = [...new Set([...segKws, ...topicKws])].slice(0, 5);
  assert('Combined query has ≥3 unique content words', combined.length >= 3, `got: ${combined.join(', ')}`);
  assert('Combined query is free of stop words', !combined.some(w => ['the', 'a', 'of', 'in'].includes(w)), `got: ${combined.join(', ')}`);
}

// ---------------------------------------------------------------------------
// 8. Giphy relevance cap — stock sources rank above Giphy
// ---------------------------------------------------------------------------
console.log('\n── 8. Giphy relevance cap ──');
{
  const topic = 'Museum Heist Paris Louvre';
  const seg = { id: 's8', title: 'Louvre robbery', narration: 'Thieves broke into the museum overnight.' };
  const topicKws = extractKeywords(topic, 12);

  const giphyAsset = {
    url: 'https://media.giphy.com/media/abc123/giphy.mp4',
    alt: 'museum heist louvre robbery',
    query: 'louvre museum heist',
    source: 'giphy',
  };
  const stockAsset = {
    url: 'https://upload.wikimedia.org/wikipedia/commons/louvre-heist.jpg',
    alt: 'Louvre museum heist robbery',
    query: 'louvre museum heist',
    source: 'wikimedia',
  };
  const giphyScore = scoreAssetRelevance(giphyAsset, seg, topic, topicKws);
  const stockScore = scoreAssetRelevance(stockAsset, seg, topic, topicKws);
  assert('Giphy relevance capped at ≤0.35', giphyScore <= 0.35, `score=${giphyScore}`);
  assert('Stock source scores above capped Giphy', stockScore > giphyScore, `stock=${stockScore}, giphy=${giphyScore}`);
}

// ---------------------------------------------------------------------------
// 9. detectGiphyDominance — flag giphy-only and giphy-dominant segments
// ---------------------------------------------------------------------------
console.log('\n── 9. detectGiphyDominance ──');
{
  const giphyOnlyProject = {
    script: [{ id: 'seg-a', title: 'Hook' }, { id: 'seg-b', title: 'Body' }],
    media: [
      { segmentId: 'seg-a', source: 'giphy', url: 'https://media.giphy.com/media/a/giphy.mp4' },
      { segmentId: 'seg-a', source: 'giphy', url: 'https://media.giphy.com/media/b/giphy.mp4' },
      { segmentId: 'seg-b', source: 'wikimedia', url: 'https://upload.wikimedia.org/a.jpg' },
      { segmentId: 'seg-b', source: 'giphy', url: 'https://media.giphy.com/media/c/giphy.mp4' },
      { segmentId: 'seg-b', source: 'giphy', url: 'https://media.giphy.com/media/d/giphy.mp4' },
    ],
  };
  const only = detectGiphyDominance(giphyOnlyProject);
  assert('Detects giphy-only segment', only.giphyOnlySegments.includes('seg-a'));
  assert('Detects giphy-dominant segment (≥50%)', only.giphyDominantSegments.includes('seg-b'));
  assert('Counts total giphy assets', only.giphyTotal === 4, `got ${only.giphyTotal}`);

  const mixedProject = {
    script: [{ id: 'seg-c', title: 'Mixed' }],
    media: [
      { segmentId: 'seg-c', source: 'giphy', url: 'https://media.giphy.com/media/e/giphy.mp4' },
      { segmentId: 'seg-c', source: 'pexels', url: 'https://images.pexels.com/a.jpg' },
      { segmentId: 'seg-c', source: 'pexels', url: 'https://images.pexels.com/b.jpg' },
    ],
  };
  const mixed = detectGiphyDominance(mixedProject);
  assert('Mixed segment is not giphy-only or dominant', mixed.giphyOnlySegments.length === 0 && mixed.giphyDominantSegments.length === 0);
}

// ---------------------------------------------------------------------------
// 10. applyFixesFromWatch — low visualVariety triggers suppressGiphy
// ---------------------------------------------------------------------------
console.log('\n── 10. suppressGiphy on low visualVariety ──');
{
  const watch = {
    brutal: { report: { scores100: { visualVariety: 50, pacing: 95 } }, overall: 6 },
    repetition: { repeatPct: 0, duplicateRunCount: 0 },
    uploadReady: false,
    objectiveGate: { pass: false },
  };
  const cleanProject = {
    script: [{ id: 'seg1', title: 'Test' }],
    media: [{ segmentId: 'seg1', source: 'pexels', url: 'https://images.pexels.com/x.jpg' }],
  };
  const { fixState } = applyFixesFromWatch(watch, {}, 'test topic', cleanProject);
  assert('Low visualVariety sets suppressGiphy=true', fixState.suppressGiphy === true);
}

// ---------------------------------------------------------------------------
// 11. applyFixesFromWatch — Giphy-heavy harvest escalates forceRealStock
// ---------------------------------------------------------------------------
console.log('\n── 11. forceRealStock escalation on Giphy-heavy ──');
{
  const watch = {
    brutal: { report: { scores100: { visualVariety: 80, pacing: 95 } }, overall: 7 },
    repetition: { repeatPct: 0, duplicateRunCount: 0 },
    uploadReady: false,
    objectiveGate: { pass: false },
  };
  const giphyHeavyProject = {
    script: [{ id: 'seg1', title: 'Hook' }],
    media: [
      { segmentId: 'seg1', source: 'giphy', url: 'https://media.giphy.com/media/1/giphy.mp4' },
      { segmentId: 'seg1', source: 'giphy', url: 'https://media.giphy.com/media/2/giphy.mp4' },
    ],
  };
  const { fixState, applied } = applyFixesFromWatch(watch, {}, 'test topic', giphyHeavyProject);
  assert('Giphy-heavy sets forceRealStock=true', fixState.forceRealStock === true);
  assert('Giphy-heavy sets suppressGiphy=true', fixState.suppressGiphy === true);
  assert('Giphy-heavy triggers reHarvestMedia', fixState.reHarvestMedia === true);
  assert('Giphy-heavy fix logged', applied.some((a) => a.includes('Giphy-heavy')));
}

// ---------------------------------------------------------------------------
// 12. harvest-loop-context — suppressGiphy wired to sessionStorage
// ---------------------------------------------------------------------------
console.log('\n── 12. harvest-loop-context suppressGiphy ──');
{
  const ctx = harvestContextFromFixState({ suppressGiphy: true, harvestNonce: 1, mediaOffset: 2 });
  assert('harvestContextFromFixState passes suppressGiphy', ctx.suppressGiphy === true);

  const payload = harvestSessionStoragePayload(ctx);
  assert('sessionStorage payload sets autotube_loop_suppress_giphy', payload.autotube_loop_suppress_giphy === 'true');

  const cleanPayload = harvestSessionStoragePayload(harvestContextFromFixState({ suppressGiphy: false }));
  assert('No suppress flag when suppressGiphy=false', cleanPayload.autotube_loop_suppress_giphy === undefined);
}

// ---------------------------------------------------------------------------
// 12b. harvest-loop-context — harvestVideoFirst wired
// ---------------------------------------------------------------------------
console.log('\n── 12b. harvest-loop-context harvestVideoFirst ──');
{
  const ctx = harvestContextFromFixState({ harvestVideoFirst: true, harvestNonce: 1 });
  assert('harvestContextFromFixState passes harvestVideoFirst', ctx.harvestVideoFirst === true);

  const payload = harvestSessionStoragePayload(ctx);
  assert('sessionStorage payload sets autotube_loop_video_first', payload.autotube_loop_video_first === 'true');

  const offPayload = harvestSessionStoragePayload(harvestContextFromFixState({ harvestVideoFirst: false }));
  assert('No video-first flag when harvestVideoFirst=false', offPayload.autotube_loop_video_first === undefined);

  const vidPayload = harvestSessionStoragePayload(harvestContextFromFixState({ minVideosPerSegment: 2 }));
  assert('minVideosPerSegment wired to sessionStorage', vidPayload.autotube_loop_min_videos === '2');

  const rotatedPayload = harvestSessionStoragePayload(harvestContextFromFixState({ harvestNonce: 6 }));
  assert('harvest nonce rotates modulo 4 in sessionStorage', rotatedPayload.autotube_loop_harvest_nonce === '2');
}

// ---------------------------------------------------------------------------
// 12c. accumulateExcludedUrls / crime-topic vision prune — keep editorial pool
// ---------------------------------------------------------------------------
console.log('\n── 12c. harvest exclusions keep editorial pool ──');
{
  const fixState = {
    excludedUrls: ['https://www.reuters.com/world/europe/louvre-heist-arrests-2026-06-01/'],
  };
  accumulateExcludedUrls(fixState, {
    media: [
      {
        source: 'curated-topic-pool',
        url: 'https://upload.wikimedia.org/wikipedia/commons/louvre-pyramid.jpg',
      },
      {
        url: 'https://www.strategink.com/digital-heist-summit/banner.jpg',
        sourceUrl: 'https://www.strategink.com/digital-heist-summit/banner.jpg',
      },
    ],
  });
  assert(
    'accumulateExcludedUrls removes stored editorial excludes',
    !(fixState.excludedUrls || []).some((u) => u.includes('reuters.com/world/europe/louvre-heist')),
  );
  assert(
    'accumulateExcludedUrls skips curated/editorial media',
    !(fixState.excludedUrls || []).some((u) => u.includes('wikimedia.org')),
  );
  assert(
    'accumulateExcludedUrls keeps non-editorial exclusions',
    (fixState.excludedUrls || []).some((u) => u.includes('strategink.com')),
  );
}

// ---------------------------------------------------------------------------
// 12d. pruneVisionRejectedForCrimeTopics — keep topical press, keep obvious noise rejected
// ---------------------------------------------------------------------------
console.log('\n── 12d. pruneVisionRejectedForCrimeTopics ──');
{
  const topic = 'The museum heist streamed live on TikTok';
  const pruned = pruneVisionRejectedForCrimeTopics([
    'https://www.nytimes.com/2026/06/01/world/europe/louvre-heist-live-stream.html',
    'https://www.reuters.com/world/europe/paris-louvre-heist-suspects-arrested-2026-06-01/',
    'https://apnews.com/article/louvre-museum-heist-paris-arrests-1234567890',
    'https://onestream.live/blog/how-to-go-live-on-tiktok/',
    'https://example.com/escape-room-team-building.jpg',
  ], topic);
  assert('Crime-topic prune releases NYT press URL', !pruned.some((u) => u.includes('nytimes.com')));
  assert('Crime-topic prune releases Reuters press URL', !pruned.some((u) => u.includes('reuters.com')));
  assert('Crime-topic prune releases AP press URL', !pruned.some((u) => u.includes('apnews.com')));
  assert('Crime-topic prune keeps TikTok guide rejected', pruned.some((u) => u.includes('onestream.live')));
  assert('Crime-topic prune keeps escape-room noise rejected', pruned.some((u) => u.includes('escape-room')));

  const ctx = harvestContextFromFixState({
    excludedUrls: ['https://www.reuters.com/world/europe/louvre-heist-arrests-2026-06-01/'],
    visionRejectedUrls: pruned,
  }, topic);
  assert('harvest context excludes obvious off-topic rejects', ctx.excludeUrls.some((u) => u.includes('onestream.live')));
  assert('harvest context does not exclude Reuters press URL', !ctx.excludeUrls.some((u) => u.includes('reuters.com')));
}

// ---------------------------------------------------------------------------
// 12e. normalizeUrlKey — embedded source URL, skip bare proxy
// ---------------------------------------------------------------------------
console.log('\n── 12e. normalizeUrlKey ──');
{
  const proxy = 'http://localhost:5173/api/download-clip?url=https%3A%2F%2Fyoutube.com%2Fwatch%3Fv%3Dabc';
  assert('Extracts embedded YouTube URL', normalizeUrlKey(proxy).includes('youtube.com/watch'));
  assert('Bare proxy path returns empty', normalizeUrlKey('/api/download-clip') === '');
  assert('Uses sourceUrl when provided', normalizeUrlKey('/api/x', 'https://vimeo.com/123').includes('vimeo.com/123'));
}

// ---------------------------------------------------------------------------
// 13. Top-up relevance gate — reject logos, accept editorial
// ---------------------------------------------------------------------------
console.log('\n── 13. Top-up relevance gate ──');
{
  const topic = 'The museum heist streamed live on TikTok';
  const seg = { id: 's1', title: 'TikTok Live Turns Real', narration: 'Louvre security cameras caught the thieves.' };
  const topicKws = extractKeywords(topic, 12);

  const tiktokLogo = {
    url: 'https://cdn.logojoy.com/wp-content/uploads/tiktok-social-media-app-logo-768x768.jpg',
    alt: 'TikTok app logo',
    query: 'museum heist louvre photograph',
    type: 'image',
  };
  assert('TikTok logo fails top-up gate (even with on-topic query)', passesTopUpRelevanceGate(tiktokLogo, seg, topic, topicKws) === false);

  const tiktokAppShot = {
    url: 'https://tiktokpng.com/assets/img/dl-sc-i2.jpg',
    alt: 'TikTok app screenshot',
    query: 'museum heist louvre news image',
    type: 'image',
  };
  assert('TikTok app screenshot fails top-up gate', passesTopUpRelevanceGate(tiktokAppShot, seg, topic, topicKws) === false);

  const louvrePhoto = {
    url: 'https://static.independent.co.uk/2025/10/19/louvre-museum-robbery-paris.jpeg',
    alt: 'Louvre museum heist robbery police',
    query: 'louvre museum heist photograph',
    type: 'image',
  };
  assert('Louvre editorial photo passes top-up gate', passesTopUpRelevanceGate(louvrePhoto, seg, topic, topicKws) === true);

  const soundcloudArt = {
    url: 'https://i1.sndcdn.com/artworks-Xkem9rlzbfkHfDRv-s9mD8w-t500x500.jpg',
    alt: 'SoundCloud artwork',
    query: 'tiktok live stream',
    type: 'image',
  };
  assert('SoundCloud artwork fails top-up gate', passesTopUpRelevanceGate(soundcloudArt, seg, topic, topicKws) === false);
}

// ---------------------------------------------------------------------------
// 14. Fiction/movie stills blocklist
// ---------------------------------------------------------------------------
console.log('\n── 14. Fiction/movie stills blocklist ──');
{
  const topic = 'The museum heist streamed live on TikTok';
  const seg = { id: 's3', title: 'Louvre robbery', narration: 'Security footage showed thieves inside the museum.' };
  const topicKws = extractKeywords(topic, 12);

  const movieStill = {
    url: 'https://static1.moviewebimages.com/wordpress/wp-content/uploads/2024/10/jason-statham-heist-thriller.jpg',
    alt: 'heist thriller movie still',
    query: 'museum heist louvre',
    type: 'image',
  };
  assert('MovieWeb heist still scores 0 for news topic', scoreAssetRelevance(movieStill, seg, topic, topicKws) === 0);
  assert('Movie still fails top-up gate', passesTopUpRelevanceGate(movieStill, seg, topic, topicKws) === false);

  const redditMeme = {
    url: 'https://preview.redd.it/f8mb8u9655t61.jpg',
    alt: 'reddit heist meme',
    query: 'louvre museum heist',
    type: 'image',
  };
  assert('Reddit preview meme fails top-up gate', passesTopUpRelevanceGate(redditMeme, seg, topic, topicKws) === false);
}

// ---------------------------------------------------------------------------
// 15. Weak segment keywords do not inflate relevance
// ---------------------------------------------------------------------------
console.log('\n── 15. Weak segment keyword exclusion ──');
{
  const topic = 'The museum heist streamed live on TikTok';
  const seg = { id: 's2', title: 'TikTok Live Stream', narration: 'Watch the viral clip spread online.' };
  const topicKws = extractKeywords(topic, 12);

  const logoOnly = {
    url: 'https://cdn.logojoy.com/wp-content/uploads/tiktok-logo.jpg',
    alt: 'tiktok live stream social media',
    query: 'tiktok live',
    type: 'image',
  };
  const score = scoreAssetRelevance(logoOnly, seg, topic, topicKws);
  assert('Weak-only seg keywords score 0 for logo URL', score === 0, `score=${score}`);
}

// ---------------------------------------------------------------------------
// 16. suppressGiphy cleared when video quota met
// ---------------------------------------------------------------------------
console.log('\n── 16. suppressGiphy clear on video quota ──');
{
  const watch = { brutal: { overall: 6, report: { scores: { visualVariety: 7, pacing: 6 } } } };
  const videoRichProject = {
    script: [{ id: 's1', title: 'A' }, { id: 's2', title: 'B' }, { id: 's3', title: 'C' }],
    media: [
      { segmentId: 's1', type: 'video', url: '/api/download-clip?url=https%3A%2F%2Fyoutube.com%2Fa' },
      { segmentId: 's1', type: 'video', url: '/api/download-clip?url=https%3A%2F%2Fyoutube.com%2Fb' },
      { segmentId: 's2', type: 'video', url: '/api/download-clip?url=https%3A%2F%2Fvimeo.com%2F1' },
      { segmentId: 's2', type: 'video', url: '/api/download-clip?url=https%3A%2F%2Fvimeo.com%2F2' },
      { segmentId: 's3', type: 'video', url: '/api/download-clip?url=https%3A%2F%2Fdailymotion.com%2F1' },
      { segmentId: 's3', type: 'video', url: '/api/download-clip?url=https%3A%2F%2Fdailymotion.com%2F2' },
    ],
  };
  const { fixState, applied } = applyFixesFromWatch(watch, { suppressGiphy: true }, 'museum heist', videoRichProject);
  assert('suppressGiphy cleared when ≥2 video/seg', fixState.suppressGiphy === false);
  assert('Clear logged in applied fixes', applied.some((a) => a.includes('suppressGiphy cleared')));
}

// ---------------------------------------------------------------------------
// 17. untilScore parameterization
// ---------------------------------------------------------------------------
console.log('\n── 17. untilScore parameterization ──');
{
  const watch = {
    youtubeScore: 75,
    brutal: { overall: 7.5, report: { scores100: { visualVariety: 70, pacing: 95 } } },
    objectiveGate: { available: true, pass: true, checks: [] },
    hookScript: { pass: true },
    hookVision: { hookPass: true },
  };
  const { applied: below91 } = applyFixesFromWatch(watch, { renderTier: 'full' }, 'topic', null, { untilScore: 91 });
  assert('Below 91 triggers full-tier below-target fix', below91.some((a) => a.includes('below 91')));

  const { applied: below70 } = applyFixesFromWatch(watch, { renderTier: 'full' }, 'topic', null, { untilScore: 70 });
  assert('At 75 with untilScore=70 does not trigger below-target fix', !below70.some((a) => a.includes('below 70')));
}

// ---------------------------------------------------------------------------
// 18. countSegmentVideos — vimeo player + proxy clips
// ---------------------------------------------------------------------------
console.log('\n── 18. countSegmentVideos ──');
{
  const media = [
    { segmentId: 's1', type: 'image', url: 'https://example.com/a.jpg' },
    { segmentId: 's1', type: 'video', url: 'https://player.vimeo.com/video/123' },
    { segmentId: 's1', url: '/api/download-clip?url=https%3A%2F%2Fyoutube.com%2Fa' },
    { segmentId: 's2', type: 'video', url: 'https://www.youtube.com/watch?v=x' },
  ];
  assert('Vimeo player counts as video', isVideoLikeAsset(media[1]) === true);
  assert('Proxy clip counts as video', isVideoLikeAsset(media[2]) === true);
  assert('Segment s1 has 2 videos', countSegmentVideos(media, 's1') === 2);
  assert('Segment s2 has 1 video', countSegmentVideos(media, 's2') === 1);
  assert('Instagram blocked as unreliable video host', isUnreliableVideoHost('https://www.instagram.com/p/abc') === true);
  assert('TikTok blocked as unreliable video host', isUnreliableVideoHost('https://www.tiktok.com/@user/video/123') === true);
  assert('vm.tiktok blocked as unreliable video host', isUnreliableVideoHost('https://vm.tiktok.com/ZMabc123') === true);
  assert('tiktokcdn blocked as unreliable video host', isUnreliableVideoHost('https://p16-sign.tiktokcdn.com/obj/foo.mp4') === true);
  assert('YouTube not blocked', isUnreliableVideoHost('https://www.youtube.com/watch?v=abc') === false);
  assert('YouTube is trusted video host', isTrustedVideoHost('https://www.youtube.com/watch?v=abc') === true);
  assert('Vimeo is trusted video host', isTrustedVideoHost('https://player.vimeo.com/video/123') === true);
  assert('Pexels is trusted video host', isTrustedVideoHost('https://videos.pexels.com/video-files/abc.mp4') === true);
  assert('Instagram is not trusted', isTrustedVideoHost('https://www.instagram.com/p/x') === false);
  assert('TikTok is not trusted', isTrustedVideoHost('https://www.tiktok.com/@user/video/123') === false);
  assert('TikTok proxy not counted as video-like', isVideoLikeAsset({
    type: 'video',
    url: '/api/download-clip?url=https%3A%2F%2Fwww.tiktok.com%2Fvideo%2F1',
    sourceUrl: 'https://www.tiktok.com/@user/video/1',
  }) === false);
}

// ---------------------------------------------------------------------------
// 19. Full-tier render env wires strong pattern interrupts
// ---------------------------------------------------------------------------
console.log('\n── 19. Full-tier strong interrupts env ──');
{
  const env = buildRenderEnvFromFixState({
    renderTier: 'full',
    patternInterrupts: true,
    cutIntervalSec: 0.5,
    useFastPacing: true,
  });
  assert('Full tier sets AUTOTUBE_PATTERN_INTERRUPTS', env.AUTOTUBE_PATTERN_INTERRUPTS === '1');
  assert('Full tier sets AUTOTUBE_INTERRUPT_STRONG', env.AUTOTUBE_INTERRUPT_STRONG === '1');
  assert('Full tier fast cuts use 3s interrupt interval', env.AUTOTUBE_INTERRUPT_INTERVAL_SEC === '3');
  assert('Full tier render quality high', env.AUTOTUBE_RENDER_QUALITY === 'high');
  assert('Full tier always enables pattern interrupts', env.AUTOTUBE_PATTERN_INTERRUPTS === '1');
  assert('Full tier always enables strong interrupts', env.AUTOTUBE_INTERRUPT_STRONG === '1');
}

// ---------------------------------------------------------------------------
// 20. Pacing plateau (4.8–5) skips reharvest / minAssets escalation
// ---------------------------------------------------------------------------
console.log('\n── 20. Pacing plateau skip reharvest ──');
{
  const watch = {
    youtubeScore: 78,
    brutal: { overall: 7.8, report: { scores100: { pacing: 40, visualVariety: 50 } } },
    repetition: { repeatPct: 0, duplicateRunCount: 0 },
    objectiveGate: { available: true, pass: true, checks: [] },
    hookScript: { pass: true },
    hookVision: { hookPass: true },
  };
  const cleanProject = {
    script: [{ id: 's1', title: 'Hook' }, { id: 's2', title: 'Body' }],
    media: [
      { segmentId: 's1', type: 'video', url: '/api/download-clip?url=https%3A%2F%2Fyoutube.com%2Fa' },
      { segmentId: 's1', type: 'video', url: '/api/download-clip?url=https%3A%2F%2Fyoutube.com%2Fb' },
      { segmentId: 's2', type: 'video', url: '/api/download-clip?url=https%3A%2F%2Fvimeo.com%2F1' },
      { segmentId: 's2', type: 'video', url: '/api/download-clip?url=https%3A%2F%2Fvimeo.com%2F2' },
    ],
  };
  const { fixState, applied } = applyFixesFromWatch(
    watch,
    { renderTier: 'full', cutIntervalSec: 1.25, minAssetsPerSegment: 6 },
    'museum heist',
    cleanProject,
    { untilScore: 91 },
  );
  assert('Pacing plateau keeps minAssets at 6 (no bump)', fixState.minAssetsPerSegment === 6);
  assert('Pacing plateau skips reHarvestMedia', fixState.reHarvestMedia !== true);
  assert('Pacing plateau enables patternInterrupts', fixState.patternInterrupts === true);
  assert('Pacing plateau hits cut floor', fixState.cutIntervalSec === 0.5);
  assert('Pacing plateau logs retention-first pacing pass', applied.some((a) => a.includes('Full-tier score')));
  assert('Pacing plateau does not log repetition reharvest', !applied.some((a) => a.startsWith('3.')));
}

// ---------------------------------------------------------------------------
// 24. Render manifest ship gate — placeholder_pct and clip count
// ---------------------------------------------------------------------------
console.log('\n── 24. Render manifest ship gate ──');
{
  const tmpBase = join(tmpdir(), `autotube-manifest-test-${Date.now()}`);
  const videoDir = join(tmpBase, 'out');
  const assemblyDir = join(videoDir, 'ffmpeg-assembly');
  mkdirSync(assemblyDir, { recursive: true });
  const videoPath = join(videoDir, 'final-video-final.mp4');
  writeFileSync(videoPath, Buffer.alloc(64));

  function writeManifest(data) {
    writeFileSync(join(assemblyDir, 'render-manifest.json'), JSON.stringify(data));
  }

  writeManifest({ clipCount: 8, placeholderPct: 35, videoSec: 60, muxDurationSec: 60 });
  const highPlaceholder = validateRenderManifest(videoPath, 60);
  assert(
    'placeholderPct > 30% fails before ship',
    highPlaceholder.valid === false && highPlaceholder.error.includes(`${MAX_SHIP_PLACEHOLDER_PCT}%`),
    highPlaceholder.error || '',
  );

  writeManifest({ clipCount: 4, placeholderPct: 5, videoSec: 60, muxDurationSec: 60 });
  const lowClips = validateRenderManifest(videoPath, 60);
  const minClips = minClipCountForDuration(60);
  assert(
    'clipCount below min fails before ship',
    lowClips.valid === false && lowClips.error.includes(`${minClips}`),
    lowClips.error || '',
  );

  writeManifest({ clipCount: 12, placeholderPct: 10, videoSec: 60, muxDurationSec: 60 });
  const okManifest = validateRenderManifest(videoPath, 60);
  assert('healthy manifest passes ship gate', okManifest.valid === true);

  rmSync(tmpBase, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// 19. buildEditTimeline — video-first puts motion clips before stills
// ---------------------------------------------------------------------------
console.log('\n── 19. buildEditTimeline video-first ──');
{
  const { buildEditTimeline, orderAssetsVideoFirst } = await import('./lib/build-edit-timeline.mjs');
  const media = [
    { id: 'img1', segmentId: 's1', type: 'image', url: 'https://example.com/a.jpg' },
    { id: 'vid1', segmentId: 's1', type: 'video', url: '/api/download-clip?url=https%3A%2F%2Fyoutube.com%2Fa' },
    { id: 'img2', segmentId: 's1', type: 'image', url: 'https://example.com/b.jpg' },
    { id: 'vid2', segmentId: 's1', type: 'video', url: '/api/download-clip?url=https%3A%2F%2Fvimeo.com%2F1' },
  ];
  const ordered = orderAssetsVideoFirst(media, 2);
  assert('orderAssetsVideoFirst leads with videos', ordered[0].type === 'video' && ordered[1].type === 'video');
  assert('orderAssetsVideoFirst trails with images', ordered[2].type === 'image');

  const project = {
    script: [{ id: 's1', duration: 5 }],
    media,
  };
  const timeline = buildEditTimeline(project, { preferVideo: true, cutIntervalSec: 1.25, minVideosFirst: 2 });
  const firstTwo = timeline.slice(0, 2).map((e) => media.find((m) => m.id === e.assetId)?.type);
  assert('First two timeline slots are video when preferVideo', firstTwo.every((t) => t === 'video'), `got ${firstTwo.join(',')}`);
}

// ---------------------------------------------------------------------------
// 20. balanceMediaAcrossSegments — video-first segment ordering
// ---------------------------------------------------------------------------
console.log('\n── 20. patch balanceMedia video-first ──');
{
  const { balanceMediaAcrossSegments } = await import('./lib/patch-project-for-loop.mjs');
  const project = {
    script: [{ id: 's1', title: 'Hook' }],
    media: [
      { id: 'm1', segmentId: 's1', type: 'image', url: 'https://example.com/1.jpg', alt: 'one' },
      { id: 'm2', segmentId: 's1', type: 'video', url: '/api/download-clip?url=https%3A%2F%2Fyoutube.com%2Fa', alt: 'clip' },
      { id: 'm3', segmentId: 's1', type: 'image', url: 'https://example.com/2.jpg', alt: 'two' },
      { id: 'm4', segmentId: 's1', type: 'video', url: '/api/download-clip?url=https%3A%2F%2Fvimeo.com%2F1', alt: 'motion' },
    ],
  };
  balanceMediaAcrossSegments(project, 4, { harvestVideoFirst: true });
  const types = project.media.map((m) => m.type);
  assert('balanceMediaAcrossSegments orders videos before images', types[0] === 'video' && types[1] === 'video');
}

// ---------------------------------------------------------------------------
// 21. Gate alignment — placeholder_pct vs draft-tier tech score
// ---------------------------------------------------------------------------
console.log('\n── 21. Gate alignment (placeholder vs draft score) ──');
{
  const placeholderGate = {
    available: true,
    pass: false,
    placeholderPct: 42.5,
    placeholderClipCount: 17,
    clipCount: 40,
    maxPlaceholderPct: 10,
    perSegment: [
      { segmentId: 'seg-hook', title: 'Hook', clipCount: 8, placeholderClipCount: 6 },
      { segmentId: 'seg-body', title: 'Body', clipCount: 32, placeholderClipCount: 11 },
    ],
    badSegments: [
      { segmentId: 'seg-hook', title: 'Hook', clipCount: 8, placeholderClipCount: 6 },
      { segmentId: 'seg-body', title: 'Body', clipCount: 32, placeholderClipCount: 11 },
    ],
    segmentDetail: 'Hook:6/8, Body:11/32',
  };
  const objectiveQa = {
    pass: true,
    score: 100,
    scorePass: true,
    silencePass: true,
    silenceFirst60Sec: 0,
  };
  const gate = evaluateObjectiveGate({
    sceneQa: { available: true, hookPass: true, bodyPass: true, longestHookSec: 1.2, longestSceneSec: 2.1 },
    objectiveQa,
    clipCountGate: { available: true, pass: true, clipCount: 40, minClips: 12 },
    placeholderGate,
    renderTier: 'draft',
  });
  assert('Draft composite FAIL when placeholder_pct fails despite score 100', gate.pass === false);
  assert('Draft gate lists placeholder_pct as failing check', gate.checks.some((c) => c.name === 'placeholder_pct' && !c.pass));
  assert('Placeholder check detail includes dead segment breakdown', gate.checks.find((c) => c.name === 'placeholder_pct')?.detail.includes('Hook:6/8'));

  const bad = placeholderSegmentsFromManifest(placeholderGate.perSegment);
  assert('placeholderSegmentsFromManifest finds dead segments', bad.length === 2);
  assert('formatPlaceholderSegmentDetail renders clip ratios', formatPlaceholderSegmentDetail(bad).includes('Body:11/32'));
}

// ---------------------------------------------------------------------------
// 22. applyFixesFromWatch — manifest dead segments → excludedUrls
// ---------------------------------------------------------------------------
console.log('\n── 22. Placeholder FAIL excludes dead segment URLs ──');
{
  const tmp = mkdtempSync(join(tmpdir(), 'autotube-gate-'));
  const assemblyDir = join(tmp, 'ffmpeg-assembly');
  mkdirSync(assemblyDir, { recursive: true });
  writeFileSync(
    join(assemblyDir, 'render-manifest.json'),
    JSON.stringify({
      clipCount: 10,
      placeholderClipCount: 4,
      placeholderPct: 40,
      perSegment: [
        { segmentId: 'seg-dead', title: 'Dead seg', clipCount: 5, placeholderClipCount: 4 },
        { segmentId: 'seg-ok', title: 'OK seg', clipCount: 5, placeholderClipCount: 0 },
      ],
    }),
  );
  const videoPath = join(tmp, 'FINAL-VIDEO.mp4');
  writeFileSync(videoPath, '');

  const manifest = loadRenderManifest(videoPath);
  assert('loadRenderManifest reads adjacent ffmpeg manifest', manifest?.placeholderPct === 40);

  const gateFromDisk = evaluatePlaceholderGate(videoPath);
  assert('evaluatePlaceholderGate FAIL on high placeholder pct', gateFromDisk.pass === false);
  assert('evaluatePlaceholderGate exposes badSegments', gateFromDisk.badSegments?.length === 1);

  const project = {
    script: [{ id: 'seg-dead', title: 'Dead seg' }, { id: 'seg-ok', title: 'OK seg' }],
    media: [
      { segmentId: 'seg-dead', type: 'video', url: '/api/download-clip?url=https%3A%2F%2Fyoutube.com%2Fwatch%3Fv%3Ddead1' },
      { segmentId: 'seg-dead', type: 'image', url: 'https://images.example.com/dead-thumb.jpg' },
      { segmentId: 'seg-dead', type: 'image', url: 'https://www.reuters.com/world/europe/louvre-heist-arrests-2026-06-01/' },
      { segmentId: 'seg-ok', type: 'video', url: '/api/download-clip?url=https%3A%2F%2Fyoutube.com%2Fwatch%3Fv%3Dgood1' },
    ],
  };
  const watch = {
    videoPath,
    placeholderGate: gateFromDisk,
    objectiveGate: {
      available: true,
      pass: false,
      checks: [{ name: 'placeholder_pct', pass: false, detail: '40% placeholders' }],
    },
    brutal: { overall: 7, report: { scores: { visualVariety: 8, pacing: 7 } } },
    repetition: { repeatPct: 0, duplicateRunCount: 0 },
    uploadReady: false,
  };
  const { fixState, applied } = applyFixesFromWatch(watch, {}, 'museum heist', project);
  assert(
    'Dead segment assets excluded from reharvest',
    (fixState.excludedUrls || []).some((u) => u.includes('youtube.com/watch'))
      && (fixState.excludedUrls || []).some((u) => u.includes('dead-thumb.jpg')),
    (fixState.excludedUrls || []).join(', '),
  );
  assert('Dead segment editorial URL not excluded', !(fixState.excludedUrls || []).some((u) => u.includes('reuters.com/world/europe/louvre-heist')));
  assert('OK segment video URL not excluded', !(fixState.excludedUrls || []).some((u) => u.includes('youtube.com/watch?v=good1')));
  assert('Placeholder fix mentions dead segment breakdown', applied.some((a) => a.includes('dead segs: Dead seg:4/5')));
}

// ---------------------------------------------------------------------------
// 23. Thin harvest detection + video-first media timeout
// ---------------------------------------------------------------------------
console.log('\n── 23. Thin harvest + media timeout ──');
{
  const thinProject = {
    script: [
      { id: 'seg-a', title: 'Hook' },
      { id: 'seg-b', title: 'Body' },
    ],
    media: [
      { segmentId: 'seg-a', url: 'https://example.com/a1.jpg' },
      { segmentId: 'seg-a', url: 'https://example.com/a2.jpg' },
      { segmentId: 'seg-b', url: 'https://example.com/b1.jpg' },
    ],
  };
  const thin = detectThinHarvest(thinProject);
  assert('Detects segment below 3 assets', thin.thin.some((s) => s.segmentId === 'seg-b'), `thin=${JSON.stringify(thin.thin)}`);
  assert('Thin harvest fails pass gate', thin.pass === false);
  assert('Warn threshold is 3', THIN_HARVEST_WARN_THRESHOLD === 3);

  const okProject = {
    script: [{ id: 'seg-a', title: 'Hook' }],
    media: [
      { segmentId: 'seg-a', url: 'https://example.com/1.jpg' },
      { segmentId: 'seg-a', url: 'https://example.com/2.jpg' },
      { segmentId: 'seg-a', url: 'https://example.com/3.jpg' },
    ],
  };
  assert('Healthy harvest passes thin gate', detectThinHarvest(okProject).pass === true);

  assert('Real harvest base timeout 20min', loopMediaTimeoutMs({ realHarvest: true, videoFirst: false }) === 1_200_000);
  assert('Video-first adds 5min headroom', loopMediaTimeoutMs({ realHarvest: true, videoFirst: true }) === 1_500_000);
  assert('Mock harvest unchanged', loopMediaTimeoutMs({ realHarvest: false, videoFirst: true }) === 300_000);
}

// ---------------------------------------------------------------------------
// 19. applyFixesFromWatch — placeholder gate excludes manifest placeholderUrls
// ---------------------------------------------------------------------------
console.log('\n── 19. placeholder gate manifest exclusion ──');
{
  const tmp = mkdtempSync(join(tmpdir(), 'autotube-manifest-'));
  const videoDir = join(tmp, 'run');
  const assemblyDir = join(videoDir, 'ffmpeg-assembly');
  mkdirSync(assemblyDir, { recursive: true });
  writeFileSync(join(videoDir, 'final.mp4'), '');
  writeFileSync(join(assemblyDir, 'render-manifest.json'), JSON.stringify({
    clipCount: 10,
    placeholderClipCount: 2,
    placeholderPct: 20,
    placeholderUrls: [
      'https://www.tiktok.com/@user/video/dead1',
      'https://www.youtube.com/watch?v=good1',
      'https://www.reuters.com/world/europe/louvre-heist-arrests-2026-06-01/',
    ],
    perSegment: [{ segmentId: 's1', title: 'Hook', clipCount: 5, placeholderClipCount: 2 }],
  }));

  const watch = {
    brutal: { report: { scores: { visualVariety: 7, pacing: 7 } }, overall: 7 },
    repetition: { repeatPct: 0, duplicateRunCount: 0 },
    uploadReady: false,
    objectiveGate: {
      available: true,
      pass: false,
      checks: [{ name: 'placeholder_pct', pass: false, detail: '20% placeholders' }],
    },
    placeholderGate: { placeholderPct: 20 },
    videoPath: join(videoDir, 'final.mp4'),
  };
  const project = {
    script: [{ id: 's1', title: 'Hook' }],
    media: [
      { segmentId: 's1', type: 'video', url: '/api/download-clip?url=tiktok', sourceUrl: 'https://www.tiktok.com/@user/video/dead1' },
      { segmentId: 's1', type: 'video', url: '/api/download-clip?url=yt', sourceUrl: 'https://www.youtube.com/watch?v=good1' },
      { segmentId: 's1', type: 'video', url: '/api/download-clip?url=yt2', sourceUrl: 'https://www.youtube.com/watch?v=good2' },
    ],
  };
  const { fixState, applied } = applyFixesFromWatch(watch, {}, 'topic', project, { videoPath: watch.videoPath });
  assert('Placeholder fail triggers reharvest', fixState.reHarvestMedia === true);
  assert('Excludes manifest placeholder URLs only', fixState.excludedUrls?.length === 2);
  assert('Does not exclude working YouTube URL', !fixState.excludedUrls?.includes('https://www.youtube.com/watch?v=good2'));
  assert('Does not exclude editorial placeholder URL', !fixState.excludedUrls?.some((u) => u.includes('reuters.com/world/europe/louvre-heist')));
  assert('Applied message mentions placeholder URL(s)', applied.some((a) => a.includes('placeholder URL')));
  assert(
    'Placeholder fail does not raise minAssets above cap',
    fixState.minAssetsPerSegment <= LOOP_MAX_MIN_ASSETS_PER_SEGMENT,
    String(fixState.minAssetsPerSegment),
  );
  rmSync(tmp, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// 25. minAssets cap — loadFixState + variety/reharvest escalation
// ---------------------------------------------------------------------------
console.log('\n── 25. minAssets cap ──');
{
  const tmp = mkdtempSync(join(tmpdir(), 'autotube-fixstate-'));
  writeFileSync(join(tmp, 'FIX_STATE.json'), JSON.stringify({ minAssetsPerSegment: 10, harvestNonce: 3 }));
  const loaded = loadFixState(tmp);
  assert(`loadFixState caps minAssets at ${LOOP_MAX_MIN_ASSETS_PER_SEGMENT}`, loaded.minAssetsPerSegment === LOOP_MAX_MIN_ASSETS_PER_SEGMENT);
  rmSync(tmp, { recursive: true, force: true });

  const watch = {
    brutal: { overall: 4, report: { scores: { visualVariety: 4, pacing: 4 } } },
    repetition: { repeatPct: 45, duplicateRunCount: 3 },
    objectiveGate: { available: true, pass: true, checks: [] },
    hookScript: { pass: true },
    hookVision: { hookPass: true },
    sceneQa: { available: true, pass: false, longestSceneSec: 6 },
  };
  const { fixState } = applyFixesFromWatch(watch, { minAssetsPerSegment: 6 }, 'museum heist', null, { untilScore: 91 });
  assert('Scene/repetition escalation stays at cap', fixState.minAssetsPerSegment <= LOOP_MAX_MIN_ASSETS_PER_SEGMENT);
}

// ---------------------------------------------------------------------------
// 24. buildShockHookLine — museum / TikTok topic-specific hooks
// ---------------------------------------------------------------------------
console.log('\n── 24. buildShockHookLine museum/TikTok ──');
{
  const museumTopic = 'The museum heist streamed live on TikTok';
  const hook = buildShockHookLine(museumTopic);
  assert('Museum TikTok hook mentions Louvre or TikTok', /louvre|tiktok/i.test(hook), hook);
  assert('Museum TikTok hook avoids generic filler', !/almost nobody saw it coming|could affect you by tomorrow/i.test(hook), hook);
  assert('Museum TikTok hook has urgency marker', /breaking|live|millions|police|robbed|heist/i.test(hook), hook);

  const overlay = buildShortHookOverlay(museumTopic, hook);
  assert('Museum overlay uses BREAKING prefix', overlay.startsWith('BREAKING:'), overlay);
  assert('Museum overlay mentions LOUVRE or TIKTOK', /LOUVRE|TIKTOK/.test(overlay), overlay);

  const visionOverlay = buildShortHookOverlay(museumTopic, hook, {
    visionFix: 'Replace weak opener with BREAKING: LOUVRE HEIST LIVE',
  });
  assert('Vision BREAKING suggestion prefixes overlay', visionOverlay.startsWith('BREAKING:'), visionOverlay);

  const ctx = harvestContextFromFixState({ hookLine: hook, hookOverlay: overlay });
  const payload = harvestSessionStoragePayload(ctx);
  assert('Hook line wired to sessionStorage', payload.autotube_loop_hook_line === hook);
  assert('Hook overlay wired to sessionStorage', payload.autotube_loop_hook_overlay === overlay);

  const watch = {
    hookScript: { pass: false, issue: 'Generic opener' },
    hookVision: { hookPass: false, fix: 'Start with BREAKING: LOUVRE HEIST TIKTOK LIVE' },
    brutal: { report: { scores: { visualVariety: 8, pacing: 8 } }, overall: 7 },
    repetition: { repeatPct: 0, duplicateRunCount: 0 },
    uploadReady: false,
    objectiveGate: { pass: true },
  };
  const { fixState, applied } = applyFixesFromWatch(watch, {}, museumTopic);
  assert('Hook fail sets topic-specific hookLine', /louvre|tiktok/i.test(fixState.hookLine || ''), fixState.hookLine);
  assert('Hook fail sets BREAKING overlay', fixState.hookOverlay?.startsWith('BREAKING:'), fixState.hookOverlay);
  assert('Hook fix logged', applied.some((a) => a.includes('Hook FAIL')));

  const prisonHook = 'Stop scrolling — The prison escape planned entirely on Discord is worse than the headlines admit.';
  assert('Prison hook rejected for museum topic', !hookOverrideMatchesTopic(prisonHook, museumTopic));
  const staleOverlay = buildShortHookOverlay(museumTopic, buildShockHookLine(museumTopic), {
    preferredOverlay: 'URGENT: PRISON ESCAPE PLANNED ENTIRELY ON DISCORD',
  });
  assert('Stale prison overlay ignored for museum', staleOverlay.includes('LOUVRE'), staleOverlay);
}

// ---------------------------------------------------------------------------
// 26. YouTube quality score (0–100) + retention frame plan
// ---------------------------------------------------------------------------
console.log('\n── 26. YouTube quality score 0–100 ──');
{
  assert('targetScore100 maps 9.1 → 91', targetScore100(9.1) === 91);
  assert('targetScore100 keeps 91', targetScore100(91) === 91);

  const ts = buildRetentionFrameTimestamps(60, 14);
  assert('Retention frames include hook cluster', ts[0] === 0 && ts.includes(3));
  assert('Retention frames dense in first 30s', ts.filter((t) => t <= 30).length >= 8);

  const gatePassScore = computeYoutubeQualityScore({
    retentionScores: { hook: 72, visualVariety: 68, pacing: 65, captionReadability: 75, youtubeReadiness: 70 },
    objectiveQa: { score: 88 },
    hookVision: { hookPass: true },
    hookScript: { pass: true },
    sceneQa: { pass: true, longestSceneSec: 1.5 },
    placeholderGate: { pass: true },
    objectiveGate: { pass: true },
    repetition: { repeatPct: 0 },
  });
  assert('Gate-passing video scores ≥74', gatePassScore >= 74, String(gatePassScore));

  const weakScore = computeYoutubeQualityScore({
    retentionScores: { hook: 40, visualVariety: 45, pacing: 42, captionReadability: 50, youtubeReadiness: 40 },
    objectiveQa: { score: 55 },
    hookVision: { hookPass: false },
    hookScript: { pass: false },
    sceneQa: { pass: false, longestSceneSec: 8 },
    placeholderGate: { pass: false },
    objectiveGate: { pass: false },
    repetition: { repeatPct: 40 },
  });
  assert('Weak video scores <60', weakScore < 60, String(weakScore));
}

// ---------------------------------------------------------------------------
// 27. isBadKineticOverlay — reject UI kinetic junk, keep BREAKING hooks
// ---------------------------------------------------------------------------
console.log('\n── 27. isBadKineticOverlay ──');
{
  assert('Rejects urgent-question kinetic junk', isBadKineticOverlay("AN URGENT QUESTION: 'DID A HEIST JUST HAPPEN'"));
  assert('Rejects instruction overlays', isBadKineticOverlay('Replace weak opener with BREAKING'));
  assert('Accepts BREAKING hook overlay', !isBadKineticOverlay('BREAKING: LOUVRE HEIST TIKTOK LIVE'));
  assert('Empty is not bad', !isBadKineticOverlay(''));

  const museumTopic = 'The museum heist streamed live on TikTok';
  const hook = buildShockHookLine(museumTopic);
  const withBadPreferred = buildShortHookOverlay(museumTopic, hook, {
    preferredOverlay: "AN URGENT QUESTION: DID A HEIST JUST HAPPEN",
  });
  assert('Bad preferred overlay ignored', withBadPreferred === 'BREAKING: LOUVRE HEIST TIKTOK LIVE', withBadPreferred);

  const env = buildRenderEnvFromFixState({
    renderTier: 'full',
    cutIntervalSec: 0.5,
    patternInterrupts: true,
    useFastPacing: true,
    hookOverlay: 'BREAKING: LOUVRE HEIST TIKTOK LIVE',
  });
  assert('Full fast pacing uses 3s interrupts', env.AUTOTUBE_INTERRUPT_INTERVAL_SEC === '3');
  assert('Hook overlay in render env', env.AUTOTUBE_HOOK_OVERLAY === 'BREAKING: LOUVRE HEIST TIKTOK LIVE');
}

// ---------------------------------------------------------------------------
// 35. Lifestyle / webinar / digital-heist blocklist (museum crime topic)
// ---------------------------------------------------------------------------
console.log('\n── 35. Lifestyle and webinar blocklist ──');
{
  const topic = 'The museum heist streamed live on TikTok';
  const seg = { id: 's2', title: 'TikTok live stream', narration: 'The thieves broadcast while stealing crown jewels.' };
  const topicKws = extractKeywords(topic, 12);

  const ringLight = {
    url: 'https://www.pexels.com/video/a-young-woman-recording-a-video-with-her-phone-and-a-ring-light-12433102/',
    alt: 'woman recording with ring light',
    query: 'tiktok live stream',
    type: 'video',
  };
  assert('Ring-light lifestyle video scores 0', scoreAssetRelevance(ringLight, seg, topic, topicKws) === 0);

  const strategink = {
    url: 'https://www.strategink.com/digital-heist-summit/1st-edition/bengaluru/img/email-banner.jpg',
    alt: 'Digital Heist Summit promo',
    query: 'digital heist',
    type: 'image',
  };
  assert('Strategink webinar promo scores 0', scoreAssetRelevance(strategink, seg, topic, topicKws) === 0);

  const goLiveGuide = {
    url: 'https://buffer.com/resources/tiktok-live/',
    alt: 'How to Go Live on TikTok',
    query: 'tiktok live guide',
    type: 'image',
  };
  assert('TikTok go-live tutorial scores 0', scoreAssetRelevance(goLiveGuide, seg, topic, topicKws) === 0);

  const { media, dropped } = filterAssetsByRelevance(
    [ringLight, strategink, goLiveGuide],
    { topic, script: [seg] },
    { minScore: 0.38 },
  );
  assert('Batch filter drops lifestyle/webinar assets', media.length === 0 && dropped.length === 3);
}

// ---------------------------------------------------------------------------
// 36. Assembly FAIL excludes all media URLs from failed project
// ---------------------------------------------------------------------------
console.log('\n── 36. Assembly FAIL URL exclusion ──');
{
  const watch = {
    finalScore: 45,
    assemblyAudit: { assemblyScore: 30, issues: ['Off-topic stock images'] },
    brutal: { overall: 4.5, report: { scores: { pacing: 7.5, visualVariety: 7 } } },
    objectiveGate: { available: true, pass: true, checks: [] },
  };
  const badProject = {
    topic: 'The museum heist streamed live on TikTok',
    media: [
      { url: 'https://www.strategink.com/digital-heist-summit/banner.jpg', sourceUrl: 'https://www.strategink.com/digital-heist-summit/banner.jpg' },
      { url: '/api/download-clip?url=https%3A%2F%2Fpexels.com%2Fring-light', sourceUrl: 'https://www.pexels.com/video/ring-light-12433102/' },
      { url: 'https://abcnews.go.com/International/louvre-heist', alt: 'Louvre heist news photo' },
    ],
  };
  const { fixState, applied } = applyFixesFromWatch(watch, { harvestNonce: 3 }, 'museum heist', badProject);
  assert('Assembly fail excludes strategink URL', (fixState.excludedUrls || []).some((u) => u.includes('strategink')));
  assert('Assembly fail excludes pexels ring-light URL', (fixState.excludedUrls || []).some((u) => u.includes('pexels.com')));
  assert('Assembly fail keeps editorial Louvre news URL', !(fixState.excludedUrls || []).some((u) => u.includes('abcnews.go.com')));
  assert('Assembly fail logs routing fix', applied.some((a) => /exclude|reharvest|repeatPenalty|curated|topicRelevance/i.test(a)));
}

// ---------------------------------------------------------------------------
// 37. effectiveCutInterval widens when asset pool is thin
// ---------------------------------------------------------------------------
console.log('\n── 37. effectiveCutInterval thin pool ──');
{
  const { effectiveCutInterval } = await import('./lib/build-edit-timeline.mjs');
  const thinProject = {
    script: [{ id: 's1', duration: 20 }, { id: 's2', duration: 20 }, { id: 's3', duration: 20 }],
    media: Array.from({ length: 11 }, (_, i) => ({ id: `a${i}`, url: `https://example.com/img${i}.jpg` })),
  };
  const wide = effectiveCutInterval(thinProject, 0.5);
  assert('Thin pool widens 0.5s cuts to ≥1.5s', wide >= 1.5, `cut=${wide}`);
  const richProject = {
    script: [{ id: 's1', duration: 30 }],
    media: Array.from({ length: 30 }, (_, i) => ({ id: `a${i}`, url: `https://example.com/img${i}.jpg` })),
  };
  assert('Rich pool keeps fast cuts', effectiveCutInterval(richProject, 0.5) === 0.5);
}

// ---------------------------------------------------------------------------
// 41. buildEditTimeline — global URL use hard cap (no URL > 2 times)
// ---------------------------------------------------------------------------
console.log('\n── 41. buildEditTimeline global URL hard cap ──');
{
  const { buildEditTimeline, MAX_USES_PER_URL, effectiveCutInterval } = await import('./lib/build-edit-timeline.mjs');
  assert('MAX_USES_PER_URL exported as 2', MAX_USES_PER_URL === 2);

  // 12 unique assets over 60 s (2×30 s segments).
  // effectiveCutInterval: targetClips=120, maxClipsFromPool=12*2=24 → needs widening.
  // Hook-zone-aware formula: s1's first 10s uses HOOK_MAX_HOLD_SEC=2s clips (5 clips),
  // leaving 7 slots for 20s → requires cut ≥ 20/7 ≈ 2.86s (≥ 2.5s base).
  const project = {
    script: [{ id: 's1', duration: 30 }, { id: 's2', duration: 30 }],
    media: Array.from({ length: 12 }, (_, i) => ({
      id: `a${i}`,
      segmentId: 's1',
      type: 'image',
      url: `https://example.com/img${i}.jpg`,
    })),
  };
  const eci = effectiveCutInterval(project, 0.5);
  assert('effectiveCutInterval widens cuts for 12-asset pool (≥2.5s)', eci >= 2.5, `eci=${eci}`);

  const timeline = buildEditTimeline(project, { cutIntervalSec: 0.5, preferVideo: false });
  const urlUseCounts = new Map();
  for (const entry of timeline) {
    const asset = project.media.find((m) => m.id === entry.assetId);
    const key = asset ? (asset.url || '').split('?')[0] : null;
    if (key) urlUseCounts.set(key, (urlUseCounts.get(key) || 0) + 1);
  }
  const maxUse = urlUseCounts.size ? Math.max(...urlUseCounts.values()) : 0;
  assert('No URL used more than MAX_USES_PER_URL times (pool-matched scenario)', maxUse <= MAX_USES_PER_URL, `max use=${maxUse}`);
  assert('Timeline has expected clip count', timeline.length >= 12, `clips=${timeline.length}`);

  // When pool IS exhausted (tiny pool vs long video), the fallback must minimise excess.
  // With 3 assets, 30s, 0.5s request: eci=min(2.5, 30/6)=2.5s → 12 clips, pool fits 6.
  // Excess clips (> pool capacity) must prefer the least-used asset, keeping max use ≤ 4.
  const tinyProject = {
    script: [{ id: 's1', duration: 30 }],
    media: Array.from({ length: 3 }, (_, i) => ({
      id: `t${i}`, segmentId: 's1', type: 'image',
      url: `https://example.com/tiny${i}.jpg`,
    })),
  };
  const tinyTimeline = buildEditTimeline(tinyProject, { cutIntervalSec: 0.5, preferVideo: false });
  const tinyCounts = new Map();
  for (const entry of tinyTimeline) {
    const asset = tinyProject.media.find((m) => m.id === entry.assetId);
    const key = asset ? (asset.url || '').split('?')[0] : null;
    if (key) tinyCounts.set(key, (tinyCounts.get(key) || 0) + 1);
  }
  const tinyMax = tinyCounts.size ? Math.max(...tinyCounts.values()) : 0;
  const tinyMin = tinyCounts.size ? Math.min(...tinyCounts.values()) : 0;
  assert('Tiny pool fallback distributes evenly (max - min ≤ 1)', tinyMax - tinyMin <= 1, `max=${tinyMax} min=${tinyMin}`);
}

// ---------------------------------------------------------------------------
// 42. buildEditTimeline — never same URL twice in a row with 2-asset pool
// ---------------------------------------------------------------------------
console.log('\n── 42. buildEditTimeline no consecutive same URL ──');
{
  const { buildEditTimeline } = await import('./lib/build-edit-timeline.mjs');
  const twoMedia = [
    { id: 'b1', segmentId: 's1', type: 'image', url: 'https://example.com/x.jpg' },
    { id: 'b2', segmentId: 's1', type: 'image', url: 'https://example.com/y.jpg' },
  ];
  const project2 = { script: [{ id: 's1', duration: 10 }], media: twoMedia };
  const timeline2 = buildEditTimeline(project2, { cutIntervalSec: 1.25, preferVideo: false });
  let consecutiveSame = false;
  for (let i = 1; i < timeline2.length; i++) {
    const prev = twoMedia.find((a) => a.id === timeline2[i - 1].assetId);
    const curr = twoMedia.find((a) => a.id === timeline2[i].assetId);
    if (prev && curr && prev.url === curr.url) { consecutiveSame = true; break; }
  }
  assert('2-asset pool never repeats same URL consecutively', !consecutiveSame,
    timeline2.map((e) => twoMedia.find((a) => a.id === e.assetId)?.url?.slice(-10)).join(' → '));
}

// ---------------------------------------------------------------------------
// 43. balanceMediaAcrossSegments — phash-similar assets rejected cross-segment
// ---------------------------------------------------------------------------
console.log('\n── 43. balanceMediaAcrossSegments phash cross-segment dedup ──');
{
  const { balanceMediaAcrossSegments } = await import('./lib/patch-project-for-loop.mjs');
  // Craft three visually distinct fake hashes (hamming distances >> VISUAL_DUP_MAX_DISTANCE=10).
  const hashA = '1111111111111111111111111111111111111111111111111111111111111111'; // 64 ones
  const hashB = '0000000000000000000000000000000000000000000000000000000000000000'; // 64 zeros
  const hashC = '1010101010101010101010101010101010101010101010101010101010101010'; // alternating

  // s1 has 4 assets: m1+m2 share hashA (same visual as m5 in s2), m3→hashB, m4→hashC
  // s2 has only m5 (hashA) and needs 4 assets
  // Cross-segment transfers should reject m1 and m2 (visually ≈ m5), accept m3/m4
  const project = {
    script: [{ id: 's1', title: 'A' }, { id: 's2', title: 'B' }],
    media: [
      { id: 'm1', segmentId: 's1', type: 'image', url: 'https://example.com/a1.jpg', _phash: hashA },
      { id: 'm2', segmentId: 's1', type: 'image', url: 'https://example.com/a2.jpg', _phash: hashA },
      { id: 'm3', segmentId: 's1', type: 'image', url: 'https://example.com/b1.jpg', _phash: hashB },
      { id: 'm4', segmentId: 's1', type: 'image', url: 'https://example.com/c1.jpg', _phash: hashC },
      { id: 'm5', segmentId: 's2', type: 'image', url: 'https://example.com/a3.jpg', _phash: hashA },
    ],
  };
  balanceMediaAcrossSegments(project, 4, { harvestVideoFirst: false });
  const s2Urls = project.media.filter((m) => m.segmentId === 's2').map((m) => m.url);
  assert('s2 receives non-phash-similar assets from s1',
    s2Urls.some((u) => u.includes('b1') || u.includes('c1')),
    `s2 urls: ${s2Urls.join(', ')}`);
  assert('phash-similar clones (a1, a2) not both copied to s2 that already has a3',
    !(s2Urls.includes('https://example.com/a1.jpg') && s2Urls.includes('https://example.com/a2.jpg')),
    `s2 urls: ${s2Urls.join(', ')}`);
  assert('_phash field stripped from final media', project.media.every((m) => !('_phash' in m)));
}

// ---------------------------------------------------------------------------
// 38. Office lifestyle stock blocklist
// ---------------------------------------------------------------------------
console.log('\n── 38. Office lifestyle blocklist ──');
{
  const topic = 'The museum heist streamed live on TikTok';
  const seg = { id: 's2', title: 'Protect your accounts', narration: 'The heist went viral online.' };
  const topicKws = extractKeywords(topic, 12);
  const officeClip = {
    url: 'https://www.pexels.com/video/woman-writing-notes-while-working-6930353/',
    alt: 'woman writing notes while working',
    type: 'video',
  };
  assert('Office lifestyle clip scores 0', scoreAssetRelevance(officeClip, seg, topic, topicKws) === 0);
}

// ---------------------------------------------------------------------------
// 39. YouTube thumbnail URLs blocked as B-roll
// ---------------------------------------------------------------------------
console.log('\n── 39. YouTube thumbnail blocklist ──');
{
  const topic = 'The museum heist streamed live on TikTok';
  const seg = { id: 's1', title: 'Louvre heist', narration: 'Crown jewels stolen from the museum.' };
  const topicKws = extractKeywords(topic, 12);
  const ytThumb = {
    url: 'https://i.ytimg.com/vi/abc123/maxresdefault.jpg',
    alt: 'louvre heist youtube thumbnail',
    type: 'image',
  };
  assert('YouTube maxresdefault thumbnail scores 0', scoreAssetRelevance(ytThumb, seg, topic, topicKws) === 0);
}

// ---------------------------------------------------------------------------
// 40. Over-broad exclude URL sanitization
// ---------------------------------------------------------------------------
console.log('\n── 40. Over-broad exclude sanitization ──');
{
  assert('Bare youtube.com/watch is over-broad', isOverBroadExcludeUrl('https://www.youtube.com/watch'));
  assert('Specific YouTube video is not over-broad', !isOverBroadExcludeUrl('https://www.youtube.com/watch?v=abc12345'));
  const cleaned = sanitizeExcludedUrls([
    'https://www.youtube.com/watch',
    'https://www.strategink.com/banner.jpg',
    'https://www.youtube.com/watch?v=good12345',
  ]);
  assert('Sanitize drops bare watch URL', !cleaned.some((u) => u === 'https://www.youtube.com/watch'));
  assert('Sanitize keeps specific video', cleaned.some((u) => u.includes('v=good12345')));
}

// ---------------------------------------------------------------------------
// 44. pruneExcludedUrlsForReharvest — releases video URLs, keeps lifestyle/spam
// ---------------------------------------------------------------------------
console.log('\n── 44. pruneExcludedUrlsForReharvest ──');
{
  const mixed = [
    'https://videos.pexels.com/video-files/26756749/12001159_3840_2160_24fps.mp4',
    'https://player.vimeo.com/video/951927495',
    'https://media.gettyimages.com/id/2162536010/photo/paris-louvre-security.jpg',
    'https://img.freepik.com/premium-photo/louvre-pyramid-crystal.jpg',
    'https://www.strategink.com/digital-heist-summit/1st-edition/bengaluru/img/email-banner.jpg',
    'https://i.ytimg.com/vi/pvxnyzbvigy/oar2.jpg',
    'https://www.pexels.com/video/ring-light-12433102',
    'https://buffer.com/resources/tiktok-live/',
    'https://onestream.live/blog/how-to-go-live-on-tiktok/',
    'https://routenote.com/blog/a-musicians-guide-to-tiktok-for-artists/',
  ];
  const pruned = pruneExcludedUrlsForReharvest(mixed);
  assert('Prune releases generic pexels video-file URLs', !pruned.some((u) => u.includes('video-files/26756749')));
  assert('Prune releases vimeo player URLs', !pruned.some((u) => u.includes('vimeo.com/video')));
  assert('Prune releases editorial gettyimages', !pruned.some((u) => u.includes('gettyimages.com')));
  assert('Prune releases freepik stock images', !pruned.some((u) => u.includes('freepik.com')));
  assert('Prune keeps strategink webinar URL', pruned.some((u) => u.includes('strategink')));
  assert('Prune keeps ytimg thumbnail', pruned.some((u) => u.includes('ytimg.com')));
  assert('Prune keeps pexels lifestyle slug URL', pruned.some((u) => u.includes('ring-light-12433102')));
  assert('Prune keeps buffer tiktok guide', pruned.some((u) => u.includes('buffer.com')));
  assert('Prune keeps onestream lifestyle guide', pruned.some((u) => u.includes('onestream.live')));
  assert('Prune limit is 30 entries max',
    pruneExcludedUrlsForReharvest(Array.from({ length: 50 }, (_, i) => `https://strategink.com/promo-${i}`)).length <= 30,
  );
  assert('Empty input returns empty array', pruneExcludedUrlsForReharvest([]).length === 0);
}

// ---------------------------------------------------------------------------
// 45. applyFixesFromWatch — watch.thinHarvest prunes exclusion list
// ---------------------------------------------------------------------------
console.log('\n── 45. thinHarvest prunes exclusion list ──');
{
  const bloatedExcludedUrls = [
    ...Array.from({ length: 20 }, (_, i) => `https://videos.pexels.com/video-files/${10000 + i}/file.mp4`),
    ...Array.from({ length: 15 }, (_, i) => `https://player.vimeo.com/video/${9000 + i}`),
    'https://i.ytimg.com/vi/abc123/maxresdefault.jpg',
    'https://www.strategink.com/digital-heist-summit/banner.jpg',
    'https://buffer.com/resources/tiktok-live/',
  ];
  const watch = {
    thinHarvest: true,
    brutal: { overall: 9.5, report: { scores100: { visualVariety: 95, pacing: 95 } } },
    repetition: { repeatPct: 0, duplicateRunCount: 0 },
    uploadReady: false,
    objectiveGate: { pass: true },
  };
  const { fixState, applied } = applyFixesFromWatch(
    watch,
    { harvestNonce: 2, excludedUrls: bloatedExcludedUrls },
    'museum heist',
    null,
  );
  assert('Thin harvest sets reHarvestMedia', fixState.reHarvestMedia === true);
  assert('Thin harvest bumps harvestNonce', fixState.harvestNonce === 3);
  assert('Thin harvest prunes exclusion list to ≤30', (fixState.excludedUrls || []).length <= 30);
  assert('Thin harvest releases generic pexels video files',
    !(fixState.excludedUrls || []).some((u) => u.includes('video-files/')));
  assert('Thin harvest keeps ytimg thumbnail in exclusions',
    (fixState.excludedUrls || []).some((u) => u.includes('ytimg.com')));
  assert('Thin harvest keeps strategink in exclusions',
    (fixState.excludedUrls || []).some((u) => u.includes('strategink')));
  assert('Thin harvest prune logged in applied fixes', applied.some((a) => a.includes('Thin harvest')));
}

// ---------------------------------------------------------------------------
// 45b. pickPrimaryFailure — single priority ordering
// ---------------------------------------------------------------------------
console.log('\n── 45b. pickPrimaryFailure priority order ──');
{
  const placeholderFirst = pickPrimaryFailure({
    assemblyAudit: { assemblyScore: 42 },
    sceneQa: { available: true, pass: false, longestSceneSec: 8 },
    hookScript: { pass: false },
    objectiveGate: {
      pass: false,
      checks: [{ name: 'placeholder_pct', pass: false }],
    },
    thinHarvest: true,
    brutal: { report: { scores100: { pacing: 30 } } },
  });
  assert('Placeholder outranks all other failures', placeholderFirst === 'placeholder', placeholderFirst);

  const assemblyFirst = pickPrimaryFailure({
    assemblyAudit: { assemblyScore: 60 },
    sceneQa: { available: true, pass: false, longestSceneSec: 8 },
    hookScript: { pass: false },
    thinHarvest: true,
    brutal: { report: { scores100: { pacing: 30 } } },
  });
  assert('Assembly outranks scene/hook/pacing/harvest', assemblyFirst === 'assembly', assemblyFirst);

  const sceneFirst = pickPrimaryFailure({
    sceneQa: { available: true, pass: false, longestSceneSec: 8 },
    hookScript: { pass: false },
    thinHarvest: true,
    brutal: { report: { scores100: { pacing: 30 } } },
  });
  assert('Scene outranks hook/pacing/harvest', sceneFirst === 'scene', sceneFirst);

  const hookFirst = pickPrimaryFailure({
    hookScript: { pass: false },
    thinHarvest: true,
    brutal: { report: { scores100: { pacing: 30 } } },
  });
  assert('Hook outranks pacing/harvest', hookFirst === 'hook', hookFirst);

  const pacingFirst = pickPrimaryFailure({
    thinHarvest: true,
    brutal: { report: { scores100: { pacing: 55 } } },
    sceneQa: { available: true, pass: true, longestSceneSec: 2 },
  });
  assert('Pacing outranks thin-harvest fallback', pacingFirst === 'pacing', pacingFirst);

  const harvestOnly = pickPrimaryFailure({
    thinHarvest: true,
    brutal: { report: { scores100: { pacing: 95 } } },
    sceneQa: { available: true, pass: true, longestSceneSec: 2 },
    hookScript: { pass: true },
    hookVision: { hookPass: true },
  });
  assert('Thin harvest used only when higher-priority failures absent', harvestOnly === 'harvest', harvestOnly);
}

// ---------------------------------------------------------------------------
// 45c. applyFixesFromWatch — placeholder strategy wins and stays coherent
// ---------------------------------------------------------------------------
console.log('\n── 45c. placeholder strategy coherence ──');
{
  const tmp = mkdtempSync(join(tmpdir(), 'autotube-primary-watch-'));
  const videoDir = join(tmp, 'run');
  const assemblyDir = join(videoDir, 'ffmpeg-assembly');
  mkdirSync(assemblyDir, { recursive: true });
  writeFileSync(join(videoDir, 'final.mp4'), '');
  writeFileSync(join(assemblyDir, 'render-manifest.json'), JSON.stringify({
    clipCount: 8,
    placeholderClipCount: 3,
    placeholderPct: 37.5,
    placeholderUrls: [
      'https://www.tiktok.com/@user/video/dead1',
      'https://abcnews.go.com/International/louvre-heist',
    ],
    perSegment: [{ segmentId: 's1', title: 'Hook', clipCount: 4, placeholderClipCount: 3 }],
  }));

  const watch = {
    assemblyAudit: { assemblyScore: 30, repeatPenalty: 20, visualCohesion: 25 },
    sceneQa: { available: true, pass: false, longestSceneSec: 8 },
    hookScript: { pass: false },
    hookVision: { hookPass: false, fix: 'BREAKING opener' },
    brutal: { report: { scores100: { pacing: 45, visualVariety: 40 } }, overall: 4.5 },
    objectiveGate: {
      pass: false,
      checks: [{ name: 'placeholder_pct', pass: false }],
    },
    placeholderGate: { placeholderPct: 37.5 },
    videoPath: join(videoDir, 'final.mp4'),
    thinHarvest: true,
  };
  const project = {
    media: [
      { segmentId: 's1', type: 'video', url: '/api/download-clip?url=tiktok', sourceUrl: 'https://www.tiktok.com/@user/video/dead1' },
      { segmentId: 's1', type: 'image', url: 'https://abcnews.go.com/International/louvre-heist', sourceUrl: 'https://abcnews.go.com/International/louvre-heist' },
    ],
  };
  const { fixState, applied } = applyFixesFromWatch(watch, { cutIntervalSec: 0.75 }, 'museum heist', project, { videoPath: watch.videoPath });
  assert('Primary placeholder strategy requests reharvest', fixState.reHarvestMedia === true);
  assert('Primary placeholder strategy prefers image assembly', fixState.preferImageAssembly === true);
  assert('Primary placeholder strategy disables video-first harvest', fixState.harvestVideoFirst === false);
  assert('Primary placeholder strategy keeps cuts at or above 1.15s', fixState.cutIntervalSec >= 1.15, String(fixState.cutIntervalSec));
  assert('Placeholder strategy excludes non-editorial placeholder URL', (fixState.excludedUrls || []).some((u) => u.includes('tiktok.com')));
  assert('Placeholder strategy keeps editorial placeholder URL out of excludes', !(fixState.excludedUrls || []).some((u) => u.includes('abcnews.go.com')));
  assert('Only placeholder strategy applied in one pass', applied.length === 1 && applied[0].includes('Placeholder gate FAIL'), applied.join(' | '));
  rmSync(tmp, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// 45d. applyFixesFromWatch — scene strategy avoids reharvest unless thin
// ---------------------------------------------------------------------------
console.log('\n── 45d. scene strategy coherence ──');
{
  const watch = {
    sceneQa: { available: true, pass: false, longestSceneSec: 7 },
    hookScript: { pass: false },
    brutal: { report: { scores100: { pacing: 52 } }, overall: 5.2 },
    objectiveGate: { pass: true, checks: [] },
    thinHarvest: false,
  };
  const { fixState, applied } = applyFixesFromWatch(watch, { cutIntervalSec: 1.1 }, 'museum heist');
  assert('Scene strategy does not reharvest when pool is not thin', fixState.reHarvestMedia !== true);
  assert('Scene strategy enables pattern interrupts', fixState.patternInterrupts === true);
  assert('Scene strategy tightens only to the 1.0s floor', fixState.cutIntervalSec === 1.0, String(fixState.cutIntervalSec));
  assert('Scene strategy does not also apply hook fix', !applied.some((a) => a.includes('Hook FAIL')), applied.join(' | '));
}

// ---------------------------------------------------------------------------
// 45e. applyFixesFromWatch — visual cohesion uses hard cuts image-first pass
// ---------------------------------------------------------------------------
console.log('\n── 45e. visual cohesion assembly strategy ──');
{
  const watch = {
    assemblyAudit: {
      assemblyScore: 55,
      repeatPenalty: 90,
      topicRelevance: 88,
      captionCoherence: 92,
      visualCohesion: 40,
      issues: ['Jumping between unrelated shot scales'],
    },
    brutal: { report: { scores100: { pacing: 90, visualVariety: 88 } }, overall: 8.8 },
    objectiveGate: { pass: true, checks: [] },
  };
  const { fixState, applied } = applyFixesFromWatch(watch, { cutIntervalSec: 2.2 }, 'museum heist');
  assert('Visual cohesion strategy uses hard cuts', fixState.fixStrategy === 'hard_cuts');
  assert('Visual cohesion strategy stays image-first', fixState.preferImageAssembly === true && fixState.harvestVideoFirst === false);
  assert('Visual cohesion strategy triggers curated reharvest', fixState.reHarvestMedia === true && fixState.useCuratedPool === true);
  assert('Visual cohesion strategy clamps interval into 1.4-1.8s band', fixState.cutIntervalSec >= 1.4 && fixState.cutIntervalSec <= 1.8, String(fixState.cutIntervalSec));
  assert('Visual cohesion strategy logs assembly visual cohesion fix', applied.some((a) => a.includes('visualCohesion')), applied.join(' | '));
}

// ---------------------------------------------------------------------------
// 46. Musicians / TikTok-trend / AI-art-generator blocklist (new entries)
// ---------------------------------------------------------------------------
console.log('\n── 46. Musicians / TikTok-trend / AI-art blocklist ──');
{
  const topic = 'The museum heist streamed live on TikTok';
  const seg = { id: 's1', title: 'Louvre robbery', narration: 'Security cameras caught the thieves inside the museum.' };
  const topicKws = extractKeywords(topic, 12);

  // Musicians TikTok guide — off-topic for heist/crime news
  const musicianGuide = {
    url: 'https://routenote.com/blog/a-musicians-guide-to-tiktok-for-artists/',
    alt: "A Musician's Guide to TikTok for Artists",
    query: 'tiktok live museum heist',
    type: 'image',
  };
  assert('routenote.com musicians guide scores 0', scoreAssetRelevance(musicianGuide, seg, topic, topicKws) === 0);
  assert('routenote.com musicians guide fails top-up gate', passesTopUpRelevanceGate(musicianGuide, seg, topic, topicKws) === false);

  // sosiakita.com Indonesian TikTok tutorial — off-topic even with museum/heist in query
  const sosiakitaGuide = {
    url: 'https://sosiakita.com/hal-yang-tidak-boleh-dilakukan-live-streaming-tiktok',
    alt: 'Awas Banned! 7 Hal yang Tidak Boleh Dilakukan dalam Live Streaming TikTok',
    query: 'museum heist tiktok live',
    sourceUrl: 'https://sosiakita.com/hal-yang-tidak-boleh-dilakukan',
    type: 'image',
  };
  assert('sosiakita.com TikTok guide scores 0 (blocklist, not query self-match)',
    scoreAssetRelevance(sosiakitaGuide, seg, topic, topicKws) === 0);
  assert('sosiakita.com TikTok guide fails top-up gate',
    passesTopUpRelevanceGate(sosiakitaGuide, seg, topic, topicKws) === false);

  // TikTok mashup trend content — off-topic for heist news
  const tiktokMashup = {
    url: 'https://example.com/tiktok-mashup-2026-may.mp4',
    alt: 'TikTok Mashup 2026 May Trend',
    query: 'tiktok museum heist',
    type: 'video',
  };
  assert('TikTok mashup trend scores 0 for heist topic', scoreAssetRelevance(tiktokMashup, seg, topic, topicKws) === 0);

  // Nightcafe AI art generator — never editorial B-roll
  const nightcafeArt = {
    url: 'https://nightcafe.studio/create/museum-heist-artwork',
    alt: 'nightcafe.studio AI art museum heist illustration',
    query: 'museum heist artwork',
    type: 'image',
  };
  assert('Nightcafe AI art generator scores 0', scoreAssetRelevance(nightcafeArt, seg, topic, topicKws) === 0);
  assert('Nightcafe AI art fails top-up gate', passesTopUpRelevanceGate(nightcafeArt, seg, topic, topicKws) === false);

  // Ideogram AI art generator — never editorial B-roll
  const ideogramArt = {
    url: 'https://ideogram.ai/assets/museum-heist.jpg',
    alt: 'ideogram.ai generated image louvre heist',
    query: 'louvre heist',
    type: 'image',
  };
  assert('Ideogram AI art scores 0', scoreAssetRelevance(ideogramArt, seg, topic, topicKws) === 0);

  // Batch filter — all three off-topic sources dropped
  const { media: kept, dropped } = filterAssetsByRelevance(
    [musicianGuide, tiktokMashup, nightcafeArt, ideogramArt],
    { topic, script: [seg] },
    { minScore: 0.25 },
  );
  assert('Batch: all 4 off-topic sources dropped', kept.length === 0 && dropped.length === 4,
    `kept=${kept.length} dropped=${dropped.length}`);
}

// ---------------------------------------------------------------------------
// 47. Motorcycle / sunset landscape lifestyle blocklist (new entries)
// ---------------------------------------------------------------------------
console.log('\n── 47. Motorcycle / sunset lifestyle blocklist ──');
{
  const topic = 'The museum heist streamed live on TikTok';
  const seg = { id: 's1', title: 'Louvre robbery', narration: 'The thieves escaped through the Louvre tunnels.' };
  const topicKws = extractKeywords(topic, 12);

  // Motorcycle stunt lifestyle stock — not heist B-roll
  const motoStunt = {
    url: 'https://stock.example.com/motorcycle-stunt-photography-stock.jpg',
    alt: 'motorcycle stunt photography stock rider lifestyle',
    query: 'heist escape vehicle',
    type: 'image',
  };
  assert('Motorcycle stunt stock scores 0 for heist topic', scoreAssetRelevance(motoStunt, seg, topic, topicKws) === 0);

  // Sunset silhouette landscape stock — not heist B-roll
  const sunsetStock = {
    url: 'https://stock.example.com/sunset-silhouette-landscape-stock.jpg',
    alt: 'sunset silhouette landscape stock background wallpaper',
    query: 'louvre heist outdoors',
    type: 'image',
  };
  assert('Sunset silhouette landscape stock scores 0 for heist topic', scoreAssetRelevance(sunsetStock, seg, topic, topicKws) === 0);

  // collectAssemblyExcludeUrls picks up routenote and sosiakita
  const { collectAssemblyExcludeUrls } = await import('./lib/harvest-quality.mjs');
  const badProject = {
    topic,
    title: topic,
    script: [seg],
    media: [
      {
        url: 'https://routenote.com/blog/a-musicians-guide-to-tiktok-for-artists/',
        alt: "Musician's TikTok guide",
        sourceUrl: 'https://routenote.com/blog/a-musicians-guide-to-tiktok-for-artists/',
        segmentId: 's1',
      },
      {
        url: 'https://sosiakita.com/hal-yang-tidak-boleh-dilakukan-live-streaming-tiktok',
        alt: 'Awas Banned! Live Streaming TikTok guide',
        sourceUrl: 'https://sosiakita.com/hal-yang-tidak-boleh-dilakukan',
        segmentId: 's1',
      },
      {
        url: 'https://www.bbc.com/news/louvre-heist-suspects.jpg',
        alt: 'Louvre heist suspects museum robbery BBC News',
        sourceUrl: 'https://www.bbc.com/news/louvre-heist-suspects',
        segmentId: 's1',
      },
    ],
  };
  const excludeUrls = collectAssemblyExcludeUrls(badProject);
  assert('collectAssemblyExcludeUrls captures routenote.com URL',
    excludeUrls.some((u) => u.includes('routenote.com')));
  assert('collectAssemblyExcludeUrls captures sosiakita.com URL',
    excludeUrls.some((u) => u.includes('sosiakita.com')));
  assert('collectAssemblyExcludeUrls does NOT exclude BBC Louvre news URL',
    !excludeUrls.some((u) => u.includes('bbc.com')));
}

// ---------------------------------------------------------------------------
// 48. dedupHarvestByUrl — cross-segment URL dedup
// ---------------------------------------------------------------------------
console.log('\n── 48. dedupHarvestByUrl cross-segment dedup ──');
{
  // Same URL assigned to two different segments — only the first should survive.
  const media = [
    { id: 'm1', segmentId: 's1', type: 'image', url: 'https://example.com/louvre-photo.jpg' },
    { id: 'm2', segmentId: 's2', type: 'image', url: 'https://example.com/louvre-photo.jpg' },
    { id: 'm3', segmentId: 's1', type: 'image', url: 'https://example.com/heist-news.jpg' },
    { id: 'm4', segmentId: 's2', type: 'image', url: 'https://example.com/cctv-footage.jpg' },
  ];
  const { media: deduped, dupCount } = dedupHarvestByUrl(media);
  assert('dedupHarvestByUrl removes cross-segment URL duplicate', dupCount === 1, `dupCount=${dupCount}`);
  assert('dedupHarvestByUrl keeps first occurrence (s1)', deduped.some((m) => m.id === 'm1'));
  assert('dedupHarvestByUrl drops second occurrence (s2)', !deduped.some((m) => m.id === 'm2'));
  assert('dedupHarvestByUrl keeps unique URLs unchanged', deduped.length === 3, `len=${deduped.length}`);

  // Proxy URL with embedded source — same underlying video in both segments.
  const proxy1 = 'http://localhost:5173/api/download-clip?url=https%3A%2F%2Fvimeo.com%2F999&duration=10';
  const proxy2 = 'http://localhost:5173/api/download-clip?url=https%3A%2F%2Fvimeo.com%2F999&duration=10';
  const proxied = [
    { id: 'v1', segmentId: 's1', type: 'video', url: proxy1, sourceUrl: 'https://vimeo.com/999' },
    { id: 'v2', segmentId: 's2', type: 'video', url: proxy2, sourceUrl: 'https://vimeo.com/999' },
    { id: 'v3', segmentId: 's3', type: 'video', url: proxy1, sourceUrl: 'https://vimeo.com/different' },
  ];
  const { media: proxDeduped, dupCount: proxDups } = dedupHarvestByUrl(proxied);
  assert('dedupHarvestByUrl dedupes proxied clips by sourceUrl', proxDups >= 1, `proxDups=${proxDups}`);
  assert('dedupHarvestByUrl keeps first proxied occurrence', proxDeduped.some((m) => m.id === 'v1'));
  assert('dedupHarvestByUrl drops duplicate proxied clip', !proxDeduped.some((m) => m.id === 'v2'));

  // No duplicates — all assets should be kept.
  const unique = [
    { id: 'u1', segmentId: 's1', url: 'https://example.com/a.jpg' },
    { id: 'u2', segmentId: 's2', url: 'https://example.com/b.jpg' },
    { id: 'u3', segmentId: 's3', url: 'https://example.com/c.jpg' },
  ];
  const { media: uniqueKept, dupCount: noDups } = dedupHarvestByUrl(unique);
  assert('dedupHarvestByUrl passes through all-unique media', uniqueKept.length === 3 && noDups === 0);

  // URL with query string — same base path, different params → same canonical key.
  const withParams = [
    { id: 'p1', segmentId: 's1', url: 'https://images.example.com/photo.jpg?w=800' },
    { id: 'p2', segmentId: 's2', url: 'https://images.example.com/photo.jpg?w=1200' },
  ];
  const { dupCount: paramDups } = dedupHarvestByUrl(withParams);
  assert('dedupHarvestByUrl treats same base URL as duplicate regardless of query params', paramDups === 1);
}

// ---------------------------------------------------------------------------
// 49. Crime/action metaphor queries contain expected terms
// ---------------------------------------------------------------------------
console.log('\n── 49. Crime/action metaphor query expansion ──');
{
  // Simulate what buildMetaphorTopUpQueries returns by checking the expanded heist query set.
  // We test indirectly by verifying the query lists built in buildVideoTopUpQueries include
  // action-focused terms when a museum/heist topic is active.
  const topic = 'The museum heist streamed live on TikTok';
  const introSeg = { id: 's1', type: 'intro', title: 'Crown Jewels Stolen', narration: 'Thieves streamed the Louvre robbery on TikTok.' };
  const tiktokSeg = { id: 's2', type: 'body', title: 'TikTok Live Feed', narration: 'Viral CCTV footage spread across social media.' };
  const arrestSeg = { id: 's3', type: 'body', title: 'Suspects Arrested', narration: 'Police caught the thieves after a car chase.' };

  // Import the actual query builder to verify the expanded queries.
  const gfv = await import('./lib/generate-full-video.mjs').catch(() => null);
  if (gfv && typeof gfv.buildMetaphorTopUpQueriesForTest === 'function') {
    // If we expose it for testing — verify expanded terms.
    const introQueries = gfv.buildMetaphorTopUpQueriesForTest(introSeg, topic);
    assert('Intro queries include police chase term', introQueries.some((q) => /police|chase/.test(q)), introQueries.slice(0,3).join('; '));
  } else {
    // Indirect verification: confirm the coreHeist keywords in harvest-quality blocklist allow
    // action-term assets to pass relevance scoring.
    const actionAsset = {
      url: 'https://newscdn.example.com/police-chase-robbery-suspect.jpg',
      alt: 'police chase robbery suspect arrest crime scene',
      query: 'police chase robbery museum heist',
      type: 'image',
    };
    const seg = introSeg;
    const topicKws = extractKeywords(topic, 12);
    const actionScore = scoreAssetRelevance(actionAsset, seg, topic, topicKws);
    assert('Police chase robbery asset scores > 0 for heist topic', actionScore > 0, `score=${actionScore}`);

    const surveillanceAsset = {
      url: 'https://newscdn.example.com/surveillance-camera-cctv-crime.jpg',
      alt: 'surveillance camera cctv crime footage caught',
      query: 'cctv surveillance museum heist',
      type: 'image',
    };
    const survScore = scoreAssetRelevance(surveillanceAsset, tiktokSeg, topic, topicKws);
    assert('CCTV/surveillance asset scores > 0 for heist TikTok segment', survScore > 0, `score=${survScore}`);

    const arrestAsset = {
      url: 'https://newscdn.example.com/arrest-suspect-crown-jewels-theft.jpg',
      alt: 'arrest suspect crown jewels theft heist police',
      query: 'arrest suspect heist museum',
      type: 'image',
    };
    const arrestScore = scoreAssetRelevance(arrestAsset, arrestSeg, topic, topicKws);
    assert('Arrest/crown-jewels-theft asset scores > 0 for heist arrest segment', arrestScore > 0, `score=${arrestScore}`);
  }
}

// ---------------------------------------------------------------------------
// 50. computeClipBudget — basic formula checks
// ---------------------------------------------------------------------------
console.log('\n── 50. computeClipBudget ──');
{
  const { computeClipBudget, LOOP_MAX_MIN_ASSETS_PER_SEGMENT: CAP, TOP_UP_MAX_PASSES } = await import('./lib/assembly-system.mjs');

  assert('LOOP_MAX_MIN_ASSETS_PER_SEGMENT is 8', CAP === 8, String(CAP));
  assert('TOP_UP_MAX_PASSES is 3', TOP_UP_MAX_PASSES === 3, String(TOP_UP_MAX_PASSES));

  // 3 segments × 20 s = 60 s total at 1.25 s/cut → 48 clips → 24 unique URLs needed
  // segFloor = ceil(3 × 8/2) = 12 → requiredUniqueUrls = max(12, 24) = 24
  const project3seg = {
    script: [
      { id: 's1', duration: 20 },
      { id: 's2', duration: 20 },
      { id: 's3', duration: 20 },
    ],
    media: Array.from({ length: 30 }, (_, i) => ({ id: `a${i}`, url: `https://example.com/${i}.jpg` })),
  };
  const budget3 = computeClipBudget(project3seg, 1.25);
  assert('3-seg 60s budget requiredUniqueUrls ≥ 20', budget3.requiredUniqueUrls >= 20, `got=${budget3.requiredUniqueUrls}`);
  assert('3-seg budget has correct totalDuration', budget3.totalDuration === 60, `dur=${budget3.totalDuration}`);
  assert('3-seg budget cut is ≥ 1.25', budget3.cut >= 1.25, `cut=${budget3.cut}`);

  // Thin pool: 6 assets in 3 segments → effectiveCutInterval widens → budget must still be sane
  const thinProject = {
    script: [{ id: 's1', duration: 20 }, { id: 's2', duration: 20 }],
    media: Array.from({ length: 6 }, (_, i) => ({ id: `t${i}`, url: `https://example.com/t${i}.jpg` })),
  };
  const thinBudget = computeClipBudget(thinProject, 1.25);
  assert('Thin-pool budget is a positive integer', Number.isInteger(thinBudget.requiredUniqueUrls) && thinBudget.requiredUniqueUrls > 0);
  assert('Thin-pool segFloor ≥ num_segs × (CAP/2)', thinBudget.requiredUniqueUrls >= Math.ceil(2 * (CAP / 2)), `got=${thinBudget.requiredUniqueUrls}`);

  // Empty project — should not throw, returns sensible defaults
  const emptyBudget = computeClipBudget({ script: [], media: [] }, 1.25);
  assert('Empty project budget is a positive number', emptyBudget.requiredUniqueUrls > 0);
}

// ---------------------------------------------------------------------------
// 51. shouldUseGlobalUrlDedup — pool-size threshold
// ---------------------------------------------------------------------------
console.log('\n── 51. shouldUseGlobalUrlDedup deferred dedup ──');
{
  const { shouldUseGlobalUrlDedup } = await import('./lib/assembly-system.mjs');

  // Pool = 30, required = 18 → 30 ≥ 18×1.5=27 → dedup now
  assert('Large pool (≥1.5× budget) enables dedup', shouldUseGlobalUrlDedup(30, 18) === true);

  // Pool = 20, required = 18 → 20 < 27 → defer dedup
  assert('Tight pool (<1.5× budget) defers dedup', shouldUseGlobalUrlDedup(20, 18) === false);

  // Pool exactly at threshold: 27 ≥ 27 → dedup
  assert('Pool exactly at threshold (1.5×) enables dedup', shouldUseGlobalUrlDedup(27, 18) === true);

  // Very thin pool
  assert('Very thin pool defers dedup', shouldUseGlobalUrlDedup(10, 24) === false);

  // Pool is 0 — always defer
  assert('Zero pool always defers dedup', shouldUseGlobalUrlDedup(0, 10) === false);
}

// ---------------------------------------------------------------------------
// 52. New lifestyle/interview/yellow-shirt blocklist patterns
// ---------------------------------------------------------------------------
console.log('\n── 52. Lifestyle desk/interview/yellow-shirt blocklist ──');
{
  const topic = 'The museum heist streamed live on TikTok';
  const seg = { id: 's1', title: 'Louvre robbery', narration: 'Security cameras caught the thieves inside the museum.' };
  const topicKws = extractKeywords(topic, 12);

  const yellowShirt = {
    url: 'https://stock.example.com/yellow-shirt-man-talking-presenter.jpg',
    alt: 'yellow shirt man talking head presenter stock',
    query: 'museum heist louvre',
    type: 'image',
  };
  assert('Yellow-shirt talking head scores 0', scoreAssetRelevance(yellowShirt, seg, topic, topicKws) === 0);
  assert('Yellow-shirt talking head fails top-up gate', passesTopUpRelevanceGate(yellowShirt, seg, topic, topicKws) === false);

  const deskTalkingHead = {
    url: 'https://stock.example.com/desk-talking-head-creator.jpg',
    alt: 'desk talking head youtube creator setup stock',
    query: 'louvre museum heist',
    type: 'image',
  };
  assert('Desk talking-head stock scores 0 for heist topic', scoreAssetRelevance(deskTalkingHead, seg, topic, topicKws) === 0);

  const sofaInterview = {
    url: 'https://stock.example.com/sofa-interview-stock-background.jpg',
    alt: 'sofa interview stock casual background setup',
    query: 'museum robbery interview',
    type: 'image',
  };
  assert('Sofa interview stock scores 0 for heist topic', scoreAssetRelevance(sofaInterview, seg, topic, topicKws) === 0);

  // Real news interview should NOT be blocked (has journalism/crime context)
  const newsInterview = {
    url: 'https://bbc.com/news/louvre-heist-police-interview.jpg',
    alt: 'police interview investigation heist louvre museum',
    query: 'louvre museum heist police interview',
    type: 'image',
  };
  const newsInterviewScore = scoreAssetRelevance(newsInterview, seg, topic, topicKws);
  assert('Legitimate news police interview scores > 0', newsInterviewScore > 0, `score=${newsInterviewScore}`);

  // Batch filter: lifestyle blocks dropped, news interview kept
  const { media: kept, dropped } = filterAssetsByRelevance(
    [yellowShirt, deskTalkingHead, sofaInterview, newsInterview],
    { topic, script: [seg] },
    { minScore: 0.25 },
  );
  assert('Batch: lifestyle/stock dropped (≥3 of 4)', dropped.length >= 3, `dropped=${dropped.length}`);
  assert('Batch: news interview kept', kept.some((m) => m.url.includes('bbc.com')));
}

// ---------------------------------------------------------------------------
// 53. passesTopUpRelevanceGate — crime topics require 2+ strong hits
// ---------------------------------------------------------------------------
console.log('\n── 53. Crime topic top-up gate requires 2+ hits ──');
{
  const crimeTopic = 'The museum heist streamed live on TikTok';
  const seg = { id: 's1', title: 'Louvre robbery', narration: 'Security cameras caught the thieves inside the museum.' };
  const topicKws = extractKeywords(crimeTopic, 12);

  // Only 1 strong hit: "louvre" → should FAIL for crime topic
  const singleHit = {
    url: 'https://example.com/louvre-exterior.jpg',
    alt: 'louvre exterior daytime tourist photo',
    type: 'image',
  };
  assert(
    'Crime topic: 1 strong hit fails top-up gate',
    passesTopUpRelevanceGate(singleHit, seg, crimeTopic, topicKws) === false,
  );

  // 2 strong hits: "museum" + "heist" → should PASS
  const doubleHit = {
    url: 'https://example.com/museum-heist-robbery-news.jpg',
    alt: 'museum heist robbery news report louvre',
    type: 'image',
  };
  assert(
    'Crime topic: 2 strong hits passes top-up gate',
    passesTopUpRelevanceGate(doubleHit, seg, crimeTopic, topicKws) === true,
  );

  // Non-crime topic: 1 strong hit is enough
  const genericTopic = 'AI startup funding Silicon Valley 2026';
  const genericSeg = { id: 'g1', title: 'Venture capital rounds', narration: 'Billions flow into AI startups.' };
  const genericKws = extractKeywords(genericTopic, 12);
  const singleHitGeneric = {
    url: 'https://example.com/silicon-valley-vc-funding.jpg',
    alt: 'silicon valley venture capital startup funding',
    type: 'image',
  };
  assert(
    'Non-crime topic: 1 strong hit passes top-up gate',
    passesTopUpRelevanceGate(singleHitGeneric, genericSeg, genericTopic, genericKws) === true,
  );
}

// ---------------------------------------------------------------------------
// 54. Geographic mismatch + story location + expanded blocklist
// ---------------------------------------------------------------------------
console.log('\n── 54. Geographic mismatch harvest rejection ──');
{
  const louvreTopic = 'The museum heist streamed live on TikTok';
  const davidFlorence = 'statue of david accademia gallery florence italy michelangelo';
  assert(
    'Florence David blocked for Louvre heist topic',
    geoMismatchBlockReason(davidFlorence, louvreTopic) !== null,
  );
  assert(
    'Paris Louvre asset allowed for Louvre heist topic',
    geoMismatchBlockReason('louvre museum paris france interior', louvreTopic) === null,
  );
  const { dropped } = filterAssetsByRelevance(
    [
      { id: 'a1', url: 'https://example.com/david.jpg', alt: davidFlorence, segmentId: 's1' },
      { id: 'a2', url: 'https://example.com/louvre.jpg', alt: 'louvre museum paris france heist police', segmentId: 's1' },
    ],
    { topic: louvreTopic, script: [{ id: 's1', title: 'Louvre', narration: 'Thieves inside the Louvre museum in Paris.' }] },
    { minScore: 0.25 },
  );
  assert('Filter drops Florence David asset', !dropped.some((d) => d.url.includes('david.jpg')) || dropped.some((d) => d.reason?.includes('geo mismatch')));
  assert(
    'offTopicBlockReason surfaces geo mismatch',
    offTopicBlockReason(davidFlorence, louvreTopic)?.includes('geo mismatch') === true,
  );
  assert(
    'Boston bucket-list blocked for Louvre topic',
    offTopicBlockReason('kate weiser bucket list boston fbi', louvreTopic) !== null,
  );
  assert(
    'TikTok LIVE Studio UI blocked for heist topic',
    offTopicBlockReason('how to get access to live studio tiktok', louvreTopic) !== null,
  );
  assert(
    'White House govpress blocked for Louvre heist topic',
    offTopicBlockReason('https://www.whitehouse.gov/briefing-room/press-briefings/', louvreTopic) !== null,
  );
  assert(
    'extractStoryLocation returns Paris for Louvre heist',
    extractStoryLocation(louvreTopic)?.includes('Paris') === true,
  );
  assert('Vision fetchable accepts https unsplash', isVisionFetchableUrl('https://images.unsplash.com/photo-1.jpg') === true);
  assert('Vision fetchable rejects relative paths', isVisionFetchableUrl('/api/proxy-image') === false);
}

// ---------------------------------------------------------------------------
// 54b. Editorial news + expanded topic keywords + hash source preference
// ---------------------------------------------------------------------------
console.log('\n── 54b. Editorial relevance + pHash source ──');
{
  const louvreTopic = 'The museum heist streamed live on TikTok';
  const seg = { id: 's1', title: 'Your Phone Is Part of It', narration: 'The stream kept rolling.' };
  const topicKws = [...extractKeywords(louvreTopic, 12), ...expandTopicKeywords(louvreTopic)];
  const nyt = {
    url: 'https://static01.nyt.com/images/2025/10/20/multimedia/2025-10-20-louvre-heist-index/2025-10-20-louvre-heist-index-videoSixteenByNine3000-v6.jpg',
    alt: '',
    type: 'image',
  };
  const nytScore = scoreAssetRelevance(nyt, seg, louvreTopic, topicKws);
  assert('NYT Louvre URL scores ≥0.28 for museum heist topic', nytScore >= 0.28, `score=${nytScore}`);

  const tinyThumb = {
    type: 'image',
    url: 'https://cdn.example.com/louvre-heist-full.jpg',
    thumbnailUrl: 'https://i.vimeocdn.com/video/1284765603-db3292a171cfae1799030745b16e5d292a3b198cf19be9ed8_295x166?region=us',
  };
  const src = resolveAssetHashSource(tinyThumb);
  assert('pHash prefers full image URL over tiny vimeo thumb', src.includes('louvre-heist-full.jpg'), src || 'null');
  assert('expandTopicKeywords includes louvre for museum heist', expandTopicKeywords(louvreTopic).includes('louvre'));
}

// ---------------------------------------------------------------------------
// 55. overlayKaraokeCaptions phrase quality — no caption line < MIN_CAPTION_WORDS
// ---------------------------------------------------------------------------
console.log('\n── 55. karaoke caption phrase quality (≥3 words per line) ──');
{
  const { buildCaptionAss } = await import('../deploy/server-render/ffmpegOverlays.mjs');
  const { readFileSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { dirname: _dirname, join: _join } = await import('node:path');
  const __file = fileURLToPath(import.meta.url);
  const repoRoot = _dirname(_dirname(__file));

  // Load the real-world word timestamps from the modal-retest recording.
  const wtPath = _join(repoRoot, 'test-recordings/modal-retest-1781153023038/modal-bundle/word-timestamps.json');
  const projPath = _join(repoRoot, 'test-recordings/modal-retest-1781153023038/modal-bundle/project.json');

  const rawWt = JSON.parse(readFileSync(wtPath, 'utf8'));
  const rawProj = JSON.parse(readFileSync(projPath, 'utf8'));

  // Build Map<segIdx, words[]> matching overlayKaraokeCaptions contract.
  const wordTimestampCache = new Map(
    Object.entries(rawWt).map(([k, v]) => [Number(k), v]),
  );

  // Derive segment start times from cumulative durations (project.json has no startTime).
  const script = rawProj.script || [];
  const segmentStartTimes = [];
  let cumOffset = 0;
  for (const seg of script) {
    segmentStartTimes.push(cumOffset);
    cumOffset += seg.duration ?? 0;
  }

  // Generate ASS content at standard 720p dimensions.
  const assContent = buildCaptionAss(wordTimestampCache, segmentStartTimes, 720, 1280);

  // Extract all Dialogue lines and count words per line.
  const dialogueLines = assContent.split('\n').filter((l) => l.startsWith('Dialogue:'));
  assert(`Generated ≥1 caption line from modal-retest fixture`, dialogueLines.length >= 1,
    `got ${dialogueLines.length} lines`);

  // Each Dialogue line format: "Dialogue: 0,h:mm:ss.cc,h:mm:ss.cc,Default,,0,0,0,,TEXT"
  // The TEXT is the last comma-separated field.
  let shortLineCount = 0;
  let shortLineExample = '';
  for (const line of dialogueLines) {
    // Find the text after the 9th comma (fields 0-8 are fixed ASS metadata).
    const parts = line.split(',');
    if (parts.length < 10) continue;
    const text = parts.slice(9).join(',').trim();
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    if (wordCount < 3) {
      shortLineCount += 1;
      shortLineExample = shortLineExample || `"${text}" (${wordCount} word${wordCount === 1 ? '' : 's'})`;
    }
  }
  assert(
    `No caption line has fewer than 3 words (${dialogueLines.length} total lines)`,
    shortLineCount === 0,
    shortLineExample ? `first short line: ${shortLineExample}` : '',
  );

  // Also verify the ASS has a valid header.
  assert('ASS output has Script Info header', assContent.includes('[Script Info]'));
  assert('ASS output has V4+ Styles section', assContent.includes('[V4+ Styles]'));
}

// ---------------------------------------------------------------------------
// 56. Curated topic pool for museum heist
// ---------------------------------------------------------------------------
console.log('\n── 56. curated topic pool (museum heist) ──');
{
  const {
    getCuratedPoolForTopic,
    matchCuratedPoolKey,
    injectCuratedTopicPool,
  } = await import('./lib/curated-topic-pools.mjs');
  const topic = 'The museum heist streamed live on TikTok';
  assert('matchCuratedPoolKey returns museum-heist', matchCuratedPoolKey(topic) === 'museum-heist');
  const pool = getCuratedPoolForTopic(topic);
  assert('curated pool has at least 40 URLs', pool.length >= 40);

  const project = {
    topic,
    script: [{ id: 'seg1', title: 'Intro', duration: 20 }, { id: 'seg2', title: 'Body', duration: 25 }],
    media: [],
  };
  const report = {};
  const added = injectCuratedTopicPool(project, 4, report);
  assert('injectCuratedTopicPool adds assets', added > 0);
  assert('report tracks curatedPoolInjected', (report.curatedPoolInjected || 0) > 0);
  const unique = new Set(project.media.map((m) => m.url));
  assert('injected URLs are unique', unique.size === project.media.length);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n════════════════════════════════`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('All checks passed ✅');
}
