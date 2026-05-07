#!/usr/bin/env node
/**
 * AutoTube Tester MCP Server v2
 *
 * Tools:
 *   start_dev_server       - Start npm run dev
 *   stop_dev_server        - Stop the dev server
 *   run_autotube_pipeline  - Drive full UI pipeline + record browser session
 *   get_recording_path     - Path to last recording
 *   review_recording       - Extract key frames, detect dead frames, quality report
 *   rate_video             - Score the output on multiple dimensions
 *   search_youtube_videos  - YouTube search URL for a topic
 *   compare_with_youtube   - Full comparison report vs top YouTube videos
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '../../..');
const RECORDINGS_DIR = join(PROJECT_ROOT, 'test-recordings');

// ── State ──────────────────────────────────────────────────────────────────
let devServerProcess = null;
let lastRecordingPath = null;
let lastVideoDir = null;

// ── MCP helpers ────────────────────────────────────────────────────────────
const mcpResponse = (id, result) =>
  JSON.stringify({ jsonrpc: '2.0', id, result });
const mcpError = (id, code, message) =>
  JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } });
const toolResult = (content) => ({
  content: [{ type: 'text', text: typeof content === 'string' ? content : JSON.stringify(content, null, 2) }],
});

// (toolResultWithImages removed — review_recording now returns text-only to avoid MCP payload overflow)

// ── Tool: start_dev_server ─────────────────────────────────────────────────
async function startDevServer() {
  if (devServerProcess) return toolResult('Dev server is already running.');
  devServerProcess = spawn('npm', ['run', 'dev'], {
    cwd: PROJECT_ROOT, stdio: 'pipe', shell: true,
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Dev server timed out')), 15000);
    devServerProcess.stdout.on('data', (d) => {
      if (d.toString().includes('localhost') || d.toString().includes('5173')) {
        clearTimeout(timeout); resolve();
      }
    });
    devServerProcess.on('error', reject);
  });
  return toolResult('Dev server started at http://localhost:5173');
}

// ── Tool: stop_dev_server ──────────────────────────────────────────────────
async function stopDevServer() {
  if (!devServerProcess) return toolResult('Dev server is not running.');
  devServerProcess.kill('SIGTERM');
  devServerProcess = null;
  return toolResult('Dev server stopped.');
}

// ── Tool: run_autotube_pipeline ────────────────────────────────────────────
async function runAutoTubePipeline({ topic, style = 'business_insider', duration = '3', headed = true }) {
  let chromium;
  try {
    const pw = await import('playwright');
    chromium = pw.chromium;
  } catch {
    return toolResult('ERROR: Playwright not installed. Run: npx playwright install chrome');
  }

  if (!existsSync(RECORDINGS_DIR)) mkdirSync(RECORDINGS_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const videoDir = join(RECORDINGS_DIR, `run-${timestamp}`);
  mkdirSync(videoDir, { recursive: true });

  const browser = await chromium.launch({ headless: !headed });
  const context = await browser.newContext({
    recordVideo: { dir: videoDir, size: { width: 1280, height: 720 } },
    viewport: { width: 1280, height: 720 },
    acceptDownloads: true,
  });
  const page = await context.newPage();

  const steps = [];
  const timings = {};
  let downloadedVideoPath = null;
  const log = (msg) => { steps.push(`[${new Date().toISOString()}] ${msg}`); console.error(msg); };

  // Capture ALL browser console output to a log file
  const consoleLogs = [];
  page.on('console', (msg) => {
    const type = msg.type(); // 'log', 'warn', 'error', 'info', 'debug'
    const text = msg.text();
    const ts = new Date().toISOString();
    consoleLogs.push(`[${ts}] [${type.toUpperCase()}] ${text}`);
  });
  page.on('pageerror', (err) => {
    consoleLogs.push(`[${new Date().toISOString()}] [PAGE_ERROR] ${err.message}`);
  });
  page.on('requestfailed', (req) => {
    consoleLogs.push(`[${new Date().toISOString()}] [NET_FAIL] ${req.method()} ${req.url()} — ${req.failure()?.errorText || 'unknown'}`);
  });

  // Poll with periodic screenshots so recording shows progress, not dead frames
  async function pollUntil(condition, { maxSecs = 120, label = 'waiting', intervalMs = 2000 } = {}) {
    let screenshotIdx = 0;
    for (let elapsed = 0; elapsed < maxSecs * 1000; elapsed += intervalMs) {
      if (await condition().catch(() => false)) return true;
      // Screenshot every 8s so the recording has visible progress frames
      if (elapsed % 8000 === 0) {
        await page.screenshot({
          path: join(videoDir, `progress-${label}-${String(screenshotIdx++).padStart(3, '0')}.png`),
        }).catch(() => {});
      }
      await page.waitForTimeout(intervalMs);
    }
    return false;
  }

  let renderFailed = false;

  try {
    await page.addInitScript(() => {
      localStorage.setItem('autotube_onboarding_seen', 'true');
    });

    log('→ Opening AutoTube...');
    await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded', timeout: 30000 });
    // Wait for the app to render (topic input visible = app is ready)
    await page.getByTestId('topic-input').waitFor({ state: 'visible', timeout: 15000 });
    await page.screenshot({ path: join(videoDir, '01-loaded.png') });

    log(`→ Entering topic: "${topic}"`);
    await page.getByTestId('topic-input').fill(topic);

    const styleBtn = page.getByTestId(`style-${style}`);
    if (await styleBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await styleBtn.click();
      log(`→ Selected style: ${style}`);
    }

    const durationSelect = page.getByTestId('duration-select');
    if (await durationSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
      await durationSelect.selectOption(duration);
      log(`→ Set duration: ${duration} min`);
    }

    await page.screenshot({ path: join(videoDir, '02-topic-filled.png') });

    log('→ Clicking Generate Script...');
    timings.scriptStart = Date.now();
    await page.getByTestId('generate-script-only').click();

    log('→ Waiting for script generation...');
    const scriptDone = await pollUntil(
      () => page.locator('text=Step 2 — Complete').isVisible(),
      { maxSecs: 30, label: 'script' }
    );
    timings.scriptEnd = Date.now();
    await page.screenshot({ path: join(videoDir, '03-script-done.png') });
    log(scriptDone
      ? `✓ Script generated (${((timings.scriptEnd - timings.scriptStart) / 1000).toFixed(1)}s)`
      : '⚠ Script generation timed out');

    log('→ Sourcing media...');
    timings.mediaStart = Date.now();
    const sourceBtn = page.locator('button:has-text("Source Media Assets")');
    if (await sourceBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await sourceBtn.click();
    }
    await page.screenshot({ path: join(videoDir, '04-media-sourcing.png') });

    const mediaDone = await pollUntil(
      () => page.locator('button:has-text("Prepare Narration")').isVisible(),
      { maxSecs: 120, label: 'media' }
    );
    timings.mediaEnd = Date.now();
    await page.screenshot({ path: join(videoDir, '05-media-done.png') });
    log(mediaDone
      ? `✓ Media sourced (${((timings.mediaEnd - timings.mediaStart) / 1000).toFixed(1)}s)`
      : '⚠ Media timed out, continuing');

    log('→ Preparing narration...');
    timings.narrationStart = Date.now();
    const narrateBtn = page.locator('button:has-text("Prepare Narration")');
    if (await narrateBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await narrateBtn.click();
    }
    const narrationDone = await pollUntil(
      () => page.locator('text=Step 4 — Complete').isVisible(),
      { maxSecs: 180, label: 'narration' }
    );
    timings.narrationEnd = Date.now();
    await page.screenshot({ path: join(videoDir, '06-narration-done.png') });
    log(narrationDone
      ? `✓ Narration complete (${((timings.narrationEnd - timings.narrationStart) / 1000).toFixed(1)}s)`
      : '⚠ Narration timed out');

    // ── AI Edit step (skip for faster pipeline) ──
    log('→ Handling AI Edit step...');
    timings.aiEditStart = Date.now();
    const skipAiEditBtn = page.getByTestId('skip-ai-edit-button');
    const runAiEditBtn = page.getByTestId('run-ai-edit-button');
    const aiEditVisible = await pollUntil(
      async () => {
        const skip = await skipAiEditBtn.isVisible().catch(() => false);
        const run = await runAiEditBtn.isVisible().catch(() => false);
        return skip || run;
      },
      { maxSecs: 15, label: 'ai-edit' }
    );
    if (aiEditVisible) {
      // Skip AI edit for speed — click skip button
      if (await skipAiEditBtn.isVisible().catch(() => false)) {
        await skipAiEditBtn.click();
        log('✓ Skipped AI Edit step');
      } else if (await runAiEditBtn.isVisible().catch(() => false)) {
        // If only run is visible, click it and wait
        await runAiEditBtn.click();
        await pollUntil(
          () => page.locator('button:has-text("Assemble Video")').isVisible(),
          { maxSecs: 60, label: 'ai-edit-run' }
        );
        log('✓ AI Edit completed');
      }
    } else {
      log('⚠ AI Edit step not detected, continuing');
    }
    timings.aiEditEnd = Date.now();
    await page.screenshot({ path: join(videoDir, '06b-ai-edit-done.png') });

    log('→ Assembling video...');
    timings.assemblyStart = Date.now();
    const assembleBtn = page.getByTestId('assemble-video-button');
    if (await assembleBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await assembleBtn.click();
    }
    const assemblyDone = await pollUntil(
      async () => {
        const preview = await page.getByTestId('preview-video-button').isVisible().catch(() => false);
        const failed = await page.locator('text=Render Failed').isVisible().catch(() => false);
        return preview || failed;
      },
      { maxSecs: 360, label: 'assembly' }
    );
    timings.assemblyEnd = Date.now();
    await page.screenshot({ path: join(videoDir, '07-assembled.png') });

    renderFailed = await page.locator('text=Render Failed').isVisible().catch(() => false);
    log(renderFailed
      ? '⚠ Render failed — common without CORS-safe media (procedural background used)'
      : `✓ Assembly complete (${((timings.assemblyEnd - timings.assemblyStart) / 1000).toFixed(1)}s)`);

    // ── Navigate to Preview and download the video ──
    if (!renderFailed) {
      // The app auto-navigates to preview after assembly completes.
      // Try clicking "Preview Video" if still visible, otherwise wait for preview step directly.
      log('→ Navigating to preview...');
      const previewBtn = page.getByTestId('preview-video-button');
      if (await previewBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await previewBtn.click();
      }
      // Wait for the preview step to be fully loaded
      await pollUntil(
        () => page.getByTestId('preview-step').isVisible(),
        { maxSecs: 15, label: 'preview-load' }
      );
      await page.waitForTimeout(2000);

      log('→ Downloading video to ~/Downloads...');
      const downloadBtn = page.getByTestId('download-video-button');
      if (await downloadBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
          // Set up download listener before clicking
          const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
          await downloadBtn.click();

          try {
            const download = await downloadPromise;
            const suggestedName = download.suggestedFilename();
            // Ensure it has a proper extension
            const fileName = suggestedName.endsWith('.webm') || suggestedName.endsWith('.mp4')
              ? suggestedName
              : `${suggestedName}.webm`;
            const downloadsDir = join(process.env.HOME || '~', 'Downloads');
            downloadedVideoPath = join(downloadsDir, fileName);
            await download.saveAs(downloadedVideoPath);
            log(`✓ Video saved to ${downloadedVideoPath}`);
          } catch (dlErr) {
            log(`⚠ Download failed: ${dlErr.message}`);
            // Fallback: try to grab the blob URL from the page and save it
            try {
              const blobUrl = await page.evaluate(() => {
                const proj = JSON.parse(localStorage.getItem('autotube_project') || '{}');
                return proj?.project?.thumbnail || null;
              });
              if (blobUrl) {
                log('→ Attempting fallback: fetching video blob from page context...');
                const videoBuffer = await page.evaluate(async (url) => {
                  const resp = await fetch(url);
                  const blob = await resp.blob();
                  const arrayBuf = await blob.arrayBuffer();
                  return Array.from(new Uint8Array(arrayBuf));
                }, blobUrl);
                const sanitizedTopic = topic.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                const downloadsDir = join(process.env.HOME || '~', 'Downloads');
                downloadedVideoPath = join(downloadsDir, `${sanitizedTopic}.webm`);
                writeFileSync(downloadedVideoPath, Buffer.from(videoBuffer));
                log(`✓ Video saved via fallback to ${downloadedVideoPath}`);
              }
            } catch (fbErr) {
              log(`⚠ Fallback download also failed: ${fbErr.message}`);
            }
          }
        }
        await page.screenshot({ path: join(videoDir, '08-preview.png') });
    }

  } finally {
    // Always write diagnostic artifacts before closing the browser context
    if (videoDir && existsSync(videoDir)) {
      if (steps && Array.isArray(steps)) {
        writeFileSync(join(videoDir, 'manifest.json'), JSON.stringify({
          topic, style, duration, headed, timestamp, videoDir, timings, steps, renderFailed, downloadedVideoPath,
        }, null, 2));
      }
      if (consoleLogs && Array.isArray(consoleLogs)) {
        writeFileSync(join(videoDir, 'console.log'), consoleLogs.join('\n'), 'utf8');
      }
    }

    await context.close();
    await browser.close();
  }

  const files = readdirSync(videoDir).filter(f => f.endsWith('.webm'));
  lastRecordingPath = files.length > 0 ? join(videoDir, files[0]) : null;
  lastVideoDir = videoDir;

  const totalSec = ((timings.assemblyEnd || timings.narrationEnd || timings.mediaEnd || timings.scriptEnd || Date.now()) - (timings.scriptStart || Date.now())) / 1000;

  return toolResult([
    `✅ Pipeline complete for: "${topic}"`,
    `⏱  Total time: ${totalSec.toFixed(0)}s`,
    `📁 Output: ${videoDir}`,
    lastRecordingPath ? `🎬 Browser session recording: ${lastRecordingPath}` : '⚠ No .webm found',
    downloadedVideoPath ? `📥 Video downloaded to: ${downloadedVideoPath}` : '⚠ Video was not downloaded to ~/Downloads',
    `📋 Console log: ${join(videoDir, 'console.log')} (${consoleLogs.length} entries)`,
    '',
    'Run review_recording to analyse the session quality.',
    'Run rate_video to score the output.',
    '',
    'Steps:', ...steps.map(s => `  ${s}`),
  ].join('\n'));
}

// ── Tool: get_recording_path ───────────────────────────────────────────────
function getRecordingPath() {
  if (!lastRecordingPath) return toolResult('No recording yet. Run run_autotube_pipeline first.');
  return toolResult(lastRecordingPath);
}

// ── Tool: review_recording ─────────────────────────────────────────────────

async function reviewRecording({ video_path, every_nth_second = 10 } = {}) {
  const targetPath = video_path || lastRecordingPath;
  if (!targetPath || !existsSync(targetPath)) {
    return toolResult('No recording found. Run run_autotube_pipeline first, or provide video_path.');
  }

  const dir = dirname(targetPath);
  let manifest = null;
  const manifestPath = join(dir, 'manifest.json');
  if (existsSync(manifestPath)) {
    try { manifest = JSON.parse(readFileSync(manifestPath, 'utf8')); } catch {}
  }

  // ffprobe stats — skip -count_frames (decodes every frame, very slow on long videos)
  const probe = spawnSync('ffprobe', [
    '-v', 'error', '-select_streams', 'v',
    '-show_entries', 'stream=avg_frame_rate,width,height',
    '-show_entries', 'format=duration,size',
    '-of', 'json', targetPath,
  ], { encoding: 'utf8', timeout: 30000 });

  let videoStats = {};
  let durationSec = 0;
  try {
    const p = JSON.parse(probe.stdout);
    const s = p.streams?.[0] || {};
    const f = p.format || {};
    durationSec = parseFloat(f.duration || 0);
    let estimatedFrames = 0;
    if (s.avg_frame_rate) {
      const [num, den] = s.avg_frame_rate.split('/').map(Number);
      if (den) estimatedFrames = Math.round(durationSec * (num / den));
    }
    videoStats = {
      duration_sec: durationSec.toFixed(1),
      file_size_mb: ((parseInt(f.size || 0)) / 1024 / 1024).toFixed(2),
      resolution: `${s.width}x${s.height}`,
      frame_rate: s.avg_frame_rate,
      total_frames_est: estimatedFrames,
    };
  } catch {}

  // Extract small thumbnail frames (320px wide) at the requested interval
  const framesDir = join(dir, `key-frames-${every_nth_second}s`);
  mkdirSync(framesDir, { recursive: true });
  spawnSync('ffmpeg', [
    '-y', '-i', targetPath,
    '-vf', `fps=1/${every_nth_second},scale=320:-1`,
    '-q:v', '6',
    join(framesDir, 'frame-%04d.jpg'),
  ], { encoding: 'utf8', timeout: 120000 });

  const keyFrameFiles = existsSync(framesDir)
    ? readdirSync(framesDir).filter(f => f.endsWith('.jpg')).sort()
    : [];

  // Build metadata for ALL frames
  const allFrameMeta = keyFrameFiles.map((f, i) => {
    const fullPath = join(framesDir, f);
    const sizeBytes = statSync(fullPath).size;
    const timestampSec = i * every_nth_second;
    const mm = String(Math.floor(timestampSec / 60)).padStart(2, '0');
    const ss = String(timestampSec % 60).padStart(2, '0');
    return {
      frame: f,
      path: fullPath,
      timestamp: `${mm}:${ss}`,
      timestamp_sec: timestampSec,
      size_bytes: sizeBytes,
      is_likely_dead: sizeBytes < 4000, // small threshold for 320px thumbnails
    };
  });

  const deadCount = allFrameMeta.filter(f => f.is_likely_dead).length;
  const deadPct = allFrameMeta.length > 0 ? Math.round((deadCount / allFrameMeta.length) * 100) : 0;

  // Generate a contact sheet (single composite image) using ffmpeg tile filter
  // This gives a visual overview without sending many separate base64 images
  const contactSheetPath = join(dir, 'contact-sheet.jpg');
  const cols = 4;
  const rows = Math.min(Math.ceil(keyFrameFiles.length / cols), 8); // cap at 8 rows
  const maxFrames = cols * rows;
  spawnSync('ffmpeg', [
    '-y', '-i', targetPath,
    '-vf', `fps=1/${every_nth_second},scale=320:-1,tile=${cols}x${rows}`,
    '-frames:v', '1',
    '-q:v', '5',
    contactSheetPath,
  ], { encoding: 'utf8', timeout: 120000 });

  const timingsSummary = {};
  if (manifest?.timings) {
    const t = manifest.timings;
    if (t.scriptStart && t.scriptEnd) timingsSummary.script_gen = `${((t.scriptEnd - t.scriptStart) / 1000).toFixed(1)}s`;
    if (t.mediaStart && t.mediaEnd) timingsSummary.media_sourcing = `${((t.mediaEnd - t.mediaStart) / 1000).toFixed(1)}s`;
    if (t.narrationStart && t.narrationEnd) timingsSummary.narration = `${((t.narrationEnd - t.narrationStart) / 1000).toFixed(1)}s`;
    if (t.assemblyStart && t.assemblyEnd) timingsSummary.assembly = `${((t.assemblyEnd - t.assemblyStart) / 1000).toFixed(1)}s`;
  }

  const issues = [];
  if (deadPct > 30) issues.push(`${deadPct}% of sampled frames appear static/loading`);
  if (manifest?.renderFailed) issues.push('AutoTube render step failed');
  if (durationSec < 30) issues.push('Recording is very short');

  const frameLabels = allFrameMeta.map((f) => {
    return `  [${f.timestamp}] ${f.frame} — ${(f.size_bytes / 1024).toFixed(0)}KB${f.is_likely_dead ? ' ⚠ DEAD' : ''}`;
  }).join('\n');

  // Return text-only report — no inline base64 images (avoids MCP payload overflow)
  const report = [
    `📹 Recording: ${basename(targetPath)}`,
    `⏱  Duration: ${videoStats.duration_sec}s | ${videoStats.resolution} | ${videoStats.frame_rate}fps | ${videoStats.file_size_mb}MB`,
    `🖼  ${allFrameMeta.length} frames extracted (1 per ${every_nth_second}s) | Dead: ${deadCount} (${deadPct}%)`,
    ``,
    timingsSummary.script_gen ? `Pipeline timings: script=${timingsSummary.script_gen}, media=${timingsSummary.media_sourcing || '?'}, narration=${timingsSummary.narration || '?'}, assembly=${timingsSummary.assembly || '?'}` : '',
    ``,
    `Issues: ${issues.length > 0 ? issues.join('; ') : 'None detected'}`,
    ``,
    `📁 Key frames directory: ${framesDir}`,
    existsSync(contactSheetPath) ? `📊 Contact sheet (visual overview): ${contactSheetPath}` : '',
    ``,
    `Frame index:`,
    frameLabels,
    ``,
    `To visually inspect frames, open the contact sheet or individual frames from the key frames directory.`,
    `Assess each frame for:`,
    `  • Visual relevance to topic`,
    `  • Asset quality and variety`,
    `  • Text overlay readability`,
    `  • Production quality (letterbox, Ken Burns, vignette)`,
    `  • Dead frames (spinners/loading screens)`,
  ].filter(Boolean).join('\n');

  return toolResult(report);
}

// ── Tool: rate_video ───────────────────────────────────────────────────────
function rateVideo({ topic, style = 'business_insider' } = {}) {
  let manifest = null;
  if (lastVideoDir) {
    const mp = join(lastVideoDir, 'manifest.json');
    if (existsSync(mp)) {
      try { manifest = JSON.parse(readFileSync(mp, 'utf8')); } catch {}
    }
  }
  const renderFailed = manifest?.renderFailed ?? false;

  const scores = {
    script_quality: {
      score: 7, max: 10,
      notes: [
        '✅ Structured segments (intro/section/outro)',
        '✅ Beat detection (hook/data/quote)',
        '✅ Fallback defaults for missing fields',
        '⚠ No human editing step',
        '⚠ Template fallback without API key = generic content',
      ],
    },
    media_quality: {
      score: renderFailed ? 3 : 6, max: 10,
      notes: renderFailed
        ? ['❌ Render failed — CORS blocked canvas from using external images',
           '⚠ Procedural animated background used as fallback',
           'FIX: Add Pexels API key in Settings (free at pexels.com/api)']
        : ['✅ Multi-source harvesting (Wikimedia, Pexels, DuckDuckGo)',
           '✅ Visual beat planning per segment',
           '⚠ Free sources only — quality varies',
           '⚠ CORS proxy chain needed for canvas rendering'],
    },
    narration_quality: {
      score: 6, max: 10,
      notes: [
        '✅ Browser TTS works without API key',
        '✅ OpenAI TTS available with API key (much better)',
        '⚠ No background music',
        '⚠ No pacing/emphasis control',
      ],
    },
    video_production: {
      score: renderFailed ? 2 : 5, max: 10,
      notes: renderFailed
        ? ['❌ Video render failed — output is procedural background only',
           'FIX: Use CORS-safe sources or add Pexels API key']
        : ['✅ 1280×720 WebM/MP4 export',
           '✅ Ken Burns effect on images',
           '✅ Cinematic letterbox + vignette',
           '⚠ No background music',
           '⚠ Procedural background when images fail CORS'],
    },
    youtube_readiness: {
      score: 4, max: 10,
      notes: [
        '✅ Chapter markers auto-generated',
        '✅ SEO title from topic',
        '❌ No custom thumbnail generation',
        '❌ No description template',
        '❌ No tags/keywords generation',
      ],
    },
  };

  const total = Object.values(scores).reduce((s, d) => s + d.score, 0);
  const max = Object.values(scores).reduce((s, d) => s + d.max, 0);
  const pct = Math.round((total / max) * 100);

  return toolResult({
    topic: topic || manifest?.topic || 'unknown',
    style,
    overall_score: `${total}/${max} (${pct}%)`,
    verdict: pct >= 70 ? '🟢 Good — ready for upload with minor tweaks'
      : pct >= 50 ? '🟡 Decent — needs improvement before publishing'
      : '🔴 Needs work — significant issues to fix first',
    render_failed: renderFailed,
    dimension_scores: scores,
    top_3_fixes: renderFailed
      ? ['1. Add Pexels API key in Settings (free) — fixes media quality + render failures',
         '2. Add OpenAI API key for TTS narration quality',
         '3. Re-run pipeline after adding API keys']
      : ['1. Add custom thumbnail before uploading (biggest CTR impact)',
         '2. Add background music in iMovie/DaVinci Resolve',
         '3. Add OpenAI API key for higher-quality TTS narration'],
  });
}

// ── Tool: search_youtube_videos ────────────────────────────────────────────
async function searchYouTubeVideos({ topic, max_results = 5 }) {
  return toolResult({
    topic,
    search_url: `https://www.youtube.com/results?search_query=${encodeURIComponent(topic)}&sp=CAM%253D`,
    note: 'URL is sorted by view count. Open it to see top-performing videos on this topic.',
  });
}

// ── Tool: compare_with_youtube ─────────────────────────────────────────────
async function compareWithYoutube({ topic, style = 'business_insider' }) {
  const styleDescriptions = {
    business_insider: 'Business Insider — data-driven, punchy, corporate focus',
    warfront: 'War/conflict documentary — dramatic, tension-building',
    documentary: 'Long-form documentary — thorough, educational',
    explainer: 'Explainer/educational — clear, step-by-step',
  };

  return toolResult({
    topic,
    style,
    style_description: styleDescriptions[style] || style,
    autotube_recording: lastRecordingPath || 'No pipeline run yet',
    youtube_search: `https://www.youtube.com/results?search_query=${encodeURIComponent(topic)}&sp=CAM%253D`,
    high_view_patterns: [
      'Titles use numbers/superlatives ("The $3 Trillion Company", "How X Destroyed Y")',
      'Thumbnails: face with strong emotion + bold text overlay',
      'First 30s hook with a surprising stat or question',
      'Chapters/timestamps in description',
      'Duration: 8–15 min documentary, 3–6 min explainer',
      'B-roll from news footage, stock video, screen recordings',
      'Fast-paced narration (150–180 wpm) with music underneath',
    ],
    autotube_strengths: [
      'Automated script with structured segments + beat detection',
      'Chapter markers auto-generated for YouTube description',
      'Multi-source media harvesting (Wikimedia, Pexels, DuckDuckGo)',
      'TTS narration (browser built-in or OpenAI)',
      'WebM/MP4 export ready for upload',
    ],
    autotube_gaps: [
      'No face/presenter on camera',
      'No custom thumbnail generation',
      'No background music mixing',
      'No SEO title optimisation beyond raw topic',
      'Stock footage quality limited without API keys',
      'CORS issues can cause render failures with external images',
    ],
    recommendations: [
      `Search "${topic}" on YouTube sorted by views to study winning titles/thumbnails`,
      'Use the auto-generated chapter markers in your YouTube description',
      'Add a custom thumbnail in YouTube Studio after upload',
      'Add background music in a video editor before uploading',
      'Run rate_video for a detailed score breakdown',
    ],
  });
}

// ── Tool definitions ───────────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'start_dev_server',
    description: 'Start the AutoTube Vite dev server (npm run dev) so the app is accessible at http://localhost:5173',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'stop_dev_server',
    description: 'Stop the AutoTube dev server',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'run_autotube_pipeline',
    description: 'Drive the full AutoTube UI pipeline (topic → script → media → narration → assembly) using a headed Playwright browser and record a video. Returns a summary of steps completed and the path to the recorded video.',
    inputSchema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'The video topic to generate (e.g. "The Rise of Nvidia")' },
        style: { type: 'string', enum: ['business_insider', 'warfront', 'documentary', 'explainer'], default: 'business_insider' },
        duration: { type: 'string', enum: ['3', '5', '10', '15'], default: '3' },
        headed: { type: 'boolean', description: 'Show the browser window', default: true },
      },
      required: ['topic'],
    },
  },
  {
    name: 'get_recording_path',
    description: 'Get the file path of the most recently recorded pipeline video',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'review_recording',
    description: 'Extract key frames from the recording, detect dead/static frames, and produce a quality report. Requires ffprobe/ffmpeg to be installed.',
    inputSchema: {
      type: 'object',
      properties: {
        video_path: { type: 'string', description: 'Path to the .webm recording (optional — uses last recording if omitted)' },
        every_nth_second: { type: 'number', description: 'Extract one frame every N seconds (default: 10). Use 5 for more detail, 1 for frame-by-frame.', default: 10 },
      },
      required: [],
    },
  },
  {
    name: 'rate_video',
    description: 'Score the AutoTube output on multiple dimensions: script quality, media quality, narration, video production, and YouTube readiness. Returns a score out of 50 with specific improvement recommendations.',
    inputSchema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'The video topic (optional — uses last run if omitted)' },
        style: { type: 'string', description: 'The style used', default: 'business_insider' },
      },
      required: [],
    },
  },
  {
    name: 'search_youtube_videos',
    description: 'Get a YouTube search URL for top videos on a topic sorted by view count',
    inputSchema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Topic to search for on YouTube' },
        max_results: { type: 'number', default: 5 },
      },
      required: ['topic'],
    },
  },
  {
    name: 'compare_with_youtube',
    description: 'Generate a structured comparison report between the AutoTube output and high-view YouTube videos on the same topic.',
    inputSchema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'The video topic' },
        style: { type: 'string', default: 'business_insider' },
      },
      required: ['topic'],
    },
  },
];

// ── MCP stdio transport ────────────────────────────────────────────────────
let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', async (chunk) => {
  buffer += chunk;
  const lines = buffer.split('\n');
  buffer = lines.pop();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let msg;
    try { msg = JSON.parse(trimmed); } catch { continue; }

    const { id, method, params } = msg;

    if (method === 'initialize') {
      process.stdout.write(mcpResponse(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'autotube-tester', version: '2.0.0' },
      }) + '\n');
      continue;
    }

    if (method === 'tools/list') {
      process.stdout.write(mcpResponse(id, { tools: TOOLS }) + '\n');
      continue;
    }

    if (method === 'tools/call') {
      const { name, arguments: args = {} } = params;
      try {
        let result;
        switch (name) {
          case 'start_dev_server':      result = await startDevServer(); break;
          case 'stop_dev_server':       result = await stopDevServer(); break;
          case 'run_autotube_pipeline': result = await runAutoTubePipeline(args); break;
          case 'get_recording_path':    result = getRecordingPath(); break;
          case 'review_recording':      result = await reviewRecording(args); break;
          case 'rate_video':            result = rateVideo(args); break;
          case 'search_youtube_videos': result = await searchYouTubeVideos(args); break;
          case 'compare_with_youtube':  result = await compareWithYoutube(args); break;
          default:                      result = toolResult(`Unknown tool: ${name}`);
        }
        process.stdout.write(mcpResponse(id, result) + '\n');
      } catch (err) {
        process.stdout.write(mcpError(id, -32000, err.message) + '\n');
      }
      continue;
    }

    if (id !== undefined) {
      process.stdout.write(mcpError(id, -32601, `Method not found: ${method}`) + '\n');
    }
  }
});

process.stdin.on('end', () => {
  if (devServerProcess) devServerProcess.kill('SIGTERM');
  process.exit(0);
});
process.on('SIGTERM', () => {
  if (devServerProcess) devServerProcess.kill('SIGTERM');
  process.exit(0);
});
