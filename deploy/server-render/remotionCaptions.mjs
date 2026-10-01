/**
 * Optional Remotion caption overlay — burns word-timed captions via ffmpeg when Remotion unavailable.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';

/**
 * @param {string} videoPath
 * @param {object} project
 * @param {Map<number, Array<{ word: string, start: number, end: number }>>} wordTimestampCache
 */
export async function overlayRemotionCaptions(videoPath, project, wordTimestampCache) {
  if (!existsSync(videoPath)) return { ok: false, error: 'video missing' };

  const assPath = join(dirname(videoPath), 'captions-overlay.ass');
  const lines = ['[Script Info]', 'Title: AutoTube', '', '[V4+ Styles]', 'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding', 'Style: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,3,0,2,40,40,80,1', '', '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text'];

  let idx = 0;
  for (const [, words] of wordTimestampCache) {
    for (const w of words) {
      const start = formatAssTime(w.start);
      const end = formatAssTime(w.end);
      lines.push(`Dialogue: 0,${start},${end},Default,,0,0,0,,${w.word}`);
      idx += 1;
    }
  }
  if (idx === 0) return { ok: false, error: 'no word timestamps' };

  writeFileSync(assPath, lines.join('\n'));
  const tmpOut = videoPath.replace(/\.mp4$/, '-captioned.mp4');
  const r = spawnSync(
    'ffmpeg',
    ['-y', '-i', videoPath, '-vf', `ass=${assPath}`, '-c:a', 'copy', tmpOut],
    { encoding: 'utf8', timeout: 600_000 },
  );
  if (r.status !== 0 || !existsSync(tmpOut)) {
    return { ok: false, error: r.stderr?.slice(-200) };
  }
  spawnSync('mv', ['-f', tmpOut, videoPath]);
  try {
    unlinkSync(assPath);
  } catch {
    /* ignore */
  }
  return { ok: true, captionCount: idx };
}

function formatAssTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const cs = Math.floor((s % 1) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(Math.floor(s)).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}
