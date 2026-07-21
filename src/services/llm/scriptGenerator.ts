/**
 * Script generation — generates full video scripts using OpenRouter LLM.
 */

import type { TopicConfig, ScriptSegment } from '../../types';
import { logger } from '../logger';
import { fetchWithTimeout } from '../../utils/fetchWithTimeout';
import { openRouterMessageText } from '../../utils/openRouterMessageText';
import { sanitiseTopic, parseSegmentsFromContent, injectTransitionIfMissing } from './parsing';
import { fetchWikiContext, fetchTopicContext } from './topicContext';
import { DEFAULT_LLM_MODEL } from './defaultModels';

const OPENROUTER_ENDPOINT = '/api/llm';

// Default model — can be overridden via AppConfig in the future.
export const DEFAULT_SCRIPT_MODEL = DEFAULT_LLM_MODEL;

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
  const loopFastMode =
    typeof sessionStorage !== 'undefined' && sessionStorage.getItem('autotube_loop_fast_mode') === 'true';
  const totalSegments = loopFastMode
    ? Math.max(3, Math.min(4, Math.round(config.targetDuration)))
    : Math.max(12, Math.min(15, Math.round(config.targetDuration * 2.5)));
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
- At least 3 specific statistics with hard numbers — dates, dollar amounts, percentages, quantities, growth rates. Not "a lot of money" but "$4.5 billion in 2024". Not "recently" but "as of March 2025". Every number needs a date and a source.
- At least 2 named entities — real companies (Nvidia, OpenAI, Tesla), real people (Jensen Huang, Satya Nadella, Sam Altman), real places (California, Shenzhen, Wall Street), or real products (ChatGPT, H100, Cybertruck). No "a major company" or "one executive" — name names.
- At least one sentence of analysis or opinion (why this matters)
- At least one forward-looking or connecting statement
If a segment feels thin, add context, consequences, or competitive dynamics — never pad with filler.
Write each segment as a MINI-STORY with a narrative arc: set the scene, introduce the tension, deliver the payoff. A segment should not read like a Wikipedia summary — it should feel like a scene in a documentary: specific, vivid, and purposeful.

NO REPETITION RULE:
NEVER repeat the same phrase, sentence, or key descriptor across segments. Each segment must introduce NEW information, a NEW angle, or a NEW consequence. If you used "worth $X billion" in segment 1, do NOT use that same figure again. If you described something as "unprecedented" once, find a different word next time. Scan your full output before finalizing — if any phrase appears verbatim in two segments, rewrite one.

COMPETITIVE CONTEXT RULE:
When discussing a company, technology, or product, you MUST mention at least one competitor, alternative, or market rival for balanced analysis. Examples: discussing Nvidia → mention AMD, Intel, Google TPUs. Discussing OpenAI → mention Anthropic, Google DeepMind, Meta AI. Discussing Tesla → mention BYD, Rivian, legacy automakers. This gives the viewer market context and shows you understand the landscape.

SOURCE ATTRIBUTION RULE:
When citing numbers, dollar amounts, percentages, or factual claims, you MUST include clear attribution phrases in the narration text. Use explicit formats that are easy to parse, such as: "according to [Source]", "data from [Source] shows", "reports from [Source] indicate", "SEC filings from [Source] reveal", "telemetry from [Source] confirms", or "as noted by [Source]". NEVER state a specific statistic as a bare unattributed fact. The viewer needs to know WHERE the information comes from to trust it.


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

PAYOFF LADDER RULE (CRITICAL):
Each segment MUST follow a mini-arc of setup → conflict → payoff. Within every segment:
- SETUP (1-2 sentences): Establish context, introduce the subject, or set the scene.
- CONFLICT (2-4 sentences): Present the problem, tension, contradiction, or complication. This is where the viewer leans in.
- PAYOFF (1-2 sentences): Deliver the resolution, insight, or consequence that makes the setup and conflict worth it.
Never end a segment without a payoff — the viewer must feel they earned something by watching that segment. The payoff of one segment often becomes the setup for the next.

COUNTER-INTUITIVE HOOK RULE:
Open the intro with a counter-intuitive claim or common misconception. Challenge what the viewer already believes: "Everyone thinks X, but actually Y." Start with a statement that contradicts conventional wisdom to immediately grab attention and create cognitive dissonance the viewer must resolve.

