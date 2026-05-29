/**
 * SEO-optimized title generator for YouTube videos.
 * Creates engaging, click-worthy titles based on topic and style.
 */

import type { MediaAsset, ScriptSegment, TopicContext, VideoProject } from '../types';
import { generateChapterMarkers } from './chapters';

/**
 * A chapter marker with timestamp and title, aligned to segment start times.
 * Requirements: 7.6
 */
export interface ChapterMarker {
  /** Timestamp in "M:SS" or "MM:SS" format */
  timestamp: string;
  /** Chapter title derived from segment title */
  title: string;
  /** Index of the segment this chapter corresponds to */
  segmentIndex: number;
}

/**
 * Complete YouTube metadata package for upload.
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6
 */
export interface YouTubeMetadata {
  /** Title between 40–70 characters */
  title: string;
  /** Full description with summary, chapters, and tags */
  description: string;
  /** 8–15 tags, each 2–30 characters */
  tags: string[];
  /** Chapter markers aligned to segment cumulative start times */
  chapters: ChapterMarker[];
}

export interface TitleOption {
  title: string;
  style: 'clickbait' | 'professional' | 'question' | 'listicle' | 'shocking';
  estimatedCTR: number; // Estimated click-through rate
}

/**
 * Enforces a title length between 40 and 70 characters (inclusive).
 * If the title is longer than 70 chars, it is truncated at 70.
 * If the title is shorter than 40 chars, a suffix is appended to reach 40.
 */
function enforceTitleLength(title: string): string {
  if (title.length > 70) {
    return title.substring(0, 70);
  }
  if (title.length < 40) {
    const suffix = ' — The Full Story';
    const padded = title + suffix;
    // If still too short after one suffix, pad with spaces up to 40
    return padded.length >= 40 ? padded : padded.padEnd(40, ' ');
  }
  return title;
}

/**
 * On-screen text rules for title cards and reveals.
 * - Finish the thought: on-screen text should complement narration, not duplicate it
 * - Headline-style for reveals: use short, punchy text cards for major moments
 *
 * Requirements: 2.188, 2.189
 */
export interface OnScreenTextRule {
  type: 'finish-thought' | 'headline-reveal';
  description: string;
}

export const ON_SCREEN_TEXT_RULES: OnScreenTextRule[] = [
  {
    type: 'finish-thought',
    description: 'On-screen text must finish the thought — never duplicate narration word-for-word. Add context, consequence, or next implication.',
  },
  {
    type: 'headline-reveal',
    description: 'Use headline-style text cards for major reveals. Keep to 2-5 words, bold contrast, instantly readable.',
  },
];

/**
 * Scores a title for specificity. Titles with concrete outcomes
 * (loss, exposure, sabotage, shutdown, lockout, disaster, drain, ruin, destroy)
 * score higher than vague/generic titles.
 *
 * Returns a score from 0 to 1 that is used as a multiplier on estimatedCTR
 * for ranking purposes.
 */
export function scoreSpecificity(title: string): number {
  const concreteOutcomes = [
    'shut down', 'shutdown', 'lockout', 'locked out', 'lock out',
    'drain', 'destroy', 'ruin', 'exposed', 'exposure',
    'sabotage', 'loss', 'lost', 'stolen', 'breach',
    'one click', 'disaster', 'wiped', 'frozen', 'hijack',
    // Space/science domain
    'fail', 'failure', 'crash', 'explode', 'launch', 'mission',
    'discovery', 'breakthrough', 'danger', 'risk', 'threat',
    'crisis', 'alarm', 'warning', 'alert', 'worse',
    'numbers say', 'data says', 'hidden', 'secret',
  ];
  const audienceFacing = [
    'your ', 'you ', "you're", 'your business', 'your files',
    'your data', 'your accounts', 'your system', 'your payroll',
    // Space/science domain
    'your family', 'your health', 'your future', 'your world',
    'you think', 'you know', 'you need',
  ];

  let score = 0.5; // baseline

  const lower = title.toLowerCase();

  // Boost for concrete outcomes
  for (const term of concreteOutcomes) {
    if (lower.includes(term)) {
      score += 0.2;
      break; // only count once
    }
  }

  // Boost for audience-facing language
  for (const term of audienceFacing) {
    if (lower.includes(term)) {
      score += 0.2;
      break;
    }
  }

  // Penalize vague/generic phrasing
  const vagueTerms = ['everything', 'complete breakdown', 'need to know', 'what it seems'];
  for (const term of vagueTerms) {
    if (lower.includes(term)) {
      score -= 0.1;
      break;
    }
  }

  return Math.max(0.1, Math.min(1.0, score));
}

