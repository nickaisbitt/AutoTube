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

export function generateDescription(project: VideoProject): string {
  const title = project.title || project.topic;
  const summary = extractTopicSummary(project.script);
  const chapters = generateChapterMarkers(project.script);
  const keywords = extractKeywords(project.topic);
  const hashtags = keywords.map(k => `#${k}`).join(' ');

  const lines = [
    title,
    '',
    summary,
    '',
    'Chapters:',
    chapters,
    '',
    hashtags,
    '',
    'Subscribe for more content like this!',
  ];

  return lines.join('\n');
}
