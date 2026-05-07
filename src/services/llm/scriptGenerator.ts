/**
 * Script generation — generates full video scripts using OpenRouter LLM.
 */

import type { TopicConfig, ScriptSegment } from '../../types';
import { logger } from '../logger';
import { fetchWithTimeout } from '../../utils/fetchWithTimeout';
import { sanitiseTopic, parseSegmentsFromContent, injectTransitionIfMissing } from './parsing';
import { fetchWikiContext, fetchTopicContext } from './topicContext';

const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

// Default model — can be overridden via AppConfig in the future.
export const DEFAULT_SCRIPT_MODEL = 'google/gemini-2.0-flash-001';

/**
 * Generates a full video script using OpenRouter.
 * Returns a validated array of ScriptSegment objects.
 */
export async function generateAIScript(
  config: TopicConfig,
  apiKey: string,
  model = DEFAULT_SCRIPT_MODEL,
  signal?: AbortSignal,
): Promise<ScriptSegment[]> {
  const totalSegments = Math.max(6, Math.min(8, config.targetDuration * 2));
  const needsTransition = totalSegments > 4;
  const tone = config.tone || 'informative';

  // Build tone-specific rules
  const toneRulesMap: Record<string, string> = {
    dramatic: `TONE — DRAMATIC:
- Use SHORT sentences averaging 12 words or fewer. Punch hard. Active voice only — no passive constructions.
- Write like a thriller narrator. Staccato rhythm. Subject-verb-object. "They moved fast. The board didn't flinch. The deal closed in 48 hours."
- Every sentence should feel like it could end a movie trailer.`,
    casual: `TONE — CASUAL:
- Write like you're explaining this to a smart friend over coffee. Use "you" and "your" liberally.
- Ask rhetorical questions to pull the viewer in: "Sound familiar?", "Wild, right?", "You know what happened next?"
- Second-person address throughout. The viewer is part of the conversation, not an observer.`,
    informative: `TONE — INFORMATIVE:
- Balanced, factual, authoritative. Present multiple perspectives before stating your view.
- When citing numbers or claims, attribute them: "according to...", "reports indicate...", "data from X shows...".
- Let the facts build the argument. Your opinion comes after the evidence, not before.`,
    urgent: `TONE — URGENT:
- Present tense throughout. This is happening NOW. "The deadline hits in 72 hours. Regulators are scrambling."
- Breaking-news energy. Time-sensitive framing. Create a sense that the viewer is watching events unfold in real time.
- Short, punchy, declarative. No hedging. No "might" or "could" — use "is" and "will".`,
  };
  const toneRules = toneRulesMap[tone] || toneRulesMap.informative;

  const systemPrompt = `You are a world-class YouTube scriptwriter who creates viral, high-retention commentary videos.

Your scripts sound like a confident, opinionated creator talking directly to camera — NOT like a news anchor or AI summary. Think Johnny Harris meets Wendover Productions meets a sharp podcast host.

VOICE RULES:
- Write for SPOKEN delivery. Short sentences. Conversational rhythm. Mix punchy one-liners with longer explanatory beats.
- Have a STRONG editorial opinion. Don't just summarize — tell the viewer what YOU think and why they should care.
- Be SPECIFIC. Name real people, real companies, real numbers. Never be vague.
- NEVER fabricate facts. If unsure, frame as opinion ("Here's what I think...").
- Translate EVERY technical term, acronym, or jargon into plain English using a vivid METAPHOR or ANALOGY — not just a parenthetical definition. Example: "Standard Contractual Clauses — think of them as legal pinky-promises stretched across an ocean, hoping nobody lets go." Example: "Project Texas — TikTok building a digital fortress on American soil, handing the keys to Oracle." Every proper noun, program name, or policy name needs a metaphor or analogy that makes it instantly visual and memorable.
- Avoid: "all eyes are on", "game changer", "critical moment", "time will tell", "remains to be seen", "imagine", "explosive", "bombshell", "no seriously", "at best", "basically", "what if".

${toneRules}

DEPTH PER SEGMENT (CRITICAL):
Each segment narration MUST be 5-8 sentences long. No 2-3 sentence segments. Every segment must contain:
- At least one concrete detail (a name, number, date, or specific event)
- At least one sentence of analysis or opinion (why this matters)
- At least one forward-looking or connecting statement
If a segment feels thin, add context, consequences, or competitive dynamics — never pad with filler.

NO REPETITION RULE:
NEVER repeat the same phrase, sentence, or key descriptor across segments. Each segment must introduce NEW information, a NEW angle, or a NEW consequence. If you used "worth $X billion" in segment 1, do NOT use that same figure again. If you described something as "unprecedented" once, find a different word next time. Scan your full output before finalizing — if any phrase appears verbatim in two segments, rewrite one.

COMPETITIVE CONTEXT RULE:
When discussing a company, technology, or product, you MUST mention at least one competitor, alternative, or market rival for balanced analysis. Examples: discussing Nvidia → mention AMD, Intel, Google TPUs. Discussing OpenAI → mention Anthropic, Google DeepMind, Meta AI. Discussing Tesla → mention BYD, Rivian, legacy automakers. This gives the viewer market context and shows you understand the landscape.

SOURCE ATTRIBUTION RULE:
When citing numbers, dollar amounts, percentages, or factual claims, include attribution phrases like "according to...", "reports indicate...", "data from X shows...", "leaked documents reveal...", "SEC filings show...". NEVER state a specific statistic as a bare unattributed fact. The viewer needs to know WHERE the information comes from to trust it.

PACING RULES:
- Start with the CONSEQUENCE, then reveal the cause. Don't open with backstory — open with the payoff, then explain how we got there.
- Compress backstory/setup to 1-2 sentences max. Get to the interesting part FAST.
- Every segment must either reveal something new OR re-hook the viewer. No filler, no padding.
- Include at least one PRACTICAL TAKEAWAY the viewer can use (how to find it, what to do, what to avoid, etc.).
- Never introduce an example without setup. Every reference must connect to the main argument.

SENTENCE RHYTHM RULE:
Every segment MUST mix short punchy sentences (2–5 words, e.g., "That's terrifying.", "Full stop.", "Think about that.") with medium-length explanatory sentences (10–20 words). Never write a segment where all sentences are the same length. Vary the rhythm like a drumbeat — short, long, short-short, long.

VIEWER ADDRESS RULE:
Address the viewer directly using "you", "your", or "you're" at least 3 times across the full script. Examples: "your data", "your privacy", "this affects you directly", "you've probably never heard of this." Make the viewer feel personally involved, not like a passive observer.

CRITICAL STRUCTURE RULE:
Do NOT survey the topic broadly with many equal examples. Pick ONE central story, case, or example as your anchor. Build the ENTIRE video around proving that one thing. Other examples are brief supporting evidence only (1-2 sentences max each).

STAKES ESCALATION RULE:
Each segment MUST feel heavier and more urgent than the last. Escalate the stakes like a thriller — start with curiosity, build to concern, arrive at alarm. Use explicit bridge lines between segments to signal escalation:
- "But that's not even the worst part."
- "And it gets worse."
- "That was bad. This is catastrophic."
- "But here's where the story takes a turn nobody expected."
Every segment transition must make the viewer feel the stakes just went up.

ARGUMENT ESCALATION (CRITICAL):
Build your argument like a staircase, not a cliff. Don't drop your boldest claim in the first 30 seconds. Instead:
- Start with something the viewer already suspects is true
- Add a surprising fact that makes them lean in
- Reveal the deeper mechanism or hidden incentive
- THEN hit them with the bold conclusion
Each segment should feel like it earns the next one.

MID-VIDEO RE-HOOKS:
At least twice in the body, insert an open-loop line that makes the viewer want to keep watching:
- "But that's not even the real problem."
- "And this is where the story gets uncomfortable."
- "Because once you follow the money, everything changes."
These go at the END of a segment, teasing the next one.

RETENTION ENGINEERING:
- Insert CURIOSITY LOOPS at natural drop-off points — questions the next section answers within 30 seconds. At least 2 across the script.
- Use MINI CLIFFHANGERS before every transition or topic shift — withhold one detail to pull the viewer forward.
- Include at least one "THIS COULD HAPPEN TO YOU IN ONE CLICK" moment — make the viewer feel personally vulnerable using a daily action (clicking a link, opening an email, using a password).
- ALTERNATE fear with clarity — never stack 3+ fear segments without an explanation beat. Clarity prevents fatigue.
- The MIDPOINT (segment 3 or 4) must INTENSIFY or reveal a bigger implication that reframes everything before it.
- Every line must earn its place: advance the argument, provide a concrete detail, create emotional impact, re-hook the viewer, or give practical value. Cut anything that doesn't.
- Build COMMENT TRIGGERS into the ending — a controversial opinion, binary choice, or personal question that provokes responses.
- The LAST 20 SECONDS must reward viewers: concrete actionable takeaway + narrative callback + quotable final line.

STORY ARC STRUCTURE (CRITICAL):
Follow a personal→institutional→geopolitical arc throughout the script:
- OPEN with immediate personal stakes: the viewer's money, files, identity, or daily routine under threat.
- Move from individual threat to larger system threat gradually — never jump from "your password" to "nation-state warfare" without a bridge.
- Use explicit "this affects you because…" bridge sentences when scaling up from personal to institutional or institutional to geopolitical.
- Bring the viewer back to themselves regularly — after every institutional or geopolitical section, reconnect to their daily life with a concrete "here's what that means for you" beat.
- Place the most relatable example EARLY (first 30%), before any geopolitics. The viewer must feel personally invested before you zoom out.
- Transition into nation-state or macro-scale material with a clear narrative bridge — e.g., "The same vulnerability in your router? Governments exploit it too." Never jump without connecting the scales.
- Limit to ONE big idea per minute. If a segment introduces a new concept, that segment must fully land it before the next segment opens a new one.
- Each section must answer ONE question before opening the next. Do not stack unanswered questions — resolve curiosity before creating new curiosity.
- The arc should feel like concentric circles expanding outward: YOU → YOUR COMPANY → YOUR INDUSTRY → YOUR COUNTRY → THE WORLD — with bridges at every expansion.

ENDING AND CTA RULES (CRITICAL):
- The ending MUST release tension by giving the viewer agency — concrete steps they can take TODAY. Not vague advice like "stay safe online" but specific actions: "Enable 2FA on your email right now", "Check haveibeenpwned.com", "Update your router firmware tonight."
- The practical advice section must feel EARNED — it comes AFTER the viewer fully understands the threat. Never front-load advice before the stakes are clear. The viewer should think "I NEED to do this" not "why are they telling me this?"
- The next-video teaser must feel like an IRRESISTIBLE CONTINUATION, not a generic "stay tuned." Connect it to an unanswered thread from this video — a question raised but not resolved, a bigger player hinted at, or a consequence that deserves its own deep dive. The viewer should feel they're missing out if they don't watch the next one.
- The ending must feel EMPOWERING, not only alarming — the viewer should leave feeling informed AND capable. Balance the fear with a clear survival path. They should feel: "This is serious, but I know what to do."
- NEVER end on pure fear without action. Every alarming conclusion must be followed by a concrete survival path — specific, actionable, achievable steps that make the viewer feel in control. Fear without agency causes click-away, not click-through.

AUDIENCE ADAPTATION (CRITICAL):
- Use SIMPLE language throughout — no jargon, no acronyms without immediate plain-English explanation.
- Frame ALL consequences in terms the viewer personally recognizes: locked files, frozen accounts, fake invoices, stolen logins, frozen POS systems.
- Use audience-facing language: "your files," "your payroll," "your customer data," "your business," "your identity."
- When discussing geopolitics or nation-state threats, ALWAYS connect back to supply chains, utilities, communications, or business systems the viewer uses daily.
- Do NOT overload viewers with intelligence-agency detail too early — start with what they can see and feel, then scale up.
- Protection steps MUST look realistic and manageable — specific, achievable actions (not "hire a CISO" but "turn on 2FA tonight").
- Ensure viewers feel concerned but NOT helpless — every fear beat must be followed by a survival path within 2 segments.
- Provide a clear survival path alongside fear to maintain shareability and satisfaction.
- The viewer should leave thinking "this is serious AND I know what to do" — never pure dread without agency.

HUMAN STORY COLD OPEN RULE:
The first two segments (intro + first section) MUST lead with a named person's story or a real human example. Do NOT open with abstract analysis, statistics without a face, or broad industry trends. Start with a PERSON — their name, what happened to them, why it matters. The viewer needs someone to root for (or against) before you zoom out to the bigger picture.

NARRATION LABEL BAN:
NEVER include "Part 1 of 7", "Section 2 of 5", "Segment 3", or any similar structural labels in the narration text. These are for chapter markers only — use the separate "chapterLabel" field for on-screen chapter text. The narration must flow naturally as spoken words without any structural numbering.

PERSONAL-STAKES-FIRST HOOK (CRITICAL):
The first sentence MUST contain a concrete personal risk — money, files, identity, or business shutdown.
Open with personal stakes that are immediate and familiar before scaling to global implications.
Use 3-5 fast visual beats before the first full explanatory sentence. Each beat is a quick image or text flash
that reinforces the spoken hook visually — so the intro works even with audio low or muted.
The first line must be understandable by someone half-paying attention: short, sharp, personal.
Frame the threat as immediate and familiar before scaling to global issues — personal before global, always.
Build curiosity with a reveal, not just alarm. Tease what the viewer will learn, not just what they should fear.
On-screen text in the intro MUST reinforce the spoken hook so the video works with audio low/muted.

HOOK-FIRST INTRO (CRITICAL):
The first segment (type "intro") MUST open with a specific, attention-grabbing claim, statistic, or question derived from the TOPIC CONTEXT DATA provided below — NOT a generic introduction like "Welcome to", "In this video", "Today we're looking at", or "Let's talk about". Pull a real number, date, event, or consequence from the provided context data and lead with it. If no context data is available, use the topic name itself with style-appropriate dramatic framing — but NEVER fabricate a specific statistic.

DATA-DRIVEN CONTENT (CRITICAL):
At least ONE segment MUST contain a specific numeric data point — a dollar amount, percentage, date, or quantity — sourced from the TOPIC CONTEXT DATA below. When citing this data, attribute it: "according to...", "reports indicate...", "data shows...", "Wikipedia notes...". Do NOT state numbers as bare unattributed facts.

NARRATIVE CALLBACK (CRITICAL):
The FINAL segment (type "outro") MUST reference the hook from the first segment, creating a narrative callback that ties the story together. Echo the opening claim, statistic, or question and show how the full video has reframed or deepened the viewer's understanding of it. The conclusion should feel like the inevitable payoff of the opening hook.
${needsTransition ? `
TRANSITION SEGMENTS:
Since this script has more than 4 segments, you MUST include at least one segment with type "transition" that bridges two thematic sections. A transition segment contains a forward-looking statement that connects what came before to what comes next. Example: "So we've seen the damage. But the real question is: who benefits? And that answer might surprise you." Transition segments should be 3-5 sentences and serve as a narrative pivot point.` : ''}

AUDIO DIRECTION (CRITICAL):
Each segment MUST include an "audioDirection" object that guides sound design:
- "soundBed": Choose the appropriate mood for this segment's content:
  - "building" for intros and escalation moments (drawing viewer in)
  - "tense" for threat/risk/danger content (heightened alertness)
  - "neutral" for explanation/context sections (informative, steady)
  - "calm" for advice/practical/transition sections (reassuring)
  - "release" for outros and resolution moments (tension release)
- "impactCues": Array of sound effect cues aligned to retention-critical lines in this segment. Use:
  - "impact_hit" for stat reveals (dollar amounts, percentages, shocking numbers)
  - "whoosh" for dramatic pivots ("but here's the thing", "and it gets worse")
  - "alert_ping" for breaking news or exposure moments ("leaked", "revealed", "exposed")
  - Empty array [] if no impact moments in this segment
- "sonicSpace": true if this segment contains a major statement, question, or dramatic reveal that benefits from a brief silence before it. Use for rhetorical questions, dramatic pivots, and "the real problem is..." moments. false otherwise.
- "intensity": Number 0-10 representing audio energy level. CRITICAL: Vary intensity across segments to prevent "wall of tension" fatigue. Never have 3+ consecutive segments above 7. Pattern should wave: high → medium → low → high. Intro=6, threats=7-8, explanations=4-5, advice=2-3, outro=4.

OUTPUT FORMAT:
Return ONLY a valid JSON array of segments. No markdown, no preamble.
Each segment:
{
  "type": "intro" | "section" | "transition" | "outro",
  "title": "string (short punchy header, 3-6 words)",
  "narration": "string (MINIMUM 5 sentences, target 60-100 words — written for voiceover, conversational, opinionated, specific. Each sentence adds new information.)",
  "visualNote": "string (specific B-roll: name real people, places, documents, footage types)",
  "duration": number (STRICTLY 15-25 seconds per segment. NEVER exceed 25 seconds.),
  "chapterLabel": "string (optional — short on-screen chapter label, max 50 chars, NOT spoken in narration)",
  "audioDirection": { "soundBed": "building"|"tense"|"neutral"|"calm"|"release", "impactCues": ["impact_hit"|"whoosh"|"alert_ping"], "sonicSpace": boolean, "intensity": number (0-10) }
}

STRUCTURE (${totalSegments} segments):
1. HOOK (intro): Open with the single most COMPELLING or ALARMING concrete fact from the TOPIC CONTEXT DATA — something specific and verifiable. NOT a question, NOT backstory, NOT a prediction, NOT "Welcome to" or "In this video". The very first sentence must be the most shocking concrete detail you have, with attribution. Then immediately tell the viewer why they should keep watching. This segment MUST reference a named person or real human example. MINIMUM 5 sentences.
2. CONTEXT (section): Who is the central person/company? Tell a MINI-STORY about one named individual — what they did, what happened to them, why it matters. This is your emotional anchor. You MUST reference this person again later in the video. This segment continues the human story from the hook. Mention at least one competitor or market rival for context. MINIMUM 5 sentences.
3-${needsTransition ? '3' : '4'}. CORE EVIDENCE (sections): Deep dive into your ONE central example. The most COMPLEX part gets the MOST time — don't rush the hardest-to-understand section. End each segment with a re-hook line teasing the next revelation. Each segment must escalate the stakes beyond the previous one. Include competitive context — who else is in this space and how do they compare? MINIMUM 5 sentences each.${needsTransition ? `
4. BRIDGE (transition): Connect the evidence to the analysis. Summarize what we've learned and pivot to why it matters for the viewer personally. This is a narrative breath — a moment to zoom out before the final push. 3-5 sentences.` : ''}
${needsTransition ? '5' : '5'}. ANALYSIS (section): Why does this matter for the viewer personally? What's your bold, specific prediction backed by 2-3 data points? Reference your named character one more time to close the loop. MINIMUM 5 sentences.
${needsTransition ? '6' : '6'}. CLOSE (outro): MUST reference the hook from segment 1 — echo the opening claim/statistic and show how the video has deepened the viewer's understanding. End with a STATEMENT, not a question. Your final line must be a bold, quotable declaration — something punchy enough to screenshot and share. THEN ask a SPECIFIC BINARY question with exactly two concrete options for comments engagement — the viewer must pick one side. Example: "Is Nvidia's dominance sustainable, or is AMD about to eat their lunch? Drop NVIDIA or AMD in the comments." Do NOT use lazy engagement bait like "yes or no in the comments" without specifying what the yes/no is about. THEN tease a SPECIFIC related next topic by name. Do NOT use generic phrases like "stay tuned", "more videos coming soon", or "thanks for watching". MINIMUM 5 sentences.

Channel Style: ${config.style.replace('_', ' ')}
Tone: ${tone} — with personality and conviction.
Target Audience: ${config.audience || 'General audience'}
Target Duration: ${config.targetDuration} minutes`;

  const safeTopic = sanitiseTopic(config.topic);

  // Fetch Wikipedia context and DDG web context in parallel for richer data
  const [wikiCtx, webContext] = await Promise.all([
    fetchWikiContext(safeTopic),
    fetchTopicContext(safeTopic),
  ]);

  // Build the topic context data block for the LLM
  const hasExtract = wikiCtx.extract.length > 0;
  const hasDescription = wikiCtx.description.length > 0;
  let topicDataBlock = '';
  if (hasExtract || hasDescription) {
    topicDataBlock = `\n=== TOPIC CONTEXT DATA (from Wikipedia — use this for specific facts, numbers, and attribution) ===`;
    if (hasDescription) topicDataBlock += `\nDescription: ${wikiCtx.description}`;
    if (hasExtract) topicDataBlock += `\nExtract: ${wikiCtx.extract}`;
    topicDataBlock += `\n=== END TOPIC CONTEXT DATA ===\n`;
  } else {
    topicDataBlock = `\n=== TOPIC CONTEXT DATA ===\nNo Wikipedia data available for "${safeTopic}". Use the topic name and your knowledge to craft the hook. Do NOT fabricate specific statistics — instead use style-appropriate dramatic framing based on what is publicly known about this topic.\n=== END TOPIC CONTEXT DATA ===\n`;
  }

  const userPrompt = `Write a ${config.targetDuration}-minute video script about: "${safeTopic}"
${topicDataBlock}${webContext}
CRITICAL RULES:
1. HOOK-FIRST: The intro MUST open with a specific claim, statistic, or consequence derived from the TOPIC CONTEXT DATA above — NOT "Welcome to", "In this video", or any generic opener. If context data is available, pull a real number or fact from it and attribute it. If no context data is available, use dramatic framing around the topic name without fabricating statistics.
2. Pick ONE central story/example and build the whole video around it. Don't list 5+ equal examples.
3. The first two segments (intro + first section) MUST lead with a named person's story or real human example. Tell a MINI-STORY about one NAMED real person — reference them at least TWICE: once when introduced, and once later when the lesson connects back to them.
4. Each segment MUST escalate stakes beyond the previous one. Build like a staircase — curiosity → concern → alarm. Use explicit bridge lines: "But that's not even the worst part", "And it gets worse."
5. Include at least 2 MID-VIDEO RE-HOOKS — open-loop lines at the end of segments that tease the next revelation.
6. DATA-DRIVEN: At least ONE segment must contain a specific numeric data point (dollar amount, percentage, date, or quantity) from the TOPIC CONTEXT DATA. Attribute it: "according to Wikipedia...", "reports indicate...", "data shows...". Never state numbers as bare facts.
7. NARRATIVE CALLBACK: The outro MUST reference the hook from segment 1. Echo the opening claim and show how the video deepened the viewer's understanding. The conclusion should feel like the payoff of the opening.
8. DEPTH: Each segment MUST be at least 5 sentences. No thin 2-3 sentence segments. Every segment introduces new information — never repeat a phrase or key fact from another segment.
9. COMPETITIVE CONTEXT: When discussing a company or technology, mention at least one competitor or alternative. Nvidia → AMD/Intel/Google TPUs. Tesla → BYD/Rivian. OpenAI → Anthropic/Google. This shows market awareness.
10. SOURCE ATTRIBUTION: When citing numbers or claims, use "according to...", "reports indicate...", "data from X shows..." — never state specific statistics as bare unattributed facts.
11. NO REPETITION: Never repeat the same phrase, sentence, or key descriptor across segments. Each segment must introduce NEW information. Scan your output — if any phrase appears verbatim in two segments, rewrite one.${needsTransition ? `
12. TRANSITION: Include at least one segment with type "transition" that bridges two thematic sections with a forward-looking statement.` : ''}
13. Your PREDICTION must be bold, specific, AND backed by 2-3 concrete data points or trends. Not just "within five years" — say WHY with evidence.
14. The LAST LINE of the video must be quotable — punchy enough to screenshot and share. It should feel like the inevitable conclusion of the whole argument.
15. Include ONE concrete, specific action the viewer can take TODAY (not "lobby your representatives" — something like "Google X", "check Y website", "look at your Z"). Then end with a SPECIFIC BINARY question with two concrete options (not lazy "yes or no" — name what the yes/no is about) + simple subscribe CTA. THEN tease a SPECIFIC related next topic by name. BANNED in outro: "thanks for watching", "stay tuned", "more videos coming soon", "find out what happens next", "let me know your thoughts", "yes or no in the comments" (without specifying the question).
16. The MOST COMPLEX section needs the MOST time, not the least. Don't rush through the hardest-to-understand part — that's where viewers need you most.
17. Write for spoken delivery — short sentences, conversational, no dense formal language.
18. Every segment MUST mix short (2–5 word) and medium (10–20 word) sentences. Vary the rhythm like a drumbeat — never write a segment where all sentences are the same length.
19. Include at least 3 "you/your" direct viewer addresses across the full script. Make the viewer feel personally involved: "your data", "this affects you", "you've probably never heard of this."
20. Every technical term, acronym, or jargon MUST be followed immediately by a vivid metaphor or analogy — not just a parenthetical definition.
21. NO "Part X of Y", "Section X", or "Segment X" labels in narration text. Use the "chapterLabel" field for on-screen chapter markers instead.
22. BANNED: "imagine", "what if", "all eyes on", "game changer", "critical moment", "time will tell", "remains to be seen", "no seriously", "at best", "basically", "let me know your thoughts", "let's be serious", "thanks for watching", "find out what happens next", "stay tuned", "more videos coming soon", "Welcome to", "In this video"
23. Each segment MUST be 15-25 seconds. If your narration is longer than 25 seconds of spoken content, split it into two segments or cut it down.
24. Write for the target audience: ${config.audience || 'general viewers'}. Adjust vocabulary, examples, and depth accordingly.

Total segments: ${totalSegments}`;

  // Bug 9 fix: bail before initiating a network request if already cancelled
  if (signal?.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError');
  }

  // Audience adaptation: append audience-specific prompt modifier to system prompt
  const audienceModifier = getAudiencePromptModifier(config.audience || '');
  const finalSystemPrompt = systemPrompt + '\n' + audienceModifier;

  const response = await fetchWithTimeout(OPENROUTER_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://autotube.video',
      'X-Title': 'AutoTube AI Generator',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: finalSystemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
    }),
  }, {
    timeoutMs: 30_000,
    maxRetries: 3,
    signal,
  });

  if (!response.ok) {
    const err = await response.text();
    logger.error('OpenRouter', `Script generation failed (Status: ${response.status})`, err);
    throw new Error(`OpenRouter Error: ${err}`);
  }

  const data = await response.json();
  logger.success('OpenRouter', 'Successfully generated script structure.');

  const rawContent: unknown = data?.choices?.[0]?.message?.content;
  if (typeof rawContent !== 'string' || !rawContent.trim()) {
    logger.warn('OpenRouter', 'API returned no content in response');
    throw new Error('AI returned empty response');
  }

  try {
    let segments = parseSegmentsFromContent(rawContent);
    // Safety net: inject a transition segment if the LLM forgot one (Requirement 1.2)
    segments = injectTransitionIfMissing(segments);
    // Enforce duration cap — LLM sometimes ignores the 25s constraint
    for (const seg of segments) {
      if (seg.duration > 25) seg.duration = 25;
    }
    logger.info('OpenRouter', `Parsed ${segments.length} validated segments`);
    return segments;
  } catch (parseErr) {
    logger.error('OpenRouter', 'Failed to parse AI script content', parseErr);
    throw new Error(`AI returned invalid structure: ${(parseErr as Error).message}`);
  }
}

// ---------------------------------------------------------------------------
// Hook Variant Generation — produces multiple hook options ranked by quality
// ---------------------------------------------------------------------------

/**
 * Represents a single hook variant with scoring metadata.
 */
export interface HookVariant {
  /** The hook text (first 1-3 sentences of the intro). */
  text: string;
  /** On-screen text that reinforces the spoken hook for muted viewing. */
  onScreenText: string;
  /** Clarity score: how immediately understandable is this hook? (1-10) */
  clarity: number;
  /** Intensity score: how emotionally compelling is this hook? (1-10) */
  intensity: number;
  /** Retention potential: how likely is the viewer to keep watching? (1-10) */
  retentionPotential: number;
  /** Combined weighted score for ranking. */
  overallScore: number;
}

/**
 * Generates multiple hook variants for a given topic and ranks them by
 * clarity, intensity, and retention potential.
 *
 * Each hook follows the personal-stakes-first pattern:
 * - Opens with concrete personal risk (money, files, identity, business shutdown)
 * - Uses 3-5 fast visual beats before first full explanatory sentence
 * - First line understandable by someone half-paying attention
 * - Frames threat as immediate and familiar before scaling to global
 * - Builds curiosity with a reveal, not just alarm
 * - Includes on-screen text reinforcement for muted/low-audio viewing
 */
export function generateHookVariants(
  topic: string,
  style: string,
  audience: string,
): HookVariant[] {
  const safeTopic = sanitiseTopic(topic);

  // Generate hook variants using different emotional angles
  const variants: HookVariant[] = [
    // Variant 1: Direct personal loss angle
    {
      text: `Your ${getPersonalAsset(audience)} could be gone by tomorrow morning. No warning. No recovery option. ${safeTopic} — and the people behind it already have your information.`,
      onScreenText: `YOUR ${getPersonalAsset(audience).toUpperCase()} AT RISK`,
      clarity: 9,
      intensity: 8,
      retentionPotential: 8,
      overallScore: 0,
    },
    // Variant 2: Curiosity-driven reveal angle
    {
      text: `There's a reason you haven't heard about this yet. ${safeTopic} is already affecting millions — and the real story is worse than the headlines suggest.`,
      onScreenText: `WHAT THEY'RE NOT TELLING YOU`,
      clarity: 7,
      intensity: 7,
      retentionPotential: 9,
      overallScore: 0,
    },
    // Variant 3: Immediate familiar threat angle
    {
      text: `That notification you ignored last week? It might have been your last chance. ${safeTopic} moves fast — and it starts with something as simple as one click.`,
      onScreenText: `ONE CLICK. EVERYTHING GONE.`,
      clarity: 8,
      intensity: 9,
      retentionPotential: 8,
      overallScore: 0,
    },
  ];

  // Score and rank variants
  for (const variant of variants) {
    variant.overallScore = scoreHookVariant(variant);
  }

  // Sort by overall score descending (best hook first)
  variants.sort((a, b) => b.overallScore - a.overallScore);

  return variants;
}