/**
 * Extracts a key phrase from a hook line for use in title generation.
 *
 * Looks for (in priority order):
 * 1. A currency amount (e.g., "$1.3 billion", "$40B")
 * 2. A percentage (e.g., "+200%", "42%")
 * 3. A number with context (e.g., "1.3 billion", "500 million")
 * 4. A named entity — the first capitalized multi-word phrase (e.g., "Big Tech", "Meta")
 * 5. Falls back to the first 5 significant words of the hook line
 */
export function extractKeyPhrase(hookLine: string): string {
  // Try currency amounts: "$1.3 billion", "$40B", "$500M"
  const currencyMatch = hookLine.match(/\$[\d.,]+\s*(?:billion|million|trillion|[BMT])\b/i)
    ?? hookLine.match(/\$[\d.,]+[BMT]/);
  if (currencyMatch) return currencyMatch[0];

  // Try percentages
  const pctMatch = hookLine.match(/[+-]?\d+(?:\.\d+)?%/);
  if (pctMatch) return pctMatch[0];

  // Try number with context (e.g., "1.3 billion")
  const numMatch = hookLine.match(/\d+(?:\.\d+)?\s*(?:billion|million|trillion)/i);
  if (numMatch) return numMatch[0];

  // Try named entity — capitalized words (2+ chars) that aren't sentence starters
  const words = hookLine.split(/\s+/);
  const namedEntities: string[] = [];
  for (let i = 1; i < words.length; i++) {
    const clean = words[i].replace(/[^a-zA-Z]/g, '');
    if (clean.length >= 2 && /^[A-Z]/.test(clean)) {
      namedEntities.push(clean);
    }
  }
  if (namedEntities.length > 0) return namedEntities[0];

  // Fallback: first 5 significant words (skip stop words)
  const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'it', 'that', 'this', 'just']);
  const significant = words.filter(w => {
    const lower = w.toLowerCase().replace(/[^a-z]/g, '');
    return lower.length > 2 && !stopWords.has(lower);
  });
  return significant.slice(0, 3).join(' ') || hookLine.slice(0, 30).trim();
}

/**
 * Generates multiple title options for a given topic.
 *
 * When `dataPoints` is non-empty, returns exactly 3 titles that each embed
 * at least one data point. When `dataPoints` is empty, returns 10-20
 * topic-framing titles ranked by specificity and curiosity score, using
 * stronger title families (loss, exposure, sabotage, shutdown, lockout,
 * one-click disaster) and audience-facing language. All titles are enforced
 * to 40–70 characters.
 *
 * Titles are ranked with a specificity component: titles with concrete
 * outcomes (e.g., "shut down," "drain your accounts") rank higher than
 * vague labels (e.g., "everything you need to know").
 *
 * When `hookLine` is provided and non-empty, an additional title referencing
 * the hook's key phrase is generated with style 'shocking' and a high
 * estimated CTR (Requirement 11.3).
 *
 * The existing two-parameter call signature is preserved for backward
 * compatibility (Requirement 10.6).
 *
 * Requirements: 2.186-2.195
 */
