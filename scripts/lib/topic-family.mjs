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

/** Staged car-crash / insurance fraud — not bank OTP or generic cyber. */
export function isInsuranceFraudTopic(topic) {
  const t = String(topic || '').toLowerCase();
  return /insurance|car\s*crash|fake\s*crash|staged\s*crash|crash\s*video|whiplash|claim\s*fraud|dashcam\s*scam/.test(t);
}

/** @param {string} topic */
export function isVeteransBenefitsTopic(topic) {
  const t = String(topic || '').toLowerCase();
  return (
    /veteran|va\s+benefits|va\s+records|dark\s*web.*broker|data\s*broker.*ssn|ssn.*broker/.test(t)
    || (/benefits/.test(t) && /veteran|va\b|dark\s*web|data\s*broker|ssn|social\s*security/.test(t))
  );
}

/**
 * Hospital / patient-records cyber topics — excludes nursing-home abuse/camera stories.
 * @param {string} topic
 */
export function isHealthcareCyberTopic(topic) {
  const t = String(topic || '').toLowerCase();
  if (isNursingHomeTopic(t)) return false;
  if (isVeteransBenefitsTopic(t)) return false;
  return (
    /hospital|healthcare|patient|hipaa|medical|clinic|records?\b/.test(t)
    && /hack|breach|ransom|leak|data|cyber|expos|stolen|records?\b|broker/.test(t)
  );
}

/** Bank OTP / voice-clone scam — excludes nursing, veterans, hospital breach, landlord, heist. */
export function isBankScamTopic(topic) {
  const t = String(topic || '').toLowerCase();
  if (
    isNursingHomeTopic(t)
    || isVeteransBenefitsTopic(t)
    || isHealthcareCyberTopic(t)
    || isHousingTopic(t)
    || isInsuranceFraudTopic(t)
    || isHeistTopic(t)
  ) {
    return false;
  }
  return /bank|fraud|scam|voice.?clone|otp|phish|wire\s*transfer|callback\s*scam/.test(t);
}

/**
 * Diamond / jewel heist, fake-airport fraud, vault theft — not bank OTP or nursing.
 * @param {string} topic
 */
export function isHeistTopic(topic) {
  const t = String(topic || '').toLowerCase();
  return (
    /\b(heist|jewel\s*thief|diamond\s*thief|vault\s*raid|antwerp|notarbartolo)\b/.test(t)
    || (/\bdiamond/.test(t) && /\b(heist|theft|stolen|robbery|smuggl)/.test(t))
    || (/\bfake\b/.test(t) && /\bairport\b/.test(t))
    || (/\bairport\b/.test(t) && /\b(fraud|scam|fake|counterfeit|shell)\b/.test(t))
    || (/\bmuseum\b/.test(t) && /\b(heist|theft|stolen|robbery)\b/.test(t))
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
  if (isVeteransBenefitsTopic(t)) {
    return (
      /benefit|broker|ssn|va\b|dark web|credit|identity|file|freeze/.test(blob)
      && !/otp|wire|voice clone|lease|evict|hospital breach|charts stolen/.test(blob)
    );
  }
  if (isBankScamTopic(t)) {
    return /otp|wire|voice|scam|transfer|callback|account|password/.test(blob);
  }
  if (isHeistTopic(t)) {
    return (
      /vault|diamond|jewel|heist|airport|runway|security|guard|safe|cargo|stolen|fake/.test(blob)
      && !/otp|wire|voice clone|lease|evict|hospital breach|charts stolen|nursing|abuse/.test(blob)
    );
  }
  if (isInsuranceFraudTopic(t)) {
    return (
      /crash|claim|dashcam|whiplash|adjuster|staged|fraud|policy|payout/.test(blob)
      && !/otp|wire|voice clone|lease|evict|hospital breach|charts stolen/.test(blob)
    );
  }
  // Generic: any overlap with long topic tokens
  const hints = t.split(/\s+/).filter((w) => w.length > 4).slice(0, 4);
  return hints.some((w) => blob.includes(w));
}
