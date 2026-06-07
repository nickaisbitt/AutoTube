/**
 * Objective shot-length QA via PySceneDetect (ContentDetector).
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '../../..');

const HOOK_ZONE_SEC = 15;
const MAX_HOOK_SCENE_SEC = 3;
const MAX_BODY_SCENE_SEC = 5;

function findScenedetect() {
  const which = spawnSync('which', ['scenedetect'], { encoding: 'utf8' });
  if (which.status === 0 && which.stdout.trim()) return which.stdout.trim();
  const py = spawnSync('python3', ['-m', 'scenedetect', '--version'], { encoding: 'utf8' });
  if (py.status === 0) return 'python3 -m scenedetect';
  return null;
}

function parseTimecode(tc) {
  const parts = String(tc).trim().split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parseFloat(tc) || 0;
}

/**
 * @param {string} videoPath
 * @returns {object}
 */
export function analyzeScenes(videoPath) {
  const resolved = videoPath.startsWith('/') ? videoPath : join(PROJECT_ROOT, videoPath);
  if (!existsSync(resolved)) {
    return { available: false, error: `Video not found: ${resolved}` };
  }

  const bin = findScenedetect();
  if (!bin) {
    return { available: false, error: 'scenedetect not installed (pip install scenedetect)' };
  }

  const script = `
import json, sys
from scenedetect import detect, ContentDetector
path = sys.argv[1]
scenes = detect(path, ContentDetector(threshold=27.0))
out = []
for i, (start, end) in enumerate(scenes):
    out.append({
        "index": i,
        "startSec": start.get_seconds(),
        "endSec": end.get_seconds(),
        "durationSec": (end - start).get_seconds(),
    })
print(json.dumps({"scenes": out}))
`;

  const r = spawnSync('python3', ['-c', script, resolved], {
    encoding: 'utf8',
    timeout: 120_000,
  });

  if (r.status !== 0) {
    return {
      available: false,
      error: (r.stderr || r.stdout || 'scenedetect failed').slice(-400),
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(r.stdout.trim());
  } catch {
    return { available: false, error: 'scenedetect JSON parse failed' };
  }

  const scenes = parsed.scenes || [];
  const durations = scenes.map((s) => s.durationSec);
  const longestSceneSec = durations.length ? Math.max(...durations) : 0;
  const hookScenes = scenes.filter((s) => s.startSec < HOOK_ZONE_SEC);
  const longestHookSec = hookScenes.length
    ? Math.max(...hookScenes.map((s) => s.durationSec))
    : 0;
  const avgSceneDuration = durations.length
    ? durations.reduce((a, b) => a + b, 0) / durations.length
    : 0;

  const hookPass = longestHookSec <= MAX_HOOK_SCENE_SEC;
  const bodyPass = longestSceneSec <= MAX_BODY_SCENE_SEC;
  const pass = hookPass && bodyPass;

  return {
    available: true,
    sceneCount: scenes.length,
    scenes,
    longestSceneSec,
    longestHookSec,
    avgSceneDuration,
    hookPass,
    bodyPass,
    pass,
    thresholds: {
      maxHookSceneSec: MAX_HOOK_SCENE_SEC,
      maxBodySceneSec: MAX_BODY_SCENE_SEC,
      hookZoneSec: HOOK_ZONE_SEC,
    },
  };
}
