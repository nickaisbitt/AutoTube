/**
 * Topic-family visual search anchors shared by visual director + planner fallbacks.
 * Opt-in only (`AUTOTUBE_TOPIC_FAMILY_TEMPLATES=1`). Off by default and always off
 * during cold evaluation so family regex cannot inflate generator scores.
 */

export function topicFamilyTemplatesEnabled(): boolean {
  try {
    const env =
      (typeof process !== 'undefined' && process.env)
      || (typeof import.meta !== 'undefined' && (import.meta as { env?: Record<string, string> }).env)
      || {};
    if (env.AUTOTUBE_EVAL_COLD === '1' || env.AUTOTUBE_EVAL_COLD === 'true') return false;
    return env.AUTOTUBE_TOPIC_FAMILY_TEMPLATES === '1' || env.AUTOTUBE_TOPIC_FAMILY_TEMPLATES === 'true';
  } catch {
    return false;
  }
}

/**
 * @param {string} topic
 * @returns {'airline'|'nursing_abuse'|'healthcare_cyber'|'heist_fraud'|'veterans_benefits'|'bank_scam'|'landlord'|'insurance_fraud'|'tickets'|'disaster'|'generic'}
 */
export function resolveTopicFamily(topic: string): string {
  const t = String(topic || '').toLowerCase();
  if (
    /airline|cabin[-\s]?pressure|cabin\s*pressure|oxygen\s*mask|flight\s*attendant|cockpit/.test(t)
    || (/\b(aircraft|aviation|airplane|aeroplane)\b/.test(t)
      && /\b(fail|hid|scandal|cover.?up|pressure|mechanic|safety|crash|incident)\b/.test(t))
  ) {
    return 'airline';
  }
  if (/landlord|tenant|evict|rent|lease|apartment|housing/.test(t)) return 'landlord';
  if (/insurance|car\s*crash|fake\s*crash|staged\s*crash|crash\s*video|whiplash|claim\s*fraud|dashcam\s*scam/.test(t)) {
    return 'insurance_fraud';
  }
  // Nursing abuse / CCTV before healthcare cyber (nursing+camera used to resolve as hospital breach)
  if (/nursing\s*home|elder\s*abuse|care\s*home/.test(t)) return 'nursing_abuse';
  // Jewel / vault heists and fake-airport fraud — before generic bank OTP visuals
  if (
    /\b(heist|jewel\s*thief|diamond\s*thief|vault\s*raid|antwerp|notarbartolo)\b/.test(t)
    || (/\bdiamond/.test(t) && /\b(heist|theft|stolen|robbery|smuggl)/.test(t))
    || (/\bfake\b/.test(t) && /\bairport\b/.test(t))
    || (/\bairport\b/.test(t) && /\b(fraud|scam|fake|counterfeit|shell)\b/.test(t))
    || (/\bmuseum\b/.test(t) && /\b(heist|theft|stolen|robbery)\b/.test(t))
  ) {
    return 'heist_fraud';
  }
  if (
    /hospital|healthcare|patient|hipaa|medical|clinic|records?\b/.test(t)
    && /hack|breach|ransom|leak|data|cyber|expos|stolen|records?\b|broker/.test(t)
  ) {
    return 'healthcare_cyber';
  }
  // Veterans benefits / dark-web brokers — not generic bank OTP scam visuals
  if (
    /veteran|va\s+benefits|va\s+records|dark\s*web|data\s*broker|ssn|social\s*security/.test(t)
    || (/benefits/.test(t) && /veteran|va\b|dark\s*web|broker|ssn/.test(t))
  ) {
    return 'veterans_benefits';
  }
  if (
    /bank|fraud|scam|voice.?clone|otp|phish|wire\s*transfer|callback\s*scam/.test(t)
    || (/hack|identity|password|leak|breach|cyber|ransom/.test(t) && !/hospital|patient|healthcare|hipaa|medical|clinic/.test(t))
  ) {
    return 'bank_scam';
  }
  if (/ticket|bot|scalp|concert|fan/.test(t)) return 'tickets';
  if (/nuclear|radiation|meltdown|tornado|hurricane|flood|wildfire|disaster/.test(t)) return 'disaster';
  return 'generic';
}

