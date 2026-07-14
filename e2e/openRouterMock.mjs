/**
 * Shared OpenRouter mock routing for E2E fixtures and generate-full-video.mjs.
 *
 * Rules are evaluated top-to-bottom; the first match wins. Signatures mirror
 * production prompts in src/services/llm/* and src/services/blindReview.ts.
 *
 * | Kind             | Match (all required where noted)                                      | Source |
 * |------------------|-----------------------------------------------------------------------|--------|
 * | title-variants   | "youtube title optimization expert" AND "curiositygap"                | titleGenerator.generateTitleVariants |
 * | title-array      | "youtube title optimization expert" AND "json array of 3 strings"     | titleGenerator.generateVideoTitle |
 * | pinned-comments  | "youtube engagement strategist"                                       | pinnedComments.generatePinnedComments |
 * | hashtags         | "youtube seo expert" AND "hashtag"                                      | hashtagGenerator.generateHashtags |
 * | series-metadata  | "youtube playlist strategist"                                         | seriesGenerator.generateSeriesMetadata |
 * | blind-review     | "ruthlessly honest youtube video quality reviewer" AND "thumbnaileffectiveness" | blindReview.buildBlindReviewPrompt |
 * | visual-director  | "professional creative director" AND "plan two distinct shots"        | llmVisualDirector.planSegmentVisuals |
 * | script-polish    | "polish this script"                                                  | scriptReviewer.polishScript |
 * | script-trim      | "ruthless script trimmer"                                             | scriptReviewer.trimScript |
 * | script-specificity | "enforces specificity" OR "specificity issues that must be fixed"   | scriptReviewer + scriptGenerator.buildSpecificityFixPrompt |
 * | script-segments  | "world-class youtube scriptwriter" OR "return only a valid json array" OR "-minute video script about" | scriptGenerator.generateAIScript |
 * | script-default   | (fallback)                                                            | unknown / malformed requests |
 */

const LONG_NARRATION_BLOCK =
  'Hospitals paid billions after hackers exploited one weakness — and your medical records were already in the blast radius. Your identity, credit lines, and family safety depend on understanding how clinics adopt automation, where data leaks happen, and which guardrails regulators enforce across Epic, UnitedHealth, Mayo Clinic, and regional providers nationwide.';

/** True when an override clashes with the topic (e.g. bank hook on landlord video). */
function hookClashesWithTopic(topic, hook) {
  const tl = String(topic || '').toLowerCase();
  const ol = String(hook || '').toLowerCase();
  if (!tl || !ol) return false;
  const topicLandlord = /landlord|tenant|evict|rent/.test(tl);
  const topicBank = /bank|fraud|scam|voice.?clone|hack|identity|password/.test(tl);
  const topicTicket = /ticket|bot|scalp|concert|fan/.test(tl);
  const hookBank = /bank account|drained|voice clone|transfer|emptied real bank/.test(ol);
  const hookLandlord = /evict|landlord|tenant|rent|lease/.test(ol);
  const hookTicket = /ticket|bot|scalp|concert/.test(ol);
  if (topicLandlord && hookBank && !hookLandlord) return true;
  if (topicBank && hookLandlord && !hookBank) return true;
  if (topicTicket && (hookBank || hookLandlord) && !hookTicket) return true;
  if (!topicBank && hookBank && (topicLandlord || topicTicket)) return true;
  return false;
}

/** Topic-matched shock hook — no year opener (YouTube retention). */
export function buildShockHookLine(topic, override) {
  const t = (topic || 'this story').replace(/\.$/, '');
  const tl = t.toLowerCase();

  if (override?.trim()) {
    const o = override.trim();
    // Reject weak openers and cross-topic leftovers (bank line on landlord topic)
    if (
      !hookClashesWithTopic(t, o)
      && !/^(why|how|what|the)\b/i.test(o)
      && o.length > 12
    ) {
      return o;
    }
  }

  // Topic-specific openers beat generic hash templates (hash once picked bank for landlords)
  if (/landlord|tenant|evict|rent/.test(tl)) {
    return 'AI already filed your eviction — before you knew.';
  }
  if (/insurance|car\s*crash|fake\s*crash|crash\s*video/.test(tl)) {
    return 'That car crash was staged for the insurance payout.';
  }
  if (/bank|fraud|scam|voice.?clone|hack|identity|password/.test(tl)) {
    return 'This already emptied real bank accounts.';
  }
  if (/ticket|bot|scalp|concert|fan/.test(tl)) {
    return 'Bots bought every ticket before you could click.';
  }
  if (/nuclear|radiation|meltdown|plant/.test(tl)) {
    return 'They hid the radiation risk until it was too late.';
  }
  if (/tornado|hurricane|flood|wildfire|earthquake/.test(tl)) {
    return 'The warning came after people were already trapped.';
  }

  const short = t.replace(/^(why|how|what)\s+/i, '').trim();
  const templates = [
    `Billions lost overnight: ${short}.`,
    `They tried to hide this — here's the proof.`,
    `Your money can vanish before you hang up.`,
    `This already emptied real bank accounts.`,
  ];
  // Stable pick from topic hash so loop retries stay consistent
  let hash = 0;
  for (let i = 0; i < t.length; i += 1) hash = (hash + t.charCodeAt(i) * (i + 1)) % templates.length;
  return templates[hash];
}