/**
 * Scores a hook variant using weighted factors for clarity, intensity,
 * and retention potential.
 */
function scoreHookVariant(variant: HookVariant): number {
  // Weights: clarity (0.35), intensity (0.30), retention (0.35)
  return (
    variant.clarity * 0.35 +
    variant.intensity * 0.30 +
    variant.retentionPotential * 0.35
  );
}

/**
 * Returns the most relevant personal asset term for the target audience.
 */
function getPersonalAsset(audience: string): string {
  const lower = audience.toLowerCase();
  if (lower.includes('business') || lower.includes('smb') || lower.includes('entrepreneur')) {
    return 'business';
  }
  if (lower.includes('freelance') || lower.includes('creator')) {
    return 'client data';
  }
  if (lower.includes('finance') || lower.includes('investor')) {
    return 'money';
  }
  return 'files';
}

// ---------------------------------------------------------------------------
// Audience-Specific Prompt Modifiers
// ---------------------------------------------------------------------------

/**
 * Returns audience-specific prompt additions that tailor language, examples,
 * and framing for the target audience. Supports consumers, freelancers,
 * and small business owners.
 *
 * The modifier enforces:
 * - Simple language and familiar visual examples for non-technical adults
 * - Audience-specific concerns and consequences they recognize immediately
 * - Audience-facing language ("your files," "your payroll," "your customer data")
 * - Realistic and manageable protection steps
 * - Concerned but not helpless tone (survival path alongside fear)
 */