/** @type {Record<string, string[]>} */
export const TOPIC_FAMILY_QUERIES: Record<string, string[]> = {
  airline: [
    'airplane cabin passenger face worried',
    'pilot cockpit headset face close-up',
    'flight attendant airplane cabin face',
    'passenger oxygen mask airplane cabin',
    'oxygen mask deploy airplane cabin',
    'maintenance hangar night aircraft',
    'mechanic tools aircraft hangar',
    'cabin pressure gauge cockpit',
    'airplane cabin passengers daylight',
    'airport runway plane takeoff',
  ],
  nursing_abuse: [
    'security camera cctv hallway corridor',
    'nursing home elderly care facility',
    'caregiver helping elderly patient room',
    'worried family visiting nursing home',
    'surveillance monitor security footage',
    'elderly patient bed care home',
  ],
  healthcare_cyber: [
    'hospital corridor empty hallway',
    'medical records laptop paperwork',
    'hospital computer workstation',
    'worried nurse looking at computer',
    'server room data center racks',
    'patient checking phone hospital waiting room',
  ],
  veterans_benefits: [
    'veteran looking at phone worried',
    'government office paperwork documents',
    'person checking credit report laptop',
    'military dog tags close up',
    'shocked person reading letter documents',
    'identity theft paperwork hands',
  ],
  heist_fraud: [
    'airport runway cargo plane exterior',
    'airport terminal security checkpoint',
    'diamond jewelry close up macro',
    'bank vault safe door security',
    'security guard surveillance monitor',
    'cargo warehouse logistics forklift',
    'jewelry store display diamonds',
    'investigation news documentary footage',
  ],
  bank_scam: [
    'shocked person looking at phone bank',
    'credit card payment laptop hands',
    'worried couple looking at phone',
    'smartphone banking app close up',
    'hacker typing computer dark',
    'bank building exterior city',
    'government office paperwork documents',
    'person checking credit report laptop',
  ],
  landlord: [
    'worried couple reading letter home',
    'apartment building exterior city',
    'eviction notice paper hands',
    'tenant packing boxes apartment',
    'keys lock apartment door',
    'for rent sign house porch',
  ],
  insurance_fraud: [
    'car crash dashcam footage highway',
    'damaged car accident scene daylight',
    'insurance adjuster inspecting car',
    'traffic accident news footage',
    'worried driver looking at phone',
    'insurance claim paperwork desk',
  ],
  tickets: [
    'concert crowd phone tickets',
    'sold out sign venue entrance',
    'person refreshing phone queue',
    'stadium seats empty rows',
    'frustrated fan looking at phone',
  ],
  disaster: [
    'severe weather radar news',
    'emergency news footage storm',
    'people sheltering indoors storm',
    'tornado damage aftermath news',
  ],
  generic: [
    'person reacting to news phone',
    'documentary interview close up',
    'news footage investigation',
  ],
};

/**
 * @param {string} topic
 * @param {number} [n]
 * @returns {string[]}
 */
export function topicFamilyQueries(topic: string, n = 4): string[] {
  if (!topicFamilyTemplatesEnabled()) return [];
  const family = resolveTopicFamily(topic);
  return (TOPIC_FAMILY_QUERIES[family] || TOPIC_FAMILY_QUERIES.generic).slice(0, n);
}

const STOCK_PROVIDER_ESSAY_RE =
  /\b(?:meet|according|how\s+a|how\s+an|how\s+the|why\s+a|why\s+an|why\s+the|federal\s+aviation\s+administration|captain\s+[a-z]+|hid\s+recurring|recurring\s+failures)\b/i;

function stockProviderQueryWords(query: string): string[] {
  return String(query || '')
    .trim()
    .replace(/[-/]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export function isSafeStockProviderQuery(query: string): boolean {
  const normalized = String(query || '').trim().replace(/\s+/g, ' ');
  if (!normalized) return false;
  if (normalized.length > 64) return false;
  if (stockProviderQueryWords(normalized).length > 6) return false;
  return !STOCK_PROVIDER_ESSAY_RE.test(normalized);
}

export function stockProviderQueriesForTopic(topic: string, n = 4): string[] {
  const family = resolveTopicFamily(topic);
  if (family === 'generic') return [];
  return (TOPIC_FAMILY_QUERIES[family] || [])
    .filter(isSafeStockProviderQuery)
    .slice(0, n);
}