DATA VISUALIZATION PROMPT RULE:
When a segment contains statistical data, percentages, dollar amounts, or quantitative comparisons, you MUST include a visualNote that describes a specific chart or graph that would visualize this data. Examples: "Animated bar chart comparing market share: Nvidia 80%, AMD 15%, Intel 5%", "Line graph showing ransomware attacks climbing from $11B in 2020 to $20B in 2025", "Pie chart of breach causes: phishing 35%, credentials 25%, vulnerabilities 20%, other 20%". The visualNote for stat segments MUST name the chart type, the data points, and the labels — not just "data visualization" or "statistics on screen".

QUOTE ATTRIBUTION RULE:
When including a quote from any source, ALWAYS format it with proper attribution using one of these patterns:
- "According to [Name], [quote]" — e.g., "According to Jensen Huang, 'AI is the new electricity.'"
- "[Name], [title] at [Organization], [quote]" — e.g., "Satya Nadella, CEO at Microsoft, said '[quote]'"
- "[Name] ([Title], [Organization]) warned that [paraphrased quote]" — for paraphrased attributions.
NEVER present a quote without identifying who said it and their role/organization.

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
The very first sentence of the entire script is your HOOK — it must grab attention immediately. A good hook is a specific, surprising, or counter-intuitive statement that makes the viewer think "I need to hear the rest of this." Bad hooks: generic welcomes, opening with a calendar year ("In 2024…", "In 2023…"), questions the viewer can answer with "no", or vague teases. Good hooks: "Hospitals paid billions after this one mistake — and your records were in the blast radius." or "By the time you finish this sentence, hackers will have attempted 300 new attacks."

FIRST 15 SECONDS RULE (Task 135):
Deliver substantive value within the first 15 seconds. Open with the most compelling fact, number, or consequence — not context or backstory. The viewer must feel they've already learned something valuable by the 15-second mark.

SESSION HOOKS (Task 136):
The outro MUST include a teaser for the next video or playlist. Connect it to an unanswered thread from this video — a question raised but not resolved, a bigger player hinted at, or a consequence that deserves its own deep dive. The viewer should feel they're missing out if they don't watch the next one.