export function generateTitleOptions(
  topic: string,
  _style: string = 'business_insider',
  dataPoints: string[] = [],
  hookLine: string = '',
): TitleOption[] {
  if (dataPoints.length > 0) {
    // Use the first data point as the primary embed; cycle through extras if available
    const dp0 = dataPoints[0];
    const dp1 = dataPoints[1] ?? dp0;
    const dp2 = dataPoints[2] ?? dp0;

    const dataPointTitles: TitleOption[] = [
      {
        title: enforceTitleLength(`${topic}: ${dp0} and What It Means`),
        style: 'shocking',
        estimatedCTR: 9.2,
      },
      {
        title: enforceTitleLength(`How ${topic} Hit ${dp1} — The Full Story`),
        style: 'clickbait',
        estimatedCTR: 8.5,
      },
      {
        title: enforceTitleLength(`${topic} Reaches ${dp2}: Inside the Numbers`),
        style: 'professional',
        estimatedCTR: 7.8,
      },
    ];

    // When a hook line is provided, add a hook-aligned title (Requirement 11.3)
    if (hookLine.trim()) {
      const keyPhrase = extractKeyPhrase(hookLine);
      dataPointTitles.push({
        title: enforceTitleLength(`${topic}: "${keyPhrase}" Changes Everything`),
        style: 'shocking',
        estimatedCTR: 9.5,
      });
    }

    return dataPointTitles.sort((a, b) => b.estimatedCTR - a.estimatedCTR);
  }

  // No data points — return 10-20 topic-framing titles ranked by specificity and curiosity
  const titles: TitleOption[] = [];

  // --- Stronger title families: loss, exposure, sabotage, shutdown, lockout, one-click disaster ---

  // Shocking style — concrete outcomes with audience-facing language
  titles.push({
    title: `${topic}: How They Get Into Your System`,
    style: 'shocking',
    estimatedCTR: 9.4,
  });

  titles.push({
    title: `${topic}: One Click Could Shut You Down`,
    style: 'shocking',
    estimatedCTR: 9.2,
  });

  titles.push({
    title: `${topic}: Your Data Is Already Exposed`,
    style: 'shocking',
    estimatedCTR: 9.0,
  });

  titles.push({
    title: `${topic}: The Sabotage No One Saw Coming`,
    style: 'shocking',
    estimatedCTR: 8.9,
  });

  // Clickbait style — curiosity-driven with audience-facing framing
  titles.push({
    title: `Why You Should Be Worried About ${topic}`,
    style: 'clickbait',
    estimatedCTR: 8.7,
  });

  titles.push({
    title: `How They Use ${topic} to Drain Your Accounts`,
    style: 'clickbait',
    estimatedCTR: 8.5,
  });

  titles.push({
    title: `${topic}: What Your Business Doesn't Know Yet`,
    style: 'clickbait',
    estimatedCTR: 8.3,
  });

  titles.push({
    title: `The ${topic} Lockout That Ruined Everything`,
    style: 'clickbait',
    estimatedCTR: 8.1,
  });

  // Question style — audience-facing curiosity
  titles.push({
    title: `Is ${topic} Putting Your Files at Risk?`,
    style: 'question',
    estimatedCTR: 7.8,
  });

  titles.push({
    title: `Could ${topic} Shut Down Your Business Tomorrow?`,
    style: 'question',
    estimatedCTR: 7.6,
  });

  titles.push({
    title: `What Happens When ${topic} Targets You?`,
    style: 'question',
    estimatedCTR: 7.4,
  });

  // Professional style — concrete outcomes, authority framing
  titles.push({
    title: `${topic}: The Full Exposure Report`,
    style: 'professional',
    estimatedCTR: 7.0,
  });

  titles.push({
    title: `Inside ${topic}: How the Losses Stack Up`,
    style: 'professional',
    estimatedCTR: 6.8,
  });

  titles.push({
    title: `${topic}: What Every Business Owner Must Know`,
    style: 'professional',
    estimatedCTR: 6.5,
  });

  // Listicle style — specificity with concrete outcomes
  titles.push({
    title: `5 Ways ${topic} Can Destroy Your Livelihood`,
    style: 'listicle',
    estimatedCTR: 8.0,
  });

  titles.push({
    title: `3 Signs ${topic} Has Already Hit Your System`,
    style: 'listicle',
    estimatedCTR: 7.2,
  });

  // ── Space/Science/Environment/Health domain templates ──
  const lowerTopic = topic.toLowerCase();
  const isSpace = ['space', 'rocket', 'mars', 'nasa', 'spacex', 'starship', 'satellite', 'orbit', 'launch'].some(k => lowerTopic.includes(k));
  const isScience = ['science', 'research', 'discovery', 'quantum', 'nuclear', 'energy', 'particle', 'experiment'].some(k => lowerTopic.includes(k));
  const isEnvironment = ['climate', 'weather', 'ocean', 'wildfire', 'flood', 'drought', 'hurricane', 'glacier'].some(k => lowerTopic.includes(k));
  const isHealth = ['health', 'medical', 'virus', 'vaccine', 'disease', 'pandemic', 'epidemic'].some(k => lowerTopic.includes(k));

  if (isSpace) {
    titles.push({ title: `Can ${topic} REALLY Work? The Numbers Say...`, style: 'question', estimatedCTR: 9.0 });
    titles.push({ title: `Why ${topic} Is More Dangerous Than You Think`, style: 'shocking', estimatedCTR: 8.8 });
    titles.push({ title: `${topic}: The Hidden Problem No One's Talking About`, style: 'clickbait', estimatedCTR: 8.5 });
    titles.push({ title: `How ${topic} Could Change Everything (Or Fail)`, style: 'clickbait', estimatedCTR: 8.3 });
    titles.push({ title: `${topic}: Not Ready? The Data Says Otherwise`, style: 'question', estimatedCTR: 7.8 });
  }

  if (isScience) {
    titles.push({ title: `${topic}: The Discovery That Changes Everything`, style: 'shocking', estimatedCTR: 9.0 });
    titles.push({ title: `Why Scientists Are Worried About ${topic}`, style: 'clickbait', estimatedCTR: 8.7 });
    titles.push({ title: `${topic}: What They Don't Want You to Know`, style: 'clickbait', estimatedCTR: 8.4 });
    titles.push({ title: `The ${topic} Experiment That Went Wrong`, style: 'shocking', estimatedCTR: 8.2 });
    titles.push({ title: `Is ${topic} the End of Physics As We Know It?`, style: 'question', estimatedCTR: 7.8 });
  }

  if (isEnvironment) {
    titles.push({ title: `${topic}: It's Worse Than the Models Predict`, style: 'shocking', estimatedCTR: 9.0 });
    titles.push({ title: `The ${topic} Crisis Nobody's Preparing For`, style: 'clickbait', estimatedCTR: 8.7 });
    titles.push({ title: `How ${topic} Could Affect You by 2030`, style: 'question', estimatedCTR: 8.4 });
    titles.push({ title: `${topic}: The Numbers That Should Alarm You`, style: 'shocking', estimatedCTR: 8.2 });
    titles.push({ title: `Why ${topic} Is Getting Worse (And Faster)`, style: 'clickbait', estimatedCTR: 7.9 });
  }

  if (isHealth) {
    titles.push({ title: `${topic}: What Your Doctor Isn't Telling You`, style: 'clickbait', estimatedCTR: 9.0 });
    titles.push({ title: `The ${topic} Risk You're Ignoring Right Now`, style: 'shocking', estimatedCTR: 8.7 });
    titles.push({ title: `Is ${topic} More Dangerous Than We Thought?`, style: 'question', estimatedCTR: 8.4 });
    titles.push({ title: `${topic}: The Hidden Threat in Your Daily Routine`, style: 'clickbait', estimatedCTR: 8.2 });
    titles.push({ title: `What ${topic} Means for Your Family`, style: 'question', estimatedCTR: 7.8 });
  }

  // When a hook line is provided, add a hook-aligned title (Requirement 11.3)
  if (hookLine.trim()) {
    const keyPhrase = extractKeyPhrase(hookLine);
    titles.push({
      title: enforceTitleLength(`${topic}: "${keyPhrase}" Changes Everything`),
      style: 'shocking',
      estimatedCTR: 9.5,
    });
  }

  // Enforce 40–70 character length on all titles (Requirement 7.1)
  for (const t of titles) {
    t.title = enforceTitleLength(t.title);
  }

  // Apply specificity ranking: adjust estimatedCTR by specificity score
  // so titles with concrete outcomes rank higher (Requirements 2.186, 2.194)
  for (const t of titles) {
    const specificity = scoreSpecificity(t.title);
    // Boost CTR by up to 0.5 for highly specific titles
    t.estimatedCTR = t.estimatedCTR + (specificity - 0.5) * 1.0;
  }

  // Sort by estimated CTR (with specificity adjustment applied)
  return titles.sort((a, b) => b.estimatedCTR - a.estimatedCTR);
}

