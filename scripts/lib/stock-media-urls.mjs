/**
 * Real stock image URLs for fixtures / volume top-up (not picsum).
 * Keep pool large enough that 3 segments × 6 assets don't force heavy reuse.
 */
import { curatedPacksEnabled } from './eval-flags.mjs';

export const STOCK_HEALTHCARE_IMAGES = [
  {
    url: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&w=1920&q=85',
    alt: 'Doctor with tablet in hospital',
  },
  {
    url: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&w=1920&q=85',
    alt: 'Cybersecurity and technology',
  },
  {
    url: 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&w=1920&q=85',
    alt: 'Medical research laboratory',
  },
  {
    url: 'https://images.unsplash.com/photo-1505751172876-fa1923c5c528?auto=format&w=1920&q=85',
    alt: 'Patient consultation',
  },
  {
    url: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&w=1920&q=85',
    alt: 'Healthcare data on laptop',
  },
  {
    url: 'https://images.unsplash.com/photo-1530026405186-ed1f139313f8?auto=format&w=1920&q=85',
    alt: 'Hospital corridor',
  },
  {
    url: 'https://images.unsplash.com/photo-1579684385127-1ef15d508118?auto=format&w=1920&q=85',
    alt: 'Medical team',
  },
  {
    url: 'https://images.unsplash.com/photo-1555949963-aa79dcee981c?auto=format&w=1920&q=85',
    alt: 'Health technology',
  },
];

/** Heist / airport / jewel theft stills for volume top-up when live search is thin. */
export const STOCK_HEIST_IMAGES = [
  {
    url: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&w=1920&q=85',
    alt: 'Airport runway plane takeoff',
  },
  {
    url: 'https://images.unsplash.com/photo-1542296332-1d966a8168e4?auto=format&w=1920&q=85',
    alt: 'Airport terminal travelers security',
  },
  {
    url: 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce3b9?auto=format&w=1920&q=85',
    alt: 'Diamond jewelry close up',
  },
  {
    url: 'https://images.unsplash.com/photo-1610375461246-896cb7f6f847?auto=format&w=1920&q=85',
    alt: 'Bank vault safe security door',
  },
  {
    url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&w=1920&q=85',
    alt: 'Security guard surveillance monitor',
  },
  {
    url: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&w=1920&q=85',
    alt: 'Cargo warehouse logistics',
  },
  {
    url: 'https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?auto=format&w=1920&q=85',
    alt: 'Jewelry store display diamonds',
  },
  {
    url: 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&w=1920&q=85',
    alt: 'Investigation news documentary',
  },
];

