/**
 * Offload ffmpeg assembly to Modal GPU — TTS stays local (edge-tts unchanged).
 */
import { existsSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { generateNarration } from '../../server-render/narration.mjs';
import { parseVttWordTimestamps } from '../../server-render/subtitleParser.mjs';
import { concatenateAudio } from '../../deploy/server-render/audio.mjs';
import { buildEditTimeline } from './build-edit-timeline.mjs';

const MODAL_CLI = process.env.MODAL_CLI
  || '/workspace/repos/nickaisbitt/audra-voice-api/tts-service/.venv-modal/bin/modal';

export function shouldUseModalRender() {
  if (process.env.AUTOTUBE_MODAL_RENDER === '0') return false;
  if (process.env.MODAL_RENDER_URL?.trim()) return true;
  if (process.env.AUTOTUBE_MODAL_RENDER === '1') return true;
  return existsSync(join(homedir(), '.modal.toml'));
}

function modalCliAvailable() {
  return existsSync(MODAL_CLI);
}

async function fetchAssetToBundle(asset, devServer, assetsDir) {
  const ext = asset.type === 'video' || /\.(mp4|webm|mov)/i.test(asset.url || '')
    ? '.mp4'
    : '.jpg';
  const id = (asset.id || createHash('sha1').update(asset.url || '').digest('hex')).replace(/[^\w-]/g, '').slice(0, 24);
  const fileName = `${id}${ext}`;
  const dest = join(assetsDir, fileName);
  if (existsSync(dest) && statSync(dest).size > 500) {
    return fileName;
  }

  const raw = asset.url || asset.sourceUrl || '';
  const candidates = [];
  if (raw.startsWith('http')) {
    if (asset.type === 'video' || /\.(mp4|webm|mov)/i.test(raw)) {
      candidates.push(`${devServer}/api/download-clip?url=${encodeURIComponent(raw)}`);
    }
    candidates.push(`${devServer}/api/proxy-image?url=${encodeURIComponent(raw)}`);
    candidates.push(raw);
  } else if (raw.startsWith('/api/')) {
    candidates.push(`${devServer}${raw}`);
  }

  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(120_000),
        headers: { 'user-agent': 'Mozilla/5.0 AutoTube/1.0' },
      });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 500) continue;
      writeFileSync(dest, buf);
      return fileName;
    } catch {
      /* try next */
    }
  }
  return null;
}

async function runLocalNarrationPhase(project, bundleDir, renderEnv) {
  const audioDir = join(bundleDir, 'narration');
  mkdirSync(audioDir, { recursive: true });

  for (const [k, v] of Object.entries(renderEnv)) {
    if (typeof v === 'string' && k.startsWith('AUTOTUBE_')) process.env[k] = v;
  }

  const edgeVoice = project.exportSettings?.edgeTtsVoice || 'en-US-GuyNeural';
  const audioFiles = await generateNarration(project.script, audioDir, {
    cfAccountId: process.env.CF_ACCOUNT_ID || '',
    cfApiToken: process.env.CF_API_TOKEN || '',
    edgeVoice,
  });

  const wordTimestamps = {};
  let narrationIdx = 0;
  for (const af of audioFiles) {
    if (af.subtitleFile && existsSync(af.subtitleFile)) {
      const words = parseVttWordTimestamps(af.subtitleFile);
      if (words.length) {
        wordTimestamps[String(narrationIdx)] = words;
        narrationIdx += 1;
      }
    }
  }

  const mixedAudio = join(bundleDir, 'narration-mix.m4a');
  const mixedOk = await concatenateAudio(audioFiles, mixedAudio);
  if (!mixedOk) {
    throw new Error('Modal pre-render: failed to concatenate narration audio');
  }

  const cutInterval = parseFloat(renderEnv.AUTOTUBE_CUT_INTERVAL_SEC || '1.25');
  project.editTimeline = buildEditTimeline(project, {
    cutIntervalSec: cutInterval,
    reason: 'local pre-modal tts',
    preferVideo: renderEnv.AUTOTUBE_HARVEST_VIDEO_FIRST !== '0',
    minVideosFirst: renderEnv.AUTOTUBE_RENDER_QUALITY === 'high' ? 3 : 2,
  });

  return { mixedAudio, wordTimestamps, audioFiles };
}

function createTarball(bundleDir, tarPath) {
  const r = spawnSync('tar', ['-czf', tarPath, '-C', bundleDir, '.'], { encoding: 'utf8', timeout: 300_000 });
  return r.status === 0 && existsSync(tarPath);
}

async function invokeModalHttp(tarPath, outPath) {
  const url = `${process.env.MODAL_RENDER_URL.replace(/\/$/, '')}/render`;
  const body = readFileSync(tarPath);
  const t0 = Date.now();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/gzip' },
    body,
    signal: AbortSignal.timeout(1_800_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { ok: false, error: `Modal HTTP ${res.status}: ${text.slice(0, 400)}` };
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 500_000) {
    return { ok: false, error: `Modal response too small (${buf.length} bytes)` };
  }
  writeFileSync(outPath, buf);
  return { ok: true, elapsedMs: Date.now() - t0, bytes: buf.length };
}

