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
  const loopMode = process.env.AUTOTUBE_LOOP_MODE === '1' || process.env.AUTOTUBE_LOOP_MODE === 'true';
  if (draft && loopMode) return { w: 1280, h: 720 };
  return draft ? { w: 960, h: 540 } : { w: 1920, h: 1080 };
}

function ffmpegPreset() {
  return process.env.AUTOTUBE_FFMPEG_PRESET || (process.env.AUTOTUBE_RENDER_QUALITY === 'draft' ? 'ultrafast' : 'fast');
}

function hardCutsEnabled() {
  if (process.env.AUTOTUBE_FFMPEG_HARD_CUTS === '0' || process.env.AUTOTUBE_FFMPEG_HARD_CUTS === 'false') {
    return false;
  }
  if (process.env.AUTOTUBE_FFMPEG_HARD_CUTS === '1' || process.env.AUTOTUBE_FFMPEG_HARD_CUTS === 'true') {
    return true;
  }
  const loopMode = process.env.AUTOTUBE_LOOP_MODE === '1' || process.env.AUTOTUBE_LOOP_MODE === 'true';
  return loopMode || process.env.AUTOTUBE_RENDER_MODE === 'ffmpeg';
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

  return assignVideoSourceOffsets(clips);
}

function assetKey(asset) {
  return asset?.id || asset?.url || '';
}

/** Advance per-asset seek position so video B-roll does not replay t=0 every cut. */
function assignVideoSourceOffsets(clips) {
  const nextOffset = new Map();
  return clips.map((clip) => {
    const key = assetKey(clip.asset);
    const isVideo =
      clip.asset?.type === 'video' || /\.(mp4|webm|mov)/i.test(clip.asset?.url || '');
    if (!isVideo) {
      return { ...clip, sourceStartSec: 0 };
    }
    let offset = nextOffset.get(key) || 0;
    const maxSrc = Math.max(clip.asset?.duration || 0, 30);
    if (offset + clip.durationSec > maxSrc - 0.15) offset = 0;
    nextOffset.set(key, offset + clip.durationSec);
    return { ...clip, sourceStartSec: offset };
  });
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

async function resolveLocalAsset(asset, _segMedia, devServer, cacheDir) {
  let localSrc = await ensureLocalAsset(asset, devServer, cacheDir);
  if (localSrc) return { localSrc, asset };

  const thumb = asset.thumbnailUrl || (asset.type === 'image' ? null : null);
  if (thumb && thumb !== asset.url) {
    const thumbAsset = { ...asset, type: 'image', url: thumb, thumbnailUrl: thumb };
    localSrc = await ensureLocalAsset(thumbAsset, devServer, cacheDir);
    if (localSrc) return { localSrc, asset: thumbAsset };
  }
  return { localSrc: null, asset };
}

function encodeClip(localSrc, asset, durationSec, clipOut, { w, h, preset, draft, sourceStartSec = 0 }) {
  const isVideo = asset.type === 'video' || /\.(mp4|webm|mov)/i.test(asset.url || '');
  const hardCuts = hardCutsEnabled();
  let vf = `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`;
  if (hardCuts) {
    const fadeOut = Math.max(0.04, durationSec - 0.04);
    vf = `fade=t=in:st=0:d=0.04,fade=t=out:st=${fadeOut.toFixed(3)}:d=0.04,${vf}`;
  } else if (!isVideo && !draft) {
    const frames = Math.max(1, Math.round(durationSec * FPS));
    vf = `zoompan=z='min(zoom+0.001,1.15)':d=${frames}:s=${w}x${h}:fps=${FPS},${vf}`;
  }

  let seekSec = isVideo ? Math.max(0, sourceStartSec || 0) : 0;
  if (isVideo) {
    const probedDur = probeMediaDuration(localSrc);
    if (probedDur > 0 && seekSec + durationSec > probedDur - 0.1) seekSec = 0;
  }

  const args = isVideo
    ? [
        '-y', '-ss', String(seekSec), '-i', localSrc, '-t', String(durationSec),
        '-vf', vf, '-c:v', 'libx264', '-preset', preset, '-pix_fmt', 'yuv420p',
        '-r', String(FPS), '-an', clipOut,
      ]
    : [
        '-y', '-loop', '1', '-i', localSrc, '-t', String(durationSec),
        '-vf', vf, '-c:v', 'libx264', '-preset', preset, '-pix_fmt', 'yuv420p',
        '-r', String(FPS), '-an', clipOut,
      ];

  const r = spawnSync('ffmpeg', args, { encoding: 'utf8', timeout: 180_000 });
  return r.status === 0 && existsSync(clipOut);
}

const PLACEHOLDER_COLORS = ['0x1a1a2e', '0x16213e', '0x0f3460', '0x533483', '0xe94560', '0x2d4059', '0xea5455'];

function encodePlaceholderClip(clipOut, durationSec, clipIdx, { w, h, preset }) {
  const color = PLACEHOLDER_COLORS[clipIdx % PLACEHOLDER_COLORS.length];
  const r = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-f',
      'lavfi',
      '-i',
      `color=c=${color}:s=${w}x${h}:r=${FPS}:d=${durationSec}`,
      '-c:v',
      'libx264',
      '-preset',
      preset,
      '-pix_fmt',
      'yuv420p',
      '-an',
      clipOut,
    ],
    { encoding: 'utf8', timeout: 60_000 },
  );
  return r.status === 0 && existsSync(clipOut);
}