/** Broader pool for variety / top-up when live search is thin. */
export const STOCK_MEDIA_POOL = [
  ...STOCK_HEIST_IMAGES,
  ...STOCK_HEALTHCARE_IMAGES,
  {
    url: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&w=1920&q=85',
    alt: 'Person typing on laptop',
  },
  {
    url: 'https://images.unsplash.com/photo-1563986768609-322da13575f3?auto=format&w=1920&q=85',
    alt: 'Smartphone in hands close up',
  },
  {
    url: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&w=1920&q=85',
    alt: 'Server room data center',
  },
  {
    url: 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?auto=format&w=1920&q=85',
    alt: 'Robot and AI technology',
  },
  {
    url: 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&w=1920&q=85',
    alt: 'Team collaborating in office',
  },
  {
    url: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&w=1920&q=85',
    alt: 'Digital code matrix screen',
  },
  {
    url: 'https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&w=1920&q=85',
    alt: 'Business meeting discussion',
  },
  {
    url: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&w=1920&q=85',
    alt: 'Analytics dashboard charts',
  },
  {
    url: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&w=1920&q=85',
    alt: 'Developers at work desks',
  },
  {
    url: 'https://images.unsplash.com/photo-1504868584819-f8e8b4b6d7e3?auto=format&w=1920&q=85',
    alt: 'Newsroom desk with screens',
  },
  {
    url: 'https://images.unsplash.com/photo-1495020689067-958852a7765e?auto=format&w=1920&q=85',
    alt: 'Newspaper and coffee',
  },
  {
    url: 'https://images.unsplash.com/photo-1614064641938-3bcee50cba1e?auto=format&w=1920&q=85',
    alt: 'Padlock security concept',
  },
  {
    url: 'https://images.unsplash.com/photo-1633265486064-086b219458ec?auto=format&w=1920&q=85',
    alt: 'Fingerprint biometric security',
  },
  {
    url: 'https://images.unsplash.com/photo-1563013544-824ae1b704d3?auto=format&w=1920&q=85',
    alt: 'Online shopping credit card',
  },
  {
    url: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&w=1920&q=85',
    alt: 'Retail checkout payment',
  },
  {
    url: 'https://images.unsplash.com/photo-1521791136064-7986c2920216?auto=format&w=1920&q=85',
    alt: 'Handshake business deal',
  },
  {
    url: 'https://images.unsplash.com/photo-1486312338219-ce68d2c6f44d?auto=format&w=1920&q=85',
    alt: 'Remote work laptop coffee',
  },
  {
    url: 'https://images.unsplash.com/photo-1555949963-ff9fe0c870eb?auto=format&w=1920&q=85',
    alt: 'Code on dual monitors',
  },
  {
    url: 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&w=1920&q=85',
    alt: 'Startup office brainstorm',
  },
  {
    url: 'https://images.unsplash.com/photo-1573164713714-d95e436ab8d6?auto=format&w=1920&q=85',
    alt: 'Woman presenting at whiteboard',
  },
  {
    url: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&w=1920&q=85',
    alt: 'Engineer with tablet factory',
  },
  {
    url: 'https://images.unsplash.com/photo-1581092160562-40aa08e78837?auto=format&w=1920&q=85',
    alt: 'Scientist in lab coat',
  },
  {
    url: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?auto=format&w=1920&q=85',
    alt: 'Professional in suit portrait',
  },
  {
    url: 'https://images.unsplash.com/photo-1475721027785-f74eccf877e2?auto=format&w=1920&q=85',
    alt: 'Crowd concert event',
  },
];

/**
 * Free Mixkit stock motion (no API key). Prefer human/phone/tech for cyber topics.
 * URLs verified as direct 720p MP4s: https://assets.mixkit.co/videos/{id}/{id}-720.mp4
 */
export const MIXKIT_VIDEO_POOL = [
  { url: 'https://assets.mixkit.co/videos/4274/4274-720.mp4', alt: 'Woman using smartphone in cafe', tags: ['phone', 'cyber', 'bank', 'human'] },
  { url: 'https://assets.mixkit.co/videos/4518/4518-720.mp4', alt: 'Hands working on laptop', tags: ['laptop', 'cyber', 'hack', 'human'] },
  { url: 'https://assets.mixkit.co/videos/4060/4060-720.mp4', alt: 'Business motion clip', tags: ['business', 'bank', 'office'] },
  { url: 'https://assets.mixkit.co/videos/3249/3249-720.mp4', alt: 'Lifestyle motion clip', tags: ['human', 'lifestyle'] },
  { url: 'https://assets.mixkit.co/videos/5065/5065-720.mp4', alt: 'Urban motion clip', tags: ['city', 'street'] },
  { url: 'https://assets.mixkit.co/videos/10052/10052-720.mp4', alt: 'People motion clip', tags: ['human', 'people'] },
  { url: 'https://assets.mixkit.co/videos/34566/34566-720.mp4', alt: 'Tech lifestyle motion', tags: ['tech', 'cyber'] },
  { url: 'https://assets.mixkit.co/videos/47028/47028-720.mp4', alt: 'Friends outdoor motion', tags: ['human', 'people'] },
];

/**
 * Direct-download public-domain / archive video clips (mp4).
 * Used when YouTube yt-dlp is unavailable so ffmpeg assembly still gets motion B-roll.
 * Prefer archive.org for serious topics — sample/demo clips tank brutal visualVariety.
 */
