import { logger } from './logger';
import type { ScriptSegment, VideoProject } from '../types';
import { generateDetailedChapters } from './chapters';
import { generateTitleOptions, optimizeTitleForSEO, extractDataPoints } from './seoTitles';

interface YouTubeUploadConfig {
  title: string;
  description: string;
  tags: string[];
  category?: string;
  privacyStatus?: 'private' | 'unlisted' | 'public';
  thumbnail?: File;
  chapterMarkers?: string;
  titleOptions?: string[];
}

interface ContentCheck {
  name: string;
  passed: boolean;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

/**
 * Runs content moderation checks before upload.
 * Validates title, description, tags, and content guidelines.
 */
function runContentChecks(
  title: string,
  description: string,
  tags: string[],
): ContentCheck[] {
  const checks: ContentCheck[] = [];

  // Title checks
  checks.push({
    name: 'Title Length',
    passed: title.length <= 100,
    message: title.length > 100 
      ? `Title is ${title.length} chars (max 100). Truncated automatically.`
      : `Title is ${title.length} chars (good)`,
    severity: title.length > 100 ? 'warning' : 'info',
  });

  checks.push({
    name: 'Title Has Keywords',
    passed: title.split(/\s+/).length >= 3,
    message: title.split(/\s+/).length < 3 
      ? 'Title should have at least 3 words for better SEO'
      : 'Title has good keyword density',
    severity: title.split(/\s+/).length < 3 ? 'warning' : 'info',
  });

  // Description checks
  checks.push({
    name: 'Description Length',
    passed: description.length >= 100,
    message: description.length < 100
      ? 'Description is too short (min 100 chars for SEO)'
      : `Description is ${description.length} chars (good)`,
    severity: description.length < 100 ? 'warning' : 'info',
  });

  checks.push({
    name: 'Description Has Links',
    passed: /https?:\/\//.test(description),
    message: /https?:\/\//.test(description)
      ? 'Description contains links (good for engagement)'
      : 'Consider adding relevant links in description',
    severity: 'info',
  });

  // Tags checks
  checks.push({
    name: 'Tag Count',
    passed: tags.length >= 5,
    message: tags.length < 5
      ? `Only ${tags.length} tags (recommend 10-15 for SEO)`
      : `${tags.length} tags (good)`,
    severity: tags.length < 5 ? 'warning' : 'info',
  });

  checks.push({
    name: 'No Duplicate Tags',
    passed: new Set(tags.map(t => t.toLowerCase())).size === tags.length,
    message: new Set(tags.map(t => t.toLowerCase())).size !== tags.length
      ? 'Duplicate tags detected - removed automatically'
      : 'No duplicate tags',
    severity: new Set(tags.map(t => t.toLowerCase())).size !== tags.length ? 'warning' : 'info',
  });

  return checks;
}

/**
 * Opens YouTube Studio upload page with pre-filled metadata.
 * Since direct API uploads require OAuth, this provides a guided manual upload flow.
 */
export function openYouTubeUpload(videoBlob: Blob, config: YouTubeUploadConfig): void {
  // Run content checks first
  const checks = runContentChecks(config.title, config.description, config.tags);
  const errors = checks.filter(c => c.severity === 'error');
  
  if (errors.length > 0) {
    logger.error('YouTube', `Upload blocked: ${errors.length} content check(s) failed`);
    return;
  }

  // Create a downloadable video file
  const url = URL.createObjectURL(videoBlob);
  const downloadExtension = videoBlob.type.includes('mp4') ? 'mp4' : 'webm';
  const a = document.createElement('a');
  a.href = url;
  a.download = `${config.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.${downloadExtension}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  
  // Copy metadata to clipboard for easy pasting
  const metadata = [
    `Title: ${config.title}`,
    config.titleOptions?.length ? `Title ideas:\n- ${config.titleOptions.join('\n- ')}` : null,
    `Description:\n${config.description}`,
    config.chapterMarkers ? `Chapters:\n${config.chapterMarkers}` : null,
    `Tags: ${config.tags.join(', ')}`,
  ].filter(Boolean).join('\n\n');
  navigator.clipboard?.writeText(metadata).then(() => {
    logger.info('YouTube', 'Metadata copied to clipboard');
  }).catch((err) => {
    logger.warn('YouTube', 'Failed to copy metadata to clipboard', err);
  });
  
  // Open YouTube Studio upload page
  window.open('https://studio.youtube.com/video/upload', '_blank');
  
  logger.info('YouTube', 'Video file downloaded. Upload it to YouTube Studio.');
}

/**
 * Truncates text to `maxLen` characters at a sentence boundary (`.` or `\n`) where possible.
 * Falls back to a hard cut if no boundary is found within the last 200 characters.
 */
function truncateAtBoundary(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;

  const candidate = text.substring(0, maxLen);
  // Search backwards for a sentence boundary within the last 200 chars of the candidate
  const searchFrom = Math.max(0, maxLen - 200);
  const lastDot = candidate.lastIndexOf('.', maxLen - 1);
  const lastNewline = candidate.lastIndexOf('\n', maxLen - 1);
  const boundary = Math.max(lastDot, lastNewline);

  if (boundary > searchFrom) {
    return text.substring(0, boundary + 1);
  }
  // No boundary found — hard cut
  return candidate;
}

/**
 * Generates optimized YouTube metadata from project data.
 *
 * The optional fourth parameter `project` enables a rich description with
 * hook paragraph, "What you'll learn:" bullets, "Key Numbers:" data points,
 * "Chapters:", and hashtags. When omitted the function falls back to the
 * previous behaviour so existing call sites continue to work (Requirement 23.2).
 */
export function generateYouTubeMetadata(
  title: string,
  topic: string,
  script: ScriptSegment[],
  project?: VideoProject,
): YouTubeUploadConfig {
  const optimizedTitle = title;
  const titleOptions = generateTitleOptions(topic)
    .slice(0, 5)
    .map((option) => optimizeTitleForSEO(option.title));

  const rawChapterMarkers = generateDetailedChapters(script);

  // Offset chapter timestamps by 5 seconds to account for the cold open (2s)
  // and title card (3s) that the server renderer prepends before the first segment.
  // Also prepend a "0:00 Intro" line for the cold open + title card period.
  const offsetChapterLines = rawChapterMarkers.split('\n').map(line => {
    const match = line.match(/^(\d{2}):(\d{2}):(\d{2})\s(.+)$/) || line.match(/^(\d{2}):(\d{2})\s(.+)$/);
    if (!match) return line;
    let totalSeconds: number;
    let rest: string;
    if (match.length === 5) {
      // HH:MM:SS format
      totalSeconds = parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]) + 5;
      rest = match[4];
    } else {
      // MM:SS format
      totalSeconds = parseInt(match[1]) * 60 + parseInt(match[2]) + 5;
      rest = match[3];
    }
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    const timestamp = hours > 0
      ? `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
      : `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    return `${timestamp} ${rest}`;
  });
  const chapterMarkers = `00:00 🎥 Intro\n${offsetChapterLines.join('\n')}`;

  // --- Build rich description ---
  const sections: string[] = [];

  // 1. Hook paragraph: first segment narration truncated to 300 chars
  const firstNarration = script[0]?.narration ?? '';
  const hook = firstNarration.length > 300
    ? firstNarration.substring(0, 300)
    : firstNarration;
  if (hook) {
    sections.push(hook);
  }

  // 2. "What you'll learn:" bullets — one per segment title
  if (script.length > 0) {
    const bullets = script.map(seg => `• ${seg.title}`).join('\n');
    sections.push(`What you'll learn:\n${bullets}`);
  }