async function renderSegmentClips(segment, segMedia, project, outputPath, options) {
  const interval = assetCutIntervalSec(project) ?? options.cutIntervalSec ?? 1.25;
  const targetDuration = segment.duration || 20;
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
  let renderedDuration = 0;
  let clipIndex = 0;
  const videoOffsets = new Map();
  const videoDurations = new Map();

  function resolveVideoSeek(asset, localSrc, durationSec, hintOffset = 0) {
    const isVideo = asset.type === 'video' || /\.(mp4|webm|mov)/i.test(asset.url || '');
    if (!isVideo) return 0;
    if (!videoDurations.has(localSrc)) {
      videoDurations.set(localSrc, probeMediaDuration(localSrc) || Math.max(asset.duration || 0, 30));
    }
    const total = videoDurations.get(localSrc);
    const key = assetKey(asset);
    let offset = videoOffsets.get(key) ?? hintOffset;
    if (offset + durationSec > total - 0.1) offset = 0;
    videoOffsets.set(key, offset + durationSec);
    return offset;
  }

  async function pushClip(asset, durationSec, label, hintOffset = 0) {
    const clipOut = join(tmpDir, `clip-${String(clipIndex).padStart(3, '0')}.mp4`);
    clipIndex += 1;
    const { localSrc, asset: resolvedAsset } = await resolveLocalAsset(asset, segMedia, devServer, cacheDir);
    let ok = false;
    if (!localSrc) {
      console.log(`  [ffmpeg] ${label}: placeholder — asset fetch failed`);
      ok = encodePlaceholderClip(clipOut, durationSec, clipIndex, { w, h, preset });
    } else {
      const sourceStartSec = resolveVideoSeek(resolvedAsset, localSrc, durationSec, hintOffset);
      ok = encodeClip(localSrc, resolvedAsset, durationSec, clipOut, { w, h, preset, draft, sourceStartSec });
      if (!ok) {
        console.log(`  [ffmpeg] ${label}: encode failed — using placeholder`);
        ok = encodePlaceholderClip(clipOut, durationSec, clipIndex, { w, h, preset });
      }
    }
    if (!ok) {
      return false;
    }
    clipPaths.push(clipOut);
    renderedDuration += durationSec;
    return true;
  }

  for (let i = 0; i < schedule.length; i++) {
    const { asset, durationSec, sourceStartSec } = schedule[i];
    await pushClip(asset, durationSec, `clip ${i + 1}/${schedule.length}`, sourceStartSec || 0);
  }

  let fillerRound = 0;
  while (renderedDuration < targetDuration - 0.05 && segMedia.length && fillerRound < segMedia.length * 4) {
    const asset = segMedia[fillerRound % segMedia.length];
    const needSec = Math.min(interval, targetDuration - renderedDuration);
    if (needSec <= 0.05) break;
    const added = await pushClip(asset, needSec, `filler ${fillerRound + 1} (+${needSec.toFixed(2)}s)`);
    fillerRound += 1;
    if (!added && fillerRound >= segMedia.length * 2) break;
  }

  if (renderedDuration < targetDuration - 0.5) {
    console.log(`  [ffmpeg] segment short: ${renderedDuration.toFixed(1)}s / ${targetDuration.toFixed(1)}s target`);
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
      '-c',
      'copy',
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
      '-c',
      'copy',
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

  if (existsSync(outputPath) && (process.env.AUTOTUBE_LOOP_MODE === '1' || process.env.AUTOTUBE_YOUTUBE_MODE === '1')) {
    const normalizedOut = join(workDir, 'mux-loudnorm.mp4');
    const ln = spawnSync(
      'ffmpeg',
      [
        '-y', '-i', outputPath,
        '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11',
        '-c:v', 'copy', '-c:a', 'aac', '-b:a', '320k',
        normalizedOut,
      ],
      { encoding: 'utf8', timeout: 300_000 },
    );
    if (ln.status === 0 && existsSync(normalizedOut)) {
      spawnSync('ffmpeg', ['-y', '-i', normalizedOut, '-c', 'copy', outputPath], { encoding: 'utf8' });
      console.log('  [ffmpeg] applied -14 LUFS loudnorm on final mux');
    } else {
      console.log('  [ffmpeg] loudnorm skipped — using muxed audio as-is');
    }
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
    hardCuts: hardCutsEnabled(),
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
