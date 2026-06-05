#!/usr/bin/env node
/**
 * Remove dev-only trees from /app before Railway snapshots the image.
 * Safe on Railway build only — do not run locally unless you know why.
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
  'deploy/Dockerfile.example',
  'deploy/index.html',
  'deploy/reviewer.html',
];

for (const rel of REMOVE) {
  const abs = path.join(ROOT, rel);
  try {
    fs.rmSync(abs, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

console.log('railway-shrink-runtime: removed dev-only paths from image');
