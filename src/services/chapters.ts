import type { ScriptSegment } from '../types';

/**
 * Generates YouTube chapter markers from script segments.
 * Returns a formatted string that can be used in video descriptions.
 */
export function generateChapterMarkers(segments: ScriptSegment[]): string {
  const chapters: string[] = [];
  let currentTime = 0;

  for (const segment of segments) {
    const timestamp = formatTimestamp(currentTime);
    chapters.push(`${timestamp} ${segment.title}`);
    currentTime += segment.duration;
  }

  return chapters.join('\n');
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
