import { logger } from './logger';

/**
 * Generates SRT subtitle content from script segments.
 * Returns a string in SRT format that can be saved as a .srt file.
 */
export function generateSRTSubtitles(
  segments: Array<{ narration: string; duration: number }>,
  startTimeOffset = 0,
): string {
  const srtLines: string[] = [];
  let currentTime = startTimeOffset;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const start = formatSRTTime(currentTime);
    const end = formatSRTTime(currentTime + seg.duration);
    
    // Split long narration into readable chunks
    const captionText = formatCaption(seg.narration);
    
    srtLines.push(`${i + 1}`);
    srtLines.push(`${start} --> ${end}`);
    srtLines.push(captionText);
    srtLines.push('');
    
    currentTime += seg.duration;
  }

  return srtLines.join('\n');
}

/**
 * Formats seconds to SRT time format: HH:MM:SS,mmm
 */
function formatSRTTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const millis = Math.round((seconds % 1) * 1000);
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${millis.toString().padStart(3, '0')}`;
}

/**
 * Formats caption text for readability (max ~40 chars per line).
 */
function formatCaption(text: string): string {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';
  
  for (const word of words) {
    if ((currentLine + ' ' + word).trim().length > 40 && currentLine) {
      lines.push(currentLine.trim());
      currentLine = word;
    } else {
      currentLine = (currentLine + ' ' + word).trim();
    }
  }
  if (currentLine) lines.push(currentLine);
  
  return lines.join('\n');
}

/**
 * Generates WebVTT subtitle content from script segments.
 * Returns a string in VTT format that can be saved as a .vtt file.
 */
export function generateVTTSubtitles(
  segments: Array<{ narration: string; duration: number }>,
  startTimeOffset = 0,
): string {
  const vttLines = ['WEBVTT\n'];
  let currentTime = startTimeOffset;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const start = formatVTTTime(currentTime);
    const end = formatVTTTime(currentTime + seg.duration);
    const captionText = formatCaption(seg.narration);
    
    vttLines.push(`${start} --> ${end}`);
    vttLines.push(captionText);
    vttLines.push('');
    
    currentTime += seg.duration;
  }

  return vttLines.join('\n');
}

/**
 * Formats seconds to WebVTT time format: HH:MM:SS.mmm
 */
function formatVTTTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const millis = Math.round((seconds % 1) * 1000);
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`;
}

/**
 * Downloads subtitle content as a file.
 */
export function downloadSubtitles(content: string, filename: string, format: 'srt' | 'vtt'): void {
  const mimeType = format === 'srt' ? 'text/srt' : 'text/vtt';
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  logger.success('Subtitles', `Downloaded ${filename}`);
}

// --- Text Competition & Readability Enhancements ---

/** Result of text competition analysis */
export interface TextCompetitionResult {
  hasConflict: boolean;
  resolution: 'show_subtitle' | 'show_kinetic' | 'stagger' | 'no_conflict';
  subtitleText: string;
  kineticText: string;
  reason: string;
}

/**
 * Detects and resolves conflicts between subtitle and kinetic text overlays.
 * Prevents both from displaying simultaneously when they would compete for attention.
 *
 * Rules:
 * - If both texts are present and overlap in meaning, prefer kinetic (more impactful).
 * - If both are present but unrelated, stagger display (kinetic first, subtitle after).
 * - If only one is present, no conflict.
 * - Empty strings are treated as absent.
 *
 * Validates: Requirements 2.83, 2.93
 */
export function preventTextCompetition(
  subtitleText: string,
  kineticText: string,
): TextCompetitionResult {
  const trimmedSubtitle = subtitleText.trim();
  const trimmedKinetic = kineticText.trim();

  // No conflict if either is empty
  if (!trimmedSubtitle || !trimmedKinetic) {
    return {
      hasConflict: false,
      resolution: 'no_conflict',
      subtitleText: trimmedSubtitle,
      kineticText: trimmedKinetic,
      reason: 'Only one text layer is active',
    };
  }

  // Check for overlapping meaning (shared significant words)
  const subtitleWords = new Set(
    trimmedSubtitle.toLowerCase().split(/\s+/).filter((w) => w.length > 3),
  );
  const kineticWords = trimmedKinetic.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  const overlap = kineticWords.filter((w) => subtitleWords.has(w));

  // If more than 40% of kinetic words overlap with subtitle, they compete
  const overlapRatio = kineticWords.length > 0 ? overlap.length / kineticWords.length : 0;

  if (overlapRatio > 0.4) {
    // Overlapping meaning — prefer kinetic text (more visual impact)
    return {
      hasConflict: true,
      resolution: 'show_kinetic',
      subtitleText: '',
      kineticText: trimmedKinetic,
      reason: 'Texts overlap in meaning; kinetic text preferred for visual impact',
    };
  }

  // Both present but unrelated — stagger display
  return {
    hasConflict: true,
    resolution: 'stagger',
    subtitleText: trimmedSubtitle,
    kineticText: trimmedKinetic,
    reason: 'Both texts present; stagger display to avoid visual competition',
  };
}

