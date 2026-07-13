#!/usr/bin/env node
/**
 * Render a complete fixture project to final MP4 (no LLM / no browser UI).
 * Usage: node scripts/render-fixture-video.mjs
 */
import { writeFileSync, copyFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { validateOutput, MIN_RENDER_OUTPUT_BYTES } from '../server-render/pipelineReliability.mjs';
import { STOCK_HEALTHCARE_IMAGES } from './lib/stock-media-urls.mjs';

const ROOT = process.cwd();
const OUT = join(ROOT, 'test-recordings', 'FINAL-OUTPUT.mp4');
mkdirSync(join(ROOT, 'test-recordings'), { recursive: true });

const stock = STOCK_HEALTHCARE_IMAGES;

const project = {
  version: 1,
  id: 'fixture-full-pipeline',
  title: 'Why AI Will Change Healthcare',
  topic: 'Why AI will change healthcare',
  style: 'business_insider',
  targetDuration: 180,
  status: 'ready',
  createdAt: new Date().toISOString(),
  hookLine: 'Your medical files are already for sale',
  script: [
    {
      id: 'seg-intro',
      type: 'intro',
      title: 'Your Data at Risk',
      narration:
        'Your bank account could be drained in seconds by one phishing email. Artificial intelligence is rewriting healthcare — and the stakes are your identity, your medical files, and your family safety.',
      visualNote: 'Worried person at laptop, hospital corridor',
      duration: 10,
    },
    {
      id: 'seg-threat',
      type: 'section',
      title: 'Ransomware Reality',
      narration:
        'Hospitals lost billions to ransomware attacks last year. AI helps detect intrusions faster than human analysts, but criminals now use the same tools to target patient records at massive scale.',
      visualNote: 'Hospital security operations center',
      duration: 12,
    },
    {
      id: 'seg-outro',
      type: 'outro',
      title: 'Three Steps to Protect Yourself',
      narration:
        'Protect yourself today: enable two-factor authentication on health portals, audit app permissions every quarter, and ask your provider which AI systems can access your records.',
      visualNote: 'Checklist on screen, calm resolution',
      duration: 10,
    },
  ],
  media: [
    {
      id: 'm1',
      segmentId: 'seg-intro',
      type: 'image',
      url: stock[0].url,
      alt: stock[0].alt,
      source: 'unsplash',
      concept: 'healthcare technology',
      score: 200,
    },
    {
      id: 'm1b',
      segmentId: 'seg-intro',
      type: 'image',
      url: stock[5].url,
      alt: stock[5].alt,
      source: 'unsplash',
      concept: 'hospital corridor',
      score: 195,
    },
    {
      id: 'm2',
      segmentId: 'seg-threat',
      type: 'image',
      url: stock[1].url,
      alt: stock[1].alt,
      source: 'unsplash',
      concept: 'cybersecurity',
      score: 190,
    },
    {
      id: 'm2b',
      segmentId: 'seg-threat',
      type: 'image',
      url: stock[2].url,
      alt: stock[2].alt,
      source: 'unsplash',
      concept: 'medical research',
      score: 188,
    },
    {
      id: 'm3',
      segmentId: 'seg-outro',
      type: 'image',
      url: stock[3].url,
      alt: stock[3].alt,
      source: 'unsplash',
      concept: 'patient care',
      score: 185,
    },
    {
      id: 'm3b',
      segmentId: 'seg-outro',
      type: 'image',
      url: stock[4].url,
      alt: stock[4].alt,
      source: 'unsplash',
      concept: 'healthcare data',
      score: 180,
    },
  ],
  narration: [],
  exportSettings: {
    quality: 'high',
    format: 'mp4',
    resolution: '1080p',
    aspectRatio: '16:9',
    backgroundMusic: false,
    musicPreset: 'ambient',
    youtubeMode: true,
    hookLine: 'Your medical files are already for sale',
  },
};

const projectPath = '/tmp/autotube-project.json';
writeFileSync(projectPath, JSON.stringify(project, null, 2));
console.log(`📝 Wrote ${projectPath}`);
console.log(`🎥 Rendering → ${OUT}\n`);

const devServer = process.env.DEV_SERVER_URL || 'http://localhost:5173';
const result = spawnSync('node', ['server-render.mjs', OUT], {
  cwd: ROOT,
  env: {
    ...process.env,
    DEV_SERVER_URL: devServer,
    AUTOTUBE_FORCE_CPU: '1',
    AUTOTUBE_PROJECT_PATH: projectPath,
    AUTOTUBE_YOUTUBE_MODE: '1',
    AUTOTUBE_RENDER_MODE: 'ffmpeg',
    AUTOTUBE_CUT_INTERVAL_SEC: '1.0',
    AUTOTUBE_FFMPEG_HARD_CUTS: '1',
    AUTOTUBE_FAST_PACING: '1',
    AUTOTUBE_PATTERN_INTERRUPTS: '1',
  },
  encoding: 'utf8',
  timeout: 1_800_000,
  stdio: ['inherit', 'pipe', 'pipe'],
});

const renderLogPath = join(ROOT, 'test-recordings', 'latest-render.log');
const renderLogBody = `${result.stdout || ''}\n${result.stderr || ''}`;
writeFileSync(renderLogPath, renderLogBody);

if (result.stdout) process.stdout.write(result.stdout.slice(-3000));
if (result.stderr) process.stderr.write(result.stderr.slice(-1500));
console.log(`📋 Render log: ${renderLogPath}`);

if (result.status !== 0 && result.status !== null) {
  console.error(`\n❌ server-render exited with code ${result.status}`);
  process.exit(result.status);
}

const finalPath = OUT.replace('.mp4', '-final.mp4');
const produced = existsSync(finalPath) ? finalPath : existsSync(OUT) ? OUT : null;

if (!produced) {
  console.error('\n❌ No output file');
  process.exit(1);
}

const gate = validateOutput(produced, 'Render output', { minBytes: MIN_RENDER_OUTPUT_BYTES });
if (!gate.valid) {
  console.error(`\n❌ ${gate.error}`);
  process.exit(1);
}
const size = gate.size;
console.log(`\n✅ FINAL VIDEO: ${produced}`);
console.log(`   Size: ${(size / 1024 / 1024).toFixed(2)} MB`);

if (produced !== OUT) {
  copyFileSync(produced, OUT);
  console.log(`   Also copied to: ${OUT}`);
}

process.exit(0);