/** Curated housing / landlord clips (proven Pexels URLs from upload-ready landlord passes). */
export const STOCK_HOUSING_VIDEOS = [
  {
    url: 'https://videos.pexels.com/video-files/7010416/7010416-uhd_3840_2160_25fps.mp4',
    alt: 'person holding eviction notice paper',
    tags: ['housing', 'evict', 'landlord', 'notice', 'tenant'],
  },
  {
    url: 'https://videos.pexels.com/video-files/6964246/6964246-hd_1920_1080_25fps.mp4',
    alt: 'documentary eviction notice tenant worried',
    tags: ['housing', 'evict', 'tenant', 'worried'],
  },
  {
    url: 'https://videos.pexels.com/video-files/6963496/6963496-hd_1920_1080_25fps.mp4',
    alt: 'worried couple reading letter home',
    tags: ['housing', 'couple', 'letter', 'worried'],
  },
  {
    url: 'https://videos.pexels.com/video-files/6964005/6964005-hd_1920_1080_25fps.mp4',
    alt: 'worried couple reading letter home',
    tags: ['housing', 'couple', 'letter', 'worried'],
  },
  {
    url: 'https://videos.pexels.com/video-files/6963972/6963972-hd_1920_1080_25fps.mp4',
    alt: 'worried couple reading letter home',
    tags: ['housing', 'couple', 'letter'],
  },
  {
    url: 'https://videos.pexels.com/video-files/7254276/7254276-uhd_4096_2160_25fps.mp4',
    alt: 'stressed family apartment interior',
    tags: ['housing', 'family', 'apartment'],
  },
  {
    url: 'https://videos.pexels.com/video-files/19229735/19229735-uhd_3840_2160_24fps.mp4',
    alt: 'stressed family apartment interior',
    tags: ['housing', 'family', 'apartment'],
  },
  {
    url: 'https://videos.pexels.com/video-files/18877216/18877216-uhd_3840_2160_30fps.mp4',
    alt: 'stressed family apartment interior',
    tags: ['housing', 'family', 'apartment'],
  },
  {
    url: 'https://videos.pexels.com/video-files/7491481/7491481-hd_1920_1080_30fps.mp4',
    alt: 'person holding eviction notice paper',
    tags: ['housing', 'evict', 'notice'],
  },
  {
    url: 'https://videos.pexels.com/video-files/5981355/5981355-uhd_4096_2160_25fps.mp4',
    alt: 'documentary eviction notice tenant worried',
    tags: ['housing', 'tenant', 'worried'],
  },
  {
    url: 'https://videos.pexels.com/video-files/4553301/4553301-uhd_4096_2160_25fps.mp4',
    alt: 'tenant packing apartment documentary',
    tags: ['housing', 'tenant', 'apartment'],
  },
  {
    url: 'https://videos.pexels.com/video-files/4553296/4553296-uhd_4096_2160_25fps.mp4',
    alt: 'tenant apartment interior motion',
    tags: ['housing', 'tenant', 'apartment'],
  },
  {
    url: 'https://videos.pexels.com/video-files/7205258/7205258-uhd_3840_2160_25fps.mp4',
    alt: 'apartment building exterior city',
    tags: ['housing', 'apartment', 'building'],
  },
  {
    url: 'https://videos.pexels.com/video-files/7205253/7205253-uhd_3840_2160_25fps.mp4',
    alt: 'apartment building exterior city',
    tags: ['housing', 'apartment', 'building'],
  },
];

