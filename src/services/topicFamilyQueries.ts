/**
 * Topic-family visual search anchors shared by visual director + planner fallbacks.
 */

/**
 * @param {string} topic
 * @returns {'healthcare_cyber'|'bank_scam'|'landlord'|'tickets'|'disaster'|'generic'}
 */
export function resolveTopicFamily(topic) {
  const t = String(topic || '').toLowerCase();
  if (/landlord|tenant|evict|rent|lease|apartment|housing/.test(t)) return 'landlord';
  if (/hospital|healthcare|patient|hipaa|medical|clinic|nursing\s*home/.test(t)
    && /hack|breach|ransom|leak|data|cyber|expos|stolen|records?|camera|abuse|broker/.test(t)) {
    return 'healthcare_cyber';
  }
  if (/veteran|benefits|dark\s*web|data\s*broker|ssn|va\s+benefits/.test(t)) return 'bank_scam';
  if (/bank|fraud|scam|voice.?clone|hack|identity|password|phish|leak|breach|cyber/.test(t)) return 'bank_scam';
  if (/ticket|bot|scalp|concert|fan/.test(t)) return 'tickets';
  if (/nursing\s*home|elder|abuse|camera/.test(t) && /abuse|camera|recorded|neglect/.test(t)) return 'healthcare_cyber';
  if (/nuclear|radiation|meltdown|tornado|hurricane|flood|wildfire|disaster/.test(t)) return 'disaster';
  return 'generic';
}

/** @type {Record<string, string[]>} */
export const TOPIC_FAMILY_QUERIES = {
  healthcare_cyber: [
    'hospital corridor empty hallway',
    'medical records laptop paperwork',
    'hospital computer workstation night',
    'worried nurse looking at computer',
    'server room data center racks',
    'patient checking phone hospital waiting room',
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
export function topicFamilyQueries(topic, n = 4) {
  const family = resolveTopicFamily(topic);
  return (TOPIC_FAMILY_QUERIES[family] || TOPIC_FAMILY_QUERIES.generic).slice(0, n);
}
