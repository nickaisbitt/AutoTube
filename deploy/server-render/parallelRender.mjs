/**
 * Parallel Segment Renderer
 *
 * Renders multiple video segments in parallel using Node.js worker threads.
 * Segments are distributed across workers and combined at the end.
 */

import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, writeFileSync, unlinkSync, mkdirSync, copyFileSync } from 'fs';
import { cpus, totalmem, freemem } from 'os';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKER_SCRIPT = join(__dirname, 'segmentWorker.mjs');

const DEFAULT_MAX_WORKERS = 4;

/**
 * Render a single segment in a worker thread.
 * Returns a promise that resolves with the segment output path.
 */
function renderSegmentInWorker(segment, project, outputPath, options = {}) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_SCRIPT, {
      workerData: {
        segment,
        project,
        outputPath,
        options,
      },
    });

    const timeoutMs = options.timeoutMs || 300_000; // 5 min default per segment
    const timeoutId = setTimeout(() => {
      worker.terminate();
      reject(new Error(`Segment render timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);

    worker.on('message', (msg) => {
      if (msg.type === 'progress') {
        options.onProgress?.(msg.progress, segment);
      } else if (msg.type === 'done') {
        clearTimeout(timeoutId);
        resolve(msg.result);
      } else if (msg.type === 'error') {
        clearTimeout(timeoutId);
        reject(new Error(msg.error));
      }
    });

    worker.on('error', (err) => {
      clearTimeout(timeoutId);
      reject(err);
    });

    worker.on('exit', (code) => {
      clearTimeout(timeoutId);
      if (code !== 0 && code !== null) {
        reject(new Error(`Worker exited with code ${code}`));
      }
    });
  });
}

/**
 * Render multiple segments in parallel with a concurrency limit.
 *
 * @param {Array} segments - Array of segment objects to render
 * @param {Object} project - Full project data
 * @param {Object} options - { maxWorkers, outputDir, onSegmentProgress, onAllProgress }
 * @returns {Array<{ segmentId, outputPath, duration, success, error? }>}
 */
export async function renderSegmentsParallel(segments, project, options = {}) {
  const maxWorkers = Math.min(options.maxWorkers || DEFAULT_MAX_WORKERS, segments.length);
  const outputDir = options.outputDir || '/tmp/autotube-parallel';

  console.log(`  🔄 Parallel render: ${segments.length} segments across ${maxWorkers} workers`);

  const results = new Array(segments.length);
  let completedCount = 0;
  let failedCount = 0;

  // Process segments in batches
  for (let i = 0; i < segments.length; i += maxWorkers) {
    const batch = segments.slice(i, i + maxWorkers);

    const batchPromises = batch.map((seg, batchIdx) => {
      const segIdx = i + batchIdx;
      const outputPath = join(outputDir, `segment-${segIdx}.mp4`);

      return renderSegmentInWorker(seg, project, outputPath, {
        ...options,
        onProgress: (progress) => {
          options.onSegmentProgress?.(segIdx, progress, segments.length);
        },
      })
        .then((result) => {
          results[segIdx] = {
            segmentId: seg.id,
            outputPath,
            duration: result?.duration || seg.duration,
            success: true,
          };
          completedCount++;
          options.onAllProgress?.(completedCount + failedCount, segments.length, 'completed');
        })
        .catch((err) => {
          results[segIdx] = {
            segmentId: seg.id,
            outputPath: null,
            duration: seg.duration,
            success: false,
            error: err.message,
          };
          failedCount++;
          console.error(`    ❌ Segment ${segIdx} failed: ${err.message}`);
          options.onAllProgress?.(completedCount + failedCount, segments.length, 'failed');
        });
    });

    await Promise.allSettled(batchPromises);
  }

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`  ✅ Parallel render complete: ${successful.length}/${segments.length} succeeded`);
  if (failed.length > 0) {
    console.log(`  ⚠ ${failed.length} segment(s) failed`);
  }

  return results;
}

/**
 * Merge multiple segment videos into a single output using ffmpeg concat.
 */
export async function mergeSegmentVideos(segmentResults, outputPath) {
  const successful = segmentResults.filter(r => r.success && r.outputPath);
  if (successful.length === 0) {
    throw new Error('No successful segments to merge');
  }

  // Create concat list file
  const concatFile = join(outputPath.replace('.mp4', ''), `concat-${Date.now()}.txt`);
  const concatDir = dirname(concatFile);
  mkdirSync(concatDir, { recursive: true });

  const concatContent = successful
    .map(r => `file '${r.outputPath.replace(/'/g, "'\\''")}'`)
    .join('\n');

  writeFileSync(concatFile, concatContent);

  // Concatenate with ffmpeg
  const result = spawnSync('ffmpeg', [
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', concatFile,
    '-c', 'copy',
    '-movflags', '+faststart',
    outputPath,
  ], { encoding: 'utf8', timeout: 300_000 });

  // Clean up concat file
  try { unlinkSync(concatFile); } catch {}

  if (result.status !== 0) {
    throw new Error(`Segment merge failed: ${result.stderr?.substring(0, 200)}`);
  }

  return outputPath;
}

/**
 * Get the optimal number of workers based on system resources.
 */
export function getOptimalWorkerCount() {
  const cpuCount = cpus().length;
  const totalMem = totalmem();
  const freeMem = freemem();

  // Use at most CPU count - 1, and respect memory constraints
  // Each worker needs ~512MB for rendering
  const memWorkers = Math.floor(freeMem / (512 * 1024 * 1024));
  const cpuWorkers = Math.max(1, cpuCount - 1);

  return Math.min(cpuWorkers, memWorkers, 8); // cap at 8
}