function invokeModalCli(tarPath, outPath) {
  const t0 = Date.now();
  const r = spawnSync(
    MODAL_CLI,
    ['run', 'deploy/modal_render.py::render_bundle', '--bundle-path', tarPath, '--out-path', outPath],
    { encoding: 'utf8', timeout: 1_800_000, cwd: join(dirname(fileURLToPath(import.meta.url)), '../..') },
  );
  if (r.status !== 0) {
    return { ok: false, error: (r.stderr || r.stdout || 'modal run failed').slice(-800) };
  }
  if (!existsSync(outPath)) {
    return { ok: false, error: 'modal run produced no output mp4' };
  }
  return { ok: true, elapsedMs: Date.now() - t0, bytes: statSync(outPath).size };
}

/**
 * Local edge-tts → bundle assets → Modal ffmpeg/NVENC → final MP4
 */
export async function renderViaModal({ project, mp4Out, renderEnv, devServer, outDir, log = console.log }) {
  const bundleDir = join(outDir, 'modal-bundle');
  const assetsDir = join(bundleDir, 'assets');
  mkdirSync(assetsDir, { recursive: true });

  log('🎙 Local narration (edge-tts — unchanged)...');
  const narration = await runLocalNarrationPhase(project, bundleDir, renderEnv);

  // Only bundle assets that appear in the editTimeline — avoids 100+ MB tarballs
  // from downloading every harvested clip. The editTimeline was built in
  // runLocalNarrationPhase; Modal rebuilds it from project.media which contains only
  // the assets fetched here (non-bundled assets are stripped before saving project.json).
  const timelineAssetIds = new Set((project.editTimeline || []).map((e) => e.assetId));
  const timelineAssets = (project.media || []).filter((a) => timelineAssetIds.has(a.id));
  log(`📦 Prefetching B-roll for Modal (${timelineAssets.length} timeline assets of ${project.media?.length ?? 0} total)...`);
  let fetched = 0;
  const bundledAssetIds = new Set();
  for (const asset of timelineAssets) {
    const bundleFile = await fetchAssetToBundle(asset, devServer, assetsDir);
    if (bundleFile) {
      asset._bundleFile = bundleFile;
      fetched += 1;
      bundledAssetIds.add(asset.id);
    }
  }
  log(`   … ${fetched}/${timelineAssets.length} timeline assets cached for Modal`);

  const modalRenderEnv = {
    AUTOTUBE_FORCE_CPU: '0',
    AUTOTUBE_RENDER_MODE: 'ffmpeg',
  };
  for (const [k, v] of Object.entries(renderEnv)) {
    if (k.startsWith('AUTOTUBE_') && v != null && v !== '') modalRenderEnv[k] = String(v);
  }

  // Trim project.media to only assets that were successfully bundled.
  // This ensures the Modal-side timeline rebuild only references locally cached files
  // and avoids placeholder clips from unreachable relative-URL assets.
  const projectForBundle = {
    ...project,
    media: (project.media || []).filter((a) => bundledAssetIds.has(a.id)),
  };
  writeFileSync(join(bundleDir, 'project.json'), JSON.stringify(projectForBundle, null, 2));
  writeFileSync(join(bundleDir, 'render-env.json'), JSON.stringify(modalRenderEnv, null, 2));
  writeFileSync(join(bundleDir, 'word-timestamps.json'), JSON.stringify(narration.wordTimestamps, null, 2));
  if (existsSync(narration.mixedAudio)) {
    const dest = join(bundleDir, narration.mixedAudio.endsWith('.m4a') ? 'narration-mix.m4a' : 'narration-mix.wav');
    copyFileSync(narration.mixedAudio, dest);
  }

  const tarPath = join(outDir, 'modal-bundle.tar.gz');
  if (!createTarball(bundleDir, tarPath)) {
    return { ok: false, error: 'failed to create modal bundle tarball' };
  }

  const finalOut = mp4Out.replace('.mp4', '-final.mp4');
  log(`☁️ Modal render (${process.env.MODAL_RENDER_URL ? 'HTTP' : 'modal run'})...`);

  let result;
  if (process.env.MODAL_RENDER_URL?.trim()) {
    result = await invokeModalHttp(tarPath, finalOut);
    if (!result.ok && modalCliAvailable()) {
      log(`   ⚠ Modal HTTP failed (${result.error?.slice(0, 80)}) — retry via modal run...`);
      result = invokeModalCli(tarPath, finalOut);
    }
  } else if (modalCliAvailable()) {
    result = invokeModalCli(tarPath, finalOut);
  } else {
    return { ok: false, error: 'Modal not configured — set MODAL_RENDER_URL or install modal CLI' };
  }

  if (!result.ok) return result;
  log(`   ✓ Modal render ${(result.bytes / 1024 / 1024).toFixed(1)} MB in ${(result.elapsedMs / 1000).toFixed(0)}s`);
  if (existsSync(mp4Out)) copyFileSync(finalOut, mp4Out);
  return { ok: true, videoPath: finalOut, modal: true, ...result };
}
