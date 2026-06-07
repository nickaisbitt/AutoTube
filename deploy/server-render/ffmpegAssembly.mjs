/**
 * FFmpeg-based B-roll assembly — real video cuts instead of canvas Ken Burns stills.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { join, dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assetCutIntervalSec } from './youtubeProfile.mjs';
import { muxVideoWithAudio } from './audio.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FPS = 24;

function probeMediaDuration(path) {
  const probe = spawnSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', path],
    { encoding: 'utf8' },
  );
  const d = parseFloat((probe.stdout || '').trim());
  return Number.isFinite(d) ? d : 0;
}

function trimAudioToDuration(inputPath, outputPath, targetSec) {
  const r = spawnSync(
    'ffmpeg',
    ['-y', '-i', inputPath, '-t', String(targetSec), '-c:a', 'pcm_s16le', outputPath],
    { encoding: 'utf8', timeout: 120_000 },
  );
  return r.status === 0 && existsSync(outputPath);
}

function outputDimensions() {
  const draft = process.env.AUTOTUBE_RENDER_QUALITY === 'draft';
  return draft ? { w: 960, h: 540 } : { w: 1920, h: 1080 };
}

function ffmpegPreset() {
  return process.env.AUTOTUBE_FFMPEG_PRESET || (process.env.AUTOTUBE_RENDER_QUALITY === 'draft' ? 'ultrafast' : 'fast');
}

function computeActiveAssetIndex(timeInSegment, assetCount, intervalSec) {
  if (assetCount <= 1) return 0;
  if (intervalSec <= 0) return 0;
  return Math.floor(timeInSegment / intervalSec) % assetCount;
}

function resolveTimelineAsset(entry, segMedia) {
  const byId = segMedia.find((m) => m.id === entry.assetId);
  if (byId) return byId;
  const idx = Math.floor((entry.startSec || 0) / Math.max(entry.endSec - entry.startSec, 0.5)) % segMedia.length;
  return segMedia[idx] || segMedia[0];
}

function buildClipSchedule(segment, segMedia, intervalSec, project) {
  const targetDuration = segment.duration || 20;
  const timeline = (project?.editTimeline || []).filter((e) => e.segmentId === segment.id);
  const clips = [];

  if (timeline.length) {
    for (const entry of timeline) {
      const asset = resolveTimelineAsset(entry, segMedia);
      if (!asset) continue;
      const durationSec = (entry.endSec ?? 0) - (entry.startSec ?? 0);
      if (durationSec <= 0.05) continue;
      clips.push({
        asset,
        startSec: entry.startSec,
        endSec: entry.endSec,
        durationSec,
      });
    }
  }

  const covered = clips.reduce((sum, c) => sum + c.durationSec, 0);
  let t = clips.length ? clips[clips.length - 1].endSec : 0;
  while (t < targetDuration - 0.05) {
    const idx = computeActiveAssetIndex(t, segMedia.length, intervalSec);
    const clipEnd = Math.min(targetDuration, t + intervalSec);
    clips.push({
      asset: segMedia[idx],
      startSec: t,
      endSec: clipEnd,
      durationSec: clipEnd - t,
    });
    t = clipEnd;
  }

  return clips;
}

function cachePathForUrl(url, cacheDir, isVideo) {
  const hash = createHash('sha1').update(url).digest('hex').slice(0, 16);
  let ext = '.jpg';
  try {
    ext = extname(new URL(url, 'http://local').pathname) || ext;
  } catch {
    /* ignore */
  }
  if (isVideo) ext = '.mp4';
  if (!/^\.(jpe?g|png|webp|gif|mp4|webm|mov)$/i.test(ext)) ext = isVideo ? '.mp4' : '.jpg';
  return join(cacheDir, `${hash}${ext}`);
}

async function fetchToCache(fetchUrl, cached) {
  const res = await fetch(fetchUrl, { signal: AbortSignal.timeout(45_000) });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 500) return null;
  writeFileSync(cached, buf);
  return cached;
}

