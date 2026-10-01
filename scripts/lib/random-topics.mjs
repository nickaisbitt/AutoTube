/**
 * Random YouTube-style topics for improvement loop runs.
 */

export const TOPIC_POOL = [
  'The hospital hack that exposed 10 million patient records overnight',
  'Why your bank account could be emptied by an AI voice clone',
  'The submarine disaster they tried to erase from the internet',
  'How one phishing email took down a Fortune 500 company',
  'The crypto founder who vanished with $2 billion',
  'Why pilots are terrified of GPS spoofing now',
  'The food recall that poisoned thousands before anyone noticed',
  'How deepfakes are stealing identities on dating apps',
  'The power grid attack that blacked out an entire country',
  'Why surgeons are suing over AI misdiagnosis',
  'The prison escape planned entirely on Discord',
  'How ticket bots stole $50 million from fans',
  'The insurance scam using fake car crash videos',
  'Why Antarctica researchers lost satellite contact for 72 hours',
  'The ransomware group targeting schools for lunch money',
  'How a typo crashed the stock market for 20 minutes',
  'The cult leader who built a empire on YouTube',
  'Why your smart TV is spying on your living room',
  'The nuclear plant whistleblower found in a hotel freezer',
  'How AI recruiters are rejecting humans at scale',
  'The diamond heist that used a fake airport',
  'Why veterans benefits data leaked to dark web brokers',
  'The influencer who faked cancer for donations',
  'How a USB stick ended a decade-long espionage case',
  'The bridge collapse predicted on Reddit weeks early',
  'Why ocean cargo ships are vanishing from trackers',
  'The therapist chatbot that gave dangerous advice',
  'How sports betting algorithms rigged fantasy leagues',
  'The vaccine cold chain failure nobody reported',
  'Why electric car batteries are catching fire in garages',
  'The museum heist streamed live on TikTok',
  'How landlords use AI to evict tenants faster',
  'The space debris strike NASA did not announce',
  'Why college essays are failing AI plagiarism traps',
  'The bot farm that elected a mayor in a small town',
  'How a podcast ad triggered a SEC investigation',
  'The nursing home cameras that recorded abuse for years',
  'Why VPN companies are selling your DNS history',
  'The tornado warning system failure that cost lives',
  'How fake reviews built a billion-dollar supplement brand',
];

const recent = [];

/**
 * @param {number} [avoidLast=8] — don't repeat any of the last N topics
 */
export function pickRandomTopic(avoidLast = 8) {
  const blocked = new Set(recent.slice(-avoidLast));
  let candidates = TOPIC_POOL.filter((t) => !blocked.has(t));
  if (candidates.length === 0) {
    candidates = [...TOPIC_POOL];
    recent.length = 0;
  }
  const topic = candidates[Math.floor(Math.random() * candidates.length)];
  recent.push(topic);
  if (recent.length > avoidLast * 2) recent.splice(0, recent.length - avoidLast * 2);
  return topic;
}
