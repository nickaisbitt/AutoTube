/**
 * Growth Features Module - .mjs wrapper
 * Engagement optimization and metadata generation
 */

export function generateFFmpegChapterMetadata(chapters) {
  let metadata = ';FFMETADATA1\n';
  
  for (const chapter of chapters) {
    const startMs = Math.round(chapter.startTime * 1000);
    const endMs = Math.round(chapter.endTime * 1000);
    metadata += `\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=${startMs}\nEND=${endMs}\ntitle=${chapter.title}\n`;
  }
  
  return metadata;
}

export function chaptersFromSegments(segments, offsetSeconds = 0) {
  const chapters = [];
  let currentTime = offsetSeconds;
  
  for (const seg of segments) {
    chapters.push({
      title: seg.title || 'Chapter',
      startTime: currentTime,
      endTime: currentTime + seg.duration
    });
    currentTime += seg.duration;
  }
  
  return chapters;
}

export function embedChaptersCommand(videoFile, metadataFile, outputFile) {
  return [
    '-i', videoFile,
    '-i', metadataFile,
    '-map', '0',
    '-map_chapters', '1',
    '-c', 'copy',
    '-movflags', '+faststart',
    outputFile
  ];
}

export function selectCommentBait(topic, segmentIndex) {
  const templates = [
    "What do you think? Comment below",
    "Agree or disagree?",
    "Did you know this? Let us know",
    "Drop a comment with your take",
    "Share your thoughts below",
    "What's your experience?",
    "Tell us in the comments",
    "What would you do?",
    "Have you seen this before?",
    "What's your prediction?",
  ];
  
  const idx = (segmentIndex + topic.length) % templates.length;
  return templates[idx];
}

export function computeMidpointTime(segments) {
  const totalDuration = segments.reduce((sum, s) => sum + s.duration, 0);
  return totalDuration / 2;
}

export function generateEasterEggs(topic, segmentCount) {
  const messages = [
    "You found me!",
    "Easter egg discovered",
    "Hidden message unlocked",
    "Secret found!",
    "You're paying attention",
    "Nice catch!",
    "Observer detected",
    "Detail-oriented viewer",
  ];
  
  const eggs = [];
  const count = Math.min(3, Math.floor(segmentCount / 3));
  
  for (let i = 0; i < count; i++) {
    const segIdx = Math.floor(Math.random() * segmentCount);
    eggs.push({
      text: messages[Math.floor(Math.random() * messages.length)],
      x: Math.random() * 0.8 + 0.1,
      y: Math.random() * 0.8 + 0.1,
      alpha: 0.15,
      fontSize: 14,
      segmentIndex: segIdx
    });
  }
  
  return eggs;
}

export function drawEasterEgg(ctx, egg, w, h) {
  ctx.save();
  ctx.globalAlpha = egg.alpha;
  ctx.font = `${egg.fontSize}px sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(egg.text, egg.x * w, egg.y * h);
  ctx.restore();
}

export function computeSpeedRamp(clipDuration, targetDuration) {
  if (clipDuration <= 0 || targetDuration <= 0) return { speed: 1.0, loop: false };
  
  const ratio = targetDuration / clipDuration;
  
  if (ratio >= 0.5 && ratio <= 2.0) {
    return { speed: ratio, loop: false };
  } else if (ratio > 2.0) {
    return { speed: 1.0, loop: true };
  } else {
    return { speed: 2.0, loop: false };
  }
}

export function generateABThumbnailVariants(title, accentColor) {
  return [
    {
      textOverlay: title.split(' ').slice(0, 3).join(' '),
      colorScheme: 'warm',
      textPosition: 'center',
      contrastBoost: 1.2
    },
    {
      textOverlay: title.split(' ').slice(0, 2).join(' '),
      colorScheme: 'cool',
      textPosition: 'lower',
      contrastBoost: 1.0
    }
  ];
}

export function detectEmotionalTone(text) {
  const lower = text.toLowerCase();
  
  if (/urgent|critical|breaking|alert|warning/.test(lower)) return 'urgent';
  if (/calm|peaceful|serene|gentle|quiet/.test(lower)) return 'calm';
  if (/dramatic|shocking|stunning|incredible/.test(lower)) return 'dramatic';
  if (/hopeful|optimistic|promising|bright/.test(lower)) return 'hopeful';
  if (/ominous|threatening|dangerous|risk/.test(lower)) return 'ominous';
  
  return 'neutral';
}
