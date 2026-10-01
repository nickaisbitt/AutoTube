import type { ScriptSegment } from '../types';

/**
 * Generates YouTube chapter markers from script segments.
 * Returns a formatted string that can be used in video descriptions.
 */
export function generateChapterMarkers(segments: ScriptSegment[]): string {
  const chapters: string[] = [];
  let currentTime = 0;

  // Task 133: Ensure first chapter always starts at 00:00
  if (segments.length > 0) {
    chapters.push(`00:00 ${useCuriosityGapTitle(segments[0], 0)}`);
    currentTime = segments[0].duration;
    for (let i = 1; i < segments.length; i++) {
      const timestamp = formatTimestamp(currentTime);
      const chapterTitle = useCuriosityGapTitle(segments[i], currentTime);
      chapters.push(`${timestamp} ${chapterTitle}`);
      currentTime += segments[i].duration;
    }
  }

  return chapters.join('\n');
}

/**
 * Converts a descriptive chapter title into a curiosity gap title.
 * Instead of "The Problem", uses "Why This Changes Everything" or "The Part Nobody Talks About".
 *
 * Task 88: Curiosity gap chapter titles
 */
function useCuriosityGapTitle(segment: ScriptSegment, startTime: number): string {
  const original = segment.title;
  const lower = original.toLowerCase();

  // If chapterLabel exists and is different from title, prefer it
  if (segment.chapterLabel && segment.chapterLabel !== original) {
    return segment.chapterLabel;
  }

  // Already a curiosity gap title (contains ?, contains "Why", "How", etc.)
  if (/\?|why|how|what happens|the truth|the real|nobody|secret|hidden/i.test(original)) {
    return original;
  }

  // Map common descriptive titles to curiosity gap alternatives
  const curiosityGapMap: Record<string, string> = {
    'introduction': 'What They Don\'t Want You to Know',
    'the problem': 'Why This Is Worse Than You Think',
    'the solution': 'The Fix Nobody Expected',
    'conclusion': 'The Part That Changes Everything',
    'background': 'How We Got Here (It\'s Not What You Think)',
    'context': 'The Story Behind the Story',
    'analysis': 'What the Numbers Actually Reveal',
    'overview': 'The Hidden Pattern Nobody Noticed',
    'summary': 'Here\'s What Actually Matters',
    'the truth': 'The Reality Is Worse',
    'what happened': 'What Happened Next Changed Everything',
    'impact': 'The Consequence No One Saw Coming',
    'history': 'It Started With One Mistake',
    'future': 'What Happens Next Will Surprise You',
    'risks': 'The Danger You\'re Ignoring Right Now',
    'benefits': 'The Unexpected Upside',
    'challenges': 'The Obstacle Nobody Prepared For',
    'data': 'The Numbers That Change Everything',
    'evidence': 'What the Evidence Actually Shows',
    'results': 'The Outcome Nobody Predicted',
    'case study': 'One Story That Explains It All',
    'examples': 'The Example That Changes Your Mind',
    'key points': 'The Part You Can\'t Ignore',
    'takeaways': 'What You Need to Remember',
    'the turning point': 'The Moment Everything Shifted',
    'the bridge': 'And Then It Got Worse',
  };

  // Try exact match first
  if (curiosityGapMap[lower]) {
    return curiosityGapMap[lower];
  }

  // Try partial match
  for (const [key, value] of Object.entries(curiosityGapMap)) {
    if (lower.includes(key)) {
      return value;
    }
  }

  // For intro segments, always use a hook
  if (segment.type === 'intro') {
    const hooks = [
      'What They Don\'t Want You to Know',
      'This Changes Everything',
      'The Hidden Truth',
      'Nobody\'s Talking About This',
    ];
    return hooks[Math.floor(startTime) % hooks.length];
  }

  // For transition segments
  if (segment.type === 'transition') {
    const transitions = [
      'And Then It Got Worse',
      'But Here\'s Where It Gets Interesting',
      'The Part Nobody Saw Coming',
    ];
    return transitions[Math.floor(startTime) % transitions.length];
  }

  // For outro segments
  if (segment.type === 'outro') {
    return 'The Part That Changes Everything';
  }

  // Default: prepend "The" if it's a simple noun, or use "Why"
  if (original.split(' ').length <= 3) {
    return `Why ${original.charAt(0).toUpperCase() + original.slice(1)} Matters More Than You Think`;
  }

  return original;
}

/**
 * Formats seconds to YouTube chapter timestamp (MM:SS or HH:MM:SS).
 */
function formatTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Generates chapter markers with segment types.
 */
export function generateDetailedChapters(segments: ScriptSegment[]): string {
  const chapters: string[] = [];
  let currentTime = 0;

  const typeEmojis: Record<string, string> = {
    intro: '🎬',
    section: '📖',
    transition: '➡️',
    outro: '🏁',
  };

  for (const segment of segments) {
    const timestamp = formatTimestamp(currentTime);
    const emoji = typeEmojis[segment.type] || '📌';
    chapters.push(`${timestamp} ${emoji} ${segment.title}`);
    currentTime += segment.duration;
  }

  return chapters.join('\n');
}

/**
 * Copies content to clipboard. When a full description (summary + chapters + tags)
 * is provided, copies that instead of just the chapter markers.
 *
 * @param chapters - Chapter markers string (used as fallback)
 * @param fullDescription - Optional full YouTube description to copy instead
 *
 * Requirements: 5.6, 5.7
 */
export function copyChaptersToClipboard(chapters: string, fullDescription?: string): Promise<void> {
  return navigator.clipboard.writeText(fullDescription ?? chapters);
}
