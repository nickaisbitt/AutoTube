/**
 * Script review — quality review and improvement via a second LLM pass.
 */

import type { ScriptSegment } from '../../types';
import { logger } from '../logger';
import { fetchWithTimeout } from '../../utils/fetchWithTimeout';
import { assignPurposeTag, computePacingScore } from '../renderingShared';
import { sanitiseTopic, parseSegmentsFromContent, validateSegment } from './parsing';
import { DEFAULT_SCRIPT_MODEL } from './scriptGenerator';

const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

// ---------------------------------------------------------------------------
// Promise-payoff validation helper (Requirement 9)
// ---------------------------------------------------------------------------

/**
 * Regex matching common promise/hype transition phrases that set viewer expectations.
 */
const PROMISE_PHRASE_REGEX =
  /\b(but here'?s where it gets interesting|and that'?s not even the worst part|here'?s the thing|what happened next changed everything|and it gets worse|but wait|here'?s where the story takes a turn|the real question is|and this is where it gets uncomfortable|but that'?s not even the real problem|and once you follow the money)\b/i;

/**
 * Counts concrete details in a narration string.
 * Concrete details include: proper nouns (capitalized multi-word names), numbers,
 * dollar amounts, percentages, dates (years or month+year), and specific events.
 */
function countConcreteDetails(narration: string): number {
  let count = 0;
  // Dollar amounts
  count += (narration.match(/\$[\d,.]+\s*(billion|million|trillion|thousand)?/gi) || []).length;
  // Percentages
  count += (narration.match(/\d+(\.\d+)?%/g) || []).length;
  // Years (4-digit numbers that look like years)
  count += (narration.match(/\b(19|20)\d{2}\b/g) || []).length;
  // Large numbers with units
  count += (narration.match(/\d[\d,]*\s*(billion|million|trillion|thousand)/gi) || []).length;
  // Proper nouns (capitalized words that aren't sentence starters — approximate by looking for 2+ consecutive capitalized words)
  count += (narration.match(/[A-Z][a-z]+\s+[A-Z][a-z]+/g) || []).length;
  return count;
}

/**
 * Checks segments for promise phrases followed by weak payoff segments.
 * Logs a warning for each instance where enrichment appears to have failed.
 * (Requirement 9.3 — retain original and log warning if enrichment fails)
 */
function checkPromisePayoff(segments: ScriptSegment[]): void {
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    if (PROMISE_PHRASE_REGEX.test(seg.narration)) {
      const nextSeg = segments[i + 1];
      const detailCount = countConcreteDetails(nextSeg.narration);
      if (detailCount < 3) {
        logger.warn(
          'ScriptReview',
          `Promise-payoff gap: segment ${i} ("${seg.title}") contains a promise phrase but segment ${i + 1} ("${nextSeg.title}") has only ${detailCount} concrete detail(s). Enrichment may have failed — retaining original.`,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Script review LLM pass (Step 7)
// ---------------------------------------------------------------------------

/**
 * Sends generated script segments to the LLM for quality review and improvement.
 * Returns improved segments, or the originals if the review fails.
 */
export async function reviewAndImproveScript(
  segments: ScriptSegment[],
  topic: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<ScriptSegment[]> {
  const systemPrompt =
    'You are a YouTube script editor. Review this script and rewrite any weak sections. Return the improved script as a JSON array of segments with the same structure.';

  const scriptJson = JSON.stringify(
    segments.map((s) => ({
      type: s.type,
      title: s.title,
      narration: s.narration,
      visualNote: s.visualNote,
      duration: s.duration,
    })),
  );

  const userPrompt = `Here is the script for a video about "${sanitiseTopic(topic)}":\n\n${scriptJson}\n\nReview and improve it using the QUALITY CHECKLIST below. For EVERY item, check the script and FIX any violations by rewriting the affected segments.\n\n=== QUALITY CHECKLIST ===\n\n1. HOOK CHECK (intro segment):\n   - The intro's FIRST sentence MUST be a concrete consequence or alarming fact — something that ALREADY HAPPENED (a real event, ruling, fine, number, or action).\n   - If the intro opens with a question, a vague tease, backstory, or a hypothetical ("What if...", "Imagine..."), REWRITE it to lead with the most alarming concrete detail instead.\n\n2. PART LABEL CHECK (all segments):\n   - Narration MUST NOT contain "Part 1 of 7", "Section 2 of 5", "Segment 3", or any similar structural labels.\n   - If found, REMOVE them entirely. The narration must flow as natural spoken words.\n\n3. HUMAN STORY CHECK (first two segments):\n   - The intro and first section MUST reference a NAMED individual — a real person with a name, not just "one company" or "researchers."\n   - If the first two segments jump straight into abstract analysis, statistics without a face, or broad industry trends, REWRITE them to lead with a named person's story.\n\n4. ESCALATION CHECK (all segments):\n   - Each segment MUST feel heavier and more urgent than the previous one. Stakes must escalate like a staircase: curiosity → concern → alarm.\n   - Check segment transitions. If a segment does NOT escalate beyond the previous one, ADD an explicit bridge line at the start or end (e.g., "But that's not even the worst part.", "And it gets worse.", "That was bad. This is catastrophic.").\n   - At least 2 segments must END with an open-loop re-hook line. If missing, ADD them.\n\n5. RHYTHM VARIATION CHECK (every segment):\n   - Each segment MUST contain at least one SHORT sentence (5 words or fewer, e.g., "That's terrifying.", "Full stop.") AND at least one LONG sentence (12 words or more).\n   - If a segment has uniform sentence lengths (all medium, all short, or all long), REWRITE it to vary the rhythm — short, long, short-short, long.\n\n6. "YOU" LANGUAGE CHECK (full script):\n   - Count all occurrences of "you", "your", and "you're" across ALL segments combined.\n   - If the total count is LESS THAN 3, ADD direct viewer addresses to make the viewer feel personally involved (e.g., "your data", "this affects you directly", "you've probably never heard of this").\n\n7. METAPHOR CHECK (all segments):\n   - Every technical term, acronym, jargon word, or policy name MUST be followed immediately by a vivid metaphor or analogy — not just a parenthetical definition.\n   - If a technical term appears without a metaphor, ADD one that makes the concept instantly visual and memorable.\n\n8. BINARY CTA CHECK (outro segment):\n   - The outro MUST contain a binary question that presents exactly two clear options for the viewer (e.g., "Do you think X or Y? Drop YES or NO in the comments.", "Agree or disagree?").\n   - If the outro ends with a generic sign-off like "let me know your thoughts", "thanks for watching", or has no binary question, REWRITE it to include a specific YES/NO or agree/disagree question.\n\n9. EPISODE TEASER CHECK (outro segment):\n   - The outro MUST reference a SPECIFIC related future topic (e.g., "Next time, we're looking at how X connects to Y").\n   - If the outro ends with generic phrases like "stay tuned", "more videos coming soon", "find out what happens next", or has no specific teaser, REWRITE it to tease a concrete related topic.\n\n10. PROMISE-PAYOFF VALIDATION (all segments):\n   - Scan every segment for transition phrases that PROMISE upcoming content. Common promise phrases include: "But here's where it gets interesting", "And that's not even the worst part", "Here's the thing", "What happened next changed everything", "And it gets worse", "But wait", "Here's where the story takes a turn", "The real question is", "And this is where it gets uncomfortable".\n   - When you find a promise phrase, CHECK the NEXT segment (the one immediately following it). That next segment MUST deliver on the promise by containing at least 3 CONCRETE DETAILS — specific names, numbers, dates, dollar amounts, percentages, or specific events.\n   - If the segment following a promise phrase contains FEWER than 3 concrete details (i.e., it is vague, generic, or surface-level), REWRITE that segment to include at least 3 specifics: real names, real numbers, real dates, or real events that substantiate the promise.\n   - If you cannot enrich the segment with verifiable specifics (because the topic lacks available concrete data), RETAIN the original segment unchanged rather than fabricating details. In this case, soften the preceding promise phrase to match the actual depth delivered (e.g., change "And that's not even the worst part" to "And there's more to this story").\n\n11. SPECIFICITY ENRICHMENT (all segments):\n   - Scan every segment for GENERIC phrases that lack specific attribution. Common offenders include: "many experts say", "some companies", "significant growth", "industry leaders", "recent studies show", "analysts predict", "sources say", "insiders report", "major players", "growing number of", "widespread concern".\n   - When you find a generic phrase, REWRITE it with a CONCRETE name, number, or source. Examples:\n     • "many experts say" → "MIT researcher Dr. Jane Smith argues" or "a 2024 McKinsey report found"\n     • "some companies" → "Apple, Google, and Microsoft" or "at least 12 Fortune 500 firms"\n     • "significant growth" → "47% year-over-year growth" or "revenue jumped from $2B to $3.4B"\n     • "industry leaders" → name the actual leaders (e.g., "Jensen Huang, Tim Cook, and Satya Nadella")\n     • "recent studies show" → "a Stanford University study published in March 2024 found"\n   - For UNATTRIBUTED statistical claims (bare numbers, percentages, or dollar amounts stated as fact without a source), ADD an attribution phrase. Examples:\n     • "Revenue hit $50 billion" → "Revenue hit $50 billion, according to their Q3 earnings report"\n     • "The market grew 30%" → "The market grew 30%, per Gartner's 2024 analysis"\n     • "Over 2 million users" → "Over 2 million users, based on data from SimilarWeb"\n   - PRESERVE the original segment if your enrichment rewrite produces a SHORTER result than the original. Specificity enrichment should ADD detail, not remove it. If the rewritten segment has fewer words than the original, discard the rewrite and keep the original.\n   - Do NOT fabricate attributions. If you cannot identify a plausible real source for a claim, use honest hedging like "reports suggest" or "public filings indicate" rather than inventing a specific source name.\n\n12. RHETORICAL VARIETY CHECK (all segments):\n   - Count the first word (or first two words for common pairs like "But the", "And the", "The company") of every sentence across ALL segments.\n   - If any sentence-opening pattern appears MORE THAN 3 times across the full script, REWRITE at least HALF of the duplicates to use different sentence constructions.\n   - Examples of varied openings: invert to start with a prepositional phrase ("In 2024, ..."), lead with an adverb ("Quietly, ..."), use a participial phrase ("Facing pressure, ..."), start with a dependent clause ("While competitors scrambled, ..."), or begin with the object ("That deal ..."). \n   - PRESERVE the original meaning and tone of each rewritten sentence — only the sentence structure should change, not the content or intent.\n   - Common offenders to watch for: repeated "But" openings, repeated "And" openings, repeated "The [noun]" openings, repeated "This" openings, repeated "It" openings. Vary these aggressively.\n\n=== RETENTION ENGINEERING RULES ===

13. CURIOSITY LOOP INJECTION (body segments):
   - At natural drop-off points (end of segment 2, midpoint, and any segment that resolves a question), INSERT a curiosity loop — a question or tease that the NEXT section answers.
   - Examples: "But how did they get in?", "And that's when the real damage started.", "The answer involves something you use every day."
   - The script MUST contain at least 2 curiosity loops across all segments. If fewer than 2 exist, ADD them at the end of segments where the viewer might feel satisfied enough to leave.
   - A curiosity loop is NOT the same as a re-hook. Re-hooks tease broadly; curiosity loops pose a specific question the next section answers within 30 seconds.

14. MINI CLIFFHANGER ENFORCEMENT (before transitions):
   - Every segment that precedes a transition or topic shift MUST end with a mini cliffhanger — an incomplete thought, a "but then...", or a consequence not yet revealed.
   - If a segment ends with a clean resolution before a transition, REWRITE the last sentence to withhold one detail or tease the next angle.
   - Examples: "But that was only the beginning.", "What they found next changed everything.", "And the cost? Far higher than anyone admitted."

15. "THIS COULD HAPPEN TO YOU" MOMENT (at least one):
   - The script MUST contain at least one explicit "this could happen to you in one click" moment — a sentence that makes the viewer feel personally vulnerable to the threat being described.
   - This moment should be concrete and immediate, not abstract. It should reference a specific action the viewer takes daily (clicking a link, opening an email, connecting to WiFi, using a password).
   - If no such moment exists, ADD one in the segment where the threat is most clearly explained. Place it after a concrete example, not before.

16. FEAR-CLARITY ALTERNATION (full script):
   - The script MUST alternate between fear/tension segments and clarity/explanation segments. Never stack more than 2 consecutive high-fear segments without a clarity beat.
   - A clarity beat explains WHY something happens, HOW it works, or WHAT the viewer can do — it gives the viewer a sense of understanding that balances the alarm.
   - If 3+ consecutive segments are all high-tension without explanation, INSERT a clarity sentence or rewrite one segment to include a "here's why this matters" explanation beat.
   - This prevents viewer fatigue and keeps the audience engaged rather than overwhelmed.

17. MIDPOINT INTENSIFICATION (middle segment):
   - The segment at or near the midpoint of the script (segment 3 or 4 in a 6-8 segment script) MUST either intensify the stakes significantly OR reveal a bigger implication that reframes everything before it.
   - The midpoint should feel like a "plot twist" — the moment where the story goes from "this is bad" to "this is worse than you thought."
   - If the midpoint segment is merely continuing the same level of intensity, REWRITE it to escalate: reveal a hidden connection, a larger conspiracy, a personal angle the viewer didn't expect, or a consequence that dwarfs the earlier examples.

18. LINE NECESSITY SCORING (all segments):
   - Review EVERY sentence in the script. Each sentence must serve at least one of these purposes: (a) advance the argument, (b) provide a concrete detail, (c) create emotional impact, (d) re-hook the viewer, or (e) give practical value.
   - If a sentence does NONE of these — if it's filler, repetition, throat-clearing, or vague commentary — REMOVE it or replace it with a sentence that earns its place.
   - Common offenders: "This is really important.", "Let's think about that for a moment.", "It's worth noting that...", "The implications are significant.", "This is a big deal."
   - Every second of the video must have purpose. Density = retention.

19. COMMENT TRIGGER ENGINEERING (outro segment):
   - The outro MUST contain at least one comment trigger — a statement designed to provoke viewer responses.
   - Effective comment triggers: a controversial opinion ("I think X is actually worse than Y"), a binary choice ("Are you team A or team B?"), a personal question ("Has this happened to you?"), or a prediction viewers can agree/disagree with.
   - The comment trigger should feel natural, not forced. It should emerge from the argument, not be tacked on.
   - If the outro lacks a comment trigger, ADD one that connects to the video's central argument.

20. LAST 20 SECONDS REWARD (final segment):
   - The last 20 seconds of the script (typically the outro) MUST reward viewers for staying. This means delivering:
     (a) A concrete, actionable takeaway they can use TODAY (not vague advice like "be careful online")
     (b) A satisfying narrative callback to the opening hook
     (c) A quotable final line that feels like the payoff of the entire video
   - If the ending feels flat, generic, or purely fear-based without resolution, REWRITE it to include all three reward elements.
   - The viewer should feel: "I'm glad I watched the whole thing" — informed, empowered, and motivated to act.

21. ENDING AND CTA RULES (outro and final section):
   - The ending MUST release tension by giving the viewer agency — concrete steps they can take TODAY. Not vague advice like "stay safe online" but specific actions: "Enable 2FA on your email", "Check haveibeenpwned.com", "Update your router firmware tonight."
   - The practical advice section must feel EARNED — it comes AFTER the viewer fully understands the threat. If advice appears before the stakes are clear, MOVE it to after the threat is fully established. The viewer should think "I NEED to do this" not "why are they telling me this?"
   - The next-video teaser must feel like an IRRESISTIBLE CONTINUATION, not a generic "stay tuned." It must connect to an unanswered thread from this video — a question raised but not resolved, a bigger player hinted at, or a consequence that deserves its own deep dive. If the teaser is generic (e.g., "more videos coming soon", "stay tuned for part 2"), REWRITE it to reference a specific unresolved thread.
   - The ending must feel EMPOWERING, not only alarming — the viewer should leave feeling informed AND capable. If the ending is purely fear-based without a survival path, ADD concrete actionable steps that make the viewer feel in control.
   - NEVER end on pure fear without action. If the final segment closes with alarm but no agency, REWRITE to include a clear survival path — specific, actionable, achievable steps. Fear without agency causes click-away, not click-through.

=== CREDIBILITY AND ACCURACY RULES ===

22. UNSOURCED STATISTIC DETECTION (all segments):
   - Scan every segment for BARE STATISTICS — numbers, percentages, dollar amounts, or growth figures stated as fact WITHOUT attribution.
   - Any statistic that lacks a source phrase (e.g., "according to", "per", "based on", "reported by", "data from") MUST be flagged and fixed.
   - For each unsourced statistic, ADD an attribution phrase using one of these patterns:
     • "according to [source]" (e.g., "according to IBM's 2024 Cost of a Data Breach report")
     • "per [source]" (e.g., "per Gartner's latest analysis")
     • "based on data from [source]" (e.g., "based on data from the FBI's IC3 report")
     • "[source] reports that" (e.g., "Verizon's DBIR reports that")
   - If you cannot identify a plausible real source, use honest hedging: "industry estimates suggest", "public filings indicate", or "reports suggest" — but NEVER fabricate a specific source name or study.
   - EVERY number in the final script must either have a source OR be clearly framed as an estimate/approximation.

23. LARGE FIGURE NORMALIZATION (all segments):
   - Scan for large numbers (millions, billions, trillions) that appear without context or comparison.
   - NORMALIZE large figures to make them relatable to the viewer's experience. Examples:
     • "$4.45 million" → "$4.45 million — that's roughly $12,000 lost every single day for a year"
     • "3 billion records" → "3 billion records — nearly one for every two people on Earth"
     • "$10.5 trillion by 2025" → "$10.5 trillion by 2025 — more than the GDP of every country except the US and China"
   - Large figures that already include a comparison or analogy can be left as-is.
   - Do NOT over-normalize — one comparison per large figure is sufficient. Avoid stacking multiple analogies.

24. "ACCORDING TO" ENFORCEMENT FOR MAJOR CLAIMS (all segments):
   - Any MAJOR CLAIM — a statement that would make a viewer think "really?" or "where did they get that?" — MUST use "according to" language or equivalent attribution.
   - Major claims include: market size predictions, breach statistics, government actions, company valuations, threat actor capabilities, and any claim that could be fact-checked.
   - Acceptable attribution patterns: "according to [source]", "[source] found that", "as reported by [source]", "[source] estimates", "data from [source] shows".
   - If a major claim cannot be attributed, REFRAME it as analysis or interpretation: "This suggests...", "The pattern indicates...", "Based on public reporting...".
   - Do NOT attribute opinions or interpretive framing — only factual claims need sources.

25. CLAIM TYPE CLASSIFICATION (all segments):
   - Classify every substantive statement in the script as one of three types:
     (a) VERIFIED CLAIM — a factual statement with a clear, attributable source. These MUST have "according to" language.
     (b) INTERPRETIVE FRAMING — the narrator's analysis or connection-drawing based on verified facts. These should use language like "This means...", "The implication is...", "What this tells us...".
     (c) OPINION — the narrator's editorial perspective or prediction. These should use language like "I believe...", "The argument here is...", "This suggests...".
   - If a statement is presented as VERIFIED but lacks a source, either ADD a source or RECLASSIFY it as interpretive framing with appropriate language.
   - NEVER present opinion as verified fact. NEVER present interpretive framing without signaling it.
   - The audience should always know whether they're hearing a fact, an interpretation, or an opinion.

26. OUTDATED STATISTIC DETECTION (all segments):
   - Flag any statistic that references a year MORE THAN 2 years old relative to the current context (e.g., citing 2021 data in a 2024 video) UNLESS it is used for historical comparison.
   - If an outdated statistic is found and used as current truth, either:
     (a) UPDATE it with more recent data and source, OR
     (b) FRAME it explicitly as historical: "Back in [year], [source] reported..." or "As of [year]..."
   - Statistics used for trend comparison ("In 2019 it was X; by 2024 it reached Y") are acceptable and should NOT be flagged.
   - If no newer data is available, ADD a qualifier: "the most recent available data from [year] shows..."
   - Undated statistics (no year mentioned, no source) are the HIGHEST priority to fix — they erode credibility fastest.

27. CREDIBILITY MODE (full script):
   - DEFAULT MODE is "high credibility" — every claim sourced, figures normalized, language precise.
   - In high credibility mode:
     • Use authoritative framing: "Research confirms...", "The data is clear...", "Multiple reports converge on..."
     • Prefer understatement over overstatement — let the facts create the drama
     • Use strong authority framing for business-oriented audiences (cite industry reports, name analysts, reference earnings calls)
     • Frame the narrator as a trusted guide, not a sensationalist
   - In "high drama" mode (when style calls for it):
     • Statistics can be presented with more emotional framing but STILL require attribution
     • Normalization comparisons can be more dramatic ("enough money to buy every NFL team — twice")
     • But NEVER sacrifice accuracy for drama — the facts must remain correct even if the framing is intense
   - Regardless of mode: NO fabricated sources, NO invented statistics, NO unverifiable claims presented as fact.

=== ADDITIONAL RULES ===
- No filler phrases: imagine, what if, all eyes on, game changer, critical moment, time will tell, basically, no seriously, thanks for watching, stay tuned, more videos coming soon, find out what happens next, let me know your thoughts
- Argument must escalate gradually — don't drop the boldest claim first
- Named character must appear at least TWICE — once introduced, once referenced later
- The most COMPLEX section needs the MOST time — don't rush the hardest part
- Predictions must be backed by 2-3 concrete data points or trends
- Last line must be quotable — punchy enough to screenshot
- Each segment 40-80 words, written for spoken delivery
- Remove any example or aside that appears without setup. Every mention must connect to the main argument.
- If a named person is mentioned, verify they are plausible for the topic. If fabricated, replace with honest framing like "one engineer" or "a former employee."

Return ONLY a valid JSON array of the improved segments. No markdown, no preamble.`;

  try {
    const response = await fetchWithTimeout(
      OPENROUTER_ENDPOINT,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://autotube.video',
          'X-Title': 'AutoTube AI Generator',
        },
        body: JSON.stringify({
          model: DEFAULT_SCRIPT_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          response_format: { type: 'json_object' },
        }),
      },
      {
        timeoutMs: 30_000,
        maxRetries: 3,
        signal,
      },
    );

    if (!response.ok) {
      logger.warn('OpenRouter', `Script review failed (Status: ${response.status})`);
      // Assign purpose tags even on fallback (Requirement 11.1, 11.2)
      for (const seg of segments) {
        seg.purposeTag = assignPurposeTag(seg);
      }
      // Assign pacing scores (Requirement 13.1, 13.2)
      for (const seg of segments) {
        seg.pacingScore = computePacingScore(seg.narration);
      }
      return segments;
    }

    const data = await response.json();
    const rawContent: unknown = data?.choices?.[0]?.message?.content;
    if (typeof rawContent !== 'string' || !rawContent.trim()) {
      logger.warn('OpenRouter', 'Script review returned empty content');
      // Assign purpose tags even on fallback (Requirement 11.1, 11.2)
      for (const seg of segments) {
        seg.purposeTag = assignPurposeTag(seg);
      }
      // Assign pacing scores (Requirement 13.1, 13.2)
      for (const seg of segments) {
        seg.pacingScore = computePacingScore(seg.narration);
      }
      return segments;
    }

    const improved = parseSegmentsFromContent(rawContent);
    // Validate each segment
    const validated = improved.map((s, i) => validateSegment(s, i));
    // Enforce duration cap — LLM sometimes ignores the 25s constraint
    for (const seg of validated) {
      if (seg.duration > 25) seg.duration = 25;
    }
    // Assign purpose tags to each segment (Requirement 11.1, 11.2)
    for (const seg of validated) {
      seg.purposeTag = assignPurposeTag(seg);
    }
    // Assign pacing scores (Requirement 13.1, 13.2)
    for (const seg of validated) {
      seg.pacingScore = computePacingScore(seg.narration);
    }
    // Promise-payoff validation: warn if any promise phrases still lack concrete follow-up (Requirement 9.3)
    checkPromisePayoff(validated);
    logger.success('OpenRouter', `Script review complete — ${validated.length} segments improved`);
    return validated;
  } catch (err) {
    // If aborted, re-throw so the caller can handle cancellation
    if ((err as Error).name === 'AbortError') throw err;
    logger.warn('OpenRouter', 'Script review failed, using original segments', err);
    // Assign purpose tags even on fallback (Requirement 11.1, 11.2)
    for (const seg of segments) {
      seg.purposeTag = assignPurposeTag(seg);
    }
    // Assign pacing scores (Requirement 13.1, 13.2)
    for (const seg of segments) {
      seg.pacingScore = computePacingScore(seg.narration);
    }
    return segments;
  }
}
