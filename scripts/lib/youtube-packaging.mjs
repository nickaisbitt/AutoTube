/**
 * Title + thumbnail text suggestions (YouTube packaging — items 9–10).
 */
export function buildPackagingSuggestions(project) {
  const topic = project?.topic || project?.title || 'Healthcare AI';
  const hook = project?.script?.[0]?.narration?.slice(0, 120) || topic;

  const titles = [
    `The Hospital Hack Nobody Saw Coming`,
    `How AI Exposed Millions of Medical Records`,
    `Hospitals Paid Billions After This Mistake`,
    `${topic} — What They Aren't Telling You`,
    `This Cyberattack Changed Healthcare Forever`,
  ];

  const thumbnails = [
    'HOSPITAL HACK',
    'YOUR DATA',
    'AI EXPOSED',
    'BILLIONS LOST',
    'WATCH THIS',
  ];

  return {
    topic,
    hookExcerpt: hook,
    recommendedTitle: titles[0],
    titleVariants: titles,
    thumbnailTextOptions: thumbnails,
    descriptionTemplate:
      `${hook}\n\nIn this video we break down ransomware, AI in hospitals, and what it means for your medical records.\n\n#cybersecurity #healthcare #AI`,
    checklist: {
      hookFirst3s: 'Lead with shock line, not year/context',
      visualCutSec: 1.25,
      captionMaxWords: 4,
      ctaEndScreen: 'Subscribe + Watch Next',
    },
  };
}