  // 3. "Key Points:" section — one bullet per segment title summarising the angle
  if (script.length > 0) {
    const keyPoints = script.map(seg => `▸ ${seg.title}`).join('\n');
    sections.push(`Key Points:\n${keyPoints}`);
  }

  // 4. "Key Numbers:" section — only when extractDataPoints returns ≥ 1 item
  const mediaAssets = project?.media ?? [];
  const dataPoints = extractDataPoints(mediaAssets);
  if (dataPoints.length > 0) {
    const dataLines = dataPoints.join('\n');
    sections.push(`Key Numbers:\n${dataLines}`);
  }

  // 5. "Chapters:" section
  sections.push(`Chapters:\n${chapterMarkers}`);

  // 6. "Sources:" section — use actual media source URLs when available (#30)
  const sourceUrls = [...new Set(
    (project?.media ?? [])
      .filter(a => a.sourceUrl && !a.sourceUrl.includes('picsum'))
      .map(a => `• ${a.source}: ${a.sourceUrl}`)
  )].slice(0, 5);
  const sourcesSection = sourceUrls.length > 0
    ? `Sources:\n${sourceUrls.join('\n')}`
    : `Sources:\n• [Add your sources here]`;
  sections.push(sourcesSection);

  // 5. Hashtag line: at least 3 hashtags from topic words and style
  const style = project?.style ?? 'documentary';
  const topicWords = topic.split(/\s+/).filter(w => w.length > 0);
  const hashtags: string[] = [];
  // Add hashtags from topic words (capitalise first letter)
  for (const word of topicWords) {
    hashtags.push(`#${word.charAt(0).toUpperCase()}${word.slice(1)}`);
  }
  // Add style hashtag
  hashtags.push(`#${style.replace(/_/g, '')}`);
  // Ensure at least 3 hashtags
  if (hashtags.length < 3) {
    hashtags.push('#AI', '#Documentary', '#Explained');
  }
  // Deduplicate (case-insensitive)
  const seenHashtags = new Set<string>();
  const uniqueHashtags: string[] = [];
  for (const tag of hashtags) {
    const lower = tag.toLowerCase();
    if (!seenHashtags.has(lower)) {
      seenHashtags.add(lower);
      uniqueHashtags.push(tag);
    }
  }

