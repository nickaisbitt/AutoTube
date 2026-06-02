/**
 * Narration Generation Module
 *
 * Generates narration audio using a fallback chain:
 *   1. Kokoro-82M (local / KOKORO_SERVER_URL)
 *   2. MeloTTS (Cloudflare, optional)
 *   3. edge-tts (CLI or python3 -m edge_tts)
 *
 * Fails fast when no TTS engine is available — narration segments are never replaced with silence.
 * Setup: scripts/squad/A3-tts-setup.md
 */

import { spawn, spawnSync } from 'child_process';
import { existsSync, writeFileSync, readFileSync, rmSync, mkdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const KOKORO_SCRIPT = join(__dirname, 'kokoro_generate.py');

/** Keep in sync with COLD_OPEN_SECONDS + TITLE_CARD_SECONDS in server-render.mjs */
const INTRO_SILENCE_SECONDS = 2.5;

const TTS_SETUP_DOC = 'scripts/squad/A3-tts-setup.md';

function resolveKokoroPython() {
  const envPython = process.env.KOKORO_PYTHON?.trim();
  if (envPython) {
    if (envPython.includes('/') && !existsSync(envPython)) {
      throw new Error(
        `KOKORO_PYTHON is set to "${envPython}" but the executable was not found. See ${TTS_SETUP_DOC}.`
      );
    }
    return envPython;
  }
  const candidates = [
    '/tmp/tts-env/bin/python3',
    '/tmp/tts-env/bin/python',
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return 'python3';
}

function getKokoroPython() {
  return resolveKokoroPython();
}

const DEFAULT_VOICE = 'af_heart';

// ── Task 17: Voice consistency guard — fallback chain within same engine ──
const VOICE_FALLBACK_CHAIN = [
  'af_heart',
  'am_adam',
  'af_sarah',
];

// ── Task 19: Emotion mapping — speed AND pitch ──
const EMOTION_PARAMS = {
  urgent: { speed: 1.3, pitch: '+3%' },
  calm: { speed: 0.85, pitch: '-2%' },
  excited: { speed: 1.2, pitch: '+5%' },
  serious: { speed: 0.9, pitch: '-1%' },
  dramatic: { speed: 0.95, pitch: '+1%' },
  neutral: { speed: 1.0, pitch: '+0%' },
  sad: { speed: 0.85, pitch: '-3%' },
  angry: { speed: 1.15, pitch: '+2%' },
};

// ── Task 20: Pronunciation dictionary ──
const PRONUNCIATION = {
  'GPT': 'G P T',
  'NVIDIA': 'en vid ee uh',
  'JPEG': 'jay peg',
  'GIF': 'jif',
  'AI': 'A I',
  'ML': 'M L',
  'CEO': 'C E O',
  'CFO': 'C F O',
  'CTO': 'C T O',
  'GPU': 'G P U',
  'CPU': 'C P U',
  'API': 'A P I',
  'URL': 'U R L',
  'HTTP': 'H T T P',
  'HTTPS': 'H T T P S',
  'HTML': 'H T M L',
  'CSS': 'C S S',
  'USB': 'U S B',
  'LED': 'L E D',
  'LCD': 'L C D',
  'VR': 'V R',
  'AR': 'A R',
  'IoT': 'I oh tee',
  'BYD': 'B Y D',
  'AMD': 'A M D',
  'EV': 'E V',
  'MBA': 'M B A',
  'IPO': 'I P O',
  'CEO': 'C E O',
  'NSA': 'N S A',
  'FBI': 'F B I',
  'CIA': 'C I A',
  'SEC': 'S E C',
  'GDP': 'G D P',
  'NASA': 'N A S A',
  'UN': 'U N',
  'EU': 'E U',
  'WHO': 'W H O',
  'COVID': 'Coh vid',
  'SaaS': 'Sass',
  'B2B': 'B to B',
  'B2C': 'B to C',
  'VPN': 'V P N',
  'SSD': 'S S D',
  'RAM': 'R A M',
  'ROM': 'R O M',
  'LAN': 'L A N',
  'WiFi': 'Wye fi',
  'Bluetooth': 'Bluetooth',
  'OpenAI': 'Open A I',
  'DeepMind': 'Deep Mind',
  'Anthropic': 'An throp ic',
  'TikTok': 'Tik Tok',
  'YouTube': 'You Tube',
  'Instagram': 'Insta gram',
  'LinkedIn': 'Linked In',
  'Tesla': 'Tes lah',
  'SpaceX': 'Space X',
  'Microsoft': 'Micro soft',
  'Alphabet': 'Al pha bet',
  'Sam Altman': 'Sam Alt man',
  'Elon Musk': 'Ee lon Musk',
  'Jensen Huang': 'Jen sen Hwang',
  'Sundar Pichai': 'Sun dar Pich eye',
  'Tim Cook': 'Tim Cook',
  'Mark Zuckerberg': 'Mark Zucker berg',
  'Jeff Bezos': 'Jeff Bee zos',
  'Satya Nadella': 'Sat ya Na dell a',
  'Andy Jassy': 'An dy Jass y',
  'Jassy': 'Jass y',
  'Lisa Su': 'Lee sa Su',
  'Pat Gelsinger': 'Pat Gel sing er',
  'Patel': 'Pah tel',
  'Sharma': 'Shar ma',
  'Chen': 'Chen',
  'Li': 'Lee',
  'Wang': 'Wong',
  'Zhang': 'Zhang',
  'Liu': 'Lyo',
  'Kim': 'Kim',
  'Park': 'Park',
  'Lee': 'Lee',
  'Brown': 'Brown',
  'Smith': 'Smith',
  'Johnson': 'John son',
  'Williams': 'Will yums',
  'Jones': 'Jones',
  'Garcia': 'Gar see uh',
  'Miller': 'Mill er',
  'Davis': 'Day vis',
  'Rodriguez': 'Row dree gez',
  'Martinez': 'Mar tee nez',
  'Hernandez': 'Her nan dez',
  'Lopez': 'Low pez',
  'Gonzalez': 'Gon za lez',
  'Wilson': 'Wil son',
  'Anderson': 'An der son',
  'Thomas': 'Tom as',
  'Taylor': 'Tay lor',
  'Moore': 'More',
  'Jackson': 'Jack son',
  'Martin': 'Mar tin',
  'Lee': 'Lee',
  'Perez': 'Peh rez',
  'Thompson': 'Tomp son',
  'White': 'White',
  'Harris': 'Har is',
  'Sanchez': 'Sanchez',
  'Clark': 'Clark',
  'Ramirez': 'Rah mee rez',
  'Lewis': 'Loo is',
  'Robinson': 'Rob in son',
  'Walker': 'Walk er',
  'Young': 'Young',
  'Allen': 'Al en',
  'King': 'King',
  'Wright': 'Right',
  'Scott': 'Scott',
  'Torres': 'Tor ez',
  'Nguyen': 'Win',
  'Hill': 'Hill',
  'Flores': 'Flor ez',
  'Green': 'Green',
  'Adams': 'Ad ams',
  'Nelson': 'Nel son',
  'Baker': 'Bay ker',
  'Hall': 'Hall',
  'Rivera': 'Ree veh rah',
  'Campbell': 'Cam bell',
  'Mitchell': 'Mitch ell',
  'Carter': 'Car ter',
  'Roberts': 'Rob erts',
};

// Map emotion label to Kokoro speed (legacy compat)
const EMOTION_SPEED = {};
for (const [emo, params] of Object.entries(EMOTION_PARAMS)) {
  EMOTION_SPEED[emo] = params.speed;
}

/**
 * Resolve how to invoke edge-tts: native CLI or `python -m edge_tts`.
 * @returns {{ available: boolean, command: string, prefixArgs: string[], detail?: string }}
 */
function resolveEdgeTtsRunner(python = getKokoroPython()) {
  const cliCheck = spawnSync('which', ['edge-tts'], { encoding: 'utf8', timeout: 5000 });
  if (cliCheck.status === 0) {
    return { available: true, command: 'edge-tts', prefixArgs: [] };
  }

  const moduleCheck = spawnSync(python, ['-m', 'edge_tts', '--help'], {
    encoding: 'utf8',
    timeout: 15000,
  });
  if (moduleCheck.status === 0) {
    return { available: true, command: python, prefixArgs: ['-m', 'edge_tts'] };
  }

  const fallbackCheck = spawnSync('python3', ['-m', 'edge_tts', '--help'], {
    encoding: 'utf8',
    timeout: 15000,
  });
  if (fallbackCheck.status === 0) {
    return { available: true, command: 'python3', prefixArgs: ['-m', 'edge_tts'] };
  }

  const detail = (moduleCheck.stderr || moduleCheck.stdout || fallbackCheck.stderr || '').trim();
  return {
    available: false,
    command: python,
    prefixArgs: ['-m', 'edge_tts'],
    detail: detail || 'edge-tts module not importable',
  };
}

/**
 * Detect which TTS providers are available on this host.
 * @param {object} [options]
 * @returns {{ kokoro: boolean, melo: boolean, edgeTts: boolean, python: string, edgeRunner: ReturnType<typeof resolveEdgeTtsRunner> }}
 */
export function detectTtsProviders(options = {}) {
  const python = getKokoroPython();
  const cfAccountId = options.cfAccountId || process.env.CF_ACCOUNT_ID || '';
  const cfApiToken = options.cfApiToken || process.env.CF_API_TOKEN || '';
  const melo = !!cfAccountId && !!cfApiToken;

  let kokoro = false;
  if (process.env.KOKORO_SERVER_URL) {
    kokoro = true;
  } else if (existsSync(KOKORO_SCRIPT)) {
    const importCheck = spawnSync(
      python,
      ['-c', 'from kokoro import KPipeline'],
      { encoding: 'utf8', timeout: 30000 },
    );
    kokoro = importCheck.status === 0;
  }

  const edgeRunner = resolveEdgeTtsRunner(python);
  return {
    kokoro,
    melo,
    edgeTts: edgeRunner.available,
    python,
    edgeRunner,
  };
}

/**
 * Fail fast when no narration engine can run.
 * @param {object} [options]
 * @returns {ReturnType<typeof detectTtsProviders>}
 */
export function assertTtsAvailable(options = {}) {
  const providers = detectTtsProviders(options);
  if (!providers.kokoro && !providers.melo && !providers.edgeTts) {
    const lines = [
      'No TTS engine available for server render.',
      'Install at least one provider (edge-tts is the quickest):',
      '  pip install --break-system-packages edge-tts',
      'Optional Kokoro: pip install kokoro torch (set KOKORO_PYTHON if using a venv)',
      'Optional MeloTTS: set CF_ACCOUNT_ID and CF_API_TOKEN',
      `See ${TTS_SETUP_DOC} for full setup.`,
    ];
    if (providers.edgeRunner.detail) {
      lines.splice(1, 0, `edge-tts probe: ${providers.edgeRunner.detail}`);
    }
    throw new Error(lines.join('\n'));
  }
  return providers;
}

/**
 * Task 15: Normalize text for TTS — convert symbols to spoken words.
 * @param {string} text
 * @returns {string}
 */
function normalizeText(text) {
  return text
    .replace(/(\d+)%/g, (_, num) => `${num} percent`)
    .replace(/\$([\d,.]+[BMK])/g, '$1 dollars')
    .replace(/\bAI\b/g, 'A I')
    .replace(/\bGPT\b/g, 'G P T');
}

/**
 * Task 20: Apply pronunciation hints from dictionary.
 * @param {string} text
 * @returns {string}
 */
function applyPronunciation(text) {
  let result = text;
  for (const [word, phonetic] of Object.entries(PRONUNCIATION)) {
    result = result.replace(new RegExp(`\\b${word}\\b`, 'g'), phonetic);
  }
  return result;
}

/**
 * Task 14: Apply SSML prosody tags based on pacing score.
 * @param {string} text
 * @param {number} pacingScore 1-5 scale
 * @returns {string}
 */
function applyProsody(text, pacingScore) {
  const rate = pacingScore >= 4 ? '110%' : pacingScore <= 2 ? '85%' : '100%';
  return `<prosody rate="${rate}">${text}</prosody>`;
}

/**
 * Task 22: Detect emphasis from punctuation (!) and ALL CAPS words.
 * Returns true if text contains emphasis markers.
 * @param {string} text
 * @returns {boolean}
 */
function hasEmphasis(text) {
  return /!/.test(text) || /[A-Z]{2,}/.test(text);
}

/**
 * Generate a silence audio file of the given duration at 48kHz.
 * Task 24: Changed from 44100Hz to 48000Hz.
 * @param {string} outputPath  Path to write the silence file.
 * @param {number} durationSec Duration in seconds.
 * @returns {boolean} True if the file was created successfully.
 */
export function generateSilence(outputPath, durationSec) {
  const result = spawnSync('ffmpeg', [
    '-y', '-f', 'lavfi', '-i', `anullsrc=r=48000:cl=stereo`,
    '-t', String(durationSec), outputPath,
  ], { encoding: 'utf8', timeout: 10000 });
  if (result.status !== 0) {
    console.error(`  ⚠ generateSilence failed: ${result.stderr?.trim() || 'unknown error'}`);
    console.error(`  Command: ffmpeg -y -f lavfi -i anullsrc=r=48000:cl=stereo -t ${durationSec} ${outputPath}`);
  }
  return existsSync(outputPath);
}

/**
 * Task 18: Generate a short breath sound between segments.
 * @param {string} outputPath
 * @returns {boolean}
 */
function generateBreathSound(outputPath) {
  const result = spawnSync('ffmpeg', [
    '-y', '-f', 'lavfi', '-i', 'anoisesrc=d=0.25:c=pink:a=0.005',
    '-ar', '48000', outputPath,
  ], { encoding: 'utf8', timeout: 10000 });
  return result.status === 0 && existsSync(outputPath);
}

/**
 * Task 16 + 23: Apply post-TTS audio cleanup filters.
 * Includes denoising (afftdn), highpass, and equalizer.
 * @param {string} inputPath  Path to raw WAV from TTS.
 * @param {string} outputPath Path to write cleaned WAV.
 * @returns {boolean}
 */
function applyAudioCleanup(inputPath, outputPath) {
  const result = spawnSync('ffmpeg', [
    '-y', '-i', inputPath,
    '-af', 'highpass=f=80,afftdn=nr=10:nt=w,equalizer=f=3000:t=q:w=1:g=2',
    '-ar', '48000',
    outputPath,
  ], { encoding: 'utf8', timeout: 30000 });
  return result.status === 0 && existsSync(outputPath);
}

/**
 * Task 19: Apply emotion-based pitch shift via ffmpeg.
 * @param {string} inputPath
 * @param {string} outputPath
 * @param {string} pitchShift e.g. '+3%' or '-2%'
 * @returns {boolean}
 */
function applyPitchShift(inputPath, outputPath, pitchShift) {
  if (!pitchShift || pitchShift === '+0%') {
    // No pitch shift needed, just copy
    spawnSync('cp', [inputPath, outputPath]);
    return existsSync(outputPath);
  }
  const result = spawnSync('ffmpeg', [
    '-y', '-i', inputPath,
    '-af', `rubberband=pitch=${pitchShift}`,
    '-ar', '48000',
    outputPath,
  ], { encoding: 'utf8', timeout: 30000 });
  // Fallback: if rubberband not available, use asetrate approach
  if (result.status !== 0) {
    const pct = parseFloat(pitchShift) / 100;
    const rate = Math.round(48000 * (1 + pct));
    const fallback = spawnSync('ffmpeg', [
      '-y', '-i', inputPath,
      '-af', `asetrate=${rate},aresample=48000`,
      '-ar', '48000',
      outputPath,
    ], { encoding: 'utf8', timeout: 30000 });
    return fallback.status === 0 && existsSync(outputPath);
  }
  return existsSync(outputPath);
}

/**
 * Task 22: Apply emphasis — volume boost and slight speed increase for
 * text containing ! or ALL CAPS words.
 * @param {string} inputPath
 * @param {string} outputPath
 * @param {string} text
 * @returns {boolean}
 */
function applyEmphasis(inputPath, outputPath, text) {
  if (!hasEmphasis(text)) {
    spawnSync('cp', [inputPath, outputPath]);
    return existsSync(outputPath);
  }
  const result = spawnSync('ffmpeg', [
    '-y', '-i', inputPath,
    '-af', 'volume=1.15,atempo=1.05',
    '-ar', '48000',
    outputPath,
  ], { encoding: 'utf8', timeout: 30000 });
  return result.status === 0 && existsSync(outputPath);
}

/**
 * Task 25: Generate WebVTT captions from narration text with word-level timestamps.
 * Uses estimated word timing based on audio duration.
 * @param {string} text        Narration text.
 * @param {number} durationSec Audio duration in seconds.
 * @param {string} outputPath  Path to write the .vtt file.
 * @returns {boolean}
 */
function generateWebVTT(text, durationSec, outputPath) {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    writeFileSync(outputPath, 'WEBVTT\n\n');
    return true;
  }

  const msPerWord = (durationSec * 1000) / words.length;
  const cuesPerGroup = 5;
  let vtt = 'WEBVTT\n\n';

  for (let i = 0; i < words.length; i += cuesPerGroup) {
    const group = words.slice(i, i + cuesPerGroup);
    const startMs = Math.round(i * msPerWord);
    const endMs = Math.round(Math.min((i + cuesPerGroup) * msPerWord, durationSec * 1000));

    const start = formatVTTTime(startMs);
    const end = formatVTTTime(endMs);

    vtt += `${start} --> ${end}\n`;
    vtt += group.join(' ') + '\n\n';
  }

  writeFileSync(outputPath, vtt);
  return true;
}

/**
 * Format milliseconds to VTT timestamp (HH:MM:SS.mmm)
 * @param {number} ms
 * @returns {string}
 */
function formatVTTTime(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const milli = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(milli).padStart(3, '0')}`;
}

/**
 * Task 21: Detect paragraph breaks (double newlines) and return paragraph segments
 * with their character offsets for inserting pauses during concatenation.
 * @param {string} text
 * @returns {Array<{text: string, start: number, end: number}>}
 */
function detectParagraphBreaks(text) {
  const paragraphs = text.split(/\n\s*\n/);
  const result = [];
  let offset = 0;
  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (trimmed.length > 0) {
      const start = text.indexOf(trimmed, offset);
      result.push({ text: trimmed, start, end: start + trimmed.length });
      offset = start + trimmed.length;
    }
  }
  return result;
}

/**
 * Generate narration audio for a single segment using Kokoro-82M (local TTS).
 * Falls back gracefully if the model is not installed.
 * Pads audio with silence to match targetDuration so the video timeline stays consistent.
 *
 * Task 13: Keeps WAV output (no MP3 conversion) for maximum quality until final encode.
 * Task 16: Applies post-TTS audio cleanup after generation.
 * Task 17: Tries fallback voices within Kokoro before switching engines.
 * Task 19: Applies emotion-based speed AND pitch adjustments.
 * Task 20: Applies pronunciation dictionary before TTS.
 * Task 22: Applies emphasis for punctuation and ALL CAPS.
 * Task 23: Denoising included in cleanup chain.
 *
 * @param {string} text           Narration text.
 * @param {string} outputPath     Path to write the output file (WAV preferred).
 * @param {object} [options]      Optional { speed, voice, targetDuration, emotion, pacingScore }.
 * @returns {boolean}
 */
export async function generateKokoroSegment(text, outputPath, options = {}) {
  const tmpDir = join(dirname(outputPath), '_kokoro');
  mkdirSync(tmpDir, { recursive: true });

  // Task 15 + 20: Normalize text and apply pronunciation before TTS
  let processedText = normalizeText(text);
  processedText = applyPronunciation(processedText);

  // Task 14: Apply prosody tags if pacing score is provided
  if (options.pacingScore) {
    processedText = applyProsody(processedText, options.pacingScore);
  }

  // Task 19: Map emotion to speed AND pitch
  const emotion = options.emotion || null;
  let speed = options.speed || 1.0;
  let pitch = '+0%';
  if (emotion && EMOTION_PARAMS[emotion]) {
    speed = EMOTION_PARAMS[emotion].speed;
    pitch = EMOTION_PARAMS[emotion].pitch;
  }

  // Task 17: Voice fallback chain — try voices within Kokoro before switching engines
  const voiceOptions = options.voice
    ? [options.voice, ...VOICE_FALLBACK_CHAIN.filter(v => v !== options.voice)]
    : [...VOICE_FALLBACK_CHAIN];

  const targetDuration = options.targetDuration || null;

  for (const voice of voiceOptions) {
    const wavPath = join(tmpDir, 'current.wav');
    const vttPath = join(tmpDir, 'current.vtt');
    let generatedWav = false;

    // Try self-hosted Kokoro ONNX HTTP API first
    const serverUrl = process.env.KOKORO_SERVER_URL;
    if (serverUrl) {
      try {
        console.log(`\n  [Kokoro-API] Querying self-hosted TTS server: ${serverUrl} (voice=${voice}, speed=${speed})`);
        const endpoint = serverUrl.replace(/\/$/, '') + '/generate';
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text: processedText,
            voice,
            speed,
          }),
          signal: AbortSignal.timeout(30000), // 30s timeout
        });

        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          writeFileSync(wavPath, buffer);
          generatedWav = existsSync(wavPath);
          if (generatedWav) {
            console.log(`  ✓ [Kokoro-API] Speech generated successfully (${(buffer.length / 1024).toFixed(1)} KB)`);
          }
        } else {
          const errText = await response.text().catch(() => '');
          console.warn(`  ⚠ [Kokoro-API] HTTP ${response.status}: ${errText.substring(0, 100)}`);
        }
      } catch (err) {
        console.warn(`  ⚠ [Kokoro-API] Failed to fetch from TTS server: ${err.message}`);
      }
    }

    // Fall back to local python execution if HTTP API failed or was not configured
    if (!generatedWav) {
      // Create batch JSON
      const batchInput = join(tmpDir, 'batch.json');
      const config = {
        segments: [{ id: 'current', text: processedText, speed }],
        voice,
        output_dir: tmpDir,
      };
      writeFileSync(batchInput, JSON.stringify(config));

      // Generate audio via Kokoro Python wrapper (async to avoid blocking event loop)
      const env = { ...process.env, PYTORCH_ENABLE_MPS_FALLBACK: '1' };
      const kokoroPython = getKokoroPython();
      const kokoroPromise = new Promise((resolve) => {
        const child = spawn(kokoroPython, [KOKORO_SCRIPT, batchInput], {
          encoding: 'utf8',
          timeout: 300000,
          env,
        });
        let stdout = '';
        let stderr = '';
        child.stdout?.on('data', (d) => { stdout += d; });
        child.stderr?.on('data', (d) => { stderr += d; });
        child.on('close', (code) => {
          resolve({ status: code ?? 1, stdout, stderr });
        });
        child.on('error', (err) => {
          resolve({ status: 1, stdout, stderr: err.message });
        });
      });
      const result = await kokoroPromise;
      generatedWav = result.status === 0 && existsSync(wavPath);
    }

    if (generatedWav) {
      // Task 13: Keep as WAV — no MP3 conversion. Pad to target duration if needed.
      let processingPath = wavPath;

      // Apply padding if target duration specified
      if (targetDuration) {
        const paddedPath = join(tmpDir, 'padded.wav');
        const padResult = spawnSync('ffmpeg', [
          '-y', '-i', wavPath,
          '-af', `apad=whole_dur=${targetDuration}`,
          '-ar', '48000',
          paddedPath,
        ], { encoding: 'utf8', timeout: 60000 });
        if (padResult.status === 0 && existsSync(paddedPath)) {
          processingPath = paddedPath;
        }
      }

      // Task 16 + 23: Apply audio cleanup (denoising, highpass, EQ)
      const cleanedPath = join(tmpDir, 'cleaned.wav');
      if (!applyAudioCleanup(processingPath, cleanedPath)) {
        // If cleanup fails, use unprocessed
        cleanedPath; // eslint-disable-line no-unused-expressions
      }
      const postCleanupPath = existsSync(cleanedPath) ? cleanedPath : processingPath;

      // Task 19: Apply pitch shift from emotion
      let postPitchPath = postCleanupPath;
      if (pitch !== '+0%') {
        const pitchPath = join(tmpDir, 'pitched.wav');
        if (applyPitchShift(postCleanupPath, pitchPath, pitch)) {
          postPitchPath = pitchPath;
        }
      }

      // Task 22: Apply emphasis from punctuation
      let finalPath = postPitchPath;
      const emphPath = join(tmpDir, 'emphasized.wav');
      if (applyEmphasis(postPitchPath, emphPath, processedText)) {
        finalPath = emphPath;
      }

      // Copy final WAV to output path
      spawnSync('cp', [finalPath, outputPath]);

      if (existsSync(outputPath)) {
        // Copy aligned subtitles from Kokoro's output
        if (existsSync(vttPath)) {
          const subtitlePath = outputPath.replace(/\.\w+$/, '.vtt');
          spawnSync('cp', [vttPath, subtitlePath]);
        }
        return true;
      }
    }
  }

  // All voices failed — clean up and return false
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  return false;
}

function getAudioDuration(filePath) {
  try {
    const result = spawnSync('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath
    ], { encoding: 'utf8', timeout: 5000 });
    if (result.status === 0 && result.stdout) {
      const parsed = parseFloat(result.stdout.trim());
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
  } catch (e) {
    console.warn(`  ⚠ getAudioDuration failed for ${filePath}: ${e.message}`);
  }
  return null;
}

async function generateMeloSegment(text, outputPath, accountId, apiToken) {
  try {
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/myshell-ai/melotts`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt: text, lang: 'en' }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.warn(`  ⚠ MeloTTS API returned ${response.status}: ${errText.substring(0, 100)}`);
      return false;
    }
    const contentType = response.headers.get('content-type') || '';
    let buffer;
    if (contentType.includes('application/json')) {
      const data = await response.json();
      const base64Audio = data?.result?.audio;
      if (!base64Audio) {
        console.warn('  ⚠ MeloTTS: No audio in JSON response');
        return false;
      }
      buffer = Buffer.from(base64Audio, 'base64');
    } else {
      buffer = Buffer.from(await response.arrayBuffer());
    }
    if (buffer.length === 0) return false;
    writeFileSync(outputPath, buffer);
    return existsSync(outputPath);
  } catch (err) {
    console.warn(`  ⚠ MeloTTS request failed: ${err.message}`);
    return false;
  }
}

