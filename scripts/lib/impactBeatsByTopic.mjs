/**
 * Shared topic → mid-video impact beat cards (≤3 words each).
 * Used by loop patch + ffmpeg overlays — keep one source of truth.
 */
import { isHealthcareCyberTopic, isNursingHomeTopic } from './topic-family.mjs';

/** @param {string} topic */
export function buildImpactBeatsForTopic(topic) {
  const tl = String(topic || '').toLowerCase();

  if (/landlord|tenant|evict|rent/.test(tl)) {
    return [
      'LEASE DENIED',
      'EVICTED BY AI',
      'YOUR FILE FLAGGED',
      'RENT SCORE DOWN',
      'NOTICE FILED',
      'NO HEARING',
      'CREDIT HIT',
      'AUTO SKIPPED',
      'BLACKLIST RISK',
      'TIMER STARTED',
      'APPEAL DENIED',
      'LOCK CHANGED',
    ];
  }

  // Nursing abuse / CCTV BEFORE healthcare cyber (nursing + camera/abuse used to match hospital cards)
  if (isNursingHomeTopic(tl)) {
    return [
      'CAMERAS ROLLING',
      'STAFF CAUGHT',
      'ABUSE ON TAPE',
      'COVER UP',
      'FAMILY IGNORED',
      'SHIFT AFTER SHIFT',
      'NO SUPERVISION',
      'LOCKED DOORS',
      'REPORT BURIED',
      'CALL FOR HELP',
      'WATCH THE TAPE',
      'PROTECT THEM',
    ];
  }

  // Healthcare cyber — hospital/patient records breach (not nursing-home abuse)
  if (isHealthcareCyberTopic(tl)) {
    return [
      'RECORDS LEAKED',
      'PATIENT DATA OUT',
      'HOSPITAL BREACH',
      'CHARTS STOLEN',
      'HIPAA FAILURE',
      'DARK WEB SALE',
      'SYSTEMS DOWN',
      'ER LOCKED OUT',
      'FILES EXPOSED',
      'IDENTITY RISK',
      'CALL THE DESK',
      'FREEZE ACCESS',
    ];
  }

  // Veterans / benefits / dark-web data brokers (before generic bank)
  if (/veteran|benefits|dark\s*web|data\s*broker|ssn|social\s*security|va\s+benefits/.test(tl)) {
    return [
      'DATA BROKERED',
      'BENEFITS EXPOSED',
      'DARK WEB SALE',
      'SSN FOR SALE',
      'FILES LEAKED',
      'IDENTITY RISK',
      'FREEZE CREDIT',
      'CALL THE VA',
      'RECORDS STOLEN',
      'BROKER LIST',
      'LOCK IT DOWN',
      'CHECK YOUR FILE',
    ];
  }

  if (/bank|fraud|scam|voice.?clone|hack|identity|password|leak|breach|cyber|ransom/.test(tl)) {
    return [
      'VOICE CLONE SCAM',
      'THEY DRAINED IT',
      'CALL THEM BACK',
      'VERIFY FIRST',
      'STOP THE TRANSFER',
      'NOT YOUR MOM',
      'FAKE NUMBER',
      'OTP STOLEN',
      'WIRE HIJACKED',
      'ACCOUNT FROZEN',
      'HANG UP NOW',
      'CALLBACK TRAP',
    ];
  }

  if (/ticket|bot|scalp|concert|fan/.test(tl)) {
    return [
      'BOTS GOT IN',
      'SOLD OUT INSTANTLY',
      'FAKE QUEUE',
      'SCALPERS WIN',
      'NO TICKETS LEFT',
      'REFRESH TOO LATE',
      'CAPTCHA FAILED',
      'RESALE MARKUP',
      'SEAT GONE',
      'PRE SALE RIGGED',
      'CART EXPIRED',
      'DYNAMIC PRICE',
    ];
  }

  if (/nuclear|radiation|meltdown|plant|tornado|hurricane|flood|wildfire/.test(tl)) {
    return [
      'WARNING LATE',
      'THEY HID IT',
      'TOO LATE NOW',
      'EVACUATE NOW',
      'COVER UP',
      'RISK DENIED',
      'SIRENS OFF',
      'SAFE ZONE LIE',
      'MAP OUTDATED',
      'DOSE SPIKE',
      'SHELTER FULL',
      'IGNORE ORDER',
    ];
  }

  return [
    'STAY WITH ME',
    'THIS IS REAL',
    'WATCH CLOSELY',
    'HERE IS PROOF',
    'DO THIS NOW',
    'SHARE THIS',
    'DONT SKIP',
    'ONE MORE FACT',
    'REMEMBER THIS',
    'ACT TODAY',
    'TELL SOMEONE',
    'SAVE THIS',
  ];
}