/**
 * Optimizes a title for YouTube SEO.
 */
export function optimizeTitleForSEO(title: string): string {
  // Ensure title is under 60 characters for optimal display
  if (title.length > 60) {
    return title.substring(0, 57) + '...';
  }
  return title;
}

/**
 * Extracts numeric data points from media asset metadata.
 * Scans the `alt` and `concept` fields of each asset for:
 *   - Currency amounts: $1.2T, $40B, $500M
 *   - Percentages: +200%, -15%, 42.5%
 *   - Year references: 2024, 1999
 *
 * Results are deduplicated and returned in the order they first appear.
 * Satisfies Requirements 7.8 and 8.4.
 */
export function extractDataPoints(media: MediaAsset[]): string[] {
  const patterns = [
    /\$[\d.]+[TBM]/g,           // currency amounts: $1.2T, $40B, $500M
    /[+-]?\d+(?:\.\d+)?%/g,     // percentages: +200%, -15%, 42.5%
    /\b(?:19|20)\d{2}\b/g,      // year references: 2024, 1999
  ];

  const seen = new Set<string>();
  const results: string[] = [];

  for (const asset of media) {
    const text = `${asset.alt ?? ''} ${asset.concept ?? ''}`;
    for (const pattern of patterns) {
      const matches = text.match(pattern) ?? [];
      for (const match of matches) {
        if (!seen.has(match)) {
          seen.add(match);
          results.push(match);
        }
      }
    }
  }

  return results;
}