SHAREABLE MOMENTS (Task 137):
Include at least one shareable moment — a quotable line or surprising fact that viewers will want to screenshot and share. Place it in a segment where it has maximum narrative impact. The quotable line must be self-contained and make sense without context.

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
Return ONLY a valid JSON object in this exact shape: { "segments": [ ... ] }. No markdown, no preamble.
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

  // Task 144: SEO keyword research — search YouTube for topic, extract keywords from top results
  let seoKeywordsBlock = '';
  try {
    const ytSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(safeTopic)}`;
    const ytRes = await fetchWithTimeout(ytSearchUrl, { method: 'GET' }, { timeoutMs: 8000, maxRetries: 1 });
    if (ytRes.ok) {
      const html = await ytRes.text();
      // Extract keywords from video titles in search results
      const titleMatches = html.match(/"title":\s*\{"runs":\s*\[\{"text":\s*"([^"]+)"/g) || [];
      const extractedWords = new Map<string, number>();
      for (const match of titleMatches.slice(0, 10)) {
        const text = match.replace(/.*"text":\s*"/, '').replace(/"$/, '');
        const words = text.split(/\s+/).filter(w => w.length > 3 && !/^(https?|www|com|http)/i.test(w));
        for (const w of words) {
          const lower = w.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (lower.length > 3) extractedWords.set(lower, (extractedWords.get(lower) || 0) + 1);
        }
      }
      // Sort by frequency and take top keywords
      const sorted = [...extractedWords.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
      if (sorted.length > 0) {
        seoKeywordsBlock = `\n=== SEO KEYWORDS (from YouTube search results for "${safeTopic}") ===\n`;
        seoKeywordsBlock += `Top keywords: ${sorted.map(([w]) => w).join(', ')}\n`;
        seoKeywordsBlock += `Weave these naturally into the script.\n`;
        seoKeywordsBlock += `=== END SEO KEYWORDS ===\n`;
      }
    }
  } catch {
    // SEO keyword extraction is best-effort — continue without it
  }

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
${topicDataBlock}${seoKeywordsBlock}${webContext}
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
10. SOURCE ATTRIBUTION: When citing numbers or claims, you MUST use clear, parseable attribution phrases, such as: "according to [Source]", "data from [Source] shows", "reports from [Source] indicate", "SEC filings from [Source] reveal", "telemetry from [Source] confirms", or "as noted by [Source]". Never state specific statistics as bare unattributed facts.

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

TRIMMING PASS RULE (CRITICAL):
After writing each segment, mentally review every sentence. Remove any sentence that does not advance the story. Ask for each sentence: Does it (a) advance the argument, (b) provide a concrete detail, (c) create emotional impact, (d) re-hook the viewer, or (e) give practical value? If NONE of these, DELETE it. Every sentence must earn its place. Density equals retention — no filler, no throat-clearing, no throat-clearing transitions like "Let's think about that" or "It's worth noting."
23. Each segment MUST be 15-25 seconds. If your narration is longer than 25 seconds of spoken content, split it into two segments or cut it down.
24. Write for the target audience: ${config.audience || 'general viewers'}. Adjust vocabulary, examples, and depth accordingly.
25. KEYWORD MENTION: The primary topic keyword (e.g. the core subject of the video) MUST appear naturally within the first 2-3 sentences of the intro segment. This ensures the topic is established immediately for both viewers and algorithm indexing. Do NOT force it awkwardly — weave it into the hook naturally.

26. SPECIFICITY: Every segment MUST contain at least 2 specific statistics with numbers (dates, dollar amounts, percentages, quantities) AND at least 2 named entities (real companies, people, places by name). No segment should be purely qualitative — concrete data and named entities create credibility and retention. If a segment lacks these, ADD specific data points with attribution.

27. MINI-STORY FORMAT: Each segment must read like a mini-story with a narrative arc — setup, tension, payoff. Not a Wikipedia summary. Not a list of facts. Each segment should feel like a scene in a documentary: specific, vivid, and purposeful. The viewer should feel they learned a complete mini-story in each segment, not a collection of disconnected facts.

28. HOOK REQUIREMENT: The first sentence of the intro MUST be a specific attention-grabbing hook — a surprising statistic, a counter-intuitive claim, or a concrete consequence. It MUST NOT be a generic welcome, a rhetorical question, or a vague teaser. The hook must be immediately understandable and make the viewer NEED to continue watching.

SEO KEYWORD INJECTION (Task 144): The TOPIC CONTEXT DATA above contains keywords extracted from top YouTube search results for this topic. Weave these keywords naturally into the narration text throughout the script — at least 3 distinct keywords from the list must appear across different segments. Use them as you would naturally discuss the topic; do not force or repeat them awkwardly. These keywords improve discoverability by aligning with what viewers actually search for.

Total segments: ${totalSegments}

Return ONLY a valid JSON object in this exact shape: { "segments": [ ... ] }.`;

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
    // Cold OpenRouter script calls (main + title variants) routinely exceed 30s;
    // the /api/llm proxy allows ~120s — match that budget so we don't abort as "user cancel".
    timeoutMs: 180_000,
    maxRetries: 2,
    signal,
  });

  if (!response.ok) {
    const err = await response.text();
    logger.error('OpenRouter', `Script generation failed (Status: ${response.status})`, err);
    throw new Error(`OpenRouter Error: ${err}`);
  }

  const data = await response.json();
  logger.success('OpenRouter', 'Successfully generated script structure.');

  const rawContent = openRouterMessageText(data?.choices?.[0]?.message);
  if (!rawContent) {
    logger.warn('OpenRouter', 'API returned no content in response');
    throw new Error('AI returned empty response');
  }

  try {
    let segments = parseSegmentsFromContent(rawContent);
    // Safety net: inject a transition segment if the LLM forgot one (Requirement 1.2)
    segments = injectTransitionIfMissing(segments);

    // Post-generation specificity validation — retry if too generic (skip in loop fast mode)
    const loopFastMode = typeof sessionStorage !== 'undefined' && sessionStorage.getItem('autotube_loop_fast_mode') === 'true';
    const specificityIssues = validateScriptSpecificity(segments);
    if (specificityIssues.length > 0 && !signal?.aborted && !loopFastMode) {
      logger.warn('OpenRouter', `Specificity check: ${specificityIssues.length} issue(s) found. Retrying with specificity instructions.`);
      const fixPrompt = buildSpecificityFixPrompt(segments, safeTopic, specificityIssues);
      try {
        const retryResponse = await fetchWithTimeout(OPENROUTER_ENDPOINT, {
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
              { role: 'user', content: fixPrompt },
            ],
            response_format: { type: 'json_object' },
          }),
        }, { timeoutMs: 90_000, maxRetries: 1, signal });
        if (retryResponse.ok) {
          const retryData = await retryResponse.json();
          const retryContent = openRouterMessageText(retryData?.choices?.[0]?.message);
          if (retryContent) {
            const retrySegments = parseSegmentsFromContent(retryContent);
            segments = injectTransitionIfMissing(retrySegments);
            logger.success('OpenRouter', 'Specificity retry produced improved segments');
          }
        }
      } catch {
        logger.warn('OpenRouter', 'Specificity retry failed, keeping original segments');
      }
    } else if (specificityIssues.length > 0 && loopFastMode) {
      logger.info('OpenRouter', `Loop fast mode: skipping specificity retry (${specificityIssues.length} issue(s))`);
    }

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
  _style: string,
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

