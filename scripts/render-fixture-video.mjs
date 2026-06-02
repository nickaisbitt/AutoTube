#!/usr/bin/env node
/**
 * Render a complete fixture project to final MP4 (no LLM / no browser UI).
 * Usage: node scripts/render-fixture-video.mjs
 */
import { writeFileSync, copyFileSync, existsSync, mkdirSync, statSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';

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
      url: 'https://picsum.photos/seed/healthintro/1920/1080',
      alt: 'Doctor using digital tablet',
      source: 'unsplash',
      concept: 'healthcare technology',
      score: 200,
    },
    {
      id: 'm2',
      segmentId: 'seg-threat',
      type: 'image',
      url: 'https://picsum.photos/seed/cybersec/1920/1080',
      alt: 'Cybersecurity concept',
      source: 'unsplash',
      concept: 'cybersecurity',
      score: 190,
    },
    {
      id: 'm3',
      segmentId: 'seg-outro',
      type: 'image',
      url: 'https://picsum.photos/seed/patientcare/1920/1080',
      alt: 'Patient consultation',
      source: 'unsplash',
      concept: 'patient care',
      score: 185,
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

const projectPath = '/tmp/autotube-project.json';
writeFileSync(projectPath, JSON.stringify(project, null, 2));
console.log(`📝 Wrote ${projectPath}`);
console.log(`🎥 Rendering → ${OUT}\n`);

const devServer = process.env.DEV_SERVER_URL || 'http://localhost:5173';
const result = spawnSync('node', ['server-render.mjs', OUT], {
  cwd: ROOT,
  env: { ...process.env, DEV_SERVER_URL: devServer, AUTOTUBE_FORCE_CPU: '1' },
  encoding: 'utf8',
  timeout: 1_800_000,
  stdio: ['inherit', 'pipe', 'pipe'],
});

if (result.stdout) process.stdout.write(result.stdout.slice(-3000));
if (result.stderr) process.stderr.write(result.stderr.slice(-1500));

const finalPath = OUT.replace('.mp4', '-final.mp4');
const produced = existsSync(finalPath) ? finalPath : existsSync(OUT) ? OUT : null;

if (!produced) {
  console.error('\n❌ No output file');
  process.exit(result.status ?? 1);
}

const size = statSync(produced).size;
if (size < 100_000) {
  console.error(`\n❌ Output too small (${size} bytes) — render likely failed`);
  process.exit(1);
}
console.log(`\n✅ FINAL VIDEO: ${produced}`);
console.log(`   Size: ${(size / 1024 / 1024).toFixed(2)} MB`);

if (produced !== OUT) {
  copyFileSync(produced, OUT);
  console.log(`   Also copied to: ${OUT}`);
}

process.exit(0);