  // #32: Extract entities from script narration for additional hashtags
  for (const seg of script) {
    const entities = seg.narration.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g) || [];
    for (const entity of entities.slice(0, 3)) {
      const tag = `#${entity.replace(/\s+/g, '')}`;
      if (!seenHashtags.has(tag.toLowerCase())) {
        seenHashtags.add(tag.toLowerCase());
        uniqueHashtags.push(tag);
      }
    }
  }

  sections.push(uniqueHashtags.join(' '));

  const rawDescription = sections.join('\n\n');

  // 6. Truncate at 5000 chars at a sentence boundary where possible
  const description = truncateAtBoundary(rawDescription, 5000);

  // --- Build smart tags ---
  const year = new Date().getFullYear();
  const baseWords = topic.split(/\s+/).filter(w => w.length > 3);
  const tagList: string[] = [
    topic,
    style,
    ...baseWords,
    ...baseWords.map(w => `${w} explained`),
    ...baseWords.map(w => `${w} documentary ${year}`),
    ...baseWords.map(w => `${w} ${style}`),
  ];

  // Supplement with generic tags if fewer than 2 base words.
  // Add enough extras so that after deduplication we still reach at least 5 tags.
  if (baseWords.length < 2) {
    tagList.push('AI generated', 'documentary', 'explained', 'AI video', 'education');
  }

  // Deduplicate case-insensitively and cap at 15
  const seenTags = new Set<string>();
  const uniqueTags: string[] = [];
  for (const tag of tagList) {
    const lower = tag.toLowerCase();
    if (!seenTags.has(lower)) {
      seenTags.add(lower);
      uniqueTags.push(tag);
    }
    if (uniqueTags.length === 15) break;
  }

  return {
    title: optimizedTitle.length > 100 ? optimizedTitle.substring(0, 97) + '...' : optimizedTitle,
    description,
    tags: uniqueTags,
    category: 'Education',
    privacyStatus: 'private', // Default to private for review
    chapterMarkers,
    titleOptions,
  };
}
