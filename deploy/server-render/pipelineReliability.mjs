/**
 * Pipeline Reliability Module
 *
 * Provides: render queue, progress streaming, memory monitoring,
 * render retry with quality degradation, ETA estimation, quality gates,
 * per-step metrics, checkpoint/resume, TTS retry, dependency fallbacks,
 * and ffmpeg error recovery.
 */

import { EventEmitter } from 'events';
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Render Job Queue (Task 123 + Task 173: Priority, Progress, Notifications) ──
class RenderJob {
  constructor(job, options = {}) {
    this.id = `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.job = job;
    this.priority = options.priority ?? 0; // higher = more urgent
    this.label = options.label ?? 'unnamed';
    this.createdAt = Date.now();
    this.startedAt = null;
    this.completedAt = null;
    this.status = 'pending'; // pending | running | completed | failed
    this.progress = 0;
    this.estimatedDurationMs = options.estimatedDurationMs ?? null;
    this.error = null;
    this.result = null;
    this.onProgress = options.onProgress ?? null;
    this.onComplete = options.onComplete ?? null;
    this.onFailure = options.onFailure ?? null;
  }

  get elapsedMs() {
    if (!this.startedAt) return 0;
    const end = this.completedAt || Date.now();
    return end - this.startedAt;
  }

  get etaMs() {
    if (!this.startedAt || this.progress <= 0) return this.estimatedDurationMs;
    const elapsed = this.elapsedMs;
    return (elapsed / this.progress) * (1 - this.progress);
  }
}

class RenderQueue {
  constructor() {
    this.jobs = [];      // pending jobs sorted by priority
    this.active = [];     // currently running (up to concurrency limit)
    this.completed = [];  // finished jobs
    this.concurrency = 1;
    this.maxHistory = 50;
    this.listeners = [];
  }

  on(event, fn) {
    this.listeners.push({ event, fn });
  }

  _emit(event, data) {
    for (const l of this.listeners) {
      if (l.event === event || l.event === '*') {
        try { l.fn(data); } catch {}
      }
    }
  }

  enqueue(jobFn, options = {}) {
    const renderJob = new RenderJob(jobFn, options);
    this.jobs.push(renderJob);
    this.jobs.sort((a, b) => b.priority - a.priority);
    this._emit('enqueued', renderJob);
    this._processNext();
    return renderJob;
  }

  updateProgress(jobId, progress) {
    const job = this.active.find(j => j.id === jobId) || this.jobs.find(j => j.id === jobId);
    if (job) {
      job.progress = Math.min(1, Math.max(0, progress));
      if (job.onProgress) job.onProgress(job.progress, job);
      this._emit('progress', { job, progress: job.progress });
    }
  }

  fail(jobId, error) {
    const job = this.active.find(j => j.id === jobId);
    if (job) {
      job.status = 'failed';
      job.error = error;
      job.completedAt = Date.now();
      this.active = this.active.filter(j => j.id !== jobId);
      this._addToHistory(job);
      if (job.onFailure) job.onFailure(error, job);
      this._emit('failed', { job, error });
      this._processNext();
    }
  }

  getStats() {
    const now = Date.now();
    return {
      pending: this.jobs.length,
      active: this.active.length,
      completed: this.completed.length,
      total: this.jobs.length + this.active.length + this.completed.length,
      jobs: [...this.active, ...this.jobs].map(j => ({
        id: j.id,
        label: j.label,
        priority: j.priority,
        status: j.status,
        progress: j.progress,
        elapsedMs: j.elapsedMs,
        etaMs: j.etaMs,
        startedAt: j.startedAt,
      })),
    };
  }

  _addToHistory(job) {
    this.completed.push(job);
    if (this.completed.length > this.maxHistory) {
      this.completed = this.completed.slice(-this.maxHistory);
    }
  }

  async _processNext() {
    if (this.active.length >= this.concurrency || this.jobs.length === 0) return;

    const job = this.jobs.shift();
    job.status = 'running';
    job.startedAt = Date.now();
    this.active.push(job);

    this._emit('started', job);

    try {
      const result = await job.job(job);
      job.status = 'completed';
      job.result = result;
      job.completedAt = Date.now();
      job.progress = 1;
      if (job.onComplete) job.onComplete(result, job);
      this._emit('completed', { job, result });
    } catch (err) {
      job.status = 'failed';
      job.error = err;
      job.completedAt = Date.now();
      if (job.onFailure) job.onFailure(err, job);
      this._emit('failed', { job, error: err });
    } finally {
      this.active = this.active.filter(j => j.id !== job.id);
      this._addToHistory(job);
      this._processNext();
    }
  }
}

const _defaultQueue = new RenderQueue();

export { RenderQueue, RenderJob };
export const renderQueue = _defaultQueue;

// ── Progress Broadcaster (Task 119) ────────────────────────────────────────
class ProgressBroadcaster extends EventEmitter {
  constructor() {
    super();
    this.currentProgress = {
      stage: 'idle',
      frame: 0,
      totalFrames: 0,
      percent: 0,
      eta: null,
      fps: 0,
      memoryUsage: 0,
      metrics: {},
    };
  }

  update(data) {
    Object.assign(this.currentProgress, data);
    this.emit('progress', { ...this.currentProgress });
  }

  getProgress() {
    return { ...this.currentProgress };
  }
}

export const progressBroadcaster = new ProgressBroadcaster();

// ── Memory Monitoring (Task 121) ───────────────────────────────────────────
const MEMORY_WARN_PERCENT = 80;

export function checkAvailableMemory() {
  try {
    if (process.platform === 'darwin') {
      const result = spawnSync('sysctl', ['-n', 'hw.memsize'], { encoding: 'utf8', timeout: 5000 });
      const totalBytes = parseInt(result.stdout?.trim(), 10);
      const usage = process.memoryUsage();
      const usedBytes = usage.heapUsed + usage.rss;
      const percent = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;
      return {
        totalBytes,
        usedBytes,
        percent,
        heapUsed: usage.heapUsed,
        rss: usage.rss,
        external: usage.external,
        adequate: percent < MEMORY_WARN_PERCENT,
      };
    } else {
      const result = spawnSync('free', ['-b'], { encoding: 'utf8', timeout: 5000 });
      if (result.status === 0) {
        const lines = result.stdout.trim().split('\n');
        const memLine = lines.find(l => l.startsWith('Mem:'));
        if (memLine) {
          const parts = memLine.split(/\s+/);
          const totalBytes = parseInt(parts[1], 10);
          const usedBytes = parseInt(parts[2], 10);
          const percent = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;
          return {
            totalBytes,
            usedBytes,
            percent,
            heapUsed: process.memoryUsage().heapUsed,
            rss: process.memoryUsage().rss,
            external: process.memoryUsage().external,
            adequate: percent < MEMORY_WARN_PERCENT,
          };
        }
      }
    }
  } catch (err) {
    // Fallback: use Node.js process.memoryUsage only
    const usage = process.memoryUsage();
    return {
      totalBytes: 0,
      usedBytes: usage.heapUsed + usage.rss,
      percent: 0,
      heapUsed: usage.heapUsed,
      rss: usage.rss,
      external: usage.external,
      adequate: true,
    };
  }
  return { totalBytes: 0, usedBytes: 0, percent: 0, heapUsed: 0, rss: 0, external: 0, adequate: true };
}

export function logMemoryUsage(label) {
  const mem = checkAvailableMemory();
  const heapMB = (mem.heapUsed / 1024 / 1024).toFixed(1);
  const rssMB = (mem.rss / 1024 / 1024).toFixed(1);
  const totalMB = mem.totalBytes > 0 ? (mem.totalBytes / 1024 / 1024).toFixed(0) : '?';
  const warn = mem.percent >= MEMORY_WARN_PERCENT ? ' ⚠ WARNING' : '';
  console.log(`  [Memory${label ? ' ' + label : ''}] Heap: ${heapMB}MB, RSS: ${rssMB}MB, System: ${mem.percent.toFixed(1)}% of ${totalMB}MB${warn}`);
  return mem;
}

// ── ETA Estimation (Task 126) ──────────────────────────────────────────────
export class EtaEstimator {
  constructor(totalFrames) {
    this.totalFrames = totalFrames;
    this.startTime = Date.now();
    this.lastUpdate = this.startTime;
    this.lastFrame = 0;
    this.emaFps = 0;
    this.emaAlpha = 0.15;
  }

  update(currentFrame) {
    const now = Date.now();
    const dt = (now - this.lastUpdate) / 1000;
    if (dt > 0.1) {
      const df = currentFrame - this.lastFrame;
      const instantFps = df / dt;
      this.emaFps = this.emaFps === 0 ? instantFps : this.emaAlpha * instantFps + (1 - this.emaAlpha) * this.emaFps;
      this.lastUpdate = now;
      this.lastFrame = currentFrame;
    }
    const remaining = this.totalFrames - currentFrame;
    const etaSec = this.emaFps > 0 ? remaining / this.emaFps : null;
    const elapsed = (now - this.startTime) / 1000;
    return {
      elapsed: elapsed.toFixed(1),
      eta: etaSec !== null ? etaSec.toFixed(1) : null,
      fps: this.emaFps.toFixed(1),
      percent: ((currentFrame / this.totalFrames) * 100).toFixed(1),
    };
  }
}

// ── Quality Gates (Task 124 / A11) ─────────────────────────────────────────
/** Minimum bytes for a final MP4 artifact to count as a successful render. */
export const MIN_RENDER_OUTPUT_BYTES = 100_000;

export function validateOutput(path, label, options = {}) {
  const minBytes = options.minBytes ?? 100;
  if (!path) return { valid: false, error: `${label}: path is null/undefined` };
  if (!existsSync(path)) return { valid: false, error: `${label}: file does not exist at ${path}` };
  try {
    const stats = statSync(path);
    if (stats.size === 0) return { valid: false, error: `${label}: file is empty (0 bytes)` };
    if (stats.size < minBytes) {
      return { valid: false, error: `${label}: file too small (${stats.size} bytes, minimum ${minBytes})` };
    }
    return { valid: true, size: stats.size };
  } catch (err) {
    return { valid: false, error: `${label}: stat failed: ${err.message}` };
  }
}

/** Throws if the final render output is missing, empty, or below MIN_RENDER_OUTPUT_BYTES. */
export function assertRenderOutput(path, label = 'Final render output') {
  const gate = validateOutput(path, label, { minBytes: MIN_RENDER_OUTPUT_BYTES });
  if (!gate.valid) {
    const err = new Error(gate.error);
    err.code = 'INVALID_RENDER_OUTPUT';
    throw err;
  }
  return gate;
}

// ── Per-Step Metrics (Task 125) ────────────────────────────────────────────
export class StepMetrics {
  constructor() {
    this.steps = {};
    this.totalStartTime = Date.now();
  }

  startStep(name) {
    this.steps[name] = { startTime: Date.now(), ...this.steps[name] };
  }

  endStep(name, extra = {}) {
    const step = this.steps[name] || {};
    step.endTime = Date.now();
    step.durationMs = step.endTime - (step.startTime || step.endTime);
    Object.assign(step, extra);
    this.steps[name] = step;
    return step;
  }

  getStep(name) {
    return this.steps[name] || null;
  }

  logSummary() {
    const totalMs = Date.now() - this.totalStartTime;
    console.log('\n  ── Pipeline Metrics ──');
    for (const [name, step] of Object.entries(this.steps)) {
      const dur = step.durationMs ? `${(step.durationMs / 1000).toFixed(1)}s` : '?';
      const extras = [];
      if (step.fileSize !== undefined) extras.push(`size=${(step.fileSize / 1024 / 1024).toFixed(1)}MB`);
      if (step.frameCount !== undefined) extras.push(`frames=${step.frameCount}`);
      if (step.narrationDuration !== undefined) extras.push(`duration=${step.narrationDuration.toFixed(1)}s`);
      if (step.loudness !== undefined) extras.push(`loudness=${step.loudness.toFixed(1)}dB`);
      if (step.segmentCount !== undefined) extras.push(`segments=${step.segmentCount}`);
      const extraStr = extras.length > 0 ? ` (${extras.join(', ')})` : '';
      console.log(`    ${name}: ${dur}${extraStr}`);
    }
    console.log(`    Total: ${(totalMs / 1000).toFixed(1)}s`);
  }
}

export const stepMetrics = new StepMetrics();

// ── Checkpoint/Resume (Task 129) ───────────────────────────────────────────
export function saveCheckpoint(checkpointPath, data) {
  try {
    mkdirSync(dirname(checkpointPath), { recursive: true });
    writeFileSync(checkpointPath, JSON.stringify(data, null, 2));
  } catch (err) {
    console.warn(`  ⚠ Failed to save checkpoint: ${err.message}`);
  }
}

export function loadCheckpoint(checkpointPath) {
  try {
    if (existsSync(checkpointPath)) {
      return JSON.parse(readFileSync(checkpointPath, 'utf8'));
    }
  } catch (err) {
    console.warn(`  ⚠ Failed to load checkpoint: ${err.message}`);
  }
  return null;
}

export function clearCheckpoint(checkpointPath) {
  try {
    if (existsSync(checkpointPath)) unlinkSync(checkpointPath);
  } catch {}
}

// ── Ffmpeg Error Recovery (Task 122) ───────────────────────────────────────
export function parseFfmpegError(stderr) {
  if (!stderr) return { type: 'unknown', message: 'Empty stderr' };

  const lower = stderr.toLowerCase();

  if (lower.includes('out of memory') || lower.includes('oom') || lower.includes('cannot allocate')) {
    return { type: 'out_of_memory', message: 'ffmpeg ran out of memory' };
  }
  if (lower.includes('invalid argument') || lower.includes('invalid data')) {
    return { type: 'invalid_argument', message: 'ffmpeg received invalid arguments or data' };
  }
  if (lower.includes('no space left on device') || lower.includes('disk full')) {
    return { type: 'disk_full', message: 'No disk space left' };
  }
  if (lower.includes('codec') && lower.includes('not supported')) {
    return { type: 'codec_error', message: 'Codec not supported' };
  }
  if (lower.includes('broken pipe') || lower.includes('epipe')) {
    return { type: 'broken_pipe', message: 'Broken pipe (ffmpeg stdin closed)' };
  }
  if (lower.includes('timed out') || lower.includes('timeout')) {
    return { type: 'timeout', message: 'ffmpeg operation timed out' };
  }

  return { type: 'unknown', message: stderr.substring(0, 200) };
}

export function getRecoveryAction(errorType) {
  switch (errorType) {
    case 'out_of_memory':
      return { action: 'retry_lower_quality', message: 'Retry with lower quality to reduce memory usage' };
    case 'invalid_argument':
      return { action: 'fix_params', message: 'Fix invalid ffmpeg parameters' };
    case 'disk_full':
      return { action: 'cleanup_and_retry', message: 'Clean temp files and retry' };
    case 'codec_error':
      return { action: 'fallback_codec', message: 'Fall back to libx264 codec' };
    case 'broken_pipe':
      return { action: 'retry', message: 'Retry rendering (pipe broke)' };
    case 'timeout':
      return { action: 'retry', message: 'Retry rendering (timed out)' };
    default:
      return { action: 'retry', message: 'Unknown error, retrying' };
  }
}

// ── Render Retry with Quality Degradation (Task 120) ───────────────────────
export const QUALITY_DEGRADATION_CHAIN = [
  { quality: 'high', label: 'Full quality', resolutionScale: 1.0, effectsEnabled: true, draftMode: false },
  { quality: 'draft', label: 'Draft mode', resolutionScale: 1.0, effectsEnabled: false, draftMode: true },
  { quality: 'draft', label: 'Draft retry', resolutionScale: 1.0, effectsEnabled: false, draftMode: true },
  { quality: 'draft', label: 'Draft final', resolutionScale: 1.0, effectsEnabled: false, draftMode: true },
];

// ── TTS Retry (Task 127) ───────────────────────────────────────────────────
export async function retryWithFallback(fn, maxRetries = 3, delayMs = 2000, label = 'operation') {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn(attempt);
      if (result !== false && result !== null && result !== undefined) {
        return result;
      }
    } catch (err) {
      console.warn(`  ⚠ ${label} attempt ${attempt}/${maxRetries} failed: ${err.message}`);
    }
    if (attempt < maxRetries) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  return null;
}

// ── Dependency Fallbacks (Task 128) ────────────────────────────────────────
export async function fetchWithFallback(url, options = {}) {
  const { fallbackFn, label = 'fetch' } = options;

  // Try primary fetch
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) return res;
  } catch (err) {
    console.warn(`  ⚠ ${label} primary fetch failed: ${err.message}`);
  }

  // Try direct HTTPS if proxy fails
  if (url.includes('/api/proxy-image')) {
    try {
      const directUrl = url.replace(/.*\/api\/proxy-image\?url=/, '');
      const decoded = decodeURIComponent(directUrl);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(decoded, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) return res;
    } catch (err) {
      console.warn(`  ⚠ ${label} direct fetch fallback failed: ${err.message}`);
    }
  }

  // Use custom fallback if provided
  if (typeof fallbackFn === 'function') {
    try {
      return await fallbackFn();
    } catch (err) {
      console.warn(`  ⚠ ${label} custom fallback failed: ${err.message}`);
    }
  }

  return null;
}

// ── Node --max-old-space-size recommendation (Task 118) ────────────────────
export function recommendNodeFlags() {
  const mem = checkAvailableMemory();
  const totalGB = mem.totalBytes > 0 ? mem.totalBytes / (1024 * 1024 * 1024) : 0;
  const currentMax = parseInt(process.env.NODE_OPTIONS?.match(/--max-old-space-size=(\d+)/)?.[1] || '0', 10);

  if (totalGB >= 16 && currentMax < 8192) {
    console.log('\n  💡 TIP: For large renders, run with: node --max-old-space-size=8192 server-render.mjs');
    console.log('     This increases the V8 heap to 8GB, preventing GC pauses during long renders.');
  } else if (currentMax === 0) {
    console.log('\n  💡 TIP: Consider running with: node --max-old-space-size=4096 server-render.mjs');
  }
}

// ── Async frame writing with setImmediate yield (Task 118) ─────────────────
export function yieldToEventLoop() {
  return new Promise(resolve => setImmediate(resolve));
}

// ── Render State Manager ───────────────────────────────────────────────────
export class RenderStateManager {
  constructor(projectTitle) {
    const safeName = (projectTitle || 'render').replace(/[^a-z0-9]/gi, '-').substring(0, 30);
    this.checkpointPath = join(tmpdir(), `autotube-checkpoint-${safeName}.json`);
    this.state = {
      status: 'idle',
      segmentIndex: 0,
      frameNumber: 0,
      totalFrames: 0,
      qualityLevel: 0,
      startTime: Date.now(),
      lastCheckpoint: Date.now(),
    };
  }

  load() {
    const saved = loadCheckpoint(this.checkpointPath);
    if (saved && saved.status === 'interrupted') {
      console.log(`  📂 Found checkpoint: segment ${saved.segmentIndex}, frame ${saved.frameNumber}`);
      return saved;
    }
    return null;
  }

  save(segmentIndex, frameNumber, totalFrames, qualityLevel) {
    this.state.segmentIndex = segmentIndex;
    this.state.frameNumber = frameNumber;
    this.state.totalFrames = totalFrames;
    this.state.qualityLevel = qualityLevel;
    this.state.lastCheckpoint = Date.now();
    saveCheckpoint(this.checkpointPath, { ...this.state, status: 'interrupted' });
  }

  markComplete() {
    clearCheckpoint(this.checkpointPath);
  }

  markRunning() {
    this.state.status = 'running';
    saveCheckpoint(this.checkpointPath, { ...this.state, status: 'running' });
  }
}

// ── Audio loudness measurement (Task 125) ──────────────────────────────────
export function measureAudioLoudness(filePath) {
  try {
    const result = spawnSync('ffmpeg', [
      '-i', filePath,
      '-af', 'loudnorm=print_format=json',
      '-f', 'null', '-',
    ], { encoding: 'utf8', timeout: 30000 });
    const match = result.stderr?.match(/\{[^}]*"input_i"\s*:\s*"([^"]+)"/);
    if (match) {
      return parseFloat(match[1]);
    }
  } catch {}
  return null;
}