/** ≤3-word mid-video impact cards matched to topic (not bank defaults on every video). */
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
  if (/bank|fraud|scam|voice.?clone|hack|identity|password/.test(tl)) {
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

function buildTopicBody(topic, hookLine) {
  const t = topic || 'the story';
  return `${hookLine} Experts warn the fallout is spreading fast. Regulators are scrambling. Millions of ordinary people are already paying the price. In the next few minutes you'll see exactly what happened, who profited, and what you should do right now to protect yourself. This is ${t} explained without the corporate spin.`;
}

/**
 * Topic-aware mock script with shock hook (for improvement loop + generate path).
 * @param {string} topic
 * @param {{ hookLine?: string }} [options]
 */
export function buildMockScriptForTopic(topic, options = {}) {
  const hookLine = buildShockHookLine(topic, options.hookLine);
  const bodyBlock = buildTopicBody(topic, hookLine);
  const introNarration = `${hookLine} Stay with me — the next two minutes change how you see this forever. ${bodyBlock.split('. ').slice(0, 2).join('. ')}.`;

  let segmentTemplates = [
    { type: 'intro', title: 'The Hook', visualNote: 'Shock headline, human face, stakes', narration: introNarration },
    { type: 'section', title: 'What Happened', visualNote: 'News footage, data dashboard, crowd', narration: bodyBlock },
    { type: 'section', title: 'Who Pays', visualNote: 'Families, hospital, courtroom', narration: bodyBlock },
    { type: 'section', title: 'The Hidden Cause', visualNote: 'Server room, hacker silhouette, charts', narration: bodyBlock },
    { type: 'section', title: 'What Changes Next', visualNote: 'Regulators, protests, tech demo', narration: bodyBlock },
    { type: 'outro', title: 'Your Move', visualNote: 'Subscribe CTA, checklist, direct camera', narration: `${bodyBlock} Subscribe for part two — we break down the next scandal before mainstream news catches up.` },
  ];

  if (options.loopShort) {
    segmentTemplates = segmentTemplates.slice(0, 3);
  }

  const duration = options.loopShort ? 12 : 32;
  const wordTarget = options.loopShort ? 40 : 85;

  return segmentTemplates.map((seg, i) => ({
    ...seg,
    id: `seg-${i}`,
    narration: repeatToWordCount(seg.narration, wordTarget),
    duration,
  }));
}

function repeatToWordCount(block, targetWords) {
  const words = [];
  while (words.length < targetWords) {
    words.push(...block.split(/\s+/).filter(Boolean));
  }
  return words.slice(0, targetWords).join(' ');
}

/** ~510 words / 6 segments — targets ≥180s TTS + packaging in full-pipeline E2E. */
export const MOCK_LONG_SCRIPT_SEGMENTS = [
  {
    type: 'intro',
    title: 'The Stakes',
    narration: repeatToWordCount(LONG_NARRATION_BLOCK, 85),
    visualNote: 'Worried person at laptop, hospital corridor',
    duration: 32,
  },
  {
    type: 'section',
    title: 'Ransomware Reality',
    narration: repeatToWordCount(LONG_NARRATION_BLOCK, 85),
    visualNote: 'Hospital data breach headline, security dashboard',
    duration: 32,
  },
  {
    type: 'section',
    title: 'AI on Both Sides',
    narration: repeatToWordCount(LONG_NARRATION_BLOCK, 85),
    visualNote: 'Security operations center, AI dashboard',
    duration: 32,
  },
  {
    type: 'section',
    title: 'Patient Impact',
    narration: repeatToWordCount(LONG_NARRATION_BLOCK, 85),
    visualNote: 'Patient portal, medical records',
    duration: 32,
  },
  {
    type: 'section',
    title: 'Regulatory Response',
    narration: repeatToWordCount(LONG_NARRATION_BLOCK, 85),
    visualNote: 'FDA briefing, compliance checklist',
    duration: 32,
  },
  {
    type: 'outro',
    title: 'Protect Yourself',
    narration: repeatToWordCount(LONG_NARRATION_BLOCK, 85),
    visualNote: 'Checklist on screen, person relieved',
    duration: 32,
  },
];

/** Compact script fixture — 3 segments for fast E2E / renders. */
export const MOCK_SCRIPT_SEGMENTS = [
  {
    type: 'intro',
    title: 'Introduction',
    narration:
      'Your hospital records could be sold on the dark web tonight — and one phishing click is all it takes. Hackers drained $2.3 billion from healthcare systems last year alone. In this video we break down how AI is changing healthcare — and what it means for your money, your records, and your family.',
    visualNote: 'Worried person at laptop, hospital corridor',
    duration: 22,
  },
  {
    type: 'section',
    title: 'The Threat',
    narration:
      'Epic Systems and UnitedHealth lost patient data access during major cyber incidents. AI tools can spot attacks 40% faster than humans — but criminals also use ChatGPT to target your identity and medical files at scale.',
    visualNote: 'Hospital data breach headline, security dashboard',
    duration: 24,
  },
  {
    type: 'outro',
    title: 'Protect Yourself',
    narration:
      'Here are three steps to protect your medical records starting today: enable two-factor authentication, audit app permissions, and ask your provider what AI tools touch your data. The FDA cleared 950 AI medical devices in 2025.',
    visualNote: 'Checklist on screen, person relieved',
    duration: 20,
  },
];

export const OPENROUTER_MOCK_ROUTING_RULES = [
  {
    kind: 'title-variants',
    description: 'Three title variants object (direct / curiosityGap / emotionalUrgent)',
    matches: ['youtube title optimization expert', 'curiositygap'],
  },
  {
    kind: 'title-array',
    description: 'Three title strings array for generateVideoTitle',
    matches: ['youtube title optimization expert', 'json array of 3 strings'],
  },
  {
    kind: 'pinned-comments',
    description: 'Pinned comment options array',
    matches: ['youtube engagement strategist'],
  },
  {
    kind: 'hashtags',
    description: 'Hashtag array for export metadata',
    matches: ['youtube seo expert', 'hashtag'],
  },
  {
    kind: 'series-metadata',
    description: 'Playlist / series metadata object',
    matches: ['youtube playlist strategist'],
  },
  {
    kind: 'blind-review',
    description: 'Quality report scores — requires reviewer system prompt, not the word "blind review"',
    matches: ['ruthlessly honest youtube video quality reviewer', 'thumbnaileffectiveness'],
  },
  {
    kind: 'visual-director',
    description: 'Per-segment visual plan JSON — not generic "visual" / "concept" tokens',
    matches: ['professional creative director', 'plan two distinct shots'],
  },
  {
    kind: 'script-polish',
    description: 'Polished script segment array',
    matches: ['polish this script'],
  },
  {
    kind: 'script-trim',
    description: 'Trimmed script segment array',
    matches: ['ruthless script trimmer'],
  },
  {
    kind: 'script-specificity',
    description: 'Specificity fix / enforce pass',
    matchesAny: ['enforces specificity', 'specificity issues that must be fixed'],
  },
  {
    kind: 'script-segments',
    description: 'Initial or refined script generation',
    matchesAny: [
      'world-class youtube scriptwriter',
      'return only a valid json array',
      '-minute video script about',
    ],
  },
  {
    kind: 'script-default',
    description: 'Fallback when no signature matches',
    matches: [],
  },
];

const MOCK_RESPONSES = {
  'title-variants': {
    direct: 'AI Healthcare: What You Must Know',
    curiosityGap: 'The AI Healthcare Risk Nobody Warns You About',
    emotionalUrgent: 'Your Medical Records Are Not Safe',
  },
  'title-array': [
    'AI Healthcare: What You Must Know',
    'The AI Healthcare Risk Nobody Warns You About',
    'Your Medical Records Are Not Safe',
  ],
  'pinned-comments': {
    comments: [{ text: 'What surprised you most?', type: 'question_prompt' }],
  },
  hashtags: { hashtags: ['#AI', '#Healthcare', '#CyberSecurity'] },
  'series-metadata': {
    seriesName: 'Healthcare AI Deep Dive',
    episodeNumber: 1,
    playlistDescription: 'Exploring AI in modern healthcare.',
    episodeTitle: 'Ep. 1: AI Healthcare Risks',
  },
  'blind-review': {
    scores: {
      visualQuality: 8,
      pacing: 8,
      narrativeClarity: 8,
      thumbnailEffectiveness: 8,
      overallProductionValue: 8,
    },
    feedback: {
      visualQuality: 'Strong',
      pacing: 'Good',
      narrativeClarity: 'Clear',
      thumbnailEffectiveness: 'Effective',
      overallProductionValue: 'Professional',
    },
    letterGrade: 'B+',
    summary: 'Solid explainer with clear hook.',
  },
  'visual-director': {
    intent: 'Establish cyber-healthcare stakes',
    classification: 'personal',
    primaryShot: {
      concept: 'Hospital security breach dashboard',
      queries: ['hospital cybersecurity breach', 'healthcare ransomware alert'],
      vibe: 'documentary',
    },
    secondaryShot: {
      concept: 'Patient reviewing medical records on phone',
      queries: ['patient portal security', 'medical records privacy'],
      vibe: 'tense',
    },
    visualConcept: 'High-quality documentary style',
  },
};

/**
 * @param {{ role?: string; content?: string | unknown }[] | null | undefined} messages
 * @returns {string}
 */
export function normalizeOpenRouterText(messages) {
  return (messages ?? [])
    .map((m) => (typeof m?.content === 'string' ? m.content : ''))
    .join('\n')
    .toLowerCase();
}

/**
 * @param {{ role?: string; content?: string | unknown }[] | null | undefined} messages
 * @returns {string}
 */
export function resolveOpenRouterMockKind(messages) {
  const text = normalizeOpenRouterText(messages);

  if (text.includes('youtube title optimization expert') && text.includes('curiositygap')) {
    return 'title-variants';
  }
  if (text.includes('youtube title optimization expert') && text.includes('json array of 3 strings')) {
    return 'title-array';
  }
  if (text.includes('youtube engagement strategist')) {
    return 'pinned-comments';
  }
  if (text.includes('youtube seo expert') && text.includes('hashtag')) {
    return 'hashtags';
  }
  if (text.includes('youtube playlist strategist')) {
    return 'series-metadata';
  }
  if (
    text.includes('ruthlessly honest youtube video quality reviewer') &&
    text.includes('thumbnaileffectiveness')
  ) {
    return 'blind-review';
  }
  if (text.includes('professional creative director') && text.includes('plan two distinct shots')) {
    return 'visual-director';
  }
  if (text.includes('polish this script')) {
    return 'script-polish';
  }
  if (text.includes('ruthless script trimmer')) {
    return 'script-trim';
  }
  if (text.includes('enforces specificity') || text.includes('specificity issues that must be fixed')) {
    return 'script-specificity';
  }
  if (
    text.includes('world-class youtube scriptwriter') ||
    text.includes('return only a valid json array') ||
    text.includes('-minute video script about')
  ) {
    return 'script-segments';
  }

  return 'script-default';
}

/**
 * @param {{ role?: string; content?: string | unknown }[] | null | undefined} messages
 * @param {typeof MOCK_SCRIPT_SEGMENTS} [segments]
 * @returns {string} JSON string for the assistant message content field
 */
export function resolveOpenRouterMockContent(messages, segments = MOCK_SCRIPT_SEGMENTS) {
  const kind = resolveOpenRouterMockKind(messages);

  if (kind in MOCK_RESPONSES) {
    return JSON.stringify(MOCK_RESPONSES[kind]);
  }

  // Script-like responses return a bare segment array (matches production parsers).
  return JSON.stringify(segments);
}

/**
 * @param {string} content
 * @param {string} [model]
 * @returns {string}
 */
export function openRouterCompletionBody(content, model = 'xiaomi/mimo-v2.5') {
  return JSON.stringify({
    id: `mock-${Date.now()}`,
    model,
    choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }],
  });
}

/**
 * @param {{ model?: string; messages?: { role?: string; content?: string }[] } | null | undefined} post
 * @param {typeof MOCK_SCRIPT_SEGMENTS} [segments]
 * @returns {string}
 */
export function mockOpenRouterHttpBody(post, segments = MOCK_SCRIPT_SEGMENTS) {
  const content = resolveOpenRouterMockContent(post?.messages, segments);
  const model = post?.model ?? 'xiaomi/mimo-v2.5';
  return openRouterCompletionBody(content, model);
}
