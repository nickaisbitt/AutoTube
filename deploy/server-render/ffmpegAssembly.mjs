/**
 * FFmpeg-based B-roll assembly — real video cuts instead of canvas Ken Burns stills.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync, renameSync, statSync } from 'node:fs';
import { join, dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assetCutIntervalSec } from './youtubeProfile.mjs';
import { muxVideoWithAudio } from './audio.mjs';
import {
  AV_OVERSHOOT_EPSILON_SEC,
  DEFAULT_MAX_AUDIO_TRIM_SEC,
  MAX_FREEZE_PAD_SEC,
  resolveMuxAvGap,
} from './avTimelinePolicy.mjs';

export { MAX_FREEZE_PAD_SEC, resolveMuxAvGap } from './avTimelinePolicy.mjs';

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

function isValidPaddedVideo(outputPath, currentSec, padSec) {
  if (!existsSync(outputPath)) return false;
  const size = statSync(outputPath).size;
  const dur = probeMediaDuration(outputPath);
  // Reject corrupt tpad outputs (historically 48-byte MP4s with no moov).
  if (size < 50_000 || dur < currentSec + padSec * 0.5) {
    try {
      unlinkSync(outputPath);
    } catch {
      /* ignore */
    }
    return false;
  }
  return true;
}

/** Last-frame still concat when the tpad filter fails or produces a corrupt file. */
function padVideoViaLastFrame(inputPath, outputPath, padSec) {
  const workDir = dirname(outputPath);
  const lastFrame = join(workDir, 'tpad-last-frame.png');
  const freezeClip = join(workDir, 'tpad-freeze-clip.mp4');
  try {
    unlinkSync(lastFrame);
  } catch { /* ignore */ }
  try {
    unlinkSync(freezeClip);
  } catch { /* ignore */ }

  const frame = spawnSync(
    'ffmpeg',
    ['-y', '-sseof', '-0.15', '-i', inputPath, '-frames:v', '1', lastFrame],
    { encoding: 'utf8', timeout: 60_000 },
  );
  if (frame.status !== 0 || !existsSync(lastFrame) || statSync(lastFrame).size < 100) {
    return false;
  }

  const dim = spawnSync(
    'ffprobe',
    [
      '-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height',
      '-of', 'csv=p=0:s=x', inputPath,
    ],
    { encoding: 'utf8' },
  );
  const wh = String(dim.stdout || '').trim().split('x');
  const w = parseInt(wh[0], 10) || 1280;
  const h = parseInt(wh[1], 10) || 720;

  const freeze = spawnSync(
    'ffmpeg',
    [
      '-y', '-loop', '1', '-i', lastFrame,
      '-t', padSec.toFixed(3),
      '-vf', `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,fps=${FPS}`,
      '-c:v', 'libx264', '-preset', ffmpegPreset(), '-pix_fmt', 'yuv420p',
      '-an', freezeClip,
    ],
    { encoding: 'utf8', timeout: 120_000 },
  );
  if (freeze.status !== 0 || !existsSync(freezeClip)) return false;

  const listFile = join(workDir, 'tpad-concat.txt');
  writeFileSync(
    listFile,
    `file '${escapeConcatPath(inputPath)}'\nfile '${escapeConcatPath(freezeClip)}'\n`,
  );
  const concat = spawnSync(
    'ffmpeg',
    [
      '-y', '-f', 'concat', '-safe', '0', '-i', listFile,
      '-c:v', 'libx264', '-preset', ffmpegPreset(), '-pix_fmt', 'yuv420p',
      '-an', outputPath,
    ],
    { encoding: 'utf8', timeout: 300_000 },
  );
  try { unlinkSync(lastFrame); } catch { /* ignore */ }
  try { unlinkSync(freezeClip); } catch { /* ignore */ }
  try { unlinkSync(listFile); } catch { /* ignore */ }
  return concat.status === 0 && existsSync(outputPath);
}

/**
 * Extend video by cloning the last frame so narration is not truncated.
 * Primary: ffmpeg tpad. Fallback: last-frame still concat (covers corrupt tpad).
 */