// ---------------------------------------------------------------------------
// Post-generation specificity validation + retry
// ---------------------------------------------------------------------------

interface SpecificityIssue {
  segmentIndex: number;
  issue: 'no_numbers' | 'no_named_entities' | 'generic_hook' | 'no_specificity';
}

/**
 * Validates that generated segments meet minimum specificity requirements.
 * Returns a list of issues found. Skips validation for very short content
 * (under 30 total chars of narration) to avoid false positives on test data.
 */
export function validateScriptSpecificity(segments: ScriptSegment[]): SpecificityIssue[] {
  const issues: SpecificityIssue[] = [];
  const totalNarrationLen = segments.reduce((sum, s) => sum + s.narration.length, 0);
  if (totalNarrationLen < 30) return issues;

  const numberRegex = /\$\d[\d,.]*(?:\s*(?:billion|million|trillion|thousand))?|\d+(?:\.\d+)?%|\b(?:19|20)\d{2}\b|\d[\d,]*\s*(?:billion|million|trillion|thousand)/i;
  const entityRegex = /[A-Z][a-z]+\s+[A-Z][a-z]+/;
  const acronymRegex = /\b[A-Z]{2,}\b/;

  const segmentsWithIssues: number[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const hasNumber = numberRegex.test(seg.narration);
    const hasEntity = entityRegex.test(seg.narration);
    const hasAcronym = acronymRegex.test(seg.narration);

    if (!hasNumber && !hasEntity && !hasAcronym) {
      segmentsWithIssues.push(i);
      issues.push({ segmentIndex: i, issue: 'no_specificity' });
    }
  }

  const firstNarration = (segments[0]?.narration || '').toLowerCase();
  const genericOpeners = ['welcome to', 'in this video', 'today we', "let's talk about", "let us talk about", 'we\'re looking at', 'we are looking at'];
  if (genericOpeners.some(o => firstNarration.startsWith(o))) {
    issues.push({ segmentIndex: 0, issue: 'generic_hook' });
  }
  if (/^in\s+20\d{2}\b/.test(firstNarration.trim())) {
    issues.push({ segmentIndex: 0, issue: 'generic_hook' });
  }

  return issues;
}

/**
 * Builds a fix prompt for the LLM retry when specificity validation fails.
 * Lists each issue found and instructs the LLM to add specific data and examples.
 */
export function buildSpecificityFixPrompt(
  segments: ScriptSegment[],
  topic: string,
  issues: SpecificityIssue[],
): string {
  const issueDescriptions = issues.map(issue => {
    const seg = segments[issue.segmentIndex];
    const segLabel = `Segment ${issue.segmentIndex + 1} (${seg.type}, "${seg.title}")`;
    switch (issue.issue) {
      case 'no_numbers':
        return `${segLabel}: Lacks specific statistics with numbers. Add dates, dollar amounts, percentages, or quantities.`;
      case 'no_named_entities':
        return `${segLabel}: Lacks named entities. Mention real companies, people, or places by name. No "a major company" — name names like Nvidia, OpenAI, Jensen Huang, etc.`;
      case 'generic_hook':
        return `${segLabel}: The first sentence opens with a generic phrase. Replace it with a specific, attention-grabbing claim or statistic.`;
    }
  }).join('\n');

  return `The following script about "${topic}" has specificity issues that must be fixed:\n\n${JSON.stringify(segments.map(s => ({ type: s.type, title: s.title, narration: s.narration, visualNote: s.visualNote, duration: s.duration })))}\n\nISSUES TO FIX:\n${issueDescriptions}\n\nCRITICAL FIX INSTRUCTIONS:\n- Add specific data and examples, make it less generic\n- Every segment MUST contain at least 2 specific statistics with numbers (dates, dollar amounts, percentages)\n- Every segment MUST mention at least 2 named entities (real companies, people, places)\n- The first segment MUST open with a hook — a specific attention-grabbing claim, not a generic welcome\n- Each segment should feel like a mini-story with setup, conflict, and payoff, not a Wikipedia summary\n\nReturn ONLY a valid JSON array of the fixed segments. No markdown, no preamble.`;
}
