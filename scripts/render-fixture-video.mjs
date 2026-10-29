#!/usr/bin/env node
/**
 * Render a complete fixture project to final MP4 (no LLM / no browser UI).
 * Usage: node scripts/render-fixture-video.mjs
 */
import { writeFileSync, copyFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { tmpdir } from 'os';
import { validateOutput, MIN_RENDER_OUTPUT_BYTES } from '../server-render/pipelineReliability.mjs';

const ROOT = process.cwd();
const OUT = join(ROOT, 'test-recordings', 'FINAL-OUTPUT.mp4');
mkdirSync(join(ROOT, 'test-recordings'), { recursive: true });

const project = {
  version: 1,
  id: 'fixture-full-pipeline',
  title: 'Why AI Will Change Healthcare',
  topic: 'Why AI will change healthcare',
  style: 'business_insider',
  targetDuration: 180,
  status: 'ready',
  createdAt: new Date().toISOString(),
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
      url: 'https://picsum.photos/id/10/1920/1080',
      alt: 'Researcher reviewing evidence',
      source: 'unsplash',
      concept: 'research evidence',
      score: 200,
    },
    {
      id: 'm2',
      segmentId: 'seg-intro',
      type: 'image',
      url: 'https://picsum.photos/id/12/1920/1080',
      alt: 'Data archive and documents',
      source: 'unsplash',
      concept: 'data archive',
      score: 198,
    },
    {
      id: 'm3',
      segmentId: 'seg-intro',
      type: 'image',
      url: 'https://picsum.photos/id/14/1920/1080',
      alt: 'Technology infrastructure',
      source: 'unsplash',
      concept: 'technology infrastructure',
      score: 196,
    },
    {
      id: 'm4',
      segmentId: 'seg-intro',
      type: 'image',
      url: 'https://picsum.photos/id/16/1920/1080',
      alt: 'Public records and systems',
      source: 'unsplash',
      concept: 'public records',
      score: 194,
    },
    {
      id: 'm5',
      segmentId: 'seg-threat',
      type: 'image',
      url: 'https://picsum.photos/id/11/1920/1080',
      alt: 'Security operations center',
      source: 'unsplash',
      concept: 'security operations',
      score: 190,
    },
    {
      id: 'm6',
      segmentId: 'seg-threat',
      type: 'image',
      url: 'https://picsum.photos/id/18/1920/1080',
      alt: 'Network infrastructure',
      source: 'unsplash',
      concept: 'network infrastructure',
      score: 188,
    },
    {
      id: 'm7',
      segmentId: 'seg-threat',
      type: 'image',
      url: 'https://picsum.photos/id/22/1920/1080',
      alt: 'System monitoring screens',
      source: 'unsplash',
      concept: 'system monitoring',
      score: 186,
    },
    {
      id: 'm8',
      segmentId: 'seg-threat',
      type: 'image',
      url: 'https://picsum.photos/id/24/1920/1080',
      alt: 'Digital risk analysis',
      source: 'unsplash',
      concept: 'risk analysis',
      score: 184,
    },
    {
      id: 'm9',
      segmentId: 'seg-outro',
      type: 'image',
      url: 'https://picsum.photos/id/20/1920/1080',
      alt: 'People reviewing a plan',
      source: 'unsplash',
      concept: 'action plan',
      score: 185,
    },
    {
      id: 'm10',
      segmentId: 'seg-outro',
      type: 'image',
      url: 'https://picsum.photos/id/26/1920/1080',
      alt: 'Checklist and decision making',
      source: 'unsplash',
      concept: 'checklist',
      score: 183,
    },
    {
      id: 'm11',
      segmentId: 'seg-outro',
      type: 'image',
      url: 'https://picsum.photos/id/28/1920/1080',
      alt: 'Secure workspace',
      source: 'unsplash',
      concept: 'secure workspace',
      score: 181,
    },
    {
      id: 'm12',
      segmentId: 'seg-outro',
      type: 'image',
      url: 'https://picsum.photos/id/30/1920/1080',
      alt: 'Technology safeguards',
      source: 'unsplash',
      concept: 'technology safeguards',
      score: 179,
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
  },
};

function prepareLocalFixtureMedia() {
  if (process.env.AUTOTUBE_FIXTURE_LOCAL_MEDIA !== '1') return;

  const mediaDir = join(tmpdir(), 'autotube-fixture-media');
  mkdirSync(mediaDir, { recursive: true });
  const baseColors = ['0x17252f', '0x241b26', '0x182b2b', '0x2a2020', '0x18233a', '0x211b2d'];
  const accentColors = ['0x19c7a0', '0xe51b3e', '0x19c7a0', '0xe51b3e', '0x19c7a0', '0xe51b3e'];

  for (const [index, asset] of project.media.entries()) {
    const localPath = join(mediaDir, `${asset.id}.png`);
    if (!existsSync(localPath)) {
      const base = baseColors[index % baseColors.length];
      const accent = accentColors[index % accentColors.length];
      const offset = 120 + (index % 4) * 180;
      const filter = [
        `drawbox=x=${offset}:y=150:w=760:h=720:color=${accent}@0.75:t=fill`,
        `drawbox=x=${980 - (index % 3) * 80}:y=260:w=620:h=420:color=0x080b0e@0.82:t=fill`,
        `drawbox=x=0:y=${820 - (index % 4) * 40}:w=1920:h=4:color=${accent}:t=fill`,
      ].join(',');
      const result = spawnSync('ffmpeg', [
        '-hide_banner', '-loglevel', 'error', '-y',
        '-f', 'lavfi', '-i', `color=c=${base}:s=1920x1080:r=1`,
        '-vf', filter, '-frames:v', '1', localPath,
      ], { encoding: 'utf8' });
      if (result.status !== 0 || !existsSync(localPath)) {
        throw new Error(`Unable to create local fixture asset ${asset.id}: ${result.stderr || 'ffmpeg failed'}`);
      }
    }
    asset.localPath = localPath;
  }
  console.log(`🖼️ Using deterministic local fixture media: ${mediaDir}`);
}

prepareLocalFixtureMedia();

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
