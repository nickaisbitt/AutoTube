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
  passesTopUpRelevanceGate,
} from './lib/harvest-quality.mjs';
import { applyFixesFromWatch } from './lib/apply-watch-fixes.mjs';
import {
  harvestContextFromFixState,
  harvestSessionStoragePayload,
  normalizeUrlKey,
} from './lib/harvest-loop-context.mjs';

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
    brutal: { report: { scores: { visualVariety: 5, pacing: 7 } }, overall: 6 },
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
    brutal: { overall: 7.5, report: { scores: { visualVariety: 7, pacing: 7 } } },
    objectiveGate: { available: true, pass: true, checks: [] },
    hookScript: { pass: true },
    hookVision: { hookPass: true },
  };
  const { applied: below91 } = applyFixesFromWatch(watch, { renderTier: 'full' }, 'topic', null, { untilScore: 9.1 });
  assert('Below 9.1 triggers reharvest fix', below91.some((a) => a.includes('below 9.1')));

  const { applied: below7 } = applyFixesFromWatch(watch, { renderTier: 'full' }, 'topic', null, { untilScore: 7 });
  assert('At 7.5 with untilScore=7 does not trigger below-target fix', !below7.some((a) => a.includes('below 7')));
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
