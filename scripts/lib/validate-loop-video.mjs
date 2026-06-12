/**
 * Assert loop render output is complete before scoring.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, statSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { diversityProxyGate } from './assembly-system.mjs';

/** Loop shorts target ~60s; ultrafast mux can land 54–55s — use env or 50s floor. */
export const MIN_DURATION_SEC = Number(process.env.MIN_DURATION_SEC) || 50;
// Draft-quality 720p ultrafast renders can legitimately be 4–5 MB for 60 s;
// 3 MB is a safe floor that still catches empty/corrupt/truncated files.
export const MIN_BYTES = 3 * 1024 * 1024;
/** Fail generate/ship when manifest placeholder share exceeds this (corrupt/thin B-roll). */
export const MAX_SHIP_PLACEHOLDER_PCT = 30;

export function minClipCountForDuration(durationSec) {
  return Math.max(1, Math.floor((durationSec || 0) / 5));
}

/**
 * @param {string} videoPath
 * @param {number} [durationSec]
 * @returns {{ valid: boolean, error?: string, manifest?: object, clipCount?: number, minClips?: number, placeholderPct?: number }}
 */
export function validateRenderManifest(videoPath, durationSec = 0) {
  const manifestPath = join(dirname(videoPath), 'ffmpeg-assembly', 'render-manifest.json');
  if (!existsSync(manifestPath)) {
    return { valid: false, error: 'render-manifest.json missing (cannot verify clip/placeholder quality before ship)' };
  }
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const dur = durationSec || manifest.muxDurationSec || manifest.videoSec || 0;
    const minClips = minClipCountForDuration(dur);
    const clipCount = manifest.clipCount || 0;
    const placeholderPct = manifest.placeholderPct ?? 0;

    if (placeholderPct > MAX_SHIP_PLACEHOLDER_PCT) {
      return {
        valid: false,
        error: `render is ${placeholderPct}% placeholders (max ${MAX_SHIP_PLACEHOLDER_PCT}% before ship)`,
        manifest,
        clipCount,
        minClips,
        placeholderPct,
      };
    }
    if (clipCount < minClips) {
      return {
        valid: false,
        error: `render has ${clipCount} clips (min ${minClips} for ${dur.toFixed(0)}s)`,
        manifest,
        clipCount,
        minClips,
        placeholderPct,
      };
    }
    // Diversity gate: only applies when the manifest includes diversity fields
    // (written by ffmpegAssembly; absent for Modal-only or older renders).
    if (manifest.uniqueUrlsUsed !== undefined) {
      const gate = diversityProxyGate(manifest);
      if (!gate.pass) {
        const spacingOnlyModalProxy =
          manifest.modalProxy === true
          && /^(\d+ )?URL spacing violation/.test(gate.reason || '');
        if (!spacingOnlyModalProxy) {
          return {
            valid: false,
            error: `diversity gate: ${gate.reason}`,
            manifest,
            clipCount,
            minClips,
            placeholderPct,
          };
        }
      }
    }
    return { valid: true, manifest, clipCount, minClips, placeholderPct };
  } catch (err) {
    return { valid: false, error: `render-manifest parse failed: ${err.message}` };
  }
}

/**
 * @param {string} videoPath
 * @returns {{ valid: boolean, durationSec?: number, sizeMb?: string, error?: string }}
 */
export function validateLoopVideo(videoPath) {
  if (!videoPath || !existsSync(videoPath)) {
    return { valid: false, error: 'video path missing or not found' };
  }

  const size = statSync(videoPath).size;
  if (size < MIN_BYTES) {
    return { valid: false, error: `file too small (${(size / 1024 / 1024).toFixed(2)} MB < ${(MIN_BYTES / 1024 / 1024).toFixed(0)} MB)` };
  }

  const probe = spawnSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', videoPath],
    { encoding: 'utf8', timeout: 30_000 },
  );
  const durationSec = probe.stdout ? parseFloat(probe.stdout.trim()) : NaN;
  if (!Number.isFinite(durationSec) || durationSec < MIN_DURATION_SEC) {
    return {
      valid: false,
      error: `duration ${durationSec || 0}s < ${MIN_DURATION_SEC}s (truncated/corrupt render?)`,
    };
  }

  const manifestPath = join(dirname(videoPath), 'ffmpeg-assembly', 'render-manifest.json');
  if (existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      if ((manifest.tpadSec ?? 0) > 12) {
        return {
          valid: false,
          error: `render used ${manifest.tpadSec}s video freeze-pad (excessive)`,
        };
      }
      if ((manifest.tpadSec ?? 0) > 2 && (manifest.audioTrimmedSec ?? 0) > 0.5) {
        return {
          valid: false,
          error: `render used ${manifest.tpadSec}s tpad while trimming ${manifest.audioTrimmedSec}s audio (A/V sync bug)`,
        };
      }
      const avDelta = Math.abs((manifest.videoSec ?? durationSec) - (manifest.muxDurationSec ?? durationSec));
      if (avDelta > 1) {
        return {
          valid: false,
          error: `A/V duration mismatch: video ${manifest.videoSec}s vs mux ${manifest.muxDurationSec}s`,
        };
      }
      const manifestGate = validateRenderManifest(videoPath, durationSec);
      if (!manifestGate.valid) {
        return { valid: false, error: manifestGate.error };
      }
    } catch {
      /* manifest optional */
    }
  }

  return {
    valid: true,
    durationSec,
    sizeMb: (size / 1024 / 1024).toFixed(2),
  };
}