export function getAudiencePromptModifier(audience: string): string {
  const lower = audience.toLowerCase();

  if (lower.includes('small business') || lower.includes('smb') || lower.includes('business owner')) {
    return `
AUDIENCE-SPECIFIC ADAPTATION — SMALL BUSINESS OWNERS:
- Address what they care most about: downtime, money loss, customer trust, and operational paralysis.
- Show consequences they recognize immediately: frozen POS systems, locked accounting software, fake invoices from "vendors," customer data leaked online, payroll frozen mid-cycle.
- Use their language: "your shop," "your payroll," "your customer list," "your point-of-sale," "your business account," "your reputation."
- Frame threats as business-ending events: "one ransomware attack can shut your doors for a week" not "cybercriminals target SMBs."
- Protection steps must be realistic for a 5-50 person company: "set up automatic backups tonight," "add 2FA to your business email," "train your staff on phishing in a 10-minute meeting."
- Never suggest enterprise-scale solutions (SOC teams, SIEM platforms) — keep advice achievable with limited IT budget.
- Connect geopolitical threats to their supply chain: "when a nation-state hits a shipping company, YOUR deliveries stop."
- Balance fear with agency: after every threat, show a concrete step they can take THIS WEEK to reduce risk.
- Avoid jargon entirely — no "attack vectors," "threat actors," or "zero-days" without immediate plain-English translation using business analogies.`;
  }

  if (lower.includes('freelance') || lower.includes('creator') || lower.includes('contractor') || lower.includes('self-employed')) {
    return `
AUDIENCE-SPECIFIC ADAPTATION — FREELANCERS:
- Address what they care most about: identity theft, account lockout, invoice fraud, lost client data, and reputation damage.
- Show consequences they recognize immediately: locked email with all client contracts, fake invoices sent to their clients, stolen portfolio, PayPal/Stripe account frozen, tax identity stolen.
- Use their language: "your client list," "your invoices," "your portfolio," "your PayPal," "your reputation," "your next gig."
- Frame threats as income-ending events: "one compromised email means your clients get fake invoices with someone else's bank details" not "phishing attacks are increasing."
- Protection steps must be realistic for a solo operator: "use a password manager — takes 20 minutes to set up," "separate your business email from personal," "back up your portfolio to a second cloud service tonight."
- Never suggest team-based solutions — keep advice achievable by one person in one evening.
- Connect larger threats to their daily workflow: "when a platform gets breached, YOUR login credentials end up for sale."
- Balance fear with agency: after every threat, show a specific tool or habit that neutralizes it.
- Avoid technical jargon — translate everything into freelancer workflow terms.`;
  }

  // Default: consumers / general audience
  return `
AUDIENCE-SPECIFIC ADAPTATION — CONSUMERS:
- Address what they care most about: personal files, photos, banking access, identity, and family safety online.
- Show consequences they recognize immediately: locked personal photos, drained bank account, stolen identity used for loans, kids' social media hacked, smart home devices compromised.
- Use their language: "your photos," "your bank account," "your passwords," "your kids' accounts," "your phone," "your Wi-Fi."
- Frame threats as personal violations: "someone drains your savings while you sleep" not "financial cybercrime is rising."
- Protection steps must be realistic for everyday people: "change your email password tonight," "turn on 2FA — it takes 2 minutes," "check haveibeenpwned.com right now," "update your router — the button is on the back."
- Never assume technical knowledge — explain every step as if teaching a parent or neighbor.
- Connect larger threats to daily life: "when a hospital gets hacked, YOUR medical records end up for sale on the dark web."
- Balance fear with agency: after every scary example, immediately show what they can do TODAY to protect themselves.
- Avoid ALL jargon — no "vectors," "exploits," "zero-days," "lateral movement." Use plain English: "hackers get in through," "they spread to other devices," "a flaw nobody knew about."`;
}
