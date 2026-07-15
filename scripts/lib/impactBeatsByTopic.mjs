/**
 * Shared topic → mid-video impact beat cards (≤3 words each).
 * Used by loop patch + ffmpeg overlays — keep one source of truth.
 */
import {
  isBankScamTopic,
  isHealthcareCyberTopic,
  isHeistTopic,
  isHousingTopic,
  isInsuranceFraudTopic,
  isNursingHomeTopic,
  isVeteransBenefitsTopic,
} from './topic-family.mjs';

/** @param {string} topic */
export function buildImpactBeatsForTopic(topic) {
  const tl = String(topic || '').toLowerCase();

  if (isHousingTopic(tl)) {
    return [
      'LEASE DENIED',
      'EVICTED BY AI',
      'YOUR FILE FLAGGED',
      'RENT SCORE DOWN',
      'NOTICE FILED',
      'NO HEARING',
      'CREDIT HIT',
      'HEARING DENIED',
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
  if (isVeteransBenefitsTopic(tl)) {
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

  if (isBankScamTopic(tl)) {
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

  if (isHeistTopic(tl)) {
    return [
      'FAKE AIRPORT',
      'VAULT BREACHED',
      'DIAMONDS GONE',
      'SECURITY BLIND',
      'INSIDE JOB',
      'CARGO SWITCH',
      'RUNWAY SCAM',
      'JEWELS VANISH',
      'GUARDS FOOLED',
      'STAGE SET',
      'HEIST EXPOSED',
      'LOCK IT DOWN',
    ];
  }

  if (isInsuranceFraudTopic(tl)) {
    return [
      'CRASH STAGED',
      'CLAIM DENIED',
      'DASHCAM FAKE',
      'WHIPLASH SCAM',
      'ADJUSTER ALERT',
      'PAYOUT BLOCKED',
      'VIDEO DOCTORED',
      'IMPACT FAKED',
      'POLICY VOID',
      'FRAUD UNIT',
      'NO INJURY',
      'CASE CLOSED',
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

  const words = String(topic || '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 2);
  const topicPhrase = words.join(' ') || 'THE TRUTH';
  return [
    `${topicPhrase} EXPOSED`,
    'THEY HID IT',
    'PROOF IS OUT',
    'COVER UP FAILS',
    'WHO ALLOWED THIS',
    'ACT BEFORE LATE',
    'SHARE THE PROOF',
    'STILL UNFOLDING',
    'WATCH CLOSELY',
    'NO COINCIDENCE',
    'FOLLOW THE TRAIL',
    'THIS CHANGES ALL',
  ];
}