export const STOCK_VIDEO_POOL = [
  {
    url: 'https://archive.org/download/yt_dFkLfTrGmVg/dFkLfTrGmVg.ia.mp4',
    alt: 'FEMA fraud and scam awareness',
    tags: ['scam', 'fraud', 'bank', 'identity', 'cyber'],
  },
  {
    url: 'https://archive.org/download/yt_BxBdhLtNuxM/BxBdhLtNuxM.mp4',
    alt: 'FEMA weather storm family safety app',
    tags: ['tornado', 'storm', 'warning', 'disaster', 'hurricane'],
  },
  {
    url: 'https://archive.org/download/yt_JSJrLCLBo6g/JSJrLCLBo6g.ia.mp4',
    alt: 'Hurricane Laura FEMA assistance PSA',
    tags: ['hurricane', 'disaster', 'storm', 'warning'],
  },
  {
    url: 'https://archive.org/download/yt_R3gWuxhKuJI/R3gWuxhKuJI.ia.mp4',
    alt: 'FEMA front lines storm recovery',
    tags: ['disaster', 'storm', 'tornado', 'hurricane'],
  },
  {
    url: 'https://archive.org/download/yt_9eEth99C9_M/9eEth99C9_M.mp4',
    alt: 'Civic center storm restoration',
    tags: ['disaster', 'storm', 'tornado'],
  },
  {
    url: 'https://archive.org/download/yt_TL59CSiLnAg/TL59CSiLnAg.mp4',
    alt: 'Community recovery after disaster',
    tags: ['disaster', 'storm', 'tornado'],
  },
  {
    url: 'https://archive.org/download/yt_Bf7xCce5kic/Bf7xCce5kic.mp4',
    alt: 'FEMA public outreach',
    tags: ['disaster', 'warning', 'scam', 'fraud'],
  },
  {
    url: 'https://archive.org/download/wvual-APRIL_15TH_TORNADO_ANNIVERSARY/APRIL_15TH_TORNADO_ANNIVERSARY.mp4',
    alt: 'Tornado anniversary coverage',
    tags: ['tornado', 'storm', 'warning', 'disaster'],
  },
  {
    url: 'https://archive.org/download/youtube-m3eWX-c6_r4/m3eWX-c6_r4.mp4',
    alt: 'News motion footage',
    tags: ['news', 'tornado', 'storm'],
  },
  ...MIXKIT_VIDEO_POOL,
  {
    url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
    alt: 'Nature motion clip',
    tags: ['sample', 'filler'],
  },
  {
    url: 'https://www.w3schools.com/html/mov_bbb.mp4',
    alt: 'Character motion clip',
    tags: ['sample', 'filler'],
  },
  {
    url: 'https://media.w3.org/2010/05/sintel/trailer.mp4',
    alt: 'Cinematic trailer motion',
    tags: ['sample', 'filler'],
  },
  {
    url: 'https://download.samplelib.com/mp4/sample-5s.mp4',
    alt: 'Urban motion sample',
    tags: ['sample', 'filler'],
  },
  {
    url: 'https://download.samplelib.com/mp4/sample-10s.mp4',
    alt: 'Street motion sample',
    tags: ['sample', 'filler'],
  },
  {
    url: 'https://download.samplelib.com/mp4/sample-15s.mp4',
    alt: 'City motion sample',
    tags: ['sample', 'filler'],
  },
  {
    url: 'https://download.samplelib.com/mp4/sample-20s.mp4',
    alt: 'Lifestyle motion sample',
    tags: ['sample', 'filler'],
  },
  {
    url: 'https://download.samplelib.com/mp4/sample-30s.mp4',
    alt: 'Long motion sample',
    tags: ['sample', 'filler'],
  },
  {
    url: 'https://filesamples.com/samples/video/mp4/sample_640x360.mp4',
    alt: 'Documentary-style sample',
    tags: ['sample', 'filler'],
  },
];

/** Human / phone / security stills for cyber/fraud topics (prefer over random harvest junk). */
export const STOCK_CYBER_IMAGES = [
  {
    url: 'https://images.unsplash.com/photo-1563986768609-322da13575f3?auto=format&w=1920&q=85',
    alt: 'Smartphone in hands close up',
  },
  {
    url: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&w=1920&q=85',
    alt: 'Retail checkout payment',
  },
  {
    url: 'https://images.unsplash.com/photo-1563013544-824ae1b704d3?auto=format&w=1920&q=85',
    alt: 'Online shopping credit card',
  },
  {
    url: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&w=1920&q=85',
    alt: 'Person typing on laptop',
  },
  {
    url: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&w=1920&q=85',
    alt: 'Cybersecurity and technology',
  },
  {
    url: 'https://images.unsplash.com/photo-1633265486064-086b219458ec?auto=format&w=1920&q=85',
    alt: 'Fingerprint biometric security',
  },
  {
    url: 'https://images.unsplash.com/photo-1614064641938-3bcee50cba1e?auto=format&w=1920&q=85',
    alt: 'Padlock security concept',
  },
  {
    url: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&w=1920&q=85',
    alt: 'Server room data center',
  },
  {
    url: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&w=1920&q=85',
    alt: 'Digital code matrix screen',
  },
  {
    url: 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?auto=format&w=1920&q=85',
    alt: 'Robot and AI technology',
  },
];

