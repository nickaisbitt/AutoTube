/**
 * Lightweight vision gate for stock B-roll thumbnails (loop harvest).
 * Rejects obvious off-brand subjects that keyword filters miss (e.g. dung beetles).
 */
const OFF_BRAND_VISION_PROMPT = [
  'You judge ONE stock photo/video thumbnail for a serious news YouTube channel.',
  'Reply ONLY JSON: {"reject":true|false,"reason":"short"}',
  'reject=true if: insect/beetle/bug macro, puppet/muppet, cartoon/anime character, Minecraft/Fortnite gameplay, sci-fi HUD overlay.',
  'reject=false for real people, offices, hospitals, documents, phones, city exteriors.',
].join(' ');

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
          { role: 'system', content: OFF_BRAND_VISION_PROMPT },
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
    const message = data?.choices?.[0]?.message;
    let raw = '';
    if (typeof message?.content === 'string' && message.content.trim()) raw = message.content;
    else if (typeof message?.reasoning === 'string' && message.reasoning.trim()) raw = message.reasoning;
    if (!raw) return { reject: false, reason: 'empty' };
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}') + 1;
    const parsed = JSON.parse(start >= 0 ? raw.slice(start, end) : raw);
    return { reject: parsed.reject === true, reason: parsed.reason || '' };
  } catch (e) {
    return { reject: false, reason: `error:${e.message}` };
  }
}
