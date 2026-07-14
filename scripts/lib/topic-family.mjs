/**
 * Shared topic-family detectors for loop harvest, impact beats, and overlays.
 * Keep nursing abuse distinct from hospital cyber breach topics.
 */

/** @param {string} topic */
export function isNursingHomeTopic(topic) {
  return /nursing\s*home|elder\s*abuse|care\s*home/i.test(String(topic || ''));
}

/** @param {string} topic */
export function isHousingTopic(topic) {
  return /landlord|tenant|evict|rent|lease|apartment|housing|foreclos/i.test(String(topic || ''));
}

/**
 * Hospital / patient-records cyber topics — excludes nursing-home abuse/camera stories.
 * @param {string} topic
 */
export function isHealthcareCyberTopic(topic) {
  const t = String(topic || '').toLowerCase();
  if (isNursingHomeTopic(t)) return false;
  return (
    /hospital|healthcare|patient|hipaa|medical|clinic|records?\b/.test(t)
    && /hack|breach|ransom|leak|data|cyber|expos|stolen|records?\b|broker/.test(t)
  );
}

/**
 * Broad healthcare (hospital/medical) — excludes pure nursing-home abuse topics.
 * @param {string} topic
 */
export function isHealthcareTopic(topic) {
  const t = String(topic || '');
  if (isNursingHomeTopic(t)) return false;
  return /hospital|healthcare|patient|medical|hipaa|ehr|clinic|\bnurse\b|\bdoctor\b|records?\b/i.test(t);
}

/**
 * True when custom impact beats match the topic family (not just "hospital" token anywhere).
 * @param {string[]} beats
 * @param {string} topic
 */
export function impactBeatsMatchTopic(beats, topic) {
  const blob = (beats || []).join(' ').toLowerCase();
  if (!blob.trim()) return false;
  const t = String(topic || '').toLowerCase();

  if (isNursingHomeTopic(t)) {
    return (
      /camera|abuse|staff|care|elder|supervision|tape|family|shift/.test(blob)
      && !/hospital breach|charts stolen|patient data|hipaa|otp|wire|voice clone|lease|evict/.test(blob)
    );
  }
  if (isHealthcareCyberTopic(t)) {
    return /hospital|patient|records|hipaa|breach|charts|er locked/.test(blob);
  }
  if (isHousingTopic(t)) {
    return /lease|evict|rent|credit|blacklist|appeal|lock changed/.test(blob);
  }
  if (/veteran|benefits|dark\s*web|data\s*broker|ssn|va\s+benefits/.test(t)) {
    return /benefit|broker|ssn|va|dark web|credit|identity/.test(blob);
  }
  if (/bank|fraud|scam|voice.?clone|hack|identity|password|leak|breach|cyber|ransom/.test(t)) {
    return /otp|wire|voice|scam|transfer|callback|account|password/.test(blob);
  }
  // Generic: any overlap with long topic tokens
  const hints = t.split(/\s+/).filter((w) => w.length > 4).slice(0, 4);
  return hints.some((w) => blob.includes(w));
}