/**
 * Extracts the first sentence (hook line) from the intro segment's narration.
 *
 * Finds the intro segment and returns the text up to the first sentence-ending
 * punctuation mark (`.`, `!`, or `?`). If no sentence boundary exists, returns
 * the first 100 characters trimmed.
 *
 * Returns an empty string when the segments array is empty or contains no
 * intro segment.
 *
 * @param segments - Array of script segments to search
 * @returns The hook line string, or empty string if no intro found
 *
 * Satisfies Requirements 11.1 and 11.5.
 */
export function extractHookLine(segments: ScriptSegment[]): string {
  const intro = segments.find(s => s.type === 'intro');
  if (!intro) return '';

  const match = intro.narration.match(/^[^.!?]+[.!?]/);
  if (match) {
    const sentence = match[0].trim();
    return sentence.length > 100 ? sentence.slice(0, 100).trim() : sentence;
  }
  return intro.narration.slice(0, 100).trim();
}

/**
 * Sanitizes a single tag: trims, removes invalid chars (only alphanumeric,
 * spaces, and hyphens allowed), enforces 2-30 char length.
 * Returns null if the result is invalid (too short or too long).
 *
 * Requirements: 5.5
 */
export function sanitizeTag(raw: string): string | null {
  // Trim whitespace
  let tag = raw.trim();
  // Remove invalid characters — keep only alphanumeric, spaces, hyphens
  tag = tag.replace(/[^a-zA-Z0-9 -]/g, '');
  // Collapse multiple spaces into one
  tag = tag.replace(/\s+/g, ' ').trim();
  // Enforce 2-30 char length
  if (tag.length < 2 || tag.length > 30) return null;
  return tag;
}

/**
 * Style-specific keywords for tag generation when entities are unavailable.
 */
const STYLE_KEYWORDS: Record<string, string[]> = {
  business_insider: ['business', 'finance', 'economy', 'market', 'industry'],
  warfront: ['conflict', 'military', 'geopolitics', 'defense', 'strategy'],
  documentary: ['documentary', 'history', 'investigation', 'deep dive', 'analysis'],
  explainer: ['explained', 'how it works', 'guide', 'tutorial', 'breakdown'],
};

/**
 * Generates 8-15 YouTube tags from topic context.
 * Each tag is 2-30 chars, containing only alphanumeric + spaces + hyphens.
 *
 * If topic context has no entities or extract is empty, generates tags from
 * topic name and style keywords without fabricating entity names.
 *
 * Requirements: 7.3, 5.4, 5.5, 5.8
 */
