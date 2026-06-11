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
} from './lib/harvest-quality.mjs';
import { applyFixesFromWatch } from './lib/apply-watch-fixes.mjs';
import { loadFixState } from './lib/loop-state.mjs';
import { buildShockHookLine } from '../e2e/openRouterMock.mjs';
import { buildShortHookOverlay, isBadKineticOverlay } from './lib/patch-project-for-loop.mjs';
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
  harvestContextFromFixState,
  harvestSessionStoragePayload,
  normalizeUrlKey,
  isOverBroadExcludeUrl,
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
    brutal: { report: { scores100: { visualVariety: 50, pacing: 70 } }, overall: 6 },
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
    brutal: { report: { scores: { visualVariety: 8, pacing: 8 } }, overall: 7 },
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
}

// ---------------------------------------------------------------------------
// 12c. normalizeUrlKey — embedded source URL, skip bare proxy
// ---------------------------------------------------------------------------
console.log('\n── 12c. normalizeUrlKey ──');
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
    brutal: { overall: 7.5, report: { scores100: { visualVariety: 70, pacing: 70 } } },
    objectiveGate: { available: true, pass: true, checks: [] },
    hookScript: { pass: true },
    hookVision: { hookPass: true },
  };
  const { applied: below91 } = applyFixesFromWatch(watch, { renderTier: 'full' }, 'topic', null, { untilScore: 91 });
  assert('Below 91 triggers reharvest fix', below91.some((a) => a.includes('below 91')));

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
  assert('Pacing plateau logs skip reharvest', applied.some((a) => a.includes('pacing plateau')));
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
  assert('loadFixState caps minAssets at 6', loaded.minAssetsPerSegment === LOOP_MAX_MIN_ASSETS_PER_SEGMENT);
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
  assert('Assembly fail logs URL exclusion', applied.some((a) => a.includes('exclude')));
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
  // effectiveCutInterval: targetClips=120, maxClipsFromPool=12*2=24 → widen to min(2.5, 60/24)=2.5s
  // Resulting clips: 60/2.5 = 24 = 12*2 → each URL used exactly twice, at the cap.
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
  assert('effectiveCutInterval widens to 2.5s for 12-asset pool', eci === 2.5, `eci=${eci}`);

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
    brutal: { overall: 5, report: { scores: { visualVariety: 5, pacing: 5 } } },
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
// Summary
// ---------------------------------------------------------------------------
console.log(`\n════════════════════════════════`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('All checks passed ✅');
}