async function ensureLocalAsset(asset, devServer, cacheDir) {
  mkdirSync(cacheDir, { recursive: true });
  const rawUrl = asset.url || '';
  const isVideo = asset.type === 'video' || /\.(mp4|webm|mov)/i.test(rawUrl);
  if (rawUrl && !rawUrl.startsWith('http') && !rawUrl.startsWith('/api/')) {
    const abs = resolve(rawUrl);
    return existsSync(abs) ? abs : null;
  }

  const candidates = [];
  if (rawUrl.startsWith('/api/')) {
    candidates.push(`${devServer}${rawUrl}`);
  } else if (rawUrl.startsWith('http')) {
    if (isVideo) {
      candidates.push(`${devServer}/api/download-clip?url=${encodeURIComponent(rawUrl)}`);
    }
    candidates.push(`${devServer}/api/proxy-image?url=${encodeURIComponent(rawUrl)}`);
    candidates.push(rawUrl);
  }

  for (const fetchUrl of candidates) {
    if (!fetchUrl.startsWith('http')) continue;
    const cached = cachePathForUrl(fetchUrl, cacheDir, isVideo);
    if (existsSync(cached) && readFileSync(cached).length > 500) {
      return cached;
    }
    try {
      const path = await fetchToCache(fetchUrl, cached);
      if (path) return path;
    } catch {
      /* try next candidate */
    }
  }
  return null;
}

