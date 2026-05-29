import type { VideoProject, ScriptSegment } from '../types';
import { generateChapterMarkers } from './chapters';

function extractTopicSummary(segments: ScriptSegment[]): string {
  const firstSection = segments.find(s => s.type === 'section') || segments[0];
  if (!firstSection) return '';
  const text = firstSection.narration;
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20);
  return sentences.slice(0, 2).map(s => s.trim()).join('. ') + '.';
}

function extractKeywords(topic: string): string[] {
  const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought', 'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'because', 'but', 'and', 'or', 'if', 'while', 'about', 'what', 'which', 'who']);
  return topic
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w))
    .slice(0, 5);
}

/**
 * Generates an SEO-optimized YouTube description.
 *
 * Task 95: First 200 chars contain primary keyword. Includes timestamps,
 * links, hashtags. Under 5000 chars.
 */
export function generateDescription(
  project: VideoProject,
  options?: {
    hashtags?: string[];
    channelUrl?: string;
    socialLinks?: string[];
  },
): string {
  const primaryKeyword = project.topic.toLowerCase();
  const summary = extractTopicSummary(project.script);
  const chapters = generateChapterMarkers(project.script);
  const keywords = extractKeywords(project.topic);
  const hashtags = options?.hashtags ?? keywords.map(k => `#${k}`);

  // SEO optimization: first 200 chars must contain primary keyword
  const seoHook = `Learn everything about ${primaryKeyword} in this deep dive. ${summary}`;

  // Ensure first 200 chars contain the keyword
  const first200 = seoHook.slice(0, 200);
  const keywordInFirst200 = first200.toLowerCase().includes(primaryKeyword);

  const lines: string[] = [];

  // Line 1: SEO-optimized hook (keyword in first 200 chars)
  if (keywordInFirst200) {
    lines.push(seoHook);
  } else {
    lines.push(`${primaryKeyword} — ${summary}`);
  }

  lines.push('');

  // Timestamps / chapters
  lines.push('CHAPTERS:');
  lines.push(chapters);
  lines.push('');

  // Links section
  if (options?.channelUrl) {
    lines.push(`Subscribe: ${options.channelUrl}`);
  }
  if (options?.socialLinks && options.socialLinks.length > 0) {
    lines.push(`Follow us: ${options.socialLinks.join(' | ')}`);
  }
  lines.push('');

  // Hashtags (YouTube shows first 3 above title)
  lines.push(hashtags.join(' '));
  lines.push('');

  // CTA
  lines.push('Like and subscribe for more deep dives like this!');
  lines.push('');

  // Description under 5000 chars
  const result = lines.join('\n');
  if (result.length > 5000) {
    return result.slice(0, 4997) + '...';
  }
  return result;
}
