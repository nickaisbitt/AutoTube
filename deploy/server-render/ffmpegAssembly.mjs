/**
 * FFmpeg-based B-roll assembly — real video cuts instead of canvas Ken Burns stills.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, unlinkSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assetCutIntervalSec } from './youtubeProfile.mjs';
import { muxVideoWithAudio } from './audio.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FPS = 24;

function computeActiveAssetIndex(timeInSegment, assetCount, intervalSec) {
  if (assetCount <= 1) return 0;
  if (intervalSec <= 0) return 0;
  return Math.floor(timeInSegment / intervalSec) % assetCount;
}

function buildClipSchedule(segment, segMedia, intervalSec) {
  const duration = segment.duration || 20;
  const clips = [];
  let t = 0;
  while (t < duration - 0.05) {
    const idx = computeActiveAssetIndex(t, segMedia.length, intervalSec);
    const clipEnd = Math.min(duration, t + intervalSec);
    clips.push({ asset: segMedia[idx], startSec: t, endSec: clipEnd, durationSec: clipEnd - t });
    t = clipEnd;
  }
  return clips;
}

function downloadOrResolveUrl(asset, devServer) {
  const url = asset.url || '';
  if (url.startsWith('http')) return url;
  if (url.startsWith('/api/')) return `${devServer}${url}`;
  return url;
}

function renderSegmentClips(segment, segMedia, project, outputPath, options) {
  const interval = assetCutIntervalSec(project) ?? options.cutIntervalSec ?? 1.25;
  const schedule = buildClipSchedule(segment, segMedia, interval);
  const tmpDir = join(dirname(outputPath), `seg-${segment.id}-clips`);
  mkdirSync(tmpDir, { recursive: true });

  const clipPaths = [];
  for (let i = 0; i < schedule.length; i++) {
    const { asset, durationSec } = schedule[i];
    const clipOut = join(tmpDir, `clip-${String(i).padStart(3, '0')}.mp4`);
    const src = downloadOrResolveUrl(asset, options.devServer || 'http://localhost:5173');
    const isVideo = asset.type === 'video' || /\.(mp4|webm|mov)/i.test(src);

    let vf = 'scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080';
    if (!isVideo) {
      const frames = Math.max(1, Math.round(durationSec * FPS));
      vf = `zoompan=z='min(zoom+0.001,1.15)':d=${frames}:s=1920x1080:fps=${FPS},${vf}`;
    }

    const args = isVideo
      ? ['-y', '-ss', '0', '-i', src, '-t', String(durationSec), '-vf', vf, '-r', String(FPS), '-an', clipOut]
      : ['-y', '-loop', '1', '-i', src, '-t', String(durationSec), '-vf', vf, '-r', String(FPS), '-an', clipOut];

    const r = spawnSync('ffmpeg', args, { encoding: 'utf8', timeout: 120_000 });
    if (r.status === 0 && existsSync(clipOut)) {
      clipPaths.push(clipOut);
    }
  }

  if (clipPaths.length === 0) {
    return { ok: false, error: 'no clips rendered for segment' };
  }

  const listFile = join(tmpDir, 'concat.txt');
  writeFileSync(listFile, clipPaths.map((p) => `file '${p}'`).join('\n'));
  const r = spawnSync(
    'ffmpeg',
    ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', outputPath],
    { encoding: 'utf8', timeout: 180_000 },
  );
  if (r.status !== 0 || !existsSync(outputPath)) {
    return { ok: false, error: r.stderr?.slice(-300) || 'segment concat failed' };
  }
  return { ok: true, clipCount: clipPaths.length, intervalSec: interval };
}

/**
 * @param {object} project
 * @param {string} outputPath
 * @param {object} options
 */
export async function renderViaFfmpegAssembly(project, outputPath, options = {}) {
  const workDir = join(dirname(outputPath), 'ffmpeg-assembly');
  mkdirSync(workDir, { recursive: true });
  const segmentOutputs = [];

  for (let si = 0; si < (project.script || []).length; si++) {
    const seg = project.script[si];
    const segMedia = (project.media || []).filter((a) => a.segmentId === seg.id);
    if (!segMedia.length) continue;

    const segOut = join(workDir, `segment-${si}.mp4`);
    const result = renderSegmentClips(seg, segMedia, project, segOut, options);
    if (!result.ok) {
      return { ok: false, error: result.error, segment: seg.title };
    }
    segmentOutputs.push(segOut);
  }

  if (segmentOutputs.length === 0) {
    return { ok: false, error: 'no segments rendered' };
  }

  const mergedVideo = join(workDir, 'merged-video.mp4');
  const listFile = join(workDir, 'segments.txt');
  writeFileSync(listFile, segmentOutputs.map((p) => `file '${p}'`).join('\n'));
  const merge = spawnSync(
    'ffmpeg',
    ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', mergedVideo],
    { encoding: 'utf8', timeout: 300_000 },
  );
  if (merge.status !== 0 || !existsSync(mergedVideo)) {
    return { ok: false, error: 'segment merge failed' };
  }

  const audioFile = options.mixedAudioPath;
  let durationSec = 60;
  const probe = spawnSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', mergedVideo],
    { encoding: 'utf8' },
  );
  if (probe.stdout) {
    const d = parseFloat(probe.stdout.trim());
    if (Number.isFinite(d)) durationSec = d;
  }

  if (audioFile && existsSync(audioFile)) {
    muxVideoWithAudio(mergedVideo, audioFile, outputPath, durationSec, {
      backgroundMusic: project.exportSettings?.backgroundMusic !== false,
      musicPreset: project.exportSettings?.musicPreset,
    });
  } else {
    spawnSync('ffmpeg', ['-y', '-i', mergedVideo, '-c', 'copy', outputPath], { encoding: 'utf8' });
  }

  return { ok: existsSync(outputPath), outputPath, mode: 'ffmpeg-assembly', segmentCount: segmentOutputs.length };
}