async function renderSegmentClips(segment, segMedia, project, outputPath, options) {
  const interval = assetCutIntervalSec(project) ?? options.cutIntervalSec ?? 1.25;
  const schedule = buildClipSchedule(segment, segMedia, interval, project);
  const { w, h } = outputDimensions();
  const preset = ffmpegPreset();
  const draft = process.env.AUTOTUBE_RENDER_QUALITY === 'draft';
  const tmpDir = join(dirname(outputPath), `seg-${segment.id}-clips`);
  const cacheDir = join(tmpDir, 'cache');
  mkdirSync(tmpDir, { recursive: true });
  for (const stale of ['concat.txt', ...Array.from({ length: 200 }, (_, i) => `clip-${String(i).padStart(3, '0')}.mp4`)]) {
    try {
      const p = join(tmpDir, stale);
      if (existsSync(p)) unlinkSync(p);
    } catch {
      /* ignore */
    }
  }

  const clipPaths = [];
  const devServer = options.devServer || 'http://localhost:5173';

  for (let i = 0; i < schedule.length; i++) {
    const { asset, durationSec } = schedule[i];
    const clipOut = join(tmpDir, `clip-${String(i).padStart(3, '0')}.mp4`);
    let localSrc = await ensureLocalAsset(asset, devServer, cacheDir);
    if (!localSrc) {
      for (const alt of segMedia) {
        if (alt.id === asset.id) continue;
        localSrc = await ensureLocalAsset(alt, devServer, cacheDir);
        if (localSrc) break;
      }
    }
    if (!localSrc) {
      console.log(`  [ffmpeg] clip ${i + 1}/${schedule.length}: skip — asset fetch failed`);
      continue;
    }

    const isVideo = asset.type === 'video' || /\.(mp4|webm|mov)/i.test(asset.url || '');
    let vf = `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`;
    if (!isVideo && !draft) {
      const frames = Math.max(1, Math.round(durationSec * FPS));
      vf = `zoompan=z='min(zoom+0.001,1.15)':d=${frames}:s=${w}x${h}:fps=${FPS},${vf}`;
    }

    const args = isVideo
      ? [
          '-y',
          '-ss',
          '0',
          '-i',
          localSrc,
          '-t',
          String(durationSec),
          '-vf',
          vf,
          '-c:v',
          'libx264',
          '-preset',
          preset,
          '-pix_fmt',
          'yuv420p',
          '-r',
          String(FPS),
          '-an',
          clipOut,
        ]
      : [
          '-y',
          '-loop',
          '1',
          '-i',
          localSrc,
          '-t',
          String(durationSec),
          '-vf',
          vf,
          '-c:v',
          'libx264',
          '-preset',
          preset,
          '-pix_fmt',
          'yuv420p',
          '-r',
          String(FPS),
          '-an',
          clipOut,
        ];

    const r = spawnSync('ffmpeg', args, { encoding: 'utf8', timeout: 180_000 });
    if (r.status === 0 && existsSync(clipOut)) {
      clipPaths.push(clipOut);
    } else if (i % 10 === 0 || i === schedule.length - 1) {
      console.log(`  [ffmpeg] clip ${i + 1}/${schedule.length}: ${r.status === 0 ? 'ok' : 'fail'}`);
    }
  }

  if (clipPaths.length === 0) {
    return { ok: false, error: 'no clips rendered for segment' };
  }

  const listFile = join(tmpDir, 'concat.txt');
  writeFileSync(listFile, clipPaths.map((p) => `file '${resolve(p)}'`).join('\n'));
  const r = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      listFile,
      '-c:v',
      'libx264',
      '-preset',
      preset,
      '-pix_fmt',
      'yuv420p',
      '-an',
      outputPath,
    ],
    { encoding: 'utf8', timeout: 300_000 },
  );
  if (r.status !== 0 || !existsSync(outputPath)) {
    return { ok: false, error: r.stderr?.slice(-300) || 'segment concat failed' };
  }

  const videoSec = probeMediaDuration(outputPath);
  return {
    ok: true,
    clipCount: clipPaths.length,
    scheduleCount: schedule.length,
    intervalSec: interval,
    targetSec: segment.duration || 20,
    videoSec,
  };
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
  const perSegment = [];
  let totalClipCount = 0;
  const preset = ffmpegPreset();

  const mediaPool = project.media || [];

  for (let si = 0; si < (project.script || []).length; si++) {
    const seg = project.script[si];
    let segMedia = mediaPool.filter((a) => a.segmentId === seg.id);
    if (!segMedia.length && mediaPool.length) {
      segMedia = mediaPool.map((a) => ({ ...a, segmentId: seg.id }));
    }
    if (!segMedia.length) continue;

    console.log(`  [ffmpeg] segment ${si + 1}/${project.script.length}: ${seg.title} (${(seg.duration || 0).toFixed(1)}s)`);
    const segOut = join(workDir, `segment-${si}.mp4`);
    const result = await renderSegmentClips(seg, segMedia, project, segOut, options);
    if (!result.ok) {
      return { ok: false, error: result.error, segment: seg.title };
    }
    segmentOutputs.push(segOut);
    totalClipCount += result.clipCount;
    perSegment.push({
      segmentId: seg.id,
      title: seg.title,
      clipCount: result.clipCount,
      scheduleCount: result.scheduleCount,
      targetSec: result.targetSec,
      videoSec: result.videoSec,
    });
  }

  if (segmentOutputs.length === 0) {
    return { ok: false, error: 'no segments rendered' };
  }

  const mergedVideo = join(workDir, 'merged-video.mp4');
  const listFile = join(workDir, 'segments.txt');
  writeFileSync(listFile, segmentOutputs.map((p) => `file '${resolve(p)}'`).join('\n'));
  const merge = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      listFile,
      '-c:v',
      'libx264',
      '-preset',
      preset,
      '-pix_fmt',
      'yuv420p',
      '-an',
      mergedVideo,
    ],
    { encoding: 'utf8', timeout: 300_000 },
  );
  if (merge.status !== 0 || !existsSync(mergedVideo)) {
    return { ok: false, error: 'segment merge failed' };
  }

  const videoDurationSec = probeMediaDuration(mergedVideo) || 60;
  const audioFile = options.mixedAudioPath;
  const audioDurationSec = audioFile && existsSync(audioFile) ? probeMediaDuration(audioFile) : 0;

  let audioForMux = audioFile;
  let audioTrimmedSec = 0;
  const muxDurationSec = videoDurationSec;

  if (audioFile && existsSync(audioFile) && audioDurationSec > videoDurationSec + 0.15) {
    const trimmedAudio = join(workDir, 'narration-trimmed.wav');
    if (trimAudioToDuration(audioFile, trimmedAudio, videoDurationSec)) {
      audioForMux = trimmedAudio;
      audioTrimmedSec = audioDurationSec - videoDurationSec;
      console.log(`  [ffmpeg] trimmed audio ${audioDurationSec.toFixed(1)}s → ${videoDurationSec.toFixed(1)}s (no video freeze-pad)`);
    }
  }

  if (audioForMux && existsSync(audioForMux)) {
    muxVideoWithAudio(mergedVideo, audioForMux, outputPath, muxDurationSec, {
      backgroundMusic: project.exportSettings?.backgroundMusic !== false,
      musicPreset: project.exportSettings?.musicPreset,
    });
  } else {
    spawnSync('ffmpeg', ['-y', '-i', mergedVideo, '-c', 'copy', outputPath], { encoding: 'utf8' });
  }

  const manifest = {
    clipCount: totalClipCount,
    videoSec: videoDurationSec,
    audioSec: audioDurationSec,
    audioTrimmedSec: Math.round(audioTrimmedSec * 100) / 100,
    tpadSec: 0,
    muxDurationSec,
    perSegment,
    cutIntervalSec: options.cutIntervalSec ?? assetCutIntervalSec(project),
  };
  const manifestPath = join(workDir, 'render-manifest.json');
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`  [ffmpeg] manifest: ${totalClipCount} clips, video ${videoDurationSec.toFixed(1)}s, tpad 0s`);

  return {
    ok: existsSync(outputPath),
    outputPath,
    mode: 'ffmpeg-assembly',
    segmentCount: segmentOutputs.length,
    manifest,
    manifestPath,
  };
}
