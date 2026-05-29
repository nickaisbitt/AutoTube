export interface ChapterMarker {
  title: string
  startTime: number
  endTime: number
}

export function generateFFmpegChapterMetadata(chapters: ChapterMarker[]): string {
  const lines: string[] = [';FFMETADATA1']

  for (const chapter of chapters) {
    const startMs = Math.round(chapter.startTime * 1000)
    const endMs = Math.round(chapter.endTime * 1000)
    lines.push('[CHAPTER]')
    lines.push('TIMEBASE=1/1000')
    lines.push(`START=${startMs}`)
    lines.push(`END=${endMs}`)
    lines.push(`title=${chapter.title}`)
  }

  return lines.join('\n')
}

export function embedChapters(
  videoFile: string,
  _chapters: ChapterMarker[],
  outputFile: string,
): string[] {
  const tempMetadataFile = `${outputFile}.ffmetadata.txt`

  return [
    '-i',
    videoFile,
    '-i',
    tempMetadataFile,
    '-map_metadata',
    '1',
    '-c',
    'copy',
    outputFile,
  ]
}

export function chaptersFromSegments(
  segments: { title: string; duration: number }[],
  offsetSeconds?: number,
): ChapterMarker[] {
  if (segments.length === 0) return []

  const offset = offsetSeconds ?? 0
  const chapters: ChapterMarker[] = []
  let currentTime = offset

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    const startTime = currentTime
    const endTime = currentTime + seg.duration

    chapters.push({
      title: seg.title,
      startTime,
      endTime,
    })

    currentTime = endTime
  }

  return chapters
}