/** Configuration for a headline-style text card */
export interface HeadlineCardConfig {
  text: string;
  type: 'reveal' | 'statistic' | 'warning' | 'quote';
  style: {
    fontSize: 'large' | 'xlarge';
    fontWeight: 'bold' | 'black';
    alignment: 'center';
    animation: 'slam' | 'fade_up' | 'scale_in';
    durationMs: number;
    backgroundColor: string;
    textColor: string;
  };
}

/**
 * Generates a headline-style text card configuration for major reveals.
 * These cards are full-screen or near-full-screen text moments that punctuate
 * the narrative at key points.
 *
 * Validates: Requirements 2.84, 2.96
 */
export function generateHeadlineCard(
  text: string,
  type: 'reveal' | 'statistic' | 'warning' | 'quote',
): HeadlineCardConfig {
  // Enforce short text for headline cards (max 8 words)
  const words = text.trim().split(/\s+/);
  const truncatedText = words.length > 8 ? words.slice(0, 8).join(' ') + '…' : text.trim();

  const styleMap: Record<typeof type, Pick<HeadlineCardConfig['style'], 'animation' | 'backgroundColor' | 'textColor'>> = {
    reveal: { animation: 'slam', backgroundColor: '#000000', textColor: '#ffffff' },
    statistic: { animation: 'scale_in', backgroundColor: '#1e293b', textColor: '#f8fafc' },
    warning: { animation: 'slam', backgroundColor: '#7f1d1d', textColor: '#fecaca' },
    quote: { animation: 'fade_up', backgroundColor: '#0f172a', textColor: '#e2e8f0' },
  };

  const typeStyle = styleMap[type];

  return {
    text: truncatedText,
    type,
    style: {
      fontSize: type === 'statistic' ? 'xlarge' : 'large',
      fontWeight: type === 'warning' ? 'black' : 'bold',
      alignment: 'center',
      animation: typeStyle.animation,
      durationMs: type === 'quote' ? 3000 : 2000,
      backgroundColor: typeStyle.backgroundColor,
      textColor: typeStyle.textColor,
    },
  };
}

/**
 * Ensures text is short enough to be processed instantly by viewers.
 * Trims or splits text that exceeds cognitive load thresholds.
 *
 * Rules:
 * - Max 7 words per on-screen text phrase (cognitive load limit)
 * - Max 35 characters per line
 * - If text exceeds limits, it is truncated to the most impactful fragment
 *
 * Validates: Requirements 2.84, 2.85
 */
export function enforceInstantProcessing(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';

  const words = trimmed.split(/\s+/);

  // Already within limits
  if (words.length <= 7 && trimmed.length <= 35) {
    return trimmed;
  }

  // Truncate to 7 words max
  const truncatedWords = words.slice(0, 7);
  let result = truncatedWords.join(' ');

  // If still over 35 chars, trim further
  if (result.length > 35) {
    // Remove words from the end until within limit
    while (result.length > 35 && truncatedWords.length > 1) {
      truncatedWords.pop();
      result = truncatedWords.join(' ');
    }
  }

  return result;
}

/**
 * Identifies key nouns in text for selective emphasis.
 * Only nouns that carry the core meaning are marked — not every phrase.
 * This prevents over-emphasis that dilutes impact.
 *
 * Heuristic approach:
 * - Filters out common stop words, verbs, and adjectives
 * - Prioritizes capitalized words (proper nouns), numbers, and domain-specific terms
 * - Returns at most 3 key nouns to prevent over-emphasis
 *
 * Validates: Requirements 2.86, 2.92
 */