function padVideoToDuration(inputPath, outputPath, targetSec) {
  const current = probeMediaDuration(inputPath);
  const padSec = targetSec - current;
  if (padSec <= 0.05) {
    const copy = spawnSync('ffmpeg', ['-y', '-i', inputPath, '-c', 'copy', outputPath], { encoding: 'utf8' });
    return copy.status === 0 && existsSync(outputPath);
  }

  const tpad = spawnSync(
    'ffmpeg',
    [
      '-y', '-i', inputPath,
      '-vf', `tpad=stop_mode=clone:stop_duration=${padSec.toFixed(3)}`,
      '-c:v', 'libx264', '-preset', ffmpegPreset(), '-pix_fmt', 'yuv420p',
      '-an', outputPath,
    ],
    { encoding: 'utf8', timeout: 300_000 },
  );
  if (tpad.status === 0 && isValidPaddedVideo(outputPath, current, padSec)) {
    return true;
  }

  console.log(`  [ffmpeg] tpad failed or corrupt — trying last-frame freeze (${padSec.toFixed(1)}s)`);
  if (padVideoViaLastFrame(inputPath, outputPath, padSec)
      && isValidPaddedVideo(outputPath, current, padSec)) {
    return true;
  }
  return false;
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

function escapeConcatPath(p) {
  return resolve(p).replace(/'/g, "'\\''");
}

/** Concat demuxer with -c copy, then re-encode fallback on codec mismatch. */
function concatVideos(inputs, outputPath, listFile) {
  writeFileSync(
    listFile,
    inputs.map((p) => `file '${escapeConcatPath(p)}'`).join('\n'),
  );
  const copy = spawnSync(
    'ffmpeg',
    ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', '-an', outputPath],
    { encoding: 'utf8', timeout: 300_000 },
  );
  if (copy.status === 0 && existsSync(outputPath)) {
    return { ok: true, reencoded: false };
  }
  console.warn('  [ffmpeg] concat -c copy failed; retrying with re-encode');
  try {
    if (existsSync(outputPath)) unlinkSync(outputPath);
  } catch {
    /* ignore */
  }
  const reencode = spawnSync(
    'ffmpeg',
    [
      '-y', '-f', 'concat', '-safe', '0', '-i', listFile,
      '-c:v', 'libx264', '-preset', ffmpegPreset(), '-pix_fmt', 'yuv420p', '-an',
      outputPath,
    ],
    { encoding: 'utf8', timeout: 600_000 },
  );
  if (reencode.status !== 0 || !existsSync(outputPath)) {
    return {
      ok: false,
      error: (reencode.stderr || copy.stderr || '').slice(-400) || 'concat failed',
    };
  }
  return { ok: true, reencoded: true };
}

function hardCutsEnabled() {
  if (process.env.AUTOTUBE_FFMPEG_HARD_CUTS === '0' || process.env.AUTOTUBE_FFMPEG_HARD_CUTS === 'false') {
    return false;
  }
  if (process.env.AUTOTUBE_FFMPEG_HARD_CUTS === '1' || process.env.AUTOTUBE_FFMPEG_HARD_CUTS === 'true') {
    return true;
  }
  const loopMode = process.env.AUTOTUBE_LOOP_MODE === '1' || process.env.AUTOTUBE_LOOP_MODE === 'true';
  const youtubeMode = process.env.AUTOTUBE_YOUTUBE_MODE === '1' || process.env.AUTOTUBE_YOUTUBE_MODE === 'true';
  // Hard cuts by default for retention pacing.
  return loopMode || youtubeMode || process.env.AUTOTUBE_RENDER_MODE === 'ffmpeg';
}

function patternInterruptsEnabled() {
  if (process.env.AUTOTUBE_PATTERN_INTERRUPTS === '0' || process.env.AUTOTUBE_PATTERN_INTERRUPTS === 'false') {
    return false;
  }
  if (process.env.AUTOTUBE_PATTERN_INTERRUPTS === '1' || process.env.AUTOTUBE_PATTERN_INTERRUPTS === 'true') {
    return true;
  }
  return false;
}

function hookSceneCutsEnabled() {
  return process.env.AUTOTUBE_HOOK_SCENE_CUTS === '1'
    || process.env.AUTOTUBE_HOOK_SCENE_CUTS === 'true';
}

function shouldApplyGentleZoomPunch(scheduleIndex, isHookSegment) {
  const cutNumber = scheduleIndex + 1;
  if (isHookSegment) return cutNumber % 7 === 3 || cutNumber % 11 === 0;
  return cutNumber % 11 === 5;
}

/**
 * Five directional Ken-Burns presets for stills, cycling by clipIndex so that
 * adjacent cuts always vary both zoom direction and pan axis.  Motion is sized
 * so a 1.25 s clip (30 frames @ 24 fps) shows a clearly visible 5–8 % zoom
 * change and 40–60 px of pan on a 1 920 px source — enough that Archive stills
 * read as documentary camera work rather than a frozen slideshow.
 *
 * All pan offsets are kept well within the zoompan valid region:
 *   x ∈ [0, iw − iw/z],  y ∈ [0, ih − ih/z]
 * At z ≈ 1.10 that gives ~175 px of slack on a 1 920-wide source, so
 * 30 frames × 1.8 px/frame = 54 px is safely bounded.
 */
function stillKenBurnsFilter(frames, w, h, clipIndex) {
  switch (clipIndex % 5) {
    case 0:
      // Zoom-in from centre, drift right (reading direction)
      return `zoompan=z='min(zoom+0.003,1.14)':x='iw/2-(iw/zoom/2)+on*1.5':y='ih/2-(ih/zoom/2)':d=${frames}:s=${w}x${h}:fps=${FPS}`;
    case 1:
      // Zoom-in from centre, drift up (upward reveal)
      return `zoompan=z='min(zoom+0.003,1.12)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)-on*1.2':d=${frames}:s=${w}x${h}:fps=${FPS}`;
    case 2:
      // Zoom-out with left drift (pullback reveal — starts at 1.15 × and retreats)
      return `zoompan=z='max(1.15-on*0.004,1.0)':x='iw/2-(iw/zoom/2)-on*1.8':y='ih/2-(ih/zoom/2)':d=${frames}:s=${w}x${h}:fps=${FPS}`;
    case 3:
      // Zoom-in from upper-left corner with diagonal drift down-right
      return `zoompan=z='min(zoom+0.0025,1.10)':x='on*1.6':y='on*1.0':d=${frames}:s=${w}x${h}:fps=${FPS}`;
    case 4:
      // Zoom-out from centre with downward drift
      return `zoompan=z='max(1.12-on*0.003,1.0)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)+on*1.4':d=${frames}:s=${w}x${h}:fps=${FPS}`;
    default:
      return `zoompan=z='min(zoom+0.003,1.12)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${w}x${h}:fps=${FPS}`;
  }
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
      const asset = resolveTimelineAsset(entry, segMedia, project?.media || []);
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

/**
 * Archive.org training/promo films often open on license boards / title cards
 * (PeriscopeFilm.com screens, "Airport in the Jet Age", etc.). Skip past that
 * window on the first use of each Archive asset.
 */
function archiveIntroSkipSec(asset, probedDur = 0) {
  const url = asset?.url || '';
  const source = asset?.source || '';
  if (!/archive\.org/i.test(url) && !/Archive\.org/i.test(source)) return 0;
  const dur = Number(probedDur) || 0;
  // Schedule-time duration is often a synthetic 8s placeholder — still skip a
  // license-board window so we do not rely on a later probe to save the hook.
  if (!(dur >= 20)) return 15;
  if (dur >= 60) return Math.min(22, Math.max(15, dur * 0.04));
  return Math.min(10, Math.max(5, dur * 0.15));
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
    const maxSrc = Math.max(clip.asset?.duration || 0, 30);
    let offset = nextOffset.get(key);
    if (offset === undefined) {
      offset = archiveIntroSkipSec(clip.asset, maxSrc);
    }
    // Wrap past the end back to the intro-skip window — never back to t=0 license boards.
    if (offset + clip.durationSec > maxSrc - 0.15) {
      offset = archiveIntroSkipSec(clip.asset, maxSrc);
    }
    nextOffset.set(key, offset + clip.durationSec);
    return { ...clip, sourceStartSec: offset };
  });
}

/**
 * Resolve the underlying media target for a fetch URL.
 *
 * Harvested web clips are proxied through our own endpoints and are often
 * wrapped in cache-busting path prefixes such as
 *   /api/download-clip/.autotube-<seg>-<n>/../../download-clip?url=<target>
 * WHATWG URL parsing normalises the `..` segments back to /api/download-clip,
 * so we can recover the real remote target from the `url` query parameter and
 * key the on-disk cache by it. This guarantees:
 *   - distinct remote targets → distinct cache files (no visual collapse), and
 *   - identical remote targets → a single shared download (no wasteful re-fetch),
 * regardless of the wrapper prefix that made the proxied URL string unique.
 */
function targetUrlForCache(url) {
  let current = url;
  for (let depth = 0; depth < 4; depth++) {
    try {
      const parsed = new URL(current, 'http://local');
      if (!/\/api\/(download-clip|proxy-image)\b/.test(parsed.pathname)) break;
      const inner = parsed.searchParams.get('url');
      if (!inner) break;
      current = inner;
    } catch {
      break;
    }
  }
  return current;
}

function cachePathForUrl(url, cacheDir, isVideo) {
  const cacheKey = targetUrlForCache(url);
  const hash = createHash('sha1').update(cacheKey).digest('hex').slice(0, 16);
  let ext = '.jpg';
  try {
    ext = extname(new URL(cacheKey, 'http://local').pathname) || ext;
  } catch {
    /* ignore */
  }
  if (isVideo) ext = '.mp4';
  if (!/^\.(jpe?g|png|webp|gif|mp4|webm|mov)$/i.test(ext)) ext = isVideo ? '.mp4' : '.jpg';
  return join(cacheDir, `${hash}${ext}`);
}

function apiAuthHeaders(fetchUrl = '') {
  const headers = { 'user-agent': 'Mozilla/5.0 AutoTube/1.0' };
  // Same-origin /api/* (download-clip, proxy-image) requires AUTOTUBE_API_KEY.
  // Without it every proxied raw-web clip 401s and assemble collapses onto stills.
  if (/\/api\/(download-clip|proxy-image)\b/.test(fetchUrl)) {
    const key = (
      process.env.AUTOTUBE_API_KEY
      || process.env.VITE_AUTOTUBE_API_KEY
      || ''
    ).trim();
    if (key) headers['X-API-Key'] = key;
  }
  return headers;
}

/**
 * Archive.org training films are often hundreds of MB / multi-GB. Buffering the
 * whole file for a 1s B-roll cut blows the server-render wall clock. Pull a short
 * mid-film slice with ffmpeg instead (HTTP seek when the host supports it).
 */
function shouldSliceRemoteVideo(url = '') {
  const target = targetUrlForCache(url);
  return /archive\.org\//i.test(target);
}

function fetchVideoSliceViaFfmpeg(url, cached, { startSec = 15, durationSec = 48 } = {}) {
  const tmp = `${cached}.partial.mp4`;
  try {
    if (existsSync(tmp)) unlinkSync(tmp);
  } catch {
    /* ignore */
  }
  const r = spawnSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-user_agent',
      'Mozilla/5.0 AutoTube/1.0',
      '-ss',
      String(Math.max(0, startSec)),
      '-t',
      String(Math.max(8, durationSec)),
      '-i',
      url,
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-an',
      '-movflags',
      '+faststart',
      tmp,
    ],
    { encoding: 'utf8', timeout: 180_000 },
  );
  if (r.status !== 0 || !existsSync(tmp)) {
    try {
      if (existsSync(tmp)) unlinkSync(tmp);
    } catch {
      /* ignore */
    }
    return null;
  }
  try {
    const size = readFileSync(tmp).length;
    if (size < 500) {
      unlinkSync(tmp);
      return null;
    }
    renameSync(tmp, cached);
    return cached;
  } catch {
    try {
      if (existsSync(tmp)) unlinkSync(tmp);
    } catch {
      /* ignore */
    }
    return null;
  }
}