export function generateTags(topicContext: TopicContext, style: string): string[] {
  const candidates: string[] = [];

  // Always include the core subject
  candidates.push(topicContext.coreSubject);

  // Add the topic itself if different from coreSubject
  if (topicContext.topic !== topicContext.coreSubject) {
    candidates.push(topicContext.topic);
  }

  // Add entities if available
  if (topicContext.entities && topicContext.entities.length > 0) {
    for (const entity of topicContext.entities) {
      candidates.push(entity);
    }
  }

  // Add kind as a tag
  if (topicContext.kind) {
    candidates.push(topicContext.kind);
  }

  // Add style-specific keywords
  const styleKeys = STYLE_KEYWORDS[style] ?? STYLE_KEYWORDS['business_insider'];
  for (const kw of styleKeys) {
    candidates.push(kw);
  }

  // Add compound tags (topic + style keyword)
  candidates.push(`${topicContext.coreSubject} ${styleKeys[0] ?? 'overview'}`);

  // Add additional compound tags for better coverage
  if (styleKeys.length > 1) {
    candidates.push(`${topicContext.coreSubject} ${styleKeys[1]}`);
  }

  // Sanitize all candidates and deduplicate
  const seen = new Set<string>();
  const tags: string[] = [];

  for (const raw of candidates) {
    const sanitized = sanitizeTag(raw);
    if (sanitized && !seen.has(sanitized.toLowerCase())) {
      seen.add(sanitized.toLowerCase());
      tags.push(sanitized);
    }
  }

  // Ensure minimum of 8 tags by adding generic filler tags (Requirement 7.3)
  const fillers = ['video', 'trending', 'news', 'latest', '2024', 'top stories', 'must watch', 'highlights', 'overview', 'recap'];
  let fillerIdx = 0;
  while (tags.length < 8 && fillerIdx < fillers.length) {
    const sanitized = sanitizeTag(fillers[fillerIdx]);
    if (sanitized && !seen.has(sanitized.toLowerCase())) {
      seen.add(sanitized.toLowerCase());
      tags.push(sanitized);
    }
    fillerIdx++;
  }

  // Cap at 15 tags
  return tags.slice(0, 15);
}

/**
 * Generates a full YouTube description with summary, chapters, and tags.
 *
 * - Summary: 2-3 sentences derived from intro and conclusion segments' narration
 * - Chapters: YouTube chapter markers with timestamps matching each segment's start time
 * - Tags: from generateTags()
 * - Full description: combined summary + "\n\n" + chapters + "\n\nTags: " + tags joined by ", "
 *
 * Requirements: 5.2, 5.3, 5.4
 */
export function generateVideoDescription(
  segments: ScriptSegment[],
  topic: string,
  topicContext: TopicContext,
  style: string,
): { summary: string; chapters: string; tags: string[]; fullDescription: string } {
  // Summary: derive from intro and conclusion segments
  const intro = segments.find(s => s.type === 'intro');
  const outro = segments.find(s => s.type === 'outro');

  const summaryParts: string[] = [];

  if (intro) {
    // Extract first 1-2 sentences from intro narration
    const introSentences = intro.narration.match(/[^.!?]+[.!?]/g);
    if (introSentences && introSentences.length > 0) {
      summaryParts.push(introSentences.slice(0, 2).join('').trim());
    } else {
      summaryParts.push(intro.narration.slice(0, 150).trim());
    }
  }

  if (outro) {
    // Extract first sentence from conclusion narration
    const outroSentences = outro.narration.match(/[^.!?]+[.!?]/g);
    if (outroSentences && outroSentences.length > 0) {
      summaryParts.push(outroSentences[0].trim());
    } else {
      summaryParts.push(outro.narration.slice(0, 150).trim());
    }
  }

  // If no intro/outro, use topic as fallback summary
  const summary = summaryParts.length > 0
    ? summaryParts.join(' ')
    : `A deep dive into ${topic}. Watch to learn more.`;

  // Chapters: use the existing chapter marker generator
  const chapters = generateChapterMarkers(segments);

  // Tags: from generateTags()
  const tags = generateTags(topicContext, style);

  // Full description: combined
  const fullDescription = `${summary}\n\n${chapters}\n\nTags: ${tags.join(', ')}`;

  return { summary, chapters, tags, fullDescription };
}


/**
 * Formats seconds to a chapter timestamp in "M:SS" or "H:MM:SS" format.
 * Uses the shorter "M:SS" format for times under 1 hour (YouTube standard).
 */