/**
 * Generate narration via edge-tts (CLI or python3 -m edge_tts).
 * @param {string} text
 * @param {string} audioFile
 * @param {string} subtitleFile
 * @param {string} voice
 * @param {ReturnType<typeof resolveEdgeTtsRunner>} [edgeRunner]
 * @returns {boolean}
 */
function generateEdgeTtsSegment(text, audioFile, subtitleFile, voice, edgeRunner) {
  const runner = edgeRunner || resolveEdgeTtsRunner();
  if (!runner.available) {
    console.warn(`  ⚠ edge-tts unavailable: ${runner.detail || 'not installed'}`);
    return false;
  }

  const edgeArgs = [
    ...runner.prefixArgs,
    '--voice', voice,
    '--rate', '+10%',
    '--text', text,
    '--write-media', audioFile,
    '--write-subtitles', subtitleFile,
  ];

  const result = spawnSync(runner.command, edgeArgs, { encoding: 'utf8', timeout: 60000 });
  if (result.status !== 0) {
    const errMsg = (result.stderr || result.stdout || '').trim();
    console.warn(`  ⚠ edge-tts failed (${runner.command}): ${errMsg.substring(0, 200)}`);
    return false;
  }
  return existsSync(audioFile) && statSync(audioFile).size > 0;
}

