/**
 * Lightweight vision gate for stock B-roll thumbnails (loop harvest).
 * Rejects obvious off-brand subjects that keyword filters miss (e.g. dung beetles).
 */
import { openRouterMessageText } from './openRouterMessageText.mjs';

const OFF_BRAND_VISION_PROMPT = [
  'You judge ONE stock photo/video thumbnail for a serious news YouTube channel.',
  'Reply ONLY JSON: {"reject":true|false,"reason":"short"}',
  'reject=true if: insect/beetle/bug macro, puppet/muppet, cartoon/anime character, Minecraft/Fortnite gameplay, sci-fi HUD overlay, blurry/out-of-focus filler, overexposed/washed-out clip, staged reenactment with actors, produce/vegetable crate, empty blurry hospital bed only, generic corporate handshake/office skyline.',
  'reject=false for real people with readable faces, documents, phones, topical locations with human context.',
].join(' ');

/** @param {string} topicBlob */
export function visionPromptForTopic(topicBlob = '') {
  if (/\bnursing\s*home|elder\s*abuse|care\s*home\b/i.test(topicBlob)) {
    return [
      'You judge ONE stock thumbnail for a nursing-home abuse / CCTV investigation video.',
      'Reply ONLY JSON: {"reject":true|false,"reason":"short"}',
      'reject=true if: generic corporate office, architectural scale model, glass skyline, conference room, beetle/insect, puppet, cartoon, HUD overlay, produce/vegetable crate, grocery stock, empty blurry hospital bed only, blurry/defocused filler, overexposed/washed-out clip, staged reenactment actors.',
      'reject=false for: CCTV/surveillance, care-home hallway, elderly patient, caregiver, family visit, wheelchair corridor.',
    ].join(' ');
  }
  if (/veteran|va\s+benefits|dark\s*web|data\s*broker|ssn|identity.?theft/i.test(topicBlob)) {
    return [
      'You judge ONE stock thumbnail for a veterans benefits / identity-theft / data-broker investigation video.',
      'Reply ONLY JSON: {"reject":true|false,"reason":"short"}',
      'reject=true if: bank OTP keypad/SMS scam props, call-center headset farm, voice-clone studio mic, nursing-home CCTV hallway, beetle/insect, puppet, cartoon, sci-fi HUD, crypto trading screens, blurry filler, overexposed clip, staged reenactment, produce crate, empty hospital bed only.',
      'reject=false for: veteran/military, VA/government office, benefits paperwork, SSN/credit report docs, identity theft victim on phone, dark-web/data-broker laptop (no HUD), worried family.',
    ].join(' ');
  }
  if (/hospital|healthcare|patient|hipaa|medical.*(hack|breach|leak|records)/i.test(topicBlob)) {
    return [
      'You judge ONE stock thumbnail for a hospital / patient-records cyber breach investigation video.',
      'Reply ONLY JSON: {"reject":true|false,"reason":"short"}',
      'reject=true if: bank OTP keypad, voice-clone studio mic, nursing-home abuse CCTV only, surgical OR close-up, beetle/insect, puppet, cartoon, sci-fi HUD, blurry/defocused filler, overexposed clip, staged reenactment, produce crate, empty hospital bed only.',
      'reject=false for: hospital corridor with people, medical records laptop, nurse at workstation, server room racks, patient waiting room worried, HIPAA paperwork.',
    ].join(' ');
  }
  return OFF_BRAND_VISION_PROMPT;
}

/**
 * @param {string} imageUrl
 * @param {string} apiKey
 * @param {string} [topicBlob]
 * @returns {Promise<{ reject: boolean, reason?: string }>}
 */
export async function visionRejectOffBrandStock(imageUrl, apiKey, topicBlob = '') {
  if (!imageUrl || !apiKey) return { reject: false, reason: 'skipped' };
  // If the topic itself is about insects/puppets, do not reject
  if (/\b(beetle|insect|puppet|cartoon|minecraft)\b/i.test(topicBlob)) {
    return { reject: false, reason: 'topic-allows' };
  }
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://autotube.video',
        'X-Title': 'AutoTube Stock Vision Gate',
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_VISION_MODEL || process.env.OPENROUTER_MODEL || 'xiaomi/mimo-v2.5',
        messages: [
          { role: 'system', content: visionPromptForTopic(topicBlob) },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Reject off-brand junk for news B-roll?' },
              { type: 'image_url', image_url: { url: imageUrl } },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 120,
        response_format: { type: 'json_object' },
      }),
    });
    if (!response.ok) return { reject: false, reason: `http-${response.status}` };
    const data = await response.json();
    const raw = openRouterMessageText(data?.choices?.[0]?.message);
    if (!raw) return { reject: false, reason: 'empty' };
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}') + 1;
    const parsed = JSON.parse(start >= 0 ? raw.slice(start, end) : raw);
    return { reject: parsed.reject === true, reason: parsed.reason || '' };
  } catch (e) {
    return { reject: false, reason: `error:${e.message}` };
  }
}