/** Demo / cartoon / CDN sample hosts that tank brutal visualVariety on news topics. */
export const JUNK_VIDEO_HOST_RE =
  /(?:w3schools\.com|media\.w3\.org|samplelib\.com|filesamples\.com|interactive-examples\.mdn|commondatastorage\.googleapis\.com\/gtv-videos|googlevideo\.com\/videoplayback|forbigger|sintel|big.?buck.?bunny|flower\.mp4)/i;

export function isJunkDemoVideoUrl(url = '') {
  return JUNK_VIDEO_HOST_RE.test(url || '');
}

/** Archive.org (and similar) clips suitable for serious news / scam topics. */
export function topicalStockVideos(topicBlob = '', pool = STOCK_VIDEO_POOL) {
  const usable = pool.filter(
    (v) =>
      !(v.tags || []).includes('filler')
      && (/archive\.org/i.test(v.url) || /mixkit\.co/i.test(v.url)),
  );
  if (!usable.length) return [];
  const blob = (topicBlob || '').toLowerCase();
  const cyberKeys = ['scam', 'fraud', 'bank', 'identity', 'cyber', 'hack', 'voice', 'phone', 'laptop', 'human'];
  const disasterKeys = ['tornado', 'storm', 'warning', 'disaster', 'hurricane'];
  const heistKeys = ['news', 'human', 'city', 'street', 'tech'];
  const isCyber =
    /bank|hack|stolen|identity|ransom|voice|clone|fraud|scam|phish|cyber|data|password/i.test(blob);
  const isDisaster = /tornado|hurricane|flood|wildfire|earthquake|storm|disaster|warning|fema/i.test(blob);
  const isHeist =
    /\b(heist|diamond|jewel|jewelry|vault|airport|museum|robbery|antwerp|smuggl)\b/i.test(blob);
  const isHousing =
    /landlord|tenant|evict|rent|lease|apartment|housing|foreclos/i.test(blob);
  if (isHousing && pool === STOCK_VIDEO_POOL && curatedPacksEnabled()) {
    // Prefer curated housing pack when caller passed the main pool (disabled in cold eval)
    return STOCK_HOUSING_VIDEOS;
  }
  const keys = [];
  if (isCyber) keys.push(...cyberKeys);
  if (isDisaster) keys.push(...disasterKeys);
  if (isHeist) keys.push(...heistKeys);
  if (!keys.length) return usable;
  const scored = usable
    .map((v) => {
      const tags = v.tags || [];
      const hit = keys.reduce((n, k) => n + (tags.includes(k) ? 1 : 0), 0);
      return { v, hit };
    })
    .sort((a, b) => b.hit - a.hit);
  const matched = scored.filter((s) => s.hit > 0).map((s) => s.v);
  if (isCyber && !isDisaster) {
    const cyberOnly = matched.filter((v) => (v.tags || []).some((t) => cyberKeys.includes(t)));
    return cyberOnly.length ? cyberOnly : matched.length ? matched : usable.filter((v) => /mixkit\.co/i.test(v.url));
  }
  const rest = scored.filter((s) => s.hit === 0).map((s) => s.v);
  return matched.length ? [...matched, ...rest] : usable;
}

/** Pick unique stock URLs rotating by offset (for top-up / mock diversity). */
export function pickStockImages(count, offset = 0, pool = STOCK_MEDIA_POOL) {
  const out = [];
  const n = pool.length;
  if (n === 0 || count <= 0) return out;
  for (let i = 0; i < count; i += 1) {
    out.push(pool[(offset + i) % n]);
  }
  return out;
}

export function pickStockVideos(count, offset = 0, pool = STOCK_VIDEO_POOL) {
  return pickStockImages(count, offset, pool);
}
