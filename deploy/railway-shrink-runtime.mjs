#!/usr/bin/env node
/**
 * Remove dev-only trees from /app before Railway snapshots the image.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const REMOVE = [
  'src',
  'tests',
  'e2e',
  'coverage',
  'remotion',
  'docs',
  'scripts',
  '.github',
  '.cursor',
  '.kiro',
  '.opencode',
  'test-results',
  'test-recordings',
  'test-output',
  'public',
  'index.html',
  'vite.config.ts',
  'tsconfig.json',
  'playwright.config.ts',
  'vitest.config.ts',
  'nixpacks.toml',
  'deploy/Dockerfile',
  'deploy/Dockerfile.example',
  'deploy/index.html',
  'deploy/reviewer.html',
  'deploy/node_modules',
  'deploy/audio',
];

for (const rel of REMOVE) {
  try {
    fs.rmSync(path.join(ROOT, rel), { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

console.log('railway-shrink-runtime: removed dev-only paths from image');
