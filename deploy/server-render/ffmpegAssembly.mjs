/**
 * FFmpeg-based B-roll assembly — real video cuts instead of canvas Ken Burns stills.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync, statSync } from 'node:fs';
import { join, dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assetCutIntervalSec } from './youtubeProfile.mjs';
import { muxVideoWithAudio } from './audio.mjs';
import { orderAssetsVideoFirst, effectiveCutInterval, HOOK_ZONE_SEC, HOOK_MAX_HOLD_SEC } from '../../scripts/lib/build-edit-timeline.mjs';
import { computeTimelineDiversityMetrics } from '../../scripts/lib/assembly-system.mjs';

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

/** Extend video by cloning the last frame so narration is not truncated. */
function padVideoToDuration(inputPath, outputPath, targetSec) {
  const loopMode = process.env.AUTOTUBE_LOOP_MODE === '1' || process.env.AUTOTUBE_LOOP_MODE === 'true';
  if (loopMode) {
    return padVideoSegmentedTail(inputPath, outputPath, targetSec);
  }
  return padVideoSingleTpad(inputPath, outputPath, targetSec);
}

/** Loop mode: append 1–1.25s tail chunks (hard cuts) instead of one long freeze frame. */
function padVideoSegmentedTail(inputPath, outputPath, targetSec, holdSec = 1.15) {
  const current = probeMediaDuration(inputPath);
  const padSec = targetSec - current;
  if (padSec <= 0.05) {
    const copy = spawnSync('ffmpeg', ['-y', '-i', inputPath, '-c', 'copy', outputPath], { encoding: 'utf8' });
    return copy.status === 0 && existsSync(outputPath);
  }

  const workDir = dirname(outputPath);
  const tailChunks = [];
  let remaining = padSec;
  let idx = 0;
  const preset = 'ultrafast';
  const offsets = [0.08, 0.25, 0.5, 0.9, 1.4, 2.0];

  while (remaining > 0.05) {
    const chunkDur = Math.min(holdSec, remaining);
    const chunkOut = join(workDir, `tail-seg-${idx}.mp4`);
    const seekBack = offsets[idx % offsets.length];
    const r = spawnSync(
      'ffmpeg',
      [
        '-y', '-sseof', `-${seekBack.toFixed(2)}`, '-i', inputPath,
        '-vf', `tpad=stop_mode=clone:stop_duration=${Math.max(0, chunkDur - 0.04).toFixed(3)}`,
        '-t', chunkDur.toFixed(3),
        '-c:v', 'libx264', '-preset', preset, '-pix_fmt', 'yuv420p',
        '-an', chunkOut,
      ],
      { encoding: 'utf8', timeout: 120_000 },
    );
    if (r.status !== 0 || !existsSync(chunkOut) || statSync(chunkOut).size < 10_000) {
      try { unlinkSync(chunkOut); } catch { /* ignore */ }
      break;
    }
    tailChunks.push(chunkOut);
    remaining -= chunkDur;
    idx += 1;
    if (idx > 40) break;
  }

  if (!tailChunks.length) {
    return padVideoSingleTpad(inputPath, outputPath, targetSec);
  }

  const listFile = join(workDir, 'tail-pad-concat.txt');
  writeFileSync(
    listFile,
    [inputPath, ...tailChunks].map((p) => `file '${resolve(p)}'`).join('\n'),
  );
  const concat = spawnSync(
    'ffmpeg',
    ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', '-an', outputPath],
    { encoding: 'utf8', timeout: 300_000 },
  );
  if (concat.status !== 0 || !existsSync(outputPath)) {
    return padVideoSingleTpad(inputPath, outputPath, targetSec);
  }
  const dur = probeMediaDuration(outputPath);
  return dur >= targetSec - 0.35;
}

function padVideoSingleTpad(inputPath, outputPath, targetSec) {
  const current = probeMediaDuration(inputPath);
  const padSec = targetSec - current;
  if (padSec <= 0.05) {
    const copy = spawnSync('ffmpeg', ['-y', '-i', inputPath, '-c', 'copy', outputPath], { encoding: 'utf8' });
    return copy.status === 0 && existsSync(outputPath);
  }

  const loopMode = process.env.AUTOTUBE_LOOP_MODE === '1' || process.env.AUTOTUBE_LOOP_MODE === 'true';
  const timeoutMs = loopMode ? 600_000 : 300_000;
  const presets = loopMode ? ['ultrafast', 'veryfast', ffmpegPreset()] : [ffmpegPreset(), 'ultrafast'];
  const vfChains = [
    `tpad=stop_mode=clone:stop_duration=${padSec.toFixed(3)}`,
    `scale=1280:-2,tpad=stop_mode=clone:stop_duration=${padSec.toFixed(3)}`,
  ];

  for (const vf of vfChains) {
    for (const preset of [...new Set(presets)]) {
      const r = spawnSync(
        'ffmpeg',
        [
          '-y', '-i', inputPath,
          '-vf', vf,
          '-c:v', 'libx264', '-preset', preset, '-pix_fmt', 'yuv420p',
          '-an', outputPath,
        ],
        { encoding: 'utf8', timeout: timeoutMs },
      );
      if (r.status !== 0 || !existsSync(outputPath)) continue;
      const size = statSync(outputPath).size;
      const dur = probeMediaDuration(outputPath);
      if (size >= 50_000 && dur >= current + padSec * 0.5) return true;
      try {
        unlinkSync(outputPath);
      } catch {
        /* ignore */
      }
    }
  }
  return false;
}

