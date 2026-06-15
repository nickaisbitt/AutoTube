/**
 * Topic-keyed curated B-roll pools for thin-harvest rescue.
 * Injected when live search cannot satisfy computeClipBudget().
 */
import { expandTopicKeywords, extractStoryLocation } from './harvest-quality.mjs';
import { normalizeUrlKey } from './harvest-loop-context.mjs';

/** Louvre / museum heist / Paris crime editorial stills (Wikimedia + Unsplash). */
export const CURATED_MUSEUM_HEIST_IMAGES = [
  { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Louvre_Museum_Wikimedia_Commons.jpg/1280px-Louvre_Museum_Wikimedia_Commons.jpg', alt: 'Louvre Museum exterior Paris' },
  { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/Louvre_Museum_Wikimedia_Commons_2.jpg/1280px-Louvre_Museum_Wikimedia_Commons_2.jpg', alt: 'Louvre courtyard and pyramid' },
  { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1e/Louvre_Courtyard%2C_Looking_West.jpg/1280px-Louvre_Courtyard%2C_Looking_West.jpg', alt: 'Louvre courtyard looking west' },
  { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a3/Louvre_Museum_at_night.jpg/1280px-Louvre_Museum_at_night.jpg', alt: 'Louvre Museum at night' },
  { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/Louvre_Cour_Napoleon_Pyramid.jpg/1280px-Louvre_Cour_Napoleon_Pyramid.jpg', alt: 'Louvre pyramid Cour Napoleon' },
  { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/53/Louvre_Museum_Paris_France.jpg/1280px-Louvre_Museum_Paris_France.jpg', alt: 'Louvre Museum Paris France' },
  { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/The_Louvre_-_Pyramid.jpg/1280px-The_Louvre_-_Pyramid.jpg', alt: 'Louvre glass pyramid' },
  { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/Louvre_interior.jpg/1280px-Louvre_interior.jpg', alt: 'Louvre museum interior gallery' },
  { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/85/Louvre_Museum%2C_Paris_-_panoramio.jpg/1280px-Louvre_Museum%2C_Paris_-_panoramio.jpg', alt: 'Louvre Museum panoramic view' },
  { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e1/Paris_-_Louvre_-_Cour_Napol%C3%A9on.jpg/1280px-Paris_-_Louvre_-_Cour_Napol%C3%A9on.jpg', alt: 'Paris Louvre Cour Napoleon' },
  { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/Crown_Jewels_of_the_United_Kingdom_%28cropped%29.jpg/1280px-Crown_Jewels_of_the_United_Kingdom_%28cropped%29.jpg', alt: 'Crown jewels display' },
  { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1f/Imperial_State_Crown_2.jpg/1280px-Imperial_State_Crown_2.jpg', alt: 'Imperial State Crown jewels' },
  { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/Koh-i-Noor_new_diamond.jpg/1280px-Koh-i-Noor_new_diamond.jpg', alt: 'Koh-i-Noor diamond jewel' },
  { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Diamond_necklace.jpg/1280px-Diamond_necklace.jpg', alt: 'Diamond necklace jewelry' },
  { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Crime_scene.jpg/1280px-Crime_scene.jpg', alt: 'Police crime scene investigation' },
  { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/50/Police_tape.jpg/1280px-Police_tape.jpg', alt: 'Police crime scene tape' },
  { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2d/Handcuffs.jpg/1280px-Handcuffs.jpg', alt: 'Police handcuffs arrest' },
  { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Security_camera_1.jpg/1280px-Security_camera_1.jpg', alt: 'CCTV security surveillance camera' },
  { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/85/CCTV_camera.jpg/1280px-CCTV_camera.jpg', alt: 'Security CCTV camera' },
  { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/Paris_Night.jpg/1280px-Paris_Night.jpg', alt: 'Paris city night skyline' },
  { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a8/Eiffel_Tower_from_the_Tour_Montparnasse_3%2C_Paris_May_2010.jpg/1280px-Eiffel_Tower_from_the_Tour_Montparnasse_3%2C_Paris_May_2010.jpg', alt: 'Paris Eiffel Tower skyline' },
  { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Paris_-_Boulevard_des_Capucines.jpg/1280px-Paris_-_Boulevard_des_Capucines.jpg', alt: 'Paris boulevard street scene' },
  { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/Gendarmerie_nationale_-_Renault_Sc%C3%A9nic_2017.jpg/1280px-Gendarmerie_nationale_-_Renault_Sc%C3%A9nic_2017.jpg', alt: 'French police gendarmerie vehicle' },
  { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6e/Police_car_in_Paris.jpg/1280px-Police_car_in_Paris.jpg', alt: 'Police car in Paris' },
  { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Museum_security_guard.jpg/1280px-Museum_security_guard.jpg', alt: 'Museum security guard patrol' },
  { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7d/Art_gallery_interior.jpg/1280px-Art_gallery_interior.jpg', alt: 'Art gallery museum interior' },
  { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/Mona_Lisa%2C_by_Leonardo_da_Vinci%2C_from_C2RMF_retouched.jpg/800px-Mona_Lisa%2C_by_Leonardo_da_Vinci%2C_from_C2RMF_retouched.jpg', alt: 'Mona Lisa Louvre painting' },
  { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/Mona_Lisa%2C_by_Leonardo_da_Vinci%2C_from_C2RMF_natural_colors.jpg/800px-Mona_Lisa%2C_by_Leonardo_da_Vinci%2C_from_C2RMF_natural_colors.jpg', alt: 'Mona Lisa painting Louvre' },
  { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/News_reporter_with_microphone.jpg/1280px-News_reporter_with_microphone.jpg', alt: 'News reporter breaking story' },
  { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/80/Television_studio.jpg/1280px-Television_studio.jpg', alt: 'Television news studio broadcast' },
  { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/19/Smartphone_filming.jpg/1280px-Smartphone_filming.jpg', alt: 'Smartphone recording live video' },
  { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2c/TikTok_logo.svg/1280px-TikTok_logo.svg.png', alt: 'TikTok social media logo' },
  { url: 'https://images.unsplash.com/photo-1520523839897-bd0b52f945a0?auto=format&w=1920&q=85', alt: 'Police crime scene investigation tape' },
  { url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&w=1920&q=85', alt: 'Security CCTV camera surveillance' },
  { url: 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?auto=format&w=1920&q=85', alt: 'Museum gallery interior art display' },
  { url: 'https://images.unsplash.com/photo-1541961017774-22349e4a1262?auto=format&w=1920&q=85', alt: 'Crown jewels diamond necklace display' },
  { url: 'https://images.unsplash.com/photo-1478436127893-760e23ad320b?auto=format&w=1920&q=85', alt: 'News reporter breaking story television' },
  { url: 'https://images.unsplash.com/photo-1507676184212-d03b07a089aa?auto=format&w=1920&q=85', alt: 'Police officers crowd control' },
  { url: 'https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?auto=format&w=1920&q=85', alt: 'Detective evidence investigation' },
  { url: 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&w=1920&q=85', alt: 'Newsroom television broadcast studio' },
  { url: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?auto=format&w=1920&q=85', alt: 'Museum security guard patrol' },
  { url: 'https://images.unsplash.com/photo-1590856029826-c0a73b2d2c42?auto=format&w=1920&q=85', alt: 'Handcuffs arrest police custody' },
  { url: 'https://images.unsplash.com/photo-1580674285054-bed3e397b7f6?auto=format&w=1920&q=85', alt: 'Jewelry store display case glass' },
  { url: 'https://images.unsplash.com/photo-1521791136064-7986c2920216?auto=format&w=1920&q=85', alt: 'Hand holding smartphone recording video' },
  { url: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&w=1920&q=85', alt: 'Digital technology network global' },
  { url: 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&w=1920&q=85', alt: 'Crowd of people gathering event' },
  { url: 'https://globalnews.ca/wp-content/uploads/2025/10/CP175199254.jpg?quality=85&strip=all', alt: 'Louvre heist Paris police investigation' },
  { url: 'https://a57.foxnews.com/static.foxnews.com/foxnews.com/content/uploads/2025/10/1200/675/louvre-museum-heist.jpg', alt: 'Louvre museum heist crime scene' },
  { url: 'https://a57.foxnews.com/static.foxnews.com/foxnews.com/content/uploads/2025/10/1200/675/louvre-ladder.jpg', alt: 'Louvre heist ladder entry point' },
  { url: 'https://cloudfront-us-east-2.images.arcpublishing.com/reuters/b7jxdt7djfihzml6uq6jqjgj6a.jpg', alt: 'Reuters Louvre Paris crime scene' },
];

const POOL_BY_KEY = {
  'museum-heist': CURATED_MUSEUM_HEIST_IMAGES,
};

/**
 * Resolve curated pool key from topic text.
 * @param {string} topic
 * @returns {string|null}
 */
export function matchCuratedPoolKey(topic = '') {
  const t = topic.toLowerCase();
  const kws = expandTopicKeywords(topic);
  const loc = (extractStoryLocation(topic) || '').toLowerCase();

  if (
    /museum|louvre|heist|robbery|jewel|crown|stolen|theft|tiktok.*live|live.*tiktok/.test(t)
    || kws.some((k) => ['louvre', 'museum', 'heist', 'robbery', 'jewels', 'paris'].includes(k))
    || /paris|louvre|france/.test(loc)
  ) {
    return 'museum-heist';
  }
  return null;
}

/**
 * @param {string} topic
 * @returns {{ url: string, alt: string }[]}
 */
export function getCuratedPoolForTopic(topic = '') {
  const key = matchCuratedPoolKey(topic);
  return key ? (POOL_BY_KEY[key] || []) : [];
}

/**
 * Inject curated editorial pool into project media (global URL dedup).
 * @param {object} project
 * @param {number} minPerSegment
 * @param {object} report
 * @returns {number} assets added
 */
export function injectCuratedTopicPool(project, minPerSegment, report) {
  const topic = project.topic || project.title || '';
  const pool = getCuratedPoolForTopic(topic);
  if (!pool.length) return 0;

  const used = new Set(
    (project.media || []).map((a) => normalizeUrlKey(a.url, a.sourceUrl)).filter(Boolean),
  );
  let added = 0;
  const segments = project.script || [];
  if (!segments.length) return 0;

  // Round-robin: spread every curated still across segments for montage diversity.
  let poolIdx = 0;
  const pending = pool.filter((item) => {
    const key = normalizeUrlKey(item.url);
    return key && !used.has(key);
  });

  while (poolIdx < pending.length) {
    const seg = segments[poolIdx % segments.length];
    const item = pending[poolIdx];
    poolIdx += 1;
    const key = normalizeUrlKey(item.url);
    if (!key || used.has(key)) continue;
    used.add(key);
    project.media.push({
      id: `curated-${poolIdx}-${seg.id.slice(0, 8)}`,
      segmentId: seg.id,
      type: 'image',
      url: item.url,
      thumbnailUrl: item.url,
      alt: item.alt,
      source: 'curated-topic-pool',
      query: topic,
    });
    added += 1;
  }

  // Ensure each segment meets minPerSegment with any remaining unused pool items.
  for (const seg of segments) {
    let count = new Set(
      (project.media || [])
        .filter((m) => m.segmentId === seg.id)
        .map((a) => normalizeUrlKey(a.url, a.sourceUrl))
        .filter(Boolean),
    ).size;
    for (const item of pool) {
      if (count >= minPerSegment) break;
      const key = normalizeUrlKey(item.url);
      if (!key || used.has(key)) continue;
      used.add(key);
      project.media.push({
        id: `curated-fill-${count}-${seg.id.slice(0, 8)}`,
        segmentId: seg.id,
        type: 'image',
        url: item.url,
        thumbnailUrl: item.url,
        alt: item.alt,
        source: 'curated-topic-pool',
        query: topic,
      });
      count += 1;
      added += 1;
    }
  }

  if (added) report.curatedPoolInjected = added;
  return added;
}