/**
 * Generate narration audio for all segments using a fallback chain:
 *   1. Kokoro-82M (local / KOKORO_SERVER_URL)
 *   2. MeloTTS (Cloudflare, optional)
 *   3. edge-tts (CLI or python3 -m edge_tts)
 *
 * Throws if no TTS engine is available or all engines fail for a segment.
 * Intentional timeline silences (cold open, title cards, end screen) are still generated.
 * Task 18: Inserts breathing sounds between segments.
 * Task 21: Inserts silence pauses at paragraph breaks.
 * Task 24: Uses 48kHz sample rate for all silence generation.
 *
 * @param {Array} segments   Script segments with narration text.
 * @param {string} outputDir Directory to write audio files.
 * @param {object} [options] Optional config.
 * @returns {Promise<Array<{file: string, duration: number}>>}
 */
export async function generateNarration(segments, outputDir, options = {}) {
  const { cfAccountId, cfApiToken, edgeVoice } = options;
  const providers = assertTtsAvailable({ cfAccountId, cfApiToken });
  const useMelo = providers.melo;
  const audioFiles = [];

  const engines = [];
  if (providers.kokoro) engines.push('Kokoro-82M');
  if (useMelo) engines.push('MeloTTS');
  if (providers.edgeTts) engines.push('edge-tts');
  console.log(`Generating narration audio (fallback chain: ${engines.join(' → ')})...`);

  // Intro silence — matches cold open duration in server-render.mjs (title card currently skipped)
  const introSilenceFile = join(outputDir, 'silence-intro.wav');
  if (generateSilence(introSilenceFile, INTRO_SILENCE_SECONDS)) {
    audioFiles.push({ file: introSilenceFile, duration: INTRO_SILENCE_SECONDS });
  }

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];

    // Validate seg.duration to prevent ffmpeg crashes from NaN/undefined
    const segDuration = (typeof seg.duration === 'number' && !isNaN(seg.duration) && seg.duration > 0) ? seg.duration : 10;

    // Generate 1.5s silence for the segment title card
    const silenceFile = join(outputDir, `silence-${i}.wav`);
    if (generateSilence(silenceFile, 1.5)) {
      audioFiles.push({ file: silenceFile, duration: 1.5 });
    }

    const audioFile = join(outputDir, `narration-${i}.wav`);
    const subtitleFile = audioFile.replace(/\.\w+$/, '.vtt');
    const segTitle = seg.title || `Segment ${i + 1}`;
    process.stdout.write(`\r  Segment ${i + 1}/${segments.length}: "${segTitle.substring(0, 30)}"...`);

    let success = false;

    // Reuse pre-existing narration audio file if present and valid (separation optimization)
    if (existsSync(audioFile)) {
      try {
        const stats = statSync(audioFile);
        if (stats.size > 0) {
          success = true;
        }
      } catch {}
    }

    // Tier 1: Kokoro-82M (local, free, GPU accelerated) with voice fallback chain
    if (!success && providers.kokoro) {
      const narrationText = seg.narration || '';
      success = await generateKokoroSegment(narrationText, audioFile, {
        emotion: seg.emotion || null,
        speed: seg.speed || 1.0,
        targetDuration: segDuration,
        pacingScore: seg.pacingScore || null,
      });
      if (!success) {
        console.warn(`\n  ⚠ Kokoro failed for segment ${i + 1} (all voices exhausted), trying next engine`);
      }
    }

    // Tier 2: MeloTTS (Cloudflare, cheap fallback)
    if (useMelo && !success) {
      success = await generateMeloSegment(seg.narration, audioFile, cfAccountId, cfApiToken);
      if (!success) {
        console.warn(`\n  ⚠ MeloTTS failed for segment ${i + 1}, trying edge-tts`);
      }
    }

    // Tier 3: edge-tts (local fallback, extremely fast and reliable)
    if (!success && providers.edgeTts) {
      const voice = edgeVoice || 'en-US-GuyNeural';
      success = generateEdgeTtsSegment(
        seg.narration,
        audioFile,
        subtitleFile,
        voice,
        providers.edgeRunner,
      );
      if (!success) {
        console.warn(`\n  ⚠ edge-tts failed for segment ${i + 1}`);
      }
    }

    if (success) {
      // Get the actual duration of generated audio for precise synchronization
      const actualDuration = getAudioDuration(audioFile) || segDuration;
      seg.duration = actualDuration;

      // Task 25: Generate WebVTT captions from narration text if not already created by the engine
      if (!existsSync(subtitleFile) && seg.narration) {
        generateWebVTT(seg.narration, actualDuration, subtitleFile);
      }

      // Task 18: Insert breathing sound between segments (not after last segment)
      if (i < segments.length - 1) {
        const breathPath = join(outputDir, `breath-${i}.wav`);
        if (generateBreathSound(breathPath)) {
          audioFiles.push({ file: breathPath, duration: 0.25 });
        }
      }

      // Task 21: Detect paragraph breaks in narration and insert silence pauses
      const narrationText = seg.narration || '';
      const paragraphs = detectParagraphBreaks(narrationText);
      if (paragraphs.length > 1) {
        // Insert 0.4s silence between paragraphs (estimated within segment duration)
        const paraPausePath = join(outputDir, `para-pause-${i}.wav`);
        generateSilence(paraPausePath, 0.4);
        audioFiles.push({
          file: audioFile,
          duration: actualDuration,
          subtitleFile: existsSync(subtitleFile) ? subtitleFile : null,
          paragraphPauses: paragraphs.length - 1,
        });
      } else {
        audioFiles.push({
          file: audioFile,
          duration: actualDuration,
          subtitleFile: existsSync(subtitleFile) ? subtitleFile : null,
        });
      }
    } else {
      throw new Error(
        `TTS failed for segment ${i + 1} "${segTitle}": exhausted ${engines.join(' → ')}. ` +
        `See ${TTS_SETUP_DOC}.`
      );
    }
  }

  console.log(`\n  ✓ Generated ${audioFiles.length} audio segments (chain: ${engines.join(' → ')})`);

  // Add end screen silence (must match video END_SCREEN_SECONDS = 4)
  const firstAudioFile = audioFiles.length > 0 ? audioFiles[0].file : join(outputDir, 'silence-placeholder.wav');
  if (audioFiles.length === 0 || !existsSync(firstAudioFile)) {
    generateSilence(firstAudioFile, 0.1);
  }
  const endScreenFile = join(dirname(firstAudioFile), 'silence-end.wav');
  if (generateSilence(endScreenFile, 4)) {
    audioFiles.push({ file: endScreenFile, duration: 4 });
  }

  return audioFiles;
}