/** Fill duration gap by cycling through already-rendered tail clips (real cuts, not one freeze). */
function extendVideoWithRenderedClips(inputPath, outputPath, targetSec, tailClipPaths, holdSec = 1.15) {
  const current = probeMediaDuration(inputPath);
  let gap = targetSec - current;
  if (gap <= 0.05 || !tailClipPaths?.length) return false;

  const workDir = dirname(outputPath);
  const extras = [];
  let idx = 0;
  while (gap > 0.05 && idx < 48) {
    const src = tailClipPaths[idx % tailClipPaths.length];
    if (!existsSync(src)) {
      idx += 1;
      continue;
    }
    const dur = Math.min(holdSec, gap);
    const out = join(workDir, `gap-fill-${idx}.mp4`);
    const r = spawnSync(
      'ffmpeg',
      [
        '-y', '-i', src,
        '-t', dur.toFixed(3),
        '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
        '-an', out,
      ],
      { encoding: 'utf8', timeout: 90_000 },
    );
    if (r.status === 0 && existsSync(out) && statSync(out).size > 8000) {
      extras.push(out);
      gap -= dur;
    }
    idx += 1;
  }
  if (!extras.length) return false;

  const listFile = join(workDir, 'gap-fill-concat.txt');
  writeFileSync(
    listFile,
    [inputPath, ...extras].map((p) => `file '${resolve(p)}'`).join('\n'),
  );
  const concat = spawnSync(
    'ffmpeg',
    ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', '-an', outputPath],
    { encoding: 'utf8', timeout: 300_000 },
  );
  if (concat.status !== 0 || !existsSync(outputPath)) return false;
  return probeMediaDuration(outputPath) >= targetSec - 0.35;
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

function patternInterruptsEnabled() {
  return process.env.AUTOTUBE_PATTERN_INTERRUPTS === '1';
}

function harvestVideoFirstEnabled() {
  if (process.env.AUTOTUBE_LOOP_IMAGE_FIRST === '1') return false;
  return process.env.AUTOTUBE_HARVEST_VIDEO_FIRST === '1'
    || process.env.AUTOTUBE_HARVEST_VIDEO_FIRST === 'true';
}

function imageFirstEnabled() {
  return process.env.AUTOTUBE_LOOP_IMAGE_FIRST === '1'
    || process.env.AUTOTUBE_HARVEST_VIDEO_FIRST === '0'
    || process.env.AUTOTUBE_HARVEST_VIDEO_FIRST === 'false';
}

function isVideoAsset(asset) {
  return asset?.type === 'video'
    || /\.(mp4|webm|mov)(?:[?#]|$)/i.test(asset?.url || '')
    || /\/api\/download-clip/i.test(asset?.url || '');
}

function prepareSegmentMedia(segMedia) {
  if (!segMedia?.length) return segMedia;
  if (imageFirstEnabled()) {
    return [...segMedia].sort((a, b) => {
      const av = isVideoAsset(a) ? 1 : 0;
      const bv = isVideoAsset(b) ? 1 : 0;
      if (av !== bv) return av - bv;
      const ac = (a.source || '').includes('curated') ? 0 : 1;
      const bc = (b.source || '').includes('curated') ? 0 : 1;
      return ac - bc;
    });
  }
  if (!harvestVideoFirstEnabled()) return segMedia;
  return orderAssetsVideoFirst(segMedia, 2);
}

function assetKey(asset) {
  return asset?.id || asset?.url || '';
}

/** Stable URL key for manifest exclusion (prefer embedded source page over proxy path). */
function assetManifestKey(asset) {
  const src = (asset?.sourceUrl || '').trim();
  if (src && /^https?:\/\//i.test(src)) return src.split('?')[0].toLowerCase();
  const url = asset?.url || '';
  const match = url.match(/[?&]url=([^&]+)/i);
  if (match) {
    try {
      return decodeURIComponent(match[1]).split('?')[0].toLowerCase();
    } catch {
      return match[1].split('?')[0].toLowerCase();
    }
  }
  return url.split('?')[0].toLowerCase();
}

function pickAssetAvoidingRepeat(candidates, slot, lastManifestKey) {
  if (!candidates.length) return null;
  if (lastManifestKey && candidates.length > 1) {
    const rotated = [...candidates.slice(slot % candidates.length), ...candidates.slice(0, slot % candidates.length)];
    const alt = rotated.find((a) => assetManifestKey(a) !== lastManifestKey);
    if (alt) return alt;
  }
  return candidates[slot % candidates.length];
}

function pickAssetAtTime(t, segMedia, intervalSec, lastManifestKey = null) {
  const pool = prepareSegmentMedia(segMedia);
  if (pool.length <= 1) return pool[0];
  if (intervalSec <= 0) return pool[0];

  if (harvestVideoFirstEnabled()) {
    const videos = pool.filter(isVideoAsset);
    const images = pool.filter((a) => !isVideoAsset(a));
    const slot = Math.floor(t / intervalSec);
    if (videos.length && slot < 2) {
      return pickAssetAvoidingRepeat(videos, slot, lastManifestKey) || videos[slot % videos.length];
    }
    const stillPool = videos.length > 2 ? [...videos.slice(2), ...images] : images.length ? images : pool;
    const stillSlot = Math.max(0, slot - Math.min(2, videos.length));
    return pickAssetAvoidingRepeat(stillPool, stillSlot, lastManifestKey) || stillPool[stillSlot % stillPool.length];
  }

  const idx = Math.floor(t / intervalSec);
  return pickAssetAvoidingRepeat(pool, idx, lastManifestKey) || pool[idx % pool.length];
}

function computeActiveAssetIndex(timeInSegment, assetCount, intervalSec) {
  if (assetCount <= 1) return 0;
  if (intervalSec <= 0) return 0;
  return Math.floor(timeInSegment / intervalSec) % assetCount;
}

function resolveTimelineAsset(entry, segMedia, mediaPool = []) {
  const byId =
    segMedia.find((m) => m.id === entry.assetId)
    || mediaPool.find((m) => m.id === entry.assetId);
  const base = byId || (() => {
    const idx = Math.floor((entry.startSec || 0) / Math.max(entry.endSec - entry.startSec, 0.5)) % segMedia.length;
    return segMedia[idx] || segMedia[0];
  })();
  return coerceImageFirstAsset(base, segMedia);
}

/** When image-first is on, never encode video clips — use still URL or next distinct image. */
function coerceImageFirstAsset(asset, segMedia) {
  if (!asset || !imageFirstEnabled() || !isVideoAsset(asset)) return asset;
  const thumb = asset.thumbnailUrl || (isImageLikeUrl(asset.url) ? asset.url : '');
  if (thumb && !isVideoAsset({ url: thumb })) {
    return { ...asset, type: 'image', url: thumb, source: `${asset.source || 'Video'} still` };
  }
  const pool = prepareSegmentMedia(segMedia).filter((a) => !isVideoAsset(a));
  return pool.find((a) => assetManifestKey(a) !== assetManifestKey(asset)) || pool[0] || asset;
}

function isImageLikeUrl(url) {
  return /\.(jpe?g|png|webp|gif)(?:[?#]|$)/i.test(url || '');
}

function buildClipSchedule(segment, segMedia, intervalSec, project, segmentStartSec = 0) {
  const targetDuration = segment.duration || 20;
  const orderedMedia = prepareSegmentMedia(segMedia);
  const timeline = (project?.editTimeline || []).filter((e) => e.segmentId === segment.id);
  const clips = [];

  if (timeline.length) {
    for (const entry of timeline) {
      const asset = resolveTimelineAsset(entry, orderedMedia, project?.media || []);
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
  let lastManifestKey = clips.length ? assetManifestKey(clips[clips.length - 1].asset) : null;
  while (t < targetDuration - 0.05) {
    const asset = pickAssetAtTime(t, orderedMedia, intervalSec, lastManifestKey);
    // Cap clips in the hook zone to HOOK_MAX_HOLD_SEC regardless of the pool-widened interval.
    const absT = segmentStartSec + t;
    const effectiveInterval = absT < HOOK_ZONE_SEC ? Math.min(intervalSec, HOOK_MAX_HOLD_SEC) : intervalSec;
    const clipEnd = Math.min(targetDuration, t + effectiveInterval);
    clips.push({
      asset,
      startSec: t,
      endSec: clipEnd,
      durationSec: clipEnd - t,
    });
    lastManifestKey = assetManifestKey(asset);
    t = clipEnd;
  }

  return assignVideoSourceOffsets(clips);
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

async function fetchToCache(fetchUrl, cached, { expectVideo = false } = {}) {
  const timeoutMs = expectVideo || fetchUrl.includes('/api/download-clip') ? 120_000 : 45_000;
  const res = await fetch(fetchUrl, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'user-agent': 'Mozilla/5.0 AutoTube/1.0' },
  });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 500) return null;
  const contentType = res.headers.get('content-type') || '';
  if (expectVideo && !/video|octet-stream/i.test(contentType) && buf.length > 12) {
    const sig = buf.slice(4, 8).toString('ascii');
    if (sig !== 'ftyp' && !buf.slice(0, 4).toString('hex').includes('1a45')) return null;
  }
  if (!expectVideo && /text\/html/i.test(contentType)) return null;
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
      candidates.push(rawUrl);
    }
    candidates.push(`${devServer}/api/proxy-image?url=${encodeURIComponent(rawUrl)}`);
    if (!isVideo) {
      candidates.push(`https://images.weserv.nl/?url=${encodeURIComponent(rawUrl)}&w=1280&h=720&fit=cover&output=jpg`);
    }
    candidates.push(rawUrl);
  }

  for (const fetchUrl of candidates) {
    if (!fetchUrl.startsWith('http')) continue;
    const cached = cachePathForUrl(fetchUrl, cacheDir, isVideo);
    if (existsSync(cached) && readFileSync(cached).length > 500) {
      return cached;
    }
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const path = await fetchToCache(fetchUrl, cached, { expectVideo: isVideo });
        if (path) return path;
      } catch {
        /* try next candidate */
      }
    }
  }
  return null;
}

async function resolveLocalAsset(asset, _segMedia, devServer, cacheDir) {
  let localSrc = await ensureLocalAsset(asset, devServer, cacheDir);
  if (localSrc) return { localSrc, asset };

  const sourcePage = asset.sourceUrl;
  if (sourcePage && sourcePage !== asset.url && /^https?:\/\//i.test(sourcePage)) {
    const sourceAsset = { ...asset, url: sourcePage };
    localSrc = await ensureLocalAsset(sourceAsset, devServer, cacheDir);
    if (localSrc) return { localSrc, asset: sourceAsset };
  }

  const thumbCandidates = [
    asset.thumbnailUrl,
    asset.resolvedUrl,
    asset.type === 'image' ? asset.url : null,
  ].filter((t, i, arr) => t && t !== asset.url && arr.indexOf(t) === i);

  for (const thumb of thumbCandidates) {
    const thumbAsset = { ...asset, type: 'image', url: thumb, thumbnailUrl: thumb };
    localSrc = await ensureLocalAsset(thumbAsset, devServer, cacheDir);
    if (localSrc) return { localSrc, asset: thumbAsset };
  }
  return { localSrc: null, asset };
}

function encodeClip(localSrc, asset, durationSec, clipOut, { w, h, preset, draft, sourceStartSec = 0, clipIndex = 0, isInterruptClip = false, isHookClip = false }) {
  const isVideo = asset.type === 'video' || /\.(mp4|webm|mov)/i.test(asset.url || '');
  const hardCuts = hardCutsEnabled();
  const interrupts = patternInterruptsEnabled();
  const frames = Math.max(1, Math.round(durationSec * FPS));
  let vf = `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`;
  if (isVideo && hardCuts && (isHookClip || clipIndex === 0)) {
    const strong = interruptStrong();
    const punch = interrupts && (isInterruptClip || strong || isHookClip);
    const drift = punch ? (strong ? 0.18 : 0.12) : 0.06;
    const maxZoom = punch ? (strong ? 1.32 : 1.22) : 1.12;
    vf = `zoompan=z='min(zoom+${drift.toFixed(3)},${maxZoom})':d=${frames}:s=${w}x${h}:fps=${FPS},${vf}`;
    if (interrupts && punch) {
      vf = `eq=saturation=${strong ? 1.55 : 1.35}:brightness=${strong ? 0.08 : 0.05},${vf}`;
    }
  } else if (!isVideo && hardCuts) {
    // Strong mode: punch-zoom every still so brutal vision sees pattern motion, not static holds.
    const strong = interruptStrong();
    const punch = interrupts && (isInterruptClip || strong || clipIndex % 2 === 0);
    const drift = punch ? (strong ? 0.26 : 0.18) : (0.08 + (clipIndex % 5) * 0.02);
    const maxZoom = punch ? (strong ? 1.36 : 1.24) : 1.12;
    vf = `zoompan=z='min(zoom+${drift.toFixed(3)},${maxZoom})':d=${frames}:s=${w}x${h}:fps=${FPS},${vf}`;
    if (interrupts && punch) {
      const sat = strong ? 1.45 : 1.25;
      vf = `eq=saturation=${sat}:brightness=${strong ? 0.06 : 0.03},${vf}`;
    }
  } else if (hardCuts) {
    // Video hard-cuts: eq punch on interrupt clips (including hook at clipIndex 0).
    if (interrupts && (isInterruptClip || interruptStrong())) {
      const strong = interruptStrong();
      const sat = strong ? 1.65 : 1.4;
      const bright = strong ? 0.1 : 0.06;
      vf = `eq=saturation=${sat}:brightness=${bright},${vf}`;
    }
    if (clipIndex > 0) {
      const fadeOut = Math.max(0.04, durationSec - 0.04);
      vf = `fade=t=in:st=0:d=0.04,fade=t=out:st=${fadeOut.toFixed(3)}:d=0.04,${vf}`;
    }
  } else if (!isVideo && !draft) {
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

  let r = spawnSync('ffmpeg', args, { encoding: 'utf8', timeout: 180_000 });
  if (r.status === 0 && existsSync(clipOut)) return true;

  if (!isVideo && hardCuts) {
    let simpleVf = `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`;
    if (clipIndex > 0) {
      const fadeOut = Math.max(0.04, durationSec - 0.04);
      simpleVf = `fade=t=in:st=0:d=0.04,fade=t=out:st=${fadeOut.toFixed(3)}:d=0.04,${simpleVf}`;
    }
    r = spawnSync(
      'ffmpeg',
      [
        '-y', '-loop', '1', '-i', localSrc, '-t', String(durationSec),
        '-vf', simpleVf, '-c:v', 'libx264', '-preset', preset, '-pix_fmt', 'yuv420p',
        '-r', String(FPS), '-an', clipOut,
      ],
      { encoding: 'utf8', timeout: 180_000 },
    );
  }
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

// Pattern interrupt fires every N seconds within the first INTERRUPT_FIRST_SEC
const INTERRUPT_FIRST_SEC = 60;

function interruptIntervalSec() {
  const raw = parseFloat(process.env.AUTOTUBE_INTERRUPT_INTERVAL_SEC || '8');
  return Number.isFinite(raw) && raw > 0 ? raw : 8;
}

function interruptStrong() {
  return process.env.AUTOTUBE_INTERRUPT_STRONG === '1';
}

async function renderSegmentClips(segment, segMedia, project, outputPath, options) {
  const rawInterval = assetCutIntervalSec(project) ?? options.cutIntervalSec ?? 1.25;
  // Apply pool-aware widening so thin pools don't exhaust max-uses in the first segment,
  // leaving later segments with nothing but fallback cycling.
  const interval = effectiveCutInterval(project, rawInterval);
  const targetDuration = segment.duration || 20;
  const segmentStartSec = options.segmentStartSec ?? 0;
  const schedule = buildClipSchedule(segment, segMedia, interval, project, segmentStartSec);
  const { w, h } = outputDimensions();
  const preset = ffmpegPreset();
  const draft = process.env.AUTOTUBE_RENDER_QUALITY === 'draft';
  const interruptsOn = patternInterruptsEnabled();
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
  const renderedTimeline = [];
  const devServer = options.devServer || 'http://localhost:5173';
  let renderedDuration = 0;
  let clipIndex = 0;
  let placeholderClipCount = 0;
  const placeholderUrls = [];
  let lastRenderedManifestKey = null;
  const renderedManifestKeys = [];
  const videoOffsets = new Map();
  const videoDurations = new Map();

  function isInterruptClip(durationSec) {
    if (!interruptsOn) return false;
    const absTime = segmentStartSec + renderedDuration;
    if (absTime >= INTERRUPT_FIRST_SEC) return false;
    // Strong mode: first clip in segment (hook) always gets interrupt punch.
    if (absTime < 0.01 && interruptStrong()) return true;
    const prev = absTime;
    const next = absTime + durationSec;
    const step = interruptIntervalSec();
    return Math.floor(next / step) > Math.floor(prev / step);
  }

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

  async function tryEncodeAsset(candidate, durationSec, label, hintOffset, interrupt, clipOut) {
    let workAsset = candidate;
    if (imageFirstEnabled() && isVideoAsset(candidate)) {
      workAsset = coerceImageFirstAsset(candidate, segMedia);
      if (isVideoAsset(workAsset)) return { ok: false, resolvedAsset: workAsset, usedPlaceholder: false };
    }

    const { localSrc, asset: resolvedAsset } = await resolveLocalAsset(workAsset, segMedia, devServer, cacheDir);
    if (!localSrc) return { ok: false, resolvedAsset, usedPlaceholder: false };

    const sourceStartSec = resolveVideoSeek(resolvedAsset, localSrc, durationSec, hintOffset);
    const absTime = segmentStartSec + renderedDuration;
    let ok = encodeClip(localSrc, resolvedAsset, durationSec, clipOut, {
      w, h, preset, draft, sourceStartSec, clipIndex: clipIndex - 1, isInterruptClip: interrupt,
      isHookClip: absTime < 4,
    });
    if (!ok && !imageFirstEnabled()) {
      const thumb = resolvedAsset.thumbnailUrl;
      if (thumb) {
        const thumbAsset = { ...resolvedAsset, type: 'image', url: thumb };
        const thumbLocal = await ensureLocalAsset(thumbAsset, devServer, cacheDir);
        if (thumbLocal) {
          ok = encodeClip(thumbLocal, thumbAsset, durationSec, clipOut, {
            w, h, preset, draft, sourceStartSec: 0, clipIndex: clipIndex - 1, isInterruptClip: interrupt,
            isHookClip: absTime < 4,
          });
          if (ok) console.log(`  [ffmpeg] ${label}: video → thumbnail still`);
        }
      }
    }
    return { ok, resolvedAsset, usedPlaceholder: false };
  }

  async function pushClip(asset, durationSec, label, hintOffset = 0) {
    const interrupt = isInterruptClip(durationSec);
    const clipOut = join(tmpDir, `clip-${String(clipIndex).padStart(3, '0')}.mp4`);
    clipIndex += 1;

    const tried = new Set();
    const baseKey = assetManifestKey(asset);
    const imagePool = imageFirstEnabled()
      ? prepareSegmentMedia(segMedia).filter((a) => !isVideoAsset(a))
      : null;
    const alternates = [
      coerceImageFirstAsset(asset, segMedia),
      ...(imagePool?.length ? imagePool : segMedia).filter((a) => assetKey(a) !== assetKey(asset)),
    ].sort((a, b) => {
      if (imageFirstEnabled()) {
        const av = isVideoAsset(a) ? 1 : 0;
        const bv = isVideoAsset(b) ? 1 : 0;
        if (av !== bv) return av - bv;
      }
      const ka = assetManifestKey(a);
      const kb = assetManifestKey(b);
      const aRepeat = (ka && (ka === lastRenderedManifestKey || ka === baseKey)) ? 1 : 0;
      const bRepeat = (kb && (kb === lastRenderedManifestKey || kb === baseKey)) ? 1 : 0;
      return aRepeat - bRepeat;
    });
    let ok = false;
    let usedPlaceholder = false;
    let lastResolved = asset;

    for (const candidate of alternates) {
      const key = assetKey(candidate);
      if (key && tried.has(key)) continue;
      const manifestK = assetManifestKey(candidate);
      const hasUntried = alternates.some(
        (a) => !tried.has(assetKey(a)) && assetManifestKey(a) !== lastRenderedManifestKey,
      );
      if (manifestK && manifestK === lastRenderedManifestKey && hasUntried) continue;
      if (key) tried.add(key);

      const result = await tryEncodeAsset(candidate, durationSec, label, hintOffset, interrupt, clipOut);
      lastResolved = result.resolvedAsset || candidate;
      if (result.ok) {
        const resolvedKey = assetManifestKey(lastResolved);
        if (resolvedKey && resolvedKey === lastRenderedManifestKey && hasUntried) {
          ok = false;
          continue;
        }
        ok = true;
        if (candidate !== asset) {
          console.log(`  [ffmpeg] ${label}: alternate asset succeeded (${(candidate.sourceUrl || candidate.url || '').slice(0, 72)})`);
        }
        break;
      }
    }

    if (!ok) {
      const loopMode = process.env.AUTOTUBE_LOOP_MODE === '1' || process.env.AUTOTUBE_LOOP_MODE === 'true';
      if (loopMode && clipPaths.length > 0) {
        let cloneSrc = clipPaths[clipPaths.length - 1];
        for (let ci = clipPaths.length - 1; ci >= 0; ci--) {
          const mk = renderedManifestKeys[ci];
          if (mk && mk !== lastRenderedManifestKey) {
            cloneSrc = clipPaths[ci];
            break;
          }
        }
        const clone = spawnSync(
          'ffmpeg',
          [
            '-y', '-i', cloneSrc,
            '-t', String(durationSec),
            '-c:v', 'libx264', '-preset', preset, '-pix_fmt', 'yuv420p',
            '-an', clipOut,
          ],
          { encoding: 'utf8', timeout: 120_000 },
        );
        if (clone.status === 0 && existsSync(clipOut)) {
          ok = true;
          console.log(`  [ffmpeg] ${label}: cloned last good clip (loop mode, no placeholder)`);
        }
      }
    }

    if (!ok) {
      const reason = `fetch/encode failed url=${(asset.url || '').slice(0, 80)} tried=${tried.size} alts`;
      console.log(`  [ffmpeg] ${label}: placeholder — ${reason}`);
      ok = encodePlaceholderClip(clipOut, durationSec, clipIndex, { w, h, preset });
      if (ok) {
        placeholderClipCount += 1;
        usedPlaceholder = true;
      }
    }

    if (usedPlaceholder) {
      const manifestKey = assetManifestKey(lastResolved || asset);
      if (manifestKey) placeholderUrls.push(manifestKey);
    }
    if (!ok) {
      return false;
    }
    const timelineAssetId = usedPlaceholder
      ? `placeholder-clip-${clipIndex}`
      : (lastResolved || asset).id;
    renderedTimeline.push({
      segmentId: segment.id,
      assetId: timelineAssetId,
      startSec: renderedDuration,
      endSec: renderedDuration + durationSec,
    });
    clipPaths.push(clipOut);
    renderedDuration += durationSec;
    lastRenderedManifestKey = usedPlaceholder
      ? `placeholder:${timelineAssetId}`
      : assetManifestKey(lastResolved || asset);
    renderedManifestKeys.push(lastRenderedManifestKey);
    return true;
  }

  for (let i = 0; i < schedule.length; i++) {
    const { asset, durationSec, sourceStartSec } = schedule[i];
    await pushClip(asset, durationSec, `clip ${i + 1}/${schedule.length}`, sourceStartSec || 0);
  }

  let fillerRound = 0;
  while (renderedDuration < targetDuration - 0.05 && segMedia.length && fillerRound < segMedia.length * 4) {
    const asset = pickAssetAtTime(renderedDuration, segMedia, interval, lastRenderedManifestKey);
    const absFillerStart = segmentStartSec + renderedDuration;
    const fillerInterval = absFillerStart < HOOK_ZONE_SEC ? Math.min(interval, HOOK_MAX_HOLD_SEC) : interval;
    const needSec = Math.min(fillerInterval, targetDuration - renderedDuration);
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
    placeholderClipCount,
    placeholderUrls,
    scheduleCount: schedule.length,
    intervalSec: interval,
    targetSec: segment.duration || 20,
    videoSec,
    renderedTimeline,
    tailClipPaths: clipPaths.slice(-8),
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
  let totalPlaceholderClips = 0;
  const allPlaceholderUrls = [];
  const allRenderedTimeline = [];
  const preset = ffmpegPreset();
  let lastTailClipPaths = [];

  const mediaPool = project.media || [];
  let cumulativeSegStartSec = 0;

  for (let si = 0; si < (project.script || []).length; si++) {
    const seg = project.script[si];
    let segMedia = mediaPool.filter((a) => a.segmentId === seg.id);
    if (!segMedia.length && mediaPool.length) {
      segMedia = mediaPool.map((a) => ({ ...a, segmentId: seg.id }));
    }
    if (!segMedia.length) continue;

    console.log(`  [ffmpeg] segment ${si + 1}/${project.script.length}: ${seg.title} (${(seg.duration || 0).toFixed(1)}s)`);
    const segOut = join(workDir, `segment-${si}.mp4`);
    const result = await renderSegmentClips(seg, segMedia, project, segOut, {
      ...options,
      segmentStartSec: cumulativeSegStartSec,
    });
    if (!result.ok) {
      return { ok: false, error: result.error, segment: seg.title };
    }
    cumulativeSegStartSec += seg.duration || 0;
    segmentOutputs.push(segOut);
    totalClipCount += result.clipCount;
    totalPlaceholderClips += result.placeholderClipCount || 0;
    for (const u of result.placeholderUrls || []) {
      if (u) allPlaceholderUrls.push(u);
    }
    if (result.renderedTimeline?.length) {
      allRenderedTimeline.push(...result.renderedTimeline);
    }
    if (result.tailClipPaths?.length) {
      lastTailClipPaths = result.tailClipPaths;
    }
    perSegment.push({
      segmentId: seg.id,
      title: seg.title,
      clipCount: result.clipCount,
      placeholderClipCount: result.placeholderClipCount || 0,
      placeholderUrls: result.placeholderUrls || [],
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

  let videoDurationSec = probeMediaDuration(mergedVideo) || 60;
  const rawVideoSec = videoDurationSec;
  const audioFile = options.mixedAudioPath;
  const audioDurationSec = audioFile && existsSync(audioFile) ? probeMediaDuration(audioFile) : 0;
  const scriptTargetSec = (project.script || []).reduce((sum, s) => sum + (s.duration || 0), 0);
  const padTargetSec = Math.max(scriptTargetSec, audioDurationSec || 0);

  let audioForMux = audioFile;
  let audioTrimmedSec = 0;
  let tpadSec = 0;
  let videoForMux = mergedVideo;
  let muxDurationSec = videoDurationSec;

  if (videoDurationSec < padTargetSec - 0.15) {
    const gap = padTargetSec - videoDurationSec;
    const paddedVideo = join(workDir, 'merged-video-padded.mp4');
    const loopMode = process.env.AUTOTUBE_LOOP_MODE === '1' || process.env.AUTOTUBE_LOOP_MODE === 'true';
    const maxPadSec = loopMode ? 45 : 12;
    const holdSec = parseFloat(process.env.AUTOTUBE_CUT_INTERVAL_SEC || '1.15') || 1.15;
    let padded = false;
    if (gap <= maxPadSec) {
      if (lastTailClipPaths.length) {
        padded = extendVideoWithRenderedClips(mergedVideo, paddedVideo, padTargetSec, lastTailClipPaths, holdSec);
        if (padded) {
          console.log(`  [ffmpeg] gap-filled with tail B-roll clips (${gap.toFixed(1)}s, ${holdSec}s cuts)`);
        }
      }
      if (!padded && padVideoToDuration(mergedVideo, paddedVideo, padTargetSec)) {
        padded = true;
      }
    }
    if (padded) {
      videoForMux = paddedVideo;
      tpadSec = gap;
      videoDurationSec = probeMediaDuration(paddedVideo) || padTargetSec;
      muxDurationSec = Math.max(padTargetSec, audioDurationSec || padTargetSec);
      console.log(`  [ffmpeg] padded video ${rawVideoSec.toFixed(1)}s → ${videoDurationSec.toFixed(1)}s (tpad ${gap.toFixed(1)}s, target ${padTargetSec.toFixed(1)}s)`);
    } else if (audioFile && existsSync(audioFile) && audioDurationSec > videoDurationSec + 0.15) {
      if (loopMode) {
        console.log(`  [ffmpeg] WARN loop mode: video pad failed (gap ${gap.toFixed(1)}s) — keeping full narration (${audioDurationSec.toFixed(1)}s)`);
        muxDurationSec = audioDurationSec;
      } else {
        console.log(`  [ffmpeg] video pad unavailable (gap ${gap.toFixed(1)}s) — trimming narration to ${videoDurationSec.toFixed(1)}s`);
        const trimmedAudio = join(workDir, 'narration-trimmed.wav');
        if (trimAudioToDuration(audioFile, trimmedAudio, videoDurationSec)) {
          audioForMux = trimmedAudio;
          audioTrimmedSec = audioDurationSec - videoDurationSec;
          muxDurationSec = videoDurationSec;
          console.log(`  [ffmpeg] trimmed audio ${audioDurationSec.toFixed(1)}s → ${videoDurationSec.toFixed(1)}s (video pad failed, gap ${gap.toFixed(1)}s)`);
        }
      }
    }
  } else if (audioFile && existsSync(audioFile) && audioDurationSec > videoDurationSec + 0.15) {
    const gap = audioDurationSec - videoDurationSec;
    const paddedVideo = join(workDir, 'merged-video-padded.mp4');
    const loopModePad = process.env.AUTOTUBE_LOOP_MODE === '1' || process.env.AUTOTUBE_LOOP_MODE === 'true';
    const maxAudioPadSec = loopModePad ? 45 : 12;
    const holdSecPad = parseFloat(process.env.AUTOTUBE_CUT_INTERVAL_SEC || '1.15') || 1.15;
    let paddedAudio = false;
    if (gap <= maxAudioPadSec) {
      if (lastTailClipPaths.length) {
        paddedAudio = extendVideoWithRenderedClips(mergedVideo, paddedVideo, audioDurationSec, lastTailClipPaths, holdSecPad);
        if (paddedAudio) {
          console.log(`  [ffmpeg] gap-filled with tail B-roll clips (${gap.toFixed(1)}s, keep full narration)`);
        }
      }
      if (!paddedAudio && padVideoToDuration(mergedVideo, paddedVideo, audioDurationSec)) {
        paddedAudio = true;
      }
    }
    if (paddedAudio) {
      videoForMux = paddedVideo;
      tpadSec = gap;
      muxDurationSec = audioDurationSec;
      videoDurationSec = probeMediaDuration(paddedVideo) || audioDurationSec;
      console.log(`  [ffmpeg] padded video ${rawVideoSec.toFixed(1)}s → ${videoDurationSec.toFixed(1)}s (tpad ${gap.toFixed(1)}s, keep full narration)`);
    } else if (loopModePad) {
      console.log(`  [ffmpeg] WARN loop mode: video pad failed (gap ${gap.toFixed(1)}s) — keeping full narration (${audioDurationSec.toFixed(1)}s)`);
      muxDurationSec = audioDurationSec;
    } else {
      const trimmedAudio = join(workDir, 'narration-trimmed.wav');
      if (trimAudioToDuration(audioFile, trimmedAudio, videoDurationSec)) {
        audioForMux = trimmedAudio;
        audioTrimmedSec = gap;
        muxDurationSec = videoDurationSec;
        console.log(`  [ffmpeg] trimmed audio ${audioDurationSec.toFixed(1)}s → ${videoDurationSec.toFixed(1)}s (video pad failed)`);
      }
    }
  } else if (audioFile && existsSync(audioFile) && audioDurationSec > 0.5 && audioDurationSec < videoDurationSec - 0.15) {
    const trimmedVideo = join(workDir, 'merged-video-trimmed.mp4');
    const tr = spawnSync(
      'ffmpeg',
      [
        '-y', '-i', videoForMux,
        '-t', audioDurationSec.toFixed(3),
        '-c:v', 'libx264', '-preset', ffmpegPreset(), '-pix_fmt', 'yuv420p',
        '-an', trimmedVideo,
      ],
      { encoding: 'utf8', timeout: 300_000 },
    );
    if (tr.status === 0 && existsSync(trimmedVideo) && statSync(trimmedVideo).size > 50_000) {
      videoForMux = trimmedVideo;
      videoDurationSec = probeMediaDuration(trimmedVideo) || audioDurationSec;
      muxDurationSec = videoDurationSec;
      console.log(`  [ffmpeg] trimmed video ${rawVideoSec.toFixed(1)}s → ${videoDurationSec.toFixed(1)}s (narration shorter than B-roll)`);
    }
  }

  if (audioForMux && existsSync(audioForMux)) {
    const muxOk = muxVideoWithAudio(videoForMux, audioForMux, outputPath, muxDurationSec, {
      backgroundMusic: project.exportSettings?.backgroundMusic !== false,
      musicPreset: project.exportSettings?.musicPreset,
    });
    if (!muxOk) {
      console.warn('  [ffmpeg] muxVideoWithAudio returned false — outputPath may be missing or corrupt');
    }
  } else {
    const muxSilent = spawnSync('ffmpeg', ['-y', '-i', mergedVideo, '-c', 'copy', outputPath], { encoding: 'utf8' });
    if (muxSilent.status !== 0) {
      console.warn('  [ffmpeg] silent video mux failed:', muxSilent.stderr?.slice(-200));
    }
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

  const placeholderPct = totalClipCount > 0
    ? Math.round((totalPlaceholderClips / totalClipCount) * 1000) / 10
    : 0;
  const placeholderUrls = [...new Set(allPlaceholderUrls)];

  const diversityMetrics = computeTimelineDiversityMetrics(
    allRenderedTimeline.length ? allRenderedTimeline : (project.editTimeline || []),
    project.media || [],
    project.script || [],
  );

  const manifest = {
    clipCount: totalClipCount,
    placeholderClipCount: totalPlaceholderClips,
    placeholderPct,
    placeholderUrls,
    videoSec: videoDurationSec,
    audioSec: audioDurationSec,
    scriptTargetSec: Math.round(scriptTargetSec * 100) / 100,
    audioTrimmedSec: Math.round(audioTrimmedSec * 100) / 100,
    tpadSec: Math.round(tpadSec * 100) / 100,
    muxDurationSec,
    perSegment,
    cutIntervalSec: options.cutIntervalSec ?? assetCutIntervalSec(project),
    hardCuts: hardCutsEnabled(),
    patternInterrupts: patternInterruptsEnabled(),
    uniqueUrlsUsed: diversityMetrics.uniqueUrlsUsed,
    maxUrlSharePct: diversityMetrics.maxUrlSharePct,
    adjacentRepeatCount: diversityMetrics.adjacentRepeatCount,
    requiredUniqueUrls: diversityMetrics.requiredUniqueUrls,
    spacingViolations: diversityMetrics.spacingViolations,
  };
  const manifestPath = join(workDir, 'render-manifest.json');
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(
    `  [ffmpeg] manifest: ${totalClipCount} clips (${totalPlaceholderClips} placeholders, ${placeholderPct}%), video ${videoDurationSec.toFixed(1)}s, tpad ${tpadSec.toFixed(1)}s`,
  );

  return {
    ok: existsSync(outputPath),
    outputPath,
    mode: 'ffmpeg-assembly',
    segmentCount: segmentOutputs.length,
    manifest,
    manifestPath,
  };
}
