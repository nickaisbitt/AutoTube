/**
 * Real stock image URLs for fixtures / volume top-up (not picsum).
 * Keep pool large enough that 3 segments × 6 assets don't force heavy reuse.
 */
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

/** Broader pool for variety / top-up when live search is thin. */
export const STOCK_MEDIA_POOL = [
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
 * Direct-download public-domain / archive video clips (mp4).
 * Used when YouTube yt-dlp is unavailable so ffmpeg assembly still gets motion B-roll.
 */
export const STOCK_VIDEO_POOL = [
  {
    url: 'https://archive.org/download/youtube-m3eWX-c6_r4/m3eWX-c6_r4.mp4',
    alt: 'Tornado news footage',
  },
  {
    url: 'https://archive.org/download/wvual-APRIL_15TH_TORNADO_ANNIVERSARY/APRIL_15TH_TORNADO_ANNIVERSARY.mp4',
    alt: 'Tornado anniversary coverage',
  },
  {
    url: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
    alt: 'Nature motion clip',
  },
  {
    url: 'https://www.w3schools.com/html/mov_bbb.mp4',
    alt: 'Character motion clip',
  },
  {
    url: 'https://media.w3.org/2010/05/sintel/trailer.mp4',
    alt: 'Cinematic trailer motion',
  },
  {
    url: 'https://download.samplelib.com/mp4/sample-5s.mp4',
    alt: 'Urban motion sample',
  },
  {
    url: 'https://download.samplelib.com/mp4/sample-10s.mp4',
    alt: 'Street motion sample',
  },
  {
    url: 'https://download.samplelib.com/mp4/sample-15s.mp4',
    alt: 'City motion sample',
  },
  {
    url: 'https://download.samplelib.com/mp4/sample-20s.mp4',
    alt: 'Lifestyle motion sample',
  },
  {
    url: 'https://download.samplelib.com/mp4/sample-30s.mp4',
    alt: 'Long motion sample',
  },
  {
    url: 'https://filesamples.com/samples/video/mp4/sample_640x360.mp4',
    alt: 'Documentary-style sample',
  },
];

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