async function fetchToCache(fetchUrl, cached, { expectVideo = false } = {}) {
  const timeoutMs = expectVideo || fetchUrl.includes('/api/download-clip') ? 120_000 : 45_000;
  const res = await fetch(fetchUrl, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: apiAuthHeaders(fetchUrl),
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

  // A harvested web clip is already an absolute URL pointing at one of our own
  // proxy endpoints (often wrapped in a cache-busting path prefix). Re-wrapping
  // it in another /api/download-clip call just yields a guaranteed 403 (its host
  // is localhost, not an allowed media host) and would burn the retry budget, so
  // fetch it directly.
  const isProxied = /\/api\/(download-clip|proxy-image)\b/.test(rawUrl);
  const candidates = [];
  if (rawUrl.startsWith('/api/')) {
    candidates.push(`${devServer}${rawUrl}`);
  } else if (isProxied) {
    candidates.push(rawUrl);
  } else if (rawUrl.startsWith('http')) {
    if (isVideo) {
      // Archive.org (and other) direct MP4s are plain HTTP GETs — prefer them over
      // yt-dlp so a 401/format miss on /api/download-clip cannot starve the slot.
      const isDirectHttpVideo = /\.(mp4|webm|mov)(?:[?#]|$)/i.test(rawUrl)
        || /archive\.org\/download\//i.test(rawUrl);
      if (isDirectHttpVideo) {
        candidates.push(rawUrl);
        candidates.push(`${devServer}/api/download-clip?url=${encodeURIComponent(rawUrl)}`);
      } else {
        candidates.push(`${devServer}/api/download-clip?url=${encodeURIComponent(rawUrl)}`);
        candidates.push(rawUrl);
      }
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
    const isDownloadClip = fetchUrl.includes('/api/download-clip');
    const preferSlice = isVideo && !isDownloadClip && shouldSliceRemoteVideo(fetchUrl);
    if (existsSync(cached)) {
      let size = 0;
      try {
        size = readFileSync(cached).length;
      } catch {
        size = 0;
      }
      // Prior full-film Archive downloads (100MB–GB) starve the render wall clock —
      // discard and re-fetch a short ffmpeg slice instead.
      if (preferSlice && size > 80_000_000) {
        try {
          unlinkSync(cached);
        } catch {
          /* ignore */
        }
      } else if (size > 500) {
        return cached;
      }
    }
    // Downloading a web clip through yt-dlp (/api/download-clip) is slow and
    // fails transiently (throttling, cold extractor, partial download). A single
    // miss must not silently drop this clip and force every slot onto the same
    // fallback still — retry a few times before moving to the next candidate.
    const attempts = isDownloadClip ? 3 : isVideo ? 2 : 1;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        if (preferSlice) {
          const startSec = archiveIntroSkipSec(asset, 120) || 15;
          const sliced = fetchVideoSliceViaFfmpeg(fetchUrl, cached, {
            startSec,
            durationSec: 48,
          });
          if (sliced) return sliced;
        }
        const path = await fetchToCache(fetchUrl, cached, { expectVideo: isVideo });
        if (path) return path;
      } catch {
        /* retry or fall through to next candidate */
      }
      if (attempt < attempts - 1) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
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

function encodeClip(localSrc, asset, durationSec, clipOut, { w, h, preset, draft, sourceStartSec = 0, clipIndex = 0, zoomPunch = false }) {
  const isVideo = asset.type === 'video' || /\.(mp4|webm|mov)/i.test(asset.url || '');
  const hardCuts = hardCutsEnabled();
  const frames = Math.max(1, Math.round(durationSec * FPS));
  let vf = `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`;
  if (zoomPunch && frames > 2) {
    // Pattern interrupt without blank flash frames.
    const punchStart = 1.07 + (clipIndex % 3) * 0.01;
    const punchEnd = 1.01 + (clipIndex % 2) * 0.01;
    const punchDelta = punchStart - punchEnd;
    vf = `scale=${Math.round(w * punchStart)}:${Math.round(h * punchStart)},zoompan=z='${punchStart.toFixed(3)}-${punchDelta.toFixed(3)}*(on/${frames})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${w}x${h}:fps=${FPS}`;
  } else if (!isVideo && hardCuts) {
    // Directional Ken-Burns: 5 presets cycle across clips so still-heavy segments
    // never read as a slideshow even when the same URL repeats.
    vf = `${stillKenBurnsFilter(frames, w, h, clipIndex)},${vf}`;
  } else if (!isVideo && !draft) {
    // Subtle directional Ken-Burns for non-hard-cut renders; alternates zoom in/out.
    const zDir = clipIndex % 2 === 0 ? `min(zoom+0.0022,1.10)` : `max(1.10-on*0.0022,1.0)`;
    const xPan = clipIndex % 2 === 0 ? `iw/2-(iw/zoom/2)+on*0.8` : `iw/2-(iw/zoom/2)-on*0.8`;
    vf = `zoompan=z='${zDir}':x='${xPan}':y='ih/2-(ih/zoom/2)':d=${frames}:s=${w}x${h}:fps=${FPS},${vf}`;
  }
  // Never fade-to-black between cuts — that reads as title-card blinks at every boundary.

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
    const simpleVf = `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`;
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

/** Last-resort filler — prefer reuse; grain only if nothing else exists (and never near-black). */
function encodePlaceholderClip(clipOut, durationSec, clipIdx, { w, h, preset }, reusePath = null) {
  if (reusePath && existsSync(reusePath)) {
    const frames = Math.max(1, Math.round(durationSec * FPS));
    const rReuse = spawnSync(
      'ffmpeg',
      [
        '-y', '-i', reusePath, '-t', String(durationSec),
        '-vf', `scale=${Math.round(w * 1.15)}:${Math.round(h * 1.15)},zoompan=z='1.15-0.15*(on/${frames})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${w}x${h}:fps=${FPS}`,
        '-c:v', 'libx264', '-preset', preset, '-pix_fmt', 'yuv420p', '-an', clipOut,
      ],
      { encoding: 'utf8', timeout: 120_000 },
    );
    if (rReuse.status === 0 && existsSync(clipOut)) return true;
  }
  // Soft blue-gray motion pad — never pure black/near-black (title-card blinks).
  const r = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-f', 'lavfi',
      '-i', `color=c=0x9aa3b2:s=${w}x${h}:r=${FPS}:d=${durationSec}`,
      '-vf', `noise=alls=10:allf=t+u,eq=brightness=0.12:contrast=1.05:saturation=0.45`,
      '-c:v', 'libx264',
      '-preset', preset,
      '-pix_fmt', 'yuv420p',
      '-an',
      clipOut,
    ],
    { encoding: 'utf8', timeout: 60_000 },
  );
  return r.status === 0 && existsSync(clipOut);
}

async function renderSegmentClips(segment, segMedia, project, outputPath, options, { isHookSegment = false } = {}) {
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
  // Only grain fillers count as placeholders.
  let grainPlaceholderCount = 0;
  let reuseClipCount = 0;
  let lastSuccessfulClipPath = options.sharedLastGoodRef?.path || null;
  const projectMedia = Array.isArray(project?.media) ? project.media : [];
  const videoOffsets = new Map();
  const videoDurations = new Map();

  // Spread fallbacks across the whole media pool. When many web clips fail to
  // download at assemble time, a fixed-order search always lands on the first
  // asset that encodes, so every failed slot renders the identical still (the
  // "10+ frames of the same plane" collapse). Track per-asset usage so failed
  // slots rotate through every distinct asset that is actually available.
  const assetUseCount = new Map();
  let lastUsedAssetKey = null;
  function noteAssetUse(key) {
    if (!key) return;
    assetUseCount.set(key, (assetUseCount.get(key) || 0) + 1);
    lastUsedAssetKey = key;
  }
  function isVideoAsset(a) {
    return a?.type === 'video' || /\.(mp4|webm|mov)/i.test(a?.url || '');
  }

  function orderedFallbacks(pool, excludeKey) {
    const seen = new Set();
    const list = [];
    for (const a of pool) {
      const k = assetKey(a);
      if (!a || !k || k === excludeKey || seen.has(k)) continue;
      seen.add(k);
      list.push(a);
    }
    // Prefer real motion over stills when a web clip fails to download — otherwise
    // every failed TikTok/YouTube slot collapses onto the same off-topic image.
    list.sort((a, b) => {
      const va = isVideoAsset(a) ? 0 : 1;
      const vb = isVideoAsset(b) ? 0 : 1;
      if (va !== vb) return va - vb;
      return (assetUseCount.get(assetKey(a)) || 0) - (assetUseCount.get(assetKey(b)) || 0);
    });
    // Avoid a back-to-back repeat of the previous visual when a fresh
    // alternative of equal priority exists.
    if (list.length > 1 && assetKey(list[0]) === lastUsedAssetKey) {
      list.push(list.shift());
    }
    return list;
  }

  function resolveVideoSeek(asset, localSrc, durationSec, hintOffset = 0) {
    const isVideo = asset.type === 'video' || /\.(mp4|webm|mov)/i.test(asset.url || '');
    if (!isVideo) return 0;
    if (!videoDurations.has(localSrc)) {
      videoDurations.set(localSrc, probeMediaDuration(localSrc) || Math.max(asset.duration || 0, 30));
    }
    const total = videoDurations.get(localSrc);
    const key = assetKey(asset);
    let offset;
    if (videoOffsets.has(key)) {
      offset = videoOffsets.get(key);
    } else {
      // Prefer the larger of schedule hint and Archive intro skip using the
      // *probed* duration — a small schedule hint must not cancel a 15–22s skip.
      const intro = archiveIntroSkipSec(asset, total);
      offset = Math.max(Number(hintOffset) || 0, intro);
    }
    if (offset + durationSec > total - 0.1) {
      const intro = archiveIntroSkipSec(asset, total);
      offset = intro > 0 && intro + durationSec <= total - 0.1
        ? intro
        : Math.max(0, total - durationSec - 0.1);
    }
    videoOffsets.set(key, offset + durationSec);
    return offset;
  }

  async function pushClip(asset, durationSec, label, hintOffset = 0, { zoomPunch = false } = {}) {
    const clipOut = join(tmpDir, `clip-${String(clipIndex).padStart(3, '0')}.mp4`);
    clipIndex += 1;

    const tryEncode = async (candidate, tag) => {
      const { localSrc, asset: resolvedAsset } = await resolveLocalAsset(
        candidate,
        segMedia,
        devServer,
        cacheDir,
      );
      if (!localSrc) return false;
      const sourceStartSec = resolveVideoSeek(resolvedAsset, localSrc, durationSec, hintOffset);
      let ok = encodeClip(localSrc, resolvedAsset, durationSec, clipOut, {
        w, h, preset, draft, sourceStartSec, clipIndex: clipIndex - 1, zoomPunch,
      });
      if (!ok) {
        const thumb = resolvedAsset.thumbnailUrl;
        if (thumb) {
          const thumbAsset = { ...resolvedAsset, type: 'image', url: thumb };
          const thumbLocal = await ensureLocalAsset(thumbAsset, devServer, cacheDir);
          if (thumbLocal) {
            ok = encodeClip(thumbLocal, thumbAsset, durationSec, clipOut, {
              w, h, preset, draft, sourceStartSec: 0, clipIndex: clipIndex - 1, zoomPunch,
            });
            if (ok) console.log(`  [ffmpeg] ${label}: ${tag} → thumbnail still`);
          }
        }
      }
      return ok;
    };

    let usedAssetKey = null;
    let ok = await tryEncode(asset, 'primary');
    if (ok) usedAssetKey = assetKey(asset);
    if (!ok) {
      // Try other segment assets before any synthetic filler, rotating across
      // the pool (least-recently-used first) so a run of failed web clips does
      // not collapse every slot onto whichever asset encodes first.
      const primaryKey = assetKey(asset);
      for (const alt of orderedFallbacks(segMedia, primaryKey)) {
        ok = await tryEncode(alt, 'alt');
        if (ok) {
          usedAssetKey = assetKey(alt);
          console.log(
            `  [ffmpeg] ${label}: fell back to alternate segment asset (${(usedAssetKey || '').slice(0, 8)})`,
          );
          break;
        }
      }
    }
    if (!ok && projectMedia.length) {
      // Any project media beats grain/black blinks — again rotated so distinct
      // slots draw distinct visuals from the wider pool.
      const primaryKey = assetKey(asset);
      const tried = new Set(
        [asset, ...segMedia].map((a) => assetKey(a)).filter(Boolean),
      );
      for (const alt of orderedFallbacks(projectMedia, primaryKey)) {
        if (tried.has(assetKey(alt))) continue;
        ok = await tryEncode(alt, 'project');
        if (ok) {
          usedAssetKey = assetKey(alt);
          console.log(
            `  [ffmpeg] ${label}: fell back to project media asset (${(usedAssetKey || '').slice(0, 8)})`,
          );
          break;
        }
      }
    }
    if (!ok) {
      // Reuse last good clip with zoom before inventing grain (kills black blinks).
      const sharedGood = options.sharedLastGoodClipPath;
      const reuseCandidates = [
        lastSuccessfulClipPath,
        sharedGood,
        ...[...clipPaths].reverse(),
      ].filter((p, i, arr) => p && existsSync(p) && arr.indexOf(p) === i);
      for (const reusePath of reuseCandidates) {
        ok = encodePlaceholderClip(clipOut, durationSec, clipIndex, { w, h, preset }, reusePath);
        if (ok) {
          console.log(`  [ffmpeg] ${label}: reused prior clip (no grain)`);
          reuseClipCount += 1;
          break;
        }
      }
    }
    if (!ok) {
      // Only invent grain when we have literally nothing to reuse.
      console.log(`  [ffmpeg] ${label}: bright grain placeholder — no usable asset`);
      ok = encodePlaceholderClip(clipOut, durationSec, clipIndex, { w, h, preset }, null);
      if (ok) grainPlaceholderCount += 1;
    }
    if (!ok) {
      return false;
    }
    lastSuccessfulClipPath = clipOut;
    if (options.sharedLastGoodRef) options.sharedLastGoodRef.path = clipOut;
    if (usedAssetKey) noteAssetUse(usedAssetKey);
    clipPaths.push(clipOut);
    renderedDuration += durationSec;
    return true;
  }

  for (let i = 0; i < schedule.length; i++) {
    const { asset, durationSec, sourceStartSec } = schedule[i];
    // Occasional mild punch, no blink/blank frames.
    const zoomPunch =
      ((isHookSegment && (patternInterruptsEnabled() || hookSceneCutsEnabled()))
        || (!isHookSegment && hardCutsEnabled()))
      && shouldApplyGentleZoomPunch(i, isHookSegment);
    await pushClip(asset, durationSec, `clip ${i + 1}/${schedule.length}`, sourceStartSec || 0, { zoomPunch });
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
  const concat = concatVideos(clipPaths, outputPath, listFile);
  if (!concat.ok) {
    return { ok: false, error: concat.error || 'segment concat failed' };
  }
  if (concat.reencoded) {
    console.log('  [ffmpeg] segment concat used re-encode fallback');
  }

  const videoSec = probeMediaDuration(outputPath);
  return {
    ok: true,
    clipCount: clipPaths.length,
    placeholderClipCount: grainPlaceholderCount,
    reuseClipCount,
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
 * @param {number} [options.introHoldSec] Extra b-roll seconds folded into segment 0's
 *   video slot to cover the narration mix's intro silence (hook window).
 * @param {number} [options.outroHoldSec] Extra b-roll seconds folded into the last
 *   segment's video slot to cover the narration mix's end-screen silence.
 */
export async function renderViaFfmpegAssembly(project, outputPath, options = {}) {
  const workDir = join(dirname(outputPath), 'ffmpeg-assembly');
  mkdirSync(workDir, { recursive: true });
  const introHoldSec = Math.max(0, Number(options.introHoldSec) || 0);
  const outroHoldSec = Math.max(0, Number(options.outroHoldSec) || 0);
  if (introHoldSec > 0 || outroHoldSec > 0) {
    console.log(`  [ffmpeg] timeline holds: intro ${introHoldSec.toFixed(2)}s, outro ${outroHoldSec.toFixed(2)}s (match audio silences)`);
  }
  const segmentOutputs = [];
  const perSegment = [];
  let totalClipCount = 0;
  let totalPlaceholderClips = 0;
  const preset = ffmpegPreset();

  const mediaPool = project.media || [];
  const sharedLastGoodRef = { path: null };

  for (let si = 0; si < (project.script || []).length; si++) {
    const seg = project.script[si];
    let segMedia = mediaPool.filter((a) => a.segmentId === seg.id);
    if (!segMedia.length && mediaPool.length) {
      segMedia = mediaPool.map((a) => ({ ...a, segmentId: seg.id }));
    }
    if (!segMedia.length) continue;

    console.log(`  [ffmpeg] segment ${si + 1}/${project.script.length}: ${seg.title} (${(seg.duration || 0).toFixed(1)}s)`);
    const segOut = join(workDir, `segment-${si}.mp4`);
    const isHookSegment = si === 0 || seg.type === 'intro';
    // Fold audio intro/end silences into the first/last video slots so the video
    // timeline matches the concatenated narration exactly (no trim of speech).
    const extraHoldSec =
      (si === 0 ? introHoldSec : 0)
      + (si === project.script.length - 1 ? outroHoldSec : 0);
    const segForVideo = extraHoldSec > 0
      ? { ...seg, duration: (seg.duration || 20) + extraHoldSec }
      : seg;
    const result = await renderSegmentClips(segForVideo, segMedia, project, segOut, {
      ...options,
      sharedLastGoodClipPath: sharedLastGoodRef.path,
      sharedLastGoodRef,
    }, { isHookSegment });
    if (!result.ok) {
      return { ok: false, error: result.error, segment: seg.title };
    }
    segmentOutputs.push(segOut);
    totalClipCount += result.clipCount;
    totalPlaceholderClips += result.placeholderClipCount || 0;
    perSegment.push({
      segmentId: seg.id,
      title: seg.title,
      clipCount: result.clipCount,
      placeholderClipCount: result.placeholderClipCount || 0,
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
  const merge = concatVideos(segmentOutputs, mergedVideo, listFile);
  if (!merge.ok) {
    return { ok: false, error: merge.error || 'segment merge failed' };
  }
  if (merge.reencoded) {
    console.log('  [ffmpeg] segment merge used re-encode fallback');
  }

  let videoDurationSec = probeMediaDuration(mergedVideo) || 60;
  const rawVideoSec = videoDurationSec;
  const audioFile = options.mixedAudioPath;
  const audioDurationSec = audioFile && existsSync(audioFile) ? probeMediaDuration(audioFile) : 0;

  let audioForMux = audioFile;
  let audioTrimmedSec = 0;
  let tpadSec = 0;
  let videoForMux = mergedVideo;
  let muxDurationSec = videoDurationSec;

  if (audioFile && existsSync(audioFile) && audioDurationSec > videoDurationSec + AV_OVERSHOOT_EPSILON_SEC) {
    const overshootSec = audioDurationSec - videoDurationSec;
    const maxTrimSec = Math.max(
      0,
      Number(process.env.AUTOTUBE_MAX_AUDIO_TRIM_SEC ?? DEFAULT_MAX_AUDIO_TRIM_SEC),
    );
    const decision = resolveMuxAvGap(overshootSec, {
      allowAudioTrim: process.env.AUTOTUBE_ALLOW_AUDIO_TRIM === '1',
      maxTrimSec,
      maxFreezePadSec: MAX_FREEZE_PAD_SEC,
    });
    const paddedVideo = join(workDir, 'merged-video-padded.mp4');

    // Prefer freeze-pad (≤12s) so narration is kept — segment encode drift on
    // healthcare/espeak runs was failing the trim gate (~2.5–5s short).
    if (decision.action === 'freeze-pad') {
      if (padVideoToDuration(mergedVideo, paddedVideo, audioDurationSec)) {
        videoForMux = paddedVideo;
        tpadSec = overshootSec;
        videoDurationSec = probeMediaDuration(paddedVideo) || audioDurationSec;
        muxDurationSec = audioDurationSec;
        console.log(
          `  [ffmpeg] padded video ${rawVideoSec.toFixed(1)}s → ${videoDurationSec.toFixed(1)}s `
          + `(tpad ${overshootSec.toFixed(1)}s, keep full narration)`,
        );
      } else {
        // Pad should succeed for ≤12s; if both tpad + last-frame fail, fall through
        // to the trim/fail path rather than silently muxing a short video.
        console.log(
          `  [ffmpeg] freeze-pad failed for ${overshootSec.toFixed(1)}s gap — `
          + 'falling back to audio trim / fail-closed',
        );
        if (overshootSec > maxTrimSec && process.env.AUTOTUBE_ALLOW_AUDIO_TRIM !== '1') {
          return {
            ok: false,
            error:
              `A/V timeline mismatch: mux would trim ${overshootSec.toFixed(2)}s of audio `
              + `(audio ${audioDurationSec.toFixed(2)}s vs video ${rawVideoSec.toFixed(2)}s, `
              + `allowed ${maxTrimSec}s; freeze-pad ≤${MAX_FREEZE_PAD_SEC}s also failed). `
              + 'Narration would be cut off. Set AUTOTUBE_ALLOW_AUDIO_TRIM=1 to override.',
          };
        }
        const trimmedAudio = join(workDir, 'narration-trimmed.wav');
        if (trimAudioToDuration(audioFile, trimmedAudio, rawVideoSec)) {
          audioForMux = trimmedAudio;
          audioTrimmedSec = overshootSec;
          muxDurationSec = rawVideoSec;
          console.log(
            `  [ffmpeg] trimmed audio ${audioDurationSec.toFixed(1)}s → ${rawVideoSec.toFixed(1)}s `
            + '(video pad failed)',
          );
        }
      }
    } else if (decision.action === 'trim-audio') {
      const trimmedAudio = join(workDir, 'narration-trimmed.wav');
      if (trimAudioToDuration(audioFile, trimmedAudio, rawVideoSec)) {
        audioForMux = trimmedAudio;
        audioTrimmedSec = overshootSec;
        muxDurationSec = rawVideoSec;
        console.log(
          `  [ffmpeg] trimmed audio ${audioDurationSec.toFixed(1)}s → ${rawVideoSec.toFixed(1)}s `
          + `(overshoot ${overshootSec.toFixed(1)}s > freeze-pad ${MAX_FREEZE_PAD_SEC}s)`,
        );
      }
    } else if (decision.action === 'fail') {
      return {
        ok: false,
        error:
          `A/V timeline mismatch: mux would trim ${overshootSec.toFixed(2)}s of audio `
          + `(audio ${audioDurationSec.toFixed(2)}s vs video ${rawVideoSec.toFixed(2)}s, `
          + `freeze-pad max ${MAX_FREEZE_PAD_SEC}s, trim allowed ${maxTrimSec}s). `
          + 'Narration would be cut off. Set AUTOTUBE_ALLOW_AUDIO_TRIM=1 to override.',
      };
    }
  }

  if (audioForMux && existsSync(audioForMux)) {
    muxVideoWithAudio(videoForMux, audioForMux, outputPath, muxDurationSec, {
      style: project.style || project.exportSettings?.style,
      backgroundMusic: project.exportSettings?.backgroundMusic !== false,
      musicPreset: project.exportSettings?.musicPreset,
      narrationTimings: options.narrationTimings || [],
    });
  } else {
    spawnSync('ffmpeg', ['-y', '-i', videoForMux, '-c', 'copy', outputPath], { encoding: 'utf8' });
  }

  if (existsSync(outputPath) && (process.env.AUTOTUBE_LOOP_MODE === '1' || process.env.AUTOTUBE_YOUTUBE_MODE === '1')) {
    const normalizedOut = join(workDir, 'mux-loudnorm.mp4');
    const ln = spawnSync(
      'ffmpeg',
      [
        '-y', '-i', outputPath,
        '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11',
        '-c:v', 'copy', '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-ac', '2',
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

  const manifest = {
    clipCount: totalClipCount,
    placeholderClipCount: totalPlaceholderClips,
    placeholderPct,
    videoSec: videoDurationSec,
    audioSec: audioDurationSec,
    audioTrimmedSec: Math.round(audioTrimmedSec * 100) / 100,
    introHoldSec,
    outroHoldSec,
    tpadSec: Math.round(tpadSec * 100) / 100,
    muxDurationSec,
    perSegment,
    cutIntervalSec: options.cutIntervalSec ?? assetCutIntervalSec(project),
    hardCuts: hardCutsEnabled(),
  };
  const manifestPath = join(workDir, 'render-manifest.json');
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(
    `  [ffmpeg] manifest: ${totalClipCount} clips (${totalPlaceholderClips} placeholders, ${placeholderPct}%), `
    + `video ${videoDurationSec.toFixed(1)}s, tpad ${tpadSec.toFixed(1)}s`,
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