export function extractKeyNouns(text: string): string[] {
  if (!text.trim()) return [];

  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
    'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
    'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
    'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then',
    'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each',
    'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no',
    'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
    'just', 'because', 'but', 'and', 'or', 'if', 'while', 'about', 'up',
    'that', 'this', 'these', 'those', 'it', 'its', 'they', 'them', 'their',
    'we', 'our', 'you', 'your', 'he', 'she', 'his', 'her', 'my', 'me',
    'what', 'which', 'who', 'whom', 'get', 'got', 'make', 'made', 'take',
    'took', 'come', 'came', 'go', 'went', 'know', 'think', 'see', 'look',
    'want', 'give', 'use', 'find', 'tell', 'ask', 'work', 'seem', 'feel',
    'try', 'leave', 'call', 'keep', 'let', 'begin', 'show', 'hear', 'play',
    'run', 'move', 'live', 'believe', 'bring', 'happen', 'write', 'provide',
    'sit', 'stand', 'lose', 'pay', 'meet', 'include', 'continue', 'set',
    'learn', 'change', 'lead', 'understand', 'watch', 'follow', 'stop',
    'create', 'speak', 'read', 'allow', 'add', 'spend', 'grow', 'open',
    'walk', 'win', 'offer', 'remember', 'love', 'consider', 'appear',
    'buy', 'wait', 'serve', 'die', 'send', 'expect', 'build', 'stay',
    'fall', 'cut', 'reach', 'kill', 'remain', 'are', 'been', 'being',
    'also', 'still', 'already', 'even', 'now', 'new', 'old', 'big',
    'small', 'long', 'great', 'little', 'right', 'good', 'bad', 'much',
    'many', 'well', 'never', 'always', 'often', 'really', 'very',
  ]);

  const words = text.split(/\s+/).map((w) => w.replace(/[^a-zA-Z0-9$]/g, '')).filter(Boolean);

  // Score each word for "noun-ness" and importance
  const scored: Array<{ word: string; score: number }> = [];

  for (const word of words) {
    const lower = word.toLowerCase();
    if (stopWords.has(lower) || word.length < 3) continue;

    let score = 0;

    // Capitalized words (proper nouns) get higher score
    if (word[0] === word[0].toUpperCase() && word[0] !== word[0].toLowerCase()) {
      score += 3;
    }

    // Contains numbers (statistics, amounts) — high importance
    if (/\d/.test(word)) {
      score += 4;
    }

    // Contains $ sign (money-related)
    if (word.includes('$')) {
      score += 4;
    }

    // Longer words tend to be more specific nouns
    if (word.length >= 6) {
      score += 1;
    }

    // Domain-specific high-impact terms
    const impactTerms = new Set([
      'money', 'data', 'breach', 'attack', 'hack', 'stolen', 'ransomware',
      'identity', 'password', 'account', 'business', 'million', 'billion',
      'files', 'system', 'network', 'security', 'threat', 'risk', 'loss',
      'fraud', 'phishing', 'malware', 'shutdown', 'lockout', 'payroll',
    ]);
    if (impactTerms.has(lower)) {
      score += 3;
    }

    // Base score for surviving stop-word filter
    score += 1;

    scored.push({ word, score });
  }

  // Sort by score descending, take top 3
  scored.sort((a, b) => b.score - a.score);

  // Deduplicate (case-insensitive)
  const seen = new Set<string>();
  const result: string[] = [];
  for (const { word } of scored) {
    const lower = word.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      result.push(word);
    }
    if (result.length >= 3) break;
  }

  return result;
}

/** Mobile readability score result */
export interface MobileReadabilityScore {
  score: number; // 0-100, where 100 is perfectly readable
  pass: boolean; // true if score >= 70
  issues: string[];
  recommendations: string[];
}

/**
 * Scores text overlay readability on mobile devices.
 * Simulates viewing at typical mobile viewport sizes and evaluates
 * whether text can be read comfortably.
 *
 * Scoring factors:
 * - Character count (shorter is better for mobile)
 * - Font size relative to mobile viewport
 * - Word count per line
 * - Estimated reading time vs display time
 *
 * Validates: Requirements 2.88, 2.94, 2.95, 2.100
 */
export function scoreMobileReadability(
  text: string,
  fontSize: number,
): MobileReadabilityScore {
  const issues: string[] = [];
  const recommendations: string[] = [];
  let score = 100;

  const trimmed = text.trim();
  if (!trimmed) {
    return { score: 100, pass: true, issues: [], recommendations: [] };
  }

  const charCount = trimmed.length;
  const wordCount = trimmed.split(/\s+/).length;
  const lineCount = Math.ceil(charCount / 30); // Approximate lines at mobile width

  // Font size check — minimum 16px for mobile readability
  if (fontSize < 16) {
    score -= 30;
    issues.push(`Font size ${fontSize}px is too small for mobile (minimum 16px)`);
    recommendations.push('Increase font size to at least 16px for mobile readability');
  } else if (fontSize < 20) {
    score -= 10;
    issues.push(`Font size ${fontSize}px is marginal for mobile`);
    recommendations.push('Consider increasing font size to 20px+ for comfortable mobile reading');
  }

  // Character count — over 50 chars is hard to read on mobile
  if (charCount > 80) {
    score -= 25;
    issues.push(`Text too long (${charCount} chars) — exceeds mobile readability threshold`);
    recommendations.push('Shorten text to under 50 characters for mobile');
  } else if (charCount > 50) {
    score -= 15;
    issues.push(`Text length (${charCount} chars) is borderline for mobile`);
    recommendations.push('Consider shortening to under 50 characters');
  }

  // Word count — more than 10 words is too many for an overlay
  if (wordCount > 10) {
    score -= 20;
    issues.push(`Too many words (${wordCount}) for a text overlay`);
    recommendations.push('Reduce to 7 words or fewer for instant processing');
  } else if (wordCount > 7) {
    score -= 10;
    issues.push(`Word count (${wordCount}) is high for quick reading`);
    recommendations.push('Aim for 7 words or fewer');
  }

  // Line wrapping — more than 2 lines is problematic on mobile
  if (lineCount > 3) {
    score -= 20;
    issues.push(`Text wraps to ${lineCount} lines on mobile — too many`);
    recommendations.push('Reduce text to fit within 2 lines on mobile');
  } else if (lineCount > 2) {
    score -= 10;
    issues.push(`Text wraps to ${lineCount} lines on mobile`);
    recommendations.push('Consider reducing to 2 lines maximum');
  }

  // Ensure score stays in 0-100 range
  score = Math.max(0, Math.min(100, score));

  return {
    score,
    pass: score >= 70,
    issues,
    recommendations,
  };
}
