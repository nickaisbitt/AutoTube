import type { ScriptSegment } from '../types';

// ---------------------------------------------------------------------------
// Task 140: Launch checklist — generates optimal upload time, community post,
// and social media post draft for YouTube video launch.
// ---------------------------------------------------------------------------

interface LaunchChecklist {
  optimalUploadTime: string;
  communityPostDraft: string;
  socialMediaPostDraft: string;
  checklistItems: string[];
}

/**
 * Generates a launch checklist with optimal upload time, community post draft,
 * and social media post draft based on the video topic and segments.
 */
export function generateLaunchChecklist(
  topic: string,
  title: string,
  segments: ScriptSegment[],
): LaunchChecklist {
  const topicWords = topic.split(/\s+/).filter(w => w.length > 2);
  const primaryKeyword = topicWords[0] || topic;
  const hookLine = segments[0]?.narration?.split('.')[0] || `Here's what you need to know about ${topic}`;

  return {
    optimalUploadTime: computeOptimalUploadTime(),
    communityPostDraft: buildCommunityPostDraft(title, topic, hookLine, segments),
    socialMediaPostDraft: buildSocialMediaPostDraft(title, topic, primaryKeyword, hookLine),
    checklistItems: buildChecklistItems(title),
  };
}

function computeOptimalUploadTime(): string {
  const now = new Date();
  const day = now.getDay();
  // Best times: weekdays 2-4 PM EST, weekends 9-11 AM EST
  const isWeekday = day >= 1 && day <= 5;
  const hour = isWeekday ? 14 : 9;
  const tz = 'EST';
  return `${hour}:00 ${tz} on ${isWeekday ? 'weekday' : 'weekend'} (${isWeekday ? 'Tue-Thu recommended' : 'Sat-Sun recommended'})`;
}

function buildCommunityPostDraft(
  title: string,
  topic: string,
  hookLine: string,
  segments: ScriptSegment[],
): string {
  const preview = hookLine.substring(0, 120);
  const bulletPoints = segments.slice(1, 4).map(s => `• ${s.title}`).join('\n');
  return `NEW VIDEO: ${title}

${preview}...

In this video we cover:
${bulletPoints}

What's your take? Drop a comment below 👇

#${topic.replace(/\s+/g, '')} #YouTube`;
}

function buildSocialMediaPostDraft(
  title: string,
  _topic: string,
  primaryKeyword: string,
  hookLine: string,
): string {
  const shortHook = hookLine.substring(0, 100);
  return `New video out now: ${title}

${shortHook}...

Watch the full breakdown: [LINK]

#${primaryKeyword.replace(/\s+/g, '')} #NewVideo`;
}

function buildChecklistItems(_title: string): string[] {
  return [
    'Video file exported and quality-checked',
    'Thumbnail uploaded and A/B tested',
    'Title optimized for SEO (under 100 chars)',
    'Description filled with chapters, links, and hashtags',
    'Tags added (10-15 relevant tags)',
    'End screen elements configured',
    'Info cards added at 20%, 50%, 80%',
    'Closed captions uploaded (SRT/VTT)',
    'Community post drafted and scheduled',
    'Social media posts scheduled',
    'Video scheduled for optimal upload time',
  ];
}