function formatChapterTimestamp(seconds: number): string {
  const totalSeconds = Math.round(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Generates chapter markers aligned to segment cumulative start times.
 * Each marker corresponds to the start of a segment in the timeline.
 *
 * Timestamps are within ±1 second of the actual cumulative start time
 * due to rounding to whole seconds.
 *
 * Requirements: 7.6
 */
export function generateChapterMarkersAligned(segments: ScriptSegment[]): ChapterMarker[] {
  const markers: ChapterMarker[] = [];
  let cumulativeTime = 0;

  for (let i = 0; i < segments.length; i++) {
    markers.push({
      timestamp: formatChapterTimestamp(cumulativeTime),
      title: segments[i].title,
      segmentIndex: i,
    });
    cumulativeTime += segments[i].duration;
  }

  return markers;
}

/**
 * Generates complete YouTube metadata for a video project.
 *
 * Produces:
 * - Title: 40–70 characters, embedding data points when available (Req 7.1, 7.4)
 * - Description: summary + chapter markers (X:XX format) + tags line (Req 7.2)
 * - Tags: 8–15 tags, each 2–30 characters (Req 7.3)
 * - Chapter markers: aligned to segment cumulative start times ±1 second (Req 7.6)
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6
 */
export function generateFullMetadata(
  project: VideoProject,
  topicContext: TopicContext,
): YouTubeMetadata {
  const segments = project.script;
  const style = project.style;
  const topic = project.topic;

  // Extract data points from media assets
  const dataPoints = extractDataPoints(project.media);

  // Extract hook line from intro segment
  const hookLine = extractHookLine(segments);

  // Generate title options and pick the best one
  const titleOptions = generateTitleOptions(topic, style, dataPoints, hookLine);

  // When data points are available, prefer a title that embeds a data point (Req 7.4)
  let bestTitle: string;
  if (dataPoints.length > 0) {
    const dataPointTitle = titleOptions.find(t =>
      dataPoints.some(dp => t.title.includes(dp))
    );
    bestTitle = dataPointTitle?.title ?? (titleOptions.length > 0 ? titleOptions[0].title : enforceTitleLength(topic));
  } else {
    bestTitle = titleOptions.length > 0 ? titleOptions[0].title : enforceTitleLength(topic);
  }

  // Generate chapter markers aligned to segment start times
  const chapters = generateChapterMarkersAligned(segments);

  // Generate tags (8-15 tags, 2-30 chars each)
  const tags = generateTags(topicContext, style);

  // Build the description: summary + chapter markers + tags line
  const description = buildFullDescription(segments, topic, chapters, tags);

  return {
    title: bestTitle,
    description,
    tags,
    chapters,
  };
}

/**
 * Builds a full YouTube description with summary, chapter markers, and tags.
 *
 * Structure:
 * 1. Summary (2-3 sentences from intro/outro)
 * 2. Chapter markers with "X:XX Title" format
 * 3. "Tags: tag1, tag2, ..." line
 *
 * Requirements: 7.2
 */
function buildFullDescription(
  segments: ScriptSegment[],
  topic: string,
  chapters: ChapterMarker[],
  tags: string[],
): string {
  // Summary: derive from intro and conclusion segments
  const intro = segments.find(s => s.type === 'intro');
  const outro = segments.find(s => s.type === 'outro');

  const summaryParts: string[] = [];

  if (intro) {
    const introSentences = intro.narration.match(/[^.!?]+[.!?]/g);
    if (introSentences && introSentences.length > 0) {
      summaryParts.push(introSentences.slice(0, 2).join('').trim());
    } else {
      summaryParts.push(intro.narration.slice(0, 150).trim());
    }
  }

  if (outro) {
    const outroSentences = outro.narration.match(/[^.!?]+[.!?]/g);
    if (outroSentences && outroSentences.length > 0) {
      summaryParts.push(outroSentences[0].trim());
    } else {
      summaryParts.push(outro.narration.slice(0, 150).trim());
    }
  }

  const summary = summaryParts.length > 0
    ? summaryParts.join(' ')
    : `A deep dive into ${topic}. Watch to learn more.`;

  // Chapter markers in "X:XX Title" format
  const chapterLines = chapters.map(ch => `${ch.timestamp} ${ch.title}`).join('\n');

  // Tags line
  const tagsLine = `Tags: ${tags.join(', ')}`;

  return `${summary}\n\n${chapterLines}\n\n${tagsLine}`;
}
